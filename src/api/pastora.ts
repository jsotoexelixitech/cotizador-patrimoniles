// Pastora (ramo 25): cotizar y emitir por v1/riesgos-generales de nest-api, vía el proxy /nest de vite.config.ts
// (la key la agrega el proxy; nunca llega al navegador). La emisión solo pasa si NEST_API_URL apunta a QA/dev.
import { mensajeErrorPastora, parsearResultadoPastora, type PayloadPastora, type ResultadoPastora } from '../tarifas/pastora';

const BASE = '/nest/api/v1/riesgos-generales';

/** Error con el status HTTP y el mensaje de nest-api para mostrarlo en pantalla. */
export class ErrorPastora extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function post(ruta: 'cotizacion' | 'emision', payload: unknown): Promise<ResultadoPastora> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/${ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  } catch {
    throw new ErrorPastora(0, 'Sin conexión con nest-api.');
  }
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new ErrorPastora(res.status, mensajeErrorPastora(res.status, data));
  if (data && typeof data === 'object' && (data as { status?: unknown }).status === false) {
    throw new ErrorPastora(res.status, mensajeErrorPastora(res.status, data));
  }
  return parsearResultadoPastora(data);
}

/** POST cotizacion: suma, prima (tasa provisional de nest-api) y aviso si el lote ya tiene póliza vigente. No emite. */
// El DTO de cotizar no tiene tomador ni riesgo: se mandan solo los campos que acepta.
export const cotizarPastora = ({ cramo, cplan, coberturas, calculo, biomasa }: PayloadPastora) =>
  post('cotizacion', { cramo, cplan, coberturas, calculo, biomasa });

/** POST emision: emite la póliza en Sis2000 con recibo pendiente de cobro. */
export const emitirPastora = (payload: PayloadPastora) => post('emision', payload);
