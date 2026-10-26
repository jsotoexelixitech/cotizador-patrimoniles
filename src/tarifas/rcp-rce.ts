// Responsabilidad Civil Patronal (RCP) y Empresarial (RCE).
// Portado del cotizador Apps Script de La Mundial (TARIFF, EQUIVALENCE, rcpThreeOptions, rceThreeOptions).
// Todos los valores de tarifa viven en ParametrosRc (editables desde la pantalla de Parámetros).
import tarifa from './data/tarifa-rcp-rce.json';
import equivalencias from './data/equivalencias-rce.json';
import { CORREO_RE, redondear, SUCURSALES } from './comun';

/** [nombre, tasa mínima %, tasa máxima %] */
export type Rango = [string, number, number];
export interface Equivalencia { activity: number; classes: number[] }
export const TARIFA = tarifa as { p: { risks: Rango[]; options: Rango[] }; e: { risks: Rango[]; options: Rango[] } };
export const EQUIVALENCIAS = equivalencias as Equivalencia[];

export type Modo = 'p' | 'e' | 'both';
export type MonedaRc = 'USD' | 'EUR' | 'VES';
export type BaseNomina = 'employee' | 'total';
export type IdOpcion = 'I' | 'II' | 'III';
export const OPCIONES: IdOpcion[] = ['I', 'II', 'III'];
export const VIGENCIAS_CONTRATO = ['Mensual', 'Bimensual', 'Trimestral', 'Semestral', 'Anual'];

export const NOMBRES = { p: 'Responsabilidad Civil Patronal', e: 'Responsabilidad Civil Empresarial' } as const;
export const COBERTURAS_BASICAS = ['Discapacidad temporal', 'Discapacidad parcial permanente', 'Discapacidad total permanente para el trabajo habitual', 'Discapacidad absoluta permanente para cualquier actividad', 'Gran discapacidad', 'Muerte'];

export interface OpcionRcpDef { id: IdOpcion; medica: number; hernia: number; factor: number; topeIndividual: number; topeColectivo: number }
export interface OpcionRceDef { negligencia: number; defensa: number; medica: number }

export interface ParametrosRc {
  /** Clases comunes (tasa patronal). */
  clases: Rango[];
  /** Actividades del riesgo (tasa empresarial). */
  actividades: Rango[];
  /** Actividad → clases comunes en las que se puede elegir. */
  equivalencias: Equivalencia[];
  /** Coberturas opcionales por tasa usadas en Bs. */
  opcionalesP: Rango[];
  opcionalesE: Rango[];
  primaMinima: number;
  salarioMinimo: number;
  ajusteMaximo: number;
  /** Límite colectivo = individual × este valor (con tope por opción). */
  multiplicadorColectivo: number;
  opcionesRcp: OpcionRcpDef[];
  opcionesRce: OpcionRceDef[];
  /** Si las tres opciones dan la misma prima se multiplican por estos factores. */
  diferenciacion: number[];
  bs: {
    pctPrimaRcp: number;
    pctRce: number;
    salariosLimite: number;
    maxTrabajadoresColectivo: number;
    limiteIndividual: number;
    limiteColectivo: number;
    limiteOpcional: number;
    pctOpcionalRestringido: number;
    multOpcionalColectivo: number;
  };
}

export const PARAMETROS_RC: ParametrosRc = {
  clases: TARIFA.p.risks,
  actividades: TARIFA.e.risks,
  equivalencias: EQUIVALENCIAS,
  opcionalesP: TARIFA.p.options,
  opcionalesE: TARIFA.e.options,
  primaMinima: 70,
  salarioMinimo: 1800,
  ajusteMaximo: 10,
  multiplicadorColectivo: 10,
  opcionesRcp: [
    { id: 'I', medica: 15, hernia: 7.5, factor: 0.20, topeIndividual: 35000, topeColectivo: 275000 },
    { id: 'II', medica: 30, hernia: 15, factor: 0.25, topeIndividual: 40000, topeColectivo: 300000 },
    { id: 'III', medica: 75, hernia: 37.5, factor: 0.30, topeIndividual: 45000, topeColectivo: 325000 },
  ],
  opcionesRce: [
    { negligencia: 2, defensa: 3, medica: 6 },
    { negligencia: 4, defensa: 6, medica: 10 },
    { negligencia: 10, defensa: 15, medica: 20 },
  ],
  diferenciacion: [1, 1.10, 1.15],
  bs: {
    pctPrimaRcp: 35,
    pctRce: 60,
    salariosLimite: 8,
    maxTrabajadoresColectivo: 5,
    limiteIndividual: 800000,
    limiteColectivo: 800000,
    limiteOpcional: 5000,
    pctOpcionalRestringido: 10,
    multOpcionalColectivo: 4,
  },
};

export const opcionalesDe = (k: 'p' | 'e', p: ParametrosRc = PARAMETROS_RC) => (k === 'p' ? p.opcionalesP : p.opcionalesE);

/** Actividades RCE (índices de p.actividades) vinculadas a una clase común. */
export function actividadesDeClase(clase: number, p: ParametrosRc = PARAMETROS_RC): number[] {
  return p.equivalencias.filter((m) => m.classes.includes(clase) && p.actividades[m.activity]).map((m) => m.activity);
}

export function rangoPatronal(clase: number | null, p: ParametrosRc = PARAMETROS_RC): Rango | null {
  return clase === null ? null : p.clases[clase] ?? null;
}

export function rangoEmpresarial(clase: number | null, actividad: number | null, p: ParametrosRc = PARAMETROS_RC): Rango | null {
  if (clase === null || actividad === null) return null;
  return p.equivalencias.some((m) => m.activity === actividad && m.classes.includes(clase)) ? p.actividades[actividad] ?? null : null;
}

export const tasaMedia = (r: Rango): number => Number(((r[1] + r[2]) / 2).toFixed(5));

const tasaValida = (v: number | null, min: number, max: number): v is number =>
  v !== null && Number.isFinite(v) && v >= min && v <= max;

// ---------- Fórmulas (idénticas al original con los parámetros oficiales) ----------

export function limitesPorTrabajador(pago: number, empleados: number, base: BaseNomina, p: ParametrosRc = PARAMETROS_RC) {
  if (!Number.isFinite(pago) || pago <= 0 || !Number.isInteger(empleados) || empleados < 1) return null;
  const anualPorTrabajador = base === 'total' ? pago / empleados : pago;
  const individual = redondear(anualPorTrabajador * p.bs.salariosLimite);
  return { anualPorTrabajador, individual, colectivo: redondear(individual * Math.min(empleados, p.bs.maxTrabajadoresColectivo)) };
}

/** Negligencia del empleador / Defensa penal en Bs: % del límite individual, colectivo × n con tope. */
export function limitesOpcionalesRestringidos(individual: number, p: ParametrosRc = PARAMETROS_RC) {
  if (!Number.isFinite(individual) || individual <= 0) return null;
  const porTrabajador = redondear(individual * (p.bs.pctOpcionalRestringido / 100));
  return { individual: porTrabajador, colectivo: Math.min(p.bs.limiteOpcional, redondear(porTrabajador * p.bs.multOpcionalColectivo)) };
}

export interface OpcionRcp {
  id: IdOpcion;
  primaBasica: number;
  ajuste: number;
  primaOpcionales: number;
  detalleOpcionales: { nombre: string; prima: number }[];
  limites: [number, number, number];
  topeIndividual: number;
  topeColectivo: number;
  ajusteMinimo: number;
  diferenciacion: number;
  prima: number;
}

/** Si las tres opciones salen con la misma prima (p. ej. todas en el mínimo), se diferencian con los factores. */
export function diferenciarOpcionesIguales(opciones: OpcionRcp[], p: ParametrosRc = PARAMETROS_RC): OpcionRcp[] {
  if (opciones.length !== 3 || !opciones.every((o) => redondear(o.prima) === redondear(opciones[0].prima))) return opciones;
  const base = opciones[0].prima;
  return opciones.map((o, i) => {
    const prima = redondear(base * (p.diferenciacion[i] ?? 1));
    return { ...o, prima, diferenciacion: redondear(prima - o.prima) };
  });
}

export function opcionesRcp(nomina: number, empleados: number, tasa: number, ajustePct: number, medica: boolean, hernia: boolean, p: ParametrosRc = PARAMETROS_RC): OpcionRcp[] {
  if (!Number.isFinite(nomina) || nomina <= 0 || !Number.isInteger(empleados) || empleados < 1 || !Number.isFinite(tasa) || tasa < 0 || !Number.isFinite(ajustePct) || Math.abs(ajustePct) > p.ajusteMaximo) {
    throw new Error('Revisa la nómina, los empleados, la tasa y el ajuste de RCP.');
  }
  const base = redondear((nomina * tasa) / 100);
  const ajuste = redondear((base * ajustePct) / 100);
  return diferenciarOpcionesIguales(p.opcionesRcp.map((d) => {
    const detalle = [
      ...(medica ? [{ nombre: 'Asistencia médica, quirúrgica y farmacéutica', prima: redondear(empleados * d.medica) }] : []),
      ...(hernia ? [{ nombre: 'Hernia', prima: redondear(empleados * d.hernia) }] : []),
    ];
    const primaOpcionales = redondear(detalle.reduce((s, x) => s + x.prima, 0));
    const individual = redondear(Math.min(nomina * d.factor, d.topeIndividual));
    const colectivo = redondear(Math.min(individual * p.multiplicadorColectivo, d.topeColectivo));
    const subtotal = redondear(base + ajuste + primaOpcionales);
    const prima = Math.max(p.primaMinima, subtotal);
    return {
      id: d.id, primaBasica: base, ajuste, primaOpcionales, detalleOpcionales: detalle,
      limites: [individual, colectivo, colectivo], topeIndividual: d.topeIndividual, topeColectivo: d.topeColectivo,
      ajusteMinimo: redondear(prima - subtotal), diferenciacion: 0, prima,
    };
  }), p);
}

export interface SeleccionRce { negligencia: boolean; defensa: boolean; medica: boolean }

export function opcionesRce(nomina: number, empleados: number, tasa: number, ajustePct: number, sel: SeleccionRce, p: ParametrosRc = PARAMETROS_RC): OpcionRcp[] {
  const compartidas = opcionesRcp(nomina, empleados, tasa, ajustePct, false, false, { ...p, diferenciacion: [1, 1, 1] });
  return diferenciarOpcionesIguales(compartidas.map((b, i) => {
    const d = p.opcionesRce[i];
    const detalle = [
      ...(sel.negligencia ? [{ nombre: 'Negligencia del Empleador', prima: redondear(empleados * d.negligencia) }] : []),
      ...(sel.defensa ? [{ nombre: 'Asistencia Legal y Defensa Penal', prima: redondear(empleados * d.defensa) }] : []),
      ...(sel.medica ? [{ nombre: 'Gastos Médicos', prima: redondear(empleados * d.medica) }] : []),
    ];
    const primaOpcionales = redondear(detalle.reduce((s, x) => s + x.prima, 0));
    const subtotal = redondear(b.primaBasica + b.ajuste + primaOpcionales);
    const prima = Math.max(p.primaMinima, subtotal);
    return { ...b, primaOpcionales, detalleOpcionales: detalle, ajusteMinimo: redondear(prima - subtotal), diferenciacion: 0, prima };
  }), p);
}

// ---------- Cotización completa ----------

export interface OpcionalVes { seleccionada: boolean; tasa: number | null; limite: string; grupo: number | null }

export interface ProductoEntrada {
  tasa: number | null;
  ajuste: number | null;
  opcion: IdOpcion;
  /** USD/EUR: RCP = [médica, hernia]; RCE = [negligencia, defensa, médica] (por empleado). */
  adicionales: boolean[];
  /** Solo Bs: coberturas opcionales por tasa. */
  opcionalesVes: OpcionalVes[];
}

export interface SolicitudRc {
  modo: Modo;
  moneda: MonedaRc;
  tasaBcv: number | null;
  base: BaseNomina;
  monto: number | null;
  empleados: number | null;
  clase: number | null;
  otraClase: boolean;
  actividad: number | null;
  indole: string;
  asegurado: string;
  rif: string;
  correo: string;
  direccion: string;
  sucursal: string;
  emisor: string;
  correoEmisor: string;
  intermediario: string;
  esContrato: boolean;
  numeroContrato: string;
  vigenciaContrato: string;
  objetoContrato: string;
  p: ProductoEntrada;
  e: ProductoEntrada;
}

export interface ResultadoProducto {
  k: 'p' | 'e';
  riesgo: Rango | null;
  tasaEfectiva: number;
  limites: number[];
  prima: number;
  primaCalculada: number;
  opciones: OpcionRcp[] | null;
  opcion: IdOpcion | null;
  lineas: { nombre: string; tasa: number }[];
  nota: string;
}

export type PasoRc = 'tomador' | 'riesgo' | 'cotizacion';

export interface CotizacionRc {
  errores: string[];
  erroresPorPaso: Record<PasoRc, string[]>;
  avisos: string[];
  nomina: number;
  anualPorTrabajador: number | null;
  resultados: ResultadoProducto[];
  total: number;
  /** Factor para mostrar importes en la moneda de cuenta (Bs = tasa BCV; USD/EUR = 1). */
  factor: number;
  simbolo: string;
}

const esRestringida = (nombre: string) => /Negligencia del Empleador|Asistencia Legal y Defensa Penal/i.test(nombre);
const fmt = (n: number) => n.toLocaleString('es-VE');

export function cotizarRc(s: SolicitudRc, prm: ParametrosRc = PARAMETROS_RC): CotizacionRc {
  const errores: string[] = [];
  const erroresPorPaso: Record<PasoRc, string[]> = { tomador: [], riesgo: [], cotizacion: [] };
  const falla = (paso: PasoRc, msg: string) => { errores.push(msg); erroresPorPaso[paso].push(msg); };
  const avisos: string[] = [];
  const ves = s.moneda === 'VES';
  const fx = ves ? (s.tasaBcv ?? 0) : 1;
  const simbolo = ves ? 'Bs' : s.moneda;
  const monedaBase = s.moneda === 'EUR' ? 'EUR' : 'USD';
  const activos: ('p' | 'e')[] = s.modo === 'both' ? ['p', 'e'] : [s.modo];

  if (!s.asegurado.trim()) falla('tomador', 'Indica el tomador / asegurado.');
  if (!s.rif.trim()) falla('tomador', 'Indica el RIF del tomador.');
  if (!s.direccion.trim()) falla('tomador', 'Indica la ubicación del riesgo.');
  if (!SUCURSALES.includes(s.sucursal)) falla('tomador', 'Selecciona una sucursal válida de la lista.');
  if (!s.emisor.trim()) falla('tomador', 'Indica quién emite la cotización.');
  if (!CORREO_RE.test(s.correoEmisor.trim())) falla('tomador', 'Introduce el correo de quien emite la cotización.');
  if (s.correo && !CORREO_RE.test(s.correo.trim())) falla('tomador', 'Introduce un correo electrónico válido.');
  if (s.esContrato && (!s.numeroContrato.trim() || !s.objetoContrato.trim() || !VIGENCIAS_CONTRATO.includes(s.vigenciaContrato))) {
    falla('tomador', 'Completa el número de contrato, la vigencia y el objeto de la obra.');
  }
  if (s.indole.trim().length < 3) falla('riesgo', 'Escribe la índole con al menos tres caracteres.');
  if (s.actividad === null) falla('riesgo', 'Selecciona una Actividad del Riesgo vinculada a la clase.');
  if (ves && !(fx > 0)) falla('riesgo', 'Se requiere una tasa BCV válida para cotizar en bolívares.');

  const montoIngresado = s.monto ?? 0;
  const pago = ves ? (fx > 0 ? montoIngresado / fx : 0) : montoIngresado;
  const empleados = s.empleados ?? 0;
  const nomina = s.base === 'total' ? pago : pago * empleados;
  const derivados = limitesPorTrabajador(pago, empleados, s.base, prm);

  if (!ves && pago > 0 && derivados && derivados.anualPorTrabajador < prm.salarioMinimo) {
    falla('riesgo', `El salario anual promedio por empleado no puede ser inferior a ${monedaBase} ${fmt(prm.salarioMinimo)}.`);
  }
  if (!(pago > 0) || !(empleados >= 1) || !Number.isInteger(empleados)) {
    falla('riesgo', 'Ingresa un monto anual positivo y una cantidad entera de empleados.');
  }

  const resultados: ResultadoProducto[] = [];
  for (const k of activos) {
    const ent = s[k];
    const riesgo = k === 'p' ? rangoPatronal(s.clase, prm) : rangoEmpresarial(s.clase, s.actividad, prm);
    const etiqueta = k.toUpperCase();
    const tasa = ent.tasa ?? NaN;
    const ajuste = ent.ajuste ?? NaN;

    if (!riesgo) falla('riesgo', `${etiqueta}: completa la clasificación común.`);
    else if (!tasaValida(ent.tasa, riesgo[1], riesgo[2])) falla('cotizacion', `${etiqueta}: tasa permitida ${riesgo[1]} % a ${riesgo[2]} %.`);
    if (!tasaValida(ent.ajuste, -prm.ajusteMaximo, prm.ajusteMaximo)) falla('cotizacion', `${etiqueta}: el ajuste debe estar entre −${prm.ajusteMaximo} % y +${prm.ajusteMaximo} %.`);
    if (ajuste < 0) avisos.push(`${etiqueta}: descuento sujeto a validación del área técnica.`);

    const lineas = [{ nombre: 'Cobertura básica', tasa, min: riesgo?.[1], max: riesgo?.[2] }];
    let limites: number[];
    let primaCalculada: number;
    let prima: number;
    let opciones: OpcionRcp[] | null = null;
    let nota = '';

    if (!ves) {
      // USD / EUR: tres opciones con primas por empleado para las coberturas adicionales.
      try {
        opciones = k === 'p'
          ? opcionesRcp(nomina, empleados, tasa, ajuste, !!ent.adicionales[0], !!ent.adicionales[1], prm)
          : opcionesRce(nomina, empleados, tasa, ajuste, { negligencia: !!ent.adicionales[0], defensa: !!ent.adicionales[1], medica: !!ent.adicionales[2] }, prm);
      } catch {
        opciones = null;
      }
      const elegida = opciones?.find((o) => o.id === ent.opcion) ?? null;
      limites = elegida ? [...elegida.limites] : [0, 0, 0];
      prima = elegida?.prima ?? 0;
      primaCalculada = prima;
      if (elegida && elegida.ajusteMinimo > 0) nota = `Prima mínima: ${monedaBase} ${fmt(prm.primaMinima)}`;
    } else {
      // Bs: coberturas opcionales por tasa; prima = % del límite por evento/año (RCE = % de la patronal).
      limites = derivados ? [derivados.individual, derivados.colectivo, derivados.colectivo] : [0, 0, 0];
      opcionalesDe(k, prm).forEach((o, i) => {
        const op = ent.opcionalesVes[i];
        if (!op?.seleccionada) return;
        // En RCE las tasas opcionales quedan fijas en el mínimo del rango.
        const tasaOp = k === 'e' ? o[1] : op.tasa ?? NaN;
        if (!tasaValida(tasaOp, o[1], o[2])) falla('cotizacion', `${o[0]}: tasa permitida ${o[1]} % a ${o[2]} %.`);
        if (esRestringida(o[0])) {
          const lr = limitesOpcionalesRestringidos(limites[0], prm);
          if (!lr || !(lr.colectivo > 0 && lr.colectivo <= prm.bs.limiteOpcional)) falla('cotizacion', `${o[0]}: revisa los límites individual y colectivo.`);
        } else if (op.limite === 'tech') {
          falla('cotizacion', `${o[0]}: límite superior a ${monedaBase} 2.000; contactar al área técnica.`);
        } else if (!(Number(op.limite) > 0) || !((op.grupo ?? 0) >= Number(op.limite))) {
          falla('cotizacion', `${o[0]}: revisa los límites individual y colectivo.`);
        }
        lineas.push({ nombre: o[0], tasa: tasaOp, min: o[1], max: o[2] });
      });
      if (derivados && (limites[0] > prm.bs.limiteIndividual || limites[1] > prm.bs.limiteColectivo)) {
        falla('cotizacion', `${NOMBRES[k]}: se exceden los límites autorizados. Solicitar al área técnica.`);
      }
      const tasaTotal = lineas.reduce((acc, l) => acc + l.tasa, 0);
      primaCalculada = (nomina * tasaTotal * (1 + ajuste / 100)) / 100;
      prima = limites[2] * (prm.bs.pctPrimaRcp / 100);
      nota = k === 'e' ? `Prima: ${prm.bs.pctRce} % de la prima Patronal` : `Prima: ${prm.bs.pctPrimaRcp} % del límite por evento/año póliza`;
    }

    if (limites.some((n) => !(n > 0)) || limites[1] < limites[0] || limites[2] < limites[1]) {
      falla('cotizacion', `${etiqueta}: los límites deben ser positivos y crecientes.`);
    }
    const tasaTotal = lineas.reduce((acc, l) => acc + l.tasa, 0);
    if (lineas.some((l) => l.min !== undefined && l.max !== undefined && (l.tasa * (1 + ajuste / 100) < l.min - 1e-9 || l.tasa * (1 + ajuste / 100) > l.max + 1e-9))) {
      avisos.push(`${etiqueta}: el ajuste lleva una tasa fuera del rango original; requiere revisión técnica.`);
    }
    resultados.push({
      k, riesgo, tasaEfectiva: tasaTotal * (1 + ajuste / 100), limites, prima, primaCalculada,
      opciones, opcion: ves ? null : ent.opcion,
      lineas: lineas.map(({ nombre, tasa: t }) => ({ nombre, tasa: t })), nota,
    });
  }

  if (ves) {
    const empresarial = resultados.find((r) => r.k === 'e');
    if (empresarial) {
      // Sin RCP en la cotización, la patronal de referencia también es el % del límite por evento.
      const patronal = resultados.find((r) => r.k === 'p')?.prima ?? empresarial.limites[2] * (prm.bs.pctPrimaRcp / 100);
      const pct = prm.bs.pctRce / 100;
      empresarial.prima = fx > 0 ? redondear(patronal * fx * pct) / fx : patronal * pct;
    }
  }

  // Importes en la moneda de cuenta (en Bs se multiplica por la tasa BCV).
  const enMoneda = (n: number) => (ves ? redondear(n * fx) : n);
  const visibles = resultados.map((r) => ({
    ...r,
    prima: enMoneda(r.prima),
    primaCalculada: enMoneda(r.primaCalculada),
    limites: r.limites.map(enMoneda),
  }));

  return {
    errores,
    erroresPorPaso,
    avisos,
    nomina: enMoneda(nomina),
    anualPorTrabajador: derivados ? enMoneda(derivados.anualPorTrabajador) : null,
    resultados: visibles,
    total: redondear(visibles.reduce((acc, r) => acc + r.prima, 0)),
    factor: fx,
    simbolo,
  };
}
