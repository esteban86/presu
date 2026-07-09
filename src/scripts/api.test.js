import { describe, it, expect } from 'vitest';
import { apiBase } from './api.js';
describe('apiBase', () => {
  it('prod para hosts de la allowlist', () => {
    for (const h of ['presu.asimetrica.co','presu.io','www.presu.io','presu.com.co'])
      expect(apiBase(h)).toBe('https://presu-waitlist.asimetrica.workers.dev');
  });
  it('staging para localhost y otros', () => {
    expect(apiBase('localhost')).toBe('https://presu-waitlist-staging.asimetrica.workers.dev');
    expect(apiBase('presu-web.pages.dev')).toBe('https://presu-waitlist-staging.asimetrica.workers.dev');
  });
});
