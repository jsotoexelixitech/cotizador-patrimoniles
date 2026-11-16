import { useState } from 'react';
import { Download, FilePenLine, Loader2 } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { SectionCard } from '../components/ui/SectionCard';
import { NOMBRE_SOLICITUD, type DatosSolicitud } from '../solicitudes/solicitudes';
import { toast } from '../store/toastStore';

/**
 * Solicitud de seguro del ramo llena con los datos de la emisión (formato aprobado por La Mundial): una por póliza.
 * Solo aparece con la póliza emitida, nunca en la cotización. PDF para imprimir y firmar; Word, el formato original.
 */
export function SolicitudesParaFirmar({ solicitudes }: { solicitudes: DatosSolicitud[] }) {
  if (!solicitudes.length) return null;
  const varias = solicitudes.length > 1;
  return (
    <SectionCard title={varias ? 'Solicitudes para firmar' : 'Solicitud para firmar'} Icon={FilePenLine}
      description={`${varias ? 'Formatos aprobados' : 'Formato aprobado'} de La Mundial, llenos con los datos de la emisión. Solo falta la firma y la huella del tomador.`}>
      <ul className="divide-y divide-slate-100">
        {solicitudes.map((d) => <FilaSolicitud key={`${d.cramo}-${d.cnpoliza ?? ''}`} d={d} />)}
      </ul>
    </SectionCard>
  );
}

function FilaSolicitud({ d }: { d: DatosSolicitud }) {
  const [ocupado, setOcupado] = useState<'pdf' | 'docx' | null>(null);
  const bajar = async (formato: 'pdf' | 'docx') => {
    setOcupado(formato);
    try {
      const { descargar, generarSolicitud, TIPO_DOCX } = await import('../solicitudes/generar');
      const g = await generarSolicitud(d);
      if (formato === 'pdf') descargar(g.pdf, g.nombrePdf, 'application/pdf');
      else descargar(g.docx, g.nombreDocx, TIPO_DOCX);
    } catch (e) {
      toast.error('No se pudo generar la solicitud', e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  };
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-2 text-[0.8rem] text-slate-700">
      <span>{NOMBRE_SOLICITUD[d.cramo]}{d.cnpoliza ? ` · póliza ${d.cnpoliza}` : ''}</span>
      <span className="flex flex-wrap gap-2">
        <Button variant="primary" size="sm" disabled={!!ocupado} onClick={() => void bajar('pdf')}>
          {ocupado === 'pdf' ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Descargar solicitud para firmar
        </Button>
        <Button variant="ghost" size="sm" disabled={!!ocupado} onClick={() => void bajar('docx')} title="El mismo formato en Word (.docx)">
          {ocupado === 'docx' ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Word
        </Button>
      </span>
    </li>
  );
}
