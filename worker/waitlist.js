/**
 * Presu — Worker de lista de espera (Cloudflare)
 * --------------------------------------------------------------
 * Puerta del formulario:
 *   1. Recibe el registro desde la landing.
 *   2. Dedup por correo en KV → {status:'already'} si ya estaba.
 *   3. Si es nuevo → lo guarda en KV, envía el correo de BIENVENIDA al inscrito
 *      y una NOTIFICACIÓN al equipo, ambos vía Resend desde presu@asimetrica.co.
 *      Responde {status:'ok', total:N}.
 *
 * Bindings en Cloudflare:
 *   - KV namespace  →  binding: WAITLIST
 *   - Secret        →  RESEND_API_KEY   (npx wrangler secret put RESEND_API_KEY)
 *   - Variable      →  NOTIFY_EMAIL     (correo donde quieres recibir los avisos)
 *
 * Requiere el dominio asimetrica.co verificado en Resend (registros DNS).
 */

const ALLOWED_ORIGINS = [
  'https://presu.asimetrica.co',
  'http://localhost:4821', // pruebas locales; se puede quitar
];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FROM = 'Presu · de Asimétrica <presu@asimetrica.co>';

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    const cors = {
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return json({ status: 'error', reason: 'method' }, 405, cors);

    const debug = new URL(request.url).searchParams.has('debug');

    let data;
    try { data = await request.json(); } catch (e) { return json({ status: 'error', reason: 'json' }, 400, cors); }

    if (data.botcheck) return json({ status: 'ok' }, 200, cors); // honeypot

    const email = String(data.correo || data.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return json({ status: 'error', reason: 'email' }, 400, cors);

    // ── Dedup ──
    const existing = await env.WAITLIST.get('email:' + email);
    if (existing) return json({ status: 'already' }, 200, cors);

    const record = {
      email,
      perfil: data.perfil || 'persona',
      nombre: data.nombre || '',
      empresa: data.empresa || '',
      empleados: data.empleados || '',
      origen: data.origen || '',
      ts: Date.now(),
    };
    await env.WAITLIST.put('email:' + email, JSON.stringify(record));

    let total = parseInt((await env.WAITLIST.get('meta:count')) || '0', 10) + 1;
    await env.WAITLIST.put('meta:count', String(total));

    // ── Correos vía Resend (best-effort: si fallan, el registro ya quedó guardado) ──
    let mail = { welcome: null, notify: null };
    if (env.RESEND_API_KEY) {
      mail.welcome = await sendResend(env, {
        to: email,
        reply_to: env.NOTIFY_EMAIL || undefined,
        subject: '¡Ya eres pionero de Presu! 🎉',
        html: welcomeHtml(record),
      });
      if (env.NOTIFY_EMAIL) {
        mail.notify = await sendResend(env, {
          to: env.NOTIFY_EMAIL,
          reply_to: email,
          subject: 'Nuevo registro en la waitlist de Presu (' + record.perfil + ')',
          html: notifyHtml(record, total),
        });
      }
    }

    const resp = { status: 'ok', total };
    if (debug) resp.mail = mail;
    return json(resp, 200, cors);
  },
};

async function sendResend(env, { to, subject, html, reply_to }) {
  try {
    const body = { from: FROM, to: [to], subject, html };
    if (reply_to) body.reply_to = reply_to;
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, id: j.id || null, message: j.message || j.error || '' };
  } catch (e) {
    return { ok: false, status: 0, message: 'fetch error: ' + String(e) };
  }
}

function esc(s) { return String(s || '').replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

function welcomeHtml(r) {
  const hola = r.nombre ? 'Hola, ' + esc(r.nombre) + ' 👋' : 'Hola 👋';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#08080A;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#F4F4F3">
  <div style="max-width:520px;margin:0 auto;padding:36px 28px">
    <div style="font-size:26px;font-weight:700;letter-spacing:-.02em;color:#F4F4F3;margin-bottom:24px">presu<span style="color:#34D399">.</span></div>
    <p style="font-size:18px;margin:0 0 18px">${hola}</p>
    <p style="font-size:15px;line-height:1.6;color:#D4D4D6;margin:0 0 22px">¡Listo! Ya estás en la lista —eres <b style="color:#34D399">pionero de Presu</b>, de los primeros en probarla.</p>
    <div style="background:#101014;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:18px 20px;margin:0 0 22px">
      <p style="font-size:15px;line-height:1.6;color:#D4D4D6;margin:0 0 12px">📅 La beta abre el <b style="color:#F4F4F3">martes 30 de junio</b>. Te escribimos a ti primero, sin afán.</p>
      <p style="font-size:15px;line-height:1.6;color:#D4D4D6;margin:0 0 12px">🎁 Como pionero usas Presu completo gratis y tienes <b style="color:#F4F4F3">bonos extra</b> (una guía, una sesión en vivo con Asimétrica y un precio especial de pionero). Pronto te damos todos los detalles.</p>
      <p style="font-size:15px;line-height:1.6;color:#D4D4D6;margin:0">🔒 Cuando entres, en una sola frase sabrás a dónde se va tu plata y si vas bien este mes —sin hojas de cálculo y sin nube: todo vive cifrado en tu propio equipo.</p>
    </div>
    <div style="text-align:center;margin:0 0 24px">
      <p style="font-size:15px;line-height:1.6;color:#D4D4D6;margin:0 0 14px">¿Conoces a alguien a quien le sirva tener su plata clara? Pásale la voz 🌱 —entre más pioneros, mejor.</p>
      <a href="https://presu.asimetrica.co" style="display:inline-block;background:#34D399;color:#08231A;font-weight:700;text-decoration:none;padding:13px 24px;border-radius:14px;font-size:15px">Compartir Presu</a>
    </div>
    <p style="font-size:15px;line-height:1.6;color:#D4D4D6;margin:0 0 22px">¿Se te ocurre algo que te gustaría ver en Presu? Responde este correo —leemos a cada pionero.</p>
    <p style="font-size:15px;line-height:1.6;color:#D4D4D6;margin:0">Nos vemos el 30,<br><b style="color:#F4F4F3">Equipo de Presu</b> · de Asimétrica<br><span style="color:#34D399">Tu plata, clara.</span></p>
  </div></body></html>`;
}

function notifyHtml(r, total) {
  return `<!doctype html><html><head><meta charset="utf-8"></head><body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111">
  <h2 style="margin:0 0 12px">Nuevo registro en la waitlist 🎉</h2>
  <p style="margin:4px 0"><b>Correo:</b> ${esc(r.email)}</p>
  <p style="margin:4px 0"><b>Perfil:</b> ${esc(r.perfil)}</p>
  ${r.nombre ? '<p style="margin:4px 0"><b>Nombre:</b> ' + esc(r.nombre) + '</p>' : ''}
  ${r.empresa ? '<p style="margin:4px 0"><b>Empresa:</b> ' + esc(r.empresa) + ' (' + esc(r.empleados) + ' empleados)</p>' : ''}
  ${r.origen ? '<p style="margin:4px 0"><b>Origen:</b> ' + esc(r.origen) + '</p>' : ''}
  <p style="margin:12px 0 0;color:#666">Total en la lista: ${total}</p>
  </body></html>`;
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}
