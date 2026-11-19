// Recálculo de la prima en el servidor (proxy /nexus, servidor/proxyNexus.ts) antes de guardar en Nexus una cotización
// hecha por el cliente. La vista cliente siempre cotiza con la tarifa oficial de La Mundial, la tasa media del rango y
// sin ajuste: el servidor rehace la cotización con el `estado` guardado y esas reglas, y rechaza la que no coincida
// (prima o suma de cada opción, y el body de emisión que Nexus usará al confirmarse el pago). Módulo puro: sin React,
// zustand, window ni import.meta.env.
// La vista admin no pasa por aquí: puede usar Parámetros propios (tasas, descuentos) que el servidor no conoce.
import { redondear } from '../tarifas/comun';
import {
  BASICA_RCE, BASICA_RCG, BASICA_RCP, MAPEO_RCE, MAPEO_RCG, MAPEO_RCP, RAMOS_RC, type MapeoCobertura,
} from '../tarifas/data/mapeo-sis2000';
import { monedaSis2000 } from '../tarifas/emision-rc';
import { cotizarRcg, PARAMETROS_RCG, tasaPromedio } from '../tarifas/rcg';
import { cotizarRc, opcionalesDe, PARAMETROS_RC, tasaMedia } from '../tarifas/rcp-rce';
import { alternativasRc, estadoParaReabrir, type AlternativaGuardada, type EstadoCotizador } from './snapshot';
import { claseRc, EMISOR_CLIENTE, solicitudRc, solicitudRcg } from './solicitud';

export interface ConfigVerificacion {
  /**
   * Productor que deben llevar los bodies de emisión: el del nexus_token validado (intermediario) o el del canal web
   * (VITE_RCG_PLANES_CPRODUCTOR). Lo decide servidor/proxyNexus.ts; sin él no se exige.
   */
  cproductor?: number;
}

const TOLERANCIA = 0.01;
type Obj = Record<string, unknown>;
const esObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const esNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const difiere = (v: unknown, esperado: number) => !esNumero(v) || Math.abs(v - esperado) > TOLERANCIA;

type ProductoForm = EstadoCotizador['rc']['p'];

/** El estado tal como lo deja la vista cliente: tasa media del rango oficial, sin ajuste y tasas opcionales oficiales. */
export function estadoComoCliente(e: EstadoCotizador): EstadoCotizador {
  if (e.producto === 'rcg') {
    const clase = PARAMETROS_RCG.clases[e.rcg.clase];
    return { ...e, rcg: { ...e.rcg, tasa: clase ? String(tasaPromedio(clase)) : '' } };
  }
  const rc = e.rc;
  const clase = claseRc(rc);
  const rangoP = clase === null ? null : PARAMETROS_RC.clases[clase] ?? null;
  const rangoE = rc.actividad === '' ? null : PARAMETROS_RC.actividades[Number(rc.actividad)] ?? null;
  const producto = (k: 'p' | 'e', tasa: string): ProductoForm => ({
    ...rc[k], tasa, ajuste: '0',
    opcionalesVes: opcionalesDe(k).map((o, i) => ({
      ...(rc[k].opcionalesVes[i] ?? { seleccionada: false, limite: '', grupo: '' }), tasa: String(o[1]),
    })),
  });
  return {
    ...e,
    rc: { ...rc, p: producto('p', rangoP ? String(tasaMedia(rangoP)) : ''), e: producto('e', rangoE ? String(tasaMedia(rangoE)) : '') },
  };
}

const mapeoDe = (cramo: number): MapeoCobertura[] =>
  cramo === RAMOS_RC.rcg ? [BASICA_RCG, ...MAPEO_RCG] : cramo === RAMOS_RC.rcp ? [BASICA_RCP, ...MAPEO_RCP] : [BASICA_RCE, ...MAPEO_RCE];

/** Body de emisión (modo cotizador) de una póliza: ramo, productor, coberturas del mapeo, sumas y primas coherentes. */
function errorBody(b: unknown, cramo: number, moneda: string, limite: number, cfg: ConfigVerificacion): string | null {
  if (!esObj(b)) return 'body de emisión inválido.';
  if (b.modo !== 'cotizador') return 'el body de emisión debe ser modo cotizador.';
  if (b.cramo !== cramo) return `el ramo de emisión no corresponde (se esperaba ${cramo}).`;
  if (cfg.cproductor && b.productor !== cfg.cproductor) return 'el productor de emisión no corresponde.';
  if (typeof b.cplan !== 'string' || !b.cplan.trim()) return 'falta el plan contenedor.';
  if (!Array.isArray(b.coberturas) || !b.coberturas.length) return 'la emisión no trae coberturas.';
  const sis = monedaSis2000(moneda);
  const permitidas = new Set(mapeoDe(cramo).map((m) => m.ccober[sis]).filter(Boolean));
  let suma = 0;
  for (const c of b.coberturas as unknown[]) {
    if (!esObj(c) || typeof c.ccober !== 'string' || !permitidas.has(c.ccober)) return 'la emisión trae una cobertura que no es del cotizador.';
    if (!esNumero(c.suma) || !(c.suma > 0) || c.suma > limite + TOLERANCIA) return 'la suma de una cobertura supera el límite cotizado.';
    if (!esNumero(c.prima) || c.prima < 0) return 'la prima de una cobertura no es válida.';
    suma += c.prima;
  }
  if (!esNumero(b.prima_total) || difiere(b.prima_total, redondear(suma))) return 'la prima total no es la suma de sus coberturas.';
  return null;
}

interface Esperado { alternativas: AlternativaGuardada[]; moneda: string; ramos: number[] }

function esperadoDe(producto: unknown, estado: EstadoCotizador): Esperado | string {
  const e = estadoComoCliente(estado);
  if (producto === 'rcg') {
    if (estado.producto !== 'rcg') return 'El producto no coincide con el estado del cotizador.';
    const cot = cotizarRcg(solicitudRcg(e), PARAMETROS_RCG);
    return {
      alternativas: cot.alternativas.map((a) => ({ opcion: a.opcion, limite: a.limite, prima: a.prima })),
      moneda: e.rcg.moneda, ramos: [RAMOS_RC.rcg],
    };
  }
  if (producto !== 'rcp' && producto !== 'rce' && producto !== 'rc') return 'Producto no permitido.';
  const modo = estado.rc.modo === 'p' ? 'rcp' : estado.rc.modo === 'e' ? 'rce' : 'rc';
  if (estado.producto !== 'rc' || producto !== modo) return 'El producto no coincide con el estado del cotizador.';
  const cot = cotizarRc(solicitudRc(e, EMISOR_CLIENTE), PARAMETROS_RC);
  return {
    alternativas: cot.resultados.length ? alternativasRc(cot) : [],
    moneda: cot.simbolo, ramos: cot.resultados.map((r) => RAMOS_RC[r.k === 'p' ? 'rcp' : 'rce']),
  };
}

function verificar(datos: unknown, cfg: ConfigVerificacion): string | null {
  if (!esObj(datos)) return 'Falta la cotización.';
  const estado = estadoParaReabrir(datos);
  if (!estado) return 'La cotización no trae el estado del cotizador para verificar la prima.';
  const esp = esperadoDe(datos.producto, estado);
  if (typeof esp === 'string') return esp;
  if (!esp.alternativas.length || esp.alternativas.some((a) => !(a.prima > 0))) return 'La cotización no tiene una prima válida con la tarifa oficial.';
  if (datos.moneda !== esp.moneda) return 'La moneda no coincide con la cotización.';

  const alts = datos.alternativas;
  if (!Array.isArray(alts) || alts.length !== esp.alternativas.length) return 'Las opciones no coinciden con la tarifa oficial.';
  for (const [i, x] of esp.alternativas.entries()) {
    const a: unknown = alts[i];
    if (!esObj(a) || a.opcion !== x.opcion || difiere(a.prima, x.prima) || difiere(a.limite, x.limite)) {
      return `La prima de la opción ${x.opcion} no coincide con la tarifa oficial.`;
    }
    // RCP + RCE: la prima de cada póliza dentro de la opción.
    if (x.detalle && a.detalle !== undefined) {
      const d = a.detalle;
      if (!Array.isArray(d) || d.length !== x.detalle.length || x.detalle.some((y, j) => !esObj(d[j]) || difiere((d[j] as Obj).prima, y.prima))) {
        return `El detalle de la opción ${x.opcion} no coincide con la tarifa oficial.`;
      }
    }
  }

  const emisiones = datos.emisiones;
  if (emisiones === undefined) return null;
  if (!esObj(emisiones)) return 'Las emisiones no tienen un formato válido.';
  for (const [opcion, v] of Object.entries(emisiones)) {
    const x = esp.alternativas.find((a) => a.opcion === opcion);
    if (!x) return `La opción ${opcion} no existe en la cotización.`;
    const bodies = Array.isArray(v) ? v : [v];
    if (bodies.length !== esp.ramos.length) return `Opción ${opcion}: la emisión no trae una póliza por ramo cotizado.`;
    let total = 0;
    for (const [j, b] of bodies.entries()) {
      const error = errorBody(b, esp.ramos[j], esp.moneda, x.limite, cfg);
      if (error) return `Opción ${opcion}: ${error}`;
      total += (b as { prima_total: number }).prima_total;
    }
    if (difiere(redondear(total), x.prima)) return `Opción ${opcion}: la prima de emisión no coincide con la tarifa oficial.`;
  }
  return null;
}

/**
 * Verifica una cotización del cliente (el `datos` del POST /api/cotizaciones-rc) contra la tarifa oficial. null = OK;
 * si no, el motivo (se responde 400 y no llega a Nexus).
 */
export function verificarCotizacionCliente(datos: unknown, cfg: ConfigVerificacion = {}): string | null {
  try {
    return verificar(datos, cfg);
  } catch {
    return 'La cotización no tiene un formato válido.';
  }
}
