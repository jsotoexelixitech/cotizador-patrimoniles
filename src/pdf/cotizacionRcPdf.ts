// PDF de la cotización de Responsabilidad Civil Patronal / Empresarial (o ambas).
// Réplica del PDF que arma el cotizador original del Google Sheet de RCP/RCE (createClientQuotePDF): misma hoja carta,
// márgenes, encabezado, marca de agua, pie, tablas, textos y orden. Es independiente del PDF del RCG.
// El original no imprime tasas ni porcentajes de prima (solo montos), así que sirve igual para la vista cliente.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import {
  PARAMETROS_RC, limitesOpcionalesRestringidos, limitesPorTrabajador, opcionalesDe,
  type CotizacionRc, type IdOpcion, type OpcionRcp, type ParametrosRc, type ResultadoProducto, type SolicitudRc,
} from '../tarifas/rcp-rce';

export interface DatosPdfRc {
  /** Código de la cotización guardada. */
  numero: string;
  fecha: Date;
  solicitud: SolicitudRc;
  cotizacion: CotizacionRc;
  parametros?: ParametrosRc;
  /** «Cotización elaborada por: …» en el pie (vacío = no se imprime). */
  elaboradoPor?: string;
  sucursal?: string;
}

export interface AssetsPdfRc {
  /** PNG del original: logo, pie de página, marca de agua y sello. */
  logo: Uint8Array;
  pie: Uint8Array;
  marcaAgua: Uint8Array;
  sello: Uint8Array;
}

// Límites de las coberturas opcionales por opción (constantes del original).
const LIMITES_RCP_MEDICA: Record<IdOpcion, number> = { I: 1000, II: 2000, III: 5000 };
const LIMITES_RCP_HERNIA: Record<IdOpcion, number> = { I: 750, II: 1500, III: 3750 };
const LIMITES_RCE: Record<IdOpcion, { negligencia: number; defensa: number; medica: number }> = {
  I: { negligencia: 2000, defensa: 1800, medica: 1000 },
  II: { negligencia: 2500, defensa: 2000, medica: 2000 },
  III: { negligencia: 3600, defensa: 3000, medica: 5000 },
};

const FILAS_PATRONAL: string[][] = [
  ['Muerte Fallecimiento del trabajador activo a consecuencia de un accidente de trabajo o enfermedad ocupacional y que causa el derecho a sus causahabientes, a recibir un pago único, distribuido en partes iguales', 'Cinco (5) años de Salario', 'Veinticinco (25) salarios.'],
  ['Discapacidad Temporal Contingencia que, a consecuencia de un accidente de trabajo o enfermedad ocupacional, imposibilita al trabajador amparado para trabajar por un tiempo determinado', 'Doble salario por los días que dure la incapacidad', 'Un (1) año.'],
  ['Discapacidad parcial permanente Contingencia que, a consecuencia de un accidente de trabajo o enfermedad ocupacional, genera en el trabajador una disminución parcial y definitiva menor del sesenta y siete (67%) por ciento de su capacidad física o intelectual para el trabajo\n- Mayor del 25% de sus capacidad física e Intelectual para su profesión u oficio habitual.', 'Dos (2) años de Salario.', 'Cinco (5) años contados por días continuos.'],
  ['Discapacidad parcial permanente Contingencia que, a consecuencia de un accidente de trabajo o enfermedad ocupacional, genera en el trabajador una disminución parcial y definitiva menor del sesenta y siete (67%) por ciento de su capacidad física o intelectual para el trabajo\n- Menor del 25% de su capacidad física o intelectual para su profesión u oficio habitual.', 'Un (1) año de Salario.', 'Cuatro (4) años contados por días continuos.'],
  ['Discapacidad total permanente para el trabajo habitual: Contingencia que, a consecuencia de un accidente de trabajo o una enfermedad ocupacional, genera en el trabajador una disminución mayor o igual al sesenta y siete por ciento 67%) de su capacidad física, intelectual o ambas, que le impidan el desarrollo de las principales actividades laborales inherentes a la ocupación u oficio habitual que venía desarrollando antes de la contingencia, siempre que se conserve capacidad para dedicarse a otra actividad laboral distinta.', 'Tres (3) años de Salario', 'Seis (6) años de Salario'],
  ['Discapacidad absoluta permanente para cualquier tipo de actividad: Contingencia que, a consecuencia de un accidente de trabajo o enfermedad ocupacional, genera en el trabajador una disminución total y definitiva mayor o igual al sesenta y siete por ciento (67%) de su capacidad física, intelectual, o ambas, que lo inhabilita para realizar cualquier tipo de oficio o actividad labor', 'Cuatro (4) años de Salario', 'Siete (7) años de Salario'],
  ['Gran Discapacidad: Contingencia que, como consecuencia de un accidente de trabajo o enfermedad ocupacional, obliga al trabajador amparado a auxiliarse de otras personas para realizar los actos elementales de la vida diaria', 'Cinco (5) años de Salario', 'Ocho (8) años, contados por días continuos.'],
  ['Gran discapacidad asociada a la discapacidad temporal:', 'Triple salario por los días que dure la incapacidad', 'Un (1) año.'],
  ['Gastos de Entierro gastos por Servicios Funerarios hasta por el límite de responsabilidad contratado, pagaderos a los causahabientes del Trabajador en caso de su fallecimiento a consecuencia de un Accidente Laboral o Enfermedad Ocupacional amparado por la Póliza', 'Hasta cinco (5) salarios mínimos y no se descontarán las indemnizaciones que deban pagarse conforme a las contingencias anteriores.'],
];

const FILAS_EMPRESARIAL: string[][] = [
  ['Muerte', 'Cinco (5) años de salario', 'Ocho (8) años de salario'],
  ['Discapacidad Absoluta y Permanente para cualquier actividad', 'Cuatro (4) años de salario', 'Siete (7) años de salario'],
  ['Discapacidad Total y Permanente para el trabajo habitual', 'Tres (3) años de salario', 'Seis (6) años de salario'],
  ['Discapacidad Parcial y Permanente (mayor del 25% de su capacidad física e intelectual para su profesión u oficio habitual)', 'Dos (2) años de salario', 'Cinco (5) años de salario'],
  ['Discapacidad Parcial y Permanente (menor del 25% de su capacidad física o intelectual para su profesión u oficio habitual)', 'Un (1) año de salario', 'Cuatro (4) años de salario'],
  ['Discapacidad Temporal', 'Doble salario por los días que dure la incapacidad.'],
  ['Gran Discapacidad + Discapacidad Absoluta y Permanente (el trabajador está obligado a auxiliarse de otras personas)', 'Cinco (5) años de salario', 'Ocho (8) años de salario'],
  ['Secuelas o Deformaciones', 'Cinco (5) años de salario.'],
];

const INTERES_PATRONAL = 'El Asegurador indemnizará hasta el límite de responsabilidad indicado en el Cuadro Póliza Recibo, los montos que el Asegurado esté obligado a pagar a cualesquiera de sus trabajadores o a sus causahabientes, de acuerdo en lo establecido en Título I, Capítulo V, art 43 de la Ley Orgánica del Trabajo, las Trabajadoras y los Trabajadores, Ley del Seguro Social Obligatorio y Contrato colectivo que aplique, por las consecuencias de accidentes laborales ocurridos y enfermedades ocupacionales acontecidas durante la vigencia de la Póliza, y en las cuales el Asegurado tenga responsabilidad, y que le hayan ocasionado al Trabajador, cualesquiera de las siguientes contingencias:';
const INTERES_EMPRESARIAL = 'Ampara la responsabilidad del Asegurado por las consecuencias de Enfermedad Ocupacional o Accidentes de Trabajo, de acuerdo con lo establecido en el Título VIII, Capítulo IV, artículo 130 de la Ley Orgánica de Prevención, Condiciones y Medio Ambiente de Trabajo, y que le hayan ocasionado al trabajador cualesquiera de las siguientes contingencias:';

const CONDICIONES = [
  'La presente cotización tiene validez de quince (15) días contados a partir de la presente fecha.',
  'El Asegurado se comprometerá a declarar a la Empresa de Seguros, dentro de los primeros cinco (5) días hábiles de cada mes, la nómina real de sueldos, salarios y demás remuneraciones pagadas a todo el personal durante el mes anterior.',
  'En caso de que el cliente esté inscrito en el Instituto Venezolano de los Seguros Sociales, la Compañía indemnizará la diferencia entre el monto que corresponda por el Seguro Social obligatorio y el establecido en la Ley Orgánica del Trabajo vigente.',
  'En ningún caso la indemnización de la Compañía excederá el monto máximo fijado como límite de responsabilidad por trabajador y/o catastrófico según corresponda.',
];

/** Deja solo lo que la fuente estándar (WinAnsi) puede dibujar; conserva los saltos de línea. */
const limpiar = (s: unknown) => String(s ?? '')
  .replace(/[  \t\r]/g, ' ')
  .replace(/[‑–—−]/g, '-')
  .replace(/[^\n\x20-\x7e\xa1-\xff•]/g, '');

const fechaCorta = (d: Date) => d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });

type Tipo = 'title' | 'blue' | 'center' | 'normal' | 'bold';

export async function generarPdfRc(d: DatosPdfRc, a: AssetsPdfRc): Promise<Uint8Array> {
  const s = d.solicitud;
  const cot = d.cotizacion;
  const prm = d.parametros ?? PARAMETROS_RC;
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const img: Record<'logo' | 'pie' | 'marcaAgua' | 'sello', PDFImage> = {
    logo: await doc.embedPng(a.logo), pie: await doc.embedPng(a.pie), marcaAgua: await doc.embedPng(a.marcaAgua), sello: await doc.embedPng(a.sello),
  };

  const W = 612, H = 792, L = 68, R = 544, CW = R - L, TOP = 660, BOTTOM = 92, fs = 9.5, leading = 12;
  const ink = rgb(0, 0, 0), azul = rgb(157 / 255, 195 / 255, 230 / 255), linea = rgb(0.35, 0.35, 0.35), borde = rgb(0.25, 0.30, 0.35);
  let page!: PDFPage;
  let y = TOP;
  let numeroPagina = 0;

  const ves = s.moneda === 'VES';
  const fx = ves ? Number(s.tasaBcv) : 1;
  if (!(fx > 0)) throw new Error('Tipo de cambio inválido');
  const simbolo = ves ? 'Bs' : s.moneda;
  const num = (n: number) => Number(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  /** Importe ya expresado en la moneda de cuenta. */
  const monto = (n: number) => `${simbolo} ${num(n)}`;
  /** Importe en moneda base (USD/EUR) llevado a la moneda de cuenta, como `usd()` del original. */
  const deBase = (n: number) => monto(n * fx);
  const elaboradoPor = (d.elaboradoPor ?? s.emisor ?? '').trim();
  const sucursal = (d.sucursal ?? s.sucursal ?? '').trim();

  function nuevaPagina() {
    page = doc.addPage([W, H]);
    numeroPagina++;
    page.drawImage(img.marcaAgua, { x: 6, y: 94, width: 600, height: 591.36 });
    page.drawImage(img.logo, { x: L, y: 704, width: 108, height: (108 * img.logo.height) / img.logo.width });
    page.drawText('RIF: J-00084644-8', { x: L, y: 697, size: 6.5, font: bold, color: rgb(0.11, 0.18, 0.38) });
    const derecha = (valor: string, yy: number, font: PDFFont = regular, size = 8) => {
      const t = limpiar(valor);
      page.drawText(t, { x: R - font.widthOfTextAtSize(t, size), y: yy, size, font, color: rgb(0.25, 0.31, 0.42) });
    };
    derecha('Fecha: ' + fechaCorta(d.fecha), 749);
    derecha('Cotización N°: ' + (d.numero || ''), 732, bold, 9);
    derecha('La Mundial de Seguros, C.A.', 714, regular, 7);
    derecha('Inscrita en la Sudeaseg bajo el Nro. 73', 702, regular, 6);
    page.drawRectangle({ x: L, y: 682, width: CW, height: 2, color: rgb(0.12, 0.16, 0.37) });
    page.drawImage(img.pie, { x: 48, y: 6, width: 516, height: 69.79 });
    page.drawText(String(numeroPagina), { x: W - 32, y: 80, size: 7, font: regular, color: rgb(0.5, 0.5, 0.5) });
    if (elaboradoPor) {
      const t = limpiar('Cotización elaborada por: ' + elaboradoPor);
      let size = 7;
      while (regular.widthOfTextAtSize(t, size) > CW && size > 4) size -= 0.25;
      page.drawText(t, { x: R - regular.widthOfTextAtSize(t, size), y: 83, size, font: regular, color: rgb(0.38, 0.44, 0.53) });
      page.drawLine({ start: { x: L, y: 94 }, end: { x: R, y: 94 }, thickness: 0.5, color: rgb(0.8, 0.84, 0.88) });
    }
    y = TOP;
  }

  const asegurar = (alto: number) => { if (y - alto < BOTTOM) nuevaPagina(); };

  function lineas(texto: string, ancho: number, font: PDFFont = regular, size = fs): string[] {
    const salida: string[] = [];
    for (const parrafo of limpiar(texto).split('\n')) {
      let actual = '';
      for (const palabra of parrafo.split(/\s+/)) {
        const prueba = actual ? actual + ' ' + palabra : palabra;
        if (font.widthOfTextAtSize(prueba, size) <= ancho) { actual = prueba; continue; }
        if (actual) { salida.push(actual); actual = ''; }
        if (font.widthOfTextAtSize(palabra, size) > ancho) {
          let parte = '';
          for (const ch of palabra) {
            if (font.widthOfTextAtSize(parte + ch, size) > ancho) { salida.push(parte); parte = ''; }
            parte += ch;
          }
          actual = parte;
        } else actual = palabra;
      }
      salida.push(actual);
    }
    return salida;
  }

  function texto(valor: string, o: { bold?: boolean; size?: number; indent?: number; after?: number; justify?: boolean } = {}) {
    const { bold: negrita = false, size = fs, indent = 0, after = 5, justify = false } = o;
    const font = negrita ? bold : regular;
    for (const parrafo of limpiar(valor).split('\n')) {
      const partidas = lineas(parrafo, CW - indent, font, size);
      partidas.forEach((ln, i) => {
        asegurar(leading);
        const palabras = ln.split(' ');
        if (justify && i < partidas.length - 1 && palabras.length > 1) {
          const ancho = palabras.reduce((sum, w) => sum + font.widthOfTextAtSize(w, size), 0);
          const hueco = (CW - indent - ancho) / (palabras.length - 1);
          let x = L + indent;
          for (const w of palabras) {
            page.drawText(w, { x, y: y - size, size, font, color: ink });
            x += font.widthOfTextAtSize(w, size) + hueco;
          }
        } else {
          page.drawText(ln, { x: L + indent, y: y - size, size, font, color: ink });
        }
        y -= leading;
      });
    }
    y -= after;
  }

  const etiqueta = (nombre: string, valor: string, after = 3) => texto(nombre + ': ' + valor, { bold: true, after });

  function encabezado(titulo: string, barra = false) {
    asegurar(38);
    if (barra) {
      page.drawRectangle({ x: L, y: y - 18, width: CW, height: 18, color: azul });
      const size = 11, t = limpiar(titulo);
      page.drawText(t, { x: L + (CW - bold.widthOfTextAtSize(t, size)) / 2, y: y - 13, size, font: bold, color: ink });
      y -= 29;
    } else {
      texto(titulo, { bold: true, after: 5 });
    }
  }

  function tituloRamo(k: 'p' | 'e') {
    const titulo = 'COTIZACIÓN DE RESPONSABILIDAD CIVIL ' + (k === 'p' ? 'PATRONAL' : 'EMPRESARIAL');
    const size = 10.5;
    page.drawText(titulo, { x: L + (CW - bold.widthOfTextAtSize(titulo, size)) / 2, y: y - size, size, font: bold, color: rgb(0.11, 0.16, 0.37) });
    y -= 28;
    const denominacion = s.moneda === 'USD' ? 'Dólar Americano (USD)' : s.moneda === 'EUR' ? 'Euros (EUR)' : 'Bolívares (Bs)';
    const actividad = s.actividad !== null ? prm.actividades[s.actividad]?.[0] ?? '' : '';
    const filas: string[][] = [
      ['Tomador / Asegurado: ' + s.asegurado, 'Moneda de cuenta: ' + denominacion],
      ['RIF: ' + s.rif, 'Vigencia: ' + (s.esContrato ? s.vigenciaContrato || 'Anual' : 'Anual')],
      ['Correo electrónico: ' + (s.correo || '')],
      ['Índole específica: ' + (s.indole.trim() || actividad)],
      ['Intermediario: ' + (s.intermediario.trim() || 'No indicado')],
      ['Ubicación del riesgo: ' + s.direccion],
    ];
    if (s.esContrato) {
      filas.push(['N° de contrato: ' + s.numeroContrato]);
      filas.push(['Objeto de la obra: ' + s.objetoContrato]);
    }
    if (ves) filas.push(['Tasa BCV: 1 USD = ' + String(fx) + ' Bs']);
    const relleno = 11, separacion = 14, tam = 8.5, anchoCelda = (CW - relleno * 2 - separacion) / 2;
    const dispuestas = filas.map((fila) => {
      const ancho = fila.length === 2 ? anchoCelda : CW - relleno * 2;
      const partidas = fila.map((v) => lineas(v, ancho, regular, tam));
      return { partidas, alto: Math.max(...partidas.map((x) => x.length)) * 11 + 7 };
    });
    const alto = dispuestas.reduce((acc, f) => acc + f.alto, 0) + 16;
    asegurar(alto + 32);
    page.drawRectangle({ x: L, y: y - alto, width: CW, height: alto, color: rgb(0.97, 0.98, 1), borderColor: rgb(0.81, 0.86, 0.94), borderWidth: 0.7 });
    page.drawRectangle({ x: L, y: y - alto, width: 2.5, height: alto, color: rgb(0.12, 0.31, 0.85) });
    let cy = y - 11;
    dispuestas.forEach((fila) => {
      fila.partidas.forEach((ls, col) => {
        const x = L + relleno + col * (anchoCelda + separacion);
        ls.forEach((ln, j) => page.drawText(ln, { x, y: cy - tam - j * 11, size: tam, font: regular, color: rgb(0.15, 0.2, 0.29) }));
      });
      cy -= fila.alto;
    });
    y -= alto + 17;
  }

  function tabla(filas: string[][], patronal: boolean) {
    const anchos = patronal ? [CW * 0.56, CW * 0.22, CW * 0.22] : [CW * 0.44, CW * 0.28, CW * 0.28];
    const titulos = [patronal ? 'Cobertura Básica' : 'Descripción', 'Monto Mínimo', 'Monto Máximo'];
    const fila = (celdas: string[], cabecera = false) => {
      const ww = celdas.length === 2 ? [anchos[0], anchos[1] + anchos[2]] : anchos;
      const font = cabecera ? bold : regular, size = 8.5;
      const partidas = celdas.map((c, i) => lineas(c, ww[i] - 9, font, size));
      const alto = Math.max(...partidas.map((x) => x.length)) * 10 + 7;
      if (y - alto < BOTTOM) { nuevaPagina(); fila(titulos, true); }
      let x = L;
      celdas.forEach((_, i) => {
        page.drawRectangle({ x, y: y - alto, width: ww[i], height: alto, borderColor: linea, borderWidth: 0.5, ...(cabecera ? { color: azul } : {}) });
        partidas[i].forEach((ln, j) => page.drawText(ln, { x: x + 4.5, y: y - 11 - j * 10, size, font, color: ink }));
        x += ww[i];
      });
      y -= alto;
    };
    asegurar(65);
    fila(titulos, true);
    for (const f of filas) fila(f);
    y -= 11;
  }

  /** En contrato el original puede mostrar U.T.; aquí no se captura esa elección: siempre el monto en la moneda. */
  const limiteContrato = (valor: string) => valor;

  /** USD / EUR: comparativo de las opciones (I, II, III). */
  function cuadroOpciones(r: ResultadoProducto, opts: OpcionRcp[]) {
    const size = 7.3, paso = 9, pad = 4;
    const anchoOpcion = CW * 0.17;
    const anchos = [CW - anchoOpcion * opts.length, ...opts.map(() => anchoOpcion)];
    const montos = (get: (o: OpcionRcp) => number) => opts.map((o) => deBase(get(o)));
    const guiones = opts.map(() => '-');
    const sel = s[r.k].adicionales;
    const filas: [string, string[] | null, Tipo][] = [
      ['COBERTURA BÁSICA Y LÍMITES DE RESPONSABILIDAD', null, 'title'],
      ['COBERTURAS BÁSICAS', ['Sumas aseguradas'], 'blue'],
      ['SEGÚN LEY', null, 'center'],
      ['', opts.map((o) => 'Opción ' + o.id), 'blue'],
      ['PRIMA COBERTURA BÁSICA', montos((o) => o.primaBasica), 'blue'],
      ['COBERTURAS OPCIONALES', null, 'center'],
    ];
    if (r.k === 'e') {
      if (sel[0]) filas.push(['Negligencia del Empleador', montos((o) => LIMITES_RCE[o.id].negligencia), 'normal']);
      if (sel[1]) filas.push(['Asistencia Legal y Defensa Penal', montos((o) => LIMITES_RCE[o.id].defensa), 'normal']);
      if (sel[2]) filas.push(['Gastos Médicos', montos((o) => LIMITES_RCE[o.id].medica), 'normal']);
      if (!sel[0] && !sel[1] && !sel[2]) filas.push(['Sin coberturas opcionales seleccionadas', guiones, 'normal']);
    } else {
      if (sel[0]) filas.push(['Asistencia médica, quirúrgica y farmacéutica', montos((o) => LIMITES_RCP_MEDICA[o.id]), 'normal']);
      if (sel[1]) filas.push(['Hernia', montos((o) => LIMITES_RCP_HERNIA[o.id]), 'normal']);
      if (!sel[0] && !sel[1]) filas.push(['Sin coberturas opcionales seleccionadas', guiones, 'normal']);
    }
    filas.push(['PRIMA COBERTURAS OPCIONALES', montos((o) => o.primaOpcionales), 'blue']);
    filas.push(['LÍMITES MÁXIMOS DE COBERTURA POR EVENTO', null, 'center']);
    filas.push(['Lesiones corporales o muerte de una persona por ocurrencia', opts.map((o) => limiteContrato(deBase(o.limites[0]))), 'normal']);
    filas.push(['Lesiones corporales o muerte de dos o más personas por ocurrencia', opts.map((o) => limiteContrato(deBase(o.limites[1]))), 'normal']);
    filas.push(['Límite máximo de responsabilidad por año póliza', montos((o) => o.limites[2]), 'bold']);
    if (opts.some((o) => o.ajuste !== 0)) filas.push(['Ajuste comercial de prima básica', montos((o) => o.ajuste), 'normal']);
    if (opts.some((o) => o.ajusteMinimo !== 0)) filas.push(['Ajuste por prima mínima', montos((o) => o.ajusteMinimo), 'normal']);
    filas.push(['PRIMA A PAGAR', montos((o) => o.prima), 'blue']);

    const preparadas = filas.map(([titulo, valores, tipo]) => {
      const font = tipo === 'normal' ? regular : bold;
      const celdas = valores === null ? [titulo] : [titulo, ...valores];
      const ww = valores === null ? [CW] : valores.length === 1 && opts.length !== 1 ? [anchos[0], CW - anchos[0]] : anchos;
      const partidas = celdas.map((t, i) => lineas(t, ww[i] - pad * 2, font, size));
      return { tipo, font, ww, partidas, alto: Math.max(...partidas.map((x) => x.length)) * paso + 10 };
    });
    asegurar(preparadas.reduce((acc, f) => acc + f.alto, 0) + 26);
    for (const f of preparadas) {
      let x = L;
      const fondo = f.tipo === 'blue' ? azul : rgb(1, 1, 1);
      f.ww.forEach((ancho, i) => {
        page.drawRectangle({ x, y: y - f.alto, width: ancho, height: f.alto, color: fondo, borderColor: borde, borderWidth: 0.45 });
        f.partidas[i].forEach((t, j) => {
          const centro = f.ww.length === 1;
          const tx = centro ? x + (ancho - f.font.widthOfTextAtSize(t, size)) / 2 : i === 0 ? x + pad : x + ancho - pad - f.font.widthOfTextAtSize(t, size);
          page.drawText(t, { x: tx, y: y - 12 - j * paso, size, font: f.font, color: ink });
        });
        x += ancho;
      });
      y -= f.alto;
    }
    y -= 10;
  }

  /** Bs: un solo cuadro con la cobertura básica y las opcionales por tasa (solo montos, sin tasas). */
  function cuadroUnico(r: ResultadoProducto) {
    const nomina = cot.nomina; // ya en la moneda de cuenta
    const basica = (nomina * Number(r.lineas[0]?.tasa ?? 0)) / 100;
    // Coberturas opcionales elegidas con su límite por trabajador y colectivo (moneda base), como en el motor.
    const pago = (s.monto ?? 0) / fx;
    const derivados = limitesPorTrabajador(pago, s.empleados ?? 0, s.base, prm);
    const extras: { nombre: string; tasa: number; limite: number; grupo: number }[] = [];
    opcionalesDe(r.k, prm).forEach((o, i) => {
      const op = s[r.k].opcionalesVes[i];
      if (!op?.seleccionada) return;
      const tasa = r.k === 'e' ? o[1] : op.tasa ?? 0;
      if (/Negligencia del Empleador|Asistencia Legal y Defensa Penal/i.test(o[0])) {
        const lr = limitesOpcionalesRestringidos(derivados?.individual ?? 0, prm);
        extras.push({ nombre: o[0], tasa, limite: lr?.individual ?? 0, grupo: lr?.colectivo ?? 0 });
      } else {
        extras.push({ nombre: o[0], tasa, limite: Number(op.limite) || 0, grupo: op.grupo ?? 0 });
      }
    });
    const opcional = extras.reduce((acc, x) => acc + (nomina * x.tasa) / 100, 0);
    const filas: [string, string | null, Tipo][] = [
      ['COBERTURA BÁSICA Y LÍMITES DE RESPONSABILIDAD', null, 'title'],
      ['COBERTURAS BÁSICAS', 'Sumas aseguradas', 'blue'],
      ['SEGÚN LEY', null, 'center'],
      ['PRIMA COBERTURA BÁSICA', monto(basica), 'blue'],
      ['COBERTURAS OPCIONALES', null, 'center'],
    ];
    if (!extras.length) filas.push(['Sin coberturas opcionales seleccionadas', '-', 'normal']);
    for (const x of extras) {
      filas.push([x.nombre + ' - por trabajador', deBase(x.limite), 'normal']);
      if (r.k !== 'e') filas.push(['Dos o más trabajadores', deBase(x.grupo), 'normal']);
    }
    filas.push(['PRIMA COBERTURAS OPCIONALES', monto(opcional), 'blue']);
    filas.push(['LÍMITES MÁXIMOS DE COBERTURA POR EVENTO', null, 'center']);
    filas.push(['Lesiones corporales o muerte de un trabajador', limiteContrato(monto(r.limites[0])), 'normal']);
    filas.push(['Lesiones corporales o muerte de dos o más trabajadores', limiteContrato(monto(r.limites[1])), 'normal']);
    filas.push(['Límite máximo de responsabilidad por año póliza', monto(r.limites[2]), 'bold']);
    filas.push(['PRIMA A PAGAR', monto(r.prima), 'blue']);
    const corte = CW * 0.67, size = 8, paso = 10, pad = 5;
    const preparadas = filas.map(([izq, der, tipo]) => {
      const font = tipo === 'normal' ? regular : bold;
      const li = lineas(izq, (der === null ? CW : corte) - pad * 2, font, size);
      const ld = der === null ? [] : lineas(der, CW - corte - pad * 2, font, size);
      return { der, tipo, font, li, ld, alto: Math.max(li.length, ld.length) * paso + 10 };
    });
    asegurar(preparadas.reduce((acc, f) => acc + f.alto, 0) + 10);
    for (const f of preparadas) {
      const fondo = f.tipo === 'blue' ? azul : rgb(1, 1, 1);
      page.drawRectangle({ x: L, y: y - f.alto, width: CW, height: f.alto, color: fondo, borderColor: borde, borderWidth: 0.45 });
      if (f.der !== null) page.drawLine({ start: { x: L + corte, y }, end: { x: L + corte, y: y - f.alto }, color: borde, thickness: 0.45 });
      f.li.forEach((t, j) => {
        const centrado = f.der === null;
        page.drawText(t, { x: centrado ? L + (CW - f.font.widthOfTextAtSize(t, size)) / 2 : L + pad, y: y - 13 - j * paso, size, font: f.font, color: ink });
      });
      f.ld.forEach((t, j) => page.drawText(t, { x: R - pad - f.font.widthOfTextAtSize(t, size), y: y - 13 - j * paso, size, font: f.font, color: ink }));
      y -= f.alto;
    }
    y -= 10;
  }

  // ---------- Documento ----------
  const ordenados = [...cot.resultados].sort((x, z) => (x.k === 'p' ? 0 : 1) - (z.k === 'p' ? 0 : 1));
  if (!ordenados.length) throw new Error('La cotización no tiene productos.');
  for (const r of ordenados) {
    nuevaPagina();
    tituloRamo(r.k);
    etiqueta('N° de Trabajadores', String(s.empleados ?? ''));
    etiqueta('Nómina Anual Estimada', monto(cot.nomina));
    encabezado('Interés Asegurable:');
    texto(r.k === 'p' ? INTERES_PATRONAL : INTERES_EMPRESARIAL, { after: 8, justify: true });
    encabezado('Coberturas Básicas:');
    tabla(r.k === 'p' ? FILAS_PATRONAL : FILAS_EMPRESARIAL, r.k === 'p');
    if (r.opciones?.length) cuadroOpciones(r, r.opciones);
    else cuadroUnico(r);
    if (!ves) texto('La presente cotización no incluye 3% del Impuesto de Grandes Transacciones Financieras (IGTF), tomar en cuenta al momento de pagar la prima.', { bold: true, size: 7.5, after: 8 });
  }

  encabezado('CONDICIONES ESPECIALES:', true);
  CONDICIONES.forEach((c, i) => texto('• ' + c, { bold: i === 0, indent: 12, after: 6, justify: true }));
  encabezado('Exclusiones:');
  texto('Las indicadas en las condiciones Generales y Particulares y anexos de coberturas de la Póliza de Responsabilidad Civil Patronal y Empresarial aprobados por la Superintendencia de Seguros.', { after: 12, justify: true });
  encabezado('Ley y Jurisdicción:');
  texto('Este seguro se regirá y queda sometido exclusivamente al ordenamiento jurídico y a la jurisdicción de los tribunales de Caracas - Venezuela.', { after: 12, justify: true });
  encabezado('Anexo de Indemnización:');
  texto('El Asegurador indemnizará los siniestros en la misma moneda indicada en el Cuadro Póliza Recibo. No obstante, podrá cumplir con sus obligaciones en la moneda que reflejen las facturas presentadas por el Asegurado o Beneficiario. De común acuerdo entre el Asegurador y Asegurado o Beneficiario, el Asegurador podrá hacer pagos en una moneda distinta a la reflejada en las facturas presentadas, a la tasa de cambio oficial vigente a la fecha de pago.', { after: 10, justify: true });
  texto('Queda convenido que, si el Asegurado llegare a cerrar sus operaciones de forma permanente, cualquier indemnización pendiente de pago para el momento del cese de tales operaciones será realizada en Bolívares de la República Bolivariana de Venezuela (Bs.).', { justify: true });

  nuevaPagina();
  encabezado('DOCUMENTOS PARA LA EMISIÓN DE LA PÓLIZA', true);
  texto('Solicitud de Seguros llena en todas sus partes, firmada y con huella dactilar por el Asegurado.', { after: 12 });
  encabezado('Persona Natural:');
  ['Fotocopia de la Cédula de Identidad del Asegurado.', 'Fotocopia del Registro de Información Fiscal (RIF), vigente.'].forEach((t) => texto('• ' + t, { indent: 12 }));
  y -= 6;
  encabezado('Persona Jurídica:');
  ['Fotocopia del Acta Constitutiva y estatutos sociales de la empresa con sus correspondientes modificaciones.', 'Fotocopia del Registro de Información Fiscal (RIF), vigente.', 'Fotocopia de la Cédula de Identidad del representante legal.'].forEach((t) => texto('• ' + t, { indent: 12 }));
  y -= 6;
  encabezado('Adicional:');
  ['Copia del documento que demuestre la propiedad o interés asegurable del bien a asegurar, de ser el caso.', 'Copia de recibo de servicio público.', 'Referencia bancaria vigente.', 'Copia de la última declaración del Impuesto sobre la Renta.', 'Nómina actualizada.'].forEach((t) => texto('• ' + t, { indent: 12 }));
  y -= 12;
  texto('Quedamos a su disposición para contestar o ampliar cualquier información que considere necesaria y esperamos que la presente oferta sea de su total conformidad. Sin más a que hacer referencia, les saludamos.', { after: 22 });
  const anchoSello = 180, altoSello = (anchoSello * img.sello.height) / img.sello.width;
  asegurar(20 + altoSello + 8 + 41);
  texto('Atentamente,', { after: 8 });
  page.drawImage(img.sello, { x: L, y: y - altoSello, width: anchoSello, height: altoSello });
  y -= altoSello + 8;
  texto('Gerencia Técnica Suscripción Patrimoniales\nLa Mundial de Seguros, C.A.\nSucursal: ' + (sucursal || 'No indicada'), { bold: true });

  doc.setTitle(`Cotización ${ordenados.map((r) => (r.k === 'p' ? 'RCP' : 'RCE')).join('+')} ${d.numero} - ${limpiar(s.asegurado)}`);
  doc.setAuthor('La Mundial de Seguros, C.A.');
  return doc.save();
}

/** Carga los PNG del original (logo, pie, marca de agua y sello) empaquetados por Vite. */
export async function cargarAssetsRc(): Promise<AssetsPdfRc> {
  const urls = await Promise.all([
    import('./assets/rc-logo.png?url'),
    import('./assets/rc-pie.png?url'),
    import('./assets/rc-marca-agua.png?url'),
    import('./assets/sello-la-mundial.png?url'),
  ]);
  const bytes = await Promise.all(urls.map(async (m) => new Uint8Array(await (await fetch(m.default)).arrayBuffer())));
  return { logo: bytes[0], pie: bytes[1], marcaAgua: bytes[2], sello: bytes[3] };
}
