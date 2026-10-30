-- =====================================================================
-- Manitos · Migración 12: plan Gratis + Pro (suscripción con MercadoPago)
-- Queda APAGADO: nadie paga nada hasta que actives el cobro desde
-- Panel de administrador → Cobros. Requiere la 06 a la 11.
-- Pegar TODO en Supabase → SQL Editor → Run. Se puede correr más de una vez.
-- =====================================================================

-- ---------- Ajustes generales (una sola fila) ----------
create table if not exists public.ajustes (
  id                  int primary key default 1 check (id = 1),
  cobro_activo        boolean not null default false,  -- apagado: todo gratis y sin límites
  presupuestos_gratis int     not null default 5 check (presupuestos_gratis >= 0),
  precio_pro          numeric(12,2) check (precio_pro is null or precio_pro > 0),
  dias_prueba         int     not null default 30 check (dias_prueba between 0 and 90),
  actualizado_en      timestamptz not null default now()
);
insert into public.ajustes (id) values (1) on conflict (id) do nothing;
alter table public.ajustes enable row level security;
drop policy if exists "ajustes_ver" on public.ajustes;
create policy "ajustes_ver" on public.ajustes for select using (true);  -- precio y reglas son públicos
grant select on public.ajustes to anon, authenticated;

-- ---------- Suscripciones de los profesionales ----------
create table if not exists public.suscripciones (
  perfil_id        uuid primary key references public.perfiles(id) on delete cascade,
  estado           text not null default 'prueba'
                   check (estado in ('prueba','pendiente','activa','pausada','cancelada')),
  prueba_hasta     timestamptz,
  mp_preapproval_id text unique,
  monto            numeric(12,2),
  proximo_cobro    timestamptz,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now()
);
alter table public.suscripciones enable row level security;
drop policy if exists "susc_ver" on public.suscripciones;
create policy "susc_ver" on public.suscripciones for select to authenticated
  using (perfil_id = auth.uid() or public.es_admin());
-- (sin políticas de alta/edición: sólo la cambian las funciones de abajo y el servidor)

-- ¿Este profesional tiene Pro vigente? (suscripción activa o prueba sin vencer)
create or replace function public.es_pro(p_perfil uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from suscripciones s
    where s.perfil_id = p_perfil
      and (s.estado = 'activa' or (s.prueba_hasta is not null and s.prueba_hasta > now()))
  )
$$;
grant execute on function public.es_pro(uuid) to authenticated, anon;

-- Presupuestos enviados en el mes calendario (hora de Córdoba)
create or replace function public.presupuestos_del_mes(p_perfil uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from presupuestos
  where profesional_id = p_perfil
    and creado_en >= (date_trunc('month', now() at time zone 'America/Argentina/Cordoba')
                      at time zone 'America/Argentina/Cordoba')
$$;

-- Lista pública de quiénes son Pro (sólo el id, para mostrar la etiqueta)
create or replace view public.profesionales_pro as
  select s.perfil_id from public.suscripciones s
  where s.estado = 'activa' or (s.prueba_hasta is not null and s.prueba_hasta > now());
grant select on public.profesionales_pro to anon, authenticated;

-- Mi plan (para la pantalla del profesional)
create or replace function public.mi_plan()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'cobro_activo', a.cobro_activo,
    'gratis', a.presupuestos_gratis,
    'precio', a.precio_pro,
    'dias_prueba', a.dias_prueba,
    'usados', public.presupuestos_del_mes(auth.uid()),
    'es_pro', public.es_pro(auth.uid()),
    'estado', s.estado,
    'prueba_hasta', s.prueba_hasta,
    'proximo_cobro', s.proximo_cobro,
    'tiene_suscripcion', s.mp_preapproval_id is not null,
    'puede_probar', s.perfil_id is null and a.dias_prueba > 0
  )
  from ajustes a left join suscripciones s on s.perfil_id = auth.uid()
  where a.id = 1
$$;
grant execute on function public.mi_plan() to authenticated;

-- Empezar la prueba gratis de Pro (una sola vez por profesional)
create or replace function public.empezar_prueba()
returns void language plpgsql security definer set search_path = public as $$
declare a ajustes;
begin
  select * into a from ajustes where id = 1;
  if not a.cobro_activo then raise exception 'Durante el lanzamiento Manitos es gratis y sin límites'; end if;
  if not exists (select 1 from perfiles where id = auth.uid() and rol = 'profesional') then
    raise exception 'El plan Pro es para profesionales';
  end if;
  if exists (select 1 from suscripciones where perfil_id = auth.uid()) then
    raise exception 'Ya usaste tu prueba gratis';
  end if;
  insert into suscripciones (perfil_id, estado, prueba_hasta)
  values (auth.uid(), 'prueba', now() + make_interval(days => a.dias_prueba));
end $$;
revoke all on function public.empezar_prueba() from public, anon;
grant execute on function public.empezar_prueba() to authenticated;

-- Límite de presupuestos gratis por mes (sólo con el cobro activo)
create or replace function public.trg_plan()
returns trigger language plpgsql security definer set search_path = public as $$
declare a ajustes; v_uid uuid := auth.uid();
begin
  if v_uid is null or public.es_admin() then return new; end if;
  select * into a from ajustes where id = 1;
  if a.cobro_activo and not public.es_pro(v_uid)
     and public.presupuestos_del_mes(v_uid) >= a.presupuestos_gratis then
    raise exception '%', case when a.presupuestos_gratis = 1
      then 'Usaste tu presupuesto gratis de este mes. Pasate a Pro para seguir presupuestando.'
      else format('Usaste tus %s presupuestos gratis de este mes. Pasate a Pro para seguir presupuestando.', a.presupuestos_gratis) end;
  end if;
  return new;
end $$;
drop trigger if exists plan_limite on public.presupuestos;
create trigger plan_limite before insert on public.presupuestos
  for each row execute function public.trg_plan();

-- ---------- Administración ----------
create or replace function public.admin_guardar_ajustes(p_cobro_activo boolean, p_gratis int, p_precio numeric, p_dias int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'Sólo administradores'; end if;
  if p_cobro_activo and coalesce(p_precio, 0) <= 0 then
    raise exception 'Poné el precio del plan Pro antes de activar el cobro';
  end if;
  update ajustes set cobro_activo = p_cobro_activo, presupuestos_gratis = p_gratis,
                     precio_pro = p_precio, dias_prueba = p_dias, actualizado_en = now()
  where id = 1;
end $$;

create or replace function public.admin_suscripciones()
returns table (perfil_id uuid, nombre text, email text, estado text, es_pro boolean, prueba_hasta timestamptz,
               proximo_cobro timestamptz, monto numeric, usados_mes int, creado_en timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'Sólo administradores'; end if;
  return query
  select s.perfil_id, p.nombre, u.email::text, s.estado, public.es_pro(s.perfil_id), s.prueba_hasta,
         s.proximo_cobro, s.monto, public.presupuestos_del_mes(s.perfil_id), s.creado_en
  from suscripciones s join perfiles p on p.id = s.perfil_id left join auth.users u on u.id = s.perfil_id
  order by s.actualizado_en desc;
end $$;

-- Regalar (o quitar) Pro a mano, por ejemplo a los primeros profesionales del piloto
create or replace function public.admin_regalar_pro(p_perfil uuid, p_dias int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'Sólo administradores'; end if;
  insert into suscripciones (perfil_id, estado, prueba_hasta)
  values (p_perfil, 'prueba', case when p_dias > 0 then now() + make_interval(days => p_dias) else now() end)
  on conflict (perfil_id) do update
    set prueba_hasta = case when p_dias > 0 then greatest(coalesce(suscripciones.prueba_hasta, now()), now()) + make_interval(days => p_dias) else now() end,
        actualizado_en = now();
end $$;

revoke all on function public.admin_guardar_ajustes(boolean, int, numeric, int) from public, anon;
revoke all on function public.admin_suscripciones() from public, anon;
revoke all on function public.admin_regalar_pro(uuid, int) from public, anon;
grant execute on function public.admin_guardar_ajustes(boolean, int, numeric, int) to authenticated;
grant execute on function public.admin_suscripciones() to authenticated;
grant execute on function public.admin_regalar_pro(uuid, int) to authenticated;
