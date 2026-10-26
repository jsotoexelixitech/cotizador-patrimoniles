import { useState, type ReactNode } from 'react';
import { Calculator, Check, ListChecks, ShieldCheck, Stamp } from 'lucide-react';
import { SectionCard } from '../components/ui/SectionCard';
import { Field, Input, Select } from '../components/ui/FormField';
import { StepActions } from '../components/ui/StepActions';
import { Aviso } from '../components/ui/Aviso';
import { Badge } from '../components/ui/Badge';
import { cn } from '../lib/utils';
import { importe, porcentaje } from '../tarifas/comun';
import { MONEDAS_RCG, RCG_CLASES, RCG_CONDICIONES, type MonedaRcg } from '../tarifas/rcg';
import { COBERTURAS_BASICAS, NOMBRES, TARIFA, type IdOpcion } from '../tarifas/rcp-rce';
import { useCotizacionRc, useCotizacionRcg, useCotizacionStore, type K } from '../store/cotizacionStore';
import { toast } from '../store/toastStore';

export function CotizacionStep() {
  const producto = useCotizacionStore((s) => s.producto);
  return producto === 'rc' ? <CotizacionRc /> : <CotizacionRcg />;
}

/** Tarjeta de opción seleccionable, mismo patrón que las tarjetas de plan de RCV. */
function TarjetaOpcion({ titulo, activa, onClick, prima, children, etiqueta }: {
  titulo: string; activa: boolean; onClick: () => void; prima: string; children?: ReactNode; etiqueta?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'text-left rounded-2xl border p-4 transition-all',
        activa ? 'border-indigo-400 bg-indigo-50/60 ring-2 ring-indigo-200' : 'border-slate-200 bg-white hover:border-indigo-200',
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="font-display font-bold text-slate-900">{titulo}</p>
        {activa && (
          <span className="w-6 h-6 rounded-full bg-indigo-600 text-white grid place-items-center">
            <Check size={12} strokeWidth={3} />
          </span>
        )}
      </div>
      <p className="font-display text-2xl font-black gradient-text-indigo tabular-nums">{prima}</p>
      {etiqueta && <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-400 mt-1">{etiqueta}</p>}
      {children && <div className="text-[0.78rem] text-slate-500 mt-2 leading-relaxed space-y-0.5">{children}</div>}
    </button>
  );
}

function Casilla({ checked, onChange, children, detalle }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; detalle?: string }) {
  return (
    <label className={cn(
      'flex items-start gap-3 rounded-xl border px-3.5 py-3 cursor-pointer transition-all',
      checked ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-200 bg-white hover:border-slate-300',
    )}>
      <input type="checkbox" className="mt-0.5 w-4 h-4 accent-indigo-600" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="text-sm text-slate-700">
        {children}
        {detalle && <span className="block text-[0.72rem] text-slate-500 mt-0.5">{detalle}</span>}
      </span>
    </label>
  );
}

function CotizacionRcg() {
  const rcg = useCotizacionStore((s) => s.rcg);
  const esContrato = useCotizacionStore((s) => s.contrato.esContrato);
  const setRcg = useCotizacionStore((s) => s.setRcg);
  const cot = useCotizacionRcg();
  const [intento, setIntento] = useState(false);
  const clase = RCG_CLASES[rcg.clase];
  const m = (n: number) => `${rcg.moneda} ${importe(n)}`;
  const opcionValida = cot.alternativas.some((a) => a.opcion === rcg.opcion);

  return (
    <div className="space-y-5">
      <SectionCard title="Límite y tasa" description={`Clase: ${clase.etiqueta}`} Icon={Calculator}>
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Moneda">
            <Select value={rcg.moneda} onChange={(e) => setRcg({ moneda: e.target.value as MonedaRcg })}>
              {MONEDAS_RCG.map((x) => <option key={x} value={x}>{x}</option>)}
            </Select>
          </Field>
          <Field label="Límite de responsabilidad" hint="Entre 5.000 y 1.000.000 (opción I)." error={intento || rcg.limite ? cot.errores.limite : undefined}>
            <Input type="number" min={5000} max={1000000} step="0.01" value={rcg.limite} onChange={(e) => setRcg({ limite: e.target.value })} placeholder="Ej. 50000" />
          </Field>
          <Field label="Tasa básica (%)" hint={`Rango: ${clase.min.toFixed(2)} % – ${clase.max.toFixed(2)} %`} error={cot.errores.tasa}>
            <Input type="number" min={clase.min} max={clase.max} step="0.01" value={rcg.tasa} onChange={(e) => setRcg({ tasa: e.target.value })} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Elige la opción" description="Opciones I, II y III: límite ×1, ×2 y ×3 (tope 1.000.000)." Icon={ShieldCheck}>
        {cot.alternativas.length === 0 ? (
          <p className="text-sm text-slate-500">Ingresa un límite y una tasa válidos para ver las primas.</p>
        ) : (
          <div className="grid sm:grid-cols-3 gap-3">
            {cot.alternativas.map((a) => (
              <TarjetaOpcion key={a.opcion} titulo={`Opción ${a.opcion}`} activa={rcg.opcion === a.opcion} onClick={() => setRcg({ opcion: a.opcion })}
                prima={m(a.prima)} etiqueta={a.primaMinimaAplicada ? 'Prima mínima aplicada' : 'Prima neta'}>
                <p>Límite: <strong className="text-slate-700">{m(a.limite)}</strong></p>
              </TarjetaOpcion>
            ))}
          </div>
        )}
      </SectionCard>

      {cot.alternativas.length > 0 && (
        <SectionCard title={`Coberturas ${esContrato ? 'con contrato (7)' : 'sin contrato (13)'}`} description="Sublímite del 30 % con tope en las coberturas marcadas." Icon={ListChecks}>
          <TablaCoberturas cot={cot} />
          <p className="text-[0.72rem] text-slate-500 mt-3"><strong>Deducible:</strong> {cot.deducible}</p>
          {cot.notaIgtf && <p className="text-[0.72rem] text-slate-500 mt-1">La cotización no incluye el 3 % del IGTF; tómelo en cuenta al pagar la prima.</p>}
        </SectionCard>
      )}

      <SectionCard title="Condiciones especiales" description={esContrato ? 'Selecciona las que correspondan al contrato.' : 'Las condiciones adicionales solo se habilitan con contrato.'} Icon={Stamp}>
        <div className="space-y-2">
          {esContrato && RCG_CONDICIONES.slice(0, 4).map((c, i) => (
            <Casilla key={c} checked={rcg.condiciones.includes(i)}
              onChange={(v) => setRcg({ condiciones: v ? [...rcg.condiciones, i] : rcg.condiciones.filter((x) => x !== i) })}>{c}</Casilla>
          ))}
          <div className="flex items-start gap-2 text-[0.78rem] text-slate-600 bg-slate-50 rounded-xl px-3.5 py-3 border border-slate-200">
            <Badge tone="indigo">Siempre</Badge><span>{RCG_CONDICIONES[4]}</span>
          </div>
        </div>
      </SectionCard>

      <StepActions continueLabel="Ver resumen" onContinue={() => {
        setIntento(true);
        const e = cot.errores.limite ?? cot.errores.tasa;
        if (e) { toast.error('Revisa la cotización', e); return false; }
        if (!opcionValida) setRcg({ opcion: 'I' });
        return true;
      }} />
    </div>
  );
}

export function TablaCoberturas({ cot }: { cot: ReturnType<typeof useCotizacionRcg> }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-[0.78rem]">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="text-left font-bold px-3 py-2">Cobertura</th>
            {cot.alternativas.map((a) => <th key={a.opcion} className="text-right font-bold px-3 py-2">Opción {a.opcion}</th>)}
          </tr>
        </thead>
        <tbody>
          {cot.coberturas.map((c) => (
            <tr key={c.nombre} className="border-t border-slate-100">
              <td className="px-3 py-1.5 text-slate-700">{c.nombre}</td>
              {c.montos.map((x, i) => <td key={i} className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{importe(x)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const ADICIONALES: Record<K, { nombre: string; porEmpleado: string }[]> = {
  p: [
    { nombre: 'Gastos por asistencia médica, quirúrgica y farmacéutica', porEmpleado: 'Por empleado: I 15 · II 30 · III 75' },
    { nombre: 'Hernia', porEmpleado: 'Por empleado: I 7,50 · II 15 · III 37,50' },
  ],
  e: [
    { nombre: 'Negligencia del Empleador', porEmpleado: 'Por empleado: I 2 · II 4 · III 10' },
    { nombre: 'Asistencia Legal y Defensa Penal', porEmpleado: 'Por empleado: I 3 · II 6 · III 15' },
    { nombre: 'Gastos Médicos', porEmpleado: 'Por empleado: I 6 · II 10 · III 20' },
  ],
};

function CotizacionRc() {
  const rc = useCotizacionStore((s) => s.rc);
  const setRcProducto = useCotizacionStore((s) => s.setRcProducto);
  const cot = useCotizacionRc();
  const [intento, setIntento] = useState(false);
  const ves = rc.moneda === 'VES';
  const m = (n: number) => `${cot.simbolo} ${importe(n)}`;
  const sinErrores = cot.errores.length === 0;

  return (
    <div className="space-y-5">
      {cot.resultados.map((r) => {
        const x = rc[r.k];
        return (
          <SectionCard key={r.k} title={NOMBRES[r.k]} Icon={r.k === 'p' ? ShieldCheck : Calculator}
            description={r.riesgo ? `${r.k === 'p' ? 'Clase' : 'Actividad'}: ${r.riesgo[0]} · rango ${porcentaje(r.riesgo[1])} – ${porcentaje(r.riesgo[2])}` : 'Clasificación pendiente'}>
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Tasa básica (%)">
                  <Input type="number" step="any" value={x.tasa} onChange={(e) => setRcProducto(r.k, { tasa: e.target.value })} />
                </Field>
                <Field label="Ajuste: descuento (−) o recargo (+) %" hint="Relativo, máximo ±10 %. El descuento requiere validación técnica.">
                  <Input type="number" min={-10} max={10} step="0.01" value={x.ajuste} onChange={(e) => setRcProducto(r.k, { ajuste: e.target.value })} />
                </Field>
              </div>

              <p className="text-[0.72rem] text-slate-500">
                <strong>Coberturas básicas:</strong> {[...COBERTURAS_BASICAS, r.k === 'p' ? 'Gastos de entierro' : 'Secuelas o deformidades permanentes'].join(' · ')}.
              </p>

              <div>
                <p className="text-[0.78rem] font-bold text-slate-600 tracking-wide mb-2">Coberturas adicionales</p>
                <div className="grid sm:grid-cols-2 gap-2">
                  {!ves
                    ? ADICIONALES[r.k].map((a, i) => (
                        <Casilla key={a.nombre} checked={x.adicionales[i]} detalle={a.porEmpleado}
                          onChange={(v) => setRcProducto(r.k, { adicionales: x.adicionales.map((y, j) => (j === i ? v : y)) })}>{a.nombre}</Casilla>
                      ))
                    : TARIFA[r.k].options.map((o, i) => {
                        const op = x.opcionalesVes[i];
                        const cambiar = (c: Partial<typeof op>) => setRcProducto(r.k, { opcionalesVes: x.opcionalesVes.map((v, j) => (j === i ? { ...v, ...c } : v)) });
                        const restringida = /Negligencia|Defensa Penal/i.test(o[0]);
                        const medica = /m[eé]dic/i.test(o[0]);
                        return (
                          <div key={o[0]} className="space-y-2">
                            <Casilla checked={op.seleccionada} onChange={(v) => cambiar({ seleccionada: v })} detalle={`Tasa ${o[1]} % – ${o[2]} %`}>{o[0]}</Casilla>
                            {op.seleccionada && (
                              <div className="grid grid-cols-2 gap-2 pl-2">
                                <Field label="Tasa (%)">
                                  <Input type="number" step="any" value={r.k === 'e' ? String(o[1]) : op.tasa} readOnly={r.k === 'e'} onChange={(e) => cambiar({ tasa: e.target.value })} />
                                </Field>
                                {!restringida && (medica ? (
                                  <Field label="Límite por trabajador">
                                    <Select value={op.limite} onChange={(e) => cambiar({ limite: e.target.value })}>
                                      <option value="1000">1.000</option><option value="1500">1.500</option><option value="2000">2.000</option><option value="tech">Mayor a 2.000 · Área técnica</option>
                                    </Select>
                                  </Field>
                                ) : (
                                  <Field label="Límite por trabajador">
                                    <Input type="number" value={op.limite} onChange={(e) => cambiar({ limite: e.target.value })} />
                                  </Field>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                </div>
              </div>

              {r.opciones ? (
                <div className="grid sm:grid-cols-3 gap-3">
                  {r.opciones.map((o) => (
                    <TarjetaOpcion key={o.id} titulo={`Opción ${o.id}`} activa={x.opcion === o.id}
                      onClick={() => setRcProducto(r.k, { opcion: o.id as IdOpcion })}
                      prima={sinErrores ? m(o.prima) : '—'} etiqueta={o.ajusteMinimo > 0 ? 'Prima mínima aplicada' : 'Prima neta'}>
                      <p>Por trabajador: <strong className="text-slate-700">{importe(o.limites[0])}</strong></p>
                      <p>Dos o más / evento: <strong className="text-slate-700">{importe(o.limites[1])}</strong></p>
                      {o.primaOpcionales > 0 && <p>Adicionales: {importe(o.primaOpcionales)}</p>}
                    </TarjetaOpcion>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4 grid sm:grid-cols-4 gap-3 text-[0.78rem]">
                  <div><p className="text-slate-500">Por trabajador</p><p className="font-bold tabular-nums">{m(r.limites[0])}</p></div>
                  <div><p className="text-slate-500">Dos o más</p><p className="font-bold tabular-nums">{m(r.limites[1])}</p></div>
                  <div><p className="text-slate-500">Evento / año</p><p className="font-bold tabular-nums">{m(r.limites[2])}</p></div>
                  <div><p className="text-slate-500">Prima</p><p className="font-display text-lg font-black gradient-text-indigo tabular-nums">{sinErrores ? m(r.prima) : '—'}</p></div>
                  {r.nota && <p className="sm:col-span-4 text-slate-500">{r.nota}</p>}
                </div>
              )}
            </div>
          </SectionCard>
        );
      })}

      <TotalRc total={sinErrores ? m(cot.total) : '—'} detalle={cot.resultados.map((r) => `${r.k === 'p' ? 'Patronal' : 'Empresarial'}${r.opcion ? ` · Opción ${r.opcion}` : ''}`).join('  +  ')} />

      {cot.avisos.map((a) => <Aviso key={a}>{a}</Aviso>)}
      {intento && cot.erroresPorPaso.cotizacion.map((a) => <Aviso key={a} tono="error">{a}</Aviso>)}

      <StepActions continueLabel="Ver resumen" onContinue={() => {
        setIntento(true);
        if (cot.errores.length) { toast.error('Revisa la cotización', cot.errores[0]); return false; }
        return true;
      }} />
    </div>
  );
}

export function TotalRc({ total, detalle }: { total: string; detalle: string }) {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-indigo-700 to-indigo-500 text-white px-5 py-4 flex items-center justify-between gap-4 flex-wrap shadow-[0_12px_32px_-12px_rgba(15,26,90,0.45)]">
      <div>
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-indigo-100">Prima total</p>
        <p className="text-[0.78rem] text-indigo-100/90">{detalle}</p>
      </div>
      <p className="font-display text-3xl font-black tabular-nums">{total}</p>
    </div>
  );
}
