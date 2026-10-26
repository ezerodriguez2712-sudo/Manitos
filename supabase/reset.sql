-- =====================================================================
-- MANITOS · Limpieza de la versión anterior
-- ⚠️ BORRA todas las tablas, vistas y funciones del esquema "public"
--    (datos de prueba de la versión vieja). Los usuarios registrados
--    (auth.users) NO se borran.
-- Ejecutar UNA vez, y después ejecutar schema.sql.
-- =====================================================================

-- 1) Quitar triggers viejos sobre auth.users (si apuntan a tablas que ya no
--    existen, romperían el registro de usuarios nuevos)
do $$
declare t record;
begin
  for t in
    select tgname from pg_trigger
    where tgrelid = 'auth.users'::regclass and not tgisinternal
  loop
    execute format('drop trigger if exists %I on auth.users', t.tgname);
  end loop;
end $$;

-- 2) Borrar y recrear el esquema public
drop schema if exists public cascade;
create schema public;

-- 3) Permisos estándar de Supabase
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, service_role;
alter default privileges in schema public grant all on tables    to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;

-- 4) Quitar políticas viejas sobre las fotos (Storage)
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'
  loop
    execute format('drop policy if exists %I on storage.objects', p.policyname);
  end loop;
end $$;
