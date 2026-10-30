import { NextResponse } from "next/server";
import { clienteServicio, env, urlSitio } from "@/lib/correo";
import { mp, mpDisponible, sincronizar, type Preapproval } from "@/lib/mercadopago";

/**
 * Suscripción Pro del profesional logueado.
 *  POST   { email }  → crea la suscripción en MercadoPago y devuelve el link para pagar
 *  PUT               → vuelve a consultar el estado en MercadoPago (al volver del pago)
 *  DELETE            → cancela la suscripción
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function usuario(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token || !env("SUPABASE_SERVICE_ROLE_KEY")) return null;
  const sb = clienteServicio();
  const { data } = await sb.auth.getUser(token);
  if (!data?.user) return null;
  const { data: perfil } = await sb.from("perfiles").select("id, rol, suspendido").eq("id", data.user.id).maybeSingle();
  if (!perfil) return null;
  return { sb, user: data.user, perfil };
}

const error = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });

export async function POST(req: Request) {
  const u = await usuario(req);
  if (!u) return error("Iniciá sesión de nuevo.", 401);
  if (u.perfil.rol !== "profesional") return error("El plan Pro es para profesionales.");
  if (u.perfil.suspendido) return error("Tu cuenta está suspendida.");
  if (!mpDisponible()) return error("Los pagos todavía no están habilitados.");

  const { data: a } = await u.sb.from("ajustes").select("*").eq("id", 1).maybeSingle();
  if (!a?.cobro_activo || !a.precio_pro) return error("Durante el lanzamiento Manitos es gratis y sin límites.");

  let email = "";
  try {
    email = String((await req.json())?.email ?? "").trim().toLowerCase();
  } catch {
    /* sin cuerpo */
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) email = (u.user.email ?? "").toLowerCase();

  // Si está en la prueba gratis, el primer cobro es cuando termina
  const { data: s } = await u.sb.from("suscripciones").select("*").eq("perfil_id", u.perfil.id).maybeSingle();
  if (s?.estado === "activa") return error("Ya tenés Pro activo.");
  const inicio = s?.prueba_hasta && new Date(s.prueba_hasta) > new Date(Date.now() + 5 * 60_000) ? s.prueba_hasta : undefined;

  try {
    const p = await mp<Preapproval>("/preapproval", "POST", {
      reason: "Manitos Pro · presupuestos ilimitados",
      external_reference: u.perfil.id,
      payer_email: email,
      back_url: `${urlSitio()}/pro?volver=1`,
      status: "pending",
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: Number(a.precio_pro),
        currency_id: "ARS",
        ...(inicio ? { start_date: new Date(inicio).toISOString() } : {}),
      },
    });
    await u.sb
      .from("suscripciones")
      .upsert({ perfil_id: u.perfil.id, mp_preapproval_id: p.id, estado: s?.estado === "prueba" ? "prueba" : "pendiente", monto: a.precio_pro, actualizado_en: new Date().toISOString(), prueba_hasta: s?.prueba_hasta ?? null });
    if (!p.init_point) return error("MercadoPago no devolvió el link de pago.");
    return NextResponse.json({ link: p.init_point });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    return error(/payer|email/i.test(m) ? "Revisá el email: tiene que ser el de tu cuenta de MercadoPago." : m, 502);
  }
}

export async function PUT(req: Request) {
  const u = await usuario(req);
  if (!u) return error("Iniciá sesión de nuevo.", 401);
  const { data: s } = await u.sb.from("suscripciones").select("mp_preapproval_id").eq("perfil_id", u.perfil.id).maybeSingle();
  if (!s?.mp_preapproval_id || !mpDisponible()) return NextResponse.json({ estado: null });
  try {
    return NextResponse.json({ estado: await sincronizar(u.sb, s.mp_preapproval_id) });
  } catch (e) {
    return error(e instanceof Error ? e.message : String(e), 502);
  }
}

export async function DELETE(req: Request) {
  const u = await usuario(req);
  if (!u) return error("Iniciá sesión de nuevo.", 401);
  const { data: s } = await u.sb.from("suscripciones").select("*").eq("perfil_id", u.perfil.id).maybeSingle();
  if (!s?.mp_preapproval_id) return error("No tenés una suscripción para cancelar.");
  try {
    await mp(`/preapproval/${encodeURIComponent(s.mp_preapproval_id)}`, "PUT", { status: "cancelled" });
    const estado = await sincronizar(u.sb, s.mp_preapproval_id);
    return NextResponse.json({ estado });
  } catch (e) {
    return error(e instanceof Error ? e.message : String(e), 502);
  }
}
