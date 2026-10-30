export type Rol = "cliente" | "profesional";

export interface Perfil {
  id: string;
  nombre: string;
  rol: Rol;
  zona: string | null;
  descripcion: string | null;
  zonas?: string[];
  foto?: string | null;
  avisos_mail?: boolean;
  es_admin?: boolean;
  suspendido?: boolean;
  verificado?: boolean;
  matriculado?: boolean;
}

export interface Rubro {
  id: number;
  nombre: string;
  icono: string;
}

export type EstadoPedido = "abierto" | "asignado" | "completado" | "cancelado" | "vencido";

export interface Pedido {
  id: number;
  cliente_id: string;
  rubro_id: number;
  titulo: string;
  descripcion: string;
  zona: string;
  urgencia: "normal" | "urgente";
  fotos: string[];
  estado: EstadoPedido;
  presupuesto_elegido_id: number | null;
  creado_en: string;
  editado_en?: string | null;
  terminado_pro_en?: string | null;
  vence_en?: string | null;
  rubros?: Rubro;
}

export interface Presupuesto {
  id: number;
  pedido_id: number;
  profesional_id: string;
  monto: number;
  fecha_disponible: string | null;
  mensaje: string | null;
  estado: "enviado" | "aceptado" | "rechazado";
  creado_en: string;
  respondido_en?: string | null;
  perfiles?: Perfil;
  pedidos?: Pedido;
}

export interface Mensaje {
  id: number;
  pedido_id: number;
  autor_id: string;
  texto: string;
  creado_en: string;
}

export interface Reputacion {
  perfil_id: string;
  promedio: number;
  cantidad: number;
}

export const ESTADO_LABEL: Record<EstadoPedido, string> = {
  abierto: "Recibiendo presupuestos",
  asignado: "En curso",
  completado: "Terminado",
  cancelado: "Cancelado",
  vencido: "Vencido",
};

export const pesos = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);

export const fecha = (s: string) =>
  new Date(s.length === 10 ? s + "T12:00:00" : s).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
  });

export const hace = (s: string) => {
  const min = Math.round((Date.now() - new Date(s).getTime()) / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
};

export interface Aviso {
  pedido_id: number;
  novedades: number;
  mensajes: number;
}

export interface Pregunta {
  id: number;
  pedido_id: number;
  profesional_id: string;
  texto: string;
  respuesta: string | null;
  creado_en: string;
  respondido_en: string | null;
  perfiles?: Pick<Perfil, "nombre" | "foto" | "verificado"> | null;
}

export type EstadoVerificacion = "pendiente" | "aprobada" | "rechazada";

export interface Verificacion {
  perfil_id: string;
  estado: EstadoVerificacion;
  dni_frente: string;
  dni_dorso: string;
  matricula_foto: string | null;
  matricula: string | null;
  nota: string | null;
  enviado_en: string;
  revisado_en: string | null;
}

/** Teléfonos o mails dentro de un texto (no se permiten antes de elegir presupuesto). */
export const tieneContacto = (t: string) =>
  /[0-9][0-9 .()-]{6,}[0-9]/.test(t) || /[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(t);

/** Muestra los mensajes propios de la base (límites, reglas); si no, el texto genérico. */
export const mensajeError = (e: { message?: string } | null | undefined, generico: string) =>
  e?.message && /^(Llegaste|Tenés|Estás|Sólo se puede|Tu cuenta|Usaste)/.test(e.message) ? e.message : generico;

export interface Respuesta {
  perfil_id: string;
  horas: number;
  cantidad: number;
}

/** "Responde en menos de 1 hora" / "en unas 5 horas" / "en 2 días". */
export const textoRespuesta = (h?: number | null) =>
  h == null ? "" : h < 1 ? "menos de 1 hora" : h < 24 ? `unas ${Math.round(h)} hora${Math.round(h) === 1 ? "" : "s"}` : `${Math.round(h / 24)} día${Math.round(h / 24) === 1 ? "" : "s"}`;
