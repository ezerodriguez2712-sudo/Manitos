"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Azulejo, Cargando, Encabezado } from "@/components/Encabezado";
import { useSesion } from "@/lib/useSesion";
import { supabase } from "@/lib/supabase";
import type { Rubro } from "@/lib/types";

const MAX_FOTOS = 4;

export default function NuevoPedido() {
  const router = useRouter();
  const { perfil, cargando, error: errorSesion } = useSesion();
  const [rubros, setRubros] = useState<Rubro[]>([]);
  const [rubroId, setRubroId] = useState<number | null>(null);
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [zona, setZona] = useState("");
  const [direccion, setDireccion] = useState("");
  const [urgente, setUrgente] = useState(false);
  const [fotos, setFotos] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    supabase().from("rubros").select("*").order("nombre").then(({ data }) => setRubros(data ?? []));
  }, []);
  useEffect(() => {
    if (perfil?.zona) setZona(perfil.zona);
    if (perfil && perfil.rol !== "cliente") router.replace("/panel");
  }, [perfil, router]);

  if (cargando || !perfil) return (<><Encabezado /><Cargando error={errorSesion} /></>);

  const publicar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rubroId) return setError("Elegí qué tipo de servicio necesitás.");
    setError("");
    setEnviando(true);
    const sb = supabase();

    const rutas: string[] = [];
    for (const f of fotos) {
      const ext = f.name.split(".").pop() || "jpg";
      const ruta = `${perfil.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await sb.storage.from("fotos").upload(ruta, f);
      if (!error) rutas.push(ruta);
    }

    // Se inserta sin pedir la fila de vuelta y después se busca, para no depender
    // de que la regla de lectura vea el pedido en el mismo instante en que se crea.
    const { error } = await sb.from("pedidos").insert({
      cliente_id: perfil.id,
      rubro_id: rubroId,
      titulo,
      descripcion,
      zona,
      urgencia: urgente ? "urgente" : "normal",
      fotos: rutas,
    });
    if (error) {
      setEnviando(false);
      return setError("No se pudo publicar el pedido: " + error.message);
    }
    const { data: nuevo } = await sb
      .from("pedidos")
      .select("id")
      .eq("cliente_id", perfil.id)
      .order("creado_en", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (nuevo && direccion.trim())
      await sb.from("pedido_direcciones").insert({ pedido_id: nuevo.id, direccion: direccion.trim() });
    setEnviando(false);
    router.replace(nuevo ? `/pedidos/${nuevo.id}` : "/panel");
  };

  return (
    <>
      <Encabezado perfil={perfil} />
      <main className="contenedor max-w-md py-6">
        <h1 className="titulo">¿Qué necesitás?</h1>
        <form onSubmit={publicar} className="mt-6 space-y-5">
          <div>
            <label className="etiqueta">Tipo de servicio</label>
            <div className="grid grid-cols-2 gap-2">
              {rubros.map((r) => (
                <button
                  type="button"
                  key={r.id}
                  onClick={() => setRubroId(r.id)}
                  aria-pressed={rubroId === r.id}
                  className={`flex items-center gap-2.5 rounded-xl border-2 p-2 text-left text-sm font-semibold leading-tight ${
                    rubroId === r.id ? "border-marca bg-marca-suave" : "border-transparent bg-white"
                  }`}
                >
                  <Azulejo nombre={r.nombre} icono={r.icono} chico />
                  {r.nombre}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="etiqueta">Título corto</label>
            <input className="campo" required maxLength={80} placeholder="Ej: Pierde agua la canilla de la cocina" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </div>
          <div>
            <label className="etiqueta">Contá el problema con detalle</label>
            <textarea className="campo min-h-28" required placeholder="Qué pasa, desde cuándo, medidas, materiales…" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          </div>
          <div>
            <label className="etiqueta">Fotos (opcional, hasta {MAX_FOTOS})</label>
            <input
              type="file"
              accept="image/*"
              multiple
              className="campo text-sm"
              onChange={(e) => setFotos(Array.from(e.target.files ?? []).slice(0, MAX_FOTOS))}
            />
            {fotos.length > 0 && (
              <div className="mt-2 flex gap-2">
                {fotos.map((f, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={URL.createObjectURL(f)} alt="" className="h-16 w-16 rounded-lg object-cover" />
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="etiqueta">Barrio</label>
            <input className="campo" required placeholder="Ej: Alta Córdoba" value={zona} onChange={(e) => setZona(e.target.value)} />
          </div>
          <div>
            <label className="etiqueta">Dirección (sólo la ve quien elijas)</label>
            <input className="campo" placeholder="Calle y número" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
          </div>
          <label className="flex items-center gap-3 rounded-xl border border-borde bg-white p-3">
            <input type="checkbox" checked={urgente} onChange={(e) => setUrgente(e.target.checked)} className="h-5 w-5 accent-marca" />
            <span>
              <b>Es urgente</b>
              <span className="block text-sm text-gris">Se destaca para los profesionales</span>
            </span>
          </label>
          {error && <p className="aviso-error">{error}</p>}
          <button className="btn-cinta w-full" disabled={enviando}>
            {enviando ? "Publicando…" : "Publicar y recibir presupuestos"}
          </button>
        </form>
      </main>
    </>
  );
}
