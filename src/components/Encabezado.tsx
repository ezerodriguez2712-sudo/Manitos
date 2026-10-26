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
  return (
    <header className="sticky top-0 z-10 border-b border-borde bg-fondo/90 backdrop-blur">
      <div className="contenedor flex h-14 items-center justify-between">
        <Link href={perfil ? "/panel" : "/"} className="flex items-center gap-2 text-lg font-extrabold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-marca text-white">🛠️</span>
          Manitos
        </Link>
        {perfil && (
          <nav className="flex items-center gap-3 text-sm">
            <Link href="/perfil" className="font-medium text-gris hover:text-tinta">
              {perfil.nombre?.split(" ")[0] || "Mi perfil"}
            </Link>
            <button onClick={salir} className="text-gris hover:text-tinta">
              Salir
            </button>
          </nav>
        )}
      </div>
    </header>
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
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${color[estado] ?? ""}`}>{label}</span>
  );
}

export function whatsapp(tel: string | null, texto: string) {
  if (!tel) return null;
  let n = tel.replace(/\D/g, "");
  if (!n.startsWith("54")) n = "549" + n.replace(/^0/, "");
  return `https://wa.me/${n}?text=${encodeURIComponent(texto)}`;
}
