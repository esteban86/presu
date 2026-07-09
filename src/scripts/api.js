// src/scripts/api.js — allowlist de host para elegir el Worker de waitlist
// (prod vs staging). Portado de `index.html` (IIFE de waitlist), literal.
const PROD_HOSTS = ['presu.asimetrica.co','presu.io','www.presu.io','presu.com.co'];
export function apiBase(hostname) {
  return PROD_HOSTS.indexOf(hostname) !== -1
    ? 'https://presu-waitlist.asimetrica.workers.dev'
    : 'https://presu-waitlist-staging.asimetrica.workers.dev';
}
