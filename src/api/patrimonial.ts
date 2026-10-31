// Partner patrimonial de nest-api (paquete @quand-mind/api_planes_v2), el mismo que usa Emisión, el catálogo
// de planes de riesgos generales (valrep) y las rutas propias del cotizador por coberturas (riesgos-generales).
// Va por el proxy /nest de vite.config.ts, que agrega la key: nunca llega al navegador.
import { errorDeRespuesta, parsearCatalogo, parsearEmision, type RamoCatalogo, type ResultadoEmision } from '../tarifas/planes-rcg';
import { parsearTarifa, type PlanTarifa } from '../tarifas/coberturas';
import { parsearCoberturasRamo, type CoberturaRamo } from '../tarifas/combo';

const BASE = '/nest/api/v1/partner/starter/patrimonial';

async function pedir(url: string, init: RequestInit, ruta: 'quote' | 'emit' | 'catalogo' | 'tarificador' | 'coberturas'): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, init);
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
  if (res.status === 404 && ruta === 'catalogo') throw new Error('nest-api sin la ruta valrep/planes/riesgos-generales: falta desplegar la versión nueva.');
  if (res.status === 404 && ruta === 'tarificador' && !errorDeRespuesta({ status: false, ...(data as object) })?.includes('plan')) {
    throw new Error('nest-api sin la ruta riesgos-generales/tarifa: falta desplegar la versión nueva.');
  }
  if (res.status === 404 && ruta === 'coberturas') {
    // Sin mensaje propio o con el "Cannot GET" de Nest: ese nest-api todavía no tiene la ruta.
    const m = (data as { message?: unknown }).message;
    throw new Error(typeof m === 'string' && m && !/^Cannot GET/i.test(m) ? m : 'La ruta de coberturas por ramo aún no está desplegada en este ambiente.');
  }
  if (res.status === 403 && url.includes('riesgos-generales/emision')) {
    throw new Error('La key del cotizador no tiene el permiso emissions:riesgos-generales: hay que agregárselo en nest-api.');
  }
  if (res.status === 401 || res.status === 403) throw new Error('nest-api rechazó la key (NEST_API_KEY en .env.local o scope del partner patrimonial).');
  throw new Error(errorDeRespuesta({ status: false, ...(data as object) }) ?? `HTTP ${res.status}`);
}

const post = (ruta: 'quote' | 'emit', body: unknown) =>
  pedir(`${BASE}/${ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, ruta);

/** Planes vigentes de riesgos generales en Sis2000, agrupados por ramo. */
export const listarPlanes = async (): Promise<RamoCatalogo[]> =>
  parsearCatalogo(await pedir('/nest/api/v1/valrep/planes/riesgos-generales', { method: 'GET' }, 'catalogo'));

/** spCalculoRiesgoGeneral: solo ramo, plan y frecuencia; suma y prima salen de maplantar. */
export const cotizarPlan = (cramo: number, cplan: string) =>
  post('quote', { cramo, cplan, cuotas: 1, ifrecuencia: 'A', pdescuento: 0, precargo: 0 });

export const emitirPlan = async (payload: unknown): Promise<ResultadoEmision> => parsearEmision(await post('emit', payload));

/** Tarifa por cobertura del plan (ramos 16 y 38), ruta propia del cotizador en nest-api. */
export async function tarificarRamo(cramo: number, cplan: string): Promise<PlanTarifa | null> {
  return parsearTarifa(await pedir(`/nest/api/v1/riesgos-generales/tarifa?cramo=${cramo}&cplan=${encodeURIComponent(cplan)}`, { method: 'GET' }, 'tarificador'));
}

/** Combo de coberturas: todas las coberturas con tarifa vigente del ramo, sin plan (ruta propia del cotizador). */
export async function coberturasDeRamo(cramo: number): Promise<CoberturaRamo[]> {
  return parsearCoberturasRamo(await pedir(`/nest/api/v1/riesgos-generales/coberturas?cramo=${cramo}`, { method: 'GET' }, 'coberturas'));
}

/** Emisión con las coberturas y sumas elegidas; nest-api recalcula la prima antes de emitir. */
export const emitirCoberturas = async (payload: unknown): Promise<ResultadoEmision> =>
  parsearEmision(await pedir('/nest/api/v1/riesgos-generales/emision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }, 'emit'));
