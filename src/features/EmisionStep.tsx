import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CreditCard, Download, ExternalLink, FileCheck2, FileText, Loader2, Lock, Mail, Printer, RotateCcw, Send, ShieldCheck, Stamp, User } from 'lucide-react';
import { documentosRcg, documentosRcgSis2000, urlDocumento, type DocumentoRcg } from '../pdf/condicionadosRcg';
import { useParametrosStore } from '../store/parametrosStore';
import { toast } from '../store/toastStore';
import { SectionCard } from '../components/ui/SectionCard';
import { StepActions } from '../components/ui/StepActions';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { importe, porcentaje } from '../tarifas/comun';
import { NOMBRES } from '../tarifas/rcp-rce';
import { NOTA_MESA_TECNICA } from '../tarifas/rcg';
import { rifCompleto, useCotizacionPlanesRcg, useCotizacionRc, useCotizacionRcg, useCotizacionStore, useMesaTecnica } from '../store/cotizacionStore';
import { useWizardStore } from '../store/wizardStore';
import { usePlanesStore } from '../store/planesStore';
import { RAMO_RCG, armarEmisionPlan, primasTarifaRcg } from '../tarifas/planes-rcg';
import { Aviso } from '../components/ui/Aviso';
import { TablaCoberturas, TotalRc } from './CotizacionStep';
import { esPersonaNatural } from './TomadorStep';
import { armarEmisionCoberturas } from '../tarifas/coberturas';
import { useCotizacionCoberturas } from '../store/coberturasHook';
import { useCotizacionCombo, useNombreRamo } from '../store/comboHook';
import { Field, Input, Select } from '../components/ui/FormField';
import {
  armarEmisionCombo, armarEmisionComboInformada, coberturasOtraMoneda, coberturasSinTarifa, conPrimaTecnica, faltantesEmisionCombo, pideUnidad, planesContenedor,
} from '../tarifas/combo';
import { armarEmisionInformada, coberturasRc, coberturasRcg, faltantesEmisionRc, type CoberturasEmision } from '../tarifas/emision-rc';
import { PLAN_RCG_POR_OPCION, RAMOS_RC } from '../tarifas/data/mapeo-sis2000';
import { emitirCoberturas } from '../api/patrimonial';
import type { ResultadoEmision } from '../tarifas/planes-rcg';
import { correoValido, errorTamanoPdf, tamanoLegible } from '../correo/correoCotizacion';
import { EMISOR_CLIENTE, MODO_CLIENTE } from '../config/modoCliente';
import { esCodigoOficial, registrarEmisionPendiente } from '../api/cotizaciones';
import { datosCotizacionRc, datosCotizacionRcg, huellaCotizacion } from '../cotizaciones/snapshot';
import { useCotizacionGuardadaStore } from '../store/cotizacionGuardadaStore';

function Dato({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="text-sm text-slate-800 font-medium mt-0.5 break-words">{children || '—'}</p>
    </div>
  );
}

/** PDF de la cotización en memoria: bytes, nombre del archivo, detalle para el aviso y producto para el correo. */
type PdfCotizacion = { bytes: Uint8Array; nombre: string; detalle: string; producto: string };

// Link público (COTIZADOR_PUBLICO=1): el proxy no deja pasar la ruta de correo, así que el botón no se muestra.
const SOLO_PASTORA = import.meta.env.VITE_SOLO_PASTORA === '1';

type EstadoEnvio = 'editando' | 'confirmando' | 'enviando' | 'enviado' | 'error';

/** Envío de la cotización por correo: mismo PDF que «Descargar», al correo del tomador (editable) con confirmación. */
function EnviarCorreoCotizacion({ correoInicial, nombre, numero, vigenciaDias, generar, onCerrar, auto = false }: {
  correoInicial: string; nombre: string; numero: string; vigenciaDias: number;
  generar: () => Promise<PdfCotizacion>; onCerrar: () => void;
  /** Vista cliente: se envía sola al correo del tomador al llegar al final, sin confirmar. */
  auto?: boolean;
}) {
  const [correo, setCorreo] = useState(correoInicial.trim());
  const [estado, setEstado] = useState<EstadoEnvio>('editando');
  const [mensaje, setMensaje] = useState('');
  const valido = correoValido(correo);
  // StrictMode monta el efecto dos veces en desarrollo: la ref evita el doble envío.
  const autoEnviado = useRef(false);
  useEffect(() => {
    if (!auto || autoEnviado.current || !correoValido(correoInicial.trim())) return;
    autoEnviado.current = true;
    void enviar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  const enviar = async () => {
    setEstado('enviando');
    setMensaje('Generando el PDF…');
    try {
      const pdf = await generar();
      const errTam = errorTamanoPdf(pdf.bytes.length);
      if (errTam) throw new Error(errTam);
      setMensaje(`Enviando PDF de ${tamanoLegible(pdf.bytes.length)}…`);
      const { enviarCotizacionPorCorreo } = await import('../api/correo');
      await enviarCotizacionPorCorreo({
        correo, nombre, numero, producto: pdf.producto, vigenciaDias, pdf: pdf.bytes, nombreArchivo: pdf.nombre,
      });
      setEstado('enviado');
      setMensaje(`Cotización ${numero} enviada a ${correo.trim().toLowerCase()}.`);
      toast.success('Cotización enviada por correo', `${numero} → ${correo.trim().toLowerCase()}`);
    } catch (e) {
      setEstado('error');
      setMensaje(e instanceof Error ? e.message : String(e));
      toast.error('No se pudo enviar la cotización', e instanceof Error ? e.message : String(e));
    }
  };

  const ocupado = estado === 'enviando';
  return (
    <SectionCard title={auto ? 'Tu cotización por correo' : 'Enviar cotización por correo'} Icon={Mail} statusLabel={estado === 'enviado' ? 'Enviada' : undefined} statusTone="success"
      description={auto
        ? 'Te enviamos la cotización en PDF al correo que indicaste. Si no te llega, revisa el correo y envíala de nuevo.'
        : 'Se envía el mismo PDF de «Descargar cotización PDF» como adjunto.'}>
      <div className="grid sm:grid-cols-2 gap-4 items-start">
        <Field label="Correo del destinatario" error={correo && !valido ? 'Introduce un correo electrónico válido.' : undefined}
          hint="Precargado con el correo del tomador / asegurado; puedes cambiarlo.">
          <Input type="email" value={correo} maxLength={150} disabled={ocupado}
            onChange={(e) => { setCorreo(e.target.value); if (estado !== 'enviando') setEstado('editando'); }} placeholder="correo@empresa.com" />
        </Field>
        <div className="flex flex-wrap gap-2 sm:pt-7">
          {estado === 'confirmando' ? (
            <>
              <Button variant="primary" onClick={enviar}><Send size={14} /> Sí, enviar</Button>
              <Button variant="ghost" onClick={() => setEstado('editando')}>Cancelar</Button>
            </>
          ) : (
            <>
              <Button variant="primary" disabled={!valido || ocupado} onClick={() => setEstado('confirmando')}>
                {ocupado ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {ocupado ? 'Enviando…' : estado === 'enviado' ? 'Enviar de nuevo' : 'Enviar'}
              </Button>
              <Button variant="ghost" disabled={ocupado} onClick={onCerrar}>Cerrar</Button>
            </>
          )}
        </div>
      </div>
      {estado === 'confirmando' && (
        <p className="mt-3 text-[0.8rem] text-slate-700">
          ¿Enviar la cotización <strong>{numero}</strong> a <strong>{correo.trim().toLowerCase()}</strong>?
        </p>
      )}
      {mensaje && estado !== 'editando' && estado !== 'confirmando' && (
        estado === 'error'
          ? <div className="mt-3"><Aviso tono="error">{mensaje}</Aviso></div>
          : <p className={`mt-3 text-[0.8rem] ${estado === 'enviado' ? 'text-emerald-700 font-semibold' : 'text-slate-600'}`}>{mensaje}</p>
      )}
    </SectionCard>
  );
}

export function EmisionStep() {
  const s = useCotizacionStore();
  const resetWizard = useWizardStore((w) => w.reset);
  const { comun: c, contrato: k } = s;
  const rcg = s.producto === 'rcg';
  const planes = s.producto === 'planes';
  const combo = s.producto === 'combo';
  const resetPlanes = usePlanesStore((p) => p.reset);
  const listaPlanes = usePlanesStore((p) => p.planes);
  const ramos = usePlanesStore((p) => p.ramos);
  const cotRcg = useCotizacionRcg();
  const cotPlanes = useCotizacionPlanesRcg(listaPlanes[0]?.suma);
  const cobCot = useCotizacionCoberturas();
  const cobCombo = useCotizacionCombo();
  const xramoCombo = useNombreRamo(s.ramoCombo);
  const mesaTecnica = useMesaTecnica();
  // Sin vista técnica el cliente solo ve la prima total: el PDF lleva coberturas y sumas, sin la prima de cada una.
  const vistaTecnica = useParametrosStore((p) => p.vistaTecnica);
  const vigenciaDias = useParametrosStore((p) => p.rcg.vigenciaDias);
  const [generando, setGenerando] = useState(false);
  const [correoAbierto, setCorreoAbierto] = useState(false);
  // Número provisional: se usa mientras Nexus guarda la cotización, o si Nexus falla (se sigue cotizando igual).
  const [provisional] = useState(() => `RCG-${new Date().getFullYear()}-P${String(Date.now()).slice(-6)}`);
  const cotRc = useCotizacionRc();
  const prmRcg = useParametrosStore((p) => p.rcg);
  const prmRc = useParametrosStore((p) => p.rc);
  const guardada = useCotizacionGuardadaStore();
  const abrirConsulta = useWizardStore((w) => w.abrirConsulta);
  // RCG y RCP/RCE se guardan en Exélixi Nexus al llegar al resumen: el código oficial reemplaza al provisional.
  const guardable = !SOLO_PASTORA && (rcg ? cotRcg.alternativas.length > 0 : s.producto === 'rc' && !cotRc.errores.length && cotRc.total > 0);
  const huella = guardable ? huellaCotizacion(s, { rcg: prmRcg, rc: prmRc }) : null;
  useEffect(() => {
    if (!huella) return;
    void guardada.guardar(huella, async () => {
      if (!rcg) return datosCotizacionRc(s, cotRc, { vigenciaDias: 15 });
      // Coberturas y planes del ramo 28 en Sis2000: con ellos queda armada la emisión de cada opción para el pago en línea.
      const cramo = RAMOS_RC.rcg;
      void usePlanesStore.getState().cargarCatalogo(cramo);
      void usePlanesStore.getState().cargarContenedores();
      const listo = () => {
        const p = usePlanesStore.getState();
        return !!p.catalogos[cramo] && !p.catalogos[cramo].cargando && !p.cargandoContenedores && (p.contenedores !== null || !!p.errorContenedores);
      };
      for (let i = 0; i < 100 && !listo(); i++) await new Promise((r) => setTimeout(r, 150));
      const p = usePlanesStore.getState();
      return datosCotizacionRcg(s, cotRcg, {
        mesaTecnica, vigenciaDias,
        emision: {
          catalogo: p.catalogos[cramo]?.coberturas ?? null, contenedores: p.contenedores, planConfigurado: import.meta.env.VITE_RCG_PLAN_CONTENEDOR,
          cproductor: Number(import.meta.env.VITE_RCG_PLANES_CPRODUCTOR) || 80080, esPersonaNatural: esPersonaNatural(c.tipoDoc),
        },
      });
    });
  }, [huella]); // eslint-disable-line react-hooks/exhaustive-deps
  const guardando = !!huella && (guardada.guardando || guardada.huella !== huella);
  const codigo = huella && guardada.huella === huella ? guardada.codigo : null;
  const numero = codigo ?? provisional;

  // Plan de Sis2000 o combo del ramo 28 (RCG): mismo condicionado y anexos que la cotización RCG, por ccober o por nombre.
  const planElegido = listaPlanes.find((p) => p.cplan === s.planSel);
  const docsSis2000: DocumentoRcg[] = planes
    ? (planElegido ? documentosRcgSis2000(planElegido.cramo, cobCot ? cobCot.cot.coberturas : planElegido.coberturas, 'USD') : [])
    : combo && cobCombo ? documentosRcgSis2000(cobCombo.cramo, cobCombo.cot.coberturas, cobCombo.moneda) : [];

  const nueva = () => { s.reset(); resetPlanes(); resetWizard(); window.scrollTo({ top: 0 }); };

  /** PDF en memoria (el mismo para descargar y para el correo). */
  const generarRcg = async (): Promise<PdfCotizacion> => {
    {
      // pdf-lib y las imágenes de la solicitud se cargan solo al generar el PDF.
      // El condicionado y los anexos ya no van en la cotización: se entregan con la póliza (PolizaEmitida).
      const { cargarAssetsRcg, generarPdfRcg } = await import('../pdf/cotizacionRcgPdf');
      const assets = await cargarAssetsRcg();
      const bytes = await generarPdfRcg({
        numero, fecha: new Date(), asegurado: c.asegurado, rif: rifCompleto(c), moneda: s.rcg.moneda,
        indole: s.rcg.indole, actividadEspecifica: s.rcg.actividadEspecifica, correo: c.correo, intermediario: c.intermediario,
        ubicacion: c.ubicacion, esContrato: k.esContrato, numeroContrato: k.numero, objetoObra: k.objeto, coasegurado: k.coasegurado,
        sucursal: MODO_CLIENTE ? EMISOR_CLIENTE.sucursal : c.sucursal, elaboradoPor: MODO_CLIENTE ? EMISOR_CLIENTE.emisor : c.emisor, alternativas: cotRcg.alternativas, coberturas: cotRcg.coberturas,
        deducible: cotRcg.deducible, notaIgtf: cotRcg.notaIgtf, condiciones: cotRcg.condiciones, vigenciaDias, mesaTecnica,
      }, assets);
      return {
        bytes, nombre: `Cotizacion_LaMundial_${c.asegurado.trim().replace(/\s+/g, '_') || 'RCG'}.pdf`,
        detalle: `${numero} · cotización + Solicitud de Seguro.`,
        producto: 'Responsabilidad Civil General',
      };
    }
  };

  /** Mismo PDF oficial con la suma, la prima y las coberturas del plan de Sis2000. */
  const generarPlan = async (): Promise<PdfCotizacion> => {
    const plan = listaPlanes.find((p) => p.cplan === s.planSel);
    if (!plan) throw new Error('No hay plan elegido: vuelve al paso de cotización.');
    const esRcg = plan.cramo === RAMO_RCG;
    const ramo = ramos.find((r) => r.cramo === plan.cramo)?.xramo ?? `Ramo ${plan.cramo}`;
    {
      const { cargarAssetsRcg, generarPdfRcg } = await import('../pdf/cotizacionRcgPdf');
      const assets = await cargarAssetsRcg();
      const bytes = await generarPdfRcg({
        numero, fecha: new Date(), asegurado: c.asegurado, rif: rifCompleto(c), moneda: 'USD',
        indole: s.rcg.indole, actividadEspecifica: s.rcg.actividadEspecifica, correo: c.correo, intermediario: c.intermediario,
        ubicacion: c.ubicacion, esContrato: k.esContrato, numeroContrato: k.numero, objetoObra: k.objeto, coasegurado: k.coasegurado,
        sucursal: MODO_CLIENTE ? EMISOR_CLIENTE.sucursal : c.sucursal, elaboradoPor: MODO_CLIENTE ? EMISOR_CLIENTE.emisor : c.emisor,
        alternativas: [cobCot
          ? { opcion: 'I', limite: cobCot.cot.suma_asegurada, prima: cobCot.cot.prima_total, primaMinimaAplicada: false }
          : { opcion: 'I', limite: plan.suma, prima: plan.prima, primaMinimaAplicada: false }],
        coberturas: cobCot
          ? cobCot.cot.coberturas.map((x) => ({ nombre: vistaTecnica ? `${x.nombre} (prima ${importe(x.prima)})` : x.nombre, montos: [x.suma] }))
          : plan.coberturas.map((x) => ({ nombre: x.nombre, montos: [x.suma] })),
        deducible: esRcg ? cotPlanes.deducible : '', notaIgtf: true, condiciones: esRcg ? cotPlanes.condiciones : [], vigenciaDias,
        plan: { ramo, nombre: plan.nombre, cplan: plan.cplan, esRcg }, mesaTecnica,
      }, assets);
      return {
        bytes, nombre: `Cotizacion_LaMundial_${plan.cplan}_${c.asegurado.trim().replace(/\s+/g, '_') || 'plan'}.pdf`,
        detalle: `${numero} · ${plan.nombre}${esRcg ? ' + Solicitud de Seguro' : ''}.`,
        producto: `${plan.nombre} (${ramo})`,
      };
    }
  };

  /** Mismo PDF oficial con las coberturas y sumas del combo (formato de plan genérico, sin Solicitud RCG). */
  const generarCombo = async (): Promise<PdfCotizacion> => {
    if (!cobCombo?.valida) throw new Error('El combo no está completo: vuelve al paso de cotización.');
    const { cot, moneda, cramo } = cobCombo;
    {
      const { cargarAssetsRcg, generarPdfRcg } = await import('../pdf/cotizacionRcgPdf');
      const assets = await cargarAssetsRcg();
      const bytes = await generarPdfRcg({
        numero, fecha: new Date(), asegurado: c.asegurado, rif: rifCompleto(c), moneda,
        indole: '', actividadEspecifica: s.rcg.actividadEspecifica, correo: c.correo, intermediario: c.intermediario,
        ubicacion: c.ubicacion, esContrato: k.esContrato, numeroContrato: k.numero, objetoObra: k.objeto, coasegurado: k.coasegurado,
        sucursal: MODO_CLIENTE ? EMISOR_CLIENTE.sucursal : c.sucursal, elaboradoPor: MODO_CLIENTE ? EMISOR_CLIENTE.emisor : c.emisor,
        alternativas: [{ opcion: 'I', limite: cot.suma_asegurada, prima: cot.prima_total, primaMinimaAplicada: false }],
        coberturas: cot.coberturas.map((x) => ({ nombre: vistaTecnica ? `${x.nombre} (prima ${importe(x.prima)})` : x.nombre, montos: [x.suma] })),
        deducible: '', notaIgtf: !/^bs/i.test(moneda), condiciones: [], vigenciaDias, mesaTecnica,
        plan: { ramo: xramoCombo, nombre: 'Combo de coberturas', cplan: `COMBO-${cramo}`, esRcg: false, combo: true },
      }, assets);
      return {
        bytes, nombre: `Cotizacion_LaMundial_Combo_${cramo}_${c.asegurado.trim().replace(/\s+/g, '_') || 'combo'}.pdf`,
        detalle: `${numero} · combo de ${xramoCombo}.`,
        producto: `combo de coberturas de ${xramoCombo}`,
      };
    }
  };

  const descargarCon = async (generar: () => Promise<PdfCotizacion>) => {
    setGenerando(true);
    try {
      const { descargarPdf } = await import('../pdf/cotizacionRcgPdf');
      const pdf = await generar();
      descargarPdf(pdf.bytes, pdf.nombre);
      toast.success('Cotización descargada', pdf.detalle);
    } catch (e) {
      toast.error('No se pudo generar el PDF', e instanceof Error ? e.message : String(e));
    } finally {
      setGenerando(false);
    }
  };
  const descargarRcg = () => descargarCon(generarRcg);
  const descargarPlan = () => descargarCon(generarPlan);
  const descargarCombo = () => descargarCon(generarCombo);
  const generarPdf = rcg ? generarRcg : combo ? generarCombo : generarPlan;

  return (
    <div className="space-y-5">
      <SectionCard title="Tomador / asegurado" Icon={User} statusLabel="Cotización" statusTone="success">
        <div className="grid sm:grid-cols-3 gap-4">
          <Dato label="Nombre o razón social">{c.asegurado}</Dato>
          <Dato label="RIF">{rifCompleto(c)}</Dato>
          <Dato label="Correo">{c.correo}</Dato>
          <Dato label="Ubicación del riesgo">{c.ubicacion}</Dato>
          {!MODO_CLIENTE && <Dato label="Intermediario">{c.intermediario}</Dato>}
          <Dato label="Fecha">{new Date().toLocaleDateString('es-VE')}</Dato>
          {!MODO_CLIENTE && <Dato label="Sucursal">{c.sucursal}</Dato>}
          {!MODO_CLIENTE && <Dato label="Elaborada por">{c.emisor}</Dato>}
          {planes && <Dato label="Teléfono">{c.telefono}</Dato>}
          {k.esContrato && <Dato label="Contrato">{[k.numero, s.producto !== 'rc' ? k.coasegurado : k.vigencia, k.objeto].filter(Boolean).join(' · ')}</Dato>}
        </div>
      </SectionCard>

      {mesaTecnica && (
        <Aviso><strong>{NOTA_MESA_TECNICA}.</strong> La actividad es restringida: la mesa técnica de La Mundial debe aprobar esta cotización.</Aviso>
      )}

      {rcg ? <ResumenRcg /> : planes ? <ResumenPlan /> : combo ? <ResumenCombo /> : <ResumenRc />}

      {/* Condicionado y anexos: no van en la cotización; se muestran y se envían con la póliza emitida (PolizaEmitida). */}
      {/* Vista cliente: solo cotiza; la emisión la hace el canal (nunca se emite sin pago). */}
      {!MODO_CLIENTE && (planes ? <EmitirPlan docs={docsSis2000} /> : combo ? <EmitirCombo numero={numero} docs={docsSis2000} />
        : rcg ? <EmitirRcg numero={numero} /> : <EmitirRcpRce numero={numero} />)}

      {/* Código oficial de Nexus: con él el cliente trae la cotización, elige opción y paga; el canal la manda a pagar. */}
      {guardando && <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" /> Guardando la cotización…</p>}
      {codigo && (
        <SectionCard title={`Código de cotización: ${codigo}`} Icon={CreditCard} statusLabel="Guardada" statusTone="success"
          description={MODO_CLIENTE
            ? 'Guárdalo: con este código puedes volver durante 15 días, elegir una de las opciones y pagar en línea.'
            : 'Guardada en Exélixi Nexus. El cliente puede traerla con este código durante 15 días y pagar en línea.'}>
          {rcg && (
            <Button variant={MODO_CLIENTE ? 'primary' : 'secondary'} size="lg" onClick={() => { abrirConsulta(codigo); window.scrollTo({ top: 0 }); }}>
              <CreditCard size={15} /> {MODO_CLIENTE ? 'Elegir opción y pagar' : 'Mandar a pagar'}
            </Button>
          )}
        </SectionCard>
      )}
      {huella && !guardando && !codigo && guardada.error && (
        <Aviso>No se pudo guardar la cotización en Exélixi Nexus ({guardada.error}) Sigue con el número provisional <strong>{provisional}</strong>: se puede descargar y enviar, pero no traer por código ni pagar en línea.</Aviso>
      )}

      <p className="text-[0.72rem] text-slate-500">
        Cotización válida por {rcg || combo ? vigenciaDias : 15} días continuos. No constituye emisión de póliza ni activación de cobertura.
        {(rcg || planes || combo) && !codigo && !guardando && <> N.º provisional <strong>{numero}</strong>.</>}
      </p>

      {/* Admin: se abre con el botón y se confirma. Cliente: se envía solo al llegar aquí. */}
      {(correoAbierto || MODO_CLIENTE) && (rcg || planes || combo) && !guardando && (
        // vigenciaDias: la misma validez que imprime el PDF adjunto.
        <EnviarCorreoCotizacion key={numero} correoInicial={c.correo} nombre={c.asegurado} numero={numero} vigenciaDias={vigenciaDias}
          generar={generarPdf} onCerrar={() => setCorreoAbierto(false)} auto={MODO_CLIENTE} />
      )}

      <StepActions continueLabel="" extra={(
        <>
          {rcg || planes || combo ? (
            <>
              <Button variant="primary" size="lg" onClick={rcg ? descargarRcg : combo ? descargarCombo : descargarPlan} disabled={generando}>
                {generando ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                {generando ? 'Generando PDF…' : 'Descargar cotización PDF'}
              </Button>
              {!SOLO_PASTORA && !MODO_CLIENTE && (
                <Button variant="secondary" size="lg" onClick={() => setCorreoAbierto(true)} disabled={correoAbierto}>
                  <Mail size={15} />
                  Enviar cotización por correo
                </Button>
              )}
            </>
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

/**
 * Minuta La Mundial 30-oct-2026: condicionado general y particular + anexos de las coberturas contratadas. Se entregan con
 * la póliza emitida (no con la cotización), junto con la constancia de recepción.
 */
function CondicionadosRcg({ docs }: { docs: DocumentoRcg[] }) {
  return (
    <SectionCard title="Condicionados y anexos de la póliza" Icon={FileText} statusLabel={`${docs.length} documentos`} statusTone="success"
      description="Forman parte de la póliza: se envían por correo al tomador con la constancia de recepción que firma.">
      <ul className="divide-y divide-slate-100">
        {docs.map((d, i) => (
          <li key={d.id} className="flex items-center justify-between gap-3 py-1.5 text-[0.8rem] text-slate-700">
            <span>{i + 1}. {d.titulo}</span>
            <span className="flex shrink-0 gap-3">
              <a href={urlDocumento(d)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-700 hover:underline"><ExternalLink size={12} /> Ver</a>
              <a href={urlDocumento(d)} download={d.archivo} className="inline-flex items-center gap-1 text-blue-700 hover:underline"><Download size={12} /> Descargar</a>
            </span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function ResumenPlan() {
  const prm = useParametrosStore((p) => p.rcg);
  const rcg = useCotizacionStore((x) => x.rcg);
  const planSel = useCotizacionStore((x) => x.planSel);
  const planes = usePlanesStore((p) => p.planes);
  const ramos = usePlanesStore((p) => p.ramos);
  const cot = useCotizacionPlanesRcg(planes[0]?.suma);
  const cobCot = useCotizacionCoberturas();
  const vistaTecnica = useParametrosStore((p) => p.vistaTecnica);
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
        <Dato label="Suma asegurada">{usd(cobCot ? cobCot.cot.suma_asegurada : plan.suma)}</Dato>
        <Dato label={cobCot ? 'Prima por coberturas (se emite)' : 'Prima Sis2000 (se emite)'}>{usd(cobCot ? cobCot.cot.prima_total : plan.prima)}</Dato>
        {esRcg ? <Dato label="Prima tarifa RCG (referencia)">{tarifa ? usd(tarifa.prima) : '—'}</Dato> : <Dato label="Ramo">{xramo}</Dato>}
        <Dato label="Vigencia">Anual</Dato>
      </div>
      <ul className="text-[0.78rem] text-slate-600 grid sm:grid-cols-2 gap-x-6 gap-y-0.5 list-disc pl-5">
        {cobCot
          ? cobCot.cot.coberturas.map((x) => <li key={x.ccober}>{x.nombre} · {importe(x.suma)}{vistaTecnica && ` · prima ${importe(x.prima)}`}</li>)
          : plan.coberturas.map((x) => <li key={x.nombre}>{x.nombre} · {importe(x.suma)}</li>)}
      </ul>
      {esRcg && <p className="text-[0.72rem] text-slate-500 mt-3"><strong>Deducible:</strong> {cot.deducible}</p>}
    </SectionCard>
  );
}

/** Emisión del plan por el partner patrimonial (mismo flujo que Emisión). Solo QA y con VITE_RCG_PLANES_EMITIR=1. */
function EmitirPlan({ docs }: { docs: DocumentoRcg[] }) {
  const s = useCotizacionStore();
  const prm = useParametrosStore((p) => p.rcg);
  const { planes, emitiendo, emision, error, emitir } = usePlanesStore();
  const [acepta, setAcepta] = useState(false);
  const [pep, setPep] = useState(false);
  const habilitada = import.meta.env.VITE_RCG_PLANES_EMITIR === '1';
  const plan = planes.find((p) => p.cplan === s.planSel);
  const cobCot = useCotizacionCoberturas();
  const { comun: c, contrato: k, rcg } = s;

  const emitirAhora = async () => {
    if (!plan) return;
    const prima = cobCot ? cobCot.cot.prima_total : plan.prima;
    const aviso = `Se emitirá en Sis2000 QA ${plan.nombre} (${plan.cplan}) por USD ${importe(prima)} a nombre de ${c.asegurado}. `
      + 'El recibo queda pendiente de cobro. ¿Continuar?';
    if (!window.confirm(aviso)) return;
    const cproductor = Number(import.meta.env.VITE_RCG_PLANES_CPRODUCTOR) || 80080;
    if (cobCot) {
      if (!cobCot.valida) { toast.error("Revisa las coberturas", "Vuelve al paso de cotización: hay sumas fuera de rango o sin tasa."); return; }
      const r = await emitir(armarEmisionCoberturas({
        cramo: plan.cramo, cplan: plan.cplan, cot: cobCot.cot, tipoDoc: c.tipoDoc, documento: c.documento, nombre: c.asegurado,
        apellido: esPersonaNatural(c.tipoDoc) ? c.apellido : '', correo: c.correo, telefono: c.telefono, direccion: c.ubicacion,
        bien: rcg.actividadEspecifica, apartamento: Number(c.apartamento) || undefined, cproductor,
      }), 'coberturas');
      if (r) toast.success('Póliza emitida en QA', `${r.cnpoliza} · recibo ${r.cnrecibo || '—'}`);
      return;
    }
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
      pep, cproductor,
    }));
    if (r) toast.success('Póliza emitida en QA', `${r.cnpoliza} · recibo ${r.cnrecibo || '—'}`);
  };

  if (emision) return <PolizaEmitida emision={emision} prima={plan ? `USD ${importe(cobCot ? cobCot.cot.prima_total : plan.prima)}` : undefined} docs={docs} producto={plan?.nombre} />;

  return (
    <SectionCard title="Emitir en Sis2000 QA" description={cobCot ? 'Cobertura por cobertura (nest-api riesgos-generales/emision).' : 'Partner patrimonial de nest-api (el mismo de Emisión).'} Icon={habilitada ? FileCheck2 : Lock}
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

/**
 * `prima`: prima total ya formateada con su moneda (la misma que se mandó a emitir). `docs`: condicionado y anexos de las
 * coberturas (ramo 28); se muestran aquí y se envían por correo con la póliza.
 */
function PolizaEmitida({ emision, prima, docs = [], producto = 'Responsabilidad Civil' }: {
  emision: ResultadoEmision; prima?: string; docs?: DocumentoRcg[]; producto?: string;
}) {
  return (
    <>
      <SectionCard title="Póliza emitida en Sis2000 QA" Icon={FileCheck2} statusLabel="Emitida" statusTone="success">
        <div className="grid sm:grid-cols-4 gap-4">
          <Dato label="N.º de póliza">{emision.cnpoliza}</Dato>
          <Dato label="Prima total">{prima}</Dato>
          <Dato label="N.º de recibo">{emision.cnrecibo}</Dato>
          <Dato label="Documento">
            {emision.urlpoliza
              ? <a className="text-indigo-600 font-bold inline-flex items-center gap-1" href={emision.urlpoliza} target="_blank" rel="noreferrer">Ver póliza <ExternalLink size={12} /></a>
              : '—'}
          </Dato>
        </div>
        <p className="text-[0.72rem] text-slate-500 mt-3">Recibo pendiente de cobro en Sis2000.</p>
      </SectionCard>
      {docs.length > 0 && <CondicionadosRcg docs={docs} />}
      <EnviarPolizaCorreo emision={emision} prima={prima} docs={docs} producto={producto} />
    </>
  );
}

/** PDF de la póliza desde Sis2000; si el servidor no lo deja descargar (CORS, tiempo), el correo lleva solo el enlace. */
async function descargarPdfPoliza(url: string): Promise<Uint8Array | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const b = new Uint8Array(await res.arrayBuffer());
    // %PDF
    return b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 ? b : null;
  } catch {
    return null;
  }
}

/** Correo de la póliza al tomador: póliza (PDF o enlace) + condicionado y anexos con la constancia. Admin decide y confirma. */
function EnviarPolizaCorreo({ emision, prima, docs, producto }: { emision: ResultadoEmision; prima?: string; docs: DocumentoRcg[]; producto: string }) {
  const c = useCotizacionStore((x) => x.comun);
  const [correo, setCorreo] = useState(c.correo.trim());
  const [estado, setEstado] = useState<EstadoEnvio>('editando');
  const [mensaje, setMensaje] = useState('');
  const valido = correoValido(correo);
  const ocupado = estado === 'enviando';

  const enviar = async () => {
    setEstado('enviando');
    try {
      const adjuntos: { pdf: Uint8Array; nombreArchivo: string }[] = [];
      let sinPdfPoliza = false;
      if (emision.urlpoliza) {
        setMensaje('Descargando la póliza…');
        const pdf = await descargarPdfPoliza(emision.urlpoliza);
        if (pdf) adjuntos.push({ pdf, nombreArchivo: `Poliza_${emision.cnpoliza}.pdf` });
        else sinPdfPoliza = true;
      }
      if (docs.length) {
        setMensaje('Armando el condicionado y los anexos…');
        const { cargarCondicionados } = await import('../pdf/condicionadosRcg');
        const { cargarLogoRcg, generarPdfAnexosPoliza } = await import('../pdf/cotizacionRcgPdf');
        const [condicionados, logo] = await Promise.all([cargarCondicionados(docs), cargarLogoRcg()]);
        const pdf = await generarPdfAnexosPoliza({ cnpoliza: emision.cnpoliza, asegurado: c.asegurado, rif: rifCompleto(c), fecha: new Date() }, condicionados, logo);
        adjuntos.push({ pdf, nombreArchivo: `Condicionado_y_anexos_${emision.cnpoliza}.pdf` });
      }
      setMensaje('Enviando…');
      const { enviarPolizaPorCorreo } = await import('../api/correo');
      await enviarPolizaPorCorreo({
        correo, nombre: c.asegurado, cnpoliza: emision.cnpoliza, cnrecibo: emision.cnrecibo, producto, prima,
        urlpoliza: emision.urlpoliza || undefined, adjuntos,
      });
      setEstado('enviado');
      const que = [adjuntos.length ? `${adjuntos.length} adjunto${adjuntos.length > 1 ? 's' : ''}` : '', sinPdfPoliza ? 'la póliza como enlace' : ''].filter(Boolean).join(' y ');
      setMensaje(`Póliza ${emision.cnpoliza} enviada a ${correo.trim().toLowerCase()}${que ? ` (${que})` : ''}.`);
      toast.success('Póliza enviada por correo', `${emision.cnpoliza} → ${correo.trim().toLowerCase()}`);
    } catch (e) {
      setEstado('error');
      setMensaje(e instanceof Error ? e.message : String(e));
      toast.error('No se pudo enviar la póliza', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <SectionCard title="Enviar póliza y anexos por correo" Icon={Mail} statusLabel={estado === 'enviado' ? 'Enviada' : undefined} statusTone="success"
      description={docs.length ? 'Póliza + condicionado general y particular, anexos de las coberturas y constancia de recepción.' : 'Póliza emitida (este ramo no tiene anexos de cobertura cargados).'}>
      <div className="grid sm:grid-cols-2 gap-4 items-start">
        <Field label="Correo del tomador" error={correo && !valido ? 'Introduce un correo electrónico válido.' : undefined}
          hint="Precargado con el correo del tomador; puedes cambiarlo.">
          <Input type="email" value={correo} maxLength={150} disabled={ocupado}
            onChange={(e) => { setCorreo(e.target.value); if (!ocupado) setEstado('editando'); }} placeholder="correo@empresa.com" />
        </Field>
        <div className="flex flex-wrap gap-2 sm:pt-7">
          {estado === 'confirmando' ? (
            <>
              <Button variant="primary" onClick={() => void enviar()}><Send size={14} /> Sí, enviar</Button>
              <Button variant="ghost" onClick={() => setEstado('editando')}>Cancelar</Button>
            </>
          ) : (
            <Button variant="primary" disabled={!valido || ocupado} onClick={() => setEstado('confirmando')}>
              {ocupado ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {ocupado ? 'Enviando…' : estado === 'enviado' ? 'Enviar de nuevo' : 'Enviar póliza y anexos'}
            </Button>
          )}
        </div>
      </div>
      {estado === 'confirmando' && (
        <p className="mt-3 text-[0.8rem] text-slate-700">
          ¿Enviar la póliza <strong>{emision.cnpoliza}</strong>{docs.length ? ` con ${docs.length} documentos (condicionado y anexos)` : ''} a <strong>{correo.trim().toLowerCase()}</strong>?
        </p>
      )}
      {mensaje && estado !== 'editando' && estado !== 'confirmando' && (
        estado === 'error'
          ? <div className="mt-3"><Aviso tono="error">{mensaje}</Aviso></div>
          : <p className={`mt-3 text-[0.8rem] ${estado === 'enviado' ? 'text-emerald-700 font-semibold' : 'text-slate-600'}`}>{mensaje}</p>
      )}
    </SectionCard>
  );
}

/**
 * Combo: se emite con un plan vigente del ramo como contenedor (moneda, cplan y regla de duplicados de Sis2000) y las
 * coberturas y sumas elegidas (nest-api riesgos-generales/emision, modo combo). Solo QA y con VITE_RCG_PLANES_EMITIR=1.
 */
function EmitirCombo({ numero, docs }: { numero: string; docs: DocumentoRcg[] }) {
  const s = useCotizacionStore();
  const setComun = useCotizacionStore((x) => x.setComun);
  const r = useCotizacionCombo();
  const xramo = useNombreRamo(r?.cramo ?? null);
  const { emitiendo, emision, error, emitir, contenedores, cargandoContenedores, errorContenedores, cargarContenedores } = usePlanesStore();
  const [cplan, setCplan] = useState('');
  const [acepta, setAcepta] = useState(false);
  const habilitada = import.meta.env.VITE_RCG_PLANES_EMITIR === '1';
  const cramo = r?.cramo ?? null;
  const planesRamo = planesContenedor(contenedores ?? [], cramo);
  const { comun: c, rcg } = s;
  // Ramos 27/28/37 (tarifa oficial del cotizador) o primas de Técnico: prima informada, nest-api modo cotizador, no recalcula.
  const oficial = r?.oficial ?? null;
  const informada = !!r && (!!oficial || conPrimaTecnica(r.cot));
  const faltan = faltantesEmisionCombo({
    cramo, cplan, apartamento: c.apartamento, valida: !!r?.valida, documento: c.documento,
    sinTarifa: r ? coberturasSinTarifa(r.catalogo, r.cot) : [],
    primaTotal: r?.cot.prima_total,
    direccion: c.ubicacion,
    otraMoneda: r ? coberturasOtraMoneda(r.catalogo, r.cot) : [],
  });

  useEffect(() => { void cargarContenedores(); }, [cargarContenedores]);
  // Un solo plan vigente: se elige solo. Al cambiar de ramo se limpia la elección.
  const unico = planesRamo.length === 1 ? planesRamo[0].cplan : '';
  useEffect(() => { setCplan(unico); }, [cramo, unico]);

  if (emision) return <PolizaEmitida emision={emision} prima={r ? `${r.moneda} ${importe(r.cot.prima_total)}` : undefined} docs={docs} producto={`combo de coberturas de ${xramo}`} />;
  if (!r) return null;

  const emitirAhora = async () => {
    const plan = planesRamo.find((p) => p.cplan === cplan);
    const aviso = `Se emitirá en Sis2000 QA el combo de ${xramo} con el plan contenedor ${plan?.xplan ?? cplan} (${cplan}) `
      + `por ${r.moneda} ${importe(r.cot.prima_total)} (${oficial ? 'prima con la tarifa oficial del cotizador; nest-api no la recalcula' : informada ? 'prima con la tarifa de Técnico; nest-api no la recalcula' : 'nest-api recalcula la prima'}) a nombre de ${c.asegurado}. El recibo queda pendiente de cobro. ¿Continuar?`;
    if (!window.confirm(aviso)) return;
    const datos = {
      cramo: r.cramo, cplan, cot: r.cot, catalogo: r.catalogo, tipoDoc: c.tipoDoc, documento: c.documento, nombre: c.asegurado,
      apellido: esPersonaNatural(c.tipoDoc) ? c.apellido : '', correo: c.correo, telefono: c.telefono, direccion: c.ubicacion,
      bien: rcg.actividadEspecifica || c.asegurado, apartamento: pideUnidad(r.cramo) ? Number(c.apartamento) || undefined : undefined,
      cproductor: Number(import.meta.env.VITE_RCG_PLANES_CPRODUCTOR) || 80080,
    };
    const em = await emitir(informada ? armarEmisionComboInformada({ ...datos, ncotizacion: numero.replace(/^RCG/, 'COMBO'), ...(oficial ? { cotizador: oficial.cotizador } : {}) }) : armarEmisionCombo(datos), 'coberturas');
    if (em) toast.success('Póliza emitida en QA', `${em.cnpoliza} · recibo ${em.cnrecibo || '—'}`);
  };

  return (
    <SectionCard title="Emitir el combo en Sis2000 QA" Icon={habilitada ? FileCheck2 : Lock}
      description="Un plan vigente del ramo hace de contenedor; la póliza lleva las coberturas y sumas del combo (nest-api riesgos-generales/emision)."
      statusLabel={habilitada ? 'Solo QA' : 'Deshabilitada'} statusTone="warning">
      <div className="space-y-3">
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Plan contenedor" full
            hint="Aporta la moneda y el código de plan de la póliza. Sis2000 no permite dos pólizas vigentes del mismo asegurado y plan."
            error={errorContenedores ?? (contenedores && !planesRamo.length ? `El ramo ${xramo} no tiene planes vigentes en Sis2000: hay que crear uno para poder emitir.` : undefined)}>
            <Select value={cplan} onChange={(e) => setCplan(e.target.value)} disabled={cargandoContenedores || !planesRamo.length}>
              <option value="">{cargandoContenedores ? 'Cargando planes…' : 'Elige el plan'}</option>
              {planesRamo.map((p) => <option key={p.cplan} value={p.cplan}>{p.cplan} · {p.xplan}</option>)}
            </Select>
          </Field>
          {pideUnidad(cramo) && (
            <Field label="N.º de apartamento / unidad" hint="Obligatorio en este ramo: Sis2000 identifica la póliza por cédula + plan + unidad.">
              <Input inputMode="numeric" maxLength={6} value={c.apartamento} onChange={(e) => setComun({ apartamento: e.target.value.replace(/\D/g, '') })} placeholder="Ej. 52" />
            </Field>
          )}
        </div>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" className="mt-0.5 w-4 h-4 accent-indigo-600" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} />
          El tomador declara que la información es veraz y acepta los Términos y Condiciones.
        </label>
        {error && <Aviso tono="error">{error}</Aviso>}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" size="lg" disabled={!habilitada || !acepta || faltan.length > 0 || emitiendo} onClick={() => void emitirAhora()}
            title={faltan.join(' ') || undefined}>
            {emitiendo ? <Loader2 size={15} className="animate-spin" /> : <FileCheck2 size={15} />}
            {emitiendo ? 'Emitiendo…' : 'Emitir en Sis2000 QA'}
          </Button>
          <p className="text-[0.78rem] text-slate-500 max-w-md">
            {!habilitada
              ? 'Para probar: VITE_RCG_PLANES_EMITIR=1 en .env.local (con NEST_API_URL de QA) y reiniciar npm run dev.'
              : faltan.length ? faltan.join(' ') : informada
                ? `Opción de prueba con la ${oficial ? `tarifa oficial del cotizador ${oficial.cotizador.toUpperCase()}` : 'tarifa de Técnico'}: la póliza queda con el recibo pendiente de cobro. En nest-api: RIESGOS_GENERALES_EMISION_COTIZADOR=true, el ramo en RIESGOS_GENERALES_COTIZADOR_RAMOS y la key con emissions:riesgos-generales-prima.`
                : 'Opción de prueba: la póliza queda con el recibo pendiente de cobro. El ramo debe estar habilitado en nest-api (RIESGOS_GENERALES_RAMOS_EMISION).'}
          </p>
        </div>
      </div>
    </SectionCard>
  );
}

/** Combo de coberturas: coberturas y sumas; la prima de cada una solo con la vista técnica. */
function ResumenCombo() {
  const r = useCotizacionCombo();
  const xramo = useNombreRamo(r?.cramo ?? null);
  const actividad = useCotizacionStore((x) => x.rcg.actividadEspecifica);
  const vistaTecnica = useParametrosStore((p) => p.vistaTecnica);
  if (!r) return <Aviso tono="error">No hay combo cotizado: vuelve al paso de cotización.</Aviso>;
  const { cot, moneda } = r;
  const m = (n: number) => `${moneda} ${importe(n)}`;

  return (
    <SectionCard title={`Combo de coberturas · ${xramo}`} description={actividad} Icon={ShieldCheck} statusLabel={`Ramo ${r.cramo}`}>
      <div className="grid sm:grid-cols-3 gap-4 mb-4">
        <Dato label="Suma asegurada">{m(cot.suma_asegurada)}</Dato>
        <Dato label="Prima total">{m(cot.prima_total)}</Dato>
        <Dato label="Coberturas">{String(cot.coberturas.length)}</Dato>
      </div>
      <ul className="text-[0.78rem] text-slate-600 grid sm:grid-cols-2 gap-x-6 gap-y-0.5 list-disc pl-5">
        {cot.coberturas.map((x) => <li key={x.ccober}>{x.nombre} · {importe(x.suma)}{vistaTecnica && ` · prima ${importe(x.prima)}`}</li>)}
      </ul>
    </SectionCard>
  );
}

function ResumenRcg() {
  const rcg = useCotizacionStore((s) => s.rcg);
  // El descuento y las tasas solo se muestran a perfiles técnicos; el cliente ve la prima final.
  const vistaTecnica = useParametrosStore((p) => p.vistaTecnica);
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
              {vistaTecnica && a.descuentoPct != null && a.tasaInicial != null && a.tasaAplicada != null && (
                <p className="text-[0.72rem] text-slate-500 mt-1">Descuento {porcentaje(a.descuentoPct)}: tasa {porcentaje(a.tasaInicial)} → {porcentaje(Number(a.tasaAplicada.toFixed(5)))}</p>
              )}
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
  const vistaTecnica = useParametrosStore((p) => p.vistaTecnica);
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
          {/* Desglose de prima por opción: solo perfiles técnicos (este resumen es el que se imprime para el cliente). */}
          {vistaTecnica && r.opciones && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 mt-4">
              <table className="w-full text-[0.78rem]">
                <thead className="bg-slate-50 text-slate-600">
                  <tr><th className="text-left font-bold px-3 py-2">Concepto</th>{r.opciones.map((o) => <th key={o.id} className="text-right font-bold px-3 py-2">Opción {o.id}</th>)}</tr>
                </thead>
                <tbody>
                  {([
                    ...(r.opciones.some((o) => o.descuentoPct) ? [['Descuento por suma (% sobre la tasa)', (o) => o.descuentoPct ?? 0] as [string, (o: NonNullable<typeof r.opciones>[number]) => number]] : []),
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


/** RCG (ramo 28): emite la opción elegida con su prima; plan contenedor sugerido PLANI / PLANII / PLAN3 si está vigente. */
function EmitirRcg({ numero }: { numero: string }) {
  const rcg = useCotizacionStore((x) => x.rcg);
  const cot = useCotizacionRcg();
  const catalogo = usePlanesStore((p) => p.catalogos[RAMOS_RC.rcg]?.coberturas ?? null);
  const opcion = (cot.alternativas.find((a) => a.opcion === rcg.opcion) ?? cot.alternativas[0])?.opcion;
  const emision = opcion ? coberturasRcg(cot, opcion, rcg.moneda, catalogo) : null;
  return (
    <EmitirInformada titulo={`Emitir RCG en Sis2000 QA${opcion ? ` · opción ${opcion}` : ''}`} emision={emision}
      valida={!Object.keys(cot.errores).length && !!emision} ncotizacion={numero} moneda={rcg.moneda}
      sugerido={opcion ? PLAN_RCG_POR_OPCION[opcion] : undefined}
      bien={[rcg.indole, rcg.actividadEspecifica].filter(Boolean).join(' · ')}
      docs={documentosRcg(cot.coberturas.map((x) => x.nombre), rcg.moneda)} producto="Responsabilidad Civil General" />
  );
}

/** RCP (ramo 27) y RCE (ramo 37): una póliza por producto cotizado, con la opción elegida (USD/EUR) o la prima en Bs. */
function EmitirRcpRce({ numero }: { numero: string }) {
  const cot = useCotizacionRc();
  const rc = useCotizacionStore((x) => x.rc);
  const catalogos = usePlanesStore((p) => p.catalogos);
  return (
    <>
      {cot.resultados.map((r) => {
        const cotizador = r.k === 'p' ? 'rcp' : 'rce';
        const emision = coberturasRc(r, rc.moneda, catalogos[RAMOS_RC[cotizador]]?.coberturas ?? null);
        return (
          <EmitirInformada key={r.k} titulo={`Emitir ${NOMBRES[r.k]} en Sis2000 QA${r.opcion ? ` · opción ${r.opcion}` : ''}`}
            emision={emision} valida={!cot.errores.length} ncotizacion={numero.replace(/^RCG/, cotizador.toUpperCase())}
            moneda={cot.simbolo} bien={[rc.indole, r.riesgo?.[0]].filter(Boolean).join(' · ')} producto={NOMBRES[r.k]} />
        );
      })}
    </>
  );
}

/**
 * Emisión con la prima del cotizador (nest-api riesgos-generales/emision, modo cotizador): Sis2000 no tiene tarifa en
 * estos ramos, la aplica Técnico. Solo QA y con VITE_RC_EMITIR=1. Las coberturas salen de tarifas/data/mapeo-sis2000.ts.
 */
function EmitirInformada({ titulo, emision, valida, ncotizacion, moneda, sugerido, bien, docs = [], producto }: {
  titulo: string; emision: CoberturasEmision | null; valida: boolean; ncotizacion: string; moneda: string; sugerido?: string; bien: string;
  /** Condicionado y anexos que acompañan a la póliza (RCG). */
  docs?: DocumentoRcg[]; producto?: string;
}) {
  const c = useCotizacionStore((x) => x.comun);
  const setComun = useCotizacionStore((x) => x.setComun);
  const contenedores = usePlanesStore((p) => p.contenedores);
  const cargandoContenedores = usePlanesStore((p) => p.cargandoContenedores);
  const errorContenedores = usePlanesStore((p) => p.errorContenedores);
  const cargarContenedores = usePlanesStore((p) => p.cargarContenedores);
  const cargarCatalogo = usePlanesStore((p) => p.cargarCatalogo);
  const cramo = emision?.cramo ?? null;
  const catalogo = usePlanesStore((p) => (cramo == null ? undefined : p.catalogos[cramo]));
  const vistaTecnica = useParametrosStore((p) => p.vistaTecnica);
  const [cplan, setCplan] = useState('');
  const [acepta, setAcepta] = useState(false);
  const [emitiendo, setEmitiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoEmision | null>(null);
  const habilitada = import.meta.env.VITE_RC_EMITIR === '1';
  const planesRamo = planesContenedor(contenedores ?? [], cramo);
  const xramo = useNombreRamo(cramo);

  useEffect(() => { void cargarContenedores(); }, [cargarContenedores]);
  useEffect(() => { if (cramo != null) void cargarCatalogo(cramo); }, [cramo, cargarCatalogo]);
  // Plan sugerido (RCG: PLANI / PLANII / PLAN3 según la opción) o el único vigente del ramo.
  const preferido = planesRamo.find((p) => p.cplan === sugerido)?.cplan ?? (planesRamo.length === 1 ? planesRamo[0].cplan : '');
  useEffect(() => { setCplan(preferido); }, [cramo, preferido]);

  if (resultado) return <PolizaEmitida emision={resultado} prima={emision ? `${moneda} ${importe(emision.primaTotal)}` : undefined} docs={docs} producto={producto} />;

  const faltan = [
    ...(catalogo?.error ? [`No se pudieron verificar las coberturas del ramo en Sis2000: ${catalogo.error}`] : []),
    ...(!catalogo?.coberturas && !catalogo?.error ? ['Verificando las coberturas del ramo en Sis2000…'] : []),
    ...faltantesEmisionRc({ emision, valida, documento: c.documento, cplan, apartamento: c.apartamento, direccion: c.ubicacion }),
  ];
  const m = (n: number) => `${moneda} ${importe(n)}`;
  const nombreSis = (ccober: string) => catalogo?.coberturas?.find((x) => x.ccober === ccober)?.nombre;

  const emitirAhora = async () => {
    if (!emision) return;
    const plan = planesRamo.find((p) => p.cplan === cplan);
    const aviso = `Se emitirá en Sis2000 QA (ramo ${emision.cramo}, plan contenedor ${plan?.xplan ?? cplan} (${cplan})) por una prima total de `
      + `${m(emision.primaTotal)}, la que calcula el cotizador (nest-api no la recalcula), a nombre de ${c.asegurado}. `
      + 'El recibo queda pendiente de cobro. ¿Continuar?';
    if (!window.confirm(aviso)) return;
    setEmitiendo(true);
    setError(null);
    try {
      const r = await emitirCoberturas(armarEmisionInformada({
        cplan, emision, ncotizacion, tipoDoc: c.tipoDoc, documento: c.documento, nombre: c.asegurado,
        apellido: esPersonaNatural(c.tipoDoc) ? c.apellido : '', correo: c.correo, telefono: c.telefono, direccion: c.ubicacion,
        bien: bien || c.asegurado, apartamento: pideUnidad(emision.cramo) ? Number(c.apartamento) || undefined : undefined,
        cproductor: Number(import.meta.env.VITE_RCG_PLANES_CPRODUCTOR) || 80080,
      }));
      setResultado(r);
      toast.success('Póliza emitida en QA', `${r.cnpoliza} · recibo ${r.cnrecibo || '—'}`);
      // La cotización guardada en Nexus queda emitida (recibo pendiente); si falla el aviso, la póliza ya está emitida.
      if (esCodigoOficial(ncotizacion)) {
        const opcion = /opción (I{1,3})$/.exec(titulo)?.[1] as 'I' | 'II' | 'III' | undefined;
        void registrarEmisionPendiente(ncotizacion, opcion ?? null, r).catch(() => undefined);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEmitiendo(false);
    }
  };

  return (
    <SectionCard title={titulo} Icon={habilitada ? FileCheck2 : Lock}
      description={`Prima del cotizador (en Sis2000 la tarifa de ${xramo || 'este ramo'} la aplica Técnico). Un plan vigente del ramo hace de contenedor.`}
      statusLabel={habilitada ? 'Solo QA' : 'Deshabilitada'} statusTone="warning">
      <div className="space-y-3">
        {emision && emision.lineas.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-[0.75rem]">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left font-bold px-3 py-1.5">Cobertura del cotizador</th>
                  <th className="text-left font-bold px-3 py-1.5">Sis2000</th>
                  <th className="text-right font-bold px-3 py-1.5">Suma</th>
                  {vistaTecnica && <th className="text-right font-bold px-3 py-1.5">Prima</th>}
                </tr>
              </thead>
              <tbody>
                {emision.lineas.map((l) => (
                  <tr key={`${l.ccober}-${l.concepto}`} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-1.5">{l.concepto}{vistaTecnica && l.ambigua && <p className="text-[0.66rem] text-amber-700">{l.ambigua}</p>}</td>
                    <td className="px-3 py-1.5 tabular-nums">{l.ccober}{nombreSis(l.ccober) ? ` · ${nombreSis(l.ccober)}` : ''}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{importe(l.suma)}</td>
                    {vistaTecnica && <td className="px-3 py-1.5 text-right tabular-nums">{importe(l.prima)}</td>}
                  </tr>
                ))}
                <tr className="border-t border-slate-200 font-bold">
                  <td className="px-3 py-1.5" colSpan={vistaTecnica ? 3 : 2}>Prima total</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{m(emision.primaTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Plan contenedor" full
            hint="Aporta la moneda y el código de plan de la póliza. Sis2000 no permite dos pólizas vigentes del mismo asegurado y plan."
            error={errorContenedores ?? (contenedores && cramo != null && !planesRamo.length ? `El ramo ${xramo} no tiene planes vigentes en Sis2000: La Mundial debe crear o activar uno para poder emitir.` : undefined)}>
            <Select value={cplan} onChange={(e) => setCplan(e.target.value)} disabled={cargandoContenedores || !planesRamo.length}>
              <option value="">{cargandoContenedores ? 'Cargando planes…' : 'Elige el plan'}</option>
              {planesRamo.map((p) => <option key={p.cplan} value={p.cplan}>{p.cplan} · {p.xplan}</option>)}
            </Select>
          </Field>
          {pideUnidad(cramo) && (
            <Field label="N.º de apartamento / unidad" hint="Obligatorio en este ramo: Sis2000 identifica la póliza por cédula + plan + unidad.">
              <Input inputMode="numeric" maxLength={6} value={c.apartamento} onChange={(e) => setComun({ apartamento: e.target.value.replace(/\D/g, '') })} placeholder="Ej. 1" />
            </Field>
          )}
        </div>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" className="mt-0.5 w-4 h-4 accent-indigo-600" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} />
          El tomador declara que la información es veraz y acepta los Términos y Condiciones.
        </label>
        {error && <Aviso tono="error">{error}</Aviso>}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" size="lg" disabled={!habilitada || !acepta || faltan.length > 0 || emitiendo} onClick={() => void emitirAhora()}
            title={faltan.join(' ') || undefined}>
            {emitiendo ? <Loader2 size={15} className="animate-spin" /> : <FileCheck2 size={15} />}
            {emitiendo ? 'Emitiendo…' : 'Emitir en Sis2000 QA'}
          </Button>
          <p className="text-[0.78rem] text-slate-500 max-w-md">
            {!habilitada
              ? 'Para probar: VITE_RC_EMITIR=1 en .env.local (con NEST_API_URL de QA) y reiniciar npm run dev.'
              : faltan.length ? faltan.join(' ') : 'Opción de prueba: la póliza queda con el recibo pendiente de cobro. En nest-api: RIESGOS_GENERALES_EMISION_COTIZADOR=true y la key con emissions:riesgos-generales-prima.'}
          </p>
        </div>
      </div>
    </SectionCard>
  );
}
