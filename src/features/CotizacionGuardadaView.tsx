import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, Check, Copy, CreditCard, Download, ExternalLink, FileCheck2, FileText, Loader2, Pencil, RefreshCw, Search, ShieldCheck, User,
} from 'lucide-react';
import {
  crearCheckout, ErrorCotizacion, esCodigoOficial, reintentarCotizacion, traerCotizacion, type Checkout, type CotizacionGuardada,
} from '../api/cotizaciones';
import { Aviso } from '../components/ui/Aviso';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/FormField';
import { SectionCard } from '../components/ui/SectionCard';
import { MODO_CLIENTE } from '../config/modoCliente';
import { estadoParaReabrir, huellaCotizacion, type AlternativaGuardada, type DatosCotizacion, type Opcion } from '../cotizaciones/snapshot';
import { cn } from '../lib/utils';
import { documentosRcg, urlDocumento } from '../pdf/condicionadosRcg';
import { useCotizacionGuardadaStore } from '../store/cotizacionGuardadaStore';
import { useCotizacionStore } from '../store/cotizacionStore';
import { useParametrosStore } from '../store/parametrosStore';
import { usePlanesStore } from '../store/planesStore';
import { toast } from '../store/toastStore';
import { useWizardStore } from '../store/wizardStore';
import { importe, porcentaje } from '../tarifas/comun';

const fecha = (v: string) => new Date(v).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });

export const ETIQUETA_ESTADO: Record<string, string> = {
  cotizada: 'Cotizada', pendiente_pago: 'Pendiente de pago', pagada: 'Pagada', emitida: 'Emitida', vencida: 'Vencida',
};

/** Estado que se muestra: una cotización sin pagar con los 15 días cumplidos se ve como vencida. */
export const estadoVisible = (c: Pick<CotizacionGuardada, 'estado' | 'vencida'>) => (c.vencida ? 'vencida' : c.estado);

/** A dónde vuelve el cliente después de pagar: esta misma página (Nexus le agrega ?cotizacion=CÓDIGO). */
function urlDeRetorno(): string {
  const u = new URL(window.location.href);
  const cliente = u.searchParams.get('vista') === 'cliente';
  u.search = '';
  u.hash = '';
  if (cliente) u.searchParams.set('vista', 'cliente');
  return u.toString();
}

/** Pantalla para escribir el código de cotización. */
function BuscarCodigo() {
  const abrirConsulta = useWizardStore((w) => w.abrirConsulta);
  const reset = useWizardStore((w) => w.reset);
  const [codigo, setCodigo] = useState('');
  const [intento, setIntento] = useState(false);
  const valido = esCodigoOficial(codigo);
  const buscar = () => { setIntento(true); if (valido) abrirConsulta(codigo); };
  return (
    <div className="space-y-5">
      <SectionCard title="Trae tu cotización" description="Escribe el código que recibiste al cotizar (también está en el PDF y en el correo)." Icon={Search}>
        <form className="grid sm:grid-cols-[1fr_auto] gap-3 items-start" onSubmit={(e) => { e.preventDefault(); buscar(); }}>
          <Field label="Código de cotización" error={intento && !valido ? (/-Pd{6}$/i.test(codigo.trim()) ? 'Ese número es provisional: esa cotización no quedó guardada y no se puede traer. Pide una cotización nueva.' : 'El código tiene esta forma: RCG-2026-000123-7KQ4.') : undefined}>
            <Input value={codigo} maxLength={24} autoFocus placeholder="RCG-2026-000123-7KQ4" className="uppercase tabular-nums"
              onChange={(e) => setCodigo(e.target.value.toUpperCase().replace(/\s+/g, ''))} />
          </Field>
          <div className="sm:pt-7"><Button variant="primary" size="lg" onClick={buscar}><Search size={15} /> Buscar</Button></div>
        </form>
        <p className="text-[0.72rem] text-slate-500 mt-3">Las cotizaciones se pueden traer y pagar durante 15 días continuos.</p>
      </SectionCard>
      {MODO_CLIENTE && <Button variant="ghost" size="lg" onClick={reset}><ArrowLeft size={15} /> Volver al inicio</Button>}
    </div>
  );
}

export function CotizacionGuardadaView() {
  const codigo = useWizardStore((w) => w.codigoConsulta);
  return codigo ? <Cotizacion key={codigo} codigo={codigo} /> : <BuscarCodigo />;
}

/** Tarjeta de una opción (I, II o III): suma asegurada y prima anual. */
function TarjetaAlternativa({ a, moneda, activa, elegible, tecnica, onClick }: {
  a: AlternativaGuardada; moneda: string; activa: boolean; elegible: boolean; tecnica: boolean; onClick: () => void;
}) {
  const m = (n: number) => `${moneda} ${importe(n)}`;
  return (
    <button type="button" onClick={onClick} disabled={!elegible} aria-pressed={activa}
      className={cn('text-left rounded-2xl border p-4 transition-all disabled:cursor-default',
        activa ? 'border-indigo-400 bg-indigo-50/60 ring-2 ring-indigo-200' : 'border-slate-200 bg-white', elegible && !activa && 'hover:border-indigo-200')}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="font-display font-bold text-slate-900">Opción {a.opcion}</p>
        {activa && <span className="w-6 h-6 rounded-full bg-indigo-600 text-white grid place-items-center"><Check size={12} strokeWidth={3} /></span>}
      </div>
      <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-400">Suma asegurada</p>
      <p className="font-display text-lg font-black text-slate-900 tabular-nums">{m(a.limite)}</p>
      <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-400 mt-2">Prima anual</p>
      <p className="font-display text-2xl font-black gradient-text-indigo tabular-nums">{m(a.prima)}</p>
      {a.detalle && a.detalle.length > 1 && (
        <div className="text-[0.72rem] text-slate-500 mt-2 space-y-0.5">{a.detalle.map((d) => <p key={d.nombre}>{d.nombre}: {m(d.prima)}</p>)}</div>
      )}
      {/* Tasas y descuento: solo perfiles técnicos; el cliente ve la prima final. */}
      {tecnica && a.descuentoPct != null && a.tasaInicial != null && a.tasaAplicada != null && (
        <p className="text-[0.72rem] text-slate-500 mt-2">Descuento {porcentaje(a.descuentoPct)}: tasa {porcentaje(a.tasaInicial)} → {porcentaje(Number(a.tasaAplicada.toFixed(5)))}</p>
      )}
    </button>
  );
}

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="text-sm text-slate-800 font-medium mt-0.5 break-words">{children || '—'}</p>
    </div>
  );
}

/** Cada cuánto se consulta el estado mientras se paga o se emite, y hasta cuándo. */
const ESPERA_MS = 5000;
const MAX_CONSULTAS = 120;

function Cotizacion({ codigo }: { codigo: string }) {
  const admin = !MODO_CLIENTE;
  const abrirConsulta = useWizardStore((w) => w.abrirConsulta);
  const abrirEnPaso = useWizardStore((w) => w.abrirEnPaso);
  const setVista = useWizardStore((w) => w.setVista);
  const reset = useWizardStore((w) => w.reset);
  const vistaTecnica = useParametrosStore((p) => p.vistaTecnica);
  const [cot, setCot] = useState<CotizacionGuardada | null>(null);
  const [error, setError] = useState<{ mensaje: string; status: number } | null>(null);
  const [opcion, setOpcion] = useState<Opcion | null>(null);
  const [acepta, setAcepta] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [errorPago, setErrorPago] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const consultas = useRef(0);

  const cargar = async (silencioso = false) => {
    try {
      const c = await traerCotizacion(codigo, admin);
      setCot(c);
      setError(null);
      setOpcion((o) => o ?? c.opcion ?? c.datos?.opcionElegida ?? c.datos?.alternativas[0]?.opcion ?? null);
    } catch (e) {
      if (!silencioso) setError({ mensaje: e instanceof Error ? e.message : String(e), status: e instanceof ErrorCotizacion ? e.status : 0 });
    }
  };
  useEffect(() => { void cargar(); }, [codigo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mientras el pago está en curso o la póliza se está emitiendo, se consulta el estado: la emisión ocurre en Nexus.
  const enEspera = !!cot && !cot.vencida && !cot.error && (cot.estado === 'pendiente_pago' || cot.estado === 'pagada');
  useEffect(() => {
    if (!enEspera) return;
    const t = setInterval(() => { if (consultas.current++ < MAX_CONSULTAS) void cargar(true); }, ESPERA_MS);
    return () => clearInterval(t);
  }, [enEspera]); // eslint-disable-line react-hooks/exhaustive-deps

  const volver = () => (admin ? setVista('cotizaciones') : reset());

  if (error) {
    return (
      <div className="space-y-5">
        <Aviso tono="error">{error.mensaje}</Aviso>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" size="lg" onClick={() => abrirConsulta('')}><Search size={15} /> Probar con otro código</Button>
          {error.status !== 404 && error.status !== 410 && <Button variant="ghost" size="lg" onClick={() => void cargar()}><RefreshCw size={15} /> Reintentar</Button>}
          {MODO_CLIENTE && <Button variant="primary" size="lg" onClick={() => { reset(); setVista('cotizador'); }}>Hacer una cotización nueva</Button>}
        </div>
      </div>
    );
  }
  if (!cot || !cot.datos) return <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" /> Buscando la cotización {codigo}…</p>;

  const d: DatosCotizacion = cot.datos;
  const m = (n: number) => `${d.moneda} ${importe(n)}`;
  const visible = estadoVisible(cot);
  const abierta = !cot.vencida && (cot.estado === 'cotizada' || cot.estado === 'pendiente_pago');
  const elegida = d.alternativas.find((a) => a.opcion === (abierta ? opcion : cot.opcion ?? opcion)) ?? null;
  const pagable = (o: Opcion | null) => !!o && !!d.emisiones?.[o];
  const indice = elegida ? d.alternativas.indexOf(elegida) : 0;

  const pagar = async () => {
    if (!elegida) return;
    setOcupado(true);
    setErrorPago(null);
    try {
      const c = await crearCheckout(cot.codigo, elegida.opcion, urlDeRetorno());
      if (MODO_CLIENTE) { window.location.assign(c.checkoutUrl); return; }
      setCheckout(c);
      consultas.current = 0;
      await cargar(true);
    } catch (e) {
      setErrorPago(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  };

  const reintentar = async () => {
    setOcupado(true);
    try {
      setCot(await reintentarCotizacion(cot.codigo));
      toast.success('Reintento hecho', cot.codigo);
    } catch (e) {
      toast.error('No se pudo reintentar', e instanceof Error ? e.message : String(e));
      await cargar(true);
    } finally {
      setOcupado(false);
    }
  };

  /** Admin: carga la cotización en el asistente. Vigente y sin cambios conserva su código; si se modifica, nace otra. */
  const reabrir = () => {
    const estado = estadoParaReabrir(d);
    if (!estado) { toast.error('No se puede reabrir', 'La cotización no trae el estado del cotizador.'); return; }
    useCotizacionStore.setState(estado);
    usePlanesStore.getState().reset();
    const prm = useParametrosStore.getState();
    useCotizacionGuardadaStore.setState(abierta
      ? { huella: huellaCotizacion(estado, { rcg: prm.rcg, rc: prm.rc }), codigo: cot.codigo, expiraEn: cot.expiraEn, guardando: false, error: null }
      : { huella: null, codigo: null, expiraEn: null, guardando: false, error: null });
    abrirEnPaso(4);
    window.scrollTo({ top: 0 });
  };

  const docs = d.producto === 'rcg' ? documentosRcg(d.coberturas.map((x) => x.nombre), d.moneda) : [];
  const urlPago = checkout?.checkoutUrl ?? cot.pago?.checkoutUrl;

  return (
    <div className="space-y-5">
      <SectionCard title={`Cotización ${cot.codigo}`} description={d.nombreProducto} Icon={User}
        statusLabel={ETIQUETA_ESTADO[visible]} statusTone={visible === 'emitida' || visible === 'pagada' ? 'success' : visible === 'cotizada' ? 'neutral' : 'warning'}>
        <div className="grid sm:grid-cols-3 gap-4">
          <Dato label="Tomador / asegurado">{d.tomador.nombre}</Dato>
          <Dato label="RIF / cédula">{d.tomador.rif}</Dato>
          <Dato label="Correo">{d.tomador.correo}</Dato>
          <Dato label="Actividad">{[d.riesgo.indole, d.riesgo.actividad].filter(Boolean).join(' · ')}</Dato>
          <Dato label="Ubicación del riesgo">{d.tomador.ubicacion}</Dato>
          <Dato label={cot.vencida ? 'Venció el' : 'Válida hasta'}>{fecha(cot.expiraEn)}</Dato>
          {d.riesgo.contrato && <Dato label="Contrato">{d.riesgo.contrato}</Dato>}
          {admin && <Dato label="Creada">{fecha(cot.creadaEn)} · {cot.origen === 'cliente' ? 'por el cliente' : 'por el canal'}</Dato>}
        </div>
      </SectionCard>

      {cot.vencida && <Aviso>Esta cotización venció el {fecha(cot.expiraEn)}: ya no se puede pagar. {admin ? 'Puedes reabrirla para cotizar de nuevo.' : 'Haz una cotización nueva.'}</Aviso>}
      {d.mesaTecnica && <Aviso><strong>Sujeta a aprobación de la mesa técnica.</strong> Tu asesor de seguros te confirmará la cotización.</Aviso>}

      <SectionCard title={abierta ? 'Elige tu opción' : 'Opciones cotizadas'} Icon={ShieldCheck}
        description={abierta ? 'Las tres opciones cubren lo mismo; cambia la suma asegurada y la prima anual.' : undefined}>
        <div className="grid sm:grid-cols-3 gap-3">
          {d.alternativas.map((a) => (
            <TarjetaAlternativa key={a.opcion} a={a} moneda={d.moneda} activa={elegida?.opcion === a.opcion} elegible={abierta} tecnica={admin && vistaTecnica}
              onClick={() => { setOpcion(a.opcion); setCheckout(null); }} />
          ))}
        </div>
        {d.coberturas.length > 0 && elegida && (
          <div className="overflow-x-auto rounded-xl border border-slate-200 mt-4">
            <table className="w-full text-[0.78rem]">
              <thead className="bg-slate-50 text-slate-600">
                <tr><th className="text-left font-bold px-3 py-2">Cobertura</th><th className="text-right font-bold px-3 py-2">Opción {elegida.opcion}</th></tr>
              </thead>
              <tbody>
                {d.coberturas.map((x) => (
                  <tr key={x.nombre} className="border-t border-slate-100">
                    <td className="px-3 py-1.5">{x.nombre}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{importe(x.montos[indice] ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {d.deducible && <p className="text-[0.72rem] text-slate-500 mt-3"><strong>Deducible:</strong> {d.deducible}</p>}
        {d.condiciones.length > 0 && <ul className="list-disc pl-5 mt-2 space-y-0.5 text-[0.72rem] text-slate-500">{d.condiciones.map((x) => <li key={x}>{x}</li>)}</ul>}
      </SectionCard>

      {abierta && (
        <SectionCard title={admin ? 'Mandar a pagar' : 'Pagar y emitir la póliza'} Icon={CreditCard}
          description={admin
            ? 'Genera el enlace del módulo de Pagos. Con el pago confirmado la póliza se emite sola, como pagada.'
            : 'Pagas en línea y, con el pago confirmado, tu póliza se emite de inmediato.'}
          statusLabel={cot.estado === 'pendiente_pago' ? 'Pago en curso' : undefined} statusTone="warning">
          {!pagable(elegida?.opcion ?? null) ? (
            <Aviso>
              {elegida ? `La opción ${elegida.opcion} no está disponible para pago en línea. ` : ''}
              {admin ? d.sinPagoEnLinea.join(' ') : 'Tu asesor de seguros te ayudará a emitirla.'}
            </Aviso>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-700">
                Opción <strong>{elegida!.opcion}</strong> · suma asegurada <strong>{m(elegida!.limite)}</strong> · prima anual <strong>{m(elegida!.prima)}</strong>.
                {d.notaIgtf && ' El pago es en bolívares a la tasa oficial del BCV del día.'}
              </p>
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input type="checkbox" className="mt-0.5 w-4 h-4 accent-indigo-600" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} />
                {admin ? 'El tomador aprobó esta opción, declara que la información es veraz y acepta los Términos y Condiciones.'
                  : 'Apruebo esta opción, declaro que la información es veraz y acepto los Términos y Condiciones.'}
              </label>
              {errorPago && <Aviso tono="error">{errorPago}</Aviso>}
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary" size="lg" disabled={!acepta || ocupado} onClick={() => void pagar()}>
                  {ocupado ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />}
                  {ocupado ? 'Abriendo el pago…' : admin ? 'Generar enlace de pago' : `Pagar ${m(elegida!.prima)}`}
                </Button>
                {cot.estado === 'pendiente_pago' && (
                  <p className="text-[0.78rem] text-slate-500 flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> Esperando la confirmación del pago… Si ya pagaste, la póliza aparecerá aquí.</p>
                )}
              </div>
              {admin && checkout && urlPago && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                  <p className="text-[0.78rem] text-slate-600">Enlace de pago · {`Bs ${importe(checkout.totalVes)}`}{checkout.tasa !== 1 ? ` (tasa BCV ${importe(checkout.tasa)})` : ''}. Vence en unas 2 horas.</p>
                  <p className="text-[0.72rem] text-slate-500 break-all">{urlPago}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" onClick={() => { void navigator.clipboard.writeText(urlPago).then(() => toast.success('Enlace copiado', cot.codigo)); }}><Copy size={13} /> Copiar enlace</Button>
                    <a href={urlPago} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[0.78rem] font-bold text-indigo-600 px-2"><ExternalLink size={13} /> Abrir el pago</a>
                  </div>
                </div>
              )}
            </div>
          )}
        </SectionCard>
      )}

      {cot.estado === 'pagada' && (
        <SectionCard title="Pago recibido" Icon={CreditCard} statusLabel="Pagada" statusTone="success">
          {cot.error
            ? <Aviso>{admin ? 'El pago está confirmado pero la emisión falló: revisa el log de nexus-api y reintenta.' : cot.error}</Aviso>
            : <p className="flex items-center gap-2 text-sm text-slate-700"><Loader2 size={14} className="animate-spin" /> Recibimos tu pago{cot.pago?.referencia ? ` (referencia ${cot.pago.referencia})` : ''}. Estamos emitiendo la póliza…</p>}
          {admin && cot.error && <div className="mt-3"><Button variant="secondary" size="sm" disabled={ocupado} onClick={() => void reintentar()}><RefreshCw size={13} /> Reintentar la emisión</Button></div>}
        </SectionCard>
      )}

      {cot.estado === 'emitida' && cot.poliza && (
        <>
          <SectionCard title="Póliza emitida" Icon={FileCheck2} statusLabel={cot.poliza.cobro?.ok ? 'Pagada' : 'Recibo pendiente'} statusTone={cot.poliza.cobro?.ok ? 'success' : 'warning'}>
            <div className="grid sm:grid-cols-4 gap-4">
              <Dato label="N.º de póliza">{cot.poliza.cnpoliza}</Dato>
              <Dato label="Opción">{elegida ? `${elegida.opcion} · ${m(elegida.prima)}` : cot.opcion}</Dato>
              <Dato label="N.º de recibo">{cot.poliza.cnrecibo}</Dato>
              <Dato label="Documento">
                {cot.poliza.urlpoliza
                  ? <a className="text-indigo-600 font-bold inline-flex items-center gap-1" href={cot.poliza.urlpoliza} target="_blank" rel="noreferrer">Ver póliza <ExternalLink size={12} /></a> : '—'}
              </Dato>
            </div>
            <p className="text-[0.72rem] text-slate-500 mt-3">
              {cot.poliza.cobro?.ok
                ? `Pago registrado${cot.pago?.referencia ? ` con la referencia ${cot.pago.referencia}` : ''}: el recibo quedó cobrado.`
                : cot.poliza.cobro?.pendiente ? 'Emitida por el canal: recibo pendiente de cobro en Sis2000.'
                  : admin ? `La póliza se emitió pero el cobro del recibo falló: ${cot.poliza.cobro?.error ?? 'sin detalle'}.` : 'Tu pago está recibido; estamos terminando de registrar el recibo.'}
              {admin && cot.poliza.cobro?.ingresoCaja && <> <a className="text-indigo-600 font-bold" href={cot.poliza.cobro.ingresoCaja} target="_blank" rel="noreferrer">Ingreso de caja</a></>}
            </p>
            {admin && cot.pago?.referencia && !cot.poliza.cobro?.ok && (
              <div className="mt-3"><Button variant="secondary" size="sm" disabled={ocupado} onClick={() => void reintentar()}><RefreshCw size={13} /> Reintentar el cobro del recibo</Button></div>
            )}
          </SectionCard>
          {docs.length > 0 && (
            <SectionCard title="Condicionados y anexos de la póliza" Icon={FileText} statusLabel={`${docs.length} documentos`} statusTone="success">
              <ul className="divide-y divide-slate-100">
                {docs.map((x, i) => (
                  <li key={x.id} className="flex items-center justify-between gap-3 py-1.5 text-[0.8rem] text-slate-700">
                    <span>{i + 1}. {x.titulo}</span>
                    <a href={urlDocumento(x)} download={x.archivo} className="inline-flex shrink-0 items-center gap-1 text-blue-700 hover:underline"><Download size={12} /> Descargar</a>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
        </>
      )}

      <div className="no-imprimir flex flex-wrap items-center gap-3 pt-2">
        <Button variant="secondary" size="lg" onClick={volver}><ArrowLeft size={15} /> {admin ? 'Volver a Cotizaciones' : 'Volver al inicio'}</Button>
        {admin && <Button variant="ghost" size="lg" onClick={reabrir}><Pencil size={15} /> Reabrir en el cotizador</Button>}
        {!admin && visible !== 'emitida' && <Badge tone="indigo">Guarda tu código: {cot.codigo}</Badge>}
      </div>
    </div>
  );
}
