import { createHmac } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { firmarCuerpo, proxyNexusFirmado } from './proxyNexus';
import { configSso, escribirCuerpoReescrito, sesionDe, sesionSso, verificarTokenNexus, type ConfigSso } from './sesionSso';

const SECRETO = 'tenant-secret-de-prueba-con-32-caracteres!!';
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

/** nexus_token como lo firma nexus-api (jsonwebtoken, HS256). */
function token(payload: Record<string, unknown>, secreto = SECRETO, alg = 'HS256') {
  const h = b64({ alg, typ: 'JWT' });
  const p = b64(payload);
  return `${h}.${p}.${createHmac('sha256', secreto).update(`${h}.${p}`).digest('base64url')}`;
}
const ahora = Math.floor(Date.now() / 1000);
const meta = { cusuario: '20364172', cproductor: '1051', crol: 7, email: 'ana@lamundial.test', xusuario: 'ANA PÉREZ', xlogin: 'aperez', xcanal: 'Corretaje X' };
const valido = (extra: Record<string, unknown> = {}) =>
  token({ type: 'tenant_access', empresaId: 7, submoduloId: 40, metadata: meta, iat: ahora, exp: ahora + 3600, ...extra });

const cfg = (x: Partial<ConfigSso> = {}): ConfigSso => ({ ...configSso({ TENANT_TOKEN_SECRET: SECRETO }, 80080), ...x });

describe('SSO de Nexus · validación del nexus_token en el servidor', () => {
  it('token válido → intermediario con productor, usuario, rol y correo del token', () => {
    const r = verificarTokenNexus(valido(), cfg());
    expect(r).toEqual({
      ok: true,
      actor: {
        cusuario: '20364172', cproductor: 1051, crol: '7', email: 'ana@lamundial.test', nombre: 'ANA PÉREZ', login: 'aperez',
        canal: 'Corretaje X', empresaId: 7, submoduloId: 40,
      },
    });
  });

  it('rechaza firma de otro secreto, alg distinto, otro tipo de token o token mal formado', () => {
    expect(verificarTokenNexus(valido().slice(0, -2) + 'xx', cfg())).toMatchObject({ ok: false, status: 401 });
    expect(verificarTokenNexus(token({ type: 'tenant_access', empresaId: 7, submoduloId: 40, iat: ahora }, 'otro-secreto'), cfg())).toMatchObject({ ok: false, status: 401 });
    expect(verificarTokenNexus(token({ type: 'tenant_access', empresaId: 7, submoduloId: 40, iat: ahora }, SECRETO, 'none'), cfg())).toMatchObject({ ok: false });
    expect(verificarTokenNexus(valido({ type: 'portal_sso' }), cfg())).toMatchObject({ ok: false, status: 401 });
    expect(verificarTokenNexus(valido({ empresaId: undefined }), cfg())).toMatchObject({ ok: false, status: 401 });
    expect(verificarTokenNexus('no-es-un-jwt', cfg())).toMatchObject({ ok: false, status: 401 });
  });

  it('la sesión dura COTIZADOR_SSO_HORAS desde que Nexus emitió el token (no el exp de 1 h)', () => {
    const t = valido({ iat: ahora - 2 * 3600, exp: ahora - 3600 });
    expect(verificarTokenNexus(t, cfg()).ok).toBe(true);
    expect(verificarTokenNexus(t, cfg({ horas: 1 }))).toMatchObject({ ok: false, status: 401, motivo: expect.stringContaining('venció') });
    expect(verificarTokenNexus(valido({ iat: undefined }), cfg())).toMatchObject({ ok: false });
  });

  it('con COTIZADOR_SSO_SUBMODULO_ID solo acepta tokens de ese submódulo; sin secreto responde 503', () => {
    const c = cfg({ submoduloIds: configSso({ COTIZADOR_SSO_SUBMODULO_ID: '40, 41' }, 80080).submoduloIds });
    expect(verificarTokenNexus(valido(), c).ok).toBe(true);
    expect(verificarTokenNexus(valido({ submoduloId: 17 }), c)).toMatchObject({ ok: false, status: 403 });
    expect(verificarTokenNexus(valido(), cfg({ secreto: undefined }))).toMatchObject({ ok: false, status: 503 });
  });

  it('modo por petición: sin cabecera web, con token válido intermediario, con token malo inválida (nunca web)', () => {
    expect(sesionDe({ headers: {} }, cfg())).toEqual({ modo: 'web' });
    expect(sesionDe({ headers: { 'x-nexus-token': valido() } }, cfg())).toMatchObject({ modo: 'intermediario', actor: { cproductor: 1051 } });
    expect(sesionDe({ headers: { 'x-nexus-token': `Bearer ${valido()}` } }, cfg()).modo).toBe('intermediario');
    expect(sesionDe({ headers: { 'x-nexus-token': 'a.b.c' } }, cfg())).toMatchObject({ modo: 'invalida', status: 401 });
  });
});

// ─── Middlewares (vite / vite preview) con peticiones simuladas ──────────────────────────────────────────────────────

type Mw = (req: IncomingMessage, res: ServerResponse, next: () => void) => void;
function middlewareDe(plugin: { configureServer?: unknown }): Mw {
  let mw: Mw | null = null;
  (plugin.configureServer as (s: unknown) => void)({ middlewares: { use: (f: Mw) => { mw = f; } } });
  return mw!;
}
function peticion(method: string, url: string, headers: Record<string, string>, body?: unknown): IncomingMessage {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]) as unknown as IncomingMessage;
  Object.assign(req, { method, url, headers });
  return req;
}
function respuesta() {
  const r = { statusCode: 200, headers: {} as Record<string, unknown>, body: '', headersSent: false };
  const res = {
    get statusCode() { return r.statusCode; }, set statusCode(v: number) { r.statusCode = v; },
    setHeader: (k: string, v: unknown) => { r.headers[k] = v; },
    end: (b?: Buffer | string) => { r.body = b ? b.toString() : ''; r.headersSent = true; },
    get headersSent() { return r.headersSent; },
  } as unknown as ServerResponse;
  return { res, r };
}
const esperar = () => new Promise((ok) => setTimeout(ok, 20));
const sinBase = (u: string) => u.replace(/^\/cotizador-rc/, '');

describe('SSO de Nexus · GET /sso/sesion y emisión directa', () => {
  const mw = middlewareDe(sesionSso({ cfg: cfg(), sinBase, habilitado: true }));

  it('sesión web sin token e intermediario con token; token malo → 401 marcado sso', async () => {
    const a = respuesta();
    mw(peticion('GET', '/cotizador-rc/sso/sesion', {}), a.res, () => undefined);
    expect(JSON.parse(a.r.body)).toEqual({ success: true, data: { modo: 'web', productor: 80080, actor: null } });
    const b = respuesta();
    mw(peticion('GET', '/cotizador-rc/sso/sesion', { 'x-nexus-token': valido() }), b.res, () => undefined);
    expect(JSON.parse(b.r.body).data).toMatchObject({ modo: 'intermediario', productor: 1051, actor: { nombre: 'ANA PÉREZ' } });
    const c = respuesta();
    mw(peticion('GET', '/cotizador-rc/sso/sesion', { 'x-nexus-token': 'a.b.c' }), c.res, () => undefined);
    expect(c.r.statusCode).toBe(401);
    expect(JSON.parse(c.r.body)).toMatchObject({ success: false, sso: true });
  });

  it('la emisión directa lleva el productor y el usuario del token, aunque el navegador mande otro', async () => {
    const req = peticion('POST', '/cotizador-rc/nest/api/v1/riesgos-generales/emision', { 'x-nexus-token': valido() }, { cramo: 28, productor: 99999, cusuario: 1 });
    const next = vi.fn();
    mw(req, respuesta().res, next);
    await esperar();
    expect(next).toHaveBeenCalled();
    const escrito: Buffer[] = [];
    const cabeceras: Record<string, unknown> = {};
    escribirCuerpoReescrito({ setHeader: (k, v) => { cabeceras[k] = v; }, write: (b) => escrito.push(b) }, req);
    expect(JSON.parse(escrito[0].toString())).toEqual({ cramo: 28, productor: 1051, cusuario: 20364172 });
    expect(cabeceras['content-length']).toBe(escrito[0].length);
  });

  it('sin token: productor de La Mundial directo (salvo Pastora); partner patrimonial usa cproductor', async () => {
    const plan = peticion('POST', '/nest/api/v1/partner/starter/patrimonial/emit', {}, { keys: { cramo: 28 }, cproductor: 1234 });
    mw(plan, respuesta().res, () => undefined);
    const pastora = peticion('POST', '/nest/api/v1/riesgos-generales/emision', {}, { cramo: 25, productor: 4321 });
    mw(pastora, respuesta().res, () => undefined);
    await esperar();
    const leer = (req: IncomingMessage) => {
      const out: Buffer[] = [];
      escribirCuerpoReescrito({ setHeader: () => undefined, write: (b) => out.push(b) }, req);
      return JSON.parse(out[0].toString());
    };
    expect(leer(plan)).toEqual({ keys: { cramo: 28 }, cproductor: 80080 });
    expect(leer(pastora)).toEqual({ cramo: 25, productor: 4321 });
  });

  it('token vencido en la emisión: 401 y no llega a nest-api', async () => {
    const { res, r } = respuesta();
    const next = vi.fn();
    mw(peticion('POST', '/nest/api/v1/riesgos-generales/emision', { 'x-nexus-token': valido({ iat: ahora - 9 * 3600 }) }, { cramo: 28 }), res, next);
    await esperar();
    expect(next).not.toHaveBeenCalled();
    expect(r.statusCode).toBe(401);
  });
});

describe('SSO de Nexus · guardado de la cotización en Nexus (proxy firmado)', () => {
  afterEach(() => vi.unstubAllGlobals());

  const cuerpo = {
    producto: 'rcg',
    creador: { modo: 'intermediario', cproductor: 5555 },
    datos: { producto: 'rcg', emisiones: { I: { cramo: 28, productor: 80080 }, II: [{ cramo: 27, productor: 1 }, { cramo: 37 }] } },
  };
  const enviar = async (headers: Record<string, string>) => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, data: { codigo: 'RCG-2026-000001-ABCD' } }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const mw = middlewareDe(proxyNexusFirmado({
      nexus: 'https://nexus.test', apiKey: 'k', secreto: 'firma', exigirFirma: true, habilitado: true, sinBase,
      esCliente: () => false, verificacion: { cproductor: 80080 }, sso: cfg(),
    }));
    const { res, r } = respuesta();
    mw(peticion('POST', '/cotizador-rc/nexus/api/cotizaciones-rc', headers, cuerpo), res, () => undefined);
    await esperar();
    return { fetchMock, r };
  };

  it('intermediario: creador y productor/usuario del token en cada body; la firma cubre lo que se envía', async () => {
    const { fetchMock, r } = await enviar({ 'x-nexus-token': valido() });
    expect(r.statusCode).toBe(201);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, { body: Buffer; headers: Record<string, string> }];
    const enviado = JSON.parse(init.body.toString());
    expect(enviado.creador).toEqual({
      modo: 'intermediario', cusuario: '20364172', cproductor: 1051, crol: '7', email: 'ana@lamundial.test', nombre: 'ANA PÉREZ', login: 'aperez', canal: 'Corretaje X',
    });
    expect(enviado.datos.emisiones.I).toEqual({ cramo: 28, productor: 1051, cusuario: 20364172 });
    expect(enviado.datos.emisiones.II.map((b: { productor: number }) => b.productor)).toEqual([1051, 1051]);
    expect(init.headers['x-cotizador-firma']).toBe(firmarCuerpo('firma', init.body));
  });

  it('web: sin creador (aunque el navegador lo mande) y productor La Mundial directo', async () => {
    const { fetchMock } = await enviar({});
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, { body: Buffer }];
    const enviado = JSON.parse(init.body.toString());
    expect(enviado.creador).toBeUndefined();
    expect(enviado.datos.emisiones.I).toEqual({ cramo: 28, productor: 80080 });
    expect(enviado.datos.emisiones.II[0]).toEqual({ cramo: 27, productor: 80080 });
  });

  it('token inválido: 401 y no se guarda como web', async () => {
    const { fetchMock, r } = await enviar({ 'x-nexus-token': valido({ iat: ahora - 9 * 3600 }) });
    expect(r.statusCode).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
