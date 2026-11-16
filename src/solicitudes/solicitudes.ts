// Solicitud de seguro de cada ramo (formatos aprobados por La Mundial) llena con los datos de la emisión:
// RCG ramo 28, RCP ramo 27, RCE ramo 37. Va casada con la póliza emitida, no con la cotización: coberturas y límites
// dicen «Según cotización N° …» o «Según plan …», y a la persona solo le queda firmar (firmas, huellas y documentos de
// identidad quedan vacíos). Los campos se ubican por su rótulo en la plantilla, no por posición fija.
import { normalizar } from '../tarifas/comun';
import { camposDe, controlesDe, llenarXml, type CampoFormulario, type ControlContenido, type Relleno } from './docx';

export type RamoSolicitud = 27 | 28 | 37;
export const RAMOS_SOLICITUD: RamoSolicitud[] = [28, 27, 37];
export const esRamoSolicitud = (cramo: number | null | undefined): cramo is RamoSolicitud => cramo === 27 || cramo === 28 || cramo === 37;

export const NOMBRE_SOLICITUD: Record<RamoSolicitud, string> = {
  28: 'Solicitud de Responsabilidad Civil General',
  27: 'Solicitud de Seguro Responsabilidad Civil Patronal',
  37: 'Solicitud de Responsabilidad Civil Empresarial',
};

export const ARCHIVO_PLANTILLA: Record<RamoSolicitud, string> = { 28: 'solicitud-rcg.docx', 27: 'solicitud-rcp.docx', 37: 'solicitud-rce.docx' };

/** Datos de la póliza emitida que se vacían en la solicitud. */
export interface DatosSolicitud {
  cramo: RamoSolicitud;
  /** Fecha de la solicitud (la de emisión); la vigencia va de esa fecha a un año. */
  fecha: Date;
  vigencia?: { desde: Date; hasta: Date };
  tomador: { nombre: string; tipoDoc: string; documento: string; correo: string; telefono: string; direccion: string };
  /** Índole y actividad del riesgo. */
  actividad: string;
  /** Ubicación del riesgo. */
  ubicacion: string;
  /** Moneda de la póliza: USD, EUR o Bs. */
  moneda: string;
  /** «Según cotización N° RCG-2026-000123-7KQ4» o «Según plan PLANI». */
  referencia: string;
  cnpoliza?: string;
  opcion?: string | null;
  /** Coberturas contratadas además de la básica (nombres del cotizador). */
  coberturas: string[];
  intermediario: { nombre: string; codigo: string };
  /** «Fechado en …» (sucursal). */
  ciudad: string;
  /** RCP / RCE: nómina anual y cantidad de trabajadores. */
  nomina?: number | null;
  trabajadores?: number | null;
  /** Contrato y coasegurado (RCG con contrato): van en Observaciones cuando la solicitud la tiene. */
  contrato?: string;
  coasegurado?: string;
}

export const unAnio = (d: Date) => new Date(d.getFullYear() + 1, d.getMonth(), d.getDate());

const SEGUN_COTIZACION = 'Según cotización';

const monedaSolicitud = (m: string) => {
  const t = m.trim().toUpperCase();
  return t === 'EUR' ? 'EUR' : t.startsWith('BS') || t === 'VES' ? 'Bs.' : 'USD';
};

const importe = (n: number, moneda: string) =>
  `${monedaSolicitud(moneda)} ${n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const n = (t: string) => normalizar(t).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

type Filtro = { tipo?: CampoFormulario['tipo']; etiqueta?: RegExp; rotulo?: RegExp; fila?: RegExp; antes?: RegExp; desde?: number };

function buscar(campos: CampoFormulario[], f: Filtro): CampoFormulario | undefined {
  return campos.find((c) => c.n >= (f.desde ?? 0) && (!f.tipo || c.tipo === f.tipo) && (!f.etiqueta || f.etiqueta.test(c.etiqueta))
    && (!f.rotulo || f.rotulo.test(c.rotulo)) && (!f.fila || f.fila.test(c.fila)) && (!f.antes || f.antes.test(c.antes)));
}

function exigir(campos: CampoFormulario[], f: Filtro, que: string): CampoFormulario {
  const c = buscar(campos, f);
  if (!c) throw new Error(`La plantilla de la solicitud no tiene el campo «${que}».`);
  return c;
}

/** Control de lista «Moneda» cuya fila contiene el rótulo. */
const monedaEn = (controles: ControlContenido[], fila: RegExp) => controles.find((c) => c.tipo === 'lista' && c.alias === 'Moneda' && fila.test(c.fila));

/** Filas de coberturas del RCG en la solicitud, por nombre del cotizador (el formato usa otros textos). */
const FILAS_RCG: [RegExp, RegExp][] = [
  [/riesgo de vecinos/, /^Responsabilidad Civil Riesgo de Vecinos/],
  [/riesgo locativo/, /^Responsabilidad Civil Riesgo Locativo/],
  [/agua/, /Daños Causados por Agua/],
  [/contratistas independientes/, /Contratistas Independientes/],
  [/vigilantes/, /Vigilantes Privados/],
  [/actividades sociales/, /Actividades Sociales/],
  [/alimentos/, /Suministro de Alimentos/],
  [/contaminacion/, /Contaminación Ambiental/],
  [/ascensores/, /Ascensores/],
  [/cruzada/, /Civil Cruzada/],
  [/vehiculos en predios/, /Vehículos en Predios Privados/],
  [/avisos/, /Avisos/],
  [/transporte/, /Transporte, Carga/],
  [/incendio/, /Incendio/],
  [/defensa penal/, /Defensa Penal/],
];

/** Primera fila de cobertura (casilla + límite + deducible) que corresponde al nombre; RCP/RCE por coincidencia de texto. */
function filaCobertura(campos: CampoFormulario[], nombre: string, rcg: boolean, desde: number): CampoFormulario[] | null {
  const clave = n(nombre);
  const casilla = campos.find((c) => {
    if (c.tipo !== 'casilla' || c.n < desde || !c.fila) return false;
    if (rcg) {
      const regla = FILAS_RCG.find(([nom]) => nom.test(clave));
      return !!regla && regla[1].test(c.fila);
    }
    const fila = n(c.fila);
    return fila.length > 3 && (clave.includes(fila) || fila.includes(clave));
  });
  return casilla ? campos.filter((c) => c.filaId === casilla.filaId) : null;
}

/** Relleno de la plantilla del ramo con los datos de la emisión. */
export function rellenoSolicitud(xml: string, d: DatosSolicitud): Relleno {
  const campos = camposDe(xml);
  const controles = controlesDe(xml);
  const textos: Record<number, string> = {};
  const casillas: number[] = [];
  const fechas: Record<number, Date> = {};
  const listas: Record<number, string> = {};
  const poner = (c: CampoFormulario | undefined, v: string | null | undefined) => { if (c && v != null && v.trim()) textos[c.n] = v.trim(); };
  const marcar = (c: CampoFormulario | undefined) => { if (c) casillas.push(c.n); };
  const moneda = monedaSolicitud(d.moneda);
  const t = d.tomador;
  const tipo = t.tipoDoc.trim().toUpperCase().charAt(0);
  const documento = t.documento ? `${tipo}-${t.documento.replace(/^[A-Za-z]-?/, '')}` : '';

  // Datos del seguro
  const vigencia = d.vigencia ?? { desde: d.fecha, hasta: unAnio(d.fecha) };
  const fechaEn = (fila: RegExp) => controles.find((c) => c.tipo === 'fecha' && fila.test(c.fila));
  const desde = fechaEn(/^Vigencia: Desde:$/);
  const hasta = fechaEn(/Hasta:$/);
  const solicitud = fechaEn(/Fecha de Solicitud:$/);
  if (desde) fechas[desde.n] = vigencia.desde;
  if (hasta) fechas[hasta.n] = vigencia.hasta;
  if (solicitud) fechas[solicitud.n] = d.fecha;

  // Tomador (la primera aparición de cada rótulo es la del tomador; luego vienen representante y propuesto asegurado)
  poner(exigir(campos, { tipo: 'texto', etiqueta: /Razón Social:$/ }, 'Razón social'), t.nombre);
  poner(exigir(campos, { tipo: 'texto', etiqueta: /^C\.I\. \/ Pasaporte \/ R\.I\.F\.:$/ }, 'C.I. / R.I.F.'), documento);
  if (tipo === 'V' || tipo === 'E') poner(buscar(campos, { tipo: 'texto', etiqueta: /^Nacionalidad:$/ }), tipo === 'V' ? 'Venezolana' : 'Extranjera');
  poner(exigir(campos, { tipo: 'texto', etiqueta: /^Domicilio Fiscal:$/ }, 'Domicilio fiscal'), t.direccion);
  poner(exigir(campos, { tipo: 'texto', etiqueta: /^Teléfono:$/ }, 'Teléfono'), t.telefono);
  poner(exigir(campos, { tipo: 'texto', etiqueta: /^Correo Electrónico:$/ }, 'Correo'), t.correo.toLowerCase());
  poner(buscar(campos, { tipo: 'texto', etiqueta: /Actividad Económica:$/ }), d.actividad);
  // En el cotizador el tomador es el asegurado: «Datos del Propuesto Asegurado» queda vacío («solo si es diferente»).
  marcar(buscar(campos, { tipo: 'casilla', etiqueta: /Asegurado Titular: Si$/ }));
  if (tipo === 'J' || tipo === 'G') {
    const publica = buscar(campos, { tipo: 'casilla', fila: /^Naturaleza de la Empresa:$/, rotulo: /^Pública/ });
    marcar(tipo === 'G' ? publica : buscar(campos, { tipo: 'casilla', rotulo: /^Privada/, desde: publica?.n ?? 0 }));
    poner(buscar(campos, { tipo: 'texto', etiqueta: /Objeto o razón social:$/ }), d.actividad);
  }

  // Coberturas
  const monedaCoberturas = monedaEn(controles, /Cobertura/);
  if (monedaCoberturas) listas[monedaCoberturas.n] = moneda;
  const rcg = d.cramo === 28;
  const inicioCoberturas = buscar(campos, { antes: /Coberturas Solicitadas/ })?.n ?? 0;
  if (rcg) {
    const basica = campos.filter((c) => /^Predio y Operaciones/.test(c.fila));
    basica.filter((c) => c.tipo === 'casilla').forEach(marcar);
    const [limite, deducible] = basica.filter((c) => c.tipo === 'texto');
    poner(limite, d.referencia);
    poner(deducible, SEGUN_COTIZACION);
  }
  const sinFila: string[] = [];
  for (const nombre of d.coberturas) {
    const fila = filaCobertura(campos, nombre, rcg, inicioCoberturas);
    if (!fila) { sinFila.push(nombre); continue; }
    fila.filter((c) => c.tipo === 'casilla').forEach(marcar);
    fila.filter((c) => c.tipo === 'texto').forEach((c) => poner(c, SEGUN_COTIZACION));
  }

  // RCP / RCE: riesgo, nómina y observaciones
  if (!rcg) {
    poner(buscar(campos, { tipo: 'texto', etiqueta: /^Naturaleza del trabajo/ }), d.actividad);
    poner(buscar(campos, { tipo: 'texto', etiqueta: /^Dirección del (local|Inmueble):$/i }), d.ubicacion);
    const monedaNomina = monedaEn(controles, /nómina anual/);
    if (monedaNomina) listas[monedaNomina.n] = moneda;
    if (d.nomina) poner(buscar(campos, { tipo: 'texto', etiqueta: /nómina anual/ }), importe(d.nomina, moneda).replace(/^\S+ /, ''));
    if (d.trabajadores) poner(buscar(campos, { tipo: 'texto', etiqueta: /^Cantidad total de trabajadores:$/ }), String(d.trabajadores));
  }
  const observaciones = [
    `${d.referencia}${d.opcion ? `, opción ${d.opcion}` : ''}.`,
    d.cnpoliza ? `Póliza N° ${d.cnpoliza}.` : '',
    d.contrato ? `Contrato: ${d.contrato}.` : '',
    d.coasegurado ? `Coasegurado: ${d.coasegurado}.` : '',
    sinFila.length ? `Coberturas adicionales: ${sinFila.join(', ')} (${SEGUN_COTIZACION.toLowerCase()}).` : '',
  ].filter(Boolean).join(' ');
  poner(buscar(campos, { tipo: 'texto', etiqueta: /^Observaciones:?$/ }), observaciones);

  // Intermediario: fila sin rótulos debajo de «Apellidos y Nombres · Código · Firma»
  const intermediario = buscar(campos, { tipo: 'texto', antes: /Intermediario Apellidos y Nombres Código Firma$/ });
  if (intermediario) {
    poner(intermediario, d.intermediario.nombre);
    poner(campos[intermediario.n + 1]?.tipo === 'texto' ? campos[intermediario.n + 1] : undefined, d.intermediario.codigo);
  }

  // Forma de pago: anual, en la moneda de la póliza (la forma concreta la elige quien paga)
  marcar(buscar(campos, { tipo: 'casilla', fila: /^Frecuencia de pago:/, rotulo: /^Anual/ }));
  const monedaPago = monedaEn(controles, /Forma de pago:/);
  if (monedaPago) listas[monedaPago.n] = moneda;

  // Declaración de fe y lugar
  const yo = buscar(campos, { tipo: 'texto', etiqueta: /^Yo,$/ });
  if (yo) {
    poner(yo, t.nombre);
    const yo2 = campos[yo.n + 1];
    const ci = campos[yo.n + 2];
    if (yo2?.tipo === 'texto' && /Yo,$/.test(yo2.etiqueta)) poner(yo2, t.nombre);
    if (ci?.tipo === 'texto' && /C\.I\./.test(ci.etiqueta)) poner(ci, documento);
  }
  poner(buscar(campos, { tipo: 'texto', etiqueta: /Fechado en$/ }), d.ciudad);

  return { textos, casillas: [...new Set(casillas)], fechas, listas, fechado: d.fecha };
}

/** word/document.xml de la plantilla ya lleno. */
export const llenarSolicitudXml = (xml: string, d: DatosSolicitud) => llenarXml(xml, rellenoSolicitud(xml, d));

export const nombreArchivoSolicitud = (d: Pick<DatosSolicitud, 'cramo' | 'cnpoliza' | 'referencia'>) => {
  const sigla = d.cramo === 28 ? 'RCG' : d.cramo === 27 ? 'RCP' : 'RCE';
  const ref = (d.cnpoliza || d.referencia.replace(/^Según (cotización N° |plan )/, '')).replace(/[^A-Za-z0-9-]+/g, '_');
  return `Solicitud_${sigla}_${ref}.docx`;
};
