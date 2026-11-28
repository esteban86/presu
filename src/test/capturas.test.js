/**
 * Capturas reales de la app y cifras de la demo (spec «presu.io que vende», CA10, CA11, CA12, §6.2).
 *
 * - Toda `<img>` de `/capturas/` en la portada tiene `alt`, `width` y `height`, y carga perezosa
 *   (`loading="lazy"`) salvo las del hero, que son las que se ven al abrir. En la portada que
 *   vende (#39) el hero lleva el video y ninguna captura, así que todas cargan perezosas: una
 *   captura bajo el pliegue con prioridad le quitaría ancho de banda al LCP (CA12).
 * - Ya no queda ningún hueco de captura (`.hueco-captura`): cada uno se volvió una `Captura`.
 * - Cada archivo de `public/capturas/` pesa como mucho 400 KB, y cada captura de la portada existe.
 * - Cada monto visible de un panel dibujado en código (marcado con `data-demo`) sale de
 *   `src/data/cifras-de-la-demo.json`: la salida de `scripts/exportar-cifras-de-la-demo.mjs` del repo
 *   de la app, sobre la MISMA base sembrada en los pantallazos. Un monto escrito a mano no cuadra
 *   con el pantallazo de al lado. Y FUERA de esos paneles no hay ningún monto: la portada que vende
 *   no tiene vitrina en código, y una cifra suelta no tendría de dónde salir.
 *
 * Se revisa el HTML CONSTRUIDO. Corre `npm run build` antes.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'parse5';
import { describe, expect, it } from 'vitest';

const RAIZ = process.cwd();
const RUTA = join(RAIZ, 'dist', 'index.html');
const CARPETA = join(RAIZ, 'public', 'capturas');
const CIFRAS = join(RAIZ, 'src', 'data', 'cifras-de-la-demo.json');
const MOMENTOS = join(RAIZ, 'src', 'data', 'momentos.json');
const TOPE_DE_PESO = 400 * 1024;

/** Un panel dibujado en código con cifras de la demo se marca con `data-demo`. */
const esPanel = (n) => atributo(n, 'data-demo') !== undefined;
/** Un monto en pesos: «$1.234.567», «$ 661.500», «$5,5M», «$662K», con signo o sin él. */
const MONTO =
  /[−-]?\$\s?\d{1,3}(?:\.\d{3})+(?![\d]|[.,]\d)|[−-]?\$\s?\d+(?:,\d+)?\s?[MK]\b|[−-]?\$\s?\d+(?![\d]|[.,]\d)/g;

const NO_VISIBLE = new Set(['script', 'style', 'template', 'noscript']);
const atributo = (nodo, nombre) => nodo.attrs?.find((a) => a.name === nombre)?.value;
const clases = (nodo) => (atributo(nodo, 'class') ?? '').split(/\s+/);

function textoDe(nodo, { sinPaneles = false } = {}) {
  if (nodo.nodeName === '#text') return nodo.value;
  if (NO_VISIBLE.has(nodo.nodeName)) return '';
  if (sinPaneles && esPanel(nodo)) return '';
  return (nodo.childNodes ?? []).map((h) => textoDe(h, { sinPaneles })).join(' ');
}

/** Si el nodo vive dentro del hero (`section.hero`). */
function enElHero(doc, objetivo) {
  const heroes = buscar(doc, (n) => n.nodeName === 'section' && clases(n).includes('hero'));
  return heroes.some((h) => buscar(h, (n) => n === objetivo).length > 0);
}

function buscar(nodo, cumple, salida = []) {
  if (cumple(nodo)) salida.push(nodo);
  for (const hijo of nodo.childNodes ?? []) buscar(hijo, cumple, salida);
  if (nodo.content) buscar(nodo.content, cumple, salida);
  return salida;
}

function cargar() {
  expect(existsSync(RUTA), 'falta dist/index.html: corre npm run build').toBe(true);
  return parse(readFileSync(RUTA, 'utf8'));
}

function capturasDe(doc) {
  return buscar(
    doc,
    (n) => n.nodeName === 'img' && (atributo(n, 'src') ?? '').startsWith('/capturas/'),
  );
}

/** «$1.234.567» y «$1,23M» / «$662K» de cada cifra de la demo, como los escribe la web. */
function montosPermitidos(cifras, momentos) {
  const numeros = [cifras.ingresos, cifras.gastos, cifras.balance];
  // Los momentos animados (`src/data/momentos.json`, de la MISMA base): cada movimiento, y el
  // total del mes antes de que entre el que llega.
  if (momentos) {
    for (const m of [momentos.llega, ...momentos.hoyAntes, ...momentos.ayer]) numeros.push(m.monto);
    numeros.push(cifras.gastos - momentos.llega.monto);
  }
  for (const t of cifras.topes) numeros.push(t.gastado, t.tope, Math.abs(t.tope - t.gastado));
  const sumaTopes = cifras.topes.reduce((s, t) => s + t.tope, 0);
  const sumaGastado = cifras.topes.reduce((s, t) => s + t.gastado, 0);
  numeros.push(sumaTopes, sumaGastado);
  const formas = new Set();
  for (const n of numeros) {
    formas.add(`$${n.toLocaleString('es-CO')}`);
    if (n >= 1e6)
      formas.add(`$${(n / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 2 })}M`);
    if (n >= 1e3)
      formas.add(`$${(n / 1e3).toLocaleString('es-CO', { maximumFractionDigits: 0 })}K`);
  }
  return formas;
}

const normal = (monto) => monto.replace(/^[−-]/, '').replace(/\s/g, '');

describe('capturas reales de la app en la portada', () => {
  it('hay capturas, y cada una tiene alt, width, height y carga perezosa salvo las del hero', () => {
    const doc = cargar();
    const imgs = capturasDe(doc);
    expect(
      imgs.length,
      'la portada no muestra ninguna captura de /capturas/',
    ).toBeGreaterThanOrEqual(2);
    imgs.forEach((img) => {
      const src = atributo(img, 'src');
      expect((atributo(img, 'alt') ?? '').trim().length, `${src} sin alt`).toBeGreaterThan(0);
      expect(atributo(img, 'width') ?? '', `${src} sin width`).toMatch(/^[1-9]\d*$/);
      expect(atributo(img, 'height') ?? '', `${src} sin height`).toMatch(/^[1-9]\d*$/);
      if (enElHero(doc, img)) expect(atributo(img, 'loading'), `${src} está en el hero`).not.toBe('lazy');
      else expect(atributo(img, 'loading'), `${src} sin loading="lazy"`).toBe('lazy');
    });
  });

  it('no queda ningún hueco de captura: todos se volvieron una Captura', () => {
    const huecos = buscar(cargar(), (n) => clases(n).includes('hueco-captura'));
    expect(huecos.map((n) => atributo(n, 'data-captura'))).toEqual([]);
  });

  it('cada captura de la portada existe en public/capturas y cada archivo pesa ≤ 400 KB', () => {
    expect(existsSync(CARPETA), 'falta public/capturas').toBe(true);
    const archivos = readdirSync(CARPETA).filter((f) => !f.startsWith('.'));
    expect(archivos.length).toBeGreaterThan(0);
    for (const f of archivos) {
      expect(statSync(join(CARPETA, f)).size, `${f} pesa más de 400 KB`).toBeLessThanOrEqual(
        TOPE_DE_PESO,
      );
    }
    for (const img of capturasDe(cargar())) {
      const nombre = atributo(img, 'src').slice('/capturas/'.length);
      expect(archivos, `${nombre} no está en public/capturas`).toContain(nombre);
    }
  });

  it('cada monto visible de los paneles está en cifras-de-la-demo.json', () => {
    expect(existsSync(CIFRAS), 'falta src/data/cifras-de-la-demo.json').toBe(true);
    const cifras = JSON.parse(readFileSync(CIFRAS, 'utf8'));
    expect(cifras.mes).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
    expect(Array.isArray(cifras.topes) && cifras.topes.length > 0).toBe(true);
    const momentos = existsSync(MOMENTOS) ? JSON.parse(readFileSync(MOMENTOS, 'utf8')) : null;
    const permitidos = montosPermitidos(cifras, momentos);

    const doc = cargar();
    const paneles = buscar(doc, esPanel);
    const montos = paneles.flatMap((p) => textoDe(p).match(MONTO) ?? []);
    for (const m of montos) expect(permitidos, `«${m}» no sale de la demo`).toContain(normal(m));
    const sueltos = textoDe(doc, { sinPaneles: true }).match(MONTO) ?? [];
    expect(sueltos, 'montos fuera de un panel de la demo').toEqual([]);
  });

  it('el patrón de montos reconoce las formas que escribe la web (control del propio test)', () => {
    const texto = 'Entraron $5.500.000, $ 661.500; $5,5M, $662K y −$43.000. Y $9.';
    expect(texto.match(MONTO)).toEqual([
      '$5.500.000',
      '$ 661.500',
      '$5,5M',
      '$662K',
      '−$43.000',
      '$9',
    ]);
  });
});
