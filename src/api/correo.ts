// Correo de la cotización y de la póliza por POST /api/v1/mail/send de nest-api (scope emissions:auto), vía el proxy /nest
// de vite.config.ts: la key la agrega el proxy y nunca llega al navegador.
import {
  armarPayloadCorreo, armarPayloadPoliza, mensajeErrorCorreo, type DatosCorreoCotizacion, type DatosCorreoPoliza, type PayloadCorreo,
} from '../correo/correoCotizacion';
import { rutaApi } from './base';

const URL_MAIL = rutaApi('/nest/api/v1/mail/send');
/** Con adjuntos de varios MB nest-api tarda; pasado este tiempo se cancela y se muestra el error (nunca queda colgado). */
const TIMEOUT_MS = 120_000;

async function enviar(payload: PayloadCorreo): Promise<void> {
  let res: Response;
  try {
    res = await fetch(URL_MAIL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const cancelado = e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError');
    throw new Error(mensajeErrorCorreo(cancelado ? 408 : 0, null) ?? 'Sin conexión con nest-api.');
  }
  const data: unknown = await res.json().catch(() => null);
  const error = mensajeErrorCorreo(res.status, data);
  if (error) throw new Error(error);
}

export const enviarCotizacionPorCorreo = (d: DatosCorreoCotizacion) => enviar(armarPayloadCorreo(d));

export const enviarPolizaPorCorreo = (d: DatosCorreoPoliza) => enviar(armarPayloadPoliza(d));
