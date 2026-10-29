"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Perfil } from "@/lib/types";

/** Barra de navegación inferior, como en una app del celular. */
export function BarraInferior({ perfil, avisos = 0 }: { perfil: Perfil; avisos?: number }) {
  const ruta = usePathname();
  const esPro = perfil.rol === "profesional";
  const items = esPro
    ? [
        { href: "/panel", texto: "Trabajos", icono: IconoMaletin, badge: avisos },
        { href: `/profesionales/${perfil.id}`, texto: "Mi vidriera", icono: IconoTienda },
        { href: "/perfil", texto: "Perfil", icono: IconoPersona },
      ]
    : [
        { href: "/panel", texto: "Mis pedidos", icono: IconoLista, badge: avisos },
        { href: "/pedidos/nuevo", texto: "Pedir", icono: IconoMas, destacado: true },
        { href: "/perfil", texto: "Perfil", icono: IconoPersona },
      ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-borde bg-white/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Navegación principal"
    >
      <ul className="mx-auto grid max-w-2xl grid-cols-3">
        {items.map(({ href, texto, icono: Icono, badge, destacado }) => {
          const activo = ruta === href || (href === "/panel" && ruta.startsWith("/pedidos/") && ruta !== "/pedidos/nuevo");
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={activo ? "page" : undefined}
                className={`relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${
                  activo ? "text-marca" : "text-gris"
                }`}
              >
                {destacado ? (
                  <span className="-mt-5 grid h-12 w-12 place-items-center rounded-full bg-marca text-white shadow-md ring-4 ring-white">
                    <Icono />
                  </span>
                ) : (
                  <Icono />
                )}
                {texto}
                {!!badge && (
                  <span className="absolute left-1/2 top-1 ml-2 min-w-5 rounded-full bg-red-600 px-1.5 text-center text-[11px] leading-5 text-white">
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

const svg = "h-6 w-6";
const trazo = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
function IconoLista() {
  return (<svg viewBox="0 0 24 24" className={svg} {...trazo}><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" /></svg>);
}
function IconoMas() {
  return (<svg viewBox="0 0 24 24" className={svg} {...trazo} strokeWidth={2.6}><path d="M12 5v14M5 12h14" /></svg>);
}
function IconoPersona() {
  return (<svg viewBox="0 0 24 24" className={svg} {...trazo}><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>);
}
function IconoMaletin() {
  return (<svg viewBox="0 0 24 24" className={svg} {...trazo}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18" /></svg>);
}
function IconoTienda() {
  return (<svg viewBox="0 0 24 24" className={svg} {...trazo}><path d="M4 10v10h16V10M3 10l2-6h14l2 6M3 10c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3" /></svg>);
}
