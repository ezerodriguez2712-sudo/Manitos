"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Cargando, Encabezado, EstadoChip } from "@/components/Encabezado";
import { useSesion } from "@/lib/useSesion";
import { supabase } from "@/lib/supabase";
import { ESTADO_LABEL, hace, pesos, type Pedido, type Presupuesto } from "@/lib/types";

export default function Panel() {
  const { perfil, cargando } = useSesion();
  if (cargando || !perfil) return (<><Encabezado /><Cargando /></>);
  return (
    <>
      <Encabezado perfil={perfil} />
      <main className="contenedor py-6">
        {perfil.rol === "cliente" ? <PanelCliente id={perfil.id} /> : <PanelProfesional id={perfil.id} />}
      </main>
    </>
  );
}

/* ---------------- Cliente ---------------- */
type PedidoConConteo = Pedido & { presupuestos: { count: number }[] };

function PanelCliente({ id }: { id: string }) {
  const [pedidos, setPedidos] = useState<PedidoConConteo[] | null>(null);

  useEffect(() => {
    supabase()
      .from("pedidos")
      .select("*, rubros(*), presupuestos(count)")
      .eq("cliente_id", id)
      .order("creado_en", { ascending: false })
      .then(({ data }) => setPedidos((data as PedidoConConteo[]) ?? []));
  }, [id]);

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="titulo">Mis pedidos</h1>
        <Link href="/pedidos/nuevo" className="btn py-2.5">
          + Nuevo pedido
        </Link>
      </div>
      {!pedidos ? (
        <Cargando />
      ) : pedidos.length === 0 ? (
        <div className="tarjeta mt-6 text-center">
          <p className="text-4xl">🧰</p>
          <p className="mt-2 font-semibold">Todavía no publicaste pedidos</p>
          <p className="text-sm text-gris">Contá qué necesitás y te van a llegar presupuestos.</p>
          <Link href="/pedidos/nuevo" className="btn mt-4">
            Publicar mi primer pedido
          </Link>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {pedidos.map((p) => {
            const n = p.presupuestos?.[0]?.count ?? 0;
            return (
              <li key={p.id}>
                <Link href={`/pedidos/${p.id}`} className="tarjeta block hover:border-marca">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-gris">
                        {p.rubros?.icono} {p.rubros?.nombre} · {hace(p.creado_en)}
                      </p>
                      <p className="mt-1 font-semibold">{p.titulo}</p>
                    </div>
                    <EstadoChip estado={p.estado} label={ESTADO_LABEL[p.estado]} />
                  </div>
                  {p.estado === "abierto" && (
                    <p className="mt-3 text-sm font-medium text-marca">
                      {n === 0 ? "Esperando presupuestos…" : `${n} presupuesto${n > 1 ? "s" : ""} para comparar →`}
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/* ---------------- Profesional ---------------- */
function PanelProfesional({ id }: { id: string }) {
  const [tab, setTab] = useState<"disponibles" | "mios">("disponibles");
  const [disponibles, setDisponibles] = useState<Pedido[] | null>(null);
  const [mios, setMios] = useState<Presupuesto[] | null>(null);
  const [tieneRubros, setTieneRubros] = useState(true);

  useEffect(() => {
    const sb = supabase();
    (async () => {
      const { data: rubros } = await sb.from("profesional_rubros").select("rubro_id").eq("profesional_id", id);
      setTieneRubros((rubros?.length ?? 0) > 0);

      const { data: presus } = await sb
        .from("presupuestos")
        .select("*, pedidos(*, rubros(*))")
        .eq("profesional_id", id)
        .order("creado_en", { ascending: false });
      setMios((presus as Presupuesto[]) ?? []);
      const yaPresupuestados = new Set((presus ?? []).map((p) => p.pedido_id));

      // RLS ya filtra: sólo pedidos abiertos de mis rubros (o donde presupuesté)
      const { data: peds } = await sb
        .from("pedidos")
        .select("*, rubros(*)")
        .eq("estado", "abierto")
        .order("urgencia", { ascending: false })
        .order("creado_en", { ascending: false });
      setDisponibles(((peds as Pedido[]) ?? []).filter((p) => !yaPresupuestados.has(p.id)));
    })();
  }, [id]);

  return (
    <>
      <h1 className="titulo">Trabajos</h1>
      {!tieneRubros && (
        <Link href="/perfil" className="mt-4 block rounded-xl bg-marca-suave p-3 text-sm text-marca-oscuro">
          <b>Elegí tus rubros</b> en tu perfil para empezar a ver pedidos →
        </Link>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-white p-1 ring-1 ring-borde">
        {(["disponibles", "mios"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg py-2 text-sm font-semibold ${tab === t ? "bg-marca text-white" : "text-gris"}`}
          >
            {t === "disponibles" ? `Pedidos nuevos${disponibles ? ` (${disponibles.length})` : ""}` : "Mis presupuestos"}
          </button>
        ))}
      </div>

      {tab === "disponibles" ? (
        !disponibles ? (
          <Cargando />
        ) : disponibles.length === 0 ? (
          <p className="tarjeta mt-6 text-center text-gris">No hay pedidos nuevos en tus rubros por ahora.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {disponibles.map((p) => (
              <li key={p.id}>
                <Link href={`/pedidos/${p.id}`} className="tarjeta block hover:border-marca">
                  <div className="flex items-center justify-between text-xs text-gris">
                    <span>
                      {p.rubros?.icono} {p.rubros?.nombre} · 📍 {p.zona}
                    </span>
                    <span>{hace(p.creado_en)}</span>
                  </div>
                  <p className="mt-1 font-semibold">
                    {p.urgencia === "urgente" && <span className="mr-1 text-red-600">⚡ Urgente ·</span>}
                    {p.titulo}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm text-gris">{p.descripcion}</p>
                  <p className="mt-3 text-sm font-semibold text-marca">Enviar presupuesto →</p>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : !mios ? (
        <Cargando />
      ) : mios.length === 0 ? (
        <p className="tarjeta mt-6 text-center text-gris">Todavía no enviaste presupuestos.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {mios.map((p) => (
            <li key={p.id}>
              <Link href={`/pedidos/${p.pedido_id}`} className="tarjeta block hover:border-marca">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-gris">
                      {p.pedidos?.rubros?.icono} {p.pedidos?.rubros?.nombre} · 📍 {p.pedidos?.zona}
                    </p>
                    <p className="mt-1 font-semibold">{p.pedidos?.titulo}</p>
                    <p className="text-sm text-gris">Tu oferta: {pesos(p.monto)}</p>
                  </div>
                  <EstadoChip
                    estado={p.estado}
                    label={
                      p.estado === "enviado"
                        ? "Esperando respuesta"
                        : p.estado === "aceptado"
                          ? p.pedidos?.estado === "completado"
                            ? "Terminado"
                            : "¡Te eligieron!"
                          : "No elegido"
                    }
                  />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
