"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fotoUrl, supabase } from "@/lib/supabase";
import type { Perfil } from "@/lib/types";

export function Encabezado({ perfil }: { perfil?: Perfil | null }) {
  const router = useRouter();
  const salir = async () => {
    await supabase().auth.signOut();
    router.replace("/");
  };
  return (
    <header className="sticky top-0 z-10 bg-marca text-white">
      <div className="contenedor flex h-14 items-center justify-between">
        <Link href={perfil ? "/panel" : "/"} className="flex items-center gap-2">
          <Logo />
          <span className="font-titulo text-xl font-extrabold tracking-tight">Manitos</span>
        </Link>
        {perfil && (
          <nav className="flex items-center gap-2 text-sm">
            <Link
              href="/perfil"
              className="flex items-center gap-2 rounded-full bg-white/10 py-1 pl-1 pr-3 font-semibold hover:bg-white/20"
            >
              <Avatar nombre={perfil.nombre} foto={perfil.foto} tam={28} />
              {perfil.nombre?.split(" ")[0] || "Mi perfil"}
            </Link>
            <button onClick={salir} className="rounded-full px-3 py-1.5 text-white/75 hover:bg-white/10 hover:text-white">
              Salir
            </button>
          </nav>
        )}
      </div>
      <div className="cinta-metrica h-1" aria-hidden />
    </header>
  );
}

/** Logo de Manitos: una casa con una llave adentro (arreglos para tu casa) */
export function Logo({ grande = false }: { grande?: boolean }) {
  const t = grande ? 44 : 34;
  return (
    <svg width={t} height={t} viewBox="0 0 64 64" aria-hidden className="shrink-0">
      <rect width="64" height="64" rx="14" fill="#1e3a6b" />
      <path d="M15 30 L32 16 L49 30" fill="none" stroke="#f5b800" strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19.5 27 V48 H44.5 V27" fill="none" stroke="#f5b800" strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" />
      <g transform="rotate(-45 32 38)">
        <rect x="22.5" y="36.4" width="15" height="3.4" rx="1.7" fill="#ffffff" />
        <circle cx="39" cy="38.1" r="4.6" fill="#ffffff" />
        <rect x="39.5" y="36.6" width="5" height="3" fill="#1e3a6b" />
      </g>
    </svg>
  );
}

const COLORES_RUBRO: Record<string, string> = {
  "Plomería": "#d6e9ff",
  "Electricidad": "#fff1b8",
  "Gas": "#ffe0d1",
  "Albañilería": "#f3dfd2",
  "Pintura": "#f6dcf2",
  "Carpintería": "#efe2cc",
  "Cerrajería": "#e4e7ee",
  "Aire acondicionado": "#d8f3f6",
  "Jardinería": "#dcf2d9",
  "Limpieza": "#e2f0ff",
  "Herrería": "#e0e2e8",
  "Mudanzas y fletes": "#ffe7c7",
  "Techos y membranas": "#e6e1f7",
  "Electrodomésticos": "#dfeef0",
  "Arreglos generales": "#fdeec4",
  "Piletas": "#d3eefb",
  "Persianas y aberturas": "#e3e8f2",
  "Durlock y yesería": "#eeebe4",
  "Pisos y revestimientos": "#ece3d8",
  "Fumigación": "#e3efd6",
};

/** Ícono del rubro dentro de un azulejo de color */
export function Azulejo({ nombre, icono, chico = false }: { nombre?: string; icono?: string; chico?: boolean }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-xl ${chico ? "h-9 w-9 text-lg" : "h-12 w-12 text-2xl"}`}
      style={{ background: COLORES_RUBRO[nombre ?? ""] ?? "#e3ebff" }}
      aria-hidden
    >
      {icono ?? "🛠️"}
    </span>
  );
}

export function Cargando({ error }: { error?: string }) {
  if (error)
    return (
      <div className="contenedor py-10">
        <p className="aviso-error">{error}</p>
        <button
          className="btn-sec mt-4"
          onClick={async () => {
            await supabase().auth.signOut().catch(() => {});
            window.location.href = "/ingresar";
          }}
        >
          Salir y volver a ingresar
        </button>
      </div>
    );
  return (
    <div className="grid min-h-[50dvh] place-items-center text-gris">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-marca-suave border-t-marca" />
    </div>
  );
}

export function Estrellas({ promedio, cantidad }: { promedio?: number; cantidad?: number }) {
  if (!cantidad) return <span className="text-xs text-gris">Sin calificaciones aún</span>;
  return (
    <span className="text-sm">
      <span className="text-amber-500">★</span> <b>{promedio}</b>{" "}
      <span className="text-gris">({cantidad})</span>
    </span>
  );
}

export function EstadoChip({ estado, label }: { estado: string; label: string }) {
  const color: Record<string, string> = {
    abierto: "bg-blue-50 text-blue-700",
    asignado: "bg-marca-suave text-marca-oscuro",
    completado: "bg-green-50 text-green-700",
    cancelado: "bg-gray-100 text-gray-500",
    vencido: "bg-gray-100 text-gray-500",
    enviado: "bg-blue-50 text-blue-700",
    aceptado: "bg-green-50 text-green-700",
    rechazado: "bg-gray-100 text-gray-500",
  };
  return (
    <span className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${color[estado] ?? ""}`}>{label}</span>
  );
}

export function whatsapp(tel: string | null, texto: string) {
  if (!tel) return null;
  let n = tel.replace(/\D/g, "");
  if (!n.startsWith("54")) n = "549" + n.replace(/^0/, "");
  return `https://wa.me/${n}?text=${encodeURIComponent(texto)}`;
}

/** Foto de perfil, o la inicial si no tiene. */
export function Avatar({
  nombre,
  foto,
  tam = 40,
  className = "",
}: {
  nombre?: string | null;
  foto?: string | null;
  tam?: number;
  className?: string;
}) {
  const inicial = (nombre?.trim()[0] || "?").toUpperCase();
  if (foto)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={fotoUrl(foto)}
        alt=""
        width={tam}
        height={tam}
        className={`shrink-0 rounded-full object-cover ${className}`}
        style={{ width: tam, height: tam }}
      />
    );
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full bg-cinta font-titulo font-extrabold text-tinta ${className}`}
      style={{ width: tam, height: tam, fontSize: tam * 0.42 }}
      aria-hidden
    >
      {inicial}
    </span>
  );
}

/** Sello de profesional verificado (identidad revisada por Manitos). */
export function SelloVerificado({ matriculado = false, chico = false }: { matriculado?: boolean; chico?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-green-100 font-bold text-green-800 ${chico ? "px-1.5 py-0 text-[11px]" : "px-2 py-0.5 text-xs"}`}
      title={matriculado ? "Identidad y matrícula verificadas por Manitos" : "Identidad verificada por Manitos"}
    >
      <svg width={chico ? 11 : 13} height={chico ? 11 : 13} viewBox="0 0 16 16" aria-hidden>
        <circle cx="8" cy="8" r="8" fill="#15803d" />
        <path d="M4.5 8.3l2.2 2.2 4.8-4.9" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {matriculado ? "Verificado · Matriculado" : "Verificado"}
    </span>
  );
}
