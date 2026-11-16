// Versión PDF de la solicitud llena: el formato aprobado exportado por Word en blanco (plantillas/solicitud-<ramo>.pdf)
// con los datos escritos encima, en la posición de cada campo que midió Word (plantillas/*.posiciones.json, ver
// scripts/solicitudes/preparar-plantillas.ps1). Mismo relleno que el .docx (docx.ts / solicitudes.ts). Se usa para
// descargar e imprimir sin Word y para el correo (nest-api solo admite PDF como adjunto).
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import { fechaCorta, fechaLarga, type Diseno, type Relleno, type Tramo } from './docx';

export interface PosicionCampo {
  n?: number;
  /** Página (desde 1). */
  p: number;
  /** Puntos desde la esquina superior izquierda de la página (inicio del campo y parte alta de su línea). */
  x: number;
  y: number;
  /** Tamaño de letra del campo. */
  t: number;
  /** Texto que se ve en el formato en blanco (marcador «dd/mm/aaaa», «Seleccione», «Ciudad»…): se tapa. */
  v: string;
  /** Casilla: el cuadrado que Word dibujó en el PDF [x, y, lado] (scripts/solicitudes/ajustar-casillas.mjs). */
  caja?: number[];
}

export interface Posiciones {
  campos: PosicionCampo[];
  controles: (PosicionCampo & { tipo: number })[];
  fechado: PosicionCampo | null;
}

/** Celda y párrafo de cada campo y control (docx.ts): ancho disponible y posición en párrafos centrados. */
export interface Disenos { campos: Diseno[]; controles: Diseno[] }

const TINTA = rgb(0.08, 0.1, 0.16);
/** Color de la celda (hex de Word) para tapar el texto de ejemplo sin que se note el parche; sin sombreado, blanco. */
const colorFondo = (hex: string | null | undefined) => (hex && /^[0-9A-Fa-f]{6}$/.test(hex)
  ? rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255)
  : rgb(1, 1, 1));
const MIN_LETRA = 6.5;
/** Borde izquierdo de las tablas de los formatos (Word escribe el texto de la primera celda en x = 30 con 5,4 pt de margen). */
const IZQUIERDA_TABLA = 24.6;

export async function generarSolicitudPdf(base: Uint8Array, pos: Posiciones, r: Relleno, disenos?: Disenos): Promise<Uint8Array> {
  const doc = await PDFDocument.load(base);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const paginas = doc.getPages();

  const seguro = (f: PDFFont, t: string) => [...t.replace(/\s+/g, ' ')].map((ch) => {
    try { f.encodeText(ch); return ch; } catch { return '?'; }
  }).join('');
  const ancho = (f: PDFFont, t: string, size: number) => f.widthOfTextAtSize(seguro(f, t), size);

  const anchoTramos = (tramos: Tramo[], t: number) => tramos.reduce((s, x) => s + ancho(x.negrita ? bold : font, x.texto, x.tam ?? t), 0);
  const centrado = (d: Diseno | undefined): d is Diseno => !!d?.centrado && d.derecha > d.izquierda;

  /**
   * x real del texto: en un párrafo centrado (Word informa mal esa posición), el centro de la celda menos media línea más
   * lo que lo precede en el párrafo, con la letra de cada run.
   */
  const xDe = (c: PosicionCampo, d: Diseno | undefined, texto: string, size = c.t) => {
    if (!centrado(d)) return c.x;
    const centro = IZQUIERDA_TABLA + (d.izquierda + d.derecha) / 2;
    const antes = anchoTramos(d.antes, c.t);
    return centro - (antes + ancho(font, texto, size) + anchoTramos(d.despues, c.t)) / 2 + antes;
  };

  /** Tapa el texto de ejemplo del formato (y el cierre del párrafo, `cola`, que se vuelve a escribir después del valor). */
  const tapar = (pg: PDFPage, c: PosicionCampo, d: Diseno | undefined, cola = '') => {
    const v = c.v.trim();
    if (!v) return;
    const x = xDe(c, d, c.v);
    const extra = cola ? ancho(font, cola, c.t) + (centrado(d) ? 6 : 2) : 1;
    pg.drawRectangle({ x: x - 0.5, y: pg.getHeight() - c.y - c.t * 1.25, width: ancho(font, v, c.t) + extra, height: c.t * 1.3, color: colorFondo(d?.fondo) });
  };

  const escribir = (c: PosicionCampo | undefined, valor: string, d?: Diseno) => {
    const pg = c && paginas[c.p - 1];
    if (!c || !pg) return;
    const solo = seguro(font, valor.trim());
    if (!solo || solo === c.v.trim()) return; // El formato ya lo muestra (p. ej. la moneda USD por defecto).
    const H = pg.getHeight();
    // Lo que cierra el párrafo después del campo: si es corto («)», «):») se tapa con el ejemplo y se reescribe tras el valor,
    // así no importa que el valor sea más largo o más corto que «Seleccione».
    const resto = seguro(font, (d?.despues ?? []).map((t) => t.texto).join('').trim());
    const cola = c.v.trim() && resto.length <= 3 ? resto : '';
    const texto = `${solo}${cola}`;
    // Campo dentro de un texto corrido («Yo, ____, como propuesto asegurado…»): el PDF no puede correr el texto que sigue.
    // Solo se escribe si hay un texto de ejemplo que tapar («Ciudad»), achicado a ese ancho; si no, queda para escribir a mano.
    if (d && !centrado(d) && resto && !cola) {
      const hueco = ancho(font, c.v.trim(), c.t);
      if (!hueco) return;
      tapar(pg, c, d);
      let size = Math.min(c.t || 10, 10);
      while (size > MIN_LETRA && font.widthOfTextAtSize(solo, size) > hueco + 2) size -= 0.25;
      pg.drawText(solo, { x: c.x, y: H - c.y - c.t * 0.95, size, font, color: TINTA });
      return;
    }
    tapar(pg, c, d, cola);
    const base = Math.min(c.t || 10, 10);
    // Centrado: todo el ancho de la celda; si no, desde el campo hasta el borde derecho de la celda (o de la página).
    const borde = d && d.derecha > 0 ? IZQUIERDA_TABLA + d.derecha - 4 : pg.getWidth() - 30;
    const disponible = centrado(d) ? d.derecha - d.izquierda - 8 : borde > c.x + 10 ? borde - c.x : pg.getWidth() - c.x - 30;
    let size = base;
    while (size > MIN_LETRA && font.widthOfTextAtSize(texto, size) > disponible) size -= 0.25;
    if (font.widthOfTextAtSize(texto, size) <= disponible) {
      pg.drawText(texto, { x: xDe(c, d, solo, size), y: H - c.y - size * 0.95, size, font, color: TINTA });
      return;
    }
    // No cabe en una línea: hasta tres líneas hacia abajo con la letra mínima.
    const lineas: string[] = [];
    let fila = '';
    for (const palabra of texto.split(' ')) {
      const prueba = fila ? `${fila} ${palabra}` : palabra;
      if (fila && font.widthOfTextAtSize(prueba, size) > disponible) { lineas.push(fila); fila = palabra; } else fila = prueba;
    }
    if (fila) lineas.push(fila);
    lineas.slice(0, 3).forEach((l, i) => {
      pg.drawText(l, { x: xDe(c, d, l, size), y: H - c.y - size * 0.95 - i * size * 1.1, size, font, color: TINTA });
    });
  };

  for (const [k, v] of Object.entries(r.textos ?? {})) escribir(pos.campos[Number(k)], v, disenos?.campos[Number(k)]);
  for (const n of r.casillas ?? []) {
    const c = pos.campos[n];
    const pg = c && paginas[c.p - 1];
    if (!c || !pg) continue;
    const size = (c.t || 10) * 0.95;
    const d = disenos?.campos[n];
    // Casilla sola en un párrafo centrado: centrada en su celda con los espacios que la rodean (la caja mide lo que la letra).
    const caja = c.t || 10;
    const x = centrado(d) && ![...d.antes, ...d.despues].some((t) => t.texto.trim())
      ? IZQUIERDA_TABLA + (d.izquierda + d.derecha) / 2 - (anchoTramos(d.antes, caja) + caja + anchoTramos(d.despues, caja)) / 2 + anchoTramos(d.antes, caja)
      : c.x;
    if (c.caja) {
      const [cx, cy, lado] = c.caja;
      const t = lado * 1.05;
      pg.drawText('X', { x: cx + (lado - bold.widthOfTextAtSize('X', t)) / 2, y: pg.getHeight() - cy - lado + lado * 0.14, size: t, font: bold, color: TINTA });
      continue;
    }
    pg.drawText('X', { x: x + size * 0.12, y: pg.getHeight() - c.y - size * 0.92, size, font: bold, color: TINTA });
  }
  for (const [k, f] of Object.entries(r.fechas ?? {})) escribir(pos.controles[Number(k)], fechaCorta(f), disenos?.controles[Number(k)]);
  for (const [k, v] of Object.entries(r.listas ?? {})) escribir(pos.controles[Number(k)], v, disenos?.controles[Number(k)]);
  if (r.fechado && pos.fechado) escribir(pos.fechado, fechaLarga(r.fechado));

  doc.setTitle('Solicitud de seguro - La Mundial de Seguros, C.A.');
  doc.setAuthor('La Mundial de Seguros, C.A.');
  return doc.save();
}
