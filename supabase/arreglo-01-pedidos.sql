-- Arreglo: el cliente no podía publicar pedidos ("new row violates row-level security policy")
drop policy if exists "pedidos_ver" on public.pedidos;
create policy "pedidos_ver" on public.pedidos for select to authenticated
  using (cliente_id = auth.uid() or public.puede_ver_pedido(id));
