import { useEffect, useState, type ReactNode } from 'react';
import { Calculator, Check, ListChecks, Loader2, RefreshCw, Scale, ShieldCheck, Stamp } from 'lucide-react';
import { SectionCard } from '../components/ui/SectionCard';
import { Field, Input, Select } from '../components/ui/FormField';
import { StepActions } from '../components/ui/StepActions';
import { Aviso } from '../components/ui/Aviso';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { cn } from '../lib/utils';
import { importe, numeroONulo, porcentaje } from '../tarifas/comun';
import { descripcionOpcionesRcg, errorSumaRcg, MONEDAS_RCG, type MonedaRcg } from '../tarifas/rcg';
import {
  COBERTURAS_BASICAS, NOMBRES, OPCIONES, opcionalesDe, sumaDeseadaMaxima, validarSumaDeseada, type IdOpcion, type ParametrosRc,
} from '../tarifas/rcp-rce';
import { useParametrosStore } from '../store/parametrosStore';
import { useCotizacionPlanesRcg, useCotizacionRc, useCotizacionRcg, useCotizacionStore, useMesaTecnica, type K } from '../store/cotizacionStore';
import { usePlanesStore } from '../store/planesStore';
import { RAMO_RCG, primasTarifaRcg } from '../tarifas/planes-rcg';
import { sumaDe } from '../tarifas/coberturas';
import { esRamoCoberturas, useCotizacionCoberturas } from '../store/coberturasHook';
import { useCotizacionCombo, useNombreRamo } from '../store/comboHook';
import { coberturasOtraMoneda, coberturasSinTarifa, monedaBaseCombo, monedaCobertura, sinTarifa, type PrimaTecnica } from '../tarifas/combo';
import { NOMBRE_COTIZADOR, type TarifaOficial } from '../tarifas/combo-rc';
import { toast } from '../store/toastStore';
import { AvisoMesaTecnica, CamposClaseRc, CamposClaseRcg, CamposNominaRc } from './RiesgoStep';
import { SliderSuma } from '../components/ui/SliderSuma';
import { MODO_CLIENTE } from '../config/modoCliente';

export function CotizacionStep() {
  const producto = useCotizacionStore((s) => s.producto);
  const mesaTecnica = useMesaTecnica();
  const vista = producto === 'planes' ? <CotizacionPlanes />
    : producto === 'combo' ? <CotizacionCombo />
    : producto === 'rc' ? <CotizacionRc /> : <CotizacionRcg />;
  // Actividad restringida: se sigue cotizando, con el mismo aviso del paso de riesgo.
  return <div className="space-y-5">{mesaTecnica && <AvisoMesaTecnica />}{vista}</div>;
}

/** Topes de suma de una cobertura para mostrar bajo el campo; 0 = sin tope. */
const topes = (min: number, max: number) =>
  min > 0 || max > 0 ? [min > 0 && `mín. ${importe(min)}`, max > 0 && `máx. ${importe(max)}`].filter(Boolean).join(' · ') : '';

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
  const prm = useParametrosStore((s) => s.rcg);
  const rcg = useCotizacionStore((s) => s.rcg);
  const esContrato = useCotizacionStore((s) => s.contrato.esContrato);
  const setRcg = useCotizacionStore((s) => s.setRcg);
  const cot = useCotizacionRcg();
  const [intento, setIntento] = useState(false);
  const clase = prm.clases[rcg.clase] ?? prm.clases[0];
  const m = (n: number) => `${rcg.moneda} ${importe(n)}`;
  const miles = (n: number) => n.toLocaleString('es-VE');
  const opcionValida = cot.alternativas.some((a) => a.opcion === rcg.opcion);
  const vistaTecnicaRcg = useParametrosStore((x) => x.vistaTecnica);
  const errorSuma = errorSumaRcg(rcg.limite, prm) ?? cot.errores.limite;
  // No se deja escribir una suma mayor a la máxima de Parámetros: se recorta con aviso.
  const cambiarSuma = (valor: string) => {
    const n = Number(valor);
    if (valor.trim() !== '' && Number.isFinite(n) && n > prm.limiteMax) {
      setRcg({ limite: String(prm.limiteMax) });
      toast.warning('Suma ajustada al máximo', `La suma asegurada no puede superar ${miles(prm.limiteMax)}; se dejó en el máximo permitido.`);
      return;
    }
    setRcg({ limite: valor });
  };

  return (
    <div className="space-y-5">
      <SectionCard title={MODO_CLIENTE ? 'Suma asegurada' : 'Suma asegurada y tasa'} description={`Clase: ${clase.etiqueta}`} Icon={Calculator}>
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Moneda">
            <Select value={rcg.moneda} onChange={(e) => setRcg({ moneda: e.target.value as MonedaRcg })}>
              {MONEDAS_RCG.map((x) => <option key={x} value={x}>{x}</option>)}
            </Select>
          </Field>
          <Field label="Suma asegurada deseada" full={MODO_CLIENTE} hint={`Mínimo ${miles(prm.limiteMin)} · máximo permitido ${miles(prm.limiteMax)}. Es la opción I.`} error={intento || rcg.limite ? errorSuma : undefined}>
            <Input type="number" min={prm.limiteMin} max={prm.limiteMax} step="0.01" value={rcg.limite} onChange={(e) => cambiarSuma(e.target.value)} placeholder="Ej. 50000" />
            <SliderSuma valor={rcg.limite} min={prm.limiteMin} max={prm.limiteMax} onChange={cambiarSuma} formato={miles} />
          </Field>
          {/* Vista cliente: la tasa queda en la media de la clase (se fija al elegirla en Riesgo) y no se muestra. */}
          {!MODO_CLIENTE && (
            <Field label="Tasa básica (%)" hint={`Rango: ${clase.min.toFixed(2)} % – ${clase.max.toFixed(2)} %`} error={cot.errores.tasa}>
              <Input type="number" min={clase.min} max={clase.max} step="0.01" value={rcg.tasa} onChange={(e) => setRcg({ tasa: e.target.value })} />
            </Field>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Elige la opción" description={descripcionOpcionesRcg(prm)} Icon={ShieldCheck}>
        {cot.alternativas.length === 0 ? (
          <p className="text-sm text-slate-500">Ingresa una suma asegurada y una tasa válidas para ver las primas.</p>
        ) : (
          <>
            <div className="grid sm:grid-cols-3 gap-3">
              {cot.alternativas.map((a, i) => (
                <TarjetaOpcion key={a.opcion} titulo={`Opción ${a.opcion}`} activa={rcg.opcion === a.opcion} onClick={() => setRcg({ opcion: a.opcion })}
                  prima={m(a.prima)} etiqueta={a.primaMinimaAplicada ? 'Prima mínima aplicada' : 'Prima neta'}>
                  <p>Suma asegurada: <strong className="text-slate-700">{m(a.limite)}</strong></p>
                  <p>{i === 0 ? 'La suma que elegiste' : `Suma × ${prm.factoresOpciones[i] ?? 1}`}{i > 0 && a.limite >= prm.limiteMax ? ' · tope máximo aplicado' : ''}</p>
                  {vistaTecnicaRcg && a.descuentoPct != null && a.tasaInicial != null && a.tasaAplicada != null && (
                    <p>Descuento {porcentaje(a.descuentoPct)}: tasa {porcentaje(a.tasaInicial)} → <strong className="text-slate-700">{porcentaje(Number(a.tasaAplicada.toFixed(5)))}</strong></p>
                  )}
                </TarjetaOpcion>
              ))}
            </div>
            {cot.alternativas.length < 3 && (
              <p className="text-[0.72rem] text-slate-500 mt-2">
                Solo {cot.alternativas.length === 1 ? 'aparece 1 opción' : `aparecen ${cot.alternativas.length} opciones`}: al multiplicar se llega al máximo permitido ({miles(prm.limiteMax)}) y la opción siguiente repetiría la misma suma.
              </p>
            )}
          </>
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
          {esContrato && prm.condicionesOpcionales.map((c, i) => (
            <Casilla key={c} checked={rcg.condiciones.includes(i)}
              onChange={(v) => setRcg({ condiciones: v ? [...rcg.condiciones, i] : rcg.condiciones.filter((x) => x !== i) })}>{c}</Casilla>
          ))}
          <div className="flex items-start gap-2 text-[0.78rem] text-slate-600 bg-slate-50 rounded-xl px-3.5 py-3 border border-slate-200">
            <Badge tone="indigo">Siempre</Badge><span>{prm.condicionFija}</span>
          </div>
        </div>
      </SectionCard>

      <StepActions continueLabel="Ver resumen" onContinue={() => {
        setIntento(true);
        const e = errorSuma ?? cot.errores.tasa;
        if (e) { toast.error('Revisa la cotización', e); return false; }
        if (!opcionValida) setRcg({ opcion: 'I' });
        return true;
      }} />
    </div>
  );
}

/** Planes de Sis2000 cotizados en línea; en el ramo 28 (RCG) con la prima de tarifa RCG al lado como referencia. */
function CotizacionPlanes() {
  const prm = useParametrosStore((s) => s.rcg);
  const rcg = useCotizacionStore((s) => s.rcg);
  const setRcg = useCotizacionStore((s) => s.setRcg);
  const ramoSel = useCotizacionStore((s) => s.ramoSel);
  const planSel = useCotizacionStore((s) => s.planSel);
  const setPlanSel = useCotizacionStore((s) => s.setPlanSel);
  const { ramos, ramoCotizado, planes, cargando, error, cargar } = usePlanesStore();
  const ramo = ramos.find((r) => r.cramo === ramoSel);
  const esRcg = ramoSel === RAMO_RCG;
  const cot = useCotizacionPlanesRcg(planes[0]?.suma);
  const clase = prm.clases[rcg.clase] ?? prm.clases[0];
  const tasa = Number(rcg.tasa);
  const tarifa = !esRcg || cot.errores.tasa ? [] : primasTarifaRcg(planes, tasa, prm);
  const elegido = planes.find((p) => p.cplan === planSel);
  const sinTarifa = ramo?.planes.filter((p) => !p.cotizable) ?? [];
  const usd = (n: number) => `USD ${importe(n)}`;

  const porCoberturas = esRamoCoberturas(ramoSel);
  const cargarTarifa = usePlanesStore((p) => p.cargarTarifa);
  const cobCot = useCotizacionCoberturas();
  const vistaTecnica = useParametrosStore((s) => s.vistaTecnica);

  useEffect(() => {
    if (ramoSel != null && ramoCotizado !== ramoSel && !cargando) void cargar(ramoSel);
  }, [ramoSel]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (porCoberturas && ramoSel != null && planSel) void cargarTarifa(ramoSel, planSel);
  }, [porCoberturas, ramoSel, planSel]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-5">
      {esRcg && (
        <SectionCard title="Tasa de la clase" description={`Clase: ${clase.etiqueta} · ${rcg.indole}`} Icon={Calculator}>
          <div className="grid sm:grid-cols-3 gap-4">
            {!MODO_CLIENTE && (
              <Field label="Tasa básica (%)" hint={`Rango: ${clase.min.toFixed(2)} % – ${clase.max.toFixed(2)} %`} error={cot.errores.tasa}>
                <Input type="number" min={clase.min} max={clase.max} step="0.01" value={rcg.tasa} onChange={(e) => setRcg({ tasa: e.target.value })} />
              </Field>
            )}
            <div className="sm:col-span-2 self-end text-[0.78rem] text-slate-500">
              La tasa se aplica a la suma de cada plan con la tarifa del RCG (prima mínima USD {importe(prm.primaMinimaDivisa)} proporcional).
            </div>
          </div>
        </SectionCard>
      )}

      <SectionCard title={`Planes de ${ramo?.xramo ?? 'Sis2000'}`} description={`Ramo ${ramoSel ?? '—'} · suma y prima de cada plan según spCalculoRiesgoGeneral.`} Icon={ShieldCheck}
        statusLabel="Prueba" statusTone="warning">
        {cargando && <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" /> Cotizando en Sis2000…</p>}
        {!cargando && planes.length > 0 && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {planes.map((p) => {
              const t = tarifa.find((x) => x.cplan === p.cplan);
              return (
                <TarjetaOpcion key={p.cplan} titulo={p.nombre} activa={planSel === p.cplan} onClick={() => setPlanSel(p.cplan)}
                  prima={usd(p.prima)} etiqueta={porCoberturas ? 'Plan completo · referencia' : 'Prima Sis2000 · se emite'}>
                  <p>Suma asegurada: <strong className="text-slate-700">{usd(p.suma)}</strong></p>
                  <p>{p.coberturas.length} {p.coberturas.length === 1 ? 'cobertura' : 'coberturas'} · {p.cplan}</p>
                  {esRcg && <p>Tarifa RCG: <strong className="text-slate-700">{t ? usd(t.prima) : '—'}</strong>{t?.primaMinimaAplicada ? ' (mínimo)' : ''}</p>}
                </TarjetaOpcion>
              );
            })}
          </div>
        )}
        {error && ramoSel != null && (
          <div className="space-y-3 mt-3">
            <Aviso tono="error">{error}</Aviso>
            <Button variant="secondary" size="sm" onClick={() => void cargar(ramoSel)}><RefreshCw size={13} /> Reintentar</Button>
          </div>
        )}
        {sinTarifa.length > 0 && (
          <p className="text-[0.72rem] text-slate-500 mt-3">
            <strong>Sin tarifa en Sis2000 (no cotizan):</strong> {sinTarifa.map((p) => `${p.xplan} (${p.cplan})`).join(' · ')}.
          </p>
        )}
      </SectionCard>

      {porCoberturas ? (
        elegido && <CoberturasElegibles />
      ) : (
        <Aviso>
          Sis2000 emite con la suma, la prima y las coberturas del plan: el trigger Emision_Riesgos reemplaza lo que se envía.
          {esRcg && ' La prima de tarifa RCG es referencial; para emitir con ella La Mundial tendría que cambiar ese trigger.'}
        </Aviso>
      )}

      {elegido && !porCoberturas && (
        <SectionCard title={`Coberturas de ${elegido.nombre}`} description={`${vistaTecnica ? 'Suma y prima' : 'Suma'} por cobertura en Sis2000 (maplantar).`} Icon={ListChecks}>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-[0.78rem]">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left font-bold px-3 py-2">Cobertura</th><th className="text-right font-bold px-3 py-2">Suma</th>
                  {vistaTecnica && <th className="text-right font-bold px-3 py-2">Prima</th>}
                </tr>
              </thead>
              <tbody>
                {elegido.coberturas.map((c) => (
                  <tr key={c.nombre} className="border-t border-slate-100">
                    <td className="px-3 py-1.5 text-slate-700">{c.nombre}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{importe(c.suma)}</td>
                    {vistaTecnica && <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{importe(c.prima)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {esRcg && <p className="text-[0.72rem] text-slate-500 mt-3"><strong>Deducible (tarifa RCG):</strong> {cot.deducible}</p>}
        </SectionCard>
      )}

      <StepActions continueLabel="Ver resumen" onContinue={() => {
        if (esRcg && cot.errores.tasa) { toast.error('Revisa la tasa', cot.errores.tasa); return false; }
        if (!elegido) { toast.warning('Elige un plan', planes.length ? 'Selecciona uno de los planes cotizados.' : 'No hay planes cotizados de Sis2000.'); return false; }
        if (porCoberturas) {
          if (!cobCot) { toast.warning('Cargando coberturas', 'Espera el tarificador del plan.'); return false; }
          if (!cobCot.valida) {
            const e = cobCot.cot.generales[0] ?? Object.entries(cobCot.cot.errores).map(([k, v]) => `${cobCot.plan.coberturas.find((c) => c.ccober === k)?.nombre ?? k}: ${v}`)[0];
            toast.error('Revisa las coberturas', e);
            return false;
          }
        }
        return true;
      }} />
    </div>
  );
}

/** Ramos 16 y 38: coberturas del plan con casilla y suma editable; prima = suma × tasa de Sis2000 (matarifa_d). */
function CoberturasElegibles() {
  const setCoberturas = useCotizacionStore((s) => s.setCoberturas);
  const { cargandoTarifa, errorTarifa, tarifa } = usePlanesStore();
  const cargarTarifa = usePlanesStore((p) => p.cargarTarifa);
  const r = useCotizacionCoberturas();
  const vistaTecnica = useParametrosStore((s) => s.vistaTecnica);
  const usd = (n: number) => `USD ${importe(n)}`;

  if (cargandoTarifa) return <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" /> Cargando la tarifa por cobertura…</p>;
  if (errorTarifa || !r) {
    return (
      <div className="space-y-3">
        <Aviso tono="error">{errorTarifa ?? 'Sin tarifa por cobertura para este plan.'}</Aviso>
        {tarifa && <Button variant="secondary" size="sm" onClick={() => void cargarTarifa(tarifa.cramo, tarifa.cplan)}><RefreshCw size={13} /> Reintentar</Button>}
      </div>
    );
  }
  const { plan, cot, sumas } = r;
  const elegidas = r.elegidas ?? plan.coberturas.map((c) => c.ccober);
  const porCob = new Map(cot.coberturas.map((c) => [c.ccober, c]));
  const alternar = (ccober: string, v: boolean) =>
    setCoberturas({ elegidas: v ? [...elegidas, ccober] : elegidas.filter((x) => x !== ccober) });

  return (
    <SectionCard title="Arma la cobertura" description="Marca las coberturas y ajusta su suma. La prima de cada una es su suma × la tasa de Sis2000." Icon={ListChecks}>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-[0.78rem]">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left font-bold px-3 py-2">Cobertura</th>
              <th className="text-right font-bold px-3 py-2">Suma asegurada</th>
              {vistaTecnica && <th className="text-right font-bold px-3 py-2">Tasa</th>}
              {vistaTecnica && <th className="text-right font-bold px-3 py-2">Prima</th>}
            </tr>
          </thead>
          <tbody>
            {plan.coberturas.map((c) => {
              const marcada = c.obligatoria || elegidas.includes(c.ccober);
              const x = porCob.get(c.ccober);
              const err = marcada ? cot.errores[c.ccober] : undefined;
              const limites = topes(c.msumamin, c.msumamax);
              return (
                <tr key={c.ccober} className={cn('border-t border-slate-100 align-top', !marcada && 'text-slate-400')}>
                  <td className="px-3 py-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={marcada} disabled={c.obligatoria} onChange={(e) => alternar(c.ccober, e.target.checked)} />
                      <span className={marcada ? 'text-slate-700' : ''}>{c.nombre}{c.obligatoria ? ' · obligatoria' : ''}</span>
                    </label>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number" min={0} step="0.01" disabled={!marcada}
                      value={sumas[c.ccober] ?? String(c.msumaplan)}
                      onChange={(e) => setCoberturas({ sumas: { ...sumas, [c.ccober]: e.target.value } })}
                      className={cn('w-32 rounded-lg border px-2 py-1 text-right tabular-nums disabled:bg-slate-50', err ? 'border-red-400' : 'border-slate-200')}
                    />
                    {(err || limites) && <p className={cn('text-[0.68rem] mt-0.5', err ? 'text-red-600' : 'text-slate-400')}>{err ?? limites}</p>}
                  </td>
                  {vistaTecnica && <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{porcentaje(c.pprima)}</td>}
                  {vistaTecnica && <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{marcada && x ? importe(x.prima) : '—'}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-4">
        <TotalRc total={usd(cot.prima_total)} detalle={`${cot.coberturas.length} coberturas · suma asegurada ${usd(cot.suma_asegurada)}`} />
      </div>
      <p className="text-[0.72rem] text-slate-500 mt-2">
        Sumas por defecto: las del plan ({importe(sumaDe(plan.coberturas[0], {}))} la básica). nest-api recalcula la prima con las tasas de Sis2000 antes de emitir.
      </p>
    </SectionCard>
  );
}

/** Combo del ramo elegido en el paso 1 (riesgos-generales/coberturas). Solo cotiza: no hay ruta de emisión. */
function CotizacionCombo() {
  const cramo = useCotizacionStore((s) => s.ramoCombo);
  const error = usePlanesStore((s) => (cramo == null ? null : s.catalogos[cramo]?.error ?? null));
  const cargarCatalogo = usePlanesStore((s) => s.cargarCatalogo);
  const xramo = useNombreRamo(cramo);
  const r = useCotizacionCombo();
  const [intento, setIntento] = useState(false);

  useEffect(() => {
    if (cramo != null) void cargarCatalogo(cramo);
  }, [cramo]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-5">
      {cramo == null ? <Aviso tono="error">No hay ramo elegido: vuelve al paso de producto.</Aviso>
        : r ? <>{r.oficial && <DatosTarifaOficial oficial={r.oficial} intento={intento} />}<TablaCombo r={r} intento={intento} /></>
        : error ? (
          <div className="space-y-3">
            <Aviso tono="error">{error}</Aviso>
            <Button variant="secondary" size="sm" onClick={() => void cargarCatalogo(cramo)}><RefreshCw size={13} /> Reintentar</Button>
          </div>
        ) : <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" /> Consultando las coberturas de {xramo}…</p>}

      <StepActions continueLabel="Ver resumen" onContinue={() => {
        setIntento(true);
        if (!r) { toast.warning('Sin coberturas cargadas', 'Espera la consulta del ramo o vuelve al paso de producto.'); return false; }
        if (!r.valida) {
          const e = r.cot.generales[0] ?? Object.entries(r.cot.errores).map(([k, v]) => `${r.catalogo.find((c) => c.ccober === k)?.nombre ?? k}: ${v}`)[0];
          toast.error('Revisa el combo', e);
          return false;
        }
        return true;
      }} />
    </div>
  );
}

/** Mismo aspecto que CoberturasElegibles: obligatorias fijas, adicionales con casilla y suma escrita por cobertura. */
/** Sin valores de Técnico en el ramo: constante para que el selector devuelva siempre la misma referencia. */
const SIN_TECNICO: Record<string, PrimaTecnica> = {};

function TablaCombo({ r, intento }: { r: NonNullable<ReturnType<typeof useCotizacionCombo>>; intento: boolean }) {
  const setCombo = useCotizacionStore((s) => s.setCombo);
  const setTecnico = useCotizacionStore((s) => s.setTecnicoCombo);
  // Selector con referencia estable: un {} nuevo en cada render hace que zustand re-renderice sin fin.
  const tecnico = useCotizacionStore((s) => s.tecnicoCombo[r.cramo]) ?? SIN_TECNICO;
  const vistaTecnica = useParametrosStore((s) => s.vistaTecnica);
  const xramo = useNombreRamo(r.cramo);
  const { cramo, catalogo, elegidas, cot, moneda, oficial } = r;
  const m = (n: number) => `${moneda} ${importe(n)}`;
  const porCob = new Map(cot.coberturas.map((c) => [c.ccober, c]));
  const alternar = (ccober: string, v: boolean) =>
    setCombo(cramo, v ? { ...elegidas, [ccober]: '' } : Object.fromEntries(Object.entries(elegidas).filter(([k]) => k !== ccober)));

  if (!catalogo.length) return <Aviso>{xramo} no tiene coberturas con tarifa vigente en Sis2000.</Aviso>;
  // Ramos 27/28/37: tarifa oficial del cotizador (la prima va en la básica). Los demás: tasa de Sis2000 o de Técnico.
  // Cualquier cobertura se puede marcar; sin la tarifa de Técnico se cotiza, pero no se emite.
  const fuente = oficial ? `Tarifa oficial (cotizador ${NOMBRE_COTIZADOR[oficial.cotizador]})` : '';
  const totalSinTarifa = oficial ? 0 : catalogo.filter(sinTarifa).length;
  const incluidasSinTarifa = coberturasSinTarifa(catalogo, cot);
  // Una póliza va en una sola moneda: la de la básica.
  const monedaBase = monedaBaseCombo(catalogo);
  const incluidasOtraMoneda = coberturasOtraMoneda(catalogo, cot);
  // Sin tarifa oficial, la tasa se puede crear aquí para esta cotización (se emite con ella).
  const verTasa = vistaTecnica || !oficial;
  return (
    <SectionCard title={`Arma el combo · ${xramo}`} Icon={ListChecks} statusLabel={`Ramo ${cramo}`}
      description={oficial
        ? `Marca las coberturas y escribe su suma. La prima sale de la tarifa oficial del cotizador ${NOMBRE_COTIZADOR[oficial.cotizador]} y va en la cobertura básica; las demás van incluidas con prima 0.`
        : vistaTecnica
        ? 'Marca las coberturas y escribe su suma. La prima de cada una es su suma × la tasa cargada por Técnico en el Tarificador, o su prima fija; si aún no la tiene, puedes escribir aquí la tasa o la prima como respaldo.'
        : 'Marca las coberturas y escribe su suma asegurada. Se muestra solo la prima total del combo.'}>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-[0.78rem]">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left font-bold px-3 py-2">Cobertura</th>
              <th className="text-right font-bold px-3 py-2">Suma asegurada</th>
              {verTasa && <th className="text-right font-bold px-3 py-2">Tasa %</th>}
              {vistaTecnica && <th className="text-right font-bold px-3 py-2">Prima</th>}
            </tr>
          </thead>
          <tbody>
            {catalogo.map((c) => {
              const marcada = c.obligatoria || elegidas[c.ccober] !== undefined;
              const esBasicaOficial = !!oficial && c.ccober === oficial.basica;
              const activa = marcada || esBasicaOficial;
              const valor = elegidas[c.ccober] ?? '';
              const x = porCob.get(c.ccober);
              // El error se ve al escribir la suma o al intentar continuar; antes, solo los topes.
              const err = activa && (intento || valor !== '') ? cot.errores[c.ccober] : undefined;
              // Con tarifa oficial no aplican los topes de Sis2000 (manda el motor del cotizador).
              const limites = oficial ? '' : topes(c.msumamin, c.msumamax);
              const sinTar = !oficial && sinTarifa(c);
              // Solo la básica y las obligatorias no se desmarcan; cualquier otra se puede marcar, con o sin tarifa.
              // Otra moneda que la básica: no se puede marcar (sí desmarcar si ya estaba elegida).
              const otraMon = monedaCobertura(c) !== monedaBase;
              const bloqueada = c.obligatoria || esBasicaOficial || (otraMon && !marcada);
              const tec = tecnico[c.ccober] ?? {};
              return (
                <tr key={c.ccober} className={cn('border-t border-slate-100 align-top', !activa && 'text-slate-400', esBasicaOficial && 'bg-indigo-50/50')}>
                  <td className="px-3 py-2">
                    <label className={cn('flex items-center gap-2 flex-wrap', bloqueada ? 'cursor-default' : 'cursor-pointer')}
                      title={sinTar ? 'Sin tarifa todavía: Técnico la carga en el «Tarificador (Configuración de tarifas)» y se aplica sola. Se puede cotizar; para emitir hace falta la tarifa.' : undefined}>
                      <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={activa} disabled={bloqueada} onChange={(e) => alternar(c.ccober, e.target.checked)} />
                      <span className={activa ? 'text-slate-700' : ''}>{c.nombre}{esBasicaOficial ? ' · básica' : c.obligatoria ? ' · obligatoria' : ''}</span>
                      {esBasicaOficial && (
                        <span className="shrink-0 rounded-full border border-indigo-200 bg-indigo-100 px-1.5 py-px text-[0.62rem] font-bold uppercase tracking-wide text-indigo-700">{fuente}</span>
                      )}
                      {oficial && !esBasicaOficial && marcada && <span className="shrink-0 text-[0.68rem] text-slate-400">Incluida · prima en la básica</span>}
                      {otraMon && (
                        <span className="shrink-0 rounded-full border border-rose-200 bg-rose-50 px-1.5 py-px text-[0.62rem] font-bold uppercase tracking-wide text-rose-700" title={`Cobertura en ${monedaCobertura(c)}: la póliza va en ${monedaBase}, la moneda de la básica.`}>
                          En {monedaCobertura(c)} · otra moneda
                        </span>
                      )}
                      {sinTar && (
                        <span className="shrink-0 rounded-full border border-slate-200 bg-slate-100 px-1.5 py-px text-[0.62rem] font-bold uppercase tracking-wide text-slate-600">
                          Tarifa de Técnico
                        </span>
                      )}
                    </label>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number" min={0} step="0.01" disabled={!activa} value={valor} placeholder={activa ? 'Suma' : ''}
                      onChange={(e) => setCombo(cramo, { ...elegidas, [c.ccober]: e.target.value })}
                      className={cn('w-32 rounded-lg border px-2 py-1 text-right tabular-nums disabled:bg-slate-50', err ? 'border-red-400' : 'border-slate-200')}
                    />
                    {(err || limites) && <p className={cn('text-[0.68rem] mt-0.5', err ? 'text-red-600' : 'text-slate-400')}>{err ?? limites}</p>}
                  </td>
                  {verTasa && (sinTar && marcada ? (
                    <td className="px-3 py-2 text-right">
                      <input type="number" min={0} step="0.0001" value={tec.tasa ?? ''} placeholder="Tasa %" disabled={!!tec.prima?.trim()}
                        onChange={(e) => setTecnico(cramo, c.ccober, { tasa: e.target.value })} title="Tasa de Técnico (%): prima = suma × tasa / 100"
                        className="w-20 rounded-lg border border-amber-300 px-2 py-1 text-right tabular-nums disabled:bg-slate-50" />
                    </td>
                  ) : <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{oficial
                    ? (esBasicaOficial && oficial.tasa != null ? porcentaje(Number(oficial.tasa.toFixed(5))) : '—')
                    : c.pprima > 0 ? porcentaje(c.pprima) : c.mprima > 0 ? 'Prima fija' : '—'}</td>)}
                  {vistaTecnica && (sinTar && marcada ? (
                    <td className="px-3 py-2 text-right">
                      <input type="number" min={0} step="0.01" value={tec.prima ?? ''} placeholder={x && x.prima > 0 ? importe(x.prima) : 'Prima'}
                        onChange={(e) => setTecnico(cramo, c.ccober, { prima: e.target.value })} title="Prima de Técnico: si la escribes, manda sobre la tasa"
                        className="w-24 rounded-lg border border-amber-300 px-2 py-1 text-right tabular-nums" />
                    </td>
                  ) : <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{activa && x ? importe(x.prima) : '—'}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Los errores de los datos de tarifa oficial se ven en su tarjeta; aquí, los demás al intentar continuar. */}
      {intento && cot.generales.filter((g) => !oficial?.errores.includes(g)).map((g) => <div key={g} className="mt-3"><Aviso tono="error">{g}</Aviso></div>)}
      {incluidasOtraMoneda.length > 0 && (
        <div className="mt-3">
          <Aviso tono="error">
            La póliza va en {monedaBase} (la moneda de la básica). Desmarca las coberturas en otra moneda: {incluidasOtraMoneda.join(', ')}.
          </Aviso>
        </div>
      )}
      {incluidasSinTarifa.length > 0 && (
        <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-[0.78rem] text-slate-600">
          Sin tasa en Sis2000: <strong>{incluidasSinTarifa.join(', ')}</strong>. Escribe la <strong>tasa %</strong> en la columna «Tasa %» de cada una
          (prima = suma × tasa / 100) y se emite con esa tasa. También puede cargarla Técnico en el «Tarificador» para que quede fija.
        </p>
      )}
      {totalSinTarifa > 0 && incluidasSinTarifa.length === 0 && (
        <p className="mt-3 text-[0.72rem] text-slate-500">
          {totalSinTarifa === 1 ? 'Una cobertura' : `${totalSinTarifa} coberturas`} de {xramo} todavía no {totalSinTarifa === 1 ? 'tiene' : 'tienen'} tarifa (marcadas «Tarifa de Técnico»): se pueden marcar y cotizar; para emitir, Técnico la carga en el «Tarificador (Configuración de tarifas)».
        </p>
      )}
      <div className="mt-4">
        <TotalRc total={m(cot.prima_total)} detalle={`${cot.coberturas.length} ${cot.coberturas.length === 1 ? 'cobertura' : 'coberturas'} · suma asegurada ${m(cot.suma_asegurada)}`} />
      </div>
      <p className="text-[0.72rem] text-slate-500 mt-2">
        {oficial ? (
          <>
            Prima: <strong>{fuente}</strong>{oficial.opcion ? ` · opción ${oficial.opcion}` : ''}{oficial.minimaAplicada ? ' · prima mínima aplicada' : ''}.
            {vistaTecnica && oficial.tasa != null && <> Tasa {porcentaje(Number(oficial.tasa.toFixed(5)))}{oficial.clase ? ` · clase ${oficial.clase}` : ''}.</>}
            {' '}Ninguna adicional puede superar la suma de la cobertura básica.
          </>
        ) : (
          <>Las obligatorias van siempre.{catalogo.some((c) => c.ccober === '1') && ' Ninguna adicional puede superar la suma de la cobertura básica.'} Tarifas vigentes de Sis2000.</>
        )}
      </p>
    </SectionCard>
  );
}

/**
 * Ramos 27/28/37: datos mínimos del cotizador de Google para calcular la prima del combo. Son los mismos campos y el
 * mismo store que las opciones RCG y RCP/RCE (si ya se llenaron allí, aparecen llenos).
 */
function DatosTarifaOficial({ oficial, intento }: { oficial: TarifaOficial; intento: boolean }) {
  const prmRcg = useParametrosStore((s) => s.rcg);
  const rcg = useCotizacionStore((s) => s.rcg);
  const setRcg = useCotizacionStore((s) => s.setRcg);
  const esContrato = useCotizacionStore((s) => s.contrato.esContrato);
  const setContrato = useCotizacionStore((s) => s.setContrato);
  const rc = useCotizacionStore((s) => s.rc);
  const setRcProducto = useCotizacionStore((s) => s.setRcProducto);
  const k: K = oficial.cotizador === 'rce' ? 'e' : 'p';
  const nombre = NOMBRE_COTIZADOR[oficial.cotizador];
  const errores = intento ? oficial.errores : [];

  if (oficial.cotizador === 'rcg') {
    const clase = prmRcg.clases[rcg.clase] ?? prmRcg.clases[0];
    const esIndole = (e: string) => /índole/i.test(e);
    const esTasa = (e: string) => e.startsWith('Rango');
    return (
      <SectionCard title={`Datos de tarifa · cotizador ${nombre}`} Icon={Calculator}
        description="Con estos datos se aplica la tarifa oficial del RCG. El límite es la suma que escribas en la cobertura básica (opción I).">
        <div className="grid sm:grid-cols-2 gap-4">
          <CamposClaseRcg errorIndole={errores.find(esIndole)} />
          {!MODO_CLIENTE && (
            <Field label="Tasa básica (%)" hint={`Rango: ${clase.min.toFixed(2)} % – ${clase.max.toFixed(2)} %`} error={oficial.errores.find(esTasa)}>
              <Input type="number" min={clase.min} max={clase.max} step="0.01" value={rcg.tasa} onChange={(e) => setRcg({ tasa: e.target.value })} />
            </Field>
          )}
          <Field label="Moneda" hint="Define la cobertura básica de Sis2000 que lleva la prima.">
            <Select value={rcg.moneda} onChange={(e) => setRcg({ moneda: e.target.value as MonedaRcg })}>
              {MONEDAS_RCG.map((x) => <option key={x} value={x}>{x}</option>)}
            </Select>
          </Field>
        </div>
        <div className="mt-3">
          <Casilla checked={esContrato} onChange={(v) => setContrato({ esContrato: v })} detalle="Los datos del contrato se piden en el paso del tomador.">Con contrato</Casilla>
        </div>
        {errores.filter((e) => !esIndole(e) && !esTasa(e)).map((e) => <div key={e} className="mt-3"><Aviso tono="error">{e}</Aviso></div>)}
      </SectionCard>
    );
  }

  const x = rc[k];
  return (
    <SectionCard title={`Datos de tarifa · cotizador ${nombre}`} Icon={Calculator}
      description={`Con estos datos se aplica la tarifa oficial de ${NOMBRES[k]}. La prima no depende de la suma que escribas en la básica.`}>
      <div className="grid sm:grid-cols-2 gap-4">
        <CamposClaseRc intento={intento} conActividad={k === 'e'} conIndole={false} />
        <CamposNominaRc />
        {!MODO_CLIENTE && (
          <Field label="Tasa básica (%)" hint="Se propone la tasa media del rango al elegir la clase o la actividad.">
            <Input type="number" step="any" value={x.tasa} onChange={(e) => setRcProducto(k, { tasa: e.target.value })} />
          </Field>
        )}
        {rc.moneda !== 'VES' && (
          <Field label="Opción">
            <Select value={x.opcion} onChange={(e) => setRcProducto(k, { opcion: e.target.value as IdOpcion })}>
              {OPCIONES.map((o) => <option key={o} value={o}>Opción {o}</option>)}
            </Select>
          </Field>
        )}
      </div>
      {errores.map((e) => <div key={e} className="mt-3"><Aviso tono="error">{e}</Aviso></div>)}
    </SectionCard>
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

/** Coberturas adicionales por empleado (USD/EUR) con los montos de los parámetros. */
function adicionales(k: K, p: ParametrosRc): { nombre: string; porEmpleado: string }[] {
  const por = (f: (i: number) => number) => 'Por empleado: ' + ['I', 'II', 'III'].map((id, i) => `${id} ${importe(f(i))}`).join(' · ');
  return k === 'p'
    ? [
        { nombre: 'Gastos por asistencia médica, quirúrgica y farmacéutica', porEmpleado: por((i) => p.opcionesRcp[i]?.medica ?? 0) },
        { nombre: 'Hernia', porEmpleado: por((i) => p.opcionesRcp[i]?.hernia ?? 0) },
      ]
    : [
        { nombre: 'Negligencia del Empleador', porEmpleado: por((i) => p.opcionesRce[i]?.negligencia ?? 0) },
        { nombre: 'Asistencia Legal y Defensa Penal', porEmpleado: por((i) => p.opcionesRce[i]?.defensa ?? 0) },
        { nombre: 'Gastos Médicos', porEmpleado: por((i) => p.opcionesRce[i]?.medica ?? 0) },
      ];
}

/** RCP/RCE no tienen suma mínima en Parámetros: el slider arranca en 1.000 (o un décimo del tope si es menor). */
const minSumaRc = (max: number) => Math.min(1000, max / 10);

function CotizacionRc() {
  const prmRc = useParametrosStore((s) => s.rc);
  const vistaTecnica = useParametrosStore((s) => s.vistaTecnica);
  const rc = useCotizacionStore((s) => s.rc);
  const setRcProducto = useCotizacionStore((s) => s.setRcProducto);
  const cot = useCotizacionRc();
  const [intento, setIntento] = useState(false);
  const ves = rc.moneda === 'VES';
  const m = (n: number) => `${cot.simbolo} ${importe(n)}`;
  const sinErrores = cot.errores.length === 0;
  const setRc = useCotizacionStore((s) => s.setRc);
  const maxSuma = sumaDeseadaMaxima(prmRc);
  const errorSuma = !ves && rc.sumaDeseada.trim() !== '' ? validarSumaDeseada(numeroONulo(rc.sumaDeseada), prmRc) : null;
  // No se deja escribir una suma mayor a la máxima de Parámetros: se recorta con aviso.
  const cambiarSuma = (valor: string) => {
    const n = Number(valor);
    if (valor.trim() !== '' && Number.isFinite(n) && n > maxSuma) {
      setRc({ sumaDeseada: String(maxSuma) });
      toast.warning('Suma ajustada al máximo', `La suma por trabajador no puede superar ${importe(maxSuma)}; se dejó en el máximo permitido.`);
      return;
    }
    setRc({ sumaDeseada: valor });
  };
  const [f1 = 1, f2 = 2, f3 = 3] = prmRc.factoresSumaDeseada;

  return (
    <div className="space-y-5">
      <SectionCard title="Suma asegurada deseada" Icon={Scale}
        description={ves
          ? 'En bolívares el límite es el legal (salarios anuales × trabajadores) y la prima es un % de ese límite; no se elige una suma libre.'
          : 'Opcional. Déjala vacía para usar los límites que salen de la nómina (como el Sheet). La prima no cambia: depende de la nómina y la tasa.'}>
        {!ves && (
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Suma por trabajador" error={errorSuma ?? undefined}
              hint={`Máximo permitido ${importe(maxSuma)} (tope individual de la opción I en Parámetros).`}>
              <Input type="number" min={0} max={maxSuma} step="0.01" value={rc.sumaDeseada} placeholder="Según nómina"
                onChange={(e) => cambiarSuma(e.target.value)} />
              <SliderSuma valor={rc.sumaDeseada} min={minSumaRc(maxSuma)} max={maxSuma} onChange={cambiarSuma} formato={importe} />
            </Field>
            <p className="text-[0.72rem] text-slate-500 self-center">
              Opción I = la suma elegida{f1 !== 1 ? ` × ${f1}` : ''} · II = suma × {f2} · III = suma × {f3}, cada una con su tope individual
              ({prmRc.opcionesRcp.map((o) => importe(o.topeIndividual)).join(' / ')}). Dos o más / evento = suma × {prmRc.multiplicadorColectivo} con su tope colectivo.
              La opción que no supere a la anterior no se muestra.
            </p>
          </div>
        )}
      </SectionCard>

      {cot.resultados.map((r) => {
        const x = rc[r.k];
        return (
          <SectionCard key={r.k} title={NOMBRES[r.k]} Icon={r.k === 'p' ? ShieldCheck : Calculator}
            description={r.riesgo ? `${r.k === 'p' ? 'Clase' : 'Actividad'}: ${r.riesgo[0]}${MODO_CLIENTE ? '' : ` · rango ${porcentaje(r.riesgo[1])} – ${porcentaje(r.riesgo[2])}`}` : 'Clasificación pendiente'}>
            <div className="space-y-4">
              {/* Vista cliente: sin tasa ni ajuste (el descuento requiere validación técnica). */}
              {!MODO_CLIENTE && (
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Tasa básica (%)">
                    <Input type="number" step="any" value={x.tasa} onChange={(e) => setRcProducto(r.k, { tasa: e.target.value })} />
                  </Field>
                  <Field label="Ajuste: descuento (−) o recargo (+) %" hint="Relativo, máximo ±10 %. El descuento requiere validación técnica.">
                    <Input type="number" min={-10} max={10} step="0.01" value={x.ajuste} onChange={(e) => setRcProducto(r.k, { ajuste: e.target.value })} />
                  </Field>
                </div>
              )}

              <p className="text-[0.72rem] text-slate-500">
                <strong>Coberturas básicas:</strong> {[...COBERTURAS_BASICAS, r.k === 'p' ? 'Gastos de entierro' : 'Secuelas o deformidades permanentes'].join(' · ')}.
              </p>

              <div>
                <p className="text-[0.78rem] font-bold text-slate-600 tracking-wide mb-2">Coberturas adicionales</p>
                <div className="grid sm:grid-cols-2 gap-2">
                  {!ves
                    ? adicionales(r.k, prmRc).map((a, i) => (
                        <Casilla key={a.nombre} checked={x.adicionales[i]} detalle={a.porEmpleado}
                          onChange={(v) => setRcProducto(r.k, { adicionales: x.adicionales.map((y, j) => (j === i ? v : y)) })}>{a.nombre}</Casilla>
                      ))
                    : opcionalesDe(r.k, prmRc).map((o, i, lista) => {
                        const vacio = (rg: typeof o) => ({ seleccionada: false, tasa: String(rg[1]), limite: /m[eé]dic/i.test(rg[0]) ? '1000' : '650', grupo: '2000' });
                        const op = x.opcionalesVes[i] ?? vacio(o);
                        const cambiar = (c: Partial<typeof op>) => setRcProducto(r.k, {
                          opcionalesVes: lista.map((oo, j) => (j === i ? { ...op, ...c } : x.opcionalesVes[j] ?? vacio(oo))),
                        });
                        const restringida = /Negligencia|Defensa Penal/i.test(o[0]);
                        const medica = /m[eé]dic/i.test(o[0]);
                        return (
                          <div key={o[0]} className="space-y-2">
                            <Casilla checked={op.seleccionada} onChange={(v) => cambiar({ seleccionada: v })} detalle={MODO_CLIENTE ? undefined : `Tasa ${o[1]} % – ${o[2]} %`}>{o[0]}</Casilla>
                            {op.seleccionada && (
                              <div className="grid grid-cols-2 gap-2 pl-2">
                                {!MODO_CLIENTE && (
                                  <Field label="Tasa (%)">
                                    <Input type="number" step="any" value={r.k === 'e' ? String(o[1]) : op.tasa} readOnly={r.k === 'e'} onChange={(e) => cambiar({ tasa: e.target.value })} />
                                  </Field>
                                )}
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
                      {vistaTecnica && o.primaOpcionales > 0 && <p>Adicionales: {importe(o.primaOpcionales)}</p>}
                      {vistaTecnica && o.descuentoPct != null && o.tasaInicial != null && o.tasaAplicada != null && (
                        <p>Descuento {porcentaje(o.descuentoPct)}: tasa {porcentaje(o.tasaInicial)} → {porcentaje(Number(o.tasaAplicada.toFixed(5)))}</p>
                      )}
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
