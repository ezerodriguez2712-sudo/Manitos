-- MANITOS · Migraciones 02 (mejoras) + 03 (avisos por mail)
-- Copiá TODO este texto, pegalo en Supabase → SQL Editor → New query y tocá Run.
-- Al final aparece el AVISOS_SECRETO para cargar en Vercel.

-- =====================================================================
-- MANITOS · Migración 02: zonas, fotos de perfil, avisos y reglas más estrictas
-- Se ejecuta sobre la base actual, sin borrar datos. Se puede correr más de una vez.
-- =====================================================================

-- ---------- Perfil: zonas de trabajo y foto ----------
alter table public.perfiles add column if not exists zonas text[] not null default '{}';
alter table public.perfiles add column if not exists foto  text;

-- ---------- Presupuestos: cuándo respondió el cliente ----------
alter table public.presupuestos add column if not exists respondido_en timestamptz;

-- ---------- Lecturas: qué vio cada uno y cuándo (para los avisos) ----------
create table if not exists public.lecturas (
  pedido_id bigint not null references public.pedidos(id) on delete cascade,
  perfil_id uuid   not null references public.perfiles(id) on delete cascade,
  visto_en  timestamptz not null default now(),
  primary key (pedido_id, perfil_id)
);
alter table public.lecturas enable row level security;
drop policy if exists "lect_ver"    on public.lecturas;
drop policy if exists "lect_alta"   on public.lecturas;
drop policy if exists "lect_editar" on public.lecturas;
create policy "lect_ver"    on public.lecturas for select to authenticated using (perfil_id = auth.uid());
create policy "lect_alta"   on public.lecturas for insert to authenticated
  with check (perfil_id = auth.uid() and public.puede_ver_pedido(pedido_id));
create policy "lect_editar" on public.lecturas for update to authenticated
  using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());

-- Marcar un pedido como visto (lo llama la app al abrirlo)
create or replace function public.marcar_visto(p_pedido bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.puede_ver_pedido(p_pedido) then return; end if;
  insert into lecturas (pedido_id, perfil_id, visto_en) values (p_pedido, auth.uid(), now())
  on conflict (pedido_id, perfil_id) do update set visto_en = now();
end $$;

-- Avisos del usuario: novedades y mensajes sin leer por pedido
create or replace function public.mis_avisos()
returns table (pedido_id bigint, novedades int, mensajes int)
language sql security definer stable set search_path = public as $$
  with mios as (
    -- pedidos como cliente
    select p.id, coalesce(l.visto_en, 'epoch'::timestamptz) as visto
    from pedidos p left join lecturas l on l.pedido_id = p.id and l.perfil_id = auth.uid()
    where p.cliente_id = auth.uid()
    union
    -- pedidos donde presupuesté
    select pr.pedido_id, coalesce(l.visto_en, 'epoch'::timestamptz)
    from presupuestos pr left join lecturas l on l.pedido_id = pr.pedido_id and l.perfil_id = auth.uid()
    where pr.profesional_id = auth.uid()
  )
  select m.id,
    (case when exists (select 1 from pedidos p where p.id = m.id and p.cliente_id = auth.uid())
          then (select count(*) from presupuestos x where x.pedido_id = m.id and x.creado_en > m.visto)
          else (select count(*) from presupuestos x where x.pedido_id = m.id and x.profesional_id = auth.uid()
                  and x.respondido_en > m.visto)
     end)::int,
    (select count(*) from mensajes ms
      where ms.pedido_id = m.id and ms.autor_id <> auth.uid() and ms.creado_en > m.visto
        and public.es_participante(m.id))::int
  from mios m;
$$;

-- ---------- Aceptar presupuesto: registra la respuesta ----------
create or replace function public.aceptar_presupuesto(p_presupuesto bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_pedido bigint;
begin
  select pedido_id into v_pedido from presupuestos where id = p_presupuesto;
  if v_pedido is null then raise exception 'Presupuesto inexistente'; end if;
  if not exists (select 1 from pedidos where id = v_pedido and cliente_id = auth.uid() and estado = 'abierto') then
    raise exception 'No podés aceptar este presupuesto';
  end if;
  perform set_config('manitos.interno', '1', true);
  update presupuestos
     set estado = case when id = p_presupuesto then 'aceptado' else 'rechazado' end,
         respondido_en = now()
   where pedido_id = v_pedido;
  update pedidos set estado = 'asignado', presupuesto_elegido_id = p_presupuesto where id = v_pedido;
end $$;

-- ---------- Reglas: qué cambios de estado se permiten ----------
create or replace function public.validar_cambio_pedido()
returns trigger language plpgsql as $$
begin
  if current_setting('manitos.interno', true) = '1' then return new; end if;
  if new.cliente_id <> old.cliente_id or new.presupuesto_elegido_id is distinct from old.presupuesto_elegido_id then
    raise exception 'Cambio no permitido';
  end if;
  if new.estado <> old.estado and not (
       (old.estado = 'abierto'  and new.estado = 'cancelado') or
       (old.estado = 'asignado' and new.estado in ('completado','cancelado'))
     ) then
    raise exception 'No se puede pasar el pedido de % a %', old.estado, new.estado;
  end if;
  return new;
end $$;
drop trigger if exists pedidos_validar on public.pedidos;
create trigger pedidos_validar before update on public.pedidos
  for each row execute function public.validar_cambio_pedido();

create or replace function public.validar_cambio_presupuesto()
returns trigger language plpgsql as $$
begin
  if current_setting('manitos.interno', true) = '1' then return new; end if;
  if new.pedido_id <> old.pedido_id or new.profesional_id <> old.profesional_id
     or new.estado <> old.estado or new.respondido_en is distinct from old.respondido_en then
    raise exception 'Cambio no permitido';
  end if;
  return new;
end $$;
drop trigger if exists presupuestos_validar on public.presupuestos;
create trigger presupuestos_validar before update on public.presupuestos
  for each row execute function public.validar_cambio_presupuesto();

-- El profesional puede retirar su presupuesto mientras no le respondieron
drop policy if exists "presu_borrar" on public.presupuestos;
create policy "presu_borrar" on public.presupuestos for delete to authenticated
  using (profesional_id = auth.uid() and estado = 'enviado');

-- Lectura del pedido para el profesional asignado aunque ya no esté abierto
-- (puede_ver_pedido ya lo cubre porque presupuestó)

grant execute on function public.mis_avisos() to authenticated;
grant execute on function public.marcar_visto(bigint) to authenticated;

-- =====================================================================
-- MANITOS · Migración 03: avisos por mail
-- Cuando entra un pedido, un presupuesto o se elige un presupuesto,
-- la base le avisa a la app (Vercel) y la app manda el mail por Brevo.
-- Se puede correr más de una vez. Al final muestra el SECRETO que va en Vercel.
-- =====================================================================

create extension if not exists pg_net with schema extensions;

-- Preferencia de cada usuario
alter table public.perfiles add column if not exists avisos_mail boolean not null default true;

-- Registro para no mandar dos veces el mismo aviso (sólo lo usa el servidor)
create table if not exists public.avisos_enviados (
  tipo      text   not null,
  ref_id    bigint not null,
  enviado_en timestamptz not null default now(),
  primary key (tipo, ref_id)
);
alter table public.avisos_enviados enable row level security;  -- sin políticas: nadie desde la app

-- Configuración privada (dirección de la app y secreto compartido con Vercel)
create schema if not exists privado;
revoke all on schema privado from public, anon, authenticated;
create table if not exists privado.config (clave text primary key, valor text not null);
insert into privado.config (clave, valor) values
  ('url_avisos', 'https://manitos-ten.vercel.app/api/avisos'),
  ('secreto', md5(random()::text || clock_timestamp()::text) || md5(clock_timestamp()::text || random()::text))
on conflict (clave) do nothing;

-- Envía el aviso a la app. Nunca frena la operación original si algo falla.
create or replace function privado.disparar_aviso(p_tipo text, p_id bigint)
returns void language plpgsql security definer set search_path = public, privado, extensions as $$
declare v_url text; v_secreto text;
begin
  select valor into v_url from privado.config where clave = 'url_avisos';
  select valor into v_secreto from privado.config where clave = 'secreto';
  if v_url is null or v_secreto is null then return; end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('tipo', p_tipo, 'id', p_id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-manitos-secreto', v_secreto),
    timeout_milliseconds := 30000
  );
exception when others then
  raise warning 'No se pudo disparar el aviso % %: %', p_tipo, p_id, sqlerrm;
end $$;

create or replace function privado.trg_pedido_nuevo() returns trigger
language plpgsql security definer set search_path = public, privado as $$
begin perform privado.disparar_aviso('nuevo_pedido', new.id); return new; end $$;

create or replace function privado.trg_presupuesto_nuevo() returns trigger
language plpgsql security definer set search_path = public, privado as $$
begin perform privado.disparar_aviso('nuevo_presupuesto', new.id); return new; end $$;

create or replace function privado.trg_pedido_asignado() returns trigger
language plpgsql security definer set search_path = public, privado as $$
begin
  if old.estado = 'abierto' and new.estado = 'asignado' then
    perform privado.disparar_aviso('elegido', new.id);
  end if;
  return new;
end $$;

drop trigger if exists aviso_pedido_nuevo on public.pedidos;
create trigger aviso_pedido_nuevo after insert on public.pedidos
  for each row execute function privado.trg_pedido_nuevo();

drop trigger if exists aviso_presupuesto_nuevo on public.presupuestos;
create trigger aviso_presupuesto_nuevo after insert on public.presupuestos
  for each row execute function privado.trg_presupuesto_nuevo();

drop trigger if exists aviso_pedido_asignado on public.pedidos;
create trigger aviso_pedido_asignado after update on public.pedidos
  for each row execute function privado.trg_pedido_asignado();

-- 👇 Copiá este valor: va en Vercel como AVISOS_SECRETO
select valor as "AVISOS_SECRETO (copialo a Vercel)" from privado.config where clave = 'secreto';
