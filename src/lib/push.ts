import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { env } from "@/lib/correo";
import { VAPID_PUBLICA } from "@/lib/push-config";

/** Lo que muestra la notificación en el celular. */
export interface Push {
  titulo: string;
  cuerpo: string;
  url: string;
  /** Agrupa notificaciones (una nueva reemplaza a la anterior con el mismo tag). */
  tag?: string;
}

let configurado = false;
export function pushDisponible() {
  const privada = env("VAPID_PRIVATE_KEY");
  if (!privada) return false;
  if (!configurado) {
    try {
      webpush.setVapidDetails(`mailto:${env("MAIL_REMITENTE") || "avisos@manitos.app"}`, VAPID_PUBLICA, privada);
      configurado = true;
    } catch (e) {
      console.error("VAPID_PRIVATE_KEY inválida", e instanceof Error ? e.message : e);
      return false;
    }
  }
  return true;
}

/**
 * Manda la notificación a todos los celulares registrados de esas personas.
 * Borra las suscripciones que ya no existen (el usuario desinstaló o bloqueó).
 * Devuelve cuántas se entregaron.
 */
export async function enviarPush(sb: SupabaseClient, perfilIds: string[], push: Push): Promise<number> {
  if (!perfilIds.length || !pushDisponible()) return 0;
  const { data: subs } = await sb.from("suscripciones_push").select("*").in("perfil_id", perfilIds);
  if (!subs?.length) return 0;
  const carga = JSON.stringify(push);
  let ok = 0;
  const vencidas: number[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          carga,
          { TTL: 60 * 60 * 24, urgency: "high", timeout: 10000 }
        );
        ok++;
      } catch (e) {
        const codigo = (e as { statusCode?: number }).statusCode;
        if (codigo === 404 || codigo === 410) vencidas.push(s.id);
        else console.error("Push fallido", codigo, e instanceof Error ? e.message : e);
      }
    })
  );
  if (vencidas.length) await sb.from("suscripciones_push").delete().in("id", vencidas);
  return ok;
}
