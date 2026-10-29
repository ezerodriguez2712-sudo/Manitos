"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Azulejo, Cargando, Encabezado } from "@/components/Encabezado";
import { CampoBarrio } from "@/components/Barrios";
import { CampoDireccion } from "@/components/CampoDireccion";
import { CamposVivienda } from "@/components/CamposVivienda";
import { describirVivienda, VIVIENDA_VACIA, type Ubicacion, type Vivienda } from "@/lib/mapas";
import { BarraInferior } from "@/components/BarraInferior";
import { useAvisos } from "@/lib/useAvisos";
import { useSesion } from "@/lib/useSesion";
import { comprimir, rutaFoto } from "@/lib/imagen";
import { supabase } from "@/lib/supabase";
import type { Rubro } from "@/lib/types";

const MAX_FOTOS = 4;

export default function NuevoPedido() {
  const router = useRouter();
  const { perfil, cargando, error: errorSesion } = useSesion();
  const { total: totalAvisos } = useAvisos(!!perfil);
  const [rubros, setRubros] = useState<Rubro[]>([]);
  const [rubroId, setRubroId] = useState<number | null>(null);
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [zona, setZona] = useState("");
  const [direccion, setDireccion] = useState<Ubicacion>({ texto: "", lat: null, lng: null });
  const [vivienda, setVivienda] = useState<Vivienda>(VIVIENDA_VACIA);
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
      const ruta = rutaFoto(perfil.id, "pedido");
      const { error } = await sb.storage.from("fotos").upload(ruta, await comprimir(f), { contentType: "image/jpeg" });
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
    if (nuevo && direccion.texto.trim()) {
      const v = vivienda;
      const limpio = (x: string) => x.trim() || null;
      const completa = {
        pedido_id: nuevo.id,
        direccion: direccion.texto.trim(),
        lat: direccion.lat,
        lng: direccion.lng,
        tipo: v.tipo,
        piso: v.tipo === "departamento" ? limpio(v.piso) : null,
        depto: v.tipo === "departamento" ? limpio(v.depto) : null,
        barrio_cerrado: v.tipo === "barrio_cerrado" ? limpio(v.barrio_cerrado) : null,
        manzana: v.tipo === "barrio_cerrado" ? limpio(v.manzana) : null,
        lote: v.tipo === "barrio_cerrado" ? limpio(v.lote) : null,
        referencias: limpio(v.referencias),
      };
      const { error: eDir } = await sb.from("pedido_direcciones").insert(completa);
      // Si la base todavía no tiene las columnas nuevas, se guarda todo en el texto
      if (eDir) {
        const texto = [direccion.texto.trim(), describirVivienda(v), v.referencias.trim() && `(${v.referencias.trim()})`]
          .filter(Boolean)
          .join(", ");
        await sb.from("pedido_direcciones").insert({ pedido_id: nuevo.id, direccion: texto });
      }
    }
    setEnviando(false);
    router.replace(nuevo ? `/pedidos/${nuevo.id}` : "/panel");
  };

  return (
    <>
      <Encabezado perfil={perfil} />
      <main className="contenedor max-w-md pb-28 pt-6">
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
            <span className="etiqueta">Fotos (opcional, hasta {MAX_FOTOS})</span>
            <p className="mb-2 text-xs text-gris">Las fotos ayudan a que te pasen un presupuesto más preciso.</p>
            <div className="flex flex-wrap gap-2">
              {fotos.map((f, i) => (
                <div key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={URL.createObjectURL(f)} alt="" className="h-20 w-20 rounded-xl object-cover" />
                  <button
                    type="button"
                    onClick={() => setFotos(fotos.filter((_, j) => j !== i))}
                    className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-tinta text-xs text-white"
                    aria-label="Quitar foto"
                  >
                    ×
                  </button>
                </div>
              ))}
              {fotos.length < MAX_FOTOS && (
                <label className="grid h-20 w-20 cursor-pointer place-items-center rounded-xl border-2 border-dashed border-borde bg-white text-center text-xs font-semibold text-gris hover:border-marca hover:text-marca">
                  <span>
                    <span className="block text-2xl">📷</span>
                    Agregar
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="sr-only"
                    onChange={(e) => {
                      setFotos([...fotos, ...Array.from(e.target.files ?? [])].slice(0, MAX_FOTOS));
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>
          </div>
          <div>
            <label className="etiqueta">Barrio</label>
            <CampoBarrio valor={zona} onChange={setZona} requerido />
          </div>
          <div>
            <label className="etiqueta">Dirección (sólo la ve el profesional que elijas)</label>
            <CampoDireccion valor={direccion} onChange={setDireccion} barrio={zona} />
            <div className="mt-3">
              <CamposVivienda valor={vivienda} onChange={setVivienda} />
            </div>
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
      <BarraInferior perfil={perfil} avisos={totalAvisos} />
    </>
  );
}
