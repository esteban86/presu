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
  { min: 7, name: 'Círculo privado' },
  { min: 15, name: 'Masterclass' },
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
      const meResp = { referrals: n, ...tierFor(n), link: SITE + '/?ref=' + code };
      if (n >= 7) meResp.unlock = { whatsapp: env.CIRCULO_WHATSAPP || '', roadmap: true, masterclass: n >= 15 };
      return json(meResp, 200, pub);
    }
    if (request.method === 'GET' && path === '/leaderboard') {
      let lb = [];
      try { lb = JSON.parse((await env.WAITLIST.get('leaderboard')) || '[]'); } catch (e) {}
      return json({ top: lb.slice(0, 25).map(function (x) { return { name: x.name, count: x.count }; }) }, 200, pub);
    }
    if (request.method === 'GET' && path === '/founders') {
      let lb = [];
      try { lb = JSON.parse((await env.WAITLIST.get('leaderboard')) || '[]'); } catch (e) {}
      const founders = lb.filter(function (x) { return x.count >= TIERS[0].min; }).map(function (x) { return { name: x.name, count: x.count }; });
      return json({ founders: founders, total: founders.length }, 200, pub);
    }
    if (request.method === 'GET' && path === '/roadmap') return roadmapList(request, env, pub, url);
    if (path === '/roadmap/propose') return roadmapPropose(request, env, cors);
    if (path === '/roadmap/vote') return roadmapVote(request, env, cors);

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
      if (mail.welcome && mail.welcome.ok) { await env.WAITLIST.put('welcomed:' + email, String(Date.now())); await env.WAITLIST.put('campaign:' + email, 'welcome'); }
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
  // ¿Cruzó un nivel justo ahora? Envía el correo de desbloqueo (best-effort).
  const crossed = TIERS.find(function (t) { return t.min === count; });
  if (crossed && env.RESEND_API_KEY) {
    try { await sendResend(env, { to: referrer, reply_to: env.NOTIFY_EMAIL || undefined, subject: tierSubject(crossed), html: tierEmailHtml(crossed, rrec, env) }); } catch (e) {}
  }
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

// ── Roadmap privado del Círculo (7+ referidos) ───────────────
async function circuloMember(env, code) {
  if (!code) return null;
  const email = await env.WAITLIST.get('code:' + code);
  if (!email) return null;
  const n = parseInt((await env.WAITLIST.get('referrals:' + email)) || '0', 10);
  return n >= 7 ? email : null;
}
async function genFeatureId(env) {
  for (let t = 0; t < 6; t++) {
    const a = new Uint8Array(8); crypto.getRandomValues(a);
    let c = ''; for (let i = 0; i < 8; i++) c += CODE_ALPHABET[a[i] % CODE_ALPHABET.length];
    if (!(await env.WAITLIST.get('feature:' + c))) return c;
  }
  return null;
}
async function roadmapList(request, env, pub, url) {
  const code = (url.searchParams.get('code') || '').trim().toUpperCase();
  const member = await circuloMember(env, code);
  if (!member) return json({ error: 'forbidden' }, 403, pub);
  const list = await env.WAITLIST.list({ prefix: 'feature:', limit: 200 });
  const feats = [];
  for (const k of list.keys) {
    try {
      const f = JSON.parse(await env.WAITLIST.get(k.name));
      f.voted = !!(await env.WAITLIST.get('voted:' + f.id + ':' + code));
      feats.push(f);
    } catch (e) {}
  }
  feats.sort(function (a, b) { return (b.votes || 0) - (a.votes || 0) || (b.ts || 0) - (a.ts || 0); });
  return json({ features: feats }, 200, pub);
}
async function roadmapPropose(request, env, cors) {
  if (request.method !== 'POST') return json({ error: 'method' }, 405, cors);
  let b; try { b = await request.json(); } catch (e) { return json({ error: 'json' }, 400, cors); }
  const code = String(b.code || '').trim().toUpperCase();
  const member = await circuloMember(env, code);
  if (!member) return json({ error: 'forbidden' }, 403, cors);
  const title = String(b.title || '').trim().slice(0, 120);
  if (title.length < 3) return json({ error: 'title' }, 400, cors);
  const desc = String(b.desc || '').trim().slice(0, 400);
  const id = await genFeatureId(env);
  let rec = {}; try { rec = JSON.parse((await env.WAITLIST.get('email:' + member)) || '{}'); } catch (e) {}
  const f = { id, title, desc, by: displayName(rec, member), ts: Date.now(), votes: 1 };
  await env.WAITLIST.put('feature:' + id, JSON.stringify(f));
  await env.WAITLIST.put('voted:' + id + ':' + code, '1');
  return json({ ok: true, id }, 200, cors);
}
async function roadmapVote(request, env, cors) {
  if (request.method !== 'POST') return json({ error: 'method' }, 405, cors);
  let b; try { b = await request.json(); } catch (e) { return json({ error: 'json' }, 400, cors); }
  const code = String(b.code || '').trim().toUpperCase();
  const member = await circuloMember(env, code);
  if (!member) return json({ error: 'forbidden' }, 403, cors);
  const id = String(b.id || '').trim();
  const raw = await env.WAITLIST.get('feature:' + id);
  if (!raw) return json({ error: 'not_found' }, 404, cors);
  const f = JSON.parse(raw);
  const vk = 'voted:' + id + ':' + code;
  const has = await env.WAITLIST.get(vk);
  if (has) { await env.WAITLIST.delete(vk); f.votes = Math.max(0, (f.votes || 0) - 1); }
  else { await env.WAITLIST.put(vk, '1'); f.votes = (f.votes || 0) + 1; }
  await env.WAITLIST.put('feature:' + id, JSON.stringify(f));
  return json({ ok: true, votes: f.votes, voted: !has }, 200, cors);
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
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#08080A;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#F4F4F3">
  <div style="max-width:540px;margin:0 auto;padding:32px 24px">
    <div style="font-size:24px;font-weight:800;letter-spacing:-.02em;margin-bottom:18px">presu<span style="color:#34D399">.</span></div>
    <p style="font-size:16px;color:#A1A1A6;margin:0 0 6px">${hola}</p>
    <h1 style="font-size:30px;line-height:1.12;font-weight:800;letter-spacing:-.02em;margin:0 0 12px;color:#fff">¡Ya eres pionero! <span style="color:#34D399">🎉</span></h1>
    <p style="font-size:16px;line-height:1.55;color:#D4D4D6;margin:0 0 22px">Tus bonos ya están <b style="color:#fff">asegurados</b>. Ahora viene lo mejor: <b style="color:#34D399">comparte tu link y vuélvete Fundador</b> —cada amigo que entra te sube de nivel.</p>
    <div style="background:#0E2A20;border:1px solid rgba(52,211,153,.5);border-radius:20px;padding:24px 20px;text-align:center;margin:0 0 26px">
      <div style="font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#5EEAB8;margin-bottom:12px">Tu link para invitar</div>
      <div style="background:#08080A;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:12px 10px;font-family:'JetBrains Mono',monospace;font-size:13px;color:#5EEAB8;word-break:break-all;margin-bottom:18px">${link}</div>
      <a href="https://wa.me/?text=${waMsg}" style="display:block;background:#34D399;color:#08231A;font-weight:800;font-size:17px;text-decoration:none;padding:16px;border-radius:14px">📲 Compartir por WhatsApp</a>
      <div style="font-size:13px;color:#8A8A90;margin-top:12px">Pásalo a quien le sirva tener su plata clara 🌱</div>
    </div>
    <p style="font-size:15px;line-height:1.6;color:#D4D4D6;margin:0 0 10px"><b style="color:#fff">Cada amigo te sube de nivel:</b></p>
    <ul style="font-size:15px;line-height:1.7;color:#D4D4D6;margin:0 0 18px;padding-left:20px">
      <li><b style="color:#fff">3</b> → Fundador (insignia + Muro)</li>
      <li><b style="color:#fff">7</b> → Círculo privado (grupo + voto en el roadmap)</li>
      <li><b style="color:#fff">15</b> → Masterclass de Asimétrica</li>
    </ul>
    <div style="border:1px solid rgba(52,211,153,.45);border-radius:16px;padding:15px 18px;margin:0 0 24px">
      <span style="font-size:15px;line-height:1.5;color:#D4D4D6">🏆 <b style="color:#fff">Top 3 al cierre</b>: acompañamiento 1:1 en finanzas por 3 meses + libro <b style="color:#34D399">(valor $1.500.000), gratis.</b></span>
    </div>
    <div style="text-align:center;margin:0 0 20px">
      <a href="${panel}" style="color:#5EEAB8;font-size:15px;font-weight:600;text-decoration:none">Ver mi panel y el ranking →</a>
    </div>
    <p style="font-size:12px;line-height:1.6;color:#6B6B72;margin:0;text-align:center">Solo cuentan los amigos que se inscriban de verdad. <span style="color:#34D399">Tu plata, clara.</span></p>
  </div></body></html>`;
}

function tierSubject(t) {
  if (t.min === 3) return '¡Eres Fundador de Presu! 🏅';
  if (t.min === 7) return '¡Entraste al Círculo privado! 🎉';
  return '¡Desbloqueaste la Masterclass de Asimétrica! 🎓';
}
function tierEmailHtml(t, rec, env) {
  const panel = SITE + '/fundador.html?code=' + (rec.ref || '');
  const muro = SITE + '/muro.html';
  const c = 'font-size:15px;line-height:1.6;color:#D4D4D6;margin:0 0 14px';
  const hola = rec.nombre ? 'Hola, ' + esc(rec.nombre) + ' 👋' : 'Hola 👋';
  const h = 'font-size:24px;font-weight:800;color:#fff;letter-spacing:-.01em;margin:0 0 12px';
  const sub = 'color:#A1A1A6';
  let body;
  if (t.min === 3) {
    body = '<h1 style="' + h + '">¡Eres Fundador! 🏅</h1>'
      + '<p style="' + c + '">Llegaste a <b style="color:#34D399">3 referidos efectivos</b> —eres de las personas que está <b style="color:#F4F4F3">construyendo Presu desde el día cero</b>. Esto desbloqueas:</p>'
      + '<ul style="' + c + ';padding-left:18px">'
      + '<li>🏅 <b style="color:#F4F4F3">Insignia de Fundador</b> — tu estatus dentro de la comunidad y el producto.</li>'
      + '<li>🧱 <b style="color:#F4F4F3"><a href="' + muro + '" style="color:#5EEAB8">Muro de Fundadores</a></b> — tu nombre ya está publicado ahí, a la vista de todos.</li>'
      + '</ul>'
      + '<p style="' + c + '">Y conservas todos tus bonos de pionero. <b style="color:#F4F4F3">A 4 referidos del Círculo privado</b> (grupo + voto en el roadmap). <a href="' + panel + '" style="color:#5EEAB8">Ver mi panel →</a></p>';
  } else if (t.min === 7) {
    const wa = env.CIRCULO_WHATSAPP || '';
    body = '<h1 style="' + h + '">¡Entraste al Círculo privado! 🎉</h1>'
      + '<p style="' + c + '">Con <b style="color:#34D399">7 referidos</b> llegaste al núcleo de Presu:</p>'
      + (wa ? '<div style="text-align:center;margin:0 0 18px"><a href="' + wa + '" style="display:inline-block;background:#34D399;color:#08231A;font-weight:800;text-decoration:none;padding:14px 26px;border-radius:14px;font-size:16px">Unirme al grupo privado →</a></div>' : '')
      + '<div style="background:#101014;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:16px 18px;margin:0 0 16px">'
      + '<p style="' + c + ';margin:0 0 13px">👥 <b style="color:#fff">Grupo privado de Fundadores</b><br><span style="' + sub + '">Canal directo con el equipo de Asimétrica y los demás Fundadores: ves las novedades antes que nadie y tu feedback decide qué construimos.</span></p>'
      + '<p style="' + c + ';margin:0">🗳️ <b style="color:#fff"><a href="' + SITE + '/roadmap.html?code=' + (rec.ref || '') + '" style="color:#5EEAB8">Voto en el roadmap</a></b><br><span style="' + sub + '">Entra al tablero privado a proponer funciones y votar las próximas. Lo más votado se construye: tú decides qué sigue.</span></p>'
      + '</div>'
      + '<p style="' + c + '">Sigue: a <b style="color:#F4F4F3">15</b> desbloqueas la <b style="color:#F4F4F3">Masterclass de Asimétrica</b>, y el <b style="color:#34D399">Top 3</b> se lleva el 1:1 (3 meses) + libro ($1.500.000). <a href="' + panel + '" style="color:#5EEAB8">Ver mi panel →</a></p>';
  } else {
    body = '<h1 style="' + h + '">¡Desbloqueaste la Masterclass! 🎓</h1>'
      + '<p style="' + c + '">Con <b style="color:#34D399">15 referidos</b> te ganaste un cupo en la <b style="color:#F4F4F3">Masterclass de Asimétrica</b> —una sesión en vivo de nuestra firma de CFO sobre cómo poner tu plata en orden, solo para los Fundadores que más han corrido la voz. <b style="color:#F4F4F3">Te avisamos la fecha.</b></p>'
      + '<p style="' + c + '">Y estás peleando de frente por el <b style="color:#34D399">Top 3</b>: acompañamiento 1:1 en finanzas (3 meses) + libro (valor $1.500.000), gratis. <a href="' + panel + '" style="color:#5EEAB8">Ver el ranking →</a></p>';
  }
  return '<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#08080A;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#F4F4F3"><div style="max-width:520px;margin:0 auto;padding:36px 28px"><div style="font-size:26px;font-weight:700;letter-spacing:-.02em;margin-bottom:22px">presu<span style="color:#34D399">.</span></div><p style="font-size:18px;margin:0 0 16px">' + hola + '</p>' + body + '<p style="font-size:13px;color:#8A8A90;margin:18px 0 0">Tu plata, clara.</p></div></body></html>';
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
