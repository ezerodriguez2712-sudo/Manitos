-- MANITOS · Diagnóstico de avisos por mail (sólo lee, no cambia nada)
-- Pegalo en Supabase → SQL Editor → Run y mandá captura del resultado.
with ultimo as (
  select p.*, r.nombre as rubro from public.pedidos p join public.rubros r on r.id = p.rubro_id
  order by p.creado_en desc limit 1
)
select 1 as orden, '1. Disparadores instalados' as que,
       coalesce(string_agg(tgname, ', '), 'NINGUNO (falta correr la migración 03)') as detalle
from pg_trigger where tgname like 'aviso_%'
union all
select 2, '2. Último pedido',
       (select format('#%s %s · %s · %s · %s', id, rubro, zona, estado, to_char(creado_en at time zone 'America/Argentina/Cordoba', 'DD/MM HH24:MI')) from ultimo)
union all
select 3, '3. Llamadas de la base a la app (últimas 3)',
       coalesce((select string_agg(format('[%s] status %s %s %s', to_char(created at time zone 'America/Argentina/Cordoba','HH24:MI:SS'),
                 coalesce(status_code::text,'-'), coalesce(error_msg,''), left(coalesce(content,''), 200)), '  ||  ' order by created desc)
          from (select * from net._http_response order by created desc limit 3) x), 'Ninguna llamada registrada')
union all
select 4, '4. Avisos registrados como enviados',
       coalesce((select string_agg(format('%s #%s', tipo, ref_id), ', ') from (select * from public.avisos_enviados order by enviado_en desc limit 5) a), 'ninguno')
union all
select 5, '5. Profesionales del rubro del último pedido',
       coalesce((select string_agg(format('%s | zonas: %s | avisos: %s | mail confirmado: %s',
                 pf.nombre, coalesce(nullif(array_to_string(pf.zonas, ', '), ''), '(sin zonas)'),
                 case when pf.avisos_mail then 'sí' else 'NO' end,
                 case when u.email_confirmed_at is not null then 'sí' else 'NO' end), '  ||  ')
          from public.profesional_rubros prr
          join public.perfiles pf on pf.id = prr.profesional_id
          join auth.users u on u.id = pf.id
          where prr.rubro_id = (select rubro_id from ultimo)), 'NINGÚN profesional tiene ese rubro')
union all
select 6, '6. Dirección configurada', (select valor from privado.config where clave = 'url_avisos')
order by orden;
