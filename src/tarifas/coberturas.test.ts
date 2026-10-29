import { describe, expect, it } from 'vitest';
import { armarEmisionCoberturas, cotizarCoberturas, parsearTarifa } from './coberturas';

// Respuesta de GET v1/riesgos-generales/tarifa para el plan 38/2 (tasas de matarifa_d en QA, 29-oct-2026).
const cob = (ccober: string, xcobertura: string, msumaplan: number, pprima: number, extra = {}) =>
  ({ ccober, ctarifa: '1', xcobertura, msumaplan, pprima, msumamin: 0, msumamax: 0, obligatoria: ccober === '1', pcomision: 0, ...extra });
const tarifa = { status: true, data: { cramo: 38, cplan: '2', xplan: 'Plan II 100.000 Combinado Residencial', cmoneda: '$', coberturas: [
  cob('1', 'COMBINADO RESIDENCIAL (BÁSICA)', 140000, 0.5),
  cob('4', 'DAÑOS POR AGUA', 42000, 0.3),
  cob('5', 'ROBO, ASALTO Y ATRACO', 24000, 0.4, { msumamin: 1000, msumamax: 50000 }),
  cob('22', 'ROTURA DE VIDRIOS INTERNOS', 9800, 0),
] } };

describe('Cotización por coberturas (ramos 16 y 38)', () => {
  const plan = parsearTarifa(tarifa)!;

  it('sumas del plan por defecto y prima = suma × tasa / 100', () => {
    const c = cotizarCoberturas(plan, ['4', '5'], {});
    expect(c.coberturas.map((x) => [x.ccober, x.suma, x.prima])).toEqual([['1', 140000, 700], ['4', 42000, 126], ['5', 24000, 96]]);
    expect([c.suma_asegurada, c.prima_total, c.errores]).toEqual([140000, 922, {}]);
  });

  it('suma editada por cobertura y la básica siempre incluida', () => {
    const c = cotizarCoberturas(plan, ['5'], { '1': '70000', '5': '30000' });
    expect(c.coberturas.map((x) => [x.ccober, x.suma, x.prima])).toEqual([['1', 70000, 350], ['5', 30000, 120]]);
    expect(c.prima_total).toBe(470);
  });

  it('marca topes y coberturas sin tasa', () => {
    const c = cotizarCoberturas(plan, ['5', '22'], { '5': '60000' });
    expect(c.errores).toEqual({ '5': 'Máximo 50000.', '22': 'Sin tasa vigente en Sis2000.' });
  });

  it('body de riesgos-generales/emision: solo coberturas y sumas', () => {
    const cot = cotizarCoberturas(plan, ['4'], { '4': '20000' });
    const p = armarEmisionCoberturas({
      cramo: 38, cplan: '2', cot, tipoDoc: 'V', documento: '12.345.678', nombre: 'Juan', apellido: 'Pérez', correo: 'j@x.com',
      telefono: '0412-1234567', direccion: 'Caracas', bien: 'Apto 5-B', apartamento: 52, cproductor: 80080,
    });
    expect(p).toEqual({
      cramo: 38, cplan: '2', coberturas: [{ ccober: '1', suma: 140000 }, { ccober: '4', suma: 20000 }],
      tomador: { tipo_cedula: 'V', rif: '12345678', nombre: 'JUAN', apellido: 'PÉREZ', direccion: 'Caracas', telefono: '04121234567', correo: 'j@x.com' },
      bien: 'Apto 5-B', direccion_riesgo: 'Caracas', apartamento: 52, productor: 80080,
    });
  });
});
