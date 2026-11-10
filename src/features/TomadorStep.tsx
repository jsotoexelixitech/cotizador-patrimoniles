import { useState } from 'react';
import { BadgeCheck, FileSignature, User } from 'lucide-react';
import { SectionCard } from '../components/ui/SectionCard';
import { Field, Input, Select, Textarea } from '../components/ui/FormField';
import { IdentityInput } from '../components/ui/IdentityInput';
import { ToggleSwitch } from '../components/ui/ToggleSwitch';
import { StepActions } from '../components/ui/StepActions';
import { CORREO_RE, SUCURSALES } from '../tarifas/comun';
import { VIGENCIAS_CONTRATO } from '../tarifas/rcp-rce';
import { useCotizacionStore, type CotizacionState } from '../store/cotizacionStore';
import { toast } from '../store/toastStore';

type Errores = Partial<Record<string, string>>;

/** Mismas reglas que los motores (rcg.ts / rcp-rce.ts) para los datos de este paso. */
function validar(s: CotizacionState): Errores {
  const { comun: c, contrato: k, producto } = s;
  // Los planes Sis2000 y el combo siguen las reglas del RCG; el combo pide el RIF y la unidad recién al emitir (EmisionStep).
  const rcg = producto !== 'rc';
  const e: Errores = {};
  if (!c.asegurado.trim()) e.asegurado = 'Indica el tomador / asegurado.';
  if (!rcg && !c.documento.trim()) e.documento = 'Indica el RIF o documento del tomador.';
  if (rcg && !CORREO_RE.test(c.correo.trim())) e.correo = 'El correo del tomador es obligatorio y debe ser válido.';
  if (!rcg && c.correo && !CORREO_RE.test(c.correo.trim())) e.correo = 'Introduce un correo electrónico válido.';
  if (!rcg && !c.ubicacion.trim()) e.ubicacion = 'Indica la ubicación del riesgo.';
  if (!SUCURSALES.includes(c.sucursal)) e.sucursal = 'Selecciona la sucursal.';
  if (!c.emisor.trim()) e.emisor = 'Indica quién elabora la cotización.';
  if (!rcg && !CORREO_RE.test(c.correoEmisor.trim())) e.correoEmisor = 'Introduce el correo de quien cotiza.';
  if (rcg && c.correoEmisor && !CORREO_RE.test(c.correoEmisor.trim())) e.correoEmisor = 'Correo con formato inválido.';
  // Emitir en Sis2000 exige identificación (RIF/cédula hasta 9 dígitos), teléfono y dirección.
  if (producto === 'planes') {
    const digitos = c.documento.replace(/\D/g, '');
    if (!digitos || digitos.length > 9) e.documento = 'Indica el RIF o la cédula (hasta 9 dígitos).';
    if (esPersonaNatural(c.tipoDoc) && !c.apellido.trim()) e.apellido = 'Indica el apellido.';
    if (!/^\d{10,15}$/.test(c.telefono.replace(/\D/g, ''))) e.telefono = 'Indica un teléfono válido (ej. 0412 1234567).';
    if (!c.ubicacion.trim()) e.ubicacion = 'Indica la dirección del riesgo.';
  }
  if (k.esContrato) {
    if (!k.numero.trim()) e.numero = 'Indica el número de contrato.';
    if (!k.objeto.trim()) e.objeto = 'Indica el objeto de la obra.';
    if (rcg && !k.coasegurado.trim()) e.coasegurado = 'Introduce el nombre del coasegurado.';
  }
  return e;
}

export const esPersonaNatural = (tipoDoc: string) => tipoDoc === 'V' || tipoDoc === 'E' || tipoDoc === 'P';

export function TomadorStep() {
  const s = useCotizacionStore();
  const { comun: c, contrato: k, setComun, setContrato } = s;
  const rcg = s.producto !== 'rc';
  const planes = s.producto === 'planes';
  const [intento, setIntento] = useState(false);
  const errores = intento ? validar(s) : {};

  return (
    <div className="space-y-5">
      <SectionCard title="Datos del tomador / asegurado" description="Persona natural o jurídica a cuyo nombre se emite la cotización." Icon={User}>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Nombre o razón social" error={errores.asegurado} full>
            <Input value={c.asegurado} maxLength={180} onChange={(e) => setComun({ asegurado: e.target.value })} placeholder="Ej. Inversiones Caracas, C.A." />
          </Field>
          {planes && esPersonaNatural(c.tipoDoc) && (
            <Field label="Apellido" error={errores.apellido} full>
              <Input value={c.apellido} maxLength={120} onChange={(e) => setComun({ apellido: e.target.value })} />
            </Field>
          )}
          <Field label={rcg && !planes ? 'RIF (opcional)' : 'RIF'} error={errores.documento}
            hint={errores.documento ? undefined : 'Máximo 9 dígitos: 8 + el dígito verificador (ej. J-12345678-9 → 123456789). Obligatorio para emitir.'}>
            <IdentityInput
              tipoDoc={c.tipoDoc}
              identificacion={c.documento}
              onTipoDocChange={(v) => setComun({ tipoDoc: v })}
              // Sis2000 guarda el RIF/cédula en 9 dígitos: no se deja escribir más.
              onIdentificacionChange={(v) => setComun({ documento: v.replace(/\D/g, '').slice(0, 9) })}
              placeholder="Ej. 123456789"
            />
          </Field>
          <Field label={rcg ? 'Correo electrónico del tomador' : 'Correo electrónico (opcional)'} error={errores.correo} hint={rcg ? 'Destinatario de la cotización.' : undefined}>
            <Input type="email" value={c.correo} maxLength={150} onChange={(e) => setComun({ correo: e.target.value })} placeholder="correo@empresa.com" />
          </Field>
          {planes && (
            <Field label="Teléfono" error={errores.telefono}>
              <Input type="tel" value={c.telefono} maxLength={20} onChange={(e) => setComun({ telefono: e.target.value })} placeholder="0412 1234567" />
            </Field>
          )}
          <Field label="Intermediario (opcional)">
            <Input value={c.intermediario} onChange={(e) => setComun({ intermediario: e.target.value })} placeholder="Nombre o código" />
          </Field>
          <Field label={rcg && !planes ? 'Ubicación del riesgo (opcional)' : 'Ubicación del riesgo'} error={errores.ubicacion} full>
            <Textarea rows={2} value={c.ubicacion} onChange={(e) => setComun({ ubicacion: e.target.value })} placeholder="Estado, ciudad, urbanización, calle…" />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="¿Quién elabora la cotización?" description="Sucursal y responsable que aparecen en el documento." Icon={BadgeCheck}>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Sucursal" error={errores.sucursal}>
            <Select value={c.sucursal} onChange={(e) => setComun({ sucursal: e.target.value })}>
              <option value="">Seleccionar</option>
              {SUCURSALES.map((x) => <option key={x} value={x}>{x}</option>)}
            </Select>
          </Field>
          <Field label="Elaborada por" error={errores.emisor}>
            <Input value={c.emisor} maxLength={120} onChange={(e) => setComun({ emisor: e.target.value })} placeholder="Nombre y apellido" />
          </Field>
          <Field label={rcg ? 'Correo de quien cotiza (opcional)' : 'Correo de quien cotiza'} error={errores.correoEmisor} full>
            <Input type="email" value={c.correoEmisor} maxLength={150} onChange={(e) => setComun({ correoEmisor: e.target.value })} placeholder="usuario@lamundialdeseguros.com" />
          </Field>
        </div>
      </SectionCard>

      <ToggleSwitch
        checked={k.esContrato}
        onChange={(v) => setContrato(v ? { esContrato: true } : { esContrato: false, numero: '', objeto: '', coasegurado: '' })}
        label="¿La cotización está asociada a un contrato?"
        description={rcg ? 'Con contrato cambian las coberturas (7) y se habilitan condiciones especiales.' : 'Indica número, vigencia y objeto de la obra.'}
      />

      {k.esContrato && (
        <SectionCard title="Datos del contrato" Icon={FileSignature} statusLabel="Contrato" statusTone="warning">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="N.º de contrato" error={errores.numero}>
              <Input value={k.numero} onChange={(e) => setContrato({ numero: e.target.value })} />
            </Field>
            {rcg ? (
              <Field label="Nombre del coasegurado" error={errores.coasegurado}>
                <Input value={k.coasegurado} maxLength={180} onChange={(e) => setContrato({ coasegurado: e.target.value })} />
              </Field>
            ) : (
              <Field label="Vigencia">
                <Select value={k.vigencia} onChange={(e) => setContrato({ vigencia: e.target.value })}>
                  {VIGENCIAS_CONTRATO.map((v) => <option key={v} value={v}>{v}</option>)}
                </Select>
              </Field>
            )}
            <Field label="Objeto de la obra" error={errores.objeto} full>
              <Textarea rows={2} value={k.objeto} onChange={(e) => setContrato({ objeto: e.target.value })} />
            </Field>
          </div>
        </SectionCard>
      )}

      <StepActions onContinue={() => {
        setIntento(true);
        const e = validar(useCotizacionStore.getState());
        if (Object.keys(e).length) { toast.error('Revisa los datos', Object.values(e)[0]); return false; }
        return true;
      }} />
    </div>
  );
}
