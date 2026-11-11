// Pastora (ramo 25, Riesgos Especiales: biomasa de ganado de engorde). Armado puro del payload de
// POST v1/riesgos-generales/emision y validaciones del front, alineadas con el DTO y el cálculo de biomasa de nest-api.
// Suma asegurada (condicionado): SA0 = B0 × PKC, con B0 = kg iniciales (animales × peso promedio) y PKC = precio por kg.
// La prima NO se calcula aquí: la calcula nest-api (tasa provisional) y solo se muestra con su respuesta.

export const RAMO_PASTORA = 25;

/** Plazo contractual de engorde (meses) ↔ plan de Sis2000. Solo existen estos planes en el ramo 25. */
export const PLANES_PASTORA = [
  { meses: 6, cplan: 'PAS06' },
  { meses: 12, cplan: 'PAS12' },
  { meses: 18, cplan: 'PAS18' },
  { meses: 24, cplan: 'PAS24' },
] as const;

export const planDePlazo = (meses: number) => PLANES_PASTORA.find((p) => p.meses === meses)?.cplan ?? null;
export const plazoDePlan = (cplan: string) => PLANES_PASTORA.find((p) => p.cplan === cplan)?.meses ?? null;

export interface CoberturaPastora { ccober: string; nombre: string; obligatoria: boolean }

export const COBERTURAS_PASTORA: CoberturaPastora[] = [
  { ccober: '901', nombre: 'Déficit de engorde', obligatoria: true },
  { ccober: '902', nombre: 'Abigeato', obligatoria: true },
  { ccober: '903', nombre: 'Catástrofe', obligatoria: true },
  { ccober: '904', nombre: 'Transporte', obligatoria: false },
];

/** Peso promedio que acepta nest-api sin asignación expresa de escalón (Anexo I) y tope de ingreso (2.5). */
export const PESO_MINIMO = 180;
export const PESO_MAXIMO = 350;

export const TIPOS_DOCUMENTO = ['J', 'V', 'E', 'G'] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];
export const esPersonaNatural = (t: string) => t === 'V' || t === 'E';

/** Estado del formulario: los números se guardan como texto (lo que escribe el usuario). */
export interface FormPastora {
  cplan: string;
  /** 904 Transporte (opcional); 901–903 van siempre. */
  transporte: boolean;
  cantidad_animales: string;
  peso_promedio: string;
  fecha_inicio: string;
  horizonte_meses: number;
  lote: string;
  ihl: string;
  precio_kg: string;
  tipo_cedula: TipoDocumento;
  rif: string;
  nombre: string;
  apellido: string;
  direccion: string;
  telefono: string;
  correo: string;
  bien: string;
  direccion_riesgo: string;
  productor: string;
}

export const FORM_INICIAL: FormPastora = {
  cplan: 'PAS06', transporte: false,
  cantidad_animales: '', peso_promedio: '', fecha_inicio: '', horizonte_meses: 6, lote: '', ihl: '',
  precio_kg: '',
  tipo_cedula: 'J', rif: '', nombre: '', apellido: '', direccion: '', telefono: '', correo: '',
  bien: '', direccion_riesgo: '', productor: '80080',
};

/** "2,5" o "2.5" → 2.5; vacío o inválido → NaN. */
export function numero(t: string): number {
  const s = String(t ?? '').trim().replace(/\s/g, '');
  if (!s) return NaN;
  // Con punto y coma a la vez, el punto es separador de miles (1.234,5).
  const norm = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  return /^-?\d+(\.\d+)?$/.test(norm) ? Number(norm) : NaN;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r4 = (n: number) => Math.round((n + Number.EPSILON) * 1e4) / 1e4;
const decimales = (n: number) => (String(n).split('.')[1] ?? '').length;

/** B0: kg iniciales = animales × peso promedio (4 decimales, como el DTO). null si falta un dato. */
export function kgIniciales(f: Pick<FormPastora, 'cantidad_animales' | 'peso_promedio'>): number | null {
  const a = numero(f.cantidad_animales);
  const p = numero(f.peso_promedio);
  return a > 0 && p > 0 ? r4(a * p) : null;
}

/** SA0 = B0 × PKC (2 decimales, como sumaPorCalculo de nest-api). */
export function sumaAsegurada(f: Pick<FormPastora, 'cantidad_animales' | 'peso_promedio' | 'precio_kg'>): number | null {
  const b0 = kgIniciales(f);
  const pkc = numero(f.precio_kg);
  return b0 != null && pkc > 0 ? r2(b0 * pkc) : null;
}

export type ErroresPastora = Partial<Record<keyof FormPastora, string>>;

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Validación previa al envío; mismas reglas que el DTO y calcularBiomasa de nest-api, con mensajes de negocio. */
export function validarPastora(f: FormPastora): ErroresPastora {
  const e: ErroresPastora = {};
  if (!planDePlazo(f.horizonte_meses) || plazoDePlan(f.cplan) !== f.horizonte_meses) e.cplan = 'Elija un plazo de engorde (6, 12, 18 o 24 meses).';

  const animales = numero(f.cantidad_animales);
  if (!Number.isInteger(animales) || animales < 1) e.cantidad_animales = 'Indique la cantidad de animales (número entero mayor a 0).';
  else if (animales > 1_000_000) e.cantidad_animales = 'Máximo 1.000.000 de animales por lote.';

  const peso = numero(f.peso_promedio);
  if (!(peso > 0)) e.peso_promedio = 'Indique el peso promedio inicial en kg.';
  else if (decimales(peso) > 4) e.peso_promedio = 'El peso promedio admite hasta 4 decimales.';
  else if (peso < PESO_MINIMO) e.peso_promedio = `Con menos de ${PESO_MINIMO} kg de promedio el lote requiere asignación expresa de escalón (Anexo I): no se emite por aquí.`;
  else if (peso > PESO_MAXIMO) e.peso_promedio = `El peso promedio supera el tope de ingreso de ${PESO_MAXIMO} kg por animal.`;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.fecha_inicio) || Number.isNaN(Date.parse(`${f.fecha_inicio}T00:00:00Z`))) {
    e.fecha_inicio = 'Indique la fecha de certificación inicial del lote.';
  }

  const lote = f.lote.trim();
  if (!lote) e.lote = 'El código de lote es obligatorio (un lote solo puede tener una póliza vigente).';
  else if (lote.length > 30) e.lote = 'El código de lote admite hasta 30 caracteres.';
  else if (lote.includes(';')) e.lote = 'El código de lote no puede tener punto y coma.';

  const ihl = f.ihl.trim();
  if (!ihl) e.ihl = 'Indique el Índice de Homogeneidad del Lote (IHL) que entregó la certificadora.';
  else if (ihl.length > 20) e.ihl = 'El IHL admite hasta 20 caracteres.';

  const pkc = numero(f.precio_kg);
  if (!(pkc > 0)) e.precio_kg = 'Indique el precio por kg contratado.';
  else if (decimales(pkc) > 2) e.precio_kg = 'El precio por kg admite hasta 2 decimales.';

  if (!TIPOS_DOCUMENTO.includes(f.tipo_cedula)) e.tipo_cedula = 'Elija el tipo de documento.';
  if (!/^\d{1,9}$/.test(f.rif.trim())) e.rif = 'El RIF o la cédula lleva solo números, hasta 9 dígitos.';
  if (!f.nombre.trim()) e.nombre = esPersonaNatural(f.tipo_cedula) ? 'Indique el nombre.' : 'Indique la razón social.';
  if (esPersonaNatural(f.tipo_cedula) && !f.apellido.trim()) e.apellido = 'Indique el apellido.';
  if (!f.direccion.trim()) e.direccion = 'Indique la dirección del tomador.';
  if (!/^0\d{10}$/.test(f.telefono.replace(/[\s-]/g, ''))) e.telefono = 'Teléfono de 11 dígitos, p. ej. 04121234567.';
  if (!CORREO.test(f.correo.trim())) e.correo = 'Indique un correo válido.';

  if (!f.bien.trim()) e.bien = 'Describa el bien asegurado.';
  else if (f.bien.trim().length > 250) e.bien = 'La descripción admite hasta 250 caracteres.';
  if (!f.direccion_riesgo.trim()) e.direccion_riesgo = 'La dirección del riesgo (dónde está el lote) es obligatoria.';

  const productor = numero(f.productor);
  if (!Number.isInteger(productor) || productor < 1) e.productor = 'Código de productor inválido.';
  return e;
}

/** Payload de POST v1/riesgos-generales/emision (también sirve para /cotizacion: ignora tomador y riesgo). */
export function armarPayloadPastora(f: FormPastora) {
  const persona = esPersonaNatural(f.tipo_cedula);
  return {
    cramo: RAMO_PASTORA,
    cplan: f.cplan,
    coberturas: COBERTURAS_PASTORA.filter((c) => c.obligatoria || (c.ccober === '904' && f.transporte)).map((c) => ({ ccober: c.ccober })),
    calculo: { unidades: kgIniciales(f) ?? 0, valor_unidad: numero(f.precio_kg) },
    biomasa: {
      cantidad_animales: numero(f.cantidad_animales),
      peso_promedio: numero(f.peso_promedio),
      fecha_inicio: f.fecha_inicio,
      horizonte_meses: f.horizonte_meses,
      lote: f.lote.trim(),
      ihl: f.ihl.trim(),
    },
    tomador: {
      tipo_cedula: f.tipo_cedula,
      rif: f.rif.trim(),
      nombre: f.nombre.trim(),
      apellido: persona ? f.apellido.trim() : '',
      direccion: f.direccion.trim(),
      telefono: f.telefono.replace(/[\s-]/g, ''),
      correo: f.correo.trim(),
    },
    bien: f.bien.trim(),
    direccion_riesgo: f.direccion_riesgo.trim(),
    productor: numero(f.productor),
  };
}

export type PayloadPastora = ReturnType<typeof armarPayloadPastora>;

type Obj = Record<string, unknown>;
const esObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

/** Lo que devuelve nest-api al cotizar o emitir, ya desenvuelto de { status, data }. */
export interface ResultadoPastora {
  cnpoliza: string | null;
  cnrecibo: string | null;
  urlpoliza: string | null;
  prima: number | null;
  suma: number | null;
  coberturas: { ccober: string; nombre: string; suma: number | null; prima: number | null }[];
  avisoLote: string | null;
}

export function parsearResultadoPastora(body: unknown): ResultadoPastora {
  let d: unknown = body;
  for (let i = 0; i < 3 && esObj(d) && esObj(d.data); i++) d = d.data;
  const o = esObj(d) ? d : {};
  // Emisión trae la cotización en `cotizacion`; la cotización viene plana.
  const cot = esObj(o.cotizacion) ? o.cotizacion : o;
  const txt = (v: unknown) => (v == null ? '' : String(v).trim()) || null;
  return {
    cnpoliza: txt(o.cnpoliza),
    cnrecibo: txt(o.cnrecibo),
    urlpoliza: txt(o.urlpoliza),
    prima: num(cot.prima_total),
    suma: num(cot.suma_asegurada),
    coberturas: (Array.isArray(cot.coberturas) ? cot.coberturas : []).filter(esObj).map((c) => ({
      ccober: String(c.ccober ?? '').trim(),
      nombre: String(c.xcobertura ?? '').trim(),
      suma: num(c.suma_asegurada),
      prima: num(c.prima),
    })),
    avisoLote: txt(cot.aviso_lote),
  };
}

/** Mensaje de error de nest-api tal cual (message string o lista de class-validator); si no hay, uno por status. */
export function mensajeErrorPastora(status: number, body: unknown): string {
  for (let d = body, i = 0; esObj(d) && i < 4; d = d.data, i++) {
    const m = d.message ?? d.error;
    if (Array.isArray(m) && m.length) return m.map(String).join('; ');
    if (typeof m === 'string' && m.trim() && !(status === 404 && /^Cannot (GET|POST)/i.test(m))) return m.trim();
  }
  if (status === 404) return 'Ruta no disponible: revise NEST_API_URL en .env.local (la emisión solo va contra QA/dev).';
  if (status === 401 || status === 403) return 'nest-api rechazó la key del cotizador (NEST_API_KEY o permiso emissions:riesgos-generales).';
  if (status === 502 || status === 503 || status === 504) return 'nest-api o Sis2000 no respondieron. Intente de nuevo en unos minutos.';
  return `Error HTTP ${status}.`;
}
