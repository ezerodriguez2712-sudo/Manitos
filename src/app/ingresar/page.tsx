"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Encabezado } from "@/components/Encabezado";
import { supabase } from "@/lib/supabase";
import type { Rol } from "@/lib/types";
import { borrarBorrador, guardarBorrador, leerBorrador } from "@/lib/borrador";
import { CONFIG } from "@/lib/config";

interface Borrador {
  modo: "ingreso" | "registro" | "recuperar";
  rol: Rol;
  nombre: string;
  telefono: string;
  email: string;
}

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

  // Si salió a leer los términos y volvió, recupera lo que había escrito (nunca la contraseña)
  const [restaurado, setRestaurado] = useState(false);
  useEffect(() => {
    const b = leerBorrador<Borrador>("registro");
    if (b && !params.get("modo")) {
      if (b.modo) setModo(b.modo);
      if (b.rol) setRol(b.rol);
    }
    if (b?.nombre) setNombre(b.nombre);
    if (b?.telefono) setTelefono(b.telefono);
    if (b?.email) setEmail(b.email);
    setRestaurado(true);
  }, [params]);
  useEffect(() => {
    if (restaurado) guardarBorrador<Borrador>("registro", { modo, rol, nombre, telefono, email });
  }, [restaurado, modo, rol, nombre, telefono, email]);

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
        else if (!data.session) {
          borrarBorrador("registro");
          setInfo("Te mandamos un mail para confirmar la cuenta. Abrilo y después ingresá.");
        } else {
          borrarBorrador("registro");
          router.replace(rol === "profesional" ? "/perfil?bienvenida=1" : "/panel");
        }
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

      {modo === "registro" && (
        <div className="mt-6">
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
        </div>
      )}
      {modo !== "recuperar" && <IngresoCon rol={rol} registro={modo === "registro"} />}

      <form onSubmit={enviar} className="mt-6 space-y-4">
        {modo === "registro" && (
          <>
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
            <a href="/terminos" target="_blank" rel="noopener" className="underline">términos y condiciones</a> y la{" "}
            <a href="/privacidad" target="_blank" rel="noopener" className="underline">política de privacidad</a>.
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

type Proveedor = "google" | "facebook";
const PROVEEDORES: { id: Proveedor; texto: string }[] = [
  { id: "google", texto: "Google" },
  { id: "facebook", texto: "Facebook" },
];

/** Botones para entrar con Google o Facebook (sólo los activados en CONFIG.ingresoCon) */
function IngresoCon({ rol, registro }: { rol: Rol; registro: boolean }) {
  const [yendo, setYendo] = useState<Proveedor | null>(null);
  const [error, setError] = useState("");
  const activos = PROVEEDORES.filter((p) => CONFIG.ingresoCon[p.id]);
  if (!activos.length) return null;
  const ir = async (p: Proveedor) => {
    setError("");
    setYendo(p);
    const { error } = await supabase().auth.signInWithOAuth({
      provider: p,
      options: { redirectTo: `${window.location.origin}/confirmar${registro && rol === "profesional" ? "?rol=profesional" : ""}` },
    });
    if (error) {
      setError("No se pudo abrir " + (p === "google" ? "Google" : "Facebook") + ". Probá de nuevo o usá tu email.");
      setYendo(null);
    }
  };
  return (
    <div className="mt-6">
      <div className="space-y-2">
        {activos.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => ir(p.id)}
            disabled={!!yendo}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-borde bg-white py-3 font-semibold text-tinta hover:border-marca"
          >
            {yendo === p.id ? "Abriendo…" : `Continuar con ${p.texto}`}
          </button>
        ))}
      </div>
      {error && <p className="aviso-error mt-2">{error}</p>}
      <div className="mt-6 flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-gris">
        <span className="h-px flex-1 bg-borde" /> o con tu email <span className="h-px flex-1 bg-borde" />
      </div>
    </div>
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
