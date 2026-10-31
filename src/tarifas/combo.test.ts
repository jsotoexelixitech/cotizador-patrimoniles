import { describe, expect, it } from 'vitest';
import { cotizarCombo, monedaCombo, parsearCoberturasRamo } from './combo';

// Respuesta de GET v1/riesgos-generales/coberturas?cramo=16 según el contrato acordado con nest-api (valores de ejemplo).
const cob = (ccober: string, xcobertura: string, pprima: number, extra = {}) =>
  ({ ccober, ctarifa: '1', xcobertura, cmoneda: '$', obligatoria: ccober === '1', pprima, mprima: 0, msumamin: 0, msumamax: 0, pcomision: 10, ...extra });
const respuesta = { status: true, data: { cramo: 16, coberturas: [
  cob('1', 'COMBINADO EMPRESARIAL (BÁSICA)', 0.5),
  cob('3', 'TERREMOTO', 0.2, { obligatoria: true }),
  cob('5', 'ROBO, ASALTO Y ATRACO', 0.4, { msumamin: 1000, msumamax: 50000 }),
  cob('12', 'ASISTENCIA', 0, { mprima: 25 }),
] } };

describe('Combo de coberturas por ramo', () => {
  const catalogo = parsearCoberturasRamo(respuesta);

  it('parser: desenvuelve, ordena (básica primero y por código) y deja una fila por cobertura', () => {
    const c = parsearCoberturasRamo({ status: true, data: { cramo: 16, coberturas: [
      cob('12', 'ASISTENCIA', 0, { mprima: 25 }), cob('5', 'ROBO', 0.4), cob('1', 'BÁSICA', 0.5), cob('3', 'TERREMOTO', 0.2),
      cob('5', 'ROBO (otra tarifa)', 0.9, { ctarifa: '2' }),
    ] } });
    expect(c.map((x) => [x.ccober, x.nombre])).toEqual([['1', 'BÁSICA'], ['3', 'TERREMOTO'], ['5', 'ROBO'], ['12', 'ASISTENCIA']]);
    expect(c[3]).toMatchObject({ pprima: 0, mprima: 25, obligatoria: false, cmoneda: '$' });
  });

  it('parser: status false o sin coberturas es error', () => {
    expect(() => parsearCoberturasRamo({ status: false, message: 'Ramo sin tarifa vigente' })).toThrow('Ramo sin tarifa vigente');
    expect(() => parsearCoberturasRamo({ status: true, data: null })).toThrow('no devolvió las coberturas');
    expect(parsearCoberturasRamo({ status: true, data: { cramo: 99, coberturas: [] } })).toEqual([]);
  });

  it('prima = suma × tasa / 100 o la prima fija; el total es la suma de las primas', () => {
    const c = cotizarCombo(catalogo, { '1': '100000', '3': '100000', '12': '1' });
    expect(c.coberturas.map((x) => [x.ccober, x.suma, x.prima])).toEqual([['1', 100000, 500], ['3', 100000, 200], ['12', 1, 25]]);
    expect([c.suma_asegurada, c.prima_total, c.errores, c.generales]).toEqual([100000, 725, {}, []]);
  });

  it('las obligatorias entran siempre aunque no se elijan y piden su suma', () => {
    const c = cotizarCombo(catalogo, {});
    expect(c.coberturas.map((x) => x.ccober)).toEqual(['1', '3']);
    expect(c.errores).toEqual({ '1': 'La suma debe ser mayor a 0.', '3': 'La suma debe ser mayor a 0.' });
    expect(c.prima_total).toBe(0);
  });

  it('topes mín./máx. y ninguna adicional por encima de la básica', () => {
    expect(cotizarCombo(catalogo, { '1': '40000', '3': '45000', '5': '500' }).errores)
      .toEqual({ '3': 'No puede superar la suma de la básica (40.000).', '5': 'Mínimo 1.000.' });
    expect(cotizarCombo(catalogo, { '1': '100000', '3': '100000', '5': '60000' }).errores).toEqual({ '5': 'Máximo 50.000.' });
    expect(cotizarCombo(catalogo, { '1': '30000', '3': '30000', '5': '30000' }).errores).toEqual({});
  });

  it('sin básica no hay tope por la básica; sin coberturas pide elegir una', () => {
    const adicionales = catalogo.filter((c) => !c.obligatoria);
    expect(cotizarCombo(adicionales, {}).generales).toEqual(['Elige al menos una cobertura.']);
    const c = cotizarCombo(adicionales, { '5': '20000', '12': '90000' });
    expect([c.suma_asegurada, c.prima_total, c.errores]).toEqual([90000, 105, {}]);
  });

  it('moneda: "$" es USD', () => {
    expect([monedaCombo(catalogo), monedaCombo([]), monedaCombo([{ ...catalogo[0], cmoneda: 'Bs' }])]).toEqual(['USD', 'USD', 'Bs']);
  });
});
