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
  // /nexus va a Exélixi Nexus (cotizaciones guardadas, pago en línea) con la key del lado del servidor de Vite.
  // NEXUS_API_URL y NEXUS_API_KEY van en .env.local sin prefijo VITE_. La key solo sirve para cotizaciones-rc.
  const nexus = (env.NEXUS_API_URL || '').replace(/\/$/, '');
  const esExterno = (req: { headers: { host?: string } }) => /\.trycloudflare\.com$/i.test(String(req.headers.host ?? '').split(':')[0]);
  const rutaNexus = (url: string) => /^\/nexus\/api\/cotizaciones-rc(\/|\?|$)/.test(url);
  // Cliente: guardar su cotización, traer una por código (sin parámetros: ni lista ni historial) y mandarla a pagar.
  const rutaNexusCliente = (req: { url?: string; method?: string }) => {
    const url = req.url ?? '';
    if (req.method === 'POST') return /^\/nexus\/api\/cotizaciones-rc(\/[A-Za-z0-9-]+\/checkout)?$/.test(url);
    return req.method === 'GET' && /^\/nexus\/api\/cotizaciones-rc\/[A-Za-z0-9-]+$/.test(url);
  };
  const proxyNexus: Record<string, ProxyOptions> = nexus
    ? {
        '/nexus': {
          target: nexus,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/nexus/, ''),
          headers: env.NEXUS_API_KEY ? { 'x-api-key': env.NEXUS_API_KEY } : {},
          bypass: (req) => {
            if (publico || !rutaNexus(req.url ?? '')) return false;
            return (cliente || esExterno(req)) && !rutaNexusCliente(req) ? false : undefined;
          },
          // Nexus registra quién creó la cotización; lo decide el servidor, no el navegador.
          configure: (p) => {
            p.on('proxyReq', (proxyReq, req) => {
              proxyReq.setHeader('x-cotizador-origen', cliente || esExterno(req) ? 'cliente' : 'admin');
            });
          },
        },
      }
    : {};
  const proxyNest: Record<string, ProxyOptions> | undefined = target
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
            // Mismo puerto para admin y cliente: lo que entra por el túnel se trata siempre como cliente.
            const externo = /\.trycloudflare\.com$/i.test(String(req.headers.host ?? '').split(':')[0]);
            if ((cliente || externo) && !rutaCliente(req)) return false;
            return !esQa && /\/patrimonial\/emit|\/riesgos-generales\/emision/.test(url) ? false : undefined;
          },
        },
      }
    : undefined;
  const proxy: Record<string, ProxyOptions> | undefined = proxyNest || nexus ? { ...(proxyNest ?? {}), ...proxyNexus } : undefined;

  return {
    base: process.env.VITE_APP_BASE || '/',
    // Link público: la app abre solo el formulario de Pastora (ModuleShell / wizardStore).
    define: {
      'import.meta.env.VITE_SOLO_PASTORA': JSON.stringify(publico ? '1' : ''),
      'import.meta.env.VITE_MODO_CLIENTE': JSON.stringify(cliente ? '1' : ''),
    },
    plugins: [react(), tailwindcss()],
    server: { host: true, port: 5180, proxy, allowedHosts: ['.trycloudflare.com'] },
    preview: { proxy },
  };
});
