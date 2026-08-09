/**
 * `/movil` es la página que se pone como **Marketing URL** de las fichas de App
 * Store y Google Play. Su regla es más estricta que la de las legales, y por eso
 * tiene test propio: **no nombra planes, no muestra precios, no enlaza a comprar y
 * no dice que la app de escritorio sea de pago.**
 *
 * No es pudor comercial. El 2026-07-31 Apple rechazó el envío de iOS por la guía
 * 3.1.1 citando «Plan Completo» — un término que NUNCA estuvo en el código del
 * móvil: salió de la portada de presu.io, que era la Marketing URL entonces. O sea
 * que lo enlazado desde la ficha entra en lo que revisan, y eso dejó de ser
 * hipótesis. Esta página existe para que la ficha apunte a algo limpio y la portada
 * pueda seguir vendiendo.
 *
 * Se revisa el HTML **construido**, no el fuente: lo que abre el revisor es la
 * página servida, y un layout que cambie por debajo dejaría el fuente inocente y la
 * página culpable. Corre `npm run build` antes.
 *
 * Si algún día se decide vender dentro de iOS, esto no se relaja: se implementa
 * StoreKit y se borra este test en el PR que lo haga.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RUTA = join(process.cwd(), 'dist', 'movil.html');

/** Texto visible: fuera estilos y scripts, que traen palabras que no lee nadie. */
function textoVisible(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ');
}

/**
 * Lo prohibido. Cada entrada dice QUÉ conducta evita, no solo qué palabra:
 * un test que solo cuida palabras se relaja sin que nadie note que cambió el motivo.
 */
const PROHIBIDO = [
  { re: /Plan\s+completo/i, porque: 'nombra el plan pago (el término exacto que citó Apple)' },
  { re: /Presu\s+Pro\b/i, porque: 'nombra el plan pago' },
  { re: /Presu\s+autom[áa]tico/i, porque: 'nombra el plan pago con su nombre nuevo' },
  { re: /\$\s?\d/, porque: 'muestra un precio' },
  { re: /\b\d{1,3}\.\d{3}\b/, porque: 'muestra una cifra en pesos' },
  { re: /suscri/i, porque: 'habla de suscripción' },
  { re: /\bcomprar\b|\bcompra\b/i, porque: 'invita a comprar' },
  { re: /desbloque/i, porque: 'sugiere que algo está bloqueado tras un pago' },
  { re: /licencia|clave de activaci[óo]n|c[óo]digo de activaci[óo]n/i, porque: 'habla de licencias o claves' },
  { re: /#planes/, porque: 'enlaza a la sección de precios' },
  { re: /#waitlist/, porque: 'enlaza a la captación' },
  { re: /\bprueba gratis\b|\btrial\b/i, porque: 'encuadra el producto como una prueba de suscripción' },
];

describe('/movil no vende nada (Marketing URL de las tiendas)', () => {
  const hayBuild = existsSync(RUTA);

  it('el build existe (si esto falla, corre `npm run build` primero)', () => {
    expect(hayBuild, 'falta dist/movil.html — este test revisa el HTML construido').toBe(true);
  });

  for (const { re, porque } of PROHIBIDO) {
    it(`no ${porque}`, () => {
      if (!hayBuild) return;
      expect(textoVisible(readFileSync(RUTA, 'utf8'))).not.toMatch(re);
    });
  }

  /**
   * El otro riesgo del expediente, y el que de verdad hunde envíos: que la app móvil
   * parezca inútil sin una compra externa (el perfil por el que rechazaron a Hey).
   * La página NO puede decir que el celular no sirve o que lo bueno está en el
   * computador — que es exactamente lo que dice hoy /descargar.
   */
  it('no dice que el celular no sirva ni que lo bueno esté en el computador', () => {
    if (!hayBuild) return;
    const t = textoVisible(readFileSync(RUTA, 'utf8'));
    for (const re of [/todav[íi]a no te sirve/i, /viene en camino/i, /solo (en|para) (Mac|Windows|computador)/i]) {
      expect(t, 'sugiere que la app móvil no es útil por sí sola').not.toMatch(re);
    }
  });
});

/**
 * La otra mitad. Sin esto, una página en blanco pasaría todos los tests de arriba
 * con nota perfecta — y la ficha apuntaría a la nada.
 */
describe('/movil sí cuenta lo que la app hace sola', () => {
  it('nombra las tres cosas que funcionan sin cuenta ni computador', () => {
    if (!existsSync(RUTA)) return;
    const t = textoVisible(readFileSync(RUTA, 'utf8'));
    expect(t, 'no menciona la foto del recibo').toMatch(/foto/i);
    expect(t, 'no menciona anotar el gasto').toMatch(/anot/i);
    expect(t, 'no menciona los presupuestos').toMatch(/presupuesto/i);
  });

  /**
   * Lo que NO se promete, y por qué está escrito acá: el dictado pierde el monto
   * cuando iOS transcribe los miles con coma («20,000») — medido el 2026-08-09 con
   * `parseExpenseText`. Prometerlo en la página que el revisor abre es invitarlo a
   * probar algo que falla. Vuelve cuando la serie del issue #518 lo arregle, y este
   * test se cambia en ESE PR.
   */
  it('todavía NO promete dictar el gasto', () => {
    if (!existsSync(RUTA)) return;
    const t = textoVisible(readFileSync(RUTA, 'utf8'));
    expect(t, 'promete dictado y el monto aún se pierde con la coma de iOS').not.toMatch(/dicta|hablando|por voz/i);
  });
});
