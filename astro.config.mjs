import { defineConfig } from 'astro/config';
import cloudflare from "@astrojs/cloudflare";
import { FontaineTransform } from 'fontaine';
export default defineConfig({
  site: 'https://presu.io',
  output: 'static',

  // genera /pagina.html (URLs limpias como hoy).
  // inlineStylesheets:'always' → mete el CSS en el <head> en vez de un <link>
  // render-blocking, para que el LCP (texto del hero) pinte sin esperar el CSS.
  build: { format: 'file', inlineStylesheets: 'always' },

  vite: {
    // fontaine: genera @font-face de fallback con métricas igualadas (size-adjust,
    // ascent/descent-override) para que al cargar las web fonts NO haya reflujo (CLS).
    plugins: [
      FontaineTransform.vite({
        fallbacks: ['Arial', 'Helvetica', 'sans-serif'],
      }),
    ],
  },

  adapter: cloudflare()
});