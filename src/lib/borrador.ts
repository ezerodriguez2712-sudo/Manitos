"use client";
/**
 * Borradores de formularios en el navegador (sessionStorage): si el usuario sale a leer
 * algo, abre la cámara o el celular recarga la página, no pierde lo que escribió.
 * Nunca se guardan contraseñas.
 */
export function leerBorrador<T>(clave: string): Partial<T> | null {
  try {
    const v = sessionStorage.getItem("borrador-" + clave);
    return v ? (JSON.parse(v) as Partial<T>) : null;
  } catch {
    return null;
  }
}

export function guardarBorrador<T>(clave: string, datos: T) {
  try {
    sessionStorage.setItem("borrador-" + clave, JSON.stringify(datos));
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}

export function borrarBorrador(clave: string) {
  try {
    sessionStorage.removeItem("borrador-" + clave);
  } catch {
    /* nada */
  }
}
