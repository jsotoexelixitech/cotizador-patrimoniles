import { describe, expect, it } from 'vitest';
import { descuentoAplicado, descuentoPorSuma, erroresTramos, tasaConDescuento, tramosValidos } from './descuentos';
import { alternativasRcg, PARAMETROS_RCG } from './rcg';
import { opcionesRce, opcionesRcp, PARAMETROS_RC } from './rcp-rce';

const TRAMOS = [{ desde: 100000, pct: 5 }, { desde: 500000, pct: 10 }];

describe('descuentos por suma asegurada', () => {
  it('sin tramos no hay descuento', () => {
    expect(PARAMETROS_RCG.descuentos).toEqual([]);
    expect(PARAMETROS_RC.descuentos).toEqual([]);
    expect(descuentoPorSuma(1_000_000, [])).toBe(0);
    expect(descuentoPorSuma(1_000_000, undefined)).toBe(0);
    expect(descuentoAplicado(1_000_000, 0.5, [])).toBeNull();
  });

  it('aplica el tramo más alto que alcanza la suma, en cualquier orden', () => {
    expect(descuentoPorSuma(99_999.99, TRAMOS)).toBe(0);
    expect(descuentoPorSuma(100_000, TRAMOS)).toBe(5);
    expect(descuentoPorSuma(499_999, TRAMOS)).toBe(5);
    expect(descuentoPorSuma(500_000, [...TRAMOS].reverse())).toBe(10);
    expect(tasaConDescuento(0.5, 10)).toBeCloseTo(0.45, 10);
    expect(tasaConDescuento(0.5, 0)).toBe(0.5);
  });

  it('ignora tramos inválidos y los señala en Parámetros', () => {
    const malos = [{ desde: 0, pct: 5 }, { desde: 1000, pct: 0 }, { desde: 1000, pct: 150 }, { desde: 2000, pct: 5 }];
    expect(tramosValidos(malos)).toEqual([{ desde: 2000, pct: 5 }]);
    expect(erroresTramos(malos).length).toBe(3);
    expect(erroresTramos(TRAMOS)).toEqual([]);
  });
});

describe('RCG con descuento', () => {
  const p = { ...PARAMETROS_RCG, descuentos: TRAMOS };

  it('sin tramos el cálculo no cambia ni agrega campos', () => {
    const [i] = alternativasRcg(200_000, 0.5, 'USD');
    expect(i).toEqual({ opcion: 'I', limite: 200_000, prima: 1000, primaMinimaAplicada: false });
  });

  it('descuenta la tasa de cada opción según su suma', () => {
    const [i, ii, iii] = alternativasRcg(200_000, 0.5, 'USD', p);
    // I: 200.000 → 5 % → tasa 0,475 %. II: 400.000 → 5 %. III: 600.000 → 10 % → tasa 0,45 %.
    expect(i).toMatchObject({ prima: 950, descuentoPct: 5, tasaInicial: 0.5 });
    expect(i.tasaAplicada).toBeCloseTo(0.475, 10);
    expect(ii.prima).toBe(1900);
    expect(iii).toMatchObject({ prima: 2700, descuentoPct: 10 });
  });

  it('una suma por debajo del primer tramo queda igual', () => {
    const [i] = alternativasRcg(50_000, 0.5, 'USD', p);
    expect(i.prima).toBe(250);
    expect(i.descuentoPct).toBeUndefined();
  });

  it('respeta la prima mínima', () => {
    // 100.000 × 0,05 % = 50 → con 100 % de descuento sería 0: queda la mínima de la opción I.
    const [i] = alternativasRcg(100_000, 0.05, 'USD', { ...PARAMETROS_RCG, descuentos: [{ desde: 100000, pct: 100 }] });
    expect(i.prima).toBe(PARAMETROS_RCG.primaMinimaDivisa);
    expect(i.primaMinimaAplicada).toBe(true);
    const [bs] = alternativasRcg(100_000, 0.5, 'Bs.', p);
    expect(bs.prima).toBe(100_000 * (PARAMETROS_RCG.pctMinimoBs / 100));
  });
});

describe('RCP / RCE con descuento', () => {
  // Nómina 1.000.000, 10 empleados, tasa 1 %: límites por evento 275.000 / 300.000 / 325.000 (topes colectivos).
  const p = { ...PARAMETROS_RC, descuentos: [{ desde: 300000, pct: 10 }] };

  it('sin tramos el cálculo no cambia', () => {
    const base = opcionesRcp(1_000_000, 10, 1, 0, false, false);
    expect(base.map((o) => o.primaBasica)).toEqual([10000, 10000, 10000]);
    expect(base.every((o) => o.descuentoPct === undefined)).toBe(true);
  });

  it('descuenta la tasa básica de las opciones cuyo límite por evento alcanza el tramo', () => {
    const ops = opcionesRcp(1_000_000, 10, 1, 0, false, false, p);
    expect(ops.map((o) => o.limites[2])).toEqual([275000, 300000, 325000]);
    expect(ops.map((o) => o.primaBasica)).toEqual([10000, 9000, 9000]);
    expect(ops[0].descuentoPct).toBeUndefined();
    expect(ops[1]).toMatchObject({ descuentoPct: 10, tasaInicial: 1, prima: 9000 });
    expect(ops[1].tasaAplicada).toBeCloseTo(0.9, 10);
  });

  it('el ajuste se calcula sobre la básica ya descontada y RCE hereda el descuento', () => {
    const [, ii] = opcionesRcp(1_000_000, 10, 1, 10, false, false, p);
    expect(ii.ajuste).toBe(900);
    expect(ii.prima).toBe(9900);
    const rce = opcionesRce(1_000_000, 10, 1, 0, { negligencia: true, defensa: false, medica: false }, p);
    expect(rce[1]).toMatchObject({ primaBasica: 9000, descuentoPct: 10, prima: 9000 + 10 * PARAMETROS_RC.opcionesRce[1].negligencia });
  });

  it('respeta la prima mínima', () => {
    const ops = opcionesRcp(10_000, 1, 0.5, 0, false, false, { ...PARAMETROS_RC, diferenciacion: [1, 1, 1], descuentos: [{ desde: 1, pct: 100 }] });
    expect(ops.every((o) => o.prima === PARAMETROS_RC.primaMinima)).toBe(true);
  });
});
