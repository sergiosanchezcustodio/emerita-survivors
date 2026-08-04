import { ARMAS } from '../datos/armas.js';
import { PASIVOS } from '../datos/pasivos.js';
import { comportamientoImplementado } from './armas.js';

// Experiencia, subida de nivel y generación de ofertas.
//
// --- Curva de experiencia ----------------------------------------------------
//
// CUADRÁTICA, no tres tramos rectos. La anterior era 12 + 18n y tenía el
// problema al revés de lo que parece: era plana. Cada nivel costaba 18 más que
// el anterior, siempre, así que el arranque era carísimo en términos relativos
// —el nivel 1 pedía 30 puntos cuando una serpiente da 1— y el final se quedaba
// corto, porque a esas alturas mueren tantos enemigos por segundo que 18 más no
// se notan.
//
// La forma correcta para este género es barata al principio y acelerando: las
// tres o cuatro primeras elecciones son las que definen la partida y hay que
// llegar a ellas pronto, y a partir de ahí cada subida tiene que costar
// visiblemente más o el jugador se sale de la curva de dificultad.
//
//   nivel    1     3     5    10    20    30    40
//   antes   30    66   102   192   372   632   892
//   ahora   14    28    48   118   348   698  1168
//
// Se cruza alrededor del nivel 22: hasta ahí se sube casi tres veces más
// rápido, y a partir de ahí cada nivel cuesta más de lo que costaba.
//
// Tres números y no siete, que es lo que la hace ajustable: BASE mueve el
// primer nivel, LINEAL el ritmo del arranque y CUADRATICO cuánto se cierra
// después. Esto se va a tocar varias veces contra el simulacro de oleadas.
const XP_BASE = 8;
const XP_LINEAL = 5;
const XP_CUADRATICO = 0.6;

export function xpNecesaria(nivel) {
  return Math.round(XP_BASE + XP_LINEAL * nivel + XP_CUADRATICO * nivel * nivel);
}

// Cuatro y cuatro, no seis. Con menos ranuras cada elección duele más y las
// partidas se diferencian entre sí: con seis de cada, al final todo el mundo
// acababa llevando media tabla.
export const MAX_ARMAS = 4;
export const MAX_PASIVOS = 4;

// Nivel máximo, común a armas y pasivos. Diez en vez de ocho y cinco: con solo
// cuatro ranuras hay que poder seguir invirtiendo en lo que ya llevas.
export const MAX_NIVEL = 10;
export const OPCIONES = 3;      // el plan decía 4; se bajó a 3 por decisión de diseño
export const REROLLS = 3;

// Ofertas preasignadas: se rellenan, no se construyen. Subir de nivel cincuenta
// veces por partida y por jugador no puede dejar basura por el camino.
function crearOferta() {
  return { clase: '', id: '', nombre: '', descripcion: '', nivelActual: 0, nuevo: false };
}

export const Progresion = {
  cola: [],              // jugadores esperando a elegir
  actual: null,          // el que está eligiendo ahora mismo
  opciones: [],
  nOpciones: 0,
  seleccion: 0,
  _rng: null,
  _candidatas: [],       // buffer de trabajo, reutilizado

  iniciar(rng) {
    this._rng = rng;
    this.opciones = new Array(OPCIONES);
    for (let i = 0; i < OPCIONES; i++) this.opciones[i] = crearOferta();
    this.cola.length = 0;
    this.actual = null;
    this.nOpciones = 0;
  },

  get abierto() { return this.actual !== null; },

  // Un jugador ha subido de nivel. Con cooperativo pueden subir varios a la vez,
  // así que se encolan y se atienden de uno en uno: dos menús a la vez sobre la
  // misma pantalla no hay forma de leerlos.
  encolar(jugador) {
    this.cola.push(jugador);
  },

  // Se llama cada paso: si no hay nadie eligiendo y queda cola, abre el menú.
  atender(jugadores) {
    if (this.actual || this.cola.length === 0) return false;
    this.actual = this.cola.shift();
    this.seleccion = 0;
    this._generar(this.actual, jugadores);
    return true;
  },

  rerollar(jugadores) {
    if (!this.actual || this.actual.rerolls <= 0) return false;
    this.actual.rerolls--;
    this.seleccion = 0;
    this._generar(this.actual, jugadores);
    return true;
  },

  elegir(indice) {
    if (!this.actual || indice < 0 || indice >= this.nOpciones) return;
    const o = this.opciones[indice];
    const j = this.actual;

    if (o.clase === 'arma') {
      if (o.nuevo) j.arsenal.equipar(o.id);
      else j.arsenal.subirNivel(o.id);
    } else if (o.clase === 'pasivo') {
      const def = PASIVOS[o.id];
      j.pasivos[o.id] = (j.pasivos[o.id] || 0) + 1;
      j.recalcularStats();
      // El ánfora cura lo que sube: si solo ampliara el máximo, elegirla con la
      // vida baja no serviría de nada justo cuando más falta hace.
      if (def.curaAlSubir) j.vida = Math.min(j.vidaMaxima, j.vida + def.curaAlSubir);
    } else if (o.clase === 'curacion') {
      j.vida = Math.min(j.vidaMaxima, j.vida + 30);
    }

    this.actual = null;
  },

  // --- Generación de ofertas ---------------------------------------------
  //
  // Reglas, por orden:
  //   - Con las ranuras de arma llenas, solo se ofrecen mejoras de lo que ya
  //     se lleva. Igual con los pasivos.
  //   - Un arma que lleve OTRO jugador no se ofrece. En cooperativo cada uno
  //     tiene un arsenal distinto, y eso es lo que les da papel propio.
  //   - Si no queda nada, curación.
  _generar(jugador, jugadores) {
    const cand = this._candidatas;
    cand.length = 0;

    // Armas que ya lleva alguien, sea quien sea.
    const ocupadas = new Set();
    for (let i = 0; i < jugadores.length; i++) {
      const eq = jugadores[i].arsenal.equipadas;
      for (let k = 0; k < eq.length; k++) ocupadas.add(eq[k].id);
    }

    // Mejoras de las armas propias
    const propias = jugador.arsenal.equipadas;
    for (let k = 0; k < propias.length; k++) {
      const a = propias[k];
      if (a.nivel < MAX_NIVEL) {
        cand.push({ clase: 'arma', id: a.id, nuevo: false, nivelActual: a.nivel,
                    nombre: a.def.nombre, descripcion: a.def.descripcion });
      }
    }

    // Armas nuevas, si queda ranura y nadie más las lleva
    if (propias.length < MAX_ARMAS) {
      for (const id in ARMAS) {
        if (ocupadas.has(id)) continue;
        if (!comportamientoImplementado(ARMAS[id].comportamiento)) continue;
        cand.push({ clase: 'arma', id, nuevo: true, nivelActual: 0,
                    nombre: ARMAS[id].nombre, descripcion: ARMAS[id].descripcion });
      }
    }

    // Pasivos: mejoras de los que lleva, y nuevos si queda ranura
    const nPasivos = Object.keys(jugador.pasivos).length;
    for (const id in PASIVOS) {
      const def = PASIVOS[id];
      const nivel = jugador.pasivos[id] || 0;
      if (nivel === 0 && nPasivos >= MAX_PASIVOS) continue;
      if (nivel >= def.maxNivel) continue;
      cand.push({ clase: 'pasivo', id, nuevo: nivel === 0, nivelActual: nivel,
                  nombre: def.nombre, descripcion: def.descripcion });
    }

    // Barajado parcial de Fisher-Yates: solo se necesitan las tres primeras, así
    // que no hace falta ordenar el array entero.
    const n = Math.min(OPCIONES, cand.length);
    for (let i = 0; i < n; i++) {
      const j = i + ((this._rng() * (cand.length - i)) | 0);
      const t = cand[i]; cand[i] = cand[j]; cand[j] = t;
      const o = this.opciones[i];
      o.clase = cand[i].clase;
      o.id = cand[i].id;
      o.nombre = cand[i].nombre;
      o.descripcion = cand[i].descripcion;
      o.nivelActual = cand[i].nivelActual;
      o.nuevo = cand[i].nuevo;
    }
    this.nOpciones = n;

    // Nada que ofrecer: todo al máximo. Se paga en vida, que nunca sobra.
    if (n === 0) {
      const o = this.opciones[0];
      o.clase = 'curacion'; o.id = ''; o.nombre = 'Vino de Emerita';
      o.descripcion = 'Recupera 30 de vida'; o.nivelActual = 0; o.nuevo = true;
      this.nOpciones = 1;
    }
  }
};
