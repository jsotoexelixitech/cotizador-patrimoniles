// Guardado de cotizaciones en Nexus (POST /api/cotizaciones-rc) desde el servidor de Vite (dev y `vite preview`).
// Va antes del proxy /nexus de vite.config.ts y reenvía él mismo la petición para:
//  1. Vista cliente: recalcular la prima con la tarifa oficial (src/cotizaciones/verificarPrima.ts) y responder 400 si
//     la prima, las sumas o el body de emisión no coinciden. La vista admin no se recalcula (usa Parámetros propios).
//  2. SSO de Nexus (servidor/sesionSso.ts): con un nexus_token válido en x-nexus-token, `creador` y el productor y el
//     usuario de cada body de emisión salen del token (modo intermediario); sin token, productor La Mundial directo
//     (modo web). Lo que traiga el navegador en esos campos se descarta siempre. Token inválido o vencido: 401.
//  3. Firmar el body: cabecera `x-cotizador-firma` = HMAC-SHA256 (hex) del body ya con la sesión aplicada, con
//     COTIZACIONES_RC_SECRET. Se firman exactamente los bytes que se reenvían, así que se firma lo que Nexus recibe.
// Las demás rutas de /nexus siguen por el proxy normal. Fuera de src/ a propósito: usa Node (crypto, http).
import { createHmac } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { verificarCotizacionCliente, type ConfigVerificacion } from '../src/cotizaciones/verificarPrima';
import { aplicarSesionACotizacion, productorDe } from '../src/sso/actor';
import { actorDeSesion, responderSesionInvalida, sesionDe, type ConfigSso } from './sesionSso';

export const CABECERA_FIRMA = 'x-cotizador-firma';
const MAX_BYTES = 5 * 1024 * 1024;

/** HMAC-SHA256 en hex del body. Nexus debe calcular lo mismo sobre los bytes que recibe. */
export const firmarCuerpo = (secreto: string, cuerpo: Buffer | string): string =>
  createHmac('sha256', secreto).update(cuerpo).digest('hex');

export interface OpcionesProxyNexus {
  /** URL base de Nexus (NEXUS_API_URL, sin / final). */
  nexus: string;
  apiKey?: string;
  /** COTIZACIONES_RC_SECRET. */
  secreto?: string;
  /** Sin secreto responde 503 en vez de reenviar sin firma (producción). */
  exigirFirma: boolean;
  /** false = el proxy /nexus está apagado (link público de Pastora): se deja seguir y responde 404. */
  habilitado: boolean;
  sinBase: (url: string) => string;
  esCliente: (req: IncomingMessage) => boolean;
  verificacion: ConfigVerificacion;
  /** SSO de Nexus: quién cotiza y con qué productor (incluye el productor del canal web). */
  sso: ConfigSso;
}

function leerCuerpo(req: IncomingMessage): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const partes: Buffer[] = [];
    let total = 0;
    let excedido = false;
    req.on('data', (c: Buffer) => {
      total += c.length;
      if (total > MAX_BYTES) excedido = true;
      else partes.push(c);
    });
    req.on('end', () => resolve(excedido ? null : Buffer.concat(partes)));
    req.on('error', reject);
  });
}

function responder(res: ServerResponse, status: number, message: string) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ success: false, message }));
}

async function crearCotizacion(o: OpcionesProxyNexus, req: IncomingMessage, res: ServerResponse, ruta: string) {
  const sesion = sesionDe(req, o.sso);
  if (sesion.modo === 'invalida') return responderSesionInvalida(res, sesion);
  const actor = actorDeSesion(sesion);
  const recibido = await leerCuerpo(req);
  if (!recibido) return responder(res, 413, 'La cotización es demasiado grande.');
  let json: unknown;
  try {
    json = JSON.parse(recibido.toString('utf8'));
  } catch {
    return responder(res, 400, 'La cotización no es un JSON válido.');
  }
  // Productor y usuario: solo de la sesión validada en este servidor, nunca del navegador.
  json = aplicarSesionACotizacion(json, actor, o.sso.productorWeb);
  const cuerpo = Buffer.from(JSON.stringify(json));
  const cliente = o.esCliente(req);
  if (cliente) {
    const j = (json && typeof json === 'object' ? json : {}) as { producto?: unknown; datos?: { producto?: unknown } };
    const error = j.producto !== j.datos?.producto
      ? 'El producto no coincide con la cotización.'
      : verificarCotizacionCliente(j.datos, { ...o.verificacion, cproductor: productorDe(actor, o.sso.productorWeb) });
    if (error) {
      console.warn(`[cotizador] cotización del cliente rechazada (prima recalculada en el servidor): ${error}`);
      return responder(res, 400, error);
    }
  }
  if (o.exigirFirma && !o.secreto) return responder(res, 503, 'Guardado de cotizaciones sin firma configurada en el servidor.');
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    // Nexus registra quién creó la cotización; lo decide el servidor, no el navegador.
    'x-cotizador-origen': cliente ? 'cliente' : 'admin',
  };
  if (o.apiKey) headers['x-api-key'] = o.apiKey;
  if (o.secreto) headers[CABECERA_FIRMA] = firmarCuerpo(o.secreto, cuerpo);
  let r: Response;
  try {
    r = await fetch(`${o.nexus}${ruta.replace(/^\/nexus/, '')}`, { method: 'POST', headers, body: cuerpo, signal: AbortSignal.timeout(60_000) });
  } catch (e) {
    console.error(`[cotizador] Nexus no respondió al guardar la cotización: ${(e as Error).message}`);
    return responder(res, 502, 'Sin conexión con Exélixi Nexus.');
  }
  res.statusCode = r.status;
  res.setHeader('content-type', r.headers.get('content-type') ?? 'application/json');
  res.end(Buffer.from(await r.arrayBuffer()));
}

/** Plugin: middleware de POST {base}/nexus/api/cotizaciones-rc en `vite` y en `vite preview`. */
export function proxyNexusFirmado(o: OpcionesProxyNexus): Plugin {
  if (o.exigirFirma && !o.secreto) console.warn('[cotizador] Falta COTIZACIONES_RC_SECRET: el guardado de cotizaciones responderá 503.');
  const middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!o.habilitado || req.method !== 'POST') return next();
    const ruta = o.sinBase(req.url ?? '');
    // Cliente: solo la ruta exacta (sin parámetros); admin: también con parámetros. Lo demás sigue al proxy.
    const exacta = /^\/nexus\/api\/cotizaciones-rc$/.test(ruta);
    if (!exacta && !(/^\/nexus\/api\/cotizaciones-rc\?/.test(ruta) && !o.esCliente(req))) return next();
    crearCotizacion(o, req, res, ruta).catch((e: Error) => {
      console.error(`[cotizador] error al guardar la cotización: ${e.message}`);
      if (!res.headersSent) responder(res, 500, 'No se pudo guardar la cotización.');
    });
  };
  return {
    name: 'cotizador-proxy-nexus-firmado',
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}
