"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { estadoPush } from "@/lib/push-cliente";
import { supabase } from "@/lib/supabase";
import type { Perfil } from "@/lib/types";

interface Paso {
  id: string;
  titulo: string;
  porque: string;
  hecho: boolean;
  enlace: string;
}

const CLAVE = "manitos-guia-oculta";

/**
 * Guía de bienvenida del profesional: pasos para tener un perfil que consiga trabajos.
 * Se muestra en el panel hasta completar todo (o si la oculta).
 */
export function GuiaBienvenida({ perfil }: { perfil: Perfil }) {
  const [pasos, setPasos] = useState<Paso[] | null>(null);
  const [oculta, setOculta] = useState(true);
  const [abierta, setAbierta] = useState(true);

  useEffect(() => {
    try {
      setOculta(localStorage.getItem(CLAVE) === perfil.id);
    } catch {
      setOculta(false);
    }
  }, [perfil.id]);

  useEffect(() => {
    const sb = supabase();
    (async () => {
      const [{ count: rubros }, { data: contacto }, fotos, verif, push] = await Promise.all([
        sb.from("profesional_rubros").select("rubro_id", { count: "exact", head: true }).eq("profesional_id", perfil.id),
        sb.from("contactos").select("telefono").eq("perfil_id", perfil.id).maybeSingle(),
        sb.from("trabajos_fotos").select("id", { count: "exact", head: true }).eq("profesional_id", perfil.id),
        sb.from("verificaciones").select("estado").eq("perfil_id", perfil.id).maybeSingle(),
        estadoPush().catch(() => "no-soportado" as const),
      ]);
      const lista: Paso[] = [
        {
          id: "rubros",
          titulo: "Elegí tus rubros",
          porque: "Sólo ves los pedidos de los rubros que elijas.",
          hecho: (rubros ?? 0) > 0,
          enlace: "/perfil#rubros",
        },
        {
          id: "zonas",
          titulo: "Marcá los barrios donde trabajás",
          porque: "Te avisamos primero de los pedidos cerca tuyo.",
          hecho: (perfil.zonas?.length ?? 0) > 0,
          enlace: "/perfil#zonas",
        },
        {
          id: "celular",
          titulo: "Cargá tu celular",
          porque: "Cuando te eligen, el cliente te escribe por WhatsApp.",
          hecho: (contacto?.telefono ?? "").replace(/\D/g, "").length >= 8,
          enlace: "/perfil#celular",
        },
        {
          id: "foto",
          titulo: "Subí una foto tuya",
          porque: "Los clientes eligen más a quien le ven la cara.",
          hecho: !!perfil.foto,
          enlace: "/perfil#foto",
        },
        {
          id: "descripcion",
          titulo: "Contá tu experiencia",
          porque: "Años en el oficio, garantía, matrícula: todo suma.",
          hecho: (perfil.descripcion?.trim().length ?? 0) >= 30,
          enlace: "/perfil#descripcion",
        },
      ];
      if (!fotos.error)
        lista.push({
          id: "trabajos",
          titulo: "Mostrá fotos de trabajos tuyos",
          porque: "Es lo primero que mira un cliente al comparar.",
          hecho: (fotos.count ?? 0) > 0,
          enlace: "/perfil#trabajos",
        });
      if (!verif.error)
        lista.push({
          id: "verificacion",
          titulo: "Verificá tu identidad",
          porque: "Te da el sello ✓ Verificado en tus presupuestos.",
          hecho: !!perfil.verificado || verif.data?.estado === "pendiente",
          enlace: "/perfil#verificacion",
        });
      if (push !== "no-soportado")
        lista.push({
          id: "notificaciones",
          titulo: "Activá las notificaciones",
          porque: "El primero que presupuesta tiene más chances.",
          hecho: push === "activo",
          enlace: "/perfil#notificaciones",
        });
      setPasos(lista);
    })();
  }, [perfil]);

  if (oculta || !pasos) return null;
  const hechos = pasos.filter((p) => p.hecho).length;
  if (hechos === pasos.length) return null;
  const pct = Math.round((hechos / pasos.length) * 100);
  const siguiente = pasos.find((p) => !p.hecho);

  const ocultar = () => {
    setOculta(true);
    try {
      localStorage.setItem(CLAVE, perfil.id);
    } catch {
      /* se vuelve a mostrar la próxima vez */
    }
  };

  return (
    <section className="tarjeta mt-4 overflow-hidden p-0">
      <div className="bg-tinta px-4 py-3 text-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-cinta">Guía de bienvenida</p>
            <p className="font-titulo text-lg font-bold leading-tight">Armá un perfil que consiga trabajos</p>
          </div>
          <button onClick={() => setAbierta(!abierta)} className="shrink-0 rounded-lg px-2 py-1 text-sm text-white/80 hover:bg-white/10">
            {abierta ? "Ocultar pasos" : "Ver pasos"}
          </button>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div
            className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/20"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Perfil completo"
          >
            <div className="h-full rounded-full bg-cinta" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-sm font-bold tabular-nums">
            {hechos} de {pasos.length}
          </span>
        </div>
      </div>

      {abierta ? (
        <ol className="divide-y divide-borde">
          {pasos.map((p) => (
            <li key={p.id}>
              <Link
                href={p.enlace}
                className={`flex items-center gap-3 px-4 py-3 ${p.hecho ? "" : "hover:bg-marca-suave"} ${p.id === siguiente?.id ? "bg-cinta/15" : ""}`}
              >
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold ${
                    p.hecho ? "bg-green-600 text-white" : "border-2 border-borde bg-white text-gris"
                  }`}
                  aria-hidden
                >
                  {p.hecho ? "✓" : pasos.indexOf(p) + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block font-semibold ${p.hecho ? "text-gris line-through" : ""}`}>{p.titulo}</span>
                  {!p.hecho && <span className="block text-xs text-gris">{p.porque}</span>}
                </span>
                {!p.hecho && <span className="text-marca" aria-hidden>→</span>}
                <span className="sr-only">{p.hecho ? "(hecho)" : "(pendiente)"}</span>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        siguiente && (
          <Link href={siguiente.enlace} className="flex items-center justify-between px-4 py-3 text-sm font-semibold text-marca">
            Siguiente: {siguiente.titulo} <span aria-hidden>→</span>
          </Link>
        )
      )}
      <button onClick={ocultar} className="w-full border-t border-borde py-2 text-xs text-gris hover:text-tinta">
        No mostrar más
      </button>
    </section>
  );
}
