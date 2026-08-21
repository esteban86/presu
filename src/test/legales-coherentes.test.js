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
   * lo que NO pasó en julio, y por eso la web quedó un mes diciendo lo contrario del código.
   *
   * OJO CON EL ALCANCE: esto vigila que CONCUERDEN, no en qué plan está. Si alguien mueve el
   * celular a pago en los dos lados a la vez, este test pasa. Lo específico —que el celular
   * esté en la columna gratis— lo fija `celular-gratis.test.js`. Los dos juntos cierran; este
   * solo, no. Si algún día se borra aquel, esto deja de proteger lo que parece proteger.
   */
  it('la portada y los términos ponen el celular en el mismo plan', () => {
    const enGratisPortada = beneficiosDe('plan reveal').some((b) => CELULAR.test(b));
    const enPagoPortada = beneficiosDe('plan plan--pro reveal').some((b) => CELULAR.test(b));

    expect(
      CELULAR.test(vinetaDePlan('gratis')),
      `la portada ${enGratisPortada ? 'SÍ' : 'NO'} pone el celular en el plan gratis, y los términos dicen lo contrario`,
    ).toBe(enGratisPortada);

    expect(
      CELULAR.test(vinetaDePlan('Pro')),
      `la portada ${enPagoPortada ? 'SÍ' : 'NO'} pone el celular en el plan de pago, y los términos dicen lo contrario`,
    ).toBe(enPagoPortada);
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
   * El cuerpo de los correos de banco viaja SIN enmascarar a Presu IA
   * (`gmail-sync.ts` arma el prompt con `stripHtmlToText(body)` y no pasa por el scrub),
   * a diferencia del texto del extracto, que sí se enmascara. Durante meses las dos
   * copias de la política dijeron lo contrario: «el texto enmascarado del movimiento o
   * del extracto/correo». Se descubrió el 2026-08-21 revisando el código para otra cosa,
   * no por un reclamo.
   *
   * Los dos lados del guardia importan. Que la divulgación ESTÉ evita volver a la
   * promesa falsa; que no se pueda meter «correo» en la lista de lo enmascarado evita
   * que vuelva por la puerta de al lado al reescribir la viñeta.
   */
  it('privacidad divulga que el cuerpo del correo NO va enmascarado', () => {
    const t = plano(privacidad);
    expect(
      /cuerpo del correo se envía sin enmascarar/i.test(t),
      'desapareció la divulgación de que el cuerpo del correo viaja sin enmascarar',
    ).toBe(true);
    expect(
      /texto enmascarado del movimiento o del extracto\s*\/?\s*correo/i.test(t),
      'volvió la frase que promete enmascarado también para el correo: el código no lo hace',
    ).toBe(false);
  });

  /**
   * Un documento publicado que cambia de fondo y conserva su fecha vieja se lee como que no
   * cambió. Las dos páginas venían de julio con el contenido de agosto.
   *
   * **Por qué ya no se compara una página contra la otra** (cambio del 2026-08-21): la
   * versión anterior exigía que las DOS declararan la misma fecha, usando «se movieron
   * juntas» como señal de «alguien las revisó juntas». Esa aproximación se rompe el primer
   * día que hay que corregir UNA sola: al corregir privacidad —el cuerpo de los correos no
   * viaja enmascarado y la política decía que sí— el test obligaba a fechar los términos
   * como actualizados sin haberlos tocado, que es la misma mentira que este guardia vino a
   * evitar, con el signo cambiado.
   *
   * La fecha esperada de cada página queda FIJADA acá, y eso es más estricto que la
   * igualdad: tocar una legal sin pasar por este archivo falla. El acto que el guardia
   * quería forzar —que alguien decida la fecha a conciencia— sigue siendo obligatorio; lo
   * que se cae es la exigencia de que las dos se muevan al mismo tiempo.
   */
  const FECHAS_DECLARADAS = {
    // Al cambiar el fondo de una de estas páginas, subí SU fecha —en la página y acá—.
    privacidad: '21 de agosto de 2026',
    terminos: '11 de agosto de 2026',
  };

  it.each(Object.entries(FECHAS_DECLARADAS))(
    '%s declara exactamente la fecha fijada en el test',
    (nombre, esperada) => {
      // `plano()` ya quitó las etiquetas y colapsó los espacios, así que acá se busca sobre
      // texto corrido: «Última actualización: 21 de agosto de 2026».
      const html = nombre === 'privacidad' ? privacidad : terminos;
      const declarada = plano(html).match(/Última actualización:\s*(\d{1,2} de \p{L}+ de \d{4})/u)?.[1];
      expect(declarada, `${nombre} no declara fecha de actualización`).toBeTruthy();
      expect(
        declarada,
        `${nombre} declara «${declarada}» y el test espera «${esperada}»: si cambiaste el fondo de la página, subí las dos; si no lo cambiaste, no le muevas la fecha`,
      ).toBe(esperada);
    },
  );
});
