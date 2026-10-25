import { test } from 'node:test';
import assert from 'node:assert/strict';
import W from './waitlist.js';

function mkEnv() {
  const m = new Map(); const sent = [];
  const env = {
    ADMIN_TOKEN: 'admin-secret', RESEND_API_KEY: 'k',
    WAITLIST: { get: async k => m.has(k) ? m.get(k) : null, put: async (k, v) => { m.set(k, v); }, list: async () => ({ keys: [] }) },
  };
  globalThis.fetch = async (url, init) => { sent.push(JSON.parse(init.body)); return new Response(JSON.stringify({ id: 'x' }), { status: 200 }); };
  return { env, m, sent };
}
const call = (env, path, init) => W.fetch(new Request('https://w.dev' + path, init), env).then(r => r.json());
const post = (env, path, body) => call(env, path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('signup returns a token that unlocks the survey; nothing works without it', async () => {
  const { env, m, sent } = mkEnv();
  const r = await post(env, '/', { email: 'ana@ejemplo.co', nombre: 'Ana' });
  assert.equal(r.status, 'ok'); assert.ok(r.st && r.st.length >= 20);
  // without token: no data, no membership leak
  const noTok = await call(env, '/survey?e=ana@ejemplo.co');
  assert.deepEqual(noTok, { found: false, link: true });
  const badTok = await call(env, '/survey?e=ana@ejemplo.co&t=' + 'A'.repeat(r.st.length));
  assert.equal(badTok.found, false);
  // another email's token does not work
  const other = await post(env, '/', { email: 'bo@ejemplo.co' });
  assert.equal((await call(env, '/survey?e=ana@ejemplo.co&t=' + other.st)).found, false);
  // POST without token cannot overwrite phone
  const w = await post(env, '/survey', { email: 'ana@ejemplo.co', answers: { celular: '3000000000' } });
  assert.equal(w.reason, 'link');
  assert.equal(JSON.parse(m.get('email:ana@ejemplo.co')).celular, undefined);
  // with token: works
  const ok = await post(env, '/survey', { email: 'ana@ejemplo.co', t: r.st, answers: { celular: '3001112222' } });
  assert.equal(ok.status, 'ok');
  const got = await call(env, '/survey?e=ana@ejemplo.co&t=' + r.st);
  assert.equal(got.found, true); assert.equal(got.celular, '3001112222');
});

test('/survey/link mails a signed link only to listed emails, once per 15 min, same answer either way', async () => {
  const { env, sent } = mkEnv();
  const r = await post(env, '/', { email: 'ana@ejemplo.co' });
  sent.length = 0;
  assert.equal((await post(env, '/survey/link', { email: 'nadie@ejemplo.co' })).status, 'sent');
  assert.equal(sent.length, 0);
  assert.equal((await post(env, '/survey/link', { email: 'ana@ejemplo.co' })).status, 'sent');
  assert.equal(sent.length, 1);
  assert.ok(sent[0].html.includes('&t=' + r.st));
  await post(env, '/survey/link', { email: 'ana@ejemplo.co' });
  assert.equal(sent.length, 1);
});

test('no ADMIN_TOKEN → survey fails closed', async () => {
  const { env } = mkEnv();
  await post(env, '/', { email: 'ana@ejemplo.co' });
  delete env.ADMIN_TOKEN;
  assert.equal((await call(env, '/survey?e=ana@ejemplo.co&t=')).found, false);
  assert.equal((await post(env, '/survey', { email: 'ana@ejemplo.co', t: '', answers: { nombre: 'x' } })).reason, 'link');
});
