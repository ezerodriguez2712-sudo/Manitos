"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Azulejo, Cargando, Encabezado } from "@/components/Encabezado";
import { BarraInferior } from "@/components/BarraInferior";
import { useAvisos } from "@/lib/useAvisos";
import { useSesion } from "@/lib/useSesion";
import { comprimir, rutaFoto } from "@/lib/imagen";
import { fotoUrl, supabase } from "@/lib/supabase";
import { mensajeError, type Pedido } from "@/lib/types";

const MAX_FOTOS = 4;

export default function EditarPedido() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { perfil, cargando, error: errorSesion } = useSesion();
  const { total } = useAvisos(!!perfil);
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [presupuestos, setPresupuestos] = useState(0);
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [urgente, setUrgente] = useState(false);
  const [fotos, setFotos] = useState<string[]>([]);
  const [nuevas, setNuevas] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [noSePuede, setNoSePuede] = useState("");

  useEffect(() => {
    if (!perfil) return;
    const sb = supabase();
    sb.from("pedidos")
      .select("*, rubros(*), presupuestos(count)")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data || data.cliente_id !== perfil.id) return setNoSePuede("Este pedido no existe o no es tuyo.");
        if (data.estado !== "abierto") return setNoSePuede("Sólo se puede editar un pedido mientras recibe presupuestos.");
        setPedido(data as Pedido);
        setPresupuestos((data.presupuestos as { count: number }[] | undefined)?.[0]?.count ?? 0);
        setTitulo(data.titulo);
        setDescripcion(data.descripcion);
        setUrgente(data.urgencia === "urgente");
        setFotos(data.fotos ?? []);
      });
  }, [id, perfil]);

  if (cargando || !perfil) return (<><Encabezado /><Cargando error={errorSesion} /></>);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pedido) return;
    setError("");
    setGuardando(true);
    const sb = supabase();
    const rutas = [...fotos];
    for (const f of nuevas) {
      const ruta = rutaFoto(perfil.id, "pedido");
      const { error } = await sb.storage.from("fotos").upload(ruta, await comprimir(f), { contentType: "image/jpeg" });
      if (!error) rutas.push(ruta);
    }
    const { error } = await sb
      .from("pedidos")
      .update({ titulo: titulo.trim(), descripcion: descripcion.trim(), urgencia: urgente ? "urgente" : "normal", fotos: rutas })
      .eq("id", pedido.id);
    if (error) {
      setGuardando(false);
      return setError(mensajeError(error, "No se pudieron guardar los cambios: " + error.message));
    }
    // Borra del depósito las fotos que se quitaron
    const quitadas = (pedido.fotos ?? []).filter((f) => !rutas.includes(f));
    if (quitadas.length) await sb.storage.from("fotos").remove(quitadas);
    router.replace(`/pedidos/${pedido.id}`);
  };

  const cantidad = fotos.length + nuevas.length;

  return (
    <>
      <Encabezado perfil={perfil} />
      <main className="contenedor max-w-md pb-28 pt-6">
        <Link href={`/pedidos/${id}`} className="text-sm text-gris hover:text-tinta">← Volver al pedido</Link>
        <h1 className="titulo mt-2">Editar pedido</h1>
        {noSePuede ? (
          <p className="tarjeta mt-6 text-center text-gris">{noSePuede}</p>
        ) : !pedido ? (
          <Cargando />
        ) : (
          <form onSubmit={guardar} className="mt-6 space-y-5">
            <div className="flex items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-borde">
              <Azulejo nombre={pedido.rubros?.nombre} icono={pedido.rubros?.icono} chico />
              <p className="text-sm">
                <b>{pedido.rubros?.nombre}</b> en {pedido.zona}
                <span className="block text-xs text-gris">El rubro y el barrio no se cambian: si te equivocaste, cancelalo y publicá otro.</span>
              </p>
            </div>
            {presupuestos > 0 && (
              <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                Ya recibiste {presupuestos} presupuesto{presupuestos === 1 ? "" : "s"}. Les vamos a mostrar a esos profesionales que
                editaste el pedido para que revisen su precio.
              </p>
            )}
            <div>
              <label className="etiqueta" htmlFor="titulo">Título corto</label>
              <input id="titulo" className="campo" required maxLength={80} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            </div>
            <div>
              <label className="etiqueta" htmlFor="descripcion">Detalle del problema</label>
              <textarea id="descripcion" className="campo min-h-32" required value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
            </div>
            <div>
              <span className="etiqueta">Fotos (hasta {MAX_FOTOS})</span>
              <div className="flex flex-wrap gap-2">
                {fotos.map((f) => (
                  <Miniatura key={f} src={fotoUrl(f)} onQuitar={() => setFotos(fotos.filter((x) => x !== f))} />
                ))}
                {nuevas.map((f, i) => (
                  <MiniaturaArchivo key={i} archivo={f} onQuitar={() => setNuevas(nuevas.filter((_, j) => j !== i))} />
                ))}
                {cantidad < MAX_FOTOS && (
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
                        setNuevas([...nuevas, ...Array.from(e.target.files ?? [])].slice(0, MAX_FOTOS - fotos.length));
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
              </div>
            </div>
            <label className="flex items-center gap-3 rounded-xl border border-borde bg-white p-3">
              <input type="checkbox" checked={urgente} onChange={(e) => setUrgente(e.target.checked)} className="h-5 w-5 accent-marca" />
              <span>
                <b>Es urgente</b>
                <span className="block text-sm text-gris">Se destaca para los profesionales</span>
              </span>
            </label>
            <p className="text-xs text-gris">
              ¿Querés cambiar la dirección? Escribísela al profesional que elijas por el chat.
            </p>
            {error && <p className="aviso-error">{error}</p>}
            <button className="btn w-full" disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar cambios"}
            </button>
          </form>
        )}
      </main>
      <BarraInferior perfil={perfil} avisos={total} />
    </>
  );
}

function Miniatura({ src, onQuitar }: { src: string; onQuitar: () => void }) {
  return (
    <div className="relative">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="h-20 w-20 rounded-xl object-cover" />
      <button
        type="button"
        onClick={onQuitar}
        className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-tinta text-xs text-white"
        aria-label="Quitar foto"
      >
        ×
      </button>
    </div>
  );
}

function MiniaturaArchivo({ archivo, onQuitar }: { archivo: File; onQuitar: () => void }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const u = URL.createObjectURL(archivo);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [archivo]);
  return url ? <Miniatura src={url} onQuitar={onQuitar} /> : null;
}
