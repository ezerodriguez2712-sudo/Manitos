import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Cliente de Supabase para el navegador (se crea una sola vez). */
export function supabase(): SupabaseClient {
  if (!client) {
    const url = normalizarUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim().replace(/^["']|["']$/g, "");
    if (!url || !key) {
      throw new Error(
        "Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY (ver README)."
      );
    }
    client = createBrowserClient(url, key);
  }
  return client;
}

export function fotoUrl(path: string) {
  return supabase().storage.from("fotos").getPublicUrl(path).data.publicUrl;
}

/** Tolera errores comunes al cargar la URL (espacios, comillas, sin https, link del panel). */
function normalizarUrl(valor?: string) {
  if (!valor) return valor;
  let v = valor.trim().replace(/^["']|["']$/g, "");
  if (v.includes("=")) v = v.split("=").pop()!.trim(); // pegaron "CLAVE=valor"
  const panel = v.match(/supabase\.com\/dashboard\/project\/([a-z0-9]+)/i);
  if (panel) return `https://${panel[1]}.supabase.co`;
  if (/^[a-z0-9]{15,}$/i.test(v)) return `https://${v}.supabase.co`; // sólo el ID del proyecto
  if (!/^https?:\/\//i.test(v)) v = "https://" + v;
  return v.replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
}
