// Condicionado General y Particular del RCG y anexos de cobertura (minuta La Mundial 30-oct-2026:
// "Inclusión obligatoria de anexos de cobertura"). Los PDF oficiales viven en ./assets/condicionados.
// Cada anexo se asocia a su cobertura por nombre (cotizador RCG) y por código de Sis2000 (`ccober`, ramo 28),
// derivado de tarifas/data/mapeo-sis2000.ts: así también acompaña a los planes de Sis2000 y al combo de coberturas.
import { MAPEO_RCG, RAMOS_RC } from '../tarifas/data/mapeo-sis2000';

export interface DocumentoRcg {
  /** Identificador estable (nombre del archivo sin extensión). */
  id: string;
  titulo: string;
  archivo: string;
  /** Coberturas del RCG (tarifas/rcg.ts) que activan el anexo. Vacío = siempre incluido. */
  coberturas: string[];
  /** Códigos de cobertura de Sis2000 (ramo 28, todas las monedas) que activan el anexo; salen del mapeo por concepto. */
  ccober: string[];
  /** Solo si la cotización es en divisa (USD/EUR). */
  soloDivisa?: boolean;
}

export const CONDICIONADO_GENERAL: DocumentoRcg = {
  id: 'condicionado-general-particular-rcg',
  titulo: 'Condicionado General y Particular - Responsabilidad Civil General',
  archivo: 'condicionado-general-particular-rcg.pdf',
  coberturas: [],
  ccober: [],
};

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s*\(prima.*\)$/, '').trim();

/** ccober de Sis2000 (ramo 28, USD/BS/EUR) de los conceptos del cotizador, según MAPEO_RCG. */
export function ccoberDeConceptos(conceptos: string[]): string[] {
  const buscados = new Set(conceptos.map(norm));
  return [...new Set(MAPEO_RCG.filter((m) => buscados.has(norm(m.concepto))).flatMap((m) => Object.values(m.ccober)))];
}

/** Anexos oficiales mapeados por nombre a las coberturas del RCG (el `ccober` se deriva abajo del mapeo de Sis2000). */
const ANEXOS_BASE: Omit<DocumentoRcg, 'ccober'>[] = [
  { id: 'anexo-riesgo-vecinos', titulo: 'Anexo Riesgo de Vecinos', archivo: 'anexo-riesgo-vecinos.pdf', coberturas: ['Riesgo de Vecinos'] },
  { id: 'anexo-riesgo-locativo', titulo: 'Anexo Riesgo Locativo', archivo: 'anexo-riesgo-locativo.pdf', coberturas: ['Riesgo Locativo'] },
  { id: 'anexo-danos-por-agua', titulo: 'Anexo Daños Causados por Agua', archivo: 'anexo-danos-por-agua.pdf', coberturas: ['Responsabilidad Civil Daños Causados por Agua'] },
  { id: 'anexo-contratistas-independientes', titulo: 'Anexo Contratistas Independientes', archivo: 'anexo-contratistas-independientes.pdf', coberturas: ['Responsabilidad Civil Contratistas Independientes'] },
  { id: 'anexo-vigilantes-privados', titulo: 'Anexo Vigilantes Privados', archivo: 'anexo-vigilantes-privados.pdf', coberturas: ['Responsabilidad Civil por Vigilantes Privados'] },
  { id: 'anexo-actividades-sociales-eventos-deportivos', titulo: 'Anexo Actividades Sociales y Eventos Deportivos', archivo: 'anexo-actividades-sociales-eventos-deportivos.pdf', coberturas: ['Responsabilidad Civil por Actividades Sociales y Eventos Deportivos'] },
  { id: 'anexo-contaminacion-ambiental', titulo: 'Anexo Contaminación Ambiental', archivo: 'anexo-contaminacion-ambiental.pdf', coberturas: ['Responsabilidad Civil de Contaminación Ambiental'] },
  { id: 'anexo-vehiculos-predios-privados', titulo: 'Anexo Vehículos en Predios Privados', archivo: 'anexo-vehiculos-predios-privados.pdf', coberturas: ['Responsabilidad Civil de Vehículos en Predios Privados'] },
  { id: 'anexo-avisos-vallas', titulo: 'Anexo Avisos Luminosos o no y Vallas', archivo: 'anexo-avisos-vallas.pdf', coberturas: ['Responsabilidad Civil de Avisos Luminosos o no y Vallas'] },
  { id: 'anexo-incendio-explosion', titulo: 'Anexo Incendio y/o Explosión', archivo: 'anexo-incendio-explosion.pdf', coberturas: ['Responsabilidad Civil por Incendio y/o Explosión'] },
  { id: 'anexo-defensa-penal-asistencia-legal', titulo: 'Anexo Defensa Penal y Asistencia Legal', archivo: 'anexo-defensa-penal-asistencia-legal.pdf', coberturas: ['Responsabilidad Civil Defensa Penal y Asistencia Legal'] },
  { id: 'anexo-transporte-carga-descarga', titulo: 'Anexo Transporte, Carga y Descarga', archivo: 'anexo-transporte-carga-descarga.pdf', coberturas: ['Responsabilidad Civil de Transporte, Carga y Descarga'] },
  { id: 'anexo-moneda-extranjera', titulo: 'Anexo Cobertura en Moneda Extranjera', archivo: 'anexo-moneda-extranjera.pdf', coberturas: [], soloDivisa: true },
];

/** Anexos oficiales con sus coberturas por nombre y por código de Sis2000. */
export const ANEXOS_RCG: DocumentoRcg[] = ANEXOS_BASE.map((a) => ({ ...a, ccober: ccoberDeConceptos(a.coberturas) }));

// Sin anexo oficial (no se inventa): 'Responsabilidad Civil por Suministro de Alimentos y Bebidas',
// 'Responsabilidad Civil de Ascensores, Grúas y Montacargas' y 'Responsabilidad Civil Cruzada'.

/** Documentos que acompañan la cotización/emisión RCG: condicionado + anexos de las coberturas elegidas. */
export function documentosRcg(coberturas: string[], moneda: string): DocumentoRcg[] {
  const elegidas = new Set(coberturas.map(norm));
  const divisa = esDivisa(moneda);
  const anexos = ANEXOS_RCG.filter((a) => (a.soloDivisa ? divisa : a.coberturas.some((c) => elegidas.has(norm(c)))));
  return [CONDICIONADO_GENERAL, ...anexos];
}

/** Moneda extranjera (USD/EUR, también '$' y '€' como las devuelve Sis2000). */
export const esDivisa = (moneda: string) => /usd|eur|\$|€/i.test(moneda);

/** Cobertura de un plan o combo de Sis2000: con código si la respuesta lo trae; si no, solo el nombre. */
export interface CoberturaSis2000 { ccober?: string | null; nombre?: string | null }

/** Nombre de Sis2000 comparable con el del cotizador: sin «Responsabilidad Civil (de/por)», moneda final ni signos. */
const clave = (s: string) => norm(s)
  .replace(/\((usd|bs\.?|eur|\$)\)/g, ' ')
  .replace(/^(responsabilidad civil|r\.?\s?c\.?)\s+(general\s+)?((de|por|del)\s+)?/, '')
  .replace(/\s+(usd|bs\.?|eur|\$)\s*$/, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

function coincideNombre(anexo: DocumentoRcg, nombres: string[]): boolean {
  return anexo.coberturas.some((c) => {
    const a = clave(c);
    return nombres.some((n) => n === a || (n.length >= 8 && (a.includes(n) || n.includes(a))));
  });
}

/**
 * Documentos para un plan de Sis2000 o un combo de coberturas. Solo el ramo 28 (RCG) lleva el condicionado y los
 * anexos del RCG: en otro ramo devuelve []. Empata por `ccober` (mapeo de Sis2000) y, de respaldo, por nombre.
 */
export function documentosRcgSis2000(cramo: number | null | undefined, coberturas: CoberturaSis2000[], moneda: string): DocumentoRcg[] {
  if (Number(cramo) !== RAMOS_RC.rcg) return [];
  const codigos = new Set(coberturas.map((c) => String(c.ccober ?? '').trim()).filter(Boolean));
  const nombres = coberturas.map((c) => clave(c.nombre ?? '')).filter(Boolean);
  const divisa = esDivisa(moneda);
  const anexos = ANEXOS_RCG.filter((a) => (a.soloDivisa ? divisa : a.ccober.some((c) => codigos.has(c)) || coincideNombre(a, nombres)));
  return [CONDICIONADO_GENERAL, ...anexos];
}

/** URL pública (empaquetada por Vite) de cada PDF oficial, para ver/descargar desde la UI. */
const urls = import.meta.glob('./assets/condicionados/*.pdf', { query: '?url', import: 'default', eager: true }) as Record<string, string>;

export function urlDocumento(d: DocumentoRcg): string {
  return urls[`./assets/condicionados/${d.archivo}`] ?? '';
}

export interface CondicionadoPdf {
  titulo: string;
  bytes: Uint8Array;
}

/** Descarga los PDF oficiales para incrustarlos en la cotización. */
export async function cargarCondicionados(docs: DocumentoRcg[]): Promise<CondicionadoPdf[]> {
  return Promise.all(docs.map(async (d) => ({ titulo: d.titulo, bytes: new Uint8Array(await (await fetch(urlDocumento(d))).arrayBuffer()) })));
}
