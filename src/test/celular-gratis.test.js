/**
 * El celular NO puede aparecer como parte del plan de pago.
 *
 * **Es una restricción de la App Store, no una preferencia de copy** — y es la que
 * más caro ha salido, porque las dos veces Apple nos leyó la WEB y no el código:
 *
 * - 2026-07-31, guía 3.1.1: citó «Plan Completo», un término que nunca estuvo en el
 *   código del móvil. Salió de esta web, que es la Marketing URL de la ficha.
 * - 2026-08-06: sostuvo el rechazo citando la descripción de la ficha, donde el plan
 *   pago decía incluir «la sincronización entre tu celular y tu computador».
 *
 * Desde el 2026-08-11 sincronizar es GRATIS de verdad: el relay dejó de exigir plan
 * (`proxy/src/sync.ts`, PR #646 — un aparato desconocido responde `403 no_account`,
 * ya no `402 pro_required`) y el móvil dejó de preguntar si este equipo compró algo
 * (PR #647). Este test existe para que la web no vuelva a decir lo contrario.
 *
 * Y el riesgo es real aunque la Marketing URL apunte a /movil: desde /movil la
 * portada queda a UN clic. Si un revisor lo da mientras nuestro mensaje en el
 * Resolution Center dice «sincronizar es gratis», encuentra esta página cobrándolo
 * $19.990 — y eso ya no parece un desacuerdo de interpretación.
 *
 * Se revisa el HTML CONSTRUIDO, como los otros tres guardias de esta carpeta: lo que
 * Apple abre es la página servida. Corre `npm run build` antes.
 *
 * Si algún día se decide cobrar el celular otra vez, esto no se relaja a mano: se
 * implementa StoreKit y se borra este test en el PR que lo haga.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const INDEX = join('dist', 'index.html');
const hayBuild = existsSync(INDEX);
const html = hayBuild ? readFileSync(INDEX, 'utf8') : '';

/** Lo que nombra al celular, en cualquiera de sus formas. */
const CELULAR = /celular|móvil|movil|sincroniz/i;

/** Las clases exactas de cada tarjeta, tal como salen en el HTML construido. */
const GRATIS = 'plan reveal';
const PAGO = 'plan plan--pro reveal';

/**
 * Saca los beneficios (uno por `<li>`) de una de las dos tarjetas de plan.
 *
 * Ancla en el atributo `class="…"` COMPLETO y no en el nombre suelto de la clase.
 * Astro incrusta el CSS en la misma página, así que buscar `plan--pro` a secas cae
 * primero en la regla `.plan--pro{…}` del `<style>` y de ahí el siguiente
 * `plan-list` es el del plan GRATIS — o sea que el guardia terminaba revisando la
 * tarjeta equivocada. Pasó al escribirlo: el test se cayó contra una web correcta.
 *
 * Devuelve null si no encuentra la estructura, y el test lo trata como FALLA, no
 * como "no aplica": un rediseño que renombre las clases dejaría este guardia
 * pasando en vacío, que es la forma clásica de que un test deje de proteger.
 */
function beneficiosDe(claseTarjeta) {
  const i = html.indexOf(`class="${claseTarjeta}"`);
  if (i < 0) return null;
  const ul = html.indexOf('class="plan-list"', i);
  if (ul < 0) return null;
  const fin = html.indexOf('</ul>', ul);
  if (fin < 0) return null;
  return [...html.slice(ul, fin).matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) =>
    m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
  );
}

describe('el celular es gratis, y la portada tiene que decirlo (App Store 3.1.1)', () => {
  it('el build existe (si esto falla, corre `npm run build` primero)', () => {
    expect(hayBuild, `falta ${INDEX} — este test revisa el HTML construido`).toBe(true);
  });

  it('encuentra las dos tarjetas de plan, con beneficios (si falla, cambió el marcado)', () => {
    expect(beneficiosDe(GRATIS)?.length, 'no encontré beneficios en la tarjeta del plan gratis').toBeGreaterThan(0);
    expect(beneficiosDe(PAGO)?.length, 'no encontré beneficios en la tarjeta del plan pago').toBeGreaterThan(0);
  });

  it('el plan DE PAGO no ofrece el celular ni la sincronización', () => {
    const culpables = beneficiosDe(PAGO).filter((b) => CELULAR.test(b));
    expect(
      culpables,
      'la tarjeta de pago volvió a listar el celular: eso es lo que Apple rechazó dos veces',
    ).toEqual([]);
  });

  it('el plan GRATIS sí ofrece el celular', () => {
    expect(
      beneficiosDe(GRATIS).filter((b) => CELULAR.test(b)).length,
      'el celular desapareció del plan gratis: o se movió al pago, o se borró sin querer',
    ).toBeGreaterThan(0);
  });

  /**
   * Los datos estructurados son los que leen los buscadores —y cualquiera que mire
   * el fuente—. Se les olvida más fácil que al texto visible porque no se ven en la
   * página, y hasta el 2026-08-11 decían «la sincronización (Pro)» con esas palabras.
   */
  it('los datos estructurados no atan el celular a un plan de pago', () => {
    const bloques = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)]
      .map((m) => m[1]);
    expect(bloques.length, 'no encontré el JSON-LD de la portada').toBeGreaterThan(0);
    const texto = bloques.join(' ');
    const frases = [/sincronizaci[óo]n \(Pro\)/i, /celular.{0,40}plan Pro/i, /plan Pro.{0,40}celular/i];
    for (const re of frases) {
      expect(re.test(texto), `el JSON-LD volvió a atar el celular al plan pago: ${re}`).toBe(false);
    }
  });
});
