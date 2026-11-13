// Responsabilidad Civil General (ramo 28 / producto 89 en Sis2000).
// Portado del Apps Script de La Mundial, RCG_VERSION 'TRES-ALTERNATIVAS-USD-EUR-SIEMPRE-10-15-PRUEBA-6'.
// Todos los valores de tarifa viven en ParametrosRcg (editables desde la pantalla de Parámetros).
import { CORREO_RE, importe, normalizar, redondear, SUCURSALES } from './comun';
import { descuentoAplicado, type DescuentoAplicado, type TramoDescuento } from './descuentos';

export type MonedaRcg = 'USD' | 'EUR' | 'Bs.';
export const MONEDAS_RCG: MonedaRcg[] = ['USD', 'EUR', 'Bs.'];
export const INDOLE_OTRA = 'Otra (especifique)';

export interface ClaseRcg { nombre: string; etiqueta: string; min: number; max: number; indoles: string[]; industria?: boolean }

export interface ParametrosRcg {
  clases: ClaseRcg[];
  /** Índoles que exigen una clase marcada como industria. */
  industrias: string[];
  /** Actividades sujetas a evaluación de la mesa técnica: se cotizan, pero la cotización queda sujeta a su aprobación. */
  restringidas: string[];
  /** Fragmentos (sin acentos) que también marcan una actividad como restringida. */
  palabrasRestringidas: string[];
  limiteMin: number;
  /** Límite máximo del límite inicial y tope de las opciones II y III. */
  limiteMax: number;
  /** Multiplicadores del límite para las opciones I, II y III. */
  factoresOpciones: number[];
  /** Prima mínima USD/EUR de la opción I (proporcional en II y III). */
  primaMinimaDivisa: number;
  /** Prima mínima en Bs: % de la suma de cada opción. */
  pctMinimoBs: number;
  /** % del límite que se usa como sublímite. */
  pctSublimite: number;
  /** Cobertura → tope del sublímite. */
  sublimites: Record<string, number>;
  coberturasSinContrato: string[];
  coberturasConContrato: string[];
  /** Condiciones especiales que se pueden marcar con contrato. */
  condicionesOpcionales: string[];
  /** Condición que aplica siempre. */
  condicionFija: string;
  deducible: { pct: number; pctMinSuma: number; minUSD: number; minEUR: number; minBs: number };
  vigenciaDias: number;
  /** Descuentos por suma asegurada elevada sobre la tasa básica (vacío = sin descuento). Se evalúa la suma de cada opción. */
  descuentos: TramoDescuento[];
}

export const PARAMETROS_RCG: ParametrosRcg = {
  clases: [
    { nombre: 'Oficinas Públicas y Privadas en General', etiqueta: 'Oficinas Públicas y Privadas', min: 0.10, max: 0.90,
      indoles: ['Oficinas públicas', 'Oficinas privadas'] },
    { nombre: 'Comercios, Farmacias, Ferreterías, Automercados, etc.', etiqueta: 'Comercios, Farmacias, Ferreterías', min: 0.20, max: 1.50,
      indoles: ['Boticas', 'Farmacias', 'Droguerías', 'Perfumerías', 'Mueblerías', 'Zapaterías', 'Automercados', 'Abastos', 'Librerías', 'Venta de ropa y telas', 'Venta de artículos fotográficos', 'Jugueterías', 'Ferreterías', 'Ópticas', 'Venta de artículos deportivos', 'Lavanderías y tintorerías (sin daños a la ropa)', 'Venta de repuestos y accesorios', 'Venta y reparación de aparatos electrónicos (sin vehículos)'] },
    { nombre: 'Hoteles, Restaurantes, Centros Comerciales, etc.', etiqueta: 'Hoteles, Restaurantes, Centros Comerciales', min: 0.23, max: 1.70,
      indoles: ['Hoteles', 'Restaurantes', 'Bares', 'Discotecas', 'Cervecerías', 'Fuentes de soda', 'Cafeterías', 'Clubes', 'Parques de atracciones', 'Centros comerciales', 'Empresas de mantenimiento y limpieza'] },
    { nombre: 'Academias, Instituciones, Hospitales, Cines, etc.', etiqueta: 'Academias, Instituciones, Hospitales', min: 0.20, max: 1.50,
      indoles: ['Academias', 'Instituciones de enseñanza', 'Funerarias', 'Hospitales', 'Iglesias', 'Teatros', 'Salas de conciertos', 'Cines', 'Exposiciones artísticas', 'Retenes'] },
    { nombre: 'Toda clase de Industrias', etiqueta: 'Toda clase de Industrias', min: 0.25, max: 0.95, indoles: [], industria: true },
  ],
  industrias: ['Contratistas', 'Construcción', 'Obras civiles', 'Mantenimiento industrial', 'Montajes', 'Instalaciones'],
  restringidas: ['Actividades petroleras', 'Actividades petroquímicas', 'Explosivos', 'Pólvora', 'Aserraderos', 'Astilleros', 'Minería y actividades mineras', 'Actividades nucleares', 'Refinerías', 'Excavaciones', 'Terrorismo', 'Radiaciones ionizantes', 'Contaminantes radioactivos', 'Materiales o actividades radioactivas', 'Meteoritos', 'Fuegos artificiales'],
  palabrasRestringidas: ['petrol', 'petroquim', 'explosiv', 'polvora', 'aserrader', 'astiller', 'miner', 'nuclear', 'refiner', 'excavacion', 'excavaciones', 'terroris', 'radiacion ionizante', 'radiaciones ionizantes', 'radioactiv', 'meteorito', 'fuego artificial', 'fuegos artificiales', 'pirotecni'],
  limiteMin: 5000,
  limiteMax: 1000000,
  factoresOpciones: [1, 2, 3],
  primaMinimaDivisa: 70,
  pctMinimoBs: 35,
  pctSublimite: 30,
  sublimites: {
    'Responsabilidad Civil Daños Causados por Agua': 300000,
    'Responsabilidad Civil de Contaminación Ambiental': 100000,
    'Responsabilidad Civil de Avisos Luminosos o no y Vallas': 30000,
    'Responsabilidad Civil Defensa Penal y Asistencia Legal': 20000,
  },
  coberturasSinContrato: [
    'Riesgo de Vecinos',
    'Riesgo Locativo',
    'Responsabilidad Civil Daños Causados por Agua',
    'Responsabilidad Civil Contratistas Independientes',
    'Responsabilidad Civil por Vigilantes Privados',
    'Responsabilidad Civil por Actividades Sociales y Eventos Deportivos',
    'Responsabilidad Civil por Suministro de Alimentos y Bebidas',
    'Responsabilidad Civil de Contaminación Ambiental',
    'Responsabilidad Civil de Ascensores, Grúas y Montacargas',
    'Responsabilidad Civil de Vehículos en Predios Privados',
    'Responsabilidad Civil de Avisos Luminosos o no y Vallas',
    'Responsabilidad Civil por Incendio y/o Explosión',
    'Responsabilidad Civil Defensa Penal y Asistencia Legal',
  ],
  coberturasConContrato: [
    'Responsabilidad Civil Contratistas Independientes',
    'Responsabilidad Civil Cruzada',
    'Responsabilidad Civil de Transporte, Carga y Descarga',
    'Riesgo de Vecinos',
    'Responsabilidad Civil de Contaminación Ambiental',
    'Responsabilidad Civil por Incendio y/o Explosión',
    'Responsabilidad Civil de Ascensores, Grúas y Montacargas',
  ],
  condicionesOpcionales: [
    'Para todos los efectos de esta póliza el coasegurado y sus empleados son considerados como terceros.',
    'La compañía de seguros renuncia a sus derechos de subrogación.',
    'La cobertura no será anulada sin aviso por escrito con sesenta (60) días de anticipación a dicha anulación.',
    'Restitución automática de la suma asegurada con cobro de prima adicional.',
  ],
  condicionFija: 'En ningún caso la indemnización de La Compañía excederá el monto máximo fijado como límite de responsabilidad.',
  deducible: { pct: 10, pctMinSuma: 0.5, minUSD: 100, minEUR: 100, minBs: 1000 },
  vigenciaDias: 15,
  descuentos: [],
};

/** Actividad restringida (acuerdo del 30-oct-2026): ya no bloquea; aviso en pantalla y nota en el resumen y el PDF. */
export const AVISO_MESA_TECNICA = 'Actividad sujeta a evaluación de la mesa técnica';
export const NOTA_MESA_TECNICA = 'Sujeto a aprobación de la mesa técnica';

export function actividadRestringida(texto: string, p: ParametrosRcg = PARAMETROS_RCG): boolean {
  const valor = normalizar(texto);
  if (!valor) return false;
  return p.restringidas.some((a) => valor.includes(normalizar(a))) ||
    p.palabrasRestringidas.some((a) => a.trim() && valor.includes(normalizar(a)));
}

/** Con descuento por suma, la opción trae además descuentoPct, tasaInicial y tasaAplicada (vista técnica). */
export interface AlternativaRcg extends Partial<DescuentoAplicado> { opcion: 'I' | 'II' | 'III'; limite: number; prima: number; primaMinimaAplicada: boolean }

/** Opciones I/II/III = límite × factor, con tope en el límite máximo; se descarta la que no supere a la anterior. */
export function alternativasRcg(limite: number, tasa: number, moneda: MonedaRcg, p: ParametrosRcg = PARAMETROS_RCG): AlternativaRcg[] {
  const sumas = p.factoresOpciones.slice(0, 3).map((f) => redondear(Math.min(limite * f, p.limiteMax)))
    .filter((suma, i, valores) => i === 0 || suma > valores[i - 1]);
  return sumas.map((suma, i) => {
    // USD/EUR: mínimo proporcional a la suma de cada opción. Bs.: % de cada suma.
    const minimo = moneda === 'Bs.' ? suma * (p.pctMinimoBs / 100) : p.primaMinimaDivisa * (suma / limite);
    // Descuento por suma elevada (Parámetros): baja la tasa básica de esta opción; la prima mínima se respeta.
    const descuento = descuentoAplicado(suma, tasa, p.descuentos);
    const calculada = (suma * (descuento?.tasaAplicada ?? tasa)) / 100;
    return {
      opcion: (['I', 'II', 'III'] as const)[i],
      limite: suma,
      prima: redondear(Math.max(calculada, minimo)),
      primaMinimaAplicada: calculada < minimo,
      ...(descuento ?? {}),
    };
  });
}

/**
 * Mensaje claro para la suma asegurada deseada (texto del input) contra el mínimo y el máximo de Parámetros.
 * null si está vacía (la exige cotizarRcg) o es válida.
 */
export function errorSumaRcg(texto: string, p: ParametrosRcg = PARAMETROS_RCG): string | null {
  if (texto.trim() === '') return null;
  const n = Number(texto);
  const miles = (x: number) => x.toLocaleString('es-VE');
  if (!Number.isFinite(n)) return 'Escribe un monto válido.';
  if (n > p.limiteMax) return `La suma asegurada no puede superar la máxima permitida (${miles(p.limiteMax)}).`;
  if (n < p.limiteMin) return `La suma asegurada mínima es ${miles(p.limiteMin)}.`;
  if (redondear(n) !== n) return 'La suma asegurada admite máximo 2 decimales.';
  return null;
}

/** Texto que explica cómo salen las opciones I, II y III a partir de la suma elegida. */
export function descripcionOpcionesRcg(p: ParametrosRcg = PARAMETROS_RCG): string {
  const [f1 = 1, f2 = 2, f3 = 3] = p.factoresOpciones;
  const veces = (f: number) => (f === 1 ? 'la suma elegida' : `la suma × ${f}`);
  return `Opción I: ${veces(f1)} · Opción II: ${veces(f2)} · Opción III: ${veces(f3)}, con tope en ${p.limiteMax.toLocaleString('es-VE')}. ` +
    'La opción que no supere a la anterior no se muestra.';
}

export function sublimite(cobertura: string, limite: number, p: ParametrosRcg = PARAMETROS_RCG): number {
  return cobertura in p.sublimites ? Math.min(limite * (p.pctSublimite / 100), p.sublimites[cobertura]) : limite;
}

const pctTexto = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });

export function deducibleRcg(moneda: MonedaRcg, p: ParametrosRcg = PARAMETROS_RCG): string {
  const d = p.deducible;
  const minimo = moneda === 'Bs.' ? `Bs. ${importe(d.minBs)}` : moneda === 'EUR' ? `EUR ${importe(d.minEUR)}` : `USD ${importe(d.minUSD)}`;
  return `${pctTexto(d.pct)}% sobre el monto de la pérdida indemnizable, con un mínimo del ${d.pctMinSuma.toLocaleString('es-VE', { minimumFractionDigits: 2 })}% de la suma asegurada o ${minimo}, lo que resulte mayor.`;
}

export interface SolicitudRcg {
  sucursal: string;
  usuario: string;
  correoUsuario: string;
  asegurado: string;
  rif: string;
  correoDestinatario: string;
  intermediario: string;
  ubicacion: string;
  moneda: MonedaRcg;
  clase: number;
  indole: string;
  actividadEspecifica: string;
  esContrato: boolean;
  numeroContrato: string;
  objetoObra: string;
  coasegurado: string;
  limite: number | null;
  tasa: number | null;
  condiciones: number[];
}

export type ErroresRcg = Partial<Record<keyof SolicitudRcg, string>>;

export interface CotizacionRcg {
  errores: ErroresRcg;
  /** Actividad restringida: se cotiza igual, sujeta a aprobación de la mesa técnica (aviso, no error). */
  restringida: boolean;
  alternativas: AlternativaRcg[];
  coberturas: { nombre: string; montos: number[] }[];
  condiciones: string[];
  deducible: string;
  notaIgtf: boolean;
}

const fmt = (n: number) => n.toLocaleString('es-VE');

/** Valida igual que rcgValidar_ del .gs y calcula las alternativas. */
export function cotizarRcg(s: SolicitudRcg, p: ParametrosRcg = PARAMETROS_RCG): CotizacionRcg {
  const e: ErroresRcg = {};
  const clase = p.clases[s.clase];

  if (!SUCURSALES.includes(s.sucursal)) e.sucursal = 'Seleccione una sucursal válida de la lista.';
  if (!s.usuario.trim()) e.usuario = 'Indique quién elabora la cotización.';
  if (s.correoUsuario && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.correoUsuario)) e.correoUsuario = 'Correo con formato inválido.';
  if (!s.asegurado.trim()) e.asegurado = 'Indique el tomador / asegurado.';
  if (!CORREO_RE.test(s.correoDestinatario.trim())) e.correoDestinatario = 'El correo del tomador es obligatorio y debe ser válido.';
  if (!clase) e.clase = 'Clase de riesgo no permitida.';

  // Restringida: se cotiza con cualquier clase y queda marcada para la mesa técnica (antes bloqueaba).
  const indoleRestringida = actividadRestringida(s.indole, p);
  const restringida = indoleRestringida || actividadRestringida(s.actividadEspecifica, p);
  if (!s.indole) e.indole = 'Seleccione una índole específica.';
  else if (!indoleRestringida && clase && p.industrias.includes(s.indole) && !clase.industria) e.indole = 'Esta índole corresponde a una clase de Industrias. Seleccione esa clase de riesgo.';
  else if (!indoleRestringida && clase && s.indole !== INDOLE_OTRA && !p.industrias.includes(s.indole) && !clase.indoles.includes(s.indole)) e.indole = 'La índole no corresponde a la clase seleccionada.';
  if (!s.actividadEspecifica.trim()) e.actividadEspecifica = 'Describa la actividad específica.';

  if (s.esContrato) {
    if (!s.numeroContrato.trim()) e.numeroContrato = 'Indique el número de contrato.';
    if (!s.objetoObra.trim()) e.objetoObra = 'Indique el objeto de la obra.';
    if (!s.coasegurado.trim()) e.coasegurado = 'Introduzca el nombre del coasegurado.';
  }

  const { limite, tasa } = s;
  if (limite === null || limite < p.limiteMin || limite > p.limiteMax || redondear(limite) !== limite) {
    e.limite = `El límite inicial debe estar entre ${fmt(p.limiteMin)} y ${fmt(p.limiteMax)} (máx. 2 decimales).`;
  }
  if (clase && (tasa === null || tasa < clase.min - 1e-7 || tasa > clase.max + 1e-7)) {
    e.tasa = `Rango permitido: ${clase.min}% - ${clase.max}%`;
  }

  const condicionesValidas = s.esContrato
    ? [...new Set(s.condiciones)].filter((x) => x >= 0 && x < p.condicionesOpcionales.length).sort((a, b) => a - b)
    : [];
  const alternativas = !e.limite && !e.tasa && limite !== null && tasa !== null && tasa > 0
    ? alternativasRcg(limite, tasa, s.moneda, p) : [];
  const nombres = s.esContrato ? p.coberturasConContrato : p.coberturasSinContrato;

  return {
    errores: e,
    restringida,
    alternativas,
    coberturas: nombres.map((nombre) => ({ nombre, montos: alternativas.map((a) => sublimite(nombre, a.limite, p)) })),
    condiciones: [...condicionesValidas.map((i) => p.condicionesOpcionales[i]), p.condicionFija].filter(Boolean),
    deducible: deducibleRcg(s.moneda, p),
    notaIgtf: s.moneda !== 'Bs.',
  };
}

export const tasaPromedio = (c: ClaseRcg): number => Number(((c.min + c.max) / 2).toFixed(2));
