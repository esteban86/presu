/**
 * `/borrar-cuenta` es la URL que se declara en Google Play → Seguridad de los datos para
 * contestar «Sí» a «¿Los usuarios pueden pedir que se borren sus datos?». Play exige que
 * esa página nombre la app, dé los pasos para pedir el borrado y diga qué se borra y qué
 * se conserva. Si la página deja de decirlo, la declaración queda en falso.
 *
 * Y hereda la regla de `/soporte`: las tiendas la abren, así que no vende nada.
 *
 * Se revisa el HTML **construido**: lo que abre el revisor es la página servida. Corre
 * `npm run build` antes.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RUTA = join(process.cwd(), 'dist', 'borrar-cuenta.html');

function textoVisible(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
}

const PROHIBIDO = [
  { re: /Plan\s+completo/i, porque: 'nombra el plan pago (el término exacto que citó Apple)' },
  { re: /Presu\s+Pro\b/i, porque: 'nombra el plan pago' },
  { re: /\$\s?\d/, porque: 'muestra un precio' },
  { re: /suscri/i, porque: 'habla de suscripción' },
  { re: /#planes/, porque: 'enlaza a la sección de precios' },
];

describe('/borrar-cuenta dice lo que Google Play exige', () => {
  const hayBuild = existsSync(RUTA);

  it('el build existe (si esto falla, corre `npm run build` primero)', () => {
    expect(hayBuild, 'falta dist/borrar-cuenta.html — este test revisa el HTML construido').toBe(true);
  });

  it('nombra la app', () => {
    if (!hayBuild) return;
    expect(textoVisible(readFileSync(RUTA, 'utf8'))).toMatch(/Borrar tu cuenta de Presu/);
  });

  it('da los pasos desde el celular y desde el escritorio, con los nombres de la app', () => {
    if (!hayBuild) return;
    const t = textoVisible(readFileSync(RUTA, 'utf8'));
    expect(t, 'falta la pestaña del celular').toMatch(/«Más»/);
    expect(t, 'falta la fila que borra la cuenta').toMatch(/«Borrar mi cuenta de Presu»/);
    expect(t, 'falta la sección del escritorio').toMatch(/Ajustes › Cuenta y plan/);
    expect(t, 'falta el botón que confirma').toMatch(/«Borrar mi cuenta»/);
  });

  it('deja pedirlo por correo a quien ya no tiene la app, con un plazo', () => {
    if (!hayBuild) return;
    const html = readFileSync(RUTA, 'utf8');
    expect(html, 'no se puede escribir por correo').toMatch(/href="mailto:soporte@presu\.io/);
    expect(textoVisible(html), 'no dice en cuánto tiempo respondemos').toMatch(/15 días hábiles/);
  });

  it('dice qué se borra y qué se conserva', () => {
    if (!hayBuild) return;
    const t = textoVisible(readFileSync(RUTA, 'utf8'));
    expect(t).toMatch(/Qué se borra/);
    expect(t).toMatch(/Qué se conserva/);
    expect(t, 'no nombra el registro que se conserva').toMatch(/registro de autorizaciones/i);
  });

  for (const { re, porque } of PROHIBIDO) {
    it(`no ${porque}`, () => {
      if (!hayBuild) return;
      expect(textoVisible(readFileSync(RUTA, 'utf8'))).not.toMatch(re);
    });
  }
});
