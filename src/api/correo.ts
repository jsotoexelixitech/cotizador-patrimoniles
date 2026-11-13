// Correo de la cotización y de la póliza por POST /api/v1/mail/send de nest-api (scope emissions:auto), vía el proxy /nest
// de vite.config.ts: la key la agrega el proxy y nunca llega al navegador.
import {
  armarPayloadCorreo, armarPayloadPoliza, mensajeErrorCorreo, type DatosCorreoCotizacion, type DatosCorreoPoliza, type PayloadCorreo,
} from '../correo/correoCotizacion';

const URL_MAIL = '/nest/api/v1/mail/send';

async function enviar(payload: PayloadCorreo): Promise<void> {
  let res: Response;
  try {
    res = await fetch(URL_MAIL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  } catch {
    throw new Error(mensajeErrorCorreo(0, null) ?? 'Sin conexión con nest-api.');
  }
  const data: unknown = await res.json().catch(() => null);
  const error = mensajeErrorCorreo(res.status, data);
  if (error) throw new Error(error);
}

export const enviarCotizacionPorCorreo = (d: DatosCorreoCotizacion) => enviar(armarPayloadCorreo(d));

export const enviarPolizaPorCorreo = (d: DatosCorreoPoliza) => enviar(armarPayloadPoliza(d));
