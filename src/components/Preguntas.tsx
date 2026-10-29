"use client";
import { useCallback, useEffect, useState } from "react";
import { Avatar, SelloVerificado } from "@/components/Encabezado";
import { supabase } from "@/lib/supabase";
import { hace, tieneContacto, type Pedido, type Perfil, type Pregunta } from "@/lib/types";

const MAX_PREGUNTAS = 3;
const AVISO_CONTACTO = "Por seguridad no se pueden pasar teléfonos ni mails acá. Se comparten solos cuando el cliente elige un presupuesto.";

/** Preguntas de los profesionales al cliente antes de presupuestar. */
export function Preguntas({ pedido, yo }: { pedido: Pedido; yo: Perfil }) {
  const esCliente = pedido.cliente_id === yo.id;
  const abierto = pedido.estado === "abierto";
  const [lista, setLista] = useState<Pregunta[] | null>(null);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase()
      .from("preguntas")
      .select("*, perfiles(nombre, foto, verificado)")
      .eq("pedido_id", pedido.id)
      .order("creado_en");
    // Si la base todavía no tiene la tabla, la sección no se muestra
    setLista(error ? [] : ((data ?? []) as Pregunta[]));
    if (error && !/preguntas|schema cache|does not exist/i.test(error.message)) setError(error.message);
  }, [pedido.id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (!lista) return null;
  const mias = lista.filter((q) => q.profesional_id === yo.id);
  // El cliente sólo ve la sección si le preguntaron algo; cerrado el pedido, sólo si hubo preguntas
  if ((esCliente || !abierto) && lista.length === 0) return null;

  const preguntar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const t = texto.trim();
    if (t.length < 3) return;
    if (tieneContacto(t)) return setError(AVISO_CONTACTO);
    setEnviando(true);
    const { error } = await supabase().from("preguntas").insert({ pedido_id: pedido.id, profesional_id: yo.id, texto: t });
    setEnviando(false);
    if (error) return setError(/row-level|policy/i.test(error.message) ? "No se pudo enviar la pregunta (máximo 3 por pedido)." : error.message);
    setTexto("");
    cargar();
  };

  const pendientes = lista.filter((q) => !q.respuesta).length;

  return (
    <section id="preguntas" className="tarjeta scroll-mt-20">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">
          {esCliente ? "Preguntas de los profesionales" : "Preguntas al cliente"}
          {lista.length > 0 && <span className="ml-1 text-gris">({lista.length})</span>}
        </h2>
        {esCliente && pendientes > 0 && (
          <span className="shrink-0 whitespace-nowrap rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">{pendientes} sin responder</span>
        )}
      </div>
      {esCliente && pendientes > 0 && (
        <p className="mt-1 text-sm text-gris">Respondé para recibir presupuestos más precisos. Las respuestas las ven todos los profesionales.</p>
      )}
      {!esCliente && lista.length === 0 && (
        <p className="mt-1 text-sm text-gris">¿Te falta un dato para calcular el precio? Preguntale al cliente antes de presupuestar.</p>
      )}

      {lista.length > 0 && (
        <ul className="mt-3 space-y-3">
          {lista.map((q) => (
            <ItemPregunta key={q.id} q={q} yo={yo} esCliente={esCliente} abierto={abierto} alCambiar={cargar} />
          ))}
        </ul>
      )}

      {!esCliente && abierto && mias.length < MAX_PREGUNTAS && (
        <form onSubmit={preguntar} className="mt-3 space-y-2">
          <label htmlFor="nueva-pregunta" className="sr-only">Tu pregunta</label>
          <textarea
            id="nueva-pregunta"
            className="campo min-h-20"
            maxLength={300}
            placeholder="Ej: ¿De qué marca es el calefón? ¿Hay que subir a un techo?"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-gris">
              Te quedan {MAX_PREGUNTAS - mias.length} · Todos los profesionales ven la pregunta, sin tus datos de contacto.
            </span>
            <button className="btn-sec shrink-0 px-4 py-2" disabled={enviando || texto.trim().length < 3}>
              {enviando ? "Enviando…" : "Preguntar"}
            </button>
          </div>
        </form>
      )}
      {error && <p className="aviso-error mt-2">{error}</p>}
    </section>
  );
}

function ItemPregunta({
  q,
  yo,
  esCliente,
  abierto,
  alCambiar,
}: {
  q: Pregunta;
  yo: Perfil;
  esCliente: boolean;
  abierto: boolean;
  alCambiar: () => void;
}) {
  const [respuesta, setRespuesta] = useState(q.respuesta ?? "");
  const [editando, setEditando] = useState(false);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const mia = q.profesional_id === yo.id;
  const nombre = mia ? "Vos" : q.perfiles?.nombre?.split(" ")[0] || "Profesional";

  const responder = async () => {
    setError("");
    const r = respuesta.trim();
    if (!r) return;
    if (tieneContacto(r)) return setError(AVISO_CONTACTO);
    setOcupado(true);
    const { error } = await supabase().from("preguntas").update({ respuesta: r }).eq("id", q.id);
    setOcupado(false);
    if (error) return setError(error.message);
    setEditando(false);
    alCambiar();
  };

  const borrar = async () => {
    if (!confirm("¿Borrar tu pregunta?")) return;
    await supabase().from("preguntas").delete().eq("id", q.id);
    alCambiar();
  };

  return (
    <li className="rounded-xl bg-fondo p-3">
      <div className="flex items-start gap-2.5">
        <Avatar nombre={q.perfiles?.nombre} foto={q.perfiles?.foto} tam={30} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-gris">
            <b className="text-tinta">{nombre}</b>
            {q.perfiles?.verificado && <SelloVerificado chico />}
            <span>· {hace(q.creado_en)}</span>
          </p>
          <p className="mt-0.5 whitespace-pre-line">{q.texto}</p>

          {q.respuesta && !editando ? (
            <div className="mt-2 rounded-lg border-l-4 border-marca bg-white px-3 py-2 text-sm">
              <p className="text-xs font-semibold text-marca">
                {esCliente ? "Tu respuesta" : "Respuesta del cliente"}
                {q.respondido_en && <span className="font-normal text-gris"> · {hace(q.respondido_en)}</span>}
              </p>
              <p className="whitespace-pre-line">{q.respuesta}</p>
              {esCliente && abierto && (
                <button onClick={() => setEditando(true)} className="mt-1 text-xs font-semibold text-gris hover:text-tinta">
                  Corregir
                </button>
              )}
            </div>
          ) : esCliente && abierto ? (
            <div className="mt-2 space-y-2">
              <label htmlFor={`resp-${q.id}`} className="sr-only">Tu respuesta</label>
              <textarea
                id={`resp-${q.id}`}
                className="campo min-h-16 bg-white"
                maxLength={500}
                placeholder="Escribí tu respuesta…"
                value={respuesta}
                onChange={(e) => setRespuesta(e.target.value)}
              />
              <div className="flex gap-2">
                <button onClick={responder} disabled={ocupado || !respuesta.trim()} className="btn px-4 py-2 text-sm">
                  {ocupado ? "Enviando…" : "Responder"}
                </button>
                {editando && (
                  <button onClick={() => { setEditando(false); setRespuesta(q.respuesta ?? ""); }} className="btn-sec px-4 py-2 text-sm">
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          ) : (
            !q.respuesta && (
              <p className="mt-1 text-xs text-gris">
                ⏳ Esperando respuesta del cliente
                {mia && abierto && (
                  <button onClick={borrar} className="ml-2 font-semibold text-gris underline hover:text-red-600">Borrar</button>
                )}
              </p>
            )
          )}
          {error && <p className="aviso-error mt-2">{error}</p>}
        </div>
      </div>
    </li>
  );
}
