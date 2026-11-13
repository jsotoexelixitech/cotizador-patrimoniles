// Descuentos por suma asegurada elevada (pantalla de Parámetros → «Configurar descuentos»).
// Cada tramo dice «desde esta suma, este % de descuento sobre la tasa básica». Sin tramos no hay descuento y el
// cálculo es el de siempre. El descuento baja la tasa antes de calcular la prima; las primas mínimas se respetan.

export interface TramoDescuento {
  /** Suma asegurada desde la que aplica el tramo (inclusive). */
  desde: number;
  /** % de descuento sobre la tasa básica (0 a 100). */
  pct: number;
}

/** Tramos utilizables: suma positiva y % entre 0 (exclusivo) y 100. */
export const tramosValidos = (tramos: TramoDescuento[] | undefined | null): TramoDescuento[] =>
  (tramos ?? []).filter((t) => t && Number.isFinite(t.desde) && t.desde > 0 && Number.isFinite(t.pct) && t.pct > 0 && t.pct <= 100);

/** % de descuento de la suma: el del tramo más alto cuyo «desde» alcanza la suma (0 si ninguno). */
export function descuentoPorSuma(suma: number, tramos: TramoDescuento[] | undefined | null): number {
  let mejor: TramoDescuento | null = null;
  for (const t of tramosValidos(tramos)) {
    if (suma >= t.desde && (!mejor || t.desde > mejor.desde)) mejor = t;
  }
  return mejor?.pct ?? 0;
}

/** Tasa básica con el descuento aplicado. */
export const tasaConDescuento = (tasa: number, pct: number): number => (pct > 0 ? tasa * (1 - pct / 100) : tasa);

/** Descuento que lleva una opción (solo existe cuando algún tramo aplica). */
export interface DescuentoAplicado {
  descuentoPct: number;
  tasaInicial: number;
  tasaAplicada: number;
}

export function descuentoAplicado(suma: number, tasa: number, tramos: TramoDescuento[] | undefined | null): DescuentoAplicado | null {
  const descuentoPct = descuentoPorSuma(suma, tramos);
  return descuentoPct > 0 ? { descuentoPct, tasaInicial: tasa, tasaAplicada: tasaConDescuento(tasa, descuentoPct) } : null;
}

/** Problemas de la tabla de tramos para avisar en Parámetros (vacío = bien). */
export function erroresTramos(tramos: TramoDescuento[] | undefined | null): string[] {
  const t = tramos ?? [];
  const e: string[] = [];
  if (t.some((x) => !(x.desde > 0))) e.push('Cada tramo necesita una suma mayor que 0.');
  if (t.some((x) => !(x.pct > 0) || x.pct > 100)) e.push('El descuento de cada tramo debe estar entre 0 % y 100 %.');
  if (new Set(t.map((x) => x.desde)).size !== t.length) e.push('Hay tramos con la misma suma: se usa uno solo.');
  return e;
}
