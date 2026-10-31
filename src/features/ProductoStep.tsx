import { useEffect, useState } from 'react';
import { Building2, Check, FlaskConical, HardHat, Layers, Loader2, Puzzle, RefreshCw } from 'lucide-react';
import { Aviso } from '../components/ui/Aviso';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/FormField';
import { SectionCard } from '../components/ui/SectionCard';
import { StepActions } from '../components/ui/StepActions';
import { cn } from '../lib/utils';
import { importe } from '../tarifas/comun';
import { RAMOS_EXCLUIDOS } from '../tarifas/planes-rcg';
import { useCotizacionStore, type Producto } from '../store/cotizacionStore';
import { useNombreRamo } from '../store/comboHook';
import { usePlanesStore } from '../store/planesStore';
import { toast } from '../store/toastStore';
import type { Modo } from '../tarifas/rcp-rce';

const PRODUCTOS: { id: Producto; nombre: string; detalle: string; desc: string; Icon: typeof Building2 }[] = [
  {
    id: 'rcg', nombre: 'Responsabilidad Civil General', detalle: 'Tarifa RCG · igual al cotizador de Google', Icon: Building2,
    desc: 'Daños a terceros por la actividad del asegurado. Tú defines límite y tasa; tres opciones (I, II y III), con o sin contrato.',
  },
  {
    id: 'rc', nombre: 'RC Patronal / Empresarial', detalle: 'RCP · RCE · igual al cotizador de Google', Icon: HardHat,
    desc: 'Responsabilidad del patrono frente a sus trabajadores (LOPCYMAT), calculada sobre la nómina anual.',
  },
  {
    id: 'planes', nombre: 'Planes Sis2000', detalle: 'Planes con precio fijo · todos los ramos', Icon: FlaskConical,
    desc: 'Los planes que La Mundial tiene cargados en Sis2000 (combinados, RC General…), con su suma y prima. Los nuevos aparecen solos. Emite en QA.',
  },
  {
    id: 'combo', nombre: 'Combo de coberturas', detalle: 'Coberturas de un ramo · a la medida', Icon: Puzzle,
    desc: 'Todas las coberturas vigentes de un ramo de Sis2000: eliges cuáles y con qué suma; el cliente ve la prima total. Solo cotiza: para emitir, el combo debe existir como plan.',
  },
];

const MODOS: [Modo, string][] = [['p', 'Solo Patronal (RCP)'], ['e', 'Solo Empresarial (RCE)'], ['both', 'Patronal + Empresarial']];

export function ProductoStep() {
  const producto = useCotizacionStore((s) => s.producto);
  const setProducto = useCotizacionStore((s) => s.setProducto);
  const modo = useCotizacionStore((s) => s.rc.modo);
  const setRc = useCotizacionStore((s) => s.setRc);
  const ramoSel = useCotizacionStore((s) => s.ramoSel);
  const setRamoSel = useCotizacionStore((s) => s.setRamoSel);
  const planSel = useCotizacionStore((s) => s.planSel);
  const setPlanSel = useCotizacionStore((s) => s.setPlanSel);
  const { ramos, cargandoRamos, errorRamos, cargarRamos } = usePlanesStore();

  useEffect(() => {
    if ((producto === 'planes' || producto === 'combo') && !ramos.length && !cargandoRamos && !errorRamos) void cargarRamos();
  }, [producto]); // eslint-disable-line react-hooks/exhaustive-deps

  const ramo = ramos.find((r) => r.cramo === ramoSel);

  return (
    <div className="space-y-5">
      <SectionCard title="¿Qué deseas cotizar?" description="Tarifa del cotizador (RCG o RCP/RCE), un plan ya configurado en Sis2000 o un combo con las coberturas de un ramo." Icon={Layers}>
        <div className="grid sm:grid-cols-2 gap-3">
          {PRODUCTOS.map((p) => {
            const active = producto === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setProducto(p.id)}
                className={cn(
                  'text-left rounded-2xl border p-5 transition-all',
                  active ? 'border-indigo-400 bg-indigo-50/60 ring-2 ring-indigo-200' : 'border-slate-200 bg-white hover:border-indigo-200',
                )}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 grid place-items-center shadow-[0_4px_14px_rgba(15,26,90,0.3)]">
                    <p.Icon size={18} className="text-white" />
                  </div>
                  {active && (
                    <span className="w-6 h-6 rounded-full bg-indigo-600 text-white grid place-items-center">
                      <Check size={12} strokeWidth={3} />
                    </span>
                  )}
                </div>
                <p className="font-display font-bold text-slate-900">{p.nombre}</p>
                <p className="text-[0.65rem] font-bold uppercase tracking-wider text-indigo-500 mt-1">{p.detalle}</p>
                <p className="text-[0.78rem] text-slate-500 mt-2 leading-relaxed">{p.desc}</p>
              </button>
            );
          })}
        </div>

        {producto === 'rc' && (
          <div className="mt-4">
            <p className="text-[0.78rem] font-bold text-slate-600 tracking-wide mb-2">¿Qué deseas cotizar?</p>
            <div className="flex flex-wrap gap-2">
              {MODOS.map(([v, t]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setRc({ modo: v })}
                  className={cn(
                    'px-4 py-2 rounded-full text-sm font-bold border transition-all',
                    modo === v ? 'bg-indigo-700 text-white border-indigo-700' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300',
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {producto === 'planes' && (
          <div className="mt-4">
            <p className="text-[0.78rem] font-bold text-slate-600 tracking-wide mb-2">Ramo de Sis2000</p>
            {cargandoRamos && <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" /> Consultando los planes de Sis2000…</p>}
            {errorRamos && (
              <div className="space-y-3">
                <Aviso tono="error">{errorRamos}</Aviso>
                <Button variant="secondary" size="sm" onClick={() => void cargarRamos()}><RefreshCw size={13} /> Reintentar</Button>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {ramos.map((r) => {
                const cotizables = r.planes.filter((p) => p.cotizable).length;
                return (
                  <button
                    key={r.cramo}
                    type="button"
                    disabled={!cotizables}
                    title={cotizables ? undefined : 'Ningún plan de este ramo tiene tarifa en Sis2000.'}
                    onClick={() => setRamoSel(r.cramo)}
                    className={cn(
                      'px-4 py-2 rounded-full text-sm font-bold border transition-all disabled:opacity-40 disabled:cursor-not-allowed',
                      ramoSel === r.cramo ? 'bg-indigo-700 text-white border-indigo-700' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300',
                    )}
                  >
                    {r.xramo} <span className="font-normal opacity-75">· {cotizables} {cotizables === 1 ? 'plan' : 'planes'}</span>
                  </button>
                );
              })}
            </div>

            {ramo && (
              <div className="mt-4">
                <p className="text-[0.78rem] font-bold text-slate-600 tracking-wide mb-2">Plan · {ramo.xramo}</p>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {ramo.planes.filter((p) => p.cotizable).map((p) => {
                    const activo = planSel === p.cplan;
                    return (
                      <button
                        key={p.cplan}
                        type="button"
                        onClick={() => setPlanSel(p.cplan)}
                        className={cn(
                          'text-left rounded-2xl border p-4 transition-all',
                          activo ? 'border-indigo-400 bg-indigo-50/60 ring-2 ring-indigo-200' : 'border-slate-200 bg-white hover:border-indigo-200',
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-display font-bold text-slate-900 text-sm">{p.xplan}</p>
                          {activo && <span className="w-5 h-5 shrink-0 rounded-full bg-indigo-600 text-white grid place-items-center"><Check size={11} strokeWidth={3} /></span>}
                        </div>
                        <p className="font-display text-xl font-black gradient-text-indigo tabular-nums mt-1">USD {importe(p.mprima)}</p>
                        <p className="text-[0.75rem] text-slate-500 mt-1">
                          Suma {importe(p.msumamax)} · {p.qcoberturas} {p.qcoberturas === 1 ? 'cobertura' : 'coberturas'} · {p.cplan}
                        </p>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[0.72rem] text-slate-500 mt-2">Prima anual de referencia de Sis2000; se confirma en línea en el paso de cotización.</p>
              </div>
            )}
          </div>
        )}

        {producto === 'combo' && <RamoCombo />}
      </SectionCard>

      <StepActions onContinue={() => {
        if (!producto) { toast.warning('Selecciona un producto', 'Elige RC General, RC Patronal / Empresarial, los planes de Sis2000 o un combo de coberturas.'); return false; }
        if (producto === 'planes' && !ramo) { toast.warning('Selecciona un ramo', 'Elige el ramo de Sis2000 que deseas cotizar.'); return false; }
        if (producto === 'planes' && !ramo?.planes.some((p) => p.cplan === planSel)) { toast.warning('Selecciona un plan', 'Elige el plan de Sis2000 que deseas cotizar.'); return false; }
        if (producto === 'combo') return comboListo();
        return true;
      }} />
    </div>
  );
}

/** Paso 1 del combo: ramo elegido y sus coberturas cargadas. */
function comboListo(): boolean {
  const cramo = useCotizacionStore.getState().ramoCombo;
  const cat = cramo == null ? undefined : usePlanesStore.getState().catalogos[cramo];
  if (cramo == null) { toast.warning('Selecciona un ramo', 'Elige o escribe el ramo de Sis2000 del combo.'); return false; }
  if (!cat || cat.cargando) { toast.warning('Cargando coberturas', 'Espera las coberturas del ramo.'); return false; }
  if (cat.error) { toast.error('No se pudieron cargar las coberturas', cat.error); return false; }
  if (!cat.coberturas?.length) { toast.warning('Ramo sin coberturas', 'Ese ramo no tiene coberturas con tarifa vigente en Sis2000.'); return false; }
  return true;
}

const plural = (n: number, una: string, varias: string) => `${n} ${n === 1 ? una : varias}`;

/** Combo: ramo de la lista de Sis2000 o escrito a mano; al elegirlo se consultan todas sus coberturas vigentes. */
function RamoCombo() {
  const ramoCombo = useCotizacionStore((s) => s.ramoCombo);
  const setRamoCombo = useCotizacionStore((s) => s.setRamoCombo);
  const { ramos, cargandoRamos, errorRamos, cargarRamos } = usePlanesStore();
  const catalogo = usePlanesStore((s) => (ramoCombo == null ? undefined : s.catalogos[ramoCombo]));
  const cargarCatalogo = usePlanesStore((s) => s.cargarCatalogo);
  const xramo = useNombreRamo(ramoCombo);
  const [otro, setOtro] = useState('');

  useEffect(() => {
    if (ramoCombo != null) void cargarCatalogo(ramoCombo);
  }, [ramoCombo]); // eslint-disable-line react-hooks/exhaustive-deps

  const usarOtro = () => {
    const n = Number(otro);
    if (!Number.isInteger(n) || n <= 0) { toast.warning('Ramo inválido', 'Escribe el número del ramo de Sis2000 (ej. 16).'); return; }
    if (RAMOS_EXCLUIDOS.includes(n)) { toast.warning('Ramo no disponible', 'La Mundial no cotiza ese ramo por este canal.'); return; }
    setRamoCombo(n);
    setOtro('');
  };

  const coberturas = catalogo?.coberturas;
  const obligatorias = coberturas?.filter((c) => c.obligatoria).length ?? 0;

  return (
    <div className="mt-4">
      <p className="text-[0.78rem] font-bold text-slate-600 tracking-wide mb-2">Ramo de Sis2000</p>
      {cargandoRamos && <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" /> Consultando los ramos de Sis2000…</p>}
      {errorRamos && (
        <div className="space-y-3 mb-3">
          <Aviso tono="error">{errorRamos} Puedes escribir el número del ramo abajo.</Aviso>
          <Button variant="secondary" size="sm" onClick={() => void cargarRamos()}><RefreshCw size={13} /> Reintentar</Button>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {ramos.map((r) => (
          <button
            key={r.cramo}
            type="button"
            onClick={() => setRamoCombo(r.cramo)}
            className={cn(
              'px-4 py-2 rounded-full text-sm font-bold border transition-all',
              ramoCombo === r.cramo ? 'bg-indigo-700 text-white border-indigo-700' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300',
            )}
          >
            {r.xramo} <span className="font-normal opacity-75">· ramo {r.cramo}</span>
          </button>
        ))}
      </div>
      <form className="mt-3 flex items-center gap-2 max-w-sm" onSubmit={(e) => { e.preventDefault(); usarOtro(); }}>
        <Input inputMode="numeric" maxLength={4} value={otro} onChange={(e) => setOtro(e.target.value.replace(/\D/g, ''))}
          placeholder="¿Otro ramo? Escribe su número" aria-label="Número de ramo de Sis2000" />
        <Button type="submit" variant="secondary" size="sm">Usar</Button>
      </form>

      {ramoCombo != null && (
        <div className="mt-4">
          {(!catalogo || catalogo.cargando) && (
            <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" /> Consultando las coberturas de {xramo}…</p>
          )}
          {catalogo?.error && (
            <div className="space-y-3">
              <Aviso tono="error">{catalogo.error}</Aviso>
              <Button variant="secondary" size="sm" onClick={() => void cargarCatalogo(ramoCombo)}><RefreshCw size={13} /> Reintentar</Button>
            </div>
          )}
          {coberturas && (coberturas.length ? (
            <p className="text-[0.78rem] text-slate-600">
              <strong>{xramo}</strong>: {plural(coberturas.length, 'cobertura', 'coberturas')} con tarifa vigente
              {obligatorias > 0 && `, ${plural(obligatorias, 'obligatoria', 'obligatorias')}`}. Arma el combo en el paso de cotización.
            </p>
          ) : (
            <Aviso>{xramo} no tiene coberturas con tarifa vigente en Sis2000.</Aviso>
          ))}
        </div>
      )}
    </div>
  );
}
