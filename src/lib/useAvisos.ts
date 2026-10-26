"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { Aviso } from "./types";

/** Novedades y mensajes sin leer por pedido. Se actualiza solo cada 30 s y al volver a la app. */
export function useAvisos(activo = true) {
  const [avisos, setAvisos] = useState<Record<number, Aviso>>({});

  const cargar = useCallback(async () => {
    try {
      const { data, error } = await supabase().rpc("mis_avisos");
      if (error || !data) return;
      setAvisos(Object.fromEntries((data as Aviso[]).map((a) => [a.pedido_id, a])));
    } catch {
      /* sin avisos si la base todavía no tiene la función */
    }
  }, []);

  useEffect(() => {
    if (!activo) return;
    cargar();
    const t = setInterval(cargar, 30000);
    const alVolver = () => document.visibilityState === "visible" && cargar();
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [activo, cargar]);

  const total = Object.values(avisos).reduce((s, a) => s + a.novedades + a.mensajes, 0);
  return { avisos, total, recargar: cargar };
}
