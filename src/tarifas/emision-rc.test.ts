import { describe, expect, it } from 'vitest';
import { cotizarRcg, PARAMETROS_RCG, type SolicitudRcg } from './rcg';
import { actividadesDeClase, cotizarRc, TARIFA, type SolicitudRc } from './rcp-rce';
import { armarEmisionInformada, coberturasRc, coberturasRcg, faltantesEmisionRc, monedaSis2000 } from './emision-rc';
import { armarEmisionComboInformada, coberturasSinTarifa, conPrimaTecnica, cotizarCombo, parsearCoberturasRamo, primaTecnica } from './combo';
import { MAPEO_RCG, MAPEO_RCE, MAPEO_RCP } from './data/mapeo-sis2000';
import { COBERTURAS_BASICAS } from './rcp-rce';
import { normalizar } from './comun';

const rcg: SolicitudRcg = {
  sucursal: 'Caracas', usuario: 'Ana', correoUsuario: '', asegurado: 'Empresa C.A.', rif: 'J-1', correoDestinatario: 'a@b.com',
  intermediario: '', ubicacion: '', moneda: 'USD', clase: 1, indole: 'Farmacias', actividadEspecifica: 'Venta de medicinas',
  esContrato: false, numeroContrato: '', objetoObra: '', coasegurado: '', limite: 50000, tasa: 0.5, condiciones: [],
};

const persona = {
  cplan: 'PLANII', tipoDoc: 'J', documento: '12345678-9', nombre: 'Empresa', apellido: '', correo: 'a@b.com', telefono: '0412-1', direccion: 'Caracas',
  bien: 'Farmacias', apartamento: 1, cproductor: 80080,
};

describe('mapeo Sis2000', () => {
  it('cubre todas las coberturas del RCG (con y sin contrato) y las básicas de RCP/RCE', () => {
    const tiene = (mapeo: { concepto: string }[], n: string) => mapeo.some((m) => normalizar(m.concepto) === normalizar(n));
    for (const n of [...PARAMETROS_RCG.coberturasSinContrato, ...PARAMETROS_RCG.coberturasConContrato]) expect(tiene(MAPEO_RCG, n), n).toBe(true);
    for (const n of [...COBERTURAS_BASICAS, 'Gastos de entierro']) expect(tiene(MAPEO_RCP, n), n).toBe(true);
    for (const n of [...COBERTURAS_BASICAS, 'Secuelas o deformidades permanentes', ...TARIFA.e.options.map((o) => o[0])]) expect(tiene(MAPEO_RCE, n), n).toBe(true);
    for (const n of TARIFA.p.options.map((o) => o[0])) expect(tiene(MAPEO_RCP, n), n).toBe(true);
  });

  it('moneda del cotizador → moneda de Sis2000', () => {
    expect(['USD', 'EUR', 'Bs.', 'VES'].map(monedaSis2000)).toEqual(['USD', 'EUR', 'BS', 'BS']);
  });
});

describe('RCG → Sis2000 ramo 28', () => {
  const cot = cotizarRcg(rcg);

  it('opción II: básica con el límite y toda la prima; sublímites con prima 0', () => {
    const e = coberturasRcg(cot, 'II', 'USD')!;
    expect(e.cramo).toBe(28);
    expect(e.sinMapeo).toEqual([]);
    expect(e.lineas[0]).toMatchObject({ ccober: '1', suma: 100000, prima: 500 });
    expect(e.lineas.slice(1).every((l) => l.prima === 0 && l.suma > 0)).toBe(true);
    expect(e.lineas.find((l) => l.ccober === '25')?.suma).toBe(20000);
    expect(e.primaTotal).toBe(500);
  });

  it('en Bs. usa las coberturas BS; Vigilantes privados no tiene equivalente y bloquea', () => {
    const e = coberturasRcg(cotizarRcg({ ...rcg, moneda: 'Bs.' }), 'I', 'Bs.')!;
    expect(e.lineas[0].ccober).toBe('29');
    expect(e.sinMapeo).toEqual(['Responsabilidad Civil por Vigilantes Privados (sin cobertura en BS)']);
    expect(faltantesEmisionRc({ emision: e, valida: true, documento: '123456789', cplan: 'P', apartamento: '1' })[0]).toContain('Vigilantes Privados');
  });

  it('con el catálogo del ramo toma la ctarifa y rechaza un ccober que no esté', () => {
    const catalogo = parsearCoberturasRamo({ status: true, data: { coberturas: [{ ccober: '1', ctarifa: '7', xcobertura: 'BASICA', cmoneda: '$' }] } });
    const e = coberturasRcg(cot, 'I', 'USD', catalogo)!;
    expect(e.lineas).toEqual([expect.objectContaining({ ccober: '1', ctarifa: '7' })]);
    expect(e.sinMapeo[0]).toBe('Riesgo de Vecinos (la 2 no está en el ramo 28)');
  });

  it('body modo cotizador: prima por cobertura, prima total, origen y número', () => {
    const e = coberturasRcg(cot, 'II', 'USD')!;
    const body = armarEmisionInformada({ ...persona, emision: e, ncotizacion: 'RCG-2026-P000001' });
    expect(body).toMatchObject({ cramo: 28, cplan: 'PLANII', modo: 'cotizador', cotizador: 'rcg', ncotizacion: 'RCG-2026-P000001', prima_total: 500, apartamento: 1 });
    expect(body.coberturas[0]).toEqual({ ccober: '1', suma: 100000, prima: 500 });
    expect(body.coberturas.reduce((s, c) => s + c.prima, 0)).toBe(body.prima_total);
    expect(body.tomador.rif).toBe('123456789');
  });

  it('faltantes: RIF de hasta 9 dígitos, plan, unidad en 28 y prima > 0', () => {
    const e = coberturasRcg(cot, 'I', 'USD')!;
    expect(faltantesEmisionRc({ emision: e, valida: true, documento: '12345678-9', cplan: 'PLANI', apartamento: '1' })).toEqual([]);
    expect(faltantesEmisionRc({ emision: { ...e, primaTotal: 0, lineas: e.lineas.map((l) => ({ ...l, prima: 0 })) }, valida: true, documento: '1234567890', cplan: '', apartamento: '' })).toEqual([
      'La prima total es 0: no se emite una póliza sin prima.', 'Ninguna cobertura lleva prima.',
      'Indica el RIF o la cédula del tomador (hasta 9 dígitos) en el paso del tomador.', 'Elige el plan contenedor.',
      'En el ramo 28 indica el número de apartamento o unidad.',
    ]);
  });
});

describe('RCP / RCE → Sis2000 ramos 27 y 37', () => {
  const clase = 1;
  const actividad = actividadesDeClase(clase)[0];
  const producto = { tasa: null, ajuste: 0, opcion: 'II' as const, adicionales: [true, false, true], opcionalesVes: [] };
  const base: SolicitudRc = {
    modo: 'both', moneda: 'USD', tasaBcv: null, base: 'employee', monto: 12000, empleados: 10, clase, otraClase: false, actividad,
    indole: 'Oficina', asegurado: 'Empresa C.A.', rif: 'J-1', correo: '', direccion: 'Caracas', sucursal: 'Caracas',
    emisor: 'Ana', correoEmisor: 'a@b.com', intermediario: '', esContrato: false, numeroContrato: '', vigenciaContrato: 'Anual', objetoContrato: '',
    p: { ...producto, tasa: TARIFA.p.risks[clase][1] },
    e: { ...producto, tasa: TARIFA.e.risks[actividad][1] },
  };
  const cot = cotizarRc(base);

  it('RCP USD con médica: la básica lleva la prima menos la médica; la suma de primas = prima de la opción', () => {
    const r = cot.resultados.find((x) => x.k === 'p')!;
    const e = coberturasRc(r, 'USD');
    expect(e.cramo).toBe(27);
    expect(e.sinMapeo).toEqual([]);
    const medica = e.lineas.find((l) => l.ccober === '12')!;
    expect(medica.prima).toBe(300);
    expect(e.lineas[0]).toMatchObject({ ccober: '1', suma: r.limites[2] });
    expect(e.primaTotal).toBe(r.prima);
    expect(e.lineas.filter((l) => ['2', '3', '4', '5', '6', '7', '8'].includes(l.ccober)).every((l) => l.prima === 0 && l.suma === r.limites[0])).toBe(true);
  });

  it('RCP USD con hernia: sin código en USD, su prima va en la básica y no bloquea (manda la prima del cotizador)', () => {
    const conHernia = cotizarRc({ ...base, modo: 'p', p: { ...base.p, adicionales: [false, true] } });
    const e = coberturasRc(conHernia.resultados[0], 'USD');
    expect(e.sinMapeo).toEqual([]);
    expect(e.lineas.some((l) => /hernia/i.test(l.concepto))).toBe(false);
    expect(e.primaTotal).toBe(conHernia.resultados[0].prima);
  });

  it('RCE USD con negligencia y gastos médicos: 9 y 11 con su prima', () => {
    const r = cot.resultados.find((x) => x.k === 'e')!;
    const e = coberturasRc(r, 'USD');
    expect(e.cramo).toBe(37);
    expect(e.sinMapeo).toEqual([]);
    expect(e.lineas.filter((l) => l.prima > 0).map((l) => l.ccober).sort()).toEqual(['1', '11', '9']);
    expect(e.primaTotal).toBe(r.prima);
  });

  it('RCE en EUR: solo la básica existe en EUR; lleva toda la prima y no bloquea', () => {
    const r = cotizarRc({ ...base, moneda: 'EUR' }).resultados.find((x) => x.k === 'e')!;
    const e = coberturasRc(r, 'EUR');
    expect(e.lineas.map((l) => l.ccober)).toEqual(['13']);
    expect(e.sinMapeo).toEqual([]);
    expect(e.primaTotal).toBe(r.prima);
  });
});

describe('combo: tarifa de Técnico', () => {
  const cob = (ccober: string, xcobertura: string, pprima: number) =>
    ({ ccober, ctarifa: '1', xcobertura, cmoneda: '$', obligatoria: ccober === '1', pprima, mprima: 0, msumamin: 0, msumamax: 0, pcomision: 10 });
  const catalogo = parsearCoberturasRamo({ status: true, data: { cramo: 28, coberturas: [cob('1', 'BÁSICA', 0), cob('4', 'INCENDIO', 0.1), cob('9', 'ROBO', 0)] } });

  it('prima de Técnico: la prima escrita manda; si no, suma × tasa / 100; inválida = NaN', () => {
    expect(primaTecnica({ tasa: '0.5' }, 10000)).toBe(50);
    expect(primaTecnica({ tasa: '0.5', prima: '80' }, 10000)).toBe(80);
    expect(primaTecnica({}, 10000)).toBeNull();
    expect(primaTecnica({ prima: '-1' }, 10000)).toBeNaN();
  });

  it('sin vista técnica nada cambia: la básica sin tarifa bloquea', () => {
    const cot = cotizarCombo(catalogo, { '1': '10000', '4': '1000' });
    expect(conPrimaTecnica(cot)).toBe(false);
    expect(coberturasSinTarifa(catalogo, cot)).toEqual(['BÁSICA']);
  });

  it('con tasa o prima de Técnico (> 0) la cobertura deja de bloquear; con 0 sigue bloqueando', () => {
    const cot = cotizarCombo(catalogo, { '1': '10000', '4': '1000', '9': '2000' }, { '1': { tasa: '0.8' }, '9': { prima: '0' } });
    expect(cot.coberturas.map((c) => [c.ccober, c.prima, !!c.tecnica])).toEqual([['1', 80, true], ['4', 1, false], ['9', 0, true]]);
    expect(coberturasSinTarifa(catalogo, cot)).toEqual(['ROBO']);
    expect(cotizarCombo(catalogo, { '1': '10000' }, { '1': { prima: 'x' } }).errores['1']).toBe('La tasa o la prima de Técnico no es válida.');
  });

  it('body del combo con prima de Técnico: modo cotizador con todas las primas', () => {
    const cot = cotizarCombo(catalogo, { '1': '10000', '4': '1000' }, { '1': { prima: '80' } });
    const body = armarEmisionComboInformada({ ...persona, cramo: 28, cot, catalogo, ncotizacion: 'COMBO-2026-P1' });
    expect(body).toMatchObject({ modo: 'cotizador', cotizador: 'combo', prima_total: 81, ncotizacion: 'COMBO-2026-P1' });
    expect(body.coberturas).toEqual([{ ccober: '1', ctarifa: '1', suma: 10000, prima: 80 }, { ccober: '4', ctarifa: '1', suma: 1000, prima: 1 }]);
  });
});
