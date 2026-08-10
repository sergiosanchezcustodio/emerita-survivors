// GESTOR DE AUDIO — síntesis procedural con Web Audio API. Cero ficheros,
// cero dependencias: el mismo principio que rige todo el arte del juego
// (pixel art dibujado a mano, iconos rasterizados una vez) aplicado al
// sonido. Golpes, muertes, subidas de nivel y la música de fondo se generan
// en tiempo real con osciladores y ruido; no hay un solo .mp3/.ogg en el
// proyecto.
//
// TOLERANTE A LA AUSENCIA DE AudioContext: si el navegador lo bloquea (sin
// gesto del usuario todavía) o no existe, `ctx` se queda a null y todos los
// métodos vuelven a ser una operación en silencio. Nunca un error que
// interrumpa la partida — igual que pedía la sección 15 del plan para el
// caso "sin assets".
//
// LOS NODOS DE WEB AUDIO SÍ SE CREAN CON `new` EN CALIENTE, y es la única
// excepción consciente al "cero `new` durante la partida" del proyecto: la
// propia API los diseña de un solo uso —un OscillatorNode no se reinicia ni
// se recicla, se crea, suena una vez y se tira— así que no existe un pool
// posible. Se acota el coste con un PRESUPUESTO por paso de lógica (igual
// que VFX.numero) y un límite de voces simultáneas por sonido: unos pocos
// osciladores por frame se oyen igual de bien que doscientos, y son los que
// de verdad cuesta crear y GC-ear.
//
// LA VARIACIÓN DE TONO (±8%, pedida en el plan contra la fatiga auditiva) usa
// Math.random(), NUNCA el rng con semilla del director: es cosmético puro,
// como el temporizador del tirón de la tragaperras (ver sistemas/progresion.
// js) — si tirara de la semilla compartida, dos partidas con el mismo
// director dejarían de sonar igual sin que ninguna decisión de juego hubiera
// cambiado, y el criterio 10 del plan es sobre REPRODUCIBILIDAD DE LA
// PARTIDA, no sobre qué tono exacto suena en un golpe.

let ctx = null;
let gMaestro = null;
let gEfectos = null;
let gMusica = null;
let bufferRuido = null;

// --- Presupuesto por paso de lógica -----------------------------------------
// Un arco de melé a nivel 8 alcanza a un centenar de enemigos de una vez: sin
// tope, eso son cien osciladores creados en el mismo paso por un golpe que ya
// se ha oído con los primeros seis.
const PRESUPUESTO_PASO = 8;
let _presupuesto = 0;

// --- Límite de voces simultáneas por sonido ---------------------------------
// Cada entrada guarda cuándo termina cada voz que suena ahora mismo (tiempo de
// AudioContext). Purgar las vencidas y contar las que quedan es más barato
// que llevar la cuenta con temporizadores de JS aparte.
const _vocesActivas = { golpe: [], muerteEnemigo: [], recogerGema: [], danyoJugador: [] };
const LIMITE_VOCES = { golpe: 4, muerteEnemigo: 5, recogerGema: 4, danyoJugador: 3 };

function puedeSonar(nombre, duracion) {
  const activas = _vocesActivas[nombre];
  if (!activas) return true;             // sonidos raros (jefe, nivel, cofre): sin límite
  const ahora = ctx.currentTime;
  while (activas.length && activas[0] <= ahora) activas.shift();
  if (activas.length >= LIMITE_VOCES[nombre]) return false;
  activas.push(ahora + duracion);
  activas.sort((a, b) => a - b);
  return true;
}

// Variación de tono ±8%, ver nota de cabecera sobre por qué NO usa el rng
// compartido.
function variar(freq) {
  return freq * (1 + (Math.random() * 2 - 1) * 0.08);
}

// --- Fábricas de sonido ------------------------------------------------------

// Tono simple: un oscilador con envolvente de ataque corto y caída
// exponencial. Es la base de casi todos los efectos.
function tono(destino, freq, duracion, tipo, volumen, desfase = 0) {
  const t0 = ctx.currentTime + desfase;
  const osc = ctx.createOscillator();
  osc.type = tipo;
  osc.frequency.setValueAtTime(variar(freq), t0);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(volumen, t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duracion);
  osc.connect(g).connect(destino);
  osc.start(t0);
  osc.stop(t0 + duracion + 0.02);
  return osc;
}

// Ráfaga de ruido blanco filtrada: la base de golpes y muertes, que suenan a
// impacto y no a nota musical.
function ruido(destino, duracion, volumen, tipoFiltro, freqFiltro, desfase = 0) {
  const t0 = ctx.currentTime + desfase;
  const fuente = ctx.createBufferSource();
  fuente.buffer = bufferRuido;
  const filtro = ctx.createBiquadFilter();
  filtro.type = tipoFiltro;
  filtro.frequency.setValueAtTime(variar(freqFiltro), t0);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(volumen, t0 + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duracion);
  fuente.connect(filtro).connect(g).connect(destino);
  fuente.start(t0);
  fuente.stop(t0 + duracion + 0.02);
}

// --- Música: patrones y reproductor por horizonte ----------------------------
//
// En vez de un `setInterval`/`setTimeout` marcando cada nota, se PROGRAMA por
// adelantado un bucle entero de golpe (Web Audio acepta `start(t)` en
// cualquier instante futuro con precisión de muestra) y se avanza el
// "horizonte" ya programado. `tick()` —llamado cada fotograma desde
// ui/capa.js vía main.js, NUNCA desde el paso de lógica fijo— solo comprueba
// si el horizonte se acerca y programa el siguiente bucle si hace falta.
//
// Es tiempo REAL (ctx.currentTime), no tiempo de simulación: siguiendo la
// misma idea que el pulso de furia del jefe (ui/hud.js), esto es puramente
// cosmético y correr en tiempo de pared no rompe la reproducibilidad de la
// partida — no toca ni lee nada del estado de juego con semilla.
function nota(t, f, d, tipo, vol) { return { t, f, d, tipo, vol }; }

// Escala frigia sobre Re: aire modal, antiguo, encaja con ruinas romanas de
// noche. D2 73.42 · D3 146.83 · Eb3 155.56 · F3 174.61 · G3 196.00 · A3
// 220.00 · Bb3 233.08 · C4 261.63 · D4 293.66 · Eb4 311.13 · F4 349.23.
const LOOP_AMBIENTE = 16;
const DRON_AMBIENTE = 73.42;
const NOTAS_AMBIENTE = [
  nota(0.0,  146.83, 2.4, 'triangle', 0.05),
  nota(3.4,  174.61, 2.0, 'triangle', 0.045),
  nota(6.2,  220.00, 2.2, 'triangle', 0.05),
  nota(9.6,  196.00, 1.8, 'triangle', 0.04),
  nota(12.4, 261.63, 2.6, 'triangle', 0.045),
];

const LOOP_JEFE = 8;
const NOTAS_JEFE = [
  // Pulso grave marcando el compás: ocho corcheas alternando la tónica y la
  // quinta, con dientes de sierra en vez del triángulo suave del ambiente.
  nota(0.0, 73.42,  0.16, 'sawtooth', 0.075),
  nota(0.5, 110.00, 0.16, 'sawtooth', 0.065),
  nota(1.0, 73.42,  0.16, 'sawtooth', 0.075),
  nota(1.5, 110.00, 0.16, 'sawtooth', 0.065),
  nota(2.0, 73.42,  0.16, 'sawtooth', 0.075),
  nota(2.5, 110.00, 0.16, 'sawtooth', 0.065),
  nota(3.0, 73.42,  0.16, 'sawtooth', 0.075),
  nota(3.5, 110.00, 0.16, 'sawtooth', 0.065),
  nota(4.0, 73.42,  0.16, 'sawtooth', 0.075),
  nota(4.5, 110.00, 0.16, 'sawtooth', 0.065),
  nota(5.0, 73.42,  0.16, 'sawtooth', 0.075),
  nota(5.5, 110.00, 0.16, 'sawtooth', 0.065),
  nota(6.0, 73.42,  0.16, 'sawtooth', 0.075),
  nota(6.5, 110.00, 0.16, 'sawtooth', 0.065),
  nota(7.0, 73.42,  0.16, 'sawtooth', 0.075),
  nota(7.5, 110.00, 0.16, 'sawtooth', 0.065),
  // Frase aguda, tensa, encima del pulso.
  nota(1.0, 311.13, 0.3,  'square', 0.05),
  nota(3.0, 349.23, 0.3,  'square', 0.05),
  nota(5.5, 293.66, 0.5,  'square', 0.055),
];

let _horizonte = 0;
let _musicaActiva = false;
let _jefeActivo = false;
let _dronOsc = null, _dronGain = null;

// El dron grave del ambiente suena TODO el rato, no en bucles discretos: es
// el colchón sobre el que se recortan las frases sueltas.
function arrancarDron() {
  if (_dronOsc) return;
  _dronOsc = ctx.createOscillator();
  _dronOsc.type = 'sine';
  _dronOsc.frequency.setValueAtTime(DRON_AMBIENTE, ctx.currentTime);
  _dronGain = ctx.createGain();
  _dronGain.gain.setValueAtTime(0, ctx.currentTime);
  _dronOsc.connect(_dronGain).connect(gMusica);
  _dronOsc.start();
}

function programarBucle(t0) {
  const patron = _jefeActivo ? NOTAS_JEFE : NOTAS_AMBIENTE;
  const duracion = _jefeActivo ? LOOP_JEFE : LOOP_AMBIENTE;
  for (let i = 0; i < patron.length; i++) {
    const n = patron[i];
    tono(gMusica, n.f, n.d, n.tipo, n.vol, (t0 - ctx.currentTime) + n.t);
  }
  // El dron sube cuando llega el jefe (más presencia) y baja en calma.
  if (_dronGain) {
    _dronGain.gain.linearRampToValueAtTime(
      _jefeActivo ? 0.05 : 0.03, t0 - ctx.currentTime + ctx.currentTime + 1);
  }
  return duracion;
}

export const GestorAudio = {
  iniciar() {
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      ctx = new Ctor();
      gMaestro = ctx.createGain();
      gMaestro.gain.value = 1;
      gMaestro.connect(ctx.destination);
      gEfectos = ctx.createGain();
      gEfectos.gain.value = 0.6;
      gEfectos.connect(gMaestro);
      gMusica = ctx.createGain();
      gMusica.gain.value = 0.5;
      gMusica.connect(gMaestro);

      // Un segundo de ruido blanco, generado UNA vez y reutilizado por todas
      // las ráfagas de golpe/muerte/cofre: no hace falta uno nuevo por sonido,
      // solo un `AudioBufferSourceNode` distinto leyendo el mismo buffer.
      const n = ctx.sampleRate;
      bufferRuido = ctx.createBuffer(1, n, ctx.sampleRate);
      const datos = bufferRuido.getChannelData(0);
      for (let i = 0; i < n; i++) datos[i] = Math.random() * 2 - 1;

      // Los navegadores bloquean el audio hasta el primer gesto del usuario.
      // Una vez, y se desconecta: no hace falta comprobarlo en cada tecla.
      const reanudar = () => {
        if (ctx.state === 'suspended') ctx.resume();
        removeEventListener('keydown', reanudar);
        removeEventListener('pointerdown', reanudar);
      };
      addEventListener('keydown', reanudar);
      addEventListener('pointerdown', reanudar);
    } catch {
      ctx = null;             // sin audio disponible: todo se queda en silencio
    }
  },

  // Reinicia el presupuesto de sonidos frecuentes. Se llama una vez por paso
  // de LÓGICA (main.js, junto a VFX.actualizar), nunca por fotograma.
  actualizar() {
    _presupuesto = 0;
  },

  // Avanza la música. Se llama una vez por FOTOGRAMA (main.js, en dibujar),
  // no por paso de lógica: es tiempo de pared, ver la nota de cabecera.
  tick() {
    if (!ctx || !_musicaActiva) return;
    const MARGEN = 0.25;
    if (ctx.currentTime > _horizonte - MARGEN) {
      arrancarDron();
      const duracion = programarBucle(Math.max(_horizonte, ctx.currentTime));
      _horizonte = Math.max(_horizonte, ctx.currentTime) + duracion;
    }
  },

  iniciarMusica() {
    if (!ctx) return;
    _musicaActiva = true;
    _horizonte = ctx.currentTime;
  },

  // Sistemas/jefes.js avisa aquí cuando hay un jefe en pie o no. El cambio de
  // patrón se aplica en el SIGUIENTE bucle que se programe, nunca a mitad de
  // uno: cortar una frase por la mitad se oye peor que esperar un segundo.
  jefeActivo(activo) {
    _jefeActivo = activo;
  },

  golpe() {
    if (!ctx || _presupuesto >= PRESUPUESTO_PASO) return;
    if (!puedeSonar('golpe', 0.05)) return;
    _presupuesto++;
    ruido(gEfectos, 0.05, 0.18, 'bandpass', 1800);
  },

  muerteEnemigo() {
    if (!ctx || _presupuesto >= PRESUPUESTO_PASO) return;
    if (!puedeSonar('muerteEnemigo', 0.14)) return;
    _presupuesto++;
    ruido(gEfectos, 0.13, 0.22, 'lowpass', 900);
    tono(gEfectos, 130, 0.16, 'sine', 0.12);
  },

  danyoJugador() {
    if (!ctx) return;
    if (!puedeSonar('danyoJugador', 0.16)) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(190, t0);
    osc.frequency.exponentialRampToValueAtTime(75, t0 + 0.15);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
    osc.connect(g).connect(gEfectos);
    osc.start(t0);
    osc.stop(t0 + 0.18);
  },

  recogerGema() {
    if (!ctx || _presupuesto >= PRESUPUESTO_PASO) return;
    if (!puedeSonar('recogerGema', 0.09)) return;
    _presupuesto++;
    tono(gEfectos, 880, 0.05, 'sine', 0.08);
    tono(gEfectos, 1320, 0.06, 'sine', 0.07, 0.045);
  },

  subidaNivel() {
    if (!ctx) return;
    const notas = [261.63, 329.63, 392.00, 523.25];   // C4-E4-G4-C5
    for (let i = 0; i < notas.length; i++) {
      tono(gEfectos, notas[i], 0.22, 'triangle', 0.14, i * 0.07);
    }
  },

  abrirCofre() {
    if (!ctx) return;
    ruido(gEfectos, 0.09, 0.2, 'lowpass', 500);
    tono(gEfectos, 392.00, 0.18, 'triangle', 0.1, 0.05);
    tono(gEfectos, 587.33, 0.22, 'triangle', 0.09, 0.09);
  },

  avisoJefe() {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(58, t0);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.16, t0 + 0.5);
    g.gain.linearRampToValueAtTime(0, t0 + 1.4);
    osc.connect(g).connect(gEfectos);
    osc.start(t0);
    osc.stop(t0 + 1.5);
    ruido(gEfectos, 1.2, 0.06, 'lowpass', 200, 0.1);
  }
};
