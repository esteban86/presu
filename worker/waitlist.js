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

const SITE = 'https://presu.io';
const ALLOWED_ORIGINS = [SITE, 'https://www.presu.io', 'https://presu.asimetrica.co', 'https://presu.com.co', 'http://localhost:4821', 'http://localhost:4796'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FROM = 'Presu <presu@asimetrica.co>';
// Header de marca para correos: banner oscuro (#08080A) full-width con el wordmark,
// como IMAGEN. Gmail invierte colores CSS pero NO imágenes → el header se mantiene
// oscuro aunque el cliente fuerce el cuerpo a claro (dark-mode inversion).
const EMAIL_HEADER = '<img src="https://presu.io/presu-email-header.png?v=1" alt="Presu" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;margin:0 auto">';
// Destinos permitidos para /r (evita open-redirect). El link del correo usa
// presu.io/r (endpoint on-demand en Pages, src/pages/r.js) que hace proxy a
// este /r; así el enlace es branded sin apagar workers.dev.
const REDIRECT_DEST = { descargar: '/descargar', encuesta: '/encuesta.html', inicio: '/' };
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const DISPOSABLE = ['mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com', 'temp-mail.org', 'yopmail.com', 'trashmail.com', 'getnada.com', 'sharklasers.com', 'maildrop.cc', 'dispostable.com', 'fakeinbox.com', 'mohmal.com'];
const TIERS = [
  { min: 3, name: 'Fundador' },
  { min: 7, name: 'Círculo privado' },
  { min: 15, name: 'Masterclass' },
];
const CAP = 1000; // cupos máximos antes del lanzamiento; al llegar, se cierran los registros.
const CAMPAIGN_SUBJECT = 'Presu abrió 🌿 ya ves a dónde se va tu plata';
const CAMPAIGN_BATCH = 30; // envíos por disparo del cron (bajo el límite de subrequests)
// La tanda 1 (Pioneros) cerró el 30-jun-2026; desde el 1-jul es Nueva Ola.
// Cohorte = Nueva Ola si se registró tras el corte O trae el tag origen=tanda2
// (el tag solo no basta: 11 registros post-corte llegaron sin él). 1-jul 00:00 Bogotá (UTC-5).
const OLA2_CUTOFF = Date.UTC(2026, 6, 1, 5);
function cohortOf(r) { return (r && (r.origen === 'tanda2' || (r.ts || 0) >= OLA2_CUTOFF)) ? 'tanda2' : 'pionero'; }
const TEST_EMAILS = ['x@x.com', 'prueba@asimetrica.co', 'prueba.worker@asimetrica.co', 'esteban.restrepo@bpt.global', 'debug1@aleph0.com.co', 'pionero.prueba@aleph0.com.co', 'chequeo.cuota@aleph0.com.co', 'esteban@aleph0.com.co'];
function isTestEmail(e) { return TEST_EMAILS.indexOf(e) !== -1 || e.indexOf('+') !== -1 || e.indexOf('diag-') === 0; }

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowOrigin = (ALLOWED_ORIGINS.includes(origin) || /^https:\/\/([a-z0-9-]+\.)?(presu-staging|presu-8h8)\.pages\.dev$/.test(origin)) ? origin : ALLOWED_ORIGINS[0];
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
    if (request.method === 'GET' && path === '/admin/waitlist') return adminWaitlist(request, env, cors, url);
    if (request.method === 'GET' && path === '/admin/clicks') return adminClicks(request, env, cors);

    if (request.method === 'GET' && path === '/r') return trackRedirect(request, env, url);

    if (request.method === 'GET' && path === '/count') {
      const count = parseInt((await env.WAITLIST.get('meta:count')) || '0', 10);
      return json({ count, cap: CAP }, 200, pub);
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
      return json({ top: lb.slice(0, 25).map(function (x) { return { name: publicName(x), count: x.count }; }) }, 200, pub);
    }
    if (request.method === 'GET' && path === '/founders') {
      let lb = [];
      try { lb = JSON.parse((await env.WAITLIST.get('leaderboard')) || '[]'); } catch (e) {}
      const founders = lb.filter(function (x) { return x.count >= TIERS[0].min; }).map(function (x) { return { name: publicName(x), count: x.count }; });
      return json({ founders: founders, total: founders.length }, 200, pub);
    }
    if (request.method === 'GET' && path === '/roadmap') return roadmapList(request, env, pub, url);
    if (path === '/roadmap/propose') return roadmapPropose(request, env, cors);
    if (path === '/roadmap/vote') return roadmapVote(request, env, cors);

    if (request.method === 'GET' && path === '/survey') return surveyCheck(request, env, pub, url);
    if (request.method === 'POST' && path === '/survey') return surveySubmit(request, env, cors);
    if (request.method === 'GET' && path === '/admin/survey') return adminSurvey(request, env, cors);
    if (path === '/admin/survey-batch') return adminSurveyBatch(request, env, cors);
    if (path === '/admin/survey-one') return adminSurveyOne(request, env, cors);
    if (path === '/admin/followup-batch') return adminFollowupBatch(request, env, cors);
    if (path === '/admin/followup-one') return adminFollowupOne(request, env, cors);
    if (request.method === 'GET' && path === '/es-pionero') return esPioneroCheck(request, env, pub, url);

    if (request.method === 'POST' && path === '/contrib') return contribSubmit(request, env, cors);
    if (request.method === 'GET' && path === '/contrib/progress') return contribProgress(request, env, pub);
    if (request.method === 'GET' && path === '/contrib/wall') return contribWall(request, env, pub);
    if (request.method === 'GET' && path === '/admin/contrib') return adminContrib(request, env, cors);
    if (request.method === 'GET' && path === '/admin/contrib/export') return adminContribExport(request, env, cors);
    if (request.method === 'GET' && path === '/admin/doc') return adminDoc(request, env, url);

    if (request.method !== 'POST') return json({ status: 'error', reason: 'method' }, 405, cors);

    let data;
    try { data = await request.json(); } catch (e) { return json({ status: 'error', reason: 'json' }, 400, cors); }
    if (data.botcheck) return json({ status: 'ok' }, 200, cors); // honeypot

    const email = String(data.correo || data.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email) || isDisposable(email)) return json({ status: 'error', reason: 'email' }, 400, cors);

    // Dedup
    if (await env.WAITLIST.get('email:' + email)) return json({ status: 'already' }, 200, cors);

    // Cupo: solo CAP suscriptores antes del lanzamiento.
    if (parseInt((await env.WAITLIST.get('meta:count')) || '0', 10) >= CAP) return json({ status: 'full', cap: CAP }, 200, cors);

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
      const isLate = record.origen === 'tanda2';
      mail.welcome = await sendResend(env, { to: email, reply_to: env.NOTIFY_EMAIL || undefined, subject: isLate ? 'Estás dentro 🌊 el 15 ves tu plata clara' : 'Ya eres Pionero 🌿 tu plata por fin clara', html: isLate ? lateWelcomeHtml(record) : welcomeHtml(record) });
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
function maskEmail(email) {
  const parts = (email || '').split('@');
  const u = parts[0] || '', dom = parts[1] || '';
  const masked = u.length <= 5 ? u + '***' : u.slice(0, 4) + '***' + u.slice(-1);
  return masked + (dom ? '@' + dom : '');
}
function displayName(rec, email) {
  const n = ((rec && rec.nombre) || '').trim();
  if (n) { const p = n.split(/\s+/); return p[0] + (p[1] ? ' ' + p[1][0].toUpperCase() + '.' : ''); }
  return maskEmail(email);
}
// Para el ranking público: respeta el nombre real si lo hay; si no, enmascara el correo guardado.
function publicName(entry) {
  const nm = (entry && entry.name) || '';
  if (nm && nm.indexOf('@') === -1 && nm.indexOf('***') === -1) return nm;
  return maskEmail(entry && entry.email);
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
  const res = await sendResend(env, { to: email, reply_to: env.NOTIFY_EMAIL || undefined, subject: 'Ya eres Pionero 🌿 tu plata por fin clara', html: welcomeHtml(rec) });
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

// GET /admin/waitlist — exporta TODA la waitlist (JSON, o ?format=csv). Token.
// Pensado para conectar la app: email + nombre + perfil + cohort (pionero/tanda2) + código + fecha.
async function adminWaitlist(request, env, cors, url) {
  if (!authed(request, env)) return json({ error: 'unauthorized' }, 401, cors);
  // 1) recolecta todas las keys (paginado)
  const names = [];
  let cursor = undefined, done = false;
  while (!done) {
    const list = await env.WAITLIST.list({ prefix: 'email:', limit: 1000, cursor });
    for (const k of list.keys) names.push(k.name);
    if (list.list_complete) { done = true; } else { cursor = list.cursor; }
  }
  // 2) lee los registros en PARALELO, por lotes (rápido)
  const rows = [];
  const BATCH = 50;
  for (let i = 0; i < names.length; i += BATCH) {
    const recs = await Promise.all(names.slice(i, i + BATCH).map(function (name) {
      return env.WAITLIST.get(name).then(function (v) { let r = {}; try { r = JSON.parse(v || '{}'); } catch (e) {} return { name, r }; });
    }));
    for (const { name, r } of recs) {
      rows.push({
        email: name.slice(6),
        nombre: r.nombre || '',
        celular: r.celular || '',
        perfil: r.perfil || '',
        empresa: r.empresa || '',
        origen: r.origen || '',
        cohort: cohortOf(r),
        ref: r.ref || '',
        referredBy: r.referredBy || '',
        ts: r.ts || 0,
        clickDevice: r.clickDevice || '',
        clickedAt: r.clickedAt || 0,
        clickCount: r.clickCount || 0,
      });
    }
  }
  rows.sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });
  if ((url.searchParams.get('format') || '') === 'csv') {
    const cols = ['email', 'nombre', 'celular', 'perfil', 'empresa', 'origen', 'cohort', 'ref', 'referredBy', 'ts', 'clickDevice', 'clickedAt', 'clickCount'];
    const q = function (s) { return '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"'; };
    const lines = [cols.join(',')].concat(rows.map(function (r) { return cols.map(function (c) { return q(r[c]); }).join(','); }));
    return new Response(lines.join('\n'), { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="presu-waitlist.csv"', ...cors } });
  }
  return json({ total: rows.length, rows }, 200, cors);
}
function authed(request, env) { return env.ADMIN_TOKEN && (request.headers.get('X-Admin-Token') || '') === env.ADMIN_TOKEN; }

// GET /admin/clicks — agrega los eventos click:<correo>:<ts> (device, destino, campaña). Token.
async function adminClicks(request, env, cors) {
  if (!authed(request, env)) return json({ error: 'unauthorized' }, 401, cors);
  const names = [];
  let cursor, done = false;
  while (!done) {
    const l = await env.WAITLIST.list({ prefix: 'click:', limit: 1000, cursor });
    for (const k of l.keys) names.push(k.name);
    if (l.list_complete) { done = true; } else { cursor = l.cursor; }
  }
  const byDevice = {}, byTo = {}, byCampaign = {}, perPerson = {};
  const BATCH = 100;
  for (let i = 0; i < names.length; i += BATCH) {
    const vals = await Promise.all(names.slice(i, i + BATCH).map(function (n) {
      return env.WAITLIST.get(n).then(function (v) {
        let r = {}; try { r = JSON.parse(v || '{}'); } catch (e) {}
        const rest = n.slice(6); const li = rest.lastIndexOf(':'); r.email = li > 0 ? rest.slice(0, li) : rest; // click:<email>:<ts>
        return r;
      });
    }));
    for (const e of vals) {
      const dev = e.device || '?', to = e.to || '?', c = e.c || '(sin campaña)';
      byDevice[dev] = (byDevice[dev] || 0) + 1;
      byTo[to] = (byTo[to] || 0) + 1;
      byCampaign[c] = (byCampaign[c] || 0) + 1;
      const p = perPerson[e.email] || (perPerson[e.email] = { email: e.email, clicks: 0, lastAt: 0, lastDevice: '', tos: {} });
      p.clicks++;
      p.tos[to] = (p.tos[to] || 0) + 1;
      if ((e.ts || 0) > p.lastAt) { p.lastAt = e.ts || 0; p.lastDevice = dev; }
    }
  }
  const people = Object.keys(perPerson).map(function (k) { return perPerson[k]; }).sort(function (a, b) { return b.lastAt - a.lastAt; });
  return json({ totalClicks: names.length, uniquePeople: people.length, byDevice, byTo, byCampaign, people }, 200, cors);
}

// GET /r?e=&to=&c= — link de correo con tracking: registra el clic (correo + device
// + timestamp, todo server-side desde el User-Agent) en KV y redirige al destino.
async function trackRedirect(request, env, url) {
  const e = (url.searchParams.get('e') || '').trim().toLowerCase();
  const to = (url.searchParams.get('to') || '').trim();
  const c = (url.searchParams.get('c') || '').trim().slice(0, 40);
  const path = REDIRECT_DEST[to] || '/';
  let dest = SITE + path;
  if (e) dest += (path.indexOf('?') > -1 ? '&' : '?') + 'e=' + encodeURIComponent(e) + (to === 'encuesta' ? '&nuevo=1' : '');
  try {
    if (e && EMAIL_RE.test(e)) {
      const ua = request.headers.get('user-agent') || '';
      const device = /iPad|Tablet/i.test(ua) ? 'tablet' : /Mobi|Android|iPhone|iPod|Windows Phone/i.test(ua) ? 'mobile' : 'desktop';
      const ts = Date.now();
      await env.WAITLIST.put('click:' + e + ':' + ts, JSON.stringify({ to, c, device, ts, ua: ua.slice(0, 180) }), { expirationTtl: 60 * 60 * 24 * 365 });
      const raw = await env.WAITLIST.get('email:' + e);
      if (raw) {
        let r = {}; try { r = JSON.parse(raw); } catch (err) {}
        r.clickedAt = ts; r.clickDevice = device; r.clickTo = to; r.clickCount = (r.clickCount || 0) + 1;
        await env.WAITLIST.put('email:' + e, JSON.stringify(r));
      }
    }
  } catch (err) { /* el tracking nunca debe romper la redirección */ }
  return Response.redirect(dest, 302);
}

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

// ── Encuesta de perfil (buyer persona) ───────────────────────
const SURVEY_FIELDS = ['nombre', 'uso', 'features', 'valor', 'falta', 'freno', 'ayuda_config', 'edad', 'ciudad', 'ocupacion', 'ingreso_tipo', 'metodo', 'metas', 'bancos', 'bancos_otra', 'dispositivo', 'dolor', 'pago', 'ingreso', 'ayuda', 'celular'];
const SURVEY_ARRAY_FIELDS = ['bancos', 'metas', 'ayuda', 'features'];
const SURVEY_SUBJECT = '¿Qué le falta a tu Presu?';
const FOLLOWUP_SUBJECT = 'En 3 min ves a dónde se va tu plata';

// GET /es-pionero?e=correo → { pionero: bool } — puerta suave de la página /descargar (solo pioneros).
async function esPioneroCheck(request, env, pub, url) {
  const email = String(url.searchParams.get('e') || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return json({ pionero: false }, 200, pub);
  const raw = await env.WAITLIST.get('email:' + email);
  if (!raw) return json({ pionero: false }, 200, pub);
  let rec = {}; try { rec = JSON.parse(raw); } catch (e) {}
  rec.email = email;
  return json({ pionero: cohortOf(rec) === 'pionero' }, 200, pub);
}

// GET /survey?e=correo → ¿está en la lista?, ¿ya respondió?, nombre + answers previos (para precargar/reanudar)
async function surveyCheck(request, env, pub, url) {
  const email = String(url.searchParams.get('e') || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return json({ found: false }, 200, pub);
  const raw = await env.WAITLIST.get('email:' + email);
  if (!raw) return json({ found: false }, 200, pub);
  let rec = {}; try { rec = JSON.parse(raw); } catch (e) {}
  let sv = {}; const svRaw = await env.WAITLIST.get('survey:' + email);
  if (svRaw) { try { sv = JSON.parse(svRaw); } catch (e) {} }
  return json({ found: true, answered: !!svRaw, completed: !!sv.completed, nombre: rec.nombre || '', celular: rec.celular || '', answers: sv.answers || {} }, 200, pub);
}

// POST /survey {email, answers, complete?} → guarda de forma INCREMENTAL (merge), solo si el correo ya está en la waitlist.
// Cada envío parcial fusiona sus campos con lo ya guardado, así no se pierde nada si abandonan a la mitad.
async function surveySubmit(request, env, cors) {
  let body; try { body = await request.json(); } catch (e) { return json({ status: 'error', reason: 'json' }, 400, cors); }
  if (body.botcheck) return json({ status: 'ok' }, 200, cors); // honeypot
  const email = String(body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return json({ status: 'error', reason: 'email' }, 400, cors);
  if (!(await env.WAITLIST.get('email:' + email))) return json({ status: 'error', reason: 'not_in_list' }, 403, cors);
  const ans = body.answers || {};
  const clean = {};
  for (const k of SURVEY_FIELDS) {
    if (ans[k] == null || ans[k] === '') continue;
    if (SURVEY_ARRAY_FIELDS.indexOf(k) >= 0) clean[k] = (Array.isArray(ans[k]) ? ans[k] : []).map(function (s) { return String(s).slice(0, 80); }).slice(0, 25);
    else clean[k] = String(ans[k]).slice(0, 280);
  }
  // Backfill al registro de la waitlist: nombre (si falta) y celular (para que salga en el export).
  if (clean.nombre || clean.celular) {
    try {
      const wl = JSON.parse((await env.WAITLIST.get('email:' + email)) || '{}');
      let changed = false;
      if (clean.nombre && !wl.nombre) { wl.nombre = clean.nombre.slice(0, 80); changed = true; }
      if (clean.celular && wl.celular !== clean.celular.slice(0, 40)) { wl.celular = clean.celular.slice(0, 40); changed = true; }
      if (changed) await env.WAITLIST.put('email:' + email, JSON.stringify(wl));
    } catch (e) {}
  }
  // Merge incremental: fusiona los campos entrantes con los ya guardados.
  let prevObj = {}; const prevRaw = await env.WAITLIST.get('survey:' + email);
  if (prevRaw) { try { prevObj = JSON.parse(prevRaw); } catch (e) {} }
  const mergedAnswers = Object.assign({}, prevObj.answers || {}, clean);
  const completed = !!body.complete || !!prevObj.completed;
  await env.WAITLIST.put('survey:' + email, JSON.stringify({ email, answers: mergedAnswers, ts: Date.now(), updated: !!prevRaw, completed: completed }));
  if (!prevRaw) await env.WAITLIST.put('meta:surveys', String(parseInt((await env.WAITLIST.get('meta:surveys')) || '0', 10) + 1));
  return json({ status: prevRaw ? 'updated' : 'ok' }, 200, cors);
}

// GET /admin/survey → todas las respuestas cruzadas con datos de la waitlist (token)
async function adminSurvey(request, env, cors) {
  if (!authed(request, env)) return json({ error: 'unauthorized' }, 401, cors);
  const list = await env.WAITLIST.list({ prefix: 'survey:', limit: 1000 });
  const rows = [];
  for (const k of list.keys) {
    let s = {}; try { s = JSON.parse(await env.WAITLIST.get(k.name)); } catch (e) { continue; }
    const email = s.email || k.name.slice(7);
    let wl = {}; try { wl = JSON.parse((await env.WAITLIST.get('email:' + email)) || '{}'); } catch (e) {}
    const referrals = parseInt((await env.WAITLIST.get('referrals:' + email)) || '0', 10);
    rows.push(Object.assign({ email, ts: s.ts || 0, referrals, origen: wl.origen || '', perfil: wl.perfil || '', signup: wl.ts || 0, completed: !!s.completed }, s.answers));
  }
  rows.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
  return json({ total: rows.length, rows }, 200, cors);
}

// Envío de la invitación a la encuesta (manual o por lotes) — flag aparte: survey_sent:
async function runSurveyBatch(env, limit) {
  const list = await env.WAITLIST.list({ prefix: 'email:', limit: 1000 });
  let sent = 0, skipped = 0, errors = 0;
  for (const k of list.keys) {
    if (sent >= limit) break;
    const email = k.name.slice(6);
    if (await env.WAITLIST.get('survey_sent:' + email)) { skipped++; continue; }
    if (isTestEmail(email) || isDisposable(email)) { await env.WAITLIST.put('survey_sent:' + email, 'skip'); skipped++; continue; }
    let rec = {}; try { rec = JSON.parse((await env.WAITLIST.get('email:' + email)) || '{}'); } catch (e) {}
    rec.email = email;
    if (!env.RESEND_API_KEY) { errors++; continue; }
    const res = await sendResend(env, { to: email, reply_to: env.NOTIFY_EMAIL || undefined, subject: SURVEY_SUBJECT, html: surveyEmailHtml(rec) });
    if (res.ok) { await env.WAITLIST.put('survey_sent:' + email, String(Date.now())); sent++; } else errors++;
  }
  return { sent, skipped, errors, scanned: list.keys.length };
}

// Seguimiento a PIONEROS: instalador (presu.io/descargar) + encuesta. Flag aparte: followup_sent:
// Excluye la Nueva Ola (cohortOf === 'tanda2'), que tiene su propio flujo de bienvenida.
async function runFollowupBatch(env, limit) {
  const list = await env.WAITLIST.list({ prefix: 'email:', limit: 1000 });
  let sent = 0, skipped = 0, errors = 0;
  for (const k of list.keys) {
    if (sent >= limit) break;
    const email = k.name.slice(6);
    if (await env.WAITLIST.get('followup_sent:' + email)) { skipped++; continue; }
    if (isTestEmail(email) || isDisposable(email)) { await env.WAITLIST.put('followup_sent:' + email, 'skip'); skipped++; continue; }
    let rec = {}; try { rec = JSON.parse((await env.WAITLIST.get('email:' + email)) || '{}'); } catch (e) {}
    rec.email = email;
    if (cohortOf(rec) !== 'pionero') { await env.WAITLIST.put('followup_sent:' + email, 'skip'); skipped++; continue; } // Nueva Ola: excluida
    if (!env.RESEND_API_KEY) { errors++; continue; }
    const res = await sendResend(env, { to: email, reply_to: env.NOTIFY_EMAIL || undefined, subject: FOLLOWUP_SUBJECT, html: followupHtml(rec) });
    if (res.ok) { await env.WAITLIST.put('followup_sent:' + email, String(Date.now())); sent++; } else errors++;
  }
  return { sent, skipped, errors, scanned: list.keys.length };
}
async function adminSurveyBatch(request, env, cors) {
  if (request.method !== 'POST') return json({ error: 'method' }, 405, cors);
  if (!authed(request, env)) return json({ error: 'unauthorized' }, 401, cors);
  let body = {}; try { body = await request.json(); } catch (e) {}
  const limit = Math.min(Number(body.limit) || 30, 40);
  return json(await runSurveyBatch(env, limit), 200, cors);
}
async function adminSurveyOne(request, env, cors) {
  if (request.method !== 'POST') return json({ error: 'method' }, 405, cors);
  if (!authed(request, env)) return json({ error: 'unauthorized' }, 401, cors);
  let body; try { body = await request.json(); } catch (e) { return json({ error: 'json' }, 400, cors); }
  const email = String(body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return json({ status: 'error', reason: 'email' }, 400, cors);
  let rec = {}; const raw = await env.WAITLIST.get('email:' + email);
  if (raw) { try { rec = JSON.parse(raw); } catch (e) {} }
  rec.email = email;
  const res = await sendResend(env, { to: email, reply_to: env.NOTIFY_EMAIL || undefined, subject: SURVEY_SUBJECT, html: surveyEmailHtml(rec) });
  if (res.ok) { await env.WAITLIST.put('survey_sent:' + email, String(Date.now())); return json({ status: 'sent', id: res.id }, 200, cors); }
  return json({ status: 'error', detail: res }, 502, cors);
}

async function adminFollowupBatch(request, env, cors) {
  if (request.method !== 'POST') return json({ error: 'method' }, 405, cors);
  if (!authed(request, env)) return json({ error: 'unauthorized' }, 401, cors);
  let body = {}; try { body = await request.json(); } catch (e) {}
  const limit = Math.min(Number(body.limit) || 30, 40);
  return json(await runFollowupBatch(env, limit), 200, cors);
}
// Envío individual (p. ej. prueba a uno mismo): NO filtra cohorte/test — manda a lo que le pidas.
async function adminFollowupOne(request, env, cors) {
  if (request.method !== 'POST') return json({ error: 'method' }, 405, cors);
  if (!authed(request, env)) return json({ error: 'unauthorized' }, 401, cors);
  let body; try { body = await request.json(); } catch (e) { return json({ error: 'json' }, 400, cors); }
  const email = String(body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return json({ status: 'error', reason: 'email' }, 400, cors);
  let rec = {}; const raw = await env.WAITLIST.get('email:' + email);
  if (raw) { try { rec = JSON.parse(raw); } catch (e) {} }
  rec.email = email;
  const res = await sendResend(env, { to: email, reply_to: env.NOTIFY_EMAIL || undefined, subject: FOLLOWUP_SUBJECT, html: followupHtml(rec) });
  if (res.ok) { await env.WAITLIST.put('followup_sent:' + email, String(Date.now())); return json({ status: 'sent', id: res.id }, 200, cors); }
  return json({ status: 'error', detail: res }, 502, cors);
}

// ── Aportes de documentos anonimizados (página /aporta) ──────
const CONTRIB_GOAL = 500;
const CONTRIB_MAXBYTES = 6 * 1024 * 1024; // 6MB por imagen (llegan ya comprimidas del cliente)
function slug(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'x';
}
async function contribBumpWall(env, key, name, count) {
  let lb = []; try { lb = JSON.parse((await env.WAITLIST.get('contrib_wall')) || '[]'); } catch (e) {}
  const i = lb.findIndex(function (x) { return x.key === key; });
  if (i >= 0) lb[i] = { key, name, count }; else lb.push({ key, name, count });
  lb.sort(function (a, b) { return b.count - a.count; });
  await env.WAITLIST.put('contrib_wall', JSON.stringify(lb.slice(0, 100)));
}

// POST /contrib — recibe imágenes YA anonimizadas (multipart) + metadatos; las guarda en R2.
async function contribSubmit(request, env, cors) {
  if (!env.DOCS) return json({ status: 'error', reason: 'no_storage' }, 500, cors);
  let form; try { form = await request.formData(); } catch (e) { return json({ status: 'error', reason: 'form' }, 400, cors); }
  if (form.get('botcheck')) return json({ status: 'ok' }, 200, cors); // honeypot
  const pais = (String(form.get('pais') || '').trim().slice(0, 4)) || 'XX';
  const banco = String(form.get('banco') || '').trim().slice(0, 60);
  const moneda = String(form.get('moneda') || '').trim().slice(0, 8);
  const tipo = String(form.get('tipo') || '').trim().slice(0, 20);
  const nombre = String(form.get('nombre') || '').trim().slice(0, 80);
  const ref = String(form.get('ref') || '').trim().slice(0, 80);
  const sid = String(form.get('sid') || '').trim().slice(0, 48) || crypto.randomUUID(); // agrupa páginas del mismo extracto
  if (!banco || !tipo) return json({ status: 'error', reason: 'fields' }, 400, cors);
  const docs = [];
  for (const entry of form.entries()) {
    const k = entry[0], v = entry[1];
    const m = /^doc(\d+)$/.exec(k);
    if (m && v && typeof v === 'object' && v.size) docs.push({ idx: parseInt(m[1], 10), file: v });
  }
  docs.sort(function (a, b) { return a.idx - b.idx; });
  if (!docs.length) return json({ status: 'error', reason: 'no_files' }, 400, cors);
  const ids = [];
  for (const d of docs) {
    const f = d.file;
    if (f.size > CONTRIB_MAXBYTES) return json({ status: 'error', reason: 'too_big' }, 413, cors);
    const id = crypto.randomUUID();
    const base = 'doc/' + pais + '/' + slug(banco) + '/' + id;
    const key = base + '.jpg';
    await env.DOCS.put(key, await f.arrayBuffer(), { httpMetadata: { contentType: 'image/jpeg' } });
    // Tokens con posición (x,y,w,h) anónimos → JSON estructurado para el parser. Sin PDF, sin PII.
    let parsed = null; try { parsed = JSON.parse(String(form.get('tokens' + d.idx) || 'null')); } catch (e) {}
    let jsonKey = null, txtKey = null, tokenCount = 0, source = '';
    if (parsed && Array.isArray(parsed.tokens)) {
      tokenCount = parsed.tokens.length;
      source = String(parsed.source || '').slice(0, 12);
      const layout = { id, submissionId: sid, page: d.idx, source, pais, banco, moneda, tipo, w: parsed.w || 0, h: parsed.h || 0, tokens: parsed.tokens.slice(0, 5000), ts: Date.now() };
      jsonKey = base + '.json';
      await env.DOCS.put(jsonKey, JSON.stringify(layout), { httpMetadata: { contentType: 'application/json; charset=utf-8' } });
      const flat = parsed.tokens.map(function (t) { return t.t; }).join(' ').slice(0, 80000);
      if (flat) { txtKey = base + '.txt'; await env.DOCS.put(txtKey, flat, { httpMetadata: { contentType: 'text/plain; charset=utf-8' } }); }
    }
    await env.WAITLIST.put('contrib:' + id, JSON.stringify({ id, submissionId: sid, page: d.idx, source, key, jsonKey, txtKey, tokenCount, pais, banco, moneda, tipo, size: f.size, ts: Date.now() }));
    ids.push(id);
  }
  const total = parseInt((await env.WAITLIST.get('meta:contribs')) || '0', 10) + ids.length;
  await env.WAITLIST.put('meta:contribs', String(total));
  const bankKey = 'contrib_bank:' + pais + ':' + slug(banco);
  await env.WAITLIST.put(bankKey, String(parseInt((await env.WAITLIST.get(bankKey)) || '0', 10) + ids.length));
  // Crédito opcional al colaborador: por correo o por código de Fundador
  let contributor = null;
  let email = EMAIL_RE.test(ref) ? ref.toLowerCase() : null;
  if (!email && /^[A-Z0-9]{5,9}$/.test(ref.toUpperCase())) email = await env.WAITLIST.get('code:' + ref.toUpperCase());
  if (email) {
    const n = parseInt((await env.WAITLIST.get('contrib_by:' + email)) || '0', 10) + ids.length;
    await env.WAITLIST.put('contrib_by:' + email, String(n));
    await contribBumpWall(env, email, nombre || maskEmail(email), n);
    contributor = { n };
  } else if (nombre) {
    await contribBumpWall(env, 'anon:' + slug(nombre), nombre, ids.length);
  }
  if (env.RESEND_API_KEY && env.NOTIFY_EMAIL) {
    try { await sendResend(env, { to: env.NOTIFY_EMAIL, subject: 'Nuevo aporte de documento (' + banco + ')', html: '<p>' + ids.length + ' documento(s) · <b>' + esc(banco) + '</b> · ' + esc(pais) + ' · ' + esc(tipo) + (email ? (' · por ' + esc(email)) : '') + '</p>' }); } catch (e) {}
  }
  return json({ status: 'ok', n: ids.length, progress: { total, goal: CONTRIB_GOAL }, contributor }, 200, cors);
}

// GET /contrib/progress — contador público para la barra colectiva
async function contribProgress(request, env, pub) {
  const total = parseInt((await env.WAITLIST.get('meta:contribs')) || '0', 10);
  const list = await env.WAITLIST.list({ prefix: 'contrib_bank:', limit: 1000 });
  const banks = [];
  for (const k of list.keys) {
    const parts = k.name.split(':');
    banks.push({ pais: parts[1], banco: parts[2], count: parseInt((await env.WAITLIST.get(k.name)) || '0', 10) });
  }
  banks.sort(function (a, b) { return b.count - a.count; });
  return json({ total, goal: CONTRIB_GOAL, banks }, 200, pub);
}

// GET /contrib/wall — muro público de colaboradores (anonimizado)
async function contribWall(request, env, pub) {
  let lb = []; try { lb = JSON.parse((await env.WAITLIST.get('contrib_wall')) || '[]'); } catch (e) {}
  return json({ wall: lb.slice(0, 60).map(function (x) { return { name: x.name, count: x.count }; }) }, 200, pub);
}

// GET /admin/contrib — export de metadatos + keys R2 para construir el dataset (token)
async function adminContrib(request, env, cors) {
  if (!authed(request, env)) return json({ error: 'unauthorized' }, 401, cors);
  const list = await env.WAITLIST.list({ prefix: 'contrib:', limit: 1000 });
  const rows = [];
  for (const k of list.keys) { try { rows.push(JSON.parse(await env.WAITLIST.get(k.name))); } catch (e) {} }
  rows.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
  return json({ total: rows.length, rows }, 200, cors);
}

// GET /admin/contrib/export — JSONL: una línea por documento con banco/moneda/tipo + tokens posicionados.
// Es el archivo "parser-ready" para el desarrollo del parser de Presu.
async function adminContribExport(request, env, cors) {
  if (!authed(request, env)) return json({ error: 'unauthorized' }, 401, cors);
  const list = await env.WAITLIST.list({ prefix: 'contrib:', limit: 1000 });
  const lines = [];
  for (const k of list.keys) {
    let rec = null; try { rec = JSON.parse(await env.WAITLIST.get(k.name)); } catch (e) { continue; }
    let w = 0, h = 0, tokens = [];
    if (rec.jsonKey) { try { const o = await env.DOCS.get(rec.jsonKey); if (o) { const j = JSON.parse(await o.text()); w = j.w || 0; h = j.h || 0; tokens = j.tokens || []; } } catch (e) {} }
    lines.push(JSON.stringify({ submissionId: rec.submissionId, page: rec.page, bank: rec.banco, country: rec.pais, currency: rec.moneda, type: rec.tipo, source: rec.source, image: rec.key, w, h, tokens }));
  }
  return new Response(lines.join('\n'), { status: 200, headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', ...cors } });
}

// GET /admin/doc?id=&t= — sirve la imagen redactada desde R2 (para la galería admin).
// Token por query (?t=) porque <img> no puede mandar headers.
async function adminDoc(request, env, url) {
  const t = url.searchParams.get('t') || '';
  if (!env.ADMIN_TOKEN || t !== env.ADMIN_TOKEN) return new Response('unauthorized', { status: 401 });
  const id = (url.searchParams.get('id') || '').replace(/[^a-z0-9-]/gi, '');
  const raw = id && await env.WAITLIST.get('contrib:' + id);
  if (!raw) return new Response('not found', { status: 404 });
  let rec = {}; try { rec = JSON.parse(raw); } catch (e) {}
  if ((url.searchParams.get('kind') || '') === 'json') { // tokens (para la capa de texto del PDF buscable)
    const o = rec.jsonKey && await env.DOCS.get(rec.jsonKey);
    return new Response(o ? o.body : '{}', { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });
  }
  const obj = rec.key && await env.DOCS.get(rec.key);
  if (!obj) return new Response('not found', { status: 404 });
  return new Response(obj.body, { status: 200, headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });
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
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><style>:root{color-scheme:dark}</style></head><body style="margin:0;background:#08080A;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#F4F4F3">
  ${EMAIL_HEADER}
  <div style="max-width:540px;margin:0 auto;padding:20px 24px 32px">
    <p style="font-size:16px;color:#A1A1A6;margin:0 0 6px">${hola}</p>
    <h1 style="font-size:30px;line-height:1.12;font-weight:800;letter-spacing:-.02em;margin:0 0 12px;color:#fff">¡Ya eres pionero! <span style="color:#34D399">🎉</span></h1>
    <p style="font-size:16px;line-height:1.55;color:#D4D4D6;margin:0 0 12px">Tus bonos ya están <b style="color:#fff">asegurados</b>. Ahora viene lo mejor: <b style="color:#34D399">comparte tu link y vuélvete Fundador</b> —cada amigo que entra te sube de nivel.</p>
    <p style="font-size:14px;line-height:1.5;color:#5EEAB8;font-weight:600;margin:0 0 22px">⚡ Solo entran <b>1.000</b> antes del lanzamiento. Corre la voz antes de que se llenen los cupos.</p>
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

// Bienvenida para quien llega DESPUÉS del cierre de pioneros (origen tanda2).
function lateWelcomeHtml(r) {
  const hola = r.nombre ? 'Hola, ' + esc(r.nombre) + ' 👋' : 'Hola 👋';
  const link = SITE + '/?ref=' + (r.ref || '');
  const aporta = SITE + '/aporta';
  const waMsg = encodeURIComponent('Me metí a la lista de Presu 🌿 — reúne tus gastos de todos tus bancos, privado y en tu equipo. Entra tú también: ' + link);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><style>:root{color-scheme:dark}</style></head><body style="margin:0;background:#08080A;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#F4F4F3">
  ${EMAIL_HEADER}
  <div style="max-width:540px;margin:0 auto;padding:20px 24px 32px">
    <p style="font-size:16px;color:#A1A1A6;margin:0 0 6px">${hola}</p>
    <h1 style="font-size:28px;line-height:1.14;font-weight:800;letter-spacing:-.02em;margin:0 0 12px;color:#fff">Estás en la <span style="color:#34D399">Nueva Ola</span> 🌊</h1>
    <p style="font-size:16px;line-height:1.55;color:#D4D4D6;margin:0 0 14px">La beta de <b style="color:#fff">pioneros</b> ya está corriendo. La <b style="color:#fff">Nueva Ola</b> abre el <b style="color:#fff">15 de julio a las 4pm</b> y ya tienes tu lugar. Y si quieres entrar <b style="color:#fff">antes que el resto</b>, tienes dos formas de adelantarte:</p>
    <div style="background:#0E2A20;border:1px solid rgba(52,211,153,.5);border-radius:18px;padding:20px;margin:0 0 16px">
      <div style="font-size:16px;color:#fff;font-weight:700;margin-bottom:6px">🚀 Salta la fila</div>
      <p style="font-size:14px;line-height:1.5;color:#D4D4D6;margin:0 0 12px">Cada amigo que entre con tu link te sube en la cola.</p>
      <a href="https://wa.me/?text=${waMsg}" style="display:block;background:#34D399;color:#08231A;font-weight:800;font-size:16px;text-decoration:none;padding:14px;border-radius:12px;text-align:center">📲 Compartir mi link</a>
    </div>
    <div style="border:1px solid rgba(52,211,153,.45);border-radius:18px;padding:20px;margin:0 0 22px">
      <div style="font-size:16px;color:#fff;font-weight:700;margin-bottom:6px">🌱 Gánate tu cupo</div>
      <p style="font-size:14px;line-height:1.5;color:#D4D4D6;margin:0 0 12px">Aporta un documento anónimo (se tapa en tu propio equipo) y nos ayudas a que Presu lea tu banco. Quien aporta, entra antes.</p>
      <a href="${aporta}" style="display:block;background:#101014;border:1px solid rgba(255,255,255,.16);color:#fff;font-weight:700;font-size:16px;text-decoration:none;padding:14px;border-radius:12px;text-align:center">Aportar un documento →</a>
    </div>
    <p style="font-size:12px;line-height:1.6;color:#6B6B72;margin:0;text-align:center">Te avisamos apenas abramos la próxima tanda. <span style="color:#34D399">Tu plata, clara.</span></p>
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
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><style>:root{color-scheme:dark}</style></head><body style="margin:0;background:#08080A;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#F4F4F3">' + EMAIL_HEADER + '<div style="max-width:520px;margin:0 auto;padding:20px 28px 36px"><p style="font-size:18px;margin:0 0 16px">' + hola + '</p>' + body + '<p style="font-size:13px;color:#8A8A90;margin:18px 0 0">Tu plata, clara.</p></div></body></html>';
}

function surveyEmailHtml(r) {
  const hola = r.nombre ? 'Hola, ' + esc(r.nombre) + ' 👋' : 'Hola 👋';
  const link = SITE + '/encuesta.html?e=' + encodeURIComponent(r.email || '');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><style>:root{color-scheme:dark}</style></head><body style="margin:0;background:#08080A;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#F4F4F3">
  ${EMAIL_HEADER}
  <div style="max-width:540px;margin:0 auto;padding:20px 24px 32px">
    <p style="font-size:16px;color:#A1A1A6;margin:0 0 6px">${hola}</p>
    <h1 style="font-size:28px;line-height:1.15;font-weight:800;letter-spacing:-.02em;margin:0 0 14px;color:#fff">Construyamos Presu <span style="color:#34D399">a tu medida</span></h1>
    <p style="font-size:16px;line-height:1.55;color:#D4D4D6;margin:0 0 14px">Llevas unos días con la beta, así que queremos oírte. Cuéntanos cómo te va con Presu —y si aún no la abres, qué te frenó: son <b style="color:#34D399">unas preguntas rápidas, menos de 3 minutos</b>.</p>
    <p style="font-size:15px;line-height:1.5;color:#5EEAB8;font-weight:600;margin:0 0 22px">🎯 Con tu feedback decidimos <b>qué construir primero</b>.</p>
    <div style="text-align:center;margin:0 0 24px">
      <a href="${link}" style="display:inline-block;background:#34D399;color:#08231A;font-weight:800;font-size:17px;text-decoration:none;padding:16px 30px;border-radius:14px">Dar mi opinión →</a>
    </div>
    <p style="font-size:12px;line-height:1.6;color:#6B6B72;margin:0;text-align:center">Solo lo usamos para mejorar Presu. No compartimos tus datos. <span style="color:#34D399">Tu plata, clara.</span></p>
  </div></body></html>`;
}

// Seguimiento a pioneros: instalador (→ presu.io/descargar) + encuesta, en un solo correo.
function followupHtml(r) {
  const hola = r.nombre ? 'Hola, ' + esc(r.nombre) + ' 👋' : 'Hola 👋';
  const dl = SITE + '/r?e=' + encodeURIComponent(r.email || '') + '&to=descargar&c=followup';
  const survey = SITE + '/r?e=' + encodeURIComponent(r.email || '') + '&to=encuesta&c=followup';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><style>
  :root{color-scheme:dark;supported-color-schemes:dark}
  /* Gmail invierte y marca con data-ogsc (texto) / data-ogsb (fondo): los forzamos de vuelta al oscuro de marca */
  [data-ogsb] .em-body{background:#08080A!important}
  [data-ogsb] .em-card{background:#101014!important}
  [data-ogsc] .t-white{color:#ffffff!important}
  [data-ogsc] .t-body{color:#C9C9CE!important}
  [data-ogsc] .t-mut{color:#8A8A90!important}
  [data-ogsc] .t-mint{color:#34D399!important}
  [data-ogsb] .btn-mint{background:#34D399!important}[data-ogsc] .btn-mint{color:#06231A!important}
  [data-ogsb] .btn-dark{background:#0C0C0F!important}[data-ogsc] .btn-dark{color:#ffffff!important}
  </style></head><body style="margin:0;background:#08080A;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#F4F4F3">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#08080A">Mac o Windows. La instalas, sumas tus movimientos y ves todo claro.</div>
  <div class="em-body" style="background:#08080A">
  ${EMAIL_HEADER}
  <div style="max-width:540px;margin:0 auto;padding:20px 24px 36px">
    <div class="t-mint" style="font-family:'Courier New',monospace;font-size:12px;letter-spacing:.14em;color:#34D399;margin:2px 0 16px">PIONERO · BETA ABIERTA</div>
    <h1 class="t-white" style="font-size:28px;line-height:1.15;font-weight:800;letter-spacing:-.02em;margin:0 0 12px;color:#fff">Tu Presu ya está listo <span class="t-mint" style="color:#34D399">🌿</span></h1>
    <p class="t-body" style="font-size:16px;line-height:1.55;color:#C9C9CE;margin:0 0 26px">${hola} La beta ya está abierta. Descárgala para <b class="t-white" style="color:#fff">Mac o Windows</b> —se instala en un minuto y tus datos viven <b class="t-white" style="color:#fff">cifrados en tu equipo</b> (local-first, sin nube).</p>
    <div class="t-mut" style="font-size:12px;font-weight:700;letter-spacing:.06em;color:#8A8A90;margin:0 0 10px">PASO 1 · DESCÁRGALA</div>
    <a class="btn-mint" href="${dl}" style="display:inline-block;background:#34D399;color:#06231A;font-weight:800;font-size:17px;text-decoration:none;padding:16px 34px;border-radius:14px">Descargar Presu →</a>
    <p class="t-mut" style="font-size:13px;line-height:1.5;color:#6B6B72;margin:12px 0 28px">Elige tu sistema en la página (Mac Intel, Apple Silicon o Windows); ahí te dejamos los pasos.</p>
    <div class="em-card" style="background:#101014;border:1px solid rgba(255,255,255,.10);border-radius:16px;padding:22px">
      <div class="t-mint" style="font-size:12px;font-weight:700;letter-spacing:.06em;color:#34D399;margin:0 0 8px">PASO 2 · 3 MIN 🌱</div>
      <h2 class="t-white" style="font-size:20px;line-height:1.2;font-weight:700;color:#fff;margin:0 0 8px">Ayúdanos a decidir qué sigue</h2>
      <p class="t-body" style="font-size:15px;line-height:1.55;color:#C9C9CE;margin:0 0 16px">Eres pionero: <b class="t-white" style="color:#fff">tu voz manda</b>. Responde <b class="t-white" style="color:#fff">unas preguntas rápidas (te toma 3 min)</b> —ya la hayas abierto o no— y defines el próximo banco y la próxima función.</p>
      <a class="btn-dark" href="${survey}" style="display:inline-block;background:#0C0C0F;border:1px solid rgba(255,255,255,.20);color:#fff;font-weight:700;font-size:15px;text-decoration:none;padding:13px 26px;border-radius:12px">Dar mi opinión →</a>
    </div>
    <p class="t-mut" style="font-size:12px;line-height:1.6;color:#6B6B72;margin:28px 0 0">Gracias por construir Presu desde el día cero. <span class="t-mint" style="color:#34D399">Tu plata, clara.</span><br>Presu · de Asimétrica</p>
  </div></div></body></html>`;
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
