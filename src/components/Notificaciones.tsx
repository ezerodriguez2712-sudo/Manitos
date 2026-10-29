"use client";
import { useEffect, useState } from "react";
import { escucharInstalacion } from "@/lib/instalar";
import { activarPush, desactivarPush, estadoPush, registrarSW, type EstadoPush } from "@/lib/push-cliente";

/** Registra el service worker al abrir la app (notificaciones e instalación). */
export function RegistrarSW() {
  useEffect(() => {
    escucharInstalacion();
    registrarSW();
  }, []);
  return null;
}

const CLAVE_OCULTO = "manitos-push-oculto";
const leerOculto = () => {
  try {
    return localStorage.getItem(CLAVE_OCULTO) === "1";
  } catch {
    return false;
  }
};

function useEstadoPush() {
  const [estado, setEstado] = useState<EstadoPush | null>(null);
  useEffect(() => {
    estadoPush().then(setEstado, () => setEstado("no-soportado"));
  }, []);
  return [estado, setEstado] as const;
}

function PasosIOS() {
  return (
    <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
      <li>
        Tocá el botón <b>Compartir</b> <span aria-hidden>⬆️</span> de Safari.
      </li>
      <li>
        Elegí <b>Agregar a pantalla de inicio</b>.
      </li>
      <li>Abrí Manitos desde el ícono nuevo y activá las notificaciones.</li>
    </ol>
  );
}

/** Tarjeta para el panel: invita a activar las notificaciones (se puede ocultar). */
export function TarjetaNotificaciones({ esPro }: { esPro: boolean }) {
  const [estado, setEstado] = useEstadoPush();
  const [oculto, setOculto] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => setOculto(leerOculto()), []);

  // En iPhone sin instalar, la tarjeta de "Instalar Manitos" ya explica los pasos
  if (oculto || !estado || estado === "activo" || estado === "no-soportado" || estado === "bloqueado" || estado === "instalar-ios")
    return null;

  const ocultar = () => {
    setOculto(true);
    try {
      localStorage.setItem(CLAVE_OCULTO, "1");
    } catch {
      /* sin almacenamiento: se vuelve a mostrar la próxima vez */
    }
  };

  return (
    <section className="tarjeta mt-4 flex gap-3 border-marca/30 bg-marca-suave">
      <span className="text-3xl" aria-hidden>🔔</span>
      <div className="min-w-0 flex-1">
        <p className="font-bold">Enterate al instante</p>
        <p className="text-sm text-tinta/80">
          {esPro
            ? "Te avisamos en el celular apenas entra un pedido de tu rubro. El primero que presupuesta tiene más chances."
            : "Te avisamos en el celular cuando te llega un presupuesto o un mensaje."}
        </p>
        <button
          className="btn mt-3 px-4 py-2 text-sm"
          disabled={ocupado}
          onClick={async () => {
            setOcupado(true);
            setError("");
            const r = await activarPush().catch((e) => ({ estado: "inactivo" as EstadoPush, error: String(e) }));
            setOcupado(false);
            setEstado(r.estado);
            if (r.error) setError(r.error);
          }}
        >
          {ocupado ? "Activando…" : "Activar notificaciones"}
        </button>
        {error && <p className="aviso-error mt-2">{error}</p>}
      </div>
      <button onClick={ocultar} className="self-start text-gris hover:text-tinta" aria-label="Ocultar">
        ×
      </button>
    </section>
  );
}

/** Fila para el perfil: activar o desactivar en este dispositivo. */
export function FilaNotificaciones() {
  const [estado, setEstado] = useEstadoPush();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  if (!estado) return null;

  const texto: Record<EstadoPush, string> = {
    activo: "Activadas en este dispositivo.",
    inactivo: "Recibí avisos en el celular aunque no tengas la app abierta.",
    bloqueado: "Las bloqueaste en el navegador. Habilitalas desde la configuración del sitio (el candado 🔒 al lado de la dirección).",
    "no-soportado": "Este navegador no permite notificaciones. Probá con Chrome.",
    "instalar-ios": "En iPhone primero tenés que agregar Manitos a la pantalla de inicio:",
  };

  const cambiar = async () => {
    setOcupado(true);
    setError("");
    try {
      if (estado === "activo") {
        await desactivarPush();
        setEstado("inactivo");
      } else {
        const r = await activarPush();
        setEstado(r.estado);
        if (r.error) setError(r.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setOcupado(false);
  };

  return (
    <div id="notificaciones" className="scroll-mt-20 rounded-xl border border-borde bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <span>
          <b className="block">Notificaciones en el celular</b>
          <span className="text-sm text-gris">{texto[estado]}</span>
        </span>
        {(estado === "activo" || estado === "inactivo") && (
          <button
            type="button"
            onClick={cambiar}
            disabled={ocupado}
            className={`shrink-0 rounded-xl px-3 py-2 text-sm font-semibold ${estado === "activo" ? "btn-sec" : "btn"}`}
          >
            {ocupado ? "…" : estado === "activo" ? "Desactivar" : "Activar"}
          </button>
        )}
      </div>
      {estado === "instalar-ios" && <PasosIOS />}
      {error && <p className="aviso-error mt-2">{error}</p>}
    </div>
  );
}
