import type { LucideIcon } from 'lucide-react';
import { Layers, UserCog, Building2, Calculator, FileCheck2 } from 'lucide-react';

/** Metadatos del módulo. */
export const MODULE_META = {
  productName: 'Cotizador de Responsabilidad Civil',
  brandName: 'La Mundial de Seguros',
  defaultPort: 5180,
} as const;

export interface ModuleStepConfig {
  n: number;
  label: string;
  eyebrow: string;
  title: string;
  description: string;
  Icon: LucideIcon;
}

export const MODULE_STEPS: ModuleStepConfig[] = [
  {
    n: 1,
    label: 'Producto',
    eyebrow: 'Paso 01 · Producto',
    title: 'Elige qué cotizar',
    description: 'Tarifa RCG, RCP / RCE, un plan de Sis2000 o un combo de coberturas.',
    Icon: Layers,
  },
  {
    n: 2,
    label: 'Tomador',
    eyebrow: 'Paso 02 · Tomador',
    title: 'Datos del tomador',
    description: 'Tomador / asegurado y datos de quien elabora la cotización.',
    Icon: UserCog,
  },
  {
    n: 3,
    label: 'Riesgo',
    eyebrow: 'Paso 03 · Riesgo',
    title: 'Clasificación del riesgo',
    description: 'Clase, índole y actividad que determinan el rango de tasas.',
    Icon: Building2,
  },
  {
    n: 4,
    label: 'Cotización',
    eyebrow: 'Paso 04 · Cotización',
    title: 'Elige la opción de cobertura',
    description: 'Primas calculadas con la tarifa oficial de La Mundial.',
    Icon: Calculator,
  },
  {
    n: 5,
    label: 'Emisión',
    eyebrow: 'Paso 05 · Emisión',
    title: 'Resumen de la cotización',
    description: 'Revisa, descarga la cotización y continúa a la emisión.',
    Icon: FileCheck2,
  },
];
