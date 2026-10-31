import { describe, expect, it } from 'vitest';
import { alternativasRcg, cotizarRcg, sublimite, type SolicitudRcg } from './rcg';
import { actividadesDeClase, cotizarRc, opcionesRce, opcionesRcp, TARIFA, type SolicitudRc } from './rcp-rce';

describe('RCG', () => {
  it('opciones ×1/×2/×3 con prima = límite × tasa', () => {
    expect(alternativasRcg(100000, 0.5, 'USD').map((a) => [a.opcion, a.limite, a.prima]))
      .toEqual([['I', 100000, 500], ['II', 200000, 1000], ['III', 300000, 1500]]);
  });

  it('mínimo USD/EUR 70 proporcional a cada opción', () => {
    expect(alternativasRcg(5000, 0.1, 'EUR').map((a) => a.prima)).toEqual([70, 140, 210]);
  });

  it('mínimo en Bs = 35 % de cada suma', () => {
    expect(alternativasRcg(5000, 0.1, 'Bs.').map((a) => a.prima)).toEqual([1750, 3500, 5250]);
  });

  it('tope de 1.000.000 y descarta opciones repetidas', () => {
    expect(alternativasRcg(400000, 0.5, 'USD').map((a) => a.limite)).toEqual([400000, 800000, 1000000]);
    expect(alternativasRcg(600000, 0.5, 'USD').map((a) => a.limite)).toEqual([600000, 1000000]);
    expect(alternativasRcg(1000000, 0.5, 'USD')).toHaveLength(1);
  });

  it('sublímite 30 % con tope', () => {
    expect(sublimite('Responsabilidad Civil Defensa Penal y Asistencia Legal', 100000)).toBe(20000);
    expect(sublimite('Responsabilidad Civil Defensa Penal y Asistencia Legal', 50000)).toBe(15000);
    expect(sublimite('Riesgo de Vecinos', 50000)).toBe(50000);
  });

  const base: SolicitudRcg = {
    sucursal: 'Caracas', usuario: 'Ana', correoUsuario: '', asegurado: 'Empresa C.A.', rif: 'J-1', correoDestinatario: 'a@b.com',
    intermediario: '', ubicacion: '', moneda: 'USD', clase: 1, indole: 'Farmacias', actividadEspecifica: 'Venta de medicinas',
    esContrato: false, numeroContrato: '', objetoObra: '', coasegurado: '', limite: 50000, tasa: 0.5, condiciones: [2],
  };

  it('actividades restringidas: se cotizan con aviso de mesa técnica, sin error', () => {
    const r = cotizarRcg({ ...base, actividadEspecifica: 'Venta de fuegos artificiales' });
    expect([r.restringida, r.errores, r.alternativas.length]).toEqual([true, {}, 3]);
    // La índole restringida no exige clase: la evalúa la mesa técnica.
    const i = cotizarRcg({ ...base, indole: 'Actividades petroleras' });
    expect([i.restringida, i.errores.indole, i.alternativas.length]).toEqual([true, undefined, 3]);
    expect(cotizarRcg(base).restringida).toBe(false);
  });

  it('bloquea índoles de industria fuera de su clase', () => {
    expect(cotizarRcg({ ...base, indole: 'Construcción' }).errores.indole).toMatch(/Industrias/);
    expect(cotizarRcg({ ...base, indole: 'Construcción', clase: 4, tasa: 0.5 }).errores.indole).toBeUndefined();
  });

  it('valida la tasa contra el rango de la clase', () => {
    expect(cotizarRcg({ ...base, tasa: 1.6 }).errores.tasa).toBeDefined();
  });

  it('las condiciones opcionales solo aplican con contrato; la 5.ª siempre', () => {
    expect(cotizarRcg(base).condiciones).toHaveLength(1);
    const conContrato = cotizarRcg({ ...base, esContrato: true, numeroContrato: '1', objetoObra: 'x', coasegurado: 'y' });
    expect(conContrato.condiciones).toHaveLength(2);
    expect(conContrato.coberturas).toHaveLength(7);
  });
});

describe('RCP / RCE (USD)', () => {
  it('RCP: primas iguales se diferencian ×1 / ×1,10 / ×1,15', () => {
    const o = opcionesRcp(120000, 10, 1, 0, false, false);
    expect(o.map((x) => x.prima)).toEqual([1200, 1320, 1380]);
    expect(o.map((x) => x.limites)).toEqual([[24000, 240000, 240000], [30000, 300000, 300000], [36000, 325000, 325000]]);
  });

  it('RCP con asistencia médica por empleado', () => {
    expect(opcionesRcp(120000, 10, 1, 0, true, false).map((x) => x.prima)).toEqual([1350, 1500, 1950]);
  });

  it('RCE con negligencia del empleador por empleado', () => {
    expect(opcionesRce(120000, 10, 1, 0, { negligencia: true, defensa: false, medica: false }).map((x) => x.prima))
      .toEqual([1220, 1240, 1300]);
  });

  it('prima mínima 70', () => {
    expect(opcionesRcp(18000, 10, 0.1, 0, false, false).map((x) => x.prima)).toEqual([70, 77, 80.5]);
  });
});

describe('cotizarRc', () => {
  const clase = 1;
  const actividad = actividadesDeClase(clase)[0];
  const producto = { tasa: null, ajuste: 0, opcion: 'I' as const, adicionales: [false, false, false], opcionalesVes: [] };
  const base: SolicitudRc = {
    modo: 'both', moneda: 'USD', tasaBcv: null, base: 'employee', monto: 12000, empleados: 10, clase, otraClase: false, actividad,
    indole: 'Oficina', asegurado: 'Empresa C.A.', rif: 'J-1', correo: '', direccion: 'Caracas', sucursal: 'Caracas',
    emisor: 'Ana', correoEmisor: 'a@b.com', intermediario: '', esContrato: false, numeroContrato: '', vigenciaContrato: 'Anual', objetoContrato: '',
    p: { ...producto, tasa: TARIFA.p.risks[clase][1] },
    e: { ...producto, tasa: TARIFA.e.risks[actividad][1] },
  };

  it('cotiza patronal + empresarial sin errores', () => {
    const r = cotizarRc(base);
    expect(r.errores).toEqual([]);
    expect(r.resultados).toHaveLength(2);
    expect(r.total).toBeGreaterThan(0);
  });

  it('exige salario anual mínimo de 1.800 por empleado', () => {
    expect(cotizarRc({ ...base, monto: 1000 }).errores.join(' ')).toMatch(/1\.800/);
  });

  it('en Bs: RCP = 35 % del límite por evento y RCE = 60 % de la patronal', () => {
    const r = cotizarRc({ ...base, moneda: 'VES', tasaBcv: 40, monto: 480000 });
    const p = r.resultados.find((x) => x.k === 'p')!;
    const e = r.resultados.find((x) => x.k === 'e')!;
    expect(p.limites[2]).toBe(480000 * 40);
    expect(p.prima).toBe(480000 * 40 * 0.35);
    expect(e.prima).toBeCloseTo(p.prima * 0.6, 2);
  });
});

describe('Parámetros configurables', () => {
  it('RCG: la prima mínima y los factores salen de los parámetros', async () => {
    const { PARAMETROS_RCG } = await import('./rcg');
    const p = { ...PARAMETROS_RCG, primaMinimaDivisa: 100, factoresOpciones: [1, 1.5, 2] };
    expect(alternativasRcg(5000, 0.1, 'USD', p).map((a) => [a.limite, a.prima])).toEqual([[5000, 100], [7500, 150], [10000, 200]]);
  });

  it('RCP: la prima mínima y los montos por empleado salen de los parámetros', async () => {
    const { PARAMETROS_RC } = await import('./rcp-rce');
    const p = { ...PARAMETROS_RC, opcionesRcp: PARAMETROS_RC.opcionesRcp.map((o) => ({ ...o, medica: o.medica * 2 })) };
    expect(opcionesRcp(120000, 10, 1, 0, true, false, p).map((x) => x.prima)).toEqual([1500, 1800, 2700]);
  });
});
