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
  // COTIZADOR_PUBLICO=1 (link por túnel): la key solo sirve para cotizar/emitir Pastora; todo lo demás 404.
  const publico = (process.env.COTIZADOR_PUBLICO || env.COTIZADOR_PUBLICO) === '1';
  const rutaPastora = (url: string) =>
    /^\/nest\/api\/v1\/riesgos-generales\/(cotizacion|emision)(\?|$)/.test(url);
  // COTIZADOR_CLIENTE=1 (link al cliente): vista cliente; la key solo sirve para leer catálogos y enviar la cotización
  // por correo. Nunca emite.
  // `npm run dev:cliente` (--mode cliente) no depende de variables de la consola (set de CMD / $env de PowerShell).
  const cliente = mode === 'cliente' || (process.env.COTIZADOR_CLIENTE || env.COTIZADOR_CLIENTE) === '1';
  const rutaCliente = (req: { url?: string; method?: string }) => {
    const url = req.url ?? '';
    if (req.method === 'POST') return /^\/nest\/api\/v1\/mail\/send(\?|$)/.test(url);
    return req.method === 'GET'
      && /^\/nest\/api\/v1\/(valrep\/planes\/riesgos-generales|riesgos-generales\/(coberturas|ramos))(\?|$)/.test(url);
  };
  const proxy: Record<string, ProxyOptions> | undefined = target
    ? {
        '/nest': {
          target,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/nest/, ''),
          headers: env.NEST_API_KEY ? { apikey: env.NEST_API_KEY } : {},
          // Emitir solo contra QA/dev: con cualquier otro destino la ruta de emisión responde 404.
          bypass: (req) => {
            const url = req.url ?? '';
            if (publico && !rutaPastora(url)) return false;
            if (cliente && !rutaCliente(req)) return false;
            return !esQa && /\/patrimonial\/emit|\/riesgos-generales\/emision/.test(url) ? false : undefined;
          },
        },
      }
    : undefined;

  return {
    base: process.env.VITE_APP_BASE || '/',
    // Link público: la app abre solo el formulario de Pastora (ModuleShell / wizardStore).
    define: {
      'import.meta.env.VITE_SOLO_PASTORA': JSON.stringify(publico ? '1' : ''),
      'import.meta.env.VITE_MODO_CLIENTE': JSON.stringify(cliente ? '1' : ''),
    },
    plugins: [react(), tailwindcss()],
    server: { host: true, port: 5180, proxy, ...(publico || cliente ? { allowedHosts: ['.trycloudflare.com'] } : {}) },
    preview: { proxy },
  };
});
