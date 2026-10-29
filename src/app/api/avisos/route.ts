import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { mismoBarrio } from "@/lib/barrios";
import { PIE_AVISOS, plantillaMail } from "@/lib/mails";
import { pesos } from "@/lib/types";

/**
 * Recibe los avisos que dispara la base de datos (pedido nuevo, presupuesto nuevo,
 * presupuesto elegido) y manda el mail correspondiente por Brevo.
 *
 * Variables de entorno (en Vercel, NO públicas):
 *   SUPABASE_SERVICE_ROLE_KEY, BREVO_SMTP_USUARIO, BREVO_SMTP_CLAVE, MAIL_REMITENTE
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_PROFESIONALES = 60;
const MINUTOS_VIGENCIA = 30; // sólo se avisan eventos de los últimos 30 minutos

const reciente = (fecha?: string | null) =>
  !!fecha && Date.now() - new Date(fecha).getTime() < MINUTOS_VIGENCIA * 60_000; // tope por pedido para cuidar el límite diario de Brevo

type Tipo = "nuevo_pedido" | "nuevo_presupuesto" | "elegido";

export async function POST(req: Request) {
  // Seguridad: no hace falta un secreto compartido. Sólo se avisa de eventos reales,
  // recientes (últimos MINUTOS_VIGENCIA) y una sola vez cada uno (tabla avisos_enviados),
  // así que llamar a esta dirección de afuera no permite mandar mails de más.

  let tipo: Tipo, id: number;
  try {
    const b = await req.json();
    tipo = b.tipo;
    id = Number(b.id);
    if (!["nuevo_pedido", "nuevo_presupuesto", "elegido"].includes(tipo) || !id) throw new Error();
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }

  const faltan = ["SUPABASE_SERVICE_ROLE_KEY", "BREVO_SMTP_USUARIO", "BREVO_SMTP_CLAVE", "MAIL_REMITENTE"].filter(
    (v) => !process.env[v]
  );
  if (faltan.length) return NextResponse.json({ error: `Faltan variables: ${faltan.join(", ")}` }, { status: 500 });

  const sb = createClient(urlSupabase(), process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Evita mandar dos veces el mismo aviso
  const { error: dup } = await sb.from("avisos_enviados").insert({ tipo, ref_id: id });
  if (dup) {
    if (dup.code === "23505") return NextResponse.json({ ok: true, repetido: true });
    return NextResponse.json({ error: dup.message }, { status: 500 });
  }

  try {
    const notas: string[] = [];
    const mails = await armarMails(sb, tipo, id, notas);
    const enviados = await enviar(mails);
    return NextResponse.json({ ok: true, enviados, ...(notas.length ? { notas } : {}) });
  } catch (e) {
    // Si falla, se libera para poder reintentar
    await sb.from("avisos_enviados").delete().eq("tipo", tipo).eq("ref_id", id);
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Aviso fallido", tipo, id, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

interface Mail {
  para: string;
  nombre?: string;
  asunto: string;
  html: string;
}

async function armarMails(sb: SupabaseClient, tipo: Tipo, id: number, notas: string[]): Promise<Mail[]> {
  const sitio = urlSitio();

  if (tipo === "nuevo_pedido") {
    const { data: p } = await sb.from("pedidos").select("*, rubros(nombre)").eq("id", id).maybeSingle();
    if (!p) return nota(notas, `pedido #${id} no encontrado`);
    if (p.estado !== "abierto" || !reciente(p.creado_en)) return nota(notas, "pedido cerrado o de hace más de 30 minutos");
    const { data: prs } = await sb
      .from("profesional_rubros")
      .select("profesional_id, perfiles(id, nombre, zonas, avisos_mail, rol)")
      .eq("rubro_id", p.rubro_id);
    const candidatos = ((prs ?? []) as unknown as { perfiles: Destinatario | null }[])
      .map((x) => x.perfiles)
      .filter((x): x is Destinatario => !!x && x.rol === "profesional" && x.avisos_mail !== false && x.id !== p.cliente_id)
      // Sólo a quienes trabajan en ese barrio, o a quienes todavía no eligieron zonas
      .filter((x) => !x.zonas?.length || x.zonas.some((z) => mismoBarrio(z, p.zona)))
      .slice(0, MAX_PROFESIONALES);

    const urgente = p.urgencia === "urgente" ? "Urgente: " : "";
    const mails: Mail[] = [];
    if (!candidatos.length) notas.push("ningún profesional de ese rubro trabaja en esa zona o tiene los avisos activos");
    for (const pro of candidatos) {
      const email = await emailDe(sb, pro.id, notas);
      if (!email) continue;
      mails.push({
        para: email,
        nombre: pro.nombre,
        asunto: `${urgente}Pedido de ${p.rubros?.nombre ?? "trabajo"} en ${p.zona}`,
        html: plantillaMail({
          titulo: `${urgente}nuevo pedido de ${(p.rubros?.nombre ?? "trabajo").toLowerCase()}`,
          texto: `${saludo(pro.nombre)}, un vecino de ${p.zona} necesita un profesional. Mandale tu presupuesto antes que otros.`,
          detalle: `${p.titulo}\n${recortar(p.descripcion, 220)}`,
          boton: "Ver pedido y presupuestar",
          enlace: `${sitio}/pedidos/${p.id}`,
          pie: PIE_AVISOS,
        }),
      });
    }
    return mails;
  }

  if (tipo === "nuevo_presupuesto") {
    const { data: presu, error: ePr } = await sb.from("presupuestos").select("*").eq("id", id).maybeSingle();
    if (!presu) return nota(notas, `presupuesto #${id} no encontrado${ePr ? ": " + ePr.message : ""}`);
    if (!reciente(presu.creado_en)) return nota(notas, "presupuesto de hace más de 30 minutos");
    const { data: ped, error: ePe } = await sb
      .from("pedidos")
      .select("id, titulo, cliente_id, estado")
      .eq("id", presu.pedido_id)
      .maybeSingle();
    if (!ped) return nota(notas, `pedido #${presu.pedido_id} no encontrado${ePe ? ": " + ePe.message : ""}`);
    if (ped.estado !== "abierto") return nota(notas, `el pedido ya no está abierto (${ped.estado})`);
    const autor = await perfilDe(sb, presu.profesional_id);
    const pr = { ...presu, perfiles: autor, pedidos: ped };
    const cliente = await perfilDe(sb, ped.cliente_id);
    if (!cliente) return nota(notas, "no se encontró el perfil del cliente");
    if (cliente.avisos_mail === false) return nota(notas, "el cliente tiene los avisos por mail apagados");
    const email = await emailDe(sb, cliente.id, notas);
    if (!email) return [];
    const { count } = await sb.from("presupuestos").select("id", { count: "exact", head: true }).eq("pedido_id", pr.pedidos.id);
    const n = count ?? 1;
    return [
      {
        para: email,
        nombre: cliente.nombre,
        asunto: `Nuevo presupuesto: ${pesos(Number(pr.monto))} para "${recortar(pr.pedidos.titulo, 50)}"`,
        html: plantillaMail({
          titulo: "Te llegó un presupuesto",
          texto: `${saludo(cliente.nombre)}, ${pr.perfiles?.nombre ?? "un profesional"} te pasó presupuesto. Ya tenés ${n} para comparar.`,
          detalle: `${pr.pedidos.titulo}\nPrecio: ${pesos(Number(pr.monto))}${pr.mensaje ? `\n"${recortar(pr.mensaje, 200)}"` : ""}`,
          boton: n > 1 ? "Comparar presupuestos" : "Ver presupuesto",
          enlace: `${sitio}/pedidos/${pr.pedidos.id}`,
          pie: PIE_AVISOS,
        }),
      },
    ];
  }

  // elegido
  const { data: p } = await sb.from("pedidos").select("*").eq("id", id).maybeSingle();
  if (!p?.presupuesto_elegido_id) return nota(notas, "el pedido no tiene presupuesto elegido");
  const { data: pr } = await sb.from("presupuestos").select("*").eq("id", p.presupuesto_elegido_id).maybeSingle();
  if (!pr || !reciente(pr.respondido_en ?? pr.creado_en)) return nota(notas, "elección de hace más de 30 minutos");
  const pro = await perfilDe(sb, pr.profesional_id);
  if (!pro || pro.avisos_mail === false) return nota(notas, "el profesional tiene los avisos por mail apagados");
  const email = await emailDe(sb, pro.id, notas);
  if (!email) return [];
  const cliente = await perfilDe(sb, p.cliente_id);
  return [
    {
      para: email,
      nombre: pro.nombre,
      asunto: `¡Te eligieron! ${recortar(p.titulo, 60)}`,
      html: plantillaMail({
        titulo: "¡El cliente eligió tu presupuesto!",
        texto: `${saludo(pro.nombre)}, ${cliente?.nombre ?? "el cliente"} aceptó tu presupuesto de ${pesos(Number(pr.monto))}. Ya podés ver la dirección y coordinar por chat o WhatsApp.`,
        detalle: `${p.titulo}\n${p.zona}`,
        boton: "Coordinar el trabajo",
        enlace: `${sitio}/pedidos/${p.id}`,
        pie: PIE_AVISOS,
      }),
    },
  ];
}

interface Destinatario {
  id: string;
  nombre: string;
  rol: string;
  zonas?: string[] | null;
  avisos_mail?: boolean | null;
}

async function perfilDe(sb: SupabaseClient, id: string) {
  const { data } = await sb.from("perfiles").select("id, nombre, rol, zonas, avisos_mail").eq("id", id).maybeSingle();
  return data as Destinatario | null;
}

async function emailDe(sb: SupabaseClient, id: string, notas?: string[]) {
  const { data, error } = await sb.auth.admin.getUserById(id);
  const u = data?.user;
  if (!u?.email) {
    notas?.push(`usuario sin email${error ? ": " + error.message : ""}`);
    return null;
  }
  if (!u.email_confirmed_at) {
    // sólo cuentas confirmadas
    notas?.push(`${u.email} todavía no confirmó su cuenta`);
    return null;
  }
  return u.email;
}

function nota(notas: string[], texto: string): Mail[] {
  notas.push(texto);
  return [];
}

const env = (k: string) => {
  let v = (process.env[k] ?? "").trim().replace(/^["']|["']$/g, "").replace(new RegExp(`^${k}=`), "").trim();
  // En direcciones de mail, un punto o coma al final (típico al copiar de una oración) las invalida
  if (k === "BREVO_SMTP_USUARIO" || k === "MAIL_REMITENTE") v = v.replace(/[.,;:]+$/, "");
  return v;
};
const pareceMail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

async function enviar(mails: Mail[]) {
  if (!mails.length) return 0;
  const transporte = nodemailer.createTransport({
    host: process.env.BREVO_SMTP_HOST || "smtp-relay.brevo.com",
    port: Number(process.env.BREVO_SMTP_PUERTO || 587),
    secure: false,
    auth: { user: env("BREVO_SMTP_USUARIO"), pass: env("BREVO_SMTP_CLAVE") },
    // Nunca quedarse colgado esperando al servidor de correo
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  let ok = 0;
  let primerError = "";
  // De a 5 en paralelo para no saturar el SMTP
  for (let i = 0; i < mails.length; i += 5) {
    const tanda = await Promise.allSettled(
      mails.slice(i, i + 5).map((m) =>
        transporte.sendMail({
          from: { name: "Manitos", address: env("MAIL_REMITENTE") },
          to: m.nombre ? { name: m.nombre, address: m.para } : m.para,
          subject: m.asunto,
          html: m.html,
        })
      )
    );
    tanda.forEach((r) => {
      if (r.status === "fulfilled") ok++;
      else {
        console.error("Mail fallido:", r.reason);
        primerError ||= r.reason instanceof Error ? r.reason.message : String(r.reason);
      }
    });
  }
  if (ok === 0) throw new Error(`Brevo rechazó el envío: ${explicar(primerError)}`);
  return ok;
}

function urlSupabase() {
  let v = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^["']|["']$/g, "");
  const panel = v.match(/supabase\.com\/dashboard\/project\/([a-z0-9]+)/i);
  if (panel) return `https://${panel[1]}.supabase.co`;
  if (!/^https?:\/\//i.test(v)) v = "https://" + v;
  return v.replace(/\/+$/, "");
}

function urlSitio() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://manitos-ten.vercel.app").replace(/\/+$/, "");
}

const saludo = (n?: string | null) => {
  const primero = n?.trim().split(/\s+/)[0];
  return primero ? `Hola ${primero}` : "Hola";
};
const recortar = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

/** Traduce los errores más comunes de Brevo a qué hay que revisar. */
function explicar(msg: string) {
  const m = msg || "error desconocido";
  if (/535|auth|credentials|Invalid login/i.test(m))
    return `${m} → revisá BREVO_SMTP_USUARIO (el "Login" de Brevo, ej. xxx@smtp-brevo.com) y BREVO_SMTP_CLAVE (la clave SMTP completa).`;
  if (/sender|from|not valid|unauthorized/i.test(m))
    return `${m} → MAIL_REMITENTE tiene que ser exactamente el email verificado como remitente en Brevo.`;
  if (/not activated|account.*(suspend|block)|permanently/i.test(m))
    return `${m} → la cuenta SMTP de Brevo no está activa: pedí la activación al soporte de Brevo.`;
  if (/timeout|ETIMEDOUT|ECONNREFUSED|ENOTFOUND/i.test(m)) return `${m} → no se pudo conectar con Brevo.`;
  return m;
}

/**
 * Chequeo rápido: abrir /api/avisos en el navegador.
 * Muestra cómo están cargadas las variables (sin revelar claves) y prueba el login en Brevo.
 */
export async function GET() {
  const clave = env("BREVO_SMTP_CLAVE");
  const service = env("SUPABASE_SERVICE_ROLE_KEY");
  const datos = {
    BREVO_SMTP_USUARIO: env("BREVO_SMTP_USUARIO") || "(vacío)",
    BREVO_SMTP_CLAVE: clave
      ? `${clave.slice(0, 9)}… (${clave.length} caracteres)${clave.startsWith("xsmtpsib-") ? "" : " ⚠️ debería empezar con xsmtpsib-"}`
      : "(vacío)",
    MAIL_REMITENTE: env("MAIL_REMITENTE")
      ? env("MAIL_REMITENTE") + (pareceMail(env("MAIL_REMITENTE")) ? "" : " ⚠️ no es un email: poné el remitente verificado en Brevo")
      : "(vacío)",
    SUPABASE_SERVICE_ROLE_KEY: service ? `${service.slice(0, 10)}… (${service.length} caracteres)` : "(vacío)",
  };
  let brevo = "";
  try {
    const t = nodemailer.createTransport({
      host: process.env.BREVO_SMTP_HOST || "smtp-relay.brevo.com",
      port: Number(process.env.BREVO_SMTP_PUERTO || 587),
      secure: false,
      auth: { user: env("BREVO_SMTP_USUARIO"), pass: clave },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
    await t.verify();
    brevo = "✅ Brevo aceptó el usuario y la clave";
  } catch (e) {
    brevo = "❌ " + explicar(e instanceof Error ? e.message : String(e));
  }
  return new NextResponse(
    `Chequeo de avisos de Manitos\n\nBrevo: ${brevo}\n\nVariables cargadas en Vercel:\n` +
      Object.entries(datos).map(([k, v]) => `  ${k}: ${v}`).join("\n"),
    { headers: { "Content-Type": "text/plain; charset=utf-8" } }
  );
}
