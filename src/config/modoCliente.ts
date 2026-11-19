// Vista cliente: el link que se le da al cliente (COTIZADOR_CLIENTE=1 en el servidor de Vite, o ?vista=cliente para
// verla desde la vista admin). Oculta tasas, rangos de clase, intermediario, quién elabora, Parámetros, Pastora y la
// emisión; al llegar al final envía la cotización al correo del tomador automáticamente.
import { hayTokenSso } from '../sso/token';

const porUrl = (() => {
  try {
    return new URLSearchParams(window.location.search).get('vista') === 'cliente';
  } catch {
    return false;
  }
})();

/** Entrando por el túnel (link que se le da al cliente) siempre es vista cliente, aunque quiten ?vista=cliente. */
const porHost = (() => {
  try {
    return /\.trycloudflare\.com$/i.test(window.location.hostname);
  } catch {
    return false;
  }
})();

/**
 * Build cliente (producción): la landing pública es vista cliente, pero quien entra desde Sys2000 con su nexus_token
 * trabaja con la vista técnica. El servidor valida el token y solo abre las rutas técnicas si es válido.
 */
export const MODO_CLIENTE = porUrl || porHost || (import.meta.env.VITE_MODO_CLIENTE === '1' && !hayTokenSso());

/** Sucursal y responsable que imprime el PDF cuando la cotización la hace el propio cliente. */
export { EMISOR_CLIENTE } from '../cotizaciones/solicitud';
