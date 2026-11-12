import { describe, expect, it } from 'vitest';
import { ANEXOS_RCG, CONDICIONADO_GENERAL, ccoberDeConceptos, documentosRcg, documentosRcgSis2000 } from './condicionadosRcg';
import { MAPEO_RCG } from '../tarifas/data/mapeo-sis2000';
import { parsearCotizacionPlan } from '../tarifas/planes-rcg';

const ids = (docs: { id: string }[]) => docs.map((d) => d.id);
const anexo = (id: string) => ANEXOS_RCG.find((a) => a.id === id)!;

describe('anexos del RCG por código de cobertura de Sis2000 (ccober)', () => {
  it('cada anexo de cobertura toma sus ccober del mapeo de Sis2000 (todas las monedas)', () => {
    expect(anexo('anexo-riesgo-vecinos').ccober).toEqual(['2', '35']);
    expect(anexo('anexo-contaminacion-ambiental').ccober).toEqual(['10', '30', '59']);
    expect(anexo('anexo-vigilantes-privados').ccober).toEqual(['6']);
    expect(anexo('anexo-moneda-extranjera').ccober).toEqual([]);
    expect(CONDICIONADO_GENERAL.ccober).toEqual([]);
    for (const a of ANEXOS_RCG.filter((x) => !x.soloDivisa)) {
      expect(a.ccober.length).toBeGreaterThan(0);
      expect(a.ccober).toEqual(ccoberDeConceptos(a.coberturas));
    }
    // Ningún código activa dos anexos distintos.
    const todos = ANEXOS_RCG.flatMap((a) => a.ccober);
    expect(new Set(todos).size).toBe(todos.length);
    // Las coberturas del mapeo sin anexo oficial no aparecen en ninguno.
    const sinAnexo = MAPEO_RCG.find((m) => m.concepto === 'Responsabilidad Civil Cruzada')!;
    expect(todos).not.toContain(sinAnexo.ccober.USD);
  });

  it('ramo 28 por ccober: condicionado + anexos de los códigos, aunque el nombre de Sis2000 no empate', () => {
    const docs = documentosRcgSis2000(28, [
      { ccober: '1', nombre: 'LIMITE UNICO COMBINADO' }, { ccober: '2', nombre: 'COB 2' }, { ccober: '6', nombre: 'VIGILANTE PRIVADO' },
      { ccober: '13', nombre: 'R.C. CRUZADA' },
    ], 'USD');
    expect(ids(docs)).toEqual(['condicionado-general-particular-rcg', 'anexo-riesgo-vecinos', 'anexo-vigilantes-privados', 'anexo-moneda-extranjera']);
  });

  it('ramo 28 por ccober en bolívares: códigos BS y sin anexo de moneda extranjera', () => {
    const docs = documentosRcgSis2000(28, [{ ccober: '29' }, { ccober: '36' }, { ccober: '53' }], 'BS');
    expect(ids(docs)).toEqual(['condicionado-general-particular-rcg', 'anexo-riesgo-locativo', 'anexo-incendio-explosion']);
  });

  it('ramo 28 por nombre (respaldo sin ccober): sin acentos, mayúsculas, sufijo de moneda ni «Responsabilidad Civil»', () => {
    const docs = documentosRcgSis2000(28, [
      { nombre: 'RIESGO DE VECINOS BS' }, { nombre: 'DAÑOS CAUSADOS POR AGUA' }, { nombre: 'R.C. Contaminación Ambiental (USD)' },
      { nombre: 'Responsabilidad Civil de Transporte, Carga y Descarga' }, { nombre: 'VEHICULOS ESTACIONADOS' }, { nombre: '' },
    ], 'Bs.');
    expect(ids(docs)).toEqual([
      'condicionado-general-particular-rcg', 'anexo-riesgo-vecinos', 'anexo-danos-por-agua', 'anexo-contaminacion-ambiental', 'anexo-transporte-carga-descarga',
    ]);
  });

  it('moneda extranjera: el anexo entra en USD, EUR, $ y €; no en bolívares', () => {
    for (const m of ['USD', 'EUR', '$', '€', 'usd']) expect(ids(documentosRcgSis2000(28, [], m))).toEqual(['condicionado-general-particular-rcg', 'anexo-moneda-extranjera']);
    for (const m of ['BS', 'Bs.', 'VES', '']) expect(ids(documentosRcgSis2000(28, [], m))).toEqual(['condicionado-general-particular-rcg']);
    expect(ids(documentosRcg([], 'EUR'))).toContain('anexo-moneda-extranjera');
  });

  it('ramo distinto de 28: sin condicionado ni anexos del RCG, aunque los códigos o nombres coincidan', () => {
    for (const cramo of [27, 37, 38, 20, null, undefined]) {
      expect(documentosRcgSis2000(cramo, [{ ccober: '2', nombre: 'Riesgo de Vecinos' }], 'USD')).toEqual([]);
    }
  });

  it('la búsqueda por nombre del cotizador RCG sigue igual', () => {
    expect(ids(documentosRcg(['Riesgo de Vecinos', 'Riesgo Locativo (prima 10,00)'], 'Bs.'))).toEqual([
      'condicionado-general-particular-rcg', 'anexo-riesgo-vecinos', 'anexo-riesgo-locativo',
    ]);
  });

  it('plan de Sis2000: la cotización conserva el ccober si la respuesta lo trae y sirve para elegir anexos', () => {
    const conCodigo = parsearCotizacionPlan(28, 'PLANI', 'Plan I', { status: true, data: [
      { ccober: 1, xcobertura: 'BASICA', msumaaseg: 5000, mprimaext: 100 }, { ccober: ' 3 ', xcobertura: 'LOCATIVO', msumaaseg: 1000, mprimaext: 0 },
    ] });
    expect(conCodigo.coberturas.map((c) => c.ccober)).toEqual(['1', '3']);
    expect(ids(documentosRcgSis2000(conCodigo.cramo, conCodigo.coberturas, 'USD'))).toEqual(['condicionado-general-particular-rcg', 'anexo-riesgo-locativo', 'anexo-moneda-extranjera']);
    const sinCodigo = parsearCotizacionPlan(28, 'PLANI', 'Plan I', [{ xcobertura: 'RIESGO LOCATIVO', msumaaseg: 1000, mprimaext: 5 }]);
    expect(sinCodigo.coberturas[0]).toEqual({ nombre: 'RIESGO LOCATIVO', suma: 1000, prima: 5 });
    expect(ids(documentosRcgSis2000(28, sinCodigo.coberturas, 'USD'))).toContain('anexo-riesgo-locativo');
  });
});
