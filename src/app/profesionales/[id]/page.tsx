"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Avatar, Azulejo, Cargando, Encabezado } from "@/components/Encabezado";
import { BarraInferior } from "@/components/BarraInferior";
import { useSesion } from "@/lib/useSesion";
import { useAvisos } from "@/lib/useAvisos";
import { supabase } from "@/lib/supabase";
import { fecha, type Perfil, type Reputacion, type Rubro } from "@/lib/types";

interface Resena {
  id: number;
  puntaje: number;
  comentario: string | null;
  creado_en: string;
  autor?: { nombre: string } | null;
}

/** Perfil público del profesional: lo que ve un cliente antes de elegirlo. */
export default function PerfilProfesional() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { perfil: yo, cargando, error } = useSesion();
  const { total } = useAvisos(!!yo);
  const [pro, setPro] = useState<Perfil | null>(null);
  const [rubros, setRubros] = useState<Rubro[]>([]);
  const [rep, setRep] = useState<Reputacion | null>(null);
  const [resenas, setResenas] = useState<Resena[]>([]);
  const [noExiste, setNoExiste] = useState(false);

  useEffect(() => {
    if (!yo) return;
    const sb = supabase();
    (async () => {
      const { data: p } = await sb.from("perfiles").select("*").eq("id", id).maybeSingle();
      if (!p || p.rol !== "profesional") return setNoExiste(true);
      setPro(p);
      const [{ data: r }, { data: re }, { data: c }] = await Promise.all([
        sb.from("profesional_rubros").select("rubros(*)").eq("profesional_id", id),
        sb.from("reputacion").select("*").eq("perfil_id", id).maybeSingle(),
        sb
          .from("calificaciones")
          .select("id, puntaje, comentario, creado_en, autor:perfiles!calificaciones_de_id_fkey(nombre)")
          .eq("para_id", id)
          .order("creado_en", { ascending: false })
          .limit(30),
      ]);
      setRubros(((r ?? []) as unknown as { rubros: Rubro }[]).map((x) => x.rubros).filter(Boolean));
      setRep(re);
      setResenas((c as unknown as Resena[]) ?? []);
    })();
  }, [id, yo]);

  if (cargando || !yo) return (<><Encabezado /><Cargando error={error} /></>);

  const zonas = pro?.zonas?.length ? pro.zonas : pro?.zona ? pro.zona.split(",").map((z) => z.trim()) : [];
  const conComentario = resenas.filter((r) => r.comentario);

  return (
    <>
      <Encabezado perfil={yo} />
      <main className="contenedor space-y-4 pb-28 pt-6">
        <button onClick={() => router.back()} className="text-sm text-gris hover:text-tinta">
          ← Volver
        </button>
        {noExiste ? (
          <p className="tarjeta text-center text-gris">No encontramos este profesional.</p>
        ) : !pro ? (
          <Cargando />
        ) : (
          <>
            <section className="tarjeta overflow-hidden p-0">
              <div className="h-16 bg-marca" />
              <div className="cinta-metrica h-2" aria-hidden />
              <div className="-mt-12 px-4 pb-4">
                <Avatar nombre={pro.nombre} foto={pro.foto} tam={88} className="border-4 border-white" />
                <h1 className="mt-2 text-2xl font-extrabold leading-tight tracking-tight">{pro.nombre}</h1>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  {rep?.cantidad ? (
                    <span>
                      <span className="text-amber-500">★</span> <b>{rep.promedio}</b>{" "}
                      <span className="text-gris">
                        ({rep.cantidad} calificaci{rep.cantidad === 1 ? "ón" : "ones"})
                      </span>
                    </span>
                  ) : (
                    <span className="rounded-md bg-cinta/30 px-2 py-0.5 text-xs font-semibold">Nuevo en Manitos</span>
                  )}
                </div>
                {pro.descripcion && <p className="mt-3 whitespace-pre-line text-gris">{pro.descripcion}</p>}
              </div>
            </section>

            {rubros.length > 0 && (
              <section className="tarjeta">
                <h2 className="font-bold">Trabajos que hace</h2>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {rubros.map((r) => (
                    <span key={r.id} className="flex items-center gap-2 text-sm font-semibold">
                      <Azulejo nombre={r.nombre} icono={r.icono} chico />
                      {r.nombre}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {zonas.length > 0 && (
              <section className="tarjeta">
                <h2 className="font-bold">Zonas donde trabaja</h2>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {zonas.map((z) => (
                    <span key={z} className="meta text-sm">📍 {z}</span>
                  ))}
                </div>
              </section>
            )}

            <section className="tarjeta">
              <h2 className="font-bold">Reseñas de clientes</h2>
              {conComentario.length === 0 ? (
                <p className="mt-2 text-sm text-gris">
                  {rep?.cantidad
                    ? "Sus clientes lo calificaron pero todavía no dejaron comentarios."
                    : "Todavía no tiene reseñas. Cuando termine un trabajo, el cliente lo puede calificar."}
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-borde">
                  {conComentario.map((r) => (
                    <li key={r.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-semibold">{nombreCorto(r.autor?.nombre)}</span>
                        <span className="text-xs text-gris">{fecha(r.creado_en)}</span>
                      </div>
                      <p className="text-amber-500" aria-label={`${r.puntaje} de 5 estrellas`}>
                        {"★".repeat(r.puntaje)}
                        <span className="text-borde">{"★".repeat(5 - r.puntaje)}</span>
                      </p>
                      <p className="mt-1 text-sm">{r.comentario}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
      <BarraInferior perfil={yo} avisos={total} />
    </>
  );
}

/** "Carlos Gómez" → "Carlos G." para cuidar la privacidad de quien reseña. */
function nombreCorto(n?: string | null) {
  if (!n) return "Cliente";
  const [a, b] = n.trim().split(/\s+/);
  return b ? `${a} ${b[0]}.` : a;
}
