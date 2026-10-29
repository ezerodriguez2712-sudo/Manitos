"use client";
import { Compass, Download, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Encabezado";
import { esCelular, instalarAhora, modoInstalar, suscribir, type ModoInstalar } from "@/lib/instalar";

function useModo() {
  const [modo, setModo] = useState<ModoInstalar>("instalada");
  useEffect(() => {
    const actualizar = () => setModo(modoInstalar());
    actualizar();
    return suscribir(actualizar);
  }, []);
  return modo;
}

/** Ícono de "Compartir" de Safari (cuadrado con flecha hacia arriba). */
function IconoCompartir() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1e3a6b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v12M8 7l4-4 4 4" />
      <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  );
}
function IconoAgregar() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1e3a6b" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}
function IconoMenu() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="#1e3a6b" aria-hidden>
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  );
}

function Paso({ n, icono, children }: { n: number; icono: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-xl bg-fondo p-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-tinta text-sm font-bold text-white">{n}</span>
      <span className="flex-1 text-sm leading-snug">{children}</span>
      <span className="grid h-10 min-w-10 shrink-0 place-items-center rounded-lg bg-white px-2 ring-1 ring-borde">{icono}</span>
    </li>
  );
}

/** Ventana con los pasos para instalar según el celular. */
function Instrucciones({ modo, onCerrar }: { modo: ModoInstalar; onCerrar: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-tinta/60 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="titulo-instalar" onClick={onCerrar}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-left text-tinta shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <Logo grande />
          <div>
            <h2 id="titulo-instalar" className="font-titulo text-xl font-extrabold leading-tight">Instalá Manitos</h2>
            <p className="text-sm text-gris">Queda como un ícono más en tu celular.</p>
          </div>
        </div>
        {modo === "ios-otro" ? (
          <div className="mt-4 space-y-2 text-sm">
            <p>
              En iPhone sólo se puede instalar desde <b>Safari</b>.
            </p>
            <ol className="space-y-2">
              <Paso n={1} icono={<Compass className="h-5 w-5 text-marca" />}>
                Abrí <b>manitos-ten.vercel.app</b> en Safari.
              </Paso>
              <Paso n={2} icono={<IconoCompartir />}>
                Tocá <b>Compartir</b> en la barra de abajo.
              </Paso>
              <Paso n={3} icono={<IconoAgregar />}>
                Elegí <b>Agregar a pantalla de inicio</b>.
              </Paso>
            </ol>
          </div>
        ) : modo === "ios-safari" ? (
          <ol className="mt-4 space-y-2">
            <Paso n={1} icono={<IconoCompartir />}>
              Tocá el botón <b>Compartir</b> en la barra de abajo de Safari.
            </Paso>
            <Paso n={2} icono={<IconoAgregar />}>
              Bajá y elegí <b>Agregar a pantalla de inicio</b>.
            </Paso>
            <Paso n={3} icono={<span className="text-sm font-bold text-marca">Agregar</span>}>
              Tocá <b>Agregar</b> arriba a la derecha.
            </Paso>
          </ol>
        ) : (
          <ol className="mt-4 space-y-2">
            <Paso n={1} icono={<IconoMenu />}>
              Tocá los <b>tres puntitos</b> arriba a la derecha de Chrome.
            </Paso>
            <Paso n={2} icono={<Smartphone className="h-5 w-5 text-marca" />}>
              Elegí <b>Instalar app</b> o <b>Agregar a pantalla principal</b>.
            </Paso>
            <Paso n={3} icono={<span className="text-sm font-bold text-marca">Instalar</span>}>
              Confirmá con <b>Instalar</b>.
            </Paso>
          </ol>
        )}
        <p className="mt-3 text-xs text-gris">
          Después abrí Manitos desde el ícono: se ve a pantalla completa y te pueden llegar notificaciones.
        </p>
        <button onClick={onCerrar} className="btn mt-4 w-full">Entendido</button>
      </div>
    </div>
  );
}

/** Acción de instalar: con un toque en Android, o abre los pasos. */
function useInstalar(modo: ModoInstalar) {
  const [pasos, setPasos] = useState(false);
  const instalar = async () => {
    if (modo === "android" && (await instalarAhora().catch(() => false))) return;
    if (modo !== "android") setPasos(true);
  };
  const ventana = pasos ? <Instrucciones modo={modo} onCerrar={() => setPasos(false)} /> : null;
  return { instalar, ventana };
}

/** Botón para la portada (sólo en celulares y si no está instalada). */
export function BotonInstalar({ className = "" }: { className?: string }) {
  const modo = useModo();
  const { instalar, ventana } = useInstalar(modo);
  const [movil, setMovil] = useState(false);
  useEffect(() => setMovil(esCelular()), []);
  if (modo === "instalada" || (!movil && modo !== "android")) return null;
  return (
    <>
      <button type="button" onClick={instalar} className={className}>
        <Download className="ico" /> Instalar Manitos en el celular
      </button>
      {ventana}
    </>
  );
}

const CLAVE_OCULTA = "manitos-instalar-oculto";

/** Tarjeta para el panel (se puede ocultar). */
export function TarjetaInstalar() {
  const modo = useModo();
  const { instalar, ventana } = useInstalar(modo);
  const [oculta, setOculta] = useState(true);
  const [movil, setMovil] = useState(false);
  useEffect(() => {
    setMovil(esCelular());
    try {
      setOculta(localStorage.getItem(CLAVE_OCULTA) === "1" || localStorage.getItem("manitos-instalada") === "1");
    } catch {
      setOculta(false);
    }
  }, []);
  if (oculta || modo === "instalada" || (!movil && modo !== "android")) return null;
  const ocultar = () => {
    setOculta(true);
    try {
      localStorage.setItem(CLAVE_OCULTA, "1");
    } catch {
      /* nada */
    }
  };
  return (
    <section className="tarjeta mt-4 flex items-center gap-3 border-cinta-oscuro/40 bg-cinta/15">
      <Logo />
      <div className="min-w-0 flex-1">
        <p className="font-bold leading-tight">Tené Manitos a mano</p>
        <p className="text-sm text-tinta/80">Instalala como app: un ícono en tu celular, sin buscar la página.</p>
        <button onClick={instalar} className="btn mt-2 px-4 py-2 text-sm">
          <Download className="ico" /> Instalar
        </button>
      </div>
      <button onClick={ocultar} className="self-start text-gris hover:text-tinta" aria-label="Ocultar">
        ×
      </button>
      {ventana}
    </section>
  );
}

/** Fila para el perfil. */
export function FilaInstalar() {
  const modo = useModo();
  const { instalar, ventana } = useInstalar(modo);
  const [movil, setMovil] = useState(false);
  useEffect(() => setMovil(esCelular()), []);
  if (modo === "instalada") return null;
  if (!movil && modo !== "android") return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-borde bg-white p-3">
      <span>
        <b className="block">App en el celular</b>
        <span className="text-sm text-gris">Agregá Manitos como un ícono en tu pantalla de inicio.</span>
      </span>
      <button type="button" onClick={instalar} className="btn shrink-0 px-3 py-2 text-sm">
        Instalar
      </button>
      {ventana}
    </div>
  );
}
