import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/correo";

/**
 * Conexión con MercadoPago (sólo servidor). Usa la variable MP_ACCESS_TOKEN
 * (Access Token de producción de tu cuenta de MercadoPago → Tus integraciones).
 */
const API = process.env.MP_API_URL || "https://api.mercadopago.com"; // MP_API_URL sólo para pruebas

export const mpDisponible = () => !!env("MP_ACCESS_TOKEN");

export async function mp<T = Record<string, unknown>>(ruta: string, metodo = "GET", cuerpo?: unknown): Promise<T> {
  const r = await fetch(API + ruta, {
    method: metodo,
    headers: { Authorization: `Bearer ${env("MP_ACCESS_TOKEN")}`, "Content-Type": "application/json" },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    cache: "no-store",
  });
  const j = (await r.json().catch(() => ({}))) as T & { message?: string };
  if (!r.ok) throw new Error(`MercadoPago ${r.status}: ${j?.message ?? "error"}`);
  return j;
}

export interface Preapproval {
  id: string;
  status: "pending" | "authorized" | "paused" | "cancelled";
  external_reference?: string;
  init_point?: string;
  next_payment_date?: string;
  auto_recurring?: { transaction_amount?: number };
}

const ESTADO: Record<Preapproval["status"], string> = {
  pending: "pendiente",
  authorized: "activa",
  paused: "pausada",
  cancelled: "cancelada",
};

/**
 * Trae la suscripción desde MercadoPago (nunca confiamos en lo que llega en la notificación)
 * y actualiza la tabla suscripciones. Devuelve el estado guardado.
 */
export async function sincronizar(sb: SupabaseClient, preapprovalId: string): Promise<string | null> {
  const p = await mp<Preapproval>(`/preapproval/${encodeURIComponent(preapprovalId)}`);
  const perfil = p.external_reference;
  if (!perfil || !/^[0-9a-f-]{36}$/i.test(perfil)) return null; // no es una suscripción de Manitos
  const { data: actual } = await sb.from("suscripciones").select("*").eq("perfil_id", perfil).maybeSingle();
  // Si el profesional ya tiene otra suscripción más nueva, ignorar avisos de una vieja
  if (actual?.mp_preapproval_id && actual.mp_preapproval_id !== p.id && p.status !== "authorized") return actual.estado;
  const estado = ESTADO[p.status] ?? "pendiente";
  const fila = {
    perfil_id: perfil,
    estado,
    mp_preapproval_id: p.id,
    monto: p.auto_recurring?.transaction_amount ?? null,
    proximo_cobro: p.next_payment_date ?? null,
    actualizado_en: new Date().toISOString(),
  };
  const { error } = actual
    ? await sb.from("suscripciones").update(fila).eq("perfil_id", perfil)
    : await sb.from("suscripciones").insert(fila);
  if (error) throw new Error(error.message);
  return estado;
}
