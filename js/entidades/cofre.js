import { Pool } from '../core/pool.js';

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
// Se dibujan por código, como las gemas: es una caja de 14x11 con herrajes. Un
// sprite a este tamaño no aportaría nada y sí un blit y una entrada de atlas.

// Radio de recogida. Fijo a propósito, sin depender del radioRecogida del
// jugador: la Piedra imán amplía el alcance de las GEMAS, y dejar que también
// aspirara cofres a media pantalla convertiría un pasivo de comodidad en la
// mejor forma de conseguir evoluciones.
const RADIO_RECOGIDA = 13;

// Caída: sale despedido del cadáver y frena. Un premio que aparece clavado en el
// sitio se confunde con el enemigo que lo soltó; uno que salta se lee solo.
const IMPULSO = 46;
const ROZAMIENTO = 4.2;

const ANCHO = 14;
const ALTO = 11;

const COLOR_MADERA = '#6d4526';
const COLOR_MADERA_ALTA = '#8a5a31';
const COLOR_BRONCE = '#d8a640';
const COLOR_BRONCE_ALTO = '#ffe2a0';
const COLOR_SOMBRA = 'rgba(0,0,0,.30)';
// Color del halo por tipo: bronce el cofre, fuego la llamarada, azul el imán.
// El halo es lo único que se ve desde lejos con la pantalla llena, así que es
// donde tiene que estar la diferencia.
const COLOR_HALO = ['#d8a640', '#ff7a2a', '#5aa9e6', '#7fd68a'];

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

function crearCofre() {
  return {
    x: 0, y: 0, xPrev: 0, yPrev: 0,
    vx: 0, vy: 0,
    tipo: COFRE,
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
        this.pool.liberarEn(k);            // sin avanzar k
        if (this.alRecoger) this.alRecoger(recogido, tipo);
        return recogido;
      }
      k++;
    }
    return null;
  }

  vaciar() { this.pool.vaciar(); }

  // Caja con tapa, fleje de bronce y cerradura, más un halo que late. El halo no
  // es adorno: con la pantalla llena de cuerpos, un objeto de catorce píxeles en
  // el suelo no se encuentra, y este hay que encontrarlo.
  dibujar(ctx, alpha) {
    const items = this.pool.items;
    const n = this.pool.activos;
    if (n === 0) return;

    const mitad = ANCHO / 2;
    ctx.save();
    for (let k = 0; k < n; k++) {
      const c = items[k];
      const x = c.xPrev + (c.x - c.xPrev) * alpha;
      const y = c.yPrev + (c.y - c.yPrev) * alpha;
      const late = Math.sin(c.fase);

      // Halo. Alfa bajo y radio que respira; a plena opacidad taparía a los
      // enemigos que pasan por encima justo donde hay que mirar.
      ctx.globalAlpha = 0.20 + 0.10 * late;
      ctx.fillStyle = COLOR_HALO[c.tipo] || COLOR_BRONCE;
      ctx.beginPath();
      ctx.arc(x, y - 3, 13 + late * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Sombra de contacto: sin ella el cofre flota sobre la arena.
      ctx.fillStyle = COLOR_SOMBRA;
      ctx.beginPath();
      ctx.ellipse(x, y + 1, mitad * 0.9, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();

      if (c.tipo !== COFRE) { this._dibujarConsumible(ctx, c, x, y, late); continue; }

      const cy = y - ALTO;
      ctx.fillStyle = COLOR_MADERA;
      ctx.fillRect(x - mitad, cy + 4, ANCHO, ALTO - 4);
      // Tapa abombada, un escalón más clara: da el volumen sin degradados.
      ctx.fillStyle = COLOR_MADERA_ALTA;
      ctx.fillRect(x - mitad, cy, ANCHO, 4);

      // Herrajes: fleje horizontal bajo la tapa y vertical con cerradura.
      ctx.fillStyle = COLOR_BRONCE;
      ctx.fillRect(x - mitad, cy + 3, ANCHO, 1.5);
      ctx.fillRect(x - 1.5, cy, 3, ALTO);
      ctx.fillStyle = COLOR_BRONCE_ALTO;
      ctx.fillRect(x - 1, cy + 4, 2, 2);

      // Filo de luz superior, del mismo material que el halo: ata las dos cosas.
      ctx.fillStyle = COLOR_BRONCE_ALTO;
      ctx.globalAlpha = 0.5 + 0.3 * late;
      ctx.fillRect(x - mitad, cy, ANCHO, 1);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // Consumibles. Se dibujan por código como el cofre y las gemas: son formas de
  // doce píxeles y un sprite no aportaría nada.
  //
  // Cada uno tiene su SILUETA, no solo su color: con la pantalla llena de
  // enemigos, distinguir dos discos por el tono es pedir demasiado. La llama es
  // puntiaguda y sube; el imán es una herradura y es ancho.
  _dibujarConsumible(ctx, c, x, y, late) {
    const cy = y - 9;
    if (c.tipo === LLAMARADA) {
      ctx.fillStyle = '#ff5a1a';
      ctx.beginPath();
      ctx.moveTo(x, cy - 7 - late);
      ctx.quadraticCurveTo(x + 6, cy, x, cy + 6);
      ctx.quadraticCurveTo(x - 6, cy, x, cy - 7 - late);
      ctx.fill();
      ctx.fillStyle = '#ffd45a';
      ctx.beginPath();
      ctx.moveTo(x, cy - 3);
      ctx.quadraticCurveTo(x + 3, cy + 1, x, cy + 5);
      ctx.quadraticCurveTo(x - 3, cy + 1, x, cy - 3);
      ctx.fill();
      return;
    }
    if (c.tipo === COMIDA) {
      // Pan y algo dentro: una hogaza partida. Verde el halo, como todo lo que
      // cura en este juego.
      ctx.fillStyle = '#c9903f';
      ctx.beginPath();
      ctx.ellipse(x, cy + 1, 7, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e8c58a';
      ctx.beginPath();
      ctx.ellipse(x, cy - 1, 6.5, 4, 0, Math.PI, 0);
      ctx.fill();
      ctx.strokeStyle = '#8a5a2a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - 3.5, cy - 2.5); ctx.lineTo(x - 1.5, cy - 0.5);
      ctx.moveTo(x + 0.5, cy - 3); ctx.lineTo(x + 2.5, cy - 1);
      ctx.stroke();
      return;
    }
    // Imán: herradura con las dos puntas marcadas.
    ctx.strokeStyle = '#5aa9e6';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.arc(x, cy, 5.5, Math.PI, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 5.5, cy); ctx.lineTo(x - 5.5, cy + 4);
    ctx.moveTo(x + 5.5, cy); ctx.lineTo(x + 5.5, cy + 4);
    ctx.stroke();
    ctx.strokeStyle = '#e8e8e8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 5.5, cy + 3.5); ctx.lineTo(x - 5.5, cy + 5.5);
    ctx.moveTo(x + 5.5, cy + 3.5); ctx.lineTo(x + 5.5, cy + 5.5);
    ctx.stroke();
  }
}
