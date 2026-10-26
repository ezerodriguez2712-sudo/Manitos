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
1. En tu proyecto de Supabase → **SQL Editor** → *New query* → pegá todo `supabase/schema.sql` → **Run**.
2. **Project Settings → API**: copiá `Project URL` y la clave `anon public`.
3. (Recomendado para probar) **Authentication → Sign In / Providers → Email**: desactivá *Confirm email* para no tener que confirmar cada cuenta de prueba. Activalo de nuevo antes de lanzar.

### 2. Vercel
1. *Add New → Project* → importá el repo `Manitos` de GitHub.
2. En **Environment Variables** cargá:
   - `NEXT_PUBLIC_SUPABASE_URL` = la Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = la clave anon public
3. **Deploy**. Cada cambio que se suba al repo se publica solo.
4. Copiá la URL que te da Vercel y en Supabase → **Authentication → URL Configuration** ponela como *Site URL*.

### 3. Instalar en el celular
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
