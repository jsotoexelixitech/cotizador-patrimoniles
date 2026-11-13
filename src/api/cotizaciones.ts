// Cotizaciones guardadas en Exélixi Nexus (módulo cotizaciones-rc), por el proxy /nexus de vite.config.ts: la key de
// Nexus la agrega el proxy y nunca llega al navegador. Por el link del cliente el proxy solo deja guardar, traer por
// código y mandar a pagar.
import type { DatosCotizacion, Opcion, ProductoGuardado } from '../cotizaciones/snapshot';

const BASE = '/nexus/api/cotizaciones-rc';

export type EstadoCotizacion = 'cotizada' | 'pendiente_pago' | 'pagada' | 'emitida';

export interface PolizaGuardada {
  cnpoliza: string; cnrecibo: string; urlpoliza: string;
  cobro?: { ok: boolean; pendiente?: boolean; ingresoCaja?: string | null; error?: string };
}

export interface CotizacionGuardada {
  codigo: string;
  producto: ProductoGuardado;
  estado: EstadoCotizacion;
  /** Sin pagar y con los 15 días cumplidos. */
  vencida: boolean;
  origen: 'admin' | 'cliente';
  tomador: { nombre: string; documento: string | null; correo: string | null };
  moneda: string | null;
  opcion: Opcion | null;
  creadaEn: string;
  expiraEn: string;
  /** La lista no trae el JSON completo. */
  datos?: DatosCotizacion;
  pago: { opcion?: Opcion; totalVes?: number; tasa?: number; checkoutUrl?: string; referencia?: string; monto?: number; fecha?: string } | null;
  poliza: PolizaGuardada | null;
  error: string | null;
}

export interface Checkout { codigo: string; opcion: Opcion; prima: number; moneda: string; tasa: number; totalVes: number; checkoutUrl: string }

/** Error de la API con su código HTTP (404 no existe, 410 vencida). */
export class ErrorCotizacion extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

async function pedir<T>(ruta: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${ruta}`, { ...init, headers: { 'Content-Type': 'application/json' } });
  } catch {
    throw new ErrorCotizacion('Sin conexión con Exélixi Nexus.', 0);
  }
  const body = await res.json().catch(() => null) as { success?: boolean; data?: T; message?: string } | null;
  if (res.ok && body?.success && body.data !== undefined) return body.data;
  // Sin JSON (404 del proxy, o la página del cotizador si /nexus no existe): el proxy no está configurado o bloqueó la ruta.
  if (body === null) throw new ErrorCotizacion('Guardado de cotizaciones sin configurar: define NEXUS_API_URL y NEXUS_API_KEY en .env.local y reinicia npm run dev.', 404);
  if (res.status === 403) throw new ErrorCotizacion('Nexus rechazó la key del cotizador (NEXUS_API_KEY en .env.local).', 403);
  throw new ErrorCotizacion(body?.message || `Exélixi Nexus respondió HTTP ${res.status}.`, res.status);
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const guardarCotizacion = (producto: ProductoGuardado, datos: DatosCotizacion) =>
  pedir<CotizacionGuardada>('', json('POST', { producto, datos }));

/** `admin`: también trae las vencidas (historial). Por el link del cliente el proxy no deja pasar ese parámetro. */
export const traerCotizacion = (codigo: string, admin = false) =>
  pedir<CotizacionGuardada>(`/${encodeURIComponent(codigo.trim().toUpperCase())}${admin ? '?admin=1' : ''}`);

export interface FiltroCotizaciones { codigo?: string; q?: string; estado?: string; vigencia?: 'vigentes' | 'vencidas' | 'todas'; desde?: string; hasta?: string }

export function buscarCotizaciones(f: FiltroCotizaciones) {
  const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v && String(v).trim()) as [string, string][]);
  return pedir<CotizacionGuardada[]>(`?${q.toString()}`);
}

/** Manda a pagar la opción elegida: devuelve la URL del módulo de Pagos. Al confirmarse el pago, Nexus emite. */
export const crearCheckout = (codigo: string, opcion: Opcion, returnUrl: string) =>
  pedir<Checkout>(`/${encodeURIComponent(codigo)}/checkout`, json('POST', { opcion, returnUrl }));

/** Emisión hecha por el canal con recibo pendiente de cobro. */
export const registrarEmisionPendiente = (codigo: string, opcion: Opcion | null, poliza: { cnpoliza: string; cnrecibo: string; urlpoliza: string }) =>
  pedir<CotizacionGuardada>(`/${encodeURIComponent(codigo)}/estado`, json('PATCH', { estado: 'emitida', opcion, poliza }));

/** Admin: reintenta la emisión de una pagada sin póliza o el cobro de una emitida con el recibo pendiente. */
export const reintentarCotizacion = (codigo: string) => pedir<CotizacionGuardada>(`/${encodeURIComponent(codigo)}/reintentar`, json('POST', {}));

/** Código con el formato oficial (RCG-2026-000123-7KQ4); el provisional del cotizador no lo cumple. */
export const esCodigoOficial = (v: string) => /^(RCG|RCP|RCE|RC)-\d{4}-\d{6}-[2-9A-HJ-NP-Z]{4}$/.test(v.trim().toUpperCase());
