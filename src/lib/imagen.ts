/**
 * Achica una foto antes de subirla (las del celular pesan varios MB).
 * Devuelve un JPEG de hasta `max` px de lado. Si algo falla, devuelve el archivo original.
 */
export async function comprimir(archivo: File, max = 1600, calidad = 0.82): Promise<Blob> {
  if (!archivo.type.startsWith("image/")) return archivo;
  try {
    const bmp = await createImageBitmap(archivo);
    const escala = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * escala);
    const h = Math.round(bmp.height * escala);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", calidad));
    return blob && blob.size < archivo.size ? blob : archivo;
  } catch {
    return archivo;
  }
}

/** Ruta única dentro de la carpeta del usuario en Storage. */
export const rutaFoto = (uid: string, prefijo = "foto") =>
  `${uid}/${prefijo}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
