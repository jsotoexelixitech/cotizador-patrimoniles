// Combo de coberturas por ramo (acuerdo con La Mundial, 30-oct-2026): todas las coberturas con tarifa vigente
// del ramo (GET v1/riesgos-generales/coberturas?cramo), sin depender de un plan. Cada cobertura elegida lleva su
// suma dentro de sus topes; su prima es suma × tasa / 100 o, si no tiene tasa, la prima fija de Sis2000.
// Se emite con POST v1/riesgos-generales/emision en modo combo: un plan vigente del ramo hace de contenedor
// (moneda, cplan y regla de duplicados) y la póliza lleva las coberturas y sumas elegidas; nest-api recalcula la prima.
import { redondear } from './comun';
import { armarEmisionCoberturas, type CoberturaTarifa, type CotizacionCoberturas, type DatosEmisionCoberturas } from './coberturas';
import { errorDeRespuesta, type RamoCatalogo } from './planes-rcg';

/** Cobertura del ramo: la de la tarifa del plan sin suma por defecto, con moneda y prima fija. */
export interface CoberturaRamo extends Omit<CoberturaTarifa, 'msumaplan'> {
  cmoneda: string;
  /** Prima fija: aplica cuando la cobertura no tiene tasa (pprima 0). */
  mprima: number;
}

type Obj = Record<string, unknown>;

/** Básica ('1') primero y luego por código numérico, como las devuelve nest-api. */
const orden = (ccober: string) => (ccober === '1' ? -1 : Number.isFinite(Number(ccober)) ? Number(ccober) : Infinity);

/** GET v1/riesgos-generales/coberturas?cramo: una fila por cobertura (si se repite el código, vale la primera). */
export function parsearCoberturasRamo(body: unknown): CoberturaRamo[] {
  const error = errorDeRespuesta(body);
  if (error) throw new Error(error);
  let d = body as Obj | undefined;
  for (let i = 0; i < 3 && d && !Array.isArray(d.coberturas) && d.data; i++) d = d.data as Obj;
  if (!d || !Array.isArray(d.coberturas)) throw new Error('nest-api no devolvió las coberturas del ramo.');
  return (d.coberturas as Obj[])
    .map((c) => ({
      ccober: String(c.ccober ?? '').trim(),
      ctarifa: String(c.ctarifa ?? '').trim(),
      nombre: String(c.xcobertura ?? '').trim(),
      cmoneda: String(c.cmoneda ?? '$').trim(),
      obligatoria: c.obligatoria === true,
      pprima: Number(c.pprima ?? 0),
      mprima: Number(c.mprima ?? 0),
      msumamin: Number(c.msumamin ?? 0),
      msumamax: Number(c.msumamax ?? 0),
      pcomision: Number(c.pcomision ?? 0),
    }))
    .filter((c, i, todas) => c.ccober && todas.findIndex((x) => x.ccober === c.ccober) === i)
    .sort((a, b) => orden(a.ccober) - orden(b.ccober) || a.ccober.localeCompare(b.ccober));
}

/** Moneda del combo para mostrar: la de sus coberturas en Sis2000 ('$' = USD). */
export const monedaCombo = (catalogo: CoberturaRamo[]) => {
  const m = catalogo[0]?.cmoneda.trim() ?? '';
  return !m || m === '$' ? 'USD' : m;
};

const fmt = (n: number) => n.toLocaleString('es-VE');

/**
 * Cotiza el combo: `elegidas` = ccober → suma escrita. Las obligatorias entran siempre (sin suma, con error).
 * Prima = suma × tasa / 100 o la prima fija; ninguna adicional puede superar la suma de la básica ('1').
 */
export function cotizarCombo(catalogo: CoberturaRamo[], elegidas: Record<string, string>): CotizacionCoberturas {
  const errores: Record<string, string> = {};
  const coberturas = catalogo
    .filter((c) => c.obligatoria || elegidas[c.ccober] !== undefined)
    .map((c) => {
      const n = Number(elegidas[c.ccober] ?? '');
      const suma = Number.isFinite(n) ? redondear(n) : 0;
      if (!(suma > 0)) errores[c.ccober] = 'La suma debe ser mayor a 0.';
      else if (c.msumamin > 0 && suma < c.msumamin) errores[c.ccober] = `Mínimo ${fmt(c.msumamin)}.`;
      else if (c.msumamax > 0 && suma > c.msumamax) errores[c.ccober] = `Máximo ${fmt(c.msumamax)}.`;
      const prima = !(suma > 0) ? 0 : c.pprima > 0 ? redondear((suma * c.pprima) / 100) : c.mprima;
      return { ccober: c.ccober, nombre: c.nombre, tasa: c.pprima, suma, prima };
    });
  const basica = coberturas.find((c) => c.ccober === '1');
  if (basica && basica.suma > 0) {
    for (const c of coberturas) {
      if (c !== basica && !errores[c.ccober] && c.suma > basica.suma) errores[c.ccober] = `No puede superar la suma de la básica (${fmt(basica.suma)}).`;
    }
  }
  return {
    suma_asegurada: basica ? basica.suma : Math.max(0, ...coberturas.map((c) => c.suma)),
    prima_total: redondear(coberturas.reduce((s, c) => s + c.prima, 0)),
    coberturas,
    errores,
    generales: coberturas.length ? [] : ['Elige al menos una cobertura.'],
  };
}

/** Ramos donde Sis2000 exige número de apartamento o unidad (clave asegurado + plan + unidad). */
export const RAMOS_CON_UNIDAD = [28, 38];

export const pideUnidad = (cramo: number | null) => cramo != null && RAMOS_CON_UNIDAD.includes(cramo);

/** Plan contenedor del combo: un plan vigente del ramo en Sis2000 (valrep/planes/riesgos-generales). */
export interface PlanContenedor { cplan: string; xplan: string }

/** Planes vigentes del ramo para usar como contenedor, ordenados por código. */
export function planesContenedor(catalogo: RamoCatalogo[], cramo: number | null): PlanContenedor[] {
  const ramo = catalogo.find((r) => r.cramo === cramo);
  return (ramo?.planes ?? [])
    .map((p) => ({ cplan: p.cplan, xplan: p.xplan }))
    .sort((a, b) => a.cplan.localeCompare(b.cplan, 'es', { numeric: true }));
}

/** Lo que falta para poder emitir el combo (vacío = listo). */
export function faltantesEmisionCombo(x: { cramo: number | null; cplan: string; apartamento: string; valida: boolean; documento: string }): string[] {
  const f: string[] = [];
  if (!x.valida) f.push('Revisa las coberturas y sumas en el paso de cotización.');
  const rif = x.documento.replace(/\D/g, '');
  if (!rif || rif.length > 9) f.push('Indica el RIF o la cédula del tomador (hasta 9 dígitos) en el paso del tomador.');
  if (!x.cplan.trim()) f.push('Elige el plan contenedor.');
  if (pideUnidad(x.cramo) && !(Number(x.apartamento) > 0)) f.push(`En el ramo ${x.cramo} indica el número de apartamento o unidad.`);
  return f;
}

/**
 * Body de POST v1/riesgos-generales/emision en modo combo: las coberturas y sumas del combo con la tarifa de cada una
 * (la misma que mostró la cotización); `cplan` es el plan contenedor. La prima la recalcula nest-api.
 */
export function armarEmisionCombo(x: DatosEmisionCoberturas & { catalogo: CoberturaRamo[] }) {
  const tarifa = new Map(x.catalogo.map((c) => [c.ccober, c.ctarifa]));
  return {
    ...armarEmisionCoberturas(x),
    modo: 'combo' as const,
    coberturas: x.cot.coberturas.map((c) => ({ ccober: c.ccober, ...(tarifa.get(c.ccober) ? { ctarifa: tarifa.get(c.ccober) } : {}), suma: c.suma })),
  };
}
