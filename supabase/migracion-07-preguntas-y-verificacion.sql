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
