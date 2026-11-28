/**
 * `/movil` (Marketing URL de las tiendas) y `/soporte` (Support URL) no llevan, en un
 * clic, a una página que nombre planes o precios (spec «presu.io que vende», CA15).
 *
 * El 2026-07-31 Apple rechazó un envío de iOS (guía 3.1.1) por lo que decía la portada,
 * que estaba a un clic de la ficha. Este test recorre cada enlace interno de las dos
 * páginas y lee la página DESTINO en `dist/`.
 *
 * ⚠️ Las páginas legales tienen su propia regla, ya decidida en `legales-sin-venta.test.js`:
 * describen el régimen de la cuenta y la licencia, así que nombran «plan» como hecho legal
 * (PRIVACY.md y TERMS.md son promesas publicadas que este trabajo no toca). Para ellas se
 * exige lo que la guía objeta: ninguna cifra de precio y ningún camino a comprar. Todas las
 * demás páginas enlazadas —la portada entre ellas— cumplen la regla completa: sin planes y
 * sin hablar de pagos, precios, tarifas, pioneros ni suscripciones (`PLATA`).
 *
 * La única excepción a «ninguna cifra en pesos» son los paneles de la demo (`data-demo`), como en
 * `portada-vende-sin-precios.test.js`: el momento animado de la portada muestra movimientos y el
 * total del mes de la base de demostración, no precios. Las palabras de plata (`PLATA`, «plan»)
 * se buscan en TODO el texto, también dentro de esos paneles.
 *
 * Se revisa el HTML CONSTRUIDO. Corre `npm run build` antes.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, serialize } from 'parse5';
import { describe, expect, it } from 'vitest';

const DIST = join(process.cwd(), 'dist');
const ORIGENES = ['movil', 'soporte'];
const PRECIO = /\$\s?\d{1,3}(\.\d{3})+/;
/** Hablar de plata que se cobra: pago, precio, tarifa, pionero, suscripción (ruling del controlador, #39). */
const PLATA = /\b(pago|pagar|precio|tarifa|pionero|suscripci)/i;
const LEGALES = new Set([
  'privacidad',
  'terminos',
  'politica-tratamiento-datos',
  'aviso-privacidad',
  'borrar-cuenta',
]);

function textoVisible(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
}

/** El HTML sin los paneles de la demo (`data-demo`): sus cifras salen de la base de demostración. */
function sinPanelesDeLaDemo(html) {
  const doc = parse(html);
  const podar = (n) => {
    if (n.childNodes) n.childNodes = n.childNodes.filter((h) => !h.attrs?.some((a) => a.name === 'data-demo'));
    for (const h of n.childNodes ?? []) podar(h);
    if (n.content) podar(n.content);
  };
  podar(doc);
  return serialize(doc);
}

/** Enlaces internos de navegación: fuera recursos (íconos, manifiestos) y otros dominios. */
function enlacesInternos(html) {
  const hrefs = [...html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)].map((m) => m[1]);
  return [
    ...new Set(
      hrefs
        .map((h) => h.replace(/^https:\/\/presu\.io/, ''))
        .filter((h) => h.startsWith('/') && !h.startsWith('//'))
        .map((h) => h.split('#')[0].split('?')[0]),
    ),
  ];
}

/** `/` → index.html, `/ayuda` → ayuda.html (o ayuda/index.html). */
function archivoDe(ruta) {
  const limpia = ruta.replace(/\/$/, '');
  if (limpia === '') return join(DIST, 'index.html');
  const plano = join(DIST, `${limpia.slice(1)}.html`);
  if (existsSync(plano)) return plano;
  return join(DIST, limpia.slice(1), 'index.html');
}

describe('/movil y /soporte no llevan a precios ni planes (CA15)', () => {
  for (const origen of ORIGENES) {
    const ruta = join(DIST, `${origen}.html`);

    it(`${origen}.html existe (si falla, corre npm run build)`, () => {
      expect(existsSync(ruta)).toBe(true);
    });

    it(`${origen}.html enlaza a alguna página (si no, este test no mide nada)`, () => {
      if (!existsSync(ruta)) return;
      expect(enlacesInternos(readFileSync(ruta, 'utf8')).length).toBeGreaterThan(0);
    });

    const enlaces = existsSync(ruta) ? enlacesInternos(readFileSync(ruta, 'utf8')) : [];
    for (const destino of enlaces) {
      it(`${origen} → ${destino}: sin precios${LEGALES.has(destino.slice(1)) ? '' : ' ni planes'}`, () => {
        const archivo = archivoDe(destino);
        expect(existsSync(archivo), `${destino} no existe en dist/`).toBe(true);
        const html = readFileSync(archivo, 'utf8');
        const texto = textoVisible(html);
        const sinDemo = textoVisible(sinPanelesDeLaDemo(html));
        expect(sinDemo.match(PRECIO)?.[0] ?? null, `cifra de precio en ${destino}`).toBeNull();
        expect(html, `${destino} enlaza a la sección de precios`).not.toMatch(/#planes/);
        if (LEGALES.has(destino.slice(1))) return;
        expect(texto, `${destino} nombra el plan de pago`).not.toMatch(/Presu\s+Pro\b/i);
        expect(texto, `${destino} nombra planes`).not.toMatch(/\bplan(es)?\b/i);
        expect(texto.match(PLATA)?.[0] ?? null, `${destino} habla de pagos o precios`).toBeNull();
      });
    }
  }
});
