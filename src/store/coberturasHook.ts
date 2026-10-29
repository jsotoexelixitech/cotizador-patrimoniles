import { useMemo } from 'react';
import { RAMOS_COBERTURAS, cotizarCoberturas } from '../tarifas/coberturas';
import { useCotizacionStore } from './cotizacionStore';
import { usePlanesStore } from './planesStore';

/** El ramo elegido se cotiza por coberturas (16 y 38) en lugar del plan cerrado. */
export const esRamoCoberturas = (cramo: number | null | undefined) => cramo != null && RAMOS_COBERTURAS.includes(cramo);

/** Cotización por coberturas del plan elegido; null mientras no haya tarifa cargada para ese plan. */
export function useCotizacionCoberturas() {
  const ramoSel = useCotizacionStore((s) => s.ramoSel);
  const planSel = useCotizacionStore((s) => s.planSel);
  const coberturas = useCotizacionStore((s) => s.coberturas);
  const tarifa = usePlanesStore((s) => s.tarifa);
  return useMemo(() => {
    if (!esRamoCoberturas(ramoSel) || !tarifa?.plan || tarifa.cramo !== ramoSel || tarifa.cplan !== planSel) return null;
    const plan = tarifa.plan;
    const cot = cotizarCoberturas(plan, coberturas.elegidas, coberturas.sumas);
    const valida = !Object.keys(cot.errores).length && !cot.generales.length;
    return { plan, elegidas: coberturas.elegidas, sumas: coberturas.sumas, cot, valida };
  }, [ramoSel, planSel, coberturas, tarifa]);
}
