import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { clienteServicio, env } from "@/lib/correo";
import { mpDisponible, sincronizar } from "@/lib/mercadopago";

/**
 * Notificaciones de MercadoPago (webhook). Configurarla en MercadoPago →
 * Tus integraciones → Webhooks, con la URL https://www.manitos.com.ar/api/mercadopago
 * y el evento "Planes y suscripciones".
 *
 * Seguridad: no se confía en el contenido; se vuelve a consultar la suscripción a
 * MercadoPago con nuestra clave. Si está la variable MP_WEBHOOK_SECRET, además se
 * valida la firma.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function firmaValida(req: Request, idDato: string) {
  const secreto = env("MP_WEBHOOK_SECRET");
  if (!secreto) return true;
  const firma = req.headers.get("x-signature") ?? "";
  const reqId = req.headers.get("x-request-id") ?? "";
  const partes = Object.fromEntries(firma.split(",").map((p) => p.trim().split("=") as [string, string]));
  if (!partes.ts || !partes.v1) return false;
  const plantilla = `id:${idDato.toLowerCase()};request-id:${reqId};ts:${partes.ts};`;
  const esperada = createHmac("sha256", secreto).update(plantilla).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(esperada), Buffer.from(partes.v1));
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  let cuerpo: { type?: string; topic?: string; data?: { id?: string }; id?: string } = {};
  try {
    cuerpo = await req.json();
  } catch {
    /* MercadoPago a veces manda los datos sólo en la URL */
  }
  const tipo = cuerpo.type ?? cuerpo.topic ?? url.searchParams.get("type") ?? url.searchParams.get("topic") ?? "";
  const id = cuerpo.data?.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "";

  // Sólo nos interesan las suscripciones; al resto se le responde OK para que no reintente
  if (!["subscription_preapproval", "preapproval"].includes(tipo) || !id) return NextResponse.json({ ok: true, ignorado: tipo || "sin tipo" });
  if (!firmaValida(req, id)) return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  if (!mpDisponible() || !env("SUPABASE_SERVICE_ROLE_KEY"))
    return NextResponse.json({ error: "Faltan variables" }, { status: 500 });

  try {
    const estado = await sincronizar(clienteServicio(), id);
    return NextResponse.json({ ok: true, estado });
  } catch (e) {
    // Si MercadoPago no la encuentra, no tiene sentido que reintente
    if (e instanceof Error && /MercadoPago 404/.test(e.message)) return NextResponse.json({ ok: true, ignorado: "no existe" });
    console.error("Webhook MercadoPago", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export const GET = POST;
