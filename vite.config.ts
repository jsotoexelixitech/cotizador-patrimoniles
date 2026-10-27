import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// VITE_APP_BASE permite servirlo bajo un subpath (p. ej. /cotizador-rc/) igual que los módulos RCV.
export default defineConfig(({ mode }) => {
  // Opción de prueba "Planes RCG Sis2000": /nest va a nest-api con la key del lado del servidor de Vite.
  // NEST_API_URL y NEST_API_KEY van en .env.local sin prefijo VITE_, así no entran al bundle.
  const env = loadEnv(mode, process.cwd(), '');
  const target = (env.NEST_API_URL || '').replace(/\/$/, '');
  const esQa = /nexusqa|cierrelmds|localhost|127\.0\.0\.1/.test(target);
  const proxy: Record<string, ProxyOptions> | undefined = target
    ? {
        '/nest': {
          target,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/nest/, ''),
          headers: env.NEST_API_KEY ? { apikey: env.NEST_API_KEY } : {},
          // Emitir solo contra QA/dev: con cualquier otro destino la ruta de emisión responde 404.
          bypass: (req) => (!esQa && req.url?.includes('/patrimonial/emit') ? false : undefined),
        },
      }
    : undefined;

  return {
    base: process.env.VITE_APP_BASE || '/',
    plugins: [react(), tailwindcss()],
    server: { host: true, port: 5180, proxy },
    preview: { proxy },
  };
});
