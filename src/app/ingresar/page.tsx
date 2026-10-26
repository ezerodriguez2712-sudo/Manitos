"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Encabezado } from "@/components/Encabezado";
import { supabase } from "@/lib/supabase";
import type { Rol } from "@/lib/types";

function Formulario() {
  const params = useSearchParams();
  const router = useRouter();
  const [modo, setModo] = useState<"ingreso" | "registro" | "recuperar">(
    params.get("modo") === "registro" ? "registro" : "ingreso"
  );
  const [rol, setRol] = useState<Rol>(params.get("rol") === "profesional" ? "profesional" : "cliente");
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setInfo("");
    setEnviando(true);
    try {
      const sb = supabase();
      if (modo === "recuperar") {
        const { error } = await sb.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/nueva-clave`,
        });
        if (error) setError(traducir(error.message));
        else setInfo("Si ese email tiene una cuenta, te llegó un mail con un enlace para crear una contraseña nueva. Revisá también spam.");
      } else if (modo === "registro") {
        const { data, error } = await sb.auth.signUp({
          email,
          password: clave,
          options: { data: { nombre, telefono, rol } },
        });
        if (error) setError(traducir(error.message));
        else if (!data.session) setInfo("Te mandamos un mail para confirmar la cuenta. Abrilo y después ingresá.");
        else router.replace(rol === "profesional" ? "/perfil?bienvenida=1" : "/panel");
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password: clave });
        if (error) setError(traducir(error.message));
        else router.replace("/panel");
      }
    } catch (err) {
      setError("No se pudo conectar con el servidor: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <main className="contenedor max-w-md py-8">
      <h1 className="titulo">
        {modo === "registro" ? "Crear cuenta" : modo === "recuperar" ? "Recuperar contraseña" : "Ingresar"}
      </h1>
      {modo === "recuperar" && (
        <p className="mt-2 text-sm text-gris">Poné tu email y te mandamos un enlace para elegir una contraseña nueva.</p>
      )}

      <form onSubmit={enviar} className="mt-6 space-y-4">
        {modo === "registro" && (
          <>
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-white p-1 ring-1 ring-borde">
              {(["cliente", "profesional"] as Rol[]).map((r) => (
                <button
                  type="button"
                  key={r}
                  onClick={() => setRol(r)}
                  className={`rounded-lg py-2.5 text-sm font-semibold ${
                    rol === r ? "bg-marca text-white" : "text-gris"
                  }`}
                >
                  {r === "cliente" ? "Necesito un servicio" : "Soy profesional"}
                </button>
              ))}
            </div>
            <div>
              <label className="etiqueta">Nombre y apellido</label>
              <input className="campo" required value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </div>
            <div>
              <label className="etiqueta">Celular (WhatsApp)</label>
              <input
                className="campo"
                type="tel"
                placeholder="351 555 1234"
                required
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
              />
            </div>
          </>
        )}
        <div>
          <label className="etiqueta">Email</label>
          <input className="campo" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {modo !== "recuperar" && (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="etiqueta mb-0">Contraseña</label>
            {modo === "ingreso" && (
              <button
                type="button"
                className="text-sm font-medium text-marca"
                onClick={() => { setModo("recuperar"); setError(""); setInfo(""); }}
              >
                ¿Olvidaste tu contraseña?
              </button>
            )}
          </div>
          <input
            className="campo"
            type="password"
            minLength={6}
            required
            value={clave}
            onChange={(e) => setClave(e.target.value)}
          />
        </div>
        )}

        {modo === "registro" && (
          <p className="text-xs text-gris">
            Al crear tu cuenta aceptás los{" "}
            <Link href="/terminos" className="underline">términos y condiciones</Link> y la{" "}
            <Link href="/privacidad" className="underline">política de privacidad</Link>.
          </p>
        )}
        {error && <p className="aviso-error">{error}</p>}
        {info && <p className="rounded-xl bg-green-50 px-3 py-2 text-sm text-green-700">{info}</p>}

        <button className="btn w-full" disabled={enviando}>
          {enviando
            ? "Un momento…"
            : modo === "registro"
              ? "Crear cuenta"
              : modo === "recuperar"
                ? "Enviarme el enlace"
                : "Ingresar"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gris">
        {modo === "registro" ? "¿Ya tenés cuenta? " : modo === "recuperar" ? "¿Te acordaste? " : "¿No tenés cuenta? "}
        <button
          className="font-semibold text-marca"
          onClick={() => { setModo(modo === "ingreso" ? "registro" : "ingreso"); setError(""); setInfo(""); }}
        >
          {modo === "ingreso" ? "Registrate" : "Ingresá"}
        </button>
      </p>
    </main>
  );
}

function traducir(msg: string) {
  if (msg.includes("Invalid login")) return "Email o contraseña incorrectos.";
  if (msg.includes("already registered")) return "Ese email ya tiene una cuenta. Probá ingresar.";
  if (msg.includes("Email not confirmed")) return "Todavía no confirmaste tu email. Revisá tu casilla.";
  if (msg.includes("Password should")) return "La contraseña debe tener al menos 6 caracteres.";
  if (msg.includes("For security purposes")) return "Esperá un minuto antes de pedir otro enlace.";
  if (msg.includes("rate limit")) return "Se mandaron demasiados mails de confirmación. Esperá un rato o desactivá 'Confirm email' en Supabase.";
  if (msg.includes("Database error")) return "Error de la base de datos al crear la cuenta. Revisá que se haya ejecutado instalar.sql.";
  return msg;
}

export default function Ingresar() {
  return (
    <>
      <Encabezado />
      <Suspense>
        <Formulario />
      </Suspense>
    </>
  );
}
