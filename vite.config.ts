import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// VITE_APP_BASE permite servirlo bajo un subpath (p. ej. /cotizador-rc/) igual que los módulos RCV.
export default defineConfig({
  base: process.env.VITE_APP_BASE || '/',
  plugins: [react()],
});
