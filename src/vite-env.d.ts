/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** '1' habilita el botón de emitir de "Planes RCG Sis2000" (solo QA). */
  readonly VITE_RCG_PLANES_EMITIR?: string;
  /** Productor Sis2000 de la emisión de prueba (por defecto 80080). */
  readonly VITE_RCG_PLANES_CPRODUCTOR?: string;
  /** '1' habilita «Emitir en Sis2000 QA» de RCG, RCP y RCE con la prima del cotizador (nest-api modo cotizador). */
  readonly VITE_RC_EMITIR?: string;
  /** '1' = vista cliente (link al cliente): lo define vite.config.ts con COTIZADOR_CLIENTE=1. */
  readonly VITE_MODO_CLIENTE?: string;
  /** Plan contenedor del ramo 28 para emitir el RCG pagado en línea (p. ej. PBT1 o RCGGEN); sin él, PLANI / PLANII / PLAN3. */
  readonly VITE_RCG_PLAN_CONTENEDOR?: string;
  /** Plan contenedor de RCP (ramo 27) y de RCE (ramo 37) para el pago en línea; sin él, el único plan vigente del ramo. */
  readonly VITE_RCP_PLAN_CONTENEDOR?: string;
  readonly VITE_RCE_PLAN_CONTENEDOR?: string;
}
