// JSON de la cotización que se guarda en Exélixi Nexus (cotizaciones-rc): lo que ve el cliente al traerla por código
// (tomador, riesgo, opciones I/II/III con suma y prima, coberturas), el descuento aplicado, el estado del cotizador
// para reabrirla y, por opción, el body de emisión ya armado: con el pago confirmado Nexus emite con ese body, sin
// pasar por el navegador del cliente.
import type { CotizacionState } from '../store/cotizacionStore';
import { rifCompleto } from '../store/cotizacionStore';
import { pideUnidad, planesContenedor, type CoberturaRamo } from '../tarifas/combo';
import { PLAN_RCG_POR_OPCION, RAMOS_RC } from '../tarifas/data/mapeo-sis2000';
import { armarEmisionInformada, coberturasRcg, faltantesEmisionRc } from '../tarifas/emision-rc';
import type { RamoCatalogo } from '../tarifas/planes-rcg';
import type { AlternativaRcg, CotizacionRcg } from '../tarifas/rcg';
import { NOMBRES, type CotizacionRc, type IdOpcion } from '../tarifas/rcp-rce';

export type Opcion = 'I' | 'II' | 'III';
export type ProductoGuardado = 'rcg' | 'rcp' | 'rce' | 'rc';

export interface AlternativaGuardada {
  opcion: Opcion;
  limite: number;
  prima: number;
  primaMinimaAplicada?: boolean;
  /** Descuento por suma (Parámetros) que lleva la opción: solo para la vista técnica. */
  descuentoPct?: number;
  tasaInicial?: number;
  tasaAplicada?: number;
  /** RCP / RCE: prima de cada producto dentro de la opción. */
  detalle?: { nombre: string; prima: number }[];
}

/** Lo que hace falta del cotizador para reabrir la cotización tal como se dejó. */
export type EstadoCotizador = Pick<CotizacionState, 'producto' | 'comun' | 'contrato' | 'rcg' | 'rc'>;

export interface DatosCotizacion {
  version: 1;
  producto: ProductoGuardado;
  nombreProducto: string;
  tomador: { nombre: string; tipoDoc: string; documento: string; rif: string; correo: string; telefono: string; ubicacion: string };
  riesgo: { indole: string; actividad: string; esContrato: boolean; contrato?: string };
  moneda: string;
  opcionElegida: Opcion | null;
  alternativas: AlternativaGuardada[];
  coberturas: { nombre: string; montos: number[] }[];
  deducible: string;
  condiciones: string[];
  notaIgtf: boolean;
  mesaTecnica: boolean;
  vigenciaDias: number;
  /** Body de POST riesgos-generales/emision (modo cotizador) por opción. Sin él, la opción no se paga en línea. */
  emisiones?: Partial<Record<Opcion, unknown>>;
  /** Por qué no se puede pagar en línea (vacío = se puede). */
  sinPagoEnLinea: string[];
  estado: EstadoCotizador;
}

const estadoDe = (s: EstadoCotizador): EstadoCotizador => ({ producto: s.producto, comun: s.comun, contrato: s.contrato, rcg: s.rcg, rc: s.rc });

const tomadorDe = (s: EstadoCotizador): DatosCotizacion['tomador'] => ({
  nombre: s.comun.asegurado.trim(), tipoDoc: s.comun.tipoDoc, documento: s.comun.documento, rif: rifCompleto(s.comun),
  correo: s.comun.correo.trim(), telefono: s.comun.telefono, ubicacion: s.comun.ubicacion,
});

const contratoDe = (s: EstadoCotizador) => (s.contrato.esContrato
  ? { contrato: [s.contrato.numero, s.contrato.objeto].filter(Boolean).join(' · ') } : {});

const alternativaRcg = (a: AlternativaRcg): AlternativaGuardada => ({
  opcion: a.opcion, limite: a.limite, prima: a.prima, primaMinimaAplicada: a.primaMinimaAplicada,
  ...(a.descuentoPct != null ? { descuentoPct: a.descuentoPct, tasaInicial: a.tasaInicial, tasaAplicada: a.tasaAplicada } : {}),
});

/**
 * Plan contenedor del ramo 28 para la opción: el configurado (VITE_RCG_PLAN_CONTENEDOR), el sugerido de la opción
 * (PLANI / PLANII / PLAN3) o el único vigente. '' si no hay ninguno claro: esa opción no se paga en línea.
 */
export function planContenedorRcg(contenedores: RamoCatalogo[] | null, opcion: Opcion, configurado = ''): string {
  const planes = planesContenedor(contenedores ?? [], RAMOS_RC.rcg);
  const hay = (cplan: string) => !!cplan && planes.some((p) => p.cplan === cplan);
  if (hay(configurado.trim())) return configurado.trim();
  if (hay(PLAN_RCG_POR_OPCION[opcion])) return PLAN_RCG_POR_OPCION[opcion];
  return planes.length === 1 ? planes[0].cplan : '';
}

export interface ContextoEmision {
  /** Coberturas del ramo 28 en Sis2000 (GET riesgos-generales/coberturas); null = no se pudieron leer. */
  catalogo: CoberturaRamo[] | null;
  contenedores: RamoCatalogo[] | null;
  planConfigurado?: string;
  cproductor: number;
  esPersonaNatural: boolean;
}

/** RCG: cotización completa con las tres opciones y, si se puede, el body de emisión de cada una. */
export function datosCotizacionRcg(
  s: EstadoCotizador, cot: CotizacionRcg, x: { mesaTecnica: boolean; vigenciaDias: number; emision: ContextoEmision },
): DatosCotizacion {
  const c = s.comun;
  // Quién elabora la cotización no afecta a la emisión (en la vista cliente esos campos ni se piden).
  const valida = !Object.keys(cot.errores).some((k) => !['sucursal', 'usuario', 'correoUsuario'].includes(k));
  const sinPagoEnLinea: string[] = [];
  const emisiones: Partial<Record<Opcion, unknown>> = {};
  if (x.mesaTecnica) sinPagoEnLinea.push('La actividad está sujeta a aprobación de la mesa técnica.');
  else if (!x.emision.catalogo) sinPagoEnLinea.push('No se pudieron verificar las coberturas del ramo en Sis2000.');
  else {
    const unidad = pideUnidad(RAMOS_RC.rcg) ? Number(c.apartamento) || 1 : undefined;
    for (const a of cot.alternativas) {
      const emision = coberturasRcg(cot, a.opcion, s.rcg.moneda, x.emision.catalogo);
      const cplan = planContenedorRcg(x.emision.contenedores, a.opcion, x.emision.planConfigurado);
      const faltan = faltantesEmisionRc({ emision, valida, documento: c.documento, cplan, apartamento: String(unidad ?? ''), direccion: c.ubicacion });
      if (!emision || faltan.length) {
        sinPagoEnLinea.push(`Opción ${a.opcion}: ${faltan.join(' ') || 'sin datos de emisión.'}`);
        continue;
      }
      emisiones[a.opcion] = armarEmisionInformada({
        // El número lo pone Nexus al emitir (el código de la cotización).
        cplan, emision, ncotizacion: 'COTIZACION', tipoDoc: c.tipoDoc, documento: c.documento, nombre: c.asegurado,
        apellido: x.emision.esPersonaNatural ? c.apellido : '', correo: c.correo, telefono: c.telefono, direccion: c.ubicacion,
        bien: [s.rcg.indole, s.rcg.actividadEspecifica].filter(Boolean).join(' · ') || c.asegurado,
        apartamento: unidad, cproductor: x.emision.cproductor,
      });
    }
  }
  return {
    version: 1, producto: 'rcg', nombreProducto: 'Responsabilidad Civil General', tomador: tomadorDe(s),
    riesgo: { indole: s.rcg.indole, actividad: s.rcg.actividadEspecifica, esContrato: s.contrato.esContrato, ...contratoDe(s) },
    moneda: s.rcg.moneda,
    opcionElegida: cot.alternativas.some((a) => a.opcion === s.rcg.opcion) ? s.rcg.opcion : cot.alternativas[0]?.opcion ?? null,
    alternativas: cot.alternativas.map(alternativaRcg), coberturas: cot.coberturas, deducible: cot.deducible,
    condiciones: cot.condiciones, notaIgtf: cot.notaIgtf, mesaTecnica: x.mesaTecnica, vigenciaDias: x.vigenciaDias,
    ...(Object.keys(emisiones).length ? { emisiones } : {}), sinPagoEnLinea, estado: estadoDe(s),
  };
}

/**
 * RCP / RCE: se guarda para consultarla y reabrirla. USD/EUR: una alternativa por opción con la prima de los productos
 * cotizados; Bs.: una sola. No lleva body de emisión (son dos pólizas): se emite con el asesor.
 */
export function datosCotizacionRc(s: EstadoCotizador, cot: CotizacionRc, x: { vigenciaDias: number }): DatosCotizacion {
  const ids: IdOpcion[] = ['I', 'II', 'III'];
  const conOpciones = cot.resultados.length > 0 && cot.resultados.every((r) => r.opciones?.length);
  const alternativas: AlternativaGuardada[] = conOpciones
    ? ids.filter((id) => cot.resultados.every((r) => r.opciones!.some((o) => o.id === id))).map((id) => {
      const partes = cot.resultados.map((r) => ({ r, o: r.opciones!.find((o) => o.id === id)! }));
      const d = partes.find((p) => p.o.descuentoPct != null)?.o;
      return {
        opcion: id, limite: Math.max(...partes.map((p) => p.o.limites[2])), prima: Math.round(partes.reduce((t, p) => t + p.o.prima, 0) * 100) / 100,
        detalle: partes.map((p) => ({ nombre: NOMBRES[p.r.k], prima: p.o.prima })),
        ...(d ? { descuentoPct: d.descuentoPct, tasaInicial: d.tasaInicial, tasaAplicada: d.tasaAplicada } : {}),
      };
    })
    : [{ opcion: 'I', limite: Math.max(0, ...cot.resultados.map((r) => r.limites[2] ?? 0)), prima: cot.total, detalle: cot.resultados.map((r) => ({ nombre: NOMBRES[r.k], prima: r.prima })) }];
  const producto: ProductoGuardado = s.rc.modo === 'p' ? 'rcp' : s.rc.modo === 'e' ? 'rce' : 'rc';
  const elegida = cot.resultados[0]?.opcion ?? null;
  return {
    version: 1, producto, nombreProducto: cot.resultados.map((r) => NOMBRES[r.k]).join(' + ') || 'RC Patronal / Empresarial',
    tomador: tomadorDe(s), riesgo: { indole: s.rc.indole, actividad: cot.resultados.map((r) => r.riesgo?.[0]).filter(Boolean).join(' · '), esContrato: s.contrato.esContrato, ...contratoDe(s) },
    moneda: cot.simbolo, opcionElegida: elegida && alternativas.some((a) => a.opcion === elegida) ? elegida : alternativas[0]?.opcion ?? null,
    alternativas,
    coberturas: cot.resultados.map((r) => ({
      nombre: `${NOMBRES[r.k]} · límite por evento / año póliza`,
      montos: alternativas.map((a) => r.opciones?.find((o) => o.id === a.opcion)?.limites[2] ?? r.limites[2] ?? 0),
    })),
    deducible: '', condiciones: [], notaIgtf: cot.simbolo !== 'Bs', mesaTecnica: false, vigenciaDias: x.vigenciaDias,
    sinPagoEnLinea: ['RC Patronal / Empresarial se emite con tu asesor de seguros.'], estado: estadoDe(s),
  };
}

/**
 * Huella de lo cotizado: mientras no cambie se conserva el mismo código (volver atrás y regresar al resumen no crea
 * otra cotización). La opción marcada no cuenta: la cotización guarda las tres.
 */
export function huellaCotizacion(s: EstadoCotizador, parametros: unknown): string {
  return JSON.stringify([s.producto, s.comun, s.contrato, s.producto === 'rcg' ? { ...s.rcg, opcion: '' } : s.rc, parametros]);
}

const esObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Estado del cotizador guardado en la cotización, si es utilizable para reabrirla. */
export function estadoParaReabrir(datos: unknown): EstadoCotizador | null {
  const e = esObj(datos) && esObj(datos.estado) ? datos.estado : null;
  if (!e || (e.producto !== 'rcg' && e.producto !== 'rc') || !esObj(e.comun) || !esObj(e.contrato) || !esObj(e.rcg) || !esObj(e.rc)) return null;
  return e as unknown as EstadoCotizador;
}
