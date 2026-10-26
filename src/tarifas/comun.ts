// Utilidades compartidas por los motores de tarifa (sin dependencias de React).

export const redondear = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export const normalizar = (v: unknown): string =>
  String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export const importe = (n: number): string =>
  Number(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const porcentaje = (n: number): string =>
  new Intl.NumberFormat('es-VE', { maximumFractionDigits: 5 }).format(n) + ' %';

export const SUCURSALES = [
  'Caracas', 'Puerto La Cruz', 'Valencia', 'Maracaibo',
  'Barquisimeto', 'Maracay', 'Maturin', 'Porlamar',
  'Puerto Ordaz', 'San Cristobal', 'El Tigre', 'Ciudad Ojeda',
];

export const CORREO_RE = /^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$/i;

/** Convierte el texto de un input numérico a número o null si está vacío/no es válido. */
export const numeroONulo = (v: string): number | null => {
  if (v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
