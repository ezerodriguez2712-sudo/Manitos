"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

/** Borra la cuenta y todos sus datos (Ley 25.326). Pide escribir BORRAR para confirmar. */
export function BorrarCuenta({ perfilId }: { perfilId: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState("");

  const borrar = async () => {
    setError("");
    setBorrando(true);
    const sb = supabase();
    // 1) Fotos subidas (perfil y pedidos)
    const { data: archivos } = await sb.storage.from("fotos").list(perfilId, { limit: 1000 });
    if (archivos?.length) await sb.storage.from("fotos").remove(archivos.map((a) => `${perfilId}/${a.name}`));
    const { data: docs } = await sb.storage.from("documentos").list(perfilId, { limit: 100 });
    if (docs?.length) await sb.storage.from("documentos").remove(docs.map((a) => `${perfilId}/${a.name}`));
    // 2) Usuario y todos sus datos
    const { error } = await sb.rpc("borrar_mi_cuenta");
    if (error) {
      setBorrando(false);
      return setError(
        /does not exist|schema cache/i.test(error.message)
          ? "Todavía no se puede borrar la cuenta desde la app. Escribinos y la borramos a mano."
          : error.message
      );
    }
    await sb.auth.signOut();
    router.replace("/?cuenta=borrada");
  };

  return (
    <section className="mt-10 rounded-2xl border border-red-200 bg-white p-4">
      <h2 className="font-titulo text-lg font-bold text-red-700">Borrar mi cuenta</h2>
      <p className="mt-1 text-sm text-gris">
        Se borran para siempre tu perfil, teléfono, fotos, documentos, pedidos, presupuestos, mensajes y calificaciones. No se puede deshacer.
      </p>
      {!abierto ? (
        <button type="button" onClick={() => setAbierto(true)} className="mt-3 text-sm font-semibold text-red-700 underline">
          Quiero borrar mi cuenta
        </button>
      ) : (
        <div className="mt-3 space-y-2">
          <label className="etiqueta" htmlFor="confirmar-borrado">
            Para confirmar, escribí <b>BORRAR</b>
          </label>
          <input
            id="confirmar-borrado"
            className="campo"
            autoComplete="off"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          {error && <p className="aviso-error">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={borrar}
              disabled={texto.trim().toUpperCase() !== "BORRAR" || borrando}
              className="flex-1 rounded-xl bg-red-600 px-4 py-3 font-semibold text-white disabled:opacity-40"
            >
              {borrando ? "Borrando…" : "Borrar definitivamente"}
            </button>
            <button type="button" onClick={() => { setAbierto(false); setTexto(""); setError(""); }} className="btn-sec">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
