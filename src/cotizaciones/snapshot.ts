// JSON de la cotización que se guarda en Exélixi Nexus (cotizaciones-rc): lo que ve el cliente al traerla por código
// (tomador, riesgo, opciones I/II/III con suma y prima, coberturas), el descuento aplicado, el estado del cotizador
// para reabrirla y, por opción, el body de emisión ya armado: con el pago confirmado Nexus emite con ese body, sin
// pasar por el navegador del cliente. RCP + RCE («Ambas») son dos pólizas: la opción lleva un body por ramo (27 y 37)
// y se paga la suma de las dos primas.
import type { CotizacionState } from '../store/cotizacionStore';
import { rifCompleto } from '../store/cotizacionStore';
import { pideUnidad, planesContenedor, type CoberturaRamo } from '../tarifas/combo';
import { PLAN_RCG_POR_OPCION, RAMOS_RC } from '../tarifas/data/mapeo-sis2000';
import { redondear } from '../tarifas/comun';
import { armarEmisionInformada, coberturasRc, coberturasRcg, faltantesEmisionRc } from '../tarifas/emision-rc';
import type { RamoCatalogo } from '../tarifas/planes-rcg';
import type { AlternativaRcg, CotizacionRcg } from '../tarifas/rcg';
import { NOMBRES, type CotizacionRc, type IdOpcion, type ResultadoProducto } from '../tarifas/rcp-rce';

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
  /** RCP / RCE: prima de cada producto (cada póliza) dentro de la opción. */
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
  /**
   * Body de POST riesgos-generales/emision (modo cotizador) por opción: uno (RCG, RCP o RCE) o un arreglo con uno por
   * póliza (RCP + RCE). Sin él, la opción no se paga en línea.
   */
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

/** Sis2000 para emitir RCP (ramo 27) y RCE (ramo 37) con el pago en línea. */
export interface ContextoEmisionRc {
  /** Coberturas en Sis2000 de cada ramo cotizado (GET riesgos-generales/coberturas); sin el ramo o null = no se leyeron. */
  catalogos: Partial<Record<number, CoberturaRamo[] | null>>;
  contenedores: RamoCatalogo[] | null;
  /** Plan contenedor configurado por ramo (VITE_RCP_PLAN_CONTENEDOR → 27, VITE_RCE_PLAN_CONTENEDOR → 37). */
  planesConfigurados?: Partial<Record<number, string | undefined>>;
  cproductor: number;
  esPersonaNatural: boolean;
}

/**
 * Plan contenedor de un ramo de RCP / RCE: el configurado si está vigente o el único vigente del ramo. Si no hay
 * ninguno claro devuelve por qué (`falta`): sin plan contenedor esa póliza no se puede emitir.
 */
export function planContenedorRc(contenedores: RamoCatalogo[] | null, cramo: number, configurado = ''): { cplan: string; falta?: string } {
  if (!contenedores) return { cplan: '', falta: 'No se pudieron leer los planes vigentes de Sis2000.' };
  const planes = planesContenedor(contenedores, cramo);
  const pedido = configurado.trim();
  if (pedido && planes.some((p) => p.cplan === pedido)) return { cplan: pedido };
  if (planes.length === 1) return { cplan: planes[0].cplan };
  if (!planes.length) return { cplan: '', falta: `El ramo ${cramo} no tiene planes vigentes en Sis2000: La Mundial debe crear o activar uno para poder emitir.` };
  return { cplan: '', falta: `El ramo ${cramo} tiene varios planes vigentes (${planes.map((p) => p.cplan).join(', ')}): hay que definir cuál es el contenedor.` };
}

const SIN_PAGO_RC = 'RC Patronal / Empresarial se emite con tu asesor de seguros.';

/** RCP / RCE: body(s) de emisión de cada opción (uno por ramo cotizado) o por qué no se puede pagar en línea. */
function emisionesRc(
  s: EstadoCotizador, cot: CotizacionRc, alternativas: AlternativaGuardada[], conOpciones: boolean, e: ContextoEmisionRc,
): { emisiones: Partial<Record<Opcion, unknown>>; sinPagoEnLinea: string[] } {
  const c = s.comun;
  const emisiones: Partial<Record<Opcion, unknown>> = {};
  if (cot.simbolo === 'EUR') {
    return { emisiones, sinPagoEnLinea: ['El pago en línea solo está disponible en USD o Bs.: no hay tasa oficial del euro para cobrar en bolívares. En EUR se emite con tu asesor de seguros.'] };
  }
  // Un descuento o una tasa fuera de rango quedan sujetos a Técnico: no se emite sola.
  if (cot.avisos.length) return { emisiones, sinPagoEnLinea: [`Sujeta a validación del área técnica. ${cot.avisos.join(' ')}`] };
  const ramos = cot.resultados.map((r) => {
    const cramo = RAMOS_RC[r.k === 'p' ? 'rcp' : 'rce'];
    return { r, cramo, catalogo: e.catalogos[cramo] ?? null, plan: planContenedorRc(e.contenedores, cramo, e.planesConfigurados?.[cramo]) };
  });
  const generales = ramos.flatMap((x) => [
    ...(x.catalogo ? [] : [`${NOMBRES[x.r.k]}: no se pudieron verificar las coberturas del ramo ${x.cramo} en Sis2000.`]),
    ...(x.plan.falta ? [`${NOMBRES[x.r.k]}: ${x.plan.falta}`] : []),
  ]);
  if (!ramos.length || generales.length) return { emisiones, sinPagoEnLinea: generales.length ? generales : [SIN_PAGO_RC] };
  const sinPagoEnLinea: string[] = [];
  for (const a of alternativas) {
    const faltan: string[] = [];
    const bodies: { prima_total: number }[] = [];
    for (const { r, catalogo, plan } of ramos) {
      // La emisión de la opción: los límites y la prima de esa opción (USD), o la única prima en Bs.
      const o = conOpciones ? r.opciones?.find((x) => x.id === a.opcion) : undefined;
      const delaOpcion: ResultadoProducto = o ? { ...r, opcion: o.id, prima: o.prima, limites: [...o.limites] } : r;
      const emision = coberturasRc(delaOpcion, cot.simbolo, catalogo);
      const f = faltantesEmisionRc({ emision, valida: !cot.errores.length, documento: c.documento, cplan: plan.cplan, apartamento: '', direccion: c.ubicacion });
      if (f.length) { faltan.push(`${NOMBRES[r.k]}: ${f.join(' ')}`); continue; }
      bodies.push(armarEmisionInformada({
        // El número lo pone Nexus al emitir (el código de la cotización).
        cplan: plan.cplan, emision, ncotizacion: 'COTIZACION', tipoDoc: c.tipoDoc, documento: c.documento, nombre: c.asegurado,
        apellido: e.esPersonaNatural ? c.apellido : '', correo: c.correo, telefono: c.telefono, direccion: c.ubicacion,
        bien: [s.rc.indole, r.riesgo?.[0]].filter(Boolean).join(' · ') || c.asegurado, cproductor: e.cproductor,
      }));
    }
    // Lo que se cobra es la prima de la opción: tiene que ser exactamente la suma de las pólizas que se emiten.
    const suma = redondear(bodies.reduce((t, b) => t + b.prima_total, 0));
    if (!faltan.length && Math.abs(suma - a.prima) > 0.01) faltan.push(`la suma de las primas de emisión (${suma}) no coincide con la prima cotizada (${a.prima}).`);
    if (faltan.length) { sinPagoEnLinea.push(`Opción ${a.opcion}: ${faltan.join(' ')}`); continue; }
    emisiones[a.opcion] = bodies.length === 1 ? bodies[0] : bodies;
  }
  return { emisiones, sinPagoEnLinea };
}

/**
 * RCP / RCE: USD/EUR: una alternativa por opción con la prima de los productos cotizados; Bs.: una sola. Con
 * `emision` (catálogos y planes de Sis2000) deja armado, por opción, el body de emisión de cada póliza: una si se cotizó
 * solo RCP o solo RCE, dos con «Ambas» (ramos 27 y 37), y la prima a pagar es la suma. Sin `emision` solo se guarda
 * para consultarla y reabrirla.
 */
export function datosCotizacionRc(s: EstadoCotizador, cot: CotizacionRc, x: { vigenciaDias: number; emision?: ContextoEmisionRc }): DatosCotizacion {
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
  const { emisiones, sinPagoEnLinea } = x.emision
    ? emisionesRc(s, cot, alternativas, conOpciones, x.emision) : { emisiones: {}, sinPagoEnLinea: [SIN_PAGO_RC] };
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
    ...(Object.keys(emisiones).length ? { emisiones } : {}), sinPagoEnLinea, estado: estadoDe(s),
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
