import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { PARAMETROS_RCG, type ParametrosRcg } from '../tarifas/rcg';
import { PARAMETROS_RC, type ParametrosRc } from '../tarifas/rcp-rce';

/** Copia profunda para no mutar nunca los valores oficiales. */
const clonar = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

export const VERSION_PARAMETROS = 1;

interface ParametrosState {
  rcg: ParametrosRcg;
  rc: ParametrosRc;
  actualizado: string | null;
  /**
   * Perfiles técnicos: muestra la tasa y la prima de cada cobertura. Apagada (por defecto) el cliente solo ve la
   * prima total, también en el PDF. No es tarifa: no cuenta como personalizada ni se exporta.
   */
  vistaTecnica: boolean;
  setRcg: (c: Partial<ParametrosRcg>) => void;
  setRc: (c: Partial<ParametrosRc>) => void;
  setVistaTecnica: (v: boolean) => void;
  restaurar: (que: 'rcg' | 'rc' | 'todo') => void;
  importar: (json: unknown) => void;
}

const ahora = () => new Date().toISOString();

/**
 * Parámetros de tarifa editables. Hoy se guardan en este navegador (localStorage);
 * el mismo JSON es el que se publicará luego desde nest-api para todos los usuarios.
 */
export const useParametrosStore = create<ParametrosState>()(
  persist(
    (set) => ({
      rcg: clonar(PARAMETROS_RCG),
      rc: clonar(PARAMETROS_RC),
      actualizado: null,
      vistaTecnica: false,
      setRcg: (c) => set((s) => ({ rcg: { ...s.rcg, ...c }, actualizado: ahora() })),
      setRc: (c) => set((s) => ({ rc: { ...s.rc, ...c }, actualizado: ahora() })),
      setVistaTecnica: (vistaTecnica) => set({ vistaTecnica }),
      restaurar: (que) => set((s) => ({
        rcg: que === 'rc' ? s.rcg : clonar(PARAMETROS_RCG),
        rc: que === 'rcg' ? s.rc : clonar(PARAMETROS_RC),
        actualizado: que === 'todo' ? null : ahora(),
      })),
      importar: (json) => {
        const j = json as { version?: number; rcg?: Partial<ParametrosRcg>; rc?: Partial<ParametrosRc> };
        if (!j || typeof j !== 'object' || (!j.rcg && !j.rc)) throw new Error('El archivo no contiene parámetros del cotizador.');
        set({
          rcg: { ...clonar(PARAMETROS_RCG), ...(j.rcg ?? {}) },
          rc: { ...clonar(PARAMETROS_RC), ...(j.rc ?? {}), bs: { ...PARAMETROS_RC.bs, ...(j.rc?.bs ?? {}) } },
          actualizado: ahora(),
        });
      },
    }),
    {
      name: 'cotizador-rc.parametros',
      version: VERSION_PARAMETROS,
      storage: createJSONStorage(() => localStorage),
      // Completa con los oficiales cualquier campo nuevo que no exista en lo guardado.
      merge: (guardado, actual) => {
        const g = (guardado ?? {}) as Partial<ParametrosState>;
        return {
          ...actual,
          rcg: { ...actual.rcg, ...(g.rcg ?? {}) },
          rc: { ...actual.rc, ...(g.rc ?? {}), bs: { ...actual.rc.bs, ...(g.rc?.bs ?? {}) } },
          actualizado: g.actualizado ?? null,
          vistaTecnica: g.vistaTecnica === true,
        };
      },
    },
  ),
);

export const exportarParametros = (s: Pick<ParametrosState, 'rcg' | 'rc'>) =>
  JSON.stringify({ version: VERSION_PARAMETROS, exportado: ahora(), rcg: s.rcg, rc: s.rc }, null, 2);

/** true si los parámetros difieren de los oficiales de La Mundial. */
export const esPersonalizado = (s: Pick<ParametrosState, 'rcg' | 'rc'>) =>
  JSON.stringify(s.rcg) !== JSON.stringify(PARAMETROS_RCG) || JSON.stringify(s.rc) !== JSON.stringify(PARAMETROS_RC);
