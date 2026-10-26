"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Perfil } from "@/lib/types";

export function Encabezado({ perfil }: { perfil?: Perfil | null }) {
  const router = useRouter();
  const salir = async () => {
    await supabase().auth.signOut();
    router.replace("/");
  };
  const inicial = (perfil?.nombre?.trim()[0] || "?").toUpperCase();
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
              <span className="grid h-7 w-7 place-items-center rounded-full bg-cinta text-xs font-bold text-tinta">
                {inicial}
              </span>
              {perfil.nombre?.split(" ")[0] || "Mi perfil"}
            </Link>
            <button onClick={salir} className="rounded-full px-3 py-1.5 text-white/75 hover:bg-white/10 hover:text-white">
              Salir
            </button>
          </nav>
        )}
      </div>
      <div className="cinta-metrica h-2" aria-hidden />
    </header>
  );
}

/** Manito trabajando con llave inglesa: el logo de Manitos */
export function Logo({ grande = false }: { grande?: boolean }) {
  const t = grande ? 44 : 34;
  return (
    <svg width={t} height={t} viewBox="0 0 64 64" aria-hidden className="shrink-0">
      <rect width="64" height="64" rx="16" fill="#ffc21a" />
      <g transform="translate(3 -2) rotate(-40 32 32)">
        <rect x="6" y="28.5" width="40" height="7" rx="3.5" fill="#13213f" />
        <circle cx="48" cy="32" r="10" fill="#13213f" />
        <rect x="49" y="28.5" width="12" height="7" rx="1.5" fill="#ffc21a" />
        <rect x="16.5" y="44" width="15" height="14" rx="2" fill="#1f4fd1" stroke="#13213f" strokeWidth="2" />
        <rect x="16.5" y="44" width="15" height="4" fill="#15399e" stroke="#13213f" strokeWidth="2" />
        <rect x="14" y="31" width="20" height="15" rx="6" fill="#ffffff" stroke="#13213f" strokeWidth="2.4" />
        <path d="M19 36v8M24 36v8M29 36v8" stroke="#13213f" strokeWidth="2" strokeLinecap="round" />
        <rect x="15" y="23.5" width="17" height="9" rx="4.5" fill="#ffffff" stroke="#13213f" strokeWidth="2.4" />
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
