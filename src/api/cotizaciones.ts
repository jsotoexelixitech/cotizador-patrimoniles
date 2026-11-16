// Cotizaciones guardadas en Exélixi Nexus (módulo cotizaciones-rc), por el proxy /nexus de vite.config.ts: la key de
// Nexus la agrega el proxy y nunca llega al navegador. Por el link del cliente el proxy solo deja guardar, traer por
// código y mandar a pagar.
import type { DatosCotizacion, Opcion, ProductoGuardado } from '../cotizaciones/snapshot';
import { rutaApi } from './base';

const BASE = rutaApi('/nexus/api/cotizaciones-rc');

export type EstadoCotizacion = 'cotizada' | 'pendiente_pago' | 'pagada' | 'emitida';

export interface CobroPoliza { ok: boolean; pendiente?: boolean; ingresoCaja?: string | null; error?: string; mpago?: number }

/** Una póliza de la cotización. Con RCP + RCE son dos: `cramo` (27 / 37) y `prima` dicen cuál es cada una. */
export interface PolizaDeCotizacion {
  cnpoliza: string; cnrecibo: string; urlpoliza: string;
  cramo?: number; prima?: number;
  cobro?: CobroPoliza;
}

/**
 * Póliza(s) de la cotización: en la raíz, la primera (formato de siempre); en `polizas`, todas (usa polizasDe de
 * cotizaciones/polizas). `parcial`: pagada con alguna póliza aún sin emitir.
 */
export interface PolizaGuardada extends PolizaDeCotizacion {
  polizas?: PolizaDeCotizacion[];
  parcial?: boolean;
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
  /** Emisión sin pago hecha por el canal desde la cotización guardada (en curso, a medias o terminada): ya no se paga en línea. */
  canal?: { opcion: Opcion } | null;
  poliza: PolizaGuardada | null;
  /** Correo automático de la póliza (lo envía Nexus al quedar emitida la cotización pagada); null si aún no se intentó. */
  correoPoliza?: { enviadoEn: string | null; a: string | null; error: string | null } | null;
  error: string | null;
}

export interface Checkout {
  codigo: string; opcion: Opcion; prima: number; moneda: string; tasa: number; totalVes: number; checkoutUrl: string;
  /** Pólizas que se emiten con ese pago (dos con RCP + RCE). */
  polizas?: { cramo: number; producto: string; prima: number }[];
}

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

/** PDF «Condicionado y anexos» de la opción: Nexus lo guarda y lo adjunta al correo de la póliza al emitir. */
export interface AnexosCheckout { nombre: string; base64: string }

/**
 * Manda a pagar la opción elegida: devuelve la URL del módulo de Pagos. Al confirmarse el pago, Nexus emite y envía
 * la póliza al correo del tomador con los `anexos` (sin ellos, solo la póliza).
 */
export const crearCheckout = (codigo: string, opcion: Opcion, returnUrl: string, anexos?: AnexosCheckout | null) =>
  pedir<Checkout>(`/${encodeURIComponent(codigo)}/checkout`, json('POST', { opcion, returnUrl, ...(anexos ? { anexos } : {}) }));

/**
 * Canal (solo vista admin; el proxy no deja pasar la ruta por el link del cliente y Nexus exige el origen admin):
 * Nexus emite sin pago la(s) póliza(s) de la opción y el recibo queda pendiente de cobro en Sis2000. Devuelve la
 * cotización ya emitida; el correo de la póliza sale después, sin recibo.
 */
export const emitirComoPendiente = (codigo: string, opcion: Opcion, anexos?: AnexosCheckout | null) =>
  pedir<CotizacionGuardada>(`/${encodeURIComponent(codigo)}/emitir-pendiente`, json('POST', { opcion, ...(anexos ? { anexos } : {}) }));

/** Emisión hecha por el canal con recibo pendiente de cobro. */
export const registrarEmisionPendiente = (codigo: string, opcion: Opcion | null, poliza: { cnpoliza: string; cnrecibo: string; urlpoliza: string }) =>
  pedir<CotizacionGuardada>(`/${encodeURIComponent(codigo)}/estado`, json('PATCH', { estado: 'emitida', opcion, poliza }));

/**
 * Admin: reintenta la emisión de una pagada sin póliza (o con una de sus dos pólizas sin emitir: no reemite la que ya
 * salió), el cobro de los recibos pendientes de una emitida o el correo de la póliza.
 */
export const reintentarCotizacion = (codigo: string) => pedir<CotizacionGuardada>(`/${encodeURIComponent(codigo)}/reintentar`, json('POST', {}));

/** Código con el formato oficial (RCG-2026-000123-7KQ4); el provisional del cotizador no lo cumple. */
export const esCodigoOficial = (v: string) => /^(RCG|RCP|RCE|RC)-\d{4}-\d{6}-[2-9A-HJ-NP-Z]{4}$/.test(v.trim().toUpperCase());
