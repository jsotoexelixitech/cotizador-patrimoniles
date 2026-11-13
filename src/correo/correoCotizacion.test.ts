import { describe, expect, it } from 'vitest';
import {
  MAX_ADJUNTO_BYTES, aBase64, armarPayloadCorreo, asuntoCotizacion, correoValido, errorTamanoPdf, mensajeErrorCorreo,
} from './correoCotizacion';

const pdf = new TextEncoder().encode('%PDF-1.7 prueba');
const base = { correo: '  Cliente@Empresa.com ', nombre: 'Inversiones Prueba C.A.', numero: 'RCG-2026-P123456', producto: 'Responsabilidad Civil General', vigenciaDias: 30, pdf, nombreArchivo: 'Cotizacion_LaMundial_Prueba.pdf' };

describe('correo de la cotización', () => {
  it('valida el correo', () => {
    expect(correoValido('a@b.com')).toBe(true);
    expect(correoValido(' a.b+c@sub.dominio.ve ')).toBe(true);
    expect(correoValido('sin-arroba.com')).toBe(false);
    expect(correoValido('a@b')).toBe(false);
    expect(correoValido('')).toBe(false);
  });

  it('base64 igual al de Node, también en bloques grandes', () => {
    const grande = new Uint8Array(200_000).map((_, i) => i % 256);
    expect(aBase64(pdf)).toBe(Buffer.from(pdf).toString('base64'));
    expect(aBase64(grande)).toBe(Buffer.from(grande).toString('base64'));
  });

  it('arma el payload branded con el PDF adjunto', () => {
    const p = armarPayloadCorreo(base);
    expect(p.to).toBe('cliente@empresa.com');
    expect(p.toName).toBe('Inversiones Prueba C.A.');
    expect(p.template).toBe('branded');
    expect(p.data.subject).toBe(asuntoCotizacion('RCG-2026-P123456'));
    expect(p.data.subject).toBe('La Mundial de Seguros | Cotización N.º RCG-2026-P123456');
    expect(p.data.intro).toMatch(/^Estimado\(a\) Inversiones Prueba C\.A\.: Adjuntamos la cotización N\.º RCG-2026-P123456/);
    expect(p.data.intro).toContain('validez de 30 días continuos');
    expect(p.fields).toEqual([
      { label: 'Cotización', value: 'RCG-2026-P123456' },
      { label: 'Producto', value: 'Responsabilidad Civil General' },
      { label: 'Validez', value: '30 días continuos' },
    ]);
    expect(p.attachments).toEqual([{ filename: base.nombreArchivo, contentBase64: Buffer.from(pdf).toString('base64'), contentType: 'application/pdf' }]);
  });

  it('sin nombre ni vigencia: saludo genérico, sin toName ni campo Validez', () => {
    const p = armarPayloadCorreo({ ...base, nombre: ' ', vigenciaDias: undefined, nombreArchivo: 'cotizacion' });
    expect(p.toName).toBeUndefined();
    expect(p.data.intro.startsWith('Estimado(a) cliente:')).toBe(true);
    expect(p.data.intro).not.toContain('validez');
    expect(p.fields.map((f) => f.label)).toEqual(['Cotización', 'Producto']);
    expect(p.attachments[0].filename).toBe('cotizacion.pdf');
  });

  it('recorta a los topes del DTO de nest-api', () => {
    const p = armarPayloadCorreo({ ...base, nombre: 'x'.repeat(300), campos: [{ label: 'L'.repeat(100), value: 'v'.repeat(400) }] });
    expect(p.toName!.length).toBe(120);
    expect(p.fields[3].label.length).toBe(80);
    expect(p.fields[3].value.length).toBe(250);
  });

  it('rechaza correo inválido o PDF vacío / mayor al límite', () => {
    expect(() => armarPayloadCorreo({ ...base, correo: 'malo' })).toThrow(/correo electrónico válido/);
    expect(() => armarPayloadCorreo({ ...base, pdf: new Uint8Array() })).toThrow(/vacío/);
    expect(errorTamanoPdf(MAX_ADJUNTO_BYTES)).toBeNull();
    expect(errorTamanoPdf(MAX_ADJUNTO_BYTES + 1)).toMatch(/hasta 8\.0 MB/);
    expect(() => armarPayloadCorreo({ ...base, pdf: new Uint8Array(MAX_ADJUNTO_BYTES + 1) })).toThrow(/8\.0 MB/);
  });

  it('interpreta la respuesta de nest-api', () => {
    expect(mensajeErrorCorreo(200, { success: true, sent: true, mode: 'smtp' })).toBeNull();
    expect(mensajeErrorCorreo(200, { success: false, sent: false, mode: 'disabled' })).toMatch(/MAIL_ENABLED/);
    expect(mensajeErrorCorreo(200, { success: false, sent: false, mode: 'smtp', error: 'timeout' })).toMatch(/timeout/);
    expect(mensajeErrorCorreo(403, { message: 'Permiso requerido: emissions:auto.' })).toMatch(/emissions:auto/);
    expect(mensajeErrorCorreo(400, { message: ['to must be an email'] })).toBe('to must be an email');
    expect(mensajeErrorCorreo(413, null)).toMatch(/demasiado grande/);
    expect(mensajeErrorCorreo(404, null)).toMatch(/no disponible/);
    expect(mensajeErrorCorreo(0, null)).toMatch(/Sin conexión/);
  });
});
