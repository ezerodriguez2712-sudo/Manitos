"use client";
import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Avatar, Azulejo, Cargando, Encabezado, Estrellas, SelloVerificado } from "@/components/Encabezado";
import { Verificacion } from "@/components/Verificacion";
import { GaleriaTrabajos } from "@/components/GaleriaTrabajos";
import { CampoBarrio, SelectorZonas } from "@/components/Barrios";
import { BarraInferior } from "@/components/BarraInferior";
import { PieLegal } from "@/components/Legal";
import { BorrarCuenta } from "@/components/BorrarCuenta";
import { useAvisos } from "@/lib/useAvisos";
import { useSesion } from "@/lib/useSesion";
import { supabase } from "@/lib/supabase";
import { comprimir, rutaFoto } from "@/lib/imagen";
import type { Perfil, Reputacion, Rubro } from "@/lib/types";

function Formulario({ perfil, alGuardar }: { perfil: Perfil; alGuardar: () => void }) {
  const router = useRouter();
  const bienvenida = useSearchParams().get("bienvenida");
  const esPro = perfil.rol === "profesional";
  const [nombre, setNombre] = useState(perfil.nombre ?? "");
  const [barrio, setBarrio] = useState(perfil.zona ?? "");
  const [zonas, setZonas] = useState<string[]>(perfil.zonas ?? []);
  const [descripcion, setDescripcion] = useState(perfil.descripcion ?? "");
  const [foto, setFoto] = useState<string | null>(perfil.foto ?? null);
  const [subiendo, setSubiendo] = useState(false);
  const [telefono, setTelefono] = useState("");
  const [rubros, setRubros] = useState<Rubro[]>([]);
  const [mios, setMios] = useState<Set<number>>(new Set());
  const [rep, setRep] = useState<Reputacion | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);
  const [avisosMail, setAvisosMail] = useState(perfil.avisos_mail !== false);
  const archivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const sb = supabase();
    sb.from("contactos").select("telefono").eq("perfil_id", perfil.id).maybeSingle()
      .then(({ data }) => setTelefono(data?.telefono ?? ""));
    sb.from("rubros").select("*").order("nombre").then(({ data }) => setRubros(data ?? []));
    sb.from("reputacion").select("*").eq("perfil_id", perfil.id).maybeSingle().then(({ data }) => setRep(data));
    if (esPro)
      sb.from("profesional_rubros")
        .select("rubro_id")
        .eq("profesional_id", perfil.id)
        .then(({ data }) => setMios(new Set((data ?? []).map((r) => r.rubro_id))));
  }, [perfil.id, esPro]);

  const alternar = (id: number) => {
    const s = new Set(mios);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setMios(s);
  };

  const subirFoto = async (f?: File) => {
    if (!f) return;
    setSubiendo(true);
    setError("");
    const sb = supabase();
    const ruta = rutaFoto(perfil.id, "perfil");
    const { error } = await sb.storage.from("fotos").upload(ruta, await comprimir(f, 600), { contentType: "image/jpeg" });
    if (error) setError("No se pudo subir la foto: " + error.message);
    else {
      await sb.from("perfiles").update({ foto: ruta }).eq("id", perfil.id);
      setFoto(ruta);
      alGuardar();
    }
    setSubiendo(false);
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setOk(false);
    if (esPro && mios.size === 0) return setError("Elegí al menos un rubro.");
    if (esPro && zonas.length === 0) return setError("Elegí al menos una zona donde trabajás.");
    if (telefono.replace(/\D/g, "").length < 8) return setError("Revisá el celular: tiene que tener código de área y número.");
    setGuardando(true);
    const sb = supabase();
    const datos = esPro
      ? { nombre, descripcion, zonas, zona: zonas.join(", ") }
      : { nombre, zona: barrio };
    const { error: e1 } = await sb.from("perfiles").update(datos).eq("id", perfil.id);
    if (!e1) await sb.from("contactos").upsert({ perfil_id: perfil.id, telefono });
    if (!e1 && esPro) {
      await sb.from("profesional_rubros").delete().eq("profesional_id", perfil.id);
      await sb.from("profesional_rubros").insert([...mios].map((rubro_id) => ({ profesional_id: perfil.id, rubro_id })));
    }
    setGuardando(false);
    if (e1) return setError(e1.message);
    alGuardar();
    if (bienvenida) router.push("/panel");
    else setOk(true);
  };

  return (
    <main className="contenedor max-w-md pb-28 pt-6">
      {bienvenida && (
        <p className="mb-4 rounded-xl border-2 border-dashed border-cinta-oscuro bg-cinta/20 p-3 text-sm">
          ¡Bienvenido! Completá tus rubros y tus zonas para empezar a recibir pedidos.
        </p>
      )}

      <section className="tarjeta flex items-center gap-4">
        <button
          type="button"
          onClick={() => archivo.current?.click()}
          className="group relative rounded-full"
          aria-label="Cambiar foto de perfil"
        >
          <Avatar nombre={nombre} foto={foto} tam={76} />
          <span className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full border-2 border-white bg-marca text-xs text-white">
            {subiendo ? "…" : "📷"}
          </span>
        </button>
        <input ref={archivo} type="file" accept="image/*" hidden onChange={(e) => subirFoto(e.target.files?.[0])} />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-extrabold tracking-tight">{nombre || "Mi perfil"}</h1>
          <p className="flex flex-wrap items-center gap-1.5 text-sm text-gris">
            {esPro ? "Profesional" : "Cliente"}
            {perfil.verificado && <SelloVerificado matriculado={perfil.matriculado} chico />}
          </p>
          <div className="mt-1">
            <Estrellas promedio={rep?.promedio} cantidad={rep?.cantidad} />
          </div>
        </div>
      </section>
      {esPro && (
        <Link href={`/profesionales/${perfil.id}`} className="btn-sec mt-3 w-full py-2.5 text-sm">
          Ver mi perfil como lo ven los clientes
        </Link>
      )}
      {esPro && <Verificacion perfil={perfil} />}
      {esPro && (
        <div className="mt-3">
          <GaleriaTrabajos profesionalId={perfil.id} editable />
        </div>
      )}

      <form onSubmit={guardar} className="mt-6 space-y-5">
        <div>
          <label className="etiqueta">Nombre y apellido</label>
          <input className="campo" required value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </div>
        <div>
          <label className="etiqueta">Celular (WhatsApp)</label>
          <input className="campo" type="tel" inputMode="tel" placeholder="351 555 1234" required value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          <p className="mt-1 text-xs text-gris">Sólo lo ve la persona con la que confirmás un trabajo.</p>
        </div>

        {esPro ? (
          <>
            <div>
              <label className="etiqueta">Rubros que atendés</label>
              <div className="grid grid-cols-2 gap-2">
                {rubros.map((r) => (
                  <button
                    type="button"
                    key={r.id}
                    onClick={() => alternar(r.id)}
                    aria-pressed={mios.has(r.id)}
                    className={`flex items-center gap-2 rounded-xl border-2 p-1.5 text-left text-sm font-semibold leading-tight ${
                      mios.has(r.id) ? "border-marca bg-marca-suave" : "border-transparent bg-white"
                    }`}
                  >
                    <Azulejo nombre={r.nombre} icono={r.icono} chico />
                    {r.nombre}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="etiqueta">Zonas donde trabajás</label>
              <p className="mb-2 text-xs text-gris">Te mostramos primero los pedidos de estos barrios.</p>
              <SelectorZonas zonas={zonas} onChange={setZonas} />
            </div>
            <div>
              <label className="etiqueta">Sobre vos y tu trabajo</label>
              <textarea
                className="campo min-h-28"
                maxLength={500}
                placeholder="Ej: Gasista matriculado, 15 años de experiencia. Trabajo con garantía."
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
              />
              <p className="mt-1 text-right text-xs text-gris">{descripcion.length}/500</p>
            </div>
          </>
        ) : (
          <div>
            <label className="etiqueta">Tu barrio</label>
            <CampoBarrio valor={barrio} onChange={setBarrio} />
          </div>
        )}

        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-borde bg-white p-3">
          <span>
            <b className="block">Avisos por mail</b>
            <span className="text-sm text-gris">
              {esPro
                ? "Te avisamos cuando entra un pedido de tus rubros en tus zonas y cuando te eligen."
                : "Te avisamos cuando te llega un presupuesto."}
            </span>
          </span>
          <input
            type="checkbox"
            className="h-6 w-6 shrink-0 accent-marca"
            checked={avisosMail}
            onChange={async (e) => {
              const v = e.target.checked;
              setAvisosMail(v);
              const { error } = await supabase().from("perfiles").update({ avisos_mail: v }).eq("id", perfil.id);
              if (error) {
                setAvisosMail(!v);
                setError("No se pudo cambiar la preferencia de avisos.");
              }
            }}
          />
        </label>

        {error && <p className="aviso-error">{error}</p>}
        {ok && <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">Cambios guardados.</p>}
        <button className="btn w-full" disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar cambios"}
        </button>
      </form>
      {perfil.es_admin && (
        <Link href="/admin" className="tarjeta mt-6 flex items-center justify-between font-semibold hover:border-marca">
          <span>📊 Panel de administrador</span>
          <span className="text-marca">→</span>
        </Link>
      )}
      <BorrarCuenta perfilId={perfil.id} />
      <PieLegal />
    </main>
  );
}

export default function PaginaPerfil() {
  const { perfil, cargando, error: errorSesion, recargarPerfil } = useSesion();
  const { total } = useAvisos(!!perfil);
  return (
    <>
      <Encabezado perfil={perfil} />
      {cargando || !perfil ? (
        <Cargando error={errorSesion} />
      ) : (
        <Suspense>
          <Formulario perfil={perfil} alGuardar={() => recargarPerfil()} />
        </Suspense>
      )}
      {perfil && <BarraInferior perfil={perfil} avisos={total} />}
    </>
  );
}
