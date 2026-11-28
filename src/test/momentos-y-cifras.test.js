/**
 * `momentos.json` y `cifras-de-la-demo.json` son de la MISMA base de demostración: los escribe
 * juntos `scripts/actualizar-datos-de-la-demo.mjs`. Si alguien regenera uno solo, las cifras de los
 * momentos dejan de cuadrar con las de la demo, y esta prueba lo dice.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const leer = (f) => JSON.parse(readFileSync(join(process.cwd(), 'src', 'data', f), 'utf8'));
const momentos = leer('momentos.json');
const cifras = leer('cifras-de-la-demo.json');

describe('momentos.json cuadra con cifras-de-la-demo.json', () => {
  it('son del mismo mes y del mismo día de corte', () => {
    expect(momentos.mes).toBe(cifras.mes);
    expect(momentos.hoy).toBe(cifras.hoy);
  });

  it('el ritmo suma lo mismo que los topes de la demo', () => {
    const tope = cifras.topes.reduce((s, t) => s + t.tope, 0);
    const gastado = cifras.topes.reduce((s, t) => s + t.gastado, 0);
    expect(momentos.ritmo.tope).toBe(tope);
    expect(momentos.ritmo.gastado).toBe(gastado);
    // Lo que llevas el último día es lo gastado en las categorías con tope.
    expect(momentos.ritmo.lleva.at(-1)).toBe(gastado);
    expect(momentos.ritmo.lleva.length).toBe(Number(cifras.hoy.slice(8, 10)));
    // La curva «para cerrar en tu tope» termina en el tope.
    expect(momentos.ritmo.paraCerrarEnTuTope.at(-1)).toBe(tope);
    expect(momentos.ritmo.paraCerrarEnTuTope.length).toBe(momentos.ritmo.diasDelMes);
  });

  it('cada dona es un tope de la demo, con su gastado y su porcentaje', () => {
    expect(momentos.ritmo.donas.map((d) => d.categoria)).toEqual(cifras.topes.map((t) => t.categoria));
    for (const d of momentos.ritmo.donas) {
      const t = cifras.topes.find((x) => x.categoria === d.categoria);
      expect(d.gastado).toBe(t.gastado);
      expect(d.tope).toBe(t.tope);
      expect(d.pct).toBe(Math.round((t.gastado / t.tope) * 100));
    }
  });

  it('el veredicto dice lo que te queda de la suma de tus topes', () => {
    const queda = momentos.ritmo.tope - momentos.ritmo.gastado;
    const cifra = momentos.ritmo.veredicto.segmentos.find((s) => s.accent)?.text ?? '';
    expect(cifra.replace(/\D/g, '')).toBe(String(queda));
  });

  it('el movimiento que llega es del mes, y el total de antes es el de la demo sin él', () => {
    expect(momentos.llega.fecha.startsWith(`${cifras.mes}-`)).toBe(true);
    expect(cifras.gastos - momentos.llega.monto).toBeGreaterThan(0);
  });

  it('lo que viene es después de hoy', () => {
    expect(momentos.loQueViene.length).toBeGreaterThan(0);
    for (const p of momentos.loQueViene) expect(p.fecha > cifras.hoy, p.nombre).toBe(true);
  });
});
