import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from './Button';
import { useWizardStore } from '../../store/wizardStore';

/** Pie de paso homologado: Atrás / Continuar. `onContinue` devuelve false para no avanzar. */
export function StepActions({
  continueLabel = 'Continuar',
  onContinue,
  extra,
}: {
  continueLabel?: string;
  onContinue?: () => boolean;
  extra?: ReactNode;
}) {
  const step = useWizardStore((s) => s.step);
  const nextStep = useWizardStore((s) => s.nextStep);
  const prevStep = useWizardStore((s) => s.prevStep);

  return (
    <div className="no-imprimir flex flex-wrap items-center gap-3 pt-2">
      {step > 1 && (
        <Button variant="secondary" size="lg" onClick={prevStep}>
          <ArrowLeft size={15} />
          Atrás
        </Button>
      )}
      {extra}
      {continueLabel && (
        <Button
          variant="primary"
          size="lg"
          onClick={() => {
            if (onContinue && !onContinue()) return;
            nextStep();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          {continueLabel}
          <ArrowRight size={15} />
        </Button>
      )}
    </div>
  );
}
