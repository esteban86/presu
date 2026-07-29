import { describe, it, expect } from 'vitest';
import { slug, resolveBankId, buildCoverage, normalizeBanks } from './coverage.js';

const BANKS = [
  { id: 'bancolombia', name: 'Bancolombia', aliases: [], products: { cuenta: 'ok', tarjeta: 'ok' } },
  { id: 'nu', name: 'Nu', aliases: ['nubank'], products: { cuenta: 'wanted', tarjeta: 'ok' } },
  { id: 'rappicard', name: 'RappiCard', aliases: ['rappipay-rappicard'], products: { tarjeta: 'ok' } },
  { id: 'banco-de-bogota', name: 'Banco de Bogotá', aliases: [], products: { cuenta: 'wanted', tarjeta: 'wanted' } },
];

describe('coverage', () => {
  it('slug quita tildes y normaliza', () => {
    expect(slug('Banco de Bogotá')).toBe('banco-de-bogota');
    expect(slug('RappiPay (Rappicard)')).toBe('rappipay-rappicard');
    expect(slug('')).toBe('x');
  });

  it('el id de cada banco es el slug de su name', () => {
    for (const b of BANKS) expect(b.id).toBe(slug(b.name));
  });

  it('resolveBankId encuentra por id y por alias', () => {
    expect(resolveBankId('nu', BANKS)).toBe('nu');
    expect(resolveBankId('nubank', BANKS)).toBe('nu');
    expect(resolveBankId('rappipay-rappicard', BANKS)).toBe('rappicard');
  });

  it('resolveBankId devuelve null para un banco desconocido', () => {
    expect(resolveBankId('banco-inventado', BANKS)).toBe(null);
  });

  it('cuenta los formatos ok sobre el total declarado', () => {
    const c = buildCoverage(BANKS, {});
    expect(c.formats.ok).toBe(4);    // bancolombia cuenta+tarjeta, nu tarjeta, rappicard tarjeta
    expect(c.formats.total).toBe(7); // 2 + 2 + 1 + 2
  });

  it('un banco con productos ok y wanted aparece en las dos listas', () => {
    const c = buildCoverage(BANKS, {});
    const nuOk = c.supported.find((b) => b.id === 'nu');
    const nuFalta = c.missing.find((b) => b.id === 'nu');
    expect(nuOk.products.map((p) => p.producto)).toEqual(['tarjeta']);
    expect(nuFalta.products.map((p) => p.producto)).toEqual(['cuenta']);
  });

  it('un banco con un solo producto suma 1 al denominador', () => {
    const c = buildCoverage([BANKS[2]], {});
    expect(c.formats.total).toBe(1);
    expect(c.formats.ok).toBe(1);
  });

  it('atribuye los aportes al producto correcto', () => {
    const c = buildCoverage(BANKS, { nu: { tarjeta: 6 } });
    const nu = c.supported.find((b) => b.id === 'nu');
    expect(nu.products[0].contributions).toBe(6);
  });

  it('ignora contadores de bancos que no estan en el contrato', () => {
    const c = buildCoverage(BANKS, { 'banco-inventado': { cuenta: 99 } });
    const ids = c.supported.concat(c.missing).map((b) => b.id);
    expect(ids.indexOf('banco-inventado')).toBe(-1); // no debe inventar una entrada
    // 5 entradas: bancolombia, rappicard y nu en supported; nu y banco-de-bogota en missing.
    // nu sale en las dos listas a proposito — tiene un producto ok y otro wanted.
    expect(ids.length).toBe(5);
  });

  it('los alias viajan en la cobertura para que el navegador pueda emparejar', () => {
    const c = buildCoverage(BANKS, {});
    const rc = c.supported.find((b) => b.id === 'rappicard');
    expect(rc.aliases).toEqual(['rappipay-rappicard']);
    const bc = c.supported.find((b) => b.id === 'bancolombia');
    expect(bc.aliases).toEqual([]); // siempre presente, aunque vacio
  });

  it('un contrato vacio no revienta', () => {
    const c = buildCoverage([], {});
    expect(c).toEqual({ formats: { ok: 0, total: 0 }, supported: [], missing: [] });
  });

  it('tolera banks nulo o mal formado', () => {
    expect(buildCoverage(null, null).formats.total).toBe(0);
    expect(buildCoverage([{ id: 'x' }], {}).formats.total).toBe(0);
  });

  it('un id que no es el slug del name se rescata por alias', () => {
    const malEscrito = [{ id: 'avvillas', name: 'AV Villas', aliases: [], products: { tarjeta: 'wanted' } }];
    const c = buildCoverage(malEscrito, {});
    const b = c.missing[0];
    expect(b.aliases.indexOf('av-villas') !== -1).toBe(true); // el slug del name debe viajar como alias
    // resolveBankId debe rescatar sobre el contrato normalizado, que es lo que ve el Worker
    expect(resolveBankId('av-villas', normalizeBanks(malEscrito))).toBe('avvillas');
  });

  it('normalizeBanks es idempotente', () => {
    const once = normalizeBanks([{ id: 'avvillas', name: 'AV Villas', aliases: ['AvVillas'], products: { tarjeta: 'wanted' } }]);
    expect(normalizeBanks(once)).toEqual(once);
  });

  it('los alias declarados se normalizan con slug', () => {
    const banks = [{ id: 'nu', name: 'Nu', aliases: ['NuBank', 'Nu  Colombia'], products: { tarjeta: 'ok' } }];
    const c = buildCoverage(banks, {});
    expect(c.supported[0].aliases).toEqual(['nubank', 'nu-colombia']);
  });
});
