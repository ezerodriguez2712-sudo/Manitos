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
