#!/usr/bin/env node
/**
 * Escribe los dos archivos de datos de la portada en UN paso, desde la base de demostración de la
 * app, para que nunca queden de dos versiones distintas de la demo:
 *
 * - `src/data/cifras-de-la-demo.json`: lo escribe el exportador de la app
 *   (`scripts/exportar-cifras-de-la-demo.mjs`), con el mismo `--mes` y `--hoy`.
 * - `src/data/momentos.json`: lo que muestran los tres momentos animados de la portada.
 *   · `llega`, `hoyAntes`, `ayer`: «Entra solo» (un gasto de hoy con la Tarjeta Cóndor y la lista).
 *   · `ritmo`: «Te dice cómo vas». El veredicto lo arma `buildVerdict` del ESCRITORIO
 *     (`src/lib/verdict.ts` de la app), con el ritmo de `computeBudgetPace` del núcleo sobre los
 *     gastos diarios de las categorías con tope (este mes hasta hoy y los meses de historia).
 *   · `loQueViene`: «Lo que viene». Los pagos que se repiten cada mes desde una cuenta de ahorros,
 *     en su próxima fecha después de hoy, corrida al día hábil anterior como en la app
 *     (`correrAlHabil(…, "antes")`). Sin tarjetas: la demo no tiene extractos de tarjeta.
 *
 * Todo es sintético: no abre ninguna base de verdad ni sale a la red.
 *
 * Antes, en el repo de la app:  npm run build --workspace @presu/core
 * Uso (desde la raíz de este repo):
 *   node scripts/actualizar-datos-de-la-demo.mjs --app /ruta/a/Gastos_Personales [--mes 2026-11] [--hoy 2026-11-27]
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (nombre, defecto) => {
  const i = process.argv.indexOf(nombre);
  return i >= 0 ? process.argv[i + 1] : defecto;
};
const app = arg('--app');
const mes = arg('--mes', '2026-11');
const hoy = arg('--hoy', '2026-11-27');
if (!app || !/^\d{4}-\d{2}$/.test(mes) || !hoy.startsWith(`${mes}-`)) {
  console.error('Uso: node scripts/actualizar-datos-de-la-demo.mjs --app <repo de la app> [--mes AAAA-MM] [--hoy AAAA-MM-DD]');
  process.exit(2);
}
const APP = resolve(app);

// 1 · Las cifras, con el exportador de la app.
const SALIDA_CIFRAS = join(WEB, 'src', 'data', 'cifras-de-la-demo.json');
execFileSync(
  process.execPath,
  [join(APP, 'scripts', 'exportar-cifras-de-la-demo.mjs'), '--mes', mes, '--hoy', hoy, '--salida', SALIDA_CIFRAS],
  { cwd: APP, stdio: 'inherit' },
);
const cifras = JSON.parse(readFileSync(SALIDA_CIFRAS, 'utf8'));

// 2 · La misma base, en memoria.
const require = createRequire(import.meta.url);
const nucleo = require(join(APP, 'packages', 'core', 'dist', 'index.js'));
const { baseDeDemostracion } = require(join(APP, 'packages', 'core', 'dist', 'demo', 'index.js'));
const base = baseDeDemostracion(mes, hoy);
const categoria = new Map(base.categorias.map((c) => [c.id, c]));
const cuenta = new Map(base.cuentas.map((c) => [c.id, c]));
const fila = (m) => ({
  id: m.id,
  fecha: m.fecha,
  comercio: m.comercio,
  categoria: categoria.get(m.categoria).nombre,
  color: categoria.get(m.categoria).color,
  cuenta: cuenta.get(m.cuenta).nombre,
  tipoDeCuenta: cuenta.get(m.cuenta).tipo,
  banco: cuenta.get(m.cuenta).banco,
  monto: m.monto,
});
const esGasto = (m) => m.tipo === 'debit' && (m.clase === 'real_expense' || m.clase === 'financial_cost');
const delDia = (f) => base.movimientos.filter((m) => m.fecha === f && m.clase === 'real_expense').sort((a, b) => b.id - a.id);

// 3 · «Entra solo». La escena pasa el último día con un gasto de Banco Andino hasta `hoy`: si la
// demo no tiene movimientos el día de `hoy`, la escena es del día anterior que sí tiene (el aviso
// tiene que ser un movimiento que está en la base, o el total del mes dejaría de ser el de las cifras).
const deAndino = (m) => cuenta.get(m.cuenta).banco === 'Banco Andino';
const diaDeLaEscena = [...new Set(base.movimientos.filter((m) => m.clase === 'real_expense' && deAndino(m)).map((m) => m.fecha))]
  .filter((f) => f <= hoy)
  .sort()
  .at(-1);
if (!diaDeLaEscena) throw new Error(`la demo no tiene gastos de Banco Andino hasta el ${hoy}`);
const deHoy = delDia(diaDeLaEscena);
const llega =
  deHoy.find((m) => cuenta.get(m.cuenta).nombre === 'Tarjeta Cóndor') ??
  [...deHoy].filter(deAndino).sort((a, b) => b.monto - a.monto)[0];
const anterior = [...new Set(base.movimientos.filter((m) => m.clase === 'real_expense').map((m) => m.fecha))]
  .filter((f) => f < diaDeLaEscena)
  .sort()
  .at(-1);
const ayer = delDia(anterior)
  .filter((m, i, todos) => todos.findIndex((y) => y.categoria === m.categoria) === i)
  .slice(0, 3);

// 4 · «Te dice cómo vas».
const nombreDeCategoria = new Map(base.categorias.map((c) => [c.nombre, c.id]));
const conTope = new Set(cifras.topes.map((t) => nombreDeCategoria.get(t.categoria)));
const [anio, numMes] = mes.split('-').map(Number);
const diasDelMes = new Date(Date.UTC(anio, numMes, 0)).getUTCDate();
const diaDeHoy = Number(hoy.slice(8, 10));
const mesMenos = (n) => {
  const total = anio * 12 + (numMes - 1) - n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
};
function diarios(ym, categorias = conTope) {
  const por = new Map();
  for (const m of base.movimientos) {
    if (!m.fecha.startsWith(`${ym}-`) || !categorias.has(m.categoria)) continue;
    const signo = esGasto(m) ? 1 : m.clase === 'refund' ? -1 : 0;
    if (!signo) continue;
    const d = Number(m.fecha.slice(8, 10));
    por.set(d, (por.get(d) ?? 0) + signo * m.monto);
  }
  return [...por].sort((a, b) => a[0] - b[0]).map(([day, amount]) => ({ day, amount }));
}
const meses = [];
for (let i = 1; i <= 6; i++) {
  const ym = mesMenos(i);
  if (base.movimientos.some((m) => m.fecha.startsWith(`${ym}-`))) meses.push(ym);
}
const actual = diarios(mes);
const limite = cifras.topes.reduce((s, t) => s + t.tope, 0);
const gastadoConTope = cifras.topes.reduce((s, t) => s + t.gastado, 0);
const sumaDiaria = actual.reduce((s, d) => s + d.amount, 0);
if (Math.round(sumaDiaria) !== gastadoConTope)
  throw new Error(`los gastos diarios con tope (${sumaDiaria}) no suman lo de las cifras (${gastadoConTope})`);
const pace = nucleo.computeBudgetPace({
  priorMonths: meses.map((ym) => diarios(ym)),
  actual,
  limit: limite,
  dayOfMonth: diaDeHoy,
  daysInMonth: diasDelMes,
});
// El veredicto del escritorio, tal cual: `src/lib/verdict.ts` con su import del núcleo apuntado al construido.
const fuenteDelVeredicto = readFileSync(join(APP, 'src', 'lib', 'verdict.ts'), 'utf8');
const importDelNucleo = /^import \{([^}]*)\} from "@presu\/core";$/m;
const nombres = fuenteDelVeredicto
  .match(importDelNucleo)[1]
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s && !s.startsWith('type '));
const carpeta = mkdtempSync(join(tmpdir(), 'veredicto-'));
const copia = join(carpeta, 'verdict.ts');
writeFileSync(
  copia,
  fuenteDelVeredicto.replace(
    importDelNucleo,
    `import { createRequire } from "node:module";\nconst { ${nombres.join(', ')} } = createRequire(import.meta.url)(${JSON.stringify(join(APP, 'packages', 'core', 'dist', 'index.js'))});`,
  ),
);
const { buildVerdict } = await import(pathToFileURL(copia).href);
const ingresoUsual = (() => {
  const v = meses
    .map((ym) => base.movimientos.filter((m) => m.fecha.startsWith(`${ym}-`) && m.clase === 'real_income').reduce((s, m) => s + m.monto, 0))
    .sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : undefined;
})();
const veredicto = buildVerdict({
  income: cifras.ingresos,
  incomeKnown: true,
  expenses: cifras.gastos,
  balance: cifras.balance,
  budgetLimit: limite,
  budgetSpent: gastadoConTope,
  budgetPct: (gastadoConTope / limite) * 100,
  isCurrentMonth: true,
  usualMonthlyIncome: ingresoUsual,
  pace: {
    verdict: pace.verdict,
    expectedByToday: pace.expectedByToday,
    cold: pace.projectionBasis === 'linear',
    mensaje: nucleo.mensajeDelPace(pace, limite),
  },
});
let acumulado = 0;
const porDia = new Map(actual.map((d) => [d.day, d.amount]));
const lleva = [];
for (let d = 1; d <= diaDeHoy; d++) {
  acumulado += porDia.get(d) ?? 0;
  lleva.push(Math.round(acumulado));
}
// Cada dona, con su propio ritmo y la forma canónica del núcleo (`formaDeLaDona`): lo hecho, lo que
// va por encima de donde irías hoy (ámbar) y la muesca de dónde irías hoy.
const donas = cifras.topes.map((t) => {
  const id = nombreDeCategoria.get(t.categoria);
  const sola = new Set([id]);
  const p = nucleo.computeBudgetPace({
    priorMonths: meses.map((ym) => diarios(ym, sola)),
    actual: diarios(mes, sola),
    limit: t.tope,
    dayOfMonth: diaDeHoy,
    daysInMonth: diasDelMes,
  });
  const forma = nucleo.formaDeLaDona(t.gastado, t.tope, nucleo.ritmoParaLaDona(p));
  return {
    categoria: t.categoria,
    color: categoria.get(id).color,
    gastado: t.gastado,
    tope: t.tope,
    pct: Math.round((t.gastado / t.tope) * 100),
    tramos: forma.tramos.map((x) => ({ tipo: x.tipo, desde: Number(x.desde.toFixed(4)), hasta: Number(x.hasta.toFixed(4)) })),
    muesca: forma.muesca == null ? null : Number(forma.muesca.toFixed(4)),
  };
});
const ritmo = {
  dia: diaDeHoy,
  diasDelMes,
  tope: limite,
  gastado: gastadoConTope,
  veredicto: { estado: veredicto.status, tono: veredicto.tone, segmentos: veredicto.segments },
  // Acumulado del día 1 a hoy, y la curva «para cerrar en tu tope» del día 1 al último.
  lleva,
  paraCerrarEnTuTope: pace.expectedCurve.slice(1, diasDelMes + 1).map((n) => Math.round(n)),
  esperadoHoy: Math.round(pace.expectedByToday),
  donas,
};

// 5 · «Lo que viene».
const mesSiguiente = (() => {
  const total = anio * 12 + numMes;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
})();
const proxima = (dia) => {
  const enEste = `${mes}-${String(dia).padStart(2, '0')}`;
  const cruda = enEste > hoy ? enEste : `${mesSiguiente}-${String(dia).padStart(2, '0')}`;
  return nucleo.correrAlHabil(cruda, 'antes');
};
const series = new Map();
for (const m of base.movimientos) {
  if (!m.fecha.startsWith(`${mes}-`) || !esGasto(m) || cuenta.get(m.cuenta).tipo !== 'bank_account') continue;
  // Se repite: el mismo comercio, desde la misma cuenta, UNA vez al mes y el mismo día, en tres meses o más.
  const ocurrencias = base.movimientos.filter((x) => x.comercio === m.comercio && x.cuenta === m.cuenta && esGasto(x));
  const porMes = new Map();
  for (const x of ocurrencias) porMes.set(x.fecha.slice(0, 7), (porMes.get(x.fecha.slice(0, 7)) ?? 0) + 1);
  const mismoDia = ocurrencias.every((x) => x.fecha.slice(8, 10) === m.fecha.slice(8, 10));
  if (porMes.size < 3 || [...porMes.values()].some((n) => n !== 1) || !mismoDia) continue;
  series.set(m.comercio, m);
}
const pagos = [...series.values()].map((m) => ({
  nombre: m.comercio,
  fecha: proxima(Number(m.fecha.slice(8, 10))),
  monto: m.monto,
}));
// Las tarjetas NO van: «Lo que viene» del celular muestra una tarjeta con el mínimo y la fecha que
// trae su EXTRACTO (`lo-que-viene-pure.ts`), y la demo no tiene extractos de tarjeta. Inventarlos
// sería mostrar algo que la app no mostraría con esta base.
const loQueViene = [...pagos].sort((a, b) => a.fecha.localeCompare(b.fecha) || b.monto - a.monto);

const momentos = {
  _origen: `node scripts/actualizar-datos-de-la-demo.mjs --app <repo de la app> --mes ${mes} --hoy ${hoy}: la MISMA base que cifras-de-la-demo.json.`,
  mes,
  hoy,
  diaDeLaEscena,
  llega: fila(llega),
  hoyAntes: deHoy.filter((m) => m.id !== llega.id).map(fila),
  ayer: ayer.map(fila),
  ritmo,
  loQueViene,
};
writeFileSync(join(WEB, 'src', 'data', 'momentos.json'), `${JSON.stringify(momentos, null, 2)}\n`);
console.log(`momentos.json escrito: ${veredicto.status} · ${loQueViene.length} pagos por venir`);
