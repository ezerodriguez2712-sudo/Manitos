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

-- =====================================================================
-- Manitos · Migración 06: panel de administrador, suspensión y borrar cuenta
-- Pegar TODO en Supabase → SQL Editor → Run. Se puede correr más de una vez.
-- =====================================================================

alter table public.perfiles add column if not exists es_admin   boolean not null default false;
alter table public.perfiles add column if not exists suspendido boolean not null default false;

-- ¿El usuario logueado es administrador?
create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select es_admin from perfiles where id = auth.uid()), false)
$$;

-- ¿El usuario logueado puede operar (no está suspendido)?
create or replace function public.cuenta_activa()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select not suspendido from perfiles where id = auth.uid()), false)
$$;

-- Nadie puede darse a sí mismo permisos de admin ni sacarse la suspensión.
-- (Desde el SQL Editor sí se puede: ahí no hay usuario logueado.)
create or replace function public.proteger_perfil()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and not public.es_admin() then
    new.es_admin := old.es_admin;
    new.suspendido := old.suspendido;
  end if;
  return new;
end $$;
drop trigger if exists perfiles_proteger on public.perfiles;
create trigger perfiles_proteger before update on public.perfiles
  for each row execute function public.proteger_perfil();

-- Las cuentas suspendidas no pueden publicar, presupuestar ni escribir
drop policy if exists "pedidos_alta" on public.pedidos;
create policy "pedidos_alta" on public.pedidos for insert to authenticated
  with check (cliente_id = auth.uid() and public.cuenta_activa());

drop policy if exists "presu_alta" on public.presupuestos;
create policy "presu_alta" on public.presupuestos for insert to authenticated
  with check (profesional_id = auth.uid() and estado = 'enviado' and public.cuenta_activa()
              and public.puede_ver_pedido(pedido_id)
              and exists (select 1 from public.pedidos p where p.id = pedido_id and p.estado = 'abierto'));

drop policy if exists "msj_alta" on public.mensajes;
create policy "msj_alta" on public.mensajes for insert to authenticated
  with check (autor_id = auth.uid() and public.cuenta_activa() and public.es_participante(pedido_id));

-- Cada uno puede borrar sus propias fotos (para borrar la cuenta)
drop policy if exists "fotos_borrar" on storage.objects;
create policy "fotos_borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);

-- =====================================================================
-- Borrar mi cuenta (Ley 25.326: derecho de supresión)
-- Borra el usuario y, en cascada, perfil, teléfono, pedidos, presupuestos,
-- mensajes y calificaciones. No se puede con trabajos en curso.
-- =====================================================================
create or replace function public.borrar_mi_cuenta()
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'No hay sesión'; end if;
  if exists (
    select 1 from pedidos p
    left join presupuestos pr on pr.id = p.presupuesto_elegido_id
    where p.estado = 'asignado' and (p.cliente_id = v_uid or pr.profesional_id = v_uid)
  ) then
    raise exception 'Tenés trabajos en curso. Terminalos o cancelalos antes de borrar la cuenta.';
  end if;
  delete from auth.users where id = v_uid;
end $$;
revoke all on function public.borrar_mi_cuenta() from public, anon;
grant execute on function public.borrar_mi_cuenta() to authenticated;

-- =====================================================================
-- Funciones del administrador (todas verifican es_admin)
-- =====================================================================

-- Indicadores generales
create or replace function public.admin_resumen()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.es_admin() then raise exception 'Sólo administradores'; end if;

  with primeras as (
    select p.id, p.creado_en, p.estado, p.rubro_id, p.zona,
           (select min(pr.creado_en) from presupuestos pr where pr.pedido_id = p.id) as primer_presu,
           (select count(*) from presupuestos pr where pr.pedido_id = p.id) as presus
    from pedidos p
  ),
  semanas as (
    select gs::date as semana
    from generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') gs
  )
  select jsonb_build_object(
    'usuarios', (select count(*) from perfiles),
    'clientes', (select count(*) from perfiles where rol = 'cliente'),
    'profesionales', (select count(*) from perfiles where rol = 'profesional'),
    'usuarios_7d', (select count(*) from perfiles where creado_en > now() - interval '7 days'),
    'suspendidos', (select count(*) from perfiles where suspendido),
    'pedidos', (select count(*) from pedidos),
    'pedidos_7d', (select count(*) from pedidos where creado_en > now() - interval '7 days'),
    'abiertos', (select count(*) from pedidos where estado = 'abierto'),
    'abiertos_sin_presu', (select count(*) from primeras where estado = 'abierto' and presus = 0),
    'presupuestos', (select count(*) from presupuestos),
    'presu_por_pedido', (select round(avg(presus)::numeric, 1) from primeras),
    -- Mediana de horas hasta el primer presupuesto
    'horas_primer_presu', (
      select round((percentile_cont(0.5) within group (
        order by extract(epoch from primer_presu - creado_en) / 3600))::numeric, 1)
      from primeras where primer_presu is not null),
    'con_presu_pct', (
      select round(100.0 * count(*) filter (where presus > 0) / nullif(count(*), 0))
      from primeras where creado_en < now() - interval '1 day'),
    -- % de pedidos (ya resueltos) que terminaron en un trabajo
    'conversion_pct', (
      select round(100.0 * count(*) filter (where estado in ('asignado','completado'))
                   / nullif(count(*) filter (where estado <> 'abierto'), 0))
      from pedidos),
    'completados', (select count(*) from pedidos where estado = 'completado'),
    'calificacion_prom', (select round(avg(puntaje)::numeric, 1) from calificaciones),
    'por_semana', (
      select jsonb_agg(jsonb_build_object(
               'semana', s.semana,
               'pedidos', (select count(*) from pedidos p where date_trunc('week', p.creado_en)::date = s.semana),
               'trabajos', (select count(*) from pedidos p where date_trunc('week', p.creado_en)::date = s.semana
                                                            and p.estado in ('asignado','completado')),
               'usuarios', (select count(*) from perfiles u where date_trunc('week', u.creado_en)::date = s.semana))
             order by s.semana)
      from semanas s),
    -- Oferta y demanda por rubro: dónde faltan profesionales
    'rubros', (
      select coalesce(jsonb_agg(x order by (x->>'sin_presu')::int desc, (x->>'pedidos')::int desc, x->>'rubro'), '[]'::jsonb) from (
        select jsonb_build_object(
          'rubro', ru.nombre, 'icono', ru.icono,
          'pedidos', count(pr.id),
          'sin_presu', count(pr.id) filter (where pr.presus = 0 and pr.estado in ('abierto','cancelado')),
          'profesionales', (select count(*) from profesional_rubros x join perfiles pe on pe.id = x.profesional_id
                            where x.rubro_id = ru.id and not pe.suspendido)) as x
        from rubros ru left join primeras pr on pr.rubro_id = ru.id
        group by ru.id, ru.nombre, ru.icono
      ) t),
    -- Barrios con pedidos que no recibieron presupuesto
    'zonas_sin_respuesta', (
      select coalesce(jsonb_agg(jsonb_build_object('zona', zona, 'pedidos', n) order by n desc), '[]'::jsonb)
      from (select zona, count(*) n from primeras
            where presus = 0 and estado in ('abierto','cancelado') and coalesce(zona,'') <> ''
            group by zona order by count(*) desc limit 8) z)
  ) into r;
  return r;
end $$;

-- Lista de usuarios (con email)
create or replace function public.admin_usuarios(p_buscar text default null)
returns table (
  id uuid, nombre text, email text, rol text, zona text, creado_en timestamptz,
  confirmado boolean, ultimo_ingreso timestamptz, suspendido boolean, es_admin boolean,
  pedidos bigint, presupuestos bigint, trabajos bigint, puntaje numeric
) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'Sólo administradores'; end if;
  return query
  select p.id, p.nombre, u.email::text, p.rol, p.zona, p.creado_en,
         u.email_confirmed_at is not null, u.last_sign_in_at, p.suspendido, p.es_admin,
         (select count(*) from pedidos x where x.cliente_id = p.id),
         (select count(*) from presupuestos x where x.profesional_id = p.id),
         (select count(*) from presupuestos x where x.profesional_id = p.id and x.estado = 'aceptado'),
         (select round(avg(c.puntaje)::numeric, 1) from calificaciones c where c.para_id = p.id)
  from perfiles p left join auth.users u on u.id = p.id
  where p_buscar is null or p_buscar = ''
     or p.nombre ilike '%' || p_buscar || '%' or u.email ilike '%' || p_buscar || '%'
     or p.zona ilike '%' || p_buscar || '%'
  order by p.creado_en desc
  limit 300;
end $$;

-- Lista de pedidos
create or replace function public.admin_pedidos(p_estado text default null)
returns table (
  id bigint, titulo text, descripcion text, zona text, estado text, urgencia text, creado_en timestamptz,
  rubro text, icono text, cliente_id uuid, cliente text, cliente_email text, presupuestos bigint
) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'Sólo administradores'; end if;
  return query
  select p.id, p.titulo, p.descripcion, p.zona, p.estado, p.urgencia, p.creado_en,
         r.nombre, r.icono, p.cliente_id, pe.nombre, u.email::text,
         (select count(*) from presupuestos x where x.pedido_id = p.id)
  from pedidos p
  join rubros r on r.id = p.rubro_id
  left join perfiles pe on pe.id = p.cliente_id
  left join auth.users u on u.id = p.cliente_id
  where p_estado is null or p_estado = '' or p.estado = p_estado
  order by p.creado_en desc
  limit 300;
end $$;

-- Suspender / reactivar. Al suspender se cancelan sus pedidos abiertos
-- y se retiran sus presupuestos sin responder.
create or replace function public.admin_suspender(p_usuario uuid, p_valor boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'Sólo administradores'; end if;
  if p_usuario = auth.uid() then raise exception 'No podés suspenderte a vos mismo'; end if;
  update perfiles set suspendido = p_valor where id = p_usuario;
  if p_valor then
    perform set_config('manitos.interno', '1', true);
    update pedidos set estado = 'cancelado' where cliente_id = p_usuario and estado = 'abierto';
    delete from presupuestos where profesional_id = p_usuario and estado = 'enviado';
  end if;
end $$;

-- Borrar un pedido (spam o falso). Borra también presupuestos, mensajes y dirección.
create or replace function public.admin_borrar_pedido(p_pedido bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'Sólo administradores'; end if;
  delete from pedidos where id = p_pedido;
end $$;

revoke all on function public.admin_resumen()                     from public, anon;
revoke all on function public.admin_usuarios(text)                from public, anon;
revoke all on function public.admin_pedidos(text)                 from public, anon;
revoke all on function public.admin_suspender(uuid, boolean)      from public, anon;
revoke all on function public.admin_borrar_pedido(bigint)         from public, anon;
grant execute on function public.admin_resumen()                  to authenticated;
grant execute on function public.admin_usuarios(text)             to authenticated;
grant execute on function public.admin_pedidos(text)              to authenticated;
grant execute on function public.admin_suspender(uuid, boolean)   to authenticated;
grant execute on function public.admin_borrar_pedido(bigint)      to authenticated;
grant execute on function public.es_admin()                       to authenticated;
grant execute on function public.cuenta_activa()                  to authenticated;

-- =====================================================================
-- Vos sos el administrador
-- =====================================================================
update public.perfiles set es_admin = true
where id = (select id from auth.users where lower(email) = 'ezerodriguez2712@gmail.com');

-- =====================================================================
-- Manitos · Migración 07: preguntas antes de presupuestar y profesional verificado
-- Requiere haber corrido la 06 (administrador).
-- Pegar TODO en Supabase → SQL Editor → Run. Se puede correr más de una vez.
-- =====================================================================

-- =====================================================================
-- 1) PREGUNTAS ANTES DE PRESUPUESTAR
-- El profesional consulta algo del pedido, el cliente responde.
-- Las preguntas y respuestas las ven todos los profesionales que ven el pedido
-- (así nadie pregunta lo mismo dos veces). No se permiten teléfonos.
-- =====================================================================
create table if not exists public.preguntas (
  id             bigserial primary key,
  pedido_id      bigint not null references public.pedidos(id) on delete cascade,
  profesional_id uuid   not null references public.perfiles(id) on delete cascade,
  texto          text   not null check (char_length(trim(texto)) between 3 and 300
                                         and texto !~ '[0-9][0-9 .()-]{6,}[0-9]'),
  respuesta      text            check (respuesta is null or (char_length(trim(respuesta)) between 1 and 500
                                         and respuesta !~ '[0-9][0-9 .()-]{6,}[0-9]')),
  creado_en      timestamptz not null default now(),
  respondido_en  timestamptz
);
create index if not exists preguntas_pedido_idx on public.preguntas (pedido_id, creado_en);
alter table public.preguntas enable row level security;

drop policy if exists "preg_ver" on public.preguntas;
create policy "preg_ver" on public.preguntas for select to authenticated
  using (public.es_cliente_del_pedido(pedido_id) or public.puede_ver_pedido(pedido_id));

drop policy if exists "preg_alta" on public.preguntas;
create policy "preg_alta" on public.preguntas for insert to authenticated
  with check (profesional_id = auth.uid() and respuesta is null and respondido_en is null
              and public.cuenta_activa() and public.puede_ver_pedido(pedido_id)
              and not public.es_cliente_del_pedido(pedido_id)
              and exists (select 1 from public.pedidos p where p.id = pedido_id and p.estado = 'abierto')
              -- hasta 3 preguntas por profesional y pedido
              and (select count(*) from public.preguntas x
                   where x.pedido_id = preguntas.pedido_id and x.profesional_id = auth.uid()) < 3);

-- Sólo el cliente responde (y puede corregir su respuesta)
drop policy if exists "preg_responder" on public.preguntas;
create policy "preg_responder" on public.preguntas for update to authenticated
  using (public.es_cliente_del_pedido(pedido_id) and public.cuenta_activa())
  with check (public.es_cliente_del_pedido(pedido_id));

-- El profesional puede borrar su pregunta mientras no tenga respuesta
drop policy if exists "preg_borrar" on public.preguntas;
create policy "preg_borrar" on public.preguntas for delete to authenticated
  using (profesional_id = auth.uid() and respuesta is null);

-- Al responder sólo cambian respuesta y fecha
create or replace function public.validar_pregunta()
returns trigger language plpgsql as $$
begin
  if new.pedido_id <> old.pedido_id or new.profesional_id <> old.profesional_id
     or new.texto <> old.texto or new.creado_en <> old.creado_en then
    raise exception 'Cambio no permitido';
  end if;
  new.respuesta := nullif(trim(new.respuesta), '');
  new.respondido_en := case when new.respuesta is null then null else now() end;
  return new;
end $$;
drop trigger if exists preguntas_validar on public.preguntas;
create trigger preguntas_validar before update on public.preguntas
  for each row execute function public.validar_pregunta();

-- Avisos en la app: ahora incluyen preguntas nuevas (cliente) y respondidas (profesional)
create or replace function public.mis_avisos()
returns table (pedido_id bigint, novedades int, mensajes int)
language sql security definer stable set search_path = public as $$
  with mios as (
    select p.id, coalesce(l.visto_en, 'epoch'::timestamptz) as visto
    from pedidos p left join lecturas l on l.pedido_id = p.id and l.perfil_id = auth.uid()
    where p.cliente_id = auth.uid()
    union
    select pr.pedido_id, coalesce(l.visto_en, 'epoch'::timestamptz)
    from presupuestos pr left join lecturas l on l.pedido_id = pr.pedido_id and l.perfil_id = auth.uid()
    where pr.profesional_id = auth.uid()
    union
    select pg.pedido_id, coalesce(l.visto_en, 'epoch'::timestamptz)
    from preguntas pg left join lecturas l on l.pedido_id = pg.pedido_id and l.perfil_id = auth.uid()
    where pg.profesional_id = auth.uid()
  )
  select m.id,
    (case when exists (select 1 from pedidos p where p.id = m.id and p.cliente_id = auth.uid())
          then (select count(*) from presupuestos x where x.pedido_id = m.id and x.creado_en > m.visto)
             + (select count(*) from preguntas q where q.pedido_id = m.id and q.respuesta is null and q.creado_en > m.visto)
          else (select count(*) from presupuestos x where x.pedido_id = m.id and x.profesional_id = auth.uid()
                  and x.respondido_en > m.visto)
             + (select count(*) from preguntas q where q.pedido_id = m.id and q.profesional_id = auth.uid()
                  and q.respondido_en > m.visto)
     end)::int,
    (select count(*) from mensajes ms
      where ms.pedido_id = m.id and ms.autor_id <> auth.uid() and ms.creado_en > m.visto
        and public.es_participante(m.id))::int
  from mios m;
$$;

-- Mails: pregunta nueva → cliente, respuesta → profesional
create or replace function privado.trg_pregunta() returns trigger
language plpgsql security definer set search_path = public, privado as $$
begin
  if tg_op = 'INSERT' then
    perform privado.disparar_aviso('pregunta', new.id);
  elsif old.respuesta is null and new.respuesta is not null then
    perform privado.disparar_aviso('respuesta', new.id);
  end if;
  return new;
end $$;
drop trigger if exists aviso_pregunta on public.preguntas;
create trigger aviso_pregunta after insert or update on public.preguntas
  for each row execute function privado.trg_pregunta();

-- =====================================================================
-- 2) PROFESIONAL VERIFICADO
-- El profesional sube foto del DNI (y matrícula si tiene). Los archivos van a
-- un depósito PRIVADO: sólo los ven él y los administradores.
-- =====================================================================
alter table public.perfiles add column if not exists verificado boolean not null default false;
alter table public.perfiles add column if not exists matriculado boolean not null default false;

-- Nadie puede marcarse verificado a sí mismo
create or replace function public.proteger_perfil()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and not public.es_admin() then
    new.es_admin := old.es_admin;
    new.suspendido := old.suspendido;
    new.verificado := old.verificado;
    new.matriculado := old.matriculado;
  end if;
  return new;
end $$;

create table if not exists public.verificaciones (
  perfil_id   uuid primary key references public.perfiles(id) on delete cascade,
  estado      text not null default 'pendiente' check (estado in ('pendiente','aprobada','rechazada')),
  dni_frente  text not null,
  dni_dorso   text not null,
  matricula_foto text,
  matricula   text,
  nota        text,              -- motivo si se rechaza
  enviado_en  timestamptz not null default now(),
  revisado_en timestamptz,
  revision    bigint unique      -- número de revisión (para el mail de aviso)
);
create sequence if not exists public.verificaciones_revision_seq;
alter table public.verificaciones enable row level security;

drop policy if exists "verif_ver" on public.verificaciones;
create policy "verif_ver" on public.verificaciones for select to authenticated
  using (perfil_id = auth.uid() or public.es_admin());

-- El profesional envía (o reenvía) su pedido de verificación: siempre queda pendiente
drop policy if exists "verif_alta" on public.verificaciones;
create policy "verif_alta" on public.verificaciones for insert to authenticated
  with check (perfil_id = auth.uid() and estado = 'pendiente' and nota is null and revisado_en is null
              and exists (select 1 from public.perfiles where id = auth.uid() and rol = 'profesional'));
drop policy if exists "verif_editar" on public.verificaciones;
create policy "verif_editar" on public.verificaciones for update to authenticated
  using (perfil_id = auth.uid() and estado <> 'aprobada')
  with check (perfil_id = auth.uid() and estado = 'pendiente' and nota is null and revisado_en is null);

-- Sólo el administrador puede tocar el número de revisión
create or replace function public.proteger_verificacion()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and not public.es_admin() then
    new.revision := case when tg_op = 'INSERT' then null else old.revision end;
  end if;
  return new;
end $$;
drop trigger if exists verificaciones_proteger on public.verificaciones;
create trigger verificaciones_proteger before insert or update on public.verificaciones
  for each row execute function public.proteger_verificacion();

-- Depósito privado de documentos
insert into storage.buckets (id, name, public) values ('documentos', 'documentos', false)
on conflict (id) do update set public = false;

drop policy if exists "docs_subir" on storage.objects;
create policy "docs_subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "docs_ver" on storage.objects;
create policy "docs_ver" on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and ((storage.foldername(name))[1] = auth.uid()::text or public.es_admin()));
drop policy if exists "docs_borrar" on storage.objects;
create policy "docs_borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'documentos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Lista para el administrador
create or replace function public.admin_verificaciones(p_estado text default 'pendiente')
returns table (
  perfil_id uuid, nombre text, email text, zona text, rubros text, estado text,
  dni_frente text, dni_dorso text, matricula_foto text, matricula text, nota text,
  enviado_en timestamptz, revisado_en timestamptz
) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'Sólo administradores'; end if;
  return query
  select v.perfil_id, p.nombre, u.email::text, p.zona,
         (select string_agg(r.nombre, ', ' order by r.nombre) from profesional_rubros x join rubros r on r.id = x.rubro_id
          where x.profesional_id = v.perfil_id),
         v.estado, v.dni_frente, v.dni_dorso, v.matricula_foto, v.matricula, v.nota, v.enviado_en, v.revisado_en
  from verificaciones v
  join perfiles p on p.id = v.perfil_id
  left join auth.users u on u.id = v.perfil_id
  where p_estado is null or p_estado = '' or v.estado = p_estado
  order by v.enviado_en;
end $$;

-- Aprobar o rechazar
create or replace function public.admin_revisar_verificacion(p_perfil uuid, p_aprobar boolean,
                                                             p_matriculado boolean default false, p_nota text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'Sólo administradores'; end if;
  if not p_aprobar and coalesce(trim(p_nota), '') = '' then
    raise exception 'Escribí el motivo del rechazo para que el profesional sepa qué corregir';
  end if;
  update verificaciones
     set estado = case when p_aprobar then 'aprobada' else 'rechazada' end,
         nota = case when p_aprobar then null else trim(p_nota) end,
         revisado_en = now(),
         revision = nextval('public.verificaciones_revision_seq')
   where perfil_id = p_perfil;
  if not found then raise exception 'No hay pedido de verificación'; end if;
  update perfiles set verificado = p_aprobar, matriculado = p_aprobar and p_matriculado where id = p_perfil;
end $$;

-- Mail al profesional cuando se revisa su verificación
create or replace function privado.trg_verificacion() returns trigger
language plpgsql security definer set search_path = public, privado as $$
begin
  if new.revision is not null and new.revision is distinct from old.revision then
    perform privado.disparar_aviso('verificacion', new.revision);
  end if;
  return new;
end $$;
drop trigger if exists aviso_verificacion on public.verificaciones;
create trigger aviso_verificacion after update on public.verificaciones
  for each row execute function privado.trg_verificacion();

revoke all on function public.admin_verificaciones(text) from public, anon;
revoke all on function public.admin_revisar_verificacion(uuid, boolean, boolean, text) from public, anon;
grant execute on function public.admin_verificaciones(text) to authenticated;
grant execute on function public.admin_revisar_verificacion(uuid, boolean, boolean, text) to authenticated;

-- Indicadores: profesionales verificados y pendientes
create or replace function public.admin_pendientes()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'Sólo administradores'; end if;
  return jsonb_build_object(
    'verificaciones', (select count(*) from verificaciones where estado = 'pendiente'),
    'verificados', (select count(*) from perfiles where verificado));
end $$;
revoke all on function public.admin_pendientes() from public, anon;
grant execute on function public.admin_pendientes() to authenticated;

-- =====================================================================
-- Manitos · Migración 08: límites contra el abuso, editar pedido,
-- vencimiento a los 15 días y recordatorios.
-- Requiere la 06 y la 07. Pegar TODO en Supabase → SQL Editor → Run.
-- Se puede correr más de una vez.
-- =====================================================================

-- ---------- Nuevo estado: vencido ----------
alter table public.pedidos drop constraint if exists pedidos_estado_check;
alter table public.pedidos add constraint pedidos_estado_check
  check (estado in ('abierto','asignado','completado','cancelado','vencido'));

alter table public.pedidos add column if not exists editado_en   timestamptz;
alter table public.pedidos add column if not exists recordado_en timestamptz;
alter table public.pedidos add column if not exists vence_en     timestamptz;
update public.pedidos set vence_en = creado_en + interval '15 days' where vence_en is null;
alter table public.pedidos alter column vence_en set default now() + interval '15 days';

-- ---------- Reglas de cambio del pedido ----------
-- El cliente puede editar título, descripción, urgencia y fotos mientras está abierto.
-- No puede cambiar rubro ni barrio (cambiaría quién lo ve).
create or replace function public.validar_cambio_pedido()
returns trigger language plpgsql as $$
begin
  -- Procesos internos, la app con clave de servicio y el SQL Editor (sin usuario) pueden todo
  if current_setting('manitos.interno', true) = '1' or auth.uid() is null then return new; end if;
  if new.cliente_id <> old.cliente_id or new.presupuesto_elegido_id is distinct from old.presupuesto_elegido_id
     or new.rubro_id <> old.rubro_id or new.zona <> old.zona or new.creado_en <> old.creado_en
     or new.vence_en is distinct from old.vence_en or new.recordado_en is distinct from old.recordado_en then
    raise exception 'Cambio no permitido';
  end if;
  if new.estado <> old.estado and not (
       (old.estado = 'abierto'  and new.estado = 'cancelado') or
       (old.estado = 'asignado' and new.estado in ('completado','cancelado'))
     ) then
    raise exception 'No se puede pasar el pedido de % a %', old.estado, new.estado;
  end if;
  if (new.titulo, new.descripcion, new.urgencia, new.fotos) is distinct from
     (old.titulo, old.descripcion, old.urgencia, old.fotos) then
    if old.estado <> 'abierto' then
      raise exception 'Sólo se puede editar un pedido mientras recibe presupuestos';
    end if;
    new.editado_en := now();
  else
    new.editado_en := old.editado_en;
  end if;
  return new;
end $$;

-- ---------- Límites contra el abuso ----------
-- Un solo control para todas las tablas (usa el nombre de la tabla del trigger)
drop function if exists public.limitar(text);
create or replace function public.trg_limite()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); n int;
begin
  if v_uid is null or public.es_admin() then return new; end if;  -- procesos internos y admins
  if tg_table_name = 'pedidos' then
    select count(*) into n from pedidos where cliente_id = v_uid and creado_en > now() - interval '24 hours';
    if n >= 5 then raise exception 'Llegaste al máximo de 5 pedidos por día. Probá de nuevo mañana.'; end if;
    select count(*) into n from pedidos where cliente_id = v_uid and estado = 'abierto';
    if n >= 10 then raise exception 'Tenés 10 pedidos abiertos. Cancelá alguno antes de publicar otro.'; end if;
  elsif tg_table_name = 'presupuestos' then
    select count(*) into n from presupuestos where profesional_id = v_uid and creado_en > now() - interval '24 hours';
    if n >= 40 then raise exception 'Llegaste al máximo de 40 presupuestos por día.'; end if;
  elsif tg_table_name = 'preguntas' then
    select count(*) into n from preguntas where profesional_id = v_uid and creado_en > now() - interval '24 hours';
    if n >= 30 then raise exception 'Llegaste al máximo de 30 preguntas por día.'; end if;
  elsif tg_table_name = 'mensajes' then
    select count(*) into n from mensajes where autor_id = v_uid and creado_en > now() - interval '1 hour';
    if n >= 120 then raise exception 'Estás mandando demasiados mensajes. Esperá un rato.'; end if;
  end if;
  return new;
end $$;

drop trigger if exists limite on public.pedidos;
create trigger limite before insert on public.pedidos for each row execute function public.trg_limite();
drop trigger if exists limite on public.presupuestos;
create trigger limite before insert on public.presupuestos for each row execute function public.trg_limite();
drop trigger if exists limite on public.preguntas;
create trigger limite before insert on public.preguntas for each row execute function public.trg_limite();
drop trigger if exists limite on public.mensajes;
create trigger limite before insert on public.mensajes for each row execute function public.trg_limite();

-- ---------- Volver a publicar un pedido vencido o cancelado ----------
-- Crea una copia nueva (con la misma dirección) y devuelve su número.
create or replace function public.republicar_pedido(p_pedido bigint)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_nuevo bigint; v public.pedidos;
begin
  select * into v from pedidos where id = p_pedido and cliente_id = auth.uid();
  if v.id is null then raise exception 'Pedido inexistente'; end if;
  if v.estado not in ('vencido','cancelado') then raise exception 'Este pedido sigue activo'; end if;
  if not public.cuenta_activa() then raise exception 'Tu cuenta está suspendida'; end if;
  insert into pedidos (cliente_id, rubro_id, titulo, descripcion, zona, urgencia, fotos)
  values (v.cliente_id, v.rubro_id, v.titulo, v.descripcion, v.zona, v.urgencia, v.fotos)
  returning id into v_nuevo;
  insert into pedido_direcciones (pedido_id, direccion, lat, lng, tipo, piso, depto, barrio_cerrado, manzana, lote, referencias)
  select v_nuevo, d.direccion, d.lat, d.lng, d.tipo, d.piso, d.depto, d.barrio_cerrado, d.manzana, d.lote, d.referencias
  from pedido_direcciones d where d.pedido_id = p_pedido;
  return v_nuevo;
end $$;
revoke all on function public.republicar_pedido(bigint) from public, anon;
grant execute on function public.republicar_pedido(bigint) to authenticated;

-- ---------- Tareas diarias (las llama la app una vez por día) ----------
-- Vence los pedidos abiertos que pasaron los 15 días. Devuelve los vencidos.
create or replace function public.tarea_vencer_pedidos()
returns setof bigint language plpgsql security definer set search_path = public as $$
begin
  perform set_config('manitos.interno', '1', true);
  return query
  update pedidos set estado = 'vencido'
  where estado = 'abierto' and vence_en < now()
  returning id;
end $$;

-- Pedidos con presupuestos esperando hace más de 2 días (un solo recordatorio por pedido)
create or replace function public.tarea_recordatorios()
returns table (pedido_id bigint, cliente_id uuid, titulo text, presupuestos bigint, vence_en timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('manitos.interno', '1', true);
  return query
  with candidatos as (
    select p.id from pedidos p
    where p.estado = 'abierto' and p.recordado_en is null
      and p.creado_en < now() - interval '2 days'
      and exists (select 1 from presupuestos x where x.pedido_id = p.id and x.creado_en < now() - interval '1 day')
    limit 100
  ), marcados as (
    update pedidos p set recordado_en = now() from candidatos c where p.id = c.id
    returning p.id, p.cliente_id, p.titulo, p.vence_en
  )
  select m.id, m.cliente_id, m.titulo,
         (select count(*) from presupuestos x where x.pedido_id = m.id), m.vence_en
  from marcados m;
end $$;

revoke all on function public.tarea_vencer_pedidos() from public, anon, authenticated;
revoke all on function public.tarea_recordatorios()  from public, anon, authenticated;
grant execute on function public.tarea_vencer_pedidos() to service_role;
grant execute on function public.tarea_recordatorios()  to service_role;

-- ---------- Indicadores: los vencidos cuentan como "sin respuesta" ----------
-- (en la conversión ya cuentan como no convertidos porque no están asignados ni completados)
create or replace function public.admin_resumen()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.es_admin() then raise exception 'Sólo administradores'; end if;

  with primeras as (
    select p.id, p.creado_en, p.estado, p.rubro_id, p.zona,
           (select min(pr.creado_en) from presupuestos pr where pr.pedido_id = p.id) as primer_presu,
           (select count(*) from presupuestos pr where pr.pedido_id = p.id) as presus
    from pedidos p
  ),
  semanas as (
    select gs::date as semana
    from generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') gs
  )
  select jsonb_build_object(
    'usuarios', (select count(*) from perfiles),
    'clientes', (select count(*) from perfiles where rol = 'cliente'),
    'profesionales', (select count(*) from perfiles where rol = 'profesional'),
    'usuarios_7d', (select count(*) from perfiles where creado_en > now() - interval '7 days'),
    'suspendidos', (select count(*) from perfiles where suspendido),
    'pedidos', (select count(*) from pedidos),
    'pedidos_7d', (select count(*) from pedidos where creado_en > now() - interval '7 days'),
    'abiertos', (select count(*) from pedidos where estado = 'abierto'),
    'abiertos_sin_presu', (select count(*) from primeras where estado = 'abierto' and presus = 0),
    'presupuestos', (select count(*) from presupuestos),
    'presu_por_pedido', (select round(avg(presus)::numeric, 1) from primeras),
    -- Mediana de horas hasta el primer presupuesto
    'horas_primer_presu', (
      select round((percentile_cont(0.5) within group (
        order by extract(epoch from primer_presu - creado_en) / 3600))::numeric, 1)
      from primeras where primer_presu is not null),
    'con_presu_pct', (
      select round(100.0 * count(*) filter (where presus > 0) / nullif(count(*), 0))
      from primeras where creado_en < now() - interval '1 day'),
    -- % de pedidos (ya resueltos) que terminaron en un trabajo
    'conversion_pct', (
      select round(100.0 * count(*) filter (where estado in ('asignado','completado'))
                   / nullif(count(*) filter (where estado <> 'abierto'), 0))
      from pedidos),
    'completados', (select count(*) from pedidos where estado = 'completado'),
    'calificacion_prom', (select round(avg(puntaje)::numeric, 1) from calificaciones),
    'por_semana', (
      select jsonb_agg(jsonb_build_object(
               'semana', s.semana,
               'pedidos', (select count(*) from pedidos p where date_trunc('week', p.creado_en)::date = s.semana),
               'trabajos', (select count(*) from pedidos p where date_trunc('week', p.creado_en)::date = s.semana
                                                            and p.estado in ('asignado','completado')),
               'usuarios', (select count(*) from perfiles u where date_trunc('week', u.creado_en)::date = s.semana))
             order by s.semana)
      from semanas s),
    -- Oferta y demanda por rubro: dónde faltan profesionales
    'rubros', (
      select coalesce(jsonb_agg(x order by (x->>'sin_presu')::int desc, (x->>'pedidos')::int desc, x->>'rubro'), '[]'::jsonb) from (
        select jsonb_build_object(
          'rubro', ru.nombre, 'icono', ru.icono,
          'pedidos', count(pr.id),
          'sin_presu', count(pr.id) filter (where pr.presus = 0 and pr.estado in ('abierto','cancelado','vencido')),
          'profesionales', (select count(*) from profesional_rubros x join perfiles pe on pe.id = x.profesional_id
                            where x.rubro_id = ru.id and not pe.suspendido)) as x
        from rubros ru left join primeras pr on pr.rubro_id = ru.id
        group by ru.id, ru.nombre, ru.icono
      ) t),
    -- Barrios con pedidos que no recibieron presupuesto
    'zonas_sin_respuesta', (
      select coalesce(jsonb_agg(jsonb_build_object('zona', zona, 'pedidos', n) order by n desc), '[]'::jsonb)
      from (select zona, count(*) n from primeras
            where presus = 0 and estado in ('abierto','cancelado','vencido') and coalesce(zona,'') <> ''
            group by zona order by count(*) desc limit 8) z)
  ) into r;
  return r;
end $$;

-- =====================================================================
-- Manitos · Migración 09: el profesional marca el trabajo terminado,
-- fotos de trabajos anteriores y tiempo de respuesta.
-- Requiere la 08. Pegar TODO en Supabase → SQL Editor → Run. Se puede correr más de una vez.
-- =====================================================================

-- =====================================================================
-- 1) EL PROFESIONAL MARCA EL TRABAJO COMO TERMINADO
-- El cliente confirma (o avisa si falta algo). Si no responde en 3 días,
-- se da por terminado solo y los dos se pueden calificar.
-- =====================================================================
alter table public.pedidos add column if not exists terminado_pro_en timestamptz;

create or replace function public.validar_cambio_pedido()
returns trigger language plpgsql as $$
begin
  -- Procesos internos, la app con clave de servicio y el SQL Editor (sin usuario) pueden todo
  if current_setting('manitos.interno', true) = '1' or auth.uid() is null then return new; end if;
  if new.cliente_id <> old.cliente_id or new.presupuesto_elegido_id is distinct from old.presupuesto_elegido_id
     or new.rubro_id <> old.rubro_id or new.zona <> old.zona or new.creado_en <> old.creado_en
     or new.vence_en is distinct from old.vence_en or new.recordado_en is distinct from old.recordado_en
     or new.terminado_pro_en is distinct from old.terminado_pro_en then
    raise exception 'Cambio no permitido';
  end if;
  if new.estado <> old.estado and not (
       (old.estado = 'abierto'  and new.estado = 'cancelado') or
       (old.estado = 'asignado' and new.estado in ('completado','cancelado'))
     ) then
    raise exception 'No se puede pasar el pedido de % a %', old.estado, new.estado;
  end if;
  if (new.titulo, new.descripcion, new.urgencia, new.fotos) is distinct from
     (old.titulo, old.descripcion, old.urgencia, old.fotos) then
    if old.estado <> 'abierto' then
      raise exception 'Sólo se puede editar un pedido mientras recibe presupuestos';
    end if;
    new.editado_en := now();
  else
    new.editado_en := old.editado_en;
  end if;
  return new;
end $$;

create or replace function public.profesional_termina(p_pedido bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from pedidos p join presupuestos pr on pr.id = p.presupuesto_elegido_id
    where p.id = p_pedido and p.estado = 'asignado' and pr.profesional_id = auth.uid()
  ) then
    raise exception 'Sólo el profesional elegido puede marcar el trabajo como terminado';
  end if;
  perform set_config('manitos.interno', '1', true);
  update pedidos set terminado_pro_en = now() where id = p_pedido and terminado_pro_en is null;
end $$;
revoke all on function public.profesional_termina(bigint) from public, anon;
grant execute on function public.profesional_termina(bigint) to authenticated;

-- El cliente dice que todavía falta algo: se borra la marca y sigue en curso
create or replace function public.cliente_falta_algo(p_pedido bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from pedidos where id = p_pedido and cliente_id = auth.uid() and estado = 'asignado') then
    raise exception 'No podés cambiar este pedido';
  end if;
  perform set_config('manitos.interno', '1', true);
  update pedidos set terminado_pro_en = null where id = p_pedido;
end $$;
revoke all on function public.cliente_falta_algo(bigint) from public, anon;
grant execute on function public.cliente_falta_algo(bigint) to authenticated;

-- Mail al cliente cuando el profesional marca terminado
create or replace function privado.trg_terminado_pro() returns trigger
language plpgsql security definer set search_path = public, privado as $$
begin
  if old.terminado_pro_en is null and new.terminado_pro_en is not null and new.estado = 'asignado' then
    perform privado.disparar_aviso('terminado', new.id);
  end if;
  return new;
end $$;
drop trigger if exists aviso_terminado_pro on public.pedidos;
create trigger aviso_terminado_pro after update on public.pedidos
  for each row execute function privado.trg_terminado_pro();

-- Tarea diaria: completa los trabajos marcados terminados hace más de 3 días
create or replace function public.tarea_autocompletar()
returns setof bigint language plpgsql security definer set search_path = public as $$
begin
  perform set_config('manitos.interno', '1', true);
  return query
  update pedidos set estado = 'completado'
  where estado = 'asignado' and terminado_pro_en < now() - interval '3 days'
  returning id;
end $$;
revoke all on function public.tarea_autocompletar() from public, anon, authenticated;
grant execute on function public.tarea_autocompletar() to service_role;

-- Avisos en la app: el cliente ve como novedad que el profesional terminó
create or replace function public.mis_avisos()
returns table (pedido_id bigint, novedades int, mensajes int)
language sql security definer stable set search_path = public as $$
  with mios as (
    select p.id, coalesce(l.visto_en, 'epoch'::timestamptz) as visto
    from pedidos p left join lecturas l on l.pedido_id = p.id and l.perfil_id = auth.uid()
    where p.cliente_id = auth.uid()
    union
    select pr.pedido_id, coalesce(l.visto_en, 'epoch'::timestamptz)
    from presupuestos pr left join lecturas l on l.pedido_id = pr.pedido_id and l.perfil_id = auth.uid()
    where pr.profesional_id = auth.uid()
    union
    select pg.pedido_id, coalesce(l.visto_en, 'epoch'::timestamptz)
    from preguntas pg left join lecturas l on l.pedido_id = pg.pedido_id and l.perfil_id = auth.uid()
    where pg.profesional_id = auth.uid()
  )
  select m.id,
    (case when exists (select 1 from pedidos p where p.id = m.id and p.cliente_id = auth.uid())
          then (select count(*) from presupuestos x where x.pedido_id = m.id and x.creado_en > m.visto)
             + (select count(*) from preguntas q where q.pedido_id = m.id and q.respuesta is null and q.creado_en > m.visto)
             + (select count(*) from pedidos p where p.id = m.id and p.estado = 'asignado' and p.terminado_pro_en > m.visto)
          else (select count(*) from presupuestos x where x.pedido_id = m.id and x.profesional_id = auth.uid()
                  and x.respondido_en > m.visto)
             + (select count(*) from preguntas q where q.pedido_id = m.id and q.profesional_id = auth.uid()
                  and q.respondido_en > m.visto)
     end)::int,
    (select count(*) from mensajes ms
      where ms.pedido_id = m.id and ms.autor_id <> auth.uid() and ms.creado_en > m.visto
        and public.es_participante(m.id))::int
  from mios m;
$$;

-- =====================================================================
-- 2) FOTOS DE TRABAJOS ANTERIORES (vidriera del profesional)
-- Se guardan en el depósito público "fotos", en la carpeta del profesional.
-- =====================================================================
create table if not exists public.trabajos_fotos (
  id             bigserial primary key,
  profesional_id uuid not null references public.perfiles(id) on delete cascade,
  ruta           text not null,
  descripcion    text check (descripcion is null or char_length(descripcion) <= 120),
  creado_en      timestamptz not null default now()
);
create index if not exists trabajos_fotos_pro_idx on public.trabajos_fotos (profesional_id, creado_en desc);
alter table public.trabajos_fotos enable row level security;

drop policy if exists "tf_ver" on public.trabajos_fotos;
create policy "tf_ver" on public.trabajos_fotos for select using (true);
drop policy if exists "tf_alta" on public.trabajos_fotos;
create policy "tf_alta" on public.trabajos_fotos for insert to authenticated
  with check (profesional_id = auth.uid() and public.cuenta_activa()
              and split_part(ruta, '/', 1) = auth.uid()::text
              and exists (select 1 from public.perfiles where id = auth.uid() and rol = 'profesional')
              and (select count(*) from public.trabajos_fotos x where x.profesional_id = auth.uid()) < 12);
drop policy if exists "tf_editar" on public.trabajos_fotos;
create policy "tf_editar" on public.trabajos_fotos for update to authenticated
  using (profesional_id = auth.uid()) with check (profesional_id = auth.uid() and split_part(ruta, '/', 1) = auth.uid()::text);
drop policy if exists "tf_borrar" on public.trabajos_fotos;
create policy "tf_borrar" on public.trabajos_fotos for delete to authenticated using (profesional_id = auth.uid());
grant select on public.trabajos_fotos to anon, authenticated;

-- =====================================================================
-- 3) TIEMPO DE RESPUESTA DEL PROFESIONAL
-- Mediana de horas entre que se publica un pedido y que manda presupuesto
-- (últimos 6 meses, con al menos 2 presupuestos). Sólo expone el resumen.
-- =====================================================================
create or replace view public.respuesta as
  select pr.profesional_id as perfil_id,
         round((percentile_cont(0.5) within group (
           order by extract(epoch from pr.creado_en - p.creado_en) / 3600))::numeric, 1) as horas,
         count(*)::int as cantidad
  from public.presupuestos pr join public.pedidos p on p.id = pr.pedido_id
  where pr.creado_en > now() - interval '180 days'
  group by pr.profesional_id
  having count(*) >= 2;
grant select on public.respuesta to anon, authenticated;

-- =====================================================================
-- Manitos · Migración 10: notificaciones push en el celular
-- Requiere la 09. Pegar TODO en Supabase → SQL Editor → Run. Se puede correr más de una vez.
-- =====================================================================

alter table public.perfiles add column if not exists avisos_push boolean not null default true;

-- Cada celular o navegador donde el usuario activó las notificaciones
create table if not exists public.suscripciones_push (
  id         bigserial primary key,
  perfil_id  uuid not null references public.perfiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  dispositivo text,
  creado_en  timestamptz not null default now()
);
create index if not exists suscripciones_push_perfil_idx on public.suscripciones_push (perfil_id);
alter table public.suscripciones_push enable row level security;

drop policy if exists "push_ver" on public.suscripciones_push;
create policy "push_ver" on public.suscripciones_push for select to authenticated using (perfil_id = auth.uid());
drop policy if exists "push_alta" on public.suscripciones_push;
create policy "push_alta" on public.suscripciones_push for insert to authenticated with check (perfil_id = auth.uid());
drop policy if exists "push_editar" on public.suscripciones_push;
create policy "push_editar" on public.suscripciones_push for update to authenticated
  using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());
drop policy if exists "push_borrar" on public.suscripciones_push;
create policy "push_borrar" on public.suscripciones_push for delete to authenticated using (perfil_id = auth.uid());

-- Si el mismo celular ya estaba registrado a otra cuenta (cambió de usuario), pasa a la nueva
create or replace function public.registrar_push(p_endpoint text, p_p256dh text, p_auth text, p_dispositivo text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'No hay sesión'; end if;
  insert into suscripciones_push (perfil_id, endpoint, p256dh, auth, dispositivo)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_dispositivo, 120))
  on conflict (endpoint) do update
    set perfil_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth,
        dispositivo = excluded.dispositivo, creado_en = now();
end $$;
revoke all on function public.registrar_push(text, text, text, text) from public, anon;
grant execute on function public.registrar_push(text, text, text, text) to authenticated;

-- Mensajes del chat: aviso push al otro participante (no manda mail)
create or replace function privado.trg_mensaje() returns trigger
language plpgsql security definer set search_path = public, privado as $$
begin perform privado.disparar_aviso('mensaje', new.id); return new; end $$;
drop trigger if exists aviso_mensaje on public.mensajes;
create trigger aviso_mensaje after insert on public.mensajes
  for each row execute function privado.trg_mensaje();

-- Los avisos de mensajes son muchos: se borran los registros de más de 30 días
create or replace function public.tarea_limpiar_avisos()
returns int language sql security definer set search_path = public as $$
  with b as (delete from avisos_enviados where tipo = 'mensaje' and enviado_en < now() - interval '30 days' returning 1)
  select count(*)::int from b;
$$;
revoke all on function public.tarea_limpiar_avisos() from public, anon, authenticated;
grant execute on function public.tarea_limpiar_avisos() to service_role;

-- =====================================================================
-- Manitos · Migración 11: el chat se cierra cuando el trabajo termina o se cancela
-- (los mensajes anteriores se pueden seguir leyendo). Requiere la 06.
-- Pegar TODO en Supabase → SQL Editor → Run. Se puede correr más de una vez.
-- =====================================================================
drop policy if exists "msj_alta" on public.mensajes;
create policy "msj_alta" on public.mensajes for insert to authenticated
  with check (autor_id = auth.uid() and public.cuenta_activa() and public.es_participante(pedido_id)
              and exists (select 1 from public.pedidos p where p.id = pedido_id and p.estado = 'asignado'));

-- =====================================================================
-- Manitos · Migración 12: plan Gratis + Pro (suscripción con MercadoPago)
-- Queda APAGADO: nadie paga nada hasta que actives el cobro desde
-- Panel de administrador → Cobros. Requiere la 06 a la 11.
-- Pegar TODO en Supabase → SQL Editor → Run. Se puede correr más de una vez.
-- =====================================================================

-- ---------- Ajustes generales (una sola fila) ----------
create table if not exists public.ajustes (
  id                  int primary key default 1 check (id = 1),
  cobro_activo        boolean not null default false,  -- apagado: todo gratis y sin límites
  presupuestos_gratis int     not null default 5 check (presupuestos_gratis >= 0),
  precio_pro          numeric(12,2) check (precio_pro is null or precio_pro > 0),
  dias_prueba         int     not null default 30 check (dias_prueba between 0 and 90),
  actualizado_en      timestamptz not null default now()
);
insert into public.ajustes (id) values (1) on conflict (id) do nothing;
alter table public.ajustes enable row level security;
drop policy if exists "ajustes_ver" on public.ajustes;
create policy "ajustes_ver" on public.ajustes for select using (true);  -- precio y reglas son públicos
grant select on public.ajustes to anon, authenticated;

-- ---------- Suscripciones de los profesionales ----------
create table if not exists public.suscripciones (
  perfil_id        uuid primary key references public.perfiles(id) on delete cascade,
  estado           text not null default 'prueba'
                   check (estado in ('prueba','pendiente','activa','pausada','cancelada')),
  prueba_hasta     timestamptz,
  mp_preapproval_id text unique,
  monto            numeric(12,2),
  proximo_cobro    timestamptz,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now()
);
alter table public.suscripciones enable row level security;
drop policy if exists "susc_ver" on public.suscripciones;
create policy "susc_ver" on public.suscripciones for select to authenticated
  using (perfil_id = auth.uid() or public.es_admin());
-- (sin políticas de alta/edición: sólo la cambian las funciones de abajo y el servidor)

-- ¿Este profesional tiene Pro vigente? (suscripción activa o prueba sin vencer)
create or replace function public.es_pro(p_perfil uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from suscripciones s
    where s.perfil_id = p_perfil
      and (s.estado = 'activa' or (s.prueba_hasta is not null and s.prueba_hasta > now()))
  )
$$;
grant execute on function public.es_pro(uuid) to authenticated, anon;

-- Presupuestos enviados en el mes calendario (hora de Córdoba)
create or replace function public.presupuestos_del_mes(p_perfil uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from presupuestos
  where profesional_id = p_perfil
    and creado_en >= (date_trunc('month', now() at time zone 'America/Argentina/Cordoba')
                      at time zone 'America/Argentina/Cordoba')
$$;

-- Lista pública de quiénes son Pro (sólo el id, para mostrar la etiqueta)
create or replace view public.profesionales_pro as
  select s.perfil_id from public.suscripciones s
  where s.estado = 'activa' or (s.prueba_hasta is not null and s.prueba_hasta > now());
grant select on public.profesionales_pro to anon, authenticated;

-- Mi plan (para la pantalla del profesional)
create or replace function public.mi_plan()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'cobro_activo', a.cobro_activo,
    'gratis', a.presupuestos_gratis,
    'precio', a.precio_pro,
    'dias_prueba', a.dias_prueba,
    'usados', public.presupuestos_del_mes(auth.uid()),
    'es_pro', public.es_pro(auth.uid()),
    'estado', s.estado,
    'prueba_hasta', s.prueba_hasta,
    'proximo_cobro', s.proximo_cobro,
    'tiene_suscripcion', s.mp_preapproval_id is not null,
    'puede_probar', s.perfil_id is null and a.dias_prueba > 0
  )
  from ajustes a left join suscripciones s on s.perfil_id = auth.uid()
  where a.id = 1
$$;
grant execute on function public.mi_plan() to authenticated;

-- Empezar la prueba gratis de Pro (una sola vez por profesional)
create or replace function public.empezar_prueba()
returns void language plpgsql security definer set search_path = public as $$
declare a ajustes;
begin
  select * into a from ajustes where id = 1;
  if not a.cobro_activo then raise exception 'Durante el lanzamiento Manitos es gratis y sin límites'; end if;
  if not exists (select 1 from perfiles where id = auth.uid() and rol = 'profesional') then
    raise exception 'El plan Pro es para profesionales';
  end if;
  if exists (select 1 from suscripciones where perfil_id = auth.uid()) then
    raise exception 'Ya usaste tu prueba gratis';
  end if;
  insert into suscripciones (perfil_id, estado, prueba_hasta)
  values (auth.uid(), 'prueba', now() + make_interval(days => a.dias_prueba));
end $$;
revoke all on function public.empezar_prueba() from public, anon;
grant execute on function public.empezar_prueba() to authenticated;

-- Límite de presupuestos gratis por mes (sólo con el cobro activo)
create or replace function public.trg_plan()
returns trigger language plpgsql security definer set search_path = public as $$
declare a ajustes; v_uid uuid := auth.uid();
begin
  if v_uid is null or public.es_admin() then return new; end if;
  select * into a from ajustes where id = 1;
  if a.cobro_activo and not public.es_pro(v_uid)
     and public.presupuestos_del_mes(v_uid) >= a.presupuestos_gratis then
    raise exception '%', case when a.presupuestos_gratis = 1
      then 'Usaste tu presupuesto gratis de este mes. Pasate a Pro para seguir presupuestando.'
      else format('Usaste tus %s presupuestos gratis de este mes. Pasate a Pro para seguir presupuestando.', a.presupuestos_gratis) end;
  end if;
  return new;
end $$;
drop trigger if exists plan_limite on public.presupuestos;
create trigger plan_limite before insert on public.presupuestos
  for each row execute function public.trg_plan();

-- ---------- Administración ----------
create or replace function public.admin_guardar_ajustes(p_cobro_activo boolean, p_gratis int, p_precio numeric, p_dias int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'Sólo administradores'; end if;
  if p_cobro_activo and coalesce(p_precio, 0) <= 0 then
    raise exception 'Poné el precio del plan Pro antes de activar el cobro';
  end if;
  update ajustes set cobro_activo = p_cobro_activo, presupuestos_gratis = p_gratis,
                     precio_pro = p_precio, dias_prueba = p_dias, actualizado_en = now()
  where id = 1;
end $$;

create or replace function public.admin_suscripciones()
returns table (perfil_id uuid, nombre text, email text, estado text, es_pro boolean, prueba_hasta timestamptz,
               proximo_cobro timestamptz, monto numeric, usados_mes int, creado_en timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'Sólo administradores'; end if;
  return query
  select s.perfil_id, p.nombre, u.email::text, s.estado, public.es_pro(s.perfil_id), s.prueba_hasta,
         s.proximo_cobro, s.monto, public.presupuestos_del_mes(s.perfil_id), s.creado_en
  from suscripciones s join perfiles p on p.id = s.perfil_id left join auth.users u on u.id = s.perfil_id
  order by s.actualizado_en desc;
end $$;

-- Regalar (o quitar) Pro a mano, por ejemplo a los primeros profesionales del piloto
create or replace function public.admin_regalar_pro(p_perfil uuid, p_dias int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'Sólo administradores'; end if;
  insert into suscripciones (perfil_id, estado, prueba_hasta)
  values (p_perfil, 'prueba', case when p_dias > 0 then now() + make_interval(days => p_dias) else now() end)
  on conflict (perfil_id) do update
    set prueba_hasta = case when p_dias > 0 then greatest(coalesce(suscripciones.prueba_hasta, now()), now()) + make_interval(days => p_dias) else now() end,
        actualizado_en = now();
end $$;

revoke all on function public.admin_guardar_ajustes(boolean, int, numeric, int) from public, anon;
revoke all on function public.admin_suscripciones() from public, anon;
revoke all on function public.admin_regalar_pro(uuid, int) from public, anon;
grant execute on function public.admin_guardar_ajustes(boolean, int, numeric, int) to authenticated;
grant execute on function public.admin_suscripciones() to authenticated;
grant execute on function public.admin_regalar_pro(uuid, int) to authenticated;

-- =====================================================================
-- Manitos · Migración 13: rubros nuevos
-- Pegar en Supabase → SQL Editor → Run. Se puede correr más de una vez.
-- =====================================================================
insert into public.rubros (nombre, icono) values
  ('Arreglos generales','🛠️'), ('Piletas','🏊'), ('Persianas y aberturas','🪟'),
  ('Durlock y yesería','📐'), ('Pisos y revestimientos','🔲'), ('Fumigación','🐜')
on conflict (nombre) do nothing;

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
