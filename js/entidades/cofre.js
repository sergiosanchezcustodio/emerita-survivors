import { Pool } from '../core/pool.js';
import { ESCALA_ARTE } from '../core/constantes.js';
import { Recursos } from '../core/recursos.js';

// Cofres. Los sueltan los élites al morir (mantícora y serpiente dorada) y son
// la ÚNICA vía a las evoluciones, según la sección 9 del plan.
//
// No son gemas y por eso no están en recogible.js:
//
//   - No los atrae el imán. Una evolución no puede caerte encima por pasar
//     cerca: hay que ir a por ella, y ese viaje en mitad de una oleada es el
//     precio real del premio.
//   - Se recogen por CONTACTO, con un radio fijo y generoso.
//   - No caducan ni se reciclan por lejanía. Un cofre que desaparece porque te
//     empujaron al otro lado sería un premio que el juego te quita.
//
// Cada uno tiene SU DIBUJO, de los que ha hecho Sergio (resources/objetos/).
// Antes se trazaban por código —una caja con herrajes, una llama de curvas, una
// herradura— porque no había arte; ahora lo hay y se lee mucho antes con la
// pantalla llena de bichos, que es justo donde hay que encontrarlos.
//
// El halo se queda: es lo único que se ve desde el otro extremo de la pantalla,
// y ningún sprite de catorce píxeles compite con eso.

// Radio de recogida. Fijo a propósito, sin depender del radioRecogida del
// jugador: la Piedra imán amplía el alcance de las GEMAS, y dejar que también
// aspirara cofres a media pantalla convertiría un pasivo de comodidad en la
// mejor forma de conseguir evoluciones.
const RADIO_RECOGIDA = 13;

// Caída: sale despedido del cadáver y frena. Un premio que aparece clavado en el
// sitio se confunde con el enemigo que lo soltó; uno que salta se lee solo.
const IMPULSO = 46;
const ROZAMIENTO = 4.2;

// Solo para la sombra de contacto: el tamaño de lo que se dibuja lo pone ahora
// cada sprite (ver el catálogo de herramientas/procesar-assets.ps1).
const ANCHO = 14;

const COLOR_BRONCE = '#d8a640';
const COLOR_SOMBRA = 'rgba(0,0,0,.30)';
// Color del halo por tipo, en el orden de las constantes de abajo. Es lo único
// que se ve desde lejos con la pantalla llena, así que es donde tiene que estar
// la diferencia: bronce el cofre, fuego la llamarada, azul el imán, verde la
// comida, blanco helado el reloj y oro las monedas.
const COLOR_HALO = ['#d8a640', '#ff7a2a', '#5aa9e6', '#7fd68a', '#bfe8ff', '#ffd45a'];

// Sprite de cada tipo. El cofre tiene DOS —sencillo y especial— y por eso no
// entra en esta tabla; se elige en el dibujado.
const SPRITE = ['', 'objFuego', 'objIman', 'objComida', 'objReloj', 'objMonedas'];

// TIPOS DE OBJETO DEL SUELO. El cofre es uno más desde que existen los
// consumibles, y comparten pool porque comparten todo lo demás: caen del mismo
// modo, se recogen por contacto, no los atrae el imán y no caducan.
//
// Los consumibles son ayudas de efecto INSTANTÁNEO: no se eligen, no ocupan
// ranura y no hay nada que decidir salvo si merece la pena ir a por ellos ahora
// o más tarde. Esa es toda su gracia — un objetivo en el mapa que compite con
// mantenerse a salvo.
export const COFRE = 0;
export const LLAMARADA = 1;
export const IMAN = 2;
export const COMIDA = 3;
// Los dos que pidió Sergio con sus dibujos. El RELOJ para el tiempo de la horda
// entera durante unos segundos y las MONEDAS dan denarios, que es el único
// consumible que deja algo DESPUÉS de la partida (ver core/metaProgreso.js).
export const RELOJ = 4;
export const MONEDAS = 5;

// De qué es cada consumible que cae. UNA SOLA TABLA para los dos sitios que
// reparten —la antorcha que se rompe (entidades/enemigo.js) y el goteo del
// director (sistemas/director.js)—: con una copia en cada uno, tocar el reparto
// en un sitio lo dejaba desajustado en el otro, que es como estaba.
//
// El orden no es casual, va de lo corriente a lo gordo. El reloj es el más raro
// porque parar la horda seis segundos resuelve el peor momento de una partida, y
// las monedas van por delante de él porque no cambian la partida en curso: lo
// suyo se cobra al terminar.
export function tipoConsumible(dado) {
  if (dado < 0.30) return COMIDA;
  if (dado < 0.55) return LLAMARADA;
  if (dado < 0.74) return IMAN;
  if (dado < 0.91) return MONEDAS;
  return RELOJ;
}

// Uno de cada diez cofres es ESPECIAL y sube tres niveles en vez de uno. Se
// decide AQUÍ, al caer, y no al abrirlo: ahora los dos cofres se ven distintos
// desde el suelo, así que hay que saberlo antes de que nadie lo recoja. Es media
// gracia del cambio — cuál te ha tocado ya no es una sorpresa al abrirlo, es una
// razón para cruzar la pantalla a por él.
const PROB_ESPECIAL = 0.1;

function crearCofre() {
  return {
    x: 0, y: 0, xPrev: 0, yPrev: 0,
    vx: 0, vy: 0,
    tipo: COFRE,
    especial: false,      // solo los cofres: el de tres niveles
    fase: 0,              // latido del halo
    vida: 0               // segundos desde que cayó, para el rebote de entrada
  };
}

export class Cofres {
  constructor(capacidad, rng) {
    this.pool = new Pool(crearCofre, capacidad);
    this._rng = rng;
    // Lo enchufa main.js: a quién avisar cuando alguien recoge uno. Se pasa por
    // fuera para que esta entidad no dependa de la progresión, igual que los
    // enemigos no dependen de los recogibles.
    this.alRecoger = null;
  }

  get activos() { return this.pool.activos; }

  soltar(x, y, tipo = COFRE) {
    let c = this.pool.obtener();
    // Pool lleno: hay que hacer sitio. Se sacrifica un CONSUMIBLE antes que un
    // cofre, y solo si no queda ningún consumible se toca el cofre más antiguo.
    //
    // La diferencia importa: un consumible es una ayuda de las que caen cada
    // treinta segundos, y un cofre puede llevar dentro la evolución que te has
    // ganado matando a un élite. Sin esta preferencia, un imán que cae en el
    // minuto 12 podía borrar el cofre que aún no habías ido a recoger.
    if (!c) {
      const items = this.pool.items;
      let victima = 0;
      for (let i = 0; i < this.pool.activos; i++) {
        if (items[i].tipo !== COFRE) { victima = i; break; }
      }
      this.pool.liberarEn(victima);
      c = this.pool.obtener();
      if (!c) return null;
    }
    const ang = this._rng() * Math.PI * 2;
    c.x = c.xPrev = x;
    c.y = c.yPrev = y;
    c.vx = Math.cos(ang) * IMPULSO;
    c.vy = Math.sin(ang) * IMPULSO * 0.6;   // menos vertical: la vista es cenital
    c.fase = 0;
    c.vida = 0;
    c.tipo = tipo;
    c.especial = tipo === COFRE && this._rng() < PROB_ESPECIAL;
    return c;
  }

  // Devuelve el jugador que ha recogido uno en este paso, o null. Solo se
  // atiende UNO por paso: cada cofre abre su propia pantalla y encolar dos a la
  // vez daría dos menús pisándose.
  actualizar(dt, jugadores) {
    const items = this.pool.items;
    let k = 0;
    while (k < this.pool.activos) {
      const c = items[k];
      c.xPrev = c.x;
      c.yPrev = c.y;
      c.fase += dt * 2.6;
      c.vida += dt;

      if (c.vx !== 0 || c.vy !== 0) {
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        const frenado = Math.exp(-ROZAMIENTO * dt);
        c.vx *= frenado;
        c.vy *= frenado;
        if (Math.abs(c.vx) < 1 && Math.abs(c.vy) < 1) { c.vx = 0; c.vy = 0; }
      }

      let recogido = null;
      for (let i = 0; i < jugadores.length; i++) {
        const j = jugadores[i];
        if (j.abatido) continue;
        const dx = j.x - c.x;
        const dy = j.y - c.y;
        if (dx * dx + dy * dy < RADIO_RECOGIDA * RADIO_RECOGIDA) { recogido = j; break; }
      }

      if (recogido) {
        const tipo = c.tipo;
        const especial = c.especial;
        this.pool.liberarEn(k);            // sin avanzar k
        if (this.alRecoger) this.alRecoger(recogido, tipo, especial);
        return recogido;
      }
      k++;
    }
    return null;
  }

  vaciar() { this.pool.vaciar(); }

  // Halo que late, sombra de contacto y el sprite encima. El halo no es adorno:
  // con la pantalla llena de cuerpos, un objeto de catorce píxeles en el suelo
  // no se encuentra, y estos hay que encontrarlos.
  dibujar(ctx, alpha) {
    const items = this.pool.items;
    const n = this.pool.activos;
    if (n === 0) return;

    ctx.save();
    for (let k = 0; k < n; k++) {
      const c = items[k];
      const x = c.xPrev + (c.x - c.xPrev) * alpha;
      const y = c.yPrev + (c.y - c.yPrev) * alpha;
      const late = Math.sin(c.fase);

      // Alfa bajo y radio que respira; a plena opacidad taparía a los enemigos
      // que pasan por encima justo donde hay que mirar.
      ctx.globalAlpha = 0.20 + 0.10 * late;
      ctx.fillStyle = COLOR_HALO[c.tipo] || COLOR_BRONCE;
      ctx.beginPath();
      ctx.arc(x, y - 3, 13 + late * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Sombra de contacto: sin ella el objeto flota sobre la arena.
      ctx.fillStyle = COLOR_SOMBRA;
      ctx.beginPath();
      ctx.ellipse(x, y + 1, ANCHO * 0.45, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();

      const id = c.tipo === COFRE
                 ? (c.especial ? 'cofreEspecial' : 'cofreSimple')
                 : SPRITE[c.tipo];
      const meta = Recursos.meta(id);
      const img = Recursos.imagen(id);
      if (meta && img) {
        // Mismo cuadre a píxel físico entero que usan los enemigos y los
        // obstáculos: sin esto el sprite tiembla al desplazarse la cámara
        // aunque el objeto esté quieto en el suelo.
        const cxF = Math.round(x * ESCALA_ARTE);
        const cyF = Math.round(y * ESCALA_ARTE);
        ctx.drawImage(img,
          (cxF - (meta.w >> 1)) / ESCALA_ARTE, (cyF - meta.h) / ESCALA_ARTE,
          meta.w / ESCALA_ARTE, meta.h / ESCALA_ARTE);
      } else {
        // Sin dibujo cargado: un disco del color de su halo. Feo, pero se ve y
        // se puede recoger, que es lo que no puede fallar.
        ctx.fillStyle = COLOR_HALO[c.tipo] || COLOR_BRONCE;
        ctx.beginPath();
        ctx.arc(x, y - 6, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}
