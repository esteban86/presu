// ESLint (flat config). Alcance: JavaScript "a mano" — el Worker de Cloudflare y
// los scripts de cliente/tests. Los .astro NO se linten aquí: `astro check` ya les
// hace type-check, y Prettier (con prettier-plugin-astro) los formatea. Reglas
// deliberadamente conservadoras: atrapa errores reales (no-undef, no-unreachable,
// etc.) sin ahogar en ruido de estilo el código existente.
import js from '@eslint/js';
import globals from 'globals';

// El runtime de Workers ≈ service worker + APIs web estándar (URL, crypto,
// TextEncoder, atob/btoa, FormData, fetch/Response, structuredClone...).
const workerGlobals = { ...globals.serviceworker, ...globals.browser };

const relaxed = {
  'no-empty': ['warn', { allowEmptyCatch: true }], // hay catches vacíos intencionales (best-effort)
  // `catch (e) {}` que ignora el error es un patrón deliberado aquí → no avisar.
  'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
};

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '.astro/**',
      '.wrangler/**',
      'public/**',
      'apps/**',
      '**/*.astro',
    ],
  },
  js.configs.recommended,
  {
    files: ['worker/**/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: workerGlobals },
    rules: relaxed,
  },
  {
    files: ['src/**/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.browser } },
    rules: relaxed,
  },
  {
    // Tests (vitest): importan describe/it/expect explícitamente; usan APIs web.
    files: ['**/*.test.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    rules: relaxed,
  },
  {
    // Config/tooling en Node.
    files: ['*.mjs', '*.config.js', '*.config.mjs', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.node } },
    rules: relaxed,
  },
];
