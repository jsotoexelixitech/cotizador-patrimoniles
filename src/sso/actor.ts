// SSO de Nexus: quién cotiza. Desde Sys2000 (SysIP) el intermediario entra con `?nexus_token=` (sso-delegate de Nexus,
// target `cotizador-rc`); el servidor del cotizador valida ese token (servidor/sesionSso.ts) y de él, y solo de él,
// salen el productor y el usuario que llevan la cotización guardada y la emisión (modo intermediario). Sin token es la
// landing web de La Mundial (modo web): productor La Mundial directo, como siempre.
// Módulo puro (sin React, window ni import.meta.env): lo usan el servidor (decide) y la pantalla (solo muestra).

/** Productor de la venta directa de La Mundial (canal web) cuando no se configura VITE_RCG_PLANES_CPRODUCTOR. */
export const PRODUCTOR_WEB_POR_DEFECTO = 80080;

/** Usuario de Sys2000 que entró por el SSO, tal como viene en la metadata del nexus_token ya validado. */
export interface ActorSso {
  cusuario: string | null;
  /** Productor del token; null = el usuario no trae productor propio (se usa el de La Mundial directo). */
  cproductor: number | null;
  crol: string | null;
  email: string | null;
  /** Nombre del usuario en Sys2000 (xusuario). */
  nombre: string | null;
  /** Login de Sys2000 (xlogin). */
  login: string | null;
  /** Nombre del canal o productor (xcanal) o el canal. */
  canal: string | null;
  empresaId: number;
  submoduloId: number;
}

export type ModoSesion = 'web' | 'intermediario';

/** Respuesta de GET {base}/sso/sesion. */
export interface SesionCotizador {
  modo: ModoSesion;
  /** Productor con el que se guarda y se emite. */
  productor: number;
  actor: ActorSso | null;
}

/** Creador que se guarda con la cotización en Nexus (cotizaciones-rc). La cotización web no lleva creador. */
export interface CreadorCotizacion {
  modo: 'intermediario';
  cusuario: string | null;
  cproductor: number | null;
  crol: string | null;
  email: string | null;
  nombre: string | null;
  login: string | null;
  canal: string | null;
}

type Obj = Record<string, unknown>;
const esObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/** Texto corto o null (los códigos de Sys2000 llegan como número o como texto). */
const texto = (v: unknown, max = 150): string | null => {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};

/** Entero positivo o null. */
export const enteroPositivo = (v: unknown): number | null => {
  const s = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : '';
  if (!/^\d{1,10}$/.test(s)) return null;
  const n = Number(s);
  return n > 0 ? n : null;
};

/** Actor a partir de la metadata de un nexus_token cuya firma ya se verificó. */
export function actorDeMetadata(meta: unknown, empresaId: number, submoduloId: number): ActorSso {
  const m = esObj(meta) ? meta : {};
  return {
    cusuario: texto(m.cusuario, 40),
    cproductor: enteroPositivo(m.cproductor),
    crol: texto(m.crol, 40),
    email: texto(m.email, 150),
    nombre: texto(m.xusuario, 150),
    login: texto(m.xlogin, 80),
    canal: texto(m.xcanal, 150) ?? texto(m.canal, 50),
    empresaId,
    submoduloId,
  };
}

/** Productor efectivo: el del token validado o, sin token (o sin productor en el token), el de La Mundial directo. */
export const productorDe = (actor: ActorSso | null, productorWeb: number): number => actor?.cproductor ?? productorWeb;

export function sesionDeActor(actor: ActorSso | null, productorWeb: number): SesionCotizador {
  return { modo: actor ? 'intermediario' : 'web', productor: productorDe(actor, productorWeb), actor };
}

export function creadorDe(actor: ActorSso | null): CreadorCotizacion | null {
  if (!actor) return null;
  const { cusuario, cproductor, crol, email, nombre, login, canal } = actor;
  return { modo: 'intermediario', cusuario, cproductor, crol, email, nombre, login, canal };
}

/** Cómo se muestra el intermediario: nombre, si no el login, si no el código de usuario. */
export const nombreActor = (a: Pick<ActorSso, 'nombre' | 'login' | 'cusuario'>): string =>
  a.nombre ?? a.login ?? (a.cusuario ? `usuario ${a.cusuario}` : 'usuario de Sys2000');

/** cusuario como número si es numérico (Sis2000), si no como texto. */
const cusuarioSis = (v: string): number | string => (/^\d{1,10}$/.test(v) ? Number(v) : v);

/**
 * Productor y usuario de una emisión: los del token (intermediario) o los de La Mundial directo (web). El valor que
 * traiga el body del navegador se descarta siempre. `clave`: `productor` (riesgos-generales/emision) o `cproductor`
 * (partner patrimonial /emit).
 */
export function conActorEnEmision(body: Obj, actor: ActorSso | null, productorWeb: number, clave: 'productor' | 'cproductor' = 'productor'): Obj {
  const { cusuario: _descartado, ...resto } = body;
  return {
    ...resto,
    [clave]: productorDe(actor, productorWeb),
    ...(actor?.cusuario ? { cusuario: cusuarioSis(actor.cusuario) } : {}),
  };
}

/**
 * POST /api/cotizaciones-rc: aplica la sesión al cuerpo antes de firmarlo y mandarlo a Nexus. `creador` sale del
 * token validado (o se quita: cotización web) y cada body de emisión de `datos.emisiones` lleva el productor y el
 * usuario de la sesión, así Nexus emite con ellos cuando el cliente paga. Devuelve un objeto nuevo.
 */
export function aplicarSesionACotizacion(cuerpo: unknown, actor: ActorSso | null, productorWeb: number): unknown {
  if (!esObj(cuerpo)) return cuerpo;
  const { creador: _descartado, ...resto } = cuerpo;
  const creador = creadorDe(actor);
  const salida: Obj = { ...resto, ...(creador ? { creador } : {}) };
  const datos = resto.datos;
  if (esObj(datos) && esObj(datos.emisiones)) {
    const emisiones = Object.fromEntries(Object.entries(datos.emisiones).map(([opcion, v]) => {
      const aplicar = (b: unknown) => (esObj(b) ? conActorEnEmision(b, actor, productorWeb) : b);
      return [opcion, Array.isArray(v) ? v.map(aplicar) : aplicar(v)];
    }));
    salida.datos = { ...datos, emisiones };
  }
  return salida;
}

/** Ramo de Pastora: su formulario admin deja escribir el productor a propósito; sin SSO no se toca. */
const RAMO_PASTORA = 25;

/**
 * Emisión directa por nest-api (solo QA). Con sesión de intermediario: siempre su productor y usuario. Sin sesión: el
 * productor de La Mundial directo, salvo Pastora (formulario admin con productor propio). null = no se toca.
 */
export function aplicarSesionAEmision(cuerpo: unknown, actor: ActorSso | null, productorWeb: number, clave: 'productor' | 'cproductor'): Obj | null {
  if (!esObj(cuerpo)) return null;
  const cramo = clave === 'cproductor' && esObj(cuerpo.keys) ? Number(cuerpo.keys.cramo) : Number(cuerpo.cramo);
  if (!actor && cramo === RAMO_PASTORA) return null;
  return conActorEnEmision(cuerpo, actor, productorWeb, clave);
}
