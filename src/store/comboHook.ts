import { useMemo } from 'react';
import { cotizarCombo, monedaCombo } from '../tarifas/combo';
import { cotizadorDeRamo, tarifaOficialCombo } from '../tarifas/combo-rc';
import { solicitudRc, solicitudRcg, useCotizacionStore } from './cotizacionStore';
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
  // Datos de tarifa de los ramos 27/28/37: los mismos campos del store que usan las opciones RCG y RCP/RCE.
  // Cada selector devuelve una rama del estado (referencia estable), nunca un objeto nuevo.
  const comun = useCotizacionStore((s) => s.comun);
  const contrato = useCotizacionStore((s) => s.contrato);
  const rcg = useCotizacionStore((s) => s.rcg);
  const rc = useCotizacionStore((s) => s.rc);
  const prmRcg = useParametrosStore((s) => s.rcg);
  const prmRc = useParametrosStore((s) => s.rc);
  const catalogo = usePlanesStore((s) => (cramo == null ? null : s.catalogos[cramo]?.coberturas ?? null));
  return useMemo(() => {
    if (cramo == null || !catalogo) return null;
    const elegidas = combos[cramo] ?? {};
    const cotizador = cotizadorDeRamo(cramo);
    const oficial = !cotizador ? null : tarifaOficialCombo(cotizador, elegidas, {
      rcg: solicitudRcg({ comun, contrato, rcg }),
      // La índole del RCP/RCE: si no se escribió, la actividad descrita en el paso de riesgo del combo.
      rc: solicitudRc({ comun, contrato, rc: { ...rc, indole: rc.indole.trim() || rcg.actividadEspecifica } }),
    }, { rcg: prmRcg, rc: prmRc });
    const cot = cotizarCombo(catalogo, elegidas, tecnicoCombo[cramo] ?? {}, oficial);
    const valida = !Object.keys(cot.errores).length && !cot.generales.length;
    return { cramo, catalogo, elegidas, cot, valida, oficial, moneda: oficial ? oficial.moneda : monedaCombo(catalogo) };
  }, [cramo, combos, catalogo, tecnicoCombo, comun, contrato, rcg, rc, prmRcg, prmRc]);
}
