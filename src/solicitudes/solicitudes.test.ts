import { existsSync, readFileSync } from 'node:fs';
import { strFromU8, unzipSync } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { datosCotizacionRc, datosCotizacionRcg, type EstadoCotizador } from '../cotizaciones/snapshot';
import { EMISOR_CLIENTE, solicitudRc, solicitudRcg } from '../cotizaciones/solicitud';
import { parsearCoberturasRamo } from '../tarifas/combo';
import { coberturasRc, coberturasRcg } from '../tarifas/emision-rc';
import { cotizarRcg, PARAMETROS_RCG, tasaPromedio } from '../tarifas/rcg';
import { actividadesDeClase, cotizarRc, opcionalesDe, PARAMETROS_RC, tasaMedia } from '../tarifas/rcp-rce';
import { camposDe, controlesDe, documentoXml, llenarDocx, llenarXml } from './docx';
import { adicionalesRc, solicitudesDeCotizacion } from './desdeEmision';
import { generarSolicitudPdf, type Posiciones } from './pdf';
import { ARCHIVO_PLANTILLA, nombreArchivoSolicitud, rellenoSolicitud, type DatosSolicitud, type RamoSolicitud } from './solicitudes';

const ruta = (archivo: string) => `src/solicitudes/plantillas/${archivo}`;
const plantilla = (cramo: RamoSolicitud) => new Uint8Array(readFileSync(ruta(ARCHIVO_PLANTILLA[cramo])));

/** XML bien formado: cada etiqueta abierta se cierra en orden (suficiente para detectar un reemplazo roto). */
function xmlBienFormado(xml: string): boolean {
  const pila: string[] = [];
  for (const m of xml.matchAll(/<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+="[^"]*")*)\s*(\/?)>|<\?[^>]*\?>|<!--[\s\S]*?-->/g)) {
    if (!m[2]) continue;
    if (m[4] === '/') continue;
    if (m[1] === '/') { if (pila.pop() !== m[2]) return false; } else pila.push(m[2]);
  }
  const sinEtiquetas = xml.replace(/<[^>]*>/g, '');
  return pila.length === 0 && !/[<>]/.test(sinEtiquetas) && !/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(sinEtiquetas);
}

const base = {
  fecha: new Date(2026, 10, 16),
  tomador: { nombre: 'Inversiones Ejemplo & Hijos, C.A.', tipoDoc: 'J', documento: '123456789', correo: 'Admin@Ejemplo.com', telefono: '04121234567', direccion: 'Av. Principal de Chacao, Torre <A>, Caracas' },
  actividad: 'Farmacias · Venta de medicinas', ubicacion: 'Av. Principal de Chacao, Torre A', intermediario: { nombre: 'Juan Pérez', codigo: '80080' },
  ciudad: 'Caracas', cnpoliza: '28-1-100000123', opcion: 'II',
};
const ejemplo: Record<RamoSolicitud, DatosSolicitud> = {
  28: { ...base, cramo: 28, moneda: 'USD', referencia: 'Según cotización N° RCG-2026-000123-7KQ4', coberturas: [...PARAMETROS_RCG.coberturasSinContrato] },
  27: { ...base, cramo: 27, moneda: 'USD', referencia: 'Según cotización N° RC-2026-000124-ABCD', coberturas: ['Gastos por asistencia médica, quirúrgica y farmacéutica', 'Hernia'], nomina: 1_000_000, trabajadores: 10 },
  37: { ...base, cramo: 37, moneda: 'Bs', referencia: 'Según cotización N° RC-2026-000124-ABCD', coberturas: ['Negligencia del Empleador', 'Asistencia Legal y Defensa Penal', 'Gastos Médicos'], nomina: 1_000_000, trabajadores: 10 },
};

const valor = (xml: string, etiqueta: RegExp) => camposDe(xml).find((c) => c.tipo === 'texto' && etiqueta.test(c.etiqueta))?.valor.trim();
const marcada = (xml: string, f: (c: ReturnType<typeof camposDe>[number]) => boolean) => camposDe(xml).filter((c) => c.tipo === 'casilla' && f(c)).every((c) => c.marcada);

describe.each([28, 27, 37] as RamoSolicitud[])('solicitud del ramo %i', (cramo) => {
  const d = ejemplo[cramo];
  const docx = llenarDocx(plantilla(cramo), rellenoSolicitud(documentoXml(plantilla(cramo)), d));
  const xml = documentoXml(docx);

  it('el .docx resultante es válido: mismas partes que la plantilla y XML bien formado', () => {
    const original = unzipSync(plantilla(cramo));
    const lleno = unzipSync(docx);
    expect(Object.keys(lleno).sort()).toEqual(Object.keys(original).sort());
    for (const parte of Object.keys(original).filter((p) => p !== 'word/document.xml')) expect(lleno[parte]).toEqual(original[parte]);
    expect(xmlBienFormado(strFromU8(lleno['word/document.xml']))).toBe(true);
    expect(xmlBienFormado(strFromU8(original['word/document.xml']))).toBe(true);
    // La protección «solo formularios» se conserva: solo se pueden tocar los campos.
    expect(strFromU8(lleno['word/settings.xml'])).toContain('w:edit="forms"');
  });

  it('cada campo del relleno queda reemplazado con su valor y las casillas marcadas', () => {
    const r = rellenoSolicitud(documentoXml(plantilla(cramo)), d);
    const campos = camposDe(xml);
    for (const [n, v] of Object.entries(r.textos ?? {})) expect(campos[Number(n)].valor).toBe(v);
    for (const n of r.casillas ?? []) expect(campos[n].marcada).toBe(true);
    expect(campos.filter((c) => c.marcada).length).toBe(r.casillas?.length);
    const controles = controlesDe(xml);
    for (const [n, f] of Object.entries(r.fechas ?? {})) expect(controles[Number(n)].valor).toBe(f.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' }));
    for (const [n, v] of Object.entries(r.listas ?? {})) expect(controles[Number(n)].valor).toBe(v);
    expect(xml).toContain('16 de noviembre de 2026');
  });

  it('datos del tomador, vigencia, declaración, intermediario y lugar', () => {
    expect(valor(xml, /Razón Social:$/)).toBe('Inversiones Ejemplo & Hijos, C.A.');
    expect(valor(xml, /^C\.I\. \/ Pasaporte \/ R\.I\.F\.:$/)).toBe('J-123456789');
    expect(valor(xml, /^Domicilio Fiscal:$/)).toBe('Av. Principal de Chacao, Torre <A>, Caracas');
    expect(valor(xml, /^Teléfono:$/)).toBe('04121234567');
    expect(valor(xml, /^Correo Electrónico:$/)).toBe('admin@ejemplo.com');
    expect(valor(xml, /Fechado en$/)).toBe('Caracas');
    expect(valor(xml, /^Yo,$/)).toBe('Inversiones Ejemplo & Hijos, C.A.');
    expect(camposDe(xml).some((c) => /C\.I\./.test(c.etiqueta) && c.valor === 'J-123456789' && c.n > 200)).toBe(true);
    const controles = controlesDe(xml);
    expect(controles.slice(0, 3).map((c) => c.valor)).toEqual(['16/11/2026', '16/11/2027', '16/11/2026']);
    expect(camposDe(xml).some((c) => c.valor === 'Juan Pérez') && camposDe(xml).some((c) => c.valor === '80080')).toBe(true);
    expect(marcada(xml, (c) => /Asegurado Titular: Si$/.test(c.etiqueta))).toBe(true);
    // Persona jurídica privada; firmas, huellas y el propuesto asegurado quedan vacíos.
    expect(camposDe(xml).find((c) => c.tipo === 'casilla' && /^Privada/.test(c.rotulo))?.marcada).toBe(true);
    expect(controles.filter((c) => c.tipo === 'otro').every((c) => !c.valor.replace(/[\s/]/g, ''))).toBe(true);
  });

  it('el XML queda igual fuera de los campos: llenar dos veces da lo mismo', () => {
    const xml0 = documentoXml(plantilla(cramo));
    const r = rellenoSolicitud(xml0, d);
    expect(llenarXml(xml0, r)).toBe(xml);
  });

  it('nombre del archivo con la sigla del ramo y la póliza', () => {
    expect(nombreArchivoSolicitud(d)).toMatch(/^Solicitud_(RCG|RCP|RCE)_28-1-100000123\.docx$/);
  });

  it('PDF con el formato aprobado y los datos encima (si están las plantillas PDF)', async () => {
    const sigla = ARCHIVO_PLANTILLA[cramo].replace('.docx', '');
    if (!existsSync(ruta(`${sigla}.pdf`))) return;
    const pos = JSON.parse(readFileSync(ruta(`${sigla}.posiciones.json`), 'utf8')) as Posiciones;
    const xml0 = documentoXml(plantilla(cramo));
    expect(pos.campos.length).toBe(camposDe(xml0).length);
    expect(pos.controles.length).toBe(controlesDe(xml0).length);
    const basePdf = new Uint8Array(readFileSync(ruta(`${sigla}.pdf`)));
    const pdf = await generarSolicitudPdf(basePdf, pos, rellenoSolicitud(xml0, d), {
      campos: camposDe(xml0).map((c) => c.diseno), controles: controlesDe(xml0).map((c) => c.diseno),
    });
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe((await PDFDocument.load(basePdf)).getPageCount());
    expect(Buffer.from(pdf).equals(Buffer.from(basePdf))).toBe(false);
    // Cada casilla marcada tiene el cuadrado exacto del PDF (ajustar-casillas.mjs).
    for (const n of rellenoSolicitud(xml0, d).casillas ?? []) expect(pos.campos[n].caja).toHaveLength(3);
  });
});

describe('coberturas en la solicitud', () => {
  it('RCG: todas las coberturas del cotizador (con y sin contrato) tienen su fila y quedan marcadas', () => {
    const nombres = [...new Set([...PARAMETROS_RCG.coberturasSinContrato, ...PARAMETROS_RCG.coberturasConContrato])];
    const xml = documentoXml(llenarDocx(plantilla(28), rellenoSolicitud(documentoXml(plantilla(28)), { ...ejemplo[28], coberturas: nombres })));
    const campos = camposDe(xml);
    const filas = new Set(campos.filter((c) => c.tipo === 'casilla' && c.marcada && /^Responsabilidad Civil/.test(c.fila)).map((c) => c.filaId));
    expect(filas.size).toBe(nombres.length);
    // Básica: las dos casillas y «Según cotización N° …» en el límite.
    expect(campos.filter((c) => /^Predio y Operaciones/.test(c.fila) && c.tipo === 'casilla').every((c) => c.marcada)).toBe(true);
    expect(campos.some((c) => c.valor === 'Según cotización N° RCG-2026-000123-7KQ4')).toBe(true);
    // «Contratistas Independientes» aparece dos veces en el formato: se marca solo la primera.
    const contratistas = campos.filter((c) => c.tipo === 'casilla' && /Contratistas Independientes/.test(c.fila));
    expect(contratistas.map((c) => c.marcada)).toEqual([true, false]);
  });

  it('RCP y RCE: opcionales marcadas, nómina, trabajadores y observaciones con la cotización y la póliza', () => {
    for (const cramo of [27, 37] as const) {
      const xml = documentoXml(llenarDocx(plantilla(cramo), rellenoSolicitud(documentoXml(plantilla(cramo)), ejemplo[cramo])));
      const campos = camposDe(xml);
      const opcionales = campos.filter((c) => c.tipo === 'casilla' && c.antes.includes('Coberturas opcionales'));
      expect(opcionales.length).toBeGreaterThan(0);
      expect(campos.filter((c) => c.tipo === 'casilla' && c.marcada && /hernia|asistencia|gastos|negligencia/i.test(c.fila)).length).toBe(ejemplo[cramo].coberturas.length);
      expect(valor(xml, /nómina anual/)).toBe('1.000.000,00');
      expect(valor(xml, /^Cantidad total de trabajadores:$/)).toBe('10');
      expect(valor(xml, /^Observaciones/)).toBe(`${ejemplo[cramo].referencia}, opción II. Póliza N° 28-1-100000123.`);
      expect(controlesDe(xml).filter((c) => c.alias === 'Moneda' && /nómina|Cobertura|Forma de pago/.test(c.fila)).map((c) => c.valor))
        .toEqual(Array(3).fill(cramo === 37 ? 'Bs.' : 'USD'));
    }
  });
});

describe('solicitudes desde la cotización guardada', () => {
  const comun = {
    asegurado: 'Empresa C.A.', tipoDoc: 'J', documento: '123456789', correo: 'a@b.com', intermediario: 'Corretaje XYZ', ubicacion: 'Caracas, Chacao',
    sucursal: '', emisor: '', correoEmisor: '', apellido: '', telefono: '04121234567', apartamento: '',
  };
  const contrato = { esContrato: false, numero: '', objeto: '', coasegurado: '', vigencia: 'Anual' };
  const form = (k: 'p' | 'e', tasa: string, adicionales: boolean[]) => ({
    tasa, ajuste: '0', opcion: 'II' as const, adicionales,
    opcionalesVes: opcionalesDe(k).map((o) => ({ seleccionada: false, tasa: String(o[1]), limite: '650', grupo: '2000' })),
  });
  const actividad = actividadesDeClase(0)[0];
  const rc = {
    modo: 'both' as const, moneda: 'USD' as const, tasaBcv: '', base: 'total' as const, monto: '1000000', empleados: '10',
    claseSel: '0', claseRelacionada: '', actividad: String(actividad), indole: 'Oficina', sumaDeseada: '',
    p: form('p', String(tasaMedia(PARAMETROS_RC.clases[0])), [true, false]), e: form('e', String(tasaMedia(PARAMETROS_RC.actividades[actividad])), [false, true, false]),
  };
  const rcg = { moneda: 'USD' as const, clase: 1, indole: 'Farmacias', actividadEspecifica: 'Venta de medicinas', limite: '50000', tasa: String(tasaPromedio(PARAMETROS_RCG.clases[1])), condiciones: [], opcion: 'II' as const };
  const plan = (cramo: number, cplan: string) => ({ cramo, xramo: 'X', cplan, xplan: cplan, cproducto: null, qcoberturas: 1, msumamax: 0, mprima: 0, cotizable: true });
  const catalogo = (lineas: { ccober: string; concepto: string }[]) => parsearCoberturasRamo({ status: true, data: { coberturas: lineas.map((l) => ({ ccober: l.ccober, ctarifa: '7', xcobertura: l.concepto, cmoneda: '$' })) } });

  it('RCP + RCE («Ambas»): una solicitud por póliza, con sus coberturas y el productor de la emisión', () => {
    const estado: EstadoCotizador = { producto: 'rc', comun, contrato, rcg, rc };
    const cot = cotizarRc(solicitudRc(estado, EMISOR_CLIENTE));
    const cat = (k: 'p' | 'e') => catalogo(coberturasRc(cot.resultados.find((r) => r.k === k)!, 'USD').lineas);
    const datos = datosCotizacionRc(estado, cot, {
      vigenciaDias: 15,
      emision: { catalogos: { 27: cat('p'), 37: cat('e') }, contenedores: [{ cramo: 27, xramo: 'RCP', planes: [plan(27, 'RCPGEN')] }, { cramo: 37, xramo: 'RCE', planes: [plan(37, 'RCEGEN')] }], cproductor: 80080, esPersonaNatural: false },
    });
    const polizas = [{ cnpoliza: '27-1-1', cnrecibo: '1', urlpoliza: '', cramo: 27 }, { cnpoliza: '37-1-2', cnrecibo: '2', urlpoliza: '', cramo: 37 }];
    const s = solicitudesDeCotizacion({ datos: JSON.parse(JSON.stringify(datos)), codigo: 'RC-2026-000124-ABCD', opcion: 'II', polizas, fecha: new Date(2026, 10, 16) });
    expect(s.map((x) => [x.cramo, x.cnpoliza])).toEqual([[27, '27-1-1'], [37, '37-1-2']]);
    expect(s[0]).toMatchObject({ referencia: 'Según cotización N° RC-2026-000124-ABCD', moneda: 'USD', nomina: 1_000_000, trabajadores: 10, ciudad: 'Caracas' });
    expect(s[0].intermediario).toEqual({ nombre: 'Corretaje XYZ', codigo: '80080' });
    expect(s[0].coberturas).toEqual(adicionalesRc(rc, 'p'));
    expect(s[1].coberturas).toEqual(['Asistencia Legal y Defensa Penal']);
    // Sin la póliza de un ramo (emisión a medias) no hay solicitud de ese ramo.
    expect(solicitudesDeCotizacion({ datos, codigo: 'X', opcion: 'II', polizas: [polizas[1]], fecha: new Date() }).map((x) => x.cramo)).toEqual([37]);
  });

  it('RCG: una solicitud con todas las coberturas de la cotización', () => {
    const estado: EstadoCotizador = { producto: 'rcg', comun, contrato, rcg, rc };
    const cot = cotizarRcg(solicitudRcg(estado));
    const datos = datosCotizacionRcg(estado, cot, {
      mesaTecnica: false, vigenciaDias: 15,
      emision: { catalogo: catalogo(coberturasRcg(cot, 'I', 'USD')!.lineas), contenedores: [{ cramo: 28, xramo: 'RCG', planes: [plan(28, 'RCGGEN')] }], planConfigurado: 'RCGGEN', cproductor: 80080, esPersonaNatural: false },
    });
    const s = solicitudesDeCotizacion({ datos, codigo: 'RCG-2026-000123-7KQ4', opcion: 'I', polizas: [{ cnpoliza: '28-1-9', cnrecibo: '9', urlpoliza: '' }], fecha: new Date() });
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ cramo: 28, cnpoliza: '28-1-9', actividad: 'Farmacias · Venta de medicinas', coberturas: cot.coberturas.map((c) => c.nombre) });
    expect(solicitudesDeCotizacion({ datos, codigo: 'X', opcion: 'I', polizas: [], fecha: new Date() })).toEqual([]);
  });
});
