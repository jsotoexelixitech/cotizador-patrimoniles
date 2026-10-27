// Partner patrimonial de nest-api (paquete @quand-mind/api_planes_v2), el mismo que usa Emisión.
// Va por el proxy /nest de vite.config.ts, que agrega la key: nunca llega al navegador.
import { RAMO_RCG, errorDeRespuesta, parsearEmision, type ResultadoEmision } from '../tarifas/planes-rcg';

const BASE = '/nest/api/v1/partner/starter/patrimonial';

async function post(ruta: 'quote' | 'emit', body: unknown): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/${ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new Error('Sin conexión con nest-api.');
  }
  const data: unknown = await res.json().catch(() => null);
  if (res.ok) return data;
  if (res.status === 404 && data === null) {
    throw new Error(ruta === 'emit'
      ? 'Emisión bloqueada: NEST_API_URL no apunta a QA.'
      : 'Proxy sin configurar: define NEST_API_URL en .env.local y reinicia npm run dev.');
  }
  if (res.status === 401 || res.status === 403) throw new Error('nest-api rechazó la key (NEST_API_KEY en .env.local o scope del partner patrimonial).');
  throw new Error(errorDeRespuesta({ status: false, ...(data as object) }) ?? `HTTP ${res.status}`);
}

/** spCalculoRiesgoGeneral: solo plan y frecuencia; suma y prima salen de maplantar. */
export const cotizarPlan = (cplan: string) =>
  post('quote', { cramo: RAMO_RCG, cplan, cuotas: 1, ifrecuencia: 'A', pdescuento: 0, precargo: 0 });

export const emitirPlan = async (payload: unknown): Promise<ResultadoEmision> => parsearEmision(await post('emit', payload));
