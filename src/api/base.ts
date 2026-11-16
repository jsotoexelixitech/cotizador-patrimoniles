/**
 * Prefijo de las llamadas al proxy (/nest, /nexus). En local la app vive en la raíz; en el servidor vive bajo
 * VITE_APP_BASE (p. ej. /cotizador-rc/), y las llamadas deben ir a /cotizador-rc/nest/… para llegar a su propio proxy.
 */
const PREFIJO = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');

export const rutaApi = (ruta: string): string => `${PREFIJO}${ruta}`;
