// Altas de la waitlist por semana. Semana = lunes 00:00 a domingo 23:59:59 en Bogotá
// (UTC−5, sin horario de verano). `inicio` es ese lunes como AAAA-MM-DD.
const BOGOTA_MS = 5 * 3600 * 1000;
const DIA_MS = 86400000;
const SEMANA_MS = 7 * DIA_MS;

// Desplazamos el reloj a Bogotá y trabajamos en «UTC desplazado»: el epoch 0 fue jueves,
// así que el lunes más cercano hacia atrás cae en (ms − 4 días) alineado a semanas.
function lunesDe(ts) {
  const local = ts - BOGOTA_MS;
  const desde = Math.floor((local - 4 * DIA_MS) / SEMANA_MS) * SEMANA_MS + 4 * DIA_MS;
  return desde; // ms locales del lunes 00:00 Bogotá
}

function aFecha(localMs) {
  return new Date(localMs).toISOString().slice(0, 10);
}

export function altasPorSemana(registros, ahora, semanas) {
  const n = Math.max(1, Math.floor(semanas) || 1);
  const ultimo = lunesDe(ahora);
  const primero = ultimo - (n - 1) * SEMANA_MS;
  const cubetas = [];
  for (let i = 0; i < n; i++) cubetas.push({ inicio: aFecha(primero + i * SEMANA_MS), altas: 0 });
  let sinFecha = 0;
  for (const r of registros || []) {
    const ts = r && r.ts;
    if (typeof ts !== 'number' || !Number.isFinite(ts)) { sinFecha++; continue; }
    const lunes = lunesDe(ts);
    if (lunes < primero || lunes > ultimo) continue;
    cubetas[(lunes - primero) / SEMANA_MS].altas++;
  }
  return { semanas: cubetas, sinFecha };
}
