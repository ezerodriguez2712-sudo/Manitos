import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Cliente de Supabase para el navegador (se crea una sola vez). */
export function supabase(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
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
