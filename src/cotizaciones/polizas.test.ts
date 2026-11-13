import { describe, expect, it } from 'vitest';
import { nombrePoliza, polizasDe, polizasDeOpcion, todasCobradas } from './polizas';

describe('pólizas de una cotización guardada', () => {
  it('formato anterior (RCG): una sola póliza en la raíz', () => {
    const p = polizasDe({ cnpoliza: '28-1-1', cnrecibo: '900', urlpoliza: 'https://x/p.pdf', cobro: { ok: true } });
    expect(p).toEqual([{ cnpoliza: '28-1-1', cnrecibo: '900', urlpoliza: 'https://x/p.pdf', cobro: { ok: true } }]);
    expect(todasCobradas(p)).toBe(true);
    expect(polizasDe(null)).toEqual([]);
    expect(todasCobradas([])).toBe(false);
  });

  it('RCP + RCE: dos pólizas; pagada solo si los dos recibos están cobrados', () => {
    const p27 = { cramo: 27, prima: 200, cnpoliza: '27-1-1', cnrecibo: '27-100', urlpoliza: '', cobro: { ok: true } };
    const p37 = { cramo: 37, prima: 100, cnpoliza: '37-1-1', cnrecibo: '37-100', urlpoliza: '', cobro: { ok: false, error: 'x' } };
    const p = polizasDe({ ...p27, polizas: [p27, p37] });
    expect(p.map((x) => [x.cramo, x.cnpoliza, x.prima])).toEqual([[27, '27-1-1', 200], [37, '37-1-1', 100]]);
    expect(todasCobradas(p)).toBe(false);
    expect(todasCobradas(polizasDe({ ...p27, polizas: [p27, { ...p37, cobro: { ok: true } }] }))).toBe(true);
    expect(p.map((x) => nombrePoliza(x))).toEqual(['Responsabilidad Civil Patronal', 'Responsabilidad Civil Empresarial']);
    expect(nombrePoliza({}, 'Póliza')).toBe('Póliza');
  });

  it('pólizas que se pagan con la opción: una por body de emisión', () => {
    const d = { emisiones: { I: [{ cramo: 27, prima_total: 200 }, { cramo: 37, prima_total: 100 }], II: { cramo: 28, prima_total: 500 } } };
    expect(polizasDeOpcion(d, 'I')).toEqual([
      { cramo: 27, nombre: 'Responsabilidad Civil Patronal', prima: 200 },
      { cramo: 37, nombre: 'Responsabilidad Civil Empresarial', prima: 100 },
    ]);
    expect(polizasDeOpcion(d, 'II')).toEqual([{ cramo: 28, nombre: 'Responsabilidad Civil General', prima: 500 }]);
    expect(polizasDeOpcion(d, 'III')).toEqual([]);
    expect(polizasDeOpcion({}, null)).toEqual([]);
  });
});
