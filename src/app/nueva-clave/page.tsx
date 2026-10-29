"use client";
import { TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Cargando, Encabezado } from "@/components/Encabezado";
import { supabase } from "@/lib/supabase";

type Estado = "verificando" | "listo" | "invalido";

/** Página a la que lleva el mail de "recuperar contraseña". */
export default function NuevaClave() {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>("verificando");
  const [motivo, setMotivo] = useState("");
  const [clave, setClave] = useState("");
  const [repetir, setRepetir] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const sb = supabase();
        const q = new URLSearchParams(window.location.search);
        const h = new URLSearchParams(window.location.hash.slice(1));

        const err = q.get("error_description") || h.get("error_description");
        if (err) {
          setMotivo(err.includes("expired") ? "El enlace venció." : err);
          return setEstado("invalido");
        }

        // 1) Enlace con token_hash (funciona desde cualquier navegador)
        const tokenHash = q.get("token_hash");
        if (tokenHash) {
          const { error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
          if (error) {
            setMotivo("El enlace venció o ya se usó.");
            return setEstado("invalido");
          }
          return setEstado("listo");
        }

        // 2) Sesión ya creada automáticamente por el enlace (?code=...)
        const { data } = await sb.auth.getSession();
        if (data.session) return setEstado("listo");

        // 3) Intentos manuales
        const code = q.get("code");
        if (code) {
          const { error } = await sb.auth.exchangeCodeForSession(code);
          if (!error) return setEstado("listo");
          setMotivo("Abrí el enlace en el mismo navegador donde pediste el cambio, o pedí uno nuevo.");
          return setEstado("invalido");
        }
        const at = h.get("access_token");
        const rt = h.get("refresh_token");
        if (at && rt) {
          const { error } = await sb.auth.setSession({ access_token: at, refresh_token: rt });
          if (!error) return setEstado("listo");
        }
        setMotivo("Este enlace no es válido.");
        setEstado("invalido");
      } catch (e) {
        setMotivo(e instanceof Error ? e.message : String(e));
        setEstado("invalido");
      }
    })();
  }, []);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (clave !== repetir) return setError("Las contraseñas no coinciden.");
    setGuardando(true);
    const { error } = await supabase().auth.updateUser({ password: clave });
    setGuardando(false);
    if (error) {
      setError(
        error.message.includes("different from the old")
          ? "La contraseña nueva tiene que ser distinta de la anterior."
          : error.message.includes("Password should")
            ? "La contraseña debe tener al menos 6 caracteres."
            : error.message
      );
    } else router.replace("/panel");
  };

  return (
    <>
      <Encabezado />
      <main className="contenedor max-w-md py-8">
        {estado === "verificando" && <Cargando />}

        {estado === "invalido" && (
          <div className="tarjeta text-center">
            <TriangleAlert className="mx-auto h-10 w-10 text-amber-500" aria-hidden />
            <p className="mt-2 font-semibold">No pudimos validar el enlace</p>
            <p className="mt-1 text-sm text-gris">{motivo}</p>
            <Link href="/ingresar" className="btn mt-4">
              Pedir un enlace nuevo
            </Link>
          </div>
        )}

        {estado === "listo" && (
          <>
            <h1 className="titulo">Elegí tu contraseña nueva</h1>
            <form onSubmit={guardar} className="mt-6 space-y-4">
              <div>
                <label className="etiqueta">Contraseña nueva</label>
                <input className="campo" type="password" minLength={6} required value={clave} onChange={(e) => setClave(e.target.value)} />
              </div>
              <div>
                <label className="etiqueta">Repetila</label>
                <input className="campo" type="password" minLength={6} required value={repetir} onChange={(e) => setRepetir(e.target.value)} />
              </div>
              {error && <p className="aviso-error">{error}</p>}
              <button className="btn w-full" disabled={guardando}>
                {guardando ? "Guardando…" : "Guardar e ingresar"}
              </button>
            </form>
          </>
        )}
      </main>
    </>
  );
}
