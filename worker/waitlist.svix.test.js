import { describe, it, expect } from 'vitest';
import { verifySvix } from './waitlist.js';

// Construye una firma Svix válida para probar el verificador.
async function sign(secretB64, id, ts, body) {
  const keyBytes = Uint8Array.from(atob(secretB64), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const data = new TextEncoder().encode(`${id}.${ts}.${body}`);
  const sig = await crypto.subtle.sign('HMAC', key, data);
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}
function hdrs(map) { return { get: (k) => map[k.toLowerCase()] ?? null }; }

describe('verifySvix', () => {
  const secretB64 = btoa('super-secret-key-1234567890');
  const secret = 'whsec_' + secretB64;
  const now = () => Math.floor(Date.now() / 1000);

  it('acepta una firma válida', async () => {
    const id = 'msg_1', ts = String(now()), body = '{"type":"email.opened"}';
    const v1 = await sign(secretB64, id, ts, body);
    const ok = await verifySvix(secret, hdrs({ 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': 'v1,' + v1 }), body);
    expect(ok).toBe(true);
  });

  it('rechaza firma inválida', async () => {
    const id = 'msg_2', ts = String(now()), body = '{"x":1}';
    const ok = await verifySvix(secret, hdrs({ 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': 'v1,AAAA' }), body);
    expect(ok).toBe(false);
  });

  it('rechaza timestamp viejo (>5 min)', async () => {
    const id = 'msg_3', ts = String(now() - 3600), body = '{}';
    const v1 = await sign(secretB64, id, ts, body);
    const ok = await verifySvix(secret, hdrs({ 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': 'v1,' + v1 }), body);
    expect(ok).toBe(false);
  });

  it('rechaza headers faltantes', async () => {
    const ok = await verifySvix(secret, hdrs({}), '{}');
    expect(ok).toBe(false);
  });
});
