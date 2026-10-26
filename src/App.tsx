import { ModuleShell } from './components/ModuleShell';
import { useWizardStore } from './store/wizardStore';
import { ProductoStep } from './features/ProductoStep';
import { TomadorStep } from './features/TomadorStep';
import { RiesgoStep } from './features/RiesgoStep';
import { CotizacionStep } from './features/CotizacionStep';
import { EmisionStep } from './features/EmisionStep';
import { ParametrosView } from './features/ParametrosView';

/** Enrutador por paso: Producto → Tomador → Riesgo → Cotización → Emisión; aparte, Parámetros. */
export default function App() {
  const step = useWizardStore((s) => s.step);
  const vista = useWizardStore((s) => s.vista);

  let content = <ProductoStep />;
  if (vista === 'parametros') content = <ParametrosView />;
  else if (step === 2) content = <TomadorStep />;
  else if (step === 3) content = <RiesgoStep />;
  else if (step === 4) content = <CotizacionStep />;
  else if (step === 5) content = <EmisionStep />;

  return <ModuleShell>{content}</ModuleShell>;
}
