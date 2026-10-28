import { useState, type ReactNode } from 'react';
import { Download, ExternalLink, FileCheck2, Loader2, Lock, Printer, RotateCcw, ShieldCheck, Stamp, User } from 'lucide-react';
import { useParametrosStore } from '../store/parametrosStore';
import { toast } from '../store/toastStore';
import { SectionCard } from '../components/ui/SectionCard';
import { StepActions } from '../components/ui/StepActions';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { importe, porcentaje } from '../tarifas/comun';
import { NOMBRES } from '../tarifas/rcp-rce';
import { rifCompleto, useCotizacionPlanesRcg, useCotizacionRc, useCotizacionRcg, useCotizacionStore } from '../store/cotizacionStore';
import { useWizardStore } from '../store/wizardStore';
import { usePlanesStore } from '../store/planesStore';
import { RAMO_RCG, armarEmisionPlan, primasTarifaRcg } from '../tarifas/planes-rcg';
import { Aviso } from '../components/ui/Aviso';
import { TablaCoberturas, TotalRc } from './CotizacionStep';
import { esPersonaNatural } from './TomadorStep';

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
  const planes = s.producto === 'planes';
  const resetPlanes = usePlanesStore((p) => p.reset);
  const cotRcg = useCotizacionRcg();
  const vigenciaDias = useParametrosStore((p) => p.rcg.vigenciaDias);
  const [generando, setGenerando] = useState(false);
  // Número provisional hasta tener el correlativo oficial desde el backend.
  const [numero] = useState(() => `RCG-${new Date().getFullYear()}-P${String(Date.now()).slice(-6)}`);

  const nueva = () => { s.reset(); resetPlanes(); resetWizard(); window.scrollTo({ top: 0 }); };

  const descargarRcg = async () => {
    setGenerando(true);
    try {
      // pdf-lib y las imágenes de la solicitud se cargan solo al generar el PDF.
      const { cargarAssetsRcg, descargarPdf, generarPdfRcg } = await import('../pdf/cotizacionRcgPdf');
      const bytes = await generarPdfRcg({
        numero, fecha: new Date(), asegurado: c.asegurado, rif: rifCompleto(c), moneda: s.rcg.moneda,
        indole: s.rcg.indole, actividadEspecifica: s.rcg.actividadEspecifica, correo: c.correo, intermediario: c.intermediario,
        ubicacion: c.ubicacion, esContrato: k.esContrato, numeroContrato: k.numero, objetoObra: k.objeto, coasegurado: k.coasegurado,
        sucursal: c.sucursal, elaboradoPor: c.emisor, alternativas: cotRcg.alternativas, coberturas: cotRcg.coberturas,
        deducible: cotRcg.deducible, notaIgtf: cotRcg.notaIgtf, condiciones: cotRcg.condiciones, vigenciaDias,
      }, await cargarAssetsRcg());
      descargarPdf(bytes, `Cotizacion_LaMundial_${c.asegurado.trim().replace(/\s+/g, '_') || 'RCG'}.pdf`);
      toast.success('Cotización descargada', `${numero} · 2 páginas de cotización + Solicitud de Seguro.`);
    } catch (e) {
      toast.error('No se pudo generar el PDF', e instanceof Error ? e.message : String(e));
    } finally {
      setGenerando(false);
    }
  };

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
          {planes && <Dato label="Teléfono">{c.telefono}</Dato>}
          {k.esContrato && <Dato label="Contrato">{[k.numero, s.producto !== 'rc' ? k.coasegurado : k.vigencia, k.objeto].filter(Boolean).join(' · ')}</Dato>}
        </div>
      </SectionCard>

      {rcg ? <ResumenRcg /> : planes ? <ResumenPlan /> : <ResumenRc />}

      {planes ? <EmitirPlan /> : (
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
      )}

      <p className="text-[0.72rem] text-slate-500">
        Cotización válida por {rcg ? vigenciaDias : 15} días continuos. No constituye emisión de póliza ni activación de cobertura.
        {rcg && <> N.º provisional <strong>{numero}</strong> (el correlativo oficial se asignará al conectar el backend).</>}
      </p>

      <StepActions continueLabel="" extra={(
        <>
          {rcg ? (
            <Button variant="primary" size="lg" onClick={descargarRcg} disabled={generando}>
              {generando ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              {generando ? 'Generando PDF…' : 'Descargar cotización PDF'}
            </Button>
          ) : (
            <Button variant="secondary" size="lg" onClick={() => window.print()}>
              <Printer size={15} />
              Imprimir / guardar PDF
            </Button>
          )}
          <Button variant="ghost" size="lg" onClick={nueva}>
            <RotateCcw size={15} />
            Nueva cotización
          </Button>
        </>
      )} />
    </div>
  );
}

function ResumenPlan() {
  const prm = useParametrosStore((p) => p.rcg);
  const rcg = useCotizacionStore((x) => x.rcg);
  const planSel = useCotizacionStore((x) => x.planSel);
  const planes = usePlanesStore((p) => p.planes);
  const ramos = usePlanesStore((p) => p.ramos);
  const cot = useCotizacionPlanesRcg(planes[0]?.suma);
  const plan = planes.find((p) => p.cplan === planSel);
  if (!plan) return <Aviso tono="error">No hay plan elegido: vuelve al paso de cotización.</Aviso>;
  const esRcg = plan.cramo === RAMO_RCG;
  const tarifa = esRcg ? primasTarifaRcg(planes, Number(rcg.tasa), prm).find((t) => t.cplan === plan.cplan) : undefined;
  const xramo = ramos.find((r) => r.cramo === plan.cramo)?.xramo ?? `Ramo ${plan.cramo}`;
  const usd = (n: number) => `USD ${importe(n)}`;

  return (
    <SectionCard title={`${plan.nombre} · Sis2000`} Icon={ShieldCheck} statusLabel={plan.cplan}
      description={esRcg ? `${rcg.indole} · ${rcg.actividadEspecifica} · tasa ${porcentaje(Number(rcg.tasa))}` : `${xramo} · ${rcg.actividadEspecifica}`}>
      <div className="grid sm:grid-cols-4 gap-4 mb-4">
        <Dato label="Suma asegurada">{usd(plan.suma)}</Dato>
        <Dato label="Prima Sis2000 (se emite)">{usd(plan.prima)}</Dato>
        {esRcg ? <Dato label="Prima tarifa RCG (referencia)">{tarifa ? usd(tarifa.prima) : '—'}</Dato> : <Dato label="Ramo">{xramo}</Dato>}
        <Dato label="Vigencia">Anual</Dato>
      </div>
      <ul className="text-[0.78rem] text-slate-600 grid sm:grid-cols-2 gap-x-6 gap-y-0.5 list-disc pl-5">
        {plan.coberturas.map((x) => <li key={x.nombre}>{x.nombre} · {importe(x.suma)}</li>)}
      </ul>
      {esRcg && <p className="text-[0.72rem] text-slate-500 mt-3"><strong>Deducible:</strong> {cot.deducible}</p>}
    </SectionCard>
  );
}

/** Emisión del plan por el partner patrimonial (mismo flujo que Emisión). Solo QA y con VITE_RCG_PLANES_EMITIR=1. */
function EmitirPlan() {
  const s = useCotizacionStore();
  const prm = useParametrosStore((p) => p.rcg);
  const { planes, emitiendo, emision, error, emitir } = usePlanesStore();
  const [acepta, setAcepta] = useState(false);
  const [pep, setPep] = useState(false);
  const habilitada = import.meta.env.VITE_RCG_PLANES_EMITIR === '1';
  const plan = planes.find((p) => p.cplan === s.planSel);
  const { comun: c, contrato: k, rcg } = s;

  const emitirAhora = async () => {
    if (!plan) return;
    const aviso = `Se emitirá en Sis2000 QA ${plan.nombre} (${plan.cplan}) por USD ${importe(plan.prima)} a nombre de ${c.asegurado}. `
      + 'El recibo queda pendiente de cobro. ¿Continuar?';
    if (!window.confirm(aviso)) return;
    const clase = prm.clases[rcg.clase];
    const r = await emitir(armarEmisionPlan({
      plan, tipoDoc: c.tipoDoc, documento: c.documento, nombre: c.asegurado,
      apellido: esPersonaNatural(c.tipoDoc) ? c.apellido : '', correo: c.correo, telefono: c.telefono, direccion: c.ubicacion,
      bien: [
        c.asegurado,
        c.ubicacion,
        plan.cramo === RAMO_RCG ? [clase?.etiqueta, rcg.indole].filter(Boolean).join(' · ') : '',
        [rcg.actividadEspecifica, k.esContrato ? `Contrato ${k.numero}: ${k.objeto} (coasegurado ${k.coasegurado})` : ''].filter(Boolean).join(' · '),
      ],
      pep, cproductor: Number(import.meta.env.VITE_RCG_PLANES_CPRODUCTOR) || 80080,
    }));
    if (r) toast.success('Póliza emitida en QA', `${r.cnpoliza} · recibo ${r.cnrecibo || '—'}`);
  };

  if (emision) {
    return (
      <SectionCard title="Póliza emitida en Sis2000 QA" Icon={FileCheck2} statusLabel="Emitida" statusTone="success">
        <div className="grid sm:grid-cols-3 gap-4">
          <Dato label="N.º de póliza">{emision.cnpoliza}</Dato>
          <Dato label="N.º de recibo">{emision.cnrecibo}</Dato>
          <Dato label="Documento">
            {emision.urlpoliza
              ? <a className="text-indigo-600 font-bold inline-flex items-center gap-1" href={emision.urlpoliza} target="_blank" rel="noreferrer">Ver póliza <ExternalLink size={12} /></a>
              : '—'}
          </Dato>
        </div>
        <p className="text-[0.72rem] text-slate-500 mt-3">Recibo pendiente de cobro en Sis2000.</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Emitir en Sis2000 QA" description="Partner patrimonial de nest-api (el mismo de Emisión)." Icon={habilitada ? FileCheck2 : Lock}
      statusLabel={habilitada ? 'Solo QA' : 'Deshabilitada'} statusTone="warning">
      <div className="space-y-3">
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" className="mt-0.5 w-4 h-4 accent-indigo-600" checked={pep} onChange={(e) => setPep(e.target.checked)} />
          El tomador es persona políticamente expuesta (PEP).
        </label>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" className="mt-0.5 w-4 h-4 accent-indigo-600" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} />
          El tomador declara que la información es veraz y acepta los Términos y Condiciones.
        </label>
        {error && <Aviso tono="error">{error}</Aviso>}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" size="lg" disabled={!habilitada || !acepta || !plan || emitiendo} onClick={() => void emitirAhora()}>
            {emitiendo ? <Loader2 size={15} className="animate-spin" /> : <FileCheck2 size={15} />}
            {emitiendo ? 'Emitiendo…' : 'Emitir en Sis2000 QA'}
          </Button>
          <p className="text-[0.78rem] text-slate-500 max-w-md">
            {habilitada
              ? 'Opción de prueba: la póliza queda con el recibo pendiente de cobro. Antes de producción debe pasar por Pagos.'
              : 'Para probar: VITE_RCG_PLANES_EMITIR=1 en .env.local (con NEST_API_URL de QA) y reiniciar npm run dev.'}
          </p>
        </div>
      </div>
    </SectionCard>
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
