"use client";
import { Camera, Images } from "lucide-react";

/**
 * Dos opciones para agregar fotos: sacar una con la cámara o elegir de la galería.
 * (En Android, un solo selector con "varias fotos" no ofrece la cámara.)
 */
export function TomarFoto({
  onArchivos,
  multiple = false,
  variante = "azulejos",
  disabled = false,
}: {
  onArchivos: (archivos: File[]) => void;
  multiple?: boolean;
  variante?: "azulejos" | "botones";
  disabled?: boolean;
}) {
  const recibir = (e: React.ChangeEvent<HTMLInputElement>) => {
    const lista = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (lista.length) onArchivos(lista);
  };

  const estilo =
    variante === "azulejos"
      ? "grid h-20 w-20 cursor-pointer place-items-center rounded-xl border-2 border-dashed border-borde bg-white text-center text-xs font-semibold text-gris hover:border-marca hover:text-marca"
      : "btn-sec flex-1 cursor-pointer py-2.5 text-sm";
  const icono = variante === "azulejos" ? "mx-auto mb-1 h-6 w-6" : "ico";
  const apagado = disabled ? " pointer-events-none opacity-50" : "";

  const opciones = (
    <>
      <label className={estilo + apagado}>
        <span className={variante === "botones" ? "inline-flex items-center gap-2" : ""}>
          <Camera className={icono} aria-hidden />
          Sacar foto
        </span>
        <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={recibir} disabled={disabled} />
      </label>
      <label className={estilo + apagado}>
        <span className={variante === "botones" ? "inline-flex items-center gap-2" : ""}>
          <Images className={icono} aria-hidden />
          Galería
        </span>
        <input type="file" accept="image/*" multiple={multiple} className="sr-only" onChange={recibir} disabled={disabled} />
      </label>
    </>
  );
  return variante === "botones" ? <div className="flex gap-2">{opciones}</div> : opciones;
}
