import { useMemo } from 'react';
import { cotizarCombo, monedaCombo } from '../tarifas/combo';
import { useCotizacionStore } from './cotizacionStore';
import { usePlanesStore } from './planesStore';
import { useParametrosStore } from './parametrosStore';

/** Nombre del ramo según los ramos del combo o el catálogo de planes de Sis2000; si no está, "Ramo N". */
export function useNombreRamo(cramo: number | null) {
  const xramo = usePlanesStore((s) => (s.ramosCombo?.find((r) => r.cramo === cramo) ?? s.ramos.find((r) => r.cramo === cramo))?.xramo);
  return xramo ?? (cramo == null ? '' : `Ramo ${cramo}`);
}

/** Combo del ramo elegido; null mientras no estén cargadas las coberturas de ese ramo. */
export function useCotizacionCombo() {
  const cramo = useCotizacionStore((s) => s.ramoCombo);
  const combos = useCotizacionStore((s) => s.combos);
  const tecnicoCombo = useCotizacionStore((s) => s.tecnicoCombo);
  // Sin vista técnica no hay quien fije la prima de las coberturas sin tarifa: no se usan los valores de Técnico.
  const vistaTecnica = useParametrosStore((s) => s.vistaTecnica);
  const catalogo = usePlanesStore((s) => (cramo == null ? null : s.catalogos[cramo]?.coberturas ?? null));
  return useMemo(() => {
    if (cramo == null || !catalogo) return null;
    const elegidas = combos[cramo] ?? {};
    const cot = cotizarCombo(catalogo, elegidas, vistaTecnica ? tecnicoCombo[cramo] ?? {} : undefined);
    const valida = !Object.keys(cot.errores).length && !cot.generales.length;
    return { cramo, catalogo, elegidas, cot, valida, moneda: monedaCombo(catalogo) };
  }, [cramo, combos, catalogo, tecnicoCombo, vistaTecnica]);
}
