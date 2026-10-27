import type { ReactNode } from 'react';
import { ArrowLeft, HelpCircle, Settings2, Sparkles, ShieldCheck } from 'lucide-react';
import { AuroraBackground } from './AuroraBackground';
import { TopProgressBar } from './TopProgressBar';
import { TopStepper } from './TopStepper';
import { Toaster } from './Toaster';
import { Badge } from './ui/Badge';
import { MODULE_META, MODULE_STEPS } from '../config/module.config';
import { useWizardStore } from '../store/wizardStore';
import { useCotizacionStore } from '../store/cotizacionStore';
import { esPersonalizado, useParametrosStore } from '../store/parametrosStore';
import { toast } from '../store/toastStore';

const NOMBRE_PRODUCTO = { rcg: 'RC General', rc: 'RC Patronal / Empresarial', planes: 'Planes RCG Sis2000 (prueba)' } as const;

const VISTA_PARAMETROS = {
  eyebrow: 'Configuración · Tarifa',
  title: 'Parámetros del cotizador',
  description: 'Rangos de tasa, primas mínimas, factores, topes, sublímites, coberturas y condiciones que usa el cálculo.',
};

/** Cascarón visual RCV: aurora + progreso + stepper píldora + cabecera + ayuda + toasts. */
export function ModuleShell({ children }: { children: ReactNode }) {
  const step = useWizardStore((s) => s.step);
  const vista = useWizardStore((s) => s.vista);
  const setVista = useWizardStore((s) => s.setVista);
  const producto = useCotizacionStore((s) => s.producto);
  const personalizado = useParametrosStore((s) => esPersonalizado(s));
  const parametros = vista === 'parametros';
  const current = parametros ? VISTA_PARAMETROS : MODULE_STEPS.find((s) => s.n === step) ?? MODULE_STEPS[0];

  return (
    <div className="min-h-screen relative">
      <Toaster />
      <AuroraBackground />
      {!parametros && (
        <div className="lg:hidden no-imprimir">
          <TopProgressBar />
        </div>
      )}

      <main className="flex-1 min-h-screen px-4 sm:px-6 lg:px-10 pb-32 lg:pb-12 pt-[72px] lg:pt-10">
        <div className={parametros ? 'max-w-6xl mx-auto' : 'max-w-5xl mx-auto'}>
          {!parametros && <div className="no-imprimir"><TopStepper /></div>}

          <header className="mb-8 animate-fade-in">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <p className="text-[0.68rem] font-black tracking-[0.22em] gradient-text-indigo uppercase mb-2 inline-flex items-center gap-1.5">
                  <Sparkles size={11} className="text-indigo-500" />
                  {current.eyebrow}
                </p>
                <h1 className="font-display text-3xl sm:text-[2.5rem] font-black text-slate-900 tracking-tight leading-tight">
                  {current.title}
                </h1>
                <p className="text-slate-500 text-sm mt-2 max-w-xl leading-relaxed">{current.description}</p>
                <p className="text-[0.65rem] text-slate-400 mt-3 font-medium flex items-center gap-2 flex-wrap">
                  <span>{MODULE_META.brandName} · {MODULE_META.productName}{producto && !parametros ? ` · ${NOMBRE_PRODUCTO[producto]}` : ''}</span>
                  {personalizado && <Badge tone="warn">Tarifa personalizada</Badge>}
                </p>
              </div>

              <div className="no-imprimir flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toast.info('¿Necesitas ayuda?', 'Actividades restringidas, límites mayores o tasas fuera de rango se cotizan con el Área Técnica de La Mundial.')}
                  className="hidden sm:inline-flex items-center gap-2 px-3.5 py-2 rounded-full glass-light text-slate-600 hover:text-indigo-600 text-xs font-bold transition-all hover:-translate-y-0.5"
                >
                  <HelpCircle size={13} />
                  ¿Necesitas ayuda?
                </button>
                <button
                  type="button"
                  onClick={() => { setVista(parametros ? 'cotizador' : 'parametros'); window.scrollTo({ top: 0 }); }}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-bold transition-all hover:-translate-y-0.5 ${
                    parametros ? 'bg-indigo-700 text-white shadow-[0_8px_22px_rgba(15,26,90,0.3)]' : 'glass-light text-slate-600 hover:text-indigo-600'
                  }`}
                >
                  {parametros ? <ArrowLeft size={13} /> : <Settings2 size={13} />}
                  {parametros ? 'Volver al cotizador' : 'Parámetros'}
                </button>
              </div>
            </div>
          </header>

          <section className="surface-card overflow-hidden">
            <div className="p-6 sm:p-8 lg:p-10">
              <div key={parametros ? 'parametros' : step} className="animate-spring-in">{children}</div>
            </div>

            <div className="no-imprimir hidden md:flex items-center justify-between gap-4 px-8 lg:px-10 py-5 border-t border-slate-100/80 bg-gradient-to-b from-slate-50/50 to-white/40 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <ShieldCheck size={13} className="text-emerald-500" />
                <span className="font-medium">
                  {personalizado ? 'Tarifa personalizada en este navegador' : 'Tarifa oficial La Mundial de Seguros'} · la cotización no constituye emisión de póliza
                </span>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
