import { defineConfig } from 'astro/config';
import cloudflare from "@astrojs/cloudflare";
export default defineConfig({
  site: 'https://presu.io',
  output: 'static',

  // genera /pagina.html (URLs limpias como hoy).
  // inlineStylesheets:'always' → mete el CSS en el <head> en vez de un <link>
  // render-blocking, para que el LCP (texto del hero) pinte sin esperar el CSS.
  build: { format: 'file', inlineStylesheets: 'always' },

  adapter: cloudflare()
});