/**
 * La portada vende el dolor y lleva a la lista de espera, sin precios
 * (spec «presu.io que vende», CA5, CA8, CA14, §6.1).
 *
 * - Ninguna cifra de precio en el texto visible (CA8). Lo único que puede llevar
 *   cifras en pesos son los paneles alimentados por la base de demostración, que se
 *   marcan con `data-demo` (Tareas 6 y 8): sus cifras salen del mismo JSON que los
 *   pantallazos.
 * - La acción principal es UNA: el formulario de la lista, en el hero y en el cierre.
 *   Nada más compite con él como botón (CA14).
 * - El `<h1>` es el dolor, no la «Nueva Ola», y sin emoji.
 * - Presu llega a Mac, Windows e iPhone a la vez (decisión del fundador, 2026-11-27):
 *   la página no dice que el celular «ya está», ni que viene «próximamente».
 *
 * Se revisa el HTML CONSTRUIDO. Corre `npm run build` antes.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'parse5';
import { describe, expect, it } from 'vitest';

const RUTA = join(process.cwd(), 'dist', 'index.html');
const PRECIO = /\$\s?\d{1,3}(\.\d{3})+/;
const NO_VISIBLE = new Set(['script', 'style', 'template', 'noscript']);

const atributo = (n, nombre) => n.attrs?.find((a) => a.name === nombre)?.value;
const clases = (n) => (atributo(n, 'class') ?? '').split(/\s+/);
const colapsar = (s) => s.replace(/\s+/g, ' ').trim();

function texto(n, { sinDemo = false } = {}) {
  if (n.nodeName === '#text') return n.value;
  if (NO_VISIBLE.has(n.nodeName)) return '';
  if (sinDemo && atributo(n, 'data-demo') !== undefined) return '';
  return (n.childNodes ?? []).map((h) => texto(h, { sinDemo })).join(' ');
}

/** Todos los elementos, cada uno con la lista de sus ancestros. */
function elementos(n, ancestros = [], salida = []) {
  if (n.tagName) salida.push({ n, ancestros });
  for (const h of n.childNodes ?? []) elementos(h, n.tagName ? [...ancestros, n] : ancestros, salida);
  return salida;
}

function cargar() {
  expect(existsSync(RUTA), 'falta dist/index.html: corre npm run build').toBe(true);
  const html = readFileSync(RUTA, 'utf8');
  const doc = parse(html);
  return { html, doc, todos: elementos(doc) };
}

const dentroDe = (ancestros, prueba) => ancestros.some(prueba);
const esHero = (a) => a.tagName === 'section' && clases(a).includes('hero');
const esCierre = (a) => atributo(a, 'id') === 'waitlist';

describe('la portada vende sin precios (CA8)', () => {
  it('el texto visible no tiene cifras de precio, fuera de los paneles de la demo', () => {
    const { doc } = cargar();
    const visible = colapsar(texto(doc, { sinDemo: true }));
    expect(visible.match(PRECIO)?.[0] ?? null, 'cifra de precio en la portada').toBeNull();
  });

  it('no nombra planes ni el plan de pago', () => {
    const { doc } = cargar();
    const visible = colapsar(texto(doc));
    expect(visible).not.toMatch(/\bplan(es)?\b/i);
    expect(visible).not.toMatch(/Presu\s+Pro\b/i);
  });

  it('el JSON-LD no trae una oferta con precio', () => {
    const { html } = cargar();
    const bloques = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)];
    expect(bloques.length, 'no encontré el JSON-LD').toBeGreaterThan(0);
    for (const [, json] of bloques) {
      expect(json).not.toMatch(/"Offer"/);
      expect(json).not.toMatch(/"price"/);
    }
  });
});

describe('una sola acción: la lista de espera (CA14)', () => {
  it('hay exactamente un formulario en el hero y uno en el cierre, y ninguno más', () => {
    const { todos } = cargar();
    const forms = todos.filter(({ n }) => n.tagName === 'form');
    expect(forms.length, 'formularios en la portada').toBe(2);
    expect(forms.filter(({ ancestros }) => dentroDe(ancestros, esHero)).length, 'en el hero').toBe(1);
    expect(forms.filter(({ ancestros }) => dentroDe(ancestros, esCierre)).length, 'en el cierre').toBe(1);
  });

  it('cada formulario se envía con «Únete a la lista»', () => {
    const { todos } = cargar();
    for (const { n } of todos.filter(({ n }) => n.tagName === 'form')) {
      const boton = elementos(n).find(({ n: b }) => b.tagName === 'button' && atributo(b, 'type') === 'submit');
      expect(boton, `formulario #${atributo(n, 'id')} sin botón de envío`).toBeDefined();
      expect(colapsar(texto(boton.n))).toMatch(/^Únete a la lista/);
    }
  });

  it('ningún otro botón primario compite con el formulario', () => {
    const { todos } = cargar();
    const primarios = todos.filter(
      ({ n, ancestros }) =>
        clases(n).includes('capture-btn') && !dentroDe(ancestros, (a) => a.tagName === 'form'),
    );
    expect(primarios.map(({ n }) => colapsar(texto(n)))).toEqual([]);
    const delMenu = todos.filter(({ n }) => clases(n).includes('btn-cta'));
    expect(delMenu.map(({ n }) => colapsar(texto(n)))).toEqual(['Únete a la lista']);
  });

  it('el menú no lleva a planes ni a «Aporta», y no hay botón de empresas', () => {
    const { doc, todos } = cargar();
    const menu = todos.filter(({ ancestros }) => dentroDe(ancestros, (a) => a.tagName === 'nav'));
    const enlaces = menu.filter(({ n }) => n.tagName === 'a');
    for (const { n } of enlaces) {
      expect(atributo(n, 'href')).not.toMatch(/#planes|\/aporta/);
      expect(colapsar(texto(n))).not.toMatch(/Planes|Aporta/i);
    }
    expect(colapsar(texto(doc))).not.toMatch(/Quiero ofrecerlo en mi empresa/i);
  });
});

describe('el hero es el dolor (§6.1)', () => {
  it('un solo <h1>, sin «Nueva Ola» y sin emoji', () => {
    const { todos } = cargar();
    const h1 = todos.filter(({ n }) => n.tagName === 'h1');
    expect(h1.length).toBe(1);
    const t = colapsar(texto(h1[0].n));
    expect(t).not.toMatch(/Nueva Ola/i);
    expect(t).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(dentroDe(h1[0].ancestros, esHero), 'el h1 vive en el hero').toBe(true);
  });

  it('el hero trae el lugar del video', () => {
    const { todos } = cargar();
    const video = todos.filter(
      ({ n, ancestros }) =>
        dentroDe(ancestros, esHero) && (clases(n).includes('hueco-vsl') || n.tagName === 'video'),
    );
    expect(video.length, 'falta el VSL (o su hueco) en el hero').toBeGreaterThan(0);
  });

  it('Presu llega a todos los aparatos a la vez: nada de «ya está» ni «próximamente»', () => {
    const { doc, html } = cargar();
    const visible = colapsar(texto(doc)).toLowerCase();
    for (const frase of ['ya está en iphone', 'próximamente', 'en camino', 'ya está disponible']) {
      expect(visible, frase).not.toContain(frase);
    }
    expect(visible).toMatch(/mac, windows e iphone al mismo tiempo/);
    const jsonld = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)]
      .map((m) => m[1].toLowerCase())
      .join(' ');
    expect(jsonld).not.toContain('ya está en iphone');
  });
});
