// Centro de ayuda de Presu: índice que sigue la lectura, buscador de la portada y figuras que se tocan.
(function () {
  "use strict";

  // Índice: marca la sección que se está leyendo.
  var toc = document.querySelectorAll(".d-toc a[href^='#']");
  if (toc.length && "IntersectionObserver" in window) {
    var byId = {};
    toc.forEach(function (a) { byId[a.getAttribute("href").slice(1)] = a; });
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        toc.forEach(function (a) { a.classList.remove("on"); });
        var a = byId[e.target.id];
        if (a) a.classList.add("on");
      });
    }, { rootMargin: "0px 0px -70% 0px" });
    Object.keys(byId).forEach(function (id) {
      var h = document.getElementById(id);
      if (h) obs.observe(h);
    });
  }

  // Portada: filtra tarjetas por texto, sin distinguir tildes.
  var q = document.getElementById("q");
  if (q) {
    var norm = function (s) { return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); };
    var cards = Array.prototype.slice.call(document.querySelectorAll(".card"));
    var groups = document.querySelectorAll(".group");
    var empty = document.querySelector(".empty");
    q.addEventListener("input", function () {
      var t = norm(q.value.trim());
      var any = false;
      cards.forEach(function (c) {
        var hit = !t || norm(c.textContent + " " + (c.dataset.k || "")).indexOf(t) !== -1;
        c.style.display = hit ? "" : "none";
        if (hit) any = true;
      });
      groups.forEach(function (g) {
        var vis = g.querySelectorAll(".card:not([style*='none'])").length;
        g.style.display = vis ? "" : "none";
      });
      if (empty) empty.style.display = any ? "none" : "block";
    });
  }

  // Figura de la tubería de importación: un clic explica cada paso.
  document.querySelectorAll(".pipe").forEach(function (pipe) {
    var detail = pipe.parentElement.querySelector(".pipe-detail");
    pipe.querySelectorAll(".st").forEach(function (st) {
      st.addEventListener("click", function () {
        pipe.querySelectorAll(".st").forEach(function (x) { x.classList.remove("on"); });
        st.classList.add("on");
        if (detail) detail.innerHTML = st.dataset.d;
      });
    });
    var first = pipe.querySelector(".st");
    if (first) first.click();
  });

  // Figura del conteo doble.
  document.querySelectorAll("[data-double]").forEach(function (fig) {
    var btns = fig.querySelectorAll(".toggle button");
    var apply = function (mode) {
      btns.forEach(function (b) { b.classList.toggle("on", b.dataset.m === mode); });
      fig.querySelectorAll("[data-only]").forEach(function (el) {
        el.style.display = el.dataset.only === mode ? "" : "none";
      });
    };
    btns.forEach(function (b) { b.addEventListener("click", function () { apply(b.dataset.m); }); });
    apply("mal");
  });

  // Figura del ritmo: curva de tu forma histórica contra la línea recta, con un día que se mueve.
  var ritmo = document.getElementById("ritmo");
  if (ritmo) {
    var W = 640, H = 300, P = { l: 46, r: 16, t: 16, b: 34 };
    var DAYS = 30, TOPE = 1200000;
    // Forma acumulada de ejemplo: un mes con gasto fuerte al inicio (arriendo, mercado) y otro pico a la quincena.
    var shape = [];
    for (var d = 0; d <= DAYS; d++) {
      var x = d / DAYS;
      var base = 0.42 * (1 - Math.exp(-d / 2.2)) + 0.45 * x + 0.13 / (1 + Math.exp(-(d - 15) * 1.1));
      shape.push(base);
    }
    var max = shape[DAYS];
    shape = shape.map(function (v) { return v / max; });
    // Gasto real de ejemplo: va un poco por encima a mitad de mes.
    var real = shape.map(function (v, i) { return Math.min(1.25, v * (1 + 0.16 * Math.sin(Math.PI * i / DAYS))); });

    var sx = function (d) { return P.l + (W - P.l - P.r) * d / DAYS; };
    var sy = function (f) { return H - P.b - (H - P.t - P.b) * f / 1.25; };
    var path = function (arr, upto) {
      var s = "";
      for (var i = 0; i <= upto; i++) s += (i ? "L" : "M") + sx(i).toFixed(1) + " " + sy(arr[i]).toFixed(1);
      return s;
    };
    var fmt = function (n) { return "$" + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "."); };

    var svg = ritmo.querySelector("svg");
    var ns = "http://www.w3.org/2000/svg";
    var el = function (tag, attrs) {
      var e = document.createElementNS(ns, tag);
      for (var k in attrs) e.setAttribute(k, attrs[k]);
      svg.appendChild(e);
      return e;
    };
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    // Rejilla y ejes
    [0, 0.5, 1].forEach(function (f) {
      el("line", { x1: P.l, x2: W - P.r, y1: sy(f), y2: sy(f), stroke: "rgba(255,255,255,.08)" });
      var t = el("text", { x: P.l - 8, y: sy(f) + 4, "text-anchor": "end", fill: "#6B6B72", "font-size": 11, "font-family": "JetBrains Mono" });
      t.textContent = f === 1 ? "tope" : Math.round(f * 100) + "%";
    });
    [1, 10, 20, 30].forEach(function (d) {
      var t = el("text", { x: sx(d), y: H - 12, "text-anchor": "middle", fill: "#6B6B72", "font-size": 11, "font-family": "JetBrains Mono" });
      t.textContent = "día " + d;
    });
    el("line", { x1: sx(0), y1: sy(0), x2: sx(DAYS), y2: sy(1), stroke: "#6B6B72", "stroke-width": 1.5, "stroke-dasharray": "2 5" });
    el("path", { d: path(shape, DAYS), fill: "none", stroke: "#34D399", "stroke-width": 2, "stroke-dasharray": "6 5", opacity: .85 });
    var realPath = el("path", { fill: "none", stroke: "#F4F4F3", "stroke-width": 2.5, "stroke-linecap": "round" });
    var cursor = el("line", { y1: P.t, y2: H - P.b, stroke: "rgba(255,255,255,.25)" });
    var dotE = el("circle", { r: 5, fill: "#08080A", stroke: "#34D399", "stroke-width": 2 });
    var dotR = el("circle", { r: 5, fill: "#F4F4F3" });

    var slider = ritmo.querySelector("input");
    var out = {
      day: ritmo.querySelector("[data-o=day]"),
      spent: ritmo.querySelector("[data-o=spent]"),
      exp: ritmo.querySelector("[data-o=exp]"),
      lin: ritmo.querySelector("[data-o=lin]"),
      verdict: ritmo.querySelector("[data-o=verdict]")
    };
    var draw = function () {
      var d = +slider.value;
      realPath.setAttribute("d", path(real, d));
      cursor.setAttribute("x1", sx(d)); cursor.setAttribute("x2", sx(d));
      dotE.setAttribute("cx", sx(d)); dotE.setAttribute("cy", sy(shape[d]));
      dotR.setAttribute("cx", sx(d)); dotR.setAttribute("cy", sy(real[d]));
      var spent = real[d] * TOPE, exp = shape[d] * TOPE, lin = d / DAYS * TOPE;
      out.day.textContent = d;
      out.spent.textContent = fmt(spent);
      out.exp.textContent = fmt(exp);
      out.lin.textContent = fmt(lin);
      var r = exp > 0 ? spent / exp : 1;
      var v, c;
      if (spent > TOPE) { v = "Te pasaste del tope"; c = "#F47A8E"; }
      else if (r > 1.08) { v = "Vas más rápido"; c = "#F5B544"; }
      else if (r < 0.92) { v = "Vas por debajo"; c = "#A1A1A6"; }
      else { v = "Vas a tiempo"; c = "#34D399"; }
      out.verdict.textContent = v;
      out.verdict.style.color = c;
    };
    slider.addEventListener("input", draw);
    draw();
  }
})();
