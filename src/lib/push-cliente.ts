"use client";
import { supabase } from "@/lib/supabase";
import { VAPID_PUBLICA } from "@/lib/push-config";

export type EstadoPush =
  | "no-soportado" // navegador viejo
  | "instalar-ios" // iPhone: hay que agregar la app a la pantalla de inicio primero
  | "bloqueado" // el usuario bloqueó las notificaciones en el navegador
  | "inactivo"
  | "activo";

const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const instalada = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export async function registrarSW() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

export async function estadoPush(): Promise<EstadoPush> {
  if (typeof window === "undefined") return "no-soportado";
  if (esIOS() && !instalada()) return "instalar-ios";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "no-soportado";
  if (Notification.permission === "denied") return "bloqueado";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "activo" : "inactivo";
}

function claveBytes(base64: string) {
  const relleno = "=".repeat((4 - (base64.length % 4)) % 4);
  const b = atob((base64 + relleno).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(b.length));
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

function nombreDispositivo() {
  const ua = navigator.userAgent;
  const so = /android/i.test(ua) ? "Android" : esIOS() ? "iPhone" : /windows/i.test(ua) ? "Windows" : /mac/i.test(ua) ? "Mac" : "Otro";
  const nav = /edg/i.test(ua) ? "Edge" : /chrome|crios/i.test(ua) ? "Chrome" : /firefox|fxios/i.test(ua) ? "Firefox" : /safari/i.test(ua) ? "Safari" : "";
  return [nav, so].filter(Boolean).join(" en ");
}

/** Pide permiso, suscribe este dispositivo y lo guarda en la base. Devuelve el estado final o un error. */
export async function activarPush(): Promise<{ estado: EstadoPush; error?: string }> {
  const previo = await estadoPush();
  if (previo === "no-soportado" || previo === "instalar-ios" || previo === "bloqueado") return { estado: previo };
  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") return { estado: permiso === "denied" ? "bloqueado" : "inactivo" };
  const reg = (await registrarSW()) ?? (await navigator.serviceWorker.ready);
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveBytes(VAPID_PUBLICA) });
  const j = sub.toJSON();
  const { error } = await supabase().rpc("registrar_push", {
    p_endpoint: sub.endpoint,
    p_p256dh: j.keys?.p256dh,
    p_auth: j.keys?.auth,
    p_dispositivo: nombreDispositivo(),
  });
  if (error) return { estado: "inactivo", error: /registrar_push|schema cache/i.test(error.message) ? "Las notificaciones todavía no están habilitadas." : error.message };
  return { estado: "activo" };
}

/** Desactiva las notificaciones en este dispositivo. */
export async function desactivarPush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await supabase().from("suscripciones_push").delete().eq("endpoint", sub.endpoint);
    await sub.unsubscribe();
  }
}
