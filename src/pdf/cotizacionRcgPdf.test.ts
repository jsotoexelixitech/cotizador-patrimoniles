import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { cotizarRcg } from '../tarifas/rcg';
import { generarPdfRcg } from './cotizacionRcgPdf';

const dir = join(__dirname, 'assets');
const leer = (f: string) => new Uint8Array(readFileSync(join(dir, f)));
const assets = {
  logo: leer('logo-la-mundial.jpg'),
  sello: leer('sello-la-mundial.png'),
  solicitud: [1, 2, 3].map((i) => leer(`solicitud-rcg-${i}.png`)),
};

describe('PDF de cotización RCG', () => {
  it('genera 2 páginas de cotización + 3 de solicitud', async () => {
    const cot = cotizarRcg({
      sucursal: 'Caracas', usuario: 'prueba', correoUsuario: '', asegurado: 'prueba', rif: 'J-1837137', correoDestinatario: 'prueba@gmail.com',
      intermediario: 'prueba', ubicacion: 'qfb863gfyubi3', moneda: 'USD', clase: 0, indole: 'Oficinas privadas', actividadEspecifica: 'wdefwefwef',
      esContrato: false, numeroContrato: '', objetoObra: '', coasegurado: '', limite: 5000, tasa: 0.5, condiciones: [],
    });
    const bytes = await generarPdfRcg({
      numero: 'RCG-2026-000063', fecha: new Date(2026, 9, 26), asegurado: 'prueba', rif: 'J-1837137', moneda: 'USD',
      indole: 'Oficinas privadas', actividadEspecifica: 'wdefwefwef', correo: 'prueba@gmail.com', intermediario: 'prueba',
      ubicacion: 'qfb863gfyubi3', esContrato: false, numeroContrato: '', objetoObra: '', coasegurado: '', sucursal: 'Caracas',
      elaboradoPor: 'prueba', alternativas: cot.alternativas, coberturas: cot.coberturas, deducible: cot.deducible,
      notaIgtf: cot.notaIgtf, condiciones: cot.condiciones,
    }, assets);
    if (process.env.PDF_SALIDA) writeFileSync(process.env.PDF_SALIDA, bytes);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(5);
  });

  it('plan de Sis2000 de otro ramo: cotización sin la solicitud RCG', async () => {
    const nombres = ['COMBINADO RESIDENCIAL (BÁSICA)', 'TERREMOTO', 'DAÑOS POR AGUA', 'ROBO, ASALTO Y ATRACO', 'ROTURA DE VIDRIOS', 'RESPONSABILIDAD CIVIL'];
    const bytes = await generarPdfRcg({
      numero: 'RCG-2026-P123456', fecha: new Date(2026, 9, 28), asegurado: 'Juan Pérez', rif: 'V-12345678', moneda: 'USD',
      indole: '', actividadEspecifica: 'Apartamento en Los Palos Grandes', correo: 'juan@correo.com', intermediario: '',
      ubicacion: 'Caracas', esContrato: false, numeroContrato: '', objetoObra: '', coasegurado: '', sucursal: 'Caracas',
      elaboradoPor: 'prueba', alternativas: [{ opcion: 'I', limite: 140000, prima: 228, primaMinimaAplicada: false }],
      coberturas: nombres.map((nombre, i) => ({ nombre, montos: [140000 / (i + 1)] })), deducible: '', notaIgtf: true, condiciones: [],
      plan: { ramo: 'COMBINADO RESIDENCIAL', nombre: 'Plan II 100.000 Combinado Residencial', cplan: '2', esRcg: false },
    }, assets);
    if (process.env.PDF_SALIDA_PLAN) writeFileSync(process.env.PDF_SALIDA_PLAN, bytes);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
  });
});
