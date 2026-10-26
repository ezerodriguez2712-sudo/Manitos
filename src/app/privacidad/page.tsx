import type { Metadata } from "next";
import { PaginaLegal } from "@/components/Legal";
import { CONFIG } from "@/lib/config";

export const metadata: Metadata = { title: "Privacidad · Manitos" };

export default function Privacidad() {
  return (
    <PaginaLegal titulo="Política de privacidad">
      <p>
        En Manitos usamos tus datos sólo para que la plataforma funcione. Esta política explica qué guardamos,
        quién lo ve y cómo podés pedir que lo cambiemos o lo borremos, de acuerdo con la Ley 25.326 de
        Protección de Datos Personales.
      </p>

      <h2>Qué datos guardamos</h2>
      <ul>
        <li>Cuenta: nombre, email, contraseña (cifrada) y celular.</li>
        <li>Perfil: barrio o zonas de trabajo, rubros, descripción y foto, si la cargás.</li>
        <li>Pedidos: descripción, fotos, barrio y dirección del trabajo.</li>
        <li>Actividad: presupuestos, mensajes del chat y calificaciones.</li>
      </ul>

      <h2>Quién ve cada cosa</h2>
      <ul>
        <li>Tu pedido (sin la dirección exacta) lo ven los profesionales del rubro.</li>
        <li>
          Tu <b>dirección y tu celular</b> sólo los ve la persona con la que confirmás un trabajo, y recién
          después de confirmarlo.
        </li>
        <li>Los presupuestos los ven sólo el profesional que los mandó y el cliente del pedido.</li>
        <li>El chat lo ven sólo el cliente y el profesional elegido.</li>
        <li>El perfil del profesional, sus calificaciones y reseñas los ven los usuarios de Manitos.</li>
      </ul>

      <h2>Qué no hacemos</h2>
      <ul>
        <li>No vendemos ni alquilamos tus datos.</li>
        <li>No te mandamos publicidad de terceros.</li>
      </ul>

      <h2>Dónde se guardan</h2>
      <p>
        Los datos se guardan en servicios de infraestructura en la nube (base de datos y hosting) que usamos
        para operar la app, con acceso restringido y reglas de seguridad que limitan qué puede ver cada usuario.
      </p>

      <h2>Tus derechos</h2>
      <p>
        Podés ver y corregir tus datos desde tu perfil, y pedir el acceso, la corrección o la eliminación de
        tu cuenta y tus datos en cualquier momento.
        {CONFIG.emailContacto && <> Escribinos a {CONFIG.emailContacto}.</>} La Agencia de Acceso a la
        Información Pública es el órgano de control de la Ley 25.326.
      </p>
    </PaginaLegal>
  );
}
