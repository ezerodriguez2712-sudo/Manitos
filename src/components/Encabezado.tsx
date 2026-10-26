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

/** Casita con cinta métrica: el logo de Manitos */
export function Logo({ grande = false }: { grande?: boolean }) {
  const t = grande ? 44 : 32;
  return (
    <svg width={t} height={t} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <rect width="32" height="32" rx="9" fill="#ffc21a" />
      <path d="M16 6 L26 14 V25 H6 V14 Z" fill="#13213f" />
      <rect x="13" y="17" width="6" height="8" rx="1" fill="#ffc21a" />
      <path d="M6 28h20" stroke="#13213f" strokeWidth="1.5" strokeDasharray="1 3" />
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
