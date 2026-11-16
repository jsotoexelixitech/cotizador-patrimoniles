// Estado del cotizador → solicitud del motor de tarifas (RCG y RCP/RCE). Módulo puro (sin React, zustand ni
// import.meta.env): lo usa la app y también el proxy del servidor (servidor/proxyNexus.ts) para recalcular la prima.
import type { CotizacionState, ProductoForm } from '../store/cotizacionStore';
import { numeroONulo } from '../tarifas/comun';
import type { SolicitudRcg } from '../tarifas/rcg';
import type { ProductoEntrada, SolicitudRc } from '../tarifas/rcp-rce';

/** Sucursal y responsable que imprime el PDF cuando la cotización la hace el propio cliente. */
export const EMISOR_CLIENTE = { sucursal: 'Caracas', emisor: 'Cotización en línea', correo: 'info@lamundialdeseguros.com' } as const;

export type Emisor = { sucursal: string; emisor: string; correo: string };

export const rifCompleto = (c: CotizacionState['comun']) => (c.documento ? `${c.tipoDoc}-${c.documento}` : '');

export function solicitudRcg(s: Pick<CotizacionState, 'comun' | 'contrato' | 'rcg'>): SolicitudRcg {
  const { comun: c, contrato: k, rcg: r } = s;
  return {
    sucursal: c.sucursal, usuario: c.emisor, correoUsuario: c.correoEmisor, asegurado: c.asegurado, rif: rifCompleto(c),
    correoDestinatario: c.correo, intermediario: c.intermediario, ubicacion: c.ubicacion, moneda: r.moneda, clase: r.clase,
    indole: r.indole, actividadEspecifica: r.actividadEspecifica, esContrato: k.esContrato, numeroContrato: k.numero,
    objetoObra: k.objeto, coasegurado: k.coasegurado, limite: numeroONulo(r.limite), tasa: numeroONulo(r.tasa), condiciones: r.condiciones,
  };
}

const aEntrada = (x: ProductoForm): ProductoEntrada => ({
  tasa: numeroONulo(x.tasa), ajuste: numeroONulo(x.ajuste), opcion: x.opcion, adicionales: x.adicionales,
  opcionalesVes: x.opcionalesVes.map((o) => ({ seleccionada: o.seleccionada, tasa: numeroONulo(o.tasa), limite: o.limite, grupo: numeroONulo(o.grupo) })),
});

export const claseRc = (rc: CotizacionState['rc']): number | null => {
  const t = rc.claseSel === 'other' ? rc.claseRelacionada : rc.claseSel;
  return t === '' ? null : Number(t);
};

/** `emisor`: el fijo de la vista cliente (EMISOR_CLIENTE); sin él, el que escribió quien elabora la cotización. */
export function solicitudRc(s: Pick<CotizacionState, 'comun' | 'contrato' | 'rc'>, emisor?: Emisor | null): SolicitudRc {
  const { comun: c, contrato: k, rc } = s;
  return {
    modo: rc.modo, moneda: rc.moneda, tasaBcv: numeroONulo(rc.tasaBcv), base: rc.base, monto: numeroONulo(rc.monto),
    empleados: numeroONulo(rc.empleados), clase: claseRc(rc), otraClase: rc.claseSel === 'other',
    actividad: rc.actividad === '' ? null : Number(rc.actividad), indole: rc.indole,
    asegurado: c.asegurado, rif: rifCompleto(c), correo: c.correo, direccion: c.ubicacion,
    sucursal: emisor ? emisor.sucursal : c.sucursal, emisor: emisor ? emisor.emisor : c.emisor,
    correoEmisor: emisor ? emisor.correo : c.correoEmisor, intermediario: c.intermediario,
    esContrato: k.esContrato, numeroContrato: k.numero, vigenciaContrato: k.vigencia, objetoContrato: k.objeto,
    sumaDeseada: numeroONulo(rc.sumaDeseada ?? ''), p: aEntrada(rc.p), e: aEntrada(rc.e),
  };
}
