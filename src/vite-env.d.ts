/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** '1' habilita el botón de emitir de "Planes RCG Sis2000" (solo QA). */
  readonly VITE_RCG_PLANES_EMITIR?: string;
  /** Productor Sis2000 de la emisión de prueba (por defecto 80080). */
  readonly VITE_RCG_PLANES_CPRODUCTOR?: string;
}
