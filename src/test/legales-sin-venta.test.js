/**
 * Las páginas legales NO pueden llevar nada que lleve a comprar.
 *
 * **Es una restricción de la App Store, no una preferencia de diseño.** El
 * 2026-07-31 Apple rechazó la app de iOS por la guía 3.1.1 citando el nombre de un
 * plan — y ese nombre NO salía del código del móvil: salió de ESTA web, que es la
 * Marketing URL de la ficha.
 *
 * La app enlaza «Política de privacidad» y «Términos» a estas páginas. Con el menú
 * de siempre, desde dentro de la app se llegaba a los precios en un clic: ese es el
 * puente que la guía objeta. Por eso estas cuatro piden `sinVenta` en su `<Base>`.
 *
 * Se revisa el HTML CONSTRUIDO y no el código fuente: lo que Apple abre es la página
 * servida, y un layout que cambie por debajo dejaría el fuente inocente y la página
 * culpable. Corre `npm run build` antes.
 *
 * Si algún día se decide vender dentro de iOS, esto no se relaja: se implementa
 * StoreKit y se borra este test en el PR que lo haga.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Las que abre la app, más las dos a las que ellas enlazan en su pie. */
const LEGALES = ['privacidad', 'terminos', 'politica-tratamiento-datos', 'aviso-privacidad'];

/**
 * Caminos a comprar. Prohibidos en TODAS las legales, sin excepción: son la
 * conducta que la guía 3.1.1 objeta — que desde la app se llegue a comprar por fuera.
 */
const CAMINOS_A_COMPRAR = [
  { re: /#planes/, porque: 'enlaza a la sección de precios' },
  { re: /#waitlist/, porque: 'enlaza a la captación' },
  { re: /Únete a la lista/i, porque: 'invita a registrarse' },
];

/**
 * Nombres de plan. Prohibidos donde no tienen nada que hacer.
 *
 * ⚠️ `terminos` está EXCEPTUADO a propósito, y es una decisión discutible que
 * conviene revisar antes de cada envío a la App Store: su cláusula 5 describe el
 * beneficio de pionero ("tres meses de Presu Pro sin costo y sin tarjeta"). Unos
 * términos tienen que decir QUÉ se ofrece; volverlos vagos para esquivar a un
 * revisor cuesta más de lo que ahorra, y ahí no hay precio, ni enlace, ni botón —
 * es descripción, no venta. Si un rechazo futuro cita ese texto, la respuesta es
 * quitar la excepción de aquí, no discutir con el revisor.
 */
const NOMBRES_DE_PLAN = [
  { re: /Plan\s+completo/i, porque: 'nombra el plan pago (el término exacto que citó Apple)' },
  { re: /Presu\s+Pro\b/i, porque: 'nombra el plan pago' },
];
const EXCEPTUADAS_DE_NOMBRES = new Set(['terminos']);

const rutaDist = (nombre) => join(process.cwd(), 'dist', `${nombre}.html`);

describe('las páginas legales no llevan a comprar (App Store 3.1.1)', () => {
  const hayBuild = LEGALES.every((n) => existsSync(rutaDist(n)));

  it('el build existe (si esto falla, corre `npm run build` primero)', () => {
    expect(hayBuild, 'faltan páginas en dist/ — este test revisa el HTML construido').toBe(true);
  });

  for (const nombre of LEGALES) {
    const reglas = [
      ...CAMINOS_A_COMPRAR,
      ...(EXCEPTUADAS_DE_NOMBRES.has(nombre) ? [] : NOMBRES_DE_PLAN),
    ];
    for (const { re, porque } of reglas) {
      it(`${nombre}.html no ${porque}`, () => {
        if (!hayBuild) return;
        expect(readFileSync(rutaDist(nombre), 'utf8')).not.toMatch(re);
      });
    }
  }

  it('los términos siguen SIN camino a comprar, aunque nombren el plan', () => {
    if (!hayBuild) return;
    const html = readFileSync(rutaDist('terminos'), 'utf8');
    for (const { re, porque } of CAMINOS_A_COMPRAR) {
      expect(html, `los términos ${porque}`).not.toMatch(re);
    }
  });
});

/**
 * La otra mitad, y no es adorno: si `sinVenta` se rompiera y escondiera el menú en
 * TODAS partes, los tests de arriba pasarían y la web perdería su portada.
 */
describe('la portada conserva lo suyo', () => {
  it('sigue teniendo precios y captación', () => {
    const p = join(process.cwd(), 'dist', 'index.html');
    if (!existsSync(p)) return;
    const html = readFileSync(p, 'utf8');
    expect(html).toMatch(/#planes/);
    expect(html).toMatch(/#waitlist/);
  });
});
