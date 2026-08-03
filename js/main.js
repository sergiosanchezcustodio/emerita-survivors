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
import { dibujarDepuracion, dibujarPausa, dibujarAbatido } from './ui/depuracion.js';
import { NIVEL } from './datos/niveles/merida.js';
import { ARMA_INICIAL } from './datos/armas.js';

// Los cuatro se re-exportaron con alfa real y proporciones parejas, así que
// ninguno cae ya a placeholder. Se rotan con C para comparar siluetas.
const PERSONAJES = ['eric', 'lucy', 'sara', 'vicky'];

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

const SEMILLA = 0xE3E21A;

// --- Aparición de prueba (TEMPORAL, Fase 2) ---------------------------------
// Esto lo sustituye el director de oleadas en la Fase 5, que leerá los eventos
// de datos/niveles/merida.js. Aquí solo hace falta poder poner 500 enemigos en
// pantalla para validar los 60 fps, que es el criterio de esta fase.
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
// Aparición en ELIPSE, no en círculo. El viewport es apaisado (480x270): con un
// círculo, los que nacen a los lados aparecen a 240px del borde mientras los de
// arriba y abajo lo hacen a 105, y estos últimos se colarían en cámara. Con los
// semiejes proporcionales a la pantalla, todos nacen igual de cerca del borde.
const SEMI_APARICION_X = ANCHO_LOGICO * 0.62;   // ~298, borde a 240
const SEMI_APARICION_Y = ALTO_LOGICO  * 0.62;   // ~167, borde a 135
const DISPERSION = 0.30;                        // ensancha el anillo de entrada

const lienzo = document.getElementById('juego');
const ctx = lienzo.getContext('2d', { alpha: false });
lienzo.width = ANCHO_FISICO;
lienzo.height = ALTO_FISICO;

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
let bucle = null;

// Contexto que reciben los comportamientos de arma. Se construye UNA vez y se
// reapunta al jugador que toca antes de cada llamada: crear un objeto literal
// por jugador y paso de lógica sería asignar memoria en caliente.
const ctxArmas = { jugador: null, enemigos: null, proyectiles: null, rng: null };

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
const perfil = { suelo: 0, entidades: 0, efectos: 0, texto: 0 };
const activo = { suelo: true, particulas: true, numeros: true, efectos: true, destello: true };

// --- Alta y baja de jugadores ------------------------------------------------
// Un jugador entra al enchufar un mando, o a mano con J, para poder probar el
// cooperativo sin cuatro mandos encima de la mesa.
function anyadirJugador() {
  if (jugadores.length >= MAX_JUGADORES) return null;
  const i = jugadores.length;
  const j = new Jugador(PERSONAJES[i % PERSONAJES.length]);

  // En abanico alrededor del primero, para que no nazcan uno dentro de otro.
  const ang = (i / MAX_JUGADORES) * Math.PI * 2;
  const cx = i === 0 ? ANCHO_LOGICO / 2 : jugadores[0].x;
  const cy = i === 0 ? ALTO_LOGICO / 2 : jugadores[0].y;
  j.x = j.xPrev = j.xVista = cx + (i === 0 ? 0 : Math.cos(ang) * 26);
  j.y = j.yPrev = j.yVista = cy + (i === 0 ? 0 : Math.sin(ang) * 26);
  jugadores.push(j);

  // Arsenal propio. En cooperativo las armas no se comparten, y en la Fase 4 el
  // sorteo de subida de nivel impedirá además que dos lleven la misma.
  const arsenal = new Armas(rng);
  arsenal.equipar(ARMA_INICIAL);
  arsenales.push(arsenal);
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

// --- Escalado entero al viewport -------------------------------------------
// Múltiplos enteros y solo enteros: cualquier otra cosa rompe la rejilla de
// píxeles y emborrona el pixel art por mucho que se apague el suavizado.
function redimensionar() {
  const factor = Math.max(1, Math.floor(Math.min(
    innerWidth / ANCHO_FISICO, innerHeight / ALTO_FISICO)));
  zoomPantalla = factor;
  lienzo.style.width  = (ANCHO_FISICO * factor) + 'px';
  lienzo.style.height = (ALTO_FISICO  * factor) + 'px';
}
addEventListener('resize', redimensionar);

// Aparecen alrededor de la CÁMARA, no de un jugador concreto: con el grupo
// repartido por la pantalla, anclarlo a uno dejaría el borde opuesto vacío.
function aparecerTanda(cantidad, mezcla) {
  for (let i = 0; i < cantidad; i++) {
    const ang = rng() * Math.PI * 2;
    const k = 1 + rng() * DISPERSION;
    const tipo = mezcla[(rng() * mezcla.length) | 0];
    const e = enemigos.aparecer(tipo,
      camara.x + Math.cos(ang) * SEMI_APARICION_X * k,
      camara.y + Math.sin(ang) * SEMI_APARICION_Y * k);
    if (!e) break;                 // pool lleno: no insistir
  }
}

// --- Lógica -----------------------------------------------------------------
function actualizar(dt) {
  entrada.actualizar();

  if (entrada.consumirFlanco('F3')) verDepuracion = !verDepuracion;
  if (entrada.consumirFlanco('Escape', 9)) pausado = !pausado;
  if (entrada.consumirFlanco('KeyC')) {
    // Cambia el personaje del jugador 1; los demás llevan el suyo.
    indicePersonaje = (indicePersonaje + 1) % PERSONAJES.length;
    jugadores[0].personaje = PERSONAJES[indicePersonaje];
  }
  if (entrada.consumirFlanco('KeyJ')) anyadirJugador();
  if (entrada.consumirFlanco('KeyH')) quitarJugador();
  if (entrada.consumirFlanco('Digit1')) aparecerTanda(100, MEZCLA_TEMPRANA);
  if (entrada.consumirFlanco('Digit2')) aparecerTanda(500, MEZCLA_TEMPRANA);
  if (entrada.consumirFlanco('Digit3')) aparecerTanda(800, MEZCLA_TEMPRANA);
  if (entrada.consumirFlanco('Digit4')) aparecerTanda(300, MEZCLA_TARDIA);
  if (entrada.consumirFlanco('KeyX')) { enemigos.vaciar(); proyectiles.vaciar(); }
  if (entrada.consumirFlanco('KeyG')) {
    const nuevo = !jugadores[0].inmortal;
    for (let i = 0; i < jugadores.length; i++) jugadores[i].inmortal = nuevo;
  }
  if (entrada.consumirFlanco('KeyR')) {
    for (let i = 0; i < jugadores.length; i++) jugadores[i].reiniciar();
  }
  if (entrada.consumirFlanco('KeyL')) subirTodasLasArmas();
  if (entrada.consumirFlanco('KeyK')) equiparGladius();
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
  proyectiles.mover(dt);

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
    arsenales[i].actualizarTajos(dt);
  }
  impactosProyectiles(proyectiles, enemigos);

  // Los muertos se retiran cuando ya nadie recorre la rejilla. Hasta aquí solo
  // estaban marcados con vida a cero.
  enemigos.retirarMuertos();
  proyectiles.reciclarFuera(camara);

  Particulas.actualizar(dt);
  VFX.actualizar(dt);

  // La cámara va al centro del grupo y la correa impide que nadie se salga de
  // pantalla. Sujetar DESPUÉS de mover la cámara: al revés, el rezagado toparía
  // contra un borde que ya no está donde se le sujetó.
  camara.seguirGrupo(jugadores, dt);
  camara.sujetar(jugadores);
  // Después de la correa: si dos topan contra el mismo borde, hay que volver a
  // separarlos o el tope los dejaría uno dentro del otro.
  separarJugadores(jugadores);
  entrada.limpiarFlanco();
}

// --- Atajos de prueba (TEMPORAL, Fase 3) ------------------------------------
// La progresión de verdad llega en la Fase 4 con la pantalla de subida de nivel.
function subirTodasLasArmas() {
  for (let i = 0; i < arsenales.length; i++) {
    const eq = arsenales[i].equipadas;
    for (let k = 0; k < eq.length; k++) arsenales[i].subirNivel(eq[k].id);
  }
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
  enemigos.dibujar(ctx, camara, alpha, jugadores);
  perfil.entidades = performance.now() - t;

  // Por encima de las entidades: los efectos tienen que leerse siempre, aunque
  // haya ochocientos cuerpos debajo.
  t = performance.now();
  if (activo.efectos) {
    proyectiles.dibujar(ctx, alpha);
    for (let i = 0; i < arsenales.length; i++) arsenales[i].dibujarTajos(ctx);
  }
  if (activo.particulas) Particulas.dibujar(ctx, alpha);
  perfil.efectos = performance.now() - t;

  // Números de daño: en píxeles físicos, con la matriz identidad. Son
  // tipografía, no pixel art.
  t = performance.now();
  if (activo.numeros) VFX.dibujarNumeros(ctx, offX, offY);
  perfil.texto = performance.now() - t;

  if (verDepuracion) {
    dibujarDepuracion(ctx, {
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
  // Solo se pierde cuando caen TODOS. Con un compañero en pie la partida sigue,
  // que es lo que hace que el cooperativo tenga sentido.
  if (jugadores.every((j) => j.abatido)) dibujarAbatido(ctx, ALTO_FISICO);
  if (pausado) dibujarPausa(ctx, ALTO_FISICO);
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

  // Todos los pools se preasignan aquí, antes del primer frame.
  enemigos = new Enemigos(CAPACIDAD_ENEMIGOS, rng);
  proyectiles = new Proyectiles(CAPACIDAD_PROYECTILES);
  Particulas.iniciar(CAPACIDAD_PARTICULAS);
  VFX.iniciar(CAPACIDAD_NUMEROS);

  ctxArmas.enemigos = enemigos;
  ctxArmas.proyectiles = proyectiles;
  ctxArmas.rng = rng;

  // Siempre arranca al menos el jugador 1. Los demás entran al enchufar mando
  // o pulsando J.
  anyadirJugador();
  camara.situar(jugadores[0].x, jugadores[0].y);

  redimensionar();
  document.getElementById('cargando').remove();

  bucle = new Bucle(actualizar, dibujar);
  bucle.arrancar();

  // Asa de depuración. El juego NO la lee: existe para poder inspeccionar el
  // estado desde la consola y, sobre todo, para `avanzar(n)`, que ejecuta n
  // pasos de lógica sin depender de requestAnimationFrame. Con eso se puede
  // reproducir una situación exacta (misma semilla, mismos pasos) al ajustar el
  // balance, que es de lo que va el criterio 10.
  window.EMERITA = {
    jugadores, arsenales, enemigos, proyectiles, camara, entrada, bucle,
    particulas: Particulas, vfx: VFX, ajustes, activo, perfil,
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
