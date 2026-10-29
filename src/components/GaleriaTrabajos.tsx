"use client";
import { useCallback, useEffect, useState } from "react";
import { comprimir, rutaFoto } from "@/lib/imagen";
import { fotoUrl, supabase } from "@/lib/supabase";
import { mensajeError } from "@/lib/types";

const MAX = 12;

interface FotoTrabajo {
  id: number;
  profesional_id: string;
  ruta: string;
  descripcion: string | null;
  creado_en: string;
}

/**
 * Fotos de trabajos anteriores del profesional.
 * `editable`: el dueño puede agregar (con una frase) y borrar.
 */
export function GaleriaTrabajos({ profesionalId, editable = false }: { profesionalId: string; editable?: boolean }) {
  const [fotos, setFotos] = useState<FotoTrabajo[] | null>(null);
  const [disponible, setDisponible] = useState(true);
  const [abierta, setAbierta] = useState<number | null>(null);
  const [nueva, setNueva] = useState<File | null>(null);
  const [vista, setVista] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    const { data, error } = await supabase()
      .from("trabajos_fotos")
      .select("*")
      .eq("profesional_id", profesionalId)
      .order("creado_en", { ascending: false });
    if (error) setDisponible(false);
    setFotos((data as FotoTrabajo[]) ?? []);
  }, [profesionalId]);
  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (!nueva) return setVista(null);
    const u = URL.createObjectURL(nueva);
    setVista(u);
    return () => URL.revokeObjectURL(u);
  }, [nueva]);

  if (!fotos || !disponible) return null;
  if (!editable && fotos.length === 0) return null;

  const subir = async () => {
    if (!nueva) return;
    setError("");
    setSubiendo(true);
    const sb = supabase();
    const ruta = rutaFoto(profesionalId, "trabajo");
    const { error: eUp } = await sb.storage.from("fotos").upload(ruta, await comprimir(nueva, 1400), { contentType: "image/jpeg" });
    if (eUp) {
      setSubiendo(false);
      return setError("No se pudo subir la foto: " + eUp.message);
    }
    const { error } = await sb.from("trabajos_fotos").insert({ profesional_id: profesionalId, ruta, descripcion: texto.trim() || null });
    setSubiendo(false);
    if (error) {
      await sb.storage.from("fotos").remove([ruta]);
      return setError(mensajeError(error, /row-level|policy/i.test(error.message) ? `Podés tener hasta ${MAX} fotos.` : error.message));
    }
    setNueva(null);
    setTexto("");
    cargar();
  };

  const borrar = async (f: FotoTrabajo) => {
    if (!confirm("¿Borrar esta foto?")) return;
    const sb = supabase();
    await sb.from("trabajos_fotos").delete().eq("id", f.id);
    await sb.storage.from("fotos").remove([f.ruta]);
    setAbierta(null);
    cargar();
  };

  const actual = abierta != null ? fotos[abierta] : null;

  return (
    <section className="tarjeta">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-bold">{editable ? "Fotos de tus trabajos" : "Trabajos realizados"}</h2>
        {editable && <span className="text-xs text-gris">{fotos.length}/{MAX}</span>}
      </div>
      {editable && fotos.length === 0 && (
        <p className="mt-1 text-sm text-gris">Mostrá cómo trabajás: los clientes miran estas fotos antes de elegir.</p>
      )}

      {fotos.length > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-2">
          {fotos.map((f, i) => (
            <li key={f.id}>
              <button type="button" onClick={() => setAbierta(i)} className="block w-full" aria-label={f.descripcion || "Ver foto"}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fotoUrl(f.ruta)} alt={f.descripcion ?? ""} className="aspect-square w-full rounded-xl object-cover" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {editable && fotos.length < MAX && (
        <div className="mt-3">
          {!nueva ? (
            <label className="btn-sec w-full cursor-pointer py-2.5 text-sm">
              📷 Agregar foto de un trabajo
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => { setNueva(e.target.files?.[0] ?? null); e.target.value = ""; }} />
            </label>
          ) : (
            <div className="flex gap-3 rounded-xl bg-fondo p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {vista && <img src={vista} alt="" className="h-20 w-20 shrink-0 rounded-lg object-cover" />}
              <div className="min-w-0 flex-1 space-y-2">
                <label htmlFor="desc-trabajo" className="sr-only">Descripción</label>
                <input
                  id="desc-trabajo"
                  className="campo bg-white py-2 text-sm"
                  maxLength={120}
                  placeholder="Ej: Cambio de termotanque en Alberdi"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                />
                <div className="flex gap-2">
                  <button type="button" onClick={subir} disabled={subiendo} className="btn flex-1 py-2 text-sm">
                    {subiendo ? "Subiendo…" : "Subir"}
                  </button>
                  <button type="button" onClick={() => setNueva(null)} className="btn-sec py-2 text-sm">Cancelar</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {error && <p className="aviso-error mt-2">{error}</p>}

      {actual && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-tinta/90 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setAbierta(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fotoUrl(actual.ruta)} alt={actual.descripcion ?? ""} className="max-h-[75vh] max-w-full rounded-xl object-contain" />
          {actual.descripcion && <p className="mt-3 max-w-md text-center text-white">{actual.descripcion}</p>}
          <div className="mt-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
            {abierta! > 0 && (
              <button className="rounded-full bg-white/15 px-4 py-2 text-white" onClick={() => setAbierta(abierta! - 1)} aria-label="Anterior">←</button>
            )}
            <button className="rounded-full bg-white px-4 py-2 font-semibold text-tinta" onClick={() => setAbierta(null)}>Cerrar</button>
            {editable && (
              <button className="rounded-full bg-red-600 px-4 py-2 font-semibold text-white" onClick={() => borrar(actual)}>Borrar</button>
            )}
            {abierta! < fotos.length - 1 && (
              <button className="rounded-full bg-white/15 px-4 py-2 text-white" onClick={() => setAbierta(abierta! + 1)} aria-label="Siguiente">→</button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
