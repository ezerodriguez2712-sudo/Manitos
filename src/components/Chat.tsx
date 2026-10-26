"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Mensaje } from "@/lib/types";

export function Chat({ pedidoId, yo }: { pedidoId: number; yo: string }) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState("");
  const fin = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sb = supabase();
    sb.from("mensajes")
      .select("*")
      .eq("pedido_id", pedidoId)
      .order("creado_en")
      .then(({ data }) => setMensajes(data ?? []));

    const canal = sb
      .channel(`chat-${pedidoId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mensajes", filter: `pedido_id=eq.${pedidoId}` },
        (payload) =>
          setMensajes((m) => (m.some((x) => x.id === payload.new.id) ? m : [...m, payload.new as Mensaje]))
      )
      .subscribe();
    return () => {
      sb.removeChannel(canal);
    };
  }, [pedidoId]);

  useEffect(() => fin.current?.scrollIntoView({ behavior: "smooth" }), [mensajes.length]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = texto.trim();
    if (!t) return;
    setTexto("");
    const { data } = await supabase()
      .from("mensajes")
      .insert({ pedido_id: pedidoId, autor_id: yo, texto: t })
      .select()
      .single();
    if (data) setMensajes((m) => (m.some((x) => x.id === data.id) ? m : [...m, data]));
  };

  return (
    <div className="tarjeta p-0">
      <p className="border-b border-borde px-4 py-3 font-semibold">💬 Chat</p>
      <div className="max-h-80 min-h-32 space-y-2 overflow-y-auto px-4 py-3">
        {mensajes.length === 0 && <p className="text-center text-sm text-gris">Coordiná acá día y horario.</p>}
        {mensajes.map((m) => (
          <div key={m.id} className={`flex ${m.autor_id === yo ? "justify-end" : "justify-start"}`}>
            <p
              className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                m.autor_id === yo ? "bg-marca text-white" : "bg-fondo"
              }`}
            >
              {m.texto}
            </p>
          </div>
        ))}
        <div ref={fin} />
      </div>
      <form onSubmit={enviar} className="flex gap-2 border-t border-borde p-2">
        <input className="campo py-2" placeholder="Escribí un mensaje…" value={texto} onChange={(e) => setTexto(e.target.value)} />
        <button className="btn px-4 py-2">Enviar</button>
      </form>
    </div>
  );
}
