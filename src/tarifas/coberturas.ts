// Cotización por coberturas de los ramos 16 (Combinado Empresarial) y 38 (Combinado Residencial), con el
// tarificador de nest-api (módulo condominio): cada cobertura del plan (maplantar) toma una fracción de la suma
// básica y su prima es suma × tasa de matarifa_d / 100. La emisión (condominio/emision con la cotización
// preestablecida) valida estos mismos valores contra el Core y los emite cobertura por cobertura.
import { redondear } from './comun';

export const RAMOS_COBERTURAS = [16, 38];
/** La cobertura básica es obligatoria y define la suma asegurada de la póliza. */
export const COBERTURA_BASICA = '1';

export interface CoberturaTarifa { ccober: string; ctarifa: string; nombre: string; msumamax: number }
export interface PlanTarifa { cplan: string; xplan: string; suma: number; coberturas: CoberturaTarifa[] }
export interface TasaCobertura { ccober: string; ctarifa: string; pprima: number; pcomision: number }

export interface CoberturaCotizada {
  ccober: string; ctarifa: string; nombre: string; tasa: number;
  suma_asegurada: number; prima_bruta: number; descuento: number; recargo: number; prima: number;
  pcomision: number; comision: number;
}
export interface CotizacionCoberturas { suma_asegurada: number; prima_total: number; coberturas: CoberturaCotizada[]; sinTasa: string[] }

type Obj = Record<string, unknown>;
const lista = (body: unknown, campo: string): Obj[] => {
  let d = body as Obj | undefined;
  for (let i = 0; i < 3 && d && !Array.isArray(d[campo]) && d.data; i++) d = d.data as Obj;
  return Array.isArray(d?.[campo]) ? (d![campo] as Obj[]) : [];
};

/** GET condominio/tarificador?cramo&cplan */
export function parsearTarificador(body: unknown, cplan: string): PlanTarifa | null {
  const p = lista(body, 'planes').find((x) => String(x.cplan ?? '').trim() === cplan.trim());
  if (!p) return null;
  return {
    cplan: String(p.cplan).trim(),
    xplan: String(p.xplan ?? '').trim(),
    suma: Number(p.suma_asegurada ?? 0),
    coberturas: (Array.isArray(p.coberturas) ? (p.coberturas as Obj[]) : []).map((c) => ({
      ccober: String(c.ccober ?? '').trim(),
      ctarifa: String(c.ctarifa ?? '').trim(),
      nombre: String(c.xcobertura ?? '').trim(),
      msumamax: Number(c.msumamax ?? 0),
    })),
  };
}

/** GET condominio/tarificador/tasas?cramo */
export const parsearTasas = (body: unknown): TasaCobertura[] => lista(body, 'tasas').map((t) => ({
  ccober: String(t.ccober ?? '').trim(),
  ctarifa: String(t.ctarifa ?? '').trim(),
  pprima: Number(t.pprima ?? 0),
  pcomision: Number(t.pcomision ?? 0),
}));

/**
 * Coberturas elegidas con la suma básica indicada: cada suma escala con la del plan (misma proporción que
 * maplantar) y la prima es suma × tasa / 100. La básica siempre va. Sin dispositivos ni sustancias
 * (descuento y recargo 0), igual que la validación de la cotización preestablecida.
 */
export function cotizarCoberturas(plan: PlanTarifa, tasas: TasaCobertura[], sumaBasica: number, elegidas: string[]): CotizacionCoberturas {
  const factor = plan.suma > 0 && sumaBasica > 0 ? sumaBasica / plan.suma : 0;
  const porCob = new Map(tasas.map((t) => [`${t.ccober}|${t.ctarifa}`, t]));
  const sinTasa: string[] = [];
  const coberturas = plan.coberturas
    .filter((c) => c.ccober === COBERTURA_BASICA || elegidas.includes(c.ccober))
    .flatMap((c) => {
      const t = porCob.get(`${c.ccober}|${c.ctarifa}`);
      if (!t) { sinTasa.push(c.nombre); return []; }
      const suma = c.ccober === COBERTURA_BASICA ? redondear(sumaBasica) : redondear(c.msumamax * factor);
      const bruta = redondear((suma * t.pprima) / 100);
      return [{
        ccober: c.ccober, ctarifa: c.ctarifa, nombre: c.nombre, tasa: t.pprima,
        suma_asegurada: suma, prima_bruta: bruta, descuento: 0, recargo: 0, prima: bruta,
        pcomision: t.pcomision, comision: redondear((bruta * t.pcomision) / 100),
      }];
    });
  return {
    suma_asegurada: redondear(sumaBasica),
    prima_total: redondear(coberturas.reduce((s, c) => s + c.prima, 0)),
    coberturas,
    sinTasa,
  };
}

/** Cotización preestablecida de condominio/emision (el Core la valida y emite sin recalcular). */
export const cotizacionPreestablecida = (c: CotizacionCoberturas) => ({
  suma_asegurada: c.suma_asegurada,
  prima_total: c.prima_total,
  descuento_pct: 0,
  recargo_pct: 0,
  coberturas: c.coberturas.map(({ ccober, ctarifa, suma_asegurada, prima_bruta, descuento, recargo, prima, pcomision, comision }) =>
    ({ ccober, ctarifa, suma_asegurada, prima_bruta, descuento, recargo, prima, pcomision, comision })),
});

export interface DatosEmisionCoberturas {
  cramo: number; cplan: string; cot: CotizacionCoberturas;
  tipoDoc: string; documento: string; nombre: string; apellido: string; correo: string; telefono: string; direccion: string;
  /** Bien o actividad asegurada (xdescrip1). */
  bien: string;
  /** Ramo 38: número de apartamento o unidad. */
  apartamento?: number;
  cproductor: number;
  fecha?: Date;
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Body de condominio/emision con la cotización preestablecida (anual, sin dispositivos ni sustancias). */
export function armarEmisionCoberturas(x: DatosEmisionCoberturas) {
  const hoy = x.fecha ?? new Date();
  const tipo = ['V', 'E', 'J', 'G', 'P'].includes(x.tipoDoc.trim().toUpperCase().charAt(0)) ? x.tipoDoc.trim().toUpperCase().charAt(0) : 'V';
  const rif = x.documento.replace(/\D/g, '');
  const persona = (rol: 'tomador' | 'asegurado') => ({
    [`tipo_cedula_${rol}`]: tipo, [`rif_${rol}`]: rif, [`nombre_${rol}`]: x.nombre.trim().toUpperCase(),
    [`apellido_${rol}`]: x.apellido.trim().toUpperCase(), [`direccion_${rol}`]: x.direccion.trim().slice(0, 60),
    [`telefono_${rol}`]: x.telefono.replace(/\D/g, ''), [`correo_${rol}`]: x.correo.trim(),
  });
  return {
    cramo: x.cramo,
    plan: x.cplan,
    frecuencia: 'A',
    fecha_emision: ymd(hoy),
    fdesde: ymd(hoy),
    cmoneda: '$',
    cotizacion: cotizacionPreestablecida(x.cot),
    xdirecob: x.direccion.trim().slice(0, 60),
    xdireccion: x.direccion.trim().slice(0, 60),
    xdescrip1: x.bien.trim().slice(0, 250),
    xdescrip2: x.direccion.trim().slice(0, 250),
    ...(x.apartamento ? { napartamento: x.apartamento } : {}),
    dispositivos: [],
    sustancias: [],
    ...persona('tomador'),
    ...persona('asegurado'),
    productor: x.cproductor,
  };
}
