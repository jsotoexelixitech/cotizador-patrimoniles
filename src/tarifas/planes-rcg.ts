// Planes de riesgos generales de Sis2000 (ramos con ctiporamo 1 y 6), leídos de nest-api
// (GET valrep/planes/riesgos-generales): los planes que La Mundial cree aparecen sin cambiar código.
// Sis2000 cotiza con spCalculoRiesgoGeneral (suma y prima fijas por cobertura en maplantar) y emite con la
// suma y la prima del plan: el trigger Emision_Riesgos pisa las que se envían. En el ramo 28 (RCG) la prima
// de tarifa RCG (suma del plan × tasa de la clase) es solo de referencia mientras La Mundial no cambie eso.
import { redondear } from './comun';
import { PARAMETROS_RCG, type ParametrosRcg } from './rcg';

export const RAMO_RCG = 28;

/** La Mundial no cotiza Naves (20) ni Riesgos Especiales (25) por este canal (28-oct-2026). */
export const RAMOS_EXCLUIDOS = [20, 25];

/** BINAC* son de RCV binacional (su propio flujo); IGEMA es exclusivo del productor 1051 en mausuplan. */
export const PLANES_EXCLUIDOS: Record<number, string[]> = { 28: ['BINAC', 'BINACA', 'BINACB', 'IGEMA'] };

/** Fila del catálogo de nest-api. `cotizable` = tiene coberturas con suma en maplantar. */
export interface PlanCatalogo {
  cramo: number; xramo: string; cplan: string; xplan: string; cproducto: string | null;
  qcoberturas: number; msumamax: number; mprima: number; cotizable: boolean;
}
export interface RamoCatalogo { cramo: number; xramo: string; planes: PlanCatalogo[] }

/** `ccober`: código de Sis2000, solo si la respuesta de la cotización lo trae. */
export interface CoberturaPlan { nombre: string; suma: number; prima: number; ccober?: string }
export interface PlanSis2000 { cramo: number; cplan: string; nombre: string; suma: number; prima: number; coberturas: CoberturaPlan[] }
export interface PrimaTarifaPlan { cplan: string; prima: number; primaMinimaAplicada: boolean }
export interface ResultadoEmision { cnpoliza: string; cnrecibo: string; urlpoliza: string }

type Obj = Record<string, unknown>;
const esObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/** Mensaje de error de la respuesta (nest-api o paquete patrimonial: status false con HTTP 2xx). */
export function errorDeRespuesta(body: unknown): string | null {
  for (let d = body, i = 0; esObj(d) && i < 4; d = d.data, i++) {
    if (d.status === false) {
      const m = d.message ?? d.error;
      return (Array.isArray(m) ? m.join('; ') : String(m ?? '')) || 'La API respondió sin éxito.';
    }
  }
  return null;
}

/** Quita los envoltorios { status, data } hasta llegar al contenido. */
function desenvolver(body: unknown, listo: (d: unknown) => boolean): unknown {
  let d = body;
  for (let i = 0; i < 4 && !listo(d) && esObj(d) && 'data' in d; i++) d = d.data;
  return d;
}

/**
 * Respuesta de valrep/planes/riesgos-generales agrupada por ramo, sin los planes excluidos. Con `conRamosExcluidos`
 * conserva los ramos 20 y 25 (planes contenedores del combo, que se emite en cualquier ramo habilitado en nest-api).
 */
export function parsearCatalogo(body: unknown, { conRamosExcluidos = false } = {}): RamoCatalogo[] {
  const error = errorDeRespuesta(body);
  if (error) throw new Error(error);
  const d = desenvolver(body, Array.isArray);
  const ramos = new Map<number, RamoCatalogo>();
  for (const f of (Array.isArray(d) ? d : []).filter(esObj)) {
    const cramo = Number(f.cramo);
    const cplan = String(f.cplan ?? '').trim();
    if (!cramo || !cplan || (!conRamosExcluidos && RAMOS_EXCLUIDOS.includes(cramo)) || PLANES_EXCLUIDOS[cramo]?.includes(cplan)) continue;
    const ramo = ramos.get(cramo) ?? { cramo, xramo: String(f.xramo ?? '').trim() || `Ramo ${cramo}`, planes: [] };
    ramo.planes.push({
      cramo, xramo: ramo.xramo, cplan, xplan: String(f.xplan ?? '').trim() || cplan,
      cproducto: f.cproducto ? String(f.cproducto).trim() : null, qcoberturas: Number(f.qcoberturas ?? 0),
      msumamax: Number(f.msumamax ?? 0), mprima: Number(f.mprima ?? 0), cotizable: f.cotizable === true,
    });
    ramos.set(cramo, ramo);
  }
  return [...ramos.values()];
}

/** Respuesta de partner/starter/patrimonial/quote: una fila por cobertura del plan. */
export function parsearCotizacionPlan(cramo: number, cplan: string, nombre: string, body: unknown): PlanSis2000 {
  const error = errorDeRespuesta(body);
  if (error) throw new Error(error);
  const d = desenvolver(body, Array.isArray);
  const filas = (Array.isArray(d) ? d : esObj(d) ? [d] : []).filter(esObj);
  if (!filas.length) throw new Error(`Sis2000 no devolvió coberturas para ${cplan}.`);
  const coberturas = filas.map((f) => ({
    nombre: String(f.xcobertura ?? '').trim(),
    suma: Number(f.msumaasegext ?? f.msumaaseg ?? 0),
    prima: Number(f.mprimaext ?? 0),
    ...(f.ccober != null && String(f.ccober).trim() ? { ccober: String(f.ccober).trim() } : {}),
  }));
  return {
    cramo,
    cplan,
    nombre,
    // Mismo criterio que el trigger de emisión: suma = la mayor de las coberturas, prima = la suma de todas.
    suma: Math.max(...coberturas.map((c) => c.suma)),
    prima: redondear(coberturas.reduce((t, c) => t + c.prima, 0)),
    coberturas: coberturas.filter((c) => c.nombre),
  };
}

/**
 * Prima de tarifa RCG para cada plan, misma fórmula que alternativasRcg en USD: suma × tasa / 100,
 * con mínimo proporcional a la suma del primer plan (equivale a la opción I).
 */
export function primasTarifaRcg(planes: { cplan: string; suma: number }[], tasa: number, p: ParametrosRcg = PARAMETROS_RCG): PrimaTarifaPlan[] {
  const base = planes[0]?.suma || 1;
  return planes.map(({ cplan, suma }) => {
    const minimo = p.primaMinimaDivisa * (suma / base);
    const calculada = (suma * tasa) / 100;
    return { cplan, prima: redondear(Math.max(calculada, minimo)), primaMinimaAplicada: calculada < minimo };
  });
}

/** Respuesta de partner/starter/patrimonial/emit. */
export function parsearEmision(body: unknown): ResultadoEmision {
  const error = errorDeRespuesta(body);
  if (error) throw new Error(error);
  const d = desenvolver(body, (x) => esObj(x) && 'cnpoliza' in x);
  const o = esObj(d) ? d : {};
  const cnpoliza = String(o.cnpoliza ?? '').trim();
  if (!cnpoliza) throw new Error('Sis2000 no devolvió el número de póliza.');
  return { cnpoliza, cnrecibo: String(o.cnrecibo ?? '').trim(), urlpoliza: String(o.urlpoliza ?? '').trim() };
}

export interface DatosEmisionPlan {
  plan: PlanSis2000;
  tipoDoc: string;
  documento: string;
  nombre: string;
  apellido: string;
  correo: string;
  telefono: string;
  direccion: string;
  /** xdescrip1..4 del bien asegurado. */
  bien: [string, string, string, string];
  pep: boolean;
  cproductor: number;
  fecha?: Date;
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const tipoCedula = (v: string) => {
  const s = v.trim().toUpperCase().charAt(0);
  return ['V', 'E', 'J', 'G'].includes(s) ? s : 'V';
};

/** Mismo payload que arma Emisión (patrimonialMapper.mapWizardToGeneralRisksEmitDto). */
export function armarEmisionPlan(x: DatosEmisionPlan) {
  const hoy = x.fecha ?? new Date();
  const hasta = new Date(hoy.getFullYear() + 1, hoy.getMonth(), hoy.getDate());
  const persona = {
    tipo: tipoCedula(x.tipoDoc),
    rif: Number(x.documento.replace(/\D/g, '')) || null,
    nombre: x.nombre.trim().toUpperCase(),
    apellido: x.apellido.trim().toUpperCase(),
    telefono: x.telefono.replace(/\D/g, ''),
    correo: x.correo.trim(),
    direccion: x.direccion.trim(),
  };
  return {
    keys: { cnpoliza_rel: null, cplan: x.plan.cplan, cramo: x.plan.cramo },
    tomador: {
      tipo_tomador: persona.tipo, rif_tomador: persona.rif, nombre_tomador: persona.nombre, apellido_tomador: persona.apellido,
      sexo_tomador: 'M', estado_civil_tomador: 'S', fnac_tomador: null, telefono_tomador: persona.telefono,
      correo_tomador: persona.correo, estado_tomador: '', ciudad_tomador: '', direccion_tomador: persona.direccion,
    },
    asegurado: {
      tipo_asegurado: persona.tipo, rif_asegurado: persona.rif, nombre_asegurado: persona.nombre, apellido_asegurado: persona.apellido,
      sexo_asegurado: 'M', estado_civil_asegurado: 'S', fnac_asegurado: null, telefono_asegurado: persona.telefono,
      correo_asegurado: persona.correo, estado_asegurado: '', ciudad_asegurado: '', direccion_asegurado: persona.direccion,
    },
    bien_asegurado: {
      xdescrip1: x.bien[0].trim().slice(0, 250), xdescrip2: x.bien[1].trim().slice(0, 250),
      xdescrip3: x.bien[2].trim().slice(0, 250), xdescrip4: x.bien[3].trim().slice(0, 250),
    },
    // Sis2000 los reemplaza por los del plan; se envían iguales para que el registro sea coherente.
    suma_asegurada: x.plan.suma,
    prima: x.plan.prima,
    // Sin tasa: el trigger toma la de mamonedas según la moneda del plan.
    ptasamon: null,
    femision: ymd(hoy),
    fdesde: ymd(hoy),
    fhasta: ymd(hasta),
    dec_persona_politica: x.pep ? 1 : 0,
    dec_term_y_cod: 1,
    cproductor: x.cproductor,
    ifrecuencia: 'A',
    ctipocanal: null,
    ccanalalt: null,
    cscanalalt: null,
    xfuente: 'API',
  };
}
