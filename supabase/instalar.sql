-- MANITOS · Instalación completa (limpieza + esquema + mejoras + avisos + mapa y vivienda). Se puede ejecutar las veces que haga falta.
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

-- =====================================================================
-- MANITOS · Esquema de base de datos (Supabase / Postgres)
-- Ejecutar completo en: Supabase → SQL Editor → New query → Run
-- =====================================================================

-- ---------- Perfiles ----------
create table if not exists public.perfiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nombre      text not null default '',
  rol         text not null default 'cliente' check (rol in ('cliente','profesional')),
  zona        text,
  descripcion text,
  creado_en   timestamptz not null default now()
);

-- Teléfono: separado, sólo lo ven el dueño y su contraparte en un trabajo asignado
create table if not exists public.contactos (
  perfil_id uuid primary key references public.perfiles(id) on delete cascade,
  telefono  text not null default ''
);

-- ---------- Rubros ----------
create table if not exists public.rubros (
  id     serial primary key,
  nombre text not null unique,
  icono  text not null default '🛠️'
);

insert into public.rubros (nombre, icono) values
  ('Plomería','🚰'), ('Electricidad','💡'), ('Gas','🔥'), ('Albañilería','🧱'),
  ('Pintura','🎨'), ('Carpintería','🪚'), ('Cerrajería','🔑'), ('Aire acondicionado','❄️'),
  ('Jardinería','🌿'), ('Limpieza','🧽'), ('Herrería','⚒️'), ('Mudanzas y fletes','🚚'),
  ('Techos y membranas','🏠'), ('Electrodomésticos','🔧')
on conflict (nombre) do nothing;

-- Rubros que atiende cada profesional
create table if not exists public.profesional_rubros (
  profesional_id uuid references public.perfiles(id) on delete cascade,
  rubro_id       int  references public.rubros(id)   on delete cascade,
  primary key (profesional_id, rubro_id)
);

-- ---------- Pedidos ----------
create table if not exists public.pedidos (
  id            bigserial primary key,
  cliente_id    uuid not null references public.perfiles(id) on delete cascade,
  rubro_id      int  not null references public.rubros(id),
  titulo        text not null,
  descripcion   text not null,
  zona          text not null,
  urgencia      text not null default 'normal' check (urgencia in ('normal','urgente')),
  fotos         text[] not null default '{}',
  estado        text not null default 'abierto'
                check (estado in ('abierto','asignado','completado','cancelado')),
  presupuesto_elegido_id bigint,
  creado_en     timestamptz not null default now()
);
create index if not exists pedidos_rubro_estado_idx on public.pedidos (rubro_id, estado);

-- Dirección exacta: separada, sólo la ven el cliente y el profesional elegido
create table if not exists public.pedido_direcciones (
  pedido_id bigint primary key references public.pedidos(id) on delete cascade,
  direccion text not null
);

-- ---------- Presupuestos ----------
create table if not exists public.presupuestos (
  id               bigserial primary key,
  pedido_id        bigint not null references public.pedidos(id) on delete cascade,
  profesional_id   uuid   not null references public.perfiles(id) on delete cascade,
  monto            numeric(12,2) not null check (monto > 0),
  fecha_disponible date,
  mensaje          text,
  estado           text not null default 'enviado' check (estado in ('enviado','aceptado','rechazado')),
  creado_en        timestamptz not null default now(),
  unique (pedido_id, profesional_id)
);

-- ---------- Mensajes (chat del trabajo) ----------
create table if not exists public.mensajes (
  id        bigserial primary key,
  pedido_id bigint not null references public.pedidos(id) on delete cascade,
  autor_id  uuid   not null references public.perfiles(id) on delete cascade,
  texto     text   not null,
  creado_en timestamptz not null default now()
);

-- ---------- Calificaciones ----------
create table if not exists public.calificaciones (
  id         bigserial primary key,
  pedido_id  bigint not null references public.pedidos(id) on delete cascade,
  de_id      uuid not null references public.perfiles(id) on delete cascade,
  para_id    uuid not null references public.perfiles(id) on delete cascade,
  puntaje    int  not null check (puntaje between 1 and 5),
  comentario text,
  creado_en  timestamptz not null default now(),
  unique (pedido_id, de_id)
);

-- Promedio de calificaciones por persona
create or replace view public.reputacion as
  select para_id as perfil_id,
         round(avg(puntaje)::numeric, 1) as promedio,
         count(*)::int as cantidad
  from public.calificaciones
  group by para_id;

-- =====================================================================
-- Funciones auxiliares (security definer para evitar recursión en RLS)
-- =====================================================================

-- Alta automática del perfil al registrarse
create or replace function public.crear_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, nombre, rol)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre', ''),
    coalesce(new.raw_user_meta_data->>'rol', 'cliente')
  );
  insert into public.contactos (perfil_id, telefono)
  values (new.id, coalesce(new.raw_user_meta_data->>'telefono', ''));
  return new;
end $$;

drop trigger if exists al_registrarse on auth.users;
create trigger al_registrarse after insert on auth.users
  for each row execute function public.crear_perfil();

create or replace function public.es_cliente_del_pedido(p_pedido bigint)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from pedidos where id = p_pedido and cliente_id = auth.uid());
$$;

create or replace function public.profesional_asignado(p_pedido bigint)
returns uuid language sql security definer stable set search_path = public as $$
  select pr.profesional_id
  from pedidos p join presupuestos pr on pr.id = p.presupuesto_elegido_id
  where p.id = p_pedido;
$$;

create or replace function public.puede_ver_pedido(p_pedido bigint)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from pedidos p
    where p.id = p_pedido and (
      p.cliente_id = auth.uid()
      or exists (select 1 from presupuestos pr where pr.pedido_id = p.id and pr.profesional_id = auth.uid())
      or (p.estado = 'abierto' and exists (
            select 1 from profesional_rubros r
            where r.profesional_id = auth.uid() and r.rubro_id = p.rubro_id))
    )
  );
$$;

create or replace function public.es_participante(p_pedido bigint)
returns boolean language sql security definer stable set search_path = public as $$
  select public.es_cliente_del_pedido(p_pedido)
      or public.profesional_asignado(p_pedido) = auth.uid();
$$;

-- ¿La persona p es mi contraparte en un trabajo asignado o terminado?
create or replace function public.es_contraparte(p uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from pedidos pe join presupuestos pr on pr.id = pe.presupuesto_elegido_id
    where pe.estado in ('asignado','completado') and (
      (pe.cliente_id = auth.uid() and pr.profesional_id = p) or
      (pe.cliente_id = p and pr.profesional_id = auth.uid()))
  );
$$;

-- El cliente elige un presupuesto: queda asignado y los demás se rechazan
create or replace function public.aceptar_presupuesto(p_presupuesto bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_pedido bigint;
begin
  select pedido_id into v_pedido from presupuestos where id = p_presupuesto;
  if v_pedido is null then raise exception 'Presupuesto inexistente'; end if;
  if not exists (select 1 from pedidos where id = v_pedido and cliente_id = auth.uid() and estado = 'abierto') then
    raise exception 'No podés aceptar este presupuesto';
  end if;
  update presupuestos set estado = case when id = p_presupuesto then 'aceptado' else 'rechazado' end
   where pedido_id = v_pedido;
  update pedidos set estado = 'asignado', presupuesto_elegido_id = p_presupuesto where id = v_pedido;
end $$;

-- =====================================================================
-- Seguridad (Row Level Security)
-- =====================================================================
alter table public.perfiles           enable row level security;
alter table public.contactos          enable row level security;
alter table public.rubros             enable row level security;
alter table public.profesional_rubros enable row level security;
alter table public.pedidos            enable row level security;
alter table public.pedido_direcciones enable row level security;
alter table public.presupuestos       enable row level security;
alter table public.mensajes           enable row level security;
alter table public.calificaciones     enable row level security;

-- Perfiles: visibles para usuarios logueados; cada uno edita el suyo
create policy "perfiles_ver"    on public.perfiles for select to authenticated using (true);
create policy "perfiles_editar" on public.perfiles for update to authenticated using (id = auth.uid());

-- Contactos (teléfono)
create policy "contacto_ver"    on public.contactos for select to authenticated
  using (perfil_id = auth.uid() or public.es_contraparte(perfil_id));
create policy "contacto_alta"   on public.contactos for insert to authenticated with check (perfil_id = auth.uid());
create policy "contacto_editar" on public.contactos for update to authenticated using (perfil_id = auth.uid());

-- Rubros: lectura pública
create policy "rubros_ver" on public.rubros for select using (true);

-- Rubros del profesional
create policy "pr_ver"    on public.profesional_rubros for select to authenticated using (true);
create policy "pr_alta"   on public.profesional_rubros for insert to authenticated with check (profesional_id = auth.uid());
create policy "pr_baja"   on public.profesional_rubros for delete to authenticated using (profesional_id = auth.uid());

-- Pedidos
create policy "pedidos_ver"    on public.pedidos for select to authenticated
  using (cliente_id = auth.uid() or public.puede_ver_pedido(id));
create policy "pedidos_alta"   on public.pedidos for insert to authenticated with check (cliente_id = auth.uid());
create policy "pedidos_editar" on public.pedidos for update to authenticated using (cliente_id = auth.uid());

-- Dirección: sólo participantes
create policy "dir_ver"  on public.pedido_direcciones for select to authenticated using (public.es_participante(pedido_id));
create policy "dir_alta" on public.pedido_direcciones for insert to authenticated with check (public.es_cliente_del_pedido(pedido_id));

-- Presupuestos: los ve el profesional que lo mandó y el cliente del pedido
create policy "presu_ver" on public.presupuestos for select to authenticated
  using (profesional_id = auth.uid() or public.es_cliente_del_pedido(pedido_id));
create policy "presu_alta" on public.presupuestos for insert to authenticated
  with check (profesional_id = auth.uid() and estado = 'enviado' and public.puede_ver_pedido(pedido_id)
              and exists (select 1 from public.pedidos p where p.id = pedido_id and p.estado = 'abierto'));
create policy "presu_editar" on public.presupuestos for update to authenticated
  using (profesional_id = auth.uid() and estado = 'enviado')
  with check (profesional_id = auth.uid() and estado = 'enviado');

-- Mensajes: sólo cliente y profesional asignado
create policy "msj_ver"  on public.mensajes for select to authenticated using (public.es_participante(pedido_id));
create policy "msj_alta" on public.mensajes for insert to authenticated
  with check (autor_id = auth.uid() and public.es_participante(pedido_id));

-- Calificaciones: públicas; sólo participantes de un trabajo completado
create policy "calif_ver"  on public.calificaciones for select using (true);
create policy "calif_alta" on public.calificaciones for insert to authenticated
  with check (de_id = auth.uid() and de_id <> para_id and public.es_participante(pedido_id)
              and exists (select 1 from public.pedidos p where p.id = pedido_id and p.estado = 'completado'));

grant select on public.reputacion to anon, authenticated;

-- Chat en tiempo real
alter publication supabase_realtime add table public.mensajes;

-- =====================================================================
-- Fotos de los pedidos (Storage)
-- =====================================================================
insert into storage.buckets (id, name, public) values ('fotos', 'fotos', true)
on conflict (id) do nothing;

drop policy if exists "fotos_subir" on storage.objects;
drop policy if exists "fotos_ver" on storage.objects;
create policy "fotos_subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "fotos_ver" on storage.objects for select using (bucket_id = 'fotos');

-- =====================================================================
-- Usuarios que ya existían antes de este esquema: crearles perfil
-- =====================================================================
insert into public.perfiles (id, nombre, rol)
select id, coalesce(raw_user_meta_data->>'nombre', ''),
       case when raw_user_meta_data->>'rol' = 'profesional' then 'profesional' else 'cliente' end
from auth.users
on conflict (id) do nothing;

insert into public.contactos (perfil_id, telefono)
select id, coalesce(raw_user_meta_data->>'telefono', '') from auth.users
on conflict (perfil_id) do nothing;

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

-- =====================================================================
-- MANITOS · Migración 03: avisos por mail
-- Cuando entra un pedido, un presupuesto o se elige un presupuesto,
-- la base le avisa a la app (Vercel) y la app manda el mail por Brevo.
-- Se puede correr más de una vez. Al final muestra el SECRETO que va en Vercel.
-- =====================================================================

create extension if not exists pg_net with schema extensions;

-- Preferencia de cada usuario
alter table public.perfiles add column if not exists avisos_mail boolean not null default true;

-- Registro para no mandar dos veces el mismo aviso (sólo lo usa el servidor)
create table if not exists public.avisos_enviados (
  tipo      text   not null,
  ref_id    bigint not null,
  enviado_en timestamptz not null default now(),
  primary key (tipo, ref_id)
);
alter table public.avisos_enviados enable row level security;  -- sin políticas: nadie desde la app

-- Configuración privada (dirección de la app y secreto compartido con Vercel)
create schema if not exists privado;
revoke all on schema privado from public, anon, authenticated;
create table if not exists privado.config (clave text primary key, valor text not null);
insert into privado.config (clave, valor) values
  ('url_avisos', 'https://manitos-ten.vercel.app/api/avisos'),
  ('secreto', md5(random()::text || clock_timestamp()::text) || md5(clock_timestamp()::text || random()::text))
on conflict (clave) do nothing;

-- Envía el aviso a la app. Nunca frena la operación original si algo falla.
create or replace function privado.disparar_aviso(p_tipo text, p_id bigint)
returns void language plpgsql security definer set search_path = public, privado, extensions as $$
declare v_url text; v_secreto text;
begin
  select valor into v_url from privado.config where clave = 'url_avisos';
  select valor into v_secreto from privado.config where clave = 'secreto';
  if v_url is null or v_secreto is null then return; end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('tipo', p_tipo, 'id', p_id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-manitos-secreto', v_secreto),
    timeout_milliseconds := 30000
  );
exception when others then
  raise warning 'No se pudo disparar el aviso % %: %', p_tipo, p_id, sqlerrm;
end $$;

create or replace function privado.trg_pedido_nuevo() returns trigger
language plpgsql security definer set search_path = public, privado as $$
begin perform privado.disparar_aviso('nuevo_pedido', new.id); return new; end $$;

create or replace function privado.trg_presupuesto_nuevo() returns trigger
language plpgsql security definer set search_path = public, privado as $$
begin perform privado.disparar_aviso('nuevo_presupuesto', new.id); return new; end $$;

create or replace function privado.trg_pedido_asignado() returns trigger
language plpgsql security definer set search_path = public, privado as $$
begin
  if old.estado = 'abierto' and new.estado = 'asignado' then
    perform privado.disparar_aviso('elegido', new.id);
  end if;
  return new;
end $$;

drop trigger if exists aviso_pedido_nuevo on public.pedidos;
create trigger aviso_pedido_nuevo after insert on public.pedidos
  for each row execute function privado.trg_pedido_nuevo();

drop trigger if exists aviso_presupuesto_nuevo on public.presupuestos;
create trigger aviso_presupuesto_nuevo after insert on public.presupuestos
  for each row execute function privado.trg_presupuesto_nuevo();

drop trigger if exists aviso_pedido_asignado on public.pedidos;
create trigger aviso_pedido_asignado after update on public.pedidos
  for each row execute function privado.trg_pedido_asignado();

-- 👇 Copiá este valor: va en Vercel como AVISOS_SECRETO
select valor as "AVISOS_SECRETO (copialo a Vercel)" from privado.config where clave = 'secreto';

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
