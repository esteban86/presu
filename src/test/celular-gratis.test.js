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
 * Desde la portada que vende (#39, CA8 y CA15) la portada no habla de pagos ni de planes:
 * está a un clic de /movil, la Marketing URL. Así no puede atar el celular a un pago. Lo
 * que este guardia cuida ahora es eso: ni tarjetas de plan, ni una palabra de cobro.
 */
const PLATA = /\b(pago|pagar|precio|tarifa|pionero|suscripci)/i;

function textoVisible() {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
}

describe('la portada no ata el celular a un pago (App Store 3.1.1)', () => {
  it('el build existe (si esto falla, corre `npm run build` primero)', () => {
    expect(hayBuild, `falta ${INDEX} — este test revisa el HTML construido`).toBe(true);
  });

  it('la portada no tiene tarjetas de plan (CA8)', () => {
    expect(html).not.toMatch(/class="plan( |")/);
    expect(html).not.toMatch(/class="plan plan--pro/);
  });

  it('ninguna frase de la portada habla de cobrar (CA15)', () => {
    expect(textoVisible().match(PLATA)?.[0] ?? null).toBeNull();
  });

  it('la portada sí nombra el celular (si no, este guardia no mide nada)', () => {
    expect(textoVisible()).toMatch(CELULAR);
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
