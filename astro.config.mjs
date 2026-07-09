import { defineConfig } from 'astro/config';
import cloudflare from "@astrojs/cloudflare";
export default defineConfig({
  site: 'https://presu.io',
  output: 'static',

  // genera /pagina.html (URLs limpias como hoy)
  build: { format: 'file' },

  adapter: cloudflare()
});