// Combo de coberturas en los ramos con tarifa del cotizador de Google: 28 (RCG), 27 (RCP) y 37 (RCE).
// La prima sale del mismo motor que las opciones RCG y RCP/RCE (rcg.ts / rcp-rce.ts, con los Parámetros vigentes) y,
// con el mismo criterio que emision-rc.ts, va entera en la cobertura básica; las demás coberturas marcadas van con su
// suma y prima 0 (incluidas o sublímites). Se emite con nest-api `modo: cotizador`.
import type { TarifaComboOficial } from './combo';
import { BASICA_RCE, BASICA_RCG, BASICA_RCP, RAMOS_RC, type CotizadorRc } from './data/mapeo-sis2000';
import { monedaSis2000 } from './emision-rc';
import { cotizarRcg, type ParametrosRcg, type SolicitudRcg } from './rcg';
import { cotizarRc, type ParametrosRc, type ProductoEntrada, type SolicitudRc } from './rcp-rce';

/** Cotizador de Google del ramo (28 → rcg, 27 → rcp, 37 → rce); null = ramo sin tarifa del cotizador. */
export function cotizadorDeRamo(cramo: number | null): CotizadorRc | null {
  const e = Object.entries(RAMOS_RC).find(([, r]) => r === cramo);
  return e ? (e[0] as CotizadorRc) : null;
}

export const NOMBRE_COTIZADOR: Record<CotizadorRc, string> = { rcg: 'RCG', rcp: 'RCP', rce: 'RCE' };

export interface TarifaOficial extends TarifaComboOficial {
  cotizador: CotizadorRc;
  /** Moneda de la prima para mostrar (USD, EUR o Bs.). */
  moneda: string;
  /** Tasa usada (%) y clase o actividad del riesgo: solo se muestran con la vista técnica. */
  tasa: number | null;
  clase: string;
  opcion: string | null;
  minimaAplicada: boolean;
}

/** Sin coberturas adicionales por empleado ni opcionales en Bs.: en el combo esas coberturas van con prima 0. */
const soloBasica = (x: ProductoEntrada): ProductoEntrada => ({
  ...x, adicionales: x.adicionales.map(() => false), opcionalesVes: x.opcionalesVes.map((o) => ({ ...o, seleccionada: false })),
});

const ERROR_ACTIVIDAD = 'Selecciona una Actividad del Riesgo vinculada a la clase.';

/**
 * Prima de tarifa oficial para el combo. `elegidas` = sumas escritas del combo (ccober → suma); la de la cobertura
 * básica es el límite que exige el motor RCG (opción I). RCP/RCE no usan límite: la prima sale de la nómina, la clase y la opción.
 * Solo se toman los errores de los datos de tarifa (no los del tomador: el combo los pide en su propio paso).
 */
export function tarifaOficialCombo(
  cotizador: CotizadorRc, elegidas: Record<string, string>, s: { rcg: SolicitudRcg; rc: SolicitudRc },
  prm: { rcg: ParametrosRcg; rc: ParametrosRc },
): TarifaOficial {
  if (cotizador === 'rcg') {
    const basica = BASICA_RCG.ccober[monedaSis2000(s.rcg.moneda)] ?? null;
    const n = basica ? Number(elegidas[basica] ?? '') : 0;
    const suma = Number.isFinite(n) ? n : 0;
    const r = cotizarRcg({ ...s.rcg, limite: suma > 0 ? suma : null }, prm.rcg);
    const errores = [r.errores.clase, r.errores.indole, r.errores.tasa].filter((x): x is string => !!x);
    const alt = r.alternativas[0];
    return {
      cotizador, moneda: s.rcg.moneda,
      basica,
      prima: !errores.length && alt ? alt.prima : null,
      errores,
      errorSuma: suma > 0 ? r.errores.limite : undefined,
      tasa: s.rcg.tasa, clase: prm.rcg.clases[s.rcg.clase]?.etiqueta ?? '', opcion: alt ? alt.opcion : null,
      minimaAplicada: !!alt?.primaMinimaAplicada,
    };
  }
  const k = cotizador === 'rcp' ? 'p' : 'e';
  const r = cotizarRc({ ...s.rc, modo: k, p: soloBasica(s.rc.p), e: soloBasica(s.rc.e) }, prm.rc);
  // RCP no depende de la actividad del riesgo (solo la empresarial): no se exige.
  const errores = [...r.erroresPorPaso.riesgo, ...r.erroresPorPaso.cotizacion].filter((x) => k === 'e' || x !== ERROR_ACTIVIDAD);
  const res = r.resultados[0];
  const elegida = res?.opciones?.find((o) => o.id === res.opcion);
  return {
    cotizador, moneda: r.simbolo === 'Bs' ? 'Bs.' : r.simbolo,
    basica: (k === 'p' ? BASICA_RCP : BASICA_RCE).ccober[monedaSis2000(s.rc.moneda)] ?? null,
    prima: !errores.length && res && res.prima > 0 ? res.prima : null,
    errores,
    tasa: res && Number.isFinite(res.tasaEfectiva) ? res.tasaEfectiva : null, clase: res?.riesgo?.[0] ?? '', opcion: res?.opcion ?? null,
    minimaAplicada: !!elegida && elegida.ajusteMinimo > 0,
  };
}
