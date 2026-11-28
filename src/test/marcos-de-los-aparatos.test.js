/**
 * Los marcos de los momentos (#39): un iPhone (`Telefono.astro`) y un MacBook Pro
 * (`Portatil.astro`), realistas y hechos en CSS, sin imágenes.
 *
 * - En la portada hay dos iPhone y un MacBook, cada uno con sus piezas (canto, bisel, pantalla,
 *   Dynamic Island o notch, botones o base, la sombra del piso) y `aria-hidden`.
 * - Reciben cualquier contenido por `slot`: lo de adentro va dentro de `.lienzo`, y un `<img>` como
 *   hijo directo llena la pantalla exacta (`object-fit: cover`, arriba). Se comprueba que la regla
 *   construida apunta al MISMO `.lienzo` que está en la página (el atributo de alcance de Astro).
 * - La inclinación de entrada solo existe con la animación preparada y se apaga con «reducir
 *   movimiento».
 *
 * Se revisa el HTML CONSTRUIDO. Corre `npm run build` antes.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'parse5';
import { describe, expect, it } from 'vitest';

const RAIZ = process.cwd();
const RUTA = join(RAIZ, 'dist', 'index.html');
const fuente = (archivo) => readFileSync(join(RAIZ, 'src', 'components', 'momentos', archivo), 'utf8');

const atributo = (n, nombre) => n.attrs?.find((a) => a.name === nombre)?.value;
const clases = (n) => (atributo(n, 'class') ?? '').split(/\s+/);
function buscar(n, cumple, salida = []) {
  if (cumple(n)) salida.push(n);
  for (const h of n.childNodes ?? []) buscar(h, cumple, salida);
  return salida;
}
const conClase = (raiz, c) => buscar(raiz, (n) => clases(n).includes(c));

function cargar() {
  expect(existsSync(RUTA), 'falta dist/index.html: corre npm run build').toBe(true);
  const html = readFileSync(RUTA, 'utf8');
  return { html, doc: parse(html) };
}

describe('los marcos de los aparatos', () => {
  it('dos iPhone y un MacBook, cada uno con sus piezas y fuera del lector de pantalla', () => {
    const { doc } = cargar();
    const iphones = conClase(doc, 'iphone');
    const macs = conClase(doc, 'mac');
    expect(iphones.length).toBe(2);
    expect(macs.length).toBe(1);
    for (const t of iphones) {
      expect(atributo(t, 'aria-hidden')).toBe('true');
      for (const pieza of ['cuerpo', 'bisel', 'pantalla', 'isla', 'vidrio', 'piso', 'lienzo'])
        expect(conClase(t, pieza).length, `iPhone sin ${pieza}`).toBe(1);
      expect(conClase(t, 'boton').length, 'iPhone sin botones').toBe(5);
    }
    for (const m of macs) {
      expect(atributo(m, 'aria-hidden')).toBe('true');
      for (const pieza of ['tapa', 'pantalla', 'notch', 'vidrio', 'bisagra', 'base', 'base__corte', 'piso', 'lienzo'])
        expect(conClase(m, pieza).length, `MacBook sin ${pieza}`).toBe(1);
    }
  });

  it('el contenido entra por slot dentro de la pantalla, y un <img> la llenaría exacta', () => {
    const { html, doc } = cargar();
    for (const [archivo, marco] of [
      ['Telefono.astro', 'iphone'],
      ['Portatil.astro', 'mac'],
    ]) {
      expect(fuente(archivo), `${archivo} sin slot`).toMatch(/<div class="lienzo">[\s\S]*<slot \/>[\s\S]*<\/div>/);
      const [lienzo] = conClase(conClase(doc, marco)[0], 'lienzo');
      const alcance = lienzo.attrs.find((a) => a.name.startsWith('data-astro-cid-'))?.name;
      expect(alcance, `${marco}: .lienzo sin alcance de Astro`).toBeDefined();
      const regla = new RegExp(
        `\\.lienzo\\[${alcance}\\]\\s*>\\s*img\\s*\\{[^}]*object-fit:\\s*cover[^}]*object-position:\\s*top`,
      );
      expect(html, `${marco}: falta la regla del <img> que llena la pantalla`).toMatch(regla);
    }
  });

  it('la inclinación es solo de entrada, y «reducir movimiento» la apaga', () => {
    for (const archivo of ['Telefono.astro', 'Portatil.astro']) {
      const css = fuente(archivo);
      const inclinaciones = css.match(/:global\(\[data-momento\]\.animada:not\(\.corre\)\)[^{]*\{\s*transform: rotate/g) ?? [];
      expect(inclinaciones.length, `${archivo} sin inclinación de entrada`).toBe(2);
      expect(css.match(/transform: rotate/g)?.length, `${archivo}: una inclinación fuera de la entrada`).toBe(2);
      expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[^@]*transform: none !important/);
    }
  });

  it('los marcos no cargan imágenes', () => {
    for (const archivo of ['Telefono.astro', 'Portatil.astro']) {
      // Sin los comentarios, que sí nombran el <img> que se le puede pasar.
      const codigo = fuente(archivo)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(codigo).not.toMatch(/<img|url\(/);
    }
  });
});
