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
import { separacion, contactoJugador } from './sistemas/colisiones.js';
import { dibujarDepuracion, dibujarPausa, dibujarAbatido } from './ui/depuracion.js';
import { NIVEL } from './datos/niveles/merida.js';

// Los cuatro se re-exportaron con alfa real y proporciones parejas, así que
// ninguno cae ya a placeholder. Se rotan con C para comparar siluetas.
const PERSONAJES = ['eric', 'lucy', 'sara', 'vicky'];

// Capacidad del pool. El objetivo del plan son 800 entidades simultáneas; el
// margen extra absorbe los picos de una oleada que entra mientras la anterior
// aún no ha salido por culling.
const CAPACIDAD_ENEMIGOS = 1000;

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

const entrada = new Entrada(lienzo);
const camara = new Camara();
const rng = crearRng(SEMILLA);
let jugador = null;
let enemigos = null;
let bucle = null;

let pausado = false;
let verDepuracion = false;
let zoomPantalla = 1;
let tilesDibujados = 0;
let indicePersonaje = 0;

// Referencia creada UNA vez: se la pasamos al gestor de enemigos para que
// intercale al jugador en la ordenación por profundidad. Si se construyera en
// cada frame sería una asignación por frame, justo lo que el pool evita.
const pintarJugador = () => jugador.dibujar(ctx);

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

function aparecerTanda(cantidad, mezcla) {
  for (let i = 0; i < cantidad; i++) {
    const ang = rng() * Math.PI * 2;
    const k = 1 + rng() * DISPERSION;
    const tipo = mezcla[(rng() * mezcla.length) | 0];
    const e = enemigos.aparecer(tipo,
      jugador.x + Math.cos(ang) * SEMI_APARICION_X * k,
      jugador.y + Math.sin(ang) * SEMI_APARICION_Y * k);
    if (!e) break;                 // pool lleno: no insistir
  }
}

// --- Lógica -----------------------------------------------------------------
function actualizar(dt) {
  entrada.actualizar();

  if (entrada.consumirFlanco('F3')) verDepuracion = !verDepuracion;
  if (entrada.consumirFlanco('Escape', 9)) pausado = !pausado;
  if (entrada.consumirFlanco('KeyC')) {
    indicePersonaje = (indicePersonaje + 1) % PERSONAJES.length;
    jugador.personaje = PERSONAJES[indicePersonaje];
  }
  if (entrada.consumirFlanco('Digit1')) aparecerTanda(100, MEZCLA_TEMPRANA);
  if (entrada.consumirFlanco('Digit2')) aparecerTanda(500, MEZCLA_TEMPRANA);
  if (entrada.consumirFlanco('Digit3')) aparecerTanda(800, MEZCLA_TEMPRANA);
  if (entrada.consumirFlanco('Digit4')) aparecerTanda(300, MEZCLA_TARDIA);
  if (entrada.consumirFlanco('KeyX')) enemigos.vaciar();
  if (entrada.consumirFlanco('KeyG')) jugador.inmortal = !jugador.inmortal;
  if (entrada.consumirFlanco('KeyR')) jugador.reiniciar();

  if (pausado) { entrada.limpiarFlanco(); return; }

  jugador.actualizar(dt, entrada);
  enemigos.mover(dt, jugador);

  // Orden deliberado: primero se recicla (el pool intercambia posiciones y
  // dejaría los índices de la rejilla apuntando a otras entidades), y solo
  // entonces se construye la rejilla. Se construye UNA vez y la usan los dos
  // sistemas que vienen detrás.
  //
  // La separación mueve hasta 4px después de construirla, así que el contacto
  // trabaja con una rejilla desfasada esos 4px. Es inofensivo: la consulta 3x3
  // cubre 64px y el alcance real del contacto son 49 como mucho (radio 39 de la
  // hidra + 10 del jugador), o sea 15px de margen.
  enemigos.reciclarLejanos(camara.x, camara.y);
  enemigos.rejilla.reconstruir(
    enemigos.pool.items, enemigos.pool.activos, camara.x, camara.y);
  separacion(enemigos, jugador);
  contactoJugador(enemigos, jugador);

  camara.seguir(jugador.x, jugador.y, dt);
  entrada.limpiarFlanco();
}

// --- Render -----------------------------------------------------------------
function dibujar(alpha) {
  jugador.interpolar(alpha);
  camara.interpolar(alpha);

  // La cámara se ancla a píxel físico entero. Sin esto el suelo tiembla:
  // el vecino más próximo va duplicando y saltando filas de píxeles.
  const offX = Math.round(camara.izquierda * ESCALA_ARTE);
  const offY = Math.round(camara.arriba * ESCALA_ARTE);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;

  ctx.setTransform(ESCALA_ARTE, 0, 0, ESCALA_ARTE, -offX, -offY);
  dibujarSuelo(offX / ESCALA_ARTE, offY / ESCALA_ARTE);
  enemigos.dibujar(ctx, camara, alpha, jugador.yVista, pintarJugador);

  if (verDepuracion) {
    dibujarDepuracion(ctx, {
      fps: bucle.fps,
      msUpdate: bucle.msUpdate,
      msRender: bucle.msRender,
      pasos: bucle.pasosUltimoFrame,
      entidades: enemigos.activos + 1,
      dibujados: enemigos.dibujados,
      pool: enemigos.pool,
      reciclados: enemigos.reciclados,
      celdas: enemigos.rejilla.numCeldas,
      tiles: tilesDibujados,
      jx: jugador.x, jy: jugador.y,
      vida: jugador.vida, vidaMaxima: jugador.vidaMaxima,
      golpes: jugador.golpesRecibidos,
      inmortal: jugador.inmortal,
      cx: camara.x, cy: camara.y,
      fuente: entrada.fuente,
      gamepad: entrada.hayGamepad,
      zoom: zoomPantalla,
      sustituidos: Recursos.sustituidos.length
    });
  }
  if (jugador.abatido) dibujarAbatido(ctx, ALTO_FISICO);
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

  jugador = new Jugador(PERSONAJES[indicePersonaje]);
  jugador.x = jugador.xPrev = ANCHO_LOGICO / 2;
  jugador.y = jugador.yPrev = ALTO_LOGICO / 2;
  camara.situar(jugador.x, jugador.y);

  // Todo el pool se preasigna aquí, antes del primer frame.
  enemigos = new Enemigos(CAPACIDAD_ENEMIGOS, rng);

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
    jugador, enemigos, camara, entrada, bucle,
    avanzar(n) { for (let i = 0; i < n; i++) actualizar(DT); return enemigos.activos; }
  };

  // Recuperar el foco tras un alt-tab evita que el acumulador escupa un salto.
  addEventListener('visibilitychange', () => {
    if (!document.hidden) bucle.ultimo = performance.now();
  });
}

arrancar();
