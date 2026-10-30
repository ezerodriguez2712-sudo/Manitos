"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Crown, Sparkles } from "lucide-react";
import { Cargando, Encabezado } from "@/components/Encabezado";
import { BarraInferior } from "@/components/BarraInferior";
import { useAvisos } from "@/lib/useAvisos";
import { useSesion } from "@/lib/useSesion";
import { quedanGratis, useMiPlan } from "@/lib/plan";
import { supabase } from "@/lib/supabase";
import { fecha, pesos } from "@/lib/types";

const BENEFICIOS = [
  "Presupuestos ilimitados todos los meses",
  "Tus presupuestos aparecen primero, con la etiqueta Pro",
  "Cancelás cuando quieras desde la app",
];

async function llamar(metodo: "POST" | "PUT" | "DELETE", cuerpo?: unknown) {
  const { data } = await supabase().auth.getSession();
  const r = await fetch("/api/suscripcion", {
    method: metodo,
    headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}`, "Content-Type": "application/json" },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "No se pudo completar.");
  return j;
}

function Contenido() {
  const { perfil, usuario, cargando, error: errorSesion } = useSesion();
  const { total } = useAvisos(!!perfil);
  const { plan, recargar } = useMiPlan(!!perfil);
  const volvio = useSearchParams().get("volver");
  const [email, setEmail] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    if (usuario?.email) setEmail(usuario.email);
  }, [usuario?.email]);

  // Al volver de MercadoPago, consultar el estado
  useEffect(() => {
    if (!volvio || !perfil) return;
    setAviso("Estamos confirmando tu suscripción con MercadoPago…");
    llamar("PUT")
      .then((j) => {
        setAviso(j.estado === "activa" ? "¡Listo! Ya sos Pro." : "MercadoPago todavía está procesando el pago. En unos minutos se actualiza.");
        recargar();
      })
      .catch(() => setAviso("En unos minutos se actualiza el estado de tu suscripción."));
  }, [volvio, perfil, recargar]);

  if (cargando || !perfil) return (<><Encabezado /><Cargando error={errorSesion} /></>);

  const accion = async (f: () => Promise<void>) => {
    setOcupado(true);
    setError("");
    try {
      await f();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setOcupado(false);
  };

  const suscribir = () =>
    accion(async () => {
      const j = await llamar("POST", { email });
      window.location.href = j.link;
    });
  const probar = () =>
    accion(async () => {
      const { error } = await supabase().rpc("empezar_prueba");
      if (error) throw new Error(error.message);
      await recargar();
    });
  const cancelar = () =>
    accion(async () => {
      if (!confirm("¿Cancelar tu suscripción Pro? Seguís con el plan gratis.")) return;
      await llamar("DELETE");
      await recargar();
    });

  return (
    <>
      <Encabezado perfil={perfil} />
      <main className="contenedor max-w-md space-y-4 pb-28 pt-6">
        <Link href="/perfil" className="text-sm text-gris hover:text-tinta">← Volver al perfil</Link>
        <h1 className="titulo flex items-center gap-2">
          <Crown className="h-7 w-7 text-cinta-oscuro" aria-hidden /> Manitos Pro
        </h1>

        {aviso && <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-800">{aviso}</p>}

        {perfil.rol !== "profesional" ? (
          <p className="tarjeta text-gris">El plan Pro es para profesionales. Para los clientes, Manitos es siempre gratis.</p>
        ) : !plan ? (
          <Cargando />
        ) : !plan.cobro_activo ? (
          <section className="tarjeta">
            <p className="flex items-center gap-2 font-bold">
              <Sparkles className="ico text-cinta-oscuro" /> Durante el lanzamiento, todo es gratis
            </p>
            <p className="mt-1 text-sm text-gris">
              Podés mandar todos los presupuestos que quieras, sin límites. Te vamos a avisar antes de que cambie algo.
            </p>
          </section>
        ) : (
          <>
            {/* Estado actual */}
            <section className={`tarjeta ${plan.es_pro ? "border-cinta-oscuro/50 bg-cinta/10" : ""}`}>
              <p className="text-xs font-semibold uppercase tracking-wide text-gris">Tu plan</p>
              {plan.es_pro ? (
                <>
                  <p className="mt-1 flex items-center gap-2 font-titulo text-2xl font-bold">
                    <Crown className="h-6 w-6 text-cinta-oscuro" aria-hidden /> Pro
                  </p>
                  {plan.estado === "activa" ? (
                    <p className="mt-1 text-sm text-gris">
                      Suscripción activa{plan.proximo_cobro ? ` · próximo cobro el ${fecha(plan.proximo_cobro)}` : ""}.
                    </p>
                  ) : (
                    plan.prueba_hasta && (
                      <p className="mt-1 text-sm text-gris">
                        Prueba gratis hasta el <b>{fecha(plan.prueba_hasta)}</b>.
                        {!plan.tiene_suscripcion &&
                          " Suscribite antes para no perder los beneficios: el primer cobro es cuando termina la prueba."}
                      </p>
                    )
                  )}
                </>
              ) : (
                <>
                  <p className="mt-1 font-titulo text-2xl font-bold">Gratis</p>
                  <p className="mt-1 text-sm text-gris">
                    Te quedan <b>{quedanGratis(plan)}</b> de {plan.gratis} presupuestos gratis este mes. Se renuevan el día 1.
                  </p>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-fondo" aria-hidden>
                    <div
                      className="h-full rounded-full bg-marca"
                      style={{ width: `${Math.min(100, (plan.usados / Math.max(1, plan.gratis)) * 100)}%` }}
                    />
                  </div>
                  {plan.estado === "pausada" && (
                    <p className="aviso-error mt-3">Tu suscripción está pausada: MercadoPago no pudo cobrar. Revisá tu medio de pago.</p>
                  )}
                </>
              )}
            </section>

            {/* Pasarse a Pro */}
            {plan.estado !== "activa" && (
              <section className="tarjeta">
                <p className="font-bold">Pro · {plan.precio ? `${pesos(plan.precio)} por mes` : "precio a definir"}</p>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {BENEFICIOS.map((b) => (
                    <li key={b} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-700" aria-hidden /> {b}
                    </li>
                  ))}
                </ul>

                {plan.puede_probar && (
                  <button onClick={probar} disabled={ocupado} className="btn-cinta mt-4 w-full">
                    Probar Pro gratis {plan.dias_prueba} días
                  </button>
                )}

                <div className="mt-4 space-y-2">
                  <label className="etiqueta" htmlFor="email-mp">Email de tu cuenta de MercadoPago</label>
                  <input id="email-mp" type="email" className="campo" value={email} onChange={(e) => setEmail(e.target.value)} />
                  <button
                    onClick={suscribir}
                    disabled={ocupado || !plan.precio}
                    className={`${plan.puede_probar ? "btn-sec" : "btn"} w-full`}
                  >
                    {ocupado ? "Abriendo MercadoPago…" : "Suscribirme con MercadoPago"}
                  </button>
                  <p className="text-xs text-gris">
                    Se cobra automáticamente cada mes con la tarjeta o el dinero de tu cuenta de MercadoPago. Lo cancelás cuando quieras.
                  </p>
                </div>
              </section>
            )}

            {plan.tiene_suscripcion && plan.estado !== "cancelada" && (
              <button onClick={cancelar} disabled={ocupado} className="w-full py-2 text-sm text-gris hover:text-red-600">
                Cancelar suscripción
              </button>
            )}
            {error && <p className="aviso-error">{error}</p>}
          </>
        )}
      </main>
      <BarraInferior perfil={perfil} avisos={total} />
    </>
  );
}

export default function PaginaPro() {
  return (
    <Suspense>
      <Contenido />
    </Suspense>
  );
}
