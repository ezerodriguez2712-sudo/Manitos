"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Encabezado } from "@/components/Encabezado";
import { supabase } from "@/lib/supabase";

const RUBROS = ["🚰 Plomería", "💡 Electricidad", "🔥 Gas", "🎨 Pintura", "🔑 Cerrajería", "❄️ Aire acond.", "🧱 Albañilería", "🌿 Jardinería"];

export default function Inicio() {
  const router = useRouter();
  useEffect(() => {
    try {
      supabase()
        .auth.getUser()
        .then(({ data }) => data.user && router.replace("/panel"))
        .catch(() => {});
    } catch {
      /* sin configuración: se muestra igual la portada */
    }
  }, [router]);

  return (
    <>
      <Encabezado />
      <main className="contenedor py-10">
        <h1 className="text-4xl font-extrabold leading-tight tracking-tight">
          Contá qué necesitás arreglar.
          <br />
          <span className="text-marca">Los profesionales te pasan presupuesto.</span>
        </h1>
        <p className="mt-4 text-lg text-gris">
          Publicás tu pedido gratis, recibís presupuestos de profesionales de Córdoba y elegís el que más te
          conviene por precio, fecha y calificaciones.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/ingresar?rol=cliente&modo=registro" className="btn">
            Necesito un servicio
          </Link>
          <Link href="/ingresar?rol=profesional&modo=registro" className="btn-sec">
            Soy profesional
          </Link>
        </div>
        <p className="mt-4 text-sm text-gris">
          ¿Ya tenés cuenta?{" "}
          <Link href="/ingresar" className="font-semibold text-marca">
            Ingresá
          </Link>
        </p>

        <div className="mt-12 flex flex-wrap gap-2">
          {RUBROS.map((r) => (
            <span key={r} className="rounded-full border border-borde bg-white px-3 py-1.5 text-sm">
              {r}
            </span>
          ))}
        </div>

        <ol className="mt-12 grid gap-4 sm:grid-cols-3">
          {[
            ["1", "Publicá", "Describí el trabajo, sumá fotos y tu zona."],
            ["2", "Compará", "Te llegan presupuestos con precio y fecha."],
            ["3", "Elegí", "Aceptás el que te convence y coordinan por chat."],
          ].map(([n, t, d]) => (
            <li key={n} className="tarjeta">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-marca text-sm font-bold text-white">
                {n}
              </span>
              <h3 className="mt-3 font-bold">{t}</h3>
              <p className="text-sm text-gris">{d}</p>
            </li>
          ))}
        </ol>
      </main>
    </>
  );
}
