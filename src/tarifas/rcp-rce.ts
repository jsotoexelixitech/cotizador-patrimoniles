// Responsabilidad Civil Patronal (RCP) y Empresarial (RCE).
// Portado del cotizador Apps Script de La Mundial (TARIFF, EQUIVALENCE, rcpThreeOptions, rceThreeOptions).
import tarifa from './data/tarifa-rcp-rce.json';
import equivalencias from './data/equivalencias-rce.json';
import { CORREO_RE, redondear, SUCURSALES } from './comun';

/** [nombre, tasa mínima %, tasa máxima %] */
export type Rango = [string, number, number];
export const TARIFA = tarifa as { p: { risks: Rango[]; options: Rango[] }; e: { risks: Rango[]; options: Rango[] } };
export const EQUIVALENCIAS = equivalencias as { activity: number; classes: number[] }[];

export type Modo = 'p' | 'e' | 'both';
export type MonedaRc = 'USD' | 'EUR' | 'VES';
export type BaseNomina = 'employee' | 'total';
export type IdOpcion = 'I' | 'II' | 'III';
export const OPCIONES: IdOpcion[] = ['I', 'II', 'III'];
export const VIGENCIAS_CONTRATO = ['Mensual', 'Bimensual', 'Trimestral', 'Semestral', 'Anual'];

export const NOMBRES = { p: 'Responsabilidad Civil Patronal', e: 'Responsabilidad Civil Empresarial' } as const;
export const COBERTURAS_BASICAS = ['Discapacidad temporal', 'Discapacidad parcial permanente', 'Discapacidad total permanente para el trabajo habitual', 'Discapacidad absoluta permanente para cualquier actividad', 'Gran discapacidad', 'Muerte'];

export const MAX_LIMITE_USD = 800000;
export const SALARIO_MIN_ANUAL = 1800;
export const PRIMA_MINIMA = 70;

/** Actividades RCE (índices de TARIFA.e.risks) vinculadas a una clase común. */
export function actividadesDeClase(clase: number): number[] {
  return EQUIVALENCIAS.filter((m) => m.classes.includes(clase)).map((m) => m.activity);
}

export function rangoPatronal(clase: number | null): Rango | null {
  return clase === null ? null : TARIFA.p.risks[clase] ?? null;
}

export function rangoEmpresarial(clase: number | null, actividad: number | null): Rango | null {
  if (clase === null || actividad === null) return null;
  return EQUIVALENCIAS.some((m) => m.activity === actividad && m.classes.includes(clase)) ? TARIFA.e.risks[actividad] : null;
}

export const tasaMedia = (r: Rango): number => Number(((r[1] + r[2]) / 2).toFixed(5));

const tasaValida = (v: number | null, min: number, max: number): v is number =>
  v !== null && Number.isFinite(v) && v >= min && v <= max;

// ---------- Fórmulas (idénticas al original) ----------

export function limitesPorTrabajador(pago: number, empleados: number, base: BaseNomina) {
  if (!Number.isFinite(pago) || pago <= 0 || !Number.isInteger(empleados) || empleados < 1) return null;
  const anualPorTrabajador = base === 'total' ? pago / empleados : pago;
  const individual = redondear(anualPorTrabajador * 8);
  return { anualPorTrabajador, individual, colectivo: redondear(individual * Math.min(empleados, 5)) };
}

export function limitesAutorizados(moneda: MonedaRc, k: 'p' | 'e') {
  return moneda === 'VES'
    ? { individual: 800000, colectivo: 800000, opcional: 5000 }
    : { individual: k === 'p' ? 45000 : 60000, colectivo: 325000, opcional: 25000 };
}

/** Negligencia del empleador / Defensa penal en Bs: 10 % del límite individual, colectivo ×4 con tope 5.000. */
export function limitesOpcionalesRestringidos(individual: number) {
  if (!Number.isFinite(individual) || individual <= 0) return null;
  const porTrabajador = redondear(individual * 0.1);
  return { individual: porTrabajador, colectivo: Math.min(5000, redondear(porTrabajador * 4)) };
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

const DEF_RCP = [
  { id: 'I' as const, medica: 15, hernia: 7.5, factor: 0.20, topeIndividual: 35000, topeColectivo: 275000 },
  { id: 'II' as const, medica: 30, hernia: 15, factor: 0.25, topeIndividual: 40000, topeColectivo: 300000 },
  { id: 'III' as const, medica: 75, hernia: 37.5, factor: 0.30, topeIndividual: 45000, topeColectivo: 325000 },
];

const DEF_RCE = [
  { negligencia: 2, defensa: 3, medica: 6 },
  { negligencia: 4, defensa: 6, medica: 10 },
  { negligencia: 10, defensa: 15, medica: 20 },
];

/** Si las tres opciones salen con la misma prima (p. ej. todas en el mínimo), se diferencian ×1 / ×1,10 / ×1,15. */
export function diferenciarOpcionesIguales(opciones: OpcionRcp[]): OpcionRcp[] {
  if (opciones.length !== 3 || !opciones.every((o) => redondear(o.prima) === redondear(opciones[0].prima))) return opciones;
  const base = opciones[0].prima;
  const factores = [1, 1.10, 1.15];
  return opciones.map((o, i) => {
    const prima = redondear(base * factores[i]);
    return { ...o, prima, diferenciacion: redondear(prima - o.prima) };
  });
}

export function opcionesRcp(nomina: number, empleados: number, tasa: number, ajustePct: number, medica: boolean, hernia: boolean): OpcionRcp[] {
  if (!Number.isFinite(nomina) || nomina <= 0 || !Number.isInteger(empleados) || empleados < 1 || !Number.isFinite(tasa) || tasa < 0 || !Number.isFinite(ajustePct) || ajustePct < -10 || ajustePct > 10) {
    throw new Error('Revisa la nómina, los empleados, la tasa y el ajuste de RCP.');
  }
  const base = redondear((nomina * tasa) / 100);
  const ajuste = redondear((base * ajustePct) / 100);
  return diferenciarOpcionesIguales(DEF_RCP.map((d) => {
    const detalle = [
      ...(medica ? [{ nombre: 'Asistencia médica, quirúrgica y farmacéutica', prima: redondear(empleados * d.medica) }] : []),
      ...(hernia ? [{ nombre: 'Hernia', prima: redondear(empleados * d.hernia) }] : []),
    ];
    const primaOpcionales = redondear(detalle.reduce((s, x) => s + x.prima, 0));
    const individual = redondear(Math.min(nomina * d.factor, d.topeIndividual));
    const colectivo = redondear(Math.min(individual * 10, d.topeColectivo));
    const subtotal = redondear(base + ajuste + primaOpcionales);
    const prima = Math.max(PRIMA_MINIMA, subtotal);
    return {
      id: d.id, primaBasica: base, ajuste, primaOpcionales, detalleOpcionales: detalle,
      limites: [individual, colectivo, colectivo], topeIndividual: d.topeIndividual, topeColectivo: d.topeColectivo,
      ajusteMinimo: redondear(prima - subtotal), diferenciacion: 0, prima,
    };
  }));
}

export interface SeleccionRce { negligencia: boolean; defensa: boolean; medica: boolean }

export function opcionesRce(nomina: number, empleados: number, tasa: number, ajustePct: number, sel: SeleccionRce): OpcionRcp[] {
  const compartidas = opcionesRcp(nomina, empleados, tasa, ajustePct, false, false);
  return diferenciarOpcionesIguales(compartidas.map((b, i) => {
    const d = DEF_RCE[i];
    const detalle = [
      ...(sel.negligencia ? [{ nombre: 'Negligencia del Empleador', prima: redondear(empleados * d.negligencia) }] : []),
      ...(sel.defensa ? [{ nombre: 'Asistencia Legal y Defensa Penal', prima: redondear(empleados * d.defensa) }] : []),
      ...(sel.medica ? [{ nombre: 'Gastos Médicos', prima: redondear(empleados * d.medica) }] : []),
    ];
    const primaOpcionales = redondear(detalle.reduce((s, x) => s + x.prima, 0));
    const subtotal = redondear(b.primaBasica + b.ajuste + primaOpcionales);
    const prima = Math.max(PRIMA_MINIMA, subtotal);
    return { ...b, primaOpcionales, detalleOpcionales: detalle, ajusteMinimo: redondear(prima - subtotal), diferenciacion: 0, prima };
  }));
}

// ---------- Cotización completa ----------

export interface OpcionalVes { seleccionada: boolean; tasa: number | null; limite: string; grupo: number | null }

export interface ProductoEntrada {
  tasa: number | null;
  ajuste: number | null;
  opcion: IdOpcion;
  /** USD/EUR: RCP = [médica, hernia]; RCE = [negligencia, defensa, médica] (por empleado). */
  adicionales: boolean[];
  /** Solo Bs: coberturas opcionales por tasa (TARIFA[k].options). */
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

export type PasoRc = "tomador" | "riesgo" | "cotizacion";

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
const esMedica = (nombre: string) => /m[eé]dic/i.test(nombre);

export function cotizarRc(s: SolicitudRc): CotizacionRc {
  const errores: string[] = [];
  const erroresPorPaso: Record<PasoRc, string[]> = { tomador: [], riesgo: [], cotizacion: [] };
  const falla = (paso: PasoRc, msg: string) => { errores.push(msg); erroresPorPaso[paso].push(msg); };
  const avisos: string[] = [];
  const ves = s.moneda === 'VES';
  const fx = ves ? (s.tasaBcv ?? 0) : 1;
  const simbolo = ves ? 'Bs' : s.moneda;
  const monedaBase = s.moneda === 'EUR' ? 'EUR' : 'USD';
  const activos: ('p' | 'e')[] = s.modo === 'both' ? ['p', 'e'] : [s.modo];

  if (!s.asegurado.trim()) falla("tomador", 'Indica el tomador / asegurado.');
  if (!s.rif.trim()) falla("tomador", 'Indica el RIF del tomador.');
  if (!s.direccion.trim()) falla("tomador", 'Indica la ubicación del riesgo.');
  if (!SUCURSALES.includes(s.sucursal)) falla("tomador", 'Selecciona una sucursal válida de la lista.');
  if (!s.emisor.trim()) falla("tomador", 'Indica quién emite la cotización.');
  if (!CORREO_RE.test(s.correoEmisor.trim())) falla("tomador", 'Introduce el correo de quien emite la cotización.');
  if (s.correo && !CORREO_RE.test(s.correo.trim())) falla("tomador", 'Introduce un correo electrónico válido.');
  if (s.indole.trim().length < 3) falla("riesgo", 'Escribe la índole con al menos tres caracteres.');
  if (s.actividad === null) falla("riesgo", 'Selecciona una Actividad del Riesgo vinculada a la clase.');
  if (ves && !(fx > 0)) falla("riesgo", 'Se requiere una tasa BCV válida para cotizar en bolívares.');
  if (s.esContrato && (!s.numeroContrato.trim() || !s.objetoContrato.trim() || !VIGENCIAS_CONTRATO.includes(s.vigenciaContrato))) {
    falla("tomador", 'Completa el número de contrato, la vigencia y el objeto de la obra.');
  }

  const montoIngresado = s.monto ?? 0;
  const pago = ves ? (fx > 0 ? montoIngresado / fx : 0) : montoIngresado;
  const empleados = s.empleados ?? 0;
  const nomina = s.base === 'total' ? pago : pago * empleados;
  const derivados = limitesPorTrabajador(pago, empleados, s.base);

  if (!ves && pago > 0 && derivados && derivados.anualPorTrabajador < SALARIO_MIN_ANUAL) {
    falla("riesgo", `El salario anual promedio por empleado no puede ser inferior a ${monedaBase} 1.800.`);
  }
  if (!(pago > 0) || !(empleados >= 1) || !Number.isInteger(empleados)) {
    falla("riesgo", 'Ingresa un monto anual positivo y una cantidad entera de empleados.');
  }

  const resultados: ResultadoProducto[] = [];
  for (const k of activos) {
    const ent = s[k];
    const riesgo = k === 'p' ? rangoPatronal(s.clase) : rangoEmpresarial(s.clase, s.actividad);
    const etiqueta = k.toUpperCase();
    const tasa = ent.tasa ?? NaN;
    const ajuste = ent.ajuste ?? NaN;
    const tope = limitesAutorizados(s.moneda, k);

    if (!riesgo) falla("riesgo", `${etiqueta}: completa la clasificación común.`);
    else if (!tasaValida(ent.tasa, riesgo[1], riesgo[2])) falla("cotizacion", `${etiqueta}: tasa permitida ${riesgo[1]} % a ${riesgo[2]} %.`);
    if (!tasaValida(ent.ajuste, -10, 10)) falla("cotizacion", `${etiqueta}: el ajuste debe estar entre −10 % y +10 %.`);
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
          ? opcionesRcp(nomina, empleados, tasa, ajuste, !!ent.adicionales[0], !!ent.adicionales[1])
          : opcionesRce(nomina, empleados, tasa, ajuste, { negligencia: !!ent.adicionales[0], defensa: !!ent.adicionales[1], medica: !!ent.adicionales[2] });
      } catch {
        opciones = null;
      }
      const elegida = opciones?.find((o) => o.id === ent.opcion) ?? null;
      limites = elegida ? [...elegida.limites] : [0, 0, 0];
      prima = elegida?.prima ?? 0;
      primaCalculada = prima;
      if (elegida && elegida.ajusteMinimo > 0) nota = `Prima mínima: ${monedaBase} 70`;
    } else {
      // Bs: coberturas opcionales por tasa; prima = 35 % del límite por evento/año (RCE = 60 % de la patronal).
      limites = derivados ? [derivados.individual, derivados.colectivo, derivados.colectivo] : [0, 0, 0];
      const opcionesTarifa = TARIFA[k].options;
      opcionesTarifa.forEach((o, i) => {
        const op = ent.opcionalesVes[i];
        if (!op?.seleccionada) return;
        // En RCE las tasas opcionales quedan fijas en el mínimo del rango.
        const tasaOp = k === 'e' ? o[1] : op.tasa ?? NaN;
        if (!tasaValida(tasaOp, o[1], o[2])) falla("cotizacion", `${o[0]}: tasa permitida ${o[1]} % a ${o[2]} %.`);
        if (esRestringida(o[0])) {
          const lr = limitesOpcionalesRestringidos(limites[0]);
          if (!lr || !(lr.colectivo > 0 && lr.colectivo <= tope.opcional)) falla("cotizacion", `${o[0]}: revisa los límites individual y colectivo.`);
        } else if (op.limite === 'tech') {
          falla("cotizacion", `${o[0]}: límite superior a ${monedaBase} 2.000; contactar al área técnica.`);
        } else if (!(Number(op.limite) > 0) || !((op.grupo ?? 0) >= Number(op.limite))) {
          falla("cotizacion", `${o[0]}: revisa los límites individual y colectivo.`);
        }
        lineas.push({ nombre: o[0], tasa: tasaOp, min: o[1], max: o[2] });
      });
      if (derivados && (limites[0] > tope.individual || limites[1] > tope.colectivo)) {
        falla("cotizacion", `${NOMBRES[k]}: se exceden los límites autorizados. Solicitar al área técnica.`);
      }
      const tasaTotal = lineas.reduce((acc, l) => acc + l.tasa, 0);
      primaCalculada = (nomina * tasaTotal * (1 + ajuste / 100)) / 100;
      prima = limites[2] * 0.35;
      nota = k === 'e' ? 'Prima: 60 % de la prima Patronal' : 'Prima: 35 % del límite por evento/año póliza';
    }

    if (limites.some((n) => !(n > 0)) || limites[1] < limites[0] || limites[2] < limites[1]) {
      falla("cotizacion", `${etiqueta}: los límites deben ser positivos y crecientes.`);
    }
    const tasaTotal = lineas.reduce((acc, l) => acc + l.tasa, 0);
    if (lineas.some((l) => l.min !== undefined && (l.tasa * (1 + ajuste / 100) < l.min - 1e-9 || l.tasa * (1 + ajuste / 100) > l.max! + 1e-9))) {
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
      // Sin RCP en la cotización, la patronal de referencia también es 35 % del límite por evento.
      const patronal = resultados.find((r) => r.k === 'p')?.prima ?? empresarial.limites[2] * 0.35;
      empresarial.prima = fx > 0 ? redondear(patronal * fx * 0.6) / fx : patronal * 0.6;
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
