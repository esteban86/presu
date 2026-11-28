/**
 * Los momentos «Te dice cómo vas» (Mac) y «Lo que viene» (iPhone) de la portada (#39):
 * `src/components/momentos/MomentoComoVas.astro` y `MomentoQueViene.astro`.
 *
 * - Cada uno está en su verbo de «Cómo funciona», es UNA imagen (`role="img"`) con su rótulo en
 *   español, y lo de adentro no se lee.
 * - Con «reducir movimiento» no se anima.
 * - El veredicto dice las palabras del escritorio y, con tope, la curva es «para cerrar en tu tope»,
 *   nunca «sueles llevar» ni «de costumbre» (AGENTS.md).
 * - Cada monto sale de `momentos.json`; los componentes no escriben montos a mano.
 * - «Lo que viene» va solo en iPhone (afirmación `vas-viene`), sin tarjetas inventadas y sin sumar
 *   entre filas.
 *
 * Se revisa el HTML CONSTRUIDO. Corre `npm run build` antes.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'parse5';
import { describe, expect, it } from 'vitest';

const RAIZ = process.cwd();
const RUTA = join(RAIZ, 'dist', 'index.html');
const momentos = JSON.parse(readFileSync(join(RAIZ, 'src', 'data', 'momentos.json'), 'utf8'));

const atributo = (n, nombre) => n.attrs?.find((a) => a.name === nombre)?.value;
const clases = (n) => (atributo(n, 'class') ?? '').split(/\s+/);
const NO_VISIBLE = new Set(['script', 'style', 'template', 'noscript']);
const textoDe = (n) =>
  n.nodeName === '#text' ? n.value : NO_VISIBLE.has(n.nodeName) ? '' : (n.childNodes ?? []).map(textoDe).join(' ');
const colapsar = (s) => s.replace(/\s+/g, ' ').trim();
function buscar(n, cumple, salida = []) {
  if (cumple(n)) salida.push(n);
  for (const h of n.childNodes ?? []) buscar(h, cumple, salida);
  return salida;
}
const cop = (n) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
const sinEspacios = (s) => s.replace(/\s/g, '');
const compacto = (n) =>
  n >= 1e6
    ? `$${(n / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 2 })}M`
    : `$${(n / 1e3).toLocaleString('es-CO', { maximumFractionDigits: 0 })}K`;
const MONTO = /\$\s?\d{1,3}(?:\.\d{3})+(?![\d]|[.,]\d)|\$\s?\d+(?:,\d+)?\s?[MK]\b|\$\s?\d+(?![\d]|[.,]\d)/g;

function cargar() {
  expect(existsSync(RUTA), 'falta dist/index.html: corre npm run build').toBe(true);
  const html = readFileSync(RUTA, 'utf8');
  const doc = parse(html);
  const pieza = (id) => buscar(doc, (n) => atributo(n, 'data-momento') === id)[0];
  return { html, doc, pieza };
}

function verbos(doc) {
  const [como] = buscar(doc, (n) => atributo(n, 'id') === 'como');
  return buscar(como, (n) => clases(n).includes('verbo'));
}
const contiene = (padre, hijo) => buscar(padre, (n) => n === hijo).length === 1;

describe.each([
  ['como-vas', 1, 'mac', 'MomentoComoVas.astro'],
  ['que-viene', 2, 'iphone', 'MomentoQueViene.astro'],
])('momento %s', (id, indice, aparato, archivo) => {
  it('está en su verbo de «Cómo funciona», sin capturas', () => {
    const { doc, pieza } = cargar();
    const p = pieza(id);
    expect(p, `no encontré [data-momento="${id}"]`).toBeDefined();
    const verbo = verbos(doc)[indice];
    expect(contiene(verbo, p)).toBe(true);
    expect(buscar(verbo, (n) => n.nodeName === 'img')).toEqual([]);
  });

  it('es una sola imagen con rótulo en español, y lo de adentro no se lee', () => {
    const { pieza } = cargar();
    const p = pieza(id);
    expect(atributo(p, 'role')).toBe('img');
    expect(atributo(p, 'data-demo')).toBeDefined();
    const rotulo = atributo(p, 'aria-label') ?? '';
    expect(rotulo.length).toBeGreaterThan(60);
    expect(rotulo).toMatch(/^Una escena de Presu en el (Mac|iPhone)/);
    const [marco] = buscar(p, (n) => clases(n).includes(aparato));
    expect(marco, `falta el ${aparato}`).toBeDefined();
    expect(atributo(marco, 'aria-hidden')).toBe('true');
  });

  it('con «reducir movimiento» no se anima', () => {
    // En la fuente del componente: en el HTML construido, la regla de otro momento la taparía.
    const fuente = readFileSync(join(RAIZ, 'src', 'components', 'momentos', archivo), 'utf8');
    expect(fuente).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[^@]*?\.momento \*[^}]*animation: none !important/);
  });
});

describe('«Te dice cómo vas»', () => {
  it('el veredicto es el del escritorio, con la cifra marcada', () => {
    const { pieza } = cargar();
    const p = pieza('como-vas');
    const frase = colapsar(textoDe(buscar(p, (n) => clases(n).includes('veredicto__frase'))[0]));
    expect(sinEspacios(frase)).toBe(sinEspacios(momentos.ritmo.veredicto.segmentos.map((s) => s.text).join('')));
    expect(frase).toMatch(/^Te quedan .+ de tu tope/);
    const [cifra] = buscar(p, (n) => clases(n).includes('cifra'));
    expect(buscar(cifra, (n) => clases(n).includes('marca')).length).toBe(1);
    expect(colapsar(textoDe(p))).toContain(momentos.ritmo.veredicto.estado);
  });

  it('con tope dice «para cerrar en tu tope», nunca «sueles llevar» ni «de costumbre»', () => {
    const { pieza } = cargar();
    const texto = colapsar(textoDe(pieza('como-vas')));
    expect(texto).toContain('Para cerrar en tu tope');
    expect(texto).not.toMatch(/sueles llevar|de costumbre/i);
    expect(atributo(pieza('como-vas'), 'aria-label')).not.toMatch(/sueles llevar|de costumbre/i);
  });

  it('una dona por tope, con su porcentaje, todas bajo el 100 %', () => {
    const { pieza } = cargar();
    const donas = buscar(pieza('como-vas'), (n) => clases(n).includes('dona'));
    expect(donas.length).toBe(momentos.ritmo.donas.length);
    donas.forEach((d, i) => {
      const dato = momentos.ritmo.donas[i];
      expect(colapsar(textoDe(d))).toContain(`${dato.pct}%`);
      expect(colapsar(textoDe(d))).toContain(dato.categoria);
      expect(dato.pct).toBeLessThan(100);
    });
  });

  it('cada monto sale de momentos.json', () => {
    const { pieza } = cargar();
    const r = momentos.ritmo;
    const esperados = new Set([
      sinEspacios(cop(r.tope - r.gastado)),
      sinEspacios(cop(r.tope)),
      sinEspacios(cop(r.gastado)),
      compacto(r.tope),
      ...r.donas.map((d) => compacto(d.tope - d.gastado)),
    ]);
    const pintados = (textoDe(pieza('como-vas')).match(MONTO) ?? []).map(sinEspacios);
    expect(pintados.length).toBeGreaterThan(5);
    for (const m of pintados) expect(esperados, `«${m}» no sale de momentos.json`).toContain(m);
  });
});

describe('«Lo que viene»', () => {
  it('va en un iPhone, cada pago con su fecha, su monto y «Se repite cada mes»', () => {
    const { pieza } = cargar();
    const p = pieza('que-viene');
    expect(buscar(p, (n) => clases(n).includes('mac'))).toEqual([]);
    const filas = buscar(p, (n) => clases(n).includes('pago'));
    expect(filas.length).toBe(momentos.loQueViene.length);
    filas.forEach((f, i) => {
      const dato = momentos.loQueViene[i];
      const texto = colapsar(textoDe(f));
      expect(texto).toContain(dato.nombre);
      expect(sinEspacios(texto)).toContain(sinEspacios(cop(dato.monto)));
      expect(texto).toContain(String(Number(dato.fecha.slice(8, 10))));
      expect(texto).toContain('Se repite cada mes');
    });
  });

  it('no inventa tarjetas ni suma entre filas', () => {
    const { pieza } = cargar();
    const texto = colapsar(textoDe(pieza('que-viene')));
    expect(texto).not.toMatch(/tarjeta|vence|total|te queda/i);
    const pintados = (textoDe(pieza('que-viene')).match(MONTO) ?? []).map(sinEspacios);
    const esperados = new Set(momentos.loQueViene.map((p) => sinEspacios(cop(p.monto))));
    for (const m of pintados) expect(esperados, `«${m}» no sale de momentos.json`).toContain(m);
  });
});

describe('los componentes no escriben montos a mano', () => {
  it.each(['MomentoComoVas.astro', 'MomentoQueViene.astro'])('%s', (archivo) => {
    const fuente = readFileSync(join(RAIZ, 'src', 'components', 'momentos', archivo), 'utf8');
    const html = fuente.slice(fuente.indexOf('---', 3) + 3, fuente.indexOf('<style>'));
    expect(html.match(/\$\s?\d/g) ?? []).toEqual([]);
    expect(html.match(/\d{1,3}\.\d{3}/g) ?? []).toEqual([]);
  });
});
