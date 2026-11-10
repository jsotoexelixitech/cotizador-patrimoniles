import { useMemo } from 'react';
import { create } from 'zustand';
import { numeroONulo } from '../tarifas/comun';
import { RAMO_RCG } from '../tarifas/planes-rcg';
import { actividadRestringida, cotizarRcg, tasaPromedio, type MonedaRcg, type ParametrosRcg, type SolicitudRcg } from '../tarifas/rcg';
import {
  cotizarRc, opcionalesDe, type BaseNomina, type IdOpcion, type Modo, type MonedaRc, type ProductoEntrada, type SolicitudRc,
} from '../tarifas/rcp-rce';
import { useParametrosStore } from './parametrosStore';
import type { PrimaTecnica } from '../tarifas/combo';

/**
 * planes = planes de riesgos generales de Sis2000 (en el ramo 28, con las reglas del RCG);
 * combo = coberturas de un ramo elegidas una a una (solo cotiza).
 */
export type Producto = 'rcg' | 'rc' | 'planes' | 'combo';
export type K = 'p' | 'e';

export interface ProductoForm {
  tasa: string;
  ajuste: string;
  opcion: IdOpcion;
  /** USD/EUR: RCP = [médica, hernia]; RCE = [negligencia, defensa, médica]. */
  adicionales: boolean[];
  /** Bs: coberturas opcionales por tasa (TARIFA[k].options). */
  opcionalesVes: { seleccionada: boolean; tasa: string; limite: string; grupo: string }[];
}

export interface CotizacionState {
  producto: Producto | null;
  comun: {
    asegurado: string; tipoDoc: string; documento: string; correo: string; intermediario: string; ubicacion: string;
    sucursal: string; emisor: string; correoEmisor: string;
    /** Solo para emitir planes en Sis2000 (apartamento: ramo 38, clave cédula + plan + unidad). */
    apellido: string; telefono: string; apartamento: string;
  };
  contrato: { esContrato: boolean; numero: string; objeto: string; coasegurado: string; vigencia: string };
  rcg: { moneda: MonedaRcg; clase: number; indole: string; actividadEspecifica: string; limite: string; tasa: string; condiciones: number[]; opcion: 'I' | 'II' | 'III' };
  /** Ramo y plan Sis2000 elegidos en la opción planes. */
  ramoSel: number | null;
  planSel: string;
  /** Ramos 16 y 38: suma escrita por cobertura (ccober → monto) y coberturas elegidas (null = todas las del plan). */
  coberturas: { sumas: Record<string, string>; elegidas: string[] | null };
  /** Combo: ramo elegido y el combo armado en cada ramo (ccober → suma escrita; las obligatorias entran siempre). */
  ramoCombo: number | null;
  combos: Record<number, Record<string, string>>;
  /** Combo con vista técnica: tasa o prima de Técnico para las coberturas sin tarifa (cramo → ccober → valores). */
  tecnicoCombo: Record<number, Record<string, PrimaTecnica>>;
  rc: {
    modo: Modo; moneda: MonedaRc; tasaBcv: string; base: BaseNomina; monto: string; empleados: string;
    claseSel: string; claseRelacionada: string; actividad: string; indole: string; p: ProductoForm; e: ProductoForm;
  };
  setProducto: (p: Producto) => void;
  setComun: (c: Partial<CotizacionState['comun']>) => void;
  setContrato: (c: Partial<CotizacionState['contrato']>) => void;
  setRcg: (c: Partial<CotizacionState['rcg']>) => void;
  setRc: (c: Partial<CotizacionState['rc']>) => void;
  setRcProducto: (k: K, c: Partial<ProductoForm>) => void;
  setRamoSel: (cramo: number) => void;
  setPlanSel: (cplan: string) => void;
  setCoberturas: (c: Partial<CotizacionState['coberturas']>) => void;
  setRamoCombo: (cramo: number) => void;
  setCombo: (cramo: number, elegidas: Record<string, string>) => void;
  setTecnicoCombo: (cramo: number, ccober: string, v: PrimaTecnica) => void;
  reset: () => void;
}

const productoInicial = (k: K): ProductoForm => ({
  tasa: '', ajuste: '0', opcion: 'I', adicionales: k === 'p' ? [false, false] : [false, false, false],
  opcionalesVes: opcionalesDe(k, useParametrosStore.getState().rc).map((o) => ({
    seleccionada: false, tasa: String(o[1]), limite: /m[eé]dic/i.test(o[0]) ? '1000' : '650', grupo: '2000',
  })),
});

const inicial = () => ({
  producto: null,
  comun: { asegurado: '', tipoDoc: 'J', documento: '', correo: '', intermediario: '', ubicacion: '', sucursal: '', emisor: '', correoEmisor: '', apellido: '', telefono: '', apartamento: '' },
  contrato: { esContrato: false, numero: '', objeto: '', coasegurado: '', vigencia: 'Anual' },
  rcg: { moneda: 'USD' as MonedaRcg, clase: 0, indole: '', actividadEspecifica: '', limite: '', tasa: useParametrosStore.getState().rcg.clases[0] ? String(tasaPromedio(useParametrosStore.getState().rcg.clases[0])) : '', condiciones: [], opcion: 'I' as const },
  ramoSel: null as number | null,
  planSel: '',
  coberturas: { sumas: {} as Record<string, string>, elegidas: null as string[] | null },
  ramoCombo: null as number | null,
  combos: {} as Record<number, Record<string, string>>,
  tecnicoCombo: {} as Record<number, Record<string, PrimaTecnica>>,
  rc: {
    modo: 'both' as Modo, moneda: 'USD' as MonedaRc, tasaBcv: '', base: 'employee' as BaseNomina, monto: '', empleados: '',
    claseSel: '', claseRelacionada: '', actividad: '', indole: '', p: productoInicial('p'), e: productoInicial('e'),
  },
});

export const useCotizacionStore = create<CotizacionState>((set) => ({
  ...inicial(),
  setProducto: (producto) => set({ producto }),
  setComun: (c) => set((s) => ({ comun: { ...s.comun, ...c } })),
  setContrato: (c) => set((s) => ({ contrato: { ...s.contrato, ...c } })),
  setRcg: (c) => set((s) => ({ rcg: { ...s.rcg, ...c } })),
  setRc: (c) => set((s) => ({ rc: { ...s.rc, ...c } })),
  setRcProducto: (k, c) => set((s) => ({ rc: { ...s.rc, [k]: { ...s.rc[k], ...c } } })),
  setRamoSel: (ramoSel) => set((s) => (s.ramoSel === ramoSel ? {} : { ramoSel, planSel: '', coberturas: { sumas: {}, elegidas: null } })),
  setPlanSel: (planSel) => set((s) => (s.planSel === planSel ? {} : { planSel, coberturas: { sumas: {}, elegidas: null } })),
  setCoberturas: (c) => set((s) => ({ coberturas: { ...s.coberturas, ...c } })),
  setRamoCombo: (ramoCombo) => set({ ramoCombo }),
  setCombo: (cramo, elegidas) => set((s) => ({ combos: { ...s.combos, [cramo]: elegidas } })),
  setTecnicoCombo: (cramo, ccober, v) => set((s) => ({
    tecnicoCombo: { ...s.tecnicoCombo, [cramo]: { ...(s.tecnicoCombo[cramo] ?? {}), [ccober]: { ...(s.tecnicoCombo[cramo]?.[ccober] ?? {}), ...v } } },
  })),
  reset: () => set(inicial()),
}));

export const rifCompleto = (c: CotizacionState['comun']) => (c.documento ? `${c.tipoDoc}-${c.documento}` : '');

function solicitudRcg(s: CotizacionState): SolicitudRcg {
  const { comun: c, contrato: k, rcg: r } = s;
  return {
    sucursal: c.sucursal, usuario: c.emisor, correoUsuario: c.correoEmisor, asegurado: c.asegurado, rif: rifCompleto(c),
    correoDestinatario: c.correo, intermediario: c.intermediario, ubicacion: c.ubicacion, moneda: r.moneda, clase: r.clase,
    indole: r.indole, actividadEspecifica: r.actividadEspecifica, esContrato: k.esContrato, numeroContrato: k.numero,
    objetoObra: k.objeto, coasegurado: k.coasegurado, limite: numeroONulo(r.limite), tasa: numeroONulo(r.tasa), condiciones: r.condiciones,
  };
}

const aEntrada = (x: ProductoForm): ProductoEntrada => ({
  tasa: numeroONulo(x.tasa), ajuste: numeroONulo(x.ajuste), opcion: x.opcion, adicionales: x.adicionales,
  opcionalesVes: x.opcionalesVes.map((o) => ({ seleccionada: o.seleccionada, tasa: numeroONulo(o.tasa), limite: o.limite, grupo: numeroONulo(o.grupo) })),
});

export const claseRc = (rc: CotizacionState['rc']): number | null => {
  const t = rc.claseSel === 'other' ? rc.claseRelacionada : rc.claseSel;
  return t === '' ? null : Number(t);
};

function solicitudRc(s: CotizacionState): SolicitudRc {
  const { comun: c, contrato: k, rc } = s;
  return {
    modo: rc.modo, moneda: rc.moneda, tasaBcv: numeroONulo(rc.tasaBcv), base: rc.base, monto: numeroONulo(rc.monto),
    empleados: numeroONulo(rc.empleados), clase: claseRc(rc), otraClase: rc.claseSel === 'other',
    actividad: rc.actividad === '' ? null : Number(rc.actividad), indole: rc.indole,
    asegurado: c.asegurado, rif: rifCompleto(c), correo: c.correo, direccion: c.ubicacion, sucursal: c.sucursal,
    emisor: c.emisor, correoEmisor: c.correoEmisor, intermediario: c.intermediario,
    esContrato: k.esContrato, numeroContrato: k.numero, vigenciaContrato: k.vigencia, objetoContrato: k.objeto,
    p: aEntrada(rc.p), e: aEntrada(rc.e),
  };
}

export function useCotizacionRcg() {
  const s = useCotizacionStore();
  const p = useParametrosStore((x) => x.rcg);
  return useMemo(() => cotizarRcg(solicitudRcg(s), p), [s.comun, s.contrato, s.rcg, p]); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * Planes Sis2000 con las reglas del RCG: mismas validaciones (tomador, clase, índole, actividad, contrato),
 * en USD y con la suma del primer plan como límite de la opción I.
 */
export function useCotizacionPlanesRcg(sumaBase: number | undefined) {
  const s = useCotizacionStore();
  const p = useParametrosStore((x) => x.rcg);
  return useMemo(
    () => cotizarRcg({ ...solicitudRcg(s), moneda: 'USD', limite: sumaBase ?? p.limiteMin }, p),
    [s.comun, s.contrato, s.rcg, p, sumaBase], // eslint-disable-line react-hooks/exhaustive-deps
  );
}

export function useCotizacionRc() {
  const s = useCotizacionStore();
  const p = useParametrosStore((x) => x.rc);
  return useMemo(() => cotizarRc(solicitudRc(s), p), [s.comun, s.contrato, s.rc, p]); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * Actividad restringida (petróleo, minería, astilleros…): no bloquea; la cotización queda sujeta a la mesa técnica.
 * RCG y planes del ramo 28 eligen índole; los demás ramos y el combo solo describen la actividad. RC no tiene restringidas.
 */
export function sujetaAMesaTecnica(s: Pick<CotizacionState, 'producto' | 'ramoSel' | 'rcg'>, p: ParametrosRcg): boolean {
  if (!s.producto || s.producto === 'rc') return false;
  const conIndole = s.producto === 'rcg' || (s.producto === 'planes' && s.ramoSel === RAMO_RCG);
  return (conIndole && actividadRestringida(s.rcg.indole, p)) || actividadRestringida(s.rcg.actividadEspecifica, p);
}

export function useMesaTecnica() {
  const producto = useCotizacionStore((s) => s.producto);
  const ramoSel = useCotizacionStore((s) => s.ramoSel);
  const rcg = useCotizacionStore((s) => s.rcg);
  const p = useParametrosStore((x) => x.rcg);
  return useMemo(() => sujetaAMesaTecnica({ producto, ramoSel, rcg }, p), [producto, ramoSel, rcg, p]);
}
