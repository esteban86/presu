import { defineConfig } from 'astro/config';
export default defineConfig({
  site: 'https://presu.io',
  output: 'static',
  build: { format: 'file' }, // genera /pagina.html (URLs limpias como hoy)
});
