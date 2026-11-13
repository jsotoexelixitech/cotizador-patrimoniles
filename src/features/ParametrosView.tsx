import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Banknote, Building2, Calculator, Download, FileText, Layers, ListChecks, Percent, Plus, RotateCcw, Scale, Search, ShieldAlert,
  Stamp, Trash2, Upload, Users,
} from 'lucide-react';
import { SectionCard } from '../components/ui/SectionCard';
import { Field, Input, Textarea } from '../components/ui/FormField';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Aviso } from '../components/ui/Aviso';
import { ToggleSwitch } from '../components/ui/ToggleSwitch';
import { cn } from '../lib/utils';
import { esPersonalizado, exportarParametros, useParametrosStore } from '../store/parametrosStore';
import { toast } from '../store/toastStore';
import { deducibleRcg, type ClaseRcg } from '../tarifas/rcg';
import type { Rango } from '../tarifas/rcp-rce';
import { erroresTramos, type TramoDescuento } from '../tarifas/descuentos';

/** Input numérico que permite escribir libremente y solo publica valores válidos. */
function Num({ value, onChange, step = 'any', className, sufijo }: { value: number; onChange: (n: number) => void; step?: string; className?: string; sufijo?: string }) {
  const [txt, setTxt] = useState(String(value));
  useEffect(() => { if (Number(txt) !== value) setTxt(String(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const input = (
    <Input
      type="number"
      step={step}
      value={txt}
      className={cn('tabular-nums', sufijo && 'pr-9', className)}
      onChange={(e) => {
        setTxt(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value.trim() !== '' && Number.isFinite(n)) onChange(n);
      }}
    />
  );
  if (!sufijo) return input;
  return (
    <div className="relative">
      {input}
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[0.72rem] font-bold text-slate-400 pointer-events-none">{sufijo}</span>
    </div>
  );
}

/** Lista de textos editable como una línea por elemento. */
function Lineas({ value, onChange, rows = 5 }: { value: string[]; onChange: (v: string[]) => void; rows?: number }) {
  const [txt, setTxt] = useState(value.join('\n'));
  useEffect(() => { if (txt.split('\n').map((x) => x.trim()).filter(Boolean).join('\n') !== value.join('\n')) setTxt(value.join('\n')); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Textarea
      rows={rows}
      value={txt}
      className="text-[0.82rem] leading-relaxed"
      onChange={(e) => { setTxt(e.target.value); onChange(e.target.value.split('\n').map((x) => x.trim()).filter(Boolean)); }}
    />
  );
}

function Tabla({ cabecera, children }: { cabecera: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-[0.8rem]">
        <thead className="bg-slate-50 text-slate-600">
          <tr>{cabecera.map((c) => <th key={c} className="text-left font-bold px-3 py-2 whitespace-nowrap">{c}</th>)}</tr>
        </thead>
        <tbody className="[&_td]:px-2 [&_td]:py-1.5 [&_tr]:border-t [&_tr]:border-slate-100 [&_input]:py-1.5">{children}</tbody>
      </table>
    </div>
  );
}

const BotonIcono = ({ onClick, titulo, children }: { onClick: () => void; titulo: string; children: ReactNode }) => (
  <button type="button" onClick={onClick} title={titulo} aria-label={titulo}
    className="w-8 h-8 rounded-lg grid place-items-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors">
    {children}
  </button>
);

const rangoInvalido = (min: number, max: number) => !(min >= 0) || !(max >= min);

/** Configurar descuentos: tramos «desde esta suma asegurada → % de descuento sobre la tasa básica». */
function DescuentosCard({ tramos, onChange, ayuda }: { tramos: TramoDescuento[]; onChange: (t: TramoDescuento[]) => void; ayuda: string }) {
  const errores = erroresTramos(tramos);
  const setTramo = (i: number, c: Partial<TramoDescuento>) => onChange(tramos.map((x, j) => (j === i ? { ...x, ...c } : x)));
  return (
    <SectionCard title="Configurar descuentos" Icon={Percent}
      description="Descuento sobre la tasa básica por suma asegurada elevada. Se aplica antes de calcular la prima; las primas mínimas se respetan."
      statusLabel={tramos.length ? `${tramos.length} tramo${tramos.length > 1 ? 's' : ''}` : 'Sin descuento'} statusTone={tramos.length ? 'success' : undefined}>
      {tramos.length > 0 && (
        <Tabla cabecera={['Desde suma asegurada', 'Descuento sobre la tasa básica', '']}>
          {tramos.map((t, i) => (
            <tr key={i}>
              <td><Num value={t.desde} onChange={(n) => setTramo(i, { desde: n })} /></td>
              <td><Num value={t.pct} onChange={(n) => setTramo(i, { pct: n })} sufijo="%" /></td>
              <td className="w-10"><BotonIcono titulo="Quitar tramo" onClick={() => onChange(tramos.filter((_, j) => j !== i))}><Trash2 size={14} /></BotonIcono></td>
            </tr>
          ))}
        </Tabla>
      )}
      <div className="flex flex-wrap items-center gap-3 mt-3">
        <Button variant="secondary" size="sm" onClick={() => onChange([...tramos, { desde: (tramos[tramos.length - 1]?.desde ?? 0) + 100000, pct: 5 }])}>
          <Plus size={13} /> Agregar tramo
        </Button>
        <p className="text-[0.72rem] text-slate-500">{ayuda} A cada suma se le aplica el tramo más alto que alcanza.</p>
      </div>
      {errores.length > 0 && <div className="mt-3"><Aviso tono="error">{errores.join(' ')}</Aviso></div>}
    </SectionCard>
  );
}

export function ParametrosView() {
  const [pestana, setPestana] = useState<'rcg' | 'rc'>('rcg');
  const { rcg, rc, actualizado, restaurar, importar, vistaTecnica, setVistaTecnica } = useParametrosStore();
  const personalizado = esPersonalizado({ rcg, rc });
  const archivo = useRef<HTMLInputElement>(null);

  const exportar = () => {
    const url = URL.createObjectURL(new Blob([exportarParametros({ rcg, rc })], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `parametros-cotizador-rc-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <Badge tone={personalizado ? 'warn' : 'success'}>{personalizado ? 'Tarifa personalizada' : 'Tarifa oficial La Mundial'}</Badge>
          <span className="text-[0.75rem] text-slate-500">
            Los cambios se aplican al instante y se guardan en este navegador{actualizado ? ` · última modificación ${new Date(actualizado).toLocaleString('es-VE')}` : ''}.
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={exportar}><Download size={13} /> Exportar</Button>
          <Button variant="secondary" size="sm" onClick={() => archivo.current?.click()}><Upload size={13} /> Importar</Button>
          <Button variant="ghost" size="sm" onClick={() => {
            if (window.confirm(`¿Restaurar los valores oficiales de ${pestana === 'rcg' ? 'RC General' : 'RC Patronal / Empresarial'}?`)) {
              restaurar(pestana);
              toast.success('Valores oficiales restaurados');
            }
          }}><RotateCcw size={13} /> Restaurar oficiales</Button>
          <input ref={archivo} type="file" accept="application/json,.json" hidden onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try { importar(JSON.parse(await f.text())); toast.success('Parámetros importados', f.name); }
            catch (err) { toast.error('No se pudo importar', err instanceof Error ? err.message : String(err)); }
          }} />
        </div>
      </div>

      <ToggleSwitch
        checked={vistaTecnica}
        onChange={setVistaTecnica}
        label="Vista técnica"
        description="Muestra la tasa y la prima de cada cobertura (perfiles técnicos). Apagada, el cliente solo ve la prima total, también en el resumen y en el PDF."
      />

      <div className="flex flex-wrap gap-2">
        {([['rcg', 'RC General'], ['rc', 'RC Patronal / Empresarial']] as const).map(([v, t]) => (
          <button key={v} type="button" onClick={() => setPestana(v)}
            className={cn('px-4 py-2 rounded-full text-sm font-bold border transition-all',
              pestana === v ? 'bg-indigo-700 text-white border-indigo-700' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300')}>
            {t}
          </button>
        ))}
      </div>

      {pestana === 'rcg' ? <ParametrosRcgView /> : <ParametrosRcView />}
    </div>
  );
}

// ======================= RC GENERAL =======================

function ParametrosRcgView() {
  const p = useParametrosStore((s) => s.rcg);
  const set = useParametrosStore((s) => s.setRcg);
  const setClase = (i: number, c: Partial<ClaseRcg>) => set({ clases: p.clases.map((x, j) => (j === i ? { ...x, ...c } : x)) });
  const sublimites = Object.entries(p.sublimites);
  const todasCoberturas = useMemo(() => [...new Set([...p.coberturasSinContrato, ...p.coberturasConContrato])], [p.coberturasSinContrato, p.coberturasConContrato]);

  return (
    <div className="space-y-5">
      <SectionCard title="Límites y primas mínimas" description="Rango del límite inicial, multiplicadores de las opciones y prima mínima." Icon={Calculator}>
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Suma asegurada mínima"><Num value={p.limiteMin} onChange={(n) => set({ limiteMin: n })} /></Field>
          <Field label="Suma asegurada máxima / tope de opciones"><Num value={p.limiteMax} onChange={(n) => set({ limiteMax: n })} /></Field>
          <Field label="Vigencia de la cotización"><Num value={p.vigenciaDias} onChange={(n) => set({ vigenciaDias: n })} sufijo="días" /></Field>
          {['I', 'II', 'III'].map((id, i) => (
            <Field key={id} label={`Multiplicador opción ${id}`}>
              <Num value={p.factoresOpciones[i] ?? 1} onChange={(n) => set({ factoresOpciones: [0, 1, 2].map((j) => (j === i ? n : p.factoresOpciones[j] ?? 1)) })} sufijo="×" />
            </Field>
          ))}
          <Field label="Prima mínima USD / EUR (opción I)" hint="En II y III es proporcional a la suma."><Num value={p.primaMinimaDivisa} onChange={(n) => set({ primaMinimaDivisa: n })} /></Field>
          <Field label="Prima mínima en Bs" hint="Porcentaje de la suma de cada opción."><Num value={p.pctMinimoBs} onChange={(n) => set({ pctMinimoBs: n })} sufijo="%" /></Field>
        </div>
        {p.limiteMin >= p.limiteMax && <div className="mt-3"><Aviso tono="error">El límite mínimo debe ser menor que el máximo.</Aviso></div>}
      </SectionCard>

      <DescuentosCard tramos={p.descuentos ?? []} onChange={(descuentos) => set({ descuentos })}
        ayuda="RCG: se evalúa la suma asegurada de cada opción (I, II y III)." />

      <SectionCard title="Clases de riesgo" description="Rango de tasa (%) e índoles permitidas por clase. Una índole por línea." Icon={Building2}>
        <div className="space-y-3">
          {p.clases.map((c, i) => (
            <div key={i} className={cn('rounded-xl border p-3 grid gap-3 sm:grid-cols-[1fr_7rem_7rem_auto]', rangoInvalido(c.min, c.max) ? 'border-rose-300 bg-rose-50/40' : 'border-slate-200')}>
              <Field label="Nombre de la clase">
                <Input value={c.nombre} onChange={(e) => setClase(i, { nombre: e.target.value, etiqueta: e.target.value })} />
              </Field>
              <Field label="Tasa mín."><Num value={c.min} onChange={(n) => setClase(i, { min: n })} sufijo="%" /></Field>
              <Field label="Tasa máx."><Num value={c.max} onChange={(n) => setClase(i, { max: n })} sufijo="%" /></Field>
              <div className="flex items-end gap-2 pb-1">
                <label className="flex items-center gap-1.5 text-[0.75rem] font-bold text-slate-600 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={!!c.industria} onChange={(e) => setClase(i, { industria: e.target.checked })} />
                  Industria
                </label>
                <BotonIcono titulo="Eliminar clase" onClick={() => p.clases.length > 1 && set({ clases: p.clases.filter((_, j) => j !== i) })}><Trash2 size={15} /></BotonIcono>
              </div>
              <div className="sm:col-span-4">
                <Field label={`Índoles (${c.indoles.length})`}><Lineas rows={3} value={c.indoles} onChange={(v) => setClase(i, { indoles: v })} /></Field>
              </div>
            </div>
          ))}
          <Button variant="secondary" size="sm" onClick={() => set({ clases: [...p.clases, { nombre: 'Nueva clase', etiqueta: 'Nueva clase', min: 0.1, max: 1, indoles: [] }] })}>
            <Plus size={13} /> Agregar clase
          </Button>
        </div>
      </SectionCard>

      <SectionCard title="Sublímites" description="Coberturas cuyo límite es un porcentaje del límite de la opción, con tope." Icon={Scale}>
        <div className="grid sm:grid-cols-3 gap-4 mb-4">
          <Field label="Porcentaje del límite"><Num value={p.pctSublimite} onChange={(n) => set({ pctSublimite: n })} sufijo="%" /></Field>
        </div>
        <Tabla cabecera={['Cobertura', 'Tope', '']}>
          {sublimites.map(([nombre, tope]) => (
            <tr key={nombre}>
              <td className="text-slate-700">{nombre}</td>
              <td className="w-40"><Num value={tope} onChange={(n) => set({ sublimites: { ...p.sublimites, [nombre]: n } })} /></td>
              <td className="w-10"><BotonIcono titulo="Quitar sublímite" onClick={() => { const s = { ...p.sublimites }; delete s[nombre]; set({ sublimites: s }); }}><Trash2 size={15} /></BotonIcono></td>
            </tr>
          ))}
        </Tabla>
        {todasCoberturas.some((c) => !(c in p.sublimites)) && (
          <select className="mt-3 w-full sm:w-auto px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white" value=""
            onChange={(e) => e.target.value && set({ sublimites: { ...p.sublimites, [e.target.value]: 10000 } })}>
            <option value="">+ Agregar sublímite a una cobertura…</option>
            {todasCoberturas.filter((c) => !(c in p.sublimites)).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </SectionCard>

      <SectionCard title="Coberturas incluidas" description="Una cobertura por línea. El nombre debe coincidir con la Solicitud de Seguro para marcarla en el PDF." Icon={ListChecks}>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label={`Sin contrato (${p.coberturasSinContrato.length})`}><Lineas rows={10} value={p.coberturasSinContrato} onChange={(v) => set({ coberturasSinContrato: v })} /></Field>
          <Field label={`Con contrato (${p.coberturasConContrato.length})`}><Lineas rows={10} value={p.coberturasConContrato} onChange={(v) => set({ coberturasConContrato: v })} /></Field>
        </div>
      </SectionCard>

      <SectionCard title="Condiciones especiales" Icon={Stamp}>
        <div className="space-y-4">
          <Field label="Opcionales (solo con contrato) — una por línea"><Lineas rows={5} value={p.condicionesOpcionales} onChange={(v) => set({ condicionesOpcionales: v })} /></Field>
          <Field label="Condición que aplica siempre"><Textarea rows={2} value={p.condicionFija} onChange={(e) => set({ condicionFija: e.target.value })} /></Field>
        </div>
      </SectionCard>

      <SectionCard title="Deducible" description="Daños materiales." Icon={FileText}>
        <div className="grid sm:grid-cols-5 gap-4">
          <Field label="% de la pérdida"><Num value={p.deducible.pct} onChange={(n) => set({ deducible: { ...p.deducible, pct: n } })} sufijo="%" /></Field>
          <Field label="Mínimo % de la suma"><Num value={p.deducible.pctMinSuma} onChange={(n) => set({ deducible: { ...p.deducible, pctMinSuma: n } })} sufijo="%" /></Field>
          <Field label="Mínimo USD"><Num value={p.deducible.minUSD} onChange={(n) => set({ deducible: { ...p.deducible, minUSD: n } })} /></Field>
          <Field label="Mínimo EUR"><Num value={p.deducible.minEUR} onChange={(n) => set({ deducible: { ...p.deducible, minEUR: n } })} /></Field>
          <Field label="Mínimo Bs"><Num value={p.deducible.minBs} onChange={(n) => set({ deducible: { ...p.deducible, minBs: n } })} /></Field>
        </div>
        <p className="text-[0.75rem] text-slate-500 mt-3"><strong>Vista previa:</strong> {deducibleRcg('USD', p)}</p>
      </SectionCard>

      <SectionCard title="Actividades especiales" description="Una por línea." Icon={ShieldAlert}>
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Exigen clase de Industrias"><Lineas rows={8} value={p.industrias} onChange={(v) => set({ industrias: v })} /></Field>
          <Field label="Restringidas (mesa técnica)" hint="Se cotizan con aviso; la cotización queda sujeta a su aprobación."><Lineas rows={8} value={p.restringidas} onChange={(v) => set({ restringidas: v })} /></Field>
          <Field label="Palabras clave restringidas" hint="Fragmentos sin acentos que se buscan en el texto libre."><Lineas rows={8} value={p.palabrasRestringidas} onChange={(v) => set({ palabrasRestringidas: v })} /></Field>
        </div>
      </SectionCard>
    </div>
  );
}

// ======================= RC PATRONAL / EMPRESARIAL =======================

function TablaRangos({ filas, onChange, nombreEditable = true }: { filas: Rango[]; onChange: (f: Rango[]) => void; nombreEditable?: boolean }) {
  const set = (i: number, r: Rango) => onChange(filas.map((x, j) => (j === i ? r : x)));
  return (
    <Tabla cabecera={['#', 'Nombre', 'Tasa mín. %', 'Tasa máx. %']}>
      {filas.map((r, i) => (
        <tr key={i} className={rangoInvalido(r[1], r[2]) ? 'bg-rose-50/60' : undefined}>
          <td className="text-slate-400 w-8">{i + 1}</td>
          <td>{nombreEditable ? <Input value={r[0]} onChange={(e) => set(i, [e.target.value, r[1], r[2]])} /> : r[0]}</td>
          <td className="w-32"><Num value={r[1]} onChange={(n) => set(i, [r[0], n, r[2]])} /></td>
          <td className="w-32"><Num value={r[2]} onChange={(n) => set(i, [r[0], r[1], n])} /></td>
        </tr>
      ))}
    </Tabla>
  );
}

const POR_PAGINA = 20;

function ParametrosRcView() {
  const p = useParametrosStore((s) => s.rc);
  const set = useParametrosStore((s) => s.setRc);
  const [filtro, setFiltro] = useState('');
  const [pagina, setPagina] = useState(0);

  const actividades = useMemo(() => p.actividades.map((r, i) => ({ r, i }))
    .filter(({ r }) => !filtro || r[0].toLowerCase().includes(filtro.toLowerCase())), [p.actividades, filtro]);
  const paginas = Math.max(1, Math.ceil(actividades.length / POR_PAGINA));
  const visibles = actividades.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);
  const clasesDe = (i: number) => p.equivalencias.find((m) => m.activity === i)?.classes ?? [];
  const setClasesDe = (i: number, txt: string) => {
    const classes = txt.split(/[,\s]+/).map((x) => Number(x) - 1).filter((n) => Number.isInteger(n) && n >= 0 && n < p.clases.length);
    const resto = p.equivalencias.filter((m) => m.activity !== i);
    set({ equivalencias: classes.length ? [...resto, { activity: i, classes }] : resto });
  };
  const setActividad = (i: number, r: Rango) => set({ actividades: p.actividades.map((x, j) => (j === i ? r : x)) });

  return (
    <div className="space-y-5">
      <SectionCard title="Generales" description="Valores comunes a RCP y RCE en USD / EUR." Icon={Calculator}>
        <div className="grid sm:grid-cols-4 gap-4">
          <Field label="Prima mínima"><Num value={p.primaMinima} onChange={(n) => set({ primaMinima: n })} /></Field>
          <Field label="Salario anual mínimo por empleado"><Num value={p.salarioMinimo} onChange={(n) => set({ salarioMinimo: n })} /></Field>
          <Field label="Ajuste máximo (±)"><Num value={p.ajusteMaximo} onChange={(n) => set({ ajusteMaximo: n })} sufijo="%" /></Field>
          <Field label="Colectivo = individual ×"><Num value={p.multiplicadorColectivo} onChange={(n) => set({ multiplicadorColectivo: n })} sufijo="×" /></Field>
          {['I', 'II', 'III'].map((id, i) => (
            <Field key={id} label={`Diferenciación opción ${id}`} hint={i === 0 ? 'Solo si las 3 primas salen iguales.' : undefined}>
              <Num value={p.diferenciacion[i] ?? 1} onChange={(n) => set({ diferenciacion: [0, 1, 2].map((j) => (j === i ? n : p.diferenciacion[j] ?? 1)) })} sufijo="×" />
            </Field>
          ))}
          {['I', 'II', 'III'].map((id, i) => (
            <Field key={`suma-${id}`} label={`Suma deseada × opción ${id}`}
              hint={i === 0 ? 'La suma deseada máxima es el tope individual de la opción I.' : undefined}>
              <Num value={p.factoresSumaDeseada[i] ?? i + 1}
                onChange={(n) => set({ factoresSumaDeseada: [0, 1, 2].map((j) => (j === i ? n : p.factoresSumaDeseada[j] ?? j + 1)) })} sufijo="×" />
            </Field>
          ))}
        </div>
      </SectionCard>

      <DescuentosCard tramos={p.descuentos ?? []} onChange={(descuentos) => set({ descuentos })}
        ayuda="RCP / RCE en USD o EUR: se evalúa el límite por evento / año póliza de cada opción. En Bs. no aplica (la prima es un % del límite)." />

      <SectionCard title="Opciones RC Patronal" description="Montos por empleado de las coberturas adicionales y límites por opción." Icon={Users}>
        <Tabla cabecera={['Opción', 'Médica / empleado', 'Hernia / empleado', 'Límite individual (% nómina)', 'Tope individual (I = suma deseada máx.)', 'Tope colectivo']}>
          {p.opcionesRcp.map((o, i) => {
            const upd = (c: Partial<typeof o>) => set({ opcionesRcp: p.opcionesRcp.map((x, j) => (j === i ? { ...x, ...c } : x)) });
            return (
              <tr key={o.id}>
                <td className="font-bold text-slate-700 w-14">{o.id}</td>
                <td><Num value={o.medica} onChange={(n) => upd({ medica: n })} /></td>
                <td><Num value={o.hernia} onChange={(n) => upd({ hernia: n })} /></td>
                <td><Num value={Number((o.factor * 100).toFixed(4))} onChange={(n) => upd({ factor: n / 100 })} sufijo="%" /></td>
                <td><Num value={o.topeIndividual} onChange={(n) => upd({ topeIndividual: n })} /></td>
                <td><Num value={o.topeColectivo} onChange={(n) => upd({ topeColectivo: n })} /></td>
              </tr>
            );
          })}
        </Tabla>
      </SectionCard>

      <SectionCard title="Opciones RC Empresarial" description="Montos por empleado de las coberturas adicionales." Icon={Layers}>
        <Tabla cabecera={['Opción', 'Negligencia del empleador', 'Defensa penal', 'Gastos médicos']}>
          {p.opcionesRce.map((o, i) => {
            const upd = (c: Partial<typeof o>) => set({ opcionesRce: p.opcionesRce.map((x, j) => (j === i ? { ...x, ...c } : x)) });
            return (
              <tr key={i}>
                <td className="font-bold text-slate-700 w-14">{['I', 'II', 'III'][i]}</td>
                <td><Num value={o.negligencia} onChange={(n) => upd({ negligencia: n })} /></td>
                <td><Num value={o.defensa} onChange={(n) => upd({ defensa: n })} /></td>
                <td><Num value={o.medica} onChange={(n) => upd({ medica: n })} /></td>
              </tr>
            );
          })}
        </Tabla>
      </SectionCard>

      <SectionCard title="Cotización en bolívares" description="Reglas usadas cuando la moneda es Bs (tasa BCV)." Icon={Banknote}>
        <div className="grid sm:grid-cols-3 gap-4">
          {([
            ['pctPrimaRcp', 'Prima RCP (% del límite por evento)', '%'],
            ['pctRce', 'Prima RCE (% de la patronal)', '%'],
            ['salariosLimite', 'Límite individual (salarios anuales)', '×'],
            ['maxTrabajadoresColectivo', 'Trabajadores para el colectivo (máx.)', ''],
            ['limiteIndividual', 'Límite individual autorizado', ''],
            ['limiteColectivo', 'Límite colectivo autorizado', ''],
            ['limiteOpcional', 'Límite opcional autorizado', ''],
            ['pctOpcionalRestringido', 'Negligencia / defensa (% del individual)', '%'],
            ['multOpcionalColectivo', 'Negligencia / defensa colectivo ×', '×'],
          ] as const).map(([k, label, suf]) => (
            <Field key={k} label={label}><Num value={p.bs[k]} onChange={(n) => set({ bs: { ...p.bs, [k]: n } })} sufijo={suf || undefined} /></Field>
          ))}
        </div>
      </SectionCard>

      <SectionCard title={`Clases comunes (${p.clases.length})`} description="Rango de tasa patronal por clase." Icon={Building2}>
        <TablaRangos filas={p.clases} onChange={(f) => set({ clases: f })} />
      </SectionCard>

      <SectionCard title={`Actividades del riesgo (${p.actividades.length})`} description="Rango de tasa empresarial y clases comunes donde aparece cada actividad (números separados por coma)." Icon={ListChecks}>
        <div className="relative mb-3 sm:max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" type="search" value={filtro} placeholder="Buscar actividad…" onChange={(e) => { setFiltro(e.target.value); setPagina(0); }} />
        </div>
        <Tabla cabecera={['#', 'Actividad', 'Tasa mín. %', 'Tasa máx. %', 'Clases']}>
          {visibles.map(({ r, i }) => (
            <tr key={i} className={rangoInvalido(r[1], r[2]) ? 'bg-rose-50/60' : undefined}>
              <td className="text-slate-400 w-10">{i + 1}</td>
              <td className="text-slate-700 min-w-[16rem]">{r[0]}</td>
              <td className="w-28"><Num value={r[1]} onChange={(n) => setActividad(i, [r[0], n, r[2]])} /></td>
              <td className="w-28"><Num value={r[2]} onChange={(n) => setActividad(i, [r[0], r[1], n])} /></td>
              <td className="w-28"><ClasesInput valor={clasesDe(i).map((c) => c + 1).join(', ')} onChange={(t) => setClasesDe(i, t)} /></td>
            </tr>
          ))}
        </Tabla>
        <div className="flex items-center justify-between mt-3 text-[0.78rem] text-slate-500">
          <span>{actividades.length} actividades · página {pagina + 1} de {paginas}</span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}>Anterior</Button>
            <Button variant="secondary" size="sm" disabled={pagina >= paginas - 1} onClick={() => setPagina(pagina + 1)}>Siguiente</Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Coberturas opcionales por tasa (Bs)" description="Rangos de tasa de las coberturas opcionales cuando se cotiza en bolívares." Icon={ShieldAlert}>
        <div className="space-y-4">
          <div><p className="text-[0.78rem] font-bold text-slate-600 mb-2">Patronal</p><TablaRangos filas={p.opcionalesP} onChange={(f) => set({ opcionalesP: f })} nombreEditable={false} /></div>
          <div><p className="text-[0.78rem] font-bold text-slate-600 mb-2">Empresarial</p><TablaRangos filas={p.opcionalesE} onChange={(f) => set({ opcionalesE: f })} nombreEditable={false} /></div>
        </div>
      </SectionCard>
    </div>
  );
}

/** Texto libre "1, 5" que solo se aplica al salir del campo. */
function ClasesInput({ valor, onChange }: { valor: string; onChange: (t: string) => void }) {
  const [txt, setTxt] = useState(valor);
  useEffect(() => setTxt(valor), [valor]);
  return <Input value={txt} onChange={(e) => setTxt(e.target.value)} onBlur={() => txt !== valor && onChange(txt)} />;
}
