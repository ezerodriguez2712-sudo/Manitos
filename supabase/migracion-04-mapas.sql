-- =====================================================================
-- MANITOS · Migración 04: ubicación en el mapa de la dirección del trabajo
-- Se puede correr más de una vez. No borra datos.
-- =====================================================================
alter table public.pedido_direcciones add column if not exists lat double precision;
alter table public.pedido_direcciones add column if not exists lng double precision;

-- El cliente puede corregir la dirección de su pedido
drop policy if exists "dir_editar" on public.pedido_direcciones;
create policy "dir_editar" on public.pedido_direcciones for update to authenticated
  using (public.es_cliente_del_pedido(pedido_id)) with check (public.es_cliente_del_pedido(pedido_id));
