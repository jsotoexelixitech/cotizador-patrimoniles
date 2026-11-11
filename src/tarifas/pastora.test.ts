import { describe, expect, it } from 'vitest';
import {
  armarPayloadPastora, FORM_INICIAL, kgIniciales, mensajeErrorPastora, numero, parsearResultadoPastora, planDePlazo,
  plazoDePlan, sumaAsegurada, validarPastora, type FormPastora,
} from './pastora';

// Payload que emitió en QA el 4-nov (póliza 25-1-1100018948), copia de pastora.json.
const PASTORA_JSON = {
  cramo: 25,
  cplan: 'PAS06',
  coberturas: [{ ccober: '901' }, { ccober: '902' }, { ccober: '903' }],
  calculo: { unidades: 20000, valor_unidad: 2.5 },
  biomasa: {
    cantidad_animales: 100,
    peso_promedio: 200,
    fecha_inicio: '2026-11-10',
    horizonte_meses: 6,
    lote: 'LT-2026-0101',
    ihl: '0,92',
  },
  tomador: {
    tipo_cedula: 'J',
    rif: '123456789',
    nombre: 'AGROPECUARIA PRUEBA C.A.',
    apellido: '',
    direccion: 'Carretera Nacional, Sector El Tigre, Anzoategui',
    telefono: '04121234567',
    correo: 'javieruzcateguisoto@gmail.com',
  },
  bien: 'Lote ganadero de engorde - 100 animales',
  direccion_riesgo: 'Finca La Esperanza, El Tigre, Anzoategui',
  productor: 80080,
};

const EJEMPLO: FormPastora = {
  ...FORM_INICIAL,
  cplan: 'PAS06', horizonte_meses: 6, transporte: false,
  cantidad_animales: '100', peso_promedio: '200', fecha_inicio: '2026-11-10', lote: ' LT-2026-0101 ', ihl: '0,92',
  precio_kg: '2,5',
  tipo_cedula: 'J', rif: '123456789', nombre: 'AGROPECUARIA PRUEBA C.A.', apellido: 'ignorado en J',
  direccion: 'Carretera Nacional, Sector El Tigre, Anzoategui', telefono: '0412-123 4567', correo: 'javieruzcateguisoto@gmail.com',
  bien: 'Lote ganadero de engorde - 100 animales', direccion_riesgo: 'Finca La Esperanza, El Tigre, Anzoategui', productor: '80080',
};

describe('Pastora: payload de emisión', () => {
  it('con los datos de ejemplo es igual al pastora.json que emitió en QA', () => {
    expect(validarPastora(EJEMPLO)).toEqual({});
    expect(armarPayloadPastora(EJEMPLO)).toEqual(PASTORA_JSON);
  });

  it('904 Transporte solo si se marca; 901–903 siempre', () => {
    expect(armarPayloadPastora({ ...EJEMPLO, transporte: true }).coberturas.map((c) => c.ccober)).toEqual(['901', '902', '903', '904']);
  });

  it('persona natural conserva el apellido', () => {
    expect(armarPayloadPastora({ ...EJEMPLO, tipo_cedula: 'V', apellido: ' Pérez ' }).tomador.apellido).toBe('Pérez');
  });

  it('SA0 = kg iniciales × precio por kg', () => {
    expect(kgIniciales(EJEMPLO)).toBe(20000);
    expect(sumaAsegurada(EJEMPLO)).toBe(50000);
    expect(kgIniciales({ cantidad_animales: '3', peso_promedio: '200,3333' })).toBe(600.9999);
    expect(sumaAsegurada({ ...EJEMPLO, precio_kg: '' })).toBeNull();
  });

  it('plazo ↔ plan', () => {
    expect([6, 12, 18, 24].map(planDePlazo)).toEqual(['PAS06', 'PAS12', 'PAS18', 'PAS24']);
    expect(planDePlazo(3)).toBeNull();
    expect(plazoDePlan('PAS18')).toBe(18);
  });

  it('numero acepta coma decimal y miles con punto', () => {
    expect(numero('2,5')).toBe(2.5);
    expect(numero('1.234,5')).toBe(1234.5);
    expect(numero('abc')).toBeNaN();
  });
});

describe('Pastora: validación del front', () => {
  const err = (cambio: Partial<FormPastora>) => validarPastora({ ...EJEMPLO, ...cambio });

  it('RIF solo números y hasta 9 dígitos', () => {
    expect(err({ rif: '1234567890' }).rif).toBeTruthy();
    expect(err({ rif: 'J12345' }).rif).toBeTruthy();
  });

  it('lote obligatorio, sin punto y coma, ≤30', () => {
    expect(err({ lote: '  ' }).lote).toMatch(/obligatorio/);
    expect(err({ lote: 'A;B' }).lote).toBeTruthy();
    expect(err({ lote: 'X'.repeat(31) }).lote).toBeTruthy();
  });

  it('dirección del riesgo, correo, IHL y apellido de persona natural', () => {
    expect(err({ direccion_riesgo: '' }).direccion_riesgo).toBeTruthy();
    expect(err({ correo: 'sin-arroba' }).correo).toBeTruthy();
    expect(err({ ihl: '' }).ihl).toBeTruthy();
    expect(err({ tipo_cedula: 'V', apellido: '' }).apellido).toBeTruthy();
    expect(err({ tipo_cedula: 'J', apellido: '' }).apellido).toBeUndefined();
  });

  it('peso promedio entre 180 y 350 kg; animales enteros; precio con 2 decimales', () => {
    expect(err({ peso_promedio: '150' }).peso_promedio).toBeTruthy();
    expect(err({ peso_promedio: '351' }).peso_promedio).toBeTruthy();
    expect(err({ cantidad_animales: '10,5' }).cantidad_animales).toBeTruthy();
    expect(err({ precio_kg: '2,555' }).precio_kg).toBeTruthy();
  });

  it('plan y plazo deben corresponder', () => {
    expect(err({ cplan: 'PAS12', horizonte_meses: 6 }).cplan).toBeTruthy();
    expect(err({ cplan: 'PAS12', horizonte_meses: 12 }).cplan).toBeUndefined();
  });
});

describe('Pastora: respuesta de nest-api', () => {
  it('emisión: póliza, recibo, prima y suma desde la cotización', () => {
    const r = parsearResultadoPastora({ status: true, data: {
      message: 'Emisión registrada exitosamente.', cnpoliza: '25-1-1100018948', cnrecibo: '25-100375567', urlpoliza: 'https://x/p.pdf',
      cotizacion: { suma_asegurada: 50000, prima_total: 2499.99, coberturas: [{ ccober: '901', xcobertura: 'DEFICIT', suma_asegurada: 50000, prima: 1000 }] },
    } });
    expect(r).toMatchObject({ cnpoliza: '25-1-1100018948', cnrecibo: '25-100375567', prima: 2499.99, suma: 50000, avisoLote: null });
    expect(r.coberturas[0]).toEqual({ ccober: '901', nombre: 'DEFICIT', suma: 50000, prima: 1000 });
  });

  it('cotización plana con aviso de lote', () => {
    const r = parsearResultadoPastora({ status: true, data: { suma_asegurada: 50000, prima_total: 10, coberturas: [], aviso_lote: 'El lote X ya está asegurado' } });
    expect(r).toMatchObject({ cnpoliza: null, prima: 10, avisoLote: 'El lote X ya está asegurado' });
  });

  it('errores: mensaje de nest-api tal cual o uno por status', () => {
    expect(mensajeErrorPastora(409, { statusCode: 409, message: 'El lote LT-1 ya está asegurado en la póliza vigente 25-1-1.' })).toMatch(/ya está asegurado/);
    expect(mensajeErrorPastora(400, { message: ['rif must not be empty', 'bien should not be empty'] })).toBe('rif must not be empty; bien should not be empty');
    expect(mensajeErrorPastora(403, { message: 'Permiso requerido: emissions:riesgos-generales' })).toMatch(/Permiso/);
    expect(mensajeErrorPastora(502, null)).toMatch(/no respondieron/);
    expect(mensajeErrorPastora(404, { message: 'Cannot POST /v1/x' })).toMatch(/NEST_API_URL/);
  });
});
