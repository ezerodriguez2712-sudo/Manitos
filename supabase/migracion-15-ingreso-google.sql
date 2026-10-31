-- =====================================================================
-- Manitos · Migración 15: ingresar con Google (o Facebook)
-- Quien entra con Google completa después su celular y si es cliente o profesional.
-- Además, nadie puede cambiarse el rol por su cuenta (sólo al completar el registro).
-- Pegar en Supabase → SQL Editor → Run. Se puede correr más de una vez.
-- =====================================================================

-- ¿Ya eligió rol y cargó el celular? (los que se registraron con email ya lo hicieron)
alter table public.perfiles add column if not exists registro_completo boolean not null default true;

-- Alta del perfil: con email trae nombre, rol y celular; con Google sólo el nombre
create or replace function public.crear_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.perfiles (id, nombre, rol, registro_completo)
  values (
    new.id,
    left(coalesce(nullif(m->>'nombre', ''), nullif(m->>'full_name', ''), nullif(m->>'name', ''), ''), 80),
    case when m->>'rol' in ('cliente','profesional') then m->>'rol' else 'cliente' end,
    m ? 'rol'
  );
  insert into public.contactos (perfil_id, telefono)
  values (new.id, coalesce(m->>'telefono', ''));
  return new;
end $$;

-- El rol y el registro sólo cambian por completar_registro (o un administrador)
create or replace function public.proteger_perfil()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and not public.es_admin()
     and coalesce(current_setting('manitos.interno', true), '') <> '1' then
    new.es_admin := old.es_admin;
    new.suspendido := old.suspendido;
    new.verificado := old.verificado;
    new.matriculado := old.matriculado;
    new.rol := old.rol;
    new.registro_completo := old.registro_completo;
  end if;
  return new;
end $$;

-- Completar el registro después de entrar con Google
create or replace function public.completar_registro(p_rol text, p_nombre text, p_telefono text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'No hay sesión'; end if;
  if p_rol not in ('cliente','profesional') then raise exception 'Elegí si sos cliente o profesional'; end if;
  if length(trim(coalesce(p_nombre, ''))) < 2 then raise exception 'Poné tu nombre'; end if;
  if length(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g')) < 8 then
    raise exception 'Revisá el celular: tiene que tener código de área y número';
  end if;
  if not exists (select 1 from perfiles where id = auth.uid() and not registro_completo) then
    raise exception 'Tu cuenta ya está completa';
  end if;
  perform set_config('manitos.interno', '1', true);
  update perfiles set rol = p_rol, nombre = left(trim(p_nombre), 80), registro_completo = true where id = auth.uid();
  insert into contactos (perfil_id, telefono) values (auth.uid(), trim(p_telefono))
  on conflict (perfil_id) do update set telefono = excluded.telefono;
end $$;
revoke all on function public.completar_registro(text, text, text) from public, anon;
grant execute on function public.completar_registro(text, text, text) to authenticated;
