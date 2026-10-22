/**
 * La política publicada es `src/legales/privacidad.md`, la copia de `PRIVACY.md` de la app.
 *
 * Hasta el 22-oct-2026 esta página era un segundo texto escrito a mano y se atrasaba: decía
 * que Presu IA «viene activa por defecto» cuando la app ya la traía apagada, y no tenía la
 * sección de datos de Google que pide la verificación de Gmail, que lee ESTA URL. Este test
 * no compara contra el otro repo (no hay artefacto compartido): vigila que la página siga
 * pintando la copia y no vuelva a tener texto propio.
 *
 * Revisa el HTML CONSTRUIDO, como los otros guardias de esta carpeta. Corre `npm run build`
 * antes.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const md = readFileSync(join('src', 'legales', 'privacidad.md'), 'utf8');
const astro = readFileSync(join('src', 'pages', 'privacidad.astro'), 'utf8');
const ruta = join('dist', 'privacidad.html');
const html = existsSync(ruta) ? readFileSync(ruta, 'utf8') : '';

/** Texto plano de un fragmento de HTML, sin entidades de comillas. */
const plano = (h) =>
  h
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#39;|&apos;|’/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

describe('la política publicada es la copia de PRIVACY.md', () => {
  it('el build existe (si esto falla, corre `npm run build` primero)', () => {
    expect(html.length > 0, 'falta dist/privacidad.html').toBe(true);
  });

  it('la página no tiene texto legal propio: solo pinta la copia', () => {
    expect(astro).toContain("from '../legales/privacidad.md'");
    expect(astro, 'volvió a haber secciones escritas a mano en privacidad.astro').not.toMatch(
      /<h2/,
    );
  });

  it('cada sección de la copia sale publicada, con su fecha', () => {
    const secciones = [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
    expect(secciones.length).toBeGreaterThan(5); // la guarda de la guarda
    const publicado = plano(html);
    for (const s of secciones) expect(publicado, `falta la sección «${s}»`).toContain(s);
    const fecha = /Última actualización: ([^._]+)/.exec(md)?.[1];
    expect(fecha).toBeTruthy();
    expect(publicado).toContain(`Última actualización: ${fecha}`);
  });

  it('trae la declaración de uso limitado que pide Google, con su enlace', () => {
    expect(plano(html)).toContain(
      "Presu's use and transfer to any other app of information received from Google APIs will adhere",
    );
    expect(html).toContain('https://developers.google.com/terms/api-services-user-data-policy');
  });
});
