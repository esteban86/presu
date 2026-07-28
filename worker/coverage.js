/**
 * Cobertura de formatos: cruza el contrato de bancos (config.json) con los
 * contadores de aportes. Modulo PURO — sin fetch, sin KV. Se prueba con
 * `node --test coverage.test.js`.
 */

export function slug(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'x';
}

/** Mapea un slug escrito por el usuario a un id del contrato (por id o alias). */
export function resolveBankId(rawSlug, banks) {
  const list = Array.isArray(banks) ? banks : [];
  const s = String(rawSlug || '');
  for (const b of list) {
    if (b && b.id === s) return b.id;
    if (b && Array.isArray(b.aliases) && b.aliases.indexOf(s) !== -1) return b.id;
  }
  return null;
}

/**
 * @param banks  contrato: [{ id, name, aliases, products: { producto: 'ok'|'wanted' } }]
 * @param counts { [bankId]: { [producto]: number } }
 */
export function buildCoverage(banks, counts) {
  const list = Array.isArray(banks) ? banks : [];
  const c = counts && typeof counts === 'object' ? counts : {};
  const supported = [], missing = [];
  let ok = 0, total = 0;

  for (const b of list) {
    if (!b || !b.products || typeof b.products !== 'object') continue;
    const okProducts = [], wantedProducts = [];
    for (const producto of Object.keys(b.products)) {
      const estado = b.products[producto];
      if (estado !== 'ok' && estado !== 'wanted') continue;
      total++;
      const entry = { producto, contributions: ((c[b.id] || {})[producto]) || 0 };
      if (estado === 'ok') { ok++; okProducts.push(entry); } else { wantedProducts.push(entry); }
    }
    const head = { id: b.id, name: b.name || b.id, aliases: Array.isArray(b.aliases) ? b.aliases : [] };
    if (okProducts.length) supported.push({ ...head, products: okProducts });
    if (wantedProducts.length) missing.push({ ...head, products: wantedProducts });
  }

  return { formats: { ok, total }, supported, missing };
}
