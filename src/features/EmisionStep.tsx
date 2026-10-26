import type { ReactNode } from 'react';
import { Download, FileCheck2, Lock, RotateCcw, ShieldCheck, Stamp, User } from 'lucide-react';
import { SectionCard } from '../components/ui/SectionCard';
import { StepActions } from '../components/ui/StepActions';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { importe, porcentaje } from '../tarifas/comun';
import { NOMBRES } from '../tarifas/rcp-rce';
import { rifCompleto, useCotizacionRc, useCotizacionRcg, useCotizacionStore } from '../store/cotizacionStore';
import { useWizardStore } from '../store/wizardStore';
import { TablaCoberturas, TotalRc } from './CotizacionStep';

function Dato({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="text-sm text-slate-800 font-medium mt-0.5 break-words">{children || '—'}</p>
    </div>
  );
}

export function EmisionStep() {
  const s = useCotizacionStore();
  const resetWizard = useWizardStore((w) => w.reset);
  const { comun: c, contrato: k } = s;
  const rcg = s.producto === 'rcg';

  const nueva = () => { s.reset(); resetWizard(); window.scrollTo({ top: 0 }); };

  return (
    <div className="space-y-5">
      <SectionCard title="Tomador / asegurado" Icon={User} statusLabel="Cotización" statusTone="success">
        <div className="grid sm:grid-cols-3 gap-4">
          <Dato label="Nombre o razón social">{c.asegurado}</Dato>
          <Dato label="RIF">{rifCompleto(c)}</Dato>
          <Dato label="Correo">{c.correo}</Dato>
          <Dato label="Ubicación del riesgo">{c.ubicacion}</Dato>
          <Dato label="Intermediario">{c.intermediario}</Dato>
          <Dato label="Fecha">{new Date().toLocaleDateString('es-VE')}</Dato>
          <Dato label="Sucursal">{c.sucursal}</Dato>
          <Dato label="Elaborada por">{c.emisor}</Dato>
          {k.esContrato && <Dato label="Contrato">{[k.numero, rcg ? k.coasegurado : k.vigencia, k.objeto].filter(Boolean).join(' · ')}</Dato>}
        </div>
      </SectionCard>

      {rcg ? <ResumenRcg /> : <ResumenRc />}

      <SectionCard title="Emisión de la póliza" description="La emisión se conecta con Sis2000 al habilitar los planes del producto." Icon={Lock}
        statusLabel="Pendiente" statusTone="warning">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" size="lg" disabled title="Pendiente de habilitar en Sis2000">
            <FileCheck2 size={15} />
            Emitir póliza
          </Button>
          <p className="text-[0.78rem] text-slate-500 max-w-md">
            {rcg
              ? 'RCG: ramo 28 · producto 89 (planes PLANI, PLANII y PLAN3). Falta que La Mundial habilite los planes del productor en Sis2000.'
              : 'RCP / RCE: falta confirmar con La Mundial el ramo y producto en Sis2000.'}
          </p>
        </div>
      </SectionCard>

      <p className="text-[0.72rem] text-slate-500">Cotización válida por quince (15) días continuos. No constituye emisión de póliza ni activación de cobertura.</p>

      <StepActions continueLabel="" extra={(
        <>
          <Button variant="secondary" size="lg" onClick={() => window.print()}>
            <Download size={15} />
            Descargar / imprimir cotización
          </Button>
          <Button variant="ghost" size="lg" onClick={nueva}>
            <RotateCcw size={15} />
            Nueva cotización
          </Button>
        </>
      )} />
    </div>
  );
}

function ResumenRcg() {
  const rcg = useCotizacionStore((s) => s.rcg);
  const cot = useCotizacionRcg();
  const m = (n: number) => `${rcg.moneda} ${importe(n)}`;
  const elegida = cot.alternativas.find((a) => a.opcion === rcg.opcion) ?? cot.alternativas[0];

  return (
    <>
      <SectionCard title="Responsabilidad Civil General" description={`${rcg.indole} · ${rcg.actividadEspecifica} · tasa ${porcentaje(Number(rcg.tasa))}`} Icon={ShieldCheck}>
        <div className="grid sm:grid-cols-3 gap-3 mb-4">
          {cot.alternativas.map((a) => (
            <div key={a.opcion} className={`rounded-2xl border p-4 ${a.opcion === elegida?.opcion ? 'border-indigo-400 bg-indigo-50/60 ring-2 ring-indigo-200' : 'border-slate-200'}`}>
              <div className="flex items-center justify-between">
                <p className="font-display font-bold text-slate-900">Opción {a.opcion}</p>
                {a.opcion === elegida?.opcion && <Badge tone="indigo">Elegida</Badge>}
              </div>
              <p className="font-display text-2xl font-black gradient-text-indigo tabular-nums mt-1">{m(a.prima)}</p>
              <p className="text-[0.78rem] text-slate-500 mt-1">Límite: {m(a.limite)}</p>
            </div>
          ))}
        </div>
        <TablaCoberturas cot={cot} />
        <p className="text-[0.72rem] text-slate-500 mt-3"><strong>Deducible:</strong> {cot.deducible}</p>
        {cot.notaIgtf && <p className="text-[0.72rem] text-slate-500 mt-1">No incluye el 3 % del IGTF; tómelo en cuenta al pagar la prima.</p>}
      </SectionCard>
      <SectionCard title="Condiciones especiales" Icon={Stamp}>
        <ul className="list-disc pl-5 space-y-1 text-[0.82rem] text-slate-700">
          {cot.condiciones.map((x) => <li key={x}>{x}</li>)}
        </ul>
      </SectionCard>
    </>
  );
}

function ResumenRc() {
  const cot = useCotizacionRc();
  const m = (n: number) => `${cot.simbolo} ${importe(n)}`;

  return (
    <>
      {cot.resultados.map((r) => (
        <SectionCard key={r.k} title={NOMBRES[r.k]} description={r.riesgo?.[0]} Icon={ShieldCheck}
          statusLabel={r.opcion ? `Opción ${r.opcion}` : undefined}>
          <div className="grid sm:grid-cols-4 gap-4">
            <Dato label="Tasa final">{porcentaje(r.tasaEfectiva)}</Dato>
            <Dato label="Límite por trabajador">{m(r.limites[0])}</Dato>
            <Dato label="Dos o más trabajadores">{m(r.limites[1])}</Dato>
            <Dato label="Por evento / año póliza">{m(r.limites[2])}</Dato>
          </div>
          {r.opciones && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 mt-4">
              <table className="w-full text-[0.78rem]">
                <thead className="bg-slate-50 text-slate-600">
                  <tr><th className="text-left font-bold px-3 py-2">Concepto</th>{r.opciones.map((o) => <th key={o.id} className="text-right font-bold px-3 py-2">Opción {o.id}</th>)}</tr>
                </thead>
                <tbody>
                  {([
                    ['Prima básica', (o) => o.primaBasica],
                    ['Ajuste', (o) => o.ajuste],
                    ['Coberturas adicionales', (o) => o.primaOpcionales],
                    ['Ajuste a mínimo / diferenciación', (o) => o.ajusteMinimo + o.diferenciacion],
                    ['Prima', (o) => o.prima],
                  ] as [string, (o: NonNullable<typeof r.opciones>[number]) => number][]).map(([t, f]) => (
                    <tr key={t} className={`border-t border-slate-100 ${t === 'Prima' ? 'font-bold' : ''}`}>
                      <td className="px-3 py-1.5">{t}</td>
                      {r.opciones!.map((o) => <td key={o.id} className="px-3 py-1.5 text-right tabular-nums">{importe(f(o))}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {r.nota && <p className="text-[0.72rem] text-slate-500 mt-3">{r.nota}</p>}
        </SectionCard>
      ))}
      <TotalRc total={m(cot.total)} detalle={`Nómina anual ${m(cot.nomina)}`} />
    </>
  );
}
