import { describe, expect, it } from 'vitest';
import { armarEmisionCoberturas, cotizarCoberturas, parsearTarificador, parsearTasas } from './coberturas';

// Respuestas de nest-api QA (condominio/tarificador y tarificador/tasas) para el plan 38/2, 28-oct-2026.
const tarificador = { status: true, data: { cramo: 38, planes: [{ cplan: '2', xplan: 'Plan II 100.000 Combinado Residencial', suma_asegurada: 140000, coberturas: [
  { ccober: '1', ctarifa: '1', xcobertura: 'COMBINADO RESIDENCIAL (BÁSICA)', msumamax: 140000 },
  { ccober: '4', ctarifa: '1', xcobertura: 'DAÑOS POR AGUA', msumamax: 42000 },
  { ccober: '5', ctarifa: '1', xcobertura: 'ROBO, ASALTO Y ATRACO', msumamax: 24000 },
  { ccober: '16', ctarifa: '1', xcobertura: 'TERREMOTO', msumamax: 8000 },
  { ccober: '21', ctarifa: '1', xcobertura: 'RESPONSABILIDAD CIVIL GENERAL DE PREDIOS', msumamax: 40000 },
  { ccober: '22', ctarifa: '1', xcobertura: 'ROTURA DE VIDRIOS INTERNOS', msumamax: 9800 },
] }] } };
const tasas = { status: true, data: { cramo: 38, tasas: [
  ['1', 0.5], ['4', 0.3], ['5', 0.4], ['16', 0.5], ['21', 0.6], ['22', 0.7],
].map(([ccober, pprima]) => ({ ccober, ctarifa: '1', pprima, pcomision: 0 })) } };

describe('Cotización por coberturas (ramos 16 y 38)', () => {
  const plan = parsearTarificador(tarificador, '2')!;
  const t = parsearTasas(tasas);

  it('plan completo: prima = Σ suma × tasa / 100', () => {
    const c = cotizarCoberturas(plan, t, 140000, plan.coberturas.map((x) => x.ccober));
    expect(c.coberturas.map((x) => x.prima)).toEqual([700, 126, 96, 40, 240, 68.6]);
    expect([c.suma_asegurada, c.prima_total, c.sinTasa]).toEqual([140000, 1270.6, []]);
  });

  it('la básica siempre va y las demás escalan con su suma', () => {
    const c = cotizarCoberturas(plan, t, 70000, ['5']);
    expect(c.coberturas.map((x) => [x.ccober, x.suma_asegurada, x.prima])).toEqual([['1', 70000, 350], ['5', 12000, 48]]);
    expect(c.prima_total).toBe(398);
  });

  it('cobertura sin tasa vigente queda reportada', () => {
    const c = cotizarCoberturas(plan, t.filter((x) => x.ccober !== '22'), 140000, ['22']);
    expect(c.sinTasa).toEqual(['ROTURA DE VIDRIOS INTERNOS']);
  });

  it('body de condominio/emision con la cotización preestablecida', () => {
    const cot = cotizarCoberturas(plan, t, 140000, ['4']);
    const p = armarEmisionCoberturas({
      cramo: 38, cplan: '2', cot, tipoDoc: 'V', documento: '12.345.678', nombre: 'Juan', apellido: 'Pérez', correo: 'j@x.com',
      telefono: '0412-1234567', direccion: 'Caracas', bien: 'Apto 5-B', apartamento: 52, cproductor: 80080, fecha: new Date(2026, 9, 28),
    });
    expect([p.cramo, p.plan, p.frecuencia, p.fdesde, p.napartamento, p.rif_tomador, p.rif_asegurado]).toEqual([38, '2', 'A', '2026-10-28', 52, '12345678', '12345678']);
    expect(p.cotizacion).toEqual({
      suma_asegurada: 140000, prima_total: 826, descuento_pct: 0, recargo_pct: 0,
      coberturas: [
        { ccober: '1', ctarifa: '1', suma_asegurada: 140000, prima_bruta: 700, descuento: 0, recargo: 0, prima: 700, pcomision: 0, comision: 0 },
        { ccober: '4', ctarifa: '1', suma_asegurada: 42000, prima_bruta: 126, descuento: 0, recargo: 0, prima: 126, pcomision: 0, comision: 0 },
      ],
    });
  });
});
