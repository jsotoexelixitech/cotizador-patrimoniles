import { create } from 'zustand';
import { MODULE_STEPS } from '../config/module.config';

interface WizardState {
  step: number;
  /** Paso más avanzado al que se llegó validando; el stepper solo deja saltar hasta aquí. */
  alcanzado: number;
  /** Cotizador (asistente) o pantalla de parámetros de tarifa. */
  vista: 'cotizador' | 'parametros';
  setVista: (v: 'cotizador' | 'parametros') => void;
  goTo: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  reset: () => void;
}

const maxStep = MODULE_STEPS.length;

export const useWizardStore = create<WizardState>((set) => ({
  step: 1,
  alcanzado: 1,
  vista: 'cotizador',
  setVista: (vista) => set({ vista }),
  goTo: (step) => set((s) => ({ step: Math.min(Math.max(step, 1), s.alcanzado, maxStep) })),
  nextStep: () => set((s) => {
    const step = Math.min(s.step + 1, maxStep);
    return { step, alcanzado: Math.max(s.alcanzado, step) };
  }),
  prevStep: () => set((s) => ({ step: Math.max(s.step - 1, 1) })),
  reset: () => set({ step: 1, alcanzado: 1, vista: 'cotizador' }),
}));
