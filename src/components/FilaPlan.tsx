"use client";
import Link from "next/link";
import { Crown } from "lucide-react";
import { quedanGratis, useMiPlan } from "@/lib/plan";

/** Resumen del plan del profesional (sólo aparece con el cobro activo). */
export function FilaPlan() {
  const { plan } = useMiPlan();
  if (!plan?.cobro_activo) return null;
  return (
    <Link
      href="/pro"
      className={`mt-3 flex items-center justify-between gap-3 rounded-2xl border p-3 ${plan.es_pro ? "border-cinta-oscuro/50 bg-cinta/10" : "border-borde bg-white"}`}
    >
      <span className="flex items-center gap-2">
        <Crown className={`h-5 w-5 ${plan.es_pro ? "text-cinta-oscuro" : "text-gris"}`} aria-hidden />
        <span>
          <b className="block">{plan.es_pro ? "Plan Pro" : "Plan Gratis"}</b>
          <span className="text-sm text-gris">
            {plan.es_pro ? "Presupuestos ilimitados" : `Te quedan ${quedanGratis(plan)} de ${plan.gratis} presupuestos este mes`}
          </span>
        </span>
      </span>
      <span className="text-sm font-semibold text-marca">{plan.es_pro ? "Ver" : "Pasate a Pro"} →</span>
    </Link>
  );
}
