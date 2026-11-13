import { describe, expect, it } from 'vitest';
import { alternativasRcg, cotizarRcg, descripcionOpcionesRcg, errorSumaRcg, PARAMETROS_RCG, type SolicitudRcg } from './rcg';
import {
  actividadesDeClase, cotizarRc, limitesSumaDeseada, opcionesRce, opcionesRcp, PARAMETROS_RC, sumaDeseadaMaxima, TARIFA,
  validarSumaDeseada, type SolicitudRc,
} from './rcp-rce';

describe('RCG: suma asegurada deseada', () => {
  it('opciones = suma × 1/2/3 con tope en la máxima y descarte de repetidas', () => {
    expect(alternativasRcg(250000, 0.5, 'USD').map((a) => a.limite)).toEqual([250000, 500000, 750000]);
    expect(alternativasRcg(450000, 0.5, 'USD').map((a) => a.limite)).toEqual([450000, 900000, 1000000]);
    expect(alternativasRcg(500000, 0.5, 'USD').map((a) => [a.opcion, a.limite])).toEqual([['I', 500000], ['II', 1000000]]);
  });

  it('el tope sale de Parámetros (limiteMax editable)', () => {
    const p = { ...PARAMETROS_RCG, limiteMax: 300000 };
    expect(alternativasRcg(120000, 0.5, 'USD', p).map((a) => a.limite)).toEqual([120000, 240000, 300000]);
  });

  it('mensajes claros de validación', () => {
    expect(errorSumaRcg('')).toBeNull();
    expect(errorSumaRcg('50000')).toBeNull();
    expect(errorSumaRcg('1000001')).toMatch(/no puede superar la máxima permitida \(1\.000\.000\)/);
    expect(errorSumaRcg('4999')).toMatch(/mínima es 5\.000/);
    expect(errorSumaRcg('5000.123')).toMatch(/2 decimales/);
    expect(errorSumaRcg('400000', { ...PARAMETROS_RCG, limiteMax: 300000 })).toMatch(/300\.000/);
  });

  it('cotizarRcg rechaza una suma mayor a la máxima', () => {
    const s = { limite: 2000000, tasa: 0.5, moneda: 'USD', clase: 0, condiciones: [] } as unknown as SolicitudRcg;
    const r = cotizarRcg({ ...s, sucursal: 'Caracas', usuario: 'A', correoUsuario: '', asegurado: 'X', rif: '', correoDestinatario: 'a@b.com',
      intermediario: '', ubicacion: '', indole: 'Oficinas públicas', actividadEspecifica: 'Oficina', esContrato: false, numeroContrato: '', objetoObra: '', coasegurado: '' });
    expect(r.errores.limite).toBeDefined();
    expect(r.alternativas).toEqual([]);
  });

  it('describe ×2 y ×3 con tope', () => {
    expect(descripcionOpcionesRcg()).toMatch(/Opción II: la suma × 2 · Opción III: la suma × 3, con tope en 1\.000\.000/);
  });
});

describe('RCP / RCE: suma asegurada deseada por trabajador', () => {
  it('máximo = tope individual de la opción I', () => {
    expect(sumaDeseadaMaxima()).toBe(35000);
    expect(validarSumaDeseada(35000)).toBeNull();
    expect(validarSumaDeseada(35001)).toMatch(/no puede superar la máxima permitida \(35\.000 por trabajador\)/);
    expect(validarSumaDeseada(0)).toMatch(/positivo/);
    expect(validarSumaDeseada(100.555)).toMatch(/2 decimales/);
  });

  it('opciones = suma × 1/2/3 con su tope individual y colectivo', () => {
    expect(limitesSumaDeseada(10000)).toEqual([
      { id: 'I', individual: 10000, colectivo: 100000 },
      { id: 'II', individual: 20000, colectivo: 200000 },
      { id: 'III', individual: 30000, colectivo: 300000 },
    ]);
    expect(limitesSumaDeseada(35000).map((o) => [o.individual, o.colectivo])).toEqual([[35000, 275000], [40000, 300000], [45000, 325000]]);
  });

  it('descarta la opción que no supera a la anterior', () => {
    const iguales = { ...PARAMETROS_RC, opcionesRcp: PARAMETROS_RC.opcionesRcp.map((o) => ({ ...o, topeIndividual: 35000 })) };
    expect(limitesSumaDeseada(30000, iguales).map((o) => o.id)).toEqual(['I', 'II']);
    expect(limitesSumaDeseada(35000, iguales).map((o) => o.id)).toEqual(['I']);
    const factores = { ...PARAMETROS_RC, factoresSumaDeseada: [1, 1, 3] };
    expect(limitesSumaDeseada(10000, factores).map((o) => o.id)).toEqual(['I', 'III']);
  });

  it('la prima no cambia (depende de la nómina); solo cambian los límites', () => {
    const sinSuma = opcionesRcp(120000, 10, 1, 0, true, false);
    const conSuma = opcionesRcp(120000, 10, 1, 0, true, false, PARAMETROS_RC, 10000);
    expect(conSuma.map((o) => o.prima)).toEqual(sinSuma.map((o) => o.prima));
    expect(conSuma.map((o) => o.limites[0])).toEqual([10000, 20000, 30000]);
  });

  it('RCE toma los montos por empleado por id cuando se descarta una opción', () => {
    const p = { ...PARAMETROS_RC, factoresSumaDeseada: [1, 1, 3] };
    const o = opcionesRce(120000, 10, 1, 0, { negligencia: true, defensa: false, medica: false }, p, 10000);
    expect(o.map((x) => x.id)).toEqual(['I', 'III']);
    expect(o.map((x) => x.detalleOpcionales[0].prima)).toEqual([20, 100]);
  });

  describe('cotizarRc', () => {
    const clase = 1;
    const actividad = actividadesDeClase(clase)[0];
    const producto = { tasa: null, ajuste: 0, opcion: 'III' as const, adicionales: [false, false, false], opcionalesVes: [] };
    const base: SolicitudRc = {
      modo: 'both', moneda: 'USD', tasaBcv: null, base: 'employee', monto: 12000, empleados: 10, clase, otraClase: false, actividad,
      indole: 'Oficina', asegurado: 'Empresa C.A.', rif: 'J-1', correo: '', direccion: 'Caracas', sucursal: 'Caracas',
      emisor: 'Ana', correoEmisor: 'a@b.com', intermediario: '', esContrato: false, numeroContrato: '', vigenciaContrato: 'Anual', objetoContrato: '',
      p: { ...producto, tasa: TARIFA.p.risks[clase][1] },
      e: { ...producto, tasa: TARIFA.e.risks[actividad][1] },
    };

    it('sin suma deseada sigue el cálculo por nómina', () => {
      const r = cotizarRc(base);
      expect(r.errores).toEqual([]);
      expect(r.resultados[0].limites[0]).toBe(36000);
    });

    it('con suma deseada aplica suma × factor', () => {
      const r = cotizarRc({ ...base, sumaDeseada: 10000 });
      expect(r.errores).toEqual([]);
      expect(r.resultados.map((x) => x.limites)).toEqual([[30000, 300000, 300000], [30000, 300000, 300000]]);
    });

    it('rechaza una suma mayor a la máxima', () => {
      expect(cotizarRc({ ...base, sumaDeseada: 50000 }).errores.join(' ')).toMatch(/máxima permitida/);
    });

    it('si la opción elegida se descartó, toma la más alta que quedó', () => {
      const p = { ...PARAMETROS_RC, factoresSumaDeseada: [1, 2, 2] };
      const r = cotizarRc({ ...base, sumaDeseada: 10000 }, p);
      expect(r.errores).toEqual([]);
      expect(r.resultados[0].opcion).toBe('II');
      expect(r.resultados[0].limites[0]).toBe(20000);
    });

    it('en Bs se ignora (límite legal por salarios)', () => {
      const r = cotizarRc({ ...base, moneda: 'VES', tasaBcv: 40, monto: 480000, sumaDeseada: 10000 });
      expect(r.resultados[0].limites[2]).toBe(480000 * 40);
    });
  });
});
