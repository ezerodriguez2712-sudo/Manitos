-- =====================================================================
-- Manitos · Migración 14: trabajos realizados de cada usuario
-- Para mostrar "Usuario desde … · N trabajos realizados" en los perfiles.
-- Pegar en Supabase → SQL Editor → Run. Se puede correr más de una vez.
-- =====================================================================
-- Cuenta sólo trabajos terminados (pedido completado). Muestra cantidades, no detalles.
create or replace view public.trabajos_realizados as
  select pr.profesional_id as perfil_id, count(*)::int as cantidad
  from public.pedidos p join public.presupuestos pr on pr.id = p.presupuesto_elegido_id
  where p.estado = 'completado'
  group by pr.profesional_id
  union all
  select p.cliente_id, count(*)::int
  from public.pedidos p
  where p.estado = 'completado'
  group by p.cliente_id;
grant select on public.trabajos_realizados to authenticated;
