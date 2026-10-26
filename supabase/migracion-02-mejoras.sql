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
