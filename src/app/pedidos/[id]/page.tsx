"use client";
import { Building2, CalendarDays, Check, CircleCheck, ClipboardCheck, Crown, Fence, Hourglass, House, MessageCircle, PartyPopper, Pencil, RotateCcw, StickyNote, Zap } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Avatar, Azulejo, Cargando, Encabezado, EstadoChip, Estrellas, SelloVerificado, whatsapp } from "@/components/Encabezado";
import { BarraInferior } from "@/components/BarraInferior";
import { useAvisos } from "@/lib/useAvisos";
import { describirVivienda, linkComoLlegar, linkMaps, mapaEmbebido, type Ubicacion, type Vivienda } from "@/lib/mapas";
import { Chat } from "@/components/Chat";
import { Preguntas } from "@/components/Preguntas";
import { useSesion } from "@/lib/useSesion";
import { quedanGratis, useMiPlan } from "@/lib/plan";
import { fotoUrl, supabase } from "@/lib/supabase";
import {
  ESTADO_LABEL,
  fecha,
  hace,
  mensajeError,
  pesos,
  type Pedido,
  type Perfil,
  type Presupuesto,
  type Reputacion,
  type Respuesta,
  textoRespuesta,
} from "@/lib/types";

interface Datos {
  pedido: Pedido;
  cliente: Perfil | null;
  presupuestos: Presupuesto[];
  reputaciones: Record<string, Reputacion>;
  respuestas: Record<string, Respuesta>;
  pros: Set<string>;
  direccion: (Ubicacion & Partial<Vivienda>) | null;
  telefonoContraparte: string | null;
  yaCalifique: boolean;
}

export default function DetallePedido() {
  const { id } = useParams<{ id: string }>();
  const { perfil, cargando, error: errorSesion } = useSesion();
  const [d, setD] = useState<Datos | null>(null);
  const [noExiste, setNoExiste] = useState(false);
  const { total: totalAvisos } = useAvisos(!!perfil);

  const cargar = useCallback(async () => {
    if (!perfil) return;
    const sb = supabase();
    const { data: pedido } = await sb.from("pedidos").select("*, rubros(*)").eq("id", id).maybeSingle();
    if (!pedido) return setNoExiste(true);

    const [{ data: cliente }, { data: presupuestos }, { data: dir }, { data: calif }] = await Promise.all([
      sb.from("perfiles").select("*").eq("id", pedido.cliente_id).single(),
      sb.from("presupuestos").select("*, perfiles(*)").eq("pedido_id", id).order("monto"),
      sb.from("pedido_direcciones").select("*").eq("pedido_id", id).maybeSingle(),
      sb.from("calificaciones").select("id").eq("pedido_id", id).eq("de_id", perfil.id).maybeSingle(),
    ]);

    const ids = [...new Set([pedido.cliente_id, ...(presupuestos ?? []).map((p) => p.profesional_id)])];
    const [{ data: reps }, { data: resp }, { data: pros }] = await Promise.all([
      sb.from("reputacion").select("*").in("perfil_id", ids),
      sb.from("respuesta").select("*").in("perfil_id", ids),
      sb.from("profesionales_pro").select("perfil_id").in("perfil_id", ids),
    ]);

    // Teléfono de la contraparte (la base sólo lo devuelve si el trabajo está asignado)
    const elegido = (presupuestos ?? []).find((x) => x.id === pedido.presupuesto_elegido_id);
    const contraparte = pedido.cliente_id === perfil.id ? elegido?.profesional_id : pedido.cliente_id;
    const { data: contacto } = contraparte
      ? await sb.from("contactos").select("telefono").eq("perfil_id", contraparte).maybeSingle()
      : { data: null };

    setD({
      pedido,
      cliente,
      presupuestos: presupuestos ?? [],
      reputaciones: Object.fromEntries((reps ?? []).map((r) => [r.perfil_id, r])),
      respuestas: Object.fromEntries((resp ?? []).map((r) => [r.perfil_id, r])),
      pros: new Set((pros ?? []).map((x) => x.perfil_id as string)),
      direccion: dir?.direccion ? { ...dir, texto: dir.direccion, lat: dir.lat ?? null, lng: dir.lng ?? null } : null,
      telefonoContraparte: contacto?.telefono || null,
      yaCalifique: !!calif,
    });
    // Marca el pedido como visto para los avisos (si la base todavía no tiene la función, se ignora)
    sb.rpc("marcar_visto", { p_pedido: Number(id) }).then(
      () => {},
      () => {}
    );
  }, [id, perfil]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (cargando || !perfil) return (<><Encabezado /><Cargando error={errorSesion} /></>);

  return (
    <>
      <Encabezado perfil={perfil} />
      <main className="contenedor space-y-4 pb-28 pt-6">
        <Link href="/panel" className="text-sm text-gris hover:text-tinta">
          ← Volver
        </Link>
        {noExiste ? (
          <p className="tarjeta text-center text-gris">Este pedido no existe o ya no está disponible.</p>
        ) : !d ? (
          <Cargando />
        ) : (
          <>
            <FichaPedido d={d} />
            <Preguntas pedido={d.pedido} yo={perfil} />
            {d.pedido.cliente_id === perfil.id ? (
              <VistaCliente d={d} yo={perfil} recargar={cargar} />
            ) : (
              <VistaProfesional d={d} yo={perfil} recargar={cargar} />
            )}
          </>
        )}
      </main>
      <BarraInferior perfil={perfil} avisos={totalAvisos} />
    </>
  );
}

/* ---------------- Ficha del pedido ---------------- */
function FichaPedido({ d }: { d: Datos }) {
  const p = d.pedido;
  return (
    <section className="tarjeta">
      <div className="flex items-start gap-3">
        <Azulejo nombre={p.rubros?.nombre} icono={p.rubros?.icono} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <EstadoChip estado={p.estado} label={ESTADO_LABEL[p.estado]} />
            {p.urgencia === "urgente" && (
              <span className="rounded-md bg-red-600 px-2 py-0.5 text-xs font-bold text-white">Urgente</span>
            )}
            {p.editado_en && <span className="meta"><Pencil className="ico" /> Editado {hace(p.editado_en)}</span>}
          </div>
          <h1 className="mt-1.5 text-2xl font-extrabold leading-tight tracking-tight">{p.titulo}</h1>
          <p className="mt-1 text-sm text-gris">
            {p.rubros?.nombre} en {p.zona}, publicado {hace(p.creado_en)}
          </p>
        </div>
      </div>
      <p className="mt-2 whitespace-pre-line text-gris">{p.descripcion}</p>
      {p.fotos.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {p.fotos.map((f) => (
            <a key={f} href={fotoUrl(f)} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fotoUrl(f)} alt="Foto del problema" className="h-28 w-28 rounded-xl object-cover" />
            </a>
          ))}
        </div>
      )}
      {d.direccion && <MapaDireccion u={d.direccion} barrio={p.zona} />}
    </section>
  );
}

/* ---------------- Vista del cliente ---------------- */
function VistaCliente({ d, yo, recargar }: { d: Datos; yo: Perfil; recargar: () => void }) {
  const p = d.pedido;
  const [ocupado, setOcupado] = useState(false);
  const elegido = d.presupuestos.find((x) => x.id === p.presupuesto_elegido_id);

  const elegir = async (pr: Presupuesto) => {
    if (!confirm(`¿Elegís a ${pr.perfiles?.nombre} por ${pesos(pr.monto)}? Los demás presupuestos se rechazan.`)) return;
    setOcupado(true);
    const { error } = await supabase().rpc("aceptar_presupuesto", { p_presupuesto: pr.id });
    setOcupado(false);
    if (error) alert(error.message);
    recargar();
  };

  const cambiarEstado = async (estado: "cancelado" | "completado", pregunta: string) => {
    if (pregunta && !confirm(pregunta)) return;
    await supabase().from("pedidos").update({ estado }).eq("id", p.id);
    recargar();
  };

  if (p.estado === "abierto")
    return (
      <>
        <h2 className="pt-2 text-lg font-bold">
          Presupuestos recibidos {d.presupuestos.length > 0 && `(${d.presupuestos.length})`}
        </h2>
        {d.presupuestos.length === 0 ? (
          <p className="tarjeta text-center text-gris">
            <Hourglass className="ico mr-1" /> Ya les avisamos a los profesionales del rubro. Los presupuestos van a aparecer acá.
          </p>
        ) : (
          <ul className="space-y-3">
            {ordenarConPro(d).map((pr) => (
              <li key={pr.id} className="tarjeta">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/profesionales/${pr.profesional_id}`} className="flex min-w-0 items-center gap-2.5">
                    <Avatar nombre={pr.perfiles?.nombre} foto={pr.perfiles?.foto} tam={44} />
                    <span className="min-w-0">
                      <span className="block truncate font-bold">{pr.perfiles?.nombre}</span>
                      <span className="flex flex-wrap items-center gap-1">
                        {d.pros.has(pr.profesional_id) && <EtiquetaPro />}
                        {pr.perfiles?.verificado && <SelloVerificado matriculado={pr.perfiles.matriculado} chico />}
                      </span>
                      <Estrellas {...d.reputaciones[pr.profesional_id]} />
                      {d.respuestas[pr.profesional_id] && (
                        <span className="flex items-center gap-1 text-xs text-gris"><Zap className="ico" /> Responde en {textoRespuesta(d.respuestas[pr.profesional_id].horas)}</span>
                      )}
                    </span>
                  </Link>
                  <div className="text-right">
                    <p className="font-titulo text-2xl font-extrabold">{pesos(pr.monto)}</p>
                    {pr.id === masBarato(d) && d.presupuestos.length > 1 && <span className="chip">Más económico</span>}
                  </div>
                </div>
                {pr.fecha_disponible && (
                  <p className="mt-2 flex items-center gap-1.5 text-sm"><CalendarDays className="ico text-gris" /> Disponible desde el {fecha(pr.fecha_disponible)}</p>
                )}
                {pr.mensaje && <p className="mt-2 whitespace-pre-line text-sm text-gris">“{pr.mensaje}”</p>}
                <Link href={`/profesionales/${pr.profesional_id}`} className="mt-2 inline-block text-sm font-semibold text-marca">
                  Ver perfil y reseñas
                </Link>
                <button className={`${pr.id === masBarato(d) ? "btn" : "btn-sec"} mt-3 w-full py-2.5`} disabled={ocupado} onClick={() => elegir(pr)}>
                  Elegir este presupuesto
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Link href={`/pedidos/${p.id}/editar`} className="btn-sec py-2.5 text-sm">
            <Pencil className="ico" /> Editar pedido
          </Link>
          <button
            className="btn-sec py-2.5 text-sm hover:border-red-300 hover:text-red-600"
            onClick={() => cambiarEstado("cancelado", "¿Cancelar el pedido?")}
          >
            Cancelar pedido
          </button>
        </div>
        {p.vence_en && (
          <p className="text-center text-xs text-gris">
            El pedido recibe presupuestos hasta el {fecha(p.vence_en)}. Si no elegís ninguno, se cierra solo.
          </p>
        )}
      </>
    );

  if (p.estado === "cancelado" || p.estado === "vencido")
    return <Republicar pedido={p} />;

  const pro = elegido?.perfiles;
  const wa = whatsapp(d.telefonoContraparte, `Hola ${pro?.nombre}, te escribo por el trabajo "${p.titulo}" de Manitos.`);
  return (
    <>
      {elegido && pro && (
        <section className="tarjeta border-marca">
          <p className="text-sm font-semibold text-marca">Elegiste a este profesional</p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <Link href={`/profesionales/${pro.id}`} className="flex min-w-0 items-center gap-2.5">
              <Avatar nombre={pro.nombre} foto={pro.foto} tam={44} />
              <span className="min-w-0">
                <span className="block truncate font-bold">{pro.nombre}</span>
                {pro.verificado && <SelloVerificado matriculado={pro.matriculado} chico />}
                <Estrellas {...d.reputaciones[pro.id]} />
              </span>
            </Link>
            <p className="font-titulo text-2xl font-extrabold">{pesos(elegido.monto)}</p>
          </div>
          {wa && (
            <a href={wa} target="_blank" rel="noreferrer" className="btn-sec mt-3 w-full py-2.5">
              <MessageCircle className="ico" /> Escribir por WhatsApp
            </a>
          )}
        </section>
      )}
      {p.estado === "asignado" && p.terminado_pro_en && (
        <section className="tarjeta border-2 border-green-400 bg-green-50">
          <p className="font-bold text-green-900">
            <ClipboardCheck className="ico mr-1" /> {pro?.nombre?.split(" ")[0] ?? "El profesional"} marcó el trabajo como terminado {hace(p.terminado_pro_en)}.
          </p>
          <p className="mt-1 text-sm text-green-900">¿Quedó todo bien? Si no respondés en 3 días, lo damos por terminado.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button className="btn py-2.5" disabled={ocupado} onClick={() => cambiarEstado("completado", "")}>
              <Check className="ico" /> Sí, está terminado
            </button>
            <button
              className="btn-sec py-2.5"
              disabled={ocupado}
              onClick={async () => {
                if (!confirm("¿Le avisamos que todavía falta algo? Contale qué por el chat.")) return;
                setOcupado(true);
                await supabase().rpc("cliente_falta_algo", { p_pedido: p.id });
                setOcupado(false);
                recargar();
              }}
            >
              Falta algo
            </button>
          </div>
        </section>
      )}
      <Chat pedidoId={p.id} yo={yo.id} cerrado={chatCerrado(p.estado)} />
      {p.estado === "asignado" && !p.terminado_pro_en && (
        <button
          className="btn w-full"
          onClick={() => cambiarEstado("completado", "¿El trabajo ya está terminado?")}
        >
          <Check className="ico" /> Marcar trabajo como terminado
        </button>
      )}
      {p.estado === "asignado" && (
        <button
          className="w-full py-2 text-sm text-gris hover:text-red-600"
          onClick={() => cambiarEstado("cancelado", "¿Cancelar el trabajo? Avisale antes al profesional por el chat.")}
        >
          Cancelar el trabajo
        </button>
      )}
      {p.estado === "completado" && elegido && !d.yaCalifique && (
        <Calificar pedidoId={p.id} de={yo.id} para={elegido.profesional_id} nombre={pro?.nombre ?? ""} alListo={recargar} />
      )}
    </>
  );
}

/** Mensaje del chat cuando el trabajo ya no está en curso (undefined = abierto). */
function chatCerrado(estado: Pedido["estado"]) {
  if (estado === "completado") return "El trabajo terminó y el chat se cerró. Si necesitás algo más, publicá un pedido nuevo.";
  if (estado === "cancelado") return "El trabajo se canceló y el chat se cerró.";
  return undefined;
}

/** Etiqueta del plan Pro. */
function EtiquetaPro() {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-cinta px-1.5 text-[11px] font-bold text-tinta">
      <Crown className="h-3 w-3" aria-hidden /> Pro
    </span>
  );
}

/** Los presupuestos de profesionales Pro van primero (manteniendo el orden por precio). */
function ordenarConPro(d: Datos) {
  return [...d.presupuestos].sort((a, b) => Number(d.pros.has(b.profesional_id)) - Number(d.pros.has(a.profesional_id)));
}
const masBarato = (d: Datos) => d.presupuestos.reduce<Presupuesto | null>((m, p) => (!m || p.monto < m.monto ? p : m), null)?.id;

/* ---------------- Pedido cancelado o vencido ---------------- */
function Republicar({ pedido }: { pedido: Pedido }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const republicar = async () => {
    setOcupado(true);
    setError("");
    const { data, error } = await supabase().rpc("republicar_pedido", { p_pedido: pedido.id });
    setOcupado(false);
    if (error) return setError(mensajeError(error, "No se pudo volver a publicar: " + error.message));
    router.push(`/pedidos/${data}`);
  };
  return (
    <div className="tarjeta text-center">
      <p className="font-semibold">
        {pedido.estado === "vencido"
          ? "Este pedido venció: pasaron 15 días sin que eligieras un presupuesto."
          : "Cancelaste este pedido."}
      </p>
      <p className="mt-1 text-sm text-gris">Si todavía lo necesitás, publicalo de nuevo igual y les avisamos otra vez a los profesionales.</p>
      <button onClick={republicar} disabled={ocupado} className="btn-cinta mt-3 w-full">
        {ocupado ? "Publicando…" : <><RotateCcw className="ico" /> Volver a publicar</>}
      </button>
      {error && <p className="aviso-error mt-2">{error}</p>}
    </div>
  );
}

/* ---------------- Vista del profesional ---------------- */
function VistaProfesional({ d, yo, recargar }: { d: Datos; yo: Perfil; recargar: () => void }) {
  const p = d.pedido;
  const mio = d.presupuestos.find((x) => x.profesional_id === yo.id);
  const [editando, setEditando] = useState(false);

  if (!mio || editando) {
    if (p.estado !== "abierto")
      return <p className="tarjeta text-center text-gris">Este pedido ya no recibe presupuestos.</p>;
    return <FormPresupuesto pedidoId={p.id} yo={yo.id} previo={mio} alListo={() => { setEditando(false); recargar(); }} />;
  }

  if (mio.estado === "rechazado")
    return <p className="tarjeta text-center text-gris">El cliente eligió otro presupuesto. ¡Suerte con el próximo!</p>;

  if (mio.estado === "enviado" && p.estado === "vencido")
    return <p className="tarjeta text-center text-gris">El pedido venció sin que el cliente eligiera un presupuesto.</p>;
  if (mio.estado === "enviado" && p.estado === "cancelado")
    return <p className="tarjeta text-center text-gris">El cliente canceló este pedido.</p>;

  const editadoDespues = !!p.editado_en && new Date(p.editado_en) > new Date(mio.creado_en);

  if (mio.estado === "enviado")
    return (
      <section className="tarjeta">
        {editadoDespues && (
          <p className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <Pencil className="ico mr-1" /> El cliente editó el pedido después de tu presupuesto. Revisá la descripción por si tenés que modificarlo.
          </p>
        )}
        <p className="text-sm font-semibold text-gris">Tu presupuesto</p>
        <p className="mt-1 font-titulo text-3xl font-extrabold">{pesos(mio.monto)}</p>
        {mio.fecha_disponible && <p className="flex items-center gap-1.5 text-sm"><CalendarDays className="ico text-gris" /> Desde el {fecha(mio.fecha_disponible)}</p>}
        {mio.mensaje && <p className="mt-2 text-sm text-gris">“{mio.mensaje}”</p>}
        <p className="mt-3 rounded-xl bg-blue-50 p-3 text-sm text-blue-700">
          <Hourglass className="ico mr-1" /> Esperando que el cliente elija. Te avisamos acá si te eligen.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button className="btn-sec py-2.5" onClick={() => setEditando(true)}>
            Modificar
          </button>
          <button
            className="btn-sec py-2.5 hover:border-red-300 hover:text-red-600"
            onClick={async () => {
              if (!confirm("¿Retirar tu presupuesto? El cliente ya no lo va a ver.")) return;
              const { error } = await supabase().from("presupuestos").delete().eq("id", mio.id);
              if (error) alert("No se pudo retirar: " + error.message);
              recargar();
            }}
          >
            Retirar
          </button>
        </div>
      </section>
    );

  if (p.estado === "cancelado")
    return <p className="tarjeta text-center text-gris">El cliente canceló este trabajo.</p>;

  // aceptado
  const wa = whatsapp(d.telefonoContraparte, `Hola ${d.cliente?.nombre}, soy ${yo.nombre} de Manitos, por el trabajo "${p.titulo}".`);
  return (
    <>
      <section className="tarjeta border-green-300 bg-green-50">
        <p className="font-bold text-green-800"><PartyPopper className="ico mr-1" /> ¡El cliente eligió tu presupuesto de {pesos(mio.monto)}!</p>
        <p className="mt-1 text-sm">
          Cliente: <b>{d.cliente?.nombre}</b> <Estrellas {...d.reputaciones[p.cliente_id]} />
        </p>
        {wa && (
          <a href={wa} target="_blank" rel="noreferrer" className="btn-sec mt-3 w-full py-2.5">
            <MessageCircle className="ico" /> Escribir por WhatsApp
          </a>
        )}
      </section>
      <Chat pedidoId={p.id} yo={yo.id} cerrado={chatCerrado(p.estado)} />
      {p.estado === "asignado" && <TerminarTrabajo pedido={p} recargar={recargar} />}
      {p.estado === "completado" && !d.yaCalifique && (
        <Calificar pedidoId={p.id} de={yo.id} para={p.cliente_id} nombre={d.cliente?.nombre ?? ""} alListo={recargar} />
      )}
    </>
  );
}

function TerminarTrabajo({ pedido, recargar }: { pedido: Pedido; recargar: () => void }) {
  const [ocupado, setOcupado] = useState(false);
  if (pedido.terminado_pro_en)
    return (
      <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-800">
        <CircleCheck className="ico mr-1" /> Le avisamos al cliente que terminaste ({hace(pedido.terminado_pro_en)}). Cuando confirme, se pueden calificar. Si
        no responde en 3 días, lo damos por terminado.
      </p>
    );
  return (
    <button
      className="btn w-full"
      disabled={ocupado}
      onClick={async () => {
        if (!confirm("¿Terminaste el trabajo? Le vamos a pedir al cliente que lo confirme.")) return;
        setOcupado(true);
        const { error } = await supabase().rpc("profesional_termina", { p_pedido: pedido.id });
        setOcupado(false);
        if (error) alert(/profesional_termina|schema cache/.test(error.message) ? "Todavía no está disponible." : error.message);
        recargar();
      }}
    >
      <Check className="ico" /> Terminé el trabajo
    </button>
  );
}

function FormPresupuesto({
  pedidoId,
  yo,
  previo,
  alListo,
}: {
  pedidoId: number;
  yo: string;
  previo?: Presupuesto;
  alListo: () => void;
}) {
  const [monto, setMonto] = useState(previo ? String(Math.round(previo.monto)) : "");
  const [fechaDisp, setFechaDisp] = useState(previo?.fecha_disponible ?? "");
  const [mensaje, setMensaje] = useState(previo?.mensaje ?? "");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  // Plan gratis: cuántos presupuestos le quedan este mes (sólo con el cobro activo)
  const { plan } = useMiPlan(!previo);
  const limitado = !previo && plan?.cobro_activo && !plan.es_pro;
  const quedan = plan ? quedanGratis(plan) : 0;

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!Number(monto)) return setError("Poné el precio total del trabajo.");
    setEnviando(true);
    setError("");
    const fila = { monto: Number(monto), fecha_disponible: fechaDisp || null, mensaje: mensaje || null };
    const sb = supabase();
    const { error } = previo
      ? await sb.from("presupuestos").update(fila).eq("id", previo.id)
      : await sb.from("presupuestos").insert({ ...fila, pedido_id: pedidoId, profesional_id: yo });
    setEnviando(false);
    if (error) setError(mensajeError(error, "No se pudo enviar. Puede que el pedido ya no esté disponible."));
    else alListo();
  };

  if (limitado && quedan === 0)
    return (
      <section className="tarjeta border-cinta-oscuro/50 bg-cinta/10">
        <p className="flex items-center gap-2 font-bold">
          <Crown className="ico text-cinta-oscuro" /> Usaste tus presupuestos gratis de este mes
        </p>
        <p className="mt-1 text-sm text-gris">
          Con Manitos Pro mandás presupuestos ilimitados y aparecés primero. Si no, se renuevan el día 1.
        </p>
        <Link href="/pro" className="btn mt-3 w-full">Ver Manitos Pro</Link>
      </section>
    );

  return (
    <form onSubmit={enviar} className="tarjeta space-y-4">
      <h2 className="text-lg font-bold">{previo ? "Modificar presupuesto" : "Enviar presupuesto"}</h2>
      {limitado && (
        <p className="rounded-lg bg-fondo px-3 py-2 text-xs text-gris">
          Te {quedan === 1 ? "queda" : "quedan"} <b>{quedan}</b> presupuesto{quedan === 1 ? "" : "s"} gratis este mes ·{" "}
          <Link href="/pro" className="font-semibold text-marca">Pasate a Pro</Link>
        </p>
      )}
      <div>
        <label className="etiqueta">Precio total ($)</label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-titulo text-lg font-bold text-gris">$</span>
          <input
            className="campo pl-7 font-titulo text-xl font-bold"
            inputMode="numeric"
            required
            placeholder="0"
            value={monto ? Number(monto).toLocaleString("es-AR") : ""}
            onChange={(e) => setMonto(e.target.value.replace(/\D/g, "").slice(0, 10))}
          />
        </div>
      </div>
      <div>
        <label className="etiqueta">¿Desde cuándo podés ir?</label>
        <input className="campo" type="date" value={fechaDisp} onChange={(e) => setFechaDisp(e.target.value)} />
      </div>
      <div>
        <label className="etiqueta">Mensaje para el cliente</label>
        <textarea className="campo min-h-24" placeholder="Qué incluye el precio, materiales, garantía…" value={mensaje} onChange={(e) => setMensaje(e.target.value)} />
      </div>
      {error && <p className="aviso-error">{error}</p>}
      <button className="btn w-full" disabled={enviando}>
        {enviando ? "Enviando…" : previo ? "Guardar cambios" : "Enviar presupuesto"}
      </button>
    </form>
  );
}

function Calificar({
  pedidoId,
  de,
  para,
  nombre,
  alListo,
}: {
  pedidoId: number;
  de: string;
  para: string;
  nombre: string;
  alListo: () => void;
}) {
  const [puntaje, setPuntaje] = useState(0);
  const [comentario, setComentario] = useState("");
  const enviar = async () => {
    await supabase().from("calificaciones").insert({ pedido_id: pedidoId, de_id: de, para_id: para, puntaje, comentario: comentario || null });
    alListo();
  };
  return (
    <section className="tarjeta">
      <h2 className="font-bold">¿Cómo fue tu experiencia con {nombre}?</h2>
      <div className="mt-2 flex gap-1 text-3xl">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => setPuntaje(n)} className={n <= puntaje ? "text-amber-500" : "text-gray-300"}>
            ★
          </button>
        ))}
      </div>
      <textarea className="campo mt-3 min-h-20" placeholder="Comentario (opcional)" value={comentario} onChange={(e) => setComentario(e.target.value)} />
      <button className="btn mt-3 w-full" disabled={!puntaje} onClick={enviar}>
        Enviar calificación
      </button>
    </section>
  );
}

/** Dirección del trabajo con mapa y botones de Google Maps (sólo la ven cliente y profesional elegido). */
function MapaDireccion({ u, barrio }: { u: Ubicacion & Partial<Vivienda>; barrio: string }) {
  const extra = describirVivienda(u);
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-borde">
      <iframe
        title="Mapa de la dirección"
        src={mapaEmbebido(u, barrio)}
        className="h-44 w-full border-0"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
      <div className="space-y-2 bg-fondo/60 p-3">
        <p className="text-sm">
          {u.tipo === "departamento" ? <Building2 className="ico text-gris" /> : u.tipo === "barrio_cerrado" ? <Fence className="ico text-gris" /> : <House className="ico text-gris" />} <b>{u.texto}</b>
          <span className="text-gris">, {barrio}</span>
        </p>
        {extra && <p className="text-sm font-semibold">{extra}</p>}
        {u.referencias && <p className="flex items-start gap-1.5 text-sm text-gris"><StickyNote className="ico mt-0.5" /> {u.referencias}</p>}
        <div className="grid grid-cols-2 gap-2">
          <a href={linkMaps(u, barrio)} target="_blank" rel="noreferrer" className="btn-sec py-2 text-sm">
            Ver en Maps
          </a>
          <a href={linkComoLlegar(u, barrio)} target="_blank" rel="noreferrer" className="btn py-2 text-sm">
            Cómo llegar
          </a>
        </div>
      </div>
    </div>
  );
}
