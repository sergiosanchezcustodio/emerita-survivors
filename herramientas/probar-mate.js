// Comprueba js/core/mate.js contra el Math del motor: exactitud y velocidad.
//
//   node herramientas\probar-mate.js
//
// NO comprueba que sea determinista entre navegadores — eso lo garantiza la
// construcción, porque `mate.js` solo usa operaciones que el estándar clava.
// Lo que comprueba es lo OTRO, que es donde se puede meter la pata: que dé el
// mismo resultado que `Math` hasta el último bit o casi, para que sustituirlo
// no cambie el tacto del juego.
//
// El error se mide en ULP (unit in the last place): la distancia entre dos
// números consecutivos representables. Un error de 1 ULP es la diferencia más
// pequeña que puede existir; medirlo en ULP y no en decimales es lo que
// distingue "bien" de "bien en los números grandes y mal en los pequeños".

import { sen, cos, atan, atan2, hipot, exp, PI, TAU } from '../js/core/mate.js';

const BUF = new ArrayBuffer(8);
const F64 = new Float64Array(BUF);
const I32 = new Int32Array(BUF);

// Los doubles ordenados por su representación binaria son consecutivos, así que
// restar sus bits da cuántos números representables hay entre uno y otro.
function bitsDe(x) {
  F64[0] = x;
  const alto = I32[1], bajo = I32[0];
  const v = (BigInt(alto >>> 0) << 32n) | BigInt(bajo >>> 0);
  // Los negativos se ordenan al revés: se les da la vuelta.
  return (alto & 0x80000000) ? -(v & 0x7fffffffffffffffn) : v;
}

function ulps(a, b) {
  if (a === b) return 0;
  if (a !== a || b !== b) return Infinity;
  if (!isFinite(a) || !isFinite(b)) return Infinity;
  const d = bitsDe(a) - bitsDe(b);
  return Number(d < 0n ? -d : d);
}

// EL ULP MIENTE CERCA DEL CERO, y hay que decirlo o la tabla engaña.
//
// `sen(x)` junto a un múltiplo de pi vale del orden de 1e-16. Ahí, dos
// resultados que se diferencian en 1e-27 —una cantidad sin ningún significado
// físico— están separados por cientos de miles de números representables,
// porque los doubles se apiñan cuanto más cerca del cero. La primera versión de
// esta prueba informaba de 285.703 ULP y parecía una catástrofe cuando era
// exactamente lo contrario.
//
// Así que se miden LAS DOS COSAS: el ULP, que es lo que importa donde el valor
// es grande, y el error absoluto, que es lo que importa donde es diminuto. Un
// resultado es bueno si alguna de las dos es pequeña.
function medir(nombre, mio, suyo, generar, n = 300000) {
  let peorU = 0, peorUEn = 0, peorAbs = 0, peorAbsEn = 0, exactos = 0;
  for (let i = 0; i < n; i++) {
    const x = generar(i, n);
    const a = mio(x), b = suyo(x);
    const u = ulps(a, b);
    const abs = Math.abs(a - b);
    if (u === 0) exactos++;
    // Solo cuenta como "peor ULP" si además el error absoluto no es
    // despreciable: si lo es, la distancia en ULP es un espejismo del cero.
    if (u > peorU && abs > 1e-18) { peorU = u; peorUEn = x; }
    if (abs > peorAbs) { peorAbs = abs; peorAbsEn = x; }
  }
  const pct = (100 * exactos / n).toFixed(2);
  console.log(`  ${nombre.padEnd(9)} peor ${String(peorU).padStart(2)} ULP   ` +
              `error abs. máx ${peorAbs.toExponential(1)}   ` +
              `idéntico al bit ${pct}%`);
  return peorU;
}

console.log('\nEXACTITUD contra el Math de este motor (V8):\n');

// Rango de juego: ángulos de unos pocos cientos de radianes como mucho.
const anguloJuego = (i, n) => (i / n) * 200 - 100;
// Y un rango pequeño, que es donde vive casi todo (fases, órbitas, direcciones).
const anguloCorto = (i, n) => (i / n) * TAU * 2 - TAU;

let peorTotal = 0;
peorTotal = Math.max(peorTotal, medir('sen', sen, Math.sin, anguloCorto));
peorTotal = Math.max(peorTotal, medir('sen ±100', sen, Math.sin, anguloJuego));
peorTotal = Math.max(peorTotal, medir('cos', cos, Math.cos, anguloCorto));
peorTotal = Math.max(peorTotal, medir('cos ±100', cos, Math.cos, anguloJuego));
peorTotal = Math.max(peorTotal, medir('atan', atan, Math.atan, (i, n) => (i / n) * 40 - 20));
peorTotal = Math.max(peorTotal,
  medir('atan2', (x) => atan2(x, 1.7 - x * 0.3), (x) => Math.atan2(x, 1.7 - x * 0.3),
        (i, n) => (i / n) * 20 - 10));
peorTotal = Math.max(peorTotal,
  medir('hipot', (x) => hipot(x, x * 0.5 + 1), (x) => Math.hypot(x, x * 0.5 + 1),
        (i, n) => (i / n) * 400 - 200));
peorTotal = Math.max(peorTotal, medir('exp', exp, Math.exp, (i, n) => -(i / n) * 3));

console.log('\nCASOS DE BORDE:\n');
const bordes = [
  ['sen(0)', sen(0), Math.sin(0)],
  ['cos(0)', cos(0), Math.cos(0)],
  ['sen(PI)', sen(PI), Math.sin(PI)],
  ['cos(PI)', cos(PI), Math.cos(PI)],
  ['atan2(0,1)', atan2(0, 1), Math.atan2(0, 1)],
  ['atan2(0,-1)', atan2(0, -1), Math.atan2(0, -1)],
  ['atan2(-0,1)', atan2(-0, 1), Math.atan2(-0, 1)],
  ['atan2(1,0)', atan2(1, 0), Math.atan2(1, 0)],
  ['atan2(-1,0)', atan2(-1, 0), Math.atan2(-1, 0)],
  ['atan2(0,0)', atan2(0, 0), Math.atan2(0, 0)],
  ['atan2(-1,-1)', atan2(-1, -1), Math.atan2(-1, -1)],
  ['exp(0)', exp(0), Math.exp(0)],
  ['hipot(3,4)', hipot(3, 4), Math.hypot(3, 4)]
];
for (const [nombre, a, b] of bordes) {
  const ok = Object.is(a, b) || ulps(a, b) <= 2;
  console.log(`  ${ok ? 'OK  ' : 'MAL '} ${nombre.padEnd(14)} ${a}   (Math: ${b})`);
}

console.log('\nVELOCIDAD (millones de llamadas por segundo, más alto es mejor):\n');
function velocidad(nombre, f, n = 4000000) {
  let acc = 0;
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < n; i++) acc += f(i * 0.000317);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  if (acc === 12345.6789) console.log('');   // que no lo optimice fuera
  return n / ms / 1000;
}
const pares = [['sen', sen, Math.sin], ['cos', cos, Math.cos],
               ['atan', atan, Math.atan], ['exp', exp, Math.exp]];
for (const [nombre, mio, suyo] of pares) {
  velocidad(nombre, mio); velocidad(nombre, suyo);          // calentar
  const a = velocidad(nombre, mio), b = velocidad(nombre, suyo);
  const rel = a / b;
  console.log(`  ${nombre.padEnd(6)} mate.js ${a.toFixed(1).padStart(6)}   ` +
              `Math ${b.toFixed(1).padStart(6)}   ` +
              `${rel >= 1 ? (rel).toFixed(2) + 'x más rápido' : (1 / rel).toFixed(2) + 'x más lento'}`);
}

console.log(`\nPeor error de todos: ${peorTotal} ULP\n`);
