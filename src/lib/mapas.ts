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
    osm_value?: string;
  };
}

export interface Sugerencia extends Ubicacion {
  detalle: string;
}

function aSugerencia(f: FeaturePhoton): Sugerencia {
  const p = f.properties;
  const calle = p.street ? `${p.street}${p.housenumber ? " " + p.housenumber : ""}` : p.name ?? "";
  const lugar = p.name && p.street && p.name !== p.street ? p.name : "";
  const zona = p.district || p.locality || p.city || p.county || "";
  const [lng, lat] = f.geometry.coordinates;
  return {
    texto: [lugar, calle].filter(Boolean).join(", ") || zona,
    detalle: [zona, p.city && p.city !== zona ? p.city : ""].filter(Boolean).join(", "),
    lat,
    lng,
  };
}

/** Sugerencias de direcciones en Córdoba mientras el usuario escribe. */
export async function buscarDirecciones(texto: string, senal?: AbortSignal): Promise<Sugerencia[]> {
  const q = texto.trim();
  if (q.length < 4) return [];
  const url =
    `https://photon.komoot.io/api/?q=${encodeURIComponent(q + " Córdoba")}` +
    `&bbox=${BBOX_CORDOBA}&lat=${CENTRO.lat}&lon=${CENTRO.lng}&limit=6`;
  const r = await fetch(url, { signal: senal });
  if (!r.ok) return [];
  const j = (await r.json()) as { features?: FeaturePhoton[] };
  const vistas = new Set<string>();
  return (j.features ?? [])
    .map(aSugerencia)
    .filter((s) => {
      const k = `${s.texto}|${s.detalle}`;
      if (!s.texto || vistas.has(k)) return false;
      vistas.add(k);
      return true;
    });
}

/** Dirección aproximada de unas coordenadas (para "usar mi ubicación"). */
export async function direccionDe(lat: number, lng: number): Promise<string> {
  try {
    const r = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&limit=1`);
    if (!r.ok) return "";
    const j = (await r.json()) as { features?: FeaturePhoton[] };
    const f = j.features?.[0];
    return f ? aSugerencia(f).texto : "";
  } catch {
    return "";
  }
}
