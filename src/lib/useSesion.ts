"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { Perfil } from "./types";

/**
 * Devuelve el usuario logueado y su perfil.
 * Si `requerida` es true y no hay sesión, redirige a /ingresar.
 * Si algo falla, `error` trae el motivo (para no quedar cargando para siempre).
 */
export function useSesion(requerida = true) {
  const router = useRouter();
  const [usuario, setUsuario] = useState<User | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const cargarPerfil = useCallback(async (id: string) => {
    const { data, error } = await supabase().from("perfiles").select("*").eq("id", id).maybeSingle();
    if (error) setError("No se pudo leer tu perfil: " + error.message);
    else if (!data) setError("Tu cuenta no tiene perfil creado. Volvé a registrarte o avisá al administrador.");
    setPerfil(data as Perfil | null);
  }, []);

  useEffect(() => {
    let activo = true;
    (async () => {
      try {
        const { data, error } = await supabase().auth.getUser();
        if (!activo) return;
        if (error || !data.user) {
          if (requerida) router.replace("/ingresar");
          return;
        }
        setUsuario(data.user);
        await cargarPerfil(data.user.id);
      } catch (e) {
        if (activo) setError("No se pudo conectar con el servidor: " + (e instanceof Error ? e.message : String(e)));
      } finally {
        if (activo) setCargando(false);
      }
    })();
    return () => {
      activo = false;
    };
  }, [requerida, router, cargarPerfil]);

  return {
    usuario,
    perfil,
    cargando,
    error,
    recargarPerfil: () => usuario && cargarPerfil(usuario.id),
  };
}
