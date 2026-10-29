# Manitos

Web app (instalable en el celular) para pedir servicios del hogar en Córdoba.
El cliente publica un pedido, los profesionales del rubro le mandan presupuestos
y el cliente **elige el que más le conviene**.

**Tecnología:** Next.js 15 + Tailwind · Supabase (base de datos, login, fotos, chat en tiempo real) · Vercel (hosting).

## Cómo funciona

1. **Cliente** publica el pedido: rubro, descripción, fotos, barrio, dirección y si es urgente.
2. **Profesionales** de ese rubro lo ven en "Pedidos nuevos" y mandan presupuesto (precio, fecha, mensaje). Pueden modificarlo mientras el cliente no elija.
3. **Cliente** compara (ordenados por precio, con calificaciones) y elige uno. El resto queda rechazado automáticamente.
4. Recién ahí se habilitan: dirección exacta, teléfono/WhatsApp de ambos y el chat.
5. Cliente marca el trabajo como terminado y **ambos se califican**.

Privacidad: la dirección y el teléfono sólo los ven el cliente y el profesional elegido (controlado en la base de datos, no sólo en la pantalla).

## Puesta en marcha (una sola vez)

### 1. Supabase
1. En tu proyecto de Supabase → **SQL Editor** → *New query* → pegá todo `supabase/instalar.sql` (borra lo de versiones anteriores y crea todo de nuevo) → **Run**.
2. **Project Settings → API**: copiá `Project URL` y la clave `anon public`.
3. (Recomendado para probar) **Authentication → Sign In / Providers → Email**: desactivá *Confirm email* para no tener que confirmar cada cuenta de prueba. Activalo de nuevo antes de lanzar.

### 2. Vercel
1. *Add New → Project* → importá el repo `Manitos` de GitHub.
2. En **Environment Variables** cargá:
   - `NEXT_PUBLIC_SUPABASE_URL` = la Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = la clave anon public
3. **Deploy**. Cada cambio que se suba al repo se publica solo.
4. Copiá la URL que te da Vercel y en Supabase → **Authentication → URL Configuration** ponela como *Site URL*.

### 3. Avisos por mail (Brevo)
1. Supabase → SQL Editor: ejecutá `supabase/migracion-03-avisos-mail.sql`.
2. Vercel → Settings → Environment Variables (Production), **no públicas**:
   - `SUPABASE_SERVICE_ROLE_KEY` = Supabase → Project Settings → API Keys → `service_role` (secreta)
   - `BREVO_SMTP_USUARIO` = Login de Brevo → SMTP y API → SMTP
   - `BREVO_SMTP_CLAVE` = la clave SMTP de Brevo
   - `MAIL_REMITENTE` = el email verificado como remitente en Brevo
3. Redeploy.

Sólo se avisan eventos reales de los últimos 30 minutos y una sola vez cada uno, así que la dirección /api/avisos no necesita clave. El chequeo de la conexión con Brevo está en Panel de administrador → Mails.

Se avisa: al profesional cuando entra un pedido de su rubro en sus zonas (o si no eligió zonas), al cliente cuando recibe un presupuesto y al profesional cuando lo eligen. Cada usuario puede apagar los avisos en su perfil.

### 4. Panel de administrador
1. Supabase → SQL Editor: ejecutá `supabase/migracion-06-admin.sql` (te marca como administrador a ezerodriguez2712@gmail.com).
2. En la app vas a ver **📊 Panel de administrador** en el panel y en tu perfil (dirección `/admin`).
3. Ahí tenés indicadores, usuarios (suspender/reactivar), pedidos (borrar los falsos) y el chequeo de los mails.

Para sumar otro administrador: `update perfiles set es_admin = true where id = (select id from auth.users where email = 'otro@mail.com');`

Cada usuario puede borrar su cuenta desde Perfil → *Borrar mi cuenta* (Ley 25.326).

### 5. Preguntas y profesional verificado
Supabase → SQL Editor: ejecutá `supabase/migracion-07-preguntas-y-verificacion.sql` (después de la 06).
- **Preguntas:** el profesional puede consultarle al cliente antes de presupuestar (hasta 3 por pedido, sin teléfonos ni mails). Las respuestas las ven todos los profesionales. Avisa por mail.
- **Verificado:** el profesional sube DNI (y matrícula) desde su perfil; las fotos van a un depósito privado. Se aprueban o rechazan en Panel de administrador → Verificación y le llega un mail.

### 6. Límites, editar pedido y tarea diaria
Supabase → SQL Editor: ejecutá `supabase/migracion-08-limites-y-edicion.sql` (después de la 07).
- **Límites por usuario:** 5 pedidos por día y 10 abiertos a la vez; 40 presupuestos y 30 preguntas por día; 120 mensajes por hora. Los administradores no tienen límite.
- **Editar pedido:** mientras recibe presupuestos, el cliente cambia título, detalle, fotos y urgencia. Los profesionales ven "Editado".
- **Tarea diaria** (`vercel.json` → `/api/mantenimiento`, 10 h de Córdoba): consulta la base para que Supabase no pause el proyecto, vence los pedidos abiertos con más de 15 días (el cliente puede volver a publicarlos) y le recuerda al cliente que tiene presupuestos esperando. Opcional: variable `CRON_SECRET` en Vercel para que sólo Vercel pueda ejecutarla.

### 7. Trabajo terminado, fotos de trabajos y tiempo de respuesta
Supabase → SQL Editor: ejecutá `supabase/migracion-09-trabajos.sql` (después de la 08).
- El profesional toca **Terminé el trabajo**; al cliente le llega un mail para confirmar (o avisar que falta algo). Si no responde en 3 días, la tarea diaria lo da por terminado.
- El profesional sube hasta 12 fotos de trabajos anteriores desde su perfil; se ven en su perfil público.
- Se muestra cuánto tarda en responder cada profesional (mediana de los últimos 6 meses, desde 2 presupuestos).

### 8. Notificaciones push y guía de bienvenida
1. Supabase → SQL Editor: ejecutá `supabase/migracion-10-push.sql` (después de la 09).
2. Vercel → Environment Variables (Production, Sensitive): `VAPID_PRIVATE_KEY` = la clave privada VAPID (la pública está en `src/lib/push-config.ts`). Redeploy.
- Cada usuario activa las notificaciones desde el panel o su perfil. En iPhone primero hay que agregar Manitos a la pantalla de inicio (iOS 16.4+).
- Llegan push de: pedido nuevo (profesionales), presupuesto, preguntas y respuestas, te eligieron, trabajo terminado, verificación y **mensajes del chat**.
- El profesional ve en su panel una guía con los pasos para completar su perfil.

### 9. Instalar en el celular
Abrí la URL en Chrome (Android) o Safari (iPhone) → *Agregar a pantalla de inicio*.

## Desarrollo local
```bash
cp .env.example .env.local   # y completá las dos claves
npm install
npm run dev
```

## Estructura
```
supabase/schema.sql          Tablas, seguridad (RLS), funciones, fotos
src/app/page.tsx             Portada
src/app/ingresar             Login / registro (cliente o profesional)
src/app/panel                Panel: mis pedidos (cliente) · pedidos nuevos y mis presupuestos (profesional)
src/app/perfil               Datos, zona y rubros del profesional
src/app/pedidos/nuevo        Publicar pedido
src/app/pedidos/[id]         Detalle: enviar / comparar / elegir presupuesto, chat, calificar
```

## Próximas etapas
- Notificaciones push a profesionales cuando entra un pedido de su rubro.
- Filtro por zona/distancia.
- Verificación de profesionales (DNI, matrícula).
- Cobro con MercadoPago y comisión de la plataforma.
- Empaquetar como app de Play Store / App Store.
