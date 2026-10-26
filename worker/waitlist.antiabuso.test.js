import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker, { safeEqual, sniffImage } from './waitlist.js';

// KV + R2 en memoria, Resend simulado y un rate-limiter (DO) falso que deja
// negar por prefijo de key y registra cada llamada (key, limit, window).
function mkEnv() {
  const kv = new Map();
  const r2 = new Map();
  const rlCalls = [];
  const deny = new Set();
  const env = {
    ADMIN_TOKEN: 'admin-secret',
    RESEND_API_KEY: 'k',
    WAITLIST: {
      get: async (k) => (kv.has(k) ? kv.get(k) : null),
      put: async (k, v) => {
        kv.set(k, v);
      },
      list: async () => ({ keys: [], list_complete: true }),
    },
    DOCS: {
      put: async (k, v, meta) => {
        r2.set(k, { v, meta });
      },
      get: async (k) => (r2.has(k) ? { body: r2.get(k).v } : null),
    },
    RL: {
      idFromName: (k) => k,
      get: (key) => ({
        fetch: async (u) => {
          const q = new URL(u).searchParams;
          rlCalls.push({ key, limit: +q.get('limit'), window: +q.get('window') });
          const denied = [...deny].some((p) => key.startsWith(p));
          return Response.json({ success: !denied });
        },
      }),
    },
  };
  return { env, kv, r2, rlCalls, deny };
}
const IP = '203.0.113.7';
const call = (env, path, init = {}) =>
  worker.fetch(
    new Request('https://w.dev' + path, {
      ...init,
      headers: { 'CF-Connecting-IP': IP, ...(init.headers || {}) },
    }),
    env,
  );
const signup = (env, body, path = '/', headers = {}) =>
  call(env, path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const PDF = new TextEncoder().encode('%PDF-1.7\n%');
function contribForm(files, extra = {}) {
  const fd = new FormData();
  fd.append('pais', 'CO');
  fd.append('banco', 'Bancolombia');
  fd.append('tipo', 'extracto');
  fd.append('botcheck', '');
  for (const [k, v] of Object.entries(extra)) fd.append(k, v);
  files.forEach((bytes, i) => fd.append('doc' + i, new Blob([bytes]), 'doc' + i + '.jpg'));
  return fd;
}
const contrib = (env, fd) => call(env, '/contrib', { method: 'POST', body: fd });

let resendBodies;
beforeEach(() => {
  resendBodies = [];
  vi.stubGlobal('fetch', async (_url, init) => {
    resendBodies.push(JSON.parse(init.body));
    return new Response('{"id":"re_1"}', { status: 200 });
  });
});

describe('token admin', () => {
  it('safeEqual compara en tiempo constante y sin falsos positivos', () => {
    expect(safeEqual('admin-secret', 'admin-secret')).toBe(true);
    expect(safeEqual('admin-secreT', 'admin-secret')).toBe(false);
    expect(safeEqual('admin', 'admin-secret')).toBe(false);
    expect(safeEqual('admin-secret-extra', 'admin-secret')).toBe(false);
    expect(safeEqual('', 'admin-secret')).toBe(false);
  });

  it('los endpoints admin exigen el token exacto por cabecera', async () => {
    const { env } = mkEnv();
    expect((await call(env, '/admin/stats')).status).toBe(401);
    expect(
      (await call(env, '/admin/stats', { headers: { 'X-Admin-Token': 'admin-secre' } })).status,
    ).toBe(401);
    expect(
      (await call(env, '/admin/stats', { headers: { 'X-Admin-Token': 'admin-secret' } })).status,
    ).toBe(200);
    // sin ADMIN_TOKEN configurado nadie entra (ni con cabecera vacía)
    delete env.ADMIN_TOKEN;
    expect((await call(env, '/admin/stats', { headers: { 'X-Admin-Token': '' } })).status).toBe(
      401,
    );
  });
});

describe('/admin/doc', () => {
  let env, kv, r2;
  beforeEach(() => {
    ({ env, kv, r2 } = mkEnv());
    kv.set(
      'contrib:abc-1',
      JSON.stringify({ id: 'abc-1', key: 'doc/CO/x/abc-1.jpg', jsonKey: 'doc/CO/x/abc-1.json' }),
    );
    r2.set('doc/CO/x/abc-1.jpg', { v: JPEG });
    r2.set('doc/CO/x/abc-1.json', { v: '{"tokens":[]}' });
  });

  it('ya no acepta el token en la URL', async () => {
    expect((await call(env, '/admin/doc?id=abc-1&t=admin-secret')).status).toBe(401);
  });

  it('con la cabecera sirve la imagen, sin CORS comodín', async () => {
    const r = await call(env, '/admin/doc?id=abc-1', {
      headers: { 'X-Admin-Token': 'admin-secret', Origin: 'https://presu.io' },
    });
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toBe('image/jpeg');
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe('https://presu.io');
    const j = await call(env, '/admin/doc?id=abc-1&kind=json', {
      headers: { 'X-Admin-Token': 'admin-secret', Origin: 'https://evil.example' },
    });
    expect(j.status).toBe(200);
    expect(j.headers.get('Access-Control-Allow-Origin')).not.toBe('*');
    expect(j.headers.get('Access-Control-Allow-Origin')).not.toBe('https://evil.example');
  });
});

describe('registro (POST /)', () => {
  it('?debug no expone la respuesta de Resend sin token admin', async () => {
    const { env } = mkEnv();
    const pub = await (await signup(env, { correo: 'ana@ejemplo.co' }, '/?debug=1')).json();
    expect(pub.status).toBe('ok');
    expect(pub.mail).toBeUndefined();
    const adm = await (
      await signup(env, { correo: 'beto@ejemplo.co' }, '/?debug=1', {
        'X-Admin-Token': 'admin-secret',
      })
    ).json();
    expect(adm.mail && adm.mail.welcome && adm.mail.welcome.ok).toBe(true);
  });

  it('aplica un tope diario por IP además del de 1 minuto', async () => {
    const { env, rlCalls, deny, kv } = mkEnv();
    await signup(env, { correo: 'ana@ejemplo.co' });
    expect(rlCalls).toContainEqual({ key: 'sub:' + IP, limit: 12, window: 60 });
    expect(rlCalls).toContainEqual({ key: 'subd:' + IP, limit: 40, window: 86400 });
    deny.add('subd:');
    const r = await signup(env, { correo: 'otro@ejemplo.co' });
    expect(r.status).toBe(429);
    expect(kv.has('email:otro@ejemplo.co')).toBe(false);
  });

  it('un IP no puede inflar los referidos de un código', async () => {
    const { env, kv, rlCalls, deny } = mkEnv();
    kv.set('code:REFAAA1', 'dueno@ejemplo.co');
    kv.set(
      'email:dueno@ejemplo.co',
      JSON.stringify({ email: 'dueno@ejemplo.co', nombre: 'Dueño' }),
    );
    await signup(env, { correo: 'amigo1@ejemplo.co', ref: 'refaaa1' });
    expect(kv.get('referrals:dueno@ejemplo.co')).toBe('1');
    expect(rlCalls).toContainEqual({ key: 'refd:REFAAA1:' + IP, limit: 3, window: 86400 });
    deny.add('refd:');
    const r = await (await signup(env, { correo: 'amigo2@ejemplo.co', ref: 'REFAAA1' })).json();
    expect(r.status).toBe('ok'); // el registro entra…
    expect(JSON.parse(kv.get('email:amigo2@ejemplo.co')).referredBy).toBeNull(); // …pero no acredita
    expect(kv.get('referrals:dueno@ejemplo.co')).toBe('1');
  });
});

describe('aportes (POST /contrib)', () => {
  it('sniffImage reconoce JPEG/PNG por magic bytes y rechaza el resto', () => {
    expect(sniffImage(JPEG.buffer)).toBe('image/jpeg');
    expect(sniffImage(PNG.buffer)).toBe('image/png');
    expect(sniffImage(PDF.buffer)).toBeNull();
    expect(sniffImage(new Uint8Array([0x3c, 0x73, 0x76, 0x67]).buffer)).toBeNull();
    expect(sniffImage(new Uint8Array([]).buffer)).toBeNull();
  });

  it('rechaza archivos que no son imagen sin escribir nada en R2', async () => {
    const { env, r2, kv } = mkEnv();
    const r = await contrib(env, contribForm([JPEG, PDF]));
    expect(r.status).toBe(415);
    expect((await r.json()).reason).toBe('file_type');
    expect(r2.size).toBe(0);
    expect(kv.has('meta:contribs')).toBe(false);
  });

  it('rechaza más de 12 páginas por envío', async () => {
    const { env, r2 } = mkEnv();
    const r = await contrib(env, contribForm(Array.from({ length: 13 }, () => JPEG)));
    expect(r.status).toBe(413);
    expect((await r.json()).reason).toBe('too_many');
    expect(r2.size).toBe(0);
  });

  it('guarda JPEG y PNG con su tipo real', async () => {
    const { env, r2 } = mkEnv();
    const r = await contrib(env, contribForm([JPEG, PNG]));
    expect(r.status).toBe(200);
    const keys = [...r2.keys()];
    expect(keys.filter((k) => k.endsWith('.jpg'))).toHaveLength(1);
    const png = keys.find((k) => k.endsWith('.png'));
    expect(r2.get(png).meta.httpMetadata.contentType).toBe('image/png');
  });

  it('aplica un tope diario por IP', async () => {
    const { env, rlCalls, deny } = mkEnv();
    await contrib(env, contribForm([JPEG]));
    expect(rlCalls).toContainEqual({ key: 'contribd:' + IP, limit: 30, window: 86400 });
    deny.add('contribd:');
    expect((await contrib(env, contribForm([JPEG]))).status).toBe(429);
  });

  it('no pone un nombre libre sobre el correo de otra persona', async () => {
    const { env, kv } = mkEnv();
    kv.set(
      'email:ana@ejemplo.co',
      JSON.stringify({ email: 'ana@ejemplo.co', nombre: 'Ana María' }),
    );
    await contrib(
      env,
      contribForm([JPEG], { ref: 'ana@ejemplo.co', nombre: 'Nombre <b>Falso</b>' }),
    );
    const wall = JSON.parse(kv.get('contrib_wall'));
    expect(wall).toEqual([{ key: 'ana@ejemplo.co', name: 'Ana M.', count: 1 }]);
    expect(kv.get('contrib_by:ana@ejemplo.co')).toBe('1');
  });

  it('un correo que no está inscrito no recibe crédito: el aporte queda anónimo', async () => {
    const { env, kv } = mkEnv();
    const r = await (
      await contrib(env, contribForm([JPEG], { ref: 'nadie@ejemplo.co', nombre: 'Pepe <script>' }))
    ).json();
    expect(r.status).toBe('ok');
    expect(r.contributor).toBeNull();
    expect(kv.has('contrib_by:nadie@ejemplo.co')).toBe(false);
    const wall = JSON.parse(kv.get('contrib_wall'));
    expect(wall).toHaveLength(1);
    expect(wall[0].key.startsWith('anon:')).toBe(true);
    expect(wall[0].name).toBe('Pepe script');
    expect(JSON.stringify(wall)).not.toContain('nadie@');
  });
});
