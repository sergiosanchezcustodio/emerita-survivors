import { ARMAS } from '../datos/armas.js';
import { PASIVOS } from '../datos/pasivos.js';
import { comportamientoImplementado } from './armas.js';

// Experiencia, subida de nivel y generación de ofertas.
//
// Curva de experiencia.
//
// La del plan (5 + n*10) se probó y sube demasiado deprisa: los primeros niveles
// caían de tres en tres y la elección dejaba de tener peso. Esta es la misma
// forma —tres tramos de pendiente creciente— pero un 80% más exigente y con
// arranque más caro, para que el primer minuto no sea una lluvia de menús.
//
// Es la palanca de ritmo más directa que hay. La calibración definitiva llega
// con el director de oleadas en la Fase 5: hasta que no haya una curva real de
// enemigos por minuto, cualquier número aquí es una conjetura educada.
const XP_BASE = 12;
const XP_TRAMO_1 = 18;      // por nivel hasta el 20
const XP_TRAMO_2 = 26;      // del 20 al 40
const XP_TRAMO_3 = 36;      // del 40 en adelante

export function xpNecesaria(nivel) {
  if (nivel < 20) return XP_BASE + nivel * XP_TRAMO_1;
  if (nivel < 40) return XP_BASE + 20 * XP_TRAMO_1 + (nivel - 20) * XP_TRAMO_2;
  return XP_BASE + 20 * XP_TRAMO_1 + 20 * XP_TRAMO_2 + (nivel - 40) * XP_TRAMO_3;
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
