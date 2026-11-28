/**
 * El momento «Entra solo» de la portada (#39): un iPhone hecho en código donde llega un aviso del
 * banco y se vuelve un movimiento ya con su categoría (`src/components/momentos/MomentoEntraSolo.astro`).
 *
 * - Está en la sección «Cómo funciona», es UNA imagen (`role="img"`) con su rótulo en español, y lo
 *   de adentro no se lee.
 * - Con «reducir movimiento» no se anima: la regla existe en el CSS construido.
 * - Cada monto que pinta sale de `src/data/momentos.json` o de `cifras-de-la-demo.json`: el total
 *   final es `gastos` de la demo, y el de antes, ese menos el movimiento que llega. El componente no
 *   escribe ningún monto a mano.
 *
 * Se revisa el HTML CONSTRUIDO. Corre `npm run build` antes.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'parse5';
import { describe, expect, it } from 'vitest';

const RAIZ = process.cwd();
const RUTA = join(RAIZ, 'dist', 'index.html');
const COMPONENTE = join(RAIZ, 'src', 'components', 'momentos', 'MomentoEntraSolo.astro');
const momentos = JSON.parse(readFileSync(join(RAIZ, 'src', 'data', 'momentos.json'), 'utf8'));
const cifras = JSON.parse(readFileSync(join(RAIZ, 'src', 'data', 'cifras-de-la-demo.json'), 'utf8'));

const atributo = (n, nombre) => n.attrs?.find((a) => a.name === nombre)?.value;
const clases = (n) => (atributo(n, 'class') ?? '').split(/\s+/);
const NO_VISIBLE = new Set(['script', 'style', 'template', 'noscript']);
const textoDe = (n) =>
  n.nodeName === '#text' ? n.value : NO_VISIBLE.has(n.nodeName) ? '' : (n.childNodes ?? []).map(textoDe).join(' ');
function buscar(n, cumple, salida = []) {
  if (cumple(n)) salida.push(n);
  for (const h of n.childNodes ?? []) buscar(h, cumple, salida);
  return salida;
}
const cop = (n) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
const sinEspacios = (s) => s.replace(/\s/g, '');
const MONTO = /\$\s?\d{1,3}(?:\.\d{3})+|\$\s?\d+/g;

function cargar() {
  expect(existsSync(RUTA), 'falta dist/index.html: corre npm run build').toBe(true);
  const html = readFileSync(RUTA, 'utf8');
  const doc = parse(html);
  const [pieza] = buscar(doc, (n) => atributo(n, 'data-momento') === 'entra-solo');
  return { html, doc, pieza };
}

describe('momento «Entra solo»', () => {
  it('está en «Cómo funciona», en el lugar de los pantallazos del primer verbo', () => {
    const { doc, pieza } = cargar();
    expect(pieza, 'no encontré [data-momento="entra-solo"]').toBeDefined();
    const [como] = buscar(doc, (n) => atributo(n, 'id') === 'como');
    expect(buscar(como, (n) => n === pieza).length).toBe(1);
    const [primero] = buscar(como, (n) => clases(n).includes('verbo'));
    expect(buscar(primero, (n) => n === pieza).length, 'no está en el primer verbo').toBe(1);
    expect(buscar(primero, (n) => n.nodeName === 'img').length, 'el primer verbo sigue con capturas').toBe(0);
  });

  it('es una sola imagen con un rótulo en español, y lo de adentro no se lee', () => {
    const { pieza } = cargar();
    expect(atributo(pieza, 'role')).toBe('img');
    const rotulo = atributo(pieza, 'aria-label') ?? '';
    expect(rotulo.length).toBeGreaterThan(60);
    expect(rotulo).toMatch(/aviso/);
    expect(rotulo).toMatch(/categoría/);
    expect(rotulo).not.toMatch(/\bSMS\b/i);
    expect(buscar(pieza, (n) => n.nodeName === 'img' || n.nodeName === 'picture')).toEqual([]);
    const [aparato] = buscar(pieza, (n) => clases(n).includes('telefono'));
    expect(aparato, 'falta el iPhone').toBeDefined();
    expect(atributo(aparato, 'aria-hidden')).toBe('true');
  });

  it('con «reducir movimiento» no se anima', () => {
    const { html } = cargar();
    const carpeta = join(RAIZ, 'dist', '_astro');
    const css = [
      html,
      ...(existsSync(carpeta) ? readdirSync(carpeta).filter((f) => f.endsWith('.css')) : []).map((f) =>
        readFileSync(join(carpeta, f), 'utf8'),
      ),
    ].join('\n');
    const regla = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^@]*?\.momento[^}]*animation:\s*none/);
    expect(regla, 'falta la regla de reduced-motion del momento').not.toBeNull();
  });

  it('cada monto sale de momentos.json o de cifras-de-la-demo.json, y cuadran entre sí', () => {
    expect(momentos.mes).toBe(cifras.mes);
    const filas = [momentos.llega, ...momentos.hoyAntes, ...momentos.ayer];
    for (const f of filas) {
      expect(f.fecha.startsWith(`${momentos.mes}-`), `${f.comercio} es de otro mes`).toBe(true);
      expect(Number.isInteger(f.monto) && f.monto > 0, `${f.comercio}`).toBe(true);
    }
    // La escena pasa el último día con un gasto de Banco Andino hasta `hoy` (ver el generador).
    expect(momentos.diaDeLaEscena <= momentos.hoy).toBe(true);
    expect(momentos.llega.fecha).toBe(momentos.diaDeLaEscena);
    expect(momentos.llega.banco).toBe('Banco Andino');
    for (const f of momentos.hoyAntes) expect(f.fecha).toBe(momentos.diaDeLaEscena);
    for (const f of momentos.ayer) expect(f.fecha < momentos.diaDeLaEscena).toBe(true);
    const ids = filas.map((f) => f.id);
    expect(new Set(ids).size, 'un movimiento repetido').toBe(ids.length);

    const { pieza } = cargar();
    const esperados = new Set(
      [...filas.map((f) => f.monto), cifras.gastos, cifras.gastos - momentos.llega.monto].map((n) => sinEspacios(cop(n))),
    );
    const pintados = (textoDe(pieza).match(MONTO) ?? []).map(sinEspacios);
    expect(pintados.length).toBeGreaterThan(0);
    for (const m of pintados) expect(esperados, `«${m}» no sale de los JSON`).toContain(m);
    expect(pintados).toContain(sinEspacios(cop(cifras.gastos)));
    expect(pintados).toContain(sinEspacios(cop(cifras.gastos - momentos.llega.monto)));
    expect(pintados.filter((m) => m === sinEspacios(cop(momentos.llega.monto))).length).toBeGreaterThanOrEqual(2);
  });

  it('el componente no escribe ningún monto a mano', () => {
    const fuente = readFileSync(COMPONENTE, 'utf8');
    const html = fuente.slice(fuente.indexOf('---', 3) + 3, fuente.indexOf('<style>'));
    expect(html.match(/\$\s?\d/g) ?? []).toEqual([]);
    expect(html.match(/\d{1,3}\.\d{3}/g) ?? []).toEqual([]);
  });
});
