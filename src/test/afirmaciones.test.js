/**
 * Inventario de afirmaciones de la portada (spec «presu.io que vende», CA4, CA6, CA7).
 *
 * Cada frase de la portada que afirma algo de la app lleva `data-afirma="<id>"`, y
 * `src/data/afirmaciones.json` dice, para ese id, el texto exacto, la línea del
 * código de la app (repo Gastos_Personales, `origin/main`) que lo prueba y en qué
 * aparatos vale. Una frase sin prueba no se publica.
 *
 * Se revisa el HTML CONSTRUIDO: lo que lee la gente es la página servida, no el
 * fuente. Corre `npm run build` antes.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'parse5';
import { describe, expect, it } from 'vitest';

const RUTA = join(process.cwd(), 'dist', 'index.html');
const INVENTARIO = join(process.cwd(), 'src', 'data', 'afirmaciones.json');
const APARATOS = ['mac', 'windows', 'iphone', 'android'];

/** Frases que la portada no dice nunca (CA6, CA7). Se buscan en minúsculas. */
const PROHIBIDAS = ['nunca salen', '50/30/20', 'ahorra', 'cuánto puedes gastar'];
/** Lo que solo existe en el iPhone (CA6). */
const SOLO_IPHONE = /wallet|apple pay|\bsms\b/i;
const NOMBRA_IA = /\bIA\b|inteligencia artificial/i;
const EXTREMO_A_EXTREMO = /extremo a extremo/i;

const colapsar = (s) => s.replace(/\s+/g, ' ').trim();
const NO_VISIBLE = new Set(['script', 'style', 'template', 'noscript']);

function textoDe(nodo) {
  if (nodo.nodeName === '#text') return nodo.value;
  if (NO_VISIBLE.has(nodo.nodeName)) return '';
  return (nodo.childNodes ?? []).map(textoDe).join('');
}

const atributo = (nodo, nombre) => nodo.attrs?.find((a) => a.name === nombre)?.value;

/** Recorre el árbol y entrega cada texto visible con el `data-afirma` más cercano. */
function recorrer(nodo, afirmaDelPadre, visitar) {
  if (NO_VISIBLE.has(nodo.nodeName)) return;
  const afirma = atributo(nodo, 'data-afirma') ?? afirmaDelPadre;
  if (nodo.nodeName === '#text') visitar(nodo.value, afirma);
  for (const hijo of nodo.childNodes ?? []) recorrer(hijo, afirma, visitar);
  if (nodo.content) recorrer(nodo.content, afirma, visitar);
}

function marcados(nodo, salida = []) {
  if (NO_VISIBLE.has(nodo.nodeName)) return salida;
  const id = atributo(nodo, 'data-afirma');
  if (id !== undefined) salida.push({ id, texto: colapsar(textoDe(nodo)) });
  for (const hijo of nodo.childNodes ?? []) marcados(hijo, salida);
  return salida;
}

function cargar() {
  expect(existsSync(RUTA), 'falta dist/index.html: corre npm run build').toBe(true);
  expect(existsSync(INVENTARIO), 'falta src/data/afirmaciones.json').toBe(true);
  const doc = parse(readFileSync(RUTA, 'utf8'));
  const lista = JSON.parse(readFileSync(INVENTARIO, 'utf8'));
  return { doc, lista, porId: new Map(lista.map((a) => [a.id, a])) };
}

describe('inventario de afirmaciones de la portada', () => {
  it('cada entrada tiene id único, texto, prueba «ruta:línea» y al menos un aparato', () => {
    const { lista } = cargar();
    expect(Array.isArray(lista) && lista.length > 0, 'el inventario está vacío').toBe(true);
    const ids = new Set();
    for (const a of lista) {
      expect(typeof a.id === 'string' && a.id.length > 0, JSON.stringify(a)).toBe(true);
      expect(ids.has(a.id), `id repetido: ${a.id}`).toBe(false);
      ids.add(a.id);
      expect(
        typeof a.texto === 'string' && a.texto === colapsar(a.texto) && a.texto.length > 0,
        a.id,
      ).toBe(true);
      expect(a.prueba, a.id).toMatch(/^[\w.@[\]/-]+\.[\w]+:[1-9]\d*$/);
      expect(Array.isArray(a.aparatos) && a.aparatos.length > 0, `${a.id} sin aparatos`).toBe(true);
      for (const ap of a.aparatos) expect(APARATOS, `${a.id}: aparato ${ap}`).toContain(ap);
    }
  });

  it('cada data-afirma de la portada está en el inventario con su texto visible exacto', () => {
    const { doc, porId } = cargar();
    const encontrados = marcados(doc);
    expect(encontrados.length, 'la portada no marca ninguna afirmación').toBeGreaterThan(0);
    const vistos = new Set();
    for (const { id, texto } of encontrados) {
      expect(porId.has(id), `data-afirma="${id}" no está en afirmaciones.json`).toBe(true);
      expect(vistos.has(id), `data-afirma="${id}" marcado dos veces`).toBe(false);
      vistos.add(id);
      expect(texto, `texto de ${id}`).toBe(porId.get(id).texto);
    }
  });

  it('Wallet, Apple Pay y SMS solo en afirmaciones que valen en iPhone (CA6)', () => {
    const { doc, lista, porId } = cargar();
    for (const a of lista) {
      if (SOLO_IPHONE.test(a.texto)) expect(a.aparatos, a.id).toContain('iphone');
    }
    recorrer(doc, undefined, (texto, afirma) => {
      if (!SOLO_IPHONE.test(texto)) return;
      expect(afirma, `«${colapsar(texto)}» sin data-afirma`).toBeDefined();
      expect(porId.get(afirma)?.aparatos ?? [], afirma).toContain('iphone');
    });
  });

  it('la IA se nombra como opcional y con el texto enmascarado (CA7)', () => {
    const { doc, lista } = cargar();
    for (const a of lista) {
      if (!NOMBRA_IA.test(a.texto)) continue;
      expect(a.texto, a.id).toMatch(/opcional/i);
      expect(a.texto, a.id).toMatch(/enmascarad/i);
    }
    recorrer(doc, undefined, (texto, afirma) => {
      if (NOMBRA_IA.test(texto))
        expect(afirma, `«${colapsar(texto)}» sin data-afirma`).toBeDefined();
    });
  });

  it('«cifrado de extremo a extremo» solo de la sincronización o de Familia (CA7)', () => {
    const { doc, lista } = cargar();
    for (const a of lista) {
      if (EXTREMO_A_EXTREMO.test(a.texto)) expect(a.texto, a.id).toMatch(/sincroniz|familia/i);
    }
    recorrer(doc, undefined, (texto, afirma) => {
      if (EXTREMO_A_EXTREMO.test(texto))
        expect(afirma, `«${colapsar(texto)}» sin data-afirma`).toBeDefined();
    });
  });

  it('el texto visible no dice ninguna frase prohibida (CA6, CA7)', () => {
    expect(existsSync(RUTA), 'falta dist/index.html: corre npm run build').toBe(true);
    const texto = colapsar(textoDe(parse(readFileSync(RUTA, 'utf8')))).toLowerCase();
    for (const frase of PROHIBIDAS) expect(texto, frase).not.toContain(frase);
  });
});
