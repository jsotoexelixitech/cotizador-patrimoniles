// Llenado de las solicitudes aprobadas de La Mundial (Word con campos de formulario) sin cambiar su diseño.
// Las plantillas usan campos heredados de Word (FORMTEXT / FORMCHECKBOX, protegidos «solo formularios») y controles de
// contenido (fecha y lista «Moneda»). Aquí solo se tocan los resultados de esos campos dentro de word/document.xml:
// el resto del archivo (estilos, encabezados, logos, protección) viaja intacto. Módulo puro: sirve en el navegador y en
// las pruebas (Node).
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

export type TipoCampo = 'texto' | 'casilla';

/** Campo de formulario heredado, en el orden en que aparece en el documento. */
export interface CampoFormulario {
  n: number;
  tipo: TipoCampo;
  /** Inicio de la fila de la tabla que lo contiene (agrupa los campos de una misma fila). */
  filaId: number;
  /** Texto de la fila de la tabla desde su inicio hasta el campo (etiquetas incluidas). */
  fila: string;
  /** Texto entre el campo anterior de la misma fila (o el inicio de la fila) y este. */
  etiqueta: string;
  /** Texto que sigue al campo hasta el próximo campo o el fin de la celda (el rótulo de una casilla va después). */
  rotulo: string;
  /** Últimos caracteres del documento antes del campo (encabezados de sección y de columnas). */
  antes: string;
  /** Borde derecho de su celda en puntos desde el borde izquierdo de la tabla (0 = fuera de tabla). */
  derecha: number;
  /** Celda y párrafo donde está (para escribir encima del PDF). */
  diseno: Diseno;
  /** Texto actual (resultado del campo) o si la casilla está marcada. */
  valor: string;
  marcada: boolean;
}

export type TipoControl = 'fecha' | 'lista' | 'otro';

export interface ControlContenido {
  n: number;
  tipo: TipoControl;
  alias: string;
  fila: string;
  derecha: number;
  diseno: Diseno;
  valor: string;
}

/**
 * Celda y párrafo de un campo, en puntos desde el borde izquierdo de la tabla. En un párrafo centrado Word no informa bien la
 * posición del campo: el PDF la calcula con el centro de la celda y el texto que lo rodea.
 */
export interface Diseno {
  izquierda: number; derecha: number; centrado: boolean; antes: Tramo[]; despues: Tramo[];
  /** Sombreado de la celda (hex, p. ej. F2F2F2) o null: con ese color se tapa el texto de ejemplo. */
  fondo: string | null;
}

/** Texto de un run con su letra (tam: puntos; null = la del campo). */
export interface Tramo { texto: string; negrita: boolean; tam: number | null }

/** Runs de un tramo de párrafo con su negrita y tamaño (w:sz viene en medios puntos). */
function tramosDe(xml: string): Tramo[] {
  return [...xml.matchAll(/<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g)].map((m) => {
    const rPr = (m[1].match(/<w:rPr>[\s\S]*?<\/w:rPr>/) ?? [''])[0];
    const sz = rPr.match(/<w:sz w:val="(\d+)"/);
    return { texto: textoDe(m[1]), negrita: /<w:b\/>/.test(rPr), tam: sz ? Number(sz[1]) / 2 : null };
  }).filter((t) => t.texto);
}

export interface Relleno {
  /** Campo de texto (n) → texto. */
  textos?: Record<number, string>;
  /** Casillas a marcar (n). */
  casillas?: number[];
  /** Control de fecha (n) → fecha. */
  fechas?: Record<number, Date>;
  /** Control de lista (n) → texto de uno de sus elementos. */
  listas?: Record<number, string>;
  /** Fecha del campo TIME de «Fechado en …, el …» (el texto que se ve hasta que Word actualice el campo). */
  fechado?: Date;
}

const escapar = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const desescapar = (t: string) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
/** Quita caracteres que XML 1.0 no admite. */
const limpiar = (t: string) => t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '');

const textoDe = (xml: string) => desescapar([...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(''));
/** Texto con un espacio entre párrafos y celdas, sin espacios repetidos. */
const textoPlano = (xml: string) => desescapar([...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<\/w:p>|<\/w:tc>/g)]
  .map((m) => m[1] ?? ' ').join('')).replace(/\s+/g, ' ').trim();

/** Inicio de la etiqueta de apertura de un elemento `<w:r>` (no `<w:rPr>`) anterior a `pos`. */
function inicioRun(xml: string, pos: number): number {
  return Math.max(xml.lastIndexOf('<w:r>', pos), xml.lastIndexOf('<w:r ', pos));
}

/** Fin (después de `</w:r>`) del run que contiene `pos`. */
const finRun = (xml: string, pos: number) => xml.indexOf('</w:r>', pos) + '</w:r>'.length;

const inicioFila = (xml: string, pos: number) => Math.max(xml.lastIndexOf('<w:tr>', pos), xml.lastIndexOf('<w:tr ', pos), 0);

/**
 * Bordes izquierdo y derecho (puntos desde el borde izquierdo de la tabla) de la celda que contiene `pos`. Word ubica las
 * celdas por la grilla de la tabla (w:gridCol + w:gridSpan + w:gridBefore), no por el ancho preferido de cada celda (tcW).
 */
function bordesCelda(xml: string, fila: number, pos: number): { izquierda: number; derecha: number; fondo: string | null } {
  if (!fila) return { izquierda: 0, derecha: 0, fondo: null };
  const tramo = xml.slice(fila, pos);
  const grilla = xml.lastIndexOf('<w:tblGrid>', fila);
  const columnas = grilla < 0 ? [] : [...xml.slice(grilla, xml.indexOf('</w:tblGrid>', grilla)).matchAll(/<w:gridCol w:w="(\d+)"/g)].map((m) => Number(m[1]) / 20);
  const celdas = [...tramo.matchAll(/<w:tc>|<w:tc /g)].map((m) => {
    const tcPr = (tramo.slice(m.index!).match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/) ?? [''])[0];
    const fill = (tcPr.match(/<w:shd [^>]*w:fill="([0-9A-Fa-f]{6})"/) ?? [])[1] ?? null;
    return { span: Number((tcPr.match(/<w:gridSpan w:val="(\d+)"/) ?? [])[1] ?? 1), tcW: Number((tcPr.match(/<w:tcW w:w="(\d+)"/) ?? [])[1] ?? 0) / 20, fill };
  });
  if (!celdas.length) return { izquierda: 0, derecha: 0, fondo: null };
  const suma = (desde: number, hasta: number) => columnas.slice(desde, hasta).reduce((t, w) => t + w, 0);
  let col = Number((tramo.match(/<w:gridBefore w:val="(\d+)"/) ?? [])[1] ?? 0);
  for (const c of celdas.slice(0, -1)) col += c.span;
  const propia = celdas[celdas.length - 1];
  if (columnas.length >= col + propia.span) return { izquierda: suma(0, col), derecha: suma(0, col + propia.span), fondo: propia.fill };
  // Sin grilla: anchos preferidos de las celdas.
  const antes = Number((tramo.match(/<w:wBefore w:w="(\d+)"/) ?? [])[1] ?? 0) / 20;
  const izquierda = antes + celdas.slice(0, -1).reduce((t, c) => t + c.tcW, 0);
  return { izquierda, derecha: izquierda + propia.tcW, fondo: propia.fill };
}

const bordeDerecho = (xml: string, fila: number, pos: number) => bordesCelda(xml, fila, pos).derecha;

/** Celda (desde el borde izquierdo de la tabla) y párrafo del tramo [inicio, fin) del documento. */
function disenoDe(xml: string, fila: number, inicio: number, fin: number): Diseno {
  const { izquierda, derecha, fondo } = bordesCelda(xml, fila, inicio);
  const pIni = Math.max(xml.lastIndexOf('<w:p>', inicio), xml.lastIndexOf('<w:p ', inicio), 0);
  const pFin = xml.indexOf('</w:p>', fin);
  const pPr = (xml.slice(pIni, inicio).match(/<w:pPr>[\s\S]*?<\/w:pPr>/) ?? [''])[0];
  return {
    izquierda, derecha, fondo,
    centrado: /<w:jc w:val="center"\/>/.test(pPr),
    antes: tramosDe(xml.slice(pIni, inicio)), despues: tramosDe(xml.slice(fin, pFin < 0 ? fin : pFin)),
  };
}

interface Ubicado { begin: number; ffData: string; separate: number; end: number }

const RE_BEGIN_FF = /<w:fldChar w:fldCharType="begin"(?:\s[^>]*)?><w:ffData>([\s\S]*?)<\/w:ffData>/g;

/** Campos heredados con su posición: begin (inicio del run), separate y end (posición del fldChar). */
function ubicarCampos(xml: string): Ubicado[] {
  const out: Ubicado[] = [];
  for (const m of xml.matchAll(RE_BEGIN_FF)) {
    const pos = m.index!;
    const separate = xml.indexOf('<w:fldChar w:fldCharType="separate"', pos);
    const end = xml.indexOf('<w:fldChar w:fldCharType="end"', pos);
    if (separate < 0 || end < 0 || separate > end) throw new Error('Campo de formulario sin separate/end.');
    out.push({ begin: inicioRun(xml, pos), ffData: m[1], separate, end });
  }
  return out;
}

const resultadoDe = (xml: string, u: Ubicado) => xml.slice(finRun(xml, u.separate), inicioRun(xml, u.end));

export function camposDe(xml: string): CampoFormulario[] {
  const ubicados = ubicarCampos(xml);
  return ubicados.map((u, n) => {
    const tipo: TipoCampo = /<w:checkBox/.test(u.ffData) ? 'casilla' : 'texto';
    const fila = inicioFila(xml, u.begin);
    const previo = n > 0 && ubicados[n - 1].end > fila ? ubicados[n - 1].end : fila;
    const finCampo = finRun(xml, u.end);
    const finCelda = xml.indexOf('</w:tc>', finCampo);
    const siguiente = ubicados[n + 1]?.begin ?? xml.length;
    return {
      n, tipo, filaId: fila, derecha: bordeDerecho(xml, fila, u.begin), diseno: disenoDe(xml, fila, u.begin, finCampo),
      fila: textoPlano(xml.slice(fila, u.begin)),
      etiqueta: textoPlano(xml.slice(previo, u.begin)),
      rotulo: textoPlano(xml.slice(finCampo, Math.min(siguiente, finCelda < 0 ? xml.length : finCelda))),
      antes: textoPlano(xml.slice(Math.max(0, u.begin - 8000), u.begin)).slice(-160),
      valor: tipo === 'texto' ? textoDe(resultadoDe(xml, u)) : '',
      marcada: tipo === 'casilla' && (/<w:checked\/>|<w:checked w:val="(1|true|on)"\/>/.test(u.ffData) || (/<w:default w:val="1"\/>/.test(u.ffData) && !/<w:checked w:val="(0|false|off)"/.test(u.ffData))),
    };
  });
}

interface SdtUbicado { inicio: number; pr: [number, number]; contenido: [number, number]; sdtPr: string }

function ubicarControles(xml: string): SdtUbicado[] {
  const out: SdtUbicado[] = [];
  let pos = 0;
  for (;;) {
    const inicio = xml.indexOf('<w:sdt>', pos);
    if (inicio < 0) break;
    const prIni = xml.indexOf('<w:sdtPr>', inicio);
    const prFin = xml.indexOf('</w:sdtPr>', prIni) + '</w:sdtPr>'.length;
    const cIni = xml.indexOf('<w:sdtContent>', prFin) + '<w:sdtContent>'.length;
    const cFin = xml.indexOf('</w:sdtContent>', cIni);
    out.push({ inicio, pr: [prIni, prFin], contenido: [cIni, cFin], sdtPr: xml.slice(prIni, prFin) });
    pos = prFin;
  }
  return out;
}

export function controlesDe(xml: string): ControlContenido[] {
  return ubicarControles(xml).map((s, n) => ({
    n,
    tipo: /<w:date[ >/]/.test(s.sdtPr) ? 'fecha' : /<w:dropDownList|<w:comboBox/.test(s.sdtPr) ? 'lista' : 'otro',
    alias: (s.sdtPr.match(/<w:alias w:val="([^"]*)"/) ?? [])[1] ?? '',
    fila: textoPlano(xml.slice(inicioFila(xml, s.inicio), s.inicio)),
    derecha: bordeDerecho(xml, inicioFila(xml, s.inicio), s.inicio),
    diseno: disenoDe(xml, inicioFila(xml, s.inicio), s.inicio, xml.indexOf('</w:sdt>', s.contenido[1]) + '</w:sdt>'.length),
    valor: textoDe(xml.slice(...s.contenido)),
  }));
}

/** Propiedades del primer run (sin el gris del texto de ejemplo). */
function rPrDe(runs: string): string {
  const rPr = (runs.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) ?? [''])[0];
  return rPr.replace(/<w:color [^>]*\/>/g, '').replace(/<w:rStyle w:val="(Textodelmarcadordeposicin|PlaceholderText)"\/>/g, '');
}

const run = (rPr: string, texto: string) => `<w:r>${rPr}<w:t xml:space="preserve">${escapar(limpiar(texto))}</w:t></w:r>`;

const dosDigitos = (n: number) => String(n).padStart(2, '0');
export const fechaCorta = (d: Date) => `${dosDigitos(d.getDate())}/${dosDigitos(d.getMonth() + 1)}/${d.getFullYear()}`;
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const fechaLarga = (d: Date) => `${dosDigitos(d.getDate())} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
const fechaIso = (d: Date) => `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-${dosDigitos(d.getDate())}T00:00:00Z`;

interface Edicion { desde: number; hasta: number; texto: string }

/** Aplica el relleno a word/document.xml. Los campos que no aparecen en el relleno quedan como en la plantilla. */
export function llenarXml(xml: string, r: Relleno): string {
  const ediciones: Edicion[] = [];
  const campos = ubicarCampos(xml);
  const casillas = new Set(r.casillas ?? []);
  campos.forEach((u, n) => {
    const esCasilla = /<w:checkBox/.test(u.ffData);
    if (esCasilla && casillas.has(n)) {
      const ff = xml.indexOf(u.ffData, u.begin);
      // Algunas casillas traen <w:checked w:val="0"/> explícito: se reemplaza; si no, se agrega.
      const previo = u.ffData.match(/<w:checked(?: w:val="[^"]*")?\/>/);
      if (previo) {
        const desde = ff + previo.index!;
        ediciones.push({ desde, hasta: desde + previo[0].length, texto: '<w:checked/>' });
      } else {
        const cierre = xml.indexOf('</w:checkBox>', ff);
        ediciones.push({ desde: cierre, hasta: cierre, texto: '<w:checked/>' });
      }
    }
    const texto = r.textos?.[n];
    if (!esCasilla && texto !== undefined) {
      const desde = finRun(xml, u.separate);
      const hasta = inicioRun(xml, u.end);
      ediciones.push({ desde, hasta, texto: run(rPrDe(xml.slice(desde, hasta) || xml.slice(u.begin, u.separate)), texto) });
    }
  });
  for (const n of [...casillas, ...Object.keys(r.textos ?? {}).map(Number)]) {
    if (!campos[n]) throw new Error(`La plantilla no tiene el campo ${n}.`);
  }

  const controles = ubicarControles(xml);
  const valorControl = (n: number, sdt: SdtUbicado, texto: string, ajustarPr: (pr: string) => string) => {
    if (!sdt) throw new Error(`La plantilla no tiene el control ${n}.`);
    ediciones.push({ desde: sdt.pr[0], hasta: sdt.pr[1], texto: ajustarPr(sdt.sdtPr.replace(/<w:showingPlcHdr\/>/, '')) });
    const contenido = xml.slice(...sdt.contenido);
    ediciones.push({ desde: sdt.contenido[0], hasta: sdt.contenido[1], texto: run(rPrDe(contenido), texto) });
  };
  for (const [k, fecha] of Object.entries(r.fechas ?? {})) {
    const n = Number(k);
    valorControl(n, controles[n], fechaCorta(fecha), (pr) => pr.replace(/<w:date(?=[ >])(?: w:fullDate="[^"]*")?/,`<w:date w:fullDate="${fechaIso(fecha)}"`));
  }
  for (const [k, texto] of Object.entries(r.listas ?? {})) {
    const n = Number(k);
    const sdt = controles[n];
    if (sdt && !new RegExp(`w:displayText="${escapar(texto).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(sdt.sdtPr)) {
      throw new Error(`La lista ${n} no tiene el elemento «${texto}».`);
    }
    valorControl(n, sdt, texto, (pr) => pr.replace(/<w:dropDownList(?: w:lastValue="[^"]*")?>/, `<w:dropDownList w:lastValue="${escapar(texto)}">`));
  }

  if (r.fechado) {
    const instr = xml.search(/<w:instrText[^>]*> TIME \\@/);
    if (instr >= 0) {
      const separate = xml.indexOf('<w:fldChar w:fldCharType="separate"', instr);
      const end = xml.indexOf('<w:fldChar w:fldCharType="end"', separate);
      const desde = finRun(xml, separate);
      const hasta = inicioRun(xml, end);
      ediciones.push({ desde, hasta, texto: run(rPrDe(xml.slice(desde, hasta)), fechaLarga(r.fechado)) });
    }
  }

  ediciones.sort((a, b) => b.desde - a.desde || b.hasta - a.hasta);
  let salida = xml;
  for (const e of ediciones) salida = salida.slice(0, e.desde) + e.texto + salida.slice(e.hasta);
  return salida;
}

const DOCUMENTO = 'word/document.xml';

/** Lee word/document.xml de un .docx. */
export const documentoXml = (docx: Uint8Array): string => {
  const archivos = unzipSync(docx, { filter: (f) => f.name === DOCUMENTO });
  if (!archivos[DOCUMENTO]) throw new Error('El archivo no es un documento de Word (.docx).');
  return strFromU8(archivos[DOCUMENTO]);
};

/** Copia del .docx con el relleno aplicado; todo lo demás del paquete queda igual. */
export function llenarDocx(plantilla: Uint8Array, r: Relleno): Uint8Array {
  const archivos = unzipSync(plantilla);
  const xml = archivos[DOCUMENTO];
  if (!xml) throw new Error('La plantilla no es un documento de Word (.docx).');
  archivos[DOCUMENTO] = strToU8(llenarXml(strFromU8(xml), r));
  return zipSync(archivos, { level: 6 });
}
