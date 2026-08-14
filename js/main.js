import {
  ANCHO_LOGICO, ALTO_LOGICO, ANCHO_FISICO, ALTO_FISICO, ANCHO_UI, ALTO_UI,
  ESCALA_ARTE, TILE, DT
} from './core/constantes.js';
import { Bucle } from './core/bucle.js';
import { Entrada } from './core/entrada.js';
import { Camara } from './core/camara.js';
import { Recursos } from './core/recursos.js';
import { MetaProgreso } from './core/metaProgreso.js';
import { crearRng, hash2 } from './core/rng.js';
import { Jugador } from './entidades/jugador.js';
import { Enemigos, prepararVariantes } from './entidades/enemigo.js';
import { Proyectiles } from './entidades/proyectil.js';
import { Armas } from './sistemas/armas.js';
import { Particulas } from './sistemas/particulas.js';
import { VFX } from './sistemas/vfx.js';
import { GestorAudio } from './sistemas/audio.js';
import {
  separacion, contactoJugadores, impactosProyectiles, separarJugadores,
  colisionarObstaculos, colisionarAtaudes, ajustes
} from './sistemas/colisiones.js';
import { Obstaculos } from './sistemas/obstaculos.js';
import { Recogibles } from './entidades/recogible.js';
import { Cofres, COFRE, LLAMARADA, IMAN, COMIDA, RELOJ, MONEDAS } from './entidades/cofre.js';
import { Disparos } from './entidades/disparo.js';
import { Zonas } from './entidades/zonaDanyo.js';
import { Progresion } from './sistemas/progresion.js';
import { dibujarMenuNivel } from './ui/menuNivel.js';
import { dibujarCofre } from './ui/cofre.js';
import { dibujarFicha } from './ui/ficha.js';
import { dibujarMapa } from './ui/mapa.js';
import { dibujarTienda } from './ui/tienda.js';
import { dibujarFinal, dibujarCartelFinal } from './ui/final.js';
import { dibujarPaneles, dibujarReloj, dibujarBarraJefe } from './ui/hud.js';
import { Pantallas, ocupantePersonaje, dibujarDespedida } from './ui/pantallas.js';
import { Capa } from './ui/capa.js';
import { Tema, olvidarDegradados } from './ui/tema.js';
import {
  dibujarDepuracion, dibujarPausa
} from './ui/depuracion.js';
import { Director, aparecerTanda } from './sistemas/director.js';
import { Mascotas } from './sistemas/mascotas.js';
import { MASCOTAS, ORDEN_MASCOTAS } from './datos/mascotas.js';
import { Jefes } from './sistemas/jefes.js';
import { NIVEL } from './datos/niveles/merida.js';
import { PERSONAJES, ORDEN_PERSONAJES } from './datos/personajes.js';
import { ARMAS } from './datos/armas.js';
import { POTENCIADORES } from './datos/potenciadores.js';


// Capacidad del pool. El objetivo del plan son 800 entidades simultáneas; el
// margen extra absorbe los picos de una oleada que entra mientras la anterior
// aún no ha salido por culling.
const CAPACIDAD_ENEMIGOS = 1000;

// Proyectiles: la Ballista a nivel 8 con la Clepsidra dispara mucho, y varias
// armas de proyectil conviven. 400 es holgado y son objetos diminutos.
const CAPACIDAD_PROYECTILES = 400;
// Partículas: 7 por muerte más chispas de impacto. Con la horda del minuto 16
// muriendo a ritmo alto esto se llena, y llenarse es aceptable: se pierde una
// chispa, no un enemigo.
const CAPACIDAD_PARTICULAS = 900;
const CAPACIDAD_NUMEROS = 160;
// Gemas: con la fusión por encima de 150 no puede desbordarse, pero se deja
// margen para el pico entre que caen y se fusionan.
const CAPACIDAD_GEMAS = 600;
// Cofres. En veinte minutos caen cuatro mantícoras y nueve serpientes doradas:
// trece en total, y un cofre no caduca ni se recicla por lejanía.
//
// Dieciséis y no trece: el techo tiene que estar por encima del peor caso, que
// es el jugador que mata élites y no va a por ninguno de sus cofres. Medido con
// la curva entera y un jugador quieto, el pico fueron diez cofres a la vez.
const CAPACIDAD_COFRES = 16;
// Disparos enemigos. Con las medusas del minuto 8 y una mantícora escupiendo
// abanicos de tres, rara vez pasan de veinte en el aire; 120 es holgado y son
// objetos diminutos.
const CAPACIDAD_DISPAROS = 120;
// Zonas: charcos, trampas, auras, ondas y explosiones comparten pool.
const CAPACIDAD_ZONAS = 220;

const SEMILLA = 0xE3E21A;

// --- Aparición de prueba en bruto (teclas 1-4) ------------------------------
// Esto NO es la curva del juego: es un martillo para meter N enemigos de golpe y
// ver si el motor aguanta. Sirve para medir fps y poco más — en una partida no
// aparecen 500 serpientes a la vez, así que no dice nada sobre el ritmo.
//
// Para juzgar el daño, la experiencia y el movimiento contra la presión real
// está el DIRECTOR, que va soltando la curva de veinte minutos de
// datos/niveles/merida.js y corre siempre. Las dos cosas conviven porque
// responden preguntas distintas: los atajos preguntan si el motor aguanta, el
// director pregunta si el juego está bien calibrado.
//
// Hay DOS mezclas porque una sola mentía sobre el juego. Metiendo todo el
// bestiario desde el segundo cero aparecían arpías, que a 92 px/s son más
// rápidas que el jugador (85) y hacen imposible huir. Eso es correcto en el
// plan —el rol "rápido" existe justo para eso— pero la arpía no entra hasta el
// minuto 4, cuando ya hay armas con las que responder.
//
// Minutos 0-4: todos MÁS LENTOS que el jugador. Huir funciona, que es la lectura
// que hay que poder validar.
const MEZCLA_TEMPRANA = [
  'serpiente', 'serpiente', 'serpiente', 'serpiente', 'serpiente',   // 68
  'gargola', 'gargola', 'gargola',                                   // 52
  'legionario', 'legionario',                                        // 38
  'gladiador'                                                        // 46
];
// A partir del minuto 8: con arpías, tanques y todo lo demás.
const MEZCLA_TARDIA = [
  'serpiente', 'serpiente', 'serpiente',
  'gargola', 'gargola',
  'legionario', 'gladiador', 'gladiador',
  'arpia', 'arpia', 'medusa',
  'ciclope', 'minotauro'
];
// La geometría de aparición (perímetro, dispersión y los cinco patrones) vive en
// sistemas/director.js y la comparten los atajos y la curva de verdad: si la
// aparición de prueba y la de la partida usaran códigos distintos, probar una no
// diría nada de la otra.

const lienzo = document.getElementById('juego');
const ctx = lienzo.getContext('2d', { alpha: false });
lienzo.width = ANCHO_FISICO;
lienzo.height = ALTO_FISICO;

// La interfaz vive en su propio lienzo, encima y a resolución de pantalla. El
// motivo está explicado en ui/capa.js: el ampliado por enteros que mantiene
// crujiente el pixel art es justo lo que dejaba el texto escalonado.
Capa.iniciar(document.getElementById('interfaz'));

// Cooperativo local hasta 4. El motor no sabe cuántos hay: recorre el array.
const MAX_JUGADORES = 4;

const entrada = new Entrada(lienzo, MAX_JUGADORES);
const camara = new Camara();
const rng = crearRng(SEMILLA);

// Array de jugadores en juego, y su arsenal en paralelo por índice. Cada uno
// tiene sus armas: en cooperativo las armas no se comparten, y en la Fase 4 el
// sorteo de subida de nivel además impedirá que dos lleven la misma.
const jugadores = [];
const arsenales = [];

let enemigos = null;
let proyectiles = null;
let recogibles = null;
let cofres = null;
let disparos = null;
let zonas = null;
let bucle = null;

// Contexto que reciben los comportamientos de arma. Se construye UNA vez y se
// reapunta al jugador que toca antes de cada llamada: crear un objeto literal
// por jugador y paso de lógica sería asignar memoria en caliente.
const ctxArmas = { jugador: null, enemigos: null, proyectiles: null, zonas: null, rng: null };

// --- Estado de pantalla ------------------------------------------------------
// El juego ya no arranca dentro de la partida: pasa por el título y por la
// selección de personaje. Son tres estados excluyentes y el reparto es tajante
// —`actualizar` y `dibujar` salen por otra rama en cuanto no estamos jugando—
// porque la mitad del bucle da por hecho que existe `jugadores[0]`, y en el
// título todavía no existe nadie.
const PANTALLA_TITULO = 0;
const PANTALLA_SELECCION = 1;
const PANTALLA_JUEGO = 2;
const PANTALLA_TIENDA = 3;
// Elegir mascota, DESPUÉS de elegir personaje. Solo se pasa por aquí si hay
// alguna comprada: sin ninguna no hay nada que elegir y sería una pantalla que
// solo sirve para pulsar otra vez.
const PANTALLA_MASCOTAS = 4;
const PANTALLA_CONFIG = 5;
// Sin valor de arranque: lo pone `irA` al final de este bloque, porque el
// estado de pantalla no es solo esta variable — arrastra la clase del body, y
// dejarlos puestos por separado es tener dos verdades que se desincronizan.
// Pasó: el título salía con la chuleta de atajos de depuración encima.
let pantalla;

// Un hueco por control: null si ese jugador no se ha sumado, y si no
// `{ personaje, listo }`. El índice ES el del control, así que el mando 3
// maneja siempre el puesto 3 aunque el 2 esté vacío.
const puestos = new Array(4).fill(null);

// Tienda. TRES SECCIONES —potenciadores, mascotas y jugadores— con izquierda y
// derecha para cambiar y arriba/abajo para moverse dentro. Ver ui/tienda.js.
//
// Una sola tienda con secciones y no tres entradas distintas en el menú: se
// pagan con los mismos denarios y se miran en el mismo momento —antes de
// jugar—, así que separarlas obligaría a salir de una para ver cuánto queda
// para lo de la otra.
const ID_POTENCIADORES = Object.keys(POTENCIADORES);
const PESTANYA_POTENCIADORES = 0;
const PESTANYA_MASCOTAS = 1;
const PESTANYA_PERSONAJES = 2;
const N_PESTANYAS = 3;
let pestanyaTienda = PESTANYA_POTENCIADORES;
let cursorTienda = 0;

// --- Menú principal ---------------------------------------------------------
// Sustituye al "pulsa cualquier tecla" del título.
const MENU = [
  { id: 'jugar',  texto: 'JUGAR' },
  { id: 'tienda', texto: 'TIENDA' },
  { id: 'config', texto: 'CONFIGURACIÓN' },
  { id: 'salir',  texto: 'SALIR' }
];
let cursorMenu = 0;

// --- Elección de mascota ----------------------------------------------------
// Un id por jugador, en el mismo orden que `puestos`. Cadena vacía = ninguna.
const mascotasElegidas = new Array(4).fill('');
let cursorMascota = 0;
// Índice del jugador al que le toca elegir. Se recorren en orden y cada uno
// elige la suya; DOS NO PUEDEN LLEVAR LA MISMA, así que las ya cogidas se
// saltan al mover el cursor.
let turnoMascota = 0;

// --- Configuración ----------------------------------------------------------
let cursorConfig = 0;
// Ventana de confirmación de "empezar de cero". Es un estado aparte y no un
// flanco: borrar el progreso de todas las partidas jugadas no puede depender de
// una tecla mal pulsada.
let confirmarBorrado = false;

// Cambiar de pantalla en un solo sitio. Hay dos cosas que van fuera del lienzo
// y que hay que mover con el estado: la chuleta de atajos del pie, que en las
// pantallas ilustradas sobra, y nada más — si algún día hay una tercera, va
// aquí y no repartida por el bucle.
function irA(nueva) {
  pantalla = nueva;
  refrescarChuleta();
}

// La chuleta de atajos vive FUERA del lienzo (es texto del documento), así que
// ningún velo la tapa: se quita o se pone con una clase del body y punto.
//
// Sobra en todo lo que no sea la partida en marcha, y el RESUMEN FINAL es una de
// esas cosas aunque el estado siga siendo PANTALLA_JUEGO: ocupa la pantalla
// entera y la chuleta se le colaba por debajo del pie.
function refrescarChuleta() {
  const enMenu = pantalla !== PANTALLA_JUEGO || resumenFinal ||
                 finalMostrado === 'victoria';
  document.body.classList.toggle('enMenu', enMenu);
}

let pausado = false;
// Índice del jugador cuya ficha está abierta, o -1. Se abre con Select en el
// mando de ese jugador o con Tab en el teclado, y congela el mundo: es una
// pantalla para mirar números con calma, y mirarlos mientras te rodean no es
// mirarlos con calma.
let fichaAbierta = -1;
let verDepuracion = false;
let mapaAbierto = false;
// Flanco de "todos caídos": evita reescribir localStorage cada frame mientras
// dura el cartel de derrota, y solo guarda una vez por caída de verdad.
let derrotaGuardada = false;
// Pantalla final (Fase 7): null mientras se juega, o 'victoria'/'derrota' una
// vez que termina. `statsFinal` es la foto fija de ese instante — ver
// capturarStats(). El primero de los dos flancos que salta manda: si el
// equipo cae DESPUÉS de que el reloj ya haya llegado al final, sigue siendo
// una victoria, no una derrota de última hora.
let finalMostrado = null;
let statsFinal = null;
// La derrota va en DOS TIEMPOS y el resumen es el segundo.
//
// Antes salía el panel entero en el mismo frame en que caía el último jugador,
// y eso tapaba justo lo que hay que ver: el ataúd, dónde ha caído y con qué
// encima. Jugando solo era peor todavía —el ataúd propio no llegaba a verse
// nunca—. Ahora primero se queda el mundo a la vista con un cartel arriba, y el
// resumen se pide pulsando.
//
// `resumenFinal` es ese segundo tiempo. La victoria no lo usa: ahí no hay
// ataúd que enseñar ni sitio que mirar, así que su panel sale directo.
let resumenFinal = false;
// Segundos que lleva el resumen en pantalla. Del resumen se sale al menú con
// cualquier tecla, y sin esta espera el mismo golpe de tecla que lo abre lo
// cerraría: entre la pulsación que pide el resumen y la siguiente vuelta del
// bucle no hay ni 17 ms, y quien pulsa dos veces seguidas —que es lo que hace
// todo el mundo al morir— no llegaría a verlo.
let relojResumen = 0;
const ESPERA_RESUMEN = 0.6;
// Denarios que había ANTES de empezar. El resumen enseña lo ganado en la
// partida, y eso es una resta: MetaProgreso.denarios es el montón acumulado de
// todas las partidas jugadas.
let denariosAlEmpezar = 0;

// La pantalla de arranque. Va AQUÍ y no junto a `irA` porque `refrescarChuleta`
// consulta `resumenFinal` y `finalMostrado`, que se declaran unas líneas más
// arriba con `let`: llamarla antes de esas declaraciones revienta con un error
// de zona muerta temporal y el juego no arranca.
irA(PANTALLA_TITULO);
let zoomPantalla = 1;
let tilesDibujados = 0;
let indicePersonaje = 0;

// --- Perfilado por subsistema ------------------------------------------------
// El tiempo que mide el bucle es el de EMITIR órdenes de dibujo; el canvas 2D
// las encola y rasteriza después, así que puede ir sobrado de JavaScript y aun
// así perder frames. Por eso el overlay compara el tiempo de frame REAL (el que
// sale de los intervalos de requestAnimationFrame) con lo que suman lógica y
// render: la diferencia es lo que se lleva el navegador componiendo.
//
// Los interruptores permiten apagar un sistema y ver el efecto en el acto, que
// es la única forma honesta de saber qué cuesta en una máquina concreta.
const perfil = { suelo: 0, entidades: 0, efectos: 0, texto: 0, interfaz: 0 };
const activo = { suelo: true, particulas: true, numeros: true, efectos: true, destello: true };

// --- Alta y baja de jugadores ------------------------------------------------
// Un jugador entra al enchufar un mando, o a mano con J, para poder probar el
// cooperativo sin cuatro mandos encima de la mesa.
// `idPersonaje` lo trae la pantalla de selección. Sin él —al sumarse a mitad de
// partida con J o al enchufar un mando— se reparte por orden, que es lo que se
// hacía antes de que hubiera pantalla donde elegir.
function anyadirJugador(idPersonaje, idMascota) {
  if (jugadores.length >= MAX_JUGADORES) return null;
  const i = jugadores.length;
  const j = new Jugador(idPersonaje || ORDEN_PERSONAJES[i % ORDEN_PERSONAJES.length], idMascota || '');

  // En abanico alrededor del primero, para que no nazcan uno dentro de otro.
  const ang = (i / MAX_JUGADORES) * Math.PI * 2;
  const cx = i === 0 ? ANCHO_LOGICO / 2 : jugadores[0].x;
  const cy = i === 0 ? ALTO_LOGICO / 2 : jugadores[0].y;
  j.x = j.xPrev = j.xVista = cx + (i === 0 ? 0 : Math.cos(ang) * 26);
  j.y = j.yPrev = j.yVista = cy + (i === 0 ? 0 : Math.sin(ang) * 26);
  jugadores.push(j);

  // Arsenal propio, con el arma que le toca a su personaje. Eso ya garantiza
  // que los cuatro arranquen distintos; el sorteo de subida de nivel se encarga
  // de que sigan sin repetirse.
  const arsenal = new Armas(rng);
  arsenal.equipar(j.def.arma);
  arsenales.push(arsenal);
  j.arsenal = arsenal;
  // Con dos o más, la XP pasa a ser de equipo (ver Progresion.ganarXp): quien
  // se suma entra ya al nivel común, y el umbral de todos se recalcula para
  // el nuevo número de jugadores.
  Progresion.resincronizarEquipo(jugadores);
  return j;
}

function quitarJugador() {
  if (jugadores.length <= 1) return;   // siempre queda al menos uno
  jugadores.pop();
  arsenales.pop();
  Progresion.resincronizarEquipo(jugadores);
}

// Cada mando que se enchufa suma un jugador, hasta cuatro. Solo con la partida
// en marcha: en la pantalla de selección enchufar un mando no mete a nadie, se
// entra pulsando A, que es donde además se elige personaje.
addEventListener('gamepadconnected', () => {
  if (pantalla !== PANTALLA_JUEGO) return;
  if (entrada.mandosConectados >= jugadores.length) anyadirJugador();
});

// Onda expansiva de un proyectil que estalla. Referencia creada UNA vez y
// pasada a los sistemas: construir la closure por frame sería asignar en
// caliente, y esto puede llamarse muchas veces por paso con un bombardeo.
function estallar(p) {
  zonas.crear({
    x: p.x, y: p.y,
    radio: p.radioExplosion, radioIni: p.radioExplosion * 0.15,
    duracion: 0.32, danyo: p.danyoExplosion, empuje: p.empuje * 1.6,
    modo: 'onda', color: p.color, relleno: 0.3
  });
}

// --- Escalado al viewport ----------------------------------------------------
//
// La rejilla de píxeles se cuenta EN PÍXELES DEL MONITOR, no en unidades CSS, y
// se cuenta por PÍXEL DE ARTE, no por píxel del lienzo. Ahí estaba el fallo de
// los bordes en pantalla completa.
//
// Lo que había redondeaba el zoom a un entero sobre unidades CSS. Pero en
// Windows una unidad CSS no es un píxel: con el escalado del sistema al 125%,
// un monitor 4K son 3072x1728 unidades CSS, y ahí `floor(3072/1920)` da 1. El
// lienzo se quedaba en 1920x1080 y sobraban 576 píxeles de marco a cada lado y
// 324 arriba y abajo — que es justo lo que se veía. Y encima la rejilla tampoco
// salía entera: cada píxel del lienzo caía sobre 1,25 píxeles del monitor.
//
// Contando en píxeles de verdad, en ese mismo monitor caben 8 píxeles por cada
// píxel de arte (3840/480), el zoom sale 1,6 en CSS y la pantalla se llena
// entera con la rejilla clavada: dos píxeles físicos por píxel del lienzo. Que
// el número en CSS tenga decimales da igual; el navegador lo devuelve a los
// píxeles enteros de los que salió.
//
// POR PÍXEL DE ARTE y no por píxel del lienzo porque un píxel de arte ya son
// ESCALA_ARTE del lienzo: exigir que el lienzo caiga entero es cuatro veces más
// estricto de lo que la vista necesita, y esa exigencia de más se paga en marco.
//
// Y UN REPLIEGUE, porque hay ventanas en las que el escalón entero desperdicia
// demasiado —una ventana de navegador con el zoom a 150%, por ejemplo—. Si
// encajar en la rejilla cuesta más del 15% del tamaño, se estira hasta llenar y
// se acepta la rejilla irregular: entre un juego pequeño y perfecto y uno
// grande con los píxeles un pelo desiguales, a esa distancia gana el grande.
const APROVECHAMIENTO_MINIMO = 0.85;

function redimensionar() {
  const densidad = window.devicePixelRatio || 1;

  // Zoom que llenaría la ventana justo, sin mirar rejillas.
  const exacto = Math.min(innerWidth / ANCHO_FISICO, innerHeight / ALTO_FISICO);

  // El mismo, bajado al escalón donde cada píxel de arte ocupa un número
  // entero de píxeles del monitor.
  const porArte = exacto * ESCALA_ARTE * densidad;
  const encajado = Math.max(1, Math.floor(porArte)) / (ESCALA_ARTE * densidad);

  const factor = (encajado / exacto) >= APROVECHAMIENTO_MINIMO ? encajado : exacto;
  zoomPantalla = factor;
  lienzo.style.width  = (ANCHO_FISICO * factor) + 'px';
  lienzo.style.height = (ALTO_FISICO  * factor) + 'px';
  // La capa de interfaz ocupa el mismo rectángulo en CSS, pero por debajo lleva
  // tantos píxeles como dé la pantalla.
  Capa.redimensionar(factor);
  // Los degradados del tema guardan coordenadas absolutas y se cachean; tras un
  // cambio de escala habría que repintarlos igual, pero más vale tirarlos que
  // arrastrar una banda mal colocada.
  olvidarDegradados();
}
addEventListener('resize', redimensionar);

// Cambio de densidad de pantalla: pasa al arrastrar la ventana de un monitor a
// otro, o al hacer zoom en el navegador. Sin esto, la interfaz se queda con la
// resolución del monitor anterior y se ve blanda. La consulta hay que rehacerla
// cada vez porque solo dispara UNA vez por umbral cruzado.
function vigilarDensidad() {
  matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
    .addEventListener('change', () => { redimensionar(); vigilarDensidad(); },
                      { once: true });
}

// --- Pantalla completa -------------------------------------------------------
// Vía la API del navegador y no el F11 nativo: F11 lo intercepta el propio
// navegador antes de que la página se entere, así que no hay forma de
// ofrecerlo como un botón del juego ni de saber si está activo. El resultado
// visual es el mismo (y el mismo margen si la pantalla no encaja a zoom
// entero exacto), pero así queda un control real dentro del juego.
const botonPantallaCompleta = document.getElementById('pantallaCompleta');
// Se saca a una funcion porque ahora lo piden dos sitios: este boton y la
// pantalla de configuracion.
function alternarPantallaCompleta() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
}
botonPantallaCompleta.addEventListener('click', alternarPantallaCompleta);
addEventListener('fullscreenchange', () => {
  botonPantallaCompleta.textContent = document.fullscreenElement ? '⤢' : '⛶';
  botonPantallaCompleta.title = document.fullscreenElement
    ? 'Salir de pantalla completa' : 'Pantalla completa';
  // El cambio de tamaño real del viewport llega con su propio evento resize,
  // pero en algunos navegadores fullscreenchange se dispara un instante antes
  // de que innerWidth/innerHeight se actualicen. Redimensionar aquí también
  // es barato y evita un frame con el zoom viejo.
  redimensionar();
});

// --- Consumibles del suelo ---------------------------------------------------
// Cuánto cura la comida y cuánto dura el lanzallamas prestado.
const CURA_COMIDA = 20;
const DURACION_LLAMARADA = 8;
// El Reloj de Emerita para a la horda entera. Seis segundos son los que pidió
// Sergio y son muchos: dan para cruzar un cerco andando, rematar a un élite o
// levantar a quien se ha quedado en el suelo. Por eso es el consumible más raro
// de los cinco (ver tipoConsumible en entidades/cofre.js).
const PARALISIS_RELOJ = 6;
// Las monedas se cobran FUERA de la partida: van al progreso META y siguen ahí
// mañana. Es el único consumible que no cambia nada de lo que está pasando.
const DENARIOS_MONEDAS = 10;
// Lo que da la tecla D en la tienda. Atajo de prueba: ver entradaTienda.
const DENARIOS_PRUEBA = 1000;
const CADENCIA_LLAMARADA = 0.16;
const DANYO_LLAMARADA = 26;

// Efecto INSTANTÁNEO al recogerlos: no se eligen, no ocupan ranura y no abren
// ninguna pantalla. Lo único que deciden es si merece la pena desviarse a por
// ellos ahora, y esa decisión se toma corriendo.
function usarConsumible(jugador, tipo) {
  if (tipo === IMAN) {
    // Todas las gemas del mapa vuelan hacia quien lo recoge. Con el campo de
    // gemas que deja una partida avanzada, esto son varios niveles de golpe.
    recogibles.atraerTodas(jugador);
    VFX.congelar(0.05);
    return;
  }

  if (tipo === COMIDA) {
    jugador.vida = Math.min(jugador.vidaMaxima, jugador.vida + CURA_COMIDA);
    return;
  }

  if (tipo === RELOJ) {
    // Se para la horda ENTERA, esté donde esté: no es un área alrededor de quien
    // lo recoge. Un radio convertiría el objeto en "colócate bien antes de
    // cogerlo", y lo que tiene que ser es el botón de pánico que te saca del
    // peor momento de la partida.
    enemigos.paralizarTodos(PARALISIS_RELOJ);
    VFX.helar(PARALISIS_RELOJ);
    GestorAudio.abrirCofre();
    return;
  }

  if (tipo === MONEDAS) {
    MetaProgreso.ganar(DENARIOS_MONEDAS);
    GestorAudio.abrirCofre();
    return;
  }

  // LLAMARADA: no es un efecto y ya, es un ARMA PRESTADA durante ocho segundos.
  // Mientras dura, el jugador escupe fuego hacia donde mira, y como el fuego
  // sale en la dirección en que se avanza, apuntarlo es moverse. Esos ocho
  // segundos cambian cómo juegas: se pasa de esquivar a barrer.
  jugador.llamarada = DURACION_LLAMARADA;
  VFX.sacudir(2.5);
}

// Un chorro de fuego por delante del jugador mientras le dure la llamarada. Se
// resuelve como zonas cortas encadenadas, que es lo que ya sabe hacer daño en
// área: tres por disparo, cada vez más anchas, y una cadencia rápida para que se
// lea como un chorro continuo y no como tres bombas.
function actualizarLlamarada(dt) {
  for (let i = 0; i < jugadores.length; i++) {
    const j = jugadores[i];
    if (j.llamarada <= 0) continue;
    j.llamarada -= dt;
    j.relojLlamarada -= dt;
    if (j.relojLlamarada > 0) continue;
    j.relojLlamarada = CADENCIA_LLAMARADA;

    // Dirección: hacia donde se mueve; si está parado, hacia donde mira. Igual
    // que el arco de melé, para que las dos cosas se apunten igual.
    let ax = j.x - j.xPrev;
    let ay = j.y - j.yPrev;
    if (Math.abs(ax) < 0.0001 && Math.abs(ay) < 0.0001) {
      ax = j.mirandoDerecha ? 1 : -1;
      ay = 0;
    }
    const m = Math.hypot(ax, ay) || 1;
    ax /= m; ay /= m;

    for (let k = 0; k < 3; k++) {
      const avance = 22 + k * 26;
      zonas.crear({
        x: j.x + ax * avance,
        y: j.y - 4 + ay * avance,
        radio: 20 + k * 6, radioIni: 6,
        duracion: 0.3,
        danyo: DANYO_LLAMARADA, empuje: 120,
        modo: 'onda', color: '#ff7a2a', relleno: 0.4
      });
    }
  }
}

// Aparecen alrededor de la CÁMARA, no de un jugador concreto: con el grupo
// repartido por la pantalla, anclarlo a uno dejaría el borde opuesto vacío.
function tanda(cantidad, mezcla) {
  aparecerTanda(enemigos, camara, cantidad, mezcla, rng);
}

// --- Título y selección de personaje -----------------------------------------

// MENÚ PRINCIPAL. Sustituye al "pulsa cualquier tecla" de antes: ahora hay
// cuatro sitios a los que ir y hay que poder elegir.
//
// Se mueve con arriba/abajo o la cruceta, y también con el stick, porque el
// menú es lo primero que toca alguien que acaba de enchufar un mando.
function entradaTitulo() {
  const c = entrada.controles[0];
  const eje = c ? c.flancoEje(false) : 0;      // vertical
  const n = MENU.length;

  if (entrada.consumirFlanco('ArrowDown') || (c && c.consumirBoton(13)) || eje > 0) {
    cursorMenu = (cursorMenu + 1) % n;
  }
  if (entrada.consumirFlanco('ArrowUp') || (c && c.consumirBoton(12)) || eje < 0) {
    cursorMenu = (cursorMenu + n - 1) % n;
  }

  // Atajo que ya existía y se conserva: T entra directo a la tienda.
  if (entrada.consumirFlanco('KeyT')) { pestanyaTienda = PESTANYA_POTENCIADORES; cursorTienda = 0; irA(PANTALLA_TIENDA); return; }

  const acepta = entrada.consumirFlanco('Enter') || entrada.consumirFlanco('Space') ||
                 (c && c.consumirBoton(0));
  if (!acepta) return;

  switch (MENU[cursorMenu].id) {
    case 'jugar':
      puestos.fill(null);
      puestos[0] = { personaje: primeroDesbloqueado(), listo: false };
      irA(PANTALLA_SELECCION);
      break;
    case 'tienda':
      pestanyaTienda = PESTANYA_POTENCIADORES;
      cursorTienda = 0;
      irA(PANTALLA_TIENDA);
      break;
    case 'config':
      cursorConfig = 0;
      confirmarBorrado = false;
      irA(PANTALLA_CONFIG);
      break;
    case 'salir':
      salirDelJuego();
      break;
  }
}

// SALIR de un juego que corre en una pestaña.
//
// `window.close()` solo funciona en ventanas que ha abierto un script, y esta
// la ha abierto una persona escribiendo una dirección, así que el navegador lo
// ignora en silencio. Se intenta igualmente —si alguien lanza el juego desde un
// acceso directo en modo aplicación, sí cierra— y si no, se deja la pantalla
// diciendo que ya se puede cerrar la pestaña. Fingir que el botón hace algo que
// no puede hacer sería peor que decirlo.
let despedida = false;
function salirDelJuego() {
  MetaProgreso.guardar();
  GestorAudio.pararMusica();
  despedida = true;
  window.close();
}

// Primer personaje que se pueda usar. Hoy los cuatro están desbloqueados (ver
// `coste` en datos/personajes.js), pero si alguno se pone de pago el menú no
// puede arrancar con el cursor encima de uno que no es tuyo.
function primeroDesbloqueado() {
  for (let p = 0; p < ORDEN_PERSONAJES.length; p++) {
    if (MetaProgreso.heroeDesbloqueado(ORDEN_PERSONAJES[p])) return p;
  }
  return 0;
}

// --- Elección de mascota ------------------------------------------------------
// Se pasa por aquí después de elegir personaje y solo si hay alguna comprada.
// Cada jugador elige la suya por turnos, y no se puede repetir: una mascota que
// ya lleva otro se salta al mover el cursor.
function entradaMascotas() {
  const c = entrada.controles[turnoMascota] || entrada.controles[0];
  // El teclado lleva al jugador 1 SIEMPRE, y además a cualquiera que no tenga
  // mando enchufado. Aquí se puede y en la selección de personaje no, porque
  // esto va POR TURNOS: solo hay un jugador eligiendo a la vez, así que el
  // teclado no puede estar moviendo dos cursores.
  //
  // Sin esto, un segundo jugador añadido con J —que es como se prueba el
  // cooperativo sin cuatro mandos— no podía elegir mascota y la pantalla se
  // quedaba muerta, igual que pasaba con la de personajes antes de la tecla H.
  const c0 = entrada.controles[0];
  const teclado = turnoMascota === 0 || !(c && c.conectado);
  const disponibles = mascotasDisponibles();
  const n = disponibles.length;

  if ((teclado && entrada.consumirFlanco('Escape')) || (c && c.consumirBoton(1))) {
    // Atrás: al jugador anterior, o de vuelta a elegir personaje.
    if (turnoMascota > 0) {
      turnoMascota = turnoAnterior(turnoMascota);
      mascotasElegidas[turnoMascota] = '';
      cursorMascota = 0;
    } else {
      irA(PANTALLA_SELECCION);
    }
    return;
  }

  const eje = c ? c.flancoEje(true) : 0;
  if ((teclado && entrada.consumirFlanco('ArrowRight')) || (c && c.consumirBoton(15)) || eje > 0) {
    cursorMascota = (cursorMascota + 1) % (n + 1);
  }
  if ((teclado && entrada.consumirFlanco('ArrowLeft')) || (c && c.consumirBoton(14)) || eje < 0) {
    cursorMascota = (cursorMascota + n) % (n + 1);
  }

  const acepta = (teclado && (entrada.consumirFlanco('Enter') || entrada.consumirFlanco('Space'))) ||
                 (c && c.consumirBoton(0));
  if (!acepta) return;

  // El último hueco de la lista es SIN MASCOTA. Existe porque llevar una es una
  // elección, y una elección sin la opción de no elegir no lo es.
  mascotasElegidas[turnoMascota] = cursorMascota < n ? disponibles[cursorMascota] : '';

  const siguiente = turnoSiguiente(turnoMascota);
  if (siguiente < 0) empezarPartida();
  else { turnoMascota = siguiente; cursorMascota = 0; }
}

// Mascotas que este jugador puede elegir: las compradas menos las que ya lleva
// otro. Se recalcula en cada paso y no se guarda, que son ocho elementos.
function mascotasDisponibles() {
  const libres = [];
  for (const id of ORDEN_MASCOTAS) {
    if (!MetaProgreso.tieneMascota(id)) continue;
    let cogida = false;
    for (let i = 0; i < mascotasElegidas.length; i++) {
      if (i !== turnoMascota && mascotasElegidas[i] === id) { cogida = true; break; }
    }
    if (!cogida) libres.push(id);
  }
  return libres;
}

function turnoSiguiente(desde) {
  for (let i = desde + 1; i < puestos.length; i++) if (puestos[i]) return i;
  return -1;
}

function turnoAnterior(desde) {
  for (let i = desde - 1; i >= 0; i--) if (puestos[i]) return i;
  return 0;
}

// --- Configuración ------------------------------------------------------------
// Vídeo, sonido y el botón de empezar de cero.
const CONFIG = [
  { id: 'musica',   texto: 'Música' },
  { id: 'efectos',  texto: 'Efectos' },
  { id: 'pantalla', texto: 'Pantalla completa' },
  { id: 'borrar',   texto: 'Empezar de cero' }
];

function entradaConfig() {
  // La ventana de confirmación se lleva TODA la entrada mientras está abierta:
  // desde ahí solo se puede decir sí o no.
  if (confirmarBorrado) {
    const c0 = entrada.controles[0];
    if (entrada.consumirFlanco('Escape') || entrada.consumirAtras()) { confirmarBorrado = false; return; }
    if (entrada.consumirFlanco('Enter') || (c0 && c0.consumirBoton(0))) {
      MetaProgreso.reiniciarTodo();
      Mascotas.releer(null);
      mascotasElegidas.fill('');
      confirmarBorrado = false;
    }
    return;
  }

  const c = entrada.controles[0];
  const n = CONFIG.length;
  if (entrada.consumirFlanco('Escape') || entrada.consumirAtras()) { irA(PANTALLA_TITULO); return; }

  const ejeV = c ? c.flancoEje(false) : 0;
  if (entrada.consumirFlanco('ArrowDown') || (c && c.consumirBoton(13)) || ejeV > 0) {
    cursorConfig = (cursorConfig + 1) % n;
  }
  if (entrada.consumirFlanco('ArrowUp') || (c && c.consumirBoton(12)) || ejeV < 0) {
    cursorConfig = (cursorConfig + n - 1) % n;
  }

  const id = CONFIG[cursorConfig].id;
  const ejeH = c ? c.flancoEje(true) : 0;
  const menos = entrada.consumirFlanco('ArrowLeft') || (c && c.consumirBoton(14)) || ejeH < 0;
  const mas = entrada.consumirFlanco('ArrowRight') || (c && c.consumirBoton(15)) || ejeH > 0;
  const acepta = entrada.consumirFlanco('Enter') || entrada.consumirFlanco('Space') ||
                 (c && c.consumirBoton(0));

  if (id === 'musica' && (menos || mas)) GestorAudio.ajustarMusica(mas ? 0.1 : -0.1);
  if (id === 'efectos' && (menos || mas)) GestorAudio.ajustarEfectos(mas ? 0.1 : -0.1);
  if (id === 'pantalla' && (acepta || menos || mas)) alternarPantallaCompleta();
  if (id === 'borrar' && acepta) confirmarBorrado = true;
}

// Tienda: un cursor, comprar con Enter/A, Esc/B o T para volver al título. Las
// compras son denarios de progreso META (core/metaProgreso.js) — para
// siempre, no de esta partida — así que no hay nada que deshacer al salir.
//
// SE MANEJA CON EL MANDO ENTERO, no solo con las flechas del teclado: cruceta
// (botones 12-15 del mapeo estándar) y STICK IZQUIERDO. El stick hace falta
// aparte porque no es un botón sino un eje continuo, así que "moverlo abajo" no
// es un evento; `flancoEje` le pone histéresis y lo convierte en uno (ver
// core/entrada.js). Sin esto, quien acabara de enchufar un mando llegaba a la
// tienda y no podía moverse por ella.
//
// Los flancos se consumen TODOS antes de decidir nada. Encadenarlos con `||`
// cortocircuita —si el primero es cierto, el segundo no llega a consumirse— y
// esa pulsación se quedaría en la cola para dispararse en la pantalla siguiente.
function entradaTienda() {
  const c = entrada.controles[0];
  // Una sola llamada por eje y frame: `flancoEje` guarda estado y llamarlo dos
  // veces se comería su propio flanco.
  const ejeV = c ? c.flancoEje(false) : 0;
  const ejeH = c ? c.flancoEje(true) : 0;

  const tDer = entrada.consumirFlanco('ArrowRight');
  const tIzq = entrada.consumirFlanco('ArrowLeft');
  const tAbajo = entrada.consumirFlanco('ArrowDown');
  const tArriba = entrada.consumirFlanco('ArrowUp');
  const tEnter = entrada.consumirFlanco('Enter');
  const tEspacio = entrada.consumirFlanco('Space');
  const tEscape = entrada.consumirFlanco('Escape');
  const tTienda = entrada.consumirFlanco('KeyT');
  const tDinero = entrada.consumirFlanco('KeyD');
  const mAtras = entrada.consumirAtras();
  const mDer = c ? c.consumirBoton(15) : false;
  const mIzq = c ? c.consumirBoton(14) : false;
  const mAbajo = c ? c.consumirBoton(13) : false;
  const mArriba = c ? c.consumirBoton(12) : false;
  const mAcepta = c ? c.consumirBoton(0) : false;

  if (tEscape || tTienda || mAtras) {
    irA(PANTALLA_TITULO);
    return;
  }

  // D: MIL DENARIOS. Atajo de PRUEBA, como los del 1 al 8 de la partida, y por
  // eso vive en la tienda y no en el menú: es para poder comprobar que una
  // compra hace lo que dice sin jugarse veinte partidas antes de llegar a
  // pagarla. Se guarda en el acto porque lo primero que se hace después de
  // probar una compra es recargar para ver si se quedó.
  //
  // Está sin anunciar en ninguna pantalla a propósito: quien no sepa que existe
  // no se la encuentra sin querer, que es lo que se le pide a un atajo que
  // regala dinero.
  if (tDinero) {
    MetaProgreso.ganar(DENARIOS_PRUEBA);
    MetaProgreso.guardar();
  }

  // Cambiar de sección reinicia el cursor: las tres listas no tienen ni la
  // misma longitud ni el mismo orden, así que conservar la fila solo llevaría
  // a un sitio arbitrario.
  if (tDer || mDer || ejeH > 0) {
    pestanyaTienda = (pestanyaTienda + 1) % N_PESTANYAS; cursorTienda = 0; return;
  }
  if (tIzq || mIzq || ejeH < 0) {
    pestanyaTienda = (pestanyaTienda + N_PESTANYAS - 1) % N_PESTANYAS; cursorTienda = 0; return;
  }

  const lista = pestanyaTienda === PESTANYA_MASCOTAS ? ORDEN_MASCOTAS
              : pestanyaTienda === PESTANYA_PERSONAJES ? ORDEN_PERSONAJES
              : ID_POTENCIADORES;
  const n = lista.length;
  if (tAbajo || mAbajo || ejeV > 0) cursorTienda = (cursorTienda + 1) % n;
  if (tArriba || mArriba || ejeV < 0) cursorTienda = (cursorTienda + n - 1) % n;

  if (tEnter || tEspacio || mAcepta) {
    // El mismo boton compra o SUBE DE NIVEL segun toque, en las tres pestanas.
    // Para quien juega es el mismo gesto —pagar por tener mas— y separarlo en
    // "comprar" y "mejorar" solo anadiria un concepto.
    if (pestanyaTienda === PESTANYA_MASCOTAS) {
      MetaProgreso.comprarMascota(ORDEN_MASCOTAS[cursorTienda]);
    } else if (pestanyaTienda === PESTANYA_PERSONAJES) {
      MetaProgreso.comprarHeroe(ORDEN_PERSONAJES[cursorTienda]);
    } else {
      MetaProgreso.comprarPotenciador(ID_POTENCIADORES[cursorTienda]);
    }
  }
}

// Siguiente personaje LIBRE en la dirección dada. Dos jugadores no pueden
// llevar el mismo: cada personaje tiene su arma exclusiva (ver
// datos/personajes.js), así que repetir dejaría a dos con el mismo arsenal de
// salida y rompería lo que hace que el cooperativo se juegue distinto.
function personajeLibre(indice, desde, paso) {
  const n = ORDEN_PERSONAJES.length;
  for (let k = 1; k <= n; k++) {
    const p = (desde + paso * k + n * n) % n;
    if (ocupantePersonaje(puestos, p) < 0) return p;
  }
  return desde;                       // los cuatro cogidos: no se mueve
}

function primerLibre() {
  for (let p = 0; p < ORDEN_PERSONAJES.length; p++) {
    if (ocupantePersonaje(puestos, p) < 0) return p;
  }
  return -1;
}

function entradaSeleccion() {
  const hueco = primerLibre();

  // --- Altas ---------------------------------------------------------------
  // Un mando enchufado entra pulsando A o Start. Start (9) no lo reclama
  // ninguna otra pantalla de selección —solo abre pausa/ficha durante la
  // partida (ver el comentario de core/entrada.js)—, así que aquí es libre y
  // es el botón que casi todo el mundo prueba primero para "unirse". Con J
  // entra uno más por teclado, que es como se prueba el cooperativo sin
  // cuatro mandos encima de la mesa.
  if (hueco >= 0) {
    for (let i = 1; i < puestos.length; i++) {
      if (puestos[i]) continue;
      const c = entrada.controles[i];
      if (c && c.conectado && (c.consumirBoton(0) || c.consumirBoton(9))) {
        puestos[i] = { personaje: hueco, listo: false };
        break;
      }
    }
    if (entrada.consumirFlanco('KeyJ')) {
      for (let i = 1; i < puestos.length; i++) {
        if (!puestos[i]) { puestos[i] = { personaje: primerLibre(), listo: false }; break; }
      }
    }
  }

  // H quita el último, igual que en la partida. No es solo simetría: un puesto
  // añadido con J lo maneja el mando de ESE jugador, así que si se ha pulsado
  // sin tener el mando enchufado no puede confirmar nunca, y como la partida no
  // arranca hasta que están todos listos, la pantalla se quedaba muerta sin más
  // salida que recargar. Con H se deshace.
  if (entrada.consumirFlanco('KeyH')) {
    for (let i = puestos.length - 1; i >= 1; i--) {
      if (puestos[i]) { puestos[i] = null; break; }
    }
  }

  // --- Cada puesto con SU control ------------------------------------------
  for (let i = 0; i < puestos.length; i++) {
    const puesto = puestos[i];
    if (!puesto) continue;
    const c = entrada.controles[i];
    // El teclado es del jugador 1, igual que en la partida.
    const teclado = i === 0;

    // Atrás: deshace un paso cada vez. Confirmado -> sin confirmar; sin
    // confirmar -> se va (o vuelve al título, si es el jugador 1, que no puede
    // irse porque entonces no quedaría nadie).
    if ((teclado && entrada.consumirFlanco('Escape')) || (c && c.consumirBoton(1))) {
      if (puesto.listo) puesto.listo = false;
      else if (i > 0) puestos[i] = null;
      else { irA(PANTALLA_TITULO); return; }
      continue;
    }

    if (puesto.listo) continue;

    // El stick se lee UNA vez por paso: flancoEje consume estado.
    const eje = c ? c.flancoEje(true) : 0;
    if ((teclado && entrada.consumirFlanco('ArrowRight')) || (c && c.consumirBoton(15)) || eje > 0) {
      puesto.personaje = personajeLibre(i, puesto.personaje, 1);
    }
    if ((teclado && entrada.consumirFlanco('ArrowLeft')) || (c && c.consumirBoton(14)) || eje < 0) {
      puesto.personaje = personajeLibre(i, puesto.personaje, -1);
    }
    if ((teclado && (entrada.consumirFlanco('Enter') || entrada.consumirFlanco('Space'))) ||
        (c && c.consumirBoton(0))) {
      puesto.listo = true;
    }
  }

  // --- Salida ---------------------------------------------------------------
  const presentes = puestos.filter(Boolean);
  if (presentes.length > 0 && presentes.every((p) => p.listo)) {
    // Elegir mascota solo tiene sentido si hay alguna comprada. Sin ninguna se
    // salta la pantalla entera y se entra a jugar: una pantalla cuya unica
    // opcion es "ninguna" no es una eleccion, es un tramite.
    if (MetaProgreso.algunaMascota()) {
      mascotasElegidas.fill('');
      turnoMascota = puestos.findIndex(Boolean);
      cursorMascota = 0;
      irA(PANTALLA_MASCOTAS);
    } else {
      mascotasElegidas.fill('');
      empezarPartida();
    }
  }
}

// Crea de verdad a los jugadores elegidos y arranca. Hasta aquí no existía ni
// uno solo: los pools y el director ya estaban montados desde `arrancar`, pero
// `jugadores` estaba vacío a propósito, porque un jugador en pie durante el
// título es un jugador al que ya le está corriendo el reloj.
function empezarPartida() {
  // Las mascotas van EN PARALELO a los jugadores, no por indice de puesto: si
  // juega el puesto 0 y el 2, los jugadores son 0 y 1, y sus mascotas tienen
  // que quedar en esas mismas posiciones o el jugador 1 saldria con la mascota
  // que eligio el 2.
  const mascotasPorJugador = [];
  for (let i = 0; i < puestos.length; i++) {
    if (!puestos[i]) continue;
    mascotasPorJugador.push(mascotasElegidas[i] || '');
    anyadirJugador(ORDEN_PERSONAJES[puestos[i].personaje], mascotasElegidas[i] || '');
  }
  camara.situar(jugadores[0].x, jugadores[0].y);
  // Que mascota lleva cada uno se decide en su pantalla y no cambia en toda la
  // partida: se lee una vez aqui.
  Mascotas.releer(mascotasPorJugador);
  Director.reiniciar();
  enemigos.bajas = 0;
  derrotaGuardada = false;
  finalMostrado = null;
  statsFinal = null;
  resumenFinal = false;
  relojResumen = 0;
  denariosAlEmpezar = MetaProgreso.denarios;
  GestorAudio.iniciarMusica();
  irA(PANTALLA_JUEGO);
}

// Cuánto se queda cualquiera por dentro del borde del NIVEL (no de la
// pantalla, eso ya lo hace camara.sujetar). Pequeño a propósito: la franja de
// hierba llega hasta el borde de la imagen y no hay por qué recortarla.
const MARGEN_NIVEL = 12;

// Tope duro en X contra el borde del MUNDO, no de la pantalla. Se aplica a
// jugadores y enemigos por igual: un enemigo generado en el hueco vacío de
// fuera del mapa (los patrones de aparición reparten en anillo alrededor de
// la cámara sin saber que el nivel tiene ancho limitado) terminaría dejando
// su gema de XP en un sitio al que nadie puede llegar. En Y no hay tope: el
// suelo repite sin límite hacia arriba y abajo.
function clamparXNivel(e) {
  if (!Recursos.mapaPintado) return;
  const limIzq = MARGEN_NIVEL;
  const limDer = Recursos.anchoSuelo - MARGEN_NIVEL;
  if (e.x < limIzq) e.x = limIzq; else if (e.x > limDer) e.x = limDer;
}

// Foto fija del resumen de la partida, tomada UNA vez en el instante en que se
// gana o se pierde.
//
// Trae DOS COSAS DISTINTAS y conviene no mezclarlas: las cifras de equipo
// —tiempo, bajas, denarios— y una ficha POR JUGADOR. Antes solo salía el
// jugador 1, y en cooperativo eso deja fuera a tres personas que acaban de jugar
// la misma partida; ahora el resumen ocupa la pantalla entera y caben las cuatro
// columnas (ver ui/final.js).
//
// Es una COPIA, no una vista de los objetos vivos: el mundo sigue corriendo por
// debajo del cartel de derrota, así que apuntar a `jugadores` dejaría un resumen
// que cambia mientras se lee. Aquí sí se puede asignar memoria —la partida ya ha
// terminado, no estamos en el bucle—.
function capturarStats() {
  return {
    // Los SEGUNDOS (Director.t), no el "mm:ss" ya montado que devuelve
    // Director.reloj: el resumen es quien decide cómo se escribe un tiempo, y
    // pasarle la cadena hecha ata las dos cosas por ninguna razón.
    tiempo: Director.t,
    bajas: enemigos.bajas,
    // Lo GANADO en esta partida, no el montón entero. El total sigue estando
    // (MONEDERO, al lado), pero lo que quiere saber quien acaba de jugar es qué
    // le ha rentado ESTA partida, y ese número no estaba en ninguna parte: el
    // panel viejo enseñaba el acumulado con el rótulo "DENARIOS", que es
    // justamente el que se lee como "lo que has sacado".
    denarios: MetaProgreso.denarios - denariosAlEmpezar,
    monedero: MetaProgreso.denarios,
    jugadores: jugadores.map((j) => ({
      id: j.id,
      nombre: j.def.nombre,
      nivel: j.nivel,
      golpes: j.golpesRecibidos,
      resurrecciones: j.resurreccionesUsadas,
      enPie: !j.abatido,
      mascota: j.mascotaId && MASCOTAS[j.mascotaId] ? MASCOTAS[j.mascotaId].corto : '',
      armas: j.arsenal ? j.arsenal.equipadas.map((a) => ({ id: a.id, nivel: a.nivel })) : [],
      pasivos: { ...j.pasivos }
    }))
  };
}

// VOLVER AL MENÚ desde el resumen final, que es lo que pidió Sergio: antes de
// aquí solo se salía recargando la página.
//
// Desmonta la partida entera a mano. No basta con cambiar de pantalla: los pools
// siguen llenos de la horda del minuto veinte, `jugadores` sigue teniendo a los
// cuatro y `empezarPartida` los AÑADE en vez de sustituirlos, así que la segunda
// partida arrancaría con ocho personajes y la horda anterior encima.
//
// Los pools se vacían, NO se recrean: vaciar un pool es poner su contador de
// activos a cero (ver core/pool.js), así que esto no asigna memoria y la
// siguiente partida arranca sin esperar a nada.
function volverAlMenu() {
  MetaProgreso.guardar();
  GestorAudio.pararMusica();

  enemigos.vaciar(); proyectiles.vaciar(); zonas.vaciar(); disparos.vaciar();
  cofres.vaciar(); recogibles.vaciar(); Jefes.vaciar();
  Particulas.vaciar(); VFX.vaciar();

  jugadores.length = 0;
  arsenales.length = 0;
  Mascotas.releer(null);
  Progresion.iniciar(rng);
  Director.reiniciar();

  finalMostrado = null;
  statsFinal = null;
  resumenFinal = false;
  relojResumen = 0;
  derrotaGuardada = false;
  pausado = false;
  fichaAbierta = -1;
  mapaAbierto = false;

  puestos.fill(null);
  cursorMenu = 0;
  irA(PANTALLA_TITULO);
}

// --- Reanimación en cooperativo ----------------------------------------------
//
// Un jugador caído se levanta solo, pero LO RÁPIDO DEPENDE DE LA COMPAÑÍA: diez
// segundos si alguien se queda junto a su ataúd, treinta si nadie va.
//
// Se lleva como PROGRESO de 0 a 1 y no como un contador de segundos fijado en
// el momento de caer, y esa es toda la gracia de la mecánica. Con un contador
// fijo, acercarse al ataúd de tu hermana no serviría de nada si ya se había
// decidido "treinta" al caer. Con progreso, el reloj corre al triple mientras
// alguien está al lado y se frena en cuanto se va: quedarse es una decisión
// —dejas de matar y te quedas quieto donde ha caído, que suele ser el peor
// sitio del mapa— y esa decisión es justo lo que hace cooperativo a un
// cooperativo. Los extremos siguen siendo exactamente los que pidió Sergio: 10
// segundos sin moverse de al lado, 30 sin acercarse nunca.
const RADIO_REANIMAR = 60;     // unidades lógicas: hay que ir de verdad, no basta con estar en pantalla
const REANIMAR_CERCA = 10;     // segundos con alguien dentro del radio
const REANIMAR_LEJOS = 30;     // segundos sin nadie

function reanimar(dt) {
  // En solitario no hay reanimación: caer es perder, como hasta ahora.
  if (jugadores.length < 2) return;

  // HACE FALTA ALGUIEN EN PIE. Sin esta guarda la partida sería imposible de
  // perder: con los cuatro caídos el contador seguiría corriendo y se
  // levantarían solos a los treinta segundos, así que la pantalla de derrota
  // no llegaría nunca.
  let hayVivo = false;
  for (let i = 0; i < jugadores.length; i++) {
    if (!jugadores[i].abatido) { hayVivo = true; break; }
  }
  if (!hayVivo) return;

  for (let i = 0; i < jugadores.length; i++) {
    const j = jugadores[i];
    if (!j.abatido) continue;

    let acompanyado = false;
    for (let k = 0; k < jugadores.length; k++) {
      const o = jugadores[k];
      if (k === i || o.abatido) continue;
      const dx = o.x - j.x;
      const dy = o.y - j.y;
      if (dx * dx + dy * dy <= RADIO_REANIMAR * RADIO_REANIMAR) { acompanyado = true; break; }
    }

    j.reanimacion += dt / (acompanyado ? REANIMAR_CERCA : REANIMAR_LEJOS);
    if (j.reanimacion >= 1) j.levantar();
  }
}

// --- Lógica -----------------------------------------------------------------
function actualizar(dt) {
  entrada.actualizar();

  // Título y selección salen por aquí, antes de tocar nada de la simulación:
  // todo lo que viene debajo da por hecho que hay al menos un jugador vivo.
  if (pantalla !== PANTALLA_JUEGO) {
    if (pantalla === PANTALLA_TITULO) entradaTitulo();
    else if (pantalla === PANTALLA_TIENDA) entradaTienda();
    else if (pantalla === PANTALLA_MASCOTAS) entradaMascotas();
    else if (pantalla === PANTALLA_CONFIG) entradaConfig();
    else entradaSeleccion();
    entrada.limpiarFlanco();
    return;
  }

  // El cofre se atiende ANTES que nada, incluidos los atajos de depuración. Se
  // cierra con cualquier tecla, así que si los atajos fueran antes, cerrarlo con
  // el 2 soltaría además quinientas serpientes.
  if (Progresion.cofreAbierto) {
    // Las ruletas giran con el PASO DE LÓGICA y no con el reloj de pared: van
    // al mismo ritmo aunque el navegador pierda fotogramas, y con la misma
    // semilla el cofre se ve exactamente igual dos partidas seguidas.
    const girando = Progresion.girarCofre(dt);
    if (entrada.algunFlanco()) {
      // La primera pulsación mientras giran NO cierra: las termina. Quien ya ha
      // visto veinte cofres no tiene por qué esperar tres segundos, y quien lo
      // ve por primera vez no se lo salta sin querer al ir a cerrar.
      if (girando) Progresion.saltarGiro();
      else Progresion.cerrarCofre();
    }
    entrada.limpiarFlanco();
    return;
  }

  // Ficha de jugador. Cada uno abre LA SUYA con el Select de su mando (botón 8
  // del mapeo estándar); el teclado abre la del jugador 1. La misma tecla la
  // cierra, que es lo que se intenta por instinto.
  if (entrada.consumirFlanco('Tab')) fichaAbierta = fichaAbierta === 0 ? -1 : 0;
  for (let i = 0; i < jugadores.length; i++) {
    const c = entrada.controles[i];
    if (c && c.consumirBoton(8)) fichaAbierta = fichaAbierta === i ? -1 : i;
  }
  if (fichaAbierta >= 0) {
    if (fichaAbierta >= jugadores.length) fichaAbierta = -1;   // se fue ese jugador
    else {
      alternarAutomatico(jugadores[fichaAbierta]);
      // ESC en teclado o B en cualquier mando: la ficha no tenía hasta ahora
      // ninguna forma de cerrarse aparte de la misma tecla que la abrió.
      if (entrada.consumirFlanco('Escape') || entrada.consumirAtras()) fichaAbierta = -1;
    }
    entrada.limpiarFlanco();
    return;
  }

  if (entrada.consumirFlanco('F3')) verDepuracion = !verDepuracion;
  if (entrada.consumirFlanco('F4')) mapaAbierto = !mapaAbierto;
  if (entrada.consumirFlanco('Escape', 9)) pausado = !pausado;
  // B en el mando SOLO cierra la pausa, nunca la abre: "atrás" no es un botón
  // de menú, así que si el juego no está pausado no hace nada.
  else if (pausado && entrada.consumirAtras()) pausado = false;
  if (entrada.consumirFlanco('KeyC')) {
    // Cambia el personaje del jugador 1; los demás llevan el suyo.
    indicePersonaje = (indicePersonaje + 1) % ORDEN_PERSONAJES.length;
    jugadores[0].personaje = PERSONAJES[ORDEN_PERSONAJES[indicePersonaje]].sprite;
  }
  if (entrada.consumirFlanco('KeyJ')) anyadirJugador();
  if (entrada.consumirFlanco('KeyH')) quitarJugador();
  if (entrada.consumirFlanco('Digit1')) tanda(100, MEZCLA_TEMPRANA);
  if (entrada.consumirFlanco('Digit2')) tanda(500, MEZCLA_TEMPRANA);
  if (entrada.consumirFlanco('Digit3')) tanda(800, MEZCLA_TEMPRANA);
  if (entrada.consumirFlanco('Digit4')) tanda(300, MEZCLA_TARDIA);
  // El DIRECTOR corre siempre: es la partida. La tecla 5 lo apaga para poder
  // juzgar un arma sin oleada encima, y al volver a encenderlo arranca del
  // minuto 0 y limpia la pantalla, porque lo que se mide entonces es la curva y
  // arrastrar ochocientas serpientes de la tecla 3 falsea el minuto 0 entero.
  //
  // 6 y 7 mueven el reloj un minuto: probar el minuto 16 esperando dieciséis
  // minutos no es probar, es esperar.
  if (entrada.consumirFlanco('Digit5')) {
    if (Director.alternar()) {
      enemigos.vaciar(); proyectiles.vaciar(); zonas.vaciar(); disparos.vaciar(); Jefes.vaciar();
    }
  }
  if (entrada.consumirFlanco('Digit6')) Director.saltar(60);
  if (entrada.consumirFlanco('Digit7')) Director.saltar(-60);
  // Cofre a los pies del jugador 1. Esperar a que caiga una mantícora para
  // comprobar una evolución son cinco minutos de partida por intento.
  if (entrada.consumirFlanco('Digit8')) cofres.soltar(jugadores[0].x, jugadores[0].y);
  if (entrada.consumirFlanco('KeyX')) {
    enemigos.vaciar(); proyectiles.vaciar(); zonas.vaciar(); cofres.vaciar();
    disparos.vaciar(); Jefes.vaciar();
  }
  if (entrada.consumirFlanco('KeyG')) {
    const nuevo = !jugadores[0].inmortal;
    for (let i = 0; i < jugadores.length; i++) jugadores[i].inmortal = nuevo;
  }
  if (entrada.consumirFlanco('KeyR')) {
    for (let i = 0; i < jugadores.length; i++) jugadores[i].reiniciar();
    // Y se retira la pantalla final. Sin esto, `finalMostrado` se quedaba
    // puesto para siempre: levantar a los jugadores les devolvía el control
    // pero el cartel seguía encima de la partida y no había forma de quitarlo
    // sin recargar. Era el bug que hacía que la R "no hiciera nada".
    finalMostrado = null;
    statsFinal = null;
    resumenFinal = false;
    relojResumen = 0;
    derrotaGuardada = false;
    refrescarChuleta();
  }
  if (entrada.consumirFlanco('KeyL')) subirTodasLasArmas();
  if (entrada.consumirFlanco('KeyK')) equiparGladius();
  if (entrada.consumirFlanco('KeyM')) cicladorArmas(false);
  if (entrada.consumirFlanco('KeyComma')) cicladorArmas(true);
  // Interruptores de perfilado: apagar un sistema y mirar los fps es la forma
  // más directa de saber qué cuesta en una máquina concreta.
  if (entrada.consumirFlanco('KeyP')) activo.particulas = !activo.particulas;
  if (entrada.consumirFlanco('KeyN')) activo.numeros = !activo.numeros;
  if (entrada.consumirFlanco('KeyO')) activo.efectos = !activo.efectos;
  if (entrada.consumirFlanco('KeyY')) activo.suelo = !activo.suelo;
  if (entrada.consumirFlanco('KeyT')) {
    Enemigos.destelloActivo = !Enemigos.destelloActivo;
    activo.destello = Enemigos.destelloActivo;
  }

  // Menú de subida de nivel: congela el mundo entero. Es el único momento en que
  // el juego se detiene solo, y tiene prioridad sobre todo lo demás.
  //
  // Mientras gira la ruleta (Progresion.animando) no se atiende ninguna
  // entrada: aceptar Enter durante el giro dejaría elegir una carta que
  // todavía no se ha visto.
  if (Progresion.abierto) {
    if (!Progresion.tirando(dt)) menuNivelEntrada();
    entrada.limpiarFlanco();
    return;
  }

  if (pausado) { entrada.limpiarFlanco(); return; }

  // Hitstop: congela la LÓGICA unos milisegundos tras un golpe fuerte, pero el
  // render sigue corriendo. Se siente como un frenazo del mundo, no como una
  // caída de fps. La sacudida sí avanza, o el parón la dejaría clavada.
  if (VFX.congelado > 0) {
    VFX.congelado -= dt;
    VFX.actualizar(dt);
    entrada.limpiarFlanco();
    return;
  }

  // Cada jugador con SU control. El jugador 1 lleva teclado y mando 0; los
  // demás, su mando.
  for (let i = 0; i < jugadores.length; i++) {
    jugadores[i].actualizar(dt, entrada.controles[i]);
  }
  reanimar(dt);
  Mascotas.actualizar(dt, jugadores, ctxArmas);
  for (let i = 0; i < jugadores.length; i++) clamparXNivel(jugadores[i]);
  enemigos.mover(dt, jugadores, camara);
  proyectiles.mover(dt, estallar);

  // Orden deliberado: primero se recicla (el pool intercambia posiciones y
  // dejaría los índices de la rejilla apuntando a otras entidades), y solo
  // entonces se construye la rejilla. Se construye UNA vez y la usan TODOS los
  // sistemas que vienen detrás: separación, contacto, armas e impactos.
  //
  // La separación mueve hasta 4px después de construirla, así que el contacto
  // trabaja con una rejilla desfasada esos 4px. Es inofensivo: la consulta 3x3
  // cubre 64px y el alcance real del contacto son 49 como mucho (radio 39 de la
  // hidra + 10 del jugador), o sea 15px de margen.
  enemigos.reciclarLejanos(camara.x, camara.y);
  enemigos.rejilla.reconstruir(
    enemigos.pool.items, enemigos.pool.activos, camara.x, camara.y);
  separacion(enemigos, jugadores);
  Obstaculos.actualizar(camara.y, enemigos);
  colisionarObstaculos(Obstaculos, jugadores, enemigos);
  // Los ataudes son solidos igual que una columna: el sitio donde ha caido un
  // companero deja de ser sitio por el que se pasa.
  colisionarAtaudes(jugadores, enemigos);
  contactoJugadores(enemigos, jugadores);

  // Las armas disparan DESPUÉS de reconstruir la rejilla: el arco melee la
  // consulta para saber a quién alcanza, y con una rejilla del paso anterior
  // podría dar a alguien que ya no está donde se ve.
  //
  // Un arsenal por jugador, cada uno con sus recargas. El contexto se reapunta
  // en vez de crearse: cuatro jugadores por sesenta pasos serían 240 objetos
  // por segundo tirados a la basura.
  for (let i = 0; i < jugadores.length; i++) {
    if (jugadores[i].abatido) continue;      // un caído no dispara
    ctxArmas.jugador = jugadores[i];
    arsenales[i].actualizar(dt, ctxArmas);
    arsenales[i].actualizarOrbitales(dt, ctxArmas);
    arsenales[i].actualizarTajos(dt);
  }
  impactosProyectiles(proyectiles, enemigos, estallar);

  // Los muertos se retiran cuando ya nadie recorre la rejilla. Hasta aquí solo
  // estaban marcados con vida a cero.
  enemigos.retirarMuertos();
  proyectiles.reciclarFuera(camara);

  zonas.actualizar(dt, enemigos);
  enemigos.retirarMuertos();
  recogibles.actualizar(dt, jugadores);
  // Los cofres van DESPUÉS de retirar a los muertos: el que suelta un élite al
  // caer tiene que existir ya cuando se comprueba quién lo pisa, o se perdería
  // el caso de morir justo encima del jugador.
  cofres.actualizar(dt, jugadores);
  actualizarLlamarada(dt);
  // Los disparos enemigos van DESPUÉS de las armas: primero se limpia el aire
  // con lo que el jugador haya lanzado este paso, y lo que sobreviva avanza. Al
  // revés, un disparo podría atravesar una explosión que ocurre en el mismo
  // instante y eso se lee como un fallo.
  disparos.barrer(proyectiles, zonas, arsenales, jugadores);
  disparos.actualizar(dt, jugadores, camara);
  Particulas.actualizar(dt);
  VFX.actualizar(dt);
  GestorAudio.actualizar();

  // Si alguien ha subido de nivel durante este paso, el menú abre en el
  // siguiente. Se atiende aquí, al final, para que el paso termine entero.
  Progresion.atender(jugadores);

  // La cámara va al centro del grupo y la correa impide que nadie se salga de
  // pantalla. Sujetar DESPUÉS de mover la cámara: al revés, el rezagado toparía
  // contra un borde que ya no está donde se le sujetó.
  camara.seguirGrupo(jugadores, dt);
  camara.sujetar(jugadores);
  // Después de la correa: si dos topan contra el mismo borde, hay que volver a
  // separarlos o el tope los dejaría uno dentro del otro.
  separarJugadores(jugadores);

  // El director aparece DESPUÉS de mover la cámara: si lo hiciera antes, con la
  // cámara corriendo detrás del grupo los enemigos entrarían medio metidos en
  // pantalla por el lado hacia el que se avanza.
  Director.actualizar(dt, enemigos, camara);
  // Los jefes van DESPUÉS del director: si acaba de invocar a uno este mismo
  // paso, sistemas/jefes.js ya lo encuentra registrado y puede empezar a
  // actuar sin esperar a la vuelta siguiente del bucle.
  Jefes.actualizar(dt, enemigos, jugadores, disparos);

  // Último en tocar posiciones este paso: atrapa tanto a los que acaban de
  // aparecer (director/jefes, arriba) como a los que se han movido, antes de
  // que nadie los vea ni de que puedan soltar una gema fuera del mundo.
  {
    const items = enemigos.pool.items;
    const n = enemigos.pool.activos;
    for (let k = 0; k < n; k++) clamparXNivel(items[k]);
  }

  // Todos caídos: se guardan los denarios ganados en la partida. Por flanco,
  // no cada frame que el cartel sigue en pantalla —aquí no hay a dónde volver
  // sin recargar, así que es la última oportunidad razonable de escribir.
  const derrota = jugadores.every((j) => j.abatido);
  if (derrota && !derrotaGuardada) { MetaProgreso.guardar(); derrotaGuardada = true; }
  else if (!derrota) derrotaGuardada = false;

  // Fin de la partida: el reloj llega al final ANTES que la derrota, para que
  // un equipo que cae justo cuando expira el tiempo se lleve la victoria y no
  // una derrota de última hora — ver la nota de finalMostrado más arriba.
  if (!finalMostrado && Director.terminado) {
    statsFinal = capturarStats();
    finalMostrado = 'victoria';
    refrescarChuleta();
    MetaProgreso.guardar();
  } else if (!finalMostrado && derrota) {
    statsFinal = capturarStats();
    finalMostrado = 'derrota';
    resumenFinal = false;      // primero el cartel; el resumen se pide
  }

  // Segundo tiempo de la derrota: cualquier tecla pasa del cartel al resumen.
  // Se atiende AQUÍ y no arriba del todo porque el flanco que abre el resumen
  // no puede ser el mismo golpe de tecla que acaba de matarte.
  //
  // Y del resumen se sale AL MENÚ PRINCIPAL, que es el tercer y último tiempo.
  // La victoria se salta el cartel y entra por la segunda rama desde el primer
  // frame: allí no hay ataúd que mirar.
  if (finalMostrado === 'derrota' && !resumenFinal) {
    if (entrada.algunFlanco()) { resumenFinal = true; relojResumen = 0; refrescarChuleta(); }
  } else if (finalMostrado) {
    relojResumen += dt;
    if (relojResumen >= ESPERA_RESUMEN && entrada.algunFlanco()) {
      entrada.limpiarFlanco();
      volverAlMenu();
      return;
    }
  }

  entrada.limpiarFlanco();
}

// Interruptor de subida automática. Se atiende en dos sitios —la ficha y el menú
// de subida de nivel— porque son los dos momentos en que uno se acuerda de que
// existe: mirando la ficha, o harto de que se abra el menú.
//
// El botón 2 del mando es X en el mapeo estándar.
function alternarAutomatico(j) {
  if (!j) return;
  const c = entrada.controles[jugadores.indexOf(j)] || entrada.controles[0];
  if (entrada.consumirFlanco('KeyF') || c.consumirBoton(2)) {
    if (Progresion.puedeAutomatizar(j)) j.autoNivel = !j.autoNivel;
  }
}

// Entrada del menú de nivel. Elige el jugador al que le toca —con su propio
// mando— pero el teclado vale siempre: si el que sube es el jugador 3 y no
// tiene mando a mano, la partida no puede quedarse bloqueada.
function menuNivelEntrada() {
  const j = Progresion.actual;
  const c = entrada.controles[jugadores.indexOf(j)] || entrada.controles[0];
  const n = Progresion.nOpciones;

  // El stick se lee UNA vez por paso: flancoEje consume estado, así que
  // llamarlo dos veces devolvería 0 la segunda.
  const eje = c.flancoEje(true);
  if (entrada.consumirFlanco('ArrowRight') || c.consumirBoton(15) || eje > 0) {
    Progresion.seleccion = (Progresion.seleccion + 1) % n;
  }
  if (entrada.consumirFlanco('ArrowLeft') || c.consumirBoton(14) || eje < 0) {
    Progresion.seleccion = (Progresion.seleccion + n - 1) % n;
  }
  for (let i = 0; i < n; i++) {
    if (entrada.consumirFlanco('Digit' + (i + 1))) Progresion.seleccion = i;
  }
  if (entrada.consumirFlanco('KeyR') && j.rerolls > 0) {
    Progresion.rerollar(jugadores);
    return;
  }
  alternarAutomatico(j);
  // Botón 0 = A en el mapeo estándar.
  if (entrada.consumirFlanco('Enter') || entrada.consumirFlanco('Space') ||
      c.consumirBoton(0)) {
    Progresion.elegir(Progresion.seleccion);
    Progresion.atender(jugadores);      // encadena si hay más en cola
  }
}

// --- Atajos de prueba (TEMPORAL, Fase 3) ------------------------------------
// La progresión de verdad llega en la Fase 4 con la pantalla de subida de nivel.
function subirTodasLasArmas() {
  for (let i = 0; i < arsenales.length; i++) {
    const eq = arsenales[i].equipadas;
    for (let k = 0; k < eq.length; k++) arsenales[i].subirNivel(eq[k].id);
  }
}
// Recorre el catálogo dejando UNA sola arma equipada al jugador 1. Es la única
// forma de juzgar un patrón por separado: con seis a la vez no se distingue cuál
// hace qué. Con Shift va hacia atrás.
let indiceCatalogo = -1;
function cicladorArmas(haciaAtras) {
  const ids = Object.keys(ARMAS);
  indiceCatalogo = (indiceCatalogo + (haciaAtras ? -1 : 1) + ids.length) % ids.length;
  const a = arsenales[0];
  a.equipadas.length = 0;
  a.vaciar();
  a.equipar(ids[indiceCatalogo]);
}

function equiparGladius() {
  for (let i = 0; i < arsenales.length; i++) {
    if (!arsenales[i].equipadas.some((a) => a.id === 'gladius')) {
      arsenales[i].equipar('gladius');
    }
  }
}

// --- Render -----------------------------------------------------------------
// ¿Está el mundo parado? Lo están la pausa, la ficha, el menú de subida de
// nivel, el aviso de evolución y el hitstop. Todos comparten la misma vía: en
// `actualizar` se sale antes de tocar la simulación.
function mundoCongelado() {
  return pausado || fichaAbierta >= 0 || mapaAbierto || Progresion.abierto ||
         Progresion.cofreAbierto || VFX.congelado > 0;
}

function dibujar(alpha) {
  // Música: se programa por horizonte en tiempo de PARED, no de simulación
  // (ver sistemas/audio.js), así que avanza aquí, en el render de cada
  // fotograma, y no en el paso de lógica fijo — sigue sonando aunque el
  // mundo esté congelado por un menú o la pausa.
  GestorAudio.tick();

  // Título y selección: no hay mundo que dibujar. La ilustración ocupa el
  // lienzo del juego entero y los resaltados van en la capa de interfaz, así
  // que ni se limpia el suelo ni se recorren pools que están vacíos.
  if (pantalla !== PANTALLA_JUEGO) {
    // La música del menú, en todas las pantallas previas. Se pide cada
    // fotograma y no al cambiar de pantalla a propósito: hasta que el usuario no
    // toca una tecla el navegador no deja sonar nada, y así entra sola en cuanto
    // lo hace sin que ninguna pantalla tenga que saberlo (ver musicaMenu).
    GestorAudio.musicaMenu();
    Capa.limpiar();
    if (despedida) { Pantallas.titulo(ctx, Capa.ctx, null, 0); dibujarDespedida(Capa.ctx); return; }
    if (pantalla === PANTALLA_TITULO) Pantallas.titulo(ctx, Capa.ctx, MENU, cursorMenu);
    else if (pantalla === PANTALLA_TIENDA) dibujarTienda(ctx, Capa.ctx, cursorTienda, pestanyaTienda);
    else if (pantalla === PANTALLA_MASCOTAS) {
      Pantallas.mascotas(ctx, Capa.ctx, mascotasDisponibles(), cursorMascota,
                         turnoMascota, puestos, mascotasElegidas);
    } else if (pantalla === PANTALLA_CONFIG) {
      Pantallas.config(ctx, Capa.ctx, CONFIG, cursorConfig, confirmarBorrado);
    }
    else Pantallas.seleccion(ctx, Capa.ctx, puestos);
    return;
  }

  // EL TEMBLOR DE LAS PANTALLAS PARADAS.
  //
  // Con el mundo congelado, la lógica no corre pero el RENDER sí, y el bucle le
  // sigue pasando un alpha que oscila entre 0 y 1 cada frame. Como al congelar
  // se sale de `actualizar` ANTES de que las entidades copien su posición a
  // xPrev, cada una conserva el desplazamiento del último paso y la
  // interpolación las mueve adelante y atrás sesenta veces por segundo. De ahí
  // el temblor al abrir el menú, el cofre, la ficha o la pausa: pequeño, pero
  // constante y justo cuando hay que leer.
  //
  // Congelado, alpha vale 1: se dibuja el estado final del último paso, quieto.
  if (mundoCongelado()) alpha = 1;

  for (let i = 0; i < jugadores.length; i++) jugadores[i].interpolar(alpha);
  camara.interpolar(alpha);

  // La cámara se ancla a píxel físico entero. Sin esto el suelo tiembla:
  // el vecino más próximo va duplicando y saltando filas de píxeles. La
  // sacudida se suma ANTES de redondear, así que también sale en píxeles
  // enteros y no rompe la rejilla.
  const offX = Math.round((camara.izquierda + VFX.desvioX) * ESCALA_ARTE);
  const offY = Math.round((camara.arriba + VFX.desvioY) * ESCALA_ARTE);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;

  ctx.setTransform(ESCALA_ARTE, 0, 0, ESCALA_ARTE, -offX, -offY);

  let t = performance.now();
  if (activo.suelo) dibujarSuelo(offX / ESCALA_ARTE, offY / ESCALA_ARTE);
  else { ctx.fillStyle = '#b99b6b'; ctx.fillRect(offX / ESCALA_ARTE, offY / ESCALA_ARTE, ANCHO_LOGICO, ALTO_LOGICO); tilesDibujados = 0; }
  perfil.suelo = performance.now() - t;

  t = performance.now();
  // Las gemas van bajo las entidades: son suelo, y taparlas con un cuerpo es
  // información correcta, no un fallo. El cofre también, pero su halo lo delata
  // por debajo de la horda, que es justo para lo que está.
  recogibles.dibujar(ctx, alpha);
  cofres.dibujar(ctx, alpha);
  enemigos.dibujar(ctx, camara, alpha, jugadores, Obstaculos);
  perfil.entidades = performance.now() - t;

  // Por encima de las entidades: los efectos tienen que leerse siempre, aunque
  // haya ochocientos cuerpos debajo.
  t = performance.now();
  if (activo.efectos) {
    zonas.dibujar(ctx);
    proyectiles.dibujar(ctx, alpha);
    for (let i = 0; i < arsenales.length; i++) {
      arsenales[i].dibujarTajos(ctx);
      arsenales[i].dibujarRayos(ctx);
      arsenales[i].dibujarOrbitales(ctx, jugadores[i]);
    }
  }
  // Los disparos enemigos, por encima de todo lo del mundo: uno que viene tiene
  // que verse aunque cruce por detrás de un cíclope.
  disparos.dibujar(ctx, alpha);
  Mascotas.dibujar(ctx, jugadores);
  if (activo.particulas) Particulas.dibujar(ctx, alpha);
  perfil.efectos = performance.now() - t;

  // --- Interfaz, en su propio lienzo -----------------------------------
  // A partir de aquí se dibuja sobre `ctxUi`, no sobre `ctx`. Se limpia entera
  // cada frame: es barata (unas decenas de órdenes) y así no hay que llevar la
  // cuenta de qué zonas quedaron sucias del frame anterior.
  t = performance.now();
  Capa.limpiar();
  const ctxUi = Capa.ctx;

  // Los números de daño van los PRIMEROS de la capa: son del mundo, no de la
  // interfaz, y tienen que quedar por debajo del panel y de los menús. Que
  // vivan en este lienzo es solo porque son texto y aquí es donde el texto se
  // ve bien.
  const tNum = performance.now();
  if (activo.numeros) VFX.dibujarNumeros(ctxUi, offX, offY);
  VFX.dibujarEscarcha(ctxUi, ANCHO_UI, ALTO_UI);
  perfil.texto = performance.now() - tNum;

  if (verDepuracion) {
    dibujarDepuracion(ctxUi, {
      fps: bucle.fps,
      msUpdate: bucle.msUpdate,
      msRender: bucle.msRender,
      pasos: bucle.pasosUltimoFrame,
      entidades: enemigos.activos + jugadores.length,
      dibujados: enemigos.dibujados,
      pool: enemigos.pool,
      reciclados: enemigos.reciclados,
      bajas: enemigos.bajas,
      proyectiles: proyectiles.activos,
      particulas: Particulas.activas,
      numeros: VFX.numerosActivos,
      jugadores,
      arsenales,
      perfil,
      activo,
      celdas: enemigos.rejilla.numCeldas,
      tiles: tilesDibujados,
      cx: camara.x, cy: camara.y,
      fuente: entrada.controles[0].fuente,
      mandos: entrada.mandosConectados,
      zoom: zoomPantalla,
      cofres: cofres.activos,
      disparos: disparos.activos,
      sustituidos: Recursos.sustituidos.length,
      jefe: Jefes.info(enemigos),
      escoltas: enemigos.escoltasVivos
    });
  }
  dibujarPaneles(ctxUi, jugadores);
  dibujarReloj(ctxUi);
  // Un mismo Jefes.info() alimenta la barra Y decide si suena la música de
  // jefe: es el único punto donde main.js sabe si hay uno en pie ahora mismo.
  const infoJefe = Jefes.info(enemigos);
  GestorAudio.jefeActivo(!!infoJefe);
  dibujarBarraJefe(ctxUi, infoJefe);

  // Solo se pierde cuando caen TODOS. Con un compañero en pie la partida sigue,
  // que es lo que hace que el cooperativo tenga sentido.
  //
  // El cofre manda sobre todo lo demás: es el único que aparece sin haberlo
  // pedido, y si una subida de nivel simultánea se pintara encima nadie sabría
  // qué le acaba de tocar.
  // Derrota en dos tiempos: primero solo el cartel, con el mundo y los ataudes
  // a la vista, y el resumen cuando se pide. La victoria va directa al resumen:
  // alli no hay ataud que mirar.
  if (finalMostrado === 'derrota' && !resumenFinal) dibujarCartelFinal(ctxUi, ALTO_UI, false);
  else if (finalMostrado) dibujarFinal(ctxUi, ALTO_UI, finalMostrado === 'victoria', statsFinal);
  if (fichaAbierta >= 0) dibujarFicha(ctxUi, jugadores, fichaAbierta);
  else if (Progresion.cofreAbierto) dibujarCofre(ctxUi, jugadores);
  else if (Progresion.abierto) dibujarMenuNivel(ctxUi, jugadores);
  else if (pausado) dibujarPausa(ctxUi, ALTO_UI);
  else if (mapaAbierto) dibujarMapa(ctxUi, jugadores, enemigos, cofres, camara);
  perfil.interfaz = performance.now() - t;
}

// Suelo infinito con scroll toroidal: no hay mapa en memoria, la variante de
// cada celda sale de un hash de sus coordenadas. Se dibuja solo lo que toca el
// viewport, con un tile de margen.
//
// El tamaño del tile lo pone Recursos y NO es la constante TILE: con el mapa
// pintado de Emerita el tile mide 240x368 unidades lógicas —media pantalla de
// ancho, una y media de alto— en vez de los 32x32 del suelo procedural. Con un
// solo tile el hash da siempre 0 y la mezcla de variantes se queda en nada, que
// es lo correcto: la variedad la trae ya el dibujo.
// Fuera de los límites del mapa pintado no hay escenario: un color sólido y
// oscuro en vez de repetir la imagen, para que se lea como "aquí se acaba el
// mundo conocido" y no como una costura rota. A juego con el tono nocturno de
// la calzada; no sale de `paleta` porque esa paleta es del tema diurno
// original y no del nuevo mapa.
const COLOR_VACIO = '#0a0c14';

function dibujarSuelo(izq, arr) {
  const tiles = Recursos.tilesSuelo;
  if (tiles.length === 0) return;

  const anchoTile = Recursos.anchoSuelo;
  const altoTile = Recursos.altoSuelo;
  const ty0 = Math.floor(arr / altoTile);
  const filas = Math.ceil(ALTO_LOGICO / altoTile) + 1;

  tilesDibujados = 0;

  // Mapa pintado: ANCHO LIMITADO al de la imagen, nunca varias avenidas en
  // paralelo. Una sola columna de tile (x en [0, anchoTile)); en Y sigue
  // repitiendo hacia arriba y abajo igual que siempre.
  if (Recursos.mapaPintado) {
    ctx.fillStyle = COLOR_VACIO;
    ctx.fillRect(izq, arr, ANCHO_LOGICO, ALTO_LOGICO);
    for (let fy = 0; fy < filas; fy++) {
      const gy = ty0 + fy;
      ctx.drawImage(tiles[0], 0, gy * altoTile, anchoTile, altoTile);
      tilesDibujados++;
    }
    return;
  }

  // Procedural de emergencia: el tile es pequeño y está pensado para repetir
  // sin límite en las dos direcciones, así que aquí sí hay varias columnas.
  const tx0 = Math.floor(izq / anchoTile);
  const columnas = Math.ceil(ANCHO_LOGICO / anchoTile) + 1;
  for (let fy = 0; fy < filas; fy++) {
    const gy = ty0 + fy;
    for (let fx = 0; fx < columnas; fx++) {
      const gx = tx0 + fx;
      const variante = hash2(gx, gy) % tiles.length;
      ctx.drawImage(tiles[variante], gx * anchoTile, gy * altoTile, anchoTile, altoTile);
      tilesDibujados++;
    }
  }
}

// --- Arranque ---------------------------------------------------------------
// Denarios por cofre de verdad (no consumible): un botín fijo, aparte de lo
// que ya da —evolución o mejoras— por sí mismo.
const DENARIOS_COFRE = 15;

async function arrancar() {
  MetaProgreso.iniciar();
  GestorAudio.iniciar();
  await Recursos.cargar(NIVEL);
  // Variantes de color del bestiario (la serpiente dorada). Después de cargar el
  // atlas y antes del primer frame: teñir un sprite en caliente sería un canvas
  // nuevo por enemigo.
  prepararVariantes();

  // El aspecto de pausa, derrota y subida de nivel lo pone el NIVEL. Se inyecta
  // en vez de importarlo desde ui/: si la interfaz importara merida.js, añadir
  // un nivel obligaría a tocar la interfaz, y el contrato dice que un nivel
  // nuevo es copiar un archivo de datos/niveles/ y nada más.
  Tema.usar(NIVEL);

  // Todos los pools se preasignan aquí, antes del primer frame.
  enemigos = new Enemigos(CAPACIDAD_ENEMIGOS, rng);
  proyectiles = new Proyectiles(CAPACIDAD_PROYECTILES);
  Particulas.iniciar(CAPACIDAD_PARTICULAS);
  VFX.iniciar(CAPACIDAD_NUMEROS);
  recogibles = new Recogibles(CAPACIDAD_GEMAS, rng);
  cofres = new Cofres(CAPACIDAD_COFRES, rng);
  disparos = new Disparos(CAPACIDAD_DISPAROS, rng);
  zonas = new Zonas(CAPACIDAD_ZONAS);
  enemigos.recogibles = recogibles;
  enemigos.cofres = cofres;
  enemigos.disparos = disparos;
  Progresion.iniciar(rng);

  // Quién abre el cofre y qué pasa entonces se decide aquí, no en la entidad:
  // así el cofre no sabe nada de la progresión y la progresión no sabe nada de
  // que existan cofres tirados por el suelo.
  cofres.alRecoger = (jugador, tipo, especial) => {
    if (tipo === COFRE) {
      Progresion.abrirCofre(jugador, jugadores, especial);
      MetaProgreso.ganar(DENARIOS_COFRE);
      GestorAudio.abrirCofre();
    } else usarConsumible(jugador, tipo);
  };

  // Comparte el RNG con todo lo demás, así que con la misma semilla salen las
  // mismas oleadas: es el criterio 10 del plan y sin él no se puede comparar un
  // ajuste de balance con el anterior.
  Director.iniciar(NIVEL, rng);
  Obstaculos.iniciar(NIVEL);
  // El director decide cuándo cae un consumible; los objetos del suelo saben
  // dibujarse y dejarse recoger. Ninguno de los dos sabe del otro más que esto.
  Director.objetos = cofres;
  Jefes.iniciar(rng);
  Mascotas.iniciar();

  ctxArmas.enemigos = enemigos;
  ctxArmas.proyectiles = proyectiles;
  ctxArmas.zonas = zonas;
  ctxArmas.rng = rng;

  // Los jugadores NO se crean aquí: los crea empezarPartida() con lo que se
  // haya elegido en la pantalla de selección. Todo lo de arriba —pools,
  // director, recursos— sí se monta ya, para que al pulsar START no haya que
  // esperar a nada.
  await Pantallas.cargar();

  redimensionar();
  vigilarDensidad();
  document.getElementById('cargando').remove();

  bucle = new Bucle(actualizar, dibujar);
  bucle.arrancar();

  // Asa de depuración. El juego NO la lee: existe para poder inspeccionar el
  // estado desde la consola y, sobre todo, para `avanzar(n)`, que ejecuta n
  // pasos de lógica sin depender de requestAnimationFrame. Con eso se puede
  // reproducir una situación exacta (misma semilla, mismos pasos) al ajustar el
  // balance, que es de lo que va el criterio 10.
  // Los denarios ganados en la partida ya están en MetaProgreso.denarios en
  // caliente (ver enemigo.js/cofre.js), pero solo se ESCRIBEN a localStorage
  // aquí: al cerrar o recargar la pestaña, que es el único momento en que de
  // verdad se podrían perder.
  addEventListener('beforeunload', () => MetaProgreso.guardar());

  window.EMERITA = {
    jugadores, arsenales, enemigos, proyectiles, recogibles, cofres, disparos, zonas, camara, entrada, bucle,
    particulas: Particulas, vfx: VFX, progresion: Progresion, director: Director, jefes: Jefes,
    meta: MetaProgreso,
    ajustes, activo, perfil,
    anyadirJugador, quitarJugador,
    // Estado de las pantallas previas. Sirve para lo mismo que `avanzar`:
    // reproducir una situación sin depender de que llegue la pulsación. `irA`
    // salta a una pantalla concreta —título 0, selección 1, juego 2, tienda 3—
    // sin pasar por el menú, que es la única forma de probar la tienda o la
    // selección desde la consola cuando el navegador no está dando el foco.
    puestos, get pantalla() { return pantalla; }, irA, volverAlMenu,
    // Estado de las pantallas de menu, por el mismo motivo que `puestos`:
    // poder reproducir una eleccion sin depender de que llegue la pulsacion.
    mascotasElegidas, mascotasDisponibles,
    get turnoMascota() { return turnoMascota; },
    get cursorMenu() { return cursorMenu; },
    get pestanyaTienda() { return pestanyaTienda; },
    PANTALLA: { titulo: PANTALLA_TITULO, seleccion: PANTALLA_SELECCION,
                juego: PANTALLA_JUEGO, tienda: PANTALLA_TIENDA },
    // Progreso META y mascotas. Se exponen para poder probar desde la consola
    // sin jugar veinte partidas para reunir denarios, y para poder mirar qué
    // hay guardado sin abrir el inspector de localStorage.
    meta: MetaProgreso, mascotas: Mascotas, audio: GestorAudio,
    get jugador() { return jugadores[0]; },   // atajo para el caso de uno solo
    avanzar(n) { for (let i = 0; i < n; i++) actualizar(DT); return enemigos.activos; }
  };

  // Recuperar el foco tras un alt-tab evita que el acumulador escupa un salto.
  addEventListener('visibilitychange', () => {
    if (!document.hidden) bucle.ultimo = performance.now();
  });
}

arrancar();
