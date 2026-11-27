import { describe, it, expect } from 'vitest';
import { altasPorSemana } from './altas-por-semana.js';

// Bogotá = UTC−5 sin horario de verano.
const bogota = (y, m, d, h = 0, mi = 0) => Date.UTC(y, m - 1, d, h + 5, mi);
// Viernes 2026-11-27 12:00 Bogotá; su semana empieza el lunes 2026-11-23.
const AHORA = bogota(2026, 11, 27, 12);

describe('altasPorSemana', () => {
  it('cuenta por semana, en orden cronológico, con semanas vacías en 0', () => {
    const r = altasPorSemana(
      [{ ts: bogota(2026, 11, 24, 9) }, { ts: bogota(2026, 11, 26, 9) }, { ts: bogota(2026, 11, 10, 9) }],
      AHORA, 4,
    );
    expect(r.semanas).toEqual([
      { inicio: '2026-11-02', altas: 0 },
      { inicio: '2026-11-09', altas: 1 },
      { inicio: '2026-11-16', altas: 0 },
      { inicio: '2026-11-23', altas: 2 },
    ]);
    expect(r.sinFecha).toBe(0);
  });

  it('un registro sin ts (o con ts no numérico) va solo a sinFecha', () => {
    const r = altasPorSemana([{}, { ts: 'x' }, { ts: NaN }, { ts: bogota(2026, 11, 24) }], AHORA, 2);
    expect(r.sinFecha).toBe(3);
    expect(r.semanas.map((s) => s.altas)).toEqual([0, 1]);
  });

  it('el domingo 23:30 de Bogotá cae en esa semana, no en la siguiente', () => {
    // domingo 2026-11-22 23:30 Bogotá = lunes 04:30 UTC
    const r = altasPorSemana([{ ts: bogota(2026, 11, 22, 23, 30) }], AHORA, 2);
    expect(r.semanas).toEqual([
      { inicio: '2026-11-16', altas: 1 },
      { inicio: '2026-11-23', altas: 0 },
    ]);
  });

  it('el lunes 00:00 de Bogotá (05:00 UTC) abre la semana nueva', () => {
    const r = altasPorSemana([{ ts: bogota(2026, 11, 23, 0, 0) }], AHORA, 2);
    expect(r.semanas).toEqual([
      { inicio: '2026-11-16', altas: 0 },
      { inicio: '2026-11-23', altas: 1 },
    ]);
  });

  it('ignora lo anterior a la ventana y lo posterior a ahora no rompe', () => {
    const r = altasPorSemana([{ ts: bogota(2026, 1, 5) }], AHORA, 2);
    expect(r.semanas.map((s) => s.altas)).toEqual([0, 0]);
    expect(r.sinFecha).toBe(0);
  });
});
