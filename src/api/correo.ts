// Correo de la cotización por POST /api/v1/mail/send de nest-api (scope emissions:auto), vía el proxy /nest de
// vite.config.ts: la key la agrega el proxy y nunca llega al navegador.
import { armarPayloadCorreo, mensajeErrorCorreo, type DatosCorreoCotizacion } from '../correo/correoCotizacion';

const URL_MAIL = '/nest/api/v1/mail/send';

export async function enviarCotizacionPorCorreo(d: DatosCorreoCotizacion): Promise<void> {
  const payload = armarPayloadCorreo(d);
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
