import { ModuleShell } from './components/ModuleShell';
import { useWizardStore } from './store/wizardStore';
import { ProductoStep } from './features/ProductoStep';
import { TomadorStep } from './features/TomadorStep';
import { RiesgoStep } from './features/RiesgoStep';
import { CotizacionStep } from './features/CotizacionStep';
import { EmisionStep } from './features/EmisionStep';
import { ParametrosView } from './features/ParametrosView';
import { PastoraView } from './features/PastoraView';
import { CotizacionesView } from './features/CotizacionesView';
import { CotizacionGuardadaView } from './features/CotizacionGuardadaView';
import { InicioClienteView } from './features/InicioClienteView';

/**
 * Enrutador por paso: Producto → Tomador → Riesgo → Cotización → Emisión; aparte, Parámetros, Pastora, la búsqueda de
 * cotizaciones (admin), la portada del cliente y la cotización guardada (opciones, pago y póliza).
 */
export default function App() {
  const step = useWizardStore((s) => s.step);
  const vista = useWizardStore((s) => s.vista);

  let content = <ProductoStep />;
  if (vista === 'parametros') content = <ParametrosView />;
  else if (vista === 'pastora') content = <PastoraView />;
  else if (vista === 'cotizaciones') content = <CotizacionesView />;
  else if (vista === 'consulta') content = <CotizacionGuardadaView />;
  else if (vista === 'inicio') content = <InicioClienteView />;
  else if (step === 2) content = <TomadorStep />;
  else if (step === 3) content = <RiesgoStep />;
  else if (step === 4) content = <CotizacionStep />;
  else if (step === 5) content = <EmisionStep />;

  return <ModuleShell>{content}</ModuleShell>;
}
