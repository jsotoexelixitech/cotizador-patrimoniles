import { useWizardStore } from '../store/wizardStore';
import { MODULE_STEPS } from '../config/module.config';

/** Barra de progreso móvil (sticky superior). */
export function TopProgressBar() {
  const step = useWizardStore((s) => s.step);
  const pct = Math.round((step / MODULE_STEPS.length) * 100);

  return (
    <div className="fixed top-0 inset-x-0 z-40 lg:hidden">
      <div className="h-1 bg-slate-200/80">
        <div
          className="h-full bg-gradient-to-r from-indigo-700 via-violet-500 to-fuchsia-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
