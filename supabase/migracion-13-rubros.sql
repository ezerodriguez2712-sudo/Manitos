-- =====================================================================
-- Manitos · Migración 13: rubros nuevos
-- Pegar en Supabase → SQL Editor → Run. Se puede correr más de una vez.
-- =====================================================================
insert into public.rubros (nombre, icono) values
  ('Arreglos generales','🛠️'), ('Piletas','🏊'), ('Persianas y aberturas','🪟'),
  ('Durlock y yesería','📐'), ('Pisos y revestimientos','🔲'), ('Fumigación','🐜')
on conflict (nombre) do nothing;
