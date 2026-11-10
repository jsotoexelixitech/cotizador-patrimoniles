import { describe, expect, it } from 'vitest';
import {
  armarEmisionComboInformada, coberturasSinTarifa, cotizarCombo, faltantesEmisionCombo, parsearCoberturasRamo,
} from './combo';
import { cotizadorDeRamo, tarifaOficialCombo } from './combo-rc';
import { cotizarRcg, PARAMETROS_RCG, type SolicitudRcg } from './rcg';
import { cotizarRc, PARAMETROS_RC, TARIFA, actividadesDeClase, type SolicitudRc } from './rcp-rce';

const prm = { rcg: PARAMETROS_RCG, rc: PARAMETROS_RC };

// Coberturas de Sis2000 sin tasa ni prima fija (como 27/28/37 en QA: la tarifa no está en matarifa_d).
const cob = (ccober: string, xcobertura: string, extra = {}) =>
  ({ ccober, ctarifa: '1', xcobertura, cmoneda: '$', obligatoria: false, pprima: 0, mprima: 0, msumamin: 0, msumamax: 0, pcomision: 10, ...extra });
const catalogo27 = parsearCoberturasRamo({ status: true, data: { cramo: 27, coberturas: [
  cob('1', 'COBERTURA BÁSICA', { msumamin: 1000, msumamax: 2000 }), cob('2', 'DISCAPACIDAD TEMPORAL'), cob('7', 'MUERTE'), cob('12', 'GASTOS MÉDICOS'),
] } });
const catalogo28 = parsearCoberturasRamo({ status: true, data: { cramo: 28, coberturas: [
  cob('1', 'LÍMITE DE RESPONSABILIDAD'), cob('2', 'RIESGO DE VECINOS'), cob('25', 'DEFENSA PENAL'), cob('29', 'LÍMITE BS'),
] } });

// Solo datos de tarifa: el combo pide el tomador en su paso y no lo exige para la prima.
const rcgVacio: SolicitudRcg = {
  sucursal: '', usuario: '', correoUsuario: '', asegurado: '', rif: '', correoDestinatario: '', intermediario: '', ubicacion: '',
  moneda: 'USD', clase: 1, indole: 'Farmacias', actividadEspecifica: 'Venta de medicinas', esContrato: false, numeroContrato: '',
  objetoObra: '', coasegurado: '', limite: null, tasa: 0.5, condiciones: [],
};
const clase = 1;
const producto = { tasa: TARIFA.p.risks[clase][1], ajuste: 0, opcion: 'II' as const, adicionales: [true, true], opcionalesVes: [] };
const rcVacio: SolicitudRc = {
  modo: 'both', moneda: 'USD', tasaBcv: null, base: 'employee', monto: 12000, empleados: 10, clase, otraClase: false, actividad: null,
  indole: 'Oficina administrativa', asegurado: '', rif: '', correo: '', direccion: '', sucursal: '', emisor: '', correoEmisor: '',
  intermediario: '', esContrato: false, numeroContrato: '', vigenciaContrato: 'Anual', objetoContrato: '',
  p: producto, e: { ...producto, adicionales: [false, false, false] },
};
const s = { rcg: rcgVacio, rc: rcVacio };

describe('combo con tarifa oficial del cotizador (27/28/37)', () => {
  it('ramos con tarifa de Google: 28 RCG, 27 RCP, 37 RCE; los demás no', () => {
    expect([28, 27, 37, 16, 38, 10, null].map(cotizadorDeRamo)).toEqual(['rcg', 'rcp', 'rce', null, null, null, null]);
  });

  it('combo 27 con clase y nómina: prima = la del motor RCP (opción elegida, sin adicionales) y va en la básica', () => {
    const elegidas = { '1': '50000', '2': '5000', '7': '5000' };
    const oficial = tarifaOficialCombo('rcp', elegidas, s, prm);
    const motor = cotizarRc({ ...rcVacio, modo: 'p', p: { ...producto, adicionales: [false, false] } }).resultados[0];
    expect(oficial.errores).toEqual([]);
    expect(oficial.prima).toBe(motor.prima);
    expect(oficial.prima).toBeGreaterThan(0);
    expect([oficial.basica, oficial.opcion, oficial.moneda]).toEqual(['1', 'II', 'USD']);

    const cot = cotizarCombo(catalogo27, elegidas, undefined, oficial);
    expect(cot.errores).toEqual({});
    expect(cot.generales).toEqual([]);
    expect(cot.coberturas.map((c) => [c.ccober, c.suma, c.prima])).toEqual([['1', 50000, motor.prima], ['2', 5000, 0], ['7', 5000, 0]]);
    expect(cot.prima_total).toBe(motor.prima);
    // Los topes 1.000–2.000 de matarifa_d no aplican con la tarifa oficial; tampoco hace falta Técnico.
    expect(coberturasSinTarifa(catalogo27, cot)).toEqual([]);
  });

  it('combo 27 con nómina baja: respeta la prima mínima del motor', () => {
    const oficial = tarifaOficialCombo('rcp', { '1': '10000' }, { ...s, rc: { ...rcVacio, monto: 1800, empleados: 1, p: { ...producto, opcion: 'I' } } }, prm);
    expect(oficial.prima).toBe(PARAMETROS_RC.primaMinima);
    expect(oficial.minimaAplicada).toBe(true);
  });

  it('combo 27 sin clase: no hay prima y no se puede continuar', () => {
    const oficial = tarifaOficialCombo('rcp', { '1': '50000' }, { ...s, rc: { ...rcVacio, clase: null } }, prm);
    expect(oficial.prima).toBeNull();
    const cot = cotizarCombo(catalogo27, { '1': '50000' }, undefined, oficial);
    expect(cot.generales).toContain('P: completa la clasificación común.');
    expect(cot.prima_total).toBe(0);
  });

  it('combo 37 (RCE) exige la actividad del riesgo; con ella, prima = motor RCE', () => {
    expect(tarifaOficialCombo('rce', { '1': '1' }, s, prm).errores).toContain('Selecciona una Actividad del Riesgo vinculada a la clase.');
    const actividad = actividadesDeClase(clase)[0];
    const rc = { ...rcVacio, actividad, e: { ...rcVacio.e, tasa: TARIFA.e.risks[actividad][1] } };
    const oficial = tarifaOficialCombo('rce', { '1': '1' }, { ...s, rc }, prm);
    expect(oficial.errores).toEqual([]);
    expect(oficial.prima).toBe(cotizarRc({ ...rc, modo: 'e' }).resultados[0].prima);
  });

  it('combo 28: suma de la básica = límite del motor RCG; prima = opción I del motor', () => {
    const elegidas = { '1': '50000', '25': '15000' };
    const oficial = tarifaOficialCombo('rcg', elegidas, s, prm);
    const motor = cotizarRcg({ ...rcgVacio, limite: 50000 }).alternativas[0];
    expect(oficial.prima).toBe(motor.prima);
    expect(oficial.prima).toBe(250);
    const cot = cotizarCombo(catalogo28, elegidas, undefined, oficial);
    expect(cot.coberturas.map((c) => [c.ccober, c.prima])).toEqual([['1', 250], ['25', 0]]);
    expect(cot.prima_total).toBe(250);
    // Mínima USD: 70 con un límite de 5.000 a tasa baja.
    expect(tarifaOficialCombo('rcg', { '1': '5000' }, { ...s, rcg: { ...rcgVacio, tasa: 0.2 } }, prm).prima).toBe(70);
  });

  it('combo 28: límite fuera de rango marca la básica; en Bs. la básica es la 29 y la mínima es el 35 %', () => {
    const fuera = cotizarCombo(catalogo28, { '1': '1000' }, undefined, tarifaOficialCombo('rcg', { '1': '1000' }, s, prm));
    expect(fuera.errores['1']).toMatch(/entre 5\.000 y 1\.000\.000/);
    const bs = tarifaOficialCombo('rcg', { '29': '100000' }, { ...s, rcg: { ...rcgVacio, moneda: 'Bs.', tasa: 0.2 } }, prm);
    expect([bs.basica, bs.prima]).toEqual(['29', 35000]);
    // La básica de la moneda entra sola aunque no se haya marcado.
    expect(cotizarCombo(catalogo28, {}, undefined, bs).coberturas.map((c) => c.ccober)).toEqual(['29']);
  });

  it('se puede marcar cualquier cobertura (sin tarifa en Sis2000 y sin vista técnica): entra con su suma y prima 0', () => {
    const oficial = tarifaOficialCombo('rcp', { '1': '50000', '12': '2000' }, s, prm);
    const cot = cotizarCombo(catalogo27, { '1': '50000', '12': '2000' }, undefined, oficial);
    expect(cot.coberturas.find((c) => c.ccober === '12')).toMatchObject({ suma: 2000, prima: 0, oficial: true });
    expect(cot.errores).toEqual({});
  });

  it('body de emisión 27: modo cotizador, cotizador rcp, prima total = motor; básica con la prima y el resto en 0', () => {
    const elegidas = { '1': '50000', '2': '5000' };
    const oficial = tarifaOficialCombo('rcp', elegidas, s, prm);
    const cot = cotizarCombo(catalogo27, elegidas, undefined, oficial);
    const body = armarEmisionComboInformada({
      cramo: 27, cplan: 'P1', cot, catalogo: catalogo27, tipoDoc: 'J', documento: 'J-12345678-9', nombre: 'Acme', apellido: '',
      correo: 'a@b.com', telefono: '0412-1234567', direccion: 'Caracas', bien: 'Oficina', cproductor: 80080,
      ncotizacion: 'COMBO-2026-P1', cotizador: oficial.cotizador,
    });
    expect(body).toMatchObject({ cramo: 27, cplan: 'P1', modo: 'cotizador', cotizador: 'rcp', prima_total: oficial.prima, ncotizacion: 'COMBO-2026-P1' });
    expect(body.coberturas).toEqual([{ ccober: '1', ctarifa: '1', suma: 50000, prima: oficial.prima }, { ccober: '2', ctarifa: '1', suma: 5000, prima: 0 }]);
    expect(body.prima_total).toBeGreaterThan(0);
    expect(faltantesEmisionCombo({ cramo: 27, cplan: 'P1', apartamento: '', valida: true, documento: 'J-12345678-9', sinTarifa: coberturasSinTarifa(catalogo27, cot), primaTotal: cot.prima_total })).toEqual([]);
  });
});

describe('combo en ramos sin tarifa de Google (16)', () => {
  const catalogo16 = parsearCoberturasRamo({ status: true, data: { cramo: 16, coberturas: [
    cob('1', 'BÁSICA', { pprima: 0.5, obligatoria: true }), cob('9', 'ROBO'),
  ] } });

  it('una cobertura sin tasa se marca y cotiza sin vista técnica, pero no se emite hasta que Técnico cargue la tarifa', () => {
    const cot = cotizarCombo(catalogo16, { '1': '10000', '9': '5000' });
    expect(cot.coberturas.map((c) => [c.ccober, c.prima])).toEqual([['1', 50], ['9', 0]]);
    expect(cot.errores).toEqual({});
    const sin = coberturasSinTarifa(catalogo16, cot);
    expect(sin).toEqual(['ROBO']);
    const f = faltantesEmisionCombo({ cramo: 16, cplan: 'P1', apartamento: '', valida: true, documento: 'J-12345678-9', sinTarifa: sin, primaTotal: cot.prima_total });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('Falta la tarifa de Técnico para ROBO');
    expect(f[0]).toContain('Tarificador (Configuración de tarifas)');
  });

  it('con la tasa ya cargada en matarifa_d se usa sola', () => {
    const conTasa = catalogo16.map((c) => (c.ccober === '9' ? { ...c, pprima: 0.2 } : c));
    const cot = cotizarCombo(conTasa, { '1': '10000', '9': '5000' });
    expect(cot.prima_total).toBe(60);
    expect(coberturasSinTarifa(conTasa, cot)).toEqual([]);
  });
});
