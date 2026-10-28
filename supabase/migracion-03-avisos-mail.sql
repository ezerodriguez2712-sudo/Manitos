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
