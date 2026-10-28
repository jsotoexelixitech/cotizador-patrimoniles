import { create } from 'zustand';
import { cotizarPlan, emitirPlan, listarPlanes } from '../api/patrimonial';
import { parsearCotizacionPlan, type PlanSis2000, type RamoCatalogo, type ResultadoEmision } from '../tarifas/planes-rcg';

interface PlanesState {
  /** Catálogo de Sis2000 por ramo (valrep/planes/riesgos-generales). */
  ramos: RamoCatalogo[];
  cargandoRamos: boolean;
  errorRamos: string | null;
  /** Planes cotizados del ramo `ramoCotizado`. */
  ramoCotizado: number | null;
  planes: PlanSis2000[];
  cargando: boolean;
  error: string | null;
  emitiendo: boolean;
  emision: ResultadoEmision | null;
  cargarRamos: () => Promise<void>;
  cargar: (cramo: number) => Promise<void>;
  emitir: (payload: unknown) => Promise<ResultadoEmision | null>;
  reset: () => void;
}

const inicial = {
  ramos: [], cargandoRamos: false, errorRamos: null,
  ramoCotizado: null, planes: [], cargando: false, error: null, emitiendo: false, emision: null,
};

export const usePlanesStore = create<PlanesState>((set, get) => ({
  ...inicial,
  cargarRamos: async () => {
    if (get().cargandoRamos) return;
    set({ cargandoRamos: true, errorRamos: null });
    try {
      set({ ramos: await listarPlanes(), cargandoRamos: false });
    } catch (e) {
      set({ cargandoRamos: false, errorRamos: e instanceof Error ? e.message : String(e) });
    }
  },
  cargar: async (cramo) => {
    if (get().cargando) return;
    const lista = (get().ramos.find((r) => r.cramo === cramo)?.planes ?? []).filter((p) => p.cotizable);
    set({ cargando: true, error: null, ramoCotizado: cramo, planes: [] });
    const r = await Promise.allSettled(lista.map((p) => cotizarPlan(cramo, p.cplan).then((b) => parsearCotizacionPlan(cramo, p.cplan, p.xplan, b))));
    const fallas = r.flatMap((x, i) => (x.status === 'rejected' ? [`${lista[i].xplan}: ${x.reason instanceof Error ? x.reason.message : x.reason}`] : []));
    set({
      cargando: false,
      planes: r.flatMap((x) => (x.status === 'fulfilled' ? [x.value] : [])),
      error: fallas.length ? fallas.join(' · ') : null,
    });
  },
  emitir: async (payload) => {
    set({ emitiendo: true, error: null });
    try {
      const emision = await emitirPlan(payload);
      set({ emitiendo: false, emision });
      return emision;
    } catch (e) {
      set({ emitiendo: false, error: e instanceof Error ? e.message : String(e) });
      return null;
    }
  },
  // El catálogo se conserva: solo se limpia lo cotizado y la emisión.
  reset: () => set({ ramoCotizado: null, planes: [], cargando: false, error: null, emitiendo: false, emision: null }),
}));
