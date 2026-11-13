// PDF oficial de cotización RCG: 2 páginas de cotización + 3 páginas de la Solicitud de Seguro RCG.
// Con `plan` genera el mismo documento para un plan de Sis2000 o un combo de coberturas (una sola columna: la
// suma y la prima total); la Solicitud de Seguro RCG solo se agrega en el ramo 28.
// Replica el documento del Apps Script de La Mundial (mismo logo, sello, textos y plantilla de solicitud),
// pero en texto vectorial con pdf-lib en lugar de capturas html2canvas.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib';
import { NOTA_MESA_TECNICA, type AlternativaRcg } from '../tarifas/rcg';
import type { CondicionadoPdf } from './condicionadosRcg';

export interface DatosPdfRcg {
  numero: string;
  fecha: Date;
  asegurado: string;
  rif: string;
  moneda: string;
  indole: string;
  actividadEspecifica: string;
  correo: string;
  intermediario: string;
  ubicacion: string;
  esContrato: boolean;
  numeroContrato: string;
  objetoObra: string;
  coasegurado: string;
  sucursal: string;
  elaboradoPor: string;
  alternativas: AlternativaRcg[];
  coberturas: { nombre: string; montos: number[] }[];
  deducible: string;
  notaIgtf: boolean;
  condiciones: string[];
  /** Días de validez (15 por defecto). */
  vigenciaDias?: number;
  /** Plan de Sis2000 cotizado (opción Planes Sis2000) o combo de coberturas. */
  plan?: PlanPdf;
  /** Actividad restringida: la cotización queda sujeta a aprobación de la mesa técnica. */
  mesaTecnica?: boolean;
}

export interface PlanPdf {
  ramo: string;
  nombre: string;
  cplan: string;
  /** Ramo 28: se conservan los textos del RCG y la Solicitud de Seguro. */
  esRcg: boolean;
  /** Combo de coberturas armado en el cotizador: no es un plan de Sis2000. */
  combo?: boolean;
}

export interface AssetsPdfRcg {
  logo: Uint8Array;
  sello: Uint8Array;
  /** Las 3 páginas de la Solicitud de Seguro RCG (PNG 1020 × 1320, hoja carta). */
  solicitud: Uint8Array[];
  /** Condicionado General y Particular + anexos de las coberturas contratadas (se anexan al final con constancia de recepción). */
  condicionados?: CondicionadoPdf[];
}

const W = 612;
const H = 792;
const L = 40;
const R = 572;
const CW = R - L;
const TOP = H - 38;
const BOTTOM = 56;
const MM = 72 / 25.4;

const hex = (h: string): RGB => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const C = {
  navy: hex('#17235b'), linea: hex('#123693'), tinta: hex('#1e293b'), texto: hex('#334155'), gris: hex('#64748b'),
  filete: hex('#cbd5e1'), suave: hex('#f8fafc'), encabezado: hex('#e2e8f0'), azulTabla: hex('#a9cdec'), azulTabla2: hex('#7799b9'),
  bordeTabla: hex('#6686a8'), acento: hex('#1247d8'), amberFondo: hex('#fffbeb'), amberBorde: hex('#fcd34d'), amberTinta: hex('#92400e'),
  primaLinea: hex('#6c9ac5'), blanco: rgb(1, 1, 1),
};

/** Deja solo caracteres de WinAnsi (las fuentes estándar del PDF no traen más). */
const limpiar = (s: unknown) => String(s ?? '')
  .replace(/[  \t\r\n]+/g, ' ')
  .replace(/[‑−]/g, '-')
  .replace(/[^\x20-\x7e\xa0-\xff–—‘’“”•…€]/g, '')
  ;

const importe = (n: number) => Number(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fechaCorta = (d: Date) => d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });

interface Seg { t: string; b?: boolean }

export async function generarPdfRcg(d: DatosPdfRcg, a: AssetsPdfRcg): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await doc.embedJpg(a.logo);
  const sello = await doc.embedPng(a.sello);
  const fuente = (b?: boolean) => (b ? bold : regular);
  const plan = d.plan;
  const generico = !!plan && !plan.esRcg;
  const producto = generico ? plan.ramo : 'Responsabilidad Civil General';
  // El combo usa el formato del plan genérico con sus propios rótulos.
  const tipo = plan?.combo ? 'combo' : 'plan';

  let page!: PDFPage;
  let y = TOP;

  // ---------- primitivas ----------
  const texto = (p: PDFPage, t: string, x: number, yy: number, size: number, f: PDFFont = regular, color: RGB = C.tinta) =>
    p.drawText(limpiar(t), { x, y: yy, size, font: f, color });
  const ancho = (t: string, size: number, f: PDFFont = regular) => f.widthOfTextAtSize(limpiar(t), size); // sin trim: mide también el espacio
  const derecha = (p: PDFPage, t: string, xDer: number, yy: number, size: number, f: PDFFont = regular, color: RGB = C.tinta) =>
    texto(p, t, xDer - ancho(t, size, f), yy, size, f, color);
  const linea = (p: PDFPage, x1: number, y1: number, x2: number, y2: number, grosor = 0.6, color: RGB = C.filete) =>
    p.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: grosor, color });

  /** Parte segmentos (negrita / normal) en líneas que caben en `max`. */
  function partir(segs: Seg[], max: number, size: number): { w: string; b?: boolean }[][] {
    const palabras = segs.flatMap((s) => limpiar(s.t).split(' ').filter(Boolean).map((w) => ({ w, b: s.b })));
    const lineas: { w: string; b?: boolean }[][] = [];
    let actual: { w: string; b?: boolean }[] = [];
    let usado = 0;
    const esp = ancho(' ', size);
    for (const p of palabras) {
      const wp = ancho(p.w, size, fuente(p.b));
      if (actual.length && usado + esp + wp > max) { lineas.push(actual); actual = []; usado = 0; }
      usado += (actual.length ? esp : 0) + wp;
      actual.push(p);
    }
    if (actual.length) lineas.push(actual);
    return lineas;
  }

  function dibujarLineas(p: PDFPage, lineas: { w: string; b?: boolean }[][], x: number, yy: number, max: number, size: number, alto: number, color: RGB, justificar = false) {
    lineas.forEach((ln, i) => {
      const base = ln.reduce((s, pal) => s + ancho(pal.w, size, fuente(pal.b)), 0);
      const huecos = ln.length - 1;
      const esp = justificar && i < lineas.length - 1 && huecos > 0 ? (max - base) / huecos : ancho(' ', size);
      let cx = x;
      for (const pal of ln) {
        texto(p, pal.w, cx, yy - i * alto, size, fuente(pal.b), color);
        cx += ancho(pal.w, size, fuente(pal.b)) + esp;
      }
    });
  }

  function encabezado(p: PDFPage) {
    const lw = 100;
    const lh = (logo.height / logo.width) * lw;
    p.drawImage(logo, { x: L + 4, y: TOP - lh, width: lw, height: lh });
    texto(p, 'RIF: J0008464648', L + 4, TOP - lh - 9, 6.5, bold, C.navy);
    const anio = d.fecha.getFullYear();
    let yy = TOP - 18;
    const etiqueta = (lab: string, val: string) => {
      const wv = ancho(val, 7.5);
      texto(p, lab, R - wv - ancho(lab + ' ', 7.5, bold), yy, 7.5, bold, C.texto);
      derecha(p, val, R, yy, 7.5, regular, C.gris);
      yy -= 11;
    };
    etiqueta('Fecha:', fechaCorta(d.fecha));
    etiqueta('Ref:', `${plan ? `COT-${plan.cplan}` : 'COT-RCG'}-${anio}`);
    yy -= 2;
    derecha(p, `Cotización N.º: ${d.numero}`, R, yy, 9.5, bold, C.texto);
    const yl = TOP - lh - 18;
    linea(p, L, yl, R, yl, 2, C.linea);
    return yl - 18;
  }

  function pie(p: PDFPage) {
    linea(p, L, 48, R, 48, 0.6, C.filete);
    texto(p, `La Mundial de Seguros, C.A. · ${producto}`, L, 38, 7, regular, C.gris);
    derecha(p, `Cotización elaborada por: ${d.elaboradoPor}`, R, 38, 7, regular, C.gris);
  }

  function nuevaPagina() {
    page = doc.addPage([W, H]);
    y = encabezado(page);
    pie(page);
  }
  const asegurar = (alto: number) => { if (y - alto < BOTTOM) nuevaPagina(); };

  function parrafo(segs: Seg[], size = 9.5, opts: { justificar?: boolean; color?: RGB; despues?: number; x?: number; max?: number } = {}) {
    const x = opts.x ?? L;
    const max = opts.max ?? CW;
    const alto = size * 1.4;
    const lineas = partir(segs, max, size);
    for (let i = 0; i < lineas.length; i++) {
      asegurar(alto);
      dibujarLineas(page, [lineas[i]], x, y - size, max, size, alto, opts.color ?? C.texto, opts.justificar && i < lineas.length - 1);
      y -= alto;
    }
    y -= opts.despues ?? 6;
  }

  // ---------- tablas de opciones ----------
  const n = d.alternativas.length;
  const colPrim = CW * 0.55;
  const colOp = (CW - colPrim) / n;
  const xCol = (i: number) => L + colPrim + colOp * i;

  function celda(p: PDFPage, x: number, yTop: number, w: number, h: number, fondo?: RGB, borde: RGB = C.filete) {
    p.drawRectangle({ x, y: yTop - h, width: w, height: h, color: fondo, borderColor: borde, borderWidth: 0.6 });
  }

  // ================= PÁGINA 1 =================
  nuevaPagina();

  // Título
  const titulo = `COTIZACIÓN DE ${producto.toUpperCase()}`;
  texto(page, titulo, (W - ancho(titulo, 12, bold)) / 2, y - 10, 12, bold, C.navy);
  const sub = plan ? (plan.combo ? `(${plan.nombre})` : `(${plan.nombre} · ${plan.cplan})`) : '(Predios y Operaciones)';
  texto(page, sub, (W - ancho(sub, 7.5)) / 2, y - 22, 7.5, regular, C.gris);
  y -= 32;

  // Tarjeta del cliente
  {
    const size = 8.5;
    const alto = 12;
    const mitad = CW / 2 - 12;
    const filas: (Seg[] | [Seg[], Seg[]] | 'sep')[] = [
      [[{ t: 'Tomador / Asegurado:', b: true }, { t: d.asegurado }], [{ t: 'Moneda de Cuenta:', b: true }, { t: d.moneda }]],
      [{ t: 'Cédula o RIF:', b: true }, { t: d.rif || 'N/A' }],
      ...(generico
        ? [[{ t: plan.combo ? 'Modalidad:' : 'Plan:', b: true }, { t: plan.combo ? plan.nombre : `${plan.nombre} (${plan.cplan})` }], [{ t: 'Bien o actividad asegurada:', b: true }, { t: d.actividadEspecifica }]] as Seg[][]
        : [[{ t: 'Índole:', b: true }, { t: d.indole }], [{ t: 'Índole específica:', b: true }, { t: d.actividadEspecifica }],
          ...(plan ? [[{ t: 'Plan:', b: true }, { t: `${plan.nombre} (${plan.cplan})` }]] : [])] as Seg[][]),
      'sep',
      [[{ t: 'Correo electrónico:', b: true }, { t: d.correo || 'N/A' }], [{ t: 'Intermediario:', b: true }, { t: d.intermediario || 'N/A' }]],
      [{ t: 'Ubicación del riesgo:', b: true }, { t: d.ubicacion || 'N/A' }],
      ...(d.esContrato ? ['sep' as const,
        [{ t: 'Número de Contrato:', b: true }, { t: d.numeroContrato }],
        [{ t: 'Objeto de la Obra:', b: true }, { t: d.objetoObra }],
        [{ t: 'Nombre del coasegurado:', b: true }, { t: d.coasegurado }]] : []),
    ];
    const pad = 10;
    const interior = CW - pad * 2 - 4;
    const medidas = filas.map((f) => {
      if (f === 'sep') return { f, h: 8 };
      if (Array.isArray(f[0])) {
        const [izq, der] = f as [Seg[], Seg[]];
        const li = partir(izq, mitad, size);
        const ld = partir(der, mitad, size);
        return { f, li, ld, h: Math.max(li.length, ld.length) * alto + 3 };
      }
      const li = partir(f as Seg[], interior, size);
      return { f, li, h: li.length * alto + 3 };
    });
    const total = medidas.reduce((s, m) => s + m.h, 0) + pad * 2 - 4;
    page.drawRectangle({ x: L, y: y - total, width: CW, height: total, color: C.suave, borderColor: hex('#dbe2ec'), borderWidth: 0.6 });
    page.drawRectangle({ x: L, y: y - total, width: 3, height: total, color: C.acento });
    let yy = y - pad;
    for (const m of medidas) {
      if (m.f === 'sep') { linea(page, L + pad, yy - 3, R - pad, yy - 3, 0.5, hex('#dbe2ec')); yy -= m.h; continue; }
      dibujarLineas(page, m.li!, L + pad + 4, yy - size, mitad, size, alto, C.tinta);
      if ('ld' in m && m.ld) dibujarLineas(page, m.ld, L + CW / 2 + 12, yy - size, mitad, size, alto, C.tinta);
      yy -= m.h;
    }
    y -= total + 16;
  }

  // Actividad restringida: misma caja ámbar del deducible, antes del interés asegurable.
  if (d.mesaTecnica) {
    const size = 8.5;
    const lineas = partir([{ t: `${NOTA_MESA_TECNICA}.`, b: true }, { t: 'La actividad asegurada es restringida: esta cotización requiere la aprobación de la mesa técnica de La Mundial.' }], CW - 20, size);
    const alto = lineas.length * 11 + 14;
    asegurar(alto);
    page.drawRectangle({ x: L, y: y - alto, width: CW, height: alto, color: C.amberFondo, borderColor: C.amberBorde, borderWidth: 0.6 });
    dibujarLineas(page, lineas, L + 10, y - 7 - size, CW - 20, size, 11, C.amberTinta);
    y -= alto + 12;
  }

  // Interés asegurable
  texto(page, 'INTERÉS ASEGURABLE', L, y - 10, 10, bold, C.navy);
  y -= 16;
  if (generico) parrafo([{ t: `Ampara los riesgos descritos en las coberturas ${plan.combo ? 'de este combo' : `del ${plan.nombre}`}, hasta las sumas aseguradas indicadas y sujeto a los límites, términos y condiciones de la póliza a emitir.` }], 8.5, { justificar: true, despues: 8 });
  else parrafo([{ t: 'Ampara la Responsabilidad Civil General en que pueda incurrir el asegurado frente a terceros por lesiones corporales y/o daños a la propiedad, por los cuales sea legalmente responsable y obligado a pagar mediante sentencia firme y sujeto a los límites, términos y condiciones de la póliza a emitir, derivada de las operaciones que realiza el Asegurado o bajo el contrato indicado.' }], 8.5, { justificar: true, despues: 8 });

  // Tabla de límites por opción
  {
    asegurar(70);
    const h = 16;
    const s = 7;
    celda(page, L, y, colPrim, h, C.azulTabla, C.bordeTabla);
    texto(page, 'Coberturas', L + (colPrim - ancho('Coberturas', s, bold)) / 2, y - 10.5, s, bold, C.tinta);
    celda(page, xCol(0), y, colOp * n, h, C.azulTabla2, C.bordeTabla);
    const sa = 'Sumas Aseguradas';
    texto(page, sa, xCol(0) + (colOp * n - ancho(sa, s, bold)) / 2, y - 10.5, s, bold, C.blanco);
    y -= h;
    celda(page, L, y, colPrim, h, C.encabezado);
    texto(page, plan ? `Suma asegurada del ${tipo} / Año Póliza` : 'Límite máximo de responsabilidad por evento / Año Póliza', L + 4, y - 10.5, s, bold, C.tinta);
    d.alternativas.forEach((alt, i) => {
      celda(page, xCol(i), y, colOp, h, C.encabezado);
      const t = plan ? (plan.combo ? 'COMBO' : /^PLAN/i.test(plan.cplan) ? plan.cplan : `PLAN ${plan.cplan}`) : `OPCIÓN ${alt.opcion}`;
      texto(page, t, xCol(i) + (colOp - ancho(t, s, bold)) / 2, y - 10.5, s, bold, C.tinta);
    });
    y -= h;
    celda(page, L, y, colPrim, h, C.suave);
    texto(page, generico ? plan.nombre : 'R.C. Predios y Operaciones', L + 4, y - 10.5, s, regular, C.tinta);
    d.alternativas.forEach((alt, i) => {
      celda(page, xCol(i), y, colOp, h, C.suave);
      derecha(page, importe(alt.limite), xCol(i) + colOp - 4, y - 10.5, s, regular, C.tinta);
    });
    y -= h + 10;
    const nota = plan?.combo ? 'Combo de coberturas elegidas con las tarifas vigentes de Sis2000.'
      : plan ? 'Plan configurado en Sis2000: suma, prima y coberturas fijas del plan.' : 'Alternativas independientes. La prima corresponde exclusivamente a la opción elegida.';
    texto(page, nota, L, y, 6.5, regular, C.gris);
    y -= 14;
  }

  // Coberturas incluidas
  {
    const h = 10.5;
    const s = 6.3;
    asegurar(h * 3);
    celda(page, L, y, CW, h + 2, C.encabezado);
    texto(page, 'COBERTURAS INCLUIDAS', L + 4, y - 9, 7, bold, C.tinta);
    y -= h + 2;
    for (const c of d.coberturas) {
      asegurar(h);
      celda(page, L, y, colPrim, h);
      texto(page, c.nombre, L + 4, y - 7.6, s, regular, C.tinta);
      c.montos.forEach((m, i) => {
        celda(page, xCol(i), y, colOp, h);
        derecha(page, importe(m), xCol(i) + colOp - 4, y - 7.6, s, regular, C.tinta);
      });
      y -= h;
    }
    y -= 12;
  }

  // Deducible
  if (d.deducible) {
    const size = 8;
    const lineas = partir([{ t: 'Deducibles Aplicables (Daños Materiales):', b: true }, { t: d.deducible }], CW - 20, size);
    const alto = lineas.length * 11 + 14;
    asegurar(alto);
    page.drawRectangle({ x: L, y: y - alto, width: CW, height: alto, color: C.amberFondo, borderColor: C.amberBorde, borderWidth: 0.6 });
    dibujarLineas(page, lineas, L + 10, y - 7 - size, CW - 20, size, 11, C.amberTinta);
    y -= alto + 12;
  }

  // Primas por opción
  {
    asegurar(26);
    texto(page, plan?.combo ? 'Prima total del combo' : plan ? 'Prima anual del plan' : 'Prima a cobrar según la opción', L + 4, y - 10, 8, bold, C.tinta);
    d.alternativas.forEach((alt, i) => derecha(page, importe(alt.prima), xCol(i) + colOp - 4, y - 10, 8, bold, C.tinta));
    y -= 18;
    linea(page, L, y, R, y, 1.4, C.primaLinea);
    y -= 14;
  }

  if (d.notaIgtf) {
    parrafo([{ t: 'Cotización no incluye 3% del Impuesto de Grandes Transacciones Financieras (IGTF), tomar en cuenta al momento de pagar la prima.', b: true }], 8, { color: C.tinta, despues: 6 });
  }

  if (d.condiciones.length) {
    asegurar(30);
    texto(page, 'CONDICIONES ESPECIALES', L, y - 8, 7, bold, C.tinta);
    y -= 12;
    for (const c of d.condiciones) parrafo([{ t: c }], 6.5, { color: C.tinta, despues: 1 });
  }

  // ================= PÁGINA 2 =================
  nuevaPagina();
  parrafo([{ t: 'Exclusiones:', b: true }, { t: `Las indicadas en las Condiciones Generales y Particulares y anexo de coberturas de la Póliza de ${producto}, aprobados por la Superintendencia de la Actividad Aseguradora.` }], 9, { justificar: true, despues: 8 });
  parrafo([{ t: 'Ley y Jurisdicción:', b: true }, { t: 'Este seguro se regirá y queda sometido exclusivamente al ordenamiento jurídico y a la jurisdicción de los tribunales de Caracas - Venezuela.' }], 9, { justificar: true, despues: 8 });
  const dias = d.vigenciaDias ?? 15;
  parrafo([{ t: `Cotización válida por ${dias === 15 ? 'quince (15)' : dias} días continuos.`, b: true }], 9, { despues: 14 });
  parrafo([{ t: 'DOCUMENTOS PARA LA EMISIÓN DE LA PÓLIZA:', b: true }], 9, { despues: 2 });
  parrafo([{ t: 'Solicitud de Seguros, llena en todas sus partes, la cual no debe contener tachaduras ni enmendaduras, incluyendo firma y huella del asegurado, así como los datos del intermediario de seguros.' }], 9, { justificar: true, despues: 8 });
  const lista = (tituloLista: string, items: string[]) => {
    parrafo([{ t: tituloLista, b: true }], 9, { despues: 2 });
    items.forEach((it, i) => {
      const lineas = partir([{ t: it }], CW - 16, 9);
      asegurar(lineas.length * 12.6);
      texto(page, `${i + 1}.`, L + 4, y - 9, 9, regular, C.texto);
      dibujarLineas(page, lineas, L + 16, y - 9, CW - 16, 9, 12.6, C.texto, true);
      y -= lineas.length * 12.6;
    });
    y -= 8;
  };
  lista('Persona Natural:', [
    'Copia del documento de identificación (cédula de identidad vigente y legible).',
    'Copia del Registro de Información Fiscal (Rif vigente y legible).',
  ]);
  lista('Persona Jurídicos:', [
    'Copia del Acta Constitutiva y estatutos sociales, con la última modificación estatutaria.',
    'Copia del Registro de Información Fiscal (Rif vigente y legible).',
    'Copia del documento de identificación del representante legal y Registro de Información Fiscal (cédula de identidad y Rif vigente y legible).',
  ]);
  lista('Adicional:', [
    'Referencias Bancarias (Vigentes).',
    'Copia de la última Declaración de Impuesto Sobre la Renta.',
    'Documento de Propiedad del Bien y/o Contrato de Arrendamiento (si aplica).',
  ]);
  parrafo([{ t: 'Quedamos a su disposición para contestar o ampliar cualquier información que considere necesario y esperamos que la presente oferta sea de su total conformidad, sin más a que hacer referencia, les saludamos.' }], 9, { justificar: true, despues: 6 });
  linea(page, L, y, R, y, 0.5, C.filete);
  y -= 18;

  // Firma con sello
  {
    const sw = 120;
    const sh = (sello.height / sello.width) * sw;
    asegurar(sh + 70);
    texto(page, 'Atentamente,', L, y - 9, 9, regular, C.texto);
    y -= 14;
    page.drawImage(sello as PDFImage, { x: L + 4, y: y - sh, width: sw, height: sh });
    y -= sh + 10;
    for (const t of ['Gerencia Técnica / Suscripción Patrimoniales', 'La Mundial de Seguros, C.A.', `Sucursal: ${d.sucursal}`]) {
      texto(page, t, L, y - 9, 9, bold, C.tinta);
      y -= 13;
    }
    derecha(page, `Cotización elaborada por: ${d.elaboradoPor}`, R, y + 4, 6.5, regular, C.gris);
  }

  // ================= SOLICITUD DE SEGURO (3 páginas) =================
  const FILAS_SOLICITUD: Record<string, number> = {
    'Riesgo de Vecinos': 0,
    'Riesgo Locativo': 1,
    'Responsabilidad Civil Daños Causados por Agua': 2,
    'Responsabilidad Civil Contratistas Independientes': 3,
    'Responsabilidad Civil por Vigilantes Privados': 4,
    'Responsabilidad Civil por Actividades Sociales y Eventos Deportivos': 5,
    'Responsabilidad Civil por Suministro de Alimentos y Bebidas': 6,
    'Responsabilidad Civil de Contaminación Ambiental': 8,
    'Responsabilidad Civil de Ascensores, Grúas y Montacargas': 9,
    'Responsabilidad Civil Cruzada': 11,
    'Responsabilidad Civil de Vehículos en Predios Privados': 13,
    'Responsabilidad Civil de Avisos Luminosos o no y Vallas': 15,
    'Responsabilidad Civil de Transporte, Carga y Descarga': 16,
    'Responsabilidad Civil por Incendio y/o Explosión': 24,
    'Responsabilidad Civil Defensa Penal y Asistencia Legal': 25,
  };
  const tintaSolicitud = rgb(30 / 255, 41 / 255, 59 / 255);

  /** Escribe un dato en una casilla (coordenadas en mm desde la esquina superior izquierda, como el original). */
  const dato = (p: PDFPage, valor: string, xmm: number, ymm: number, anchoMm: number, tamano: number) => {
    let t = limpiar(valor).trim();
    if (!t) return;
    const max = anchoMm * MM;
    let size = tamano;
    while (size > 5.5 && regular.widthOfTextAtSize(t, size) > max) size -= 0.25;
    if (regular.widthOfTextAtSize(t, size) > max) {
      while (t.length > 1 && regular.widthOfTextAtSize(t + '…', size) > max) t = t.slice(0, -1);
      t += '…';
    }
    p.drawText(t, { x: xmm * MM, y: H - ymm * MM, size, font: regular, color: tintaSolicitud });
  };

  const escalaX = 215.9 / 1020;
  const escalaY = 279.4 / 1320;
  for (let i = 0; i < (generico ? 0 : a.solicitud.length); i++) {
    const p = doc.addPage([W, H]);
    const img = await doc.embedPng(a.solicitud[i]);
    p.drawImage(img, { x: 0, y: 0, width: W, height: H });
    if (i === 0) {
      dato(p, d.asegurado, 72, 40.1, 69, 8);
      dato(p, d.rif, 181.5, 40.1, 32, 7.5);
      dato(p, d.ubicacion, 45, 53.65, 167, 8);
      dato(p, d.correo, 148.5, 62.7, 57, 7);
      dato(p, d.indole, 83, 76.7, 46, 7);
    }
    if (i === 1) {
      const tinta = rgb(25 / 255, 35 / 255, 55 / 255);
      for (const c of d.coberturas) {
        const fila = FILAS_SOLICITUD[c.nombre];
        if (fila === undefined) continue;
        const centroY = (115 + fila * 22.04) * escalaY;
        const xX = 618 * escalaX * MM;
        p.drawText('X', { x: xX - bold.widthOfTextAtSize('X', 9) / 2, y: H - (centroY + 1.05) * MM, size: 9, font: bold, color: tinta });
        p.drawText('Según cotización', { x: 650 * escalaX * MM, y: H - (centroY + 0.75) * MM, size: 8, font: regular, color: tinta });
      }
    }
    if (i === 2) dato(p, d.intermediario, 12, 63.5, 92, 8);
  }

  // Minuta La Mundial 30-oct-2026: condicionado, anexos de cobertura y constancia de recepción firmada por el asegurado.
  if (a.condicionados?.length) {
    for (const cnd of a.condicionados) {
      const src = await PDFDocument.load(cnd.bytes, { ignoreEncryption: true });
      const copiadas = await doc.copyPages(src, src.getPageIndices());
      copiadas.forEach((pg) => doc.addPage(pg));
    }
    constanciaRecepcion(doc, d, a.condicionados.map((x) => x.titulo), regular, bold, logo, {
      encabezado: `Cotización ${d.numero}`, pie: 'Constancia de recepción - forma parte de la cotización.',
    });
  }

  doc.setTitle(`Cotización ${plan ? plan.cplan : 'RCG'} ${d.numero} - ${limpiar(d.asegurado)}`);
  doc.setAuthor('La Mundial de Seguros, C.A.');
  doc.setSubject(`Cotización de ${producto}`);
  return doc.save();
}

/** Página "Constancia de recepción": el tomador/asegurado firma que recibió condiciones generales, particulares y anexos. */
function constanciaRecepcion(
  doc: PDFDocument, d: Pick<DatosPdfRcg, 'asegurado' | 'rif' | 'fecha'>, titulos: string[], regular: PDFFont, bold: PDFFont, logo: PDFImage,
  ref: { encabezado: string; pie: string },
) {
  const p = doc.addPage([W, H]);
  const esc = 110 / logo.width;
  p.drawImage(logo, { x: L, y: H - 32 - logo.height * esc, width: 110, height: logo.height * esc });
  let y = H - 32 - logo.height * esc - 24;
  const linea = (t: string, size: number, font: PDFFont, color: RGB = C.texto) => {
    let fila = '';
    for (const w of limpiar(t).split(' ')) {
      const prueba = fila ? `${fila} ${w}` : w;
      if (font.widthOfTextAtSize(prueba, size) > CW) {
        p.drawText(fila, { x: L, y, size, font, color });
        y -= size * 1.4;
        fila = w;
      } else fila = prueba;
    }
    if (fila) p.drawText(fila, { x: L, y, size, font, color });
    y -= size * 1.4;
  };
  linea('CONSTANCIA DE RECEPCIÓN DE CONDICIONES GENERALES, PARTICULARES Y ANEXOS', 12, bold, C.navy);
  y -= 6;
  linea(`${ref.encabezado} · Responsabilidad Civil General · ${fechaCorta(d.fecha)}`, 9, regular, C.gris);
  y -= 10;
  linea(`Yo, ${d.asegurado}, titular de la C.I./RIF ${d.rif}, en mi condición de tomador/asegurado, declaro que he recibido de `
    + 'La Mundial de Seguros, C.A. y he leído, en formato digital, las Condiciones Generales y Particulares de la póliza de '
    + 'Responsabilidad Civil General y los anexos de las coberturas contratadas que se listan a continuación, los cuales forman '
    + 'parte integrante del contrato de seguro:', 9.5, regular);
  y -= 6;
  titulos.forEach((t, i) => linea(`${i + 1}. ${t}`, 9.5, regular, C.tinta));
  y -= 10;
  linea('Esta constancia se emite conforme a la normativa vigente sobre entrega de condicionados al tomador y a la minuta de '
    + 'La Mundial de Seguros del 30-10-2026 sobre inclusión obligatoria de anexos de cobertura.', 8.5, regular, C.gris);
  y -= 40;
  const campo = (rotulo: string, x: number, ancho: number, valor = '') => {
    p.drawLine({ start: { x, y }, end: { x: x + ancho, y }, thickness: 0.8, color: C.tinta });
    if (valor) p.drawText(limpiar(valor), { x: x + 2, y: y + 4, size: 9, font: regular, color: C.tinta });
    p.drawText(rotulo, { x, y: y - 11, size: 8, font: bold, color: C.gris });
  };
  campo('Nombre o razón social del tomador/asegurado', L, 300, d.asegurado);
  campo('C.I. / RIF', L + 320, CW - 320, d.rif);
  y -= 50;
  campo('Firma del tomador/asegurado', L, 300);
  campo('Fecha', L + 320, CW - 320);
  y -= 50;
  campo('Por La Mundial de Seguros, C.A. (firma y sello)', L, 300);
  p.drawText(ref.pie, { x: L, y: 30, size: 7, font: regular, color: C.gris });
}

/**
 * Condicionado y anexos de la PÓLIZA emitida (ya no van en la cotización): los PDF de los condicionados en orden y al final
 * la constancia de recepción con el número de póliza. Es lo que se adjunta al correo de la póliza.
 * Sin número de póliza todavía (se arma al mandar a pagar y Nexus lo adjunta al emitir), la constancia se refiere a
 * «la póliza que se emita con la cotización N.º <código>».
 */
export async function generarPdfAnexosPoliza(
  d: { cnpoliza?: string; cotizacion?: string; asegurado: string; rif: string; fecha: Date }, condicionados: CondicionadoPdf[], logoJpg: Uint8Array,
): Promise<Uint8Array> {
  const ref = d.cnpoliza ? `Póliza ${d.cnpoliza}` : `Póliza que se emita con la cotización N.º ${d.cotizacion ?? ''}`.trim();
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await doc.embedJpg(logoJpg);
  for (const cnd of condicionados) {
    const src = await PDFDocument.load(cnd.bytes, { ignoreEncryption: true });
    const copiadas = await doc.copyPages(src, src.getPageIndices());
    copiadas.forEach((pg) => doc.addPage(pg));
  }
  constanciaRecepcion(doc, d, condicionados.map((x) => x.titulo), regular, bold, logo, {
    encabezado: ref, pie: 'Constancia de recepción - forma parte de la póliza.',
  });
  doc.setTitle(`Condicionado y anexos - ${ref} - ${limpiar(d.asegurado)}`);
  doc.setAuthor('La Mundial de Seguros, C.A.');
  return doc.save();
}

/** Solo el logo (PDF de anexos de la póliza). */
export async function cargarLogoRcg(): Promise<Uint8Array> {
  const m = await import('./assets/logo-la-mundial.jpg?url');
  return new Uint8Array(await (await fetch(m.default)).arrayBuffer());
}

/** Carga logo, sello y plantilla de la solicitud empaquetados por Vite. */
export async function cargarAssetsRcg(): Promise<AssetsPdfRcg> {
  const urls = await Promise.all([
    import('./assets/logo-la-mundial.jpg?url'),
    import('./assets/sello-la-mundial.png?url'),
    import('./assets/solicitud-rcg-1.png?url'),
    import('./assets/solicitud-rcg-2.png?url'),
    import('./assets/solicitud-rcg-3.png?url'),
  ]);
  const bytes = await Promise.all(urls.map(async (m) => new Uint8Array(await (await fetch(m.default)).arrayBuffer())));
  return { logo: bytes[0], sello: bytes[1], solicitud: bytes.slice(2) };
}

export function descargarPdf(bytes: Uint8Array, nombre: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
