"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { EmailOtpType } from "@supabase/supabase-js";
import { Cargando, Encabezado } from "@/components/Encabezado";
import { supabase } from "@/lib/supabase";

/** Página a la que lleva el mail de "confirmá tu cuenta" (y el de cambio de email). */
export default function Confirmar() {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const sb = supabase();
        const q = new URLSearchParams(window.location.search);
        const h = new URLSearchParams(window.location.hash.slice(1));
        const err = q.get("error_description") || h.get("error_description");
        if (err) return setError(err.includes("expired") ? "El enlace venció." : err);

        const tokenHash = q.get("token_hash");
        const tipo = (q.get("type") || "email") as EmailOtpType;
        if (tokenHash) {
          const { error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: tipo });
          if (error) return setError("El enlace venció o ya se usó. Probá ingresar: si la cuenta ya estaba confirmada, vas a poder entrar.");
        } else {
          const code = q.get("code");
          if (code) await sb.auth.exchangeCodeForSession(code).catch(() => {});
        }

        const { data } = await sb.auth.getUser();
        if (!data.user) return setError("No pudimos confirmar la cuenta. Probá ingresar con tu email y contraseña.");
        const { data: perfil } = await sb.from("perfiles").select("rol").eq("id", data.user.id).maybeSingle();
        router.replace(perfil?.rol === "profesional" ? "/perfil?bienvenida=1" : "/panel");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [router]);

  return (
    <>
      <Encabezado />
      <main className="contenedor max-w-md py-8">
        {!error ? (
          <>
            <p className="text-center text-gris">Confirmando tu cuenta…</p>
            <Cargando />
          </>
        ) : (
          <div className="tarjeta text-center">
            <p className="text-3xl">⚠️</p>
            <p className="mt-2 font-semibold">No pudimos confirmar la cuenta</p>
            <p className="mt-1 text-sm text-gris">{error}</p>
            <Link href="/ingresar" className="btn mt-4">
              Ir a ingresar
            </Link>
          </div>
        )}
      </main>
    </>
  );
}
