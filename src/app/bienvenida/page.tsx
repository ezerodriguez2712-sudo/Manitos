"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Cargando, Encabezado } from "@/components/Encabezado";
import { supabase } from "@/lib/supabase";
import { useSesion } from "@/lib/useSesion";
import type { Rol } from "@/lib/types";

/** Después de entrar con Google: elegir si es cliente o profesional y cargar el celular. */
function Contenido() {
  const router = useRouter();
  const params = useSearchParams();
  const { perfil, cargando, error: errorSesion } = useSesion();
  const [rol, setRol] = useState<Rol>(params.get("rol") === "profesional" ? "profesional" : "cliente");
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!perfil) return;
    if (perfil.registro_completo !== false) router.replace("/panel");
    else setNombre((n) => n || perfil.nombre || "");
  }, [perfil, router]);

  if (cargando || !perfil || perfil.registro_completo !== false) return (<><Encabezado /><Cargando error={errorSesion} /></>);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (telefono.replace(/\D/g, "").length < 8) return setError("Revisá el celular: tiene que tener código de área y número.");
    setEnviando(true);
    const { error } = await supabase().rpc("completar_registro", { p_rol: rol, p_nombre: nombre, p_telefono: telefono });
    if (error) {
      setError(/^(Elegí|Poné|Revisá|Tu cuenta)/.test(error.message) ? error.message : "No se pudo guardar. Probá de nuevo.");
      setEnviando(false);
      return;
    }
    window.location.replace(rol === "profesional" ? "/perfil?bienvenida=1" : "/panel");
  };

  return (
    <>
      <Encabezado />
      <main className="contenedor max-w-md py-8">
        <h1 className="titulo">¡Ya casi!</h1>
        <p className="mt-2 text-gris">Contanos dos cosas más para terminar tu cuenta.</p>
        <form onSubmit={enviar} className="mt-6 space-y-4">
          <div>
            <span className="etiqueta">¿Para qué vas a usar Manitos?</span>
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-white p-1 ring-1 ring-borde">
              {(["cliente", "profesional"] as Rol[]).map((r) => (
                <button
                  type="button"
                  key={r}
                  onClick={() => setRol(r)}
                  className={`rounded-lg py-2.5 text-sm font-semibold ${rol === r ? "bg-marca text-white" : "text-gris"}`}
                >
                  {r === "cliente" ? "Necesito un servicio" : "Soy profesional"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="etiqueta" htmlFor="nombre">Nombre y apellido</label>
            <input id="nombre" className="campo" required value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div>
            <label className="etiqueta" htmlFor="tel">Celular (WhatsApp)</label>
            <input id="tel" className="campo" type="tel" placeholder="351 555 1234" required value={telefono} onChange={(e) => setTelefono(e.target.value)} />
            <p className="mt-1 text-xs text-gris">Solo lo ve la persona con la que concretás un trabajo.</p>
          </div>
          <p className="text-xs text-gris">
            Al continuar aceptás los{" "}
            <a href="/terminos" target="_blank" rel="noopener" className="underline">términos y condiciones</a> y la{" "}
            <a href="/privacidad" target="_blank" rel="noopener" className="underline">política de privacidad</a>.
          </p>
          {error && <p className="aviso-error">{error}</p>}
          <button className="btn w-full" disabled={enviando}>{enviando ? "Un momento…" : "Listo, entrar"}</button>
        </form>
      </main>
    </>
  );
}

export default function Bienvenida() {
  return (
    <Suspense>
      <Contenido />
    </Suspense>
  );
}
