-- =====================================================================
-- Manitos · Migración 09: el profesional marca el trabajo terminado,
-- fotos de trabajos anteriores y tiempo de respuesta.
-- Requiere la 08. Pegar TODO en Supabase → SQL Editor → Run. Se puede correr más de una vez.
-- =====================================================================

-- =====================================================================
-- 1) EL PROFESIONAL MARCA EL TRABAJO COMO TERMINADO
-- El cliente confirma (o avisa si falta algo). Si no responde en 3 días,
-- se da por terminado solo y los dos se pueden calificar.
-- =====================================================================
alter table public.pedidos add column if not exists terminado_pro_en timestamptz;

create or replace function public.validar_cambio_pedido()
returns trigger language plpgsql as $$
begin
  -- Procesos internos, la app con clave de servicio y el SQL Editor (sin usuario) pueden todo
  if current_setting('manitos.interno', true) = '1' or auth.uid() is null then return new; end if;
  if new.cliente_id <> old.cliente_id or new.presupuesto_elegido_id is distinct from old.presupuesto_elegido_id
     or new.rubro_id <> old.rubro_id or new.zona <> old.zona or new.creado_en <> old.creado_en
     or new.vence_en is distinct from old.vence_en or new.recordado_en is distinct from old.recordado_en
     or new.terminado_pro_en is distinct from old.terminado_pro_en then
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

create or replace function public.profesional_termina(p_pedido bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from pedidos p join presupuestos pr on pr.id = p.presupuesto_elegido_id
    where p.id = p_pedido and p.estado = 'asignado' and pr.profesional_id = auth.uid()
  ) then
    raise exception 'Sólo el profesional elegido puede marcar el trabajo como terminado';
  end if;
  perform set_config('manitos.interno', '1', true);
  update pedidos set terminado_pro_en = now() where id = p_pedido and terminado_pro_en is null;
end $$;
revoke all on function public.profesional_termina(bigint) from public, anon;
grant execute on function public.profesional_termina(bigint) to authenticated;

-- El cliente dice que todavía falta algo: se borra la marca y sigue en curso
create or replace function public.cliente_falta_algo(p_pedido bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from pedidos where id = p_pedido and cliente_id = auth.uid() and estado = 'asignado') then
    raise exception 'No podés cambiar este pedido';
  end if;
  perform set_config('manitos.interno', '1', true);
  update pedidos set terminado_pro_en = null where id = p_pedido;
end $$;
revoke all on function public.cliente_falta_algo(bigint) from public, anon;
grant execute on function public.cliente_falta_algo(bigint) to authenticated;

-- Mail al cliente cuando el profesional marca terminado
create or replace function privado.trg_terminado_pro() returns trigger
language plpgsql security definer set search_path = public, privado as $$
begin
  if old.terminado_pro_en is null and new.terminado_pro_en is not null and new.estado = 'asignado' then
    perform privado.disparar_aviso('terminado', new.id);
  end if;
  return new;
end $$;
drop trigger if exists aviso_terminado_pro on public.pedidos;
create trigger aviso_terminado_pro after update on public.pedidos
  for each row execute function privado.trg_terminado_pro();

-- Tarea diaria: completa los trabajos marcados terminados hace más de 3 días
create or replace function public.tarea_autocompletar()
returns setof bigint language plpgsql security definer set search_path = public as $$
begin
  perform set_config('manitos.interno', '1', true);
  return query
  update pedidos set estado = 'completado'
  where estado = 'asignado' and terminado_pro_en < now() - interval '3 days'
  returning id;
end $$;
revoke all on function public.tarea_autocompletar() from public, anon, authenticated;
grant execute on function public.tarea_autocompletar() to service_role;

-- Avisos en la app: el cliente ve como novedad que el profesional terminó
create or replace function public.mis_avisos()
returns table (pedido_id bigint, novedades int, mensajes int)
language sql security definer stable set search_path = public as $$
  with mios as (
    select p.id, coalesce(l.visto_en, 'epoch'::timestamptz) as visto
    from pedidos p left join lecturas l on l.pedido_id = p.id and l.perfil_id = auth.uid()
    where p.cliente_id = auth.uid()
    union
    select pr.pedido_id, coalesce(l.visto_en, 'epoch'::timestamptz)
    from presupuestos pr left join lecturas l on l.pedido_id = pr.pedido_id and l.perfil_id = auth.uid()
    where pr.profesional_id = auth.uid()
    union
    select pg.pedido_id, coalesce(l.visto_en, 'epoch'::timestamptz)
    from preguntas pg left join lecturas l on l.pedido_id = pg.pedido_id and l.perfil_id = auth.uid()
    where pg.profesional_id = auth.uid()
  )
  select m.id,
    (case when exists (select 1 from pedidos p where p.id = m.id and p.cliente_id = auth.uid())
          then (select count(*) from presupuestos x where x.pedido_id = m.id and x.creado_en > m.visto)
             + (select count(*) from preguntas q where q.pedido_id = m.id and q.respuesta is null and q.creado_en > m.visto)
             + (select count(*) from pedidos p where p.id = m.id and p.estado = 'asignado' and p.terminado_pro_en > m.visto)
          else (select count(*) from presupuestos x where x.pedido_id = m.id and x.profesional_id = auth.uid()
                  and x.respondido_en > m.visto)
             + (select count(*) from preguntas q where q.pedido_id = m.id and q.profesional_id = auth.uid()
                  and q.respondido_en > m.visto)
     end)::int,
    (select count(*) from mensajes ms
      where ms.pedido_id = m.id and ms.autor_id <> auth.uid() and ms.creado_en > m.visto
        and public.es_participante(m.id))::int
  from mios m;
$$;

-- =====================================================================
-- 2) FOTOS DE TRABAJOS ANTERIORES (vidriera del profesional)
-- Se guardan en el depósito público "fotos", en la carpeta del profesional.
-- =====================================================================
create table if not exists public.trabajos_fotos (
  id             bigserial primary key,
  profesional_id uuid not null references public.perfiles(id) on delete cascade,
  ruta           text not null,
  descripcion    text check (descripcion is null or char_length(descripcion) <= 120),
  creado_en      timestamptz not null default now()
);
create index if not exists trabajos_fotos_pro_idx on public.trabajos_fotos (profesional_id, creado_en desc);
alter table public.trabajos_fotos enable row level security;

drop policy if exists "tf_ver" on public.trabajos_fotos;
create policy "tf_ver" on public.trabajos_fotos for select using (true);
drop policy if exists "tf_alta" on public.trabajos_fotos;
create policy "tf_alta" on public.trabajos_fotos for insert to authenticated
  with check (profesional_id = auth.uid() and public.cuenta_activa()
              and split_part(ruta, '/', 1) = auth.uid()::text
              and exists (select 1 from public.perfiles where id = auth.uid() and rol = 'profesional')
              and (select count(*) from public.trabajos_fotos x where x.profesional_id = auth.uid()) < 12);
drop policy if exists "tf_editar" on public.trabajos_fotos;
create policy "tf_editar" on public.trabajos_fotos for update to authenticated
  using (profesional_id = auth.uid()) with check (profesional_id = auth.uid() and split_part(ruta, '/', 1) = auth.uid()::text);
drop policy if exists "tf_borrar" on public.trabajos_fotos;
create policy "tf_borrar" on public.trabajos_fotos for delete to authenticated using (profesional_id = auth.uid());
grant select on public.trabajos_fotos to anon, authenticated;

-- =====================================================================
-- 3) TIEMPO DE RESPUESTA DEL PROFESIONAL
-- Mediana de horas entre que se publica un pedido y que manda presupuesto
-- (últimos 6 meses, con al menos 2 presupuestos). Sólo expone el resumen.
-- =====================================================================
create or replace view public.respuesta as
  select pr.profesional_id as perfil_id,
         round((percentile_cont(0.5) within group (
           order by extract(epoch from pr.creado_en - p.creado_en) / 3600))::numeric, 1) as horas,
         count(*)::int as cantidad
  from public.presupuestos pr join public.pedidos p on p.id = pr.pedido_id
  where pr.creado_en > now() - interval '180 days'
  group by pr.profesional_id
  having count(*) >= 2;
grant select on public.respuesta to anon, authenticated;
