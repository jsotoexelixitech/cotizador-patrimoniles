import { create } from 'zustand';
import { guardarCotizacion } from '../api/cotizaciones';
import type { DatosCotizacion } from '../cotizaciones/snapshot';

interface GuardadaState {
  /** Huella de lo cotizado que ya se guardó (o se está guardando). */
  huella: string | null;
  /** Código oficial que devolvió Nexus; null = aún no hay o Nexus falló (se sigue con el provisional). */
  codigo: string | null;
  expiraEn: string | null;
  guardando: boolean;
  error: string | null;
  /** Guarda la cotización una sola vez por huella: volver al resumen sin cambios conserva el código. */
  guardar: (huella: string, armar: () => Promise<DatosCotizacion>) => Promise<void>;
  limpiar: () => void;
}

export const useCotizacionGuardadaStore = create<GuardadaState>((set, get) => ({
  huella: null, codigo: null, expiraEn: null, guardando: false, error: null,
  guardar: async (huella, armar) => {
    const s = get();
    if (s.huella === huella && (s.guardando || s.codigo)) return;
    set({ huella, codigo: null, expiraEn: null, guardando: true, error: null });
    try {
      const datos = await armar();
      const r = await guardarCotizacion(datos.producto, datos);
      // Si mientras tanto cambió lo cotizado, este resultado ya no corresponde.
      if (get().huella === huella) set({ codigo: r.codigo, expiraEn: r.expiraEn, guardando: false });
    } catch (e) {
      if (get().huella === huella) set({ guardando: false, error: e instanceof Error ? e.message : String(e) });
    }
  },
  limpiar: () => set({ huella: null, codigo: null, expiraEn: null, guardando: false, error: null }),
}));
