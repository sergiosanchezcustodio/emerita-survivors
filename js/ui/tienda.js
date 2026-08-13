import { ANCHO_UI, ALTO_UI } from '../core/constantes.js';
import { FUENTE, FUENTE_TITULO, textoEspaciado, envolverTexto } from './capa.js';
import { Tema, cenefa } from './tema.js';
import { MetaProgreso } from '../core/metaProgreso.js';
import { Recursos } from '../core/recursos.js';
import { POTENCIADORES } from '../datos/potenciadores.js';
import { MASCOTAS, ORDEN_MASCOTAS, MAX_NIVEL_MASCOTA } from '../datos/mascotas.js';
import { PERSONAJES, ORDEN_PERSONAJES } from '../datos/personajes.js';
import { ARMAS } from '../datos/armas.js';
import { dibujarIconoPasivo } from './hud.js';
import { fondoTitulo, dibujarOro } from './pantallas.js';

// TIENDA. Se abre desde el menú principal y no desde dentro de la partida: son
// compras para SIEMPRE (progreso META, ver core/metaProgreso.js), así que tienen
// su sitio antes de jugar, no como un menú más de los que ya interrumpen una
// partida en marcha.
//
// TRES SECCIONES, que son las que pidió Sergio: POTENCIADORES, MASCOTAS y
// JUGADORES. Una sola tienda con secciones y no tres entradas del menú porque
// se pagan con los mismos denarios y se miran en el mismo momento: separarlas
// obligaría a salir de una para ver cuánto queda para lo de la otra.
//
// A PANTALLA COMPLETA, sobre la ilustración del título. Antes era un panel de
// 320 de ancho en el centro, y ahí un nombre, cinco puntos de nivel y un precio
// ya llenaban la fila: no cabía decir QUÉ HACE lo que estás comprando. Con el
// ancho entero cabe una tabla de verdad —icono, nombre, nivel, efecto y
// precio—, que es lo que hace falta para decidir sin tener que recordarse de
// memoria qué era cada cosa.
//
// La tabla lleva TÍTULOS DE COLUMNA. Con cinco puntos y dos números sueltos en
// la misma fila, lo que no está rotulado se adivina, y adivinar en qué columna
// está el precio es exactamente lo que no debe pasar en una tienda.

const IDS = Object.keys(POTENCIADORES);

// --- Rejilla de la pantalla ---------------------------------------------------
// Todo en unidades de interfaz (960 de ancho por 540 de alto, ver
// core/constantes.js). Las tres secciones comparten cabecera, columnas y pie:
// cambiar de sección no mueve NADA de sitio, solo cambia lo que hay en las
// filas.
//
// NADA PEGADO AL BORDE. El lienzo mide 540 unidades de alto FIJAS y en una
// ventana más baja que eso se RECORTA CENTRADO (ver ESCALA_ARTE en
// core/constantes.js): en la ventana de este portátil se pierden unas veinte
// unidades por arriba y otras veinte por abajo. La primera versión ponía las
// secciones en la 32 y el pie en la 518, y las dos se quedaban a medio cortar.
const MARGEN = 54;
const Y_PESTANYAS = 38;
const Y_CENEFA = 52;
const Y_CABECERA = 76;        // rótulos de columna
const Y_REGLA = 86;
const Y_FILAS = 94;
const Y_DESC = 478;           // descripción larga de lo señalado
const Y_PIE = 508;

// Columnas. El icono va a la IZQUIERDA del todo porque es lo que se reconoce
// antes de leer: con diez potenciadores en la lista, el dibujo distingue la fila
// de un vistazo y el nombre solo la confirma.
const X_ICONO = MARGEN + 24;          // centro del icono
const X_NOMBRE = MARGEN + 54;
const X_NIVEL = 404;
const X_EFECTO = 528;
const X_PRECIO = ANCHO_UI - MARGEN;

const PASO_PUNTO = 12;
const RADIO_PUNTO = 3.4;

const COLOR_DENARIO = '#e8b73a';
const COLOR_MAX = '#7fd68a';
const COLOR_ICONO = '#9fd0e8';

const NOMBRES = ['POTENCIADORES', 'MASCOTAS', 'JUGADORES'];

// --- Piezas sueltas -----------------------------------------------------------

// Los cinco escalones de nivel. Un punto encendido por nivel comprado.
function puntos(ctx, x, y, nivel, maximo, resaltada) {
  const t = Tema.actual;
  for (let k = 0; k < maximo; k++) {
    ctx.beginPath();
    ctx.arc(x + k * PASO_PUNTO, y, RADIO_PUNTO, 0, Math.PI * 2);
    ctx.fillStyle = k < nivel ? (resaltada ? '#ffffff' : t.filo) : 'rgba(255,255,255,.15)';
    ctx.fill();
  }
}

// Precio, "AL MÁXIMO" o "TUYO", siempre pegado al borde derecho. En apagado
// cuando no llega el dinero: se ve lo que cuesta y se ve que hoy no.
function precio(ctx, y, coste, textoLleno) {
  const t = Tema.actual;
  ctx.textAlign = 'right';
  if (coste < 0) {
    ctx.font = `600 11px ${FUENTE}`;
    ctx.fillStyle = COLOR_MAX;
    ctx.fillText(textoLleno, X_PRECIO, y);
    return;
  }
  ctx.font = `700 13px ${FUENTE}`;
  ctx.fillStyle = MetaProgreso.denarios >= coste ? COLOR_DENARIO : t.apagado;
  ctx.fillText(String(coste), X_PRECIO, y);
}

// Sprite del atlas encajado en un cuadrado, SIN suavizado (es pixel art) y
// siempre el fotograma 0: las mascotas animadas son una tira de fotogramas en
// un solo PNG, así que dibujarla entera saldría como una fila de conejos.
function sprite(ctx, idAtlas, cx, cy, lado) {
  const meta = Recursos.meta(idAtlas);
  const img = Recursos.imagen(idAtlas);
  if (!meta || !img) return false;
  const esc = Math.min(lado / meta.w, lado / meta.h);
  const w = meta.w * esc;
  const h = meta.h * esc;
  const suavizado = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, meta.w, meta.h, cx - w / 2, cy - h / 2, w, h);
  ctx.imageSmoothingEnabled = suavizado;
  return true;
}

// Los dos potenciadores que NO tienen equivalente entre los pasivos de partida
// —Égida y Moneda de Caronte son mecánicas nuevas— se dibujan a mano. El resto
// reutiliza el icono de su pasivo gemelo (ver `icono` en datos/potenciadores.js).
function glifoEgida(ctx, cx, cy, r) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.9);
  ctx.lineTo(cx + r * 0.78, cy - r * 0.52);
  ctx.lineTo(cx + r * 0.78, cy + r * 0.12);
  ctx.quadraticCurveTo(cx + r * 0.62, cy + r * 0.78, cx, cy + r * 0.98);
  ctx.quadraticCurveTo(cx - r * 0.62, cy + r * 0.78, cx - r * 0.78, cy + r * 0.12);
  ctx.lineTo(cx - r * 0.78, cy - r * 0.52);
  ctx.closePath();
  ctx.fillStyle = COLOR_ICONO;
  ctx.fill();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = 'rgba(8,10,14,.75)';
  ctx.stroke();
  // Banda horizontal: sin ella el escudo se lee como una gota.
  ctx.fillStyle = 'rgba(8,10,14,.5)';
  ctx.fillRect(cx - r * 0.78, cy - r * 0.16, r * 1.56, r * 0.26);
}

function glifoObolo(ctx, cx, cy, r) {
  // Moneda de HUESO, no de oro: al lado del contador de denarios, que es
  // dorado, una moneda dorada más sería otra cosa que cuesta dinero y no lo
  // que se compra.
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.85, 0, Math.PI * 2);
  ctx.fillStyle = '#d8d2bd';
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = 'rgba(8,10,14,.7)';
  ctx.stroke();

  // Un busto acuñado —cabeza y hombros—, que es lo que tiene una moneda y lo
  // que la hace reconocible a 28 píxeles. Antes llevaba una cruz aspada y a
  // este tamaño se leía como el aspa de "cancelar", justo lo contrario de lo
  // que hace: dar una vida de más.
  ctx.fillStyle = 'rgba(8,10,14,.68)';
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.16, r * 0.24, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy + r * 0.62, r * 0.44, Math.PI * 1.12, Math.PI * 1.88);
  ctx.fill();
}

function iconoPotenciador(ctx, id, def, cx, cy, r) {
  if (def.icono) return dibujarIconoPasivo(ctx, cx, cy, r, def.icono, COLOR_ICONO);
  if (id === 'faroDeLaMuerte') return glifoObolo(ctx, cx, cy, r);
  glifoEgida(ctx, cx, cy, r);
}

// Lo que cambia un personaje respecto al patrón, sacado de sus `mods`. Se deriva
// aquí en vez de guardarse en datos/personajes.js para que no haya dos verdades:
// el número que se enseña ES el que se aplica.
function efectoDePersonaje(def) {
  const m = def.mods || {};
  const partes = [];
  const pct = (v) => (v > 1 ? '+' : '') + Math.round((v - 1) * 100) + '%';
  if (m.vidaMaxima && m.vidaMaxima !== 1) partes.push(pct(m.vidaMaxima) + ' vida');
  if (m.velocidad && m.velocidad !== 1) partes.push(pct(m.velocidad) + ' velocidad');
  if (m.radioRecogida && m.radioRecogida !== 1) partes.push(pct(m.radioRecogida) + ' recogida');
  return partes.length ? partes.join('   ·   ') : 'Equilibrado en todo';
}

// --- Armazón: fondo, secciones, cabecera de tabla y pie ----------------------

function armazon(ctx, seccion) {
  const t = Tema.actual;

  ctx.fillStyle = 'rgba(6,5,10,.82)';
  ctx.fillRect(0, 0, ANCHO_UI, ALTO_UI);

  // Las tres secciones, siempre las tres a la vista aunque solo una esté viva:
  // media gracia de una pestaña es que se vea que hay otras dos.
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  let cx = MARGEN;
  for (let i = 0; i < NOMBRES.length; i++) {
    const activa = seccion === i;
    ctx.font = `${activa ? 17 : 15}px ${FUENTE_TITULO}`;
    ctx.fillStyle = activa ? t.titulo : t.apagado;
    const w = textoEspaciado(ctx, NOMBRES[i], cx, Y_PESTANYAS, 1.6);
    if (activa) {
      ctx.fillStyle = t.filo;
      ctx.fillRect(cx, Y_PESTANYAS + 12, w, 2);
    }
    cx += w + 26;
  }

  dibujarOro(ctx);
  cenefa(ctx, MARGEN, Y_CENEFA, ANCHO_UI - MARGEN * 2);

  // Títulos de columna. En versalitas pequeñas y apagadas: rotulan sin competir
  // con el contenido de las filas.
  ctx.font = `600 9px ${FUENTE}`;
  ctx.fillStyle = t.apagado;
  ctx.textAlign = 'left';
  textoEspaciado(ctx, 'OBJETO', MARGEN, Y_CABECERA, 1.4);
  textoEspaciado(ctx, 'NIVEL', X_NIVEL, Y_CABECERA, 1.4);
  textoEspaciado(ctx, 'EFECTO', X_EFECTO, Y_CABECERA, 1.4);
  ctx.textAlign = 'right';
  ctx.fillText('PRECIO', X_PRECIO, Y_CABECERA);

  ctx.globalAlpha = 0.35;
  ctx.fillStyle = t.filo;
  ctx.fillRect(MARGEN, Y_REGLA, ANCHO_UI - MARGEN * 2, 1);
  ctx.globalAlpha = 1;
}

// Fondo de la fila señalada, a todo el ancho de la tabla.
function resalte(ctx, y, alto) {
  ctx.fillStyle = Tema.actual.cartaElegida;
  ctx.fillRect(MARGEN - 10, y, ANCHO_UI - MARGEN * 2 + 20, alto - 4);
}

// Descripción larga de lo señalado y línea de ayuda. Cambia con el cursor, así
// que las filas se quedan compactas y solo se lee una a la vez.
function pie(ctx, descripcion, accion) {
  const t = Tema.actual;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `400 11px ${FUENTE}`;
  ctx.fillStyle = t.texto;
  const lineas = envolverTexto(ctx, descripcion, ANCHO_UI - MARGEN * 4);
  ctx.fillText(lineas[0] || '', ANCHO_UI / 2, Y_DESC);
  if (lineas[1]) ctx.fillText(lineas[1], ANCHO_UI / 2, Y_DESC + 14);

  ctx.font = `500 10px ${FUENTE}`;
  ctx.fillStyle = t.apagado;
  ctx.fillText(`↑↓ elegir     ←→ sección     Enter/A ${accion}     Esc/B volver`,
               ANCHO_UI / 2, Y_PIE);
}

// --- Reparto ------------------------------------------------------------------

export function dibujarTienda(ctxMundo, ctx, cursor, seccion) {
  fondoTitulo(ctxMundo);
  ctx.save();
  armazon(ctx, seccion);
  if (seccion === 1) filasMascotas(ctx, cursor);
  else if (seccion === 2) filasPersonajes(ctx, cursor);
  else filasPotenciadores(ctx, cursor);
  ctx.restore();
}

// --- Potenciadores ------------------------------------------------------------
const ALTO_POTENCIADOR = 36;

function filasPotenciadores(ctx, cursor) {
  const t = Tema.actual;
  for (let i = 0; i < IDS.length; i++) {
    const id = IDS[i];
    const def = POTENCIADORES[id];
    const nivel = MetaProgreso.nivelPotenciador(id);
    const coste = MetaProgreso.costePotenciador(id);
    const elegida = i === cursor;
    const y = Y_FILAS + i * ALTO_POTENCIADOR;
    const yc = y + ALTO_POTENCIADOR / 2 - 2;

    if (elegida) resalte(ctx, y, ALTO_POTENCIADOR);

    iconoPotenciador(ctx, id, def, X_ICONO, yc, 14);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `600 13px ${FUENTE}`;
    ctx.fillStyle = elegida ? '#ffffff' : t.titulo;
    ctx.fillText(def.nombre, X_NOMBRE, yc);

    puntos(ctx, X_NIVEL + RADIO_PUNTO, yc, nivel, def.maxNivel, elegida);

    ctx.font = `500 11px ${FUENTE}`;
    ctx.fillStyle = nivel > 0 ? t.titulo : t.texto;
    // Lo que da CADA nivel, y al lado lo que llevas acumulado. Sin el acumulado
    // no hay forma de saber si los cuatro niveles que ya pagaste hacen algo.
    ctx.fillText(def.efecto + (nivel > 0 ? `   (llevas ${nivel} de ${def.maxNivel})` : ''),
                 X_EFECTO, yc);

    precio(ctx, yc, coste, 'AL MÁXIMO');
  }

  pie(ctx, POTENCIADORES[IDS[cursor]].descripcion,
      MetaProgreso.nivelPotenciador(IDS[cursor]) > 0 ? 'mejorar' : 'comprar');
}

// --- Mascotas -----------------------------------------------------------------
//
// El icono es EL MISMO DIBUJO que se ve en la partida, no un símbolo aparte: lo
// que se compra aquí es el bicho que va a ir trotando al lado, y verlo antes de
// pagarlo es medio motivo para comprarlo.
//
// Aquí NO se equipa: cuál lleva cada jugador se decide en su propia pantalla,
// después de elegir personaje, porque en cooperativo son hasta cuatro decisiones
// distintas y esta lista solo tiene sitio para una.
const ALTO_MASCOTA = 44;

function filasMascotas(ctx, cursor) {
  const t = Tema.actual;
  for (let i = 0; i < ORDEN_MASCOTAS.length; i++) {
    const id = ORDEN_MASCOTAS[i];
    const def = MASCOTAS[id];
    const nivel = MetaProgreso.nivelMascota(id);
    const tiene = nivel > 0;
    const coste = MetaProgreso.costeMascota(id);
    const elegida = i === cursor;
    const y = Y_FILAS + i * ALTO_MASCOTA;
    const yc = y + ALTO_MASCOTA / 2 - 2;

    if (elegida) resalte(ctx, y, ALTO_MASCOTA);

    // Apagada si no la tienes: se ve qué hay a la venta sin que parezca tuya.
    ctx.globalAlpha = tiene ? 1 : 0.4;
    const idAtlas = 'mascota' + id.charAt(0).toUpperCase() + id.slice(1);
    if (!sprite(ctx, idAtlas, X_ICONO, yc, 34)) {
      ctx.beginPath();
      ctx.arc(X_ICONO, yc, 13, 0, Math.PI * 2);
      ctx.fillStyle = def.color;
      ctx.fill();
      ctx.fillStyle = 'rgba(12,10,14,.8)';
      ctx.font = `700 13px ${FUENTE}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(def.inicial, X_ICONO, yc + 0.5);
    }
    ctx.globalAlpha = 1;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `600 13px ${FUENTE}`;
    ctx.fillStyle = elegida ? '#ffffff' : (tiene ? t.titulo : t.texto);
    ctx.fillText(def.nombre, X_NOMBRE, yc);

    puntos(ctx, X_NIVEL + RADIO_PUNTO, yc, nivel, MAX_NIVEL_MASCOTA, elegida);

    ctx.font = `500 11px ${FUENTE}`;
    ctx.fillStyle = tiene ? t.titulo : t.texto;
    ctx.fillText(def.efecto, X_EFECTO, yc);

    precio(ctx, yc, coste, 'AL MÁXIMO');
  }

  const id = ORDEN_MASCOTAS[cursor];
  pie(ctx, MASCOTAS[id].descripcion, MetaProgreso.tieneMascota(id) ? 'mejorar' : 'adoptar');
}

// --- Jugadores ----------------------------------------------------------------
//
// Hoy los cuatro salen como "TUYO" porque están todos a coste 0 (ver `coste` en
// datos/personajes.js): fue una decisión de Sergio no ponerles precio a
// personajes con los que sus hijas ya juegan. La sección existe montada y
// funcionando, así que convertir cualquiera en comprable es subirle el número en
// los datos y nada más.
const ALTO_PERSONAJE = 58;

function filasPersonajes(ctx, cursor) {
  const t = Tema.actual;
  for (let i = 0; i < ORDEN_PERSONAJES.length; i++) {
    const id = ORDEN_PERSONAJES[i];
    const def = PERSONAJES[id];
    const tuyo = MetaProgreso.heroeDesbloqueado(id);
    const elegida = i === cursor;
    const y = Y_FILAS + i * ALTO_PERSONAJE;
    const yc = y + ALTO_PERSONAJE / 2 - 2;

    if (elegida) resalte(ctx, y, ALTO_PERSONAJE);

    // El retrato, el mismo que usa su ficha, recortado en círculo.
    ctx.globalAlpha = tuyo ? 1 : 0.4;
    const meta = Recursos.meta(id + 'Cara');
    const img = Recursos.imagen(id + 'Cara');
    if (meta && img) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(X_ICONO, yc, 22, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, 0, 0, meta.w, meta.h, X_ICONO - 22, yc - 22, 44, 44);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(X_ICONO, yc, 22, 0, Math.PI * 2);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = elegida ? t.filo : 'rgba(255,255,255,.2)';
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `600 14px ${FUENTE}`;
    ctx.fillStyle = elegida ? '#ffffff' : (tuyo ? t.titulo : t.texto);
    ctx.fillText(def.nombre, X_NOMBRE, yc - 8);

    // Su arma exclusiva, que es lo que de verdad diferencia a un personaje de
    // otro: los `mods` mueven los números, el arma cambia a qué se juega.
    const arma = ARMAS[def.arma];
    ctx.font = `500 10px ${FUENTE}`;
    ctx.fillStyle = t.apagado;
    ctx.fillText(arma ? 'Arma: ' + arma.nombre : '', X_NOMBRE, yc + 9);

    // Un personaje no tiene niveles: se tiene o no se tiene. Un solo punto.
    puntos(ctx, X_NIVEL + RADIO_PUNTO, yc, tuyo ? 1 : 0, 1, elegida);

    ctx.font = `500 11px ${FUENTE}`;
    ctx.fillStyle = tuyo ? t.titulo : t.texto;
    ctx.fillText(efectoDePersonaje(def), X_EFECTO, yc);

    precio(ctx, yc, tuyo ? -1 : MetaProgreso.costeHeroe(id), 'TUYO');
  }

  const id = ORDEN_PERSONAJES[cursor];
  pie(ctx, PERSONAJES[id].descripcion,
      MetaProgreso.heroeDesbloqueado(id) ? 'ya es tuyo' : 'comprar');
}
