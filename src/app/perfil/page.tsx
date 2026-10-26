"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Cargando, Encabezado, Estrellas } from "@/components/Encabezado";
import { useSesion } from "@/lib/useSesion";
import { supabase } from "@/lib/supabase";
import type { Perfil, Reputacion, Rubro } from "@/lib/types";

function Formulario({ perfil }: { perfil: Perfil }) {
  const router = useRouter();
  const bienvenida = useSearchParams().get("bienvenida");
  const [datos, setDatos] = useState({
    nombre: perfil.nombre ?? "",
    zona: perfil.zona ?? "",
    descripcion: perfil.descripcion ?? "",
  });
  const [telefono, setTelefono] = useState("");
  const [rubros, setRubros] = useState<Rubro[]>([]);
  const [mios, setMios] = useState<Set<number>>(new Set());
  const [rep, setRep] = useState<Reputacion | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const esPro = perfil.rol === "profesional";

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

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (esPro && mios.size === 0) return setError("Elegí al menos un rubro.");
    setGuardando(true);
    const sb = supabase();
    const { error: e1 } = await sb.from("perfiles").update(datos).eq("id", perfil.id);
    if (!e1) await sb.from("contactos").upsert({ perfil_id: perfil.id, telefono });
    if (!e1 && esPro) {
      await sb.from("profesional_rubros").delete().eq("profesional_id", perfil.id);
      await sb
        .from("profesional_rubros")
        .insert([...mios].map((rubro_id) => ({ profesional_id: perfil.id, rubro_id })));
    }
    setGuardando(false);
    if (e1) setError(e1.message);
    else router.push("/panel");
  };

  return (
    <main className="contenedor max-w-md py-6">
      {bienvenida && (
        <p className="mb-4 rounded-xl bg-marca-suave p-3 text-sm text-marca-oscuro">
          ¡Bienvenido! Completá tus rubros y tu zona para empezar a recibir pedidos.
        </p>
      )}
      <div className="flex items-center justify-between">
        <h1 className="titulo">Mi perfil</h1>
        <Estrellas promedio={rep?.promedio} cantidad={rep?.cantidad} />
      </div>
      <p className="text-sm text-gris">{esPro ? "Profesional" : "Cliente"}</p>

      <form onSubmit={guardar} className="mt-6 space-y-4">
        <div>
          <label className="etiqueta">Nombre y apellido</label>
          <input className="campo" required value={datos.nombre} onChange={(e) => setDatos({ ...datos, nombre: e.target.value })} />
        </div>
        <div>
          <label className="etiqueta">Celular (WhatsApp)</label>
          <input className="campo" type="tel" required value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        </div>
        <div>
          <label className="etiqueta">{esPro ? "Zonas donde trabajás" : "Barrio"}</label>
          <input
            className="campo"
            placeholder={esPro ? "Ej: Centro, Nueva Córdoba, Cerro" : "Ej: General Paz"}
            value={datos.zona}
            onChange={(e) => setDatos({ ...datos, zona: e.target.value })}
          />
        </div>

        {esPro && (
          <>
            <div>
              <label className="etiqueta">Sobre vos y tu experiencia</label>
              <textarea
                className="campo min-h-24"
                placeholder="Ej: Gasista matriculado, 15 años de experiencia…"
                value={datos.descripcion}
                onChange={(e) => setDatos({ ...datos, descripcion: e.target.value })}
              />
            </div>
            <div>
              <label className="etiqueta">Rubros que atendés</label>
              <div className="flex flex-wrap gap-2">
                {rubros.map((r) => (
                  <button
                    type="button"
                    key={r.id}
                    onClick={() => alternar(r.id)}
                    className={`rounded-full border px-3 py-1.5 text-sm ${
                      mios.has(r.id) ? "border-marca bg-marca text-white" : "border-borde bg-white"
                    }`}
                  >
                    {r.icono} {r.nombre}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {error && <p className="aviso-error">{error}</p>}
        <button className="btn w-full" disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar"}
        </button>
      </form>
    </main>
  );
}

export default function PaginaPerfil() {
  const { perfil, cargando, error: errorSesion } = useSesion();
  return (
    <>
      <Encabezado perfil={perfil} />
      {cargando || !perfil ? (
        <Cargando error={errorSesion} />
      ) : (
        <Suspense>
          <Formulario perfil={perfil} />
        </Suspense>
      )}
    </>
  );
}
