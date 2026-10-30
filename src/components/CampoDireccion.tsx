"use client";
import { LocateFixed, MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { buscarDirecciones, direccionDe, linkMaps, separarAltura, type Sugerencia, type Ubicacion } from "@/lib/mapas";

/**
 * Dirección con sugerencias de Córdoba, botón "usar mi ubicación" y link a Google Maps.
 * Si el usuario escribe sin elegir una sugerencia, se guarda el texto igual (sin coordenadas).
 */
export function CampoDireccion({
  valor,
  onChange,
  barrio,
}: {
  valor: Ubicacion;
  onChange: (u: Ubicacion) => void;
  barrio?: string;
}) {
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [ubicando, setUbicando] = useState(false);
  const [aviso, setAviso] = useState("");
  const elegido = useRef(false);

  // Buscar sugerencias con una pequeña espera mientras se escribe
  useEffect(() => {
    if (elegido.current) {
      elegido.current = false;
      return;
    }
    const q = valor.texto;
    if (q.trim().length < 4) {
      setSugerencias([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        const s = await buscarDirecciones(q, barrio, ctrl.signal);
        setSugerencias(s);
        setAbierto(true);
      } catch {
        /* sin sugerencias: se puede escribir igual */
      } finally {
        setBuscando(false);
      }
    }, 450);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [valor.texto, barrio]);

  const entrada = useRef<HTMLInputElement>(null);
  const elegir = (s: Sugerencia) => {
    elegido.current = true;
    // Si eligió la calle sin altura, deja el cursor al final para que escriba el número
    const texto = separarAltura(s.texto).numero ? s.texto : s.texto + " ";
    onChange({ texto, lat: s.lat, lng: s.lng });
    setAbierto(false);
    setSugerencias([]);
    setTimeout(() => {
      const el = entrada.current;
      if (el) {
        el.focus();
        el.setSelectionRange(texto.length, texto.length);
      }
    }, 0);
  };
  const faltaAltura = valor.texto.trim().length > 3 && !separarAltura(valor.texto).numero && !/\b(s\/n|sin n)/i.test(valor.texto);

  const usarMiUbicacion = () => {
    setAviso("");
    if (!navigator.geolocation) return setAviso("Tu navegador no permite usar la ubicación.");
    setUbicando(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        const texto = valor.texto.trim() || (await direccionDe(lat, lng)) || "Mi ubicación";
        elegido.current = true;
        onChange({ texto, lat, lng });
        setUbicando(false);
      },
      () => {
        setUbicando(false);
        setAviso("No pudimos obtener tu ubicación. Revisá que el navegador tenga permiso.");
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };

  const conPunto = valor.lat != null && valor.lng != null;

  return (
    <div className="relative">
      <input
        ref={entrada}
        className="campo"
        placeholder="Calle y número, ej: Av. Colón 2100"
        autoComplete="off"
        value={valor.texto}
        onChange={(e) => onChange({ texto: e.target.value, lat: null, lng: null })}
        onFocus={() => sugerencias.length && setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        role="combobox"
        aria-autocomplete="list"
        aria-controls="sugerencias-direccion"
        aria-expanded={abierto}
      />
      {buscando && (
        <span className="absolute right-3 top-3.5 h-5 w-5 animate-spin rounded-full border-2 border-marca-suave border-t-marca" />
      )}

      {abierto && sugerencias.length > 0 && (
        <ul id="sugerencias-direccion" className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-borde bg-white shadow-lg" role="listbox">
          {sugerencias.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => elegir(s)}
                className="flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-marca-suave"
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gris" aria-hidden />
                <span>
                  <span className="block text-sm font-semibold">{s.texto}</span>
                  {s.detalle && <span className="block text-xs text-gris">{s.detalle}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <button type="button" onClick={usarMiUbicacion} disabled={ubicando} className="font-semibold text-marca disabled:opacity-60">
          {ubicando ? "Buscando tu ubicación…" : <span className="inline-flex items-center gap-1"><LocateFixed className="ico" /> Usar mi ubicación actual</span>}
        </button>
        {valor.texto.trim() && (
          <a href={linkMaps(valor, barrio)} target="_blank" rel="noreferrer" className="text-gris underline">
            {conPunto ? "✓ Ver en Google Maps" : "Ver en Google Maps"}
          </a>
        )}
      </div>
      {conPunto && <p className="mt-1 text-xs text-green-700">Ubicación marcada en el mapa.</p>}
      {!conPunto && faltaAltura && !abierto && (
        <p className="mt-1 text-xs text-amber-700">Agregá la altura (el número de la casa) para que el profesional te encuentre.</p>
      )}
      {aviso && <p className="mt-1 text-xs text-red-600">{aviso}</p>}
    </div>
  );
}
