// Pólizas de una cotización guardada en Nexus. RCG, RCP o RCE solos son una póliza; RCP + RCE («Ambas») son dos, una
// por ramo (27 y 37), pagadas con un solo pago. Nexus guarda la primera en la raíz de `poliza` (formato de siempre) y
// todas en `poliza.polizas[]`.
import type { PolizaDeCotizacion, PolizaGuardada } from '../api/cotizaciones';
import type { DatosCotizacion, Opcion } from './snapshot';

export const NOMBRE_RAMO: Record<number, string> = {
  27: 'Responsabilidad Civil Patronal',
  28: 'Responsabilidad Civil General',
  37: 'Responsabilidad Civil Empresarial',
};

/** Todas las pólizas de la cotización; las anteriores (una sola, sin `polizas[]`) salen de la raíz. */
export function polizasDe(poliza: PolizaGuardada | null | undefined): PolizaDeCotizacion[] {
  if (!poliza) return [];
  const lista = Array.isArray(poliza.polizas) && poliza.polizas.length ? poliza.polizas : [poliza];
  return lista.filter((p) => !!p?.cnpoliza).map((p) => ({
    cnpoliza: p.cnpoliza, cnrecibo: p.cnrecibo ?? '', urlpoliza: p.urlpoliza ?? '',
    ...(p.cramo ? { cramo: p.cramo } : {}), ...(p.prima ? { prima: p.prima } : {}), ...(p.cobro ? { cobro: p.cobro } : {}),
  }));
}

/** Todos los recibos quedaron cobrados (con dos pólizas, los dos). */
export const todasCobradas = (polizas: PolizaDeCotizacion[]): boolean => polizas.length > 0 && polizas.every((p) => !!p.cobro?.ok);

export const nombrePoliza = (p: Pick<PolizaDeCotizacion, 'cramo'>, porDefecto = 'Responsabilidad Civil'): string =>
  (p.cramo && NOMBRE_RAMO[p.cramo]) || porDefecto;

const esObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Pólizas que se emitirán al pagar la opción (una por body de emisión), con la prima de cada una. Vacío = no se paga en línea. */
export function polizasDeOpcion(d: Pick<DatosCotizacion, 'emisiones'>, opcion: Opcion | null): { cramo: number; nombre: string; prima: number }[] {
  const e: unknown = opcion ? d.emisiones?.[opcion] : undefined;
  return (Array.isArray(e) ? e : [e]).filter(esObj).map((b) => ({
    cramo: Number(b.cramo), nombre: NOMBRE_RAMO[Number(b.cramo)] ?? 'Responsabilidad Civil', prima: Number(b.prima_total) || 0,
  }));
}
