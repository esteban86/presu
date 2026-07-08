# Polish "positive emotional peaks" — landing presu.io

**Aprobado por Esteban · 2026-07-07 · personalidad: sobrio + 3 picos (estilo Linear/Stripe)**

## Enfoque técnico
CSS-first + micro-JS vanilla (≤4KB inline). Cero dependencias, cero requests nuevos.
Reusar IntersectionObserver y patrón confetti() de encuesta.html. Lighthouse sin regresión.

## 1. Fundación táctil (toda la página)
- Tokens: `--ease-out: cubic-bezier(.25,1,.5,1)`, `--ease-spring: cubic-bezier(.34,1.56,.64,1)`, duraciones 150/250/450ms.
- Botones: press `:active` scale(.97)+1px (120ms); hover lift 1px + glow mint; flecha del CTA desliza al hover.
- FAQ `<details>`: apertura animada (`::details-content` + `interpolate-size` — degrada a instantáneo) + chevron rotando.
- Inputs: focus ring mint; error → shake sutil + mensaje inline; `:focus-visible` accesible global.

## 2. Pico 1 — Hero al cargar
Entrada orquestada (eyebrow→H1→sub→CTA→visual), stagger 80ms, <900ms total, UNA vez.
Progressive enhancement: sin JS todo visible (patrón .fade-in existente).

## 3. Pico 2 — Envío del formulario (ambos forms)
Botón idle → "Enviando…" (spinner) → morph a ✓ con pop spring + mensaje cálido +
confeti mint contenido (~20 partículas, 1.2s). Error: shake + mensaje claro.

## 4. Pico 3 — Números que cuentan
Count-up 900ms out-expo formato es-CO al 60% del viewport, una vez.

## Reglas duras
- `prefers-reduced-motion` → estado final directo (extender media queries existentes).
- Solo transform/opacity. Móvil: tap states, nada depende de hover.
- Verificación en preview (forms contra staging, reduced-motion emulado) antes de publicar.
