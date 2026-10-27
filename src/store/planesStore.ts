import { create } from 'zustand';
import { cotizarPlan, emitirPlan } from '../api/patrimonial';
import { PLANES_RCG, parsearCotizacionPlan, type PlanSis2000, type ResultadoEmision } from '../tarifas/planes-rcg';

interface PlanesState {
  planes: PlanSis2000[];
  cargando: boolean;
  error: string | null;
  emitiendo: boolean;
  emision: ResultadoEmision | null;
  cargar: () => Promise<void>;
  emitir: (payload: unknown) => Promise<ResultadoEmision | null>;
  reset: () => void;
}

const inicial = { planes: [], cargando: false, error: null, emitiendo: false, emision: null };

export const usePlanesStore = create<PlanesState>((set, get) => ({
  ...inicial,
  cargar: async () => {
    if (get().cargando) return;
    set({ cargando: true, error: null });
    const r = await Promise.allSettled(PLANES_RCG.map((p) => cotizarPlan(p.cplan).then((b) => parsearCotizacionPlan(p.cplan, p.nombre, b))));
    const fallas = r.flatMap((x, i) => (x.status === 'rejected' ? [`${PLANES_RCG[i].nombre}: ${x.reason instanceof Error ? x.reason.message : x.reason}`] : []));
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
  reset: () => set(inicial),
}));
