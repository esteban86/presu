// dimensiones-webp.js — ancho y alto de un .webp de public/, leídos de su cabecera en el build.
// Así `Captura.astro` escribe `width` y `height` que cuadran con el archivo (sin saltos de
// diseño al cargar) y nadie los copia a mano cuando se reemplaza una captura.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

/** `{ ancho, alto }` del .webp en `public/<ruta>`. Lanza si no es un WebP que entienda. */
export function dimensionesWebp(ruta) {
  const b = readFileSync(join(process.cwd(), 'public', ruta.replace(/^\//, '')));
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error(`«${ruta}» no es un WebP`);
  }
  const tipo = b.toString('ascii', 12, 16);
  if (tipo === 'VP8X') {
    return { ancho: 1 + b.readUIntLE(24, 3), alto: 1 + b.readUIntLE(27, 3) };
  }
  if (tipo === 'VP8 ') {
    return { ancho: b.readUInt16LE(26) & 0x3fff, alto: b.readUInt16LE(28) & 0x3fff };
  }
  if (tipo === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return { ancho: (bits & 0x3fff) + 1, alto: ((bits >> 14) & 0x3fff) + 1 };
  }
  throw new Error(`«${ruta}»: WebP de tipo ${tipo} sin leer`);
}
