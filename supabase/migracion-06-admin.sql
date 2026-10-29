-- =====================================================================
-- Manitos · Migración 06: panel de administrador, suspensión y borrar cuenta
-- Pegar TODO en Supabase → SQL Editor → Run. Se puede correr más de una vez.
-- =====================================================================

alter table public.perfiles add column if not exists es_admin   boolean not null default false;
alter table public.perfiles add column if not exists suspendido boolean not null default false;

-- ¿El usuario logueado es administrador?
create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select es_admin from perfiles where id = auth.uid()), false)
$$;

-- ¿El usuario logueado puede operar (no está suspendido)?
create or replace function public.cuenta_activa()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select not suspendido from perfiles where id = auth.uid()), false)
$$;

-- Nadie puede darse a sí mismo permisos de admin ni sacarse la suspensión.
-- (Desde el SQL Editor sí se puede: ahí no hay usuario logueado.)
create or replace function public.proteger_perfil()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and not public.es_admin() then
    new.es_admin := old.es_admin;
    new.suspendido := old.suspendido;
  end if;
  return new;
end $$;
drop trigger if exists perfiles_proteger on public.perfiles;
create trigger perfiles_proteger before update on public.perfiles
  for each row execute function public.proteger_perfil();

-- Las cuentas suspendidas no pueden publicar, presupuestar ni escribir
drop policy if exists "pedidos_alta" on public.pedidos;
create policy "pedidos_alta" on public.pedidos for insert to authenticated
  with check (cliente_id = auth.uid() and public.cuenta_activa());

drop policy if exists "presu_alta" on public.presupuestos;
create policy "presu_alta" on public.presupuestos for insert to authenticated
  with check (profesional_id = auth.uid() and estado = 'enviado' and public.cuenta_activa()
              and public.puede_ver_pedido(pedido_id)
              and exists (select 1 from public.pedidos p where p.id = pedido_id and p.estado = 'abierto'));

drop policy if exists "msj_alta" on public.mensajes;
create policy "msj_alta" on public.mensajes for insert to authenticated
  with check (autor_id = auth.uid() and public.cuenta_activa() and public.es_participante(pedido_id));

-- Cada uno puede borrar sus propias fotos (para borrar la cuenta)
drop policy if exists "fotos_borrar" on storage.objects;
create policy "fotos_borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);

-- =====================================================================
-- Borrar mi cuenta (Ley 25.326: derecho de supresión)
-- Borra el usuario y, en cascada, perfil, teléfono, pedidos, presupuestos,
-- mensajes y calificaciones. No se puede con trabajos en curso.
-- =====================================================================
create or replace function public.borrar_mi_cuenta()
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'No hay sesión'; end if;
  if exists (
    select 1 from pedidos p
    left join presupuestos pr on pr.id = p.presupuesto_elegido_id
    where p.estado = 'asignado' and (p.cliente_id = v_uid or pr.profesional_id = v_uid)
  ) then
    raise exception 'Tenés trabajos en curso. Terminalos o cancelalos antes de borrar la cuenta.';
  end if;
  delete from auth.users where id = v_uid;
end $$;
revoke all on function public.borrar_mi_cuenta() from public, anon;
grant execute on function public.borrar_mi_cuenta() to authenticated;

-- =====================================================================
-- Funciones del administrador (todas verifican es_admin)
-- =====================================================================

-- Indicadores generales
create or replace function public.admin_resumen()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.es_admin() then raise exception 'Sólo administradores'; end if;

  with primeras as (
    select p.id, p.creado_en, p.estado, p.rubro_id, p.zona,
           (select min(pr.creado_en) from presupuestos pr where pr.pedido_id = p.id) as primer_presu,
           (select count(*) from presupuestos pr where pr.pedido_id = p.id) as presus
    from pedidos p
  ),
  semanas as (
    select gs::date as semana
    from generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') gs
  )
  select jsonb_build_object(
    'usuarios', (select count(*) from perfiles),
    'clientes', (select count(*) from perfiles where rol = 'cliente'),
    'profesionales', (select count(*) from perfiles where rol = 'profesional'),
    'usuarios_7d', (select count(*) from perfiles where creado_en > now() - interval '7 days'),
    'suspendidos', (select count(*) from perfiles where suspendido),
    'pedidos', (select count(*) from pedidos),
    'pedidos_7d', (select count(*) from pedidos where creado_en > now() - interval '7 days'),
    'abiertos', (select count(*) from pedidos where estado = 'abierto'),
    'abiertos_sin_presu', (select count(*) from primeras where estado = 'abierto' and presus = 0),
    'presupuestos', (select count(*) from presupuestos),
    'presu_por_pedido', (select round(avg(presus)::numeric, 1) from primeras),
    -- Mediana de horas hasta el primer presupuesto
    'horas_primer_presu', (
      select round((percentile_cont(0.5) within group (
        order by extract(epoch from primer_presu - creado_en) / 3600))::numeric, 1)
      from primeras where primer_presu is not null),
    'con_presu_pct', (
      select round(100.0 * count(*) filter (where presus > 0) / nullif(count(*), 0))
      from primeras where creado_en < now() - interval '1 day'),
    -- % de pedidos (ya resueltos) que terminaron en un trabajo
    'conversion_pct', (
      select round(100.0 * count(*) filter (where estado in ('asignado','completado'))
                   / nullif(count(*) filter (where estado <> 'abierto'), 0))
      from pedidos),
    'completados', (select count(*) from pedidos where estado = 'completado'),
    'calificacion_prom', (select round(avg(puntaje)::numeric, 1) from calificaciones),
    'por_semana', (
      select jsonb_agg(jsonb_build_object(
               'semana', s.semana,
               'pedidos', (select count(*) from pedidos p where date_trunc('week', p.creado_en)::date = s.semana),
               'trabajos', (select count(*) from pedidos p where date_trunc('week', p.creado_en)::date = s.semana
                                                            and p.estado in ('asignado','completado')),
               'usuarios', (select count(*) from perfiles u where date_trunc('week', u.creado_en)::date = s.semana))
             order by s.semana)
      from semanas s),
    -- Oferta y demanda por rubro: dónde faltan profesionales
    'rubros', (
      select coalesce(jsonb_agg(x order by (x->>'sin_presu')::int desc, (x->>'pedidos')::int desc, x->>'rubro'), '[]'::jsonb) from (
        select jsonb_build_object(
          'rubro', ru.nombre, 'icono', ru.icono,
          'pedidos', count(pr.id),
          'sin_presu', count(pr.id) filter (where pr.presus = 0 and pr.estado in ('abierto','cancelado')),
          'profesionales', (select count(*) from profesional_rubros x join perfiles pe on pe.id = x.profesional_id
                            where x.rubro_id = ru.id and not pe.suspendido)) as x
        from rubros ru left join primeras pr on pr.rubro_id = ru.id
        group by ru.id, ru.nombre, ru.icono
      ) t),
    -- Barrios con pedidos que no recibieron presupuesto
    'zonas_sin_respuesta', (
      select coalesce(jsonb_agg(jsonb_build_object('zona', zona, 'pedidos', n) order by n desc), '[]'::jsonb)
      from (select zona, count(*) n from primeras
            where presus = 0 and estado in ('abierto','cancelado') and coalesce(zona,'') <> ''
            group by zona order by count(*) desc limit 8) z)
  ) into r;
  return r;
end $$;

-- Lista de usuarios (con email)
create or replace function public.admin_usuarios(p_buscar text default null)
returns table (
  id uuid, nombre text, email text, rol text, zona text, creado_en timestamptz,
  confirmado boolean, ultimo_ingreso timestamptz, suspendido boolean, es_admin boolean,
  pedidos bigint, presupuestos bigint, trabajos bigint, puntaje numeric
) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'Sólo administradores'; end if;
  return query
  select p.id, p.nombre, u.email::text, p.rol, p.zona, p.creado_en,
         u.email_confirmed_at is not null, u.last_sign_in_at, p.suspendido, p.es_admin,
         (select count(*) from pedidos x where x.cliente_id = p.id),
         (select count(*) from presupuestos x where x.profesional_id = p.id),
         (select count(*) from presupuestos x where x.profesional_id = p.id and x.estado = 'aceptado'),
         (select round(avg(c.puntaje)::numeric, 1) from calificaciones c where c.para_id = p.id)
  from perfiles p left join auth.users u on u.id = p.id
  where p_buscar is null or p_buscar = ''
     or p.nombre ilike '%' || p_buscar || '%' or u.email ilike '%' || p_buscar || '%'
     or p.zona ilike '%' || p_buscar || '%'
  order by p.creado_en desc
  limit 300;
end $$;

-- Lista de pedidos
create or replace function public.admin_pedidos(p_estado text default null)
returns table (
  id bigint, titulo text, descripcion text, zona text, estado text, urgencia text, creado_en timestamptz,
  rubro text, icono text, cliente_id uuid, cliente text, cliente_email text, presupuestos bigint
) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'Sólo administradores'; end if;
  return query
  select p.id, p.titulo, p.descripcion, p.zona, p.estado, p.urgencia, p.creado_en,
         r.nombre, r.icono, p.cliente_id, pe.nombre, u.email::text,
         (select count(*) from presupuestos x where x.pedido_id = p.id)
  from pedidos p
  join rubros r on r.id = p.rubro_id
  left join perfiles pe on pe.id = p.cliente_id
  left join auth.users u on u.id = p.cliente_id
  where p_estado is null or p_estado = '' or p.estado = p_estado
  order by p.creado_en desc
  limit 300;
end $$;

-- Suspender / reactivar. Al suspender se cancelan sus pedidos abiertos
-- y se retiran sus presupuestos sin responder.
create or replace function public.admin_suspender(p_usuario uuid, p_valor boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'Sólo administradores'; end if;
  if p_usuario = auth.uid() then raise exception 'No podés suspenderte a vos mismo'; end if;
  update perfiles set suspendido = p_valor where id = p_usuario;
  if p_valor then
    perform set_config('manitos.interno', '1', true);
    update pedidos set estado = 'cancelado' where cliente_id = p_usuario and estado = 'abierto';
    delete from presupuestos where profesional_id = p_usuario and estado = 'enviado';
  end if;
end $$;

-- Borrar un pedido (spam o falso). Borra también presupuestos, mensajes y dirección.
create or replace function public.admin_borrar_pedido(p_pedido bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'Sólo administradores'; end if;
  delete from pedidos where id = p_pedido;
end $$;

revoke all on function public.admin_resumen()                     from public, anon;
revoke all on function public.admin_usuarios(text)                from public, anon;
revoke all on function public.admin_pedidos(text)                 from public, anon;
revoke all on function public.admin_suspender(uuid, boolean)      from public, anon;
revoke all on function public.admin_borrar_pedido(bigint)         from public, anon;
grant execute on function public.admin_resumen()                  to authenticated;
grant execute on function public.admin_usuarios(text)             to authenticated;
grant execute on function public.admin_pedidos(text)              to authenticated;
grant execute on function public.admin_suspender(uuid, boolean)   to authenticated;
grant execute on function public.admin_borrar_pedido(bigint)      to authenticated;
grant execute on function public.es_admin()                       to authenticated;
grant execute on function public.cuenta_activa()                  to authenticated;

-- =====================================================================
-- Vos sos el administrador
-- =====================================================================
update public.perfiles set es_admin = true
where id = (select id from auth.users where lower(email) = 'ezerodriguez2712@gmail.com');
