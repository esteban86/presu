// La galería de capturas (`[data-galeria]`): las pestañas cambian la pantalla del MacBook, y a la
// vista y sin «reducir movimiento» la pantalla avanza sola cada 5 s, con un fundido. Si la persona
// toca una pestaña, deja de avanzar sola. Con el mouse encima o el foco adentro, espera.
const reducir = window.matchMedia('(prefers-reduced-motion: reduce)');
const CADA_MS = 5000;

for (const galeria of Array.from(document.querySelectorAll<HTMLElement>('[data-galeria]'))) {
  const pantallas = Array.from(galeria.querySelectorAll<HTMLElement>('[data-pantalla]'));
  const botones = Array.from(galeria.querySelectorAll<HTMLButtonElement>('[data-pantalla-boton]'));
  if (pantallas.length === 0) continue;
  let activa = 0;
  let reloj: number | undefined;
  let tocada = false;
  let aLaVista = false;
  let quieta = false;

  const mostrar = (i: number) => {
    activa = (i + pantallas.length) % pantallas.length;
    pantallas.forEach((p, j) => {
      p.toggleAttribute('data-activa', j === activa);
      if (j === activa) p.removeAttribute('aria-hidden');
      else p.setAttribute('aria-hidden', 'true');
    });
    botones.forEach((b, j) => b.setAttribute('aria-selected', String(j === activa)));
  };
  const parar = () => {
    if (reloj !== undefined) window.clearInterval(reloj);
    reloj = undefined;
  };
  const decidir = () => {
    parar();
    if (aLaVista && !tocada && !quieta && !reducir.matches) reloj = window.setInterval(() => mostrar(activa + 1), CADA_MS);
  };

  botones.forEach((b, j) => {
    b.addEventListener('click', () => {
      tocada = true;
      mostrar(j);
      decidir();
    });
    b.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      tocada = true;
      mostrar(activa + (e.key === 'ArrowRight' ? 1 : -1));
      botones[activa]?.focus();
      decidir();
    });
  });
  galeria.addEventListener('pointerenter', () => {
    quieta = true;
    decidir();
  });
  galeria.addEventListener('pointerleave', () => {
    quieta = false;
    decidir();
  });
  galeria.addEventListener('focusin', () => {
    quieta = true;
    decidir();
  });
  galeria.addEventListener('focusout', () => {
    quieta = false;
    decidir();
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(
      ([e]) => {
        aLaVista = e.isIntersecting;
        decidir();
      },
      { threshold: 0.4 },
    ).observe(galeria);
  }
  reducir.addEventListener('change', decidir);
}

// Módulo, no script global: sus nombres no chocan con los de otros módulos.
export {};
