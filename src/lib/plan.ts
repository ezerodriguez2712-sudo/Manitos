"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface MiPlan {
  cobro_activo: boolean;
  gratis: number;
  precio: number | null;
  dias_prueba: number;
  usados: number;
  es_pro: boolean;
  estado: "prueba" | "pendiente" | "activa" | "pausada" | "cancelada" | null;
  prueba_hasta: string | null;
  proximo_cobro: string | null;
  tiene_suscripcion: boolean;
  puede_probar: boolean;
}

/** Plan del profesional logueado (null mientras carga). */
export function useMiPlan(activo = true) {
  const [plan, setPlan] = useState<MiPlan | null>(null);
  const cargar = useCallback(async () => {
    const { data, error } = await supabase().rpc("mi_plan");
    // Sin datos (la base todavía no tiene los cobros): se comporta como "todo gratis"
    setPlan(
      error || !data
        ? { cobro_activo: false, gratis: 0, precio: null, dias_prueba: 0, usados: 0, es_pro: false, estado: null,
            prueba_hasta: null, proximo_cobro: null, tiene_suscripcion: false, puede_probar: false }
        : (data as MiPlan)
    );
  }, []);
  useEffect(() => {
    if (activo) cargar();
  }, [activo, cargar]);
  return { plan, recargar: cargar };
}

export const quedanGratis = (p: MiPlan) => Math.max(0, p.gratis - p.usados);
