import { Lockstep } from '../core/lockstep.js';

// LA PARTIDA EN RED: quien junta la conexión con el búfer de pulsaciones.
//
// Ni `conexion.js` sabe qué es una partida ni `lockstep.js` sabe qué es una
// conexión. Este módulo es lo único que sabe las dos cosas, y a propósito: así
// el búfer se puede probar entero en Node sin WebRTC —y se prueba— y la
// conexión sirve para cualquier cosa que haya que mandar.
//
// LO QUE HACE EN CADA PASO DE LÓGICA, y el orden importa:
//
//   1. Manda lo que se está pulsando aquí. SIEMPRE, aunque el mundo esté
//      parado esperando: si una punta se calla mientras espera, deja al otro sin
//      las pulsaciones que ya tiene y los dos se quedan esperándose. Callarse al
//      esperar es como se construye un bloqueo mutuo.
//   2. Deja avanzar al mundo solo si conoce las pulsaciones de todos.
//   3. De vez en cuando compara una huella del mundo con la del otro. Si se han
//      separado, LO DICE Y PARA, en vez de seguir jugando dos partidas distintas
//      creyendo que son una.
//
// EL PUNTO 3 ES EL QUE DA LA CARA. Todo lo anterior —las matemáticas
// deterministas, los reinicios de estado, la cuantización del stick— existe para
// que esa comparación salga bien. Si algo de eso falla, se entera aquí.

const VERSION_PROTOCOLO = 1;

// CADA CUÁNTOS PASOS SE COMPARA EL MUNDO.
//
// Empezó en 60 —una vez por segundo— y era demasiado espaciado para lo que hace
// falta ahora. Con un segundo entre medidas, cuando salta el aviso ya difieren
// siete componentes: la divergencia nació en algún punto de esos sesenta pasos y
// se ha propagado a todo lo que toca. Con la ventana corta, el primer aviso
// suele traer UN solo componente, y ese sí señala el origen.
//
// Cuesta unos 450 B/s por el canal fiable. Nada al lado de los 2,5 KB/s de las
// pulsaciones, y se puede aflojar cuando el cooperativo esté rodado:
// EMERITA.red.vigilancia(60).
let CADA_HUELLA = 20;

// De qué pools se guarda el detalle mientras se juega. Los enemigos y los
// cosméticos NO: son demasiados como para retratarlos en caliente.
//
// LOS ARSENALES ENTRAN aunque no sean un pool: son cuatro jugadores por seis
// armas como mucho, y es el grupo que más falta hace tener retratado — el arma
// elegida al subir de nivel es lo único que viaja por el canal fiable, o sea lo
// que más fácil acaba distinto en las dos máquinas.
const GRUPOS_VIGILADOS = ['jugadores', 'disparos', 'proyectiles', 'zonas',
                          'cofres', 'recogibles', 'mascotas', 'arsenales'];

// A partir de cuántos pasos parado se avisa. Dos segundos: por debajo de eso es
// un tirón de red y no hay nada que decir; por encima, el jugador está mirando
// una pantalla congelada y merece saber por qué.
const ESPERA_AVISO = 120;

// CUANTO SE AGUANTA UN BACHE ANTES DE DAR LA PARTIDA POR PERDIDA.
//
// Quince segundos, contados en pasos porque es el único reloj que hay aquí — y
// mientras se espera el mundo no avanza, así que `antesDelPaso` se sigue
// llamando sesenta veces por segundo aunque no se dé ni un paso.
//
// El número sale de las dos cosas que puede ser un bache. Si es un tropiezo de
// ICE —la wifi que parpadea, el router que cambia de canal, un cable que se
// menea— vuelve en dos o tres segundos y quince sobran. Si es la línea que se ha
// caído de verdad, no va a volver, y quince segundos mirando una pantalla quieta
// ya son suficientes para que nadie piense que el juego se ha colgado.
const AGUANTE_BACHE = 900;

// Y ESTE RELOJ SOLO CORRE CON EL TRANSPORTE DICIENDO QUE ALGO VA MAL.
//
// Esperar con el canal sano es otra cosa y no se le pone límite: el otro puede
// estar en una pestaña de fondo —los navegadores frenan a los que no se ven— o
// haber soltado el mando un momento. Rendirse ahí sería echar a alguien de su
// propia partida por haber mirado el navegador un rato.

// LAS DIECISIETE PARTES, EN UN SOLO NUMERO.
//
// Para el saludo del reenganche no hace falta el detalle: solo hay que decidir
// si las dos partidas siguen siendo la misma en un paso concreto, y eso es un
// sí o un no. Mandando las partes enteras de ocho pasos irían tres kilobytes por
// un canal que acaba de nacer; mezcladas van ocho números.
//
// El detalle sigue estando donde hace falta —en la vigilancia de cada veinte
// pasos, que es la que tiene que decir QUÉ componente se ha separado—. Aquí la
// pregunta es otra.
function mezclarPartes(partes) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < partes.length; i++) {
    h = (h ^ (partes[i] >>> 0)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function vigilarCada(pasos) {
  CADA_HUELLA = Math.max(1, pasos | 0);
  return CADA_HUELLA;
}

// Cuántas huellas propias se recuerdan, para poder comparar una que llegue
// tarde. Treinta son medio minuto.
const HUELLAS_GUARDADAS = 30;

// Se fabrica, como el búfer, para poder tener DOS en la misma memoria: la
// prueba de Node monta las dos puntas de una partida y las hace hablar entre
// ellas. Todo lo de aquí —comparar firmas, pedir el detalle, decidir si el
// mundo avanza— es logica pura y no necesita WebRTC; solo el transporte lo
// necesita. Mis tres ultimos fallos vivian justo en esta capa, sin probar.
export function crearSincro(L) {
 return {
  activo: false,
  esAnfitrion: false,
  jugadorLocal: 0,
  jugadores: 1,
  // Motivo por el que se ha roto la partida, si se ha roto.
  roto: '',
  // Y SI LA CULPA FUE DE LA RED, que no es lo mismo ni de lejos.
  //
  // A un corte se le puede volver: los dos mundos siguen enteros y solo falta
  // un canal. A una DIVERGENCIA no: los dos mundos ya son distintos, y volver a
  // conectarlos solo serviría para que siguieran jugando dos partidas creyendo
  // que son una, que es justo lo que toda la vigilancia de aquí existe para
  // impedir. Y a un `adios` tampoco: quien se fue ya no tiene partida.
  rotoPorRed: false,
  // Cuántas huellas se han comparado y en cuántos pasos ha habido que esperar.
  huellasComparadas: 0,
  desdeUltimaHuella: 0,
  _pasosParado: 0,
  // EL BACHE: el transporte dice que el enlace se ha ido, pero puede volver.
  //
  // No es lo mismo que `roto`. `roto` es definitivo y saca el cartel de las dos
  // salidas; esto es un compás de espera en el que la partida sigue entera en
  // las dos máquinas y solo falta que el cable vuelva. El texto es lo que se le
  // enseña a quien está mirando; vacío mientras no pase nada, que es lo normal.
  bache: '',
  pasosBache: 0,
  // Cuántos enlaces están caídos ahora mismo. Con cuatro jugadores el anfitrión
  // tiene tres, y que vuelva uno no significa que hayan vuelto los otros dos:
  // contando en vez de guardando un si/no, el aviso se quita cuando lo tiene que
  // quitar y no con el primero que conteste.
  _enBache: 0,
  // El último paso que se comprobó y salió bien. Al romperse, acota la
  // divergencia a la ventana entre ese paso y el que falla.
  ultimoBueno: -1,
  // POR DÓNDE VA LA CONEXIÓN Y CUÁNTO TARDA, refrescado solo.
  //
  // Vive aquí y sale en el panel F3 porque el día que esto se pruebe entre dos
  // sitios de verdad, quien juega necesita ver si el camino es `publica` —o sea
  // que se ha atravesado un router— sin tener que abrir la consola y escribir
  // nada. Y las esperas, al lado, dicen si el retardo se ha quedado corto.
  camino: '',
  rttMs: 0,
  _relojCamino: 0,

  // LOS ENLACES. Uno solo si te has unido —con el anfitrión— y uno por cada
  // invitado si eres tú quien invita.
  //
  // ESTRELLA Y NO MALLA, y la razón es la señalización a mano: en una malla
  // todos se conectan con todos, y para cuatro jugadores eso son SEIS
  // intercambios de código pegados uno a uno. Nadie hace eso. En estrella cada
  // invitado solo habla con el anfitrión —tres intercambios para cuatro— y el
  // anfitrión reenvía lo que recibe a los demás.
  //
  // El precio es un salto de más: lo que pulsa un invitado llega a otro
  // invitado pasando por el anfitrión. Con el retardo de entrada dando margen,
  // ese salto cabe.
  _enlaces: null,
  _huellaDe: null,          // función que devuelve la huella del mundo
  _partesDe: null,          // los componentes por separado, para señalar el culpable
  // Fotos recientes del mundo, guardadas para poder comparar campo a campo
  // cuando algo se separa. Ver `_pedirFoto`.
  _fotoDe: null,
  _comparaFotos: null,
  _fotos: null,
  _nombres: null,
  _alElegir: null,          // (indice) aplicar la carta que ha elegido el otro
  _alCofre: null,           // (accion) lo que ha hecho el otro con su cofre
  _mias: null,              // Map paso -> huella
  _alRomperse: null,

  // Arranca la partida en red. `conexion` ya tiene que estar conectada.
  //
  //   jugadorLocal   qué puesto maneja esta máquina
  //   jugadores      cuántos juegan en total
  //   huellaDe()     devuelve un entero con el estado del mundo (determinismo.js)
  //   alRomperse(t)  se llama si las dos partidas se separan
  empezar(conexiones, opciones) {
    // Uno o varios: quien se une trae solo el del anfitrión.
    this._enlaces = Array.isArray(conexiones) ? conexiones.slice() : [conexiones];

    this.esAnfitrion = !!opciones.esAnfitrion;
    this.jugadorLocal = opciones.jugadorLocal | 0;
    this.jugadores = Math.max(2, opciones.jugadores | 0);
    this._huellaDe = opciones.huellaDe || null;
    this._partesDe = opciones.partesDe || null;
    this._fotoDe = opciones.fotoDe || null;
    this._comparaFotos = opciones.comparaFotos || null;
    this._fotos = new Map();
    this._nombres = opciones.nombres || [];
    this._alElegir = opciones.alElegir || null;
    this._alCofre = opciones.alCofre || null;
    this._alRomperse = opciones.alRomperse || null;
    this._mias = new Map();
    this.roto = '';
    this.rotoPorRed = false;
    this.huellasComparadas = 0;
    this.desdeUltimaHuella = 0;
    this._pasosParado = 0;
    this.bache = '';
    this.pasosBache = 0;
    this._enBache = 0;
    this.activo = true;

    // El búfer, con los puestos repartidos: el mío es local, el resto viene por
    // la red.
    L.reiniciar(this.jugadores, [this.jugadorLocal]);
    this._engancharEnlaces();
  },

  // VOLVER A UNA PARTIDA QUE SIGUE EN PIE, por un canal nuevo.
  //
  // Es `empezar` MENOS las dos cosas que aquí serían el desastre: no toca el
  // búfer —`L.reiniciar` pondría el contador de pasos a cero y las dos máquinas
  // dejarían de hablar del mismo paso— y no borra las huellas guardadas, que son
  // precisamente con lo que se acaba de comprobar que la partida es la misma.
  //
  // Lo que sí se limpia es el motivo de la ruptura y el bache: la conexión que
  // se cayó ya no existe, y el que manda ahora es el enlace nuevo.
  reanudar(conexiones) {
    this._enlaces = Array.isArray(conexiones) ? conexiones.slice() : [conexiones];
    this.roto = '';
    this.rotoPorRed = false;
    this.bache = '';
    this.pasosBache = 0;
    this._enBache = 0;
    this._pasosParado = 0;
    this.activo = true;
    this._engancharEnlaces();
    return true;
  },

  // LO QUE HAY QUE ENSEÑARLE AL OTRO PARA QUE COMPRUEBE QUE SEGUIMOS EN LA
  // MISMA PARTIDA.
  //
  // Reengancharse a ciegas sería peor que no reengancharse: dos mundos que ya no
  // son el mismo seguirían jugando como si lo fueran, y eso es exactamente lo
  // que toda la vigilancia de este módulo existe para no permitir. El caso no es
  // rebuscado: basta con que uno de los dos haya elegido SEGUIR EN SOLITARIO
  // antes de arrepentirse.
  puntoDeReenganche() {
    const pasos = [];
    for (const p of this._mias.keys()) pasos.push(p);
    pasos.sort((a, b) => b - a);
    const huellas = [];
    for (let i = 0; i < pasos.length && i < 8; i++) {
      huellas.push(pasos[i] + ':' + mezclarPartes(this._mias.get(pasos[i])));
    }
    return {
      jugadores: this.jugadores,
      puesto: this.jugadorLocal,
      paso: L.paso,
      huellas
    };
  },

  // Y la respuesta: cadena vacía si se puede reanudar, y si no, POR QUÉ NO.
  //
  // El motivo se dice con las palabras de quien juega y no con un código: quien
  // está mirando esa pantalla acaba de perder una partida de media hora y lo
  // menos que se le puede dar es la razón.
  comprobarReenganche(suyo) {
    if (!suyo) return 'no ha contestado.';
    if ((suyo.jugadores | 0) !== this.jugadores) {
      return 'no jugabais los mismos: ' + this.jugadores + ' aquí y ' +
             (suyo.jugadores | 0) + ' allí.';
    }
    if ((suyo.puesto | 0) === this.jugadorLocal) {
      return 'los dos os creéis el mismo jugador. ¿Habéis abierto la partida ' +
             'dos veces en la misma máquina?';
    }
    const suyas = new Map();
    const lista = suyo.huellas || [];
    for (let i = 0; i < lista.length; i++) {
      const c = String(lista[i]).split(':');
      suyas.set(parseInt(c[0], 10), parseInt(c[1], 10) >>> 0);
    }
    // EL PUNTO COMÚN ES EL PASO MÁS ALTO QUE LOS DOS TENGÁIS COMPROBADO. Se
    // guardan las treinta últimas huellas, una cada veinte pasos: diez segundos
    // de historia, de sobra para dos mundos que se pararon a la vez.
    let comun = -1;
    for (const p of this._mias.keys()) {
      if (suyas.has(p) && p > comun) comun = p;
    }
    if (comun < 0) {
      return 'no compartís ningún punto comprobado. Habéis parado demasiado ' +
             'lejos el uno del otro para saber si seguís en la misma partida.';
    }
    if (mezclarPartes(this._mias.get(comun)) !== suyas.get(comun)) {
      return 'vuestras partidas ya no son la misma en el paso ' + comun + '. ' +
             '¿Alguno ha seguido jugando en solitario?';
    }
    return '';
  },

  _engancharEnlaces() {
    for (let i = 0; i < this._enlaces.length; i++) {
      const enlace = this._enlaces[i];
      enlace.alJuego = (datos) => {
        L.aplicar(datos);
        // EL ANFITRIÓN REENVÍA. Los invitados no se ven entre ellos, así que lo
        // que pulsa uno solo llega a los demás si él lo pasa. Se reenvían los
        // mismos bytes tal cual: quien no sea el destinatario los descarta solo
        // —`aplicar` rechaza lo que va dirigido a un puesto propio— y así el
        // reenvío no tiene que entender nada de lo que reenvía.
        if (this.esAnfitrion) this._difundirJuego(datos, enlace);
      };
      enlace.alControl = (texto) => this._recibirControl(texto, enlace);
      enlace.alCerrar = () => {
        // ESTE SÍ ES DEFINITIVO. Un canal cerrado no se vuelve a abrir: para
        // volver haría falta un código nuevo y el baile entero, que es otra
        // tarea. Aquí no hay nada que esperar, así que no se espera.
        if (this.activo) this._romper('Se ha cortado la conexión.', true);
      };
      enlace._bache = false;
      enlace.alBache = (motivo) => {
        if (!this.activo || this.roto || enlace._bache) return;
        enlace._bache = true;
        if (++this._enBache > 1) return;
        this.bache = motivo || 'Se ha perdido el contacto.';
        this.pasosBache = 0;
        console.warn('RED: ' + this.bache + ' Se espera hasta ' +
                     (AGUANTE_BACHE / 60 | 0) + ' s.');
      };
      enlace.alVolver = () => {
        if (!enlace._bache) return;
        enlace._bache = false;
        if (--this._enBache > 0) return;
        this._enBache = 0;
        console.log('RED: el contacto ha vuelto tras ' +
                    (this.pasosBache / 60).toFixed(1) + ' s. Se sigue donde estaba.');
        this.bache = '';
        this.pasosBache = 0;
      };
    }
  },

  _difundirJuego(datos, excepto) {
    for (let i = 0; i < this._enlaces.length; i++) {
      if (this._enlaces[i] === excepto) continue;
      this._enlaces[i].enviarJuego(datos);
    }
  },

  _difundirControl(texto) {
    for (let i = 0; i < this._enlaces.length; i++) this._enlaces[i].enviarControl(texto);
  },

  // PARAR LA SIMULACIÓN NO ES COLGAR EL TELÉFONO.
  //
  // Al detectarse una desincronización hay que dejar de simular en el acto,
  // pero la conversación tiene que seguir viva unos instantes: es entonces
  // cuando llegan los números del otro con los que se averigua qué se ha
  // separado. Cerrando el canal aquí, ese detalle no llegaba nunca.
  parar() {
    this.activo = false;
    for (let i = 0; this._enlaces && i < this._enlaces.length; i++) {
      this._enlaces[i].alJuego = null;
    }
  },

  // Esto sí cuelga: se usa al salir de la partida a propósito.
  desconectar() {
    this.activo = false;
    for (let i = 0; this._enlaces && i < this._enlaces.length; i++) {
      this._enlaces[i].alJuego = null;
      this._enlaces[i].alControl = null;
    }
    this._enlaces = null;
  },

  // Se llama UNA vez por paso de lógica, antes de decidir si el mundo avanza.
  // Devuelve true si se puede dar el paso.
  antesDelPaso(entrada) {
    if (!this.activo) return true;
    if (this.roto) return false;

    // EL RELOJ DEL BACHE CORRE AUNQUE EL MUNDO SIGA ANDANDO UN POCO MÁS.
    //
    // Al irse el contacto quedan todavía unas pulsaciones en el búfer, así que
    // hay unos fotogramas en los que se juega con normalidad antes de pararse.
    // Contando solo cuando el mundo está quieto, esos fotogramas se regalarían a
    // la espera y el aguante sería distinto cada vez.
    if (this.bache && ++this.pasosBache >= AGUANTE_BACHE) {
      this._romper(this.bache + ' No ha vuelto en ' +
                   (AGUANTE_BACHE / 60 | 0) + ' segundos.', true);
      return false;
    }

    // Registrar lo de aquí solo tiene sentido si el mundo va a avanzar: el
    // búfer apunta al paso EN CURSO más el retardo, y si el paso no se da, ese
    // destino no cambia. Registrar de nuevo lo mismo no hace daño, pero mandar
    // sí hace falta siempre.
    if (L.listo()) L.registrar(entrada);

    const bytes = L.empaquetar(this.jugadorLocal);
    if (bytes) this._difundirJuego(bytes, null);

    if (!L.listo()) {
      L.anotarEspera();
      // UNA PANTALLA CONGELADA SIN EXPLICACIÓN ES UN FALLO EN SÍ MISMO.
      //
      // Esperar es el comportamiento correcto —mejor parar que inventarse lo
      // que pulsó el otro— pero callárselo no lo es: a Sergio se le quedó la
      // imagen quieta y no había nada en la consola que lo explicara. Se avisa
      // a los dos segundos y luego cada cinco, sin llenar la consola.
      this._pasosParado++;
      if (this._pasosParado === ESPERA_AVISO ||
          (this._pasosParado > ESPERA_AVISO && this._pasosParado % 300 === 0)) {
        const faltan = L.faltan().map((i) => `jugador ${i + 1}`).join(', ');
        console.warn(`RED: esperando a ${faltan} desde hace ` +
                     `${(this._pasosParado / 60).toFixed(1)} s (paso ${L.paso}).`);
      }
      return false;
    }
    // PONERSE AL DÍA NO HAY QUE PROGRAMARLO, y conviene saber por qué: en
    // lockstep, si falta la pulsación de alguien el mundo se para EN TODAS las
    // máquinas. O sea que mientras uno está caído el otro tampoco avanza, y al
    // volver no hay media partida que recuperar sino unos pocos pasos. De eso ya
    // se encarga `empaquetar`, que manda hasta cuarenta marcos atrasados en
    // cuanto ve que el otro se ha quedado atrás.
    this._pasosParado = 0;
    return true;
  },

  // QUÉ CONTARLE A QUIEN ESTÁ MIRANDO UNA PANTALLA QUIETA.
  //
  // Devuelve null mientras no haya nada que decir, que es casi siempre. Los dos
  // segundos de margen son a propósito: por debajo de eso el mundo se para y
  // arranca constantemente —es el pulso normal de una partida en red— y un
  // cartel parpadeando ahí sería peor que el silencio.
  espera() {
    if (!this.activo || this.roto) return null;
    if (this._pasosParado < ESPERA_AVISO) return null;
    return {
      motivo: this.bache,
      segundos: this._pasosParado / 60,
      // Cuánto queda antes de rendirse. Cero cuando no hay bache: el canal esta
      // sano y se espera lo que haga falta, así que no hay cuenta atrás que dar.
      restan: this.bache ? Math.max(0, (AGUANTE_BACHE - this.pasosBache) / 60) : 0,
      quien: L.faltan()
    };
  },

  // La carta que acaba de elegir quien juega aquí. Va por el canal FIABLE: si
  // se perdiera, las dos partidas se quedarían con arsenales distintos, y eso
  // no lo tapa ninguna redundancia.
  avisarEleccion(indice) {
    if (!this.activo || this.roto) return;
    this._difundirControl(`e ${indice | 0}`);
  },

  // Lo que ha hecho con SU cofre quien lo ha cogido: 0 = terminar el giro de las
  // ruletas, 1 = cerrarlo.
  //
  // Va por el mismo camino que la carta y por la misma razón: el cofre para el
  // mundo, así que mientras está abierto el búfer de pulsaciones no fluye.
  avisarCofre(accion) {
    if (!this.activo || this.roto) return;
    this._difundirControl(`c ${accion | 0}`);
  },

  // Se llama DESPUÉS de que el mundo haya dado el paso.
  despuesDelPaso() {
    // Cada dos segundos, quién es el camino de verdad. Es una consulta a las
    // estadísticas de WebRTC y devuelve una promesa: se pide y se recoge cuando
    // llegue, sin que el paso espere por ella.
    if (this.activo && !this.roto && ++this._relojCamino >= 120) {
      this._relojCamino = 0;
      const primero = this._enlaces && this._enlaces[0];
      if (primero && primero.camino) {
        primero.camino().then((c) => {
          if (!c) return;
          this.camino = c.clase;
          if (c.ms != null) this.rttMs = c.ms;
        }).catch(() => {});
      }
    }

    // Vale con cualquiera de las dos formas de firmar. Antes exigía `_huellaDe`
    // aunque luego usara `_partesDe`, así que montarlo solo con la segunda
    // dejaba la comprobación apagada EN SILENCIO — y una comprobación apagada
    // en silencio es peor que no tenerla.
    if (!this.activo || this.roto) return;
    if (!this._partesDe && !this._huellaDe) return;
    this.desdeUltimaHuella++;
    if (this.desdeUltimaHuella < CADA_HUELLA) return;
    this.desdeUltimaHuella = 0;

    const paso = L.paso;
    // SE MANDAN LOS COMPONENTES, NO UNA CIFRA. Son diecisiete números, unos 150
    // bytes por segundo por el canal fiable — nada al lado de las pulsaciones.
    // Y valen la diferencia entre "las partidas se han separado" y "se han
    // separado EN LOS ENEMIGOS", que es lo único con lo que se puede empezar a
    // buscar.
    const partes = this._partesDe ? this._partesDe() : [this._huellaDe() >>> 0];
    this._mias.set(paso, partes);
    // Y la foto del mundo en ese mismo paso, SOLO DE LOS POOLS PEQUEÑOS.
    //
    // Los enemigos quedan fuera a propósito: al minuto cinco hay cientos, y un
    // objeto por cada uno tres veces por segundo colgó el navegador de Sergio
    // sin dar un solo error. Para los pools pequeños son unas pocas decenas de
    // objetos y se puede permitir.
    //
    // Si algún día lo que diverge son los enemigos, esto no lo va a poder
    // detallar y habrá que pedir la foto A MANO con la partida ya parada.
    if (this._fotoDe) {
      this._fotos.set(paso, this._fotoDe(GRUPOS_VIGILADOS));
      if (this._fotos.size > 2) {
        this._fotos.delete(this._fotos.keys().next().value);
      }
    }
    // No se guarda historia infinita: si la huella del otro no ha llegado en
    // medio minuto, la partida ya tiene un problema mayor que este.
    if (this._mias.size > HUELLAS_GUARDADAS) {
      const primera = this._mias.keys().next().value;
      this._mias.delete(primera);
    }
    this._difundirControl(`h ${paso} ${partes.join(',')}`);
  },

  _recibirControl(texto, enlace) {
    // EL ANFITRIÓN REENVÍA TAMBIÉN POR EL CANAL FIABLE, y no todo: solo lo que
    // TIENE que saber todo el mundo.
    //
    // Sin esto, con tres o cuatro jugadores la partida se bloqueaba entera. La
    // carta que elige un invitado se manda por aquí —no puede ir por el búfer
    // de pulsaciones, porque el menú de nivel para el mundo y el búfer deja de
    // fluir— y solo llegaba al anfitrión. Los demás invitados nunca se
    // enteraban, su menú no se cerraba nunca, y como el mundo espera a todos,
    // se paraba todo. Con dos jugadores no pasa: el anfitrión ES el otro.
    //
    // Las huellas y las peticiones de detalle NO se reenvían: esas son
    // conversaciones de dos, cada invitado con el anfitrión.
    if (this.esAnfitrion && (texto.startsWith('e ') || texto.startsWith('c ') ||
                             texto === 'adios')) {
      for (let i = 0; i < this._enlaces.length; i++) {
        if (this._enlaces[i] === enlace) continue;
        this._enlaces[i].enviarControl(texto);
      }
    }

    if (texto.startsWith('h ')) {
      const p = texto.split(' ');
      const paso = parseInt(p[1], 10);
      const suyas = p[2].split(',').map((x) => parseInt(x, 10) >>> 0);
      const mias = this._mias.get(paso);
      // Que no esté todavía no es un problema: puede llegar antes de que esta
      // máquina alcance ese paso. Se ignora y ya la comparará la del siguiente
      // segundo, porque las dos mandan.
      if (mias === undefined) return;
      this.huellasComparadas++;

      const culpables = [];
      const nombresQueDifieren = [];
      for (let i = 0; i < mias.length && i < suyas.length; i++) {
        if (mias[i] !== suyas[i]) {
          nombresQueDifieren.push(this._nombres[i] || String(i));
          culpables.push(`${(this._nombres[i] || i)} (aquí ${mias[i].toString(16)}, ` +
                         `allí ${suyas[i].toString(16)})`);
        }
      }
      if (culpables.length > 0) {
        // EL DETALLE SE PIDE ANTES DE ROMPER, y el orden importa: `_romper`
        // avisa al juego, el juego termina la partida en red y eso cierra la
        // conexión. Pidiéndolo después, la petición salía por un canal que ya
        // no existía y reventaba justo en el momento en que iba a servir.
        this._pedirFoto(paso, nombresQueDifieren);
        this._romper(`Las dos partidas se han separado entre el paso ` +
                     `${this.ultimoBueno} y el ${paso}. ` +
                     `Difieren: ${culpables.join(' · ')}`);
      } else {
        this.ultimoBueno = paso;
      }
      return;
    }
    if (texto.startsWith('dame ')) {
      // El otro se ha dado cuenta de que difieren y pide sus números.
      const p = texto.split(' ');
      const paso = parseInt(p[1], 10);
      const foto = this._fotos.get(paso);
      if (!foto) { enlace.enviarControl(`nofoto ${paso}`); return; }
      const grupos = (p[2] || '').split(',');
      const recorte = {};
      for (let i = 0; i < grupos.length; i++) {
        if (foto[grupos[i]]) recorte[grupos[i]] = foto[grupos[i]];
      }
      enlace.enviarControl('foto ' + paso + ' ' + JSON.stringify(recorte));
      return;
    }
    if (texto.startsWith('foto ')) {
      const corte = texto.indexOf(' ', 5);
      const paso = parseInt(texto.slice(5, corte), 10);
      const mia = this._fotos.get(paso);
      if (!mia) { console.error('RED: no guardo la foto de ese paso.'); return; }
      let suya;
      try { suya = JSON.parse(texto.slice(corte + 1)); }
      catch { console.error('RED: la foto del otro no se ha podido leer.'); return; }
      // SOLO SE COMPARA LO QUE HA VENIDO. El otro manda únicamente los grupos
      // que se le pidieron; comparando contra la foto entera, todos los demás
      // salían como "aquí 87 y allí 0" y la tabla se llenaba de diferencias
      // inventadas que tapaban la de verdad.
      const recorte = {};
      for (const grupo in suya) if (mia[grupo]) recorte[grupo] = mia[grupo];
      const difs = this._comparaFotos ? this._comparaFotos(recorte, suya, 40) : [];
      if (difs.length === 0) {
        console.warn('RED: los números coinciden campo a campo. Lo que difiere ' +
                     'está en un campo que la foto no recoge.');
      } else {
        console.error(`RED: ${difs.length} diferencia(s) concreta(s) ` +
                      '(pasada1 = aquí, pasada2 = allí):');
        console.table(difs);
      }
      return;
    }
    if (texto.startsWith('nofoto ')) {
      console.warn('RED: el otro ya no guardaba la foto de ese paso.');
      return;
    }
    if (texto.startsWith('e ')) {
      const indice = parseInt(texto.slice(2), 10) | 0;
      if (this._alElegir) this._alElegir(indice);
      return;
    }
    if (texto.startsWith('c ')) {
      if (this._alCofre) this._alCofre(parseInt(texto.slice(2), 10) | 0);
      return;
    }
    if (texto === 'adios') { this._romper('El otro jugador ha salido.'); return; }
  },

  _pedirFoto(paso, grupos) {
    if (!this._enlaces || this._enlaces.length === 0) return;
    if (!this._fotos.has(paso) || !grupos || grupos.length === 0) return;
    this._difundirControl(`dame ${paso} ${grupos.join(',')}`);
  },

  _romper(motivo, porRed) {
    if (this.roto) return;
    this.roto = motivo;
    this.rotoPorRed = !!porRed;
    console.error('RED: ' + motivo);
    if (this._alRomperse) this._alRomperse(motivo);
  },

  // Para el panel de depuración.
  resumen() {
    if (!this.activo) return null;
    return {
      paso: L.paso,
      jugadorLocal: this.jugadorLocal,
      esperas: L.esperas,
      esperaMax: L.esperaMax,
      huellas: this.huellasComparadas,
      camino: this.camino,
      rttMs: this.rttMs,
      bache: this.bache,
      roto: this.roto,
      rotoPorRed: this.rotoPorRed ? 1 : 0
    };
  }
 };
}

export const Sincro = crearSincro(Lockstep);

export const PROTOCOLO = { VERSION: VERSION_PROTOCOLO, CADA_HUELLA };
