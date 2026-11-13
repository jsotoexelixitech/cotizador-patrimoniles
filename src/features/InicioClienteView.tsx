import { useState } from 'react';
import { ArrowRight, Calculator, Search } from 'lucide-react';
import { esCodigoOficial } from '../api/cotizaciones';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/FormField';
import { useWizardStore } from '../store/wizardStore';

/** Portada de la vista cliente: cotizar de nuevo o traer una cotización por su código para elegir opción y pagar. */
export function InicioClienteView() {
  const setVista = useWizardStore((w) => w.setVista);
  const abrirConsulta = useWizardStore((w) => w.abrirConsulta);
  const [codigo, setCodigo] = useState('');
  const [intento, setIntento] = useState(false);
  const valido = esCodigoOficial(codigo);
  const buscar = () => { setIntento(true); if (valido) abrirConsulta(codigo); };

  return (
    <div className="grid md:grid-cols-2 gap-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 flex flex-col">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 grid place-items-center shadow-[0_4px_14px_rgba(15,26,90,0.3)]">
          <Calculator size={18} className="text-white" strokeWidth={2.2} />
        </div>
        <h2 className="font-display text-xl font-black text-slate-900 mt-4">Nueva cotización</h2>
        <p className="text-sm text-slate-500 mt-1.5 leading-relaxed flex-1">
          Cuéntanos de tu negocio y elige la suma asegurada. En pocos pasos tendrás tres opciones con su prima anual y un código para volver cuando quieras.
        </p>
        <div className="mt-5">
          <Button variant="primary" size="lg" onClick={() => { setVista('cotizador'); window.scrollTo({ top: 0 }); }}>
            Cotizar ahora <ArrowRight size={15} />
          </Button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 flex flex-col">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 grid place-items-center shadow-[0_4px_14px_rgba(15,26,90,0.3)]">
          <Search size={18} className="text-white" strokeWidth={2.2} />
        </div>
        <h2 className="font-display text-xl font-black text-slate-900 mt-4">Ya tengo un código de cotización</h2>
        <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
          Trae tu cotización, elige una de las tres opciones, paga en línea y recibe tu póliza. El código vale 15 días.
        </p>
        <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); buscar(); }}>
          <Field label="Código de cotización" error={intento && !valido ? (/-P\d{6}$/i.test(codigo.trim()) ? 'Ese número es provisional: esa cotización no quedó guardada y no se puede traer. Pide una cotización nueva.' : 'El código tiene esta forma: RCG-2026-000123-7KQ4.') : undefined}>
            <Input value={codigo} maxLength={24} placeholder="RCG-2026-000123-7KQ4" className="uppercase tabular-nums"
              onChange={(e) => setCodigo(e.target.value.toUpperCase().replace(/\s+/g, ''))} />
          </Field>
          <Button variant="secondary" size="lg" onClick={buscar}><Search size={15} /> Traer mi cotización</Button>
        </form>
      </section>
    </div>
  );
}
