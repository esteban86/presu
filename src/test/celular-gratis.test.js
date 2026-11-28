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

/**
 * Desde la portada que vende (#39, CA8) no hay tarjetas de plan ni precios. Lo que
 * este guardia sigue cuidando es lo mismo de antes, con otra forma: la única frase
 * que habla de pago (la respuesta de «¿Tiene costo?», `data-afirma="faq-costo"`)
 * dice que el celular es gratis y ata el pago al correo del computador, nunca al
 * celular ni a la sincronización.
 */
function respuestaDeCosto() {
  const m = html.match(/<p[^>]*data-afirma="faq-costo"[^>]*>([\s\S]*?)<\/p>/);
  return m ? m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : null;
}

describe('el celular es gratis, y la portada tiene que decirlo (App Store 3.1.1)', () => {
  it('el build existe (si esto falla, corre `npm run build` primero)', () => {
    expect(hayBuild, `falta ${INDEX} — este test revisa el HTML construido`).toBe(true);
  });

  it('la portada no tiene tarjetas de plan (CA8)', () => {
    expect(html).not.toMatch(/class="plan( |")/);
    expect(html).not.toMatch(/class="plan plan--pro/);
  });

  it('encuentra la respuesta de «¿Tiene costo?» (si falla, cambió el marcado)', () => {
    expect(respuestaDeCosto(), 'no encontré data-afirma="faq-costo"').toBeTruthy();
  });

  it('dice que el celular es gratis', () => {
    const r = respuestaDeCosto() ?? '';
    const frase = r.split(/(?<=\.)\s/).find((f) => CELULAR.test(f)) ?? '';
    expect(frase, 'la respuesta de costo ya no nombra el celular').not.toBe('');
    expect(frase).toMatch(/gratis|también/i);
  });

  it('la frase del pago no nombra el celular ni la sincronización', () => {
    const r = respuestaDeCosto() ?? '';
    const delPago = r.split(/(?<=\.)\s/).filter((f) => /pago|pagas/i.test(f));
    expect(delPago.length, 'la respuesta de costo ya no dice qué es de pago').toBeGreaterThan(0);
    for (const f of delPago) expect(f, 'el pago volvió a atarse al celular').not.toMatch(CELULAR);
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
