import { describe, it, expect } from 'vitest';
import { BETA, OLA, target, parts } from './countdown.js';

describe('countdown fechas', () => {
  it('BETA es 2026-06-30 4pm hora Colombia', () => {
    expect(BETA).toBe(Date.parse('2026-06-30T16:00:00-05:00'));
  });
  it('OLA es 2026-07-15 4pm hora Colombia', () => {
    expect(OLA).toBe(Date.parse('2026-07-15T16:00:00-05:00'));
  });
});

describe('target', () => {
  it('antes de BETA, apunta a BETA', () => {
    expect(target(BETA - 1000)).toBe(BETA);
  });
  it('entre BETA y OLA, apunta a OLA (la beta ya cerró)', () => {
    expect(target(BETA + 1000)).toBe(OLA);
  });
  it('en o después de OLA, sigue apuntando a OLA', () => {
    expect(target(OLA)).toBe(OLA);
    expect(target(OLA + 1000)).toBe(OLA);
  });
});

describe('parts', () => {
  it('descompone un diff en ms en días/horas/min/seg', () => {
    expect(parts(90061000)).toEqual({ d: 1, h: 1, m: 1, s: 1 });
  });
  it('0ms es todo ceros', () => {
    expect(parts(0)).toEqual({ d: 0, h: 0, m: 0, s: 0 });
  });
  it('diffs negativos no dan valores negativos (clamp a 0)', () => {
    expect(parts(-5000)).toEqual({ d: 0, h: 0, m: 0, s: 0 });
  });
});
