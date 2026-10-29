"use client";
import { Check, CircleCheck, CircleX, House, TriangleAlert, Wrench, Zap } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Cargando, Encabezado, EstadoChip } from "@/components/Encabezado";
import { useSesion } from "@/lib/useSesion";
import { supabase } from "@/lib/supabase";
import { ESTADO_LABEL, fecha, hace, type EstadoPedido } from "@/lib/types";

/* ---------------- Tipos de lo que devuelve la base ---------------- */
interface Semana {
  semana: string;
  pedidos: number;
  trabajos: number;
  usuarios: number;
}
interface Resumen {
  usuarios: number;
  clientes: number;
  profesionales: number;
  usuarios_7d: number;
  suspendidos: number;
  pedidos: number;
  pedidos_7d: number;
  abiertos: number;
  abiertos_sin_presu: number;
  presupuestos: number;
  presu_por_pedido: number | null;
  horas_primer_presu: number | null;
  con_presu_pct: number | null;
  conversion_pct: number | null;
  completados: number;
  calificacion_prom: number | null;
  por_semana: Semana[];
  rubros: { rubro: string; icono: string; pedidos: number; sin_presu: number; profesionales: number }[];
  zonas_sin_respuesta: { zona: string; pedidos: number }[];
}
interface Usuario {
  id: string;
  nombre: string;
  email: string | null;
  rol: string;
  zona: string | null;
  creado_en: string;
  confirmado: boolean;
  ultimo_ingreso: string | null;
  suspendido: boolean;
  es_admin: boolean;
  pedidos: number;
  presupuestos: number;
  trabajos: number;
  puntaje: number | null;
}
interface PedidoAdmin {
  id: number;
  titulo: string;
  descripcion: string;
  zona: string;
  estado: EstadoPedido;
  urgencia: string;
  creado_en: string;
  rubro: string;
  icono: string;
  cliente_id: string;
  cliente: string | null;
  cliente_email: string | null;
  presupuestos: number;
}

type Seccion = "indicadores" | "usuarios" | "pedidos" | "verificacion" | "mails";

const num = (n: number | null | undefined, sufijo = "") => (n == null ? "—" : `${n.toLocaleString("es-AR")}${sufijo}`);

/** Si la migración 06 no se corrió todavía, explica qué hacer. */
const explicarError = (m: string) =>
  /admin_|es_admin|function .* does not exist|schema cache/i.test(m)
    ? "Falta correr supabase/migracion-06-admin.sql en Supabase (SQL Editor)."
    : m;

export default function PaginaAdmin() {
  const { perfil, cargando, error } = useSesion();
  const [seccion, setSeccion] = useState<Seccion>("indicadores");
  const [pendientes, setPendientes] = useState(0);
  const esAdmin = !!perfil?.es_admin;
  const contarPendientes = useCallback(() => {
    supabase()
      .rpc("admin_pendientes")
      .then(({ data }) => setPendientes(data?.verificaciones ?? 0));
  }, []);
  useEffect(() => {
    if (esAdmin) contarPendientes();
  }, [esAdmin, contarPendientes]);

  if (cargando || !perfil) return (<><Encabezado /><Cargando error={error} /></>);
  if (!perfil.es_admin)
    return (
      <>
        <Encabezado perfil={perfil} />
        <main className="contenedor pt-10 text-center">
          <h1 className="titulo">Sólo administradores</h1>
          <p className="mt-2 text-gris">Tu cuenta no tiene permisos para ver esta sección.</p>
          <Link href="/panel" className="btn mt-6 inline-flex">Volver al panel</Link>
        </main>
      </>
    );

  const secciones: { valor: Seccion; texto: string }[] = [
    { valor: "indicadores", texto: "Indicadores" },
    { valor: "usuarios", texto: "Usuarios" },
    { valor: "pedidos", texto: "Pedidos" },
    { valor: "verificacion", texto: "Verificación" },
    { valor: "mails", texto: "Mails" },
  ];

  return (
    <>
      <Encabezado perfil={perfil} />
      <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-marca">Administración</p>
            <h1 className="titulo">Cómo va Manitos</h1>
          </div>
          <Link href="/panel" className="text-sm font-semibold text-marca">← Volver a la app</Link>
        </div>
        <div className="mt-5 flex gap-1 overflow-x-auto rounded-xl bg-white p-1 ring-1 ring-borde" role="tablist">
          {secciones.map((s) => (
            <button
              key={s.valor}
              role="tab"
              aria-selected={seccion === s.valor}
              onClick={() => setSeccion(s.valor)}
              className={`relative flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold ${seccion === s.valor ? "bg-tinta text-white" : "text-gris"}`}
            >
              {s.texto}
              {s.valor === "verificacion" && pendientes > 0 && (
                <span className="ml-1.5 rounded-full bg-red-600 px-1.5 text-xs text-white">{pendientes}</span>
              )}
            </button>
          ))}
        </div>
        {seccion === "indicadores" && <Indicadores />}
        {seccion === "usuarios" && <Usuarios miId={perfil.id} />}
        {seccion === "pedidos" && <Pedidos />}
        {seccion === "verificacion" && <Verificaciones alCambiar={contarPendientes} />}
        {seccion === "mails" && <ChequeoMails />}
      </main>
    </>
  );
}

/* ---------------- Indicadores ---------------- */
function Indicadores() {
  const [r, setR] = useState<Resumen | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    supabase()
      .rpc("admin_resumen")
      .then(({ data, error }) => (error ? setError(explicarError(error.message)) : setR(data as Resumen)));
  }, []);
  if (error) return <p className="aviso-error mt-5">{error}</p>;
  if (!r) return <Esqueleto />;

  return (
    <div className="mt-5 space-y-5">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Dato titulo="Usuarios" valor={num(r.usuarios)} detalle={`${r.clientes} clientes · ${r.profesionales} profesionales`} extra={r.usuarios_7d ? `+${r.usuarios_7d} esta semana` : undefined} />
        <Dato titulo="Pedidos" valor={num(r.pedidos)} detalle={`${r.abiertos} abiertos · ${r.completados} terminados`} extra={r.pedidos_7d ? `+${r.pedidos_7d} esta semana` : undefined} />
        <Dato titulo="Primer presupuesto" valor={r.horas_primer_presu == null ? "—" : formatoHoras(r.horas_primer_presu)} detalle="tiempo típico (mediana) desde que se publica" />
        <Dato titulo="Terminan en trabajo" valor={num(r.conversion_pct, "%")} detalle="de los pedidos ya resueltos (elegidos vs. cancelados)" />
        <Dato titulo="Reciben presupuesto" valor={num(r.con_presu_pct, "%")} detalle="pedidos con al menos uno (de más de 1 día)" />
        <Dato titulo="Presupuestos" valor={num(r.presupuestos)} detalle={`${r.presu_por_pedido ?? 0} por pedido en promedio`} />
        <Dato titulo="Calificación" valor={r.calificacion_prom == null ? "—" : `${r.calificacion_prom} ★`} detalle="promedio de todas las reseñas" />
        <Dato
          titulo="Abiertos sin respuesta"
          valor={num(r.abiertos_sin_presu)}
          detalle="pedidos abiertos sin ningún presupuesto"
          alerta={r.abiertos_sin_presu > 0}
        />
      </section>

      <section className="tarjeta">
        <h2 className="font-titulo text-lg font-bold">Pedidos por semana</h2>
        <p className="text-sm text-gris">Últimas 12 semanas. Pasá el dedo o el mouse por una barra para ver el detalle.</p>
        <BarrasSemanales semanas={r.por_semana ?? []} />
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <section className="tarjeta">
          <h2 className="font-titulo text-lg font-bold">Oferta y demanda por rubro</h2>
          <p className="text-sm text-gris">Donde hay pedidos sin presupuesto o pocos profesionales, conviene salir a sumar gente.</p>
          <RubrosTabla rubros={r.rubros ?? []} />
        </section>
        <section className="tarjeta">
          <h2 className="font-titulo text-lg font-bold">Barrios sin respuesta</h2>
          <p className="text-sm text-gris">Pedidos que no recibieron ningún presupuesto, por barrio.</p>
          {r.zonas_sin_respuesta?.length ? (
            <ListaBarras items={r.zonas_sin_respuesta.map((z) => ({ texto: z.zona, valor: z.pedidos }))} />
          ) : (
            <p className="mt-4 rounded-xl bg-fondo p-3 text-sm text-gris">Todos los pedidos recibieron al menos un presupuesto.</p>
          )}
        </section>
      </div>
    </div>
  );
}

const formatoHoras = (h: number) => (h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${h.toLocaleString("es-AR")} h` : `${Math.round(h / 24)} días`);

function Dato({ titulo, valor, detalle, extra, alerta }: { titulo: string; valor: string; detalle: string; extra?: string; alerta?: boolean }) {
  return (
    <div className={`tarjeta ${alerta ? "border-amber-300 bg-amber-50" : ""}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gris">{titulo}</p>
      <p className="mt-1 font-titulo text-3xl font-extrabold tabular-nums text-tinta">{valor}</p>
      <p className="mt-1 text-xs leading-snug text-gris">{detalle}</p>
      {extra && <p className="mt-1 text-xs font-semibold text-green-700">{extra}</p>}
    </div>
  );
}

/** Columnas de pedidos por semana, con detalle al pasar por encima. */
function BarrasSemanales({ semanas }: { semanas: Semana[] }) {
  const [activa, setActiva] = useState<number | null>(null);
  const max = Math.max(1, ...semanas.map((s) => s.pedidos));
  const sel = activa != null ? semanas[activa] : semanas[semanas.length - 1];
  const etiqueta = (s: Semana) => new Date(s.semana + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" });
  const total = semanas.reduce((a, s) => a + s.pedidos, 0);

  if (!total) return <p className="mt-4 rounded-xl bg-fondo p-3 text-sm text-gris">Todavía no hay pedidos en las últimas 12 semanas.</p>;

  return (
    <div className="mt-4">
      <p className="mb-2 text-sm" aria-live="polite">
        <b>Semana del {sel ? etiqueta(sel) : ""}:</b> {sel?.pedidos ?? 0} pedidos · {sel?.trabajos ?? 0} con profesional elegido ·{" "}
        {sel?.usuarios ?? 0} usuarios nuevos
      </p>
      <div className="relative h-40 border-b border-borde" onMouseLeave={() => setActiva(null)}>
        <div className="absolute inset-x-0 top-0 border-t border-dashed border-borde" aria-hidden />
        <span className="absolute -top-2 right-0 bg-white pl-1 text-[10px] text-gris">{max}</span>
        <div className="flex h-full items-end gap-[2px]">
          {semanas.map((s, i) => (
            <button
              key={s.semana}
              type="button"
              onMouseEnter={() => setActiva(i)}
              onFocus={() => setActiva(i)}
              onClick={() => setActiva(i)}
              className="group flex h-full flex-1 items-end"
              aria-label={`Semana del ${etiqueta(s)}: ${s.pedidos} pedidos`}
            >
              <span
                className={`block w-full rounded-t-[4px] transition-colors ${
                  (activa ?? semanas.length - 1) === i ? "bg-marca" : "bg-marca/45 group-hover:bg-marca/70"
                }`}
                style={{ height: s.pedidos ? `${(s.pedidos / max) * 100}%` : "2px" }}
              />
            </button>
          ))}
        </div>
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-gris">
        <span>{semanas[0] && etiqueta(semanas[0])}</span>
        <span>esta semana</span>
      </div>
    </div>
  );
}

function RubrosTabla({ rubros }: { rubros: Resumen["rubros"] }) {
  const [todos, setTodos] = useState(false);
  const lista = todos ? rubros : rubros.filter((r) => r.pedidos > 0 || r.profesionales > 0).slice(0, 8);
  return (
    <div className="mt-3">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gris">
            <th className="py-1 font-semibold">Rubro</th>
            <th className="py-1 text-right font-semibold">Pedidos</th>
            <th className="py-1 text-right font-semibold">Sin presup.</th>
            <th className="py-1 text-right font-semibold">Profesionales</th>
          </tr>
        </thead>
        <tbody>
          {lista.map((r) => (
            <tr key={r.rubro} className="border-t border-borde">
              <td className="py-2">
                <span className="mr-1.5">{r.icono}</span>
                {r.rubro}
              </td>
              <td className="py-2 text-right tabular-nums">{r.pedidos}</td>
              <td className={`py-2 text-right tabular-nums ${r.sin_presu ? "font-bold text-amber-700" : ""}`}>{r.sin_presu}</td>
              <td className={`py-2 text-right tabular-nums ${r.profesionales === 0 && r.pedidos > 0 ? "font-bold text-red-700" : ""}`}>
                {r.profesionales === 0 && r.pedidos > 0 ? (<span className="inline-flex items-center gap-1"><TriangleAlert className="ico" aria-label="Sin profesionales" />0</span>) : r.profesionales}
              </td>
            </tr>
          ))}
          {!lista.length && (
            <tr>
              <td colSpan={4} className="py-3 text-gris">Sin datos todavía.</td>
            </tr>
          )}
        </tbody>
      </table>
      {rubros.length > lista.length && (
        <button onClick={() => setTodos(true)} className="mt-2 text-sm font-semibold text-marca">Ver los {rubros.length} rubros</button>
      )}
    </div>
  );
}

function ListaBarras({ items }: { items: { texto: string; valor: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.valor));
  return (
    <ul className="mt-3 space-y-2">
      {items.map((i) => (
        <li key={i.texto} className="text-sm">
          <div className="flex justify-between">
            <span>{i.texto}</span>
            <b className="tabular-nums">{i.valor}</b>
          </div>
          <div className="mt-1 h-2 rounded-full bg-fondo">
            <div className="h-2 rounded-full bg-amber-500" style={{ width: `${(i.valor / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Esqueleto() {
  return (
    <div className="mt-5 grid animate-pulse grid-cols-2 gap-3 md:grid-cols-4" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="tarjeta h-28" />
      ))}
    </div>
  );
}

/* ---------------- Usuarios ---------------- */
function Usuarios({ miId }: { miId: string }) {
  const [buscar, setBuscar] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "cliente" | "profesional" | "suspendidos">("todos");
  const [lista, setLista] = useState<Usuario[] | null>(null);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(async (q: string) => {
    const { data, error } = await supabase().rpc("admin_usuarios", { p_buscar: q || null });
    if (error) setError(explicarError(error.message));
    else setLista(data as Usuario[]);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => cargar(buscar.trim()), 300);
    return () => clearTimeout(t);
  }, [buscar, cargar]);

  const suspender = async (u: Usuario) => {
    const valor = !u.suspendido;
    const texto = valor
      ? `¿Suspender a ${u.nombre || u.email}?\n\nNo va a poder publicar pedidos, mandar presupuestos ni escribir en el chat. Se cancelan sus pedidos abiertos y se retiran sus presupuestos sin responder.`
      : `¿Reactivar la cuenta de ${u.nombre || u.email}?`;
    if (!window.confirm(texto)) return;
    setOcupado(u.id);
    const { error } = await supabase().rpc("admin_suspender", { p_usuario: u.id, p_valor: valor });
    setOcupado(null);
    if (error) return setError(error.message);
    await cargar(buscar.trim());
  };

  const visibles = (lista ?? []).filter((u) =>
    filtro === "todos" ? true : filtro === "suspendidos" ? u.suspendido : u.rol === filtro
  );

  return (
    <div className="mt-5">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input className="campo flex-1" placeholder="Buscar por nombre, email o barrio" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        <select className="campo sm:w-48" value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)} aria-label="Filtrar usuarios">
          <option value="todos">Todos</option>
          <option value="cliente">Clientes</option>
          <option value="profesional">Profesionales</option>
          <option value="suspendidos">Suspendidos</option>
        </select>
      </div>
      {error && <p className="aviso-error mt-3">{error}</p>}
      {!lista ? (
        <Esqueleto />
      ) : (
        <>
          <p className="mt-3 text-sm text-gris">{visibles.length} usuarios</p>
          <ul className="mt-2 space-y-2">
            {visibles.map((u) => (
              <li key={u.id} className={`tarjeta flex flex-col gap-3 sm:flex-row sm:items-center ${u.suspendido ? "opacity-70" : ""}`}>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 font-semibold">
                    {u.rol === "profesional" ? (
                      <Link href={`/profesionales/${u.id}`} className="hover:underline">{u.nombre || "(sin nombre)"}</Link>
                    ) : (
                      <span>{u.nombre || "(sin nombre)"}</span>
                    )}
                    <span className="meta">{u.rol === "profesional" ? <><Wrench className="ico" /> Profesional</> : <><House className="ico" /> Cliente</>}</span>
                    {u.es_admin && <span className="chip">Admin</span>}
                    {u.suspendido && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">Suspendido</span>}
                    {!u.confirmado && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Sin confirmar mail</span>}
                  </p>
                  <p className="truncate text-sm text-gris">{u.email}{u.zona ? ` · ${u.zona}` : ""}</p>
                  <p className="mt-0.5 text-xs text-gris">
                    Alta {fecha(u.creado_en)}
                    {u.ultimo_ingreso ? ` · último ingreso ${hace(u.ultimo_ingreso)}` : ""}
                    {u.rol === "cliente"
                      ? ` · ${u.pedidos} pedidos`
                      : ` · ${u.presupuestos} presupuestos · ${u.trabajos} trabajos${u.puntaje ? ` · ${u.puntaje} ★` : ""}`}
                  </p>
                </div>
                {u.id !== miId && (
                  <button
                    onClick={() => suspender(u)}
                    disabled={ocupado === u.id}
                    className={`shrink-0 rounded-xl px-3 py-2 text-sm font-semibold ${
                      u.suspendido ? "bg-green-50 text-green-800 ring-1 ring-green-200" : "bg-red-50 text-red-700 ring-1 ring-red-200"
                    }`}
                  >
                    {ocupado === u.id ? "…" : u.suspendido ? "Reactivar" : "Suspender"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/* ---------------- Pedidos ---------------- */
function Pedidos() {
  const [estado, setEstado] = useState<"" | EstadoPedido>("");
  const [lista, setLista] = useState<PedidoAdmin[] | null>(null);
  const [error, setError] = useState("");
  const [abierto, setAbierto] = useState<number | null>(null);

  const cargar = useCallback(async (e: string) => {
    const { data, error } = await supabase().rpc("admin_pedidos", { p_estado: e || null });
    if (error) setError(explicarError(error.message));
    else setLista(data as PedidoAdmin[]);
  }, []);
  useEffect(() => {
    setLista(null);
    cargar(estado);
  }, [estado, cargar]);

  const borrar = async (p: PedidoAdmin) => {
    if (!window.confirm(`¿Borrar el pedido "${p.titulo}"?\n\nSe borran también sus presupuestos, mensajes y dirección. No se puede deshacer.`)) return;
    const { error } = await supabase().rpc("admin_borrar_pedido", { p_pedido: p.id });
    if (error) return setError(error.message);
    setLista((l) => l?.filter((x) => x.id !== p.id) ?? null);
  };

  return (
    <div className="mt-5">
      <select className="campo sm:w-56" value={estado} onChange={(e) => setEstado(e.target.value as typeof estado)} aria-label="Filtrar por estado">
        <option value="">Todos los estados</option>
        {(Object.keys(ESTADO_LABEL) as EstadoPedido[]).map((k) => (
          <option key={k} value={k}>{ESTADO_LABEL[k]}</option>
        ))}
      </select>
      {error && <p className="aviso-error mt-3">{error}</p>}
      {!lista ? (
        <Esqueleto />
      ) : !lista.length ? (
        <p className="mt-4 rounded-xl bg-white p-4 text-sm text-gris">No hay pedidos con ese filtro.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {lista.map((p) => (
            <li key={p.id} className="tarjeta">
              <div className="flex items-start gap-3">
                <span className="text-2xl" aria-hidden>{p.icono}</span>
                <div className="min-w-0 flex-1">
                  <button onClick={() => setAbierto(abierto === p.id ? null : p.id)} className="text-left font-semibold hover:underline">
                    {p.urgencia === "urgente" && <Zap className="ico mr-1 text-red-600" aria-label="Urgente" />}
                    {p.titulo}
                  </button>
                  <p className="text-xs text-gris">
                    #{p.id} · {p.rubro} · {p.zona} · {hace(p.creado_en)} · {p.presupuestos} presupuestos
                  </p>
                  <p className="text-xs text-gris">Cliente: {p.cliente || "(sin nombre)"} {p.cliente_email ? `· ${p.cliente_email}` : ""}</p>
                  {abierto === p.id && <p className="mt-2 whitespace-pre-line rounded-xl bg-fondo p-3 text-sm">{p.descripcion}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <EstadoChip estado={p.estado} label={ESTADO_LABEL[p.estado]} />
                  <button onClick={() => borrar(p)} className="text-xs font-semibold text-red-700 hover:underline">Borrar</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------- Verificación de profesionales ---------------- */
interface VerifAdmin {
  perfil_id: string;
  nombre: string;
  email: string | null;
  zona: string | null;
  rubros: string | null;
  estado: "pendiente" | "aprobada" | "rechazada";
  dni_frente: string;
  dni_dorso: string;
  matricula_foto: string | null;
  matricula: string | null;
  nota: string | null;
  enviado_en: string;
  revisado_en: string | null;
}

function Verificaciones({ alCambiar }: { alCambiar: () => void }) {
  const [estado, setEstado] = useState<"pendiente" | "aprobada" | "rechazada">("pendiente");
  const [lista, setLista] = useState<VerifAdmin[] | null>(null);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    const { data, error } = await supabase().rpc("admin_verificaciones", { p_estado: estado });
    if (error) setError(/admin_verificaciones|schema cache/i.test(error.message) ? "Falta correr supabase/migracion-07-preguntas-y-verificacion.sql en Supabase." : error.message);
    else setLista(data as VerifAdmin[]);
  }, [estado]);
  useEffect(() => {
    setLista(null);
    cargar();
  }, [cargar]);

  return (
    <div className="mt-5">
      <select className="campo sm:w-56" value={estado} onChange={(e) => setEstado(e.target.value as typeof estado)} aria-label="Filtrar verificaciones">
        <option value="pendiente">Pendientes de revisar</option>
        <option value="aprobada">Aprobadas</option>
        <option value="rechazada">Rechazadas</option>
      </select>
      {error && <p className="aviso-error mt-3">{error}</p>}
      {!lista ? (
        !error && <Esqueleto />
      ) : !lista.length ? (
        <p className="mt-4 rounded-xl bg-white p-4 text-sm text-gris">
          {estado === "pendiente" ? "No hay verificaciones para revisar." : "No hay verificaciones con ese estado."}
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {lista.map((v) => (
            <TarjetaVerificacion key={v.perfil_id} v={v} alListo={() => { cargar(); alCambiar(); }} />
          ))}
        </ul>
      )}
    </div>
  );
}

function TarjetaVerificacion({ v, alListo }: { v: VerifAdmin; alListo: () => void }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [matriculado, setMatriculado] = useState(!!v.matricula);
  const [rechazando, setRechazando] = useState(false);
  const [nota, setNota] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const rutas = [v.dni_frente, v.dni_dorso, v.matricula_foto].filter((x): x is string => !!x);
    supabase()
      .storage.from("documentos")
      .createSignedUrls(rutas, 60 * 30)
      .then(({ data }) => setUrls(Object.fromEntries((data ?? []).filter((d) => d.signedUrl).map((d) => [d.path ?? "", d.signedUrl as string]))));
  }, [v.dni_frente, v.dni_dorso, v.matricula_foto]);

  const revisar = async (aprobar: boolean) => {
    setError("");
    if (!aprobar && !nota.trim()) return setError("Escribí el motivo para que el profesional sepa qué corregir.");
    setOcupado(true);
    const { error } = await supabase().rpc("admin_revisar_verificacion", {
      p_perfil: v.perfil_id,
      p_aprobar: aprobar,
      p_matriculado: aprobar && matriculado,
      p_nota: aprobar ? null : nota.trim(),
    });
    setOcupado(false);
    if (error) return setError(error.message);
    alListo();
  };

  const fotos: [string, string | null][] = [
    ["DNI frente", v.dni_frente],
    ["DNI dorso", v.dni_dorso],
    ["Matrícula", v.matricula_foto],
  ];

  return (
    <li className="tarjeta">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href={`/profesionales/${v.perfil_id}`} className="font-bold hover:underline">{v.nombre || "(sin nombre)"}</Link>
          <p className="text-sm text-gris">{v.email}{v.zona ? ` · ${v.zona}` : ""}</p>
          {v.rubros && <p className="flex items-center gap-1 text-xs text-gris"><Wrench className="ico" /> {v.rubros}</p>}
        </div>
        <p className="text-xs text-gris">Enviado {hace(v.enviado_en)}</p>
      </div>
      {v.matricula && (
        <p className="mt-2 text-sm">
          Matrícula: <b>{v.matricula}</b>
        </p>
      )}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {fotos.map(([titulo, ruta]) =>
          ruta ? (
            <a key={titulo} href={urls[ruta]} target="_blank" rel="noreferrer" className="block">
              <span className="text-xs font-semibold text-gris">{titulo}</span>
              {urls[ruta] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={urls[ruta]} alt={titulo} className="mt-1 aspect-[3/2] w-full rounded-lg bg-fondo object-cover" />
              ) : (
                <span className="mt-1 block aspect-[3/2] w-full animate-pulse rounded-lg bg-fondo" />
              )}
            </a>
          ) : null
        )}
      </div>
      <p className="mt-2 text-xs text-gris">Tocá una foto para verla grande. Revisá que el nombre coincida con el del perfil.</p>

      {v.estado === "rechazada" && v.nota && <p className="mt-2 text-sm text-red-700">Motivo del rechazo: {v.nota}</p>}

      {v.estado === "pendiente" &&
        (rechazando ? (
          <div className="mt-3 space-y-2">
            <label htmlFor={`nota-${v.perfil_id}`} className="etiqueta">Motivo (le llega por mail)</label>
            <textarea
              id={`nota-${v.perfil_id}`}
              className="campo min-h-16"
              placeholder="Ej: La foto del dorso está borrosa / el nombre no coincide con el del perfil"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
            />
            <div className="flex gap-2">
              <button onClick={() => revisar(false)} disabled={ocupado} className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 font-semibold text-white">
                Rechazar
              </button>
              <button onClick={() => setRechazando(false)} className="btn-sec">Volver</button>
            </div>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {v.matricula && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={matriculado} onChange={(e) => setMatriculado(e.target.checked)} className="h-5 w-5 accent-marca" />
                La matrícula es válida (suma el sello “Matriculado”)
              </label>
            )}
            <div className="flex gap-2">
              <button onClick={() => revisar(true)} disabled={ocupado} className="btn flex-1 py-2.5">
                <Check className="ico" /> Aprobar
              </button>
              <button onClick={() => setRechazando(true)} className="btn-sec">Rechazar…</button>
            </div>
          </div>
        ))}
      {v.estado === "aprobada" && (
        <button onClick={() => setRechazando(true)} className={`mt-2 text-xs font-semibold text-gris underline ${rechazando ? "hidden" : ""}`}>
          Quitar verificación
        </button>
      )}
      {v.estado === "aprobada" && rechazando && (
        <div className="mt-3 space-y-2">
          <textarea className="campo min-h-16" placeholder="Motivo" value={nota} onChange={(e) => setNota(e.target.value)} aria-label="Motivo" />
          <button onClick={() => revisar(false)} disabled={ocupado} className="w-full rounded-xl bg-red-600 px-4 py-2.5 font-semibold text-white">
            Quitar el sello
          </button>
        </div>
      )}
      {error && <p className="aviso-error mt-2">{error}</p>}
    </li>
  );
}

/* ---------------- Chequeo de mails ---------------- */
interface Chequeo {
  brevoOk: boolean;
  brevo: string;
  variables: Record<string, string>;
  ultimos: { tipo: string; ref_id: number; enviado_en: string }[];
  celulares?: number;
  error?: string;
}
const TIPO_AVISO: Record<string, string> = {
  nuevo_pedido: "Pedido nuevo → profesionales",
  nuevo_presupuesto: "Presupuesto nuevo → cliente",
  elegido: "Presupuesto elegido → profesional",
  pregunta: "Pregunta nueva → cliente",
  respuesta: "Respuesta → profesional",
  verificacion: "Verificación revisada → profesional",
  terminado: "Trabajo terminado → cliente",
  mensaje: "Mensaje del chat (push)",
};

function ChequeoMails() {
  const [c, setC] = useState<Chequeo | null>(null);
  const [cargando, setCargando] = useState(false);

  const probar = useCallback(async () => {
    setCargando(true);
    try {
      const { data } = await supabase().auth.getSession();
      const r = await fetch("/api/avisos", { headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` } });
      setC(await r.json());
    } catch (e) {
      setC({ brevoOk: false, brevo: "", variables: {}, ultimos: [], error: e instanceof Error ? e.message : String(e) });
    } finally {
      setCargando(false);
    }
  }, []);
  useEffect(() => {
    probar();
  }, [probar]);

  return (
    <div className="mt-5 space-y-4">
      <section className="tarjeta">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-titulo text-lg font-bold">Conexión con Brevo</h2>
          <button onClick={probar} disabled={cargando} className="btn-sec px-3 py-1.5 text-sm">{cargando ? "Probando…" : "Probar de nuevo"}</button>
        </div>
        {!c ? (
          <p className="mt-3 text-sm text-gris">Probando…</p>
        ) : c.error ? (
          <p className="aviso-error mt-3">{c.error}</p>
        ) : (
          <>
            <p className={`mt-3 rounded-xl px-3 py-2 text-sm font-semibold ${c.brevoOk ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
              {c.brevoOk ? <CircleCheck className="ico mr-1" /> : <CircleX className="ico mr-1" />}
              {c.brevo}
            </p>
            <dl className="mt-3 space-y-1 text-sm">
              {Object.entries(c.variables).map(([k, v]) => (
                <div key={k} className="flex flex-col sm:flex-row sm:gap-2">
                  <dt className="font-mono text-xs text-gris sm:w-64">{k}</dt>
                  <dd className="break-all">{v}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </section>
      {c && !c.error && (
        <section className="tarjeta">
          <h2 className="font-titulo text-lg font-bold">Últimos avisos enviados</h2>
          {c.ultimos.length ? (
            <ul className="mt-2 divide-y divide-borde text-sm">
              {c.ultimos.map((a) => (
                <li key={`${a.tipo}-${a.ref_id}`} className="flex justify-between gap-3 py-2">
                  <span>{TIPO_AVISO[a.tipo] ?? a.tipo} <span className="text-gris">#{a.ref_id}</span></span>
                  <span className="shrink-0 text-gris">{hace(a.enviado_en)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-gris">Todavía no se mandó ningún aviso.</p>
          )}
          <p className="mt-3 text-xs text-gris">
            Plan gratis de Brevo: hasta 300 mails por día.
            {c.celulares != null && ` · ${c.celulares} celular${c.celulares === 1 ? "" : "es"} con notificaciones activadas.`}
          </p>
        </section>
      )}
    </div>
  );
}
