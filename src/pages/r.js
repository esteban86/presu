// Endpoint on-demand: link de tracking branded en presu.io/r
// Reenvía al /r del worker (que registra el clic + device en KV) preservando el
// query y el User-Agent real, y devuelve su 302 → el usuario nunca ve workers.dev.
// Se sirve dinámicamente vía el adapter de Cloudflare (prerender:false).
export const prerender = false;

const WORKER_R = 'https://presu-waitlist.asimetrica.workers.dev/r';

export async function GET({ request, url }) {
  try {
    const res = await fetch(WORKER_R + (url.search || ''), {
      headers: { 'user-agent': request.headers.get('user-agent') || '' },
      redirect: 'manual',
    });
    const loc = res.headers.get('location');
    if (loc) return Response.redirect(loc, 302);
  } catch (e) { /* si el worker falla, igual mandamos a un destino útil */ }
  // Fallback: a /descargar preservando el correo si vino.
  const e = url.searchParams.get('e') || '';
  const dest = 'https://presu.io/descargar' + (e ? '?e=' + encodeURIComponent(e) : '');
  return Response.redirect(dest, 302);
}
