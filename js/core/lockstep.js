// EL BÚFER DE PULSACIONES, entre el mando y la simulación.
//
// De momento no hay red. Esto es la mitad local del cooperativo online: separar
// "lo que el jugador está pulsando AHORA" de "lo que la simulación consume en
// ESTE paso", y meter unos fotogramas de retardo entre las dos cosas.
//
// POR QUÉ HACE FALTA EL RETARDO. En lockstep las dos máquinas simulan la
// partida entera y por la red solo viajan las pulsaciones. Para que el paso
// número mil sea idéntico en las dos, las dos tienen que conocer lo que pulsó
// TODO EL MUNDO en el paso mil antes de darlo. Y el paquete del otro jugador
// tarda en llegar. La solución del género desde hace treinta años es no
// ejecutar lo que acabas de pulsar: lo programas para dentro de N pasos, y esos
// N pasos son el tiempo que tiene el paquete para cruzar. Con N = 2 son 33 ms,
// que a 60 Hz es una eternidad para un mensaje pequeño en la misma ciudad.
//
// El precio lo paga el jugador local, y es la única parte de toda esta
// arquitectura que se NOTA con el mando en la mano: pulsas y el personaje sale
// dos fotogramas después. Por eso se prueba en local antes de escribir una sola
// línea de red — si con un jugador no se siente bien, con dos tampoco.
//
// POR QUÉ SE CUANTIZA. El stick da números en coma flotante, y por la red no
// viaja un `0.7071067811865476`: viaja un byte. Si cada máquina redondeara por
// su cuenta al recibirlo, las dos simularían con ejes distintos y volveríamos
// justo al problema que resolvió core/mate.js. Así que el eje se cuantiza AQUÍ,
// antes de entrar en la simulación, y lo que se juega es ya el valor cuantizado
// —tanto en local como en red—. 127 escalones por eje: más de los que el pulgar
// puede distinguir, y cabe en un byte con signo.
//
// Lo que NO hace todavía: conectar, mandar nada ni esperar a nadie. Solo el
// desfase local y el formato del dato.

// Cuántos pasos caben. Potencia de dos para que el módulo sea una máscara, y de
// sobra para cualquier retardo razonable más el margen de la red.
const CAPACIDAD = 128;
const MASCARA = CAPACIDAD - 1;

// Tope de retardo admitido. Ocho fotogramas son 133 ms: pasado eso, el juego se
// siente mal y el problema ya no se arregla con más búfer.
export const RETARDO_MAX = 8;

// Escalones por eje. 127 y no 128 para que el rango sea simétrico: -127..127
// cubre el stick a tope en las dos direcciones con el mismo número de pasos.
const ESCALONES = 127;

function cuantizar(v) {
  if (!(v === v)) return 0;                      // NaN de un mando raro
  let q = Math.round(v * ESCALONES);
  if (q > ESCALONES) q = ESCALONES;
  else if (q < -ESCALONES) q = -ESCALONES;
  return q;
}

export const Lockstep = {
  // Los ejes de todos los jugadores para todos los pasos del anillo, en un solo
  // array. Int8Array y no objetos: es el formato que se va a mandar por la red
  // tal cual, y tenerlo ya en bytes evita convertir dos veces.
  _ejes: null,
  // Los botones, un bit por botón. Todavía no los consume nadie de la
  // simulación —las armas disparan solas y el menú de nivel para el mundo—,
  // pero el hueco está hecho: cuando el cooperativo tenga que sincronizar la
  // elección de carta, la carta viaja por aquí.
  _botones: null,
  _marcos: null,           // objetos preasignados que ve la simulación
  _jugadores: 0,

  // El paso de simulación en curso. NO es el fotograma de pantalla: solo avanza
  // cuando el mundo avanza, así que la pausa y el menú de nivel no lo mueven.
  paso: 0,
  retardo: 2,

  iniciar(maxJugadores) {
    this._jugadores = maxJugadores;
    this._ejes = new Int8Array(CAPACIDAD * maxJugadores * 2);
    this._botones = new Uint32Array(CAPACIDAD * maxJugadores);
    this._marcos = new Array(maxJugadores);
    for (let i = 0; i < maxJugadores; i++) this._marcos[i] = { ejeX: 0, ejeY: 0, botones: 0 };
    this.reiniciar();
  },

  // A cero al empezar cada partida. Como todo lo demás que vive en un módulo y
  // no en la partida: si el anillo llegara con las pulsaciones de la partida
  // anterior, los primeros pasos se jugarían solos. Ver docs/cooperativo-online.md.
  reiniciar() {
    this.paso = 0;
    if (this._ejes) this._ejes.fill(0);
    if (this._botones) this._botones.fill(0);
    for (let i = 0; i < this._jugadores; i++) {
      const m = this._marcos[i];
      m.ejeX = 0; m.ejeY = 0; m.botones = 0;
    }
  },

  ajustarRetardo(delta) {
    let r = this.retardo + delta;
    if (r < 0) r = 0;
    else if (r > RETARDO_MAX) r = RETARDO_MAX;
    this.retardo = r;
    return r;
  },

  // Apunta lo que se está pulsando AHORA en el paso que le toca: dentro de
  // `retardo` pasos. Con retardo 0 se escribe en el paso en curso y el búfer no
  // desfasa nada, que es el comportamiento de antes de existir este módulo —
  // útil para comparar el tacto con y sin retardo.
  registrar(entrada) {
    const destino = (this.paso + this.retardo) & MASCARA;
    for (let i = 0; i < this._jugadores; i++) {
      const c = entrada.controles[i];
      const e = destino * this._jugadores * 2 + i * 2;
      this._ejes[e] = c ? cuantizar(c.ejeX) : 0;
      this._ejes[e + 1] = c ? cuantizar(c.ejeY) : 0;
      this._botones[destino * this._jugadores + i] = c ? (c._flancoBotones >>> 0) : 0;
    }
  },

  // Lo que la simulación consume en el paso en curso. Devuelve un objeto
  // preasignado con la misma forma que un Control —`ejeX`, `ejeY`— para que
  // entidades/jugador.js no tenga que enterarse de que esto existe.
  marcoDe(jugador) {
    const m = this._marcos[jugador];
    if (!m) return null;
    const s = this.paso & MASCARA;
    const e = s * this._jugadores * 2 + jugador * 2;
    // De byte a fracción, con la misma división en las dos máquinas.
    m.ejeX = this._ejes[e] / ESCALONES;
    m.ejeY = this._ejes[e + 1] / ESCALONES;
    m.botones = this._botones[s * this._jugadores + jugador];
    return m;
  },

  avanzar() {
    // El hueco que acaba de quedar atrás se limpia: dentro de una vuelta del
    // anillo volverá a tocar, y si llegara con lo de hace 128 pasos, un fallo
    // de red que dejara un hueco sin rellenar se jugaría con pulsaciones
    // fantasma en vez de con las manos quietas.
    const viejo = this.paso & MASCARA;
    const e = viejo * this._jugadores * 2;
    for (let i = 0; i < this._jugadores * 2; i++) this._ejes[e + i] = 0;
    for (let i = 0; i < this._jugadores; i++) this._botones[viejo * this._jugadores + i] = 0;
    this.paso++;
  }
};
