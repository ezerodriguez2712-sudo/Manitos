"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { Perfil } from "./types";

/**
 * Devuelve el usuario logueado y su perfil.
 * Si `requerida` es true y no hay sesión, redirige a /ingresar.
 */
export function useSesion(requerida = true) {
  const router = useRouter();
  const [usuario, setUsuario] = useState<User | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargarPerfil = useCallback(async (id: string) => {
    const { data } = await supabase().from("perfiles").select("*").eq("id", id).single();
    setPerfil(data as Perfil | null);
  }, []);

  useEffect(() => {
    let activo = true;
    supabase()
      .auth.getUser()
      .then(async ({ data }) => {
        if (!activo) return;
        if (!data.user) {
          if (requerida) router.replace("/ingresar");
          setCargando(false);
          return;
        }
        setUsuario(data.user);
        await cargarPerfil(data.user.id);
        if (activo) setCargando(false);
      });
    return () => {
      activo = false;
    };
  }, [requerida, router, cargarPerfil]);

  return {
    usuario,
    perfil,
    cargando,
    recargarPerfil: () => usuario && cargarPerfil(usuario.id),
  };
}
