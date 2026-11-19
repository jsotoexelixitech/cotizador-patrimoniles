// SSO de Nexus en el servidor del cotizador (`vite` y `vite preview`). Valida el nexus_token del sso-delegate como los
// demás módulos (OCR, Emisión: JWT HS256 firmado con TENANT_TOKEN_SECRET, type «tenant_access») y de su metadata saca
// quién cotiza (src/sso/actor.ts). El navegador solo guarda el token y lo reenvía en la cabecera x-nexus-token: nunca
// decide el productor. Sin token = modo web (landing pública de La Mundial).
//   GET  {base}/sso/sesion                                    → modo, productor y usuario (para mostrarlos)
//   POST {base}/nest/api/v1/riesgos-generales/emision          → productor/usuario de la sesión antes del proxy /nest
//   POST {base}/nest/api/v1/partner/starter/patrimonial/emit   → idem (cproductor)
// El guardado de cotizaciones (POST /nexus/api/cotizaciones-rc) usa sesionDe() desde servidor/proxyNexus.ts.
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { actorDeMetadata, aplicarSesionAEmision, sesionDeActor, type ActorSso } from '../src/sso/actor';

export const CABECERA_TOKEN = 'x-nexus-token';
const MAX_BYTES = 5 * 1024 * 1024;

export interface ConfigSso {
  /** TENANT_TOKEN_SECRET (el mismo de nexus-api). Sin él, un token no se puede validar: 503. */
  secreto?: string;
  /** COTIZADOR_SSO_SUBMODULO_ID (lista con comas): el token debe ser de ese submódulo de Nexus. Vacío = cualquiera. */
  submoduloIds: number[];
  /** Horas desde que Nexus emitió el token durante las que vale la sesión (COTIZADOR_SSO_HORAS, 8 por defecto). */
  horas: number;
  /** Productor del canal web (VITE_RCG_PLANES_CPRODUCTOR, 80080). */
  productorWeb: number;
}

export function configSso(env: Record<string, string | undefined>, productorWeb: number): ConfigSso {
  const ids = String(env.COTIZADOR_SSO_SUBMODULO_ID ?? '').split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0);
  const horas = Number(env.COTIZADOR_SSO_HORAS);
  return { secreto: env.TENANT_TOKEN_SECRET || undefined, submoduloIds: ids, horas: horas > 0 ? horas : 8, productorWeb };
}

export type ResultadoToken = { ok: true; actor: ActorSso } | { ok: false; status: number; motivo: string };

const VENCIDA = 'Tu sesión de Sys2000 venció: vuelve a abrir el cotizador desde Sys2000.';
const INVALIDA = 'La sesión de Sys2000 no es válida: vuelve a abrir el cotizador desde Sys2000.';

const json64 = (parte: string): Record<string, unknown> | null => {
  try {
    const v: unknown = JSON.parse(Buffer.from(parte, 'base64url').toString('utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

/**
 * Verifica un nexus_token: firma HS256 con TENANT_TOKEN_SECRET, type «tenant_access», empresa y submódulo, y que no
 * hayan pasado más de `horas` desde que Nexus lo emitió (iat). Como en los demás módulos no se usa el `exp` de 1 h
 * del token: el usuario cotiza durante la jornada sin volver a entrar.
 */
export function verificarTokenNexus(token: string, cfg: ConfigSso, ahoraMs = Date.now()): ResultadoToken {
  if (!cfg.secreto) return { ok: false, status: 503, motivo: 'El SSO de Sys2000 no está configurado en el servidor del cotizador (TENANT_TOKEN_SECRET).' };
  const partes = token.trim().split('.');
  if (partes.length !== 3 || partes.some((p) => !/^[A-Za-z0-9_-]+$/.test(p))) return { ok: false, status: 401, motivo: INVALIDA };
  const [h, p, firma] = partes;
  const cabecera = json64(h);
  if (!cabecera || cabecera.alg !== 'HS256') return { ok: false, status: 401, motivo: INVALIDA };
  const esperada = createHmac('sha256', cfg.secreto).update(`${h}.${p}`).digest();
  const recibida = Buffer.from(firma, 'base64url');
  if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) return { ok: false, status: 401, motivo: INVALIDA };
  const payload = json64(p);
  if (!payload || payload.type !== 'tenant_access') return { ok: false, status: 401, motivo: INVALIDA };
  const empresaId = Number(payload.empresaId);
  const submoduloId = Number(payload.submoduloId);
  if (!(Number.isInteger(empresaId) && empresaId > 0 && Number.isInteger(submoduloId) && submoduloId > 0)) return { ok: false, status: 401, motivo: INVALIDA };
  if (cfg.submoduloIds.length && !cfg.submoduloIds.includes(submoduloId)) {
    return { ok: false, status: 403, motivo: 'Ese acceso de Sys2000 no es del cotizador RC: vuelve a abrirlo desde su botón en Sys2000.' };
  }
  const iat = Number(payload.iat);
  const ahora = ahoraMs / 1000;
  if (!Number.isFinite(iat) || iat > ahora + 300) return { ok: false, status: 401, motivo: INVALIDA };
  if (ahora - iat > cfg.horas * 3600) return { ok: false, status: 401, motivo: VENCIDA };
  return { ok: true, actor: actorDeMetadata(payload.metadata, empresaId, submoduloId) };
}

/** Sesión de la petición: sin cabecera = web; con cabecera, el token debe validar (si no, no se sigue como web). */
export type ResultadoSesion = { modo: 'web' } | { modo: 'intermediario'; actor: ActorSso } | { modo: 'invalida'; status: number; motivo: string };

export function sesionDe(req: Pick<IncomingMessage, 'headers'>, cfg: ConfigSso): ResultadoSesion {
  const v = req.headers[CABECERA_TOKEN];
  const token = (Array.isArray(v) ? v[0] : v)?.replace(/^Bearer\s+/i, '').trim();
  if (!token) return { modo: 'web' };
  const r = verificarTokenNexus(token, cfg);
  return r.ok ? { modo: 'intermediario', actor: r.actor } : { modo: 'invalida', status: r.status, motivo: r.motivo };
}

export const actorDeSesion = (s: ResultadoSesion): ActorSso | null => (s.modo === 'intermediario' ? s.actor : null);

function responder(res: ServerResponse, status: number, cuerpo: unknown) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(cuerpo));
}

/** Error de sesión: `sso: true` para que la pantalla no lo confunda con la key de nest-api o de Nexus. */
export const responderSesionInvalida = (res: ServerResponse, s: { status: number; motivo: string }) =>
  responder(res, s.status, { success: false, sso: true, message: s.motivo });

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

/** Cuerpo ya reescrito que el proxy /nest escribe en vez del original (ver escribirCuerpoReescrito). */
export interface ConCuerpo { cuerpoCotizador?: Buffer }

/**
 * Para el `configure` del proxy /nest de vite.config.ts: si el middleware ya leyó y reescribió el cuerpo, lo escribe
 * en la petición a nest-api (el stream original ya se consumió; http-proxy cierra la petición al terminar).
 */
export function escribirCuerpoReescrito(proxyReq: { setHeader: (k: string, v: string | number) => void; write: (b: Buffer) => unknown }, req: IncomingMessage) {
  const b = (req as IncomingMessage & ConCuerpo).cuerpoCotizador;
  if (!b) return;
  proxyReq.setHeader('content-type', 'application/json');
  proxyReq.setHeader('content-length', b.length);
  proxyReq.write(b);
}

const RUTAS_EMISION: { re: RegExp; clave: 'productor' | 'cproductor' }[] = [
  { re: /^\/nest\/api\/v1\/riesgos-generales\/emision(\?|$)/, clave: 'productor' },
  { re: /^\/nest\/api\/v1\/partner\/starter\/patrimonial\/emit(\?|$)/, clave: 'cproductor' },
];

async function reescribirEmision(cfg: ConfigSso, clave: 'productor' | 'cproductor', req: IncomingMessage, res: ServerResponse, next: () => void) {
  const sesion = sesionDe(req, cfg);
  if (sesion.modo === 'invalida') return responderSesionInvalida(res, sesion);
  const cuerpo = await leerCuerpo(req);
  if (!cuerpo) return responder(res, 413, { success: false, message: 'La emisión es demasiado grande.' });
  let json: unknown = null;
  try {
    json = JSON.parse(cuerpo.toString('utf8'));
  } catch {
    // Sin JSON válido sigue igual: nest-api lo rechaza con su propio mensaje.
  }
  const nuevo = aplicarSesionAEmision(json, actorDeSesion(sesion), cfg.productorWeb, clave);
  (req as IncomingMessage & ConCuerpo).cuerpoCotizador = nuevo ? Buffer.from(JSON.stringify(nuevo)) : cuerpo;
  next();
}

export interface OpcionesSesionSso {
  cfg: ConfigSso;
  sinBase: (url: string) => string;
  /** false = link público de Pastora: ni sesión ni reescritura. */
  habilitado: boolean;
}

/** Plugin: GET {base}/sso/sesion y productor/usuario de la sesión en la emisión directa por nest-api. */
export function sesionSso(o: OpcionesSesionSso): Plugin {
  const middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!o.habilitado) return next();
    const ruta = o.sinBase(req.url ?? '');
    if (req.method === 'GET' && /^\/sso\/sesion(\?|$)/.test(ruta)) {
      const s = sesionDe(req, o.cfg);
      if (s.modo === 'invalida') return responderSesionInvalida(res, s);
      return responder(res, 200, { success: true, data: sesionDeActor(actorDeSesion(s), o.cfg.productorWeb) });
    }
    const emision = req.method === 'POST' ? RUTAS_EMISION.find((r) => r.re.test(ruta)) : undefined;
    if (!emision) return next();
    reescribirEmision(o.cfg, emision.clave, req, res, next).catch((e: Error) => {
      console.error(`[cotizador] error al aplicar la sesión a la emisión: ${e.message}`);
      if (!res.headersSent) responder(res, 500, { success: false, message: 'No se pudo preparar la emisión.' });
    });
  };
  return {
    name: 'cotizador-sesion-sso',
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}
