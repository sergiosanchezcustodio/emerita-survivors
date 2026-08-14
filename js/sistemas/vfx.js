import { ESCALA_ARTE } from '../core/constantes.js';
import { Pool } from '../core/pool.js';
import { FUENTE } from '../ui/capa.js';

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

// MARCAS DE IMPACTO: un trazo corto y luminoso, atravesado en la dirección del
// golpe, que aparece y se va en dos décimas.
//
// Existe porque las chispas son lo primero que se sacrifica cuando hay matanza
// (ver Particulas.saturado) y justo entonces —con la pantalla llena— es cuando
// más falta hace ver que estás dando. Una marca son dos líneas trazadas y no
// pasa por el racionamiento de las partículas, así que el golpe se ve siempre.
//
// Pool propio y pequeño: no hacen falta muchas a la vez porque duran nada, y
// tener el suyo evita competir por el hueco con los números de daño.
const MARCAS = 64;
const VIDA_MARCA = 0.16;

function crearMarca() {
  return { x: 0, y: 0, dx: 1, dy: 0, largo: 6, vida: 0 };
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

  // --- Marcas de impacto ---------------------------------------------------
  marcas: null,

  iniciar(capacidad) {
    this.pool = new Pool(crearNumero, capacidad);
    this.marcas = new Pool(crearMarca, MARCAS);
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

  // ESCARCHA: velo frío sobre toda la pantalla mientras el Reloj de Emerita
  // tiene parada a la horda (entidades/cofre.js).
  //
  // Hace falta un aviso: los enemigos se quedan clavados, y sin nada que lo
  // explique lo primero que piensa cualquiera es que el juego se ha colgado. Un
  // velo azulado que se va apagando dice "esto lo has hecho tú" y además cuenta
  // cuánto queda, porque se desvanece con el efecto.
  escarcha: 0,
  escarchaTotal: 0,

  helar(segundos) {
    this.escarcha = segundos;
    this.escarchaTotal = segundos;
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
    if (this.escarcha > 0) this.escarcha = Math.max(0, this.escarcha - dt);
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

    const marcas = this.marcas.items;
    let j = 0;
    while (j < this.marcas.activos) {
      marcas[j].vida -= dt;
      if (marcas[j].vida <= 0) this.marcas.liberarEn(j);
      else j++;
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

  // Una marca de golpe. `fuerza` es el daño: los golpes gordos dejan un trazo
  // más largo, que es lo que distingue un arañazo de un mandoble sin tener que
  // leer el número.
  impacto(x, y, dirX, dirY, fuerza) {
    if (!this.marcas) return;
    const m = this.marcas.obtener();
    if (!m) return;
    const v = Math.hypot(dirX, dirY) || 1;
    m.x = x; m.y = y;
    m.dx = dirX / v; m.dy = dirY / v;
    m.largo = 5 + Math.min(9, fuerza * 0.22);
    m.vida = VIDA_MARCA;
  },

  // Se dibujan en el lienzo del MUNDO, con las partículas: son parte del golpe,
  // no de la interfaz, y tienen que moverse con la cámara.
  dibujarImpactos(ctx) {
    if (!this.marcas) return;
    const items = this.marcas.items;
    const n = this.marcas.activos;
    if (n === 0) return;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let k = 0; k < n; k++) {
      const m = items[k];
      const t = m.vida / VIDA_MARCA;
      // El trazo va ATRAVESADO al golpe, no en su misma dirección: una raya que
      // sigue al proyectil se confunde con el proyectil, y una perpendicular se
      // lee como el corte que ha abierto.
      const px = -m.dy, py = m.dx;
      const l = m.largo * (0.5 + 0.5 * t);
      ctx.globalAlpha = t * 0.9;
      ctx.strokeStyle = '#ffe9a8';
      ctx.lineWidth = 1 + t * 1.6;
      ctx.beginPath();
      ctx.moveTo(m.x - px * l, m.y - py * l);
      ctx.lineTo(m.x + px * l, m.y + py * l);
      ctx.stroke();
      // Y un chispazo en el punto exacto del choque.
      ctx.globalAlpha = t * 0.55;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 1.5 + t * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff6d8';
      ctx.fill();
    }
    ctx.restore();
  },

  vaciar() {
    if (this.marcas) this.marcas.vaciar();
    if (this.pool) this.pool.vaciar();
    this.escarcha = 0;
    this.escarchaTotal = 0;
    this.sacudida = 0;
    this.desvioX = 0;
    this.desvioY = 0;
    this.congelado = 0;
  },

  // Se dibujan en la CAPA DE INTERFAZ (ui/capa.js), no en el lienzo del juego.
  //
  // Son tipografía, y el lienzo del juego se amplía por enteros con el vecino
  // más próximo: cualquier letra trazada ahí sale escalonada por definición. Con
  // la pantalla llena, los números de daño son el texto MÁS presente que hay, o
  // sea que era justo el peor sitio donde dejarlos.
  //
  // Las coordenadas no cambian ni un ápice: la capa trabaja en las mismas
  // unidades físicas que ya usaban estos números, así que el anclaje al mundo
  // sigue saliendo de offX/offY igual que antes.
  //
  // offX/offY: desplazamiento de cámara YA redondeado a píxel físico, el mismo
  // que usa el mundo. Así el número se ancla al enemigo sin bailar respecto a él.
  // El velo, en la CAPA DE INTERFAZ y no en el lienzo del juego: la interfaz va
  // a la resolución real del monitor y una banda de color a media opacidad sale
  // limpia; en el lienzo del mundo saldría ampliada por el zoom entero.
  //
  // Un solo rectángulo. Se pensó en un degradado radial —viñeta de hielo por los
  // bordes— y no compensa: `createLinearGradient` asigna memoria y esto se pinta
  // durante seis segundos seguidos a sesenta por segundo.
  dibujarEscarcha(ctx, ancho, alto) {
    if (this.escarcha <= 0) return;
    // Entra de golpe y se va despacio: el fogonazo del principio es lo que dice
    // que ha pasado algo, y el resto solo tiene que recordar que sigue pasando.
    const u = this.escarchaTotal > 0 ? this.escarcha / this.escarchaTotal : 0;
    ctx.save();
    ctx.globalAlpha = 0.10 + 0.16 * u * u;
    ctx.fillStyle = '#9fd8ff';
    ctx.fillRect(0, 0, ancho, alto);
    ctx.restore();
  },

  dibujarNumeros(ctx, offX, offY) {
    const items = this.pool.items;
    const n = this.pool.activos;
    if (n === 0) return;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';

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
          ctx.font = gordo ? `700 15px ${FUENTE}` : `600 12px ${FUENTE}`;
          ctx.lineWidth = gordo ? 3.5 : 3;
          usada = true;
        }
        const t = p.vida / VIDA_NUMERO;        // 1 recién salido, 0 al apagarse
        const subida = (1 - t) * SUBIDA;
        const px = Math.round((p.x + p.desvio) * ESCALA_ARTE - offX);
        const py = Math.round((p.y - subida) * ESCALA_ARTE - offY);

        ctx.globalAlpha = t > 0.6 ? 1 : t / 0.6;
        // Contorno en vez de sombra desplazada: la sombra a un píxel funcionaba
        // cuando el número ERA de un píxel de rejilla, pero aquí se traza a la
        // resolución del monitor y quedaba como una letra mal impresa. El
        // contorno cerrado lee igual de bien sobre la arena y no dobla la
        // figura.
        ctx.strokeStyle = 'rgba(18,11,9,.9)';
        ctx.strokeText(p.texto, px, py);
        ctx.fillStyle = gordo ? '#ffd24a' : '#f4efe2';
        ctx.fillText(p.texto, px, py);
      }
    }

    ctx.restore();
  }
};
