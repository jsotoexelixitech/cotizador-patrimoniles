import { describe, expect, it } from 'vitest';
import type { RamoCatalogo } from './planes-rcg';
import {
  detalleRamo, filtrarRamos, normalizar, parsearRamos, RAMO_NO_EXISTE, ramoDeBusqueda, ramosDesdePlanes, seleccionable,
} from './ramos';

// Respuesta de GET v1/riesgos-generales/ramos (contrato de nest-api; nombres y conteos de ejemplo).
const respuesta = { status: true, data: [
  { cramo: 38, xramo: 'COMBINADO RESIDENCIAL', ctiporamo: 6, qcoberturas: 12 },
  { cramo: 10, xramo: 'INCENDIO Y LÍNEAS ALIADAS ', ctiporamo: 1, qcoberturas: 5 },
  { cramo: 28, xramo: 'RESPONSABILIDAD CIVIL GENERAL', ctiporamo: 1, qcoberturas: 9 },
  { cramo: 29, xramo: 'RESPONSABILIDAD CIVIL PROFESIONAL', ctiporamo: 1, qcoberturas: 0 },
  { cramo: 2, xramo: 'TRANSPORTE', ctiporamo: 1, qcoberturas: null },
  { cramo: 16, xramo: 'COMBINADOS EMPRESARIAL', ctiporamo: 6, qcoberturas: 1 },
  { cramo: 20, xramo: 'NAVES', ctiporamo: 1, qcoberturas: 3 },
  { cramo: 25, xramo: 'RIESGOS ESPECIALES', ctiporamo: 1, qcoberturas: 4 },
  { cramo: 28, xramo: 'RESPONSABILIDAD CIVIL GENERAL (repetido)', ctiporamo: 1, qcoberturas: 1 },
] };

describe('Ramos patrimoniales del combo', () => {
  const ramos = parsearRamos(respuesta);
  const codigos = (texto: string) => filtrarRamos(ramos, texto).map((r) => r.cramo);

  it('parser: desenvuelve, quita 20 y 25 y repetidos, recorta y ordena por nombre', () => {
    expect(ramos.map((r) => [r.cramo, r.xramo, r.qcoberturas])).toEqual([
      [38, 'COMBINADO RESIDENCIAL', 12], [16, 'COMBINADOS EMPRESARIAL', 1], [10, 'INCENDIO Y LÍNEAS ALIADAS', 5],
      [28, 'RESPONSABILIDAD CIVIL GENERAL', 9], [29, 'RESPONSABILIDAD CIVIL PROFESIONAL', 0], [2, 'TRANSPORTE', 0],
    ]);
  });

  it('parser: status false o sin lista es error; lista vacía es lista vacía', () => {
    expect(() => parsearRamos({ status: false, message: 'Sin conexión con Sis2000' })).toThrow('Sin conexión con Sis2000');
    expect(() => parsearRamos({ status: true, data: null })).toThrow('no devolvió la lista de ramos');
    expect(parsearRamos({ status: true, data: [] })).toEqual([]);
  });

  it('respaldo por planes: mismos ramos sin conteo (se pueden elegir) y sin 20 ni 25', () => {
    const planes: RamoCatalogo[] = [
      { cramo: 38, xramo: 'COMBINADO RESIDENCIAL', planes: [] }, { cramo: 20, xramo: 'NAVES', planes: [] },
      { cramo: 28, xramo: 'RESPONSABILIDAD CIVIL GENERAL', planes: [] },
    ];
    const respaldo = ramosDesdePlanes(planes);
    expect(respaldo).toEqual([
      { cramo: 38, xramo: 'COMBINADO RESIDENCIAL', qcoberturas: null },
      { cramo: 28, xramo: 'RESPONSABILIDAD CIVIL GENERAL', qcoberturas: null },
    ]);
    expect(respaldo.every(seleccionable)).toBe(true);
    expect(detalleRamo(respaldo[0])).toBe('ramo 38');
    expect(ramoDeBusqueda(respaldo, 'resp').ramo?.cramo).toBe(28);
    expect(ramoDeBusqueda(respaldo, '16')).toEqual({ ramo: null, aviso: RAMO_NO_EXISTE });
  });

  it('normaliza sin acentos, mayúsculas ni espacios de más', () => {
    expect(normalizar('  Incendio  y LÍNEAS   Aliadas ')).toBe('incendio y lineas aliadas');
  });

  it('filtra letra por letra lo que se va escribiendo (cualquier texto, no solo números)', () => {
    // Los que empiezan por lo escrito van primero; INCENDIO no tiene "r" y TRANSPORTE no tiene "re".
    expect(['r', 're', 'res', 'resp'].map(codigos)).toEqual([
      [28, 29, 38, 16, 2], [28, 29, 38, 16], [28, 29, 38, 16], [28, 29],
    ]);
    expect(codigos('')).toEqual([38, 16, 10, 28, 29, 2]);
  });

  it('busca por nombre sin acentos y por varias palabras', () => {
    expect(codigos('lineas')).toEqual([10]);
    expect(codigos('LÍNEAS')).toEqual([10]);
    expect(codigos('civil general')).toEqual([28]);
    expect(codigos('combinado')).toEqual([38, 16]);
  });

  it('busca por número: el código exacto primero; "ramo 28" y "028" valen como 28', () => {
    expect(codigos('28')).toEqual([28]);
    expect(codigos('2')).toEqual([2, 28, 29]);
    expect(codigos('ramo 28')).toEqual([28]);
    expect(codigos('028')).toEqual([28]);
    expect(codigos('zzz')).toEqual([]);
    expect(codigos('99')).toEqual([]);
  });

  it('Enter elige el código exacto o el primero elegible de la lista', () => {
    expect(ramoDeBusqueda(ramos, '28')).toEqual({ ramo: ramos[3], aviso: null });
    expect(ramoDeBusqueda(ramos, 'resp').ramo?.cramo).toBe(28);
    expect(ramoDeBusqueda(ramos, 'combinado').ramo?.cramo).toBe(38);
  });

  it('Enter no elige nada si el ramo no está en la lista (ni excluidos ni números sueltos)', () => {
    expect(ramoDeBusqueda(ramos, '99')).toEqual({ ramo: null, aviso: RAMO_NO_EXISTE });
    expect(ramoDeBusqueda(ramos, '20')).toEqual({ ramo: null, aviso: RAMO_NO_EXISTE });
    expect(ramoDeBusqueda(ramos, 'naves')).toEqual({ ramo: null, aviso: RAMO_NO_EXISTE });
    expect(ramoDeBusqueda(ramos, '')).toEqual({ ramo: null, aviso: null });
    expect(ramoDeBusqueda(ramos, 'ramo')).toEqual({ ramo: null, aviso: null });
  });

  it('un ramo sin tarifas vigentes se ve pero no se elige, ni con Enter', () => {
    const profesional = ramos.find((r) => r.cramo === 29)!;
    expect(seleccionable(profesional)).toBe(false);
    expect(ramoDeBusqueda(ramos, 'profesional')).toEqual({
      ramo: null, aviso: 'RESPONSABILIDAD CIVIL PROFESIONAL (ramo 29) no tiene coberturas con tarifa vigente en Sis2000.',
    });
    // "2" coincide exacto con TRANSPORTE (sin tarifas): avisa en vez de saltar al 28.
    expect(ramoDeBusqueda(ramos, '2').ramo).toBeNull();
  });

  it('detalle de cada ramo en la lista', () => {
    expect(ramos.map(detalleRamo)).toEqual([
      'ramo 38 · 12 coberturas', 'ramo 16 · 1 cobertura', 'ramo 10 · 5 coberturas', 'ramo 28 · 9 coberturas',
      'ramo 29 · sin tarifas vigentes', 'ramo 2 · sin tarifas vigentes',
    ]);
  });
});
