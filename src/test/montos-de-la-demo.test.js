/**
 * Cada monto de la portada sale de la base de demostración (spec «presu.io que vende», CA10, CA11).
 *
 * - Los momentos animados (`src/components/momentos/`) son paneles dibujados en código y van marcados
 *   con `data-demo`. Cada monto visible adentro sale de `src/data/cifras-de-la-demo.json` o de
 *   `src/data/momentos.json`, que `scripts/actualizar-datos-de-la-demo.mjs` escribe juntos sobre la
 *   MISMA base. FUERA de esos paneles no hay ningún monto: una cifra suelta no tendría de dónde salir.
 * - No queda ningún hueco de captura (`.hueco-captura`). Las capturas reales (galería «Así se ve
 *   Presu») son imágenes: sus cifras no son texto, y las vigila `capturas.test.js`.
 *
 * Se revisa el HTML CONSTRUIDO. Corre `npm run build` antes.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'parse5';
import { describe, expect, it } from 'vitest';

const RAIZ = process.cwd();
const RUTA = join(RAIZ, 'dist', 'index.html');
const CIFRAS = join(RAIZ, 'src', 'data', 'cifras-de-la-demo.json');
const MOMENTOS = join(RAIZ, 'src', 'data', 'momentos.json');

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

/** «$1.234.567» y «$1,23M» / «$662K» de cada cifra de la demo, como los escribe la web. */
function montosPermitidos(cifras, momentos) {
  const numeros = [cifras.ingresos, cifras.gastos, cifras.balance];
  // Los momentos animados (`src/data/momentos.json`, de la MISMA base): cada movimiento, y el
  // total del mes antes de que entre el que llega.
  if (momentos) {
    for (const m of [momentos.llega, ...momentos.hoyAntes, ...momentos.ayer]) numeros.push(m.monto);
    numeros.push(cifras.gastos - momentos.llega.monto);
    // «Te dice cómo vas»: lo que queda de la suma de tus topes. «Lo que viene»: cada pago.
    numeros.push(momentos.ritmo.tope - momentos.ritmo.gastado);
    for (const p of momentos.loQueViene) numeros.push(p.monto);
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

describe('los montos de la portada salen de la demo', () => {
  it('no queda ningún hueco de captura: todos se volvieron una Captura', () => {
    const huecos = buscar(cargar(), (n) => clases(n).includes('hueco-captura'));
    expect(huecos.map((n) => atributo(n, 'data-captura'))).toEqual([]);
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
