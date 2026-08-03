// PRNG determinista con semilla. Mismo semilla => misma partida, que es el
// criterio de aceptación 10 y la única forma de depurar el balance en serio.

// mulberry32: rápido, sin estado externo, distribución más que suficiente.
export function crearRng(semilla) {
  let a = semilla >>> 0;
  return function siguiente() {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hash entero de dos coordenadas, SIN estado. Sirve para decidir la variante de
// un tile a partir de su posición: el mismo tile sale igual siempre, se mire
// cuando se mire, y no hay que guardar el mapa en memoria.
export function hash2(x, y) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2545f491);
  h ^= h >>> 13;
  return (h >>> 0);
}
