import { useEffect, useState } from 'react';
import { Eye, Loader2, Search } from 'lucide-react';
import { buscarCotizaciones, type CotizacionGuardada, type FiltroCotizaciones } from '../api/cotizaciones';
import { Aviso } from '../components/ui/Aviso';
import { polizasDe } from '../cotizaciones/polizas';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Field, Input, Select } from '../components/ui/FormField';
import { SectionCard } from '../components/ui/SectionCard';
import { useWizardStore } from '../store/wizardStore';
import { ETIQUETA_ESTADO, estadoVisible } from './CotizacionGuardadaView';

const fecha = (v: string) => new Date(v).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** Filtro «Estado»: las vencidas no son un estado guardado, salen por vigencia. */
const ESTADOS: { valor: string; etiqueta: string; filtro: Pick<FiltroCotizaciones, 'estado' | 'vigencia'> }[] = [
  { valor: 'vigentes', etiqueta: 'Vigentes (15 días), pagadas y emitidas', filtro: { vigencia: 'vigentes' } },
  { valor: 'cotizada', etiqueta: 'Cotizadas', filtro: { vigencia: 'vigentes', estado: 'cotizada' } },
  { valor: 'pendiente_pago', etiqueta: 'Pendientes de pago', filtro: { vigencia: 'vigentes', estado: 'pendiente_pago' } },
  { valor: 'pagada', etiqueta: 'Pagadas', filtro: { vigencia: 'todas', estado: 'pagada' } },
  { valor: 'emitida', etiqueta: 'Emitidas', filtro: { vigencia: 'todas', estado: 'emitida' } },
  { valor: 'vencida', etiqueta: 'Vencidas', filtro: { vigencia: 'vencidas' } },
  { valor: 'todas', etiqueta: 'Todo el historial', filtro: { vigencia: 'todas' } },
];

/** Búsqueda de cotizaciones guardadas en Nexus (admin): por código, tomador, fecha y estado, con el historial completo. */
export function CotizacionesView() {
  const abrirConsulta = useWizardStore((w) => w.abrirConsulta);
  const [codigo, setCodigo] = useState('');
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState('vigentes');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [filas, setFilas] = useState<CotizacionGuardada[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buscar = async () => {
    setCargando(true);
    setError(null);
    try {
      setFilas(await buscarCotizaciones({ codigo, q, desde, hasta, ...ESTADOS.find((e) => e.valor === estado)?.filtro }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { void buscar(); }, [estado]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-5">
      <SectionCard title="Buscar cotizaciones" description="El cliente puede traer y pagar su cotización durante 15 días; aquí queda todo el historial." Icon={Search}>
        <form className="grid sm:grid-cols-3 gap-4" onSubmit={(e) => { e.preventDefault(); void buscar(); }}>
          <Field label="Código de cotización" hint="Completo o una parte.">
            <Input value={codigo} maxLength={24} placeholder="RCG-2026-000123" className="uppercase" onChange={(e) => setCodigo(e.target.value.toUpperCase())} />
          </Field>
          <Field label="RIF / cédula o nombre del tomador">
            <Input value={q} maxLength={80} onChange={(e) => setQ(e.target.value)} placeholder="J-12345678 o ACME" />
          </Field>
          <Field label="Estado">
            <Select value={estado} onChange={(e) => setEstado(e.target.value)}>
              {ESTADOS.map((e) => <option key={e.valor} value={e.valor}>{e.etiqueta}</option>)}
            </Select>
          </Field>
          <Field label="Creada desde"><Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></Field>
          <Field label="Creada hasta"><Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></Field>
          <div className="sm:pt-7">
            <Button variant="primary" size="lg" disabled={cargando} onClick={() => void buscar()}>
              {cargando ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} Buscar
            </Button>
          </div>
        </form>
      </SectionCard>

      {error && <Aviso tono="error">{error}</Aviso>}

      {filas && (
        filas.length === 0
          ? <p className="text-sm text-slate-500">No hay cotizaciones con esos filtros.</p>
          : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-[0.8rem]">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    {['Código', 'Tomador', 'RIF / cédula', 'Creada', 'Vence', 'Estado', 'Póliza', ''].map((c) => <th key={c} className="text-left font-bold px-3 py-2 whitespace-nowrap">{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => {
                    const visible = estadoVisible(f);
                    return (
                      <tr key={f.codigo} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-bold tabular-nums whitespace-nowrap">{f.codigo}</td>
                        <td className="px-3 py-2">{f.tomador.nombre}</td>
                        <td className="px-3 py-2 tabular-nums whitespace-nowrap">{f.tomador.documento ?? '—'}</td>
                        <td className="px-3 py-2 tabular-nums whitespace-nowrap">{fecha(f.creadaEn)}</td>
                        <td className="px-3 py-2 tabular-nums whitespace-nowrap">{fecha(f.expiraEn)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <Badge tone={visible === 'emitida' || visible === 'pagada' ? 'success' : visible === 'cotizada' ? 'indigo' : 'warn'}>{ETIQUETA_ESTADO[visible]}</Badge>
                        </td>
                        <td className="px-3 py-2 tabular-nums whitespace-nowrap">{polizasDe(f.poliza).map((p) => p.cnpoliza).join(' · ') || '—'}</td>
                        <td className="px-3 py-2 text-right">
                          <Button variant="ghost" size="sm" onClick={() => { abrirConsulta(f.codigo); window.scrollTo({ top: 0 }); }}><Eye size={13} /> Ver</Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filas.length >= 200 && <p className="text-[0.72rem] text-slate-500 px-3 py-2">Se muestran las 200 más recientes: afina los filtros para ver otras.</p>}
            </div>
          )
      )}
    </div>
  );
}
