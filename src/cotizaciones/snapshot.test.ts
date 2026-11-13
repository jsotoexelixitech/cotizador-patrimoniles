import { describe, expect, it } from 'vitest';
import { parsearCoberturasRamo } from '../tarifas/combo';
import { coberturasRcg } from '../tarifas/emision-rc';
import type { RamoCatalogo } from '../tarifas/planes-rcg';
import { cotizarRcg, PARAMETROS_RCG, type SolicitudRcg } from '../tarifas/rcg';
import { actividadesDeClase, cotizarRc, PARAMETROS_RC, type SolicitudRc } from '../tarifas/rcp-rce';
import {
  datosCotizacionRc, datosCotizacionRcg, estadoParaReabrir, huellaCotizacion, planContenedorRcg, type ContextoEmision, type EstadoCotizador,
} from './snapshot';

const comun = {
  asegurado: 'Empresa C.A.', tipoDoc: 'J', documento: '123456789', correo: 'a@b.com', intermediario: '', ubicacion: 'Caracas, Chacao',
  sucursal: 'Caracas', emisor: 'Ana', correoEmisor: 'ana@lm.com', apellido: '', telefono: '04121234567', apartamento: '',
};
const contrato = { esContrato: false, numero: '', objeto: '', coasegurado: '', vigencia: 'Anual' };
const rcg = { moneda: 'USD' as const, clase: 1, indole: 'Farmacias', actividadEspecifica: 'Venta de medicinas', limite: '50000', tasa: '0.5', condiciones: [], opcion: 'II' as const };
const estado = { producto: 'rcg', comun, contrato, rcg, rc: {} } as unknown as EstadoCotizador;

const solicitud: SolicitudRcg = {
  sucursal: 'Caracas', usuario: 'Ana', correoUsuario: '', asegurado: comun.asegurado, rif: 'J-123456789', correoDestinatario: comun.correo,
  intermediario: '', ubicacion: comun.ubicacion, moneda: 'USD', clase: 1, indole: rcg.indole, actividadEspecifica: rcg.actividadEspecifica,
  esContrato: false, numeroContrato: '', objetoObra: '', coasegurado: '', limite: 50000, tasa: 0.5, condiciones: [],
};
const cot = cotizarRcg(solicitud);

// Catálogo del ramo 28 con todas las coberturas que usa la cotización.
const catalogo = parsearCoberturasRamo({
  status: true,
  data: { coberturas: coberturasRcg(cot, 'I', 'USD')!.lineas.map((l) => ({ ccober: l.ccober, ctarifa: '7', xcobertura: l.concepto, cmoneda: '$' })) },
});
const plan = (cplan: string) => ({ cramo: 28, xramo: 'RCG', cplan, xplan: cplan, cproducto: null, qcoberturas: 1, msumamax: 0, mprima: 0, cotizable: true });
const contenedores: RamoCatalogo[] = [{ cramo: 28, xramo: 'RCG', planes: ['PLANI', 'PLANII', 'PLAN3', 'PBT1'].map(plan) }];
const emision: ContextoEmision = { catalogo, contenedores, cproductor: 80080, esPersonaNatural: false };
const opciones = { mesaTecnica: false, vigenciaDias: 15, emision };

describe('cotización RCG guardada', () => {
  const d = datosCotizacionRcg(estado, cot, opciones);

  it('lleva tomador, riesgo y las tres opciones con suma y prima', () => {
    expect(d).toMatchObject({ version: 1, producto: 'rcg', moneda: 'USD', opcionElegida: 'II', sinPagoEnLinea: [] });
    expect(d.tomador).toMatchObject({ nombre: 'Empresa C.A.', documento: '123456789', rif: 'J-123456789', correo: 'a@b.com' });
    expect(d.alternativas.map((a) => [a.opcion, a.limite, a.prima])).toEqual([['I', 50000, 250], ['II', 100000, 500], ['III', 150000, 750]]);
    expect(d.coberturas.length).toBe(PARAMETROS_RCG.coberturasSinContrato.length);
  });

  it('deja armada la emisión (modo cotizador) de cada opción por su misma prima', () => {
    for (const a of d.alternativas) {
      const e = d.emisiones![a.opcion] as { modo: string; cramo: number; prima_total: number; cplan: string; apartamento: number; coberturas: { prima: number }[] };
      expect(e).toMatchObject({ modo: 'cotizador', cotizador: 'rcg', cramo: 28, prima_total: a.prima, apartamento: 1 });
      expect(e.coberturas.reduce((s, c) => s + c.prima, 0)).toBe(a.prima);
    }
    expect((d.emisiones!.I as { cplan: string }).cplan).toBe('PLANI');
    expect((d.emisiones!.III as { cplan: string }).cplan).toBe('PLAN3');
  });

  it('vista cliente: que falte quién elabora la cotización no impide el pago', () => {
    const cliente = cotizarRcg({ ...solicitud, sucursal: '', usuario: '' });
    expect(Object.keys(cliente.errores)).toEqual(['sucursal', 'usuario']);
    expect(Object.keys(datosCotizacionRcg(estado, cliente, opciones).emisiones ?? {})).toEqual(['I', 'II', 'III']);
  });

  it('sin RIF, sin catálogo o con mesa técnica no se paga en línea, pero la cotización se guarda', () => {
    const sinRif = datosCotizacionRcg({ ...estado, comun: { ...comun, documento: '' } }, cot, opciones);
    expect(sinRif.emisiones).toBeUndefined();
    expect(sinRif.sinPagoEnLinea[0]).toContain('RIF');
    expect(sinRif.alternativas.length).toBe(3);
    expect(datosCotizacionRcg(estado, cot, { ...opciones, emision: { ...emision, catalogo: null } }).emisiones).toBeUndefined();
    const mesa = datosCotizacionRcg(estado, cot, { ...opciones, mesaTecnica: true });
    expect(mesa.emisiones).toBeUndefined();
    expect(mesa.sinPagoEnLinea[0]).toContain('mesa técnica');
  });

  it('incluye el descuento aplicado por suma asegurada', () => {
    const p = { ...PARAMETROS_RCG, descuentos: [{ desde: 100000, pct: 10 }] };
    const conDescuento = datosCotizacionRcg(estado, cotizarRcg(solicitud, p), opciones);
    expect(conDescuento.alternativas[0].descuentoPct).toBeUndefined();
    expect(conDescuento.alternativas[1]).toMatchObject({ prima: 450, descuentoPct: 10, tasaInicial: 0.5 });
    expect((conDescuento.emisiones!.II as { prima_total: number }).prima_total).toBe(450);
  });

  it('plan contenedor: el configurado si está vigente, el de la opción o el único del ramo', () => {
    expect(planContenedorRcg(contenedores, 'II', 'PBT1')).toBe('PBT1');
    expect(planContenedorRcg(contenedores, 'II', 'NOEXISTE')).toBe('PLANII');
    expect(planContenedorRcg([{ cramo: 28, xramo: 'RCG', planes: [plan('RCGGEN')] }], 'III')).toBe('RCGGEN');
    expect(planContenedorRcg([{ cramo: 28, xramo: 'RCG', planes: [plan('A'), plan('B')] }], 'I')).toBe('');
    expect(planContenedorRcg(null, 'I')).toBe('');
  });

  it('se reabre con el estado guardado y la huella no depende de la opción marcada', () => {
    expect(estadoParaReabrir(JSON.parse(JSON.stringify(d)))).toMatchObject({ producto: 'rcg', comun: { asegurado: 'Empresa C.A.' }, rcg: { limite: '50000' } });
    expect(estadoParaReabrir({ estado: { producto: 'planes' } })).toBeNull();
    expect(estadoParaReabrir(null)).toBeNull();
    const prm = { rcg: PARAMETROS_RCG };
    expect(huellaCotizacion(estado, prm)).toBe(huellaCotizacion({ ...estado, rcg: { ...rcg, opcion: 'III' } }, prm));
    expect(huellaCotizacion(estado, prm)).not.toBe(huellaCotizacion({ ...estado, rcg: { ...rcg, limite: '60000' } }, prm));
    expect(huellaCotizacion(estado, prm)).not.toBe(huellaCotizacion(estado, { rcg: { ...PARAMETROS_RCG, descuentos: [{ desde: 1, pct: 5 }] } }));
  });
});

describe('cotización RCP / RCE guardada', () => {
  const clase = 0;
  const entrada = { tasa: null as number | null, ajuste: 0, opcion: 'II' as const, adicionales: [false, false, false], opcionalesVes: [] };
  const base: SolicitudRc = {
    modo: 'both', moneda: 'USD', tasaBcv: null, base: 'total', monto: 1_000_000, empleados: 10, clase, otraClase: false,
    actividad: actividadesDeClase(clase)[0], indole: 'Oficina', asegurado: 'Empresa C.A.', rif: 'J-123456789', correo: 'a@b.com', direccion: 'Caracas',
    sucursal: 'Caracas', emisor: 'Ana', correoEmisor: 'ana@lm.com', intermediario: '', esContrato: false, numeroContrato: '', vigenciaContrato: 'Anual',
    objetoContrato: '', p: { ...entrada, tasa: PARAMETROS_RC.clases[clase][1] }, e: { ...entrada, tasa: PARAMETROS_RC.actividades[actividadesDeClase(clase)[0]][1] },
  };
  const rc = { modo: 'both', indole: 'Oficina' };
  const s = { ...estado, producto: 'rc', rc } as unknown as EstadoCotizador;

  it('una alternativa por opción con la prima de los dos productos; no se paga en línea', () => {
    const c = cotizarRc(base);
    expect(c.errores).toEqual([]);
    const d = datosCotizacionRc(s, c, { vigenciaDias: 15 });
    expect(d.producto).toBe('rc');
    expect(d.alternativas.map((a) => a.opcion)).toEqual(['I', 'II', 'III']);
    const [p, e] = c.resultados;
    expect(d.alternativas[1].prima).toBeCloseTo(p.opciones![1].prima + e.opciones![1].prima, 2);
    expect(d.alternativas[1].detalle).toHaveLength(2);
    expect(d.emisiones).toBeUndefined();
    expect(d.sinPagoEnLinea).toHaveLength(1);
    expect(estadoParaReabrir(d)).not.toBeNull();
  });

  it('solo patronal se guarda como rcp', () => {
    const d = datosCotizacionRc({ ...s, rc: { ...rc, modo: 'p' } } as unknown as EstadoCotizador, cotizarRc({ ...base, modo: 'p' }), { vigenciaDias: 15 });
    expect(d.producto).toBe('rcp');
    expect(d.alternativas.every((a) => a.prima > 0)).toBe(true);
  });
});
