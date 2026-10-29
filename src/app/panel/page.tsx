"use client";
import { GuiaBienvenida } from "@/components/GuiaBienvenida";
import { TarjetaNotificaciones } from "@/components/Notificaciones";
import { TarjetaInstalar } from "@/components/Instalar";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Azulejo, Cargando, Encabezado, EstadoChip } from "@/components/Encabezado";
import { BarraInferior } from "@/components/BarraInferior";
import { useSesion } from "@/lib/useSesion";
import { useAvisos } from "@/lib/useAvisos";
import { supabase } from "@/lib/supabase";
import { mismoBarrio } from "@/lib/barrios";
import { ESTADO_LABEL, hace, pesos, type Aviso, type Pedido, type Perfil, type Presupuesto } from "@/lib/types";

export default function Panel() {
  const { perfil, cargando, error: errorSesion } = useSesion();
  const { avisos, total } = useAvisos(!!perfil);
  if (cargando || !perfil) return (<><Encabezado /><Cargando error={errorSesion} /></>);
  return (
    <>
      <Encabezado perfil={perfil} />
      <main className="contenedor pb-28 pt-6">
        {perfil.suspendido && (
          <p className="aviso-error mb-4">
            <b>Tu cuenta está suspendida.</b> No podés publicar pedidos, mandar presupuestos ni escribir mensajes. Si creés
            que es un error, escribinos.
          </p>
        )}
        {perfil.es_admin && (
          <Link href="/admin" className="mb-4 flex items-center justify-between rounded-xl bg-tinta px-4 py-2.5 text-sm font-semibold text-white">
            <span>📊 Panel de administrador</span>
            <span aria-hidden>→</span>
          </Link>
        )}
        {perfil.rol === "cliente" ? (
          <PanelCliente perfil={perfil} avisos={avisos} />
        ) : (
          <PanelProfesional perfil={perfil} avisos={avisos} />
        )}
      </main>
      <BarraInferior perfil={perfil} avisos={total} />
    </>
  );
}

/** Indicadores de novedades sobre una tarjeta */
function Novedades({ aviso, textoNovedad }: { aviso?: Aviso; textoNovedad: (n: number) => string }) {
  if (!aviso || (!aviso.novedades && !aviso.mensajes)) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {aviso.novedades > 0 && (
        <span className="rounded-md bg-red-600 px-2 py-0.5 text-xs font-bold text-white">{textoNovedad(aviso.novedades)}</span>
      )}
      {aviso.mensajes > 0 && (
        <span className="rounded-md bg-marca px-2 py-0.5 text-xs font-bold text-white">
          {aviso.mensajes} mensaje{aviso.mensajes > 1 ? "s" : ""} sin leer
        </span>
      )}
    </div>
  );
}

/* ---------------- Cliente ---------------- */
type PedidoConConteo = Pedido & { presupuestos: { count: number }[] };

function PanelCliente({ perfil, avisos }: { perfil: Perfil; avisos: Record<number, Aviso> }) {
  const [pedidos, setPedidos] = useState<PedidoConConteo[] | null>(null);
  const [verCerrados, setVerCerrados] = useState(false);

  useEffect(() => {
    supabase()
      .from("pedidos")
      .select("*, rubros(*), presupuestos(count)")
      .eq("cliente_id", perfil.id)
      .order("creado_en", { ascending: false })
      .then(({ data }) => setPedidos((data as PedidoConConteo[]) ?? []));
  }, [perfil.id]);

  const activos = pedidos?.filter((p) => p.estado === "abierto" || p.estado === "asignado") ?? [];
  const cerrados = pedidos?.filter((p) => p.estado === "completado" || p.estado === "cancelado" || p.estado === "vencido") ?? [];
  const lista = verCerrados ? cerrados : activos;

  return (
    <>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="titulo">Hola, {perfil.nombre.split(" ")[0] || "vecino"}</h1>
          <p className="text-sm text-gris">Seguí tus pedidos y compará presupuestos.</p>
        </div>
        <Link href="/pedidos/nuevo" className="btn-cinta hidden shrink-0 whitespace-nowrap py-2.5 sm:inline-flex">
          + Nuevo pedido
        </Link>
      </div>
      <TarjetaInstalar />
      {!!pedidos?.length && <TarjetaNotificaciones esPro={false} />}

      {!pedidos ? (
        <ListaCargando />
      ) : pedidos.length === 0 ? (
        <div className="tarjeta mt-6 text-center">
          <div className="mx-auto w-fit">
            <Azulejo nombre="Plomería" icono="🧰" />
          </div>
          <p className="mt-3 font-titulo text-lg font-bold">Todavía no publicaste pedidos</p>
          <p className="text-sm text-gris">Contá qué necesitás y te van a llegar presupuestos de profesionales de tu zona.</p>
          <Link href="/pedidos/nuevo" className="btn-cinta mt-4">
            Publicar mi primer pedido
          </Link>
        </div>
      ) : (
        <>
          <Pestanas
            opciones={[
              { valor: false, texto: `En curso (${activos.length})` },
              { valor: true, texto: `Terminados (${cerrados.length})` },
            ]}
            valor={verCerrados}
            onChange={setVerCerrados}
          />
          {lista.length === 0 ? (
            <p className="tarjeta mt-4 text-center text-sm text-gris">
              {verCerrados ? "Todavía no tenés pedidos terminados." : "No tenés pedidos en curso."}
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {lista.map((p) => {
                const n = p.presupuestos?.[0]?.count ?? 0;
                return (
                  <li key={p.id}>
                    <Link href={`/pedidos/${p.id}`} className="tarjeta flex gap-3 hover:border-marca">
                      <Azulejo nombre={p.rubros?.nombre} icono={p.rubros?.icono} />
                      <div className="min-w-0 flex-1">
                        <p className="font-bold leading-snug">{p.titulo}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <EstadoChip estado={p.estado} label={ESTADO_LABEL[p.estado]} />
                          <span className="text-xs text-gris">
                            {p.rubros?.nombre}, {hace(p.creado_en)}
                          </span>
                        </div>
                        {p.estado === "abierto" &&
                          (n === 0 ? (
                            <p className="mt-2 text-sm text-gris">Esperando presupuestos</p>
                          ) : (
                            <p className="mt-2 inline-flex rounded-lg bg-cinta px-2.5 py-1 text-sm font-bold">
                              {n} presupuesto{n > 1 ? "s" : ""} para comparar
                            </p>
                          ))}
                        <Novedades aviso={avisos[p.id]} textoNovedad={(k) => `${k} nuevo${k > 1 ? "s" : ""}`} />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </>
  );
}

/* ---------------- Profesional ---------------- */
function PanelProfesional({ perfil, avisos }: { perfil: Perfil; avisos: Record<number, Aviso> }) {
  const [tab, setTab] = useState<"disponibles" | "mios">("disponibles");
  const [soloMisZonas, setSoloMisZonas] = useState(true);
  const [disponibles, setDisponibles] = useState<Pedido[] | null>(null);
  const [mios, setMios] = useState<Presupuesto[] | null>(null);
  const [tieneRubros, setTieneRubros] = useState(true);
  const zonas = useMemo(() => perfil.zonas ?? [], [perfil.zonas]);

  useEffect(() => {
    const sb = supabase();
    (async () => {
      const { data: rubros } = await sb.from("profesional_rubros").select("rubro_id").eq("profesional_id", perfil.id);
      setTieneRubros((rubros?.length ?? 0) > 0);

      const { data: presus } = await sb
        .from("presupuestos")
        .select("*, pedidos(*, rubros(*))")
        .eq("profesional_id", perfil.id)
        .order("creado_en", { ascending: false });
      setMios((presus as Presupuesto[]) ?? []);
      const yaPresupuestados = new Set((presus ?? []).map((p) => p.pedido_id));

      // La base ya filtra: sólo pedidos abiertos de mis rubros (o donde presupuesté)
      const { data: peds } = await sb
        .from("pedidos")
        .select("*, rubros(*)")
        .eq("estado", "abierto")
        .order("creado_en", { ascending: false });
      const lista = ((peds as Pedido[]) ?? []).filter((p) => !yaPresupuestados.has(p.id));
      lista.sort((a, b) => (a.urgencia === b.urgencia ? 0 : a.urgencia === "urgente" ? -1 : 1));
      setDisponibles(lista);
    })();
  }, [perfil.id]);

  const enMisZonas = (disponibles ?? []).filter((p) => zonas.some((z) => mismoBarrio(z, p.zona)));
  const visibles = zonas.length && soloMisZonas ? enMisZonas : disponibles ?? [];
  const novedadesMios = (mios ?? []).reduce((s, p) => s + (avisos[p.pedido_id]?.novedades ?? 0) + (avisos[p.pedido_id]?.mensajes ?? 0), 0);

  const activos = (mios ?? []).filter((p) => p.estado !== "rechazado" && p.pedidos?.estado !== "completado" && p.pedidos?.estado !== "cancelado" && p.pedidos?.estado !== "vencido");
  const historial = (mios ?? []).filter((p) => !activos.includes(p));

  return (
    <>
      <h1 className="titulo">Hola, {perfil.nombre.split(" ")[0] || "crack"}</h1>
      <p className="text-sm text-gris">Pedidos de tus rubros esperando presupuesto.</p>
      {!tieneRubros && (
        <Link href="/perfil#rubros" className="mt-4 block rounded-xl border-2 border-dashed border-cinta-oscuro bg-cinta/20 p-3 text-sm">
          <b>Elegí tus rubros</b> en tu perfil para empezar a ver pedidos.
        </Link>
      )}
      <GuiaBienvenida perfil={perfil} />
      <TarjetaInstalar />
      <TarjetaNotificaciones esPro />

      <Pestanas
        opciones={[
          { valor: "disponibles", texto: `Pedidos nuevos${disponibles ? ` (${disponibles.length})` : ""}` },
          { valor: "mios", texto: "Mis trabajos", badge: novedadesMios },
        ]}
        valor={tab}
        onChange={setTab}
      />

      {tab === "disponibles" ? (
        !disponibles ? (
          <ListaCargando />
        ) : (
          <>
            {zonas.length > 0 && (
              <div className="mt-3 flex gap-2 text-sm">
                {[true, false].map((v) => (
                  <button
                    key={String(v)}
                    onClick={() => setSoloMisZonas(v)}
                    aria-pressed={soloMisZonas === v}
                    className={`rounded-full border px-3 py-1 font-semibold ${
                      soloMisZonas === v ? "border-marca bg-marca text-white" : "border-borde bg-white text-gris"
                    }`}
                  >
                    {v ? `En mis zonas (${enMisZonas.length})` : `Todos (${disponibles.length})`}
                  </button>
                ))}
              </div>
            )}
            {visibles.length === 0 ? (
              <div className="tarjeta mt-4 text-center text-sm text-gris">
                {soloMisZonas && zonas.length > 0 && disponibles.length > 0 ? (
                  <>
                    No hay pedidos nuevos en tus zonas.{" "}
                    <button className="font-semibold text-marca" onClick={() => setSoloMisZonas(false)}>
                      Ver todos ({disponibles.length})
                    </button>
                  </>
                ) : (
                  "No hay pedidos nuevos en tus rubros por ahora. Te avisamos acá cuando entre uno."
                )}
              </div>
            ) : (
              <ul className="mt-3 space-y-3">
                {visibles.map((p) => (
                  <li key={p.id}>
                    <Link href={`/pedidos/${p.id}`} className="tarjeta flex gap-3 hover:border-marca">
                      <Azulejo nombre={p.rubros?.nombre} icono={p.rubros?.icono} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {p.urgencia === "urgente" && (
                            <span className="rounded-md bg-red-600 px-2 py-0.5 text-xs font-bold text-white">Urgente</span>
                          )}
                          <span className="meta">📍 {p.zona}</span>
                          <span className="text-xs text-gris">{hace(p.creado_en)}</span>
                        </div>
                        <p className="mt-1 font-bold leading-snug">{p.titulo}</p>
                        <p className="mt-1 line-clamp-2 text-sm text-gris">{p.descripcion}</p>
                        <p className="mt-3 text-sm font-bold text-marca">Enviar presupuesto</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )
      ) : !mios ? (
        <ListaCargando />
      ) : mios.length === 0 ? (
        <p className="tarjeta mt-4 text-center text-sm text-gris">Todavía no enviaste presupuestos.</p>
      ) : (
        <>
          <ListaMios lista={activos} avisos={avisos} />
          {historial.length > 0 && (
            <>
              <h2 className="mt-8 text-lg font-bold">Historial</h2>
              <ListaMios lista={historial} avisos={avisos} />
            </>
          )}
        </>
      )}
    </>
  );
}

function ListaMios({ lista, avisos }: { lista: Presupuesto[]; avisos: Record<number, Aviso> }) {
  if (!lista.length) return <p className="tarjeta mt-4 text-center text-sm text-gris">No tenés trabajos en curso.</p>;
  return (
    <ul className="mt-4 space-y-3">
      {lista.map((p) => {
        const estado =
          p.estado === "enviado"
            ? p.pedidos?.estado === "vencido"
              ? ["vencido", "Venció sin elegir"]
              : p.pedidos?.estado === "cancelado"
                ? ["cancelado", "Cancelado"]
                : ["enviado", "Esperando respuesta"]
            : p.estado === "aceptado"
              ? p.pedidos?.estado === "completado"
                ? ["completado", "Terminado"]
                : p.pedidos?.estado === "cancelado"
                  ? ["cancelado", "Cancelado"]
                  : ["aceptado", "Te eligieron"]
              : ["rechazado", "No elegido"];
        return (
          <li key={p.id}>
            <Link href={`/pedidos/${p.pedido_id}`} className="tarjeta flex gap-3 hover:border-marca">
              <Azulejo nombre={p.pedidos?.rubros?.nombre} icono={p.pedidos?.rubros?.icono} chico />
              <div className="min-w-0 flex-1">
                <p className="font-bold leading-snug">{p.pedidos?.titulo}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <EstadoChip estado={estado[0]} label={estado[1]} />
                  <span className="text-xs text-gris">📍 {p.pedidos?.zona}</span>
                </div>
                <p className="mt-1 text-sm">
                  Tu oferta: <b className="font-titulo">{pesos(p.monto)}</b>
                </p>
                <Novedades aviso={avisos[p.pedido_id]} textoNovedad={() => "Novedad"} />
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------------- Piezas comunes ---------------- */
function Pestanas<T extends string | boolean>({
  opciones,
  valor,
  onChange,
}: {
  opciones: { valor: T; texto: string; badge?: number }[];
  valor: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-white p-1 ring-1 ring-borde" role="tablist">
      {opciones.map((o) => (
        <button
          key={String(o.valor)}
          role="tab"
          aria-selected={valor === o.valor}
          onClick={() => onChange(o.valor)}
          className={`relative rounded-lg py-2 text-sm font-semibold ${valor === o.valor ? "bg-tinta text-white" : "text-gris"}`}
        >
          {o.texto}
          {!!o.badge && (
            <span className="ml-1.5 rounded-full bg-red-600 px-1.5 text-xs text-white">{o.badge}</span>
          )}
        </button>
      ))}
    </div>
  );
}

function ListaCargando() {
  return (
    <ul className="mt-4 space-y-3" aria-busy="true" aria-label="Cargando">
      {[0, 1, 2].map((i) => (
        <li key={i} className="tarjeta flex animate-pulse gap-3">
          <span className="h-12 w-12 rounded-xl bg-fondo" />
          <span className="flex-1 space-y-2">
            <span className="block h-4 w-3/4 rounded bg-fondo" />
            <span className="block h-3 w-1/2 rounded bg-fondo" />
          </span>
        </li>
      ))}
    </ul>
  );
}
