import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import {
  emailDe,
  enviar,
  env,
  explicar,
  pareceMail,
  perfilDe,
  recortar,
  saludo,
  urlSitio,
  urlSupabase,
  type Destinatario,
  type Mail,
} from "@/lib/correo";
import { mismoBarrio } from "@/lib/barrios";
import { PIE_AVISOS, plantillaMail } from "@/lib/mails";
import { pesos } from "@/lib/types";
import { describirVivienda, linkComoLlegar } from "@/lib/mapas";

/**
 * Recibe los avisos que dispara la base de datos (pedido nuevo, presupuesto nuevo,
 * presupuesto elegido) y manda el mail correspondiente por Brevo.
 *
 * Variables de entorno (en Vercel, NO públicas):
 *   SUPABASE_SERVICE_ROLE_KEY, BREVO_SMTP_USUARIO, BREVO_SMTP_CLAVE, MAIL_REMITENTE
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_PROFESIONALES = 60;
const MINUTOS_VIGENCIA = 30; // sólo se avisan eventos de los últimos 30 minutos

const reciente = (fecha?: string | null) =>
  !!fecha && Date.now() - new Date(fecha).getTime() < MINUTOS_VIGENCIA * 60_000; // tope por pedido para cuidar el límite diario de Brevo

const TIPOS = ["nuevo_pedido", "nuevo_presupuesto", "elegido", "pregunta", "respuesta", "verificacion", "terminado"] as const;
type Tipo = (typeof TIPOS)[number];

export async function POST(req: Request) {
  // Seguridad: no hace falta un secreto compartido. Sólo se avisa de eventos reales,
  // recientes (últimos MINUTOS_VIGENCIA) y una sola vez cada uno (tabla avisos_enviados),
  // así que llamar a esta dirección de afuera no permite mandar mails de más.

  let tipo: Tipo, id: number;
  try {
    const b = await req.json();
    tipo = b.tipo;
    id = Number(b.id);
    if (!TIPOS.includes(tipo) || !id) throw new Error();
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }

  const faltan = ["SUPABASE_SERVICE_ROLE_KEY", "BREVO_SMTP_USUARIO", "BREVO_SMTP_CLAVE", "MAIL_REMITENTE"].filter(
    (v) => !process.env[v]
  );
  if (faltan.length) return NextResponse.json({ error: `Faltan variables: ${faltan.join(", ")}` }, { status: 500 });

  const sb = createClient(urlSupabase(), process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Evita mandar dos veces el mismo aviso
  const { error: dup } = await sb.from("avisos_enviados").insert({ tipo, ref_id: id });
  if (dup) {
    if (dup.code === "23505") return NextResponse.json({ ok: true, repetido: true });
    return NextResponse.json({ error: dup.message }, { status: 500 });
  }

  try {
    const notas: string[] = [];
    const mails = await armarMails(sb, tipo, id, notas);
    const enviados = await enviar(mails);
    return NextResponse.json({ ok: true, enviados, ...(notas.length ? { notas } : {}) });
  } catch (e) {
    // Si falla, se libera para poder reintentar
    await sb.from("avisos_enviados").delete().eq("tipo", tipo).eq("ref_id", id);
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Aviso fallido", tipo, id, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function armarMails(sb: SupabaseClient, tipo: Tipo, id: number, notas: string[]): Promise<Mail[]> {
  const sitio = urlSitio();

  if (tipo === "nuevo_pedido") {
    const { data: p } = await sb.from("pedidos").select("*, rubros(nombre)").eq("id", id).maybeSingle();
    if (!p) return nota(notas, `pedido #${id} no encontrado`);
    if (p.estado !== "abierto" || !reciente(p.creado_en)) return nota(notas, "pedido cerrado o de hace más de 30 minutos");
    const { data: prs } = await sb
      .from("profesional_rubros")
      .select("profesional_id, perfiles(*)")
      .eq("rubro_id", p.rubro_id);
    const candidatos = ((prs ?? []) as unknown as { perfiles: Destinatario | null }[])
      .map((x) => x.perfiles)
      .filter((x): x is Destinatario => !!x && x.rol === "profesional" && x.avisos_mail !== false && !x.suspendido && x.id !== p.cliente_id)
      // Sólo a quienes trabajan en ese barrio, o a quienes todavía no eligieron zonas
      .filter((x) => !x.zonas?.length || x.zonas.some((z) => mismoBarrio(z, p.zona)))
      .slice(0, MAX_PROFESIONALES);

    const urgente = p.urgencia === "urgente" ? "Urgente: " : "";
    const mails: Mail[] = [];
    if (!candidatos.length) notas.push("ningún profesional de ese rubro trabaja en esa zona o tiene los avisos activos");
    for (const pro of candidatos) {
      const email = await emailDe(sb, pro.id, notas);
      if (!email) continue;
      mails.push({
        para: email,
        nombre: pro.nombre,
        asunto: `${urgente}Pedido de ${p.rubros?.nombre ?? "trabajo"} en ${p.zona}`,
        html: plantillaMail({
          titulo: `${urgente}nuevo pedido de ${(p.rubros?.nombre ?? "trabajo").toLowerCase()}`,
          texto: `${saludo(pro.nombre)}, un vecino de ${p.zona} necesita un profesional. Mandale tu presupuesto antes que otros.`,
          detalle: `${p.titulo}\n${recortar(p.descripcion, 220)}`,
          boton: "Ver pedido y presupuestar",
          enlace: `${sitio}/pedidos/${p.id}`,
          pie: PIE_AVISOS,
        }),
      });
    }
    return mails;
  }

  if (tipo === "nuevo_presupuesto") {
    const { data: presu, error: ePr } = await sb.from("presupuestos").select("*").eq("id", id).maybeSingle();
    if (!presu) return nota(notas, `presupuesto #${id} no encontrado${ePr ? ": " + ePr.message : ""}`);
    if (!reciente(presu.creado_en)) return nota(notas, "presupuesto de hace más de 30 minutos");
    const { data: ped, error: ePe } = await sb
      .from("pedidos")
      .select("id, titulo, cliente_id, estado")
      .eq("id", presu.pedido_id)
      .maybeSingle();
    if (!ped) return nota(notas, `pedido #${presu.pedido_id} no encontrado${ePe ? ": " + ePe.message : ""}`);
    if (ped.estado !== "abierto") return nota(notas, `el pedido ya no está abierto (${ped.estado})`);
    const autor = await perfilDe(sb, presu.profesional_id);
    const pr = { ...presu, perfiles: autor, pedidos: ped };
    const cliente = await perfilDe(sb, ped.cliente_id);
    if (!cliente) return nota(notas, "no se encontró el perfil del cliente");
    if (cliente.avisos_mail === false) return nota(notas, "el cliente tiene los avisos por mail apagados");
    const email = await emailDe(sb, cliente.id, notas);
    if (!email) return [];
    const { count } = await sb.from("presupuestos").select("id", { count: "exact", head: true }).eq("pedido_id", pr.pedidos.id);
    const n = count ?? 1;
    return [
      {
        para: email,
        nombre: cliente.nombre,
        asunto: `Nuevo presupuesto: ${pesos(Number(pr.monto))} para "${recortar(pr.pedidos.titulo, 50)}"`,
        html: plantillaMail({
          titulo: "Te llegó un presupuesto",
          texto: `${saludo(cliente.nombre)}, ${pr.perfiles?.nombre ?? "un profesional"} te pasó presupuesto. Ya tenés ${n} para comparar.`,
          detalle: `${pr.pedidos.titulo}\nPrecio: ${pesos(Number(pr.monto))}${pr.mensaje ? `\n"${recortar(pr.mensaje, 200)}"` : ""}`,
          boton: n > 1 ? "Comparar presupuestos" : "Ver presupuesto",
          enlace: `${sitio}/pedidos/${pr.pedidos.id}`,
          pie: PIE_AVISOS,
        }),
      },
    ];
  }

  if (tipo === "pregunta" || tipo === "respuesta") {
    const { data: q } = await sb.from("preguntas").select("*").eq("id", id).maybeSingle();
    if (!q) return nota(notas, `pregunta #${id} no encontrada`);
    if (!reciente(tipo === "pregunta" ? q.creado_en : q.respondido_en)) return nota(notas, "de hace más de 30 minutos");
    const { data: ped } = await sb.from("pedidos").select("id, titulo, cliente_id, estado").eq("id", q.pedido_id).maybeSingle();
    if (!ped || ped.estado !== "abierto") return nota(notas, "el pedido ya no está abierto");
    const pro = await perfilDe(sb, q.profesional_id);
    if (tipo === "pregunta") {
      const cliente = await perfilDe(sb, ped.cliente_id);
      if (!cliente || cliente.avisos_mail === false) return nota(notas, "el cliente tiene los avisos por mail apagados");
      const email = await emailDe(sb, cliente.id, notas);
      if (!email) return [];
      return [
        {
          para: email,
          nombre: cliente.nombre,
          asunto: `Te hicieron una pregunta sobre "${recortar(ped.titulo, 50)}"`,
          html: plantillaMail({
            titulo: "Un profesional tiene una consulta",
            texto: `${saludo(cliente.nombre)}, ${pro?.nombre ?? "un profesional"} necesita un dato para pasarte un presupuesto más preciso.`,
            detalle: `${ped.titulo}\n"${recortar(q.texto, 300)}"`,
            boton: "Responder",
            enlace: `${sitio}/pedidos/${ped.id}#preguntas`,
            pie: PIE_AVISOS,
          }),
        },
      ];
    }
    if (!pro || pro.avisos_mail === false) return nota(notas, "el profesional tiene los avisos por mail apagados");
    const email = await emailDe(sb, pro.id, notas);
    if (!email) return [];
    return [
      {
        para: email,
        nombre: pro.nombre,
        asunto: `Te respondieron: "${recortar(ped.titulo, 50)}"`,
        html: plantillaMail({
          titulo: "El cliente respondió tu pregunta",
          texto: `${saludo(pro.nombre)}, ya tenés la respuesta. Ahora podés mandar tu presupuesto.`,
          detalle: `Tu pregunta: "${recortar(q.texto, 200)}"\nRespuesta: "${recortar(q.respuesta ?? "", 300)}"`,
          boton: "Ver pedido y presupuestar",
          enlace: `${sitio}/pedidos/${ped.id}`,
          pie: PIE_AVISOS,
        }),
      },
    ];
  }

  if (tipo === "terminado") {
    const { data: p } = await sb.from("pedidos").select("*").eq("id", id).maybeSingle();
    if (!p || p.estado !== "asignado" || !reciente(p.terminado_pro_en)) return nota(notas, "el trabajo ya no está pendiente de confirmar");
    const cliente = await perfilDe(sb, p.cliente_id);
    if (!cliente || cliente.avisos_mail === false) return nota(notas, "el cliente tiene los avisos por mail apagados");
    const email = await emailDe(sb, cliente.id, notas);
    if (!email) return [];
    const { data: pr } = await sb.from("presupuestos").select("profesional_id").eq("id", p.presupuesto_elegido_id).maybeSingle();
    const pro = pr ? await perfilDe(sb, pr.profesional_id) : null;
    return [
      {
        para: email,
        nombre: cliente.nombre,
        asunto: `¿Quedó bien? ${pro?.nombre ?? "El profesional"} terminó el trabajo`,
        html: plantillaMail({
          titulo: "El profesional marcó el trabajo como terminado",
          texto: `${saludo(cliente.nombre)}, ${pro?.nombre ?? "el profesional"} avisó que terminó. Confirmalo y dejale una calificación: ayuda a otros vecinos a elegir. Si falta algo, avisale desde el pedido. Si no respondés en 3 días, lo damos por terminado.`,
          detalle: p.titulo,
          boton: "Confirmar y calificar",
          enlace: `${sitio}/pedidos/${p.id}`,
          pie: PIE_AVISOS,
        }),
      },
    ];
  }

  if (tipo === "verificacion") {
    const { data: v } = await sb.from("verificaciones").select("*").eq("revision", id).maybeSingle();
    if (!v || !reciente(v.revisado_en)) return nota(notas, "revisión no encontrada o de hace más de 30 minutos");
    const pro = await perfilDe(sb, v.perfil_id);
    const email = pro ? await emailDe(sb, pro.id, notas) : null;
    if (!pro || !email) return [];
    const ok = v.estado === "aprobada";
    return [
      {
        para: email,
        nombre: pro.nombre,
        asunto: ok ? "¡Tu perfil está verificado! ✓" : "Revisamos tu verificación: falta corregir algo",
        html: plantillaMail({
          titulo: ok ? "¡Ya sos profesional verificado!" : "Necesitamos que corrijas algo",
          texto: ok
            ? `${saludo(pro.nombre)}, revisamos tus datos y tu perfil ya muestra el sello de verificado. Los clientes confían más en los perfiles verificados.`
            : `${saludo(pro.nombre)}, revisamos tus documentos pero no pudimos verificarte todavía. Corregí lo que te indicamos y volvé a enviarlos desde tu perfil.`,
          detalle: ok ? undefined : `Motivo: ${v.nota ?? "-"}`,
          boton: ok ? "Ver mi perfil" : "Volver a enviar",
          enlace: `${sitio}/perfil#verificacion`,
          pie: "Recibís este mail porque pediste verificar tu perfil en Manitos.",
        }),
      },
    ];
  }

  // elegido
  const { data: p } = await sb.from("pedidos").select("*").eq("id", id).maybeSingle();
  if (!p?.presupuesto_elegido_id) return nota(notas, "el pedido no tiene presupuesto elegido");
  const { data: pr } = await sb.from("presupuestos").select("*").eq("id", p.presupuesto_elegido_id).maybeSingle();
  if (!pr || !reciente(pr.respondido_en ?? pr.creado_en)) return nota(notas, "elección de hace más de 30 minutos");
  const pro = await perfilDe(sb, pr.profesional_id);
  if (!pro || pro.avisos_mail === false) return nota(notas, "el profesional tiene los avisos por mail apagados");
  const email = await emailDe(sb, pro.id, notas);
  if (!email) return [];
  const cliente = await perfilDe(sb, p.cliente_id);
  const { data: dir } = await sb.from("pedido_direcciones").select("*").eq("pedido_id", p.id).maybeSingle();
  const ubic = dir?.direccion ? { texto: dir.direccion, lat: dir.lat ?? null, lng: dir.lng ?? null } : null;
  const extraDir = [describirVivienda(dir), dir?.referencias].filter(Boolean).join("\n");
  return [
    {
      para: email,
      nombre: pro.nombre,
      asunto: `¡Te eligieron! ${recortar(p.titulo, 60)}`,
      html: plantillaMail({
        titulo: "¡El cliente eligió tu presupuesto!",
        texto: `${saludo(pro.nombre)}, ${cliente?.nombre ?? "el cliente"} aceptó tu presupuesto de ${pesos(Number(pr.monto))}. Ya podés ver la dirección y coordinar por chat o WhatsApp.`,
        detalle: `${p.titulo}\n${ubic ? `${ubic.texto}, ${p.zona}${extraDir ? `\n${extraDir}` : ""}\nCómo llegar: ${linkComoLlegar(ubic, p.zona)}` : p.zona}`,
        boton: "Coordinar el trabajo",
        enlace: `${sitio}/pedidos/${p.id}`,
        pie: PIE_AVISOS,
      }),
    },
  ];
}

function nota(notas: string[], texto: string): Mail[] {
  notas.push(texto);
  return [];
}

/**
 * Chequeo de los avisos (lo usa el panel de administrador).
 * Muestra cómo están cargadas las variables (sin revelar claves) y prueba el login en Brevo.
 * Sólo responde a administradores logueados.
 */
export async function GET(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const service = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!token) return NextResponse.json({ error: "Abrí el chequeo desde el panel de administrador." }, { status: 401 });
  if (!service) return NextResponse.json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY en Vercel." }, { status: 500 });
  const sb = createClient(urlSupabase(), service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: u } = await sb.auth.getUser(token);
  const { data: yo } = u?.user ? await sb.from("perfiles").select("es_admin").eq("id", u.user.id).maybeSingle() : { data: null };
  if (!yo?.es_admin) return NextResponse.json({ error: "Sólo administradores." }, { status: 403 });

  const clave = env("BREVO_SMTP_CLAVE");
  const variables = {
    BREVO_SMTP_USUARIO: env("BREVO_SMTP_USUARIO") || "(vacío)",
    BREVO_SMTP_CLAVE: clave
      ? `${clave.slice(0, 9)}… (${clave.length} caracteres)${clave.startsWith("xsmtpsib-") ? "" : " ⚠️ debería empezar con xsmtpsib-"}`
      : "(vacío)",
    MAIL_REMITENTE: env("MAIL_REMITENTE")
      ? env("MAIL_REMITENTE") + (pareceMail(env("MAIL_REMITENTE")) ? "" : " ⚠️ no es un email: poné el remitente verificado en Brevo")
      : "(vacío)",
    SUPABASE_SERVICE_ROLE_KEY: `${service.slice(0, 10)}… (${service.length} caracteres)`,
  };
  let brevoOk = false;
  let brevo = "";
  try {
    const t = nodemailer.createTransport({
      host: process.env.BREVO_SMTP_HOST || "smtp-relay.brevo.com",
      port: Number(process.env.BREVO_SMTP_PUERTO || 587),
      secure: false,
      auth: { user: env("BREVO_SMTP_USUARIO"), pass: clave },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
    await t.verify();
    brevoOk = true;
    brevo = "Brevo aceptó el usuario y la clave";
  } catch (e) {
    brevo = explicar(e instanceof Error ? e.message : String(e));
  }
  const { data: ultimos } = await sb
    .from("avisos_enviados")
    .select("*")
    .order("enviado_en", { ascending: false })
    .limit(5);
  return NextResponse.json({ brevoOk, brevo, variables, ultimos: ultimos ?? [] });
}
