// Emisión en Sis2000 de las cotizaciones RCG (ramo 28), RCP (27) y RCE (37) con la prima del propio cotizador.
// En Sis2000 esos ramos no tienen tarifa: la aplica Técnico. Se emite con POST v1/riesgos-generales/emision en
// `modo: cotizador` (nest-api valida, no recalcula). Las coberturas salen de data/mapeo-sis2000.ts.
import { normalizar, redondear } from './comun';
import { armarEmisionCoberturas, type DatosEmisionCoberturas } from './coberturas';
import type { CoberturaRamo } from './combo';
import { pideUnidad } from './combo';
import {
  BASICA_RCE, BASICA_RCG, BASICA_RCP, MAPEO_RCE, MAPEO_RCG, MAPEO_RCP, RAMOS_RC,
  type CotizadorRc, type MapeoCobertura, type MonedaSis2000,
} from './data/mapeo-sis2000';
import type { CotizacionRcg } from './rcg';
import { COBERTURAS_BASICAS, type ResultadoProducto } from './rcp-rce';

/** Línea de la póliza: concepto del cotizador → ccober de Sis2000, con su suma y su prima. */
export interface LineaEmision { concepto: string; ccober: string; ctarifa?: string; suma: number; prima: number; ambigua?: string }

export interface CoberturasEmision {
  cotizador: CotizadorRc | 'combo';
  cramo: number;
  moneda: MonedaSis2000;
  lineas: LineaEmision[];
  /** Conceptos de la cotización sin cobertura de Sis2000 en esa moneda: con alguno no se puede emitir. */
  sinMapeo: string[];
  primaTotal: number;
}

/** USD / EUR / Bs. / VES del cotizador → moneda de las coberturas de Sis2000. */
export const monedaSis2000 = (m: string): MonedaSis2000 => {
  const t = m.trim().toUpperCase();
  return t === 'EUR' ? 'EUR' : t.startsWith('BS') || t === 'VES' ? 'BS' : 'USD';
};

const buscar = (mapeo: MapeoCobertura[], concepto: string) => mapeo.find((x) => normalizar(x.concepto) === normalizar(concepto));

/**
 * Arma las líneas con el mapeo. Con `catalogo` (GET coberturas del ramo) además exige que el ccober exista en Sis2000 y
 * toma su ctarifa. Un concepto sin ccober en la moneda o que no exista en el ramo va a `sinMapeo`.
 */
function armar(
  cotizador: CotizadorRc, moneda: MonedaSis2000, pedidas: { m: MapeoCobertura | undefined; concepto: string; suma: number; prima: number }[],
  catalogo?: CoberturaRamo[] | null,
): CoberturasEmision {
  const lineas: LineaEmision[] = [];
  const sinMapeo: string[] = [];
  for (const p of pedidas) {
    const ccober = p.m?.ccober[moneda];
    const enRamo = catalogo ? catalogo.find((c) => c.ccober === ccober) : undefined;
    if (!ccober) { sinMapeo.push(`${p.concepto} (sin cobertura en ${moneda})`); continue; }
    if (catalogo && !enRamo) { sinMapeo.push(`${p.concepto} (la ${ccober} no está en el ramo ${RAMOS_RC[cotizador]})`); continue; }
    lineas.push({
      concepto: p.concepto, ccober, suma: redondear(p.suma), prima: redondear(p.prima),
      ...(enRamo?.ctarifa ? { ctarifa: enRamo.ctarifa } : {}), ...(p.m?.ambigua ? { ambigua: p.m.ambigua } : {}),
    });
  }
  return { cotizador, cramo: RAMOS_RC[cotizador], moneda, lineas, sinMapeo, primaTotal: redondear(lineas.reduce((s, l) => s + l.prima, 0)) };
}

/** RCG: la opción elegida. Básica = límite y toda la prima; cada cobertura incluida con su sublímite y prima 0. */
export function coberturasRcg(cot: CotizacionRcg, opcion: 'I' | 'II' | 'III', monedaRcg: string, catalogo?: CoberturaRamo[] | null): CoberturasEmision | null {
  const i = cot.alternativas.findIndex((a) => a.opcion === opcion);
  const alt = cot.alternativas[i];
  if (!alt) return null;
  return armar('rcg', monedaSis2000(monedaRcg), [
    { m: BASICA_RCG, concepto: BASICA_RCG.concepto, suma: alt.limite, prima: alt.prima },
    ...cot.coberturas.map((c) => ({ m: buscar(MAPEO_RCG, c.nombre), concepto: c.nombre, suma: c.montos[i] ?? 0, prima: 0 })),
  ], catalogo);
}

/**
 * RCP o RCE: básica = límite por evento / año con la prima de la opción (menos las adicionales con prima propia);
 * coberturas básicas con el límite por trabajador y prima 0; adicionales por empleado (USD/EUR) con su prima; en Bs.
 * las opcionales elegidas van con prima 0 porque la prima de Bs. no se reparte por línea.
 */
export function coberturasRc(r: ResultadoProducto, monedaRc: string, catalogo?: CoberturaRamo[] | null): CoberturasEmision {
  const cotizador: CotizadorRc = r.k === 'p' ? 'rcp' : 'rce';
  const mapeo = r.k === 'p' ? MAPEO_RCP : MAPEO_RCE;
  const basica = r.k === 'p' ? BASICA_RCP : BASICA_RCE;
  const [porTrabajador, , porEvento] = r.limites;
  const fijas = [...COBERTURAS_BASICAS, r.k === 'p' ? 'Gastos de entierro' : 'Secuelas o deformidades permanentes'];
  const elegida = r.opciones?.find((o) => o.id === r.opcion);
  const adicionales = elegida
    ? elegida.detalleOpcionales.map((d) => ({ nombre: d.nombre, prima: d.prima }))
    : r.lineas.filter((l) => normalizar(l.nombre) !== normalizar('Cobertura básica')).map((l) => ({ nombre: l.nombre, prima: 0 }));
  const primaAdicionales = adicionales.reduce((s, a) => s + a.prima, 0);
  return armar(cotizador, monedaSis2000(monedaRc), [
    { m: basica, concepto: basica.concepto, suma: porEvento, prima: r.prima - primaAdicionales },
    ...fijas.map((nombre) => ({ m: buscar(mapeo, nombre), concepto: nombre, suma: porTrabajador, prima: 0 })),
    ...adicionales.map((a) => ({ m: buscar(mapeo, a.nombre), concepto: a.nombre, suma: porTrabajador, prima: a.prima })),
  ], catalogo);
}

/** Lo que falta para emitir con prima informada (vacío = listo). */
export function faltantesEmisionRc(x: {
  emision: CoberturasEmision | null; valida: boolean; documento: string; cplan: string; apartamento: string;
}): string[] {
  const f: string[] = [];
  if (!x.valida || !x.emision) f.push('Revisa la cotización: tiene errores o no hay opción elegida.');
  const e = x.emision;
  if (e?.sinMapeo.length) f.push(`Sin cobertura equivalente en Sis2000: ${e.sinMapeo.join('; ')}.`);
  if (e && !(e.primaTotal > 0)) f.push('La prima total es 0: no se emite una póliza sin prima.');
  if (e && !e.lineas.some((l) => l.prima > 0)) f.push('Ninguna cobertura lleva prima.');
  if (e?.lineas.some((l) => !(l.suma > 0))) f.push('Hay coberturas con suma 0.');
  const rif = x.documento.replace(/\D/g, '');
  if (!rif || rif.length > 9) f.push('Indica el RIF o la cédula del tomador (hasta 9 dígitos) en el paso del tomador.');
  if (!x.cplan.trim()) f.push('Elige el plan contenedor.');
  if (e && pideUnidad(e.cramo) && !(Number(x.apartamento) > 0)) f.push(`En el ramo ${e.cramo} indica el número de apartamento o unidad.`);
  return f;
}

/**
 * Body de POST v1/riesgos-generales/emision en `modo: cotizador`: cada cobertura con su suma y su prima, la prima total
 * (= suma de las primas) y la cotización de origen. nest-api valida y no recalcula.
 */
export function armarEmisionInformada(
  x: Omit<DatosEmisionCoberturas, 'cot' | 'cramo'> & { emision: CoberturasEmision; ncotizacion: string },
) {
  const { emision: e } = x;
  const cot = {
    suma_asegurada: Math.max(0, ...e.lineas.map((l) => l.suma)), prima_total: e.primaTotal,
    coberturas: e.lineas.map((l) => ({ ccober: l.ccober, nombre: l.concepto, tasa: 0, suma: l.suma, prima: l.prima })), errores: {}, generales: [],
  };
  return {
    ...armarEmisionCoberturas({ ...x, cramo: e.cramo, cot }),
    modo: 'cotizador' as const,
    cotizador: e.cotizador,
    ncotizacion: x.ncotizacion.trim().slice(0, 40),
    prima_total: e.primaTotal,
    coberturas: e.lineas.map((l) => ({ ccober: l.ccober, ...(l.ctarifa ? { ctarifa: l.ctarifa } : {}), suma: l.suma, prima: l.prima })),
  };
}
