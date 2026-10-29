"use client";
import { CircleAlert } from "lucide-react";
import { useEffect } from "react";

/** Si una pantalla falla, mostramos el motivo en vez de la pantalla blanca. */
export default function ErrorPantalla({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="contenedor max-w-md py-12">
      <CircleAlert className="mx-auto h-11 w-11 text-gris" aria-hidden />
      <h1 className="titulo mt-2">Algo salió mal</h1>
      <p className="mt-2 text-gris">Probá de nuevo. Si se repite, mandá una captura de esta pantalla.</p>
      <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-xl bg-red-50 p-3 text-xs text-red-700">
        {error.message}
        {"\n"}
        {error.stack?.split("\n").slice(0, 4).join("\n")}
      </pre>
      <div className="mt-4 flex gap-2">
        <button className="btn" onClick={() => reset()}>
          Reintentar
        </button>
        <button className="btn-sec" onClick={() => (window.location.href = "/panel")}>
          Ir al inicio
        </button>
      </div>
    </main>
  );
}
