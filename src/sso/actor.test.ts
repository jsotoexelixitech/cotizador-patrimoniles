import { describe, expect, it } from 'vitest';
import { actorDeMetadata, aplicarSesionACotizacion, aplicarSesionAEmision, creadorDe, nombreActor, productorDe, sesionDeActor } from './actor';

const actor = actorDeMetadata({ cusuario: 'U77', cproductor: 1051, crol: '3', email: 'x@y.z', xusuario: 'JUAN' }, 7, 40);

describe('SSO · actor y productor', () => {
  it('metadata del token → actor; productor inválido o ausente cae al de la web', () => {
    expect(actor).toMatchObject({ cusuario: 'U77', cproductor: 1051, crol: '3', nombre: 'JUAN', login: null });
    expect(actorDeMetadata({ cproductor: '0' }, 1, 1).cproductor).toBeNull();
    expect(actorDeMetadata({ cproductor: '12a' }, 1, 1).cproductor).toBeNull();
    expect(productorDe(actorDeMetadata({ cusuario: '9' }, 1, 1), 80080)).toBe(80080);
    expect(productorDe(null, 80080)).toBe(80080);
    expect(sesionDeActor(actor, 80080)).toEqual({ modo: 'intermediario', productor: 1051, actor });
    expect(sesionDeActor(null, 80080)).toEqual({ modo: 'web', productor: 80080, actor: null });
  });

  it('nombre a mostrar y creador sin datos de empresa', () => {
    expect(nombreActor(actor)).toBe('JUAN');
    expect(nombreActor({ nombre: null, login: null, cusuario: '5' })).toBe('usuario 5');
    expect(creadorDe(actor)).toEqual({ modo: 'intermediario', cusuario: 'U77', cproductor: 1051, crol: '3', email: 'x@y.z', nombre: 'JUAN', login: null, canal: null });
    expect(creadorDe(null)).toBeNull();
  });

  it('cotización: reemplaza creador y productor del navegador; cusuario no numérico va como texto', () => {
    const r = aplicarSesionACotizacion({ producto: 'rcg', datos: { emisiones: { I: { cramo: 28, productor: 1 } } } }, actor, 80080) as {
      creador: unknown; datos: { emisiones: { I: unknown } };
    };
    expect(r.creador).toMatchObject({ cproductor: 1051 });
    expect(r.datos.emisiones.I).toEqual({ cramo: 28, productor: 1051, cusuario: 'U77' });
    // Sin emisiones (cotización sin pago en línea): solo el creador.
    expect(aplicarSesionACotizacion({ producto: 'rcg', creador: { x: 1 }, datos: {} }, null, 80080)).toEqual({ producto: 'rcg', datos: {} });
  });

  it('emisión directa: con sesión siempre el productor del token; sin sesión el web salvo Pastora', () => {
    expect(aplicarSesionAEmision({ cramo: 25, productor: 7 }, actor, 80080, 'productor')).toMatchObject({ productor: 1051 });
    expect(aplicarSesionAEmision({ cramo: 25, productor: 7 }, null, 80080, 'productor')).toBeNull();
    expect(aplicarSesionAEmision({ cramo: 16, productor: 7, cusuario: 3 }, null, 80080, 'productor')).toEqual({ cramo: 16, productor: 80080 });
    expect(aplicarSesionAEmision({ keys: { cramo: 25 }, cproductor: 7 }, null, 80080, 'cproductor')).toBeNull();
    expect(aplicarSesionAEmision('x', actor, 80080, 'productor')).toBeNull();
  });
});
