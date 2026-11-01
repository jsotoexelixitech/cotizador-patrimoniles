// Ramos patrimoniales de Sis2000 para el combo de coberturas: GET v1/riesgos-generales/ramos (maramos con ctiporamo
// 1 y 6 y cuántas coberturas tienen tarifa vigente). Solo se elige un ramo de esa lista: lo que se escribe (nombre o
// número) la filtra, y un ramo que no está en ella no se elige ni consulta coberturas.
import { errorDeRespuesta, RAMOS_EXCLUIDOS, type RamoCatalogo } from './planes-rcg';

export interface RamoPatrimonial {
  cramo: number;
  xramo: string;
  /** Coberturas con tarifa vigente: 0 = se ve pero no se elige; null = no se sabe (lista de respaldo por planes). */
  qcoberturas: number | null;
}

export const RAMO_NO_EXISTE = 'Ese ramo no existe o no está disponible en Sis2000.';

type Obj = Record<string, unknown>;
const esObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const ordenar = (ramos: RamoPatrimonial[]) => ramos.sort((a, b) => a.xramo.localeCompare(b.xramo, 'es') || a.cramo - b.cramo);

/** GET v1/riesgos-generales/ramos: sin los ramos excluidos (20 y 25) ni repetidos, ordenados por nombre. */
export function parsearRamos(body: unknown): RamoPatrimonial[] {
  const error = errorDeRespuesta(body);
  if (error) throw new Error(error);
  let d = body;
  for (let i = 0; i < 4 && !Array.isArray(d) && esObj(d) && 'data' in d; i++) d = d.data;
  if (!Array.isArray(d)) throw new Error('nest-api no devolvió la lista de ramos.');
  const ramos = new Map<number, RamoPatrimonial>();
  for (const f of d.filter(esObj)) {
    const cramo = Number(f.cramo);
    if (!Number.isInteger(cramo) || cramo <= 0 || RAMOS_EXCLUIDOS.includes(cramo) || ramos.has(cramo)) continue;
    const q = Number(f.qcoberturas ?? 0);
    ramos.set(cramo, { cramo, xramo: String(f.xramo ?? '').trim() || `Ramo ${cramo}`, qcoberturas: Number.isFinite(q) && q > 0 ? q : 0 });
  }
  return ordenar([...ramos.values()]);
}

/** Respaldo mientras nest-api no tenga GET ramos (404): los ramos con planes, sin conteo de coberturas. */
export const ramosDesdePlanes = (catalogo: RamoCatalogo[]): RamoPatrimonial[] =>
  ordenar(catalogo.filter((r) => !RAMOS_EXCLUIDOS.includes(r.cramo)).map((r) => ({ cramo: r.cramo, xramo: r.xramo, qcoberturas: null })));

/** Un ramo sin coberturas con tarifa vigente se muestra deshabilitado. */
export const seleccionable = (r: RamoPatrimonial) => r.qcoberturas !== 0;

/** Detalle en la lista: "ramo 28 · 12 coberturas", "ramo 3 · sin tarifas vigentes" o "ramo 10" (respaldo). */
export function detalleRamo(r: RamoPatrimonial): string {
  if (r.qcoberturas == null) return `ramo ${r.cramo}`;
  if (!r.qcoberturas) return `ramo ${r.cramo} · sin tarifas vigentes`;
  return `ramo ${r.cramo} · ${r.qcoberturas} ${r.qcoberturas === 1 ? 'cobertura' : 'coberturas'}`;
}

/** Minúsculas, sin acentos ni espacios repetidos: "Vehículos" busca igual que "VEHICULOS". */
export const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Palabras buscadas sin "ramo" (así "ramo 28" busca el 28) y los números sin ceros a la izquierda. */
const palabras = (texto: string) =>
  normalizar(texto).split(' ').filter((p) => p && p !== 'ramo').map((p) => (/^\d+$/.test(p) ? String(Number(p)) : p));

/**
 * Ramos que coinciden con lo escrito: cada palabra está en el nombre (sin acentos) o, si es un número, es el comienzo
 * del código del ramo. Sin texto, todos. Primero el código exacto, luego los nombres que empiezan por lo escrito.
 */
export function filtrarRamos(ramos: RamoPatrimonial[], texto: string): RamoPatrimonial[] {
  const ps = palabras(texto);
  if (!ps.length) return ramos;
  const frase = ps.join(' ');
  const rango = (codigo: string, nombre: string) => (codigo === frase ? 0 : nombre.startsWith(frase) ? 1 : 2);
  return ramos
    .map((r) => ({ r, codigo: String(r.cramo), nombre: normalizar(r.xramo) }))
    .filter(({ codigo, nombre }) => ps.every((p) => nombre.includes(p) || (/^\d+$/.test(p) && codigo.startsWith(p))))
    .sort((a, b) => rango(a.codigo, a.nombre) - rango(b.codigo, b.nombre))
    .map((x) => x.r);
}

/**
 * Enter en el buscador: el ramo con ese código exacto o el primero elegible de los resultados. Si nada coincide o el
 * ramo no tiene tarifas vigentes no se elige nada (no se consultan coberturas) y se devuelve el aviso.
 */
export function ramoDeBusqueda(ramos: RamoPatrimonial[], texto: string): { ramo: RamoPatrimonial | null; aviso: string | null } {
  const ps = palabras(texto);
  if (!ps.length) return { ramo: null, aviso: null };
  const resultados = filtrarRamos(ramos, texto);
  if (!resultados.length) return { ramo: null, aviso: RAMO_NO_EXISTE };
  const exacto = resultados.find((r) => String(r.cramo) === ps.join(' '));
  const ramo = exacto ?? resultados.find(seleccionable) ?? resultados[0];
  return seleccionable(ramo)
    ? { ramo, aviso: null }
    : { ramo: null, aviso: `${ramo.xramo} (ramo ${ramo.cramo}) no tiene coberturas con tarifa vigente en Sis2000.` };
}
