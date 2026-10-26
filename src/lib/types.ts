export type Rol = "cliente" | "profesional";

export interface Perfil {
  id: string;
  nombre: string;
  rol: Rol;
  zona: string | null;
  descripcion: string | null;
}

export interface Rubro {
  id: number;
  nombre: string;
  icono: string;
}

export type EstadoPedido = "abierto" | "asignado" | "completado" | "cancelado";

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
