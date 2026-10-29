"use client";
import { useEffect, useState } from "react";
import { SelloVerificado } from "@/components/Encabezado";
import { supabase } from "@/lib/supabase";
import { comprimir, rutaFoto } from "@/lib/imagen";
import { hace, type Perfil, type Verificacion as Datos } from "@/lib/types";

const BUCKET = "documentos";

/** Pedido de verificación del profesional: DNI (obligatorio) y matrícula (opcional). */
export function Verificacion({ perfil }: { perfil: Perfil }) {
  const [v, setV] = useState<Datos | null | undefined>(undefined); // undefined = cargando
  const [disponible, setDisponible] = useState(true);
  const [abierto, setAbierto] = useState(false);

  const cargar = async () => {
    const { data, error } = await supabase().from("verificaciones").select("*").eq("perfil_id", perfil.id).maybeSingle();
    if (error) setDisponible(false); // la base todavía no tiene la función
    setV((data as Datos) ?? null);
  };
  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil.id]);

  if (v === undefined || !disponible) return null;

  if (perfil.verificado || v?.estado === "aprobada")
    return (
      <section id="verificacion" className="mt-3 flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 p-3">
        <SelloVerificado matriculado={perfil.matriculado} />
        <p className="text-sm text-green-900">Los clientes ven el sello en tus presupuestos y en tu perfil.</p>
      </section>
    );

  if (v?.estado === "pendiente" && !abierto)
    return (
      <section id="verificacion" className="mt-3 rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
        <b>⏳ Estamos revisando tus documentos.</b> Los enviaste {hace(v.enviado_en)}. Te avisamos por mail cuando esté listo
        (normalmente en menos de 48 horas).
      </section>
    );

  if (!abierto)
    return (
      <section id="verificacion" className="mt-3 rounded-2xl border-2 border-dashed border-green-300 bg-white p-4">
        {v?.estado === "rechazada" ? (
          <>
            <p className="font-bold text-red-700">No pudimos verificar tu perfil</p>
            <p className="mt-1 text-sm">
              <b>Motivo:</b> {v.nota}
            </p>
          </>
        ) : (
          <>
            <p className="flex items-center gap-2 font-bold">
              Conseguí el sello <SelloVerificado chico />
            </p>
            <p className="mt-1 text-sm text-gris">
              Subí una foto de tu DNI (y tu matrícula si tenés). Los perfiles verificados generan más confianza y los clientes los
              eligen más.
            </p>
          </>
        )}
        <button type="button" onClick={() => setAbierto(true)} className="btn mt-3 w-full py-2.5">
          {v?.estado === "rechazada" ? "Volver a enviar" : "Verificar mi perfil"}
        </button>
      </section>
    );

  return <Formulario perfil={perfil} previo={v} alCancelar={() => setAbierto(false)} alEnviar={() => { setAbierto(false); cargar(); }} />;
}

function Formulario({
  perfil,
  previo,
  alCancelar,
  alEnviar,
}: {
  perfil: Perfil;
  previo: Datos | null;
  alCancelar: () => void;
  alEnviar: () => void;
}) {
  const [frente, setFrente] = useState<File | null>(null);
  const [dorso, setDorso] = useState<File | null>(null);
  const [matFoto, setMatFoto] = useState<File | null>(null);
  const [matricula, setMatricula] = useState(previo?.matricula ?? "");
  const [acepto, setAcepto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!frente || !dorso) return setError("Subí las dos fotos del DNI (frente y dorso).");
    if (matricula.trim() && !matFoto) return setError("Si cargás el número de matrícula, subí también una foto de la matrícula o credencial.");
    setEnviando(true);
    const sb = supabase();
    const subir = async (f: File, nombre: string) => {
      const ruta = rutaFoto(perfil.id, nombre);
      const { error } = await sb.storage.from(BUCKET).upload(ruta, await comprimir(f, 2000, 0.88), { contentType: "image/jpeg" });
      if (error) throw new Error("No se pudo subir la foto: " + error.message);
      return ruta;
    };
    try {
      const datos = {
        perfil_id: perfil.id,
        estado: "pendiente",
        dni_frente: await subir(frente, "dni-frente"),
        dni_dorso: await subir(dorso, "dni-dorso"),
        matricula_foto: matFoto ? await subir(matFoto, "matricula") : null,
        matricula: matricula.trim() || null,
        nota: null,
        revisado_en: null,
        enviado_en: new Date().toISOString(),
      };
      const { error } = await sb.from("verificaciones").upsert(datos);
      if (error) throw new Error(error.message);
      // Borra los documentos del envío anterior
      if (previo) {
        const viejos = [previo.dni_frente, previo.dni_dorso, previo.matricula_foto].filter((x): x is string => !!x);
        if (viejos.length) await sb.storage.from(BUCKET).remove(viejos);
      }
      alEnviar();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setEnviando(false);
    }
  };

  return (
    <form id="verificacion" onSubmit={enviar} className="tarjeta mt-3 space-y-4">
      <div>
        <h2 className="text-lg font-bold">Verificar mi perfil</h2>
        <p className="text-sm text-gris">
          Las fotos son privadas: sólo las ve el equipo de Manitos para confirmar tu identidad. Nunca se muestran a clientes.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <CampoFoto etiqueta="DNI · frente" archivo={frente} onChange={setFrente} />
        <CampoFoto etiqueta="DNI · dorso" archivo={dorso} onChange={setDorso} />
      </div>
      <div className="rounded-xl bg-fondo p-3">
        <p className="text-sm font-semibold">Matrícula (opcional)</p>
        <p className="text-xs text-gris">Para gasistas, electricistas y otros oficios matriculados. Suma el sello “Matriculado”.</p>
        <label htmlFor="matricula" className="etiqueta mt-2">Número de matrícula</label>
        <input id="matricula" className="campo bg-white" placeholder="Ej: MP 12345" value={matricula} onChange={(e) => setMatricula(e.target.value)} />
        <div className="mt-3 w-1/2 pr-1.5">
          <CampoFoto etiqueta="Foto de la matrícula" archivo={matFoto} onChange={setMatFoto} />
        </div>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-marca" />
        <span>Acepto que Manitos use estas fotos sólo para verificar mi identidad, según la política de privacidad.</span>
      </label>
      {error && <p className="aviso-error">{error}</p>}
      <div className="flex gap-2">
        <button className="btn flex-1" disabled={enviando || !acepto}>
          {enviando ? "Enviando…" : "Enviar para revisión"}
        </button>
        <button type="button" onClick={alCancelar} className="btn-sec">Cancelar</button>
      </div>
    </form>
  );
}

function CampoFoto({ etiqueta, archivo, onChange }: { etiqueta: string; archivo: File | null; onChange: (f: File | null) => void }) {
  const [vista, setVista] = useState<string | null>(null);
  useEffect(() => {
    if (!archivo) return setVista(null);
    const u = URL.createObjectURL(archivo);
    setVista(u);
    return () => URL.revokeObjectURL(u);
  }, [archivo]);
  return (
    <label className="block cursor-pointer">
      <span className="etiqueta">{etiqueta}</span>
      <span className="grid aspect-[3/2] place-items-center overflow-hidden rounded-xl border-2 border-dashed border-borde bg-white text-center text-xs font-semibold text-gris hover:border-marca hover:text-marca">
        {vista ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={vista} alt={etiqueta} className="h-full w-full object-cover" />
        ) : (
          <span>
            <span className="block text-2xl">🪪</span>
            Sacar o subir foto
          </span>
        )}
      </span>
      <input type="file" accept="image/*" className="sr-only" onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
    </label>
  );
}
