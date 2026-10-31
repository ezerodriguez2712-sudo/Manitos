"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BriefcaseBusiness, CalendarDays, Flame, Hammer, House, KeyRound, Paintbrush, Snowflake, Sprout, Wrench, Zap } from "lucide-react";
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
          <Logo animado />
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

const NAVY = "#1e3a6b";
const AMARILLO = "#f5b800";
/** Una herramienta por rubro: la manito las va cambiando */
const HERRAMIENTAS = [House, Wrench, Zap, Flame, Paintbrush, Hammer, KeyRound, Snowflake, Sprout];
/** Movimientos de la mano (clases en globals.css) */
const MOVIMIENTOS = ["m-saludo", "m-salto", "m-choca", "m-latido", "m-sacude", "m-voltea"];

/** Mano geométrica en la caja de 64×64 del logo */
function Mano({ color }: { color: string }) {
  return (
    <g transform="translate(13 7) scale(1.05)" fill={color}>
      <rect x="5" y="10" width="7" height="30" rx="3.5" />
      <rect x="13" y="4" width="7" height="34" rx="3.5" />
      <rect x="21" y="6" width="7" height="32" rx="3.5" />
      <rect x="29" y="12" width="7" height="27" rx="3.5" />
      <rect x="5" y="24" width="31" height="22" rx="9" />
      <line x1="10" y1="38" x2="1.5" y2="27" stroke={color} strokeWidth="7.4" strokeLinecap="round" />
    </g>
  );
}

/**
 * Logo de Manitos: una manito con una herramienta en la palma.
 * Con `animado`, la mano se mueve de distintas formas y cambia de herramienta (una por rubro).
 * Quien tiene "reducir movimiento" activado en el celular la ve quieta, con la casita.
 */
export function Logo({ grande = false, tam, animado = false, cada }: { grande?: boolean; tam?: number; animado?: boolean; cada?: number }) {
  const t = tam ?? (grande ? 44 : 34);
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!animado) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      if (!document.hidden) setI((x) => x + 1);
    }, cada ?? 2800);
    return () => window.clearInterval(id);
  }, [animado, cada]);
  const Icono = HERRAMIENTAS[i % HERRAMIENTAS.length];
  const mov = i === 0 ? "" : MOVIMIENTOS[(i - 1) % MOVIMIENTOS.length];
  return (
    <svg width={t} height={t} viewBox="0 0 64 64" aria-hidden className="shrink-0 overflow-visible">
      <rect width="64" height="64" rx="14" fill={NAVY} />
      <g key={i} className={`logo-mano ${mov}`}>
        <Mano color={AMARILLO} />
        <g className={i === 0 ? "" : "logo-herramienta"}>
          <Icono x={25} y={34.6} width={19} height={19} color={NAVY} strokeWidth={2.5} />
        </g>
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
    <div className="grid min-h-[50dvh] place-items-center text-gris" role="status" aria-label="Cargando">
      <Logo tam={96} animado cada={1100} />
    </div>
  );
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const mesAnio = (f: string) => {
  const d = new Date(new Date(f).getTime() - 3 * 3600e3); // hora de Córdoba
  return `${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

/** "Usuario desde octubre de 2026 · 12 trabajos realizados" */
export function Trayectoria({ desde, trabajos, prefijo, className = "" }: { desde?: string | null; trabajos?: number | null; prefijo?: string; className?: string }) {
  if (!desde && trabajos == null) return null;
  return (
    <span className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gris ${className}`}>
      {prefijo && <span className="font-semibold text-tinta">{prefijo}</span>}
      {desde && (
        <span className="inline-flex items-center gap-1">
          <CalendarDays className="h-3.5 w-3.5" aria-hidden /> Usuario desde {mesAnio(desde)}
        </span>
      )}
      {trabajos != null && (
        <span className="inline-flex items-center gap-1">
          <BriefcaseBusiness className="h-3.5 w-3.5" aria-hidden />
          {trabajos === 0 ? "Sin trabajos todavía" : `${trabajos} trabajo${trabajos === 1 ? "" : "s"} realizado${trabajos === 1 ? "" : "s"}`}
        </span>
      )}
    </span>
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
