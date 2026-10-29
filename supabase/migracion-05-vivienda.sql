-- =====================================================================
-- MANITOS · Migraciones 04 + 05: mapa y datos de la vivienda
-- (incluye la 04 por si todavía no la corriste). Se puede correr más de una vez.
-- =====================================================================
alter table public.pedido_direcciones add column if not exists lat double precision;
alter table public.pedido_direcciones add column if not exists lng double precision;

alter table public.pedido_direcciones add column if not exists tipo text not null default 'casa';
alter table public.pedido_direcciones add column if not exists piso text;
alter table public.pedido_direcciones add column if not exists depto text;
alter table public.pedido_direcciones add column if not exists barrio_cerrado text;
alter table public.pedido_direcciones add column if not exists manzana text;
alter table public.pedido_direcciones add column if not exists lote text;
alter table public.pedido_direcciones add column if not exists referencias text;

alter table public.pedido_direcciones drop constraint if exists pedido_direcciones_tipo_check;
alter table public.pedido_direcciones add constraint pedido_direcciones_tipo_check
  check (tipo in ('casa', 'departamento', 'barrio_cerrado'));

-- El cliente puede corregir la dirección de su pedido
drop policy if exists "dir_editar" on public.pedido_direcciones;
create policy "dir_editar" on public.pedido_direcciones for update to authenticated
  using (public.es_cliente_del_pedido(pedido_id)) with check (public.es_cliente_del_pedido(pedido_id));
