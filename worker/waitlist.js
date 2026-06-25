/**
 * Presu — Worker de lista de espera + campaña de referidos (Cloudflare)
 * --------------------------------------------------------------
 * Flujo de inscripción (POST /):
 *   1. Dedup por correo en KV → {status:'already'} si ya estaba.
 *   2. Valida que sea "efectivo": correo nuevo, válido, no desechable.
 *   3. Asigna un código de referido propio, acredita al referidor (si vino ?ref
 *      y es efectivo y no es auto-referido), guarda, y envía bienvenida + aviso.
 *
 * Otros endpoints:
 *   GET  /count               → { count }                       (contador público)
 *   GET  /me?code=CODE        → { referrals, tier, next, link } (panel del Fundador)
 *   GET  /leaderboard         → top 10 [{ name, count }]        (ranking, sin correos)
 *   POST /admin/welcome       → reenvía bienvenida idempotente  (token)
 *   POST /admin/code {email}  → asegura código para un correo   (token, backfill)
 *   GET  /admin/stats         → total + ranking completo        (token)
 *
 * Bindings: KV "WAITLIST" · Secrets RESEND_API_KEY, ADMIN_TOKEN · Var NOTIFY_EMAIL
 */

const SITE = 'https://presu.asimetrica.co';
const ALLOWED_ORIGINS = [SITE, 'http://localhost:4821'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FROM = 'Presu · de Asimétrica <presu@asimetrica.co>';
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const DISPOSABLE = ['mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com', 'temp-mail.org', 'yopmail.com', 'trashmail.com', 'getnada.com', 'sharklasers.com', 'maildrop.cc', 'dispostable.com', 'fakeinbox.com', 'mohmal.com'];
const TIERS = [
  { min: 3, name: 'Fundador' },
  { min: 7, name: 'Círculo de Fundadores' },
  { min: 15, name: 'Súper Fundador' },
];
const CAMPAIGN_SUBJECT = 'Tu link de Fundador ya está aquí 🚀';
const CAMPAIGN_BATCH = 30; // envíos por disparo del cron (bajo el límite de subrequests)
const TEST_EMAILS = ['x@x.com', 'prueba@asimetrica.co', 'prueba.worker@asimetrica.co', 'esteban.restrepo@bpt.global', 'debug1@aleph0.com.co', 'pionero.prueba@aleph0.com.co', 'chequeo.cuota@aleph0.com.co', 'esteban@aleph0.com.co'];
function isTestEmail(e) { return TEST_EMAILS.indexOf(e) !== -1 || e.indexOf('+') !== -1 || e.indexOf('diag-') === 0; }

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    const cors = {
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
      'Vary': 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const url = new URL(request.url);
    const path = url.pathname;
    const pub = { ...cors, 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };

    if (path === '/admin/welcome') return adminWelcome(request, env, cors);
    if (path === '/admin/code') return adminCode(request, env, cors);
    if (path === '/admin/campaign-batch') return adminCampaignBatch(request, env, cors);
    if (path === '/admin/campaign-one') return adminCampaignOne(request, env, cors);
    if (request.method === 'GET' && path === '/admin/stats') return adminStats(request, env, cors);

    if (request.method === 'GET' && path === '/count') {
      const count = parseInt((await env.WAITLIST.get('meta:count')) || '0', 10);
      return json({ count }, 200, pub);
    }
    if (request.method === 'GET' && path === '/me') {
      const code = (url.searchParams.get('code') || '').trim().toUpperCase();
      const owner = code && await env.WAITLIST.get('code:' + code);
      if (!owner) return json({ error: 'not_found' }, 404, pub);
      const n = parseInt((await env.WAITLIST.get('referrals:' + owner)) || '0', 10);
      return json({ referrals: n, ...tierFor(n), link: SITE + '/?ref=' + code }, 200, pub);
    }
    if (request.method === 'GET' && path === '/leaderboard') {
      let lb = [];
      try { lb = JSON.parse((await env.WAITLIST.get('leaderboard')) || '[]'); } catch (e) {}
      return json({ top: lb.slice(0, 10).map(function (x) { return { name: x.name, count: x.count }; }) }, 200, pub);
    }
    if (request.method === 'GET' && path === '/founders') {
      let lb = [];
      try { lb = JSON.parse((await env.WAITLIST.get('leaderboard')) || '[]'); } catch (e) {}
      const founders = lb.filter(function (x) { return x.count >= TIERS[0].min; }).map(function (x) { return { name: x.name, count: x.count }; });
      return json({ founders: founders, total: founders.length }, 200, pub);
    }

    if (request.method !== 'POST') return json({ status: 'error', reason: 'method' }, 405, cors);

    let data;
    try { data = await request.json(); } catch (e) { return json({ status: 'error', reason: 'json' }, 400, cors); }
    if (data.botcheck) return json({ status: 'ok' }, 200, cors); // honeypot

    const email = String(data.correo || data.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email) || isDisposable(email)) return json({ status: 'error', reason: 'email' }, 400, cors);

    // Dedup
    if (await env.WAITLIST.get('email:' + email)) return json({ status: 'already' }, 200, cors);

    // Código de referido propio (para que esta persona también pueda invitar)
    const code = await genCode(env);
    const record = {
      email,
      perfil: data.perfil || 'persona',
      nombre: data.nombre || '',
      empresa: data.empresa || '',
      empleados: data.empleados || '',
      origen: data.origen || '',
      ref: code,
      referredBy: null,
      ts: Date.now(),
    };

    // Acreditar al referidor — solo si es efectivo (registro nuevo válido) y no auto-referido
    const refCode = String(data.ref || '').trim().toUpperCase();
    if (refCode) {
      const credited = await creditReferral(env, refCode, email);
      if (credited) record.referredBy = credited.referrer;
    }

    if (code) await env.WAITLIST.put('code:' + code, email);
    await env.WAITLIST.put('email:' + email, JSON.stringify(record));

    let total = parseInt((await env.WAITLIST.get('meta:count')) || '0', 10) + 1;
    await env.WAITLIST.put('meta:count', String(total));

    // Correos vía Resend (best-effort)
    let mail = { welcome: null, notify: null };
    if (env.RESEND_API_KEY) {
      mail.welcome = await sendResend(env, { to: email, reply_to: env.NOTIFY_EMAIL || undefined, subject: '¡Ya eres pionero de Presu! 🎉', html: welcomeHtml(record) });
      if (mail.welcome && mail.welcome.ok) await env.WAITLIST.put('welcomed:' + email, String(Date.now()));
      if (env.NOTIFY_EMAIL) mail.notify = await sendResend(env, { to: env.NOTIFY_EMAIL, reply_to: email, subject: 'Nuevo registro en la waitlist de Presu (' + record.perfil + ')', html: notifyHtml(record, total) });
    }

    const resp = { status: 'ok', total, ref: code };
    if (url.searchParams.has('debug')) resp.mail = mail;
    return json(resp, 200, cors);
  },

  // Cron: el día del lanzamiento dispara cada minuto y drena la base por lotes.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runCampaignBatch(env, CAMPAIGN_BATCH));
  },
};

// ── Referidos ────────────────────────────────────────────────
function tierFor(n) {
  let current = null, next = TIERS[0];
  for (let i = 0; i < TIERS.length; i++) {
    if (n >= TIERS[i].min) { current = TIERS[i].name; next = TIERS[i + 1] || null; }
  }
  return { tier: current, next: next };
}
function isDisposable(email) { return DISPOSABLE.indexOf((email.split('@')[1] || '')) !== -1; }
async function genCode(env) {
  for (let t = 0; t < 6; t++) {
    const a = new Uint8Array(7); crypto.getRandomValues(a);
    let c = ''; for (let i = 0; i < 7; i++) c += CODE_ALPHABET[a[i] % CODE_ALPHABET.length];
    if (!(await env.WAITLIST.get('code:' + c))) return c;
  }
  return null;
}
function displayName(rec, email) {
  const n = ((rec && rec.nombre) || '').trim();
  if (n) { const p = n.split(/\s+/); return p[0] + (p[1] ? ' ' + p[1][0].toUpperCase() + '.' : ''); }
  const u = (email || '').split('@')[0]; return u.slice(0, 2) + '***';
}
async function creditReferral(env, refCode, newEmail) {
  const referrer = await env.WAITLIST.get('code:' + refCode);
  if (!referrer || referrer === newEmail) return null; // inválido o auto-referido
  const count = parseInt((await env.WAITLIST.get('referrals:' + referrer)) || '0', 10) + 1;
  await env.WAITLIST.put('referrals:' + referrer, String(count));
  let rrec = {}; try { rrec = JSON.parse((await env.WAITLIST.get('email:' + referrer)) || '{}'); } catch (e) {}
  await bumpLeaderboard(env, referrer, displayName(rrec, referrer), count);
  return { referrer, count };
}
async function bumpLeaderboard(env, email, name, count) {
  let lb = []; try { lb = JSON.parse((await env.WAITLIST.get('leaderboard')) || '[]'); } catch (e) {}
  const i = lb.findIndex(function (x) { return x.email === email; });
  if (i >= 0) lb[i] = { email, name, count }; else lb.push({ email, name, count });
  lb.sort(function (a, b) { return b.count - a.count; });
  await env.WAITLIST.put('leaderboard', JSON.stringify(lb.slice(0, 50)));
}

// ── Endpoints admin ──────────────────────────────────────────
async function adminWelcome(request, env, cors) {
  if (request.method !== 'POST') return json({ error: 'method' }, 405, cors);
  if (!authed(request, env)) return json({ error: 'unauthorized' }, 401, cors);
  let body; try { body = await request.json(); } catch (e) { return json({ error: 'json' }, 400, cors); }
  const email = String(body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return json({ status: 'error', reason: 'email' }, 400, cors);
  if (await env.WAITLIST.get('welcomed:' + email)) return json({ status: 'skipped' }, 200, cors);
  let rec = { email, perfil: 'persona', nombre: '', ref: '' };
  const raw = await env.WAITLIST.get('email:' + email);
  if (raw) { try { rec = JSON.parse(raw); } catch (e) {} }
  if (!rec.ref) { rec.ref = await genCode(env); if (rec.ref) { await env.WAITLIST.put('code:' + rec.ref, email); await env.WAITLIST.put('email:' + email, JSON.stringify(rec)); } }
  const res = await sendResend(env, { to: email, reply_to: env.NOTIFY_EMAIL || undefined, subject: '¡Ya eres pionero de Presu! 🎉', html: welcomeHtml(rec) });
  if (res.ok) { await env.WAITLIST.put('welcomed:' + email, String(Date.now())); return json({ status: 'sent', id: res.id }, 200, cors); }
  return json({ status: 'error', detail: res }, 502, cors);
}
async function adminCode(request, env, cors) {
  if (request.method !== 'POST') return json({ error: 'method' }, 405, cors);
  if (!authed(request, env)) return json({ error: 'unauthorized' }, 401, cors);
  let body; try { body = await request.json(); } catch (e) { return json({ error: 'json' }, 400, cors); }
  const email = String(body.email || '').trim().toLowerCase();
  const raw = await env.WAITLIST.get('email:' + email);
  if (!raw) return json({ error: 'not_found' }, 404, cors);
  let rec = JSON.parse(raw);
  if (!rec.ref) { rec.ref = await genCode(env); await env.WAITLIST.put('code:' + rec.ref, email); await env.WAITLIST.put('email:' + email, JSON.stringify(rec)); }
  return json({ email, ref: rec.ref, link: SITE + '/?ref=' + rec.ref }, 200, cors);
}
async function adminStats(request, env, cors) {
  if (!authed(request, env)) return json({ error: 'unauthorized' }, 401, cors);
  const total = parseInt((await env.WAITLIST.get('meta:count')) || '0', 10);
  let lb = []; try { lb = JSON.parse((await env.WAITLIST.get('leaderboard')) || '[]'); } catch (e) {}
  return json({ total, leaderboard: lb }, 200, cors);
}
function authed(request, env) { return env.ADMIN_TOKEN && (request.headers.get('X-Admin-Token') || '') === env.ADMIN_TOKEN; }

// ── Campaña de lanzamiento (cron + manual) ───────────────────
async function runCampaignBatch(env, limit) {
  const list = await env.WAITLIST.list({ prefix: 'email:', limit: 1000 });
  let sent = 0, skipped = 0, errors = 0;
  for (const k of list.keys) {
    if (sent >= limit) break;
    const email = k.name.slice(6);
    if (await env.WAITLIST.get('campaign:' + email)) { skipped++; continue; }
    if (isTestEmail(email) || isDisposable(email)) { await env.WAITLIST.put('campaign:' + email, 'skip'); skipped++; continue; }
    let rec = {}; try { rec = JSON.parse((await env.WAITLIST.get('email:' + email)) || '{}'); } catch (e) {}
    rec.email = email;
    if (!rec.ref) { rec.ref = await genCode(env); if (rec.ref) { await env.WAITLIST.put('code:' + rec.ref, email); await env.WAITLIST.put('email:' + email, JSON.stringify(rec)); } }
    if (!env.RESEND_API_KEY) { errors++; continue; }
    const res = await sendResend(env, { to: email, reply_to: env.NOTIFY_EMAIL || undefined, subject: CAMPAIGN_SUBJECT, html: welcomeHtml(rec) });
    if (res.ok) { await env.WAITLIST.put('campaign:' + email, String(Date.now())); sent++; } else errors++;
  }
  return { sent, skipped, errors, scanned: list.keys.length };
}
async function adminCampaignBatch(request, env, cors) {
  if (request.method !== 'POST') return json({ error: 'method' }, 405, cors);
  if (!authed(request, env)) return json({ error: 'unauthorized' }, 401, cors);
  let body = {}; try { body = await request.json(); } catch (e) {}
  const limit = Math.min(Number(body.limit) || CAMPAIGN_BATCH, 40);
  return json(await runCampaignBatch(env, limit), 200, cors);
}
async function adminCampaignOne(request, env, cors) {
  if (request.method !== 'POST') return json({ error: 'method' }, 405, cors);
  if (!authed(request, env)) return json({ error: 'unauthorized' }, 401, cors);
  let body; try { body = await request.json(); } catch (e) { return json({ error: 'json' }, 400, cors); }
  const email = String(body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return json({ status: 'error', reason: 'email' }, 400, cors);
  let rec = {}; const raw = await env.WAITLIST.get('email:' + email);
  if (raw) { try { rec = JSON.parse(raw); } catch (e) {} }
  rec.email = email;
  if (!rec.ref) { rec.ref = await genCode(env); if (rec.ref) { await env.WAITLIST.put('code:' + rec.ref, email); await env.WAITLIST.put('email:' + email, JSON.stringify(rec)); } }
  const res = await sendResend(env, { to: email, reply_to: env.NOTIFY_EMAIL || undefined, subject: CAMPAIGN_SUBJECT, html: welcomeHtml(rec) });
  if (res.ok) { await env.WAITLIST.put('campaign:' + email, String(Date.now())); return json({ status: 'sent', id: res.id }, 200, cors); }
  return json({ status: 'error', detail: res }, 502, cors);
}

// ── Resend ───────────────────────────────────────────────────
async function sendResend(env, { to, subject, html, reply_to }) {
  try {
    const body = { from: FROM, to: [to], subject, html };
    if (reply_to) body.reply_to = reply_to;
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'Authorization': 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(function () { return {}; });
    return { ok: r.ok, status: r.status, id: j.id || null, message: j.message || j.error || '' };
  } catch (e) { return { ok: false, status: 0, message: 'fetch error: ' + String(e) }; }
}

// ── Plantillas ───────────────────────────────────────────────
function esc(s) { return String(s || '').replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

function welcomeHtml(r) {
  const hola = r.nombre ? 'Hola, ' + esc(r.nombre) + ' 👋' : 'Hola 👋';
  const link = SITE + '/?ref=' + (r.ref || '');
  const panel = SITE + '/fundador.html?code=' + (r.ref || '');
  const waMsg = encodeURIComponent('Me sumé a Presu 🌿 — reúne tus gastos de todos tus bancos y te dice si vas bien, privado y en tu equipo. La beta abre el 30 de junio y entrando antes es gratis. Te dejo mi link: ' + link);
  const c = 'font-size:15px;line-height:1.6;color:#D4D4D6;margin:0 0 12px';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#08080A;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#F4F4F3">
  <div style="max-width:540px;margin:0 auto;padding:36px 28px">
    <div style="font-size:26px;font-weight:700;letter-spacing:-.02em;margin-bottom:24px">presu<span style="color:#34D399">.</span></div>
    <p style="font-size:18px;margin:0 0 18px">${hola}</p>
    <p style="${c}">¡Listo! Ya estás en la lista —eres <b style="color:#34D399">pionero de Presu</b>. Tus bonos ya están <b style="color:#F4F4F3">asegurados</b> por entrar antes del 30: app completa gratis en la beta, la guía de Asimétrica, sesión en vivo, precio de pionero y voz en lo que construimos.</p>
    <div style="border-top:1px solid rgba(255,255,255,.1);margin:26px 0 22px"></div>
    <p style="font-size:19px;font-weight:700;color:#fff;margin:0 0 6px">¿Quieres más? Vuélvete <span style="color:#34D399">Fundador</span> 🚀</p>
    <p style="${c}">Invita amigos con tu link y desbloquea, <b style="color:#F4F4F3">además</b> de tus bonos:</p>
    <ul style="${c};padding-left:18px">
      <li><b style="color:#F4F4F3">3 amigos</b> → Insignia + Muro de Fundadores</li>
      <li><b style="color:#F4F4F3">7</b> → Círculo privado + Masterclass de Asimétrica + voto en el roadmap</li>
      <li><b style="color:#F4F4F3">15</b> → Súper Fundador</li>
      <li><b style="color:#34D399">Top 3</b> → acompañamiento 1:1 en finanzas por 3 meses + libro (valor $1.500.000), gratis</li>
    </ul>
    <p style="font-size:13px;color:#A1A1A6;margin:18px 0 6px">Tu link para compartir:</p>
    <div style="background:#101014;border:1px solid rgba(52,211,153,.3);border-radius:12px;padding:13px 15px;font-family:'JetBrains Mono',monospace;font-size:14px;color:#5EEAB8;word-break:break-all">${link}</div>
    <div style="text-align:center;margin:20px 0 8px">
      <a href="https://wa.me/?text=${waMsg}" style="display:inline-block;background:#34D399;color:#08231A;font-weight:700;text-decoration:none;padding:13px 26px;border-radius:14px;font-size:15px">Compartir por WhatsApp</a>
    </div>
    <div style="text-align:center;margin:0 0 22px">
      <a href="${panel}" style="color:#5EEAB8;font-size:14px;text-decoration:underline">Ver mi progreso y el ranking →</a>
    </div>
    <p style="font-size:13px;line-height:1.6;color:#8A8A90;margin:0">Solo cuentan los amigos que se inscriban de verdad. Nos vemos el 30 —<span style="color:#34D399">tu plata, clara.</span></p>
  </div></body></html>`;
}

function notifyHtml(r, total) {
  return `<!doctype html><html><head><meta charset="utf-8"></head><body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111">
  <h2 style="margin:0 0 12px">Nuevo registro en la waitlist 🎉</h2>
  <p style="margin:4px 0"><b>Correo:</b> ${esc(r.email)}</p>
  <p style="margin:4px 0"><b>Perfil:</b> ${esc(r.perfil)}</p>
  ${r.nombre ? '<p style="margin:4px 0"><b>Nombre:</b> ' + esc(r.nombre) + '</p>' : ''}
  ${r.referredBy ? '<p style="margin:4px 0"><b>Referido por:</b> ' + esc(r.referredBy) + '</p>' : ''}
  ${r.origen ? '<p style="margin:4px 0"><b>Origen:</b> ' + esc(r.origen) + '</p>' : ''}
  <p style="margin:12px 0 0;color:#666">Total en la lista: ${total}</p>
  </body></html>`;
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}
