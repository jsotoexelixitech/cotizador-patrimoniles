import { describe, expect, it } from 'vitest';
import { parsearCoberturasRamo } from '../tarifas/combo';
import { coberturasRc, coberturasRcg } from '../tarifas/emision-rc';
import { cotizarRcg, PARAMETROS_RCG, tasaPromedio } from '../tarifas/rcg';
import { actividadesDeClase, cotizarRc, opcionalesDe, PARAMETROS_RC, tasaMedia } from '../tarifas/rcp-rce';
import { datosCotizacionRc, datosCotizacionRcg, type DatosCotizacion, type EstadoCotizador } from './snapshot';
import { EMISOR_CLIENTE, solicitudRc, solicitudRcg } from './solicitud';
import { estadoComoCliente, verificarCotizacionCliente } from './verificarPrima';

// Estado completo del cotizador tal como lo deja la vista cliente.
const comun = {
  asegurado: 'Empresa C.A.', tipoDoc: 'J', documento: '123456789', correo: 'a@b.com', intermediario: '', ubicacion: 'Caracas, Chacao',
  sucursal: '', emisor: '', correoEmisor: '', apellido: '', telefono: '04121234567', apartamento: '',
};
const contrato = { esContrato: false, numero: '', objeto: '', coasegurado: '', vigencia: 'Anual' };
const productoForm = (k: 'p' | 'e', tasa: string) => ({
  tasa, ajuste: '0', opcion: 'II' as const, adicionales: k === 'p' ? [false, false] : [false, false, false],
  opcionalesVes: opcionalesDe(k).map((o) => ({ seleccionada: false, tasa: String(o[1]), limite: '650', grupo: '2000' })),
});
const claseRc = 0;
const actividad = actividadesDeClase(claseRc)[0];
const rc = {
  modo: 'both' as const, moneda: 'USD' as const, tasaBcv: '', base: 'total' as const, monto: '1000000', empleados: '10',
  claseSel: String(claseRc), claseRelacionada: '', actividad: String(actividad), indole: 'Oficina', sumaDeseada: '',
  p: productoForm('p', String(tasaMedia(PARAMETROS_RC.clases[claseRc]))),
  e: productoForm('e', String(tasaMedia(PARAMETROS_RC.actividades[actividad]))),
};
const rcg = {
  moneda: 'USD' as const, clase: 1, indole: 'Farmacias', actividadEspecifica: 'Venta de medicinas', limite: '50000',
  tasa: String(tasaPromedio(PARAMETROS_RCG.clases[1])), condiciones: [], opcion: 'II' as const,
};
const estadoRcg: EstadoCotizador = { producto: 'rcg', comun, contrato, rcg, rc };
const estadoRc: EstadoCotizador = { producto: 'rc', comun, contrato, rcg, rc };

const plan = (cramo: number, cplan: string) => ({ cramo, xramo: 'X', cplan, xplan: cplan, cproducto: null, qcoberturas: 1, msumamax: 0, mprima: 0, cotizable: true });
const catalogoDe = (lineas: { ccober: string; concepto: string }[]) => parsearCoberturasRamo({
  status: true, data: { coberturas: lineas.map((l) => ({ ccober: l.ccober, ctarifa: '7', xcobertura: l.concepto, cmoneda: '$' })) },
});

/** Lo que manda la vista cliente al guardar (la misma cuenta que hace el navegador). */
function datosRcg(estado = estadoRcg): DatosCotizacion {
  const cot = cotizarRcg(solicitudRcg(estado));
  const catalogo = catalogoDe(coberturasRcg(cot, 'I', 'USD')!.lineas);
  return datosCotizacionRcg(estado, cot, {
    mesaTecnica: false, vigenciaDias: 15,
    emision: { catalogo, contenedores: [{ cramo: 28, xramo: 'RCG', planes: [plan(28, 'RCGGEN')] }], planConfigurado: 'RCGGEN', cproductor: 80080, esPersonaNatural: false },
  });
}

function datosRc(estado = estadoRc): DatosCotizacion {
  const cot = cotizarRc(solicitudRc(estado, EMISOR_CLIENTE));
  const cat = (k: 'p' | 'e') => catalogoDe(coberturasRc(cot.resultados.find((r) => r.k === k)!, 'USD').lineas);
  return datosCotizacionRc(estado, cot, {
    vigenciaDias: 15,
    emision: {
      catalogos: { 27: cat('p'), 37: cat('e') },
      contenedores: [{ cramo: 27, xramo: 'RCP', planes: [plan(27, 'RCPGEN')] }, { cramo: 37, xramo: 'RCE', planes: [plan(37, 'RCEGEN')] }],
      cproductor: 80080, esPersonaNatural: false,
    },
  });
}

/** Copia por JSON, como llega al proxy. */
const viaJson = (d: unknown) => JSON.parse(JSON.stringify(d));
const cfg = { cproductor: 80080 };

describe('recálculo de la prima en el servidor (vista cliente)', () => {
  it('RCG: la cotización legítima del cliente pasa', () => {
    const d = datosRcg();
    expect(Object.keys(d.emisiones ?? {})).toEqual(['I', 'II', 'III']);
    expect(verificarCotizacionCliente(viaJson(d), cfg)).toBeNull();
  });

  it('RCP + RCE: la cotización legítima del cliente pasa (dos pólizas por opción)', () => {
    const d = datosRc();
    expect(Object.keys(d.emisiones ?? {})).toEqual(['I', 'II', 'III']);
    expect(verificarCotizacionCliente(viaJson(d), cfg)).toBeNull();
  });

  it('rechaza una prima rebajada en la opción', () => {
    const d = viaJson(datosRcg());
    d.alternativas[1].prima = 1;
    expect(verificarCotizacionCliente(d, cfg)).toContain('opción II');
  });

  it('rechaza un body de emisión con la prima rebajada aunque la opción esté bien', () => {
    const d = viaJson(datosRcg());
    d.emisiones.I.coberturas[0].prima = 1;
    d.emisiones.I.prima_total = 1;
    expect(verificarCotizacionCliente(d, cfg)).toContain('Opción I');
    const r = viaJson(datosRc());
    r.emisiones.II[1].prima_total = 0.5;
    expect(verificarCotizacionCliente(r, cfg)).toContain('Opción II');
  });

  it('rechaza una tasa fuera de la que usa la vista cliente (estado y primas manipulados juntos)', () => {
    const barato: EstadoCotizador = { ...estadoRcg, rcg: { ...rcg, tasa: String(PARAMETROS_RCG.clases[1].min) } };
    expect(verificarCotizacionCliente(viaJson(datosRcg(barato)), cfg)).toContain('no coincide');
    const conAjuste: EstadoCotizador = { ...estadoRc, rc: { ...rc, p: { ...rc.p, tasa: String(PARAMETROS_RC.clases[claseRc][1]) } } };
    expect(verificarCotizacionCliente(viaJson(datosRc(conAjuste)), cfg)).toContain('no coincide');
  });

  it('rechaza sumas mayores, coberturas ajenas, otro productor u otro ramo en la emisión', () => {
    const suma = viaJson(datosRcg());
    suma.emisiones.I.coberturas[0].suma = 10_000_000;
    expect(verificarCotizacionCliente(suma, cfg)).toContain('límite');
    const ajena = viaJson(datosRcg());
    ajena.emisiones.I.coberturas[0].ccober = '999';
    expect(verificarCotizacionCliente(ajena, cfg)).toContain('cobertura');
    const productor = viaJson(datosRcg());
    productor.emisiones.III.productor = 12345;
    expect(verificarCotizacionCliente(productor, cfg)).toContain('productor');
    const ramo = viaJson(datosRcg());
    ramo.emisiones.I.cramo = 27;
    expect(verificarCotizacionCliente(ramo, cfg)).toContain('ramo');
  });

  it('rechaza producto o moneda cambiados y datos sin estado', () => {
    const producto = viaJson(datosRcg());
    producto.producto = 'rcp';
    expect(verificarCotizacionCliente(producto, cfg)).not.toBeNull();
    const moneda = viaJson(datosRcg());
    moneda.moneda = 'Bs.';
    expect(verificarCotizacionCliente(moneda, cfg)).toContain('moneda');
    expect(verificarCotizacionCliente({ producto: 'rcg' }, cfg)).toContain('estado');
    expect(verificarCotizacionCliente(null, cfg)).not.toBeNull();
    expect(verificarCotizacionCliente({ ...viaJson(datosRcg()), estado: { ...estadoRcg, rcg: 5 } }, cfg)).not.toBeNull();
  });

  it('la vista cliente ya usa la tasa media: normalizar no cambia su cotización', () => {
    expect(estadoComoCliente(estadoRcg).rcg.tasa).toBe(rcg.tasa);
    expect(estadoComoCliente(estadoRc).rc.p.tasa).toBe(rc.p.tasa);
    expect(estadoComoCliente(estadoRc).rc.e.tasa).toBe(rc.e.tasa);
  });
});
