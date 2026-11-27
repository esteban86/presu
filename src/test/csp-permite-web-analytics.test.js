/**
 * Web Analytics de Cloudflare (sin cookies) carga su script de static.cloudflareinsights.com y
 * manda la medición a cloudflareinsights.com. Sin los dos orígenes en la CSP el navegador los
 * bloquea y el conteo queda en cero sin ningún error visible.
 */
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const csp = readFileSync('public/_headers', 'utf8')
  .split('\n').find((l) => l.trim().startsWith('Content-Security-Policy:')) || '';
const directiva = (n) => (csp.split(';').map((s) => s.trim()).find((s) => s.startsWith(n + ' ')) || '');

describe('CSP y Web Analytics', () => {
  it('script-src permite static.cloudflareinsights.com', () => {
    expect(directiva('script-src')).toContain('https://static.cloudflareinsights.com');
  });
  it('connect-src permite cloudflareinsights.com', () => {
    expect(directiva('connect-src').split(' ')).toContain('https://cloudflareinsights.com');
  });
});
