import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slug, resolveBankId, buildCoverage } from './coverage.js';

const BANKS = [
  { id: 'bancolombia', name: 'Bancolombia', aliases: [], products: { cuenta: 'ok', tarjeta: 'ok' } },
  { id: 'nu', name: 'Nu', aliases: ['nubank'], products: { cuenta: 'wanted', tarjeta: 'ok' } },
  { id: 'rappicard', name: 'RappiCard', aliases: ['rappipay-rappicard'], products: { tarjeta: 'ok' } },
  { id: 'banco-de-bogota', name: 'Banco de Bogotá', aliases: [], products: { cuenta: 'wanted', tarjeta: 'wanted' } },
];

test('slug quita tildes y normaliza', () => {
  assert.equal(slug('Banco de Bogotá'), 'banco-de-bogota');
  assert.equal(slug('RappiPay (Rappicard)'), 'rappipay-rappicard');
  assert.equal(slug(''), 'x');
});

test('el id de cada banco es el slug de su name', () => {
  for (const b of BANKS) assert.equal(b.id, slug(b.name), b.name);
});

test('resolveBankId encuentra por id y por alias', () => {
  assert.equal(resolveBankId('nu', BANKS), 'nu');
  assert.equal(resolveBankId('nubank', BANKS), 'nu');
  assert.equal(resolveBankId('rappipay-rappicard', BANKS), 'rappicard');
});

test('resolveBankId devuelve null para un banco desconocido', () => {
  assert.equal(resolveBankId('banco-inventado', BANKS), null);
});

test('cuenta los formatos ok sobre el total declarado', () => {
  const c = buildCoverage(BANKS, {});
  assert.equal(c.formats.ok, 4);    // bancolombia cuenta+tarjeta, nu tarjeta, rappicard tarjeta
  assert.equal(c.formats.total, 7); // 2 + 2 + 1 + 2
});

test('un banco con productos ok y wanted aparece en las dos listas', () => {
  const c = buildCoverage(BANKS, {});
  const nuOk = c.supported.find((b) => b.id === 'nu');
  const nuFalta = c.missing.find((b) => b.id === 'nu');
  assert.deepEqual(nuOk.products.map((p) => p.producto), ['tarjeta']);
  assert.deepEqual(nuFalta.products.map((p) => p.producto), ['cuenta']);
});

test('un banco con un solo producto suma 1 al denominador', () => {
  const c = buildCoverage([BANKS[2]], {});
  assert.equal(c.formats.total, 1);
  assert.equal(c.formats.ok, 1);
});

test('atribuye los aportes al producto correcto', () => {
  const c = buildCoverage(BANKS, { nu: { tarjeta: 6 } });
  const nu = c.supported.find((b) => b.id === 'nu');
  assert.equal(nu.products[0].contributions, 6);
});

test('ignora contadores de bancos que no estan en el contrato', () => {
  const c = buildCoverage(BANKS, { 'banco-inventado': { cuenta: 99 } });
  const ids = c.supported.concat(c.missing).map((b) => b.id);
  assert.equal(ids.indexOf('banco-inventado'), -1, 'no debe inventar una entrada');
  // 5 entradas: bancolombia, rappicard y nu en supported; nu y banco-de-bogota en missing.
  // nu sale en las dos listas a proposito — tiene un producto ok y otro wanted.
  assert.equal(ids.length, 5);
});

test('los alias viajan en la cobertura para que el navegador pueda emparejar', () => {
  const c = buildCoverage(BANKS, {});
  const rc = c.supported.find((b) => b.id === 'rappicard');
  assert.deepEqual(rc.aliases, ['rappipay-rappicard']);
  const bc = c.supported.find((b) => b.id === 'bancolombia');
  assert.deepEqual(bc.aliases, []); // siempre presente, aunque vacio
});

test('un contrato vacio no revienta', () => {
  const c = buildCoverage([], {});
  assert.deepEqual(c, { formats: { ok: 0, total: 0 }, supported: [], missing: [] });
});

test('tolera banks nulo o mal formado', () => {
  assert.equal(buildCoverage(null, null).formats.total, 0);
  assert.equal(buildCoverage([{ id: 'x' }], {}).formats.total, 0);
});

test('un id que no es el slug del name se rescata por alias', () => {
  const malEscrito = [{ id: 'avvillas', name: 'AV Villas', aliases: [], products: { tarjeta: 'wanted' } }];
  const c = buildCoverage(malEscrito, {});
  const b = c.missing[0];
  assert.ok(b.aliases.indexOf('av-villas') !== -1, 'el slug del name debe viajar como alias');
  assert.equal(resolveBankId('av-villas', malEscrito.map((x, i) => ({ ...x, aliases: b.aliases }))), 'avvillas');
});

test('los alias declarados se normalizan con slug', () => {
  const banks = [{ id: 'nu', name: 'Nu', aliases: ['NuBank', 'Nu  Colombia'], products: { tarjeta: 'ok' } }];
  const c = buildCoverage(banks, {});
  assert.deepEqual(c.supported[0].aliases, ['nubank', 'nu-colombia']);
});
