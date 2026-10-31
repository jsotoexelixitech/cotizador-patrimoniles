import { useMemo, useState } from 'react';
import { Building2, Search, Users } from 'lucide-react';
import { Aviso } from '../components/ui/Aviso';
import { SectionCard } from '../components/ui/SectionCard';
import { Field, Input, Select } from '../components/ui/FormField';
import { StepActions } from '../components/ui/StepActions';
import { importe, porcentaje } from '../tarifas/comun';
import { AVISO_MESA_TECNICA, INDOLE_OTRA, tasaPromedio } from '../tarifas/rcg';
import { useParametrosStore } from '../store/parametrosStore';
import { actividadesDeClase, tasaMedia, type BaseNomina, type MonedaRc } from '../tarifas/rcp-rce';
import { claseRc, useCotizacionRc, useCotizacionRcg, useCotizacionStore, useMesaTecnica } from '../store/cotizacionStore';
import { usePlanesStore } from '../store/planesStore';
import { RAMO_RCG } from '../tarifas/planes-rcg';
import { toast } from '../store/toastStore';

export function RiesgoStep() {
  const producto = useCotizacionStore((s) => s.producto);
  const ramoSel = useCotizacionStore((s) => s.ramoSel);
  if (producto === 'combo' || (producto === 'planes' && ramoSel !== RAMO_RCG)) return <RiesgoPlan />;
  return producto === 'rc' ? <RiesgoRc /> : <RiesgoRcg />;
}

/** Actividad restringida: ya no bloquea; se avisa aquí y en la cotización, y el resumen y el PDF lo indican. */
export function AvisoMesaTecnica() {
  return <Aviso><strong>{AVISO_MESA_TECNICA}.</strong> Puedes continuar: la cotización quedará sujeta a su aprobación.</Aviso>;
}

const avisarMesaTecnica = () => toast.warning(AVISO_MESA_TECNICA, 'La cotización quedará sujeta a su aprobación.');

const intentoApto = (pide: boolean, apto: string) => (pide && !(Number(apto) > 0) ? 'Indica el número de apartamento o unidad.' : undefined);

/** Ramos de Sis2000 distintos del RCG y combos: no hay tarifa por clase, solo la descripción del riesgo. */
function RiesgoPlan() {
  const rcg = useCotizacionStore((s) => s.rcg);
  const setRcg = useCotizacionStore((s) => s.setRcg);
  const combo = useCotizacionStore((s) => s.producto === 'combo');
  const cramo = useCotizacionStore((s) => (combo ? s.ramoCombo : s.ramoSel));
  const apartamento = useCotizacionStore((s) => s.comun.apartamento);
  const setComun = useCotizacionStore((s) => s.setComun);
  // Hogar (38): Sis2000 identifica la póliza por cédula + plan + apartamento. El combo no emite: no lo pide.
  const pideApto = !combo && cramo === 38;
  const errorApto = intentoApto(pideApto, apartamento);
  const xramo = usePlanesStore((s) => s.ramos.find((r) => r.cramo === cramo)?.xramo);
  const mesaTecnica = useMesaTecnica();
  const [intento, setIntento] = useState(false);
  const error = intento && !rcg.actividadEspecifica.trim() ? 'Describe el bien o la actividad asegurada.' : undefined;

  return (
    <div className="space-y-5">
      <SectionCard title="Riesgo asegurado" description={xramo ? `Ramo ${xramo}` : cramo != null ? `Ramo ${cramo}` : undefined} Icon={Building2}>
        <Field label="Bien o actividad asegurada" full error={error}
          hint={combo ? 'Aparece en la cotización como bien o actividad asegurada.' : 'Va en la descripción del bien de la póliza (p. ej. nombre y matrícula de la embarcación, o el inmueble).'}>
          <Input value={rcg.actividadEspecifica} maxLength={250} onChange={(e) => setRcg({ actividadEspecifica: e.target.value })} placeholder="Ej. Apartamento 5-B, Residencias Los Palos Grandes" />
        </Field>
        {pideApto && (
          <div className="grid sm:grid-cols-3 gap-4 mt-4">
            <Field label="N.º de apartamento / unidad" error={intento ? errorApto : undefined} hint="Solo números. Sis2000 identifica la póliza por cédula + plan + unidad.">
              <Input inputMode="numeric" maxLength={6} value={apartamento} onChange={(e) => setComun({ apartamento: e.target.value.replace(/\D/g, '') })} placeholder="Ej. 52" />
            </Field>
          </div>
        )}
      </SectionCard>

      {mesaTecnica && <AvisoMesaTecnica />}

      <StepActions onContinue={() => {
        setIntento(true);
        if (!rcg.actividadEspecifica.trim()) { toast.error('Revisa el riesgo', 'Describe el bien o la actividad asegurada.'); return false; }
        if (errorApto) { toast.error('Revisa el riesgo', errorApto); return false; }
        if (mesaTecnica) avisarMesaTecnica();
        return true;
      }} />
    </div>
  );
}

function RiesgoRcg() {
  const prm = useParametrosStore((s) => s.rcg);
  const rcg = useCotizacionStore((s) => s.rcg);
  const setRcg = useCotizacionStore((s) => s.setRcg);
  const cot = useCotizacionRcg();
  const [intento, setIntento] = useState(false);
  const clase = prm.clases[rcg.clase] ?? prm.clases[0];
  const err = (k: 'indole' | 'actividadEspecifica') => (intento || rcg[k] ? cot.errores[k] : undefined);

  return (
    <div className="space-y-5">
      <SectionCard title="Clase de riesgo" description="Define el rango de tasa permitido." Icon={Building2}>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Clase de riesgo" full hint={`Rango de tasa: ${clase.min.toFixed(2)} % – ${clase.max.toFixed(2)} %`}>
            <Select value={rcg.clase} onChange={(e) => {
              const i = Number(e.target.value);
              setRcg({ clase: i, tasa: String(tasaPromedio(prm.clases[i])) });
            }}>
              {prm.clases.map((c, i) => <option key={c.nombre} value={i}>{c.etiqueta} ({c.min.toFixed(2)} % – {c.max.toFixed(2)} %)</option>)}
            </Select>
          </Field>
          <Field label="Índole específica" full error={err('indole')}
            hint={rcg.indole === INDOLE_OTRA ? 'Describe claramente la actividad abajo. Sujeto a revisión de suscripción.' : 'Selección sujeta a revisión de suscripción.'}>
            <Select value={rcg.indole} onChange={(e) => setRcg({ indole: e.target.value })}>
              <option value="">Seleccione una índole específica…</option>
              <optgroup label="Actividades de la clase seleccionada">
                {clase.indoles.map((v) => <option key={v} value={v}>{v}</option>)}
                <option value={INDOLE_OTRA}>{INDOLE_OTRA}</option>
              </optgroup>
              <optgroup label="Clasificación obligatoria: Industrias">
                {prm.industrias.map((v) => <option key={v} value={v}>{v}{!clase.industria ? ' (requiere clase Industrias)' : ''}</option>)}
              </optgroup>
              <optgroup label="Restringidas — sujetas a la mesa técnica">
                {prm.restringidas.map((v) => <option key={v} value={v}>⚠ {v}</option>)}
              </optgroup>
            </Select>
          </Field>
          <Field label="Actividad específica" full error={err('actividadEspecifica')}>
            <Input value={rcg.actividadEspecifica} maxLength={180} onChange={(e) => setRcg({ actividadEspecifica: e.target.value })} placeholder="Ej. Venta de medicinas y artículos de cuidado personal" />
          </Field>
        </div>
      </SectionCard>

      {cot.restringida && <AvisoMesaTecnica />}

      <StepActions onContinue={() => {
        setIntento(true);
        const e = cot.errores.indole ?? cot.errores.actividadEspecifica ?? cot.errores.clase;
        if (e) { toast.error('Revisa el riesgo', e); return false; }
        if (cot.restringida) avisarMesaTecnica();
        return true;
      }} />
    </div>
  );
}

function RiesgoRc() {
  const prmRc = useParametrosStore((s) => s.rc);
  const rc = useCotizacionStore((s) => s.rc);
  const setRc = useCotizacionStore((s) => s.setRc);
  const setRcProducto = useCotizacionStore((s) => s.setRcProducto);
  const cot = useCotizacionRc();
  const [intento, setIntento] = useState(false);
  const [filtro, setFiltro] = useState('');
  const clase = claseRc(rc);
  const ves = rc.moneda === 'VES';
  const simbolo = ves ? 'Bs' : rc.moneda;
  const actividades = useMemo(() => (clase === null ? [] : actividadesDeClase(clase, prmRc)), [clase, prmRc]);
  const filtradas = actividades.filter((i) => !filtro || prmRc.actividades[i][0].toLowerCase().includes(filtro.toLowerCase()));
  const actividad = rc.actividad === '' ? null : prmRc.actividades[Number(rc.actividad)];

  // Al cambiar clase/actividad se propone la tasa media del rango (igual que el original).
  const aplicarClase = (c: number | null) => {
    setRc({ actividad: '' });
    setRcProducto('p', { tasa: c === null ? '' : String(tasaMedia(prmRc.clases[c])) });
    setRcProducto('e', { tasa: '' });
  };

  return (
    <div className="space-y-5">
      <SectionCard title="Clasificación del riesgo" description="La clase común define la tasa patronal; la actividad, la empresarial." Icon={Building2}>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Índole (descripción de la actividad)" full>
            <Input value={rc.indole} onChange={(e) => setRc({ indole: e.target.value })} placeholder="Ej. Venta de repuestos automotrices" />
          </Field>
          <Field label="Clase común" full hint={clase !== null ? `Patronal: ${porcentaje(prmRc.clases[clase][1])} – ${porcentaje(prmRc.clases[clase][2])}` : undefined}>
            <Select value={rc.claseSel} onChange={(e) => {
              const v = e.target.value;
              setRc({ claseSel: v, claseRelacionada: '' });
              aplicarClase(v === '' || v === 'other' ? null : Number(v));
            }}>
              <option value="">Selecciona una clase</option>
              {prmRc.clases.map((r, i) => <option key={r[0]} value={i}>{i + 1}. {r[0]}</option>)}
              <option value="other">12. Otras (especificar)</option>
            </Select>
          </Field>
          {rc.claseSel === 'other' && (
            <Field label="Clase relacionada" full>
              <Select value={rc.claseRelacionada} onChange={(e) => { setRc({ claseRelacionada: e.target.value }); aplicarClase(e.target.value === '' ? null : Number(e.target.value)); }}>
                <option value="">Selecciona la clase más parecida</option>
                {prmRc.clases.map((r, i) => <option key={r[0]} value={i}>{i + 1}. {r[0]}</option>)}
              </Select>
            </Field>
          )}
          {clase !== null && (
            <>
              <Field label="Buscar actividad">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input className="pl-9" type="search" value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Filtrar por nombre…" />
                </div>
              </Field>
              <Field label={`Actividad del riesgo (${filtradas.length})`}
                hint={actividad ? `Empresarial: ${porcentaje(actividad[1])} – ${porcentaje(actividad[2])}` : undefined}
                error={intento && rc.actividad === '' ? 'Selecciona una actividad vinculada a la clase.' : undefined}>
                <Select value={rc.actividad} onChange={(e) => {
                  setRc({ actividad: e.target.value });
                  setRcProducto('e', { tasa: e.target.value === '' ? '' : String(tasaMedia(prmRc.actividades[Number(e.target.value)])) });
                }}>
                  <option value="">Selecciona la actividad</option>
                  {filtradas.map((i) => <option key={i} value={i}>{prmRc.actividades[i][0]}</option>)}
                </Select>
              </Field>
            </>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Nómina" description="Base del cálculo de la prima y de los límites por trabajador." Icon={Users}>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Moneda">
            <Select value={rc.moneda} onChange={(e) => setRc({ moneda: e.target.value as MonedaRc })}>
              <option value="USD">Dólares (USD)</option>
              <option value="EUR">Euros (EUR)</option>
              <option value="VES">Bolívares (Bs)</option>
            </Select>
          </Field>
          {ves && (
            <Field label="Tasa BCV del día (1 USD = Bs)" hint="Tasa oficial publicada por el BCV.">
              <Input type="number" min={0} step="0.0001" value={rc.tasaBcv} onChange={(e) => setRc({ tasaBcv: e.target.value })} />
            </Field>
          )}
          <Field label="Base">
            <Select value={rc.base} onChange={(e) => setRc({ base: e.target.value as BaseNomina })}>
              <option value="employee">Salario anual promedio por empleado</option>
              <option value="total">Nómina anual total</option>
            </Select>
          </Field>
          <Field label={`Monto anual (${simbolo})`} hint={ves ? 'Monto en bolívares.' : `Promedio por empleado mínimo ${simbolo} 1.800.`}>
            <Input type="number" min={0} step="0.01" value={rc.monto} onChange={(e) => setRc({ monto: e.target.value })} />
          </Field>
          <Field label="Cantidad de empleados">
            <Input type="number" min={1} step={1} value={rc.empleados} onChange={(e) => setRc({ empleados: e.target.value })} />
          </Field>
          <div className="rounded-xl bg-indigo-50/60 border border-indigo-100 px-4 py-3 self-end">
            <p className="text-[0.65rem] font-bold uppercase tracking-wider text-indigo-500">Nómina anual total</p>
            <p className="font-display text-xl font-black gradient-text-indigo tabular-nums">{simbolo} {importe(cot.nomina)}</p>
          </div>
        </div>
      </SectionCard>

      {intento && cot.erroresPorPaso.riesgo.map((x) => <Aviso key={x} tono="error">{x}</Aviso>)}

      <StepActions onContinue={() => {
        setIntento(true);
        const e = cot.erroresPorPaso.riesgo[0];
        if (e) { toast.error('Revisa el riesgo', e); return false; }
        return true;
      }} />
    </div>
  );
}
