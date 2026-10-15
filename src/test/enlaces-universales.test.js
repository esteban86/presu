/**
 * Los enlaces universales del celular (#3830 del repo de la app): `https://presu.io/abrir/<pantalla>`
 * abre la app, y si no está instalada cae en `/abrir/*` de este sitio.
 *
 * Lo que se vigila: que el archivo de Apple diga la app correcta y el prefijo que la app espera,
 * que llegue al build (vive en una carpeta que empieza con punto), que se sirva como JSON, y que
 * la página de respaldo no venda nada, igual que /movil.
 *
 * Corre `npm run build` antes: se revisa lo construido.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = process.cwd();
const AASA = '.well-known/apple-app-site-association';

describe('apple-app-site-association', () => {
  const aasa = JSON.parse(readFileSync(join(RAIZ, 'public', AASA), 'utf8'));

  it('declara la app del celular (equipo + bundle) y solo el prefijo /abrir', () => {
    expect(aasa.applinks.details).toHaveLength(1);
    const [detalle] = aasa.applinks.details;
    expect(detalle.appIDs).toEqual(['XNJ2U58WL3.io.presu.app']);
    expect(detalle.components.map((c) => c['/'])).toEqual(['/abrir', '/abrir/*']);
  });

  it('llega al build tal cual', () => {
    const construido = join(RAIZ, 'dist', AASA);
    expect(existsSync(construido), `falta dist/${AASA} — corre npm run build`).toBe(true);
    expect(JSON.parse(readFileSync(construido, 'utf8'))).toEqual(aasa);
  });

  it('se sirve como JSON (sin extensión, Pages lo mandaría como binario)', () => {
    const cabeceras = readFileSync(join(RAIZ, 'public', '_headers'), 'utf8');
    expect(cabeceras).toMatch(
      /^\/\.well-known\/apple-app-site-association\n\s+Content-Type: application\/json$/m,
    );
  });
});

/**
 * Android verifica el dominio al INSTALAR la app: este archivo tiene que estar publicado antes del
 * build que trae el `intentFilter`. La primera huella es la clave de firma de apps de Google Play
 * (la que firma lo que se instala desde la tienda, la del bloque «Digital Asset Links JSON» de Play
 * Console); la segunda, la clave de subida, para los builds que se instalan sin pasar por Play.
 */
describe('assetlinks.json', () => {
  const ASSETLINKS = '.well-known/assetlinks.json';
  const enlaces = JSON.parse(readFileSync(join(RAIZ, 'public', ASSETLINKS), 'utf8'));

  it('delega los enlaces a io.presu.app con la clave de firma de Play primero', () => {
    expect(enlaces).toHaveLength(1);
    expect(enlaces[0].relation).toEqual(['delegate_permission/common.handle_all_urls']);
    expect(enlaces[0].target.namespace).toBe('android_app');
    expect(enlaces[0].target.package_name).toBe('io.presu.app');
    const huellas = enlaces[0].target.sha256_cert_fingerprints;
    expect(huellas[0]).toMatch(/^97:26:9B:D4:/);
    for (const h of huellas) expect(h).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
  });

  it('llega al build tal cual (Pages lo sirve como JSON por la extensión)', () => {
    const construido = join(RAIZ, 'dist', ASSETLINKS);
    expect(existsSync(construido), `falta dist/${ASSETLINKS} — corre npm run build`).toBe(true);
    expect(JSON.parse(readFileSync(construido, 'utf8'))).toEqual(enlaces);
  });
});

describe('/abrir/* (respaldo)', () => {
  const fuente = readFileSync(join(RAIZ, 'src', 'pages', 'abrir', '[...ruta].astro'), 'utf8');
  const plantilla = fuente.split('---').slice(2).join('---');

  it('responde a cualquier /abrir/* en el momento, sin indexarse', () => {
    expect(fuente).toMatch(/^export const prerender = false;$/m);
    expect(fuente).toMatch(/headers\.set\('X-Robots-Tag', 'noindex'\)/);
  });

  it('no vende nada: encabezado sin venta, sin precios ni planes', () => {
    expect(plantilla).toMatch(/<Base\s+sinVenta\b/);
    expect(plantilla).not.toMatch(/\$\s?\d|Presu\s+Pro\b|Plan\s+completo|suscri|\bcompra/i);
  });
});
