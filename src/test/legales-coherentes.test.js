/**
 * Las páginas legales de la web tienen que decir lo mismo que la tabla de precios.
 *
 * **Por qué existe, con fecha.** Los documentos legales están escritos DOS VECES a mano:
 * el markdown (`TERMS.md` / `PRIVACY.md`, en el repo privado de la app) y estas páginas
 * Astro. Del lado del markdown sí hay red —`src/shared/__tests__/free-limits.test.ts` ata
 * cada función al plan que de verdad la trae—, pero de este lado no había nada. Por eso el
 * 2026-08-11 la web llevaba un mes diciendo «Sincronización entre tus dispositivos (parte
 * de Pro)» y «Presu IA es parte del plan Pro» cuando el código ya decía lo contrario, y se
 * descubrió de casualidad, no por una falla.
 *
 * **Y no es un problema de prolijidad.** Apple rechazó la app de iOS dos veces —31-jul y
 * 6-ago de 2026, guía 3.1.1— y las dos leyendo lo que decíamos AFUERA, no el código. La
 * Marketing URL de la ficha apunta a esta web. Una página legal que contradiga a la tabla
 * de precios es material de rechazo.
 *
 * Este test NO compara contra el markdown del otro repo: son repos distintos y no hay
 * artefacto compartido. Lo que hace es cerrar la contradicción INTERNA, que es justo lo
 * que un revisor (o un usuario) puede ver de un vistazo. Unificar las dos copias en una
 * sola fuente sigue pendiente.
 *
 * Revisa el HTML CONSTRUIDO, como los otros guardias de esta carpeta: lo que Apple abre es
 * la página servida. Corre `npm run build` antes.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function pagina(nombre) {
  const p = join('dist', `${nombre}.html`);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

const index = pagina('index');
const terminos = pagina('terminos');
const privacidad = pagina('privacidad');

/**
 * Lo que nombra al CELULAR como aparato aparte.
 *
 * Ojo con no meter «sincroniz» a secas: «sincronización con tu correo» es la función que
 * SÍ es de pago (`gmail_sync`), y confundirlas haría fallar el test contra una web
 * correcta. Lo que se vigila es el celular, no la palabra sincronizar.
 */
const CELULAR = /celular|móvil|movil|multi-?dispositivo|entre (tus )?dispositivos/i;

/** Texto plano de un fragmento de HTML. */
const plano = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/** Los `<li>` de la lista de planes de `terminos`, uno por plan. */
function vinetaDePlan(plan) {
  if (!terminos) return null;
  const li = [...terminos.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => plano(m[1]));
  return li.find((t) => new RegExp(`plan ${plan}\\b`, 'i').test(t)) ?? null;
}

/** Los beneficios de una tarjeta de plan de la portada (ver celular-gratis.test.js). */
function beneficiosDe(claseTarjeta) {
  if (!index) return null;
  const i = index.indexOf(`class="${claseTarjeta}"`);
  if (i < 0) return null;
  const ul = index.indexOf('class="plan-list"', i);
  if (ul < 0) return null;
  const fin = index.indexOf('</ul>', ul);
  if (fin < 0) return null;
  return [...index.slice(ul, fin).matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => plano(m[1]));
}

describe('las páginas legales no contradicen a la tabla de precios', () => {
  it('el build existe (si esto falla, corre `npm run build` primero)', () => {
    expect(Boolean(index && terminos && privacidad), 'faltan páginas en dist/').toBe(true);
  });

  it('encuentra las viñetas de plan en terminos (si falla, cambió el marcado)', () => {
    expect(vinetaDePlan('gratis'), 'terminos ya no describe el plan gratis').toBeTruthy();
    expect(vinetaDePlan('Pro'), 'terminos ya no describe el plan Pro').toBeTruthy();
  });

  /**
   * El corazón del test: la portada y los términos tienen que poner el celular en el MISMO
   * plan. Si alguien lo mueve en un lado y olvida el otro, esto se cae — que es exactamente
   * lo que no pasó en julio.
   */
  it('la portada y los términos ponen el celular en el mismo plan', () => {
    const enGratisPortada = beneficiosDe('plan reveal').some((b) => CELULAR.test(b));
    const enPagoPortada = beneficiosDe('plan plan--pro reveal').some((b) => CELULAR.test(b));
    const enGratisTerminos = CELULAR.test(vinetaDePlan('gratis'));
    const enPagoTerminos = CELULAR.test(vinetaDePlan('Pro'));

    expect(
      { portada: enGratisPortada, terminos: enGratisTerminos },
      'la portada y los términos no coinciden en si el celular es gratis',
    ).toEqual({ portada: enGratisPortada, terminos: enGratisPortada });

    expect(
      { portada: enPagoPortada, terminos: enPagoTerminos },
      'la portada y los términos no coinciden en si el celular es de pago',
    ).toEqual({ portada: enPagoPortada, terminos: enPagoPortada });
  });

  /**
   * `privacidad` describe la sincronización en su propia sección, con un encabezado que dice
   * si es gratis o de pago. Hasta el 2026-08-11 decía «(opcional, parte de Pro)».
   */
  it('privacidad no ata la sincronización entre dispositivos a un plan de pago', () => {
    const t = plano(privacidad);
    for (const re of [/sincronizaci[óo]n[^.]{0,60}\(Pro\)/i, /Sincronizaci[óo]n entre tus dispositivos \([^)]*Pro[^)]*\)/i]) {
      expect(re.test(t), `privacidad volvió a atar la sincronización a Pro: ${re}`).toBe(false);
    }
  });

  /**
   * La otra afirmación que estuvo mal casi un mes: decía que el plan gratis usa un modelo
   * LOCAL, cuando el proveedor por defecto es la nube. No era una imprecisión de copy — es
   * una promesa de manejo de datos que no se cumplía (issue presu-desktop#509).
   */
  it('privacidad no dice que Presu IA sea solo del plan de pago', () => {
    const t = plano(privacidad);
    expect(
      /Presu IA[^.]{0,80}parte del plan Pro/i.test(t),
      'privacidad volvió a decir que Presu IA es solo de Pro: el plan gratis también la usa, y por la nube',
    ).toBe(false);
    expect(
      /Presu IA[^.]{0,120}todos los planes/i.test(t),
      'privacidad dejó de decir que Presu IA está en todos los planes',
    ).toBe(true);
  });

  /**
   * Divulgación que exige la Ley 1581: de los contadores por dispositivo derivamos totales
   * agregados. Es fácil de borrar sin querer al reescribir la viñeta, y borrarla convierte
   * un tratamiento divulgado en uno oculto.
   */
  it('privacidad divulga los totales agregados de uso de la IA', () => {
    expect(
      /totales agregados/i.test(plano(privacidad)),
      'desapareció la divulgación de los totales agregados de uso de IA',
    ).toBe(true);
  });

  /**
   * Un documento publicado que cambia de fondo y conserva su fecha vieja se lee como que no
   * cambió. Las dos páginas venían de julio con el contenido de agosto.
   */
  it('las dos páginas legales declaran la misma fecha de actualización', () => {
    const fecha = (h) => (plano(h).match(/Última actualización:\s*([^<]{5,40}?)\s{2,}|Última actualización:\s*([\d]+ de \w+ de \d{4})/) || [])
      .slice(1).find(Boolean);
    const fT = fecha(terminos);
    const fP = fecha(privacidad);
    expect(fT, 'terminos no declara fecha de actualización').toBeTruthy();
    expect(fP, 'privacidad no declara fecha de actualización').toBeTruthy();
    expect(fP, 'las dos legales declaran fechas distintas: una se actualizó y la otra no').toBe(fT);
  });
});
