import { describe, expect, it } from 'vitest';
import { parsearCoberturasRamo } from '../tarifas/combo';
import { coberturasRc, coberturasRcg } from '../tarifas/emision-rc';
import type { RamoCatalogo } from '../tarifas/planes-rcg';
import { cotizarRcg, PARAMETROS_RCG, type SolicitudRcg } from '../tarifas/rcg';
import { actividadesDeClase, cotizarRc, PARAMETROS_RC, type SolicitudRc } from '../tarifas/rcp-rce';
import {
  datosCotizacionRc, datosCotizacionRcg, estadoParaReabrir, huellaCotizacion, planContenedorRc, planContenedorRcg,
  type ContextoEmision, type ContextoEmisionRc, type EstadoCotizador,
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

  // Sis2000 con las coberturas en USD de los ramos 27 y 37 y un plan contenedor vigente en cada uno.
  type Body = { modo: string; cotizador: string; cramo: number; cplan: string; prima_total: number; ncotizacion: string; coberturas: { ccober: string; prima: number }[] };
  const catalogoDe = (k: 'p' | 'e') => parsearCoberturasRamo({
    status: true,
    data: { coberturas: coberturasRc(cotizarRc(base).resultados.find((r) => r.k === k)!, 'USD').lineas.map((l) => ({ ccober: l.ccober, ctarifa: '1', xcobertura: l.concepto, cmoneda: '$' })) },
  });
  const planRc = (cramo: number, cplan: string) => ({ cramo, xramo: 'RC', cplan, xplan: cplan, cproducto: null, qcoberturas: 1, msumamax: 0, mprima: 0, cotizable: true });
  const sis2000: ContextoEmisionRc = {
    catalogos: { 27: catalogoDe('p'), 37: catalogoDe('e') },
    contenedores: [{ cramo: 27, xramo: 'RCP', planes: [planRc(27, 'RCPGEN')] }, { cramo: 37, xramo: 'RCE', planes: [planRc(37, 'RCEGEN')] }],
    cproductor: 80080, esPersonaNatural: false,
  };

  it('«Ambas»: cada opción lleva la emisión de las dos pólizas (27 y 37) y se paga la suma de las primas', () => {
    const c = cotizarRc(base);
    const d = datosCotizacionRc(s, c, { vigenciaDias: 15, emision: sis2000 });
    expect(d.sinPagoEnLinea).toEqual([]);
    expect(Object.keys(d.emisiones ?? {})).toEqual(['I', 'II', 'III']);
    for (const a of d.alternativas) {
      const bodies = d.emisiones![a.opcion] as Body[];
      expect(bodies.map((b) => [b.modo, b.cotizador, b.cramo, b.cplan])).toEqual([['cotizador', 'rcp', 27, 'RCPGEN'], ['cotizador', 'rce', 37, 'RCEGEN']]);
      expect(bodies[0].prima_total + bodies[1].prima_total).toBeCloseTo(a.prima, 2);
      // La prima de cada póliza es la de ese producto en esa opción, y es la suma de sus coberturas.
      expect(bodies.map((b) => b.prima_total)).toEqual(a.detalle!.map((x) => x.prima));
      for (const b of bodies) expect(b.coberturas.reduce((t, x) => t + x.prima, 0)).toBeCloseTo(b.prima_total, 2);
    }
    // Cada opción emite con sus propios límites, no con los de la opción marcada.
    const basica = (o: 'I' | 'III') => (d.emisiones![o] as { coberturas: { suma: number }[] }[])[0].coberturas[0].suma;
    expect(basica('III')).toBeGreaterThan(basica('I'));
    expect(JSON.parse(JSON.stringify(d)).emisiones.II).toHaveLength(2);
  });

  it('solo RCP o solo RCE: una póliza por opción (un body, como RCG)', () => {
    const soloP = datosCotizacionRc({ ...s, rc: { ...rc, modo: 'p' } } as unknown as EstadoCotizador, cotizarRc({ ...base, modo: 'p' }), { vigenciaDias: 15, emision: sis2000 });
    expect(soloP.producto).toBe('rcp');
    expect(soloP.emisiones!.II).toMatchObject({ modo: 'cotizador', cotizador: 'rcp', cramo: 27, cplan: 'RCPGEN', prima_total: soloP.alternativas[1].prima });
    const soloE = datosCotizacionRc({ ...s, rc: { ...rc, modo: 'e' } } as unknown as EstadoCotizador, cotizarRc({ ...base, modo: 'e' }), { vigenciaDias: 15, emision: sis2000 });
    expect(soloE.producto).toBe('rce');
    expect(soloE.emisiones!.I).toMatchObject({ cotizador: 'rce', cramo: 37, cplan: 'RCEGEN', prima_total: soloE.alternativas[0].prima });
  });

  it('sin plan vigente en el ramo, sin catálogo, en EUR o con descuento a validar no se paga en línea, y dice por qué', () => {
    const c = cotizarRc(base);
    const sinPlan = datosCotizacionRc(s, c, { vigenciaDias: 15, emision: { ...sis2000, contenedores: [sis2000.contenedores![0]] } });
    expect(sinPlan.emisiones).toBeUndefined();
    expect(sinPlan.sinPagoEnLinea).toEqual(['Responsabilidad Civil Empresarial: El ramo 37 no tiene planes vigentes en Sis2000: La Mundial debe crear o activar uno para poder emitir.']);
    expect(sinPlan.alternativas).toHaveLength(3);
    const sinCatalogo = datosCotizacionRc(s, c, { vigenciaDias: 15, emision: { ...sis2000, catalogos: { 27: sis2000.catalogos[27] } } });
    expect(sinCatalogo.emisiones).toBeUndefined();
    expect(sinCatalogo.sinPagoEnLinea[0]).toContain('ramo 37');
    const eur = datosCotizacionRc(s, cotizarRc({ ...base, moneda: 'EUR' }), { vigenciaDias: 15, emision: sis2000 });
    expect(eur.emisiones).toBeUndefined();
    expect(eur.sinPagoEnLinea[0]).toContain('EUR');
    const conDescuento = datosCotizacionRc(s, cotizarRc({ ...base, p: { ...base.p, ajuste: -5 } }), { vigenciaDias: 15, emision: sis2000 });
    expect(conDescuento.emisiones).toBeUndefined();
    expect(conDescuento.sinPagoEnLinea[0]).toContain('área técnica');
    // Hernia no existe en USD en Sis2000: esa cotización no se puede emitir sola.
    const hernia = datosCotizacionRc(s, cotizarRc({ ...base, p: { ...base.p, adicionales: [false, true] } }), { vigenciaDias: 15, emision: sis2000 });
    expect(hernia.emisiones).toBeUndefined();
    expect(hernia.sinPagoEnLinea[0]).toContain('Hernia');
  });

  it('plan contenedor de RCP / RCE: el configurado si está vigente o el único del ramo', () => {
    const dos = [{ cramo: 27, xramo: 'RCP', planes: [planRc(27, 'A'), planRc(27, 'B')] }];
    expect(planContenedorRc(sis2000.contenedores, 27)).toEqual({ cplan: 'RCPGEN' });
    expect(planContenedorRc(dos, 27, 'B')).toEqual({ cplan: 'B' });
    expect(planContenedorRc(dos, 27, 'NOEXISTE').falta).toContain('varios planes vigentes (A, B)');
    expect(planContenedorRc(sis2000.contenedores, 28).falta).toContain('no tiene planes vigentes');
    expect(planContenedorRc(null, 27).falta).toContain('No se pudieron leer');
  });

  it('solo patronal se guarda como rcp', () => {
    const d = datosCotizacionRc({ ...s, rc: { ...rc, modo: 'p' } } as unknown as EstadoCotizador, cotizarRc({ ...base, modo: 'p' }), { vigenciaDias: 15 });
    expect(d.producto).toBe('rcp');
    expect(d.alternativas.every((a) => a.prima > 0)).toBe(true);
  });
});
