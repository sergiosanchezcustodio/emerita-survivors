import { ARMAS } from '../datos/armas.js';
import { PASIVOS } from '../datos/pasivos.js';
import { comportamientoImplementado } from './armas.js';
import { GestorAudio } from './audio.js';
import { VFX } from './vfx.js';
import { Particulas, COLOR_CHISPA } from './particulas.js';

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
// después. Esto se va a tocar varias veces contra la curva del director.
// SEGUNDO AJUSTE, con la curva de oleadas ya subida. Jugando se llegaba al nivel
// 12 sin esfuerzo, y parte de la culpa no era del combate sino de esto: al haber
// el doble de enemigos en pantalla y valer más cada uno, la experiencia entra
// mucho más deprisa que cuando se calibró esta curva. El arranque se deja igual
// —las tres o cuatro primeras elecciones tienen que llegar pronto, eso no
// cambia— y lo que se encarece es de la mitad en adelante.
//
//   nivel      1     3     5    10    20    30    40
//   antes     14    28    48   118   348   698  1168
//   ahora     15    35    63   168   608  1288  2248
const XP_BASE = 8;
const XP_LINEAL = 6;
const XP_CUADRATICO = 1.0;

// El oro del anillo que se abre al subir de nivel (ver _celebrarNivel).
// Constante de módulo, no una cadena construida al vuelo: el resto del motor
// tampoco compone colores en caliente.
const COLOR_ANILLO_NIVEL = '#ffd24a';

export function xpNecesaria(nivel) {
  return Math.round(XP_BASE + XP_LINEAL * nivel + XP_CUADRATICO * nivel * nivel);
}

// --- XP compartida en cooperativo --------------------------------------------
// Con más de un jugador, la XP de CUALQUIERA alimenta una única barra de
// equipo en vez de la suya propia: todos suben de nivel a la vez, aunque cada
// uno elige su propia mejora al hacerlo (ver Progresion.ganarXp más abajo).
//
// El umbral tiene que subir con el número de jugadores porque la XP entrante
// también sube: la horda no crece con más gente (sistemas/director.js no mira
// cuántos hay), así que cuatro personas matándola juntas llenan la misma
// barra hasta cuatro veces más deprisa. Sin este ajuste el equipo llegaría al
// techo de la curva en una fracción del tiempo previsto.
//
// Sublineal a propósito: cuatro jugadores no reparten limpiamente la horda
// entre cuatro (se pisan objetivos, se disputan al mismo enemigo), así que el
// multiplicador no es 1/2/3/4.
const MULT_EQUIPO = [1, 1.6, 2.1, 2.5];   // índice = nº de jugadores - 1

function xpNecesariaPara(nivel, nJugadores) {
  const n = Math.max(1, Math.min(nJugadores | 0, MULT_EQUIPO.length));
  return Math.round(xpNecesaria(nivel) * MULT_EQUIPO[n - 1]);
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

// --- Tirada de ruleta (ui/menuNivel.js) --------------------------------------
// Al abrir el menú (o pedir un reroll) las cartas ya están decididas —salen de
// `_generar`, con el RNG de siempre— pero se enseñan girando un momento antes
// de leerse, como una tragaperras. Es puro adorno: el contenido no cambia con
// la animación, solo se tapa un instante. Por eso vive el contador aquí en vez
// de en la interfaz, igual que VFX.congelado —un número que cuenta hacia atrás
// paso a paso— pero SIN tocar el RNG compartido, o dos partidas con la misma
// semilla dejarían de coincidir si un frame duraba un pelín más que otro.
export const DURACION_TIRADA = 0.6;

// --- Cofres y evoluciones (secciones 9 y 12 del plan) ------------------------
//
// El cofre lo suelta un élite y es la ÚNICA vía a las evoluciones. Al abrirlo:
//
//   1. Si alguna arma cumple los requisitos —nivel 8 y su pasivo a 1 o más—,
//      evoluciona. Es siempre lo mejor que puede salir, así que se comprueba
//      primero y se lleva el cofre entero: una evolución no compite con nada.
//      Solo hay que enterarse de lo que ha pasado, así que sale una pantalla de
//      aviso y se cierra con cualquier tecla.
//   2. Si no, SUBE DE NIVEL algo que YA LLEVA, al azar entre sus armas y sus
//      objetos. Una cosa; una de cada diez veces, tres.
//
// El punto 2 ha pasado por tres versiones. Primero fueron "1 a 3 mejoras
// aleatorias" aplicadas solas, como pedía la sección 12 del plan. Luego pasó a
// tres opciones a elegir, para que la recompensa por matar a un élite no fuera
// un cartel informativo. Y ahora vuelve a ser automática pero SOLO sobre lo que
// ya llevas, por decisión de Sergio, y es la versión correcta: con qué juegas se
// decide subiendo de nivel, y el cofre no tiene por qué meterse en eso. Lo que
// premia es haber ido a por el élite, y para eso basta con engordar lo que ya
// has elegido.
//
// El requisito de nivel 8 sobre un máximo de 10 es lo que hace que la evolución
// sea una decisión y no un trámite: llegar a 8 en un arma son ocho de las
// primeras elecciones de la partida, y renunciar a repartirlas.
export const NIVEL_EVOLUCION = 8;

// Cuántas veces de cada diez un cofre sube TRES cosas en vez de una.
const MAX_MEJORAS = 3;

// --- Ruleta del cofre ---------------------------------------------------------
//
// El cofre ya no suelta el resultado de golpe: lo SORTEA a la vista, en una
// rueda con las candidatas pintadas encima, y se para en la que ha tocado. Es
// la misma decisión de siempre —el cofre no cambia tu construcción, la
// engorda— pero enseñada en vez de anunciada: con la lista delante se ve QUÉ
// podía haber salido, que es lo que convierte un aviso en un premio.
//
// El resultado lo sigue decidiendo el RNG aquí abajo, ANTES de que la rueda dé
// una sola vuelta. La animación es una animación: la ruleta se coloca para caer
// donde ya se ha decidido, no al revés. Con eso, dos partidas con la misma
// semilla siguen dando el mismo cofre (criterio 10 del plan).
//
// OCHO CASILLAS porque ocho son los sectores del dibujo de Sergio
// (resources/menus/ruleta.png). Si el jugador lleva menos de ocho cosas
// mejorables, las candidatas se REPITEN hasta llenar la rueda: una rueda con
// huecos parece rota, y repetir es lo que hace cualquier ruleta de premios de
// verdad. Si lleva más de ocho, se enseñan ocho de ellas —siempre incluyendo la
// ganadora, claro—.
export const CASILLAS_RULETA = 8;

// Cuánto gira cada rueda. La segunda y la tercera paran más tarde que la
// primera para que el premio gordo se lea de una en una en vez de las tres a la
// vez, que es medio motivo para que un triple se sienta como un triple.
const GIRO_BASE = 1.5;
const GIRO_ESCALON = 0.55;
export function duracionGiro(i) { return GIRO_BASE + i * GIRO_ESCALON; }

// Ofertas preasignadas: se rellenan, no se construyen. Subir de nivel cincuenta
// veces por partida y por jugador no puede dejar basura por el camino.
function crearOferta() {
  return { clase: '', id: '', nombre: '', descripcion: '', nivelActual: 0, nuevo: false };
}

export const Progresion = {
  cola: [],              // jugadores esperando a elegir
  actual: null,          // el que está eligiendo ahora mismo
  origen: 'nivel',       // 'nivel' o 'cofre': solo cambia el titular del menú
  opciones: [],
  nOpciones: 0,
  seleccion: 0,
  // Evolución recién concedida, pendiente de que el jugador la vea. No hay cola:
  // el mundo se congela mientras el aviso está en pantalla, así que no puede
  // recogerse otro cofre mientras tanto.
  cofre: null,           // jugador al que le ha tocado, o null
  evolucion: { nombre: '', detalle: '' },
  // Lo que ha dado el último cofre, para poder enseñarlo. Preasignado: abrir un
  // cofre no puede dejar basura por el camino.
  mejoras: [],
  nMejoras: 0,
  // Reloj de la animación de las ruletas, en segundos desde que se abrió el
  // cofre. Vive aquí y no en ui/cofre.js porque la interfaz solo dibuja: lo
  // adelanta main.js en el paso de lógica, que es de paso lo que hace que la
  // animación vaya al mismo ritmo aunque el navegador pierda fotogramas.
  relojGiro: 0,
  giroTotal: 0,
  animando: 0,           // segundos que le quedan a la ruleta; 0 = se puede elegir
  _rng: null,
  _candidatas: [],       // buffer de trabajo, reutilizado

  iniciar(rng) {
    this._rng = rng;
    this.opciones = new Array(OPCIONES);
    for (let i = 0; i < OPCIONES; i++) this.opciones[i] = crearOferta();
    this.mejoras = new Array(MAX_MEJORAS);
    for (let i = 0; i < MAX_MEJORAS; i++) {
      // `casillas` se preasigna con el resto: la rueda se rellena en caliente,
      // al abrir el cofre, y ahí no se puede asignar memoria.
      const casillas = new Array(CASILLAS_RULETA);
      for (let k = 0; k < CASILLAS_RULETA; k++) casillas[k] = { clase: '', id: '' };
      this.mejoras[i] = { nombre: '', clase: '', id: '', nivel: 0, casillas, ganadora: 0 };
    }
    this.relojGiro = 0;
    this.giroTotal = 0;
    this.cola.length = 0;
    this.actual = null;
    this.origen = 'nivel';
    this.nOpciones = 0;
    this.cofre = null;
    this.nMejoras = 0;
    this.animando = 0;
    // El cursor de la carta señalada. NO era un fallo —`atender` lo pone a cero
    // cada vez que abre el menú, así que siempre se escribe antes de leerse—
    // pero se quedaba con el valor de la partida anterior, y `iniciar` tiene que
    // dejar esto en un estado conocido. Lo destapó la prueba de determinismo,
    // que compara el estado entero: mientras haya campos que arrastran valores
    // viejos, no se puede distinguir el residuo inofensivo del que sí importa.
    this.seleccion = 0;
  },

  get abierto() { return this.actual !== null; },

  // SUBIR DE NIVEL SE VE, no solo se oye.
  //
  // Hasta ahora era un sonido y un menú que aparecía de golpe, y entre los dos
  // no había nada: el instante en que llegas al umbral —que es el premio de los
  // últimos treinta segundos— no existía en pantalla. Un anillo que se abre desde
  // los pies y un puñado de chispas hacia arriba, en el sitio exacto donde está
  // el jugador, que es además lo que dice CUÁL de los cuatro ha subido antes de
  // que se abra ningún menú.
  //
  // Va antes del menú a propósito, aunque el menú lo tape casi enseguida: en
  // automático (autoNivel) no hay menú ninguno y esto es lo único que queda.
  _celebrarNivel(jugador) {
    VFX.anillo(jugador.x, jugador.y - 4, 44, COLOR_ANILLO_NIVEL, 2, 0.5);
    if (!this._rng || Particulas.saturado()) return;
    // Hacia ARRIBA y con gravedad casi nula: son chispas que suben, no una
    // explosión. Lo de abajo se lee como daño; lo que sube, como premio.
    Particulas.chorro(jugador.x, jugador.y - 10, 0, -1, 10, 55, 0.9, 0.55, 1.5,
                      COLOR_CHISPA, 0.12, this._rng);
  },

  // Un jugador ha subido de nivel. Con cooperativo pueden subir varios a la vez,
  // así que se encolan y se atienden de uno en uno: dos menús a la vez sobre la
  // misma pantalla no hay forma de leerlos.
  encolar(jugador) {
    this.cola.push(jugador);
  },

  // Reparte experiencia. En solitario (o si no se pasa el resto de la
  // partida) es la cuenta de siempre: sube ESE jugador y ya. En cooperativo,
  // la XP de cualquiera alimenta la barra del EQUIPO: al cruzar el umbral
  // sube el equipo entero de golpe, y cada jugador vivo encola su propia
  // elección —lo que se comparte es el ritmo, no con qué juega cada uno—.
  ganarXp(jugador, cantidad, jugadores) {
    // Plinio el Búho (datos/mascotas.js) sube la experiencia que entra. Se
    // aplica AQUÍ y no en quien reparte la gema, porque quien la reparte no
    // sabe de mascotas y hay tres sitios que dan experiencia.
    if (jugador.bonusXp > 0) cantidad *= (1 + jugador.bonusXp);

    if (!jugadores || jugadores.length <= 1) {
      jugador.xp += cantidad;
      while (jugador.xp >= jugador.xpNecesaria) {
        jugador.xp -= jugador.xpNecesaria;
        jugador.nivel++;
        jugador.xpNecesaria = xpNecesaria(jugador.nivel);
        this.encolar(jugador);
        GestorAudio.subidaNivel();
        this._celebrarNivel(jugador);
      }
      return;
    }

    for (let i = 0; i < jugadores.length; i++) jugadores[i].xp += cantidad;
    while (jugador.xp >= jugador.xpNecesaria) {
      const nivel = jugador.nivel + 1;
      const necesaria = xpNecesariaPara(nivel, jugadores.length);
      const resto = jugador.xp - jugador.xpNecesaria;
      for (let i = 0; i < jugadores.length; i++) {
        const j = jugadores[i];
        j.nivel = nivel;
        j.xp = resto;
        j.xpNecesaria = necesaria;
        if (!j.abatido) { this.encolar(j); this._celebrarNivel(j); }
      }
      GestorAudio.subidaNivel();
    }
  },

  // Se llama al sumarse o irse alguien (main.js, anyadirJugador/quitarJugador).
  // El progreso ya hecho NO se toca —ni nivel ni xp—, solo el umbral que falta
  // por llenar: pasar de solitario a cooperativo (o al revés) a media partida
  // ajusta el ritmo desde ese momento, no le quita a nadie lo que ya llevaba.
  // También iguala a quien se acaba de sumar con el resto del equipo: entra
  // ya al nivel común, sin cincuenta menús de "lo que te has perdido".
  resincronizarEquipo(jugadores) {
    if (!jugadores || jugadores.length === 0) return;
    const lider = jugadores[0];
    const necesaria = jugadores.length > 1
      ? xpNecesariaPara(lider.nivel, jugadores.length)
      : xpNecesaria(lider.nivel);
    for (let i = 0; i < jugadores.length; i++) {
      jugadores[i].nivel = lider.nivel;
      jugadores[i].xp = lider.xp;
      jugadores[i].xpNecesaria = necesaria;
    }
  },

  // ¿Puede este jugador delegar la elección? Solo con las ocho ranuras llenas.
  //
  // El límite es deliberado y es de Sergio: mientras queden ranuras, cada
  // elección decide con QUÉ juegas el resto de la partida y eso no se automatiza.
  // Llenas las ocho, lo único que queda por decidir es a cuál de las ocho le das
  // el punto, y eso son cincuenta menús más por partida para repartir puntos
  // entre cosas que ya llevas. Ahí sí molesta parar el juego.
  puedeAutomatizar(jugador) {
    if (!jugador.arsenal) return false;
    return jugador.arsenal.equipadas.length >= MAX_ARMAS &&
           Object.keys(jugador.pasivos).length >= MAX_PASIVOS;
  },

  // Se llama cada paso: si no hay nadie eligiendo y queda cola, abre el menú.
  atender(jugadores) {
    if (this.actual || this.cola.length === 0) return false;
    this.actual = this.cola.shift();
    this.origen = 'nivel';
    this.seleccion = 0;
    this._generar(this.actual, jugadores);

    // Automático: se aplica la primera opción y ni se abre el menú. La oferta se
    // genera igual —con sus mismas reglas y su mismo azar—, así que jugar en
    // automático no da ventaja ni la quita: solo no interrumpe.
    if (this.actual.autoNivel && this.puedeAutomatizar(this.actual)) {
      this.elegir(0);
      return false;
    }
    this.animando = DURACION_TIRADA;
    return true;
  },

  // Mientras gira no se puede tocar el menú: se llama cada paso desde
  // `main.js` en vez de desde la interfaz, que solo dibuja y no debe llevar
  // cuenta de nada. Devuelve si todavía está girando.
  tirando(dt) {
    if (this.animando > 0) this.animando = Math.max(0, this.animando - dt);
    return this.animando > 0;
  },

  rerollar(jugadores) {
    if (!this.actual || this.actual.rerolls <= 0) return false;
    this.actual.rerolls--;
    this.seleccion = 0;
    this._generar(this.actual, jugadores);
    this.animando = DURACION_TIRADA;
    return true;
  },

  elegir(indice) {
    if (!this.actual || indice < 0 || indice >= this.nOpciones) return;
    this._aplicar(this.actual, this.opciones[indice]);
    this.actual = null;
    this.origen = 'nivel';
  },

  // Aplica una candidata al jugador. Lo comparten la subida de nivel y el cofre:
  // si cada uno tuviera su copia, arreglar el ánfora en un sitio la dejaría rota
  // en el otro.
  _aplicar(j, o) {
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
  },

  // --- Cofres --------------------------------------------------------------
  get cofreAbierto() { return this.cofre !== null; },

  // Abre un cofre. Devuelve 'evolucion' o 'eleccion' según lo que haya salido.
  abrirCofre(jugador, jugadores, especial) {
    // 1. ¿Evolución? Se mira primero y, si sale, se lleva el cofre entero. Esta
    //    sí se concede sola: no tendría sentido ofrecer una evolución como una
    //    de tres opciones cuando llegar a ella ha costado ocho niveles de un
    //    arma, un pasivo concreto y matar a un élite.
    const evo = this._buscarEvolucion(jugador);
    if (evo) {
      // Se lee TODO antes de evolucionar. `evolucionar` reapunta `def` al arma
      // nueva, así que después de llamarlo el arma ya no sabe de dónde viene ni
      // qué pasivo le hizo falta, que es justo lo que hay que contar.
      const receta = evo.def.evolucion;
      const nombreBase = evo.def.nombre;
      jugador.arsenal.evolucionar(evo.id, receta.arma);
      this.cofre = jugador;
      this.evolucion.nombre = ARMAS[receta.arma].nombre;
      this.evolucion.detalle = `${nombreBase} + ${PASIVOS[receta.pasivo].nombre}`;
      return 'evolucion';
    }

    // 2. Si no, SUBIDAS DE NIVEL de lo que ya lleva, aplicadas solas. Nada de
    //    elegir y nada de armas nuevas: el cofre no cambia tu construcción, la
    //    engorda. Con qué juegas se decide subiendo de nivel; el tesoro solo
    //    premia el riesgo de haber ido a por un élite.
    //
    //    Uno de cada diez cofres sube TRES cosas en vez de una, y ya se sabe
    //    CUÁL es desde que cae al suelo: el especial tiene su propio dibujo (ver
    //    PROB_ESPECIAL en entidades/cofre.js). Antes se sorteaba aquí, al
    //    abrirlo, y eso era lo que tenía que cambiar para que los dos cofres
    //    puedan verse distintos — cuál te ha tocado ya no es una sorpresa al
    //    abrirlo, es una razón para cruzar la pantalla a por él.
    this.cofre = jugador;
    this.nMejoras = 0;
    const cuantas = especial ? 3 : 1;

    for (let i = 0; i < cuantas; i++) {
      const cand = this._mejorablesDe(jugador);
      if (cand.length === 0) break;
      const iGanadora = (this._rng() * cand.length) | 0;
      const elegida = cand[iGanadora];
      this._aplicar(jugador, elegida);
      const m = this.mejoras[this.nMejoras++];
      m.nombre = elegida.nombre;
      m.clase = elegida.clase;
      m.id = elegida.id;
      m.nivel = elegida.nivelActual + 1;
      this._llenarRuleta(m, cand, iGanadora);
    }

    // El reloj se pone a cero AQUÍ y no al dibujar: la rueda tiene que empezar a
    // girar en el mismo paso en que se abre el cofre. Y `giroTotal` se fija
    // ANTES del repliegue del vino de abajo, que no lleva ruleta: si se pusiera
    // después habría que acordarse de dejarlo a cero en ese caso.
    this.relojGiro = 0;
    this.giroTotal = this.nMejoras > 0 ? duracionGiro(this.nMejoras - 1) : 0;

    // Todo al máximo: se paga en vida, que nunca sobra. Sin ruleta —no hay nada
    // que sortear cuando no queda nada que subir—, así que la ventana sale con
    // su panel de siempre.
    if (this.nMejoras === 0) {
      jugador.vida = Math.min(jugador.vidaMaxima, jugador.vida + 30);
      const m = this.mejoras[this.nMejoras++];
      m.nombre = 'Vino de Emerita';
      m.clase = 'curacion';
      m.id = '';
      m.nivel = 0;
    }
    return 'mejoras';
  },

  // Reparte las candidatas por las ocho casillas de la rueda dejando la
  // ganadora en una casilla AL AZAR, que es lo que hace que la rueda no pare
  // siempre en el mismo sitio aunque el premio se repita.
  //
  // El reparto es cíclico desde un desplazamiento calculado hacia atrás: se
  // elige primero en qué casilla va a caer y luego se coloca la lista para que
  // ahí esté la ganadora. Al revés —repartir y buscar dónde ha quedado— habría
  // que tratar aparte el caso de más de ocho candidatas, donde alguna se queda
  // fuera de la rueda y podría quedarse fuera justo la que gana.
  _llenarRuleta(m, cand, iGanadora) {
    const n = cand.length;
    m.ganadora = (this._rng() * CASILLAS_RULETA) | 0;
    const desplazamiento = ((iGanadora - m.ganadora) % n + n) % n;
    for (let k = 0; k < CASILLAS_RULETA; k++) {
      const c = cand[(desplazamiento + k) % n];
      m.casillas[k].clase = c.clase;
      m.casillas[k].id = c.id;
    }
  },

  // Adelanta la animación de las ruletas. Devuelve si alguna sigue girando.
  girarCofre(dt) {
    if (this.relojGiro < this.giroTotal) {
      this.relojGiro = Math.min(this.giroTotal, this.relojGiro + dt);
    }
    return this.relojGiro < this.giroTotal;
  },

  // Al grano. La primera pulsación durante el giro no cierra la ventana: la
  // termina. Quien ya ha visto veinte cofres no tiene por qué esperar tres
  // segundos, y quien lo ve por primera vez no se lo salta sin querer al pulsar
  // para cerrar.
  saltarGiro() { this.relojGiro = this.giroTotal; },

  // Lo que YA LLEVA el jugador y todavía admite un nivel más. El cofre solo
  // reparte entre esto: ni armas nuevas, ni pasivos nuevos, ni evoluciones
  // sueltas.
  _mejorablesDe(jugador) {
    const cand = this._candidatas;
    cand.length = 0;

    const propias = jugador.arsenal.equipadas;
    for (let k = 0; k < propias.length; k++) {
      const a = propias[k];
      if (a.def.esEvolucion || a.nivel >= MAX_NIVEL) continue;
      cand.push({ clase: 'arma', id: a.id, nuevo: false, nivelActual: a.nivel,
                  nombre: a.def.nombre, descripcion: a.def.descripcion });
    }
    for (const id in jugador.pasivos) {
      const def = PASIVOS[id];
      const nivel = jugador.pasivos[id];
      if (!def || nivel >= def.maxNivel) continue;
      cand.push({ clase: 'pasivo', id, nuevo: false, nivelActual: nivel,
                  nombre: def.nombre, descripcion: def.descripcion });
    }
    return cand;
  },

  cerrarCofre() {
    this.cofre = null;
    this.nMejoras = 0;
    this.relojGiro = 0;
    this.giroTotal = 0;
  },

  // ¿Lo que hay en pantalla es una evolución o un puñado de mejoras? La pantalla
  // del cofre pinta una cosa u otra con esto.
  get cofreEsEvolucion() { return this.cofre !== null && this.nMejoras === 0; },

  // Primera arma del jugador que cumple los requisitos de la sección 9. Devuelve
  // el arma equipada (con su `def`), no la evolución.
  _buscarEvolucion(jugador) {
    const eq = jugador.arsenal.equipadas;
    for (let k = 0; k < eq.length; k++) {
      const a = eq[k];
      const evo = a.def.evolucion;
      if (!evo || !ARMAS[evo.arma]) continue;
      if (a.nivel < NIVEL_EVOLUCION) continue;
      if ((jugador.pasivos[evo.pasivo] || 0) < 1) continue;
      return a;
    }
    return null;
  },

  // --- Generación de ofertas ---------------------------------------------
  //
  // Reglas, por orden:
  //   - Con las ranuras de arma llenas, solo se ofrecen mejoras de lo que ya
  //     se lleva. Igual con los pasivos.
  //   - Un arma que lleve OTRO jugador no se ofrece. En cooperativo cada uno
  //     tiene un arsenal distinto, y eso es lo que les da papel propio.
  //   - Las EVOLUCIONES no entran nunca: solo se consiguen por cofre, y por eso
  //     tampoco se ofrece subirles el nivel una vez conseguidas.
  //   - Si no queda nada, curación.
  //
  // Devuelve el buffer de trabajo, que se reutiliza entre llamadas: quien lo
  // reciba tiene que consumirlo antes de volver a pedirlo.
  _candidatasPara(jugador, jugadores) {
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
      if (a.def.esEvolucion) continue;      // ya está en su techo
      if (a.nivel < MAX_NIVEL) {
        cand.push({ clase: 'arma', id: a.id, nuevo: false, nivelActual: a.nivel,
                    nombre: a.def.nombre, descripcion: a.def.descripcion });
      }
    }

    // Armas nuevas, si queda ranura y nadie más las lleva
    if (propias.length < MAX_ARMAS) {
      for (const id in ARMAS) {
        if (ocupadas.has(id)) continue;
        if (ARMAS[id].esEvolucion) continue;
        if (!comportamientoImplementado(ARMAS[id].comportamiento)) continue;
        cand.push({ clase: 'arma', id, nuevo: true, nivelActual: 0,
                    nombre: ARMAS[id].nombre, descripcion: ARMAS[id].descripcion });
      }
    }

    // Pasivos: mejoras de los que lleva, y nuevos si queda ranura.
    //
    // ÚNICOS TAMBIÉN, igual que las armas: un objeto que lleve otro jugador no
    // se ofrece. Faltaba, y era una incoherencia rara de explicar — dos
    // jugadores no podían llevar el mismo Gladius pero sí las mismas Sandalias,
    // con lo que en cooperativo los cuatro acababan con el mismo juego de
    // pasivos y la única diferencia entre ellos era el arma.
    const pasivosOcupados = new Set();
    for (let i = 0; i < jugadores.length; i++) {
      if (jugadores[i] === jugador) continue;
      for (const id in jugadores[i].pasivos) pasivosOcupados.add(id);
    }

    const nPasivos = Object.keys(jugador.pasivos).length;
    for (const id in PASIVOS) {
      const def = PASIVOS[id];
      const nivel = jugador.pasivos[id] || 0;
      if (nivel === 0 && pasivosOcupados.has(id)) continue;
      if (nivel === 0 && nPasivos >= MAX_PASIVOS) continue;
      if (nivel >= def.maxNivel) continue;
      cand.push({ clase: 'pasivo', id, nuevo: nivel === 0, nivelActual: nivel,
                  nombre: def.nombre, descripcion: def.descripcion });
    }
    return cand;
  },

  // Rellena las tres cartas del menú de subida de nivel.
  _generar(jugador, jugadores) {
    const cand = this._candidatasPara(jugador, jugadores);

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
