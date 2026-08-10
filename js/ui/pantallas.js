import { ANCHO_UI, ALTO_UI, ANCHO_FISICO } from '../core/constantes.js';
import { Recursos } from '../core/recursos.js';
import { FUENTE, FUENTE_TITULO, textoBorde, textoEspaciado } from './capa.js';
import { Tema } from './tema.js';
import { PERSONAJES, ORDEN_PERSONAJES } from '../datos/personajes.js';
import { ARMAS } from '../datos/armas.js';
import { COLOR_JUGADOR } from './hud.js';
import { MetaProgreso } from '../core/metaProgreso.js';

// Pantallas de TÍTULO y de SELECCIÓN DE PERSONAJE.
//
// Las dos se apoyan en una ilustración que ha pintado Sergio y que trae ya
// horneado casi todo: el logo, el botón START, el rótulo "Elige a tu Héroe" y
// los cuatro arcos con sus personajes dentro. Aquí NO se vuelve a dibujar nada
// de eso — sería competir con el arte y perder. Lo único que se añade es lo que
// una imagen no puede tener: qué arco está elegido, de quién es cada cursor y
// qué hay que pulsar.
//
// EN DOS LIENZOS, como el resto del juego (ver ui/capa.js):
//
//   - La ilustración va en el lienzo del MUNDO, que mide 1920x1080 fijos.
//   - Los resaltados y los textos, en la CAPA DE INTERFAZ, que va a la
//     resolución real del monitor. Un "PULSA A" trazado en el lienzo del mundo
//     saldría ampliado y escalonado.
//
// Y la ilustración se dibuja CON SUAVIZADO, al revés que todo el arte del
// mundo. Es la misma decisión que el retrato de la ficha: ninguna de las dos
// imágenes encaja en 1920x1080 por un múltiplo entero —la del título pide
// 1,25x y la de selección 1,18x— así que a vecino más próximo saldrían filas de
// píxeles dobladas sí y no, que en las letras del logo se ve como un defecto.
// Son pantallas quietas: no hay hormigueo que temer, solo un pelo de blandura.

const RUTA_TITULO = 'assets/menus/titulo.png';
const RUTA_SELECCION = 'assets/menus/seleccion.png';

// Píxeles del lienzo del mundo por unidad de interfaz. Las dos rejillas cubren
// el mismo rectángulo, así que basta la proporción entre sus anchos.
const K = ANCHO_FISICO / ANCHO_UI;

// --- Medidas tomadas SOBRE las ilustraciones --------------------------------
//
// En píxeles de la imagen original, no de pantalla. Se convierten con el encaje
// que devuelve `cubrir`, así que siguen valiendo con cualquier zoom o densidad.
//
// Los cuatro arcos de la pantalla de selección están a un paso constante de
// 316,3 px medido sobre el arte; el primero, centrado en 360.
const ARCO_X0 = 360;
const ARCO_PASO = 316.3;
const ARCO_ANCHO = 268;
const ARCO_Y = 274;
const ARCO_ALTO = 462;

// Botón START de la pantalla de título, ya dibujado en la ilustración.
const START_X = 600, START_Y = 743, START_ANCHO = 330, START_ALTO = 84;

const Imagenes = { titulo: null, seleccion: null };

export const Pantallas = {
  // Se llama una vez al arrancar, junto al resto de recursos. Si alguna no
  // carga, la pantalla se pinta igual sobre un fondo liso: se pierde el
  // decorado, no la posibilidad de empezar una partida.
  async cargar() {
    const [t, s] = await Promise.all([
      Recursos.cargarSuelta(RUTA_TITULO),
      Recursos.cargarSuelta(RUTA_SELECCION)
    ]);
    Imagenes.titulo = t;
    Imagenes.seleccion = s;
  },

  titulo(ctxMundo, ctxUi) { dibujarTitulo(ctxMundo, ctxUi); },
  seleccion(ctxMundo, ctxUi, puestos) { dibujarSeleccion(ctxMundo, ctxUi, puestos); }
};

// --- Encaje de la ilustración -----------------------------------------------
//
// "Cubrir": se escala por el lado que se quede corto, así que la imagen llena
// la pantalla entera y lo que sobra del otro lado se sale. Nunca hay bandas
// negras, que en una pantalla de título se leen como que algo ha fallado.
//
// `anclaY` decide POR DÓNDE se recorta lo que sobra en vertical. La del título
// va anclada arriba (0) y no centrada: la ilustración es más cuadrada que la
// pantalla y le sobran 200 píxeles de alto, y recortando por el centro se
// perdía la punta de la espada y media luna del remate. Por abajo lo que sobra
// es empedrado, que no lo echa nadie de menos.
//
// Devuelve el encaje en UNIDADES DE INTERFAZ, que es donde se colocan después
// los resaltados; el lienzo del mundo solo tiene que multiplicar por K.
function cubrir(img, anclaY) {
  const esc = Math.max(ANCHO_UI / img.width, ALTO_UI / img.height);
  const ancho = img.width * esc;
  const alto = img.height * esc;
  return { esc, x: (ANCHO_UI - ancho) / 2, y: (ALTO_UI - alto) * anclaY, ancho, alto };
}

// Rectángulo de la imagen -> rectángulo en unidades de interfaz.
function enUi(e, x, y, ancho, alto) {
  return { x: e.x + x * e.esc, y: e.y + y * e.esc, w: ancho * e.esc, h: alto * e.esc };
}

function fondo(ctxMundo, img, e) {
  ctxMundo.setTransform(1, 0, 0, 1, 0, 0);
  if (!img) {
    // Sin ilustración: piedra del tema. Fea, pero jugable.
    ctxMundo.fillStyle = Tema.actual.fondoBajo;
    ctxMundo.fillRect(0, 0, ANCHO_UI * K, ALTO_UI * K);
    return;
  }
  ctxMundo.imageSmoothingEnabled = true;
  ctxMundo.imageSmoothingQuality = 'high';
  ctxMundo.drawImage(img, e.x * K, e.y * K, e.ancho * K, e.alto * K);
  ctxMundo.imageSmoothingEnabled = false;
}

// Latido lento para lo que pide una pulsación. Va con performance.now() y no
// con el reloj de la simulación a propósito: estas pantallas no simulan nada,
// y el criterio 10 (misma semilla, misma partida) no se toca porque aquí
// todavía no ha empezado ninguna partida.
function latido(periodo, minimo) {
  const t = (performance.now() % periodo) / periodo;
  return minimo + (1 - minimo) * (0.5 + 0.5 * Math.sin(t * Math.PI * 2));
}

// --- Título ------------------------------------------------------------------
function dibujarTitulo(ctxMundo, ctxUi) {
  const img = Imagenes.titulo;
  const e = cubrir(img || { width: ANCHO_UI, height: ALTO_UI }, 0);
  fondo(ctxMundo, img, e);

  // El botón START ya está pintado en la ilustración. Lo único que le falta es
  // parecer vivo, así que se le pone encima un velo cálido que va y viene. Con
  // 'lighter' se SUMA a lo que hay debajo: el botón se enciende en vez de
  // quedar tapado por un rectángulo de color.
  if (!img) return;
  const r = enUi(e, START_X, START_Y, START_ANCHO, START_ALTO);

  ctxUi.save();
  ctxUi.globalCompositeOperation = 'lighter';
  ctxUi.globalAlpha = 0.13 * latido(1600, 0.15);
  ctxUi.fillStyle = '#ffd9a0';
  ctxUi.beginPath();
  ctxUi.roundRect(r.x, r.y, r.w, r.h, r.h * 0.18);
  ctxUi.fill();
  ctxUi.restore();

  // El aviso va ENCIMA del botón, no debajo. La ilustración es más cuadrada
  // que la pantalla y se ancla arriba para no perder la espada del remate, así
  // que el botón queda pegado al borde inferior y debajo no cabe una línea de
  // texto: se montaría sobre las letras de START.
  ctxUi.save();
  ctxUi.textAlign = 'center';
  ctxUi.textBaseline = 'alphabetic';
  ctxUi.font = `600 12px ${FUENTE}`;
  ctxUi.globalAlpha = latido(1600, 0.35);
  textoBorde(ctxUi, 'Pulsa cualquier tecla o botón', ANCHO_UI / 2, r.y - 12,
             Tema.actual.titulo, 3.5);
  ctxUi.restore();

  // Rincón de la tienda: denarios ganados jugando (progreso META, ver
  // core/metaProgreso.js) y la tecla para gastarlos. Aparte del botón START,
  // que solo entiende "cualquier tecla vale" — T se mira antes en main.js.
  ctxUi.save();
  ctxUi.textAlign = 'left';
  ctxUi.textBaseline = 'alphabetic';
  ctxUi.font = `600 10px ${FUENTE}`;
  textoBorde(ctxUi, `T · Tienda (${MetaProgreso.denarios} denarios)`, 10, ALTO_UI - 10,
             '#e8b73a', 3);
  ctxUi.restore();
}

// --- Selección de personaje --------------------------------------------------
//
// `puestos` es un array de MAX_JUGADORES con un hueco por control: null si ese
// jugador no se ha sumado, y si no `{ personaje, listo }`. El array lo lleva
// main.js —es estado de partida, no de dibujo— y aquí solo se pinta.
function dibujarSeleccion(ctxMundo, ctxUi, puestos) {
  const img = Imagenes.seleccion;
  const e = cubrir(img || { width: ANCHO_UI, height: ALTO_UI }, 0.5);
  fondo(ctxMundo, img, e);

  const t = Tema.actual;
  ctxUi.save();

  // Primero se APAGA lo no elegido y luego se resalta lo elegido. Al revés, el
  // velo oscuro de un arco libre caería encima del marco del arco de al lado.
  for (let p = 0; p < ORDEN_PERSONAJES.length; p++) {
    if (ocupantePersonaje(puestos, p) >= 0) continue;
    const r = enUi(e, ARCO_X0 + p * ARCO_PASO - ARCO_ANCHO / 2, ARCO_Y, ARCO_ANCHO, ARCO_ALTO);
    ctxUi.fillStyle = 'rgba(6,5,10,.5)';
    ctxUi.fillRect(r.x, r.y, r.w, r.h);
  }

  for (let i = 0; i < puestos.length; i++) {
    const puesto = puestos[i];
    if (!puesto) continue;
    dibujarPuesto(ctxUi, e, i, puesto, t);
  }

  // Pie: qué se puede hacer, en UNA sola línea.
  //
  // Una sola por dos motivos. El de fondo es que dos renglones de ayuda debajo
  // de cuatro cartelas ya no son ayuda, son ruido. El práctico es que entre las
  // cartelas y el borde inferior caben unas cincuenta unidades, y el lienzo
  // mide 1080 de alto FIJOS: en una ventana más baja se recorta centrado (ver
  // ESCALA_ARTE en core/constantes.js), así que el segundo renglón sería justo
  // lo primero que dejaría de verse.
  const presentes = puestos.filter(Boolean);
  const faltan = presentes.some((p) => !p.listo);
  const hueco = presentes.length < puestos.length;
  ctxUi.textAlign = 'center';
  ctxUi.textBaseline = 'middle';
  ctxUi.font = `600 11px ${FUENTE}`;
  let pie = 'Empezando...';
  if (faltan) {
    pie = '← →  elegir     Enter/A  confirmar     Esc/B  atrás';
    if (hueco) pie += '     J, A o Start en otro mando  sumar jugador';
  }
  ctxUi.globalAlpha = faltan ? 0.9 : latido(700, 0.4);
  textoBorde(ctxUi, pie, ANCHO_UI / 2, ALTO_UI - 44, t.texto, 3.5);
  ctxUi.restore();
}

// Índice del puesto que tiene cogido el personaje `p`, o -1.
export function ocupantePersonaje(puestos, p) {
  for (let i = 0; i < puestos.length; i++) {
    if (puestos[i] && puestos[i].personaje === p) return i;
  }
  return -1;
}

function dibujarPuesto(ctxUi, e, indice, puesto, t) {
  const color = COLOR_JUGADOR[indice % COLOR_JUGADOR.length];
  const r = enUi(e, ARCO_X0 + puesto.personaje * ARCO_PASO - ARCO_ANCHO / 2,
                 ARCO_Y, ARCO_ANCHO, ARCO_ALTO);

  ctxUi.save();

  // Marco del color del jugador. Mientras elige PARPADEA y al confirmar se
  // queda fijo y más grueso: es la diferencia que hay que poder ver desde el
  // otro lado del sofá sin leer nada.
  ctxUi.globalAlpha = puesto.listo ? 1 : latido(900, 0.45);
  ctxUi.strokeStyle = color;
  ctxUi.lineWidth = puesto.listo ? 3 : 2;
  ctxUi.strokeRect(r.x, r.y, r.w, r.h);
  ctxUi.globalAlpha = 1;

  // Etiqueta "P1" pegada al borde superior del arco, con su cartela oscura:
  // el fondo del arte es piedra y ruinas, y un texto suelto ahí no se lee.
  const et = `P${indice + 1}`;
  ctxUi.font = `700 12px ${FUENTE}`;
  ctxUi.textAlign = 'center';
  ctxUi.textBaseline = 'middle';
  const anchoEt = ctxUi.measureText(et).width + 14;
  ctxUi.fillStyle = 'rgba(6,5,10,.82)';
  ctxUi.beginPath();
  ctxUi.roundRect(r.x + (r.w - anchoEt) / 2, r.y - 9, anchoEt, 18, 4);
  ctxUi.fill();
  ctxUi.strokeStyle = color;
  ctxUi.lineWidth = 1.2;
  ctxUi.stroke();
  ctxUi.fillStyle = color;
  ctxUi.fillText(et, r.x + r.w / 2, r.y);

  // Cartela de abajo: nombre, qué hace y con qué arma empieza. El arte enseña
  // QUIÉN es cada uno; esto es lo que hace falta para ELEGIR, y por eso está
  // aquí y no horneado.
  const def = PERSONAJES[ORDEN_PERSONAJES[puesto.personaje]];
  const arma = ARMAS[def.arma];
  const yCaja = r.y + r.h + 4;
  const altoCaja = 42;
  ctxUi.fillStyle = 'rgba(6,5,10,.8)';
  ctxUi.beginPath();
  ctxUi.roundRect(r.x, yCaja, r.w, altoCaja, 4);
  ctxUi.fill();
  ctxUi.strokeStyle = puesto.listo ? color : 'rgba(255,255,255,.16)';
  ctxUi.lineWidth = 1;
  ctxUi.stroke();

  ctxUi.font = `700 13px ${FUENTE_TITULO}`;
  ctxUi.fillStyle = t.titulo;
  textoEspaciado(ctxUi, def.nombre.toUpperCase(), r.x + r.w / 2, yCaja + 11, 1.5);

  // La cartela es fija y compacta —no hay alto de sobra para una segunda
  // línea—, así que una descripción más larga que de costumbre se encoge
  // hasta que quepa en una, en vez de desbordar la tarjeta.
  let tamDesc = 9;
  ctxUi.font = `500 ${tamDesc}px ${FUENTE}`;
  while (ctxUi.measureText(def.descripcion).width > r.w - 10 && tamDesc > 6) {
    tamDesc -= 0.5;
    ctxUi.font = `500 ${tamDesc}px ${FUENTE}`;
  }
  ctxUi.fillStyle = t.texto;
  ctxUi.fillText(def.descripcion, r.x + r.w / 2, yCaja + 24);

  ctxUi.font = `600 9px ${FUENTE}`;
  ctxUi.fillStyle = puesto.listo ? color : t.apagado;
  ctxUi.fillText(puesto.listo ? 'LISTO' : (arma ? arma.nombre : ''),
                 r.x + r.w / 2, yCaja + 35);

  ctxUi.restore();
}
