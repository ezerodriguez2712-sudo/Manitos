import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

/** Funciones de servidor compartidas para mandar mails con Brevo. */

export interface Mail {
  para: string;
  nombre?: string;
  asunto: string;
  html: string;
}

export interface Destinatario {
  id: string;
  nombre: string;
  rol: string;
  zonas?: string[] | null;
  avisos_mail?: boolean | null;
  avisos_push?: boolean | null;
  suspendido?: boolean | null;
}

export async function perfilDe(sb: SupabaseClient, id: string) {
  const { data } = await sb.from("perfiles").select("*").eq("id", id).maybeSingle();
  return data as Destinatario | null;
}

export async function emailDe(sb: SupabaseClient, id: string, notas?: string[]) {
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

export const env = (k: string) => {
  let v = (process.env[k] ?? "").trim().replace(/^["']|["']$/g, "").replace(new RegExp(`^${k}=`), "").trim();
  // En direcciones de mail, un punto o coma al final (típico al copiar de una oración) las invalida
  if (k === "BREVO_SMTP_USUARIO" || k === "MAIL_REMITENTE" || k === "MAIL_RESPUESTA") v = v.replace(/[.,;:]+$/, "");
  return v;
};
export const pareceMail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export async function enviar(mails: Mail[]) {
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
          // Si alguien responde un aviso, la respuesta llega a este mail (opcional)
          ...(env("MAIL_RESPUESTA") ? { replyTo: env("MAIL_RESPUESTA") } : {}),
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

export function urlSupabase() {
  let v = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^["']|["']$/g, "");
  const panel = v.match(/supabase\.com\/dashboard\/project\/([a-z0-9]+)/i);
  if (panel) return `https://${panel[1]}.supabase.co`;
  if (!/^https?:\/\//i.test(v)) v = "https://" + v;
  return v.replace(/\/+$/, "");
}

export function urlSitio() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://manitos-ten.vercel.app").replace(/\/+$/, "");
}

export const saludo = (n?: string | null) => {
  const primero = n?.trim().split(/\s+/)[0];
  return primero ? `Hola ${primero}` : "Hola";
};
export const recortar = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

/** Traduce los errores más comunes de Brevo a qué hay que revisar. */
export function explicar(msg: string) {
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


/** Cliente de Supabase con la clave de servicio (sólo en el servidor). */
export function clienteServicio(): SupabaseClient {
  return createClient(urlSupabase(), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
