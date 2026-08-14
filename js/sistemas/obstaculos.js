import { ESCALA_ARTE } from '../core/constantes.js';
import { Recursos } from '../core/recursos.js';
import { ENEMIGOS } from '../datos/enemigos.js';

// Objetos sólidos del escenario: columnas, antorchas, estatuas y ruinas a los
// lados de la calzada (datos/niveles/merida.js, campo `decoracion`). Bloquean
// tanto a jugadores como a enemigos (ver sistemas/colisiones.js,
// `colisionarObstaculos`).
//
// Son ESTÁTICOS y pocos —una decena por pantalla como mucho—, así que no
// llevan Pool ni entran en la rejilla espacial de enemigos: un array
// preasignado que se reescribe EN EL SITIO cuando la fila de tile visible
// cambia. Cero asignación durante la partida salvo al cargar el nivel.
//
// La plantilla del nivel está en coordenadas LOCALES a un tile de suelo (0 al
// ancho/alto de `niveles/<mapa>.png` ya procesado); este módulo la repite
// hacia arriba y hacia abajo igual que el propio suelo se repite por hash.

function dibujarObstaculo(ctx) {
  if (!this.img) return;
  // Mismo cuadre a píxel físico entero que usa Enemigos.dibujar: sin esto el
  // sprite tiembla al desplazarse la cámara aunque el objeto no se mueva.
  const cxF = Math.round(this.x * ESCALA_ARTE);
  const cyF = Math.round(this.y * ESCALA_ARTE);
  ctx.drawImage(this.img,
    (cxF - (this.w >> 1)) / ESCALA_ARTE, (cyF - this.h) / ESCALA_ARTE,
    this.w / ESCALA_ARTE, this.h / ESCALA_ARTE);
}

function crearInstancia() {
  return {
    x: 0, y: 0, yVista: 0, radio: 0,
    img: null, w: 0, h: 0,
    dibujar: dibujarObstaculo
  };
}

export const Obstaculos = {
  items: [],
  activos: 0,
  _plantilla: null,
  _filaBase: NaN,     // fuerza el primer cálculo
  _filasConTorchas: null,  // filas donde ya se ha invocado lo destruible

  iniciar(nivel) {
    this._plantilla = nivel.decoracion || [];
    // Tres filas de tile (la central más un margen arriba y abajo) por
    // entrada de plantilla: de sobra para cubrir el viewport sin recalcular
    // cada frame según el usuario avanza.
    const capacidad = Math.max(1, this._plantilla.length) * 3;
    this.items = new Array(capacidad);
    for (let i = 0; i < capacidad; i++) this.items[i] = crearInstancia();
    this.activos = 0;
    this._filaBase = NaN;
    this._filasConTorchas = new Set();
  },

  // Una vez por paso de lógica. Si la fila de tile bajo la cámara no ha
  // cambiado desde el último cálculo, las instancias activas siguen siendo
  // válidas y no se toca nada.
  //
  // `enemigos` es opcional y solo hace falta para las entradas DESTRUIBLES de
  // la plantilla (antorchas): esas no se guardan aquí como Obstaculo de solo
  // dibujo, se dan de alta en el pool de enemigos (ver datos/enemigos.js,
  // `esObjeto`) para heredar gratis el daño de cualquier arma, el choque
  // sólido y la muerte con su efecto. El resto de la decoración (columnas,
  // estatuas, ruinas) sigue el camino de siempre.
  // Saca a `e` de cualquier obstáculo en el que haya caído dentro.
  //
  // Lo usan los objetos del suelo: un consumible que aparece detrás de una
  // columna o dentro de unas ruinas es un objeto que no se puede recoger, porque
  // el jugador no puede llegar hasta él —el obstáculo le frena antes—. Sergio se
  // encontró varios así.
  //
  // Recorre los obstáculos activos y no la rejilla porque son una decena por
  // pantalla como mucho (ver la nota de arriba), y esto se llama unas pocas
  // veces por segundo, no por entidad y frame.
  apartar(e, margen) {
    const items = this.items;
    for (let k = 0; k < this.activos; k++) {
      const o = items[k];
      const dx = e.x - o.x;
      const dy = e.y - o.y;
      const r = o.radio + margen;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const f = (r - d) / d;
        e.x += dx * f;
        e.y += dy * f;
      } else {
        e.x += r;                 // justo en el eje: sale por la derecha
      }
    }
  },

  actualizar(camaraY, enemigos) {
    const altoTile = Recursos.altoSuelo;
    if (!altoTile || !this._plantilla || this._plantilla.length === 0) {
      this.activos = 0;
      return;
    }

    const filaCentro = Math.floor(camaraY / altoTile);
    if (filaCentro === this._filaBase) return;
    this._filaBase = filaCentro;

    let k = 0;
    for (let fila = filaCentro - 1; fila <= filaCentro + 1; fila++) {
      const origenY = fila * altoTile;
      // Las destruibles se invocan UNA sola vez por fila en toda la partida,
      // no cada vez que la ventana de ±1 vuelve a cubrirla (oscilar cerca de
      // un borde la recalcularía muchas veces): sin esto, ir y volver sobre
      // el mismo tramo duplicaría antorchas ya vivas. Si el jugador se aleja
      // tanto que el culling se las lleva, no vuelven a salir al regresar
      // —igual de "sin memoria" que el resto del suelo repetido—.
      const yaInvocadaFila = this._filasConTorchas.has(fila);

      for (let i = 0; i < this._plantilla.length; i++) {
        const entrada = this._plantilla[i];

        if (ENEMIGOS[entrada.tipo]) {
          if (!yaInvocadaFila && enemigos) {
            enemigos.aparecer(entrada.tipo, entrada.x, origenY + entrada.y, 1, 1);
          }
          continue;
        }

        if (k >= this.items.length) continue;
        const meta = Recursos.meta(entrada.tipo);
        if (!meta) continue;    // atlas sin esa entrada: se omite, no rompe

        const inst = this.items[k++];
        const anchoLog = meta.w / ESCALA_ARTE;
        const altoLog = meta.h / ESCALA_ARTE;
        inst.x = entrada.x;
        inst.y = origenY + entrada.y;
        inst.yVista = inst.y;
        // Misma fórmula que el radio de daño de los enemigos (sección 10 del
        // plan): min(0.35*alto, 0.45*ancho). Aquí es el único radio —un
        // obstáculo no distingue entre "lo que golpea" y "lo que bloquea".
        inst.radio = Math.min(0.35 * altoLog, 0.45 * anchoLog);
        inst.img = Recursos.imagen(entrada.tipo);
        inst.w = meta.w;
        inst.h = meta.h;
      }
      this._filasConTorchas.add(fila);
    }
    this.activos = k;
  }
};
