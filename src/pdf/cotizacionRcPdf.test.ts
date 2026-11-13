import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { TARIFA, actividadesDeClase, cotizarRc, type Modo, type SolicitudRc } from '../tarifas/rcp-rce';
import { generarPdfRc } from './cotizacionRcPdf';

const dir = join(__dirname, 'assets');
const leer = (f: string) => new Uint8Array(readFileSync(join(dir, f)));
const assets = { logo: leer('rc-logo.png'), pie: leer('rc-pie.png'), marcaAgua: leer('rc-marca-agua.png'), sello: leer('sello-la-mundial.png') };

const clase = 1;
const actividad = actividadesDeClase(clase)[0];
const producto = { ajuste: 0, opcion: 'II' as const, opcionalesVes: [] };
const base: SolicitudRc = {
  modo: 'both', moneda: 'USD', tasaBcv: null, base: 'employee', monto: 12000, empleados: 10, clase, otraClase: false, actividad,
  indole: 'Oficinas administrativas', asegurado: 'Empresa de Prueba, C.A.', rif: 'J-12345678-9', correo: 'cliente@empresa.com',
  direccion: 'Av. Francisco de Miranda, Torre Uno, Caracas', sucursal: 'Caracas', emisor: 'Ana Pérez', correoEmisor: 'a@b.com',
  intermediario: 'Corretaje Ejemplo', esContrato: false, numeroContrato: '', vigenciaContrato: 'Anual', objetoContrato: '',
  p: { ...producto, tasa: TARIFA.p.risks[clase][1], adicionales: [true, true] },
  e: { ...producto, tasa: TARIFA.e.risks[actividad][1], adicionales: [true, false, true] },
};

/** Texto dibujado en el PDF (las fuentes estándar van en WinAnsi, en hexadecimal dentro de streams comprimidos). */
function textoDe(bytes: Uint8Array): string {
  const crudo = Buffer.from(bytes);
  const latin = crudo.toString('latin1');
  let salida = '';
  let desde = 0;
  for (;;) {
    const i = latin.indexOf('stream', desde);
    if (i < 0) break;
    const ini = latin[i + 6] === '\r' ? i + 8 : i + 7;
    const fin = latin.indexOf('endstream', ini);
    if (fin < 0) break;
    desde = fin + 9;
    let contenido: string;
    try { contenido = inflateSync(crudo.subarray(ini, fin)).toString('latin1'); } catch { continue; }
    for (const m of contenido.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) salida += Buffer.from(m[1], 'hex').toString('latin1') + '\n';
  }
  return salida;
}

async function generar(modo: Modo, extra: Partial<SolicitudRc> = {}, archivo?: string) {
  const solicitud = { ...base, modo, ...extra };
  const cotizacion = cotizarRc(solicitud);
  expect(cotizacion.errores).toEqual([]);
  const bytes = await generarPdfRc({ numero: 'RCP-2026-000123', fecha: new Date(2026, 10, 13), solicitud, cotizacion }, assets);
  if (process.env.PDF_SALIDA_RC && archivo) {
    mkdirSync(process.env.PDF_SALIDA_RC, { recursive: true });
    writeFileSync(join(process.env.PDF_SALIDA_RC, archivo), bytes);
  }
  const pdf = await PDFDocument.load(bytes);
  return { paginas: pdf.getPageCount(), texto: textoDe(bytes) };
}

const PATRONAL = 'COTIZACIÓN DE RESPONSABILIDAD CIVIL PATRONAL';
const EMPRESARIAL = 'COTIZACIÓN DE RESPONSABILIDAD CIVIL EMPRESARIAL';

describe('PDF de cotización RCP / RCE (réplica del Google Sheet)', () => {
  it('solo patronal: título patronal, cuadro de tres opciones, condiciones, documentos y firma', async () => {
    const { paginas, texto } = await generar('p', {}, 'cotizacion-rcp.pdf');
    expect(paginas).toBeGreaterThanOrEqual(3);
    expect(texto).toContain(PATRONAL);
    expect(texto).not.toContain(EMPRESARIAL);
    for (const t of ['Cotización N°: RCP-2026-000123', 'RIF: J-00084644-8', 'Opción III', 'PRIMA A PAGAR', 'Hernia', 'CONDICIONES ESPECIALES:',
      'DOCUMENTOS PARA LA EMISIÓN DE LA PÓLIZA', 'Atentamente,', 'Sucursal: Caracas', 'Cotización elaborada por: Ana Pérez']) expect(texto).toContain(t);
    // El original no imprime tasas ni porcentajes de prima.
    expect(texto).not.toMatch(/Tasa (final|b[aá]sica|aplicada)/i);
  });

  it('solo empresarial: título empresarial y sus coberturas opcionales', async () => {
    const { texto } = await generar('e', {}, 'cotizacion-rce.pdf');
    expect(texto).toContain(EMPRESARIAL);
    expect(texto).not.toContain(PATRONAL);
    expect(texto).toContain('Negligencia del Empleador');
    expect(texto).toContain('Gastos Médicos');
    expect(texto).not.toContain('Asistencia Legal y Defensa Penal');
  });

  it('ambas: una sección por ramo (patronal primero) y un solo bloque de condiciones y documentos', async () => {
    const { paginas, texto } = await generar('both', {}, 'cotizacion-rcp-rce.pdf');
    expect(paginas).toBeGreaterThanOrEqual(4);
    expect(texto.indexOf(PATRONAL)).toBeGreaterThan(-1);
    expect(texto.indexOf(EMPRESARIAL)).toBeGreaterThan(texto.indexOf(PATRONAL));
    expect(texto.split('CONDICIONES ESPECIALES:').length).toBe(2);
    expect(texto.split('Atentamente,').length).toBe(2);
  });

  it('en bolívares: cuadro único con la tasa BCV, sin opciones ni nota de IGTF', async () => {
    const { texto } = await generar('both', { moneda: 'VES', tasaBcv: 40, monto: 480000 }, 'cotizacion-rcp-rce-bs.pdf');
    expect(texto).toContain('Tasa BCV: 1 USD = 40 Bs');
    expect(texto).toContain('Lesiones corporales o muerte de un trabajador');
    expect(texto).not.toContain('Opción I');
    expect(texto).not.toContain('IGTF');
  });
});
