// cifras-de-la-demo.js — las cifras de los paneles de la portada, todas de la base de demostración.
//
// `src/data/cifras-de-la-demo.json` es la salida de `scripts/exportar-cifras-de-la-demo.mjs` del repo
// de la app (Gastos_Personales), con el MISMO mes que la base sembrada en los pantallazos de
// public/capturas/. Ningún panel escribe un monto a mano: lo pide acá. Para cambiar las cifras se
// vuelve a correr la receta (docs/web/capturas.md, en el repo de la app), no se edita el JSON.
import cifras from '../data/cifras-de-la-demo.json';
import { formatCOP, formatCOPCompact } from './format.js';

export { cifras };

/** `ingresos`, `gastos` o `balance` del mes de la demo, en pesos completos o compactos. */
export function cifraDelMes(nombre, { compacta = false } = {}) {
  const valor = cifras[nombre];
  if (typeof valor !== 'number') throw new Error(`la demo no tiene la cifra «${nombre}»`);
  return compacta ? formatCOPCompact(valor) : formatCOP(valor);
}

/** El tope de una categoría de la demo: `{ categoria, gastado, tope, pct }`. */
export function topeDe(categoria) {
  const t = cifras.topes.find((x) => x.categoria === categoria);
  if (!t) throw new Error(`la demo no tiene tope para «${categoria}»`);
  return { ...t, pct: Math.round((t.gastado / t.tope) * 100) };
}
