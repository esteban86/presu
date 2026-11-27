/** /movil usa StaticPage, que no trae global.css: sin los tokens sale en Times y sin colores. Corre `npm run build` antes. */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RUTA = join(process.cwd(), 'dist', 'movil.html');

describe('/movil con estilos', () => {
  it('trae los tokens del sistema de diseño', () => {
    expect(existsSync(RUTA), 'falta dist/movil.html: corre npm run build').toBe(true);
    expect(readFileSync(RUTA, 'utf8')).toContain('--space-6:');
  });
  it('el cuerpo usa la letra de la marca', () => {
    const html = readFileSync(RUTA, 'utf8');
    const reglas = [...html.matchAll(/(?:^|[\s}>])body\s*\{([^}]*)\}/g)].map((m) => m[1]).join(';');
    expect(reglas).toMatch(/font-family:\s*var\(--font-body/);
  });
});
