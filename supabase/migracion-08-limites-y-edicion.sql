-- =====================================================================
-- Manitos · Migración 08: límites contra el abuso, editar pedido,
-- vencimiento a los 15 días y recordatorios.
-- Requiere la 06 y la 07. Pegar TODO en Supabase → SQL Editor → Run.
-- Se puede correr más de una vez.
-- =====================================================================

-- ---------- Nuevo estado: vencido ----------
alter table public.pedidos drop constraint if exists pedidos_estado_check;
alter table public.pedidos add constraint pedidos_estado_check
  check (estado in ('abierto','asignado','completado','cancelado','vencido'));

alter table public.pedidos add column if not exists editado_en   timestamptz;
alter table public.pedidos add column if not exists recordado_en timestamptz;
alter table public.pedidos add column if not exists vence_en     timestamptz;
update public.pedidos set vence_en = creado_en + interval '15 days' where vence_en is null;
alter table public.pedidos alter column vence_en set default now() + interval '15 days';

-- ---------- Reglas de cambio del pedido ----------
-- El cliente puede editar título, descripción, urgencia y fotos mientras está abierto.
-- No puede cambiar rubro ni barrio (cambiaría quién lo ve).
create or replace function public.validar_cambio_pedido()
returns trigger language plpgsql as $$
begin
  -- Procesos internos, la app con clave de servicio y el SQL Editor (sin usuario) pueden todo
  if current_setting('manitos.interno', true) = '1' or auth.uid() is null then return new; end if;
  if new.cliente_id <> old.cliente_id or new.presupuesto_elegido_id is distinct from old.presupuesto_elegido_id
     or new.rubro_id <> old.rubro_id or new.zona <> old.zona or new.creado_en <> old.creado_en
     or new.vence_en is distinct from old.vence_en or new.recordado_en is distinct from old.recordado_en then
    raise exception 'Cambio no permitido';
  end if;
  if new.estado <> old.estado and not (
       (old.estado = 'abierto'  and new.estado = 'cancelado') or
       (old.estado = 'asignado' and new.estado in ('completado','cancelado'))
     ) then
    raise exception 'No se puede pasar el pedido de % a %', old.estado, new.estado;
  end if;
  if (new.titulo, new.descripcion, new.urgencia, new.fotos) is distinct from
     (old.titulo, old.descripcion, old.urgencia, old.fotos) then
    if old.estado <> 'abierto' then
      raise exception 'Sólo se puede editar un pedido mientras recibe presupuestos';
    end if;
    new.editado_en := now();
  else
    new.editado_en := old.editado_en;
  end if;
  return new;
end $$;

-- ---------- Límites contra el abuso ----------
-- Un solo control para todas las tablas (usa el nombre de la tabla del trigger)
drop function if exists public.limitar(text);
create or replace function public.trg_limite()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); n int;
begin
  if v_uid is null or public.es_admin() then return new; end if;  -- procesos internos y admins
  if tg_table_name = 'pedidos' then
    select count(*) into n from pedidos where cliente_id = v_uid and creado_en > now() - interval '24 hours';
    if n >= 5 then raise exception 'Llegaste al máximo de 5 pedidos por día. Probá de nuevo mañana.'; end if;
    select count(*) into n from pedidos where cliente_id = v_uid and estado = 'abierto';
    if n >= 10 then raise exception 'Tenés 10 pedidos abiertos. Cancelá alguno antes de publicar otro.'; end if;
  elsif tg_table_name = 'presupuestos' then
    select count(*) into n from presupuestos where profesional_id = v_uid and creado_en > now() - interval '24 hours';
    if n >= 40 then raise exception 'Llegaste al máximo de 40 presupuestos por día.'; end if;
  elsif tg_table_name = 'preguntas' then
    select count(*) into n from preguntas where profesional_id = v_uid and creado_en > now() - interval '24 hours';
    if n >= 30 then raise exception 'Llegaste al máximo de 30 preguntas por día.'; end if;
  elsif tg_table_name = 'mensajes' then
    select count(*) into n from mensajes where autor_id = v_uid and creado_en > now() - interval '1 hour';
    if n >= 120 then raise exception 'Estás mandando demasiados mensajes. Esperá un rato.'; end if;
  end if;
  return new;
end $$;

drop trigger if exists limite on public.pedidos;
create trigger limite before insert on public.pedidos for each row execute function public.trg_limite();
drop trigger if exists limite on public.presupuestos;
create trigger limite before insert on public.presupuestos for each row execute function public.trg_limite();
drop trigger if exists limite on public.preguntas;
create trigger limite before insert on public.preguntas for each row execute function public.trg_limite();
drop trigger if exists limite on public.mensajes;
create trigger limite before insert on public.mensajes for each row execute function public.trg_limite();

-- ---------- Volver a publicar un pedido vencido o cancelado ----------
-- Crea una copia nueva (con la misma dirección) y devuelve su número.
create or replace function public.republicar_pedido(p_pedido bigint)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_nuevo bigint; v public.pedidos;
begin
  select * into v from pedidos where id = p_pedido and cliente_id = auth.uid();
  if v.id is null then raise exception 'Pedido inexistente'; end if;
  if v.estado not in ('vencido','cancelado') then raise exception 'Este pedido sigue activo'; end if;
  if not public.cuenta_activa() then raise exception 'Tu cuenta está suspendida'; end if;
  insert into pedidos (cliente_id, rubro_id, titulo, descripcion, zona, urgencia, fotos)
  values (v.cliente_id, v.rubro_id, v.titulo, v.descripcion, v.zona, v.urgencia, v.fotos)
  returning id into v_nuevo;
  insert into pedido_direcciones (pedido_id, direccion, lat, lng, tipo, piso, depto, barrio_cerrado, manzana, lote, referencias)
  select v_nuevo, d.direccion, d.lat, d.lng, d.tipo, d.piso, d.depto, d.barrio_cerrado, d.manzana, d.lote, d.referencias
  from pedido_direcciones d where d.pedido_id = p_pedido;
  return v_nuevo;
end $$;
revoke all on function public.republicar_pedido(bigint) from public, anon;
grant execute on function public.republicar_pedido(bigint) to authenticated;

-- ---------- Tareas diarias (las llama la app una vez por día) ----------
-- Vence los pedidos abiertos que pasaron los 15 días. Devuelve los vencidos.
create or replace function public.tarea_vencer_pedidos()
returns setof bigint language plpgsql security definer set search_path = public as $$
begin
  perform set_config('manitos.interno', '1', true);
  return query
  update pedidos set estado = 'vencido'
  where estado = 'abierto' and vence_en < now()
  returning id;
end $$;

-- Pedidos con presupuestos esperando hace más de 2 días (un solo recordatorio por pedido)
create or replace function public.tarea_recordatorios()
returns table (pedido_id bigint, cliente_id uuid, titulo text, presupuestos bigint, vence_en timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('manitos.interno', '1', true);
  return query
  with candidatos as (
    select p.id from pedidos p
    where p.estado = 'abierto' and p.recordado_en is null
      and p.creado_en < now() - interval '2 days'
      and exists (select 1 from presupuestos x where x.pedido_id = p.id and x.creado_en < now() - interval '1 day')
    limit 100
  ), marcados as (
    update pedidos p set recordado_en = now() from candidatos c where p.id = c.id
    returning p.id, p.cliente_id, p.titulo, p.vence_en
  )
  select m.id, m.cliente_id, m.titulo,
         (select count(*) from presupuestos x where x.pedido_id = m.id), m.vence_en
  from marcados m;
end $$;

revoke all on function public.tarea_vencer_pedidos() from public, anon, authenticated;
revoke all on function public.tarea_recordatorios()  from public, anon, authenticated;
grant execute on function public.tarea_vencer_pedidos() to service_role;
grant execute on function public.tarea_recordatorios()  to service_role;

-- ---------- Indicadores: los vencidos cuentan como "sin respuesta" ----------
-- (en la conversión ya cuentan como no convertidos porque no están asignados ni completados)
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
          'sin_presu', count(pr.id) filter (where pr.presus = 0 and pr.estado in ('abierto','cancelado','vencido')),
          'profesionales', (select count(*) from profesional_rubros x join perfiles pe on pe.id = x.profesional_id
                            where x.rubro_id = ru.id and not pe.suspendido)) as x
        from rubros ru left join primeras pr on pr.rubro_id = ru.id
        group by ru.id, ru.nombre, ru.icono
      ) t),
    -- Barrios con pedidos que no recibieron presupuesto
    'zonas_sin_respuesta', (
      select coalesce(jsonb_agg(jsonb_build_object('zona', zona, 'pedidos', n) order by n desc), '[]'::jsonb)
      from (select zona, count(*) n from primeras
            where presus = 0 and estado in ('abierto','cancelado','vencido') and coalesce(zona,'') <> ''
            group by zona order by count(*) desc limit 8) z)
  ) into r;
  return r;
end $$;
