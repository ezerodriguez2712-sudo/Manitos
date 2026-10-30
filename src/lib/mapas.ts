/** Utilidades de mapas: links de Google Maps y sugerencias de direcciones (sin claves ni costo). */

export interface Ubicacion {
  texto: string;
  lat: number | null;
  lng: number | null;
}

/** Gran Córdoba: minLon,minLat,maxLon,maxLat */
const BBOX_CORDOBA = "-64.62,-31.62,-63.95,-31.05";
const CENTRO = { lat: -31.4167, lng: -64.1833 };

const consulta = (u: Partial<Ubicacion>, barrio?: string | null) =>
  u.lat != null && u.lng != null
    ? `${u.lat},${u.lng}`
    : [u.texto, barrio, "Córdoba, Argentina"].filter(Boolean).join(", ");

/** Abre la ubicación en Google Maps (app o web). */
export const linkMaps = (u: Partial<Ubicacion>, barrio?: string | null) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(consulta(u, barrio))}`;

/** Abre Google Maps con el recorrido hasta la ubicación. */
export const linkComoLlegar = (u: Partial<Ubicacion>, barrio?: string | null) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(consulta(u, barrio))}`;

/** Mapa embebido (no requiere clave). */
export const mapaEmbebido = (u: Partial<Ubicacion>, barrio?: string | null) =>
  `https://maps.google.com/maps?q=${encodeURIComponent(consulta(u, barrio))}&z=16&output=embed`;

interface FeaturePhoton {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    street?: string;
    housenumber?: string;
    district?: string;
    locality?: string;
    city?: string;
    county?: string;
    osm_key?: string;
    osm_value?: string;
    type?: string;
  };
}

export interface Sugerencia extends Ubicacion {
  detalle: string;
}

/** Sin acentos ni mayúsculas, para comparar nombres. */
const plano = (t?: string) =>
  (t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** "Av. Colón" → "Avenida Colón", "Bv San Juan" → "Boulevard San Juan", etc. (mejora la búsqueda) */
const expandir = (t: string) =>
  t
    .replace(/\b(av|avda|avd)\b\.?\s*/gi, "Avenida ")
    .replace(/\b(bv|bvd|bvard|bulevar|blvd)\b\.?\s*/gi, "Boulevard ")
    .replace(/\bgral\b\.?\s*/gi, "General ")
    .replace(/\bpje\b\.?\s*/gi, "Pasaje ")
    .replace(/\bdr\b\.?\s*/gi, "Doctor ")
    .replace(/\bpte\b\.?\s*/gi, "Presidente ")
    .replace(/\s+/g, " ")
    .trim();

/** Separa la calle de la altura: "colon al 2100" → { calle: "colon", numero: "2100" } */
export function separarAltura(texto: string): { calle: string; numero: string } {
  const t = texto.trim();
  const m = t.match(/^(.*?)(?:\s+(?:al|nro\.?|n°|nº|#))?\s+(\d{1,5})\s*(?:[a-z]\b)?\s*$/i);
  // Calles con número en el nombre ("27 de Abril", "9 de Julio"): sólo es altura si va al final
  if (m && m[1].trim().length >= 3) return { calle: m[1].trim().replace(/[,\s]+$/, ""), numero: m[2] };
  return { calle: t, numero: "" };
}

const NO_CALLE = /^(plaza|puente|rotonda|parque|paseo del|fuente|estaci[oó]n|galer[ií]a|shopping|centro comercial)\b/i;

/**
 * Sugerencias de calles de Córdoba mientras el usuario escribe.
 * Busca sólo calles (no paradas de colectivo ni comercios), con el nombre bien escrito
 * (con tildes y "Avenida" completo), y le agrega la altura que escribió el usuario.
 * Las coordenadas quedan vacías: Google Maps ubica mejor "calle + número + barrio".
 */
export async function buscarDirecciones(texto: string, barrio?: string, senal?: AbortSignal): Promise<Sugerencia[]> {
  const { calle, numero } = separarAltura(texto);
  const q = expandir(calle);
  if (q.length < 3) return [];
  const url =
    `https://photon.komoot.io/api/?q=${encodeURIComponent(q + ", Córdoba")}` +
    `&bbox=${BBOX_CORDOBA}&lat=${CENTRO.lat}&lon=${CENTRO.lng}&limit=12&layer=street`;
  const r = await fetch(url, { signal: senal });
  if (!r.ok) return [];
  const j = (await r.json()) as { features?: FeaturePhoton[] };
  const b = plano(barrio);

  // Agrupa los tramos de la misma calle (una avenida larga viene partida por barrio)
  const grupos = new Map<string, { nombre: string; ciudad: string; barrios: string[]; orden: number }>();
  (j.features ?? []).forEach((f, i) => {
    const p = f.properties;
    const nombre = (p.name ?? p.street ?? "").trim();
    if (!nombre || NO_CALLE.test(nombre) || / y (avenida|calle|boulevard)\b/i.test(nombre)) return;
    const ciudad = p.city || p.locality || p.county || "";
    const clave = `${plano(nombre)}|${plano(ciudad)}`;
    const g = grupos.get(clave) ?? { nombre, ciudad, barrios: [], orden: i };
    if (p.district && !g.barrios.includes(p.district)) g.barrios.push(p.district);
    grupos.set(clave, g);
  });

  const esCordoba = (c: string) => plano(c) === "cordoba";
  return [...grupos.values()]
    .sort((x, y) => {
      // Primero las del barrio elegido, después Córdoba capital, después el resto
      const bx = b && x.barrios.some((d) => plano(d) === b) ? 0 : 1;
      const by = b && y.barrios.some((d) => plano(d) === b) ? 0 : 1;
      if (bx !== by) return bx - by;
      if (esCordoba(x.ciudad) !== esCordoba(y.ciudad)) return esCordoba(x.ciudad) ? -1 : 1;
      return x.orden - y.orden;
    })
    .slice(0, 6)
    .map((g) => {
      const enBarrio = b ? g.barrios.find((d) => plano(d) === b) : undefined;
      const zona = enBarrio ?? (g.barrios.length === 1 ? g.barrios[0] : "");
      return {
        texto: numero ? `${g.nombre} ${numero}` : g.nombre,
        detalle: [zona, g.ciudad].filter(Boolean).join(", "),
        lat: null,
        lng: null,
      };
    });
}

/** Dirección aproximada de unas coordenadas (para "usar mi ubicación"). */
export async function direccionDe(lat: number, lng: number): Promise<string> {
  try {
    const r = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&limit=5`);
    if (!r.ok) return "";
    const j = (await r.json()) as { features?: FeaturePhoton[] };
    const fs = j.features ?? [];
    // Preferir una dirección con número; si no, el nombre de la calle (nunca comercios ni paradas)
    const conNumero = fs.find((f) => f.properties.street && f.properties.housenumber);
    if (conNumero) return `${conNumero.properties.street} ${conNumero.properties.housenumber}`;
    const calle = fs.find((f) => f.properties.type === "street" && f.properties.name);
    if (calle) return calle.properties.name!;
    const conCalle = fs.find((f) => f.properties.street);
    return conCalle?.properties.street ?? "";
  } catch {
    return "";
  }
}

/** Datos de la vivienda que complementan la dirección. */
export type TipoVivienda = "casa" | "departamento" | "barrio_cerrado";

export interface Vivienda {
  tipo: TipoVivienda;
  piso: string;
  depto: string;
  barrio_cerrado: string;
  manzana: string;
  lote: string;
  referencias: string;
}

export const VIVIENDA_VACIA: Vivienda = {
  tipo: "casa",
  piso: "",
  depto: "",
  barrio_cerrado: "",
  manzana: "",
  lote: "",
  referencias: "",
};

/** "Piso 3, Depto B" / "Barrio cerrado Las Delicias, Manzana 12, Lote 5" (vacío si no hay datos). */
export function describirVivienda(v: Partial<Vivienda> | null | undefined): string {
  if (!v) return "";
  const partes: string[] = [];
  if (v.tipo === "departamento") {
    if (v.piso?.trim()) partes.push(`Piso ${v.piso.trim()}`);
    if (v.depto?.trim()) partes.push(`Depto ${v.depto.trim()}`);
  }
  if (v.tipo === "barrio_cerrado") {
    if (v.barrio_cerrado?.trim()) partes.push(`Barrio cerrado ${v.barrio_cerrado.trim()}`);
    if (v.manzana?.trim()) partes.push(`Manzana ${v.manzana.trim()}`);
    if (v.lote?.trim()) partes.push(`Lote ${v.lote.trim()}`);
  }
  return partes.join(", ");
}
