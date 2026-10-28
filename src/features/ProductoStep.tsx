import { useEffect } from 'react';
import { Building2, Check, FlaskConical, HardHat, Layers, Loader2, RefreshCw } from 'lucide-react';
import { Aviso } from '../components/ui/Aviso';
import { Button } from '../components/ui/Button';
import { SectionCard } from '../components/ui/SectionCard';
import { StepActions } from '../components/ui/StepActions';
import { cn } from '../lib/utils';
import { useCotizacionStore, type Producto } from '../store/cotizacionStore';
import { usePlanesStore } from '../store/planesStore';
import { toast } from '../store/toastStore';
import type { Modo } from '../tarifas/rcp-rce';

const PRODUCTOS: { id: Producto; nombre: string; detalle: string; desc: string; Icon: typeof Building2 }[] = [
  {
    id: 'rcg', nombre: 'Responsabilidad Civil General', detalle: 'Ramo 28 · Producto 89', Icon: Building2,
    desc: 'Daños a terceros por la actividad del asegurado. Tres opciones de límite (I, II y III), con o sin contrato.',
  },
  {
    id: 'rc', nombre: 'RC Patronal / Empresarial', detalle: 'RCP · RCE', Icon: HardHat,
    desc: 'Responsabilidad del patrono frente a sus trabajadores (LOPCYMAT), calculada sobre la nómina anual.',
  },
  {
    id: 'planes', nombre: 'Planes Sis2000', detalle: 'Prueba · Riesgos generales', Icon: FlaskConical,
    desc: 'Los planes configurados en Sis2000 (naves, combinados, RC General…). Los planes nuevos aparecen solos. Cotiza en línea y emite en QA.',
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
  const { ramos, cargandoRamos, errorRamos, cargarRamos } = usePlanesStore();

  useEffect(() => {
    if (producto === 'planes' && !ramos.length && !cargandoRamos && !errorRamos) void cargarRamos();
  }, [producto]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-5">
      <SectionCard title="Ramo de Responsabilidad Civil" description="Selecciona el producto que deseas cotizar." Icon={Layers}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
          </div>
        )}
      </SectionCard>

      <StepActions onContinue={() => {
        if (!producto) { toast.warning('Selecciona un producto', 'Elige RC General, RC Patronal / Empresarial o los planes de Sis2000.'); return false; }
        if (producto === 'planes' && !ramos.some((r) => r.cramo === ramoSel)) { toast.warning('Selecciona un ramo', 'Elige el ramo de Sis2000 que deseas cotizar.'); return false; }
        return true;
      }} />
    </div>
  );
}
