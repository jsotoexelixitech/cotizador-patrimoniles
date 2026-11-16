// Envío de la cotización por correo: POST /api/v1/mail/send de nest-api (plantilla `branded` + PDF adjunto en base64).
// Lógica pura (sin fetch ni React) para poder probarla con vitest; el envío está en api/correo.ts.
import { CORREO_RE } from '../tarifas/comun';

/** Tope de nest-api (mail-attachments.ts): 8 MB en total ya decodificados; el body JSON admite 12 MB. */
export const MAX_ADJUNTO_BYTES = 8 * 1024 * 1024;

/** Mismos topes que SendTemplatedMailDto / BrandedMailFieldDto de nest-api. */
const MAX_TO_NAME = 120;
const MAX_LABEL = 80;
const MAX_VALUE = 250;
const MAX_FILENAME = 150;

export type CampoCorreo = { label: string; value: string };

export type DatosCorreoCotizacion = {
  correo: string;
  nombre: string;
  numero: string;
  producto: string;
  vigenciaDias?: number;
  pdf: Uint8Array;
  nombreArchivo: string;
  campos?: CampoCorreo[];
};

export type PayloadCorreo = {
  to: string;
  toName?: string;
  template: 'branded';
  data: { subject: string; eyebrow: string; title: string; intro: string; extraNote?: string; ctaLabel?: string; ctaUrl?: string };
  fields: CampoCorreo[];
  attachments: { filename: string; contentBase64: string; contentType: 'application/pdf' }[];
};

export function correoValido(correo: string): boolean {
  const t = correo.trim();
  return t.length <= 150 && CORREO_RE.test(t);
}

/** Base64 por bloques (btoa con un string enorme revienta la pila en PDFs de varios MB). */
export function aBase64(bytes: Uint8Array): string {
  let bin = '';
  const BLOQUE = 0x8000;
  for (let i = 0; i < bytes.length; i += BLOQUE) {
    bin += String.fromCharCode(...bytes.subarray(i, i + BLOQUE));
  }
  return btoa(bin);
}

export function tamanoLegible(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** null si el PDF cabe; si no, el mensaje para el usuario (no se manda un adjunto que nest-api rechazaría). */
export function errorTamanoPdf(bytes: number): string | null {
  if (bytes <= 0) return 'El PDF de la cotización salió vacío.';
  if (bytes > MAX_ADJUNTO_BYTES) {
    return `El PDF pesa ${tamanoLegible(bytes)} y el correo admite hasta ${tamanoLegible(MAX_ADJUNTO_BYTES)}. Descárgalo y envíalo por otro medio.`;
  }
  return null;
}

const corta = (t: string, max: number) => (t.length > max ? `${t.slice(0, max - 1)}…` : t);

export const asuntoCotizacion = (numero: string) => `La Mundial de Seguros | Cotización N.º ${numero}`;

export function introCotizacion(nombre: string, numero: string, producto: string, vigenciaDias?: number): string {
  const saludo = nombre.trim() ? `Estimado(a) ${nombre.trim()}:` : 'Estimado(a) cliente:';
  const validez = vigenciaDias && vigenciaDias > 0 ? ` Esta cotización tiene una validez de ${vigenciaDias} días continuos.` : '';
  return `${saludo} Adjuntamos la cotización N.º ${numero} de ${producto} solicitada a La Mundial de Seguros.${validez} Ante cualquier duda, puede comunicarse con su asesor de seguros.`;
}

/** Arma el body de POST /api/v1/mail/send; lanza Error con mensaje claro si el correo o el PDF no sirven. */
export function armarPayloadCorreo(d: DatosCorreoCotizacion): PayloadCorreo {
  const to = d.correo.trim().toLowerCase();
  if (!correoValido(to)) throw new Error('Indica un correo electrónico válido.');
  const errTam = errorTamanoPdf(d.pdf.length);
  if (errTam) throw new Error(errTam);
  const nombre = d.nombre.trim();
  const archivo = d.nombreArchivo.toLowerCase().endsWith('.pdf') ? d.nombreArchivo : `${d.nombreArchivo}.pdf`;
  const campos: CampoCorreo[] = [
    { label: 'Cotización', value: d.numero },
    { label: 'Producto', value: d.producto },
    ...(d.vigenciaDias && d.vigenciaDias > 0 ? [{ label: 'Validez', value: `${d.vigenciaDias} días continuos` }] : []),
    ...(d.campos ?? []),
  ]
    .filter((f) => f.label.trim() && f.value.trim())
    .map((f) => ({ label: corta(f.label.trim(), MAX_LABEL), value: corta(f.value.trim(), MAX_VALUE) }));
  return {
    to,
    ...(nombre ? { toName: corta(nombre, MAX_TO_NAME) } : {}),
    template: 'branded',
    data: {
      subject: asuntoCotizacion(d.numero),
      eyebrow: 'Cotización',
      title: 'Su cotización de La Mundial de Seguros',
      intro: introCotizacion(nombre, d.numero, d.producto, d.vigenciaDias),
      extraNote: 'Esta cotización no constituye emisión de póliza ni activación de cobertura.',
    },
    fields: campos,
    attachments: [{ filename: corta(archivo, MAX_FILENAME), contentBase64: aBase64(d.pdf), contentType: 'application/pdf' }],
  };
}

export type DatosCorreoPoliza = {
  correo: string;
  nombre: string;
  cnpoliza: string;
  cnrecibo?: string;
  producto: string;
  prima?: string;
  /** Enlace al PDF de la póliza (Sis2000); va como dato del correo. */
  urlpoliza?: string;
  /** PDF de la póliza (si se pudo descargar) y el condicionado con sus anexos. */
  adjuntos: { pdf: Uint8Array; nombreArchivo: string }[];
  /** Entre los adjuntos va la solicitud de seguro llena para firmar. */
  conSolicitud?: boolean;
};

export type AdjuntoPdf = { pdf: Uint8Array; nombreArchivo: string };

/**
 * Adjuntos que caben en el tope del correo. Si el total lo supera, la prioridad es: anexos (no tienen enlace), solicitud
 * para firmar, póliza (si queda fuera va el botón «Ver mi póliza») y recibo. En el correo van en orden póliza, recibo,
 * solicitud, anexos.
 */
export function adjuntosQueCaben(c: {
  poliza?: AdjuntoPdf | null; recibo?: AdjuntoPdf | null; anexos?: AdjuntoPdf | null; solicitud?: AdjuntoPdf | null;
}, max = MAX_ADJUNTO_BYTES): AdjuntoPdf[] {
  let total = 0;
  const cabe = (x?: AdjuntoPdf | null) => {
    if (!x || total + x.pdf.length > max) return null;
    total += x.pdf.length;
    return x;
  };
  const anexos = cabe(c.anexos);
  const solicitud = cabe(c.solicitud);
  const poliza = cabe(c.poliza);
  const recibo = cabe(c.recibo);
  return [poliza, recibo, solicitud, anexos].filter((x): x is AdjuntoPdf => !!x);
}

export const asuntoPoliza = (cnpoliza: string) => `La Mundial de Seguros | Póliza N.º ${cnpoliza}`;

/** Correo de la póliza emitida: datos de la póliza + condicionado y anexos (y la póliza si se pudo descargar) adjuntos. */
export function armarPayloadPoliza(d: DatosCorreoPoliza): PayloadCorreo {
  const to = d.correo.trim().toLowerCase();
  if (!correoValido(to)) throw new Error('Indica un correo electrónico válido.');
  if (!d.adjuntos.length && !d.urlpoliza) throw new Error('No hay póliza ni anexos para enviar.');
  const total = d.adjuntos.reduce((s, a) => s + a.pdf.length, 0);
  if (total > MAX_ADJUNTO_BYTES) {
    throw new Error(`Los adjuntos pesan ${tamanoLegible(total)} y el correo admite hasta ${tamanoLegible(MAX_ADJUNTO_BYTES)}. Descárgalos y envíalos por otro medio.`);
  }
  const nombre = d.nombre.trim();
  const saludo = nombre ? `Estimado(a) ${nombre}:` : 'Estimado(a) cliente:';
  const campos: CampoCorreo[] = [
    { label: 'Póliza', value: d.cnpoliza },
    { label: 'Producto', value: d.producto },
    ...(d.prima ? [{ label: 'Prima total', value: d.prima }] : []),
    ...(d.cnrecibo ? [{ label: 'Recibo', value: d.cnrecibo }] : []),
  ]
    .filter((f) => f.value.trim())
    .map((f) => ({ label: corta(f.label, MAX_LABEL), value: corta(f.value.trim(), MAX_VALUE) }));
  return {
    to,
    ...(nombre ? { toName: corta(nombre, MAX_TO_NAME) } : {}),
    template: 'branded',
    data: {
      subject: asuntoPoliza(d.cnpoliza),
      eyebrow: 'Póliza',
      title: 'Su póliza de La Mundial de Seguros',
      intro: `${saludo} Le enviamos su póliza N.º ${d.cnpoliza} de ${d.producto} con el condicionado general y particular y los anexos `
        + 'de las coberturas contratadas.'
        + (d.conSolicitud ? ' También le enviamos la solicitud de seguro llena con sus datos: solo falta su firma.' : '')
        + ' Ante cualquier duda, puede comunicarse con su asesor de seguros.',
      extraNote: 'Conserve este correo: el condicionado y los anexos forman parte integrante de su contrato de seguro.',
      // Botón de la plantilla branded (no el enlace suelto en la tabla de datos).
      ...(d.urlpoliza ? { ctaLabel: 'Ver mi póliza', ctaUrl: d.urlpoliza } : {}),
    },
    fields: campos,
    attachments: d.adjuntos.map((a) => ({
      filename: corta(a.nombreArchivo.toLowerCase().endsWith('.pdf') ? a.nombreArchivo : `${a.nombreArchivo}.pdf`, MAX_FILENAME),
      contentBase64: aBase64(a.pdf), contentType: 'application/pdf' as const,
    })),
  };
}

/** Traduce la respuesta de nest-api (HTTP 200 con success=false también es fallo) a un mensaje para el usuario. */
export function mensajeErrorCorreo(status: number, data: unknown): string | null {
  // nest-api envuelve las respuestas 2xx en { status: true, data: { success, sent, … } } (ResponseInterceptor).
  const crudo = (data && typeof data === 'object' ? data : {}) as { status?: unknown; data?: unknown };
  const sobre = crudo.status === true && crudo.data && typeof crudo.data === 'object' ? crudo.data : crudo;
  const o = sobre as { success?: unknown; sent?: unknown; mode?: unknown; error?: unknown; message?: unknown };
  const msg = Array.isArray(o.message) ? o.message.join(' ') : typeof o.message === 'string' ? o.message : '';
  if (status >= 200 && status < 300) {
    if (o.success === true || o.sent === true) return null;
    if (o.mode === 'disabled') return 'El envío de correos está desactivado en este ambiente de nest-api (MAIL_ENABLED=false).';
    return `nest-api no pudo enviar el correo${typeof o.error === 'string' && o.error ? `: ${o.error}` : '.'}`;
  }
  if (status === 0) return 'Sin conexión con nest-api.';
  if (status === 408) return 'nest-api tardó demasiado en responder y el envío se canceló. Revisa si el correo llegó antes de enviarlo de nuevo.';
  if (status === 403) return `La key del cotizador no tiene permiso para enviar correos${msg ? ` (${msg})` : ' (scope emissions:auto)'}.`;
  if (status === 413) return 'El PDF es demasiado grande para el correo. Descárgalo y envíalo por otro medio.';
  if (status === 404) return data === null ? 'Proxy sin configurar o envío de correo no disponible en este modo.' : 'Este nest-api no tiene la ruta de correo con adjuntos.';
  if (status === 400) return msg || 'nest-api rechazó los datos del correo.';
  return msg || `Error ${status} al enviar el correo.`;
}
