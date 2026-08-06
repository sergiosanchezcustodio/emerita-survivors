import {
  ANCHO_LOGICO, ALTO_LOGICO, ANCHO_FISICO, ALTO_FISICO, ANCHO_UI, ALTO_UI,
  ESCALA_ARTE, TILE, DT
} from './core/constantes.js';
import { Bucle } from './core/bucle.js';
import { Entrada } from './core/entrada.js';
import { Camara } from './core/camara.js';
import { Recursos } from './core/recursos.js';
import { crearRng, hash2 } from './core/rng.js';
import { Jugador } from './entidades/jugador.js';
import { Enemigos, prepararVariantes } from './entidades/enemigo.js';
import { Proyectiles } from './entidades/proyectil.js';
import { Armas } from './sistemas/armas.js';
import { Particulas } from './sistemas/particulas.js';
import { VFX } from './sistemas/vfx.js';
import {
  separacion, contactoJugadores, impactosProyectiles, separarJugadores, ajustes
} from './sistemas/colisiones.js';
import { Recogibles } from './entidades/recogible.js';
import { Cofres, COFRE, LLAMARADA, IMAN, COMIDA } from './entidades/cofre.js';
import { Disparos } from './entidades/disparo.js';
import { Zonas } from './entidades/zonaDanyo.js';
import { Progresion } from './sistemas/progresion.js';
import { dibujarMenuNivel } from './ui/menuNivel.js';
import { dibujarCofre } from './ui/cofre.js';
import { dibujarFicha } from './ui/ficha.js';
import { dibujarPaneles, dibujarReloj, dibujarBarraJefe } from './ui/hud.js';
import { Pantallas, ocupantePersonaje } from './ui/pantallas.js';
import { Capa } from './ui/capa.js';
import { Tema, olvidarDegradados } from './ui/tema.js';
import {
  dibujarDepuracion, dibujarPausa, dibujarAbatido
} from './ui/depuracion.js';
import { Director, aparecerTanda } from './sistemas/director.js';
import { Jefes } from './sistemas/jefes.js';
import { NIVEL } from './datos/niveles/merida.js';
import { PERSONAJES, ORDEN_PERSONAJES } from './datos/personajes.js';
import { ARMAS } from './datos/armas.js';


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
let pantalla = PANTALLA_TITULO;

// Un hueco por control: null si ese jugador no se ha sumado, y si no
// `{ personaje, listo }`. El índice ES el del control, así que el mando 3
// maneja siempre el puesto 3 aunque el 2 esté vacío.
const puestos = new Array(4).fill(null);

// Cambiar de pantalla en un solo sitio. Hay dos cosas que van fuera del lienzo
// y que hay que mover con el estado: la chuleta de atajos del pie, que en las
// pantallas ilustradas sobra, y nada más — si algún día hay una tercera, va
// aquí y no repartida por el bucle.
function irA(nueva) {
  pantalla = nueva;
  document.body.classList.toggle('enMenu', nueva !== PANTALLA_JUEGO);
}

let pausado = false;
// Índice del jugador cuya ficha está abierta, o -1. Se abre con Select en el
// mando de ese jugador o con Tab en el teclado, y congela el mundo: es una
// pantalla para mirar números con calma, y mirarlos mientras te rodean no es
// mirarlos con calma.
let fichaAbierta = -1;
let verDepuracion = false;
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
function anyadirJugador(idPersonaje) {
  if (jugadores.length >= MAX_JUGADORES) return null;
  const i = jugadores.length;
  const j = new Jugador(idPersonaje || ORDEN_PERSONAJES[i % ORDEN_PERSONAJES.length]);

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
  return j;
}

function quitarJugador() {
  if (jugadores.length <= 1) return;   // siempre queda al menos uno
  jugadores.pop();
  arsenales.pop();
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

// --- Escalado entero al viewport -------------------------------------------
// Múltiplos enteros y solo enteros: cualquier otra cosa rompe la rejilla de
// píxeles y emborrona el pixel art por mucho que se apague el suavizado.
function redimensionar() {
  const factor = Math.max(1, Math.floor(Math.min(
    innerWidth / ANCHO_FISICO, innerHeight / ALTO_FISICO)));
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
botonPantallaCompleta.addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
});
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

function entradaTitulo() {
  // Cualquier cosa vale. Es la misma decisión que la pantalla del cofre: no se
  // pide una elección, se pide un "vamos", y obligar a buscar la tecla correcta
  // para eso es fricción por nada.
  if (!entrada.algunFlanco()) return;
  puestos.fill(null);
  puestos[0] = { personaje: 0, listo: false };
  irA(PANTALLA_SELECCION);
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
  // Un mando enchufado entra pulsando A. Con J entra uno más por teclado, que
  // es como se prueba el cooperativo sin cuatro mandos encima de la mesa.
  if (hueco >= 0) {
    for (let i = 1; i < puestos.length; i++) {
      if (puestos[i]) continue;
      const c = entrada.controles[i];
      if (c && c.conectado && c.consumirBoton(0)) {
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
  if (presentes.length > 0 && presentes.every((p) => p.listo)) empezarPartida();
}

// Crea de verdad a los jugadores elegidos y arranca. Hasta aquí no existía ni
// uno solo: los pools y el director ya estaban montados desde `arrancar`, pero
// `jugadores` estaba vacío a propósito, porque un jugador en pie durante el
// título es un jugador al que ya le está corriendo el reloj.
function empezarPartida() {
  for (let i = 0; i < puestos.length; i++) {
    if (puestos[i]) anyadirJugador(ORDEN_PERSONAJES[puestos[i].personaje]);
  }
  camara.situar(jugadores[0].x, jugadores[0].y);
  Director.reiniciar();
  irA(PANTALLA_JUEGO);
}

// --- Lógica -----------------------------------------------------------------
function actualizar(dt) {
  entrada.actualizar();

  // Título y selección salen por aquí, antes de tocar nada de la simulación:
  // todo lo que viene debajo da por hecho que hay al menos un jugador vivo.
  if (pantalla !== PANTALLA_JUEGO) {
    if (pantalla === PANTALLA_TITULO) entradaTitulo();
    else entradaSeleccion();
    entrada.limpiarFlanco();
    return;
  }

  // El cofre se atiende ANTES que nada, incluidos los atajos de depuración. Se
  // cierra con cualquier tecla, así que si los atajos fueran antes, cerrarlo con
  // el 2 soltaría además quinientas serpientes.
  if (Progresion.cofreAbierto) {
    if (entrada.algunFlanco()) Progresion.cerrarCofre();
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
  if (Progresion.abierto) { menuNivelEntrada(); entrada.limpiarFlanco(); return; }

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
  enemigos.mover(dt, jugadores);
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
  return pausado || fichaAbierta >= 0 || Progresion.abierto ||
         Progresion.cofreAbierto || VFX.congelado > 0;
}

function dibujar(alpha) {
  // Título y selección: no hay mundo que dibujar. La ilustración ocupa el
  // lienzo del juego entero y los resaltados van en la capa de interfaz, así
  // que ni se limpia el suelo ni se recorren pools que están vacíos.
  if (pantalla !== PANTALLA_JUEGO) {
    Capa.limpiar();
    if (pantalla === PANTALLA_TITULO) Pantallas.titulo(ctx, Capa.ctx);
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
  enemigos.dibujar(ctx, camara, alpha, jugadores);
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
  dibujarBarraJefe(ctxUi, Jefes.info(enemigos));

  // Solo se pierde cuando caen TODOS. Con un compañero en pie la partida sigue,
  // que es lo que hace que el cooperativo tenga sentido.
  //
  // El cofre manda sobre todo lo demás: es el único que aparece sin haberlo
  // pedido, y si una subida de nivel simultánea se pintara encima nadie sabría
  // qué le acaba de tocar.
  if (jugadores.every((j) => j.abatido)) dibujarAbatido(ctxUi, ALTO_UI);
  if (fichaAbierta >= 0) dibujarFicha(ctxUi, jugadores, fichaAbierta);
  else if (Progresion.cofreAbierto) dibujarCofre(ctxUi, jugadores);
  else if (Progresion.abierto) dibujarMenuNivel(ctxUi, jugadores);
  else if (pausado) dibujarPausa(ctxUi, ALTO_UI);
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
function dibujarSuelo(izq, arr) {
  const tiles = Recursos.tilesSuelo;
  if (tiles.length === 0) return;

  const anchoTile = Recursos.anchoSuelo;
  const altoTile = Recursos.altoSuelo;
  const tx0 = Math.floor(izq / anchoTile);
  const ty0 = Math.floor(arr / altoTile);
  const columnas = Math.ceil(ANCHO_LOGICO / anchoTile) + 1;
  const filas    = Math.ceil(ALTO_LOGICO  / altoTile) + 1;

  tilesDibujados = 0;
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
async function arrancar() {
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
  cofres.alRecoger = (jugador, tipo) => {
    if (tipo === COFRE) Progresion.abrirCofre(jugador, jugadores);
    else usarConsumible(jugador, tipo);
  };

  // Comparte el RNG con todo lo demás, así que con la misma semilla salen las
  // mismas oleadas: es el criterio 10 del plan y sin él no se puede comparar un
  // ajuste de balance con el anterior.
  Director.iniciar(NIVEL, rng);
  // El director decide cuándo cae un consumible; los objetos del suelo saben
  // dibujarse y dejarse recoger. Ninguno de los dos sabe del otro más que esto.
  Director.objetos = cofres;
  Jefes.iniciar(rng);

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
  window.EMERITA = {
    jugadores, arsenales, enemigos, proyectiles, recogibles, cofres, disparos, zonas, camara, entrada, bucle,
    particulas: Particulas, vfx: VFX, progresion: Progresion, director: Director, jefes: Jefes,
    ajustes, activo, perfil,
    anyadirJugador, quitarJugador,
    // Estado de las pantallas previas. Sirve para lo mismo que `avanzar`:
    // reproducir una situación sin depender de que llegue la pulsación.
    puestos, get pantalla() { return pantalla; },
    get jugador() { return jugadores[0]; },   // atajo para el caso de uno solo
    avanzar(n) { for (let i = 0; i < n; i++) actualizar(DT); return enemigos.activos; }
  };

  // Recuperar el foco tras un alt-tab evita que el acumulador escupa un salto.
  addEventListener('visibilitychange', () => {
    if (!document.hidden) bucle.ultimo = performance.now();
  });
}

arrancar();
