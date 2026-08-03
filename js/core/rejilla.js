// Spatial hash para colisiones. Nunca N²: con 800 entidades eso son 320.000
// pares por frame, y a 60 Hz no cabe en ningún presupuesto.
//
// Implementación por ORDENACIÓN POR CONTEO sobre arrays tipados preasignados,
// no un Map de celda -> array. Un Map obliga a crear arrays y entradas cada
// frame, que es exactamente la presión sobre el recolector que el pool evita.
// Aquí no se asigna un solo byte después del arranque: se limpia un Int32Array,
// se cuenta, se acumula y se rellena.
//
// La rejilla es LOCAL A LA CÁMARA. El mapa es infinito, así que una rejilla
// global tendría que ser dispersa (y volvemos al Map). Como el culling ya
// garantiza que no hay enemigos vivos fuera de la región activa, basta con una
// rejilla fija que cubra esa región y que se reancla a la cámara cada frame.

// Lado de la celda, en unidades lógicas. Buscar en la vecindad 3x3 encuentra
// TODOS los pares separados por 64 o menos, y ni uno más. El par más exigente
// del bestiario son dos cíclopes: radio 14, separación 14x1.6=22.4 cada uno,
// 44.8 en total. Cabe de sobra.
//
// Los jefes se salen de esa cuenta (la hidra sola pide 124.8) y por eso NO se
// separan bien entre ellos. Da igual: aparecen de uno en uno, y el Cerbero
// además limpia la pantalla al invocarse.
export const CELDA = 64;

export class Rejilla {
  // semiAncho/semiAlto: media anchura y media altura de la región activa, en
  // unidades lógicas. Se añade un anillo de una celda de margen para que nada
  // que esté dentro de la región de culling caiga fuera de la rejilla.
  constructor(capacidad, semiAncho, semiAlto) {
    this.columnas = Math.ceil((semiAncho * 2) / CELDA) + 2;
    this.filas    = Math.ceil((semiAlto  * 2) / CELDA) + 2;
    this.numCeldas = this.columnas * this.filas;

    // inicio[c] = primer índice de la celda c dentro de `indices`.
    // El rango de la celda c es [inicio[c], inicio[c+1]).
    this.inicio  = new Int32Array(this.numCeldas + 1);
    this.cursor  = new Int32Array(this.numCeldas);
    this.indices = new Int32Array(capacidad);
    this.celdaDe = new Int32Array(capacidad);

    // Esquina superior izquierda de la rejilla, en coordenadas de mundo.
    this.origenX = 0;
    this.origenY = 0;
    this.n = 0;
  }

  // items: array del pool. n: cuántos están activos (los n primeros).
  reconstruir(items, n, centroX, centroY) {
    // El origen se cuantiza a múltiplos de CELDA. Si siguiera a la cámara con
    // precisión decimal, una entidad quieta cambiaría de celda cada frame por el
    // desplazamiento del origen, no por moverse ella.
    const anchoTotal = this.columnas * CELDA;
    const altoTotal  = this.filas * CELDA;
    this.origenX = Math.floor((centroX - anchoTotal / 2) / CELDA) * CELDA;
    this.origenY = Math.floor((centroY - altoTotal  / 2) / CELDA) * CELDA;
    this.n = n;

    const inicio = this.inicio;
    const cursor = this.cursor;
    const indices = this.indices;
    const celdaDe = this.celdaDe;
    const columnas = this.columnas;
    const numCeldas = this.numCeldas;

    inicio.fill(0);

    // 1. Contar cuántas entidades caen en cada celda.
    for (let k = 0; k < n; k++) {
      const e = items[k];
      let cx = ((e.x - this.origenX) / CELDA) | 0;
      let cy = ((e.y - this.origenY) / CELDA) | 0;
      // Pinza defensiva: el culling debería impedir que esto haga falta, pero
      // un enemigo recién aparecido puede llegar aquí antes de su primer culling.
      if (cx < 0) cx = 0; else if (cx >= columnas) cx = columnas - 1;
      if (cy < 0) cy = 0; else if (cy >= this.filas) cy = this.filas - 1;
      const c = cy * columnas + cx;
      celdaDe[k] = c;
      inicio[c + 1]++;
    }

    // 2. Suma acumulada: inicio[c] pasa a ser el offset de la celda c.
    for (let c = 1; c <= numCeldas; c++) inicio[c] += inicio[c - 1];

    // 3. Rellenar. El cursor es una copia del offset que se va consumiendo;
    //    `inicio` tiene que sobrevivir intacto para poder consultar rangos.
    for (let c = 0; c < numCeldas; c++) cursor[c] = inicio[c];
    for (let k = 0; k < n; k++) indices[cursor[celdaDe[k]]++] = k;
  }

  columnaDe(x) {
    let c = ((x - this.origenX) / CELDA) | 0;
    if (c < 0) c = 0; else if (c >= this.columnas) c = this.columnas - 1;
    return c;
  }

  filaDe(y) {
    let f = ((y - this.origenY) / CELDA) | 0;
    if (f < 0) f = 0; else if (f >= this.filas) f = this.filas - 1;
    return f;
  }
}
