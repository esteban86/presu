import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker, { surveyToken } from './waitlist.js';

// KV en memoria + Resend simulado: suficiente para la encuesta.
function mkEnv() {
  const kv = new Map();
  const env = {
    ADMIN_TOKEN: 'admin-secret',
    RESEND_API_KEY: 'k',
    WAITLIST: {
      get: async (k) => (kv.has(k) ? kv.get(k) : null),
      put: async (k, v) => {
        kv.set(k, v);
      },
      list: async () => ({ keys: [] }),
    },
  };
  return { env, kv };
}
const call = (env, path, init) => worker.fetch(new Request('https://w.dev' + path, init), env);
const getJson = (env, path) => call(env, path).then((r) => r.json());
const post = (env, path, body) =>
  call(env, path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => r.json());

describe('encuesta con enlace firmado', () => {
  let env, kv, sent;
  beforeEach(async () => {
    ({ env, kv } = mkEnv());
    kv.set(
      'email:ana@ejemplo.co',
      JSON.stringify({
        email: 'ana@ejemplo.co',
        nombre: 'Ana',
        celular: '3001112222',
        ref: 'ABC123',
      }),
    );
    kv.set('survey:ana@ejemplo.co', JSON.stringify({ answers: { ingreso: 'alto' } }));
    sent = [];
    vi.stubGlobal('fetch', async (_url, init) => {
      sent.push(JSON.parse(init.body));
      return new Response('{"id":"x"}', { status: 200 });
    });
  });

  it('sin firma no devuelve datos ni revela si el correo está inscrito', async () => {
    expect(await getJson(env, '/survey?e=ana@ejemplo.co')).toEqual({ found: false, link: true });
    expect(await getJson(env, '/survey?e=nadie@ejemplo.co')).toEqual({ found: false, link: true });
    // el code de referido (público en los links de invitación) ya no abre nada
    expect(await getJson(env, '/survey?e=ana@ejemplo.co&code=ABC123')).toEqual({
      found: false,
      link: true,
    });
  });

  it('la firma de otro correo no sirve', async () => {
    const otra = await surveyToken(env, 'bo@ejemplo.co');
    expect((await getJson(env, '/survey?e=ana@ejemplo.co&t=' + otra)).found).toBe(false);
  });

  it('con firma válida precarga y guarda', async () => {
    const t = await surveyToken(env, 'ana@ejemplo.co');
    const d = await getJson(env, '/survey?e=ana@ejemplo.co&t=' + t);
    expect(d).toMatchObject({
      found: true,
      nombre: 'Ana',
      celular: '3001112222',
      answers: { ingreso: 'alto' },
    });
    expect(
      (
        await post(env, '/survey', {
          email: 'ana@ejemplo.co',
          t,
          answers: { celular: '3009998888' },
        })
      ).status,
    ).toBe('updated');
    expect(JSON.parse(kv.get('email:ana@ejemplo.co')).celular).toBe('3009998888');
  });

  it('sin firma no se puede sobrescribir el celular', async () => {
    const r = await post(env, '/survey', {
      email: 'ana@ejemplo.co',
      answers: { celular: '3000000000' },
    });
    expect(r.reason).toBe('link');
    expect(JSON.parse(kv.get('email:ana@ejemplo.co')).celular).toBe('3001112222');
  });

  it('/r ya no filtra el code del pionero y solo reenvía firmas válidas', async () => {
    const t = await surveyToken(env, 'ana@ejemplo.co');
    const sinFirma = await call(env, '/r?e=ana@ejemplo.co&to=encuesta&c=x', { redirect: 'manual' });
    expect(sinFirma.headers.get('location')).not.toContain('ABC123');
    expect(sinFirma.headers.get('location')).not.toContain('&t=');
    const falsa = await call(env, '/r?e=ana@ejemplo.co&to=encuesta&t=AAAAAAAAAAAAAAAAAAAAAA', {
      redirect: 'manual',
    });
    expect(falsa.headers.get('location')).not.toContain('&t=');
    const buena = await call(env, '/r?e=ana@ejemplo.co&to=encuesta&t=' + t, { redirect: 'manual' });
    expect(buena.headers.get('location')).toContain('&t=' + t);
  });

  it('/survey/link manda el enlace solo a inscritos, una vez cada 15 min, y responde igual siempre', async () => {
    expect((await post(env, '/survey/link', { email: 'nadie@ejemplo.co' })).status).toBe('sent');
    expect(sent).toHaveLength(0);
    expect((await post(env, '/survey/link', { email: 'ana@ejemplo.co' })).status).toBe('sent');
    expect(sent).toHaveLength(1);
    expect(sent[0].html).toContain('&t=' + (await surveyToken(env, 'ana@ejemplo.co')));
    await post(env, '/survey/link', { email: 'ana@ejemplo.co' });
    expect(sent).toHaveLength(1);
  });

  it('sin ADMIN_TOKEN falla cerrado', async () => {
    delete env.ADMIN_TOKEN;
    expect((await getJson(env, '/survey?e=ana@ejemplo.co&t=')).found).toBe(false);
    expect(
      (await post(env, '/survey', { email: 'ana@ejemplo.co', t: '', answers: { nombre: 'x' } }))
        .reason,
    ).toBe('link');
  });
});
