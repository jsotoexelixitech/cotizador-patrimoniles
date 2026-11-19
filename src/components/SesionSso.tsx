import { Globe, Loader2, TriangleAlert, UserCheck } from 'lucide-react';
import { nombreActor } from '../sso/actor';
import { useSesionStore } from '../store/sesionStore';
import { Badge } from './ui/Badge';

/**
 * Quién cotiza, según la sesión que validó el servidor: el intermediario que entró desde Sys2000 (SSO de Nexus) o la
 * web de La Mundial (link público, sin token).
 */
export function SesionSso() {
  const { cargando, sesion, error } = useSesionStore();
  if (cargando) return <Badge><Loader2 size={10} className="animate-spin" /> Validando sesión de Sys2000…</Badge>;
  if (error) return <Badge tone="warn" className="normal-case tracking-normal"><TriangleAlert size={10} /> {error}</Badge>;
  if (sesion.modo === 'intermediario' && sesion.actor) {
    return (
      <Badge tone="success" className="normal-case tracking-normal">
        <UserCheck size={10} /> Cotizando como: {nombreActor(sesion.actor)} · Productor {sesion.productor}
      </Badge>
    );
  }
  return <Badge><Globe size={10} /> Cotización web</Badge>;
}
