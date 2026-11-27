/** La portada no promete lo que ya existe ni lo que ya se decidió. Corre `npm run build` antes. */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RUTA = join(process.cwd(), 'dist', 'index.html');
const JSONLD = join(process.cwd(), 'src', 'data', 'home-jsonld.json');
const PROHIBIDAS = ['próximamente', 'está en camino', 'se definen al lanzar', 'ritmo de costumbre'];

function textoVisible(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

describe('portada sin promesas viejas', () => {
  it('el texto visible no las contiene', () => {
    expect(existsSync(RUTA), 'falta dist/index.html: corre npm run build').toBe(true);
    const texto = textoVisible(readFileSync(RUTA, 'utf8'));
    for (const frase of PROHIBIDAS) expect(texto, frase).not.toContain(frase);
  });
  it('el JSON-LD tampoco', () => {
    const json = readFileSync(JSONLD, 'utf8').toLowerCase();
    for (const frase of PROHIBIDAS) expect(json, frase).not.toContain(frase);
  });
});
