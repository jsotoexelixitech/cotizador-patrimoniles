// Responsabilidad Civil General (ramo 28 / producto 89 en Sis2000).
// Portado del Apps Script de La Mundial, RCG_VERSION 'TRES-ALTERNATIVAS-USD-EUR-SIEMPRE-10-15-PRUEBA-6'.
import { CORREO_RE, normalizar, redondear, SUCURSALES } from './comun';

export type MonedaRcg = 'USD' | 'EUR' | 'Bs.';
export const MONEDAS_RCG: MonedaRcg[] = ['USD', 'EUR', 'Bs.'];

export interface ClaseRcg { nombre: string; etiqueta: string; min: number; max: number; indoles: string[] }

export const RCG_CLASES: ClaseRcg[] = [
  { nombre: 'Oficinas Públicas y Privadas en General', etiqueta: 'Oficinas Públicas y Privadas', min: 0.10, max: 0.90,
    indoles: ['Oficinas públicas', 'Oficinas privadas'] },
  { nombre: 'Comercios, Farmacias, Ferreterías, Automercados, etc.', etiqueta: 'Comercios, Farmacias, Ferreterías', min: 0.20, max: 1.50,
    indoles: ['Boticas', 'Farmacias', 'Droguerías', 'Perfumerías', 'Mueblerías', 'Zapaterías', 'Automercados', 'Abastos', 'Librerías', 'Venta de ropa y telas', 'Venta de artículos fotográficos', 'Jugueterías', 'Ferreterías', 'Ópticas', 'Venta de artículos deportivos', 'Lavanderías y tintorerías (sin daños a la ropa)', 'Venta de repuestos y accesorios', 'Venta y reparación de aparatos electrónicos (sin vehículos)'] },
  { nombre: 'Hoteles, Restaurantes, Centros Comerciales, etc.', etiqueta: 'Hoteles, Restaurantes, Centros Comerciales', min: 0.23, max: 1.70,
    indoles: ['Hoteles', 'Restaurantes', 'Bares', 'Discotecas', 'Cervecerías', 'Fuentes de soda', 'Cafeterías', 'Clubes', 'Parques de atracciones', 'Centros comerciales', 'Empresas de mantenimiento y limpieza'] },
  { nombre: 'Academias, Instituciones, Hospitales, Cines, etc.', etiqueta: 'Academias, Instituciones, Hospitales', min: 0.20, max: 1.50,
    indoles: ['Academias', 'Instituciones de enseñanza', 'Funerarias', 'Hospitales', 'Iglesias', 'Teatros', 'Salas de conciertos', 'Cines', 'Exposiciones artísticas', 'Retenes'] },
  { nombre: 'Toda clase de Industrias', etiqueta: 'Toda clase de Industrias', min: 0.25, max: 0.95, indoles: [] },
];
export const CLASE_INDUSTRIAS = 4;

export const RCG_INDUSTRIAS = ['Contratistas', 'Construcción', 'Obras civiles', 'Mantenimiento industrial', 'Montajes', 'Instalaciones'];
export const RCG_RESTRINGIDAS = ['Actividades petroleras', 'Actividades petroquímicas', 'Explosivos', 'Pólvora', 'Aserraderos', 'Astilleros', 'Minería y actividades mineras', 'Actividades nucleares', 'Refinerías', 'Excavaciones', 'Terrorismo', 'Radiaciones ionizantes', 'Contaminantes radioactivos', 'Materiales o actividades radioactivas', 'Meteoritos', 'Fuegos artificiales'];
export const INDOLE_OTRA = 'Otra (especifique)';

export const RCG_SIN_CONTRATO = [
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
];
export const RCG_CON_CONTRATO = [
  'Responsabilidad Civil Contratistas Independientes',
  'Responsabilidad Civil Cruzada',
  'Responsabilidad Civil de Transporte, Carga y Descarga',
  'Riesgo de Vecinos',
  'Responsabilidad Civil de Contaminación Ambiental',
  'Responsabilidad Civil por Incendio y/o Explosión',
  'Responsabilidad Civil de Ascensores, Grúas y Montacargas',
];

/** Coberturas con sublímite: 30 % del límite de la opción, con tope. */
export const RCG_SUBLIMITES: Record<string, number> = {
  'Responsabilidad Civil Daños Causados por Agua': 300000,
  'Responsabilidad Civil de Contaminación Ambiental': 100000,
  'Responsabilidad Civil de Avisos Luminosos o no y Vallas': 30000,
  'Responsabilidad Civil Defensa Penal y Asistencia Legal': 20000,
};

/** Índices 0–3: opcionales (solo con contrato). Índice 4: siempre aplica. */
export const RCG_CONDICIONES = [
  'Para todos los efectos de esta póliza el coasegurado y sus empleados son considerados como terceros.',
  'La compañía de seguros renuncia a sus derechos de subrogación.',
  'La cobertura no será anulada sin aviso por escrito con sesenta (60) días de anticipación a dicha anulación.',
  'Restitución automática de la suma asegurada con cobro de prima adicional.',
  'En ningún caso la indemnización de La Compañía excederá el monto máximo fijado como límite de responsabilidad.',
];
export const RCG_CONDICION_FIJA = 4;

export const LIMITE_MIN = 5000;
export const LIMITE_MAX = 1000000;

const PALABRAS_RESTRINGIDAS = ['petrol', 'petroquim', 'explosiv', 'polvora', 'aserrader', 'astiller',
  'miner', 'nuclear', 'refiner', 'excavacion', 'excavaciones', 'terroris',
  'radiacion ionizante', 'radiaciones ionizantes', 'radioactiv', 'meteorito',
  'fuego artificial', 'fuegos artificiales', 'pirotecni'];

export function actividadRestringida(texto: string): boolean {
  const valor = normalizar(texto);
  if (!valor) return false;
  return RCG_RESTRINGIDAS.some((a) => valor.includes(normalizar(a))) ||
    PALABRAS_RESTRINGIDAS.some((a) => valor.includes(a));
}

export interface AlternativaRcg { opcion: 'I' | 'II' | 'III'; limite: number; prima: number; primaMinimaAplicada: boolean }

/** Opciones I/II/III = límite ×1/×2/×3 con tope 1.000.000; se descarta la que no supere a la anterior. */
export function alternativasRcg(limite: number, tasa: number, moneda: MonedaRcg): AlternativaRcg[] {
  const sumas = [limite, Math.min(limite * 2, LIMITE_MAX), Math.min(limite * 3, LIMITE_MAX)]
    .map(redondear).filter((suma, i, valores) => i === 0 || suma > valores[i - 1]);
  return sumas.map((suma, i) => {
    // USD/EUR: mínimo 70 proporcional a la suma de cada opción. Bs.: 35 % de cada suma.
    const minimo = moneda === 'Bs.' ? suma * 0.35 : 70 * (suma / limite);
    const calculada = (suma * tasa) / 100;
    return {
      opcion: (['I', 'II', 'III'] as const)[i],
      limite: suma,
      prima: redondear(Math.max(calculada, minimo)),
      primaMinimaAplicada: calculada < minimo,
    };
  });
}

export function sublimite(cobertura: string, limite: number): number {
  return cobertura in RCG_SUBLIMITES ? Math.min(limite * 0.30, RCG_SUBLIMITES[cobertura]) : limite;
}

export function deducibleRcg(moneda: MonedaRcg): string {
  const minimo = moneda === 'Bs.' ? 'Bs. 1.000,00' : moneda === 'EUR' ? 'EUR 100,00' : 'USD 100,00';
  return `10% sobre el monto de la pérdida indemnizable, con un mínimo del 0,50% de la suma asegurada o ${minimo}, lo que resulte mayor.`;
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
  /** Actividad restringida: va al Área Técnica, no se cotiza automáticamente. */
  restringida: boolean;
  alternativas: AlternativaRcg[];
  coberturas: { nombre: string; montos: number[] }[];
  condiciones: string[];
  deducible: string;
  notaIgtf: boolean;
}

/** Valida igual que rcgValidar_ del .gs y calcula las alternativas. */
export function cotizarRcg(s: SolicitudRcg): CotizacionRcg {
  const e: ErroresRcg = {};
  const clase = RCG_CLASES[s.clase];

  if (!SUCURSALES.includes(s.sucursal)) e.sucursal = 'Seleccione una sucursal válida de la lista.';
  if (!s.usuario.trim()) e.usuario = 'Indique quién elabora la cotización.';
  if (s.correoUsuario && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.correoUsuario)) e.correoUsuario = 'Correo con formato inválido.';
  if (!s.asegurado.trim()) e.asegurado = 'Indique el tomador / asegurado.';
  if (!CORREO_RE.test(s.correoDestinatario.trim())) e.correoDestinatario = 'El correo del tomador es obligatorio y debe ser válido.';
  if (!clase) e.clase = 'Clase de riesgo no permitida.';

  const restringida = actividadRestringida(s.indole) || actividadRestringida(s.actividadEspecifica);
  if (!s.indole) e.indole = 'Seleccione una índole específica.';
  else if (actividadRestringida(s.indole)) e.indole = 'Cotización por Área Técnica. Esta actividad no puede continuar en este cotizador.';
  else if (clase && RCG_INDUSTRIAS.includes(s.indole) && s.clase !== CLASE_INDUSTRIAS) e.indole = 'Esta índole corresponde a «Toda clase de Industrias». Seleccione esa clase de riesgo.';
  else if (clase && s.indole !== INDOLE_OTRA && !RCG_INDUSTRIAS.includes(s.indole) && !clase.indoles.includes(s.indole)) e.indole = 'La índole no corresponde a la clase seleccionada.';
  if (!s.actividadEspecifica.trim()) e.actividadEspecifica = 'Describa la actividad específica.';
  else if (actividadRestringida(s.actividadEspecifica)) e.actividadEspecifica = 'Actividad restringida. Debe ser evaluada por el Área Técnica; no puede cotizarse automáticamente.';

  if (s.esContrato) {
    if (!s.numeroContrato.trim()) e.numeroContrato = 'Indique el número de contrato.';
    if (!s.objetoObra.trim()) e.objetoObra = 'Indique el objeto de la obra.';
    if (!s.coasegurado.trim()) e.coasegurado = 'Introduzca el nombre del coasegurado.';
  }

  const { limite, tasa } = s;
  if (limite === null || limite < LIMITE_MIN || limite > LIMITE_MAX || redondear(limite) !== limite) {
    e.limite = 'El límite inicial debe estar entre 5.000 y 1.000.000 (máx. 2 decimales).';
  }
  if (clase && (tasa === null || tasa < clase.min - 1e-7 || tasa > clase.max + 1e-7)) {
    e.tasa = `Rango permitido: ${clase.min}% - ${clase.max}%`;
  }

  const condicionesValidas = s.esContrato ? [...new Set(s.condiciones)].filter((x) => x >= 0 && x <= 3).sort((a, b) => a - b) : [];
  const alternativas = !e.limite && !e.tasa && limite !== null && tasa !== null && tasa > 0
    ? alternativasRcg(limite, tasa, s.moneda) : [];
  const nombres = s.esContrato ? RCG_CON_CONTRATO : RCG_SIN_CONTRATO;

  return {
    errores: e,
    restringida,
    alternativas,
    coberturas: nombres.map((nombre) => ({ nombre, montos: alternativas.map((a) => sublimite(nombre, a.limite)) })),
    condiciones: [...condicionesValidas, RCG_CONDICION_FIJA].map((i) => RCG_CONDICIONES[i]),
    deducible: deducibleRcg(s.moneda),
    notaIgtf: s.moneda !== 'Bs.',
  };
}

export const tasaPromedio = (c: ClaseRcg): number => Number(((c.min + c.max) / 2).toFixed(2));
