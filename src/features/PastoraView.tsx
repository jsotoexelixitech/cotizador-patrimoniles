import { useMemo, useState, type ReactNode } from 'react';
import { Beef, Calculator, CheckCircle2, FileCheck2, Lock, MapPin, ShieldCheck, User, UserCheck, Wallet } from 'lucide-react';
import { SectionCard } from '../components/ui/SectionCard';
import { Field, Input, Select } from '../components/ui/FormField';
import { Button } from '../components/ui/Button';
import { Aviso } from '../components/ui/Aviso';
import {
  armarPayloadPastora, COBERTURAS_PASTORA, esPersonaNatural, FORM_INICIAL, kgIniciales, numero, PESO_MAXIMO, PESO_MINIMO,
  planDePlazo, PLANES_PASTORA, sumaAsegurada, TIPOS_DOCUMENTO, validarPastora,
  type ErroresPastora, type FormPastora, type ResultadoPastora, type TipoDocumento,
} from '../tarifas/pastora';
import { cotizarPastora, emitirPastora, ErrorPastora } from '../api/pastora';

const fmt = (n: number | null | undefined, dec = 2) =>
  n == null ? '—' : n.toLocaleString('es-VE', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const NOMBRE_DOC: Record<TipoDocumento, string> = { J: 'J · Jurídico', V: 'V · Venezolano', E: 'E · Extranjero', G: 'G · Gobierno' };

type Estado =
  | { tipo: 'nada' }
  | { tipo: 'cargando'; que: 'cotizar' | 'emitir' }
  | { tipo: 'cotizado'; r: ResultadoPastora }
  | { tipo: 'emitido'; r: ResultadoPastora }
  | { tipo: 'error'; status: number; mensaje: string };

/** Emisión de Pastora (ramo 25, biomasa de ganado de engorde) contra nest-api QA. Vista aparte del cotizador RC. */
export function PastoraView() {
  const [f, setF] = useState<FormPastora>(FORM_INICIAL);
  const [errores, setErrores] = useState<ErroresPastora>({});
  const [confirmando, setConfirmando] = useState(false);
  const [estado, setEstado] = useState<Estado>({ tipo: 'nada' });

  const b0 = useMemo(() => kgIniciales(f), [f]);
  const sa0 = useMemo(() => sumaAsegurada(f), [f]);
  const persona = esPersonaNatural(f.tipo_cedula);
  const ocupado = estado.tipo === 'cargando';
  const emitido = estado.tipo === 'emitido';

  const set = <K extends keyof FormPastora>(k: K, v: FormPastora[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    setErrores((e) => ({ ...e, [k]: undefined }));
    setConfirmando(false);
    if (estado.tipo !== 'emitido') setEstado({ tipo: 'nada' });
  };
  const elegirPlazo = (meses: number) => {
    setF((x) => ({ ...x, horizonte_meses: meses, cplan: planDePlazo(meses) ?? x.cplan }));
    setErrores((e) => ({ ...e, cplan: undefined }));
    setConfirmando(false);
  };

  const validar = () => {
    const e = validarPastora(f);
    setErrores(e);
    if (Object.keys(e).length) {
      setEstado({ tipo: 'error', status: 0, mensaje: `Revise ${Object.keys(e).length} dato(s) marcados en rojo antes de continuar.` });
      return false;
    }
    return true;
  };

  const ejecutar = async (que: 'cotizar' | 'emitir') => {
    setEstado({ tipo: 'cargando', que });
    try {
      const payload = armarPayloadPastora(f);
      const r = que === 'cotizar' ? await cotizarPastora(payload) : await emitirPastora(payload);
      setEstado(que === 'cotizar' ? { tipo: 'cotizado', r } : { tipo: 'emitido', r });
    } catch (e) {
      const err = e instanceof ErrorPastora ? e : new ErrorPastora(0, e instanceof Error ? e.message : String(e));
      setEstado({ tipo: 'error', status: err.status, mensaje: err.message });
    } finally {
      setConfirmando(false);
    }
  };

  const nueva = () => {
    setF(FORM_INICIAL);
    setErrores({});
    setEstado({ tipo: 'nada' });
    window.scrollTo({ top: 0 });
  };

  const txt = (k: keyof FormPastora, label: string, props: { placeholder?: string; hint?: string; full?: boolean; type?: string; maxLength?: number; inputMode?: 'numeric' | 'decimal' | 'email' | 'tel' } = {}) => (
    <Field label={label} error={errores[k]} hint={props.hint} full={props.full}>
      <Input
        type={props.type ?? 'text'}
        value={String(f[k])}
        placeholder={props.placeholder}
        maxLength={props.maxLength}
        inputMode={props.inputMode}
        disabled={emitido}
        onChange={(e) => set(k, e.target.value as never)}
      />
    </Field>
  );

  return (
    <div className="space-y-5">
      <SectionCard Icon={FileCheck2} title="Plan" description="Plazo contractual de engorde y coberturas de la póliza (ramo 25 · Riesgos Especiales).">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Plazo de engorde" error={errores.cplan} hint="Plazo de 3 meses pendiente de catálogo.">
            <Select value={f.horizonte_meses} disabled={emitido} onChange={(e) => elegirPlazo(Number(e.target.value))}>
              {PLANES_PASTORA.map((p) => <option key={p.cplan} value={p.meses}>{p.meses} meses</option>)}
            </Select>
          </Field>
          <Field label="Plan Sis2000">
            <Select value={f.cplan} disabled={emitido} onChange={(e) => elegirPlazo(PLANES_PASTORA.find((p) => p.cplan === e.target.value)?.meses ?? 6)}>
              {PLANES_PASTORA.map((p) => <option key={p.cplan} value={p.cplan}>{p.cplan}</option>)}
            </Select>
          </Field>
        </div>
        <ul className="mt-4 grid sm:grid-cols-2 gap-2">
          {COBERTURAS_PASTORA.map((c) => {
            const marcada = c.obligatoria || f.transporte;
            return (
              <li key={c.ccober}>
                <label className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm ${marcada ? 'border-indigo-200 bg-indigo-50/50' : 'border-slate-200'} ${c.obligatoria || emitido ? 'cursor-default' : 'cursor-pointer'}`}>
                  <input
                    type="checkbox"
                    checked={marcada}
                    disabled={c.obligatoria || emitido}
                    onChange={(e) => set('transporte', e.target.checked)}
                    className="accent-indigo-600"
                  />
                  <span className="font-semibold text-slate-800">{c.ccober} · {c.nombre}</span>
                  <span className="ml-auto text-[0.7rem] text-slate-500 inline-flex items-center gap-1">
                    {c.obligatoria ? <><Lock size={11} /> Obligatoria</> : 'Opcional'}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </SectionCard>

      <SectionCard Icon={Beef} title="Lote" description="Datos de la certificación inicial del lote ganadero.">
        <div className="grid sm:grid-cols-2 gap-4">
          {txt('cantidad_animales', 'Cantidad de animales', { inputMode: 'numeric', placeholder: '100' })}
          {txt('peso_promedio', 'Peso promedio inicial (kg)', { inputMode: 'decimal', placeholder: '200', hint: `Entre ${PESO_MINIMO} y ${PESO_MAXIMO} kg por animal.` })}
          {txt('fecha_inicio', 'Fecha de certificación inicial', { type: 'date' })}
          {txt('lote', 'Código de lote', { maxLength: 30, placeholder: 'LT-2026-0101', hint: 'Obligatorio. Un lote solo puede tener una póliza vigente.' })}
          {txt('ihl', 'Índice de Homogeneidad del Lote (IHL)', { maxLength: 20, placeholder: '0,92', hint: 'Tal como lo entrega la certificadora.' })}
        </div>
      </SectionCard>

      <SectionCard Icon={Calculator} title="Valor" description="Suma asegurada inicial (SA0) = kg iniciales (B0) × precio por kg contratado (PKC).">
        <div className="grid sm:grid-cols-2 gap-4">
          {txt('precio_kg', 'Precio por kg contratado (moneda del plan)', { inputMode: 'decimal', placeholder: '2,50' })}
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-sm space-y-1">
            <p className="flex justify-between gap-3"><span className="text-slate-500">Kg iniciales (B0)</span><strong>{fmt(b0, 2)} kg</strong></p>
            <p className="flex justify-between gap-3 text-[0.75rem] text-slate-500">
              <span>{f.cantidad_animales || '—'} animales × {f.peso_promedio || '—'} kg</span>
              <span>× {numero(f.precio_kg) > 0 ? fmt(numero(f.precio_kg)) : '—'} por kg</span>
            </p>
            <p className="flex justify-between gap-3 pt-1 border-t border-slate-200"><span className="text-slate-500">Suma asegurada (SA0)</span><strong className="text-indigo-700">{fmt(sa0)}</strong></p>
            <p className="text-[0.7rem] text-slate-400">La prima la calcula nest-api (tasa provisional) al cotizar o emitir.</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard Icon={User} title="Tomador" description="Quien contrata la póliza; también queda como asegurado.">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Tipo de documento" error={errores.tipo_cedula}>
            <Select value={f.tipo_cedula} disabled={emitido} onChange={(e) => set('tipo_cedula', e.target.value as TipoDocumento)}>
              {TIPOS_DOCUMENTO.map((t) => <option key={t} value={t}>{NOMBRE_DOC[t]}</option>)}
            </Select>
          </Field>
          {txt('rif', persona ? 'Cédula' : 'RIF', { inputMode: 'numeric', maxLength: 9, placeholder: '123456789', hint: 'Solo números, hasta 9 dígitos.' })}
          {txt('nombre', persona ? 'Nombre' : 'Razón social', { placeholder: persona ? 'Juan' : 'Agropecuaria Ejemplo C.A.' })}
          {persona && txt('apellido', 'Apellido', { placeholder: 'Pérez' })}
          {txt('direccion', 'Dirección del tomador', { full: true })}
          {txt('telefono', 'Teléfono', { inputMode: 'tel', placeholder: '04121234567' })}
          {txt('correo', 'Correo', { type: 'email', placeholder: 'correo@empresa.com' })}
        </div>
      </SectionCard>

      <SectionCard Icon={MapPin} title="Riesgo" description="Qué se asegura y dónde está el lote.">
        <div className="grid sm:grid-cols-2 gap-4">
          {txt('bien', 'Descripción del bien', { full: true, maxLength: 250, placeholder: 'Lote ganadero de engorde - 100 animales' })}
          {txt('direccion_riesgo', 'Dirección del riesgo', { full: true, placeholder: 'Finca, sector, municipio, estado', hint: 'Obligatoria.' })}
        </div>
      </SectionCard>

      <SectionCard Icon={UserCheck} title="Productor" description="Intermediario de la póliza.">
        <div className="grid sm:grid-cols-2 gap-4">{txt('productor', 'Código de productor', { inputMode: 'numeric' })}</div>
      </SectionCard>

      {estado.tipo === 'error' && (
        <Aviso tono="error">{estado.status ? `Error ${estado.status}: ` : ''}{estado.mensaje}</Aviso>
      )}

      {estado.tipo === 'cotizado' && (
        <Resultado titulo="Cotización de nest-api (no emite)" r={estado.r} icono={<Wallet size={16} className="text-indigo-600" />} />
      )}

      {estado.tipo === 'emitido' && (
        <Resultado titulo="Póliza emitida" r={estado.r} icono={<CheckCircle2 size={16} className="text-emerald-600" />} />
      )}

      {confirmando && !emitido && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3">
          <p className="text-sm text-amber-800 font-semibold">
            ¿Emitir la póliza del plan {f.cplan} ({f.horizonte_meses} meses) para el lote {f.lote.trim().toUpperCase()}, suma asegurada {fmt(sa0)}?
            Se crea en Sis2000 con recibo pendiente de cobro.
          </p>
          <div className="flex gap-2 flex-wrap">
            <Button variant="success" onClick={() => ejecutar('emitir')} disabled={ocupado}>
              <ShieldCheck size={15} /> Sí, emitir
            </Button>
            <Button variant="secondary" onClick={() => setConfirmando(false)} disabled={ocupado}>Cancelar</Button>
          </div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap justify-end">
        {emitido ? (
          <Button onClick={nueva}>Nueva emisión</Button>
        ) : (
          <>
            <Button variant="secondary" disabled={ocupado} onClick={() => validar() && ejecutar('cotizar')}>
              <Wallet size={15} /> {ocupado && estado.que === 'cotizar' ? 'Cotizando…' : 'Ver prima'}
            </Button>
            <Button disabled={ocupado || confirmando} onClick={() => validar() && setConfirmando(true)}>
              <ShieldCheck size={15} /> {ocupado && estado.que === 'emitir' ? 'Emitiendo…' : 'Emitir póliza'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function Resultado({ titulo, r, icono }: { titulo: string; r: ResultadoPastora; icono: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
      <p className="font-display font-bold text-slate-900 flex items-center gap-2">{icono}{titulo}</p>
      <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
        {r.cnpoliza && <Dato k="Número de póliza" v={r.cnpoliza} />}
        {r.cnrecibo && <Dato k="Recibo" v={r.cnrecibo} />}
        <Dato k="Prima" v={fmt(r.prima)} />
        <Dato k="Suma asegurada" v={fmt(r.suma)} />
      </dl>
      {r.coberturas.length > 0 && (
        <table className="w-full text-[0.8rem]">
          <thead className="text-slate-500"><tr><th className="text-left font-semibold">Cobertura</th><th className="text-right font-semibold">Suma</th><th className="text-right font-semibold">Prima</th></tr></thead>
          <tbody>
            {r.coberturas.map((c) => (
              <tr key={c.ccober} className="border-t border-slate-100">
                <td>{c.ccober} · {c.nombre}</td><td className="text-right">{fmt(c.suma)}</td><td className="text-right">{fmt(c.prima)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {r.avisoLote && <Aviso>{r.avisoLote}</Aviso>}
      {r.urlpoliza && <a href={r.urlpoliza} target="_blank" rel="noreferrer" className="text-sm font-bold text-indigo-600 hover:underline">Ver PDF de la póliza</a>}
    </div>
  );
}

function Dato({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-3"><dt className="text-slate-500">{k}</dt><dd className="font-bold text-slate-900">{v}</dd></div>;
}
