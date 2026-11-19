import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { useSesionStore } from './store/sesionStore';
import './index.css';

// SSO de Sys2000: valida el nexus_token con el servidor del cotizador (sin token es la landing web).
void useSesionStore.getState().cargar();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
