"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Azulejo, Logo } from "@/components/Encabezado";
import { supabase } from "@/lib/supabase";
import { PieLegal } from "@/components/Legal";
import { BotonInstalar } from "@/components/Instalar";

const RUBROS: [string, string][] = [
  ["Plomería", "🚰"],
  ["Electricidad", "💡"],
  ["Gas", "🔥"],
  ["Pintura", "🎨"],
  ["Cerrajería", "🔑"],
  ["Aire acondicionado", "❄️"],
  ["Albañilería", "🧱"],
  ["Arreglos generales", "🛠️"],
];

const PASOS = [
  ["Contá qué pasa", "Elegí el rubro, describí el problema y sumá fotos. Tu dirección queda privada."],
  ["Recibí presupuestos", "Los profesionales de ese rubro te mandan precio, fecha y un mensaje."],
  ["Elegí y coordiná", "Aceptás el que más te conviene y arreglan día y hora por chat o WhatsApp."],
];

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
      {/* Portada azul marino */}
      <section className="relative overflow-hidden bg-marca text-white">
        <div className="contenedor flex items-center justify-between pt-5">
          <span className="flex items-center gap-2">
            <Logo animado cada={1800} />
            <span className="font-titulo text-xl font-extrabold tracking-tight">Manitos</span>
          </span>
          <Link href="/ingresar" className="rounded-full bg-white/10 px-4 py-1.5 text-sm font-semibold hover:bg-white/20">
            Ingresar
          </Link>
        </div>

        <div className="contenedor pb-12 pt-12 sm:pt-16">
          <h1 className="font-titulo text-[2.6rem] font-extrabold leading-[1.02] tracking-tight sm:text-6xl">
            Tu casa,
            <br />
            en buenas <span className="text-cinta">manos</span>.
          </h1>
          <p className="mt-5 max-w-md text-lg text-white/80">
            Pedí presupuestos a profesionales de Córdoba, compará precios y opiniones de otros vecinos, y elegí el que más
            te convenga. Publicar es gratis.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/ingresar?rol=cliente&modo=registro" className="btn-cinta text-base">
              Pedir un presupuesto
            </Link>
            <Link
              href="/ingresar?rol=profesional&modo=registro"
              className="inline-flex items-center justify-center rounded-xl border border-white/30 px-5 py-3.5 font-semibold hover:bg-white/10"
            >
              Soy profesional, quiero trabajos
            </Link>
          </div>
          <BotonInstalar className="mt-4 text-sm font-semibold text-white/85 underline underline-offset-4 hover:text-white" />
        </div>
        <div className="cinta-metrica h-2" aria-hidden />
      </section>

      <main className="contenedor py-10">
        <h2 className="text-2xl font-extrabold tracking-tight">¿Qué necesitás en tu casa?</h2>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {RUBROS.map(([nombre, icono]) => (
            <Link
              key={nombre}
              href="/ingresar?rol=cliente&modo=registro"
              className="flex items-center gap-3 rounded-2xl border border-borde bg-white p-2.5 pr-3 font-semibold hover:border-marca"
            >
              <Azulejo nombre={nombre} icono={icono} chico />
              <span className="text-sm leading-tight">{nombre}</span>
            </Link>
          ))}
        </div>
        <p className="mt-3 text-sm text-gris">Y también jardinería, piletas, persianas, durlock, pisos, carpintería, herrería, limpieza, fumigación, fletes, techos y electrodomésticos.</p>

        <h2 className="mt-12 text-2xl font-extrabold tracking-tight">Cómo funciona</h2>
        <ol className="mt-4 space-y-3">
          {PASOS.map(([t, d], i) => (
            <li key={t} className="tarjeta flex gap-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-cinta font-titulo text-lg font-extrabold">
                {i + 1}
              </span>
              <div>
                <h3 className="font-bold">{t}</h3>
                <p className="text-sm text-gris">{d}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-12 rounded-2xl bg-tinta p-6 text-white">
          <h2 className="text-2xl font-extrabold tracking-tight">¿Tenés un oficio?</h2>
          <p className="mt-2 text-white/75">
            Registrate gratis, elegí tus rubros y tus zonas, y empezá a recibir pedidos de vecinos de Córdoba.
          </p>
          <Link href="/ingresar?rol=profesional&modo=registro" className="btn-cinta mt-5">
            Crear mi perfil profesional
          </Link>
        </div>

        <p className="mt-10 text-center text-sm text-gris">
          ¿Ya tenés cuenta?{" "}
          <Link href="/ingresar" className="font-semibold text-marca">
            Ingresá
          </Link>
        </p>
        <PieLegal />
      </main>
    </>
  );
}
