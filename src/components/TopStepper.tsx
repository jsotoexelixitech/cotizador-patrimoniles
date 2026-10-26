import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { MODULE_STEPS } from '../config/module.config';
import { useWizardStore } from '../store/wizardStore';

/**
 * Stepper RCV — píldora blanca + flechas ◀ ▶. Solo permite saltar a pasos ya validados.
 */
export function TopStepper() {
  const step = useWizardStore((s) => s.step);
  const goTo = useWizardStore((s) => s.goTo);
  const alcanzado = useWizardStore((s) => s.alcanzado);
  const steps = MODULE_STEPS.filter((s) => s.n <= 5);

  const canPrev = step > 1 && step <= 5;
  const canNext = step < alcanzado;

  return (
    <div className="w-full mb-8 animate-fade-in">
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => canPrev && goTo(step - 1)}
          disabled={!canPrev}
          className="flex-shrink-0 w-9 h-9 rounded-full bg-slate-700 text-white grid place-items-center shadow-md hover:bg-slate-800 transition-colors disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-slate-700"
          aria-label="Paso anterior"
        >
          <ChevronLeft size={18} strokeWidth={2.5} />
        </button>

        <nav
          className="flex-1 min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden bg-white rounded-full shadow-[0_8px_32px_rgba(15,23,42,0.09)] border border-slate-200/70 px-5 py-3.5"
          aria-label="Progreso de suscripción"
        >
          <ol className="flex items-center gap-5 xl:gap-8 min-w-max">
            {steps.map(({ n, label, Icon }) => {
              const isComplete = n < step;
              const isActive = n === step;

              return (
                <li key={n} className="flex items-center gap-2.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => goTo(n)}
                    disabled={n > alcanzado}
                    className="flex items-center gap-2.5 text-left rounded-lg transition-opacity cursor-pointer hover:opacity-80 disabled:cursor-not-allowed disabled:hover:opacity-100"
                  >
                    <div
                      className={`
                        w-10 h-10 rounded-full grid place-items-center flex-shrink-0 transition-colors duration-200
                        ${isComplete
                          ? 'bg-emerald-500 shadow-[0_4px_12px_rgba(16,185,129,0.35)]'
                          : isActive
                            ? 'bg-sky-50 ring-2 ring-sky-200/80'
                            : 'bg-slate-100'
                        }
                      `}
                    >
                      {isComplete ? (
                        <Check size={18} className="text-white" strokeWidth={3} />
                      ) : (
                        <Icon
                          size={18}
                          className={isActive ? 'text-slate-600' : 'text-slate-400'}
                          strokeWidth={2}
                        />
                      )}
                    </div>

                    <div className="min-w-0">
                      <p
                        className={`text-[0.62rem] font-bold tracking-[0.12em] uppercase leading-none ${
                          isComplete ? 'text-emerald-500' : isActive ? 'text-sky-600' : 'text-slate-400'
                        }`}
                      >
                        PASO 0{n}
                      </p>
                      <p
                        className={`mt-1 text-[0.88rem] font-bold leading-tight truncate max-w-[9.5rem] ${
                          isComplete || isActive ? 'text-[#0f1a5a]' : 'text-slate-400'
                        }`}
                      >
                        {label}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <button
          type="button"
          onClick={() => canNext && goTo(step + 1)}
          disabled={!canNext}
          className="flex-shrink-0 w-9 h-9 rounded-full bg-slate-700 text-white grid place-items-center shadow-md hover:bg-slate-800 transition-colors disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-slate-700"
          aria-label="Paso siguiente"
        >
          <ChevronRight size={18} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
