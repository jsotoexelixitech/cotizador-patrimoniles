// Carga las plantillas empaquetadas por Vite y arma la solicitud llena en Word (.docx, el formato aprobado) y en PDF.
import { camposDe, controlesDe, documentoXml, llenarDocx } from './docx';
import { generarSolicitudPdf, type Posiciones } from './pdf';
import { nombreArchivoSolicitud, rellenoSolicitud, type DatosSolicitud, type RamoSolicitud } from './solicitudes';

const SIGLA: Record<RamoSolicitud, 'rcg' | 'rcp' | 'rce'> = { 28: 'rcg', 27: 'rcp', 37: 'rce' };

interface Plantilla { docx: Uint8Array; pdf: Uint8Array; posiciones: Posiciones }

const cache = new Map<RamoSolicitud, Promise<Plantilla>>();

async function bytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo cargar la plantilla de la solicitud (HTTP ${res.status}).`);
  return new Uint8Array(await res.arrayBuffer());
}

const URLS: Record<'rcg' | 'rcp' | 'rce', () => Promise<[{ default: string }, { default: string }, { default: Posiciones }]>> = {
  rcg: () => Promise.all([import('./plantillas/solicitud-rcg.docx?url'), import('./plantillas/solicitud-rcg.pdf?url'), import('./plantillas/solicitud-rcg.posiciones.json')]),
  rcp: () => Promise.all([import('./plantillas/solicitud-rcp.docx?url'), import('./plantillas/solicitud-rcp.pdf?url'), import('./plantillas/solicitud-rcp.posiciones.json')]),
  rce: () => Promise.all([import('./plantillas/solicitud-rce.docx?url'), import('./plantillas/solicitud-rce.pdf?url'), import('./plantillas/solicitud-rce.posiciones.json')]),
};

function plantilla(cramo: RamoSolicitud): Promise<Plantilla> {
  let p = cache.get(cramo);
  if (!p) {
    p = URLS[SIGLA[cramo]]().then(async ([docx, pdf, pos]) => ({ docx: await bytes(docx.default), pdf: await bytes(pdf.default), posiciones: pos.default }));
    p.catch(() => cache.delete(cramo));
    cache.set(cramo, p);
  }
  return p;
}

export interface SolicitudGenerada { nombreDocx: string; nombrePdf: string; docx: Uint8Array; pdf: Uint8Array }

export async function generarSolicitud(d: DatosSolicitud): Promise<SolicitudGenerada> {
  const t = await plantilla(d.cramo);
  const xml = documentoXml(t.docx);
  const relleno = rellenoSolicitud(xml, d);
  const disenos = { campos: camposDe(xml).map((c) => c.diseno), controles: controlesDe(xml).map((c) => c.diseno) };
  const nombreDocx = nombreArchivoSolicitud(d);
  return {
    nombreDocx, nombrePdf: nombreDocx.replace(/\.docx$/, '.pdf'),
    docx: llenarDocx(t.docx, relleno),
    pdf: await generarSolicitudPdf(t.pdf, t.posiciones, relleno, disenos),
  };
}

export const TIPO_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function descargar(bytesArchivo: Uint8Array, nombre: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([bytesArchivo as BlobPart], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
