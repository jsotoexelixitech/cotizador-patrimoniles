// Vista cliente: el link que se le da al cliente (COTIZADOR_CLIENTE=1 en el servidor de Vite, o ?vista=cliente para
// verla desde la vista admin). Oculta tasas, rangos de clase, intermediario, quién elabora, Parámetros, Pastora y la
// emisión; al llegar al final envía la cotización al correo del tomador automáticamente.
const porUrl = (() => {
  try {
    return new URLSearchParams(window.location.search).get('vista') === 'cliente';
  } catch {
    return false;
  }
})();

export const MODO_CLIENTE = import.meta.env.VITE_MODO_CLIENTE === '1' || porUrl;

/** Sucursal y responsable que imprime el PDF cuando la cotización la hace el propio cliente. */
export const EMISOR_CLIENTE = { sucursal: 'Caracas', emisor: 'Cotización en línea' } as const;
