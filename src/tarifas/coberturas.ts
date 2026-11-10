// Cotización por coberturas de los ramos 16 (Combinado Empresarial) y 38 (Combinado Residencial) con la ruta
// propia de nest-api (v1/riesgos-generales): cada cobertura elegida lleva su suma y su prima es
// suma × tasa de matarifa_d / 100. Este cálculo es solo para mostrarlo al momento: nest-api lo repite en
// /cotizacion y /emision (no acepta primas del cliente).
import { redondear } from './comun';

export const RAMOS_COBERTURAS = [16, 38];

export interface CoberturaTarifa {
  ccober: string; ctarifa: string; nombre: string;
  /** Suma de la cobertura en el plan: valor por defecto. */
  msumaplan: number;
  /** Tasa vigente de matarifa_d (%). */
  pprima: number;
  /** Topes de matarifa_d; 0 = sin tope. */
  msumamin: number; msumamax: number;
  obligatoria: boolean;
  pcomision: number;
}
export interface PlanTarifa { cplan: string; xplan: string; cmoneda: string; coberturas: CoberturaTarifa[] }

export interface CoberturaCotizada {
  ccober: string; nombre: string; tasa: number; suma: number; prima: number;
  /** Combo: cobertura sin tarifa en Sis2000 cuya tasa o prima escribió Técnico (vista técnica). */
  tecnica?: boolean;
  /** Combo de los ramos 27/28/37: prima con la tarifa oficial del cotizador (la básica la lleva, las demás en 0). */
  oficial?: boolean;
}
export interface CotizacionCoberturas {
  suma_asegurada: number; prima_total: number; coberturas: CoberturaCotizada[];
  /** Errores por cobertura (ccober → mensaje) y generales. */
  errores: Record<string, string>; generales: string[];
}

type Obj = Record<string, unknown>;

/** GET v1/riesgos-generales/tarifa?cramo&cplan */
export function parsearTarifa(body: unknown): PlanTarifa | null {
  let d = body as Obj | undefined;
  for (let i = 0; i < 3 && d && !Array.isArray(d.coberturas) && d.data; i++) d = d.data as Obj;
  if (!d || !Array.isArray(d.coberturas)) return null;
  return {
    cplan: String(d.cplan ?? '').trim(),
    xplan: String(d.xplan ?? '').trim(),
    cmoneda: String(d.cmoneda ?? '$').trim(),
    coberturas: (d.coberturas as Obj[]).map((c) => ({
      ccober: String(c.ccober ?? '').trim(),
      ctarifa: String(c.ctarifa ?? '').trim(),
      nombre: String(c.xcobertura ?? '').trim(),
      msumaplan: Number(c.msumaplan ?? 0),
      pprima: Number(c.pprima ?? 0),
      msumamin: Number(c.msumamin ?? 0),
      msumamax: Number(c.msumamax ?? 0),
      obligatoria: c.obligatoria === true,
      pcomision: Number(c.pcomision ?? 0),
    })),
  };
}

/** Suma elegida de una cobertura: la escrita o, si no hay, la del plan. */
export const sumaDe = (c: CoberturaTarifa, sumas: Record<string, string>) =>
  sumas[c.ccober] === undefined || sumas[c.ccober] === '' ? c.msumaplan : Number(sumas[c.ccober]);

/** Coberturas marcadas: las obligatorias siempre; `elegidas` null = todas las del plan. */
export const marcadas = (plan: PlanTarifa, elegidas: string[] | null) =>
  plan.coberturas.filter((c) => c.obligatoria || elegidas === null || elegidas.includes(c.ccober));

/** Mismas reglas que nest-api (riesgos-generales.calculo.ts). */
export function cotizarCoberturas(plan: PlanTarifa, elegidas: string[] | null, sumas: Record<string, string>): CotizacionCoberturas {
  const errores: Record<string, string> = {};
  const coberturas = marcadas(plan, elegidas).map((c) => {
    const suma = redondear(sumaDe(c, sumas));
    if (!(suma > 0)) errores[c.ccober] = 'La suma debe ser mayor a 0.';
    else if (c.msumamin > 0 && suma < c.msumamin) errores[c.ccober] = `Mínimo ${c.msumamin}.`;
    else if (c.msumamax > 0 && suma > c.msumamax) errores[c.ccober] = `Máximo ${c.msumamax}.`;
    else if (!(c.pprima > 0)) errores[c.ccober] = 'Sin tasa vigente en Sis2000.';
    return { ccober: c.ccober, nombre: c.nombre, tasa: c.pprima, suma, prima: redondear((suma * c.pprima) / 100) };
  });
  const basica = coberturas.find((c) => c.ccober === '1');
  return {
    suma_asegurada: basica ? basica.suma : Math.max(0, ...coberturas.map((c) => c.suma)),
    prima_total: redondear(coberturas.reduce((s, c) => s + c.prima, 0)),
    coberturas,
    errores,
    generales: coberturas.length ? [] : ['Elige al menos una cobertura.'],
  };
}

export interface DatosEmisionCoberturas {
  cramo: number; cplan: string; cot: CotizacionCoberturas;
  tipoDoc: string; documento: string; nombre: string; apellido: string; correo: string; telefono: string; direccion: string;
  /** Bien o actividad asegurada (xdescrip1). */
  bien: string;
  /** Ramo 38: número de apartamento o unidad. */
  apartamento?: number;
  cproductor: number;
}

/** Body de POST v1/riesgos-generales/emision: solo coberturas y sumas; la prima la calcula nest-api. */
export function armarEmisionCoberturas(x: DatosEmisionCoberturas) {
  const tipo = ['V', 'E', 'J', 'G', 'P'].includes(x.tipoDoc.trim().toUpperCase().charAt(0)) ? x.tipoDoc.trim().toUpperCase().charAt(0) : 'V';
  const persona = {
    tipo_cedula: tipo,
    rif: x.documento.replace(/\D/g, ''),
    nombre: x.nombre.trim().toUpperCase(),
    apellido: x.apellido.trim().toUpperCase(),
    direccion: x.direccion.trim(),
    telefono: x.telefono.replace(/\D/g, ''),
    correo: x.correo.trim(),
  };
  return {
    cramo: x.cramo,
    cplan: x.cplan,
    coberturas: x.cot.coberturas.map((c) => ({ ccober: c.ccober, suma: c.suma })),
    tomador: persona,
    bien: x.bien.trim().slice(0, 250),
    direccion_riesgo: x.direccion.trim(),
    ...(x.apartamento ? { apartamento: x.apartamento } : {}),
    productor: x.cproductor,
  };
}
