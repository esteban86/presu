// Los momentos animados de la portada (`[data-momento]`) corren solo con movimiento permitido y
// mientras se ven. Sin este script, o con «reducir movimiento», queda el cuadro final, quieto: los
// estilos base de cada momento SON ese cuadro, y `.animada` agrega la animación encima.
// `.corre` la suelta mientras la pieza está a la vista; al salir, se pausa donde iba.
const reducir = window.matchMedia('(prefers-reduced-motion: reduce)');
const piezas = Array.from(document.querySelectorAll<HTMLElement>('[data-momento]'));

function preparar(): void {
  for (const el of piezas) {
    if (reducir.matches || !('IntersectionObserver' in window)) el.classList.remove('animada', 'corre');
    else el.classList.add('animada');
  }
}

if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver(
    (entradas) => {
      for (const e of entradas) e.target.classList.toggle('corre', e.isIntersecting);
    },
    { threshold: 0.35 },
  );
  for (const el of piezas) io.observe(el);
}
preparar();
reducir.addEventListener('change', preparar);
