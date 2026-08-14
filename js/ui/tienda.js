import { ANCHO_UI, ALTO_UI } from '../core/constantes.js';
import { FUENTE, FUENTE_TITULO, textoEspaciado, envolverTexto } from './capa.js';
import { Tema, cenefa } from './tema.js';
import { Capa } from './capa.js';
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
const MARGEN = 54;

// El REPARTO VERTICAL se calcula en cada dibujo y no con constantes fijas,
// porque el alto disponible no es siempre el mismo. La capa mide 540 unidades
// de alto, pero el lienzo se centra en la ventana y en una más baja se recorta
// por arriba y por abajo (ver Capa.altoVisible): con medidas fijas, el rótulo
// de las secciones y la línea de ayuda del pie se quedaban cortados por la
// mitad en cuanto Sergio bajaba la ventana un dedo.
//
// Las filas se estrujan hasta caber. Una tabla con la última fila fuera de la
// pantalla no es una tabla, y en la tienda la última fila es Nerón el Gato, que
// cuesta 150 denarios y conviene poder verlo.
const ALTO_MINIMO_FILA = 20;

function rejilla(nFilas, altoMaxFila) {
  const recorte = Math.max(0, (ALTO_UI - Capa.altoVisible) / 2);
  const arriba = recorte + 10;
  const abajo = ALTO_UI - recorte - 10;
  const filas = arriba + 60;
  const desc = abajo - 12;
  const hueco = Math.max(0, desc - 14 - filas);
  return {
    pestanyas: arriba + 8,
    cenefa: arriba + 22,
    cabecera: arriba + 44,     // rótulos de columna
    regla: arriba + 54,
    filas,
    alto: Math.min(altoMaxFila, Math.max(ALTO_MINIMO_FILA, hueco / nFilas)),
    desc                        // descripción larga de lo señalado
  };
}

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

// Retrato de menú de una mascota, encajado en su hueco.
//
// Usa el RETRATO (`mascota<Id>Ficha`, ver el catálogo de
// herramientas/procesar-assets.ps1) y no el sprite que corre por el mundo. Son
// dos dibujos del mismo bicho a dos tamaños distintos porque sirven para dos
// cosas distintas: en el mundo hace falta un bicho de once unidades de alto y
// animado, y aquí hace falta reconocerlo y que se vea bien. Aquí no hay nada
// que animar.
//
// CON SUAVIZADO, al revés que el arte del mundo, y es el mismo criterio que el
// retrato de los personajes: el retrato viene a 160 píxeles de alto y el hueco
// pide unos 136, así que siempre se REDUCE. Reducir a vecino más próximo por un
// factor roto tira filas enteras de píxeles, que era exactamente lo que le
// pasaba al conejo cuando esto reutilizaba el sprite de once unidades.
//
// El hueco es más ancho que alto a propósito: Escipión la Tortuga es casi el
// doble de ancha que alta, y encajarla en un cuadrado la dejaba diminuta al
// lado del resto para no salirse por los lados.
function retrato(ctx, id, cx, cy, ancho, alto) {
  const idAtlas = 'mascota' + id.charAt(0).toUpperCase() + id.slice(1) + 'Ficha';
  const meta = Recursos.meta(idAtlas);
  const img = Recursos.imagen(idAtlas);
  if (!meta || !img) return false;
  const esc = Math.min(ancho / meta.w, alto / meta.h);
  const w = meta.w * esc;
  const h = meta.h * esc;
  ctx.drawImage(img, 0, 0, meta.w, meta.h, cx - w / 2, cy - h / 2, w, h);
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

function armazon(ctx, seccion, r) {
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
    const w = textoEspaciado(ctx, NOMBRES[i], cx, r.pestanyas, 1.6);
    if (activa) {
      ctx.fillStyle = t.filo;
      ctx.fillRect(cx, r.pestanyas + 12, w, 2);
    }
    cx += w + 26;
  }

  dibujarOro(ctx);
  cenefa(ctx, MARGEN, r.cenefa, ANCHO_UI - MARGEN * 2);

  // Títulos de columna. En versalitas pequeñas y apagadas: rotulan sin competir
  // con el contenido de las filas.
  ctx.font = `600 9px ${FUENTE}`;
  ctx.fillStyle = t.apagado;
  ctx.textAlign = 'left';
  textoEspaciado(ctx, 'OBJETO', MARGEN, r.cabecera, 1.4);
  textoEspaciado(ctx, 'NIVEL', X_NIVEL, r.cabecera, 1.4);
  textoEspaciado(ctx, 'EFECTO', X_EFECTO, r.cabecera, 1.4);
  ctx.textAlign = 'right';
  ctx.fillText('PRECIO', X_PRECIO, r.cabecera);

  ctx.globalAlpha = 0.35;
  ctx.fillStyle = t.filo;
  ctx.fillRect(MARGEN, r.regla, ANCHO_UI - MARGEN * 2, 1);
  ctx.globalAlpha = 1;
}

// Fondo de la fila señalada, a todo el ancho de la tabla.
function resalte(ctx, y, alto) {
  ctx.fillStyle = Tema.actual.cartaElegida;
  ctx.fillRect(MARGEN - 10, y, ANCHO_UI - MARGEN * 2 + 20, alto - 4);
}

// Descripción larga de lo señalado. Cambia con el cursor, así que las filas se
// quedan compactas y solo se lee una a la vez.
//
// Aquí había además una línea con las teclas —elegir, cambiar de sección,
// comprar, volver—. Fuera: la quitó Sergio de todos los menús y tiene razón, una
// lista con el cursor encima de una fila no necesita que le expliquen que se
// sube y se baja. Lo que sí se queda es la descripción, que no es una ayuda de
// manejo sino lo que estás a punto de comprar.
function pie(ctx, r, descripcion) {
  const t = Tema.actual;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `400 11px ${FUENTE}`;
  ctx.fillStyle = t.texto;
  const lineas = envolverTexto(ctx, descripcion, ANCHO_UI - MARGEN * 4);
  ctx.fillText(lineas[0] || '', ANCHO_UI / 2, r.desc);
  if (lineas[1]) ctx.fillText(lineas[1], ANCHO_UI / 2, r.desc + 14);
}

// --- Reparto ------------------------------------------------------------------

export function dibujarTienda(ctxMundo, ctx, cursor, seccion) {
  const nFilas = seccion === 1 ? ORDEN_MASCOTAS.length
               : seccion === 2 ? ORDEN_PERSONAJES.length
               : IDS.length;
  const altoMax = seccion === 1 ? ALTO_MASCOTA
                : seccion === 2 ? ALTO_PERSONAJE
                : ALTO_POTENCIADOR;
  const r = rejilla(nFilas, altoMax);

  fondoTitulo(ctxMundo);
  ctx.save();
  armazon(ctx, seccion, r);
  if (seccion === 1) filasMascotas(ctx, cursor, r);
  else if (seccion === 2) filasPersonajes(ctx, cursor, r);
  else filasPotenciadores(ctx, cursor, r);
  ctx.restore();
}

// --- Potenciadores ------------------------------------------------------------
const ALTO_POTENCIADOR = 36;

function filasPotenciadores(ctx, cursor, r) {
  const t = Tema.actual;
  const radio = Math.min(14, r.alto * 0.4);
  for (let i = 0; i < IDS.length; i++) {
    const id = IDS[i];
    const def = POTENCIADORES[id];
    const nivel = MetaProgreso.nivelPotenciador(id);
    const coste = MetaProgreso.costePotenciador(id);
    const elegida = i === cursor;
    const y = r.filas + i * r.alto;
    const yc = y + r.alto / 2 - 2;

    if (elegida) resalte(ctx, y, r.alto);

    iconoPotenciador(ctx, id, def, X_ICONO, yc, radio);

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

  pie(ctx, r, POTENCIADORES[IDS[cursor]].descripcion);
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

function filasMascotas(ctx, cursor, r) {
  const t = Tema.actual;
  const alto = Math.min(34, r.alto * 0.78);
  const ancho = alto * 1.35;
  for (let i = 0; i < ORDEN_MASCOTAS.length; i++) {
    const id = ORDEN_MASCOTAS[i];
    const def = MASCOTAS[id];
    const nivel = MetaProgreso.nivelMascota(id);
    const tiene = nivel > 0;
    const coste = MetaProgreso.costeMascota(id);
    const elegida = i === cursor;
    const y = r.filas + i * r.alto;
    const yc = y + r.alto / 2 - 2;

    if (elegida) resalte(ctx, y, r.alto);

    // Apagada si no la tienes: se ve qué hay a la venta sin que parezca tuya.
    ctx.globalAlpha = tiene ? 1 : 0.4;
    if (!retrato(ctx, id, X_ICONO, yc, ancho, alto)) {
      ctx.beginPath();
      ctx.arc(X_ICONO, yc, alto * 0.38, 0, Math.PI * 2);
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
  pie(ctx, r, MASCOTAS[id].descripcion);
}

// --- Jugadores ----------------------------------------------------------------
//
// Hoy los cuatro salen como "TUYO" porque están todos a coste 0 (ver `coste` en
// datos/personajes.js): fue una decisión de Sergio no ponerles precio a
// personajes con los que sus hijas ya juegan. La sección existe montada y
// funcionando, así que convertir cualquiera en comprable es subirle el número en
// los datos y nada más.
const ALTO_PERSONAJE = 58;

function filasPersonajes(ctx, cursor, r) {
  const t = Tema.actual;
  const radio = Math.min(22, r.alto * 0.38);
  for (let i = 0; i < ORDEN_PERSONAJES.length; i++) {
    const id = ORDEN_PERSONAJES[i];
    const def = PERSONAJES[id];
    const tuyo = MetaProgreso.heroeDesbloqueado(id);
    const elegida = i === cursor;
    const y = r.filas + i * r.alto;
    const yc = y + r.alto / 2 - 2;

    if (elegida) resalte(ctx, y, r.alto);

    // El retrato, el mismo que usa su ficha, recortado en círculo.
    ctx.globalAlpha = tuyo ? 1 : 0.4;
    const meta = Recursos.meta(id + 'Cara');
    const img = Recursos.imagen(id + 'Cara');
    if (meta && img) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(X_ICONO, yc, radio, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, 0, 0, meta.w, meta.h,
                    X_ICONO - radio, yc - radio, radio * 2, radio * 2);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(X_ICONO, yc, radio, 0, Math.PI * 2);
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
  pie(ctx, r, PERSONAJES[id].descripcion);
}
