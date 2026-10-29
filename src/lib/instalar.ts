"use client";
/**
 * Instalación de Manitos como app (ícono en el celular).
 * Chrome/Android avisa con "beforeinstallprompt": se guarda para mostrar nuestro propio botón.
 */
interface EventoInstalar extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let guardado: EventoInstalar | null = null;
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach((f) => f());

export function escucharInstalacion() {
  if (typeof window === "undefined" || (window as Window & { __manitosInstalar?: boolean }).__manitosInstalar) return;
  (window as Window & { __manitosInstalar?: boolean }).__manitosInstalar = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    guardado = e as EventoInstalar;
    avisar();
  });
  window.addEventListener("appinstalled", () => {
    guardado = null;
    try {
      localStorage.setItem("manitos-instalada", "1");
    } catch {
      /* nada */
    }
    avisar();
  });
}

export function suscribir(f: () => void) {
  oyentes.add(f);
  return () => {
    oyentes.delete(f);
  };
}

export type ModoInstalar =
  | "instalada" // ya se abre como app
  | "android" // Chrome ofrece instalar con un toque
  | "ios-safari" // iPhone en Safari: pasos de Compartir
  | "ios-otro" // iPhone en Chrome/otro: hay que abrir en Safari
  | "manual"; // otro navegador: menú ⋮ → Instalar

export function modoInstalar(): ModoInstalar {
  if (typeof window === "undefined") return "instalada";
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return "instalada";
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios) return /crios|fxios|edgios|opios/i.test(ua) ? "ios-otro" : "ios-safari";
  if (guardado) return "android";
  return "manual";
}

/** Abre el cuadro nativo de instalación (sólo Chrome/Android). */
export async function instalarAhora(): Promise<boolean> {
  if (!guardado) return false;
  await guardado.prompt();
  const { outcome } = await guardado.userChoice;
  guardado = null;
  avisar();
  return outcome === "accepted";
}

export const esCelular = () => typeof navigator !== "undefined" && /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
