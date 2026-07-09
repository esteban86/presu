// src/scripts/waitlist.js — envío del formulario de waitlist al Worker de
// Cloudflare (dedup por correo + guardado + correo de bienvenida/notificación
// vía Resend, todo del lado del Worker) y el flip de UI "Beta de pioneros" →
// "Nueva Ola" cuando la beta cierra.
// Portado de `index.html` (IIFE de waitlist): `send()` ~L1273-1287 y
// `enterNuevaOla()` ~L1220-1236. Hace I/O de red → sin test unitario aquí
// (se valida a mano en staging, Task 10); Task 9 conecta esto a los
// formularios de la landing.

import { apiBase } from './api.js';

/**
 * Envía un registro de waitlist al Worker (POST JSON). Callback-style
 * (igual que el `send()` original) para conectarlo directo a los
 * formularios sin reescribir el flujo ok/already/fail.
 *
 * @param {object} payload - body del POST (perfil, correo, nombre, ref, ...).
 * @param {(res: object) => void} ok - nuevo registro: éxito.
 * @param {() => void} fail - error de red o respuesta inesperada.
 * @param {() => void} [already] - el correo ya estaba inscrito. Si se omite, se trata como `ok`.
 */
export function send(payload, ok, fail, already) {
  fetch(apiBase(location.hostname), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
    .then((r) => r.json().catch(() => ({ status: 'error' })))
    .then((res) => {
      if (res && res.status === 'ok') ok(res);
      else if (res && res.status === 'already') {
        if (already) already();
        else ok(res);
      } else if (res && res.status === 'full') {
        alert('¡Se llenaron los 1.000 cupos antes del lanzamiento! 🙌 Te avisamos si abrimos más.');
      } else fail();
    })
    .catch(fail);
}

// La beta cerró → true en cuanto se aplica el flip a "Nueva Ola" (una sola
// vez). Task 9 puede leerlo con `isNuevaOla()` para el `origen` del lead
// ('hero' vs 'tanda2'), igual que el `LATE` del script original.
let nuevaOlaApplied = false;

/** true si la landing ya está en modo "Nueva Ola" (la beta de pioneros cerró). */
export function isNuevaOla() {
  return nuevaOlaApplied;
}

/**
 * Voltea la landing de "Beta de pioneros" (cuenta hacia BETA) a "Nueva Ola"
 * (cuenta hacia OLA): re-escribe el copy del hero, el countdown, el CTA y
 * la sección de waitlist. Idempotente — llamadas repetidas no hacen nada
 * después de la primera.
 *
 * @returns {boolean} true si aplicó el flip ahora; false si ya estaba aplicado.
 */
export function enterNuevaOla() {
  if (nuevaOlaApplied) return false;
  nuevaOlaApplied = true;

  const q = (s) => document.querySelector(s);

  const badge = q('.hero-grid .pill-badge');
  if (badge) badge.innerHTML = '<span class="ping"></span> 🌊 Nueva Ola · abre el 15 de julio, 4pm';

  const h1 = q('.hero-grid h1');
  if (h1) h1.innerHTML = 'La <span class="mintword">Nueva Ola</span> de Presu abre el 15 de julio.';

  const pitch = q('.hero-grid .pitch');
  if (pitch) pitch.textContent = 'La beta de pioneros ya está corriendo. La siguiente tanda —la Nueva Ola— abre el 15 de julio a las 4pm.';

  const sub = q('.hero-grid .sub');
  if (sub) sub.innerHTML = 'Déjanos tu correo y entras en la <b>Nueva Ola</b>. ¿Quieres adelantarte? Tienes dos formas 👇';

  const btn = q('#hero-form button');
  if (btn && btn.firstChild) btn.firstChild.nodeValue = 'Únete a la Nueva Ola ';

  const top = q('#countdown .cd-top');
  if (top) top.textContent = 'Falta para la Nueva Ola';

  const note = q('#countdown .cd-note');
  if (note) note.innerHTML = 'Faltan para la <b>Nueva Ola</b>. <span style="opacity:.85">¿Ya eres pionero de la beta? Ya tienes acceso —revisa tu correo 📩.</span>';

  const live = q('#countdown .cd-live');
  if (live) live.textContent = '● La Nueva Ola ya abrió —entra y reclama tu acceso.';

  const ramps = q('#late-ramps');
  if (ramps) ramps.style.display = 'flex';

  const ose = q('#os-eb-date');
  if (ose) ose.textContent = 'Beta en curso · Nueva Ola abre el 15 de julio';

  const wl = q('#waitlist-lede');
  if (wl) {
    wl.innerHTML = 'La beta de pioneros ya está corriendo; la <b style="color:var(--tx,#fff)">Nueva Ola</b> abre el <b style="color:var(--tx,#fff)">15 de julio, 4pm</b>. Déjanos tu correo y entras. <br><span style="color:var(--mut2,#6B6B72)">¿Ya eres pionero? Ya tienes acceso — revisa tu correo 📩.</span>';
  }

  return true;
}
