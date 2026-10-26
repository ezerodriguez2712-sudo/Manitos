"use client";
import { useMemo, useState } from "react";
import { BARRIOS, normalizar } from "@/lib/barrios";

/** Campo de barrio con sugerencias (acepta también barrios que no están en la lista). */
export function CampoBarrio({
  valor,
  onChange,
  requerido,
}: {
  valor: string;
  onChange: (v: string) => void;
  requerido?: boolean;
}) {
  return (
    <>
      <input
        className="campo"
        list="lista-barrios"
        placeholder="Empezá a escribir, ej: Alberdi"
        required={requerido}
        autoComplete="off"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id="lista-barrios">
        {BARRIOS.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>
    </>
  );
}

/** Selector de varias zonas con buscador y chips. */
export function SelectorZonas({ zonas, onChange }: { zonas: string[]; onChange: (z: string[]) => void }) {
  const [busqueda, setBusqueda] = useState("");
  const sugeridos = useMemo(() => {
    const q = normalizar(busqueda);
    return BARRIOS.filter((b) => !zonas.includes(b) && (!q || normalizar(b).includes(q))).slice(0, q ? 12 : 8);
  }, [busqueda, zonas]);

  const agregar = (b: string) => {
    const v = b.trim();
    if (v && !zonas.some((z) => normalizar(z) === normalizar(v))) onChange([...zonas, v]);
    setBusqueda("");
  };

  return (
    <div className="space-y-2">
      {zonas.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {zonas.map((z) => (
            <button
              type="button"
              key={z}
              onClick={() => onChange(zonas.filter((x) => x !== z))}
              className="inline-flex items-center gap-1 rounded-full bg-marca px-3 py-1 text-sm font-semibold text-white"
              aria-label={`Quitar ${z}`}
            >
              {z} <span aria-hidden>×</span>
            </button>
          ))}
        </div>
      )}
      <input
        className="campo"
        placeholder="Buscar barrio"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            agregar(sugeridos[0] ?? busqueda);
          }
        }}
      />
      <div className="flex flex-wrap gap-1.5">
        {sugeridos.map((b) => (
          <button
            type="button"
            key={b}
            onClick={() => agregar(b)}
            className="rounded-full border border-borde bg-white px-3 py-1 text-sm hover:border-marca"
          >
            + {b}
          </button>
        ))}
      </div>
    </div>
  );
}
