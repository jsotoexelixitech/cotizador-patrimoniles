import { describe, expect, it } from 'vitest';
import { armarEmisionCombo, coberturasSinTarifa, cotizarCombo, faltantesEmisionCombo, parsearCoberturasRamo, pideUnidad, planesContenedor, sinTarifa } from './combo';
import { parsearCatalogo } from './planes-rcg';

const cob = (ccober: string, xcobertura: string, pprima: number, extra = {}) =>
  ({ ccober, ctarifa: '1', xcobertura, cmoneda: '$', obligatoria: ccober === '1', pprima, mprima: 0, msumamin: 0, msumamax: 0, pcomision: 10, ...extra });
const catalogo = parsearCoberturasRamo({ status: true, data: { cramo: 27, coberturas: [
  cob('1', 'BÁSICA', 0.5), cob('5', 'ROTURA', 0, { mprima: 20, ctarifa: '3' }),
] } });

// valrep/planes/riesgos-generales: planes vigentes de ramos patrimoniales (filas de ejemplo).
const fila = (cramo: number, cplan: string, xplan: string) => ({ cramo, xramo: `RAMO ${cramo}`, cplan, xplan, qcoberturas: 0, msumamax: 0, mprima: 0, cotizable: false });
const valrep = { status: true, data: [
  fila(27, 'P10', 'Plan 10'), fila(27, 'P2', 'Plan 2'), fila(25, 'PAS06', 'Pastora 6'), fila(28, 'BINAC', 'RCV binacional'), fila(28, 'PLANI', 'Plan I'),
] };

describe('Emisión del combo con plan contenedor', () => {
  it('planes contenedores: los del ramo ordenados por código, con 20 y 25 pero sin los planes excluidos', () => {
    const contenedores = parsearCatalogo(valrep, { conRamosExcluidos: true });
    expect(planesContenedor(contenedores, 27)).toEqual([{ cplan: 'P2', xplan: 'Plan 2' }, { cplan: 'P10', xplan: 'Plan 10' }]);
    expect(planesContenedor(contenedores, 25).map((p) => p.cplan)).toEqual(['PAS06']);
    expect(planesContenedor(contenedores, 28).map((p) => p.cplan)).toEqual(['PLANI']);
    expect(planesContenedor(contenedores, null)).toEqual([]);
    // Sin la opción, el catálogo de "Planes Sis2000" sigue sin el ramo 25.
    expect(parsearCatalogo(valrep).map((r) => r.cramo)).toEqual([27, 28]);
  });

  it('pide unidad solo en los ramos 28 y 38', () => {
    expect([28, 38, 16, 27, null].map((r) => pideUnidad(r))).toEqual([true, true, false, false, false]);
  });

  it('faltantes: combo válido, RIF, plan contenedor y unidad en 28/38', () => {
    expect(faltantesEmisionCombo({ cramo: 27, cplan: 'P2', apartamento: '', valida: true, documento: 'J-12345678-9' })).toEqual([]);
    expect(faltantesEmisionCombo({ cramo: 28, cplan: ' ', apartamento: '0', valida: false, documento: '' })).toEqual([
      'Revisa las coberturas y sumas en el paso de cotización.', 'Indica el RIF o la cédula del tomador (hasta 9 dígitos) en el paso del tomador.', 'Elige el plan contenedor.', 'En el ramo 28 indica el número de apartamento o unidad.',
    ]);
    expect(faltantesEmisionCombo({ cramo: 38, cplan: 'P1', apartamento: '52', valida: true, documento: 'V-12345678' })).toEqual([]);
  });

  it('body de emisión: modo combo, plan contenedor, tarifa de cada cobertura y sumas (sin primas)', () => {
    const cot = cotizarCombo(catalogo, { '1': '10000', '5': '3000' });
    const body = armarEmisionCombo({
      cramo: 28, cplan: 'PLANI', cot, catalogo, tipoDoc: 'J', documento: 'J-12345678-9', nombre: 'Acme', apellido: '', correo: 'a@b.com',
      telefono: '0412-1234567', direccion: 'Caracas', bien: 'Local', apartamento: 7, cproductor: 80080,
    });
    expect(body).toEqual({
      cramo: 28, cplan: 'PLANI', modo: 'combo',
      coberturas: [{ ccober: '1', ctarifa: '1', suma: 10000 }, { ccober: '5', ctarifa: '3', suma: 3000 }],
      tomador: { tipo_cedula: 'J', rif: '123456789', nombre: 'ACME', apellido: '', direccion: 'Caracas', telefono: '04121234567', correo: 'a@b.com' },
      bien: 'Local', direccion_riesgo: 'Caracas', apartamento: 7, productor: 80080,
    });
  });
});

describe('combo: coberturas sin tarifa en Sis2000', () => {
  // Como el ramo 18 en QA: la básica sin tasa ni prima fija, una con tasa y una opcional sin tarifa.
  const cat18 = parsearCoberturasRamo({ status: true, data: { cramo: 18, coberturas: [
    cob('1', 'BÁSICA', 0), cob('4', 'INCENDIO', 0.1), cob('9', 'ROBO', 0, { mprima: 0 }), cob('6', 'ASISTENCIA', 0, { mprima: 0.4 }),
  ] } });

  it('identifica las coberturas sin tasa ni prima fija', () => {
    expect(cat18.filter(sinTarifa).map((c) => c.ccober)).toEqual(['1', '9']);
    expect(sinTarifa({ pprima: 0, mprima: 0.4 })).toBe(false);
    expect(sinTarifa({ pprima: 0.1, mprima: 0 })).toBe(false);
  });

  it('lista las del combo sin tarifa y bloquea la emisión (con prima 0 también)', () => {
    const cot = cotizarCombo(cat18, { '1': '1000', '4': '1000' });
    expect(coberturasSinTarifa(cat18, cot)).toEqual(['BÁSICA']);
    const f = faltantesEmisionCombo({ cramo: 18, cplan: 'P1', apartamento: '', valida: true, documento: 'J-12345678-9', sinTarifa: ['BÁSICA'], primaTotal: cot.prima_total });
    expect(f).toEqual(['Falta la tasa de BÁSICA: escríbela en la columna «Tasa %» del paso de cotización (o que Técnico la cargue en el «Tarificador»).']);
    expect(faltantesEmisionCombo({ cramo: 18, cplan: 'P1', apartamento: '', valida: true, documento: 'J-12345678-9', sinTarifa: [], primaTotal: 0 }))
      .toEqual(['La prima total del combo es 0: no se puede emitir una póliza sin prima.']);
  });

  it('con tarifa en todas y prima > 0 no agrega nada', () => {
    const cot = cotizarCombo(catalogo, { '1': '1000' });
    expect(coberturasSinTarifa(catalogo, cot)).toEqual([]);
    expect(faltantesEmisionCombo({ cramo: 27, cplan: 'P2', apartamento: '', valida: true, documento: 'J-12345678-9', sinTarifa: [], primaTotal: cot.prima_total })).toEqual([]);
  });
});
