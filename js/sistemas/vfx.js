import { ESCALA_ARTE } from '../core/constantes.js';
import { Pool } from '../core/pool.js';

// Efectos de realimentación: números de daño flotantes, sacudida de cámara y
// hitstop. Singleton, como Particulas.
//
// Los números se dibujan en PÍXELES FÍSICOS, no en la escala del arte: son
// tipografía, no pixel art, y a 2x saldrían gigantes y borrosos. Se convierte la
// posición del mundo a pantalla y se pinta con la matriz identidad.

// Cadenas de los números precalculadas. `fillText` recibe una DOMString, así que
// pasarle un número lo convierte, y convertir asigna: con la pantalla llena son
// cientos de cadenas por frame. Aquí se construyen una vez al arrancar.
const TOPE_CACHE = 1000;
const CACHE_NUM = new Array(TOPE_CACHE);
for (let i = 0; i < TOPE_CACHE; i++) CACHE_NUM[i] = String(i);

const SUBIDA = 26;          // px lógicos que asciende el número en su vida
const VIDA_NUMERO = 0.65;
const UMBRAL_GORDO = 25;    // a partir de aquí el número se pinta destacado

// Números nuevos como máximo por paso de lógica. A 60 Hz son 360 por segundo,
// de sobra para que se lea que estás pegando, y pone techo al coste de texto
// pase lo que pase con el área de las armas.
const NUMEROS_POR_PASO = 6;

// Mínimo entre dos hitstops, en segundos.
const ESPERA_HITSTOP = 0.6;

function crearNumero() {
  return { x: 0, y: 0, vida: 0, texto: '0', gordo: false, desvio: 0 };
}

export const VFX = {
  pool: null,

  // --- Sacudida de cámara ------------------------------------------------
  sacudida: 0,              // amplitud actual, en px lógicos
  _fase: 0,
  desvioX: 0,
  desvioY: 0,

  // --- Hitstop -----------------------------------------------------------
  // Congela la LÓGICA unos milisegundos en los golpes fuertes. El render sigue,
  // así que se ve como un frenazo seco y no como un tirón de fps.
  congelado: 0,
  _esperaHitstop: 0,

  iniciar(capacidad) {
    this.pool = new Pool(crearNumero, capacidad);
    this.sacudida = 0;
    this.congelado = 0;
    this._esperaHitstop = 0;
    this._presupuesto = 0;
  },

  get numerosActivos() { return this.pool ? this.pool.activos : 0; },

  // PRESUPUESTO POR PASO. Un arco de melé a nivel 8 alcanza a un centenar de
  // enemigos de una vez, y con cuatro jugadores dando dos tajos cada uno eso
  // serían ochocientos números de daño por segundo. Ni se leen ni se pueden
  // rasterizar: el texto es de lo más caro que hay en un canvas.
  //
  // Se muestran los primeros de cada paso y el resto se pierde. Lo que importa
  // es la sensación de que el golpe hace daño, no auditar cada impacto.
  numero(x, y, cantidad, rng) {
    if (this._presupuesto >= NUMEROS_POR_PASO) return;
    const p = this.pool.obtener();
    if (!p) return;
    this._presupuesto++;
    const v = cantidad | 0;
    p.texto = v < TOPE_CACHE ? CACHE_NUM[v] : CACHE_NUM[TOPE_CACHE - 1];
    p.x = x;
    p.y = y;
    p.vida = VIDA_NUMERO;
    p.gordo = v >= UMBRAL_GORDO;
    // Desvío horizontal para que dos golpes simultáneos no se pisen.
    p.desvio = (rng() - 0.5) * 12;
  },

  sacudir(amplitud) {
    if (amplitud > this.sacudida) this.sacudida = amplitud;
  },

  // Segundo cinturón de seguridad, independiente de quién lo pida: por muy a
  // menudo que llegue la petición, no se congela más de una vez cada
  // ESPERA_HITSTOP. Un hitstop es un signo de puntuación; encadenados dejan de
  // subrayar nada y se convierten en tartamudeo.
  congelar(segundos) {
    if (this._esperaHitstop > 0) return;
    this._esperaHitstop = ESPERA_HITSTOP;
    if (segundos > this.congelado) this.congelado = segundos;
  },

  actualizar(dt) {
    this._presupuesto = 0;             // se renueva cada paso
    // Corre también durante la congelación: es quien la deja expirar. Por eso
    // el bucle llama a VFX.actualizar aunque salte el resto de la lógica.
    if (this._esperaHitstop > 0) this._esperaHitstop -= dt;
    const items = this.pool.items;
    let k = 0;
    while (k < this.pool.activos) {
      const p = items[k];
      p.vida -= dt;
      if (p.vida <= 0) this.pool.liberarEn(k);   // sin avanzar k
      else k++;
    }

    // La sacudida decae exponencialmente y oscila rápido. Determinista: sale de
    // un contador propio, no del reloj ni del azar, para no romper el criterio
    // de reproducibilidad.
    if (this.sacudida > 0.01) {
      this._fase += dt * 47;
      this.desvioX = Math.sin(this._fase) * this.sacudida;
      this.desvioY = Math.cos(this._fase * 1.7) * this.sacudida * 0.7;
      this.sacudida *= Math.exp(-9 * dt);
    } else {
      this.sacudida = 0;
      this.desvioX = 0;
      this.desvioY = 0;
    }
  },

  vaciar() {
    if (this.pool) this.pool.vaciar();
    this.sacudida = 0;
    this.desvioX = 0;
    this.desvioY = 0;
    this.congelado = 0;
  },

  // offX/offY: desplazamiento de cámara YA redondeado a píxel físico, el mismo
  // que usa el mundo. Así el número se ancla al enemigo sin bailar respecto a él.
  dibujarNumeros(ctx, offX, offY) {
    const items = this.pool.items;
    const n = this.pool.activos;
    if (n === 0) return;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    // DOS PASADAS, una por tamaño de letra.
    //
    // Asignar ctx.font es de las operaciones más caras del canvas 2D: obliga a
    // parsear la cadena y a resolver la fuente. Hacerlo por número eran treinta
    // resoluciones de fuente por frame. Agrupando, son dos.
    for (let pasada = 0; pasada < 2; pasada++) {
      const gordo = pasada === 1;
      let usada = false;

      for (let k = 0; k < n; k++) {
        const p = items[k];
        if (p.gordo !== gordo) continue;
        if (!usada) {
          ctx.font = gordo ? 'bold 15px Consolas, monospace'
                           : 'bold 12px Consolas, monospace';
          usada = true;
        }
        const t = p.vida / VIDA_NUMERO;        // 1 recién salido, 0 al apagarse
        const subida = (1 - t) * SUBIDA;
        const px = Math.round((p.x + p.desvio) * ESCALA_ARTE - offX);
        const py = Math.round((p.y - subida) * ESCALA_ARTE - offY);

        ctx.globalAlpha = t > 0.6 ? 1 : t / 0.6;
        ctx.fillStyle = 'rgba(20,12,10,.85)';
        ctx.fillText(p.texto, px + 1, py + 1);  // sombra, para que lea sobre arena
        ctx.fillStyle = gordo ? '#ffd24a' : '#f4efe2';
        ctx.fillText(p.texto, px, py);
      }
    }

    ctx.restore();
  }
};
