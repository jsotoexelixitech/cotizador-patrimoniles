import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { PARAMETROS_RCG, cotizarRcg } from '../tarifas/rcg';
import { generarPdfAnexosPoliza, generarPdfRcg } from './cotizacionRcgPdf';
import { ANEXOS_RCG, CONDICIONADO_GENERAL, documentosRcg } from './condicionadosRcg';

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

  it('anexos según coberturas: condicionado + anexos mapeados + moneda extranjera solo en divisa', () => {
    const sinContrato = documentosRcg(PARAMETROS_RCG.coberturasSinContrato, 'USD');
    expect(sinContrato[0].id).toBe('condicionado-general-particular-rcg');
    // 13 coberturas sin contrato: 11 con anexo oficial (alimentos y ascensores no tienen) + moneda extranjera.
    expect(sinContrato.map((d) => d.id)).toEqual([
      'condicionado-general-particular-rcg', 'anexo-riesgo-vecinos', 'anexo-riesgo-locativo', 'anexo-danos-por-agua',
      'anexo-contratistas-independientes', 'anexo-vigilantes-privados', 'anexo-actividades-sociales-eventos-deportivos',
      'anexo-contaminacion-ambiental', 'anexo-vehiculos-predios-privados', 'anexo-avisos-vallas', 'anexo-incendio-explosion',
      'anexo-defensa-penal-asistencia-legal', 'anexo-moneda-extranjera',
    ]);
    const conContratoBs = documentosRcg(PARAMETROS_RCG.coberturasConContrato, 'Bs.');
    expect(conContratoBs.map((d) => d.id)).toContain('anexo-transporte-carga-descarga');
    expect(conContratoBs.map((d) => d.id)).not.toContain('anexo-moneda-extranjera');
    expect(documentosRcg([], 'Bs.')).toHaveLength(1);
    // Todos los archivos del catálogo existen.
    for (const d of [CONDICIONADO_GENERAL, ...ANEXOS_RCG]) expect(existsSync(join(dir, 'condicionados', d.archivo))).toBe(true);
  });

  it('con condicionados: anexa el condicionado, los anexos y la constancia de recepción', async () => {
    const cot = cotizarRcg({
      sucursal: 'Caracas', usuario: 'prueba', correoUsuario: '', asegurado: 'prueba', rif: 'J-1837137', correoDestinatario: 'prueba@gmail.com',
      intermediario: 'prueba', ubicacion: 'qfb863gfyubi3', moneda: 'USD', clase: 0, indole: 'Oficinas privadas', actividadEspecifica: 'wdefwefwef',
      esContrato: false, numeroContrato: '', objetoObra: '', coasegurado: '', limite: 5000, tasa: 0.5, condiciones: [],
    });
    const docs = documentosRcg(cot.coberturas.map((c) => c.nombre), 'USD');
    const condicionados = docs.map((d) => ({ titulo: d.titulo, bytes: leer(join('condicionados', d.archivo)) }));
    let paginasAnexos = 0;
    for (const c of condicionados) paginasAnexos += (await PDFDocument.load(c.bytes, { ignoreEncryption: true })).getPageCount();
    const datos = {
      numero: 'RCG-2026-000064', fecha: new Date(2026, 10, 4), asegurado: 'Comercial Prueba, C.A.', rif: 'J-1837137', moneda: 'USD',
      indole: 'Oficinas privadas', actividadEspecifica: 'wdefwefwef', correo: 'prueba@gmail.com', intermediario: 'prueba',
      ubicacion: 'qfb863gfyubi3', esContrato: false, numeroContrato: '', objetoObra: '', coasegurado: '', sucursal: 'Caracas',
      elaboradoPor: 'prueba', alternativas: cot.alternativas, coberturas: cot.coberturas, deducible: cot.deducible,
      notaIgtf: cot.notaIgtf, condiciones: cot.condiciones,
    };
    const sin = await PDFDocument.load(await generarPdfRcg(datos, assets));
    const bytes = await generarPdfRcg(datos, { ...assets, condicionados });
    if (process.env.PDF_SALIDA_CONDICIONADOS) writeFileSync(process.env.PDF_SALIDA_CONDICIONADOS, bytes);
    const con = await PDFDocument.load(bytes);
    expect(paginasAnexos).toBeGreaterThan(0);
    expect(con.getPageCount()).toBe(sin.getPageCount() + paginasAnexos + 1);
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

  it('combo de coberturas sujeto a la mesa técnica: cotización sin la solicitud RCG', async () => {
    const bytes = await generarPdfRcg({
      numero: 'RCG-2026-P654321', fecha: new Date(2026, 9, 31), asegurado: 'Taller Naval, C.A.', rif: 'J-12345678', moneda: 'USD',
      indole: '', actividadEspecifica: 'Astillero y reparación de embarcaciones', correo: 'taller@correo.com', intermediario: '',
      ubicacion: 'Puerto La Cruz', esContrato: false, numeroContrato: '', objetoObra: '', coasegurado: '', sucursal: 'Puerto La Cruz',
      elaboradoPor: 'prueba', alternativas: [{ opcion: 'I', limite: 100000, prima: 725, primaMinimaAplicada: false }],
      coberturas: [{ nombre: 'COMBINADO EMPRESARIAL (BÁSICA)', montos: [100000] }, { nombre: 'TERREMOTO', montos: [100000] }],
      deducible: '', notaIgtf: true, condiciones: [], mesaTecnica: true,
      plan: { ramo: 'COMBINADOS EMPRESARIAL', nombre: 'Combo de coberturas', cplan: 'COMBO-16', esRcg: false, combo: true },
    }, assets);
    if (process.env.PDF_SALIDA_COMBO) writeFileSync(process.env.PDF_SALIDA_COMBO, bytes);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
  });
});

describe('PDF de condicionado y anexos de la póliza', () => {
  it('une el condicionado y los anexos y agrega la constancia con el número de póliza', async () => {
    const docs = documentosRcg(['Riesgo de Vecinos'], 'USD');
    const condicionados = docs.map((d) => ({ titulo: d.titulo, bytes: leer(join('condicionados', d.archivo)) }));
    let paginas = 0;
    for (const c of condicionados) paginas += (await PDFDocument.load(c.bytes, { ignoreEncryption: true })).getPageCount();
    const bytes = await generarPdfAnexosPoliza(
      { cnpoliza: '28-1-0000123', asegurado: 'Comercial Prueba, C.A.', rif: 'J-1837137', fecha: new Date(2026, 10, 13) }, condicionados, assets.logo,
    );
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(paginas + 1);
    expect(pdf.getTitle()).toContain('Póliza 28-1-0000123');
  });
});
