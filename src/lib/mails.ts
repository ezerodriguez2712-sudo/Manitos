/** Plantilla HTML de los avisos por mail (mismo diseño que los mails de cuenta). */
export function plantillaMail({
  titulo,
  texto,
  detalle,
  boton,
  enlace,
  pie,
}: {
  titulo: string;
  texto: string;
  detalle?: string;
  boton: string;
  enlace: string;
  pie: string;
}) {
  const e = escapar;
  return `<!doctype html>
<html lang="es">
<body style="margin:0;padding:0;background:#edf1f7;font-family:Arial,Helvetica,sans-serif;color:#13213f;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#edf1f7;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #d6deeb;">
        <tr><td style="background:#1e3a6b;padding:18px 24px;">
          <span style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Manitos</span>
        </td></tr>
        <tr><td style="height:8px;background:#ffc21a;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:28px 24px 28px;">
          <h1 style="margin:0 0 12px;font-size:24px;line-height:1.2;color:#13213f;">${e(titulo)}</h1>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#5b6782;">${e(texto)}</p>
          ${
            detalle
              ? `<div style="margin:0 0 24px;padding:14px 16px;background:#edf1f7;border-radius:12px;font-size:15px;line-height:1.5;color:#13213f;">${e(detalle).replace(/\n/g, "<br>")}</div>`
              : ""
          }
          <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#ffc21a;border-radius:12px;">
            <a href="${e(enlace)}" style="display:inline-block;padding:14px 26px;font-size:16px;font-weight:700;color:#13213f;text-decoration:none;">${e(boton)}</a>
          </td></tr></table>
        </td></tr>
        <tr><td style="padding:20px 24px 24px;font-size:12px;line-height:1.5;color:#5b6782;border-top:1px solid #edf1f7;">
          ${e(pie)}<br>Manitos · Profesionales para tu casa en Córdoba
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function escapar(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export const PIE_AVISOS = "Si no querés recibir estos avisos, desactivalos en tu perfil de Manitos.";
