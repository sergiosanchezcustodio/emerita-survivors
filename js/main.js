import {
  ANCHO_LOGICO, ALTO_LOGICO, ANCHO_FISICO, ALTO_FISICO, ESCALA_ARTE, TILE, DT
} from './core/constantes.js';
import { Bucle } from './core/bucle.js';
import { Entrada } from './core/entrada.js';
import { Camara } from './core/camara.js';
import { Recursos } from './core/recursos.js';
import { crearRng, hash2 } from './core/rng.js';
import { Jugador } from './entidades/jugador.js';
import { Enemigos } from './entidades/enemigo.js';
import { Proyectiles } from './entidades/proyectil.js';
import { Armas } from './sistemas/armas.js';
import { Particulas } from './sistemas/particulas.js';
import { VFX } from './sistemas/vfx.js';
import {
  separacion, contactoJugadores, impactosProyectiles, separarJugadores, ajustes
} from './sistemas/colisiones.js';
import { Recogibles } from './entidades/recogible.js';
import { Zonas } from './entidades/zonaDanyo.js';
import { Progresion } from './sistemas/progresion.js';
import { dibujarMenuNivel } from './ui/menuNivel.js';
import { dibujarPaneles } from './ui/hud.js';
import { Capa } from './ui/capa.js';
import { Tema, olvidarDegradados } from './ui/tema.js';
import {
  dibujarDepuracion, dibujarPausa, dibujarAbatido, dibujarSimulacro
} from './ui/depuracion.js';
import { Simulacro, aparecerTanda } from './sistemas/simulacro.js';
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
// Zonas: charcos, trampas, auras, ondas y explosiones comparten pool.
const CAPACIDAD_ZONAS = 220;

const SEMILLA = 0xE3E21A;

// --- Aparición de prueba en bruto (teclas 1-4) ------------------------------
// Esto NO es la curva del juego: es un martillo para meter N enemigos de golpe y
// ver si el motor aguanta. Sirve para medir fps y poco más — en una partida no
// aparecen 500 serpientes a la vez, así que no dice nada sobre el ritmo.
//
// Para juzgar el daño, la experiencia y el movimiento contra la presión real
// está el SIMULACRO DE OLEADAS (tecla 5), que recorre los veinte minutos de
// datos/niveles/merida.js. Las dos cosas conviven porque responden preguntas
// distintas.
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
// sistemas/simulacro.js y la comparten los atajos y la curva de verdad: si la
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
let zonas = null;
let bucle = null;

// Contexto que reciben los comportamientos de arma. Se construye UNA vez y se
// reapunta al jugador que toca antes de cada llamada: crear un objeto literal
// por jugador y paso de lógica sería asignar memoria en caliente.
const ctxArmas = { jugador: null, enemigos: null, proyectiles: null, zonas: null, rng: null };

let pausado = false;
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
function anyadirJugador() {
  if (jugadores.length >= MAX_JUGADORES) return null;
  const i = jugadores.length;
  const j = new Jugador(ORDEN_PERSONAJES[i % ORDEN_PERSONAJES.length]);

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

// Cada mando que se enchufa suma un jugador, hasta cuatro.
addEventListener('gamepadconnected', () => {
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

// Aparecen alrededor de la CÁMARA, no de un jugador concreto: con el grupo
// repartido por la pantalla, anclarlo a uno dejaría el borde opuesto vacío.
function tanda(cantidad, mezcla) {
  aparecerTanda(enemigos, camara, cantidad, mezcla, rng);
}

// --- Lógica -----------------------------------------------------------------
function actualizar(dt) {
  entrada.actualizar();

  if (entrada.consumirFlanco('F3')) verDepuracion = !verDepuracion;
  if (entrada.consumirFlanco('Escape', 9)) pausado = !pausado;
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
  // Simulacro de oleadas: la curva de veinte minutos del nivel, con su escalado
  // y su techo de densidad. Al encenderlo se limpia la pantalla porque lo que se
  // mide es la curva, y arrastrar ochocientas serpientes de la tecla 3 falsea el
  // minuto 0 entero. 6 y 7 mueven el reloj un minuto: probar el minuto 16
  // esperando dieciséis minutos no es probar, es esperar.
  if (entrada.consumirFlanco('Digit5')) {
    if (Simulacro.alternar()) { enemigos.vaciar(); proyectiles.vaciar(); zonas.vaciar(); }
  }
  if (entrada.consumirFlanco('Digit6')) Simulacro.saltar(60);
  if (entrada.consumirFlanco('Digit7')) Simulacro.saltar(-60);
  if (entrada.consumirFlanco('KeyX')) { enemigos.vaciar(); proyectiles.vaciar(); zonas.vaciar(); }
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

  // El simulacro aparece DESPUÉS de mover la cámara: si lo hiciera antes, con la
  // cámara corriendo detrás del grupo los enemigos entrarían medio metidos en
  // pantalla por el lado hacia el que se avanza.
  Simulacro.actualizar(dt, enemigos, camara);
  entrada.limpiarFlanco();
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
function dibujar(alpha) {
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
  // información correcta, no un fallo.
  recogibles.dibujar(ctx, alpha);
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
      sustituidos: Recursos.sustituidos.length
    });
  }
  dibujarPaneles(ctxUi, jugadores);
  dibujarSimulacro(ctxUi);

  // Solo se pierde cuando caen TODOS. Con un compañero en pie la partida sigue,
  // que es lo que hace que el cooperativo tenga sentido.
  if (jugadores.every((j) => j.abatido)) dibujarAbatido(ctxUi, ALTO_FISICO);
  if (Progresion.abierto) dibujarMenuNivel(ctxUi, jugadores);
  else if (pausado) dibujarPausa(ctxUi, ALTO_FISICO);
  perfil.interfaz = performance.now() - t;
}

// Suelo infinito con scroll toroidal: no hay mapa en memoria, la variante de
// cada celda sale de un hash de sus coordenadas. Se dibuja solo lo que toca el
// viewport, con un tile de margen.
function dibujarSuelo(izq, arr) {
  const tiles = Recursos.tilesSuelo;
  if (tiles.length === 0) return;

  const tx0 = Math.floor(izq / TILE);
  const ty0 = Math.floor(arr / TILE);
  const columnas = Math.ceil(ANCHO_LOGICO / TILE) + 1;
  const filas    = Math.ceil(ALTO_LOGICO  / TILE) + 1;

  tilesDibujados = 0;
  for (let fy = 0; fy < filas; fy++) {
    const gy = ty0 + fy;
    for (let fx = 0; fx < columnas; fx++) {
      const gx = tx0 + fx;
      const variante = hash2(gx, gy) % tiles.length;
      ctx.drawImage(tiles[variante], gx * TILE, gy * TILE, TILE, TILE);
      tilesDibujados++;
    }
  }
}

// --- Arranque ---------------------------------------------------------------
async function arrancar() {
  await Recursos.cargar(NIVEL);

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
  zonas = new Zonas(CAPACIDAD_ZONAS);
  enemigos.recogibles = recogibles;
  Progresion.iniciar(rng);
  // Comparte el RNG con todo lo demás, así que con la misma semilla salen las
  // mismas oleadas: es el criterio 10 del plan y sin él no se puede comparar un
  // ajuste de balance con el anterior.
  Simulacro.iniciar(NIVEL, rng);

  ctxArmas.enemigos = enemigos;
  ctxArmas.proyectiles = proyectiles;
  ctxArmas.zonas = zonas;
  ctxArmas.rng = rng;

  // Siempre arranca al menos el jugador 1. Los demás entran al enchufar mando
  // o pulsando J.
  anyadirJugador();
  camara.situar(jugadores[0].x, jugadores[0].y);

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
    jugadores, arsenales, enemigos, proyectiles, recogibles, zonas, camara, entrada, bucle,
    particulas: Particulas, vfx: VFX, progresion: Progresion, simulacro: Simulacro,
    ajustes, activo, perfil,
    anyadirJugador, quitarJugador,
    get jugador() { return jugadores[0]; },   // atajo para el caso de uno solo
    avanzar(n) { for (let i = 0; i < n; i++) actualizar(DT); return enemigos.activos; }
  };

  // Recuperar el foco tras un alt-tab evita que el acumulador escupa un salto.
  addEventListener('visibilitychange', () => {
    if (!document.hidden) bucle.ultimo = performance.now();
  });
}

arrancar();
