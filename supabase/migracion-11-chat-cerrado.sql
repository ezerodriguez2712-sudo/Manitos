-- =====================================================================
-- Manitos · Migración 11: el chat se cierra cuando el trabajo termina o se cancela
-- (los mensajes anteriores se pueden seguir leyendo). Requiere la 06.
-- Pegar TODO en Supabase → SQL Editor → Run. Se puede correr más de una vez.
-- =====================================================================
drop policy if exists "msj_alta" on public.mensajes;
create policy "msj_alta" on public.mensajes for insert to authenticated
  with check (autor_id = auth.uid() and public.cuenta_activa() and public.es_participante(pedido_id)
              and exists (select 1 from public.pedidos p where p.id = pedido_id and p.estado = 'asignado'));
