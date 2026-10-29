import { NextResponse } from "next/server";
import { clienteServicio, emailDe, enviar, env, perfilDe, recortar, saludo, urlSitio, type Mail } from "@/lib/correo";
import { PIE_AVISOS, plantillaMail } from "@/lib/mails";

/**
 * Tarea diaria (la ejecuta Vercel sola, ver vercel.json):
 *  1. Consulta la base: así Supabase registra actividad y no pausa el proyecto gratuito.
 *  2. Vence los pedidos abiertos que pasaron los 15 días y le avisa al cliente.
 *  3. Le recuerda al cliente que tiene presupuestos esperando (una sola vez por pedido).
 *
 * Si en Vercel está la variable CRON_SECRET, sólo responde a Vercel. Igual, correrla
 * de más no hace daño: cada pedido se vence y se recuerda una sola vez.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secreto = env("CRON_SECRET");
  if (secreto && req.headers.get("authorization") !== `Bearer ${secreto}`)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!env("SUPABASE_SERVICE_ROLE_KEY"))
    return NextResponse.json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });

  const sb = clienteServicio();
  const resultado: Record<string, unknown> = {};

  // 1) Actividad en la base
  const { count, error: ePing } = await sb.from("pedidos").select("id", { count: "exact", head: true });
  resultado.base = ePing ? `error: ${ePing.message}` : `ok (${count} pedidos)`;

  const sitio = urlSitio();
  const mails: Mail[] = [];

  // 2) Pedidos vencidos
  const { data: vencidos, error: eV } = await sb.rpc("tarea_vencer_pedidos");
  if (eV) resultado.vencidos = `error: ${eV.message}`;
  else {
    const ids = (vencidos ?? []) as number[];
    resultado.vencidos = ids.length;
    if (ids.length) {
      const { data: peds } = await sb.from("pedidos").select("id, titulo, cliente_id").in("id", ids);
      for (const p of peds ?? []) {
        const cliente = await perfilDe(sb, p.cliente_id);
        if (!cliente || cliente.avisos_mail === false) continue;
        const email = await emailDe(sb, cliente.id);
        if (!email) continue;
        mails.push({
          para: email,
          nombre: cliente.nombre,
          asunto: `Tu pedido "${recortar(p.titulo, 50)}" venció`,
          html: plantillaMail({
            titulo: "Tu pedido venció",
            texto: `${saludo(cliente.nombre)}, pasaron 15 días sin que elijas un presupuesto, así que lo cerramos. Si todavía necesitás el trabajo, lo podés volver a publicar con un toque.`,
            detalle: p.titulo,
            boton: "Volver a publicar",
            enlace: `${sitio}/pedidos/${p.id}`,
            pie: PIE_AVISOS,
          }),
        });
      }
    }
  }

  // 3) Recordatorios de presupuestos sin elegir
  const { data: recordar, error: eR } = await sb.rpc("tarea_recordatorios");
  if (eR) resultado.recordatorios = `error: ${eR.message}`;
  else {
    const filas = (recordar ?? []) as { pedido_id: number; cliente_id: string; titulo: string; presupuestos: number; vence_en: string }[];
    resultado.recordatorios = filas.length;
    for (const r of filas) {
      const cliente = await perfilDe(sb, r.cliente_id);
      if (!cliente || cliente.avisos_mail === false) continue;
      const email = await emailDe(sb, cliente.id);
      if (!email) continue;
      const dias = Math.max(1, Math.ceil((new Date(r.vence_en).getTime() - Date.now()) / 86_400_000));
      const n = Number(r.presupuestos);
      mails.push({
        para: email,
        nombre: cliente.nombre,
        asunto: `Tenés ${n} presupuesto${n === 1 ? "" : "s"} esperando`,
        html: plantillaMail({
          titulo: n === 1 ? "Tenés un presupuesto esperando" : `Tenés ${n} presupuestos esperando`,
          texto: `${saludo(cliente.nombre)}, los profesionales ya te pasaron precio. Compará y elegí el que más te convenga: el pedido sigue abierto ${dias} día${dias === 1 ? "" : "s"} más.`,
          detalle: r.titulo,
          boton: n === 1 ? "Ver presupuesto" : "Comparar presupuestos",
          enlace: `${sitio}/pedidos/${r.pedido_id}`,
          pie: PIE_AVISOS,
        }),
      });
    }
  }

  if (mails.length) {
    try {
      resultado.mails = await enviar(mails);
    } catch (e) {
      resultado.mails = `error: ${e instanceof Error ? e.message : String(e)}`;
    }
  } else resultado.mails = 0;

  return NextResponse.json({ ok: true, ...resultado });
}
