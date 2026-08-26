// EL BÚFER DE PULSACIONES, entre el mando y la simulación.
//
// En lockstep las dos máquinas simulan la partida entera y por la red solo
// viajan las pulsaciones. Para que el paso número mil sea idéntico en las dos,
// las dos tienen que conocer lo que pulsó TODO EL MUNDO en el paso mil antes de
// darlo. Y el paquete del otro jugador tarda en llegar. La solución del género
// desde hace treinta años es no ejecutar lo que acabas de pulsar: se programa
// para dentro de N pasos, y esos N pasos son el tiempo que tiene el paquete
// para cruzar.
//
// El precio lo paga el jugador local, y es la única parte de toda esta
// arquitectura que se NOTA con el mando en la mano: pulsas y el personaje sale
// N fotogramas después. Medido con Sergio, con 0, 2 y 6: no se distingue. El
// género perdona —no hay saltos que cronometrar ni disparos que apuntar— así
// que cada fotograma que no molesta es margen de red regalado.
//
// TRES ESTADOS Y NO DOS, y esta es la diferencia que trae la red.
//
// Jugando solo, una casilla vacía del anillo significaba "no se pulsó nada", y
// con eso bastaba. Con dos máquinas hay un tercer caso: "todavía no sé qué se
// pulsó, porque su paquete no ha llegado". Confundirlo con el primero es
// exactamente cómo se desincronizan dos partidas — una jugaría el paso con el
// mando en reposo mientras la otra lo juega con el stick a tope, y a partir de
// ahí son dos mundos distintos que creen ser el mismo.
//
// Por eso cada casilla lleva su marca de CONOCIDA. Sin ella, el paso no se da:
// el mundo se para y espera. Eso es lo que la gente llama "lag" en un juego así,
// y no es lentitud — es la partida detenida a la espera de saber qué hizo el
// otro.
//
// POR QUÉ SE CUANTIZA EL STICK. Por la red no viaja un `0.7071067811865476`:
// viaja un byte. Si cada máquina redondeara por su cuenta al recibirlo, las dos
// simularían con ejes distintos y volveríamos justo al problema que resolvió
// core/mate.js. Así que el eje se cuantiza AQUÍ, antes de entrar en la
// simulación, y lo que se juega es ya el valor cuantizado — en local igual que
// en red, o el jugador de casa y el de enfrente no estarían jugando lo mismo.

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

// CUÁNTAS PULSACIONES VIEJAS VIAJAN EN CADA PAQUETE.
//
// Es lo que sustituye a reintentar. El canal de juego no es fiable a propósito:
// pedir de nuevo el paquete de hace 200 ms no sirve de nada, porque cuando
// llegara, ese paso ya habría que haberlo jugado. En su lugar, cada paquete
// repite las últimas seis pulsaciones, así que hacen falta SEIS pérdidas
// seguidas para que falte una de verdad.
//
// Sale casi gratis: seis pulsaciones son 36 bytes, y el paquete entero se queda
// en 42. A sesenta por segundo, 2,5 KB/s.
const REDUNDANCIA = 6;

// Formato del paquete: cabecera y luego los marcos, 6 bytes cada uno.
//
// La cabecera lleva ADEMÁS POR DÓNDE VA QUIEN MANDA, y eso no es adorno: es lo
// que permite salir de un atasco. Ver `empaquetar`.
const TIPO_PULSACIONES = 1;
const CABECERA = 10;
const POR_MARCO = 6;

// Tope de marcos en un paquete de recuperación. 40 son 250 bytes, y solo se
// mandan cuando el otro se ha quedado atrás; en marcha normal van 6.
const MARCOS_MAX = 40;

function cuantizar(v) {
  if (!(v === v)) return 0;                      // NaN de un mando raro
  let q = Math.round(v * ESCALONES);
  if (q > ESCALONES) q = ESCALONES;
  else if (q < -ESCALONES) q = -ESCALONES;
  return q;
}

// Se fabrica en vez de escribirse como objeto suelto para poder tener DOS en la
// misma memoria. El juego usa uno —el de abajo—, pero la prueba de Node monta
// las dos puntas de una partida en red y las hace hablar entre ellas, y eso con
// un único objeto compartido no se puede comprobar.
export function crearBufer() {
 return {
  // Los ejes de todos los jugadores para todos los pasos del anillo, en un solo
  // array. Int8Array y no objetos: es el formato que viaja por la red tal cual,
  // así no hay que convertir dos veces.
  _ejes: null,
  _botones: null,
  // ¿Sabemos lo que se pulsó en esta casilla? Ver la explicación de arriba: es
  // la marca que separa "no pulsó nada" de "no ha llegado".
  _conocido: null,
  // De quién es cada puesto: 1 = lo maneja esta máquina, 0 = viene por la red.
  _esLocal: null,
  // El paso más alto que esta máquina tiene registrado para cada puesto suyo.
  // Es lo que decide hasta dónde llega el paquete; ver `empaquetar`.
  _ultimo: null,
  // QUÉ MANDO LEE CADA PUESTO PROPIO.
  //
  // No es la identidad, y ahí estaba el fallo: en red, quien se une lleva el
  // PUESTO 1, pero juega con su teclado y su primer mando, que son el CONTROL 0
  // de su máquina. Leyendo el control 1 se le buscaba un segundo mando que no
  // existe, y no se movía.
  //
  // En el sofá sí es la identidad: cuatro jugadores, cuatro mandos, cada uno el
  // suyo.
  _mando: null,
  _marcos: null,           // objetos preasignados que ve la simulación
  _jugadores: 0,           // capacidad, no los que juegan

  // Cuántos puestos tienen que estar contestados para poder dar un paso.
  esperados: 1,
  paso: 0,
  // CUATRO, Y NO DOS, PORQUE MEDIDO NO SE NOTA. Ver el comentario de arriba.
  retardo: 4,

  // Cuántos pasos se han perdido esperando a que llegara algo, y cuánto duró la
  // espera más larga. Es la medida honesta de cómo va la partida: si esto sube,
  // el retardo se ha quedado corto para esta conexión.
  esperas: 0,
  esperaMax: 0,
  _esperando: 0,

  iniciar(maxJugadores) {
    this._jugadores = maxJugadores;
    this._ejes = new Int8Array(CAPACIDAD * maxJugadores * 2);
    this._botones = new Uint32Array(CAPACIDAD * maxJugadores);
    this._conocido = new Uint8Array(CAPACIDAD * maxJugadores);
    this._esLocal = new Uint8Array(maxJugadores);
    this._ultimo = new Int32Array(maxJugadores);
    this._mando = new Int32Array(maxJugadores);
    this._marcos = new Array(maxJugadores);
    for (let i = 0; i < maxJugadores; i++) this._marcos[i] = { ejeX: 0, ejeY: 0, botones: 0 };
    // El paquete se crea UNA vez y se reutiliza en cada envío: sesenta veces por
    // segundo, un array nuevo por envío sería basura constante para el recolector.
    this._paquete = new Uint8Array(CABECERA + MARCOS_MAX * POR_MARCO);
    // Por dónde va cada puesto remoto, según lo que él mismo cuenta. Sirve para
    // saber desde dónde hay que repetirle las pulsaciones.
    this._pasoDe = new Int32Array(maxJugadores);
    this._vista = new DataView(this._paquete.buffer);
    this.reiniciar();
  },

  // A cero al empezar cada partida.
  //
  // `esperados` es cuántos puestos hay que conocer para dar un paso, y
  // `localesDe` dice cuáles maneja esta máquina. Jugando solo o en cooperativo
  // de sofá son todos locales y esto nunca espera a nadie.
  reiniciar(esperados = 1, localesDe = null) {
    this.paso = 0;
    this.esperados = Math.max(1, esperados);
    this.esperas = 0;
    this.esperaMax = 0;
    this._esperando = 0;
    if (this._ejes) this._ejes.fill(0);
    if (this._botones) this._botones.fill(0);
    if (this._conocido) this._conocido.fill(0);
    if (this._esLocal) {
      for (let i = 0; i < this._jugadores; i++) {
        const k = localesDe ? localesDe.indexOf(i) : i;
        this._esLocal[i] = localesDe ? (k >= 0 ? 1 : 0) : 1;
        // El primer puesto propio lee el mando 0, el segundo el 1, etc.
        this._mando[i] = k >= 0 ? k : 0;
      }
    }
    for (let i = 0; i < this._jugadores; i++) {
      const m = this._marcos[i];
      m.ejeX = 0; m.ejeY = 0; m.botones = 0;
    }
    // LOS PRIMEROS PASOS SE DAN POR SABIDOS, y valen cero.
    //
    // Con retardo 4, lo que se pulse en el paso 0 se juega en el 4, así que del
    // 0 al 3 no hay pulsación de nadie por definición. Sin marcarlos como
    // conocidos, la partida se quedaría esperando en el primer fotograma un
    // paquete que nadie va a mandar nunca. Y las dos máquinas coinciden en esto
    // sin hablarlo, que es lo que lo hace seguro.
    for (let p = 0; p < this.retardo && p < CAPACIDAD; p++) {
      for (let i = 0; i < this._jugadores; i++) this._conocido[p * this._jugadores + i] = 1;
    }
    // Y esos ceros de salida ya son contables: entran en el paquete como
    // cualquier otra pulsación.
    if (this._ultimo) this._ultimo.fill(this.retardo - 1);
    if (this._pasoDe) this._pasoDe.fill(0);
  },

  ajustarRetardo(delta) {
    let r = this.retardo + delta;
    if (r < 0) r = 0;
    else if (r > RETARDO_MAX) r = RETARDO_MAX;
    this.retardo = r;
    return r;
  },

  // Apunta lo que se está pulsando AHORA en el paso que le toca: dentro de
  // `retardo` pasos. Solo para los puestos de esta máquina.
  registrar(entrada) {
    const destino = (this.paso + this.retardo) & MASCARA;
    for (let i = 0; i < this._jugadores; i++) {
      if (!this._esLocal[i]) continue;
      const c = entrada.controles[this._mando[i]];
      const e = destino * this._jugadores * 2 + i * 2;
      this._ejes[e] = c ? cuantizar(c.ejeX) : 0;
      this._ejes[e + 1] = c ? cuantizar(c.ejeY) : 0;
      this._botones[destino * this._jugadores + i] = c ? (c._flancoBotones >>> 0) : 0;
      this._conocido[destino * this._jugadores + i] = 1;
      this._ultimo[i] = this.paso + this.retardo;
    }
  },

  // ¿Se puede dar el paso en curso? Solo si todos los puestos que juegan tienen
  // su casilla contestada.
  listo() {
    const s = (this.paso & MASCARA) * this._jugadores;
    for (let i = 0; i < this.esperados; i++) {
      if (!this._conocido[s + i]) return false;
    }
    return true;
  },

  // Quién falta, para poder decirlo en pantalla en vez de quedarse callado.
  faltan() {
    const s = (this.paso & MASCARA) * this._jugadores;
    const lista = [];
    for (let i = 0; i < this.esperados; i++) if (!this._conocido[s + i]) lista.push(i);
    return lista;
  },

  // Se llama cuando el mundo NO ha podido avanzar. Lleva la cuenta para que la
  // espera sea un número y no una sensación.
  anotarEspera() {
    this.esperas++;
    this._esperando++;
    if (this._esperando > this.esperaMax) this.esperaMax = this._esperando;
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
    this._esperando = 0;
    // El hueco que acaba de quedar atrás se limpia, DATO Y MARCA. Dentro de una
    // vuelta del anillo volverá a tocar, y si llegara con la marca puesta de
    // hace 128 pasos, un paquete que no llegara se jugaría con pulsaciones
    // fantasma en vez de esperar.
    const viejo = this.paso & MASCARA;
    for (let i = 0; i < this._jugadores; i++) {
      this._conocido[viejo * this._jugadores + i] = 0;
      // EL DATO DE LOS PUESTOS PROPIOS NO SE BORRA, y hay una razón.
      //
      // La redundancia reenvía las últimas seis pulsaciones, y algunas de ellas
      // son de pasos que esta máquina YA HA JUGADO — precisamente las que el
      // otro se ha podido perder si va por detrás. Borrarlas al consumirlas
      // hacía que se reenviaran ceros, que el otro daba por buenos y se quedaba
      // jugando ese paso con el mando en reposo. Es el mismo fallo que el de
      // mandar casillas sin registrar, por la otra punta.
      //
      // No hay riesgo de que estos datos se queden rancios: `registrar` escribe
      // cada casilla `retardo` pasos antes de que toque jugarla, así que
      // cuando el anillo dé la vuelta ya estará sobrescrita.
      if (this._esLocal[i]) continue;
      const e = viejo * this._jugadores * 2 + i * 2;
      this._ejes[e] = 0;
      this._ejes[e + 1] = 0;
      this._botones[viejo * this._jugadores + i] = 0;
    }
    this.paso++;
  },

  // --- Lo que viaja por la red ----------------------------------------------

  // El paquete a mandar en este paso: las últimas `REDUNDANCIA` pulsaciones de
  // un puesto local, terminando en la que se acaba de registrar.
  //
  // Devuelve el búfer preasignado, así que hay que mandarlo antes de volver a
  // llamar. Con un solo puesto local por máquina —que es el caso— eso pasa
  // siempre.
  empaquetar(jugador) {
    // SOLO VIAJA LO QUE SE SABE, y esto costó encontrarlo.
    //
    // La versión anterior mandaba las últimas seis casillas del anillo
    // estuvieran registradas o no. Parece inofensivo porque una casilla sin
    // registrar vale cero... pero al llegar al otro lado se marca como CONOCIDA,
    // y desde ese momento ya no acepta el valor de verdad cuando llega: la regla
    // es "lo que ya sé no se toca". El otro jugaba ese paso con el mando en
    // reposo mientras aquí se jugaba con el stick donde estuviera.
    //
    // Se ve solo cuando alguien se para a esperar, porque es entonces cuando el
    // paso siguiente todavía no tiene pulsación. Con la red perfecta no pasa
    // nunca. Lo cazó la prueba de Node perdiendo siete paquetes seguidos.
    const ultimo = this._ultimo[jugador];
    if (ultimo < 0) return null;            // todavía no hay nada que contar

    // DESDE DÓNDE SE REPITE: lo normal son las seis últimas, pero si el otro se
    // ha quedado atrás, desde donde él esté.
    //
    // SIN ESTO SE BLOQUEAN LOS DOS PARA SIEMPRE, y no es un caso raro. Basta
    // que una punta se pare más de seis pasos —un tirón de red, una pausa del
    // recolector, cambiar de pestaña— para que el paquete del otro deje de
    // contener los pasos que le faltan. Y como esa punta parada tampoco avanza,
    // deja de registrar los suyos, así que el otro se para también. Los dos
    // esperándose, con las pulsaciones existiendo en la memoria de enfrente y
    // sin forma de pedirlas.
    //
    // Lo cazó herramientas/probar-sincro.js cortando la conexión dos segundos y
    // volviéndola a abrir: no se recuperaban jamás.
    let primero = Math.max(0, ultimo - REDUNDANCIA + 1);
    // Por dónde va EL QUE ESCUCHA, no el que manda: lo que hay que repetir son
    // las pulsaciones que a ÉL le faltan. Con varios, manda el más rezagado.
    let masAtrasado = -1;
    for (let i = 0; i < this._jugadores; i++) {
      if (this._esLocal[i]) continue;
      const suyo = this._pasoDe[i] | 0;
      if (suyo <= 0) continue;
      if (masAtrasado < 0 || suyo < masAtrasado) masAtrasado = suyo;
    }
    if (masAtrasado >= 0 && masAtrasado < primero) primero = masAtrasado;
    if (ultimo - primero + 1 > MARCOS_MAX) primero = ultimo - MARCOS_MAX + 1;
    const cuantos = ultimo - primero + 1;

    const v = this._vista;
    v.setUint8(0, TIPO_PULSACIONES);
    v.setUint8(1, jugador);
    v.setUint32(2, primero, true);
    // Por dónde voy yo, para que el otro sepa desde dónde repetirme a mí.
    v.setUint32(6, this.paso, true);

    for (let k = 0; k < cuantos; k++) {
      const s = (primero + k) & MASCARA;
      const e = s * this._jugadores * 2 + jugador * 2;
      const o = CABECERA + k * POR_MARCO;
      v.setInt8(o, this._ejes[e]);
      v.setInt8(o + 1, this._ejes[e + 1]);
      v.setUint32(o + 2, this._botones[s * this._jugadores + jugador] >>> 0, true);
    }
    // Si todavía no hay `REDUNDANCIA` pasos de historia, se manda menos.
    return this._paquete.subarray(0, CABECERA + cuantos * POR_MARCO);
  },

  // Mete en el anillo lo que ha llegado. Devuelve cuántas casillas ha rellenado
  // que no se supieran ya.
  //
  // Se descarta en silencio lo que no sirve, que es lo correcto y no un
  // descuido: un paquete puede traer pulsaciones YA JUGADAS —es lo normal, para
  // eso hay redundancia— y podría traer basura si alguien manipulara el canal.
  // Escribir un paso ya jugado cambiaría el pasado, y escribir uno que no cabe
  // en el anillo pisaría otro distinto.
  aplicar(bytes) {
    const datos = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (datos.length < CABECERA) return 0;
    const v = new DataView(datos.buffer, datos.byteOffset, datos.byteLength);
    if (v.getUint8(0) !== TIPO_PULSACIONES) return 0;

    const jugador = v.getUint8(1);
    if (jugador >= this._jugadores) return 0;
    // Nadie puede hablar por un puesto de esta máquina. Sin esta comprobación,
    // un paquete con el número de puesto equivocado sobrescribiría lo que está
    // pulsando quien juega aquí.
    if (this._esLocal[jugador]) return 0;

    const primero = v.getUint32(2, true);
    // Por dónde va el otro. Se guarda para poder repetirle desde ahí si se ha
    // quedado atrás.
    const suPaso = v.getUint32(6, true);
    if (suPaso > this._pasoDe[jugador]) this._pasoDe[jugador] = suPaso;
    const cuantos = Math.floor((datos.length - CABECERA) / POR_MARCO);
    let nuevas = 0;

    for (let k = 0; k < cuantos; k++) {
      const p = primero + k;
      if (p < this.paso) continue;                  // ya jugado: el pasado no se toca
      if (p >= this.paso + CAPACIDAD) continue;     // no cabe en el anillo
      const s = p & MASCARA;
      const idx = s * this._jugadores + jugador;
      if (this._conocido[idx]) continue;            // ya lo sabíamos
      const o = CABECERA + k * POR_MARCO;
      const e = s * this._jugadores * 2 + jugador * 2;
      this._ejes[e] = v.getInt8(o);
      this._ejes[e + 1] = v.getInt8(o + 1);
      this._botones[idx] = v.getUint32(o + 2, true);
      this._conocido[idx] = 1;
      nuevas++;
    }
    return nuevas;
  }
 };
}

export const Lockstep = crearBufer();

export const FORMATO = { CABECERA, POR_MARCO, REDUNDANCIA, CAPACIDAD, ESCALONES,
                         TIPO_PULSACIONES, MARCOS_MAX };
