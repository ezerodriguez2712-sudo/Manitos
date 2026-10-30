import type { Metadata } from "next";
import { PaginaLegal } from "@/components/Legal";
import { CONFIG } from "@/lib/config";

export const metadata: Metadata = { title: "Términos y condiciones · Manitos" };

export default function Terminos() {
  return (
    <PaginaLegal titulo="Términos y condiciones">
      <p>
        Manitos es una plataforma que conecta a personas que necesitan un servicio para su casa
        (&ldquo;clientes&rdquo;) con profesionales independientes que lo ofrecen (&ldquo;profesionales&rdquo;) en{" "}
        {CONFIG.ciudad}. Al crear una cuenta aceptás estos términos.
      </p>

      <h2>Qué hace Manitos</h2>
      <ul>
        <li>Permite publicar pedidos de trabajo, recibir presupuestos y elegir uno.</li>
        <li>Facilita el contacto entre cliente y profesional una vez elegido el presupuesto.</li>
        <li>Muestra calificaciones y reseñas que dejan los propios usuarios.</li>
      </ul>

      <h2>Qué no hace Manitos</h2>
      <ul>
        <li>No presta los servicios ni emplea a los profesionales: cada profesional trabaja por su cuenta.</li>
        <li>No fija precios: cada profesional decide su presupuesto y cada cliente decide si lo acepta.</li>
        <li>
          No garantiza la calidad, el resultado ni los plazos de los trabajos. El acuerdo es entre cliente y
          profesional.
        </li>
        <li>Por ahora no cobra ni procesa pagos: el pago se acuerda directamente entre las partes.</li>
      </ul>

      <h2>Tu cuenta</h2>
      <ul>
        <li>Tenés que ser mayor de 18 años y dar datos reales.</li>
        <li>Sos responsable de lo que publicás y de cuidar tu contraseña.</li>
        <li>
          Los profesionales declaran tener la capacitación y, cuando corresponda, la matrícula necesaria para
          los trabajos que ofrecen (por ejemplo, gas o electricidad).
        </li>
      </ul>

      <h2>Uso correcto</h2>
      <ul>
        <li>No publiques contenido falso, ofensivo o que no tenga que ver con un trabajo.</li>
        <li>No uses los datos de contacto de otros usuarios para fines distintos al trabajo acordado.</li>
        <li>Las reseñas tienen que reflejar una experiencia real.</li>
      </ul>
      <p>Podemos suspender cuentas que no cumplan estas reglas.</p>

      <h2>Responsabilidad</h2>
      <p>
        Manitos ofrece la plataforma tal como está. En la medida en que la ley lo permita, no es responsable
        por daños que surjan de los trabajos acordados entre usuarios. Te recomendamos pedir presupuestos
        detallados, verificar matrículas cuando corresponda y dejar todo acordado por escrito en el chat.
      </p>

      <h2>Cambios</h2>
      <p>
        Podemos actualizar estos términos. Si el cambio es importante, te lo vamos a avisar dentro de la app.
        {CONFIG.emailContacto && <> Para consultas escribinos a <a href={`mailto:${CONFIG.emailContacto}`} className="underline">{CONFIG.emailContacto}</a>.</>}
      </p>
    </PaginaLegal>
  );
}
