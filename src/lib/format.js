// src/lib/format.js — lógica de negocio compartida de Presu (sin estilos).
// Portado de `Presu Design System v2/components/data/helpers.js`. Los
// componentes de ui/ reciben strings ya formateados (mismo contrato que
// las specs React del DS); estos helpers son los que producen esos
// strings a partir de números crudos.

/** Formatea un número como pesos colombianos: 4820000 -> "$4.820.000". */
export function formatCOP(value, { sign = false, decimals = 0 } = {}) {
  const n = Number(value) || 0;
  const abs = Math.abs(n).toLocaleString('es-CO', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const s = sign ? (n > 0 ? '+' : n < 0 ? '−' : '') : n < 0 ? '−' : '';
  return `${s}$${abs}`;
}

/** Pesos compactos para tarjetas de estadística: 11950000 -> "$11,95M". */
export function formatCOPCompact(value) {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 2 })}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toLocaleString('es-CO', { maximumFractionDigits: 0 })}K`;
  return `${sign}$${abs.toLocaleString('es-CO')}`;
}

/** Categorías de gasto: glifo emoji + color del token. */
export const CATEGORIES = {
  vivienda: { label: 'Vivienda', emoji: '🏠', color: 'var(--cat-vivienda, #34D399)' },
  mercado: { label: 'Mercado', emoji: '🛒', color: 'var(--cat-mercado, #FBBF24)' },
  transporte: { label: 'Transporte', emoji: '🚕', color: 'var(--cat-transporte, #60A5FA)' },
  restaurantes: { label: 'Restaurantes', emoji: '🍔', color: 'var(--cat-restaurantes, #FB923C)' },
  suscripciones: { label: 'Suscripciones', emoji: '🎬', color: 'var(--cat-suscripciones, #5EEAD4)' },
  salud: { label: 'Salud', emoji: '🩺', color: 'var(--cat-salud, #F472B6)' },
  familia: { label: 'Familia', emoji: '👨‍👩‍👧', color: 'var(--cat-familia, #A78BFA)' },
  otros: { label: 'Otros', emoji: '📦', color: 'var(--cat-otros, #94A3B8)' },
  ingreso: { label: 'Ingreso', emoji: '💰', color: 'var(--color-positive, #34D399)' },
};

/** Convierte un color/token a un wash de baja opacidad para tiles de ícono. */
export function tint(color, alpha = 0.14) {
  return `color-mix(in srgb, ${color} ${alpha * 100}%, transparent)`;
}
