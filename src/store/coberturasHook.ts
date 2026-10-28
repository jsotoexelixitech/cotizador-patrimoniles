import { useMemo } from 'react';
import { RAMOS_COBERTURAS, cotizarCoberturas } from '../tarifas/coberturas';
import { useCotizacionStore } from './cotizacionStore';
import { usePlanesStore } from './planesStore';

/** El ramo elegido se cotiza por coberturas (16 y 38) en lugar del plan cerrado. */
export const esRamoCoberturas = (cramo: number | null | undefined) => cramo != null && RAMOS_COBERTURAS.includes(cramo);

/** Cotización por coberturas del plan elegido; null mientras no haya tarificador cargado para ese plan. */
export function useCotizacionCoberturas() {
  const ramoSel = useCotizacionStore((s) => s.ramoSel);
  const planSel = useCotizacionStore((s) => s.planSel);
  const coberturas = useCotizacionStore((s) => s.coberturas);
  const tarifa = usePlanesStore((s) => s.tarifa);
  return useMemo(() => {
    if (!esRamoCoberturas(ramoSel) || !tarifa?.plan || tarifa.cramo !== ramoSel || tarifa.cplan !== planSel) return null;
    const plan = tarifa.plan;
    const suma = coberturas.sumaBasica === '' ? plan.suma : Number(coberturas.sumaBasica);
    const elegidas = coberturas.elegidas ?? plan.coberturas.map((c) => c.ccober);
    return { plan, elegidas, suma, cot: cotizarCoberturas(plan, tarifa.tasas, Number.isFinite(suma) ? suma : 0, elegidas) };
  }, [ramoSel, planSel, coberturas, tarifa]);
}
