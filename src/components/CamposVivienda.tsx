"use client";
import { Building2, Fence, House } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { TipoVivienda, Vivienda } from "@/lib/mapas";

const TIPOS: { valor: TipoVivienda; texto: string; icono: LucideIcon }[] = [
  { valor: "casa", texto: "Casa", icono: House },
  { valor: "departamento", texto: "Departamento", icono: Building2 },
  { valor: "barrio_cerrado", texto: "Barrio cerrado", icono: Fence },
];

/** Tipo de vivienda y datos para llegar: piso/depto, o barrio cerrado/manzana/lote, más indicaciones. */
export function CamposVivienda({ valor, onChange }: { valor: Vivienda; onChange: (v: Vivienda) => void }) {
  const set = (cambios: Partial<Vivienda>) => onChange({ ...valor, ...cambios });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tipo de vivienda">
        {TIPOS.map((t) => (
          <button
            key={t.valor}
            type="button"
            role="radio"
            aria-checked={valor.tipo === t.valor}
            onClick={() => set({ tipo: t.valor })}
            className={`rounded-xl border-2 px-2 py-2 text-sm font-semibold leading-tight ${
              valor.tipo === t.valor ? "border-marca bg-marca-suave" : "border-transparent bg-white"
            }`}
          >
            <t.icono className="mx-auto mb-1 h-5 w-5" aria-hidden />
            {t.texto}
          </button>
        ))}
      </div>

      {valor.tipo === "departamento" && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="etiqueta">Piso</label>
            <input className="campo" inputMode="text" placeholder="Ej: 3 o PB" value={valor.piso} onChange={(e) => set({ piso: e.target.value })} />
          </div>
          <div>
            <label className="etiqueta">Departamento</label>
            <input className="campo" placeholder="Ej: B" value={valor.depto} onChange={(e) => set({ depto: e.target.value })} />
          </div>
        </div>
      )}

      {valor.tipo === "barrio_cerrado" && (
        <div className="space-y-2">
          <div>
            <label className="etiqueta">Nombre del barrio cerrado o country</label>
            <input className="campo" placeholder="Ej: Las Delicias" value={valor.barrio_cerrado} onChange={(e) => set({ barrio_cerrado: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="etiqueta">Manzana</label>
              <input className="campo" placeholder="Ej: 12" value={valor.manzana} onChange={(e) => set({ manzana: e.target.value })} />
            </div>
            <div>
              <label className="etiqueta">Lote</label>
              <input className="campo" placeholder="Ej: 5" value={valor.lote} onChange={(e) => set({ lote: e.target.value })} />
            </div>
          </div>
        </div>
      )}

      <div>
        <label className="etiqueta">Indicaciones para llegar (opcional)</label>
        <input
          className="campo"
          maxLength={160}
          placeholder={
            valor.tipo === "barrio_cerrado"
              ? "Ej: avisar en la guardia, casa con portón verde"
              : valor.tipo === "departamento"
                ? "Ej: timbre 3B, entrar por la cochera"
                : "Ej: casa con rejas blancas, timbre no anda"
          }
          value={valor.referencias}
          onChange={(e) => set({ referencias: e.target.value })}
        />
      </div>
    </div>
  );
}
