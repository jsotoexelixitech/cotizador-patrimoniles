import { create } from 'zustand';
import { MODULE_STEPS } from '../config/module.config';
import { MODO_CLIENTE } from '../config/modoCliente';

interface WizardState {
  step: number;
  /** Paso más avanzado al que se llegó validando; el stepper solo deja saltar hasta aquí. */
  alcanzado: number;
  /** Cotizador (asistente), pantalla de parámetros de tarifa o emisión de Pastora (ramo 25). */
  vista: Vista;
  /** Código de la cotización abierta en la vista «consulta». */
  codigoConsulta: string;
  setVista: (v: Vista) => void;
  /** Abre una cotización guardada por su código ('' = pantalla para escribirlo). */
  abrirConsulta: (codigo?: string) => void;
  /** Cotización reabierta: salta directo a un paso del asistente con todos los anteriores habilitados. */
  abrirEnPaso: (step: number) => void;
  goTo: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  reset: () => void;
}

/**
 * cotizador = asistente; parametros y pastora = vistas aparte del admin; cotizaciones = búsqueda del admin;
 * inicio = portada de la vista cliente (nueva cotización o traer una por código); consulta = cotización guardada
 * (opciones, pago y póliza).
 */
export type Vista = 'cotizador' | 'parametros' | 'pastora' | 'cotizaciones' | 'inicio' | 'consulta';

/** Link público (COTIZADOR_PUBLICO=1): siempre y solo el formulario de Pastora. */
const SOLO_PASTORA = import.meta.env.VITE_SOLO_PASTORA === '1';

/** ?cotizacion=CODIGO abre esa cotización (es también la vuelta desde el módulo de Pagos). */
function codigoDeUrl(): string {
  try {
    return (new URLSearchParams(window.location.search).get('cotizacion') ?? '').trim().toUpperCase().slice(0, 40);
  } catch {
    return '';
  }
}

/** Vista de arranque: el cliente empieza en la portada; el admin, en el asistente. */
const vistaBase = (): Vista => (MODO_CLIENTE ? 'inicio' : 'cotizador');

/** ?vista=pastora abre directo la emisión de Pastora. */
function vistaInicial(): Vista {
  if (SOLO_PASTORA) return 'pastora';
  if (codigoDeUrl()) return 'consulta';
  try {
    return new URLSearchParams(window.location.search).get('vista') === 'pastora' ? 'pastora' : vistaBase();
  } catch {
    return vistaBase();
  }
}

const maxStep = MODULE_STEPS.length;

export const useWizardStore = create<WizardState>((set) => ({
  step: 1,
  alcanzado: 1,
  vista: vistaInicial(),
  codigoConsulta: SOLO_PASTORA ? '' : codigoDeUrl(),
  setVista: (vista) => set({ vista: SOLO_PASTORA ? 'pastora' : vista }),
  abrirConsulta: (codigo = '') => set(SOLO_PASTORA ? {} : { vista: 'consulta', codigoConsulta: codigo.trim().toUpperCase() }),
  abrirEnPaso: (step) => set(SOLO_PASTORA ? {} : { vista: 'cotizador', step: Math.min(Math.max(step, 1), maxStep), alcanzado: Math.min(Math.max(step, 1), maxStep) }),
  goTo: (step) => set((s) => ({ step: Math.min(Math.max(step, 1), s.alcanzado, maxStep) })),
  nextStep: () => set((s) => {
    const step = Math.min(s.step + 1, maxStep);
    return { step, alcanzado: Math.max(s.alcanzado, step) };
  }),
  prevStep: () => set((s) => ({ step: Math.max(s.step - 1, 1) })),
  reset: () => set({ step: 1, alcanzado: 1, vista: SOLO_PASTORA ? 'pastora' : vistaBase(), codigoConsulta: '' }),
}));
