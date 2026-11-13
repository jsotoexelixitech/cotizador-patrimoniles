import { useEffect, useMemo, useState } from 'react';
import { Building2, Check, FlaskConical, HardHat, Layers, Loader2, Puzzle, RefreshCw, Search } from 'lucide-react';
import { Aviso } from '../components/ui/Aviso';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/FormField';
import { SectionCard } from '../components/ui/SectionCard';
import { StepActions } from '../components/ui/StepActions';
import { cn } from '../lib/utils';
import { importe } from '../tarifas/comun';
import { detalleRamo, filtrarRamos, RAMO_NO_EXISTE, ramoDeBusqueda, seleccionable, type RamoPatrimonial } from '../tarifas/ramos';
import { useCotizacionStore, type Producto } from '../store/cotizacionStore';
import { useNombreRamo } from '../store/comboHook';
import { usePlanesStore } from '../store/planesStore';
import { planesContenedor } from '../tarifas/combo';
import { toast } from '../store/toastStore';
import type { Modo } from '../tarifas/rcp-rce';
import { MODO_CLIENTE } from '../config/modoCliente';
import { CotizacionesView } from './CotizacionesView';

const PRODUCTOS: { id: Producto; nombre: string; detalle: string; desc: string; Icon: typeof Building2 }[] = [
  {
    id: 'rcg', nombre: 'Responsabilidad Civil General', detalle: 'Tarifa RCG', Icon: Building2,
    desc: 'Daños a terceros por la actividad del asegurado. Tú defines límite y tasa; tres opciones (I, II y III), con o sin contrato.',
  },
  {
    id: 'rc', nombre: 'RC Patronal / Empresarial', detalle: 'RCP · RCE', Icon: HardHat,
    desc: 'Responsabilidad del patrono frente a sus trabajadores (LOPCYMAT), calculada sobre la nómina anual.',
  },
  {
    id: 'planes', nombre: 'Planes Sis2000', detalle: 'Planes con precio fijo · todos los ramos', Icon: FlaskConical,
    desc: 'Los planes que La Mundial tiene cargados en Sis2000 (combinados, RC General…), con su suma y prima. Los nuevos aparecen solos. Emite en QA.',
  },
  {
    id: 'combo', nombre: 'Combo de coberturas', detalle: 'Coberturas de un ramo · a la medida', Icon: Puzzle,
    desc: 'Todas las coberturas vigentes de un ramo de Sis2000: eliges cuáles y con qué suma; el cliente ve la prima total. Solo cotiza: para emitir, el combo debe existir como plan.',
  },
];

/**
 * «Planes Sis2000» queda oculto (12-nov-2026): para el usuario es lo mismo que «Combo de coberturas».
 * El código sigue; se vuelve a mostrar con VITE_MOSTRAR_PLANES_SIS2000=1 en .env.local.
 */
const MOSTRAR_PLANES = import.meta.env.VITE_MOSTRAR_PLANES_SIS2000 === '1';
/** «Combo de coberturas» también oculto (13-nov-2026); se muestra con VITE_MOSTRAR_COMBO=1. */
const MOSTRAR_COMBO = import.meta.env.VITE_MOSTRAR_COMBO === '1';
const PRODUCTOS_VISIBLES = PRODUCTOS.filter(
  (p) => (p.id !== 'planes' || MOSTRAR_PLANES) && (p.id !== 'combo' || MOSTRAR_COMBO),
);

const MODOS: [Modo, string][] = [['p', 'Solo Patronal (RCP)'], ['e', 'Solo Empresarial (RCE)'], ['both', 'Patronal + Empresarial']];

export function ProductoStep() {
  const producto = useCotizacionStore((s) => s.producto);
  const setProducto = useCotizacionStore((s) => s.setProducto);
  const modo = useCotizacionStore((s) => s.rc.modo);
  const setRc = useCotizacionStore((s) => s.setRc);
  const ramoSel = useCotizacionStore((s) => s.ramoSel);
  const setRamoSel = useCotizacionStore((s) => s.setRamoSel);
  const planSel = useCotizacionStore((s) => s.planSel);
  const setPlanSel = useCotizacionStore((s) => s.setPlanSel);
  const { ramos, cargandoRamos, errorRamos, cargarRamos } = usePlanesStore();

  // El combo consulta su propia lista de ramos (RamoCombo).
  useEffect(() => {
    if (producto === 'planes' && !ramos.length && !cargandoRamos && !errorRamos) void cargarRamos();
  }, [producto]); // eslint-disable-line react-hooks/exhaustive-deps

  const ramo = ramos.find((r) => r.cramo === ramoSel);

  return (
    <div className="space-y-5">
      <SectionCard title="¿Qué deseas cotizar?" description={MOSTRAR_PLANES || MOSTRAR_COMBO ? 'Tarifa del cotizador (RCG o RCP/RCE), un plan ya configurado en Sis2000 o un combo con las coberturas de un ramo.' : 'Responsabilidad Civil General o RC Patronal / Empresarial, con la tarifa del cotizador.'} Icon={Layers}>
        <div className="grid sm:grid-cols-2 gap-3">
          {PRODUCTOS_VISIBLES.map((p) => {
            const active = producto === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setProducto(p.id)}
                className={cn(
                  'text-left rounded-2xl border p-5 transition-all',
                  active ? 'border-indigo-400 bg-indigo-50/60 ring-2 ring-indigo-200' : 'border-slate-200 bg-white hover:border-indigo-200',
                )}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 grid place-items-center shadow-[0_4px_14px_rgba(15,26,90,0.3)]">
                    <p.Icon size={18} className="text-white" />
                  </div>
                  {active && (
                    <span className="w-6 h-6 rounded-full bg-indigo-600 text-white grid place-items-center">
                      <Check size={12} strokeWidth={3} />
                    </span>
                  )}
                </div>
                <p className="font-display font-bold text-slate-900">{p.nombre}</p>
                <p className="text-[0.65rem] font-bold uppercase tracking-wider text-indigo-500 mt-1">{p.detalle}</p>
                <p className="text-[0.78rem] text-slate-500 mt-2 leading-relaxed">{p.desc}</p>
              </button>
            );
          })}
        </div>

        {producto === 'rc' && (
          <div className="mt-4">
            <p className="text-[0.78rem] font-bold text-slate-600 tracking-wide mb-2">¿Qué deseas cotizar?</p>
            <div className="flex flex-wrap gap-2">
              {MODOS.map(([v, t]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setRc({ modo: v })}
                  className={cn(
                    'px-4 py-2 rounded-full text-sm font-bold border transition-all',
                    modo === v ? 'bg-indigo-700 text-white border-indigo-700' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300',
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {producto === 'planes' && (
          <div className="mt-4">
            <p className="text-[0.78rem] font-bold text-slate-600 tracking-wide mb-2">Ramo de Sis2000</p>
            {cargandoRamos && <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" /> Consultando los planes de Sis2000…</p>}
            {errorRamos && (
              <div className="space-y-3">
                <Aviso tono="error">{errorRamos}</Aviso>
                <Button variant="secondary" size="sm" onClick={() => void cargarRamos()}><RefreshCw size={13} /> Reintentar</Button>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {ramos.map((r) => {
                const cotizables = r.planes.filter((p) => p.cotizable).length;
                return (
                  <button
                    key={r.cramo}
                    type="button"
                    disabled={!cotizables}
                    title={cotizables ? undefined : 'Ningún plan de este ramo tiene tarifa en Sis2000.'}
                    onClick={() => setRamoSel(r.cramo)}
                    className={cn(
                      'px-4 py-2 rounded-full text-sm font-bold border transition-all disabled:opacity-40 disabled:cursor-not-allowed',
                      ramoSel === r.cramo ? 'bg-indigo-700 text-white border-indigo-700' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300',
                    )}
                  >
                    {r.xramo} <span className="font-normal opacity-75">· {cotizables} {cotizables === 1 ? 'plan' : 'planes'}</span>
                  </button>
                );
              })}
            </div>

            {ramo && (
              <div className="mt-4">
                <p className="text-[0.78rem] font-bold text-slate-600 tracking-wide mb-2">Plan · {ramo.xramo}</p>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {ramo.planes.filter((p) => p.cotizable).map((p) => {
                    const activo = planSel === p.cplan;
                    return (
                      <button
                        key={p.cplan}
                        type="button"
                        onClick={() => setPlanSel(p.cplan)}
                        className={cn(
                          'text-left rounded-2xl border p-4 transition-all',
                          activo ? 'border-indigo-400 bg-indigo-50/60 ring-2 ring-indigo-200' : 'border-slate-200 bg-white hover:border-indigo-200',
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-display font-bold text-slate-900 text-sm">{p.xplan}</p>
                          {activo && <span className="w-5 h-5 shrink-0 rounded-full bg-indigo-600 text-white grid place-items-center"><Check size={11} strokeWidth={3} /></span>}
                        </div>
                        <p className="font-display text-xl font-black gradient-text-indigo tabular-nums mt-1">USD {importe(p.mprima)}</p>
                        <p className="text-[0.75rem] text-slate-500 mt-1">
                          Suma {importe(p.msumamax)} · {p.qcoberturas} {p.qcoberturas === 1 ? 'cobertura' : 'coberturas'} · {p.cplan}
                        </p>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[0.72rem] text-slate-500 mt-2">Prima anual de referencia de Sis2000; se confirma en línea en el paso de cotización.</p>
              </div>
            )}
          </div>
        )}

        {producto === 'combo' && <RamoCombo />}
      </SectionCard>

      <StepActions onContinue={() => {
        if (!producto) { toast.warning('Selecciona un producto', 'Elige RC General, RC Patronal / Empresarial, los planes de Sis2000 o un combo de coberturas.'); return false; }
        if (producto === 'planes' && !ramo) { toast.warning('Selecciona un ramo', 'Elige el ramo de Sis2000 que deseas cotizar.'); return false; }
        if (producto === 'planes' && !ramo?.planes.some((p) => p.cplan === planSel)) { toast.warning('Selecciona un plan', 'Elige el plan de Sis2000 que deseas cotizar.'); return false; }
        if (producto === 'combo') return comboListo();
        return true;
      }} />

      {/* Admin: las cotizaciones guardadas (vigentes por defecto, con historial) debajo de elegir producto. */}
      {!MODO_CLIENTE && <CotizacionesView />}
    </div>
  );
}

/** Paso 1 del combo: ramo elegido y sus coberturas cargadas. */
function comboListo(): boolean {
  const cramo = useCotizacionStore.getState().ramoCombo;
  const cat = cramo == null ? undefined : usePlanesStore.getState().catalogos[cramo];
  if (cramo == null) { toast.warning('Selecciona un ramo', 'Busca y elige el ramo de Sis2000 del combo.'); return false; }
  if (!cat || cat.cargando) { toast.warning('Cargando coberturas', 'Espera las coberturas del ramo.'); return false; }
  if (cat.error) { toast.error('No se pudieron cargar las coberturas', cat.error); return false; }
  if (!cat.coberturas?.length) { toast.warning('Ramo sin coberturas', 'Ese ramo no tiene coberturas con tarifa vigente en Sis2000.'); return false; }
  return true;
}

const plural = (n: number, una: string, varias: string) => `${n} ${n === 1 ? una : varias}`;

type FiltroPlan = 'todos' | 'con' | 'sin';

/**
 * Combo: el ramo se busca por nombre o número y solo se elige de la lista de Sis2000 (riesgos-generales/ramos, o los
 * ramos con planes si ese nest-api aún no tiene la ruta); al elegirlo se consultan todas sus coberturas vigentes.
 */
function RamoCombo() {
  const ramoCombo = useCotizacionStore((s) => s.ramoCombo);
  const setRamoCombo = useCotizacionStore((s) => s.setRamoCombo);
  const lista = usePlanesStore((s) => s.ramosCombo);
  const respaldo = usePlanesStore((s) => s.ramosComboRespaldo);
  const cargandoRamos = usePlanesStore((s) => s.cargandoRamosCombo);
  const errorRamos = usePlanesStore((s) => s.errorRamosCombo);
  const cargarRamos = usePlanesStore((s) => s.cargarRamosCombo);
  const catalogo = usePlanesStore((s) => (ramoCombo == null ? undefined : s.catalogos[ramoCombo]));
  const cargarCatalogo = usePlanesStore((s) => s.cargarCatalogo);
  const xramo = useNombreRamo(ramoCombo);
  const [busqueda, setBusqueda] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  // Plan contenedor: sin un plan vigente del ramo en Sis2000 el combo se cotiza pero no se emite.
  const contenedores = usePlanesStore((s) => s.contenedores);
  const cargarContenedores = usePlanesStore((s) => s.cargarContenedores);
  const [filtroPlan, setFiltroPlan] = useState<FiltroPlan>('todos');
  const planesDe = (cramo: number) => (contenedores ? planesContenedor(contenedores, cramo).length : null);
  const ramos = useMemo(() => lista ?? [], [lista]);
  const resultados = useMemo(() => {
    const r = filtrarRamos(ramos, busqueda);
    if (filtroPlan === 'todos' || !contenedores) return r;
    return r.filter((x) => (planesContenedor(contenedores, x.cramo).length > 0) === (filtroPlan === 'con'));
  }, [ramos, busqueda, filtroPlan, contenedores]);
  const conPlan = useMemo(
    () => (contenedores ? ramos.filter((x) => planesContenedor(contenedores, x.cramo).length > 0).length : 0),
    [ramos, contenedores],
  );

  useEffect(() => { void cargarContenedores(); }, [cargarContenedores]);
  // Lo escrito no coincide con ningún ramo de la lista: solo se avisa, no se consulta nada.
  const sinCoincidencias = ramos.length > 0 && busqueda.trim() !== '' && resultados.length === 0;
  const mensaje = sinCoincidencias ? RAMO_NO_EXISTE : aviso;

  useEffect(() => {
    if (lista == null && !cargandoRamos && !errorRamos) void cargarRamos();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (ramoCombo != null) void cargarCatalogo(ramoCombo);
  }, [ramoCombo]); // eslint-disable-line react-hooks/exhaustive-deps

  const elegir = (r: RamoPatrimonial) => {
    if (!seleccionable(r)) return;
    setRamoCombo(r.cramo);
    setAviso(null);
  };
  // Enter: el ramo con ese número o el primero elegible de los resultados; si no hay, solo el aviso.
  const elegirConEnter = () => {
    const r = ramoDeBusqueda(ramos, busqueda);
    if (r.ramo) elegir(r.ramo);
    else setAviso(r.aviso);
  };

  const coberturas = catalogo?.coberturas;
  const obligatorias = coberturas?.filter((c) => c.obligatoria).length ?? 0;

  return (
    <div className="mt-4">
      <p className="text-[0.78rem] font-bold text-slate-600 tracking-wide mb-2">Ramo de Sis2000</p>
      <div className="relative max-w-md">
        <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input
          type="search"
          value={busqueda}
          onChange={(e) => { setBusqueda(e.target.value); setAviso(null); }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
            e.preventDefault();
            elegirConEnter();
          }}
          placeholder="Buscar ramo por nombre o número"
          aria-label="Buscar ramo por nombre o número"
          autoComplete="off"
          enterKeyHint="search"
          style={{ paddingLeft: '2.5rem' }}
        />
      </div>
      <p className="mt-1.5 text-[0.72rem] text-slate-500">Escribe parte del nombre o el número del ramo; Enter elige el primero de la lista.</p>
      {contenedores && ramos.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {([
            ['todos', `Todos (${ramos.length})`],
            ['con', `Con plan · emiten (${conPlan})`],
            ['sin', `Sin plan · solo cotizan (${ramos.length - conPlan})`],
          ] as [FiltroPlan, string][]).map(([id, txt]) => (
            <button key={id} type="button" aria-pressed={filtroPlan === id} onClick={() => setFiltroPlan(id)}
              className={cn('px-3 py-1 rounded-full text-[0.72rem] font-bold border transition-all',
                filtroPlan === id ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400')}>
              {txt}
            </button>
          ))}
          <span className="text-[0.7rem] text-slate-500">Para emitir, Sis2000 necesita un plan vigente del ramo (como Condominio, que emite con su único plan y las coberturas elegidas).</span>
        </div>
      )}
      {cargandoRamos && <p className="mt-3 flex items-center gap-2 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" /> Consultando los ramos de Sis2000…</p>}
      {errorRamos && (
        <div className="mt-3 space-y-3">
          <Aviso tono="error">{errorRamos}</Aviso>
          <Button variant="secondary" size="sm" onClick={() => void cargarRamos()}><RefreshCw size={13} /> Reintentar</Button>
        </div>
      )}
      {respaldo && (
        <p className="mt-2 text-[0.72rem] text-slate-500">Este ambiente aún no tiene la lista completa de ramos: se muestran los ramos con planes en Sis2000.</p>
      )}
      {lista && !lista.length && <div className="mt-3"><Aviso>Sis2000 no devolvió ramos patrimoniales.</Aviso></div>}
      {mensaje && <div className="mt-3"><Aviso>{mensaje}</Aviso></div>}
      {resultados.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 max-h-72 overflow-y-auto p-0.5">
          {resultados.map((r) => {
            const elegible = seleccionable(r);
            return (
              <button
                key={r.cramo}
                type="button"
                disabled={!elegible}
                aria-pressed={ramoCombo === r.cramo}
                title={elegible ? undefined : 'Sin coberturas con tarifa vigente en Sis2000.'}
                onClick={() => elegir(r)}
                className={cn(
                  'px-4 py-2 rounded-full text-sm font-bold border transition-all disabled:opacity-40 disabled:cursor-not-allowed',
                  ramoCombo === r.cramo ? 'bg-indigo-700 text-white border-indigo-700' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300',
                )}
              >
                {r.xramo} <span className="font-normal opacity-75">· {detalleRamo(r)}</span>
                {planesDe(r.cramo) != null && (
                  <span className={cn('ml-2 rounded-full px-1.5 py-px text-[0.62rem] font-bold uppercase tracking-wide border',
                    ramoCombo === r.cramo ? 'border-white/40 text-white'
                      : planesDe(r.cramo) ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-slate-50 text-slate-500')}>
                    {planesDe(r.cramo) ? plural(planesDe(r.cramo) ?? 0, 'plan', 'planes') : 'sin plan'}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {ramoCombo != null && (
        <div className="mt-4">
          {(!catalogo || catalogo.cargando) && (
            <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" /> Consultando las coberturas de {xramo}…</p>
          )}
          {catalogo?.error && (
            <div className="space-y-3">
              <Aviso tono="error">{catalogo.error}</Aviso>
              <Button variant="secondary" size="sm" onClick={() => void cargarCatalogo(ramoCombo)}><RefreshCw size={13} /> Reintentar</Button>
            </div>
          )}
          {coberturas && (coberturas.length ? (
            <p className="text-[0.78rem] text-slate-600">
              <strong>{xramo}</strong>: {plural(coberturas.length, 'cobertura', 'coberturas')} con tarifa vigente
              {obligatorias > 0 && `, ${plural(obligatorias, 'obligatoria', 'obligatorias')}`}. Arma el combo en el paso de cotización.
            </p>
          ) : (
            <Aviso>{xramo} no tiene coberturas con tarifa vigente en Sis2000.</Aviso>
          ))}
        </div>
      )}
    </div>
  );
}
