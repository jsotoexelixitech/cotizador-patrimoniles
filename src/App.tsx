import { useState } from 'react';
import CotizadorRcg from './components/CotizadorRcg';
import CotizadorRcpRce from './components/CotizadorRcpRce';

type Pestana = 'rcg' | 'rcp';

const inicial = (): Pestana => (new URLSearchParams(window.location.search).get('producto') === 'rcp' ? 'rcp' : 'rcg');

export default function App() {
  const [pestana, setPestana] = useState<Pestana>(inicial);

  const cambiar = (p: Pestana) => {
    setPestana(p);
    const url = new URL(window.location.href);
    url.searchParams.set('producto', p);
    window.history.replaceState(null, '', url);
  };

  return (
    <div className="app">
      <header className="cabecera">
        <div>
          <strong>La Mundial de Seguros</strong>
          <span>Cotizador de Responsabilidad Civil</span>
        </div>
        <nav className="pestanas no-imprimir">
          <button type="button" className={pestana === 'rcg' ? 'activo' : ''} onClick={() => cambiar('rcg')}>RC General</button>
          <button type="button" className={pestana === 'rcp' ? 'activo' : ''} onClick={() => cambiar('rcp')}>RC Patronal / Empresarial</button>
        </nav>
      </header>
      <main>{pestana === 'rcg' ? <CotizadorRcg /> : <CotizadorRcpRce />}</main>
      <footer className="pie no-imprimir">Esta cotización no constituye emisión de póliza ni activación de cobertura.</footer>
    </div>
  );
}
