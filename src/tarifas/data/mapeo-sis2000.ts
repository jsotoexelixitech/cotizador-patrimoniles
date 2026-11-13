// Mapeo de las coberturas del cotizador (RCG, RCP y RCE) a las coberturas (ccober) de Sis2000, por moneda.
// Fuente: GET v1/riesgos-generales/coberturas?cramo=28|27|37 en Sis2000 QA (10-nov-2026), empatado por nombre.
// En Sis2000 estos ramos no tienen tarifa (matarifa_d sin tasa ni prima fija): la prima la fija el cotizador / Técnico
// y se emite con nest-api `modo: cotizador`.
//
// Cómo leerlo:
// - `concepto`: el nombre tal como lo usa el cotizador (rcg.ts / rcp-rce.ts). Se compara sin acentos ni mayúsculas.
// - `ccober`: código de Sis2000 por moneda. Si falta la moneda de la cotización, esa cotización NO se puede emitir
//   (el botón queda deshabilitado y lo dice) hasta que La Mundial cree la cobertura o se corrija aquí.
// - `ambigua`: el empate no es exacto; revisar con Técnico antes de pasar a producción.
//
// Prima: toda la prima de la opción va en la cobertura básica; los sublímites y coberturas incluidas van con su suma y
// prima 0 (están dentro de la prima de la básica). En RCP/RCE en USD/EUR las coberturas adicionales por empleado
// (médica, hernia, negligencia, defensa) llevan su propia prima.

export type MonedaSis2000 = 'USD' | 'BS' | 'EUR';

export interface MapeoCobertura {
  concepto: string;
  ccober: Partial<Record<MonedaSis2000, string>>;
  ambigua?: string;
}

/** Ramos de Sis2000 de cada cotizador. */
export const RAMOS_RC = { rcg: 28, rcp: 27, rce: 37 } as const;
export type CotizadorRc = keyof typeof RAMOS_RC;

/** Planes contenedores sugeridos para el RCG según la opción (si están vigentes en el ramo 28). */
export const PLAN_RCG_POR_OPCION: Record<'I' | 'II' | 'III', string> = { I: 'PLANI', II: 'PLANII', III: 'PLAN3' };

// ── RCG · ramo 28 ────────────────────────────────────────────────────────────────────────────────────────────────────

export const BASICA_RCG: MapeoCobertura = {
  concepto: 'Límite de responsabilidad (cobertura básica predio y operaciones)',
  ccober: { USD: '1', BS: '29', EUR: '32' },
  ambigua: 'EUR: también existe 58 «LÍMITE MÁXIMO DE RESPONSABILIDAD POR AÑO PÓLIZA (EUR)»; se usa 32. '
    + 'La 1 tiene topes 1.000–2.000 en matarifa_d (no se aplican en modo cotizador).',
};

export const MAPEO_RCG: MapeoCobertura[] = [
  { concepto: 'Riesgo de Vecinos', ccober: { USD: '2', BS: '35' } },
  { concepto: 'Riesgo Locativo', ccober: { USD: '3', BS: '36' } },
  { concepto: 'Responsabilidad Civil Daños Causados por Agua', ccober: { USD: '4', BS: '37' } },
  { concepto: 'Responsabilidad Civil Contratistas Independientes', ccober: { USD: '5', BS: '38' } },
  { concepto: 'Responsabilidad Civil por Vigilantes Privados', ccober: { USD: '6' }, ambigua: 'No hay «VIGILANTE PRIVADO BS» (no existe la 39): en Bs. no se puede emitir.' },
  { concepto: 'Responsabilidad Civil por Actividades Sociales y Eventos Deportivos', ccober: { USD: '7', BS: '40' } },
  { concepto: 'Responsabilidad Civil por Suministro de Alimentos y Bebidas', ccober: { USD: '8', BS: '41' } },
  { concepto: 'Responsabilidad Civil de Contaminación Ambiental', ccober: { USD: '10', BS: '30', EUR: '59' } },
  { concepto: 'Responsabilidad Civil de Ascensores, Grúas y Montacargas', ccober: { USD: '11', BS: '33' } },
  { concepto: 'Responsabilidad Civil Cruzada', ccober: { USD: '13', BS: '31' } },
  { concepto: 'Responsabilidad Civil de Vehículos en Predios Privados', ccober: { USD: '15', BS: '44' },
    ambigua: 'Hay también 14 «VEHÍCULOS ESTACIONADOS» y 16 «VEHÍCULOS AJENOS Y/O ALQUILADOS»; se usa la 15 por nombre.' },
  { concepto: 'Responsabilidad Civil de Avisos Luminosos o no y Vallas', ccober: { USD: '17', BS: '46' } },
  { concepto: 'Responsabilidad Civil de Transporte, Carga y Descarga', ccober: { USD: '18', BS: '47' } },
  { concepto: 'Responsabilidad Civil por Incendio y/o Explosión', ccober: { USD: '24', BS: '53' } },
  { concepto: 'Responsabilidad Civil Defensa Penal y Asistencia Legal', ccober: { USD: '25', BS: '54' } },
];

// ── RCP · ramo 27 ────────────────────────────────────────────────────────────────────────────────────────────────────

const SUMA_POR_TRABAJADOR = 'Suma = límite por trabajador del cotizador; confirmar con Técnico.';

export const BASICA_RCP: MapeoCobertura = {
  concepto: 'Cobertura básica', ccober: { USD: '1', BS: '14', EUR: '18' },
  ambigua: 'Suma = límite por evento / año póliza. Sis2000 tiene además 9, 10 y 11 (límites por persona, por ocurrencia y por año) que no se envían.',
};

export const MAPEO_RCP: MapeoCobertura[] = [
  { concepto: 'Discapacidad temporal', ccober: { USD: '2', BS: '15' } },
  { concepto: 'Discapacidad parcial permanente', ccober: { USD: '3', BS: '16' } },
  { concepto: 'Discapacidad total permanente para el trabajo habitual', ccober: { USD: '4', BS: '17' } },
  { concepto: 'Discapacidad absoluta permanente para cualquier actividad', ccober: { USD: '5' } },
  { concepto: 'Gran discapacidad', ccober: { USD: '6' } },
  { concepto: 'Muerte', ccober: { USD: '7' } },
  { concepto: 'Gastos de entierro', ccober: { USD: '8' } },
  { concepto: 'Asistencia médica, quirúrgica y farmacéutica', ccober: { USD: '12' },
    ambigua: `Se usa 12 «GASTOS MEDICOS» (no hay una cobertura de asistencia médica, quirúrgica y farmacéutica; tampoco en Bs.). ${SUMA_POR_TRABAJADOR}` },
  // 21 «HERNIAS» USD creada en Sis2000_QA el 13-nov-2026 (configurador). Donde no exista (p. ej. producción), su prima va en la básica.
  { concepto: 'Hernia', ccober: { USD: '21', BS: '13' }, ambigua: `USD: 21 «HERNIAS» (QA, 13-nov-2026); Bs.: 13 «HERNIAS BS»; en EUR va en la básica. ${SUMA_POR_TRABAJADOR}` },
  { concepto: 'Hernias', ccober: { USD: '21', BS: '13' }, ambigua: SUMA_POR_TRABAJADOR },
];

// ── RCE · ramo 37 ────────────────────────────────────────────────────────────────────────────────────────────────────

export const BASICA_RCE: MapeoCobertura = {
  concepto: 'Cobertura básica', ccober: { USD: '1', BS: '14', EUR: '13' },
  ambigua: 'Suma = límite por evento / año póliza. Sis2000 tiene además 12/15/16 «LÍMITE MÁXIMO … POR AÑO PÓLIZA» que no se envía.',
};

export const MAPEO_RCE: MapeoCobertura[] = [
  { concepto: 'Muerte', ccober: { USD: '2' } },
  { concepto: 'Discapacidad temporal', ccober: { USD: '3' } },
  { concepto: 'Discapacidad parcial permanente', ccober: { USD: '4' } },
  { concepto: 'Discapacidad total permanente para el trabajo habitual', ccober: { USD: '5' } },
  { concepto: 'Discapacidad absoluta permanente para cualquier actividad', ccober: { USD: '6' } },
  { concepto: 'Gran discapacidad', ccober: { USD: '7' } },
  { concepto: 'Secuelas o deformidades permanentes', ccober: { USD: '8' } },
  { concepto: 'Negligencia del Empleador', ccober: { USD: '9' }, ambigua: SUMA_POR_TRABAJADOR },
  { concepto: 'Asistencia Legal y Defensa Penal', ccober: { USD: '10' }, ambigua: SUMA_POR_TRABAJADOR },
  { concepto: 'Gastos Médicos', ccober: { USD: '11' }, ambigua: SUMA_POR_TRABAJADOR },
];
