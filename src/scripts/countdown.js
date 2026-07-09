// src/scripts/countdown.js — fechas y lógica pura de la cuenta regresiva
// (Beta de pioneros → Nueva Ola). Portado de `index.html:1220-1258`.
// Sin DOM: el módulo que dibuja el countdown (Task 9) importa estas
// funciones y las conecta a los elementos #cd-d/#cd-h/#cd-m/#cd-s.

/** Cierre de la beta de pioneros: 30-jun-2026, 4pm hora Colombia (UTC-5). */
export const BETA = Date.parse('2026-06-30T16:00:00-05:00');
/** Apertura de la Nueva Ola: 15-jul-2026, 4pm hora Colombia (UTC-5). */
export const OLA = Date.parse('2026-07-15T16:00:00-05:00');

/**
 * A qué fecha debe apuntar el countdown dado el momento actual.
 * Antes de que cierre la beta, cuenta hacia BETA; en cuanto BETA pasa
 * (la beta ya cerró), cuenta hacia OLA — incluso si OLA ya pasó también
 * (en ese caso el countdown queda en "is-live", pero el target no cambia).
 */
export function target(now) {
  return now < BETA ? BETA : OLA;
}

/** Descompone un diff en milisegundos en días/horas/minutos/segundos. */
export function parts(diffMs) {
  const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
  return {
    d: Math.floor(totalSeconds / 86400),
    h: Math.floor((totalSeconds % 86400) / 3600),
    m: Math.floor((totalSeconds % 3600) / 60),
    s: totalSeconds % 60,
  };
}
