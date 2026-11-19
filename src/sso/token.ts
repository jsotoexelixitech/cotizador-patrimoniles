// nexus_token del SSO en el navegador. Llega una vez en la URL (`?nexus_token=`, como en OCR y Emisión), se guarda en
// sessionStorage de la pestaña (el iframe de Sys2000 puede recargar) y se quita de la barra de direcciones para que
// no quede en un enlace copiado. Solo se reenvía al servidor del cotizador (cabecera x-nexus-token), que es quien lo
// valida y decide el productor: aquí no se lee nada de él.
const CLAVE = 'cotizador-rc:nexus_token';

function capturar(): string | null {
  try {
    const url = new URL(window.location.href);
    const enUrl = url.searchParams.get('nexus_token')?.trim();
    if (!enUrl) return window.sessionStorage.getItem(CLAVE);
    try {
      window.sessionStorage.setItem(CLAVE, enUrl);
      url.searchParams.delete('nexus_token');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {
      // Sin sessionStorage (iframe con almacenamiento bloqueado) el token se queda en la URL para sobrevivir a recargas.
    }
    return enUrl;
  } catch {
    return null;
  }
}

const TOKEN = capturar();

/** Hay token de Sys2000 (el servidor dirá si es válido). */
export const hayTokenSso = (): boolean => !!TOKEN;

/** Cabecera para las llamadas al servidor del cotizador (/sso, /nexus, /nest). */
export const cabecerasSso = (): Record<string, string> => (TOKEN ? { 'x-nexus-token': TOKEN } : {});
