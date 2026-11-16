// Datos de la solicitud a partir de lo que ya tiene la emisión: la cotización guardada en Nexus (snapshot + pólizas) o el
// estado del asistente (emisión directa de la vista admin). Una solicitud por póliza: RCP + RCE («Ambas») son dos.
import type { PolizaDeCotizacion } from '../api/cotizaciones';
import type { DatosCotizacion, EstadoCotizador, Opcion } from '../cotizaciones/snapshot';
import { EMISOR_CLIENTE } from '../cotizaciones/solicitud';
import { numeroONulo } from '../tarifas/comun';
import { RAMOS_RC } from '../tarifas/data/mapeo-sis2000';
import { opcionalesDe } from '../tarifas/rcp-rce';
import { esRamoSolicitud, type DatosSolicitud, type RamoSolicitud } from './solicitudes';

/** Nombres de las coberturas adicionales del cotizador RCP / RCE (mismo orden que `adicionales` del estado). */
export const ADICIONALES_RC = {
  p: ['Gastos por asistencia médica, quirúrgica y farmacéutica', 'Hernia'],
  e: ['Negligencia del Empleador', 'Asistencia Legal y Defensa Penal', 'Gastos Médicos'],
} as const;

const ramosDeProducto = (producto: string): RamoSolicitud[] =>
  producto === 'rcg' ? [RAMOS_RC.rcg] : producto === 'rcp' ? [RAMOS_RC.rcp] : producto === 'rce' ? [RAMOS_RC.rce] : producto === 'rc' ? [RAMOS_RC.rcp, RAMOS_RC.rce] : [];

/** Coberturas adicionales elegidas de RCP (k = p) o RCE (k = e): en USD/EUR las casillas; en Bs. las opcionales por tasa. */
export function adicionalesRc(rc: EstadoCotizador['rc'], k: 'p' | 'e'): string[] {
  const f = rc[k];
  if (!f) return [];
  if (rc.moneda === 'VES') return opcionalesDe(k).filter((_, i) => f.opcionalesVes?.[i]?.seleccionada).map((o) => o[0]);
  return ADICIONALES_RC[k].filter((_, i) => !!f.adicionales?.[i]);
}

/** Nómina anual y trabajadores del estado RCP / RCE (en la moneda cotizada). */
export function nominaRc(rc: EstadoCotizador['rc']): { nomina: number | null; trabajadores: number | null } {
  const monto = numeroONulo(rc.monto ?? '');
  const empleados = numeroONulo(rc.empleados ?? '');
  const nomina = monto === null ? null : rc.base === 'total' ? monto : empleados ? monto * empleados : null;
  return { nomina, trabajadores: empleados };
}

const esObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Body de emisión de la opción para el ramo (productor y plan con que se emitió). */
function bodyDe(datos: DatosCotizacion, opcion: Opcion | null, cramo: number): { productor?: unknown; cplan?: unknown } | null {
  const v = opcion ? datos.emisiones?.[opcion] : undefined;
  const lista = Array.isArray(v) ? v : v ? [v] : [];
  return (lista.find((b) => esObj(b) && b.cramo === cramo) as { productor?: unknown; cplan?: unknown } | undefined) ?? null;
}

const comunDe = (s: EstadoCotizador) => s.comun ?? ({} as EstadoCotizador['comun']);

/** Una solicitud por póliza emitida de la cotización guardada (vista admin y «Póliza emitida» del flujo pagado). */
export function solicitudesDeCotizacion(x: {
  datos: DatosCotizacion; codigo: string; opcion: Opcion | null; polizas: PolizaDeCotizacion[]; fecha: Date; cproductor?: number;
}): DatosSolicitud[] {
  const { datos, codigo, opcion, polizas } = x;
  const estado = datos.estado;
  const comun = comunDe(estado);
  const ramos = ramosDeProducto(datos.producto);
  return ramos.flatMap((cramo): DatosSolicitud[] => {
    const poliza = polizas.find((p) => p.cramo === cramo) ?? (ramos.length === 1 && polizas.length === 1 ? polizas[0] : undefined);
    if (!poliza) return [];
    const body = bodyDe(datos, opcion, cramo);
    const rc = cramo !== RAMOS_RC.rcg;
    return [{
      cramo, fecha: x.fecha,
      tomador: {
        nombre: datos.tomador.nombre, tipoDoc: datos.tomador.tipoDoc, documento: datos.tomador.documento,
        correo: datos.tomador.correo, telefono: datos.tomador.telefono, direccion: datos.tomador.ubicacion,
      },
      actividad: [datos.riesgo.indole, datos.riesgo.actividad].filter(Boolean).join(' · '),
      ubicacion: datos.tomador.ubicacion,
      moneda: datos.moneda,
      referencia: `Según cotización N° ${codigo}`,
      cnpoliza: poliza.cnpoliza,
      opcion,
      coberturas: rc ? adicionalesRc(estado.rc, cramo === RAMOS_RC.rcp ? 'p' : 'e') : datos.coberturas.map((c) => c.nombre),
      intermediario: { nombre: comun.intermediario ?? '', codigo: String(body?.productor ?? x.cproductor ?? '') },
      ciudad: comun.sucursal || EMISOR_CLIENTE.sucursal,
      ...(rc ? nominaRc(estado.rc) : {}),
      contrato: datos.riesgo.contrato,
      coasegurado: estado.contrato?.esContrato ? estado.contrato.coasegurado : '',
    }];
  });
}

/**
 * Emisión directa desde el asistente (vista admin): RCG/RCP/RCE con la prima del cotizador, o un plan / combo del ramo 28
 * («Según plan …»). null si el ramo no tiene solicitud aprobada.
 */
export function solicitudDeAsistente(s: EstadoCotizador, x: {
  cramo: number; cnpoliza: string; referencia: string; fecha: Date; cproductor: number; moneda: string;
  opcion?: string | null; coberturas: string[];
  /** Índole y actividad tal como salen en la cotización (RCP/RCE: la actividad del riesgo); por defecto las del RCG. */
  actividad?: string;
}): DatosSolicitud | null {
  if (!esRamoSolicitud(x.cramo)) return null;
  const c = s.comun;
  const rc = x.cramo !== RAMOS_RC.rcg;
  const actividad = x.actividad ?? (rc ? s.rc.indole : [s.rcg.indole, s.rcg.actividadEspecifica].filter(Boolean).join(' · '));
  return {
    cramo: x.cramo, fecha: x.fecha,
    tomador: { nombre: c.asegurado, tipoDoc: c.tipoDoc, documento: c.documento, correo: c.correo, telefono: c.telefono, direccion: c.ubicacion },
    actividad, ubicacion: c.ubicacion, moneda: x.moneda, referencia: x.referencia, cnpoliza: x.cnpoliza,
    opcion: x.opcion ?? null, coberturas: x.coberturas,
    intermediario: { nombre: c.intermediario, codigo: String(x.cproductor) },
    ciudad: c.sucursal || EMISOR_CLIENTE.sucursal,
    ...(rc ? nominaRc(s.rc) : {}),
    contrato: s.contrato.esContrato ? [s.contrato.numero, s.contrato.objeto].filter(Boolean).join(' · ') : '',
    coasegurado: s.contrato.esContrato ? s.contrato.coasegurado : '',
  };
}
