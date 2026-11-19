import { create } from 'zustand';
import { rutaApi } from '../api/base';
import { PRODUCTOR_WEB_POR_DEFECTO, sesionDeActor, type SesionCotizador } from '../sso/actor';
import { cabecerasSso, hayTokenSso } from '../sso/token';

/** Productor del canal web (landing de La Mundial): el mismo que usa el servidor sin token. */
export const PRODUCTOR_WEB = Number(import.meta.env.VITE_RCG_PLANES_CPRODUCTOR) || PRODUCTOR_WEB_POR_DEFECTO;

interface SesionState {
  /** Validando el token con el servidor del cotizador. */
  cargando: boolean;
  sesion: SesionCotizador;
  /** Token presente pero rechazado (vencido, inválido o SSO sin configurar): no se guarda ni se emite como web. */
  error: string | null;
  cargar: () => Promise<void>;
}

/**
 * Sesión del SSO de Sys2000 tal como la validó el servidor (GET {base}/sso/sesion). Solo para mostrar «Cotizando
 * como» y armar los bodies con el mismo productor: el servidor lo vuelve a poner al guardar y al emitir.
 */
export const useSesionStore = create<SesionState>((set) => ({
  cargando: hayTokenSso(),
  sesion: sesionDeActor(null, PRODUCTOR_WEB),
  error: null,
  cargar: async () => {
    if (!hayTokenSso()) return;
    set({ cargando: true, error: null });
    try {
      const res = await fetch(rutaApi('/sso/sesion'), { headers: cabecerasSso(), cache: 'no-store' });
      const body = await res.json().catch(() => null) as { success?: boolean; data?: SesionCotizador; message?: string } | null;
      if (res.ok && body?.success && body.data) set({ cargando: false, sesion: body.data });
      else set({ cargando: false, error: body?.message || `No se pudo validar la sesión de Sys2000 (HTTP ${res.status}).` });
    } catch {
      set({ cargando: false, error: 'No se pudo validar la sesión de Sys2000: sin conexión con el servidor del cotizador.' });
    }
  },
}));

/** Productor con el que se arma la emisión en pantalla (el servidor lo impone igual). */
export const productorActual = (): number => useSesionStore.getState().sesion.productor;
