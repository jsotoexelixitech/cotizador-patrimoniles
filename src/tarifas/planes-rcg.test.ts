import { describe, expect, it } from 'vitest';
import { armarEmisionPlan, errorDeRespuesta, parsearCatalogo, parsearCotizacionPlan, parsearEmision, primasTarifaRcg } from './planes-rcg';

// Filas como las devuelve spCalculoRiesgoGeneral para PLANI en Sis2000_QA (19 coberturas de 5,84).
const filasPlanI = [
  ...Array.from({ length: 18 }, (_, i) => ({ xcobertura: `COBERTURA ${i + 1}`, msumaasegext: 30000, mprimaext: 5.84 })),
  { xcobertura: 'R.C DE PRODUCTOS', msumaasegext: 6000, mprimaext: 5.84 },
];

describe('Planes RCG Sis2000', () => {
  it('suma = mayor cobertura y prima = suma de coberturas (criterio del trigger)', () => {
    const plan = parsearCotizacionPlan(28, 'PLANI', 'Plan I', { status: true, data: filasPlanI });
    expect([plan.suma, plan.prima, plan.coberturas.length]).toEqual([30000, 110.96, 19]);
  });

  it('desenvuelve la respuesta de nest-api y detecta status false con HTTP 2xx', () => {
    expect(parsearCotizacionPlan(28, 'PLANI', 'Plan I', { status: true, data: { status: true, data: filasPlanI } }).prima).toBe(110.96);
    expect(() => parsearCotizacionPlan(28, 'PLANI', 'Plan I', { status: true, data: { status: false, message: 'Plan inválido' } })).toThrow('Plan inválido');
    expect(() => parsearCotizacionPlan(28, 'PLANI', 'Plan I', { status: true, data: [] })).toThrow('no devolvió coberturas');
  });

  it('tarifa RCG sobre la suma de cada plan con mínimo proporcional', () => {
    const planes = [{ cplan: 'PLANI', suma: 30000 }, { cplan: 'PLANII', suma: 50000 }, { cplan: 'PLAN3', suma: 75000 }];
    expect(primasTarifaRcg(planes, 0.5).map((p) => p.prima)).toEqual([150, 250, 375]);
    const minimas = primasTarifaRcg(planes, 0.1);
    expect(minimas.map((p) => p.prima)).toEqual([70, 116.67, 175]);
    expect(minimas.every((p) => p.primaMinimaAplicada)).toBe(true);
  });

  it('payload de emisión igual al de Emisión (patrimonial/emit)', () => {
    const plan = parsearCotizacionPlan(28, 'PLANII', 'Plan II', { data: [{ xcobertura: 'BASICA', msumaasegext: 50000, mprimaext: 9.74 }] });
    const p = armarEmisionPlan({
      plan, tipoDoc: 'J', documento: '12345678-9', nombre: 'Inversiones Caracas, C.A.', apellido: '', correo: 'a@b.com',
      telefono: '0412-123.45.67', direccion: 'Caracas', bien: ['Inversiones Caracas', 'Caracas', 'Comercios · Farmacias', 'Venta de medicinas'],
      pep: false, cproductor: 80080, fecha: new Date(2026, 9, 27),
    });
    expect(p.keys).toEqual({ cnpoliza_rel: null, cplan: 'PLANII', cramo: 28 });
    expect([p.tomador.tipo_tomador, p.tomador.rif_tomador, p.tomador.nombre_tomador, p.tomador.telefono_tomador])
      .toEqual(['J', 123456789, 'INVERSIONES CARACAS, C.A.', '04121234567']);
    expect([p.fdesde, p.fhasta, p.suma_asegurada, p.prima, p.ptasamon]).toEqual(['2026-10-27', '2027-10-27', 50000, 9.74, null]);
  });

  it('catálogo de nest-api agrupado por ramo y sin planes excluidos', () => {
    const fila = (cramo: number, xramo: string, cplan: string, cotizable = true) =>
      ({ cramo, xramo, ctiporamo: 6, cplan, xplan: `Plan ${cplan}`, cproducto: null, qcoberturas: 1, msumamax: 1000, mprima: 10, cotizable });
    const ramos = parsearCatalogo({ status: true, data: [
      fila(20, 'NAVES', 'RCE1'), fila(20, 'NAVES', 'RCE2'), fila(28, 'RESPONSABILIDAD CIVIL GENERAL', 'PLANI'),
      fila(28, 'RESPONSABILIDAD CIVIL GENERAL', 'BINAC'), fila(28, 'RESPONSABILIDAD CIVIL GENERAL', 'IGEMA'), fila(10, 'INCENDIO', 'PAST12', false),
    ] });
    expect(ramos.map((r) => [r.cramo, r.planes.map((p) => p.cplan)])).toEqual([[20, ['RCE1', 'RCE2']], [28, ['PLANI']], [10, ['PAST12']]]);
    expect(ramos[2].planes[0].cotizable).toBe(false);
  });

  it('emite en el ramo del plan', () => {
    const plan = parsearCotizacionPlan(20, 'RCE1', 'Plan I', { data: [{ xcobertura: 'RC EMBARCACION', msumaasegext: 5000, mprimaext: 50 }] });
    const p = armarEmisionPlan({
      plan, tipoDoc: 'V', documento: '12345678', nombre: 'Juan', apellido: 'Pérez', correo: 'a@b.com', telefono: '04121234567',
      direccion: 'La Guaira', bien: ['Juan Pérez', 'La Guaira', '', 'Lancha La Gaviota'], pep: false, cproductor: 80080,
    });
    expect(p.keys).toEqual({ cnpoliza_rel: null, cplan: 'RCE1', cramo: 20 });
  });

  it('respuesta de emisión: póliza o error', () => {
    expect(parsearEmision({ status: true, data: { status: true, cnpoliza: '28-1-89000001 ', cnrecibo: '123', urlpoliza: 'https://x/p' } }))
      .toEqual({ cnpoliza: '28-1-89000001', cnrecibo: '123', urlpoliza: 'https://x/p' });
    expect(() => parsearEmision({ status: false, message: 'Suma asegurada del plan no configurada' })).toThrow('Suma asegurada');
    expect(errorDeRespuesta({ status: true, data: [] })).toBeNull();
  });
});
