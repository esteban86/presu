/**
 * `/soporte` es la página que se pone como **Support URL** de las fichas de App Store
 * y Google Play. Hereda la regla de `/movil` —no nombra planes, no muestra precios, no
 * enlaza a comprar— porque hasta ahora ese campo apuntaba a la portada, que sí los
 * muestra: la misma exposición que motivó el rechazo 3.1.1 del 2026-07-31.
 *
 * Y tiene una obligación EXTRA que `/movil` no tiene: **servir de verdad para pedir
 * ayuda**. Apple revisa que el enlace haga lo que dice, y una página de soporte sin
 * forma de contactar a nadie es peor que no tenerla — se lee como fachada.
 *
 * Se revisa el HTML **construido**, no el fuente: lo que abre el revisor es la página
 * servida. Corre `npm run build` antes.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RUTA = join(process.cwd(), 'dist', 'soporte.html');

function textoVisible(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ');
}

const PROHIBIDO = [
  { re: /Plan\s+completo/i, porque: 'nombra el plan pago (el término exacto que citó Apple)' },
  { re: /Presu\s+Pro\b/i, porque: 'nombra el plan pago' },
  { re: /Presu\s+autom[áa]tico/i, porque: 'nombra el plan pago con su nombre nuevo' },
  { re: /\$\s?\d/, porque: 'muestra un precio' },
  { re: /suscri/i, porque: 'habla de suscripción' },
  { re: /\bcomprar\b|\bcompra\b/i, porque: 'invita a comprar' },
  { re: /desbloque/i, porque: 'sugiere que algo está bloqueado tras un pago' },
  { re: /#planes/, porque: 'enlaza a la sección de precios' },
  { re: /#waitlist/, porque: 'enlaza a la captación' },
];

describe('/soporte no vende nada (Support URL de las tiendas)', () => {
  const hayBuild = existsSync(RUTA);

  it('el build existe (si esto falla, corre `npm run build` primero)', () => {
    expect(hayBuild, 'falta dist/soporte.html — este test revisa el HTML construido').toBe(true);
  });

  for (const { re, porque } of PROHIBIDO) {
    it(`no ${porque}`, () => {
      if (!hayBuild) return;
      expect(textoVisible(readFileSync(RUTA, 'utf8'))).not.toMatch(re);
    });
  }
});

/**
 * La otra mitad, y acá pesa más que en /movil: una página de soporte que no deja
 * contactar a nadie pasaría todos los tests de arriba con nota perfecta y sería una
 * fachada. Apple la abriría, no encontraría cómo pedir ayuda, y con razón lo objetaría.
 */
describe('/soporte sí sirve para pedir ayuda', () => {
  it('ofrece los dos canales reales, y son enlaces de verdad', () => {
    if (!existsSync(RUTA)) return;
    const html = readFileSync(RUTA, 'utf8');
    expect(html, 'no se puede escribir por correo').toMatch(/href="mailto:soporte@presu\.io"/);
    expect(html, 'no se puede escribir por WhatsApp').toMatch(/href="https:\/\/wa\.me\/573001303558"/);
  });

  /**
   * Los canales tienen que ser los MISMOS que ya están publicados en otras páginas.
   * Un correo de soporte distinto por página es una promesa que nadie atiende.
   */
  it('el correo coincide con el que ya publican las otras páginas', () => {
    for (const p of ['aviso-privacidad', '404']) {
      const f = join(process.cwd(), 'dist', `${p}.html`);
      if (!existsSync(f)) continue;
      expect(readFileSync(f, 'utf8'), `${p} publica otro correo de soporte`).toMatch(/soporte@presu\.io/);
    }
  });

  it('responde las dudas que traen a alguien acá', () => {
    if (!existsSync(RUTA)) return;
    const t = textoVisible(readFileSync(RUTA, 'utf8'));
    expect(t, 'no dice qué hace la app del celular').toMatch(/celular/i);
    expect(t, 'no dice qué bancos lee').toMatch(/Bancolombia/);
    expect(t, 'no explica el PDF con contraseña').toMatch(/contraseña|cédula/i);
    expect(t, 'no dice cómo borrar los datos').toMatch(/borrar/i);
  });

  /** Regla de la casa: no pedir datos sensibles por chat (docs/SOPORTE-WHATSAPP.md). */
  it('advierte que no manden cédula ni números de cuenta', () => {
    if (!existsSync(RUTA)) return;
    expect(textoVisible(readFileSync(RUTA, 'utf8'))).toMatch(/no nos mandes/i);
  });
});
