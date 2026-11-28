/**
 * Las capturas reales de la app en la galería «Así se ve Presu» (spec «presu.io que vende», CA11,
 * CA12; #39). Son de la app con la base de demostración (receta en el repo de la app,
 * docs/web/capturas.md) y van dentro de los marcos realistas (`Portatil.astro`, `Telefono.astro`).
 *
 * - Cada `<img>` de `/capturas/` tiene `alt` en español sin cifras, `width` y `height` iguales a los
 *   del archivo (sin saltos al cargar) y carga perezosa: la galería va lejos del pliegue.
 * - Cada archivo de `public/capturas/` está en la galería y pesa como mucho 400 KB.
 * - No queda ningún hueco de captura (`.hueco-captura`).
 * - En el iPhone, la captura es hija directa de la pantalla (la llena con `object-fit: cover`) y el
 *   marco no dibuja su barra de estado ni su barra de inicio: la captura trae las suyas.
 * - Los marcos de la galería sí se leen (sin `aria-hidden`): ahí el contenido son las capturas.
 *
 * Se revisa el HTML CONSTRUIDO. Corre `npm run build` antes.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'parse5';
import { describe, expect, it } from 'vitest';
import { dimensionesWebp } from '../lib/dimensiones-webp.js';

const RAIZ = process.cwd();
const RUTA = join(RAIZ, 'dist', 'index.html');
const CARPETA = join(RAIZ, 'public', 'capturas');
const TOPE_DE_PESO = 400 * 1024;
const MONTO = /\$\s?\d|\d{1,3}\.\d{3}/;

const atributo = (n, nombre) => n.attrs?.find((a) => a.name === nombre)?.value;
const clases = (n) => (atributo(n, 'class') ?? '').split(/\s+/);
function buscar(n, cumple, salida = []) {
  if (cumple(n)) salida.push(n);
  for (const h of n.childNodes ?? []) buscar(h, cumple, salida);
  if (n.content) buscar(n.content, cumple, salida);
  return salida;
}

function cargar() {
  expect(existsSync(RUTA), 'falta dist/index.html: corre npm run build').toBe(true);
  return parse(readFileSync(RUTA, 'utf8'));
}
const capturasDe = (doc) =>
  buscar(doc, (n) => n.nodeName === 'img' && (atributo(n, 'src') ?? '').startsWith('/capturas/'));
const galeriaDe = (doc) => buscar(doc, (n) => atributo(n, 'data-galeria') !== undefined)[0];

describe('capturas reales en la galería «Así se ve Presu»', () => {
  it('hay una galería con las capturas, y fuera de ella no hay ninguna', () => {
    const doc = cargar();
    const galeria = galeriaDe(doc);
    expect(galeria, 'falta [data-galeria]').toBeDefined();
    const todas = capturasDe(doc);
    expect(todas.length).toBeGreaterThanOrEqual(6);
    expect(capturasDe(galeria).length).toBe(todas.length);
  });

  it('cada captura con texto alternativo tiene alt en español sin cifras, width, height y carga perezosa', () => {
    for (const img of capturasDe(cargar())) {
      const src = atributo(img, 'src');
      const alt = atributo(img, 'alt');
      expect(alt, `${src} sin atributo alt`).toBeDefined();
      // La de fondo del cajón de «Ritmo del mes» es decorativa (alt vacío); las demás dicen qué pantalla es.
      if (alt !== '') {
        expect(alt.length, `${src}: alt muy corto`).toBeGreaterThan(20);
        expect(alt, `${src}: alt con cifras`).not.toMatch(MONTO);
        expect(alt, `${src}: alt sin decir el aparato`).toMatch(/\b(Mac|iPhone)\b/);
      }
      const { ancho, alto } = dimensionesWebp(src);
      expect(atributo(img, 'width'), `${src} width`).toBe(String(ancho));
      expect(atributo(img, 'height'), `${src} height`).toBe(String(alto));
      expect(atributo(img, 'loading'), `${src} sin loading="lazy"`).toBe('lazy');
    }
  });

  it('cada pantalla del escritorio y del iPhone tiene una captura con alt', () => {
    const conAlt = capturasDe(cargar()).filter((i) => atributo(i, 'alt'));
    const srcs = conAlt.map((i) => atributo(i, 'src'));
    for (const nombre of [
      'escritorio-inicio',
      'escritorio-ritmo',
      'escritorio-categorias',
      'escritorio-movimientos',
      'celular-inicio',
      'celular-lo-que-viene',
    ])
      expect(srcs, nombre).toContain(`/capturas/${nombre}.webp`);
  });

  it('cada archivo de public/capturas está en la galería y pesa ≤ 400 KB', () => {
    expect(existsSync(CARPETA), 'falta public/capturas').toBe(true);
    const archivos = readdirSync(CARPETA).filter((f) => !f.startsWith('.'));
    expect(archivos.length).toBeGreaterThan(0);
    const usadas = new Set(capturasDe(cargar()).map((i) => atributo(i, 'src').slice('/capturas/'.length)));
    for (const f of archivos) {
      expect(statSync(join(CARPETA, f)).size, `${f} pesa más de 400 KB`).toBeLessThanOrEqual(TOPE_DE_PESO);
      expect(usadas, `${f} no se usa`).toContain(f);
    }
    for (const f of usadas) expect(archivos, `${f} no está en public/capturas`).toContain(f);
  });

  it('no queda ningún hueco de captura', () => {
    const huecos = buscar(cargar(), (n) => clases(n).includes('hueco-captura'));
    expect(huecos).toEqual([]);
  });

  it('en el iPhone, la captura llena la pantalla y el marco no dibuja otra barra de estado', () => {
    const galeria = galeriaDe(cargar());
    const iphones = buscar(galeria, (n) => clases(n).includes('iphone'));
    expect(iphones.length).toBe(2);
    for (const t of iphones) {
      expect(atributo(t, 'aria-hidden'), 'el marco de la galería tiene que leerse').toBeUndefined();
      const [lienzo] = buscar(t, (n) => clases(n).includes('lienzo'));
      const hijos = (lienzo.childNodes ?? []).filter((n) => n.tagName);
      expect(hijos.map((n) => n.tagName)).toEqual(['img']);
      expect(buscar(t, (n) => clases(n).includes('barra-de-estado'))).toEqual([]);
      expect(buscar(t, (n) => clases(n).includes('inicio-barra'))).toEqual([]);
    }
    const [mac] = buscar(galeria, (n) => clases(n).includes('mac'));
    expect(atributo(mac, 'aria-hidden')).toBeUndefined();
  });

  it('las pestañas del MacBook controlan sus pantallas, y solo una está a la vista', () => {
    const galeria = galeriaDe(cargar());
    const pestanas = buscar(galeria, (n) => atributo(n, 'role') === 'tab');
    const paneles = buscar(galeria, (n) => atributo(n, 'role') === 'tabpanel');
    expect(pestanas.length).toBe(4);
    expect(paneles.length).toBe(4);
    for (const p of pestanas) {
      const id = atributo(p, 'aria-controls');
      expect(paneles.map((x) => atributo(x, 'id'))).toContain(id);
    }
    expect(pestanas.filter((p) => atributo(p, 'aria-selected') === 'true').length).toBe(1);
    expect(paneles.filter((p) => atributo(p, 'aria-hidden') !== 'true').length).toBe(1);
  });
});
