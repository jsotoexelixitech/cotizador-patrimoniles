import { create } from 'zustand';
import { MODULE_STEPS } from '../config/module.config';

interface WizardState {
  step: number;
  /** Paso más avanzado al que se llegó validando; el stepper solo deja saltar hasta aquí. */
  alcanzado: number;
  /** Cotizador (asistente), pantalla de parámetros de tarifa o emisión de Pastora (ramo 25). */
  vista: Vista;
  setVista: (v: Vista) => void;
  goTo: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  reset: () => void;
}

export type Vista = 'cotizador' | 'parametros' | 'pastora';

/** Link público (COTIZADOR_PUBLICO=1): siempre y solo el formulario de Pastora. */
const SOLO_PASTORA = import.meta.env.VITE_SOLO_PASTORA === '1';

/** ?vista=pastora abre directo la emisión de Pastora. */
function vistaInicial(): Vista {
  if (SOLO_PASTORA) return 'pastora';
  try {
    return new URLSearchParams(window.location.search).get('vista') === 'pastora' ? 'pastora' : 'cotizador';
  } catch {
    return 'cotizador';
  }
}

const maxStep = MODULE_STEPS.length;

export const useWizardStore = create<WizardState>((set) => ({
  step: 1,
  alcanzado: 1,
  vista: vistaInicial(),
  setVista: (vista) => set({ vista: SOLO_PASTORA ? 'pastora' : vista }),
  goTo: (step) => set((s) => ({ step: Math.min(Math.max(step, 1), s.alcanzado, maxStep) })),
  nextStep: () => set((s) => {
    const step = Math.min(s.step + 1, maxStep);
    return { step, alcanzado: Math.max(s.alcanzado, step) };
  }),
  prevStep: () => set((s) => ({ step: Math.max(s.step - 1, 1) })),
  reset: () => set({ step: 1, alcanzado: 1, vista: SOLO_PASTORA ? 'pastora' : 'cotizador' }),
}));
