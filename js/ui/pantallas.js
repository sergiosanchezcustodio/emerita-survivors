import { ANCHO_UI, ALTO_UI, ANCHO_FISICO } from '../core/constantes.js';
import { Recursos } from '../core/recursos.js';
import { Capa, FUENTE, FUENTE_TITULO, textoBorde, textoEspaciado } from './capa.js';
import { Tema, panel, cenefa } from './tema.js';
import { PERSONAJES, ORDEN_PERSONAJES } from '../datos/personajes.js';
import { ARMAS } from '../datos/armas.js';
import { COLOR_JUGADOR } from './hud.js';
import { MetaProgreso } from '../core/metaProgreso.js';
import { MASCOTAS, MAX_NIVEL_MASCOTA } from '../datos/mascotas.js';
import { GestorAudio } from '../sistemas/audio.js';

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

  titulo(ctxMundo, ctxUi, menu, cursor) { dibujarTitulo(ctxMundo, ctxUi, menu, cursor); },
  seleccion(ctxMundo, ctxUi, puestos) { dibujarSeleccion(ctxMundo, ctxUi, puestos); },
  mascotas(ctxMundo, ctxUi, disponibles, cursor, turno, puestos, elegidas) {
    dibujarMascotas(ctxMundo, ctxUi, disponibles, cursor, turno, puestos, elegidas);
  },
  config(ctxMundo, ctxUi, opciones, cursor, confirmando) {
    dibujarConfig(ctxMundo, ctxUi, opciones, cursor, confirmando);
  }
};

// Monedas acumuladas, arriba a la derecha. Lo pidió Sergio para el menú y de
// paso vale para cualquier pantalla previa: es el número que decide si merece
// la pena entrar en la tienda, así que tiene que verse ANTES de entrar.
const COLOR_ORO = '#e8b73a';

export function dibujarOro(ctxUi) {
  const x = ANCHO_UI - 18;
  // Se aparta del borde SUPERIOR REAL, no del borde del lienzo: la capa mide
  // 540 de alto siempre, pero en una ventana más baja se recorta centrada (ver
  // Capa.altoVisible) y a 24 fijas la moneda salía descabezada.
  const y = Math.max(24, (ALTO_UI - Capa.altoVisible) / 2 + 18);
  ctxUi.save();
  ctxUi.textAlign = 'right';
  ctxUi.textBaseline = 'middle';
  ctxUi.font = `700 18px ${FUENTE}`;
  textoBorde(ctxUi, String(MetaProgreso.denarios), x, y, COLOR_ORO, 4);

  // La moneda, a la izquierda de la cifra. Un círculo con su "D" de denario,
  // el mismo dibujo que ya usa la tienda.
  const r = 8;
  const cx = x - ctxUi.measureText(String(MetaProgreso.denarios)).width - r - 6;
  ctxUi.beginPath();
  ctxUi.arc(cx, y, r, 0, Math.PI * 2);
  ctxUi.fillStyle = COLOR_ORO;
  ctxUi.fill();
  ctxUi.lineWidth = 1.5;
  ctxUi.strokeStyle = 'rgba(20,14,4,.65)';
  ctxUi.stroke();
  ctxUi.fillStyle = 'rgba(20,14,4,.6)';
  ctxUi.textAlign = 'center';
  ctxUi.font = `700 11px ${FUENTE_TITULO}`;
  ctxUi.fillText('D', cx, y + 0.5);
  ctxUi.restore();
}

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

// La ilustración del título, sola, para que otra pantalla la use de decorado.
// La pide la TIENDA, que desde que ocupa el lienzo entero ya no es un panel
// flotando sobre lo que hubiera detrás: sin fondo propio se quedaba sobre el
// último fotograma dibujado, que podía ser la partida anterior.
//
// Vive aquí y no en tienda.js porque el encaje de la ilustración (`cubrir`, el
// ancla vertical, el repliegue sin imagen) ya está resuelto en este módulo, y
// dos sitios calculándolo por su cuenta es la forma segura de que un día dejen
// de coincidir.
export function fondoTitulo(ctxMundo) {
  const img = Imagenes.titulo;
  fondo(ctxMundo, img, cubrir(img || { width: ANCHO_UI, height: ALTO_UI }, 0));
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
// El botón START que trae la ilustración se aprovecha como marco de la primera
// opción: no se tapa, se usa. Las otras tres van debajo con el mismo aire
// —cartela oscura y letras claras— pero sin marco dorado, porque el arte solo
// trae uno y repetirlo cuatro veces se leería como un parche.
const ALTO_OPCION = 26;
const HUECO_OPCION = 4;

function dibujarTitulo(ctxMundo, ctxUi, menu, cursor) {
  const img = Imagenes.titulo;
  const e = cubrir(img || { width: ANCHO_UI, height: ALTO_UI }, 0);
  fondo(ctxMundo, img, e);

  dibujarOro(ctxUi);
  if (!img || !menu) return;

  const r = enUi(e, START_X, START_Y, START_ANCHO, START_ALTO);
  const t = Tema.actual;

  // El bloque de opciones se apoya en el BORDE INFERIOR del botón dibujado y
  // crece hacia arriba. Así el menú ocupa el sitio donde el ojo ya espera
  // encontrar el botón, en vez de aparecer flotando en otra parte.
  const alto = menu.length * ALTO_OPCION + (menu.length - 1) * HUECO_OPCION;
  // 30 de margen por debajo del botón dibujado: ahí va la línea de ayuda, y el
  // lienzo mide 1080 de alto FIJOS —en una ventana más baja se recorta centrado
  // (ver ESCALA_ARTE en core/constantes.js)—, así que lo que quede pegado al
  // borde inferior es lo primero que deja de verse.
  const y0 = Math.max(12, r.y + r.h - alto - 30);

  ctxUi.save();
  ctxUi.textAlign = 'center';
  ctxUi.textBaseline = 'middle';

  // PLACA QUE TAPA EL BOTÓN HORNEADO. Hace falta: el "START" está pintado en la
  // ilustración y no se puede quitar, así que sin taparlo asomaba por detrás de
  // la última opción y se leían las dos palabras superpuestas. Cubre el bloque
  // entero y el botón, con margen, y va lo bastante opaca como para que no se
  // adivine lo que hay debajo.
  const pad = 6;
  const yTapa = Math.min(y0, r.y) - pad;
  const altoTapa = Math.max(y0 + alto, r.y + r.h) - yTapa + pad;
  ctxUi.fillStyle = 'rgba(9,8,11,.93)';
  ctxUi.beginPath();
  ctxUi.roundRect(r.x - pad, yTapa, r.w + pad * 2, altoTapa, 8);
  ctxUi.fill();
  ctxUi.lineWidth = 1;
  ctxUi.strokeStyle = 'rgba(238,240,243,.12)';
  ctxUi.stroke();

  for (let i = 0; i < menu.length; i++) {
    const y = y0 + i * (ALTO_OPCION + HUECO_OPCION);
    const elegida = i === cursor;

    ctxUi.globalAlpha = elegida ? 0.88 : 0.55;
    ctxUi.fillStyle = 'rgba(10,8,12,.9)';
    ctxUi.beginPath();
    ctxUi.roundRect(r.x, y, r.w, ALTO_OPCION, 5);
    ctxUi.fill();
    ctxUi.globalAlpha = 1;
    ctxUi.lineWidth = elegida ? 1.8 : 1;
    ctxUi.strokeStyle = elegida ? t.filo : 'rgba(238,240,243,.18)';
    ctxUi.stroke();

    // La elegida se ENCIENDE con 'lighter', igual que hacía el latido del botón
    // original: suma luz sobre la piedra en vez de taparla con otro color.
    if (elegida) {
      ctxUi.save();
      ctxUi.globalCompositeOperation = 'lighter';
      ctxUi.globalAlpha = 0.11 * latido(1400, 0.25);
      ctxUi.fillStyle = '#ffd9a0';
      ctxUi.fill();
      ctxUi.restore();
    }

    ctxUi.font = `15px ${FUENTE_TITULO}`;
    ctxUi.fillStyle = elegida ? t.titulo : t.texto;
    textoEspaciado(ctxUi, menu[i].texto, ANCHO_UI / 2, y + ALTO_OPCION / 2, 3);
  }

  ctxUi.font = `500 10px ${FUENTE}`;
  textoBorde(ctxUi, '↑↓ elegir     Enter/A aceptar',
             ANCHO_UI / 2, y0 + alto + 13, t.apagado, 3);
  ctxUi.restore();
}

// Despedida, cuando "Salir" no ha podido cerrar la pestaña. Ver salirDelJuego()
// en main.js: el navegador solo deja cerrar ventanas que ha abierto un script.
export function dibujarDespedida(ctxUi) {
  ctxUi.save();
  ctxUi.fillStyle = 'rgba(6,5,10,.85)';
  ctxUi.fillRect(0, 0, ANCHO_UI, ALTO_UI);
  ctxUi.textAlign = 'center';
  ctxUi.textBaseline = 'middle';
  ctxUi.font = `28px ${FUENTE_TITULO}`;
  ctxUi.fillStyle = Tema.actual.titulo;
  textoEspaciado(ctxUi, 'HASTA LA PRÓXIMA', ANCHO_UI / 2, ALTO_UI / 2 - 16, 6);
  ctxUi.font = `400 12px ${FUENTE}`;
  ctxUi.fillStyle = Tema.actual.texto;
  ctxUi.fillText('Tu progreso está guardado. Ya puedes cerrar la pestaña.',
                 ANCHO_UI / 2, ALTO_UI / 2 + 18);
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

// --- Elección de mascota ------------------------------------------------------
//
// Va DESPUÉS de elegir personaje y solo si hay alguna comprada. Cada jugador
// elige por turnos, y no se puede repetir: main.js ya filtra las que lleva otro
// (ver mascotasDisponibles), así que aquí solo llegan las que este puede coger.
//
// Sin ilustración propia: se reutiliza el fondo de la selección de personaje,
// oscurecido. Son el mismo momento —montar la partida— y cambiar de decorado
// entre dos pasos seguidos se lee como haber salido a otro sitio.
const CARTA_MASCOTA = 84;
const HUECO_MASCOTA = 10;

function dibujarMascotas(ctxMundo, ctxUi, disponibles, cursor, turno, puestos, elegidas) {
  const img = Imagenes.seleccion;
  const e = cubrir(img || { width: ANCHO_UI, height: ALTO_UI }, 0.5);
  fondo(ctxMundo, img, e);

  const t = Tema.actual;
  ctxUi.save();
  ctxUi.fillStyle = 'rgba(6,5,10,.72)';
  ctxUi.fillRect(0, 0, ANCHO_UI, ALTO_UI);
  dibujarOro(ctxUi);

  // Cabecera: de quién es el turno. En cooperativo es lo primero que hay que
  // saber, porque los cuatro miran la misma pantalla.
  const color = COLOR_JUGADOR[turno % COLOR_JUGADOR.length];
  const def = puestos[turno] ? PERSONAJES[ORDEN_PERSONAJES[puestos[turno].personaje]] : null;
  ctxUi.textAlign = 'center';
  ctxUi.textBaseline = 'middle';
  ctxUi.font = `26px ${FUENTE_TITULO}`;
  ctxUi.fillStyle = t.titulo;
  textoEspaciado(ctxUi, 'ELIGE TU MASCOTA', ANCHO_UI / 2, 84, 4);

  ctxUi.font = `600 13px ${FUENTE}`;
  ctxUi.fillStyle = color;
  ctxUi.fillText(`P${turno + 1}${def ? '  ·  ' + def.nombre : ''}`, ANCHO_UI / 2, 110);

  // Una carta por mascota disponible, más una final de "ninguna".
  const n = disponibles.length + 1;
  const anchoTotal = n * CARTA_MASCOTA + (n - 1) * HUECO_MASCOTA;
  const x0 = (ANCHO_UI - anchoTotal) / 2;
  const yCarta = 150;

  for (let i = 0; i < n; i++) {
    const x = x0 + i * (CARTA_MASCOTA + HUECO_MASCOTA);
    const elegida = i === cursor;
    const id = i < disponibles.length ? disponibles[i] : '';
    const dm = id ? MASCOTAS[id] : null;
    const nivel = id ? MetaProgreso.nivelMascota(id) : 0;

    ctxUi.beginPath();
    ctxUi.roundRect(x, yCarta, CARTA_MASCOTA, CARTA_MASCOTA + 30, 6);
    ctxUi.fillStyle = elegida ? 'rgba(40,44,52,.95)' : 'rgba(16,16,20,.8)';
    ctxUi.fill();
    ctxUi.lineWidth = elegida ? 2.2 : 1;
    ctxUi.strokeStyle = elegida ? color : 'rgba(238,240,243,.16)';
    ctxUi.stroke();

    if (dm) {
      // El bicho, a tamaño de carta y sin suavizado. Fotograma 0: aquí no hace
      // falta animar, hace falta reconocerlo.
      const idAtlas = 'mascota' + id.charAt(0).toUpperCase() + id.slice(1);
      const meta = Recursos.meta(idAtlas);
      const imgM = Recursos.imagen(idAtlas);
      if (meta && imgM) {
        const esc = Math.min(52 / meta.w, 52 / meta.h);
        const w = meta.w * esc, h = meta.h * esc;
        const suave = ctxUi.imageSmoothingEnabled;
        ctxUi.imageSmoothingEnabled = false;
        ctxUi.drawImage(imgM, 0, 0, meta.w, meta.h,
                        x + (CARTA_MASCOTA - w) / 2, yCarta + 12 + (52 - h) / 2, w, h);
        ctxUi.imageSmoothingEnabled = suave;
      }
      ctxUi.font = `600 9px ${FUENTE}`;
      ctxUi.fillStyle = elegida ? '#ffffff' : t.texto;
      ctxUi.fillText(dm.nombre.split(' ')[0], x + CARTA_MASCOTA / 2, yCarta + 78);

      // Nivel en puntos: se lee de un vistazo cuánto le queda por mejorar.
      for (let k = 0; k < MAX_NIVEL_MASCOTA; k++) {
        ctxUi.beginPath();
        ctxUi.arc(x + CARTA_MASCOTA / 2 + (k - 2) * 8, yCarta + 96, 2.4, 0, Math.PI * 2);
        ctxUi.fillStyle = k < nivel ? t.filo : 'rgba(255,255,255,.15)';
        ctxUi.fill();
      }
    } else {
      ctxUi.font = `600 11px ${FUENTE}`;
      ctxUi.fillStyle = elegida ? '#ffffff' : t.apagado;
      ctxUi.fillText('SIN', x + CARTA_MASCOTA / 2, yCarta + 44);
      ctxUi.fillText('MASCOTA', x + CARTA_MASCOTA / 2, yCarta + 58);
    }
  }

  // Descripción de la señalada, debajo. Solo la de una: la lista se lee
  // recorriéndola, no leyendo ocho párrafos a la vez.
  const idSel = cursor < disponibles.length ? disponibles[cursor] : '';
  ctxUi.font = `400 11px ${FUENTE}`;
  ctxUi.fillStyle = t.texto;
  ctxUi.fillText(idSel ? MASCOTAS[idSel].descripcion : 'Jugarás sin mascota.',
                 ANCHO_UI / 2, yCarta + CARTA_MASCOTA + 62);

  // Lo ya elegido por los demás, para que nadie tenga que preguntar cuál se ha
  // llevado el otro.
  const yaElegidas = [];
  for (let i = 0; i < elegidas.length; i++) {
    if (i !== turno && elegidas[i]) {
      yaElegidas.push(`P${i + 1}: ${MASCOTAS[elegidas[i]].nombre.split(' ')[0]}`);
    }
  }
  if (yaElegidas.length) {
    ctxUi.font = `500 10px ${FUENTE}`;
    ctxUi.fillStyle = t.apagado;
    ctxUi.fillText(yaElegidas.join('     '), ANCHO_UI / 2, yCarta + CARTA_MASCOTA + 84);
  }

  ctxUi.font = `500 10px ${FUENTE}`;
  ctxUi.fillStyle = t.apagado;
  ctxUi.fillText('← → elegir     Enter/A aceptar     Esc/B atrás',
                 ANCHO_UI / 2, ALTO_UI - 30);
  ctxUi.restore();
}

// --- Configuración ------------------------------------------------------------
//
// Vídeo, sonido y el botón de empezar de cero. Panel de siempre sobre el título
// oscurecido: es una pantalla de ajustes, no un sitio del juego.
function dibujarConfig(ctxMundo, ctxUi, opciones, cursor, confirmando) {
  const img = Imagenes.titulo;
  const e = cubrir(img || { width: ANCHO_UI, height: ALTO_UI }, 0);
  fondo(ctxMundo, img, e);

  const t = Tema.actual;
  const ancho = 320;
  const alto = 52 + opciones.length * 30 + 26;
  const px = (ANCHO_UI - ancho) / 2;
  const py = (ALTO_UI - alto) / 2;

  ctxUi.save();
  ctxUi.fillStyle = 'rgba(6,5,10,.6)';
  ctxUi.fillRect(0, 0, ANCHO_UI, ALTO_UI);
  panel(ctxUi, px, py, ancho, alto, t.filo);

  ctxUi.textAlign = 'center';
  ctxUi.textBaseline = 'middle';
  ctxUi.font = `19px ${FUENTE_TITULO}`;
  ctxUi.fillStyle = t.titulo;
  textoEspaciado(ctxUi, 'CONFIGURACIÓN', ANCHO_UI / 2, py + 20, 3);
  cenefa(ctxUi, px + 14, py + 34, ancho - 28);

  for (let i = 0; i < opciones.length; i++) {
    const o = opciones[i];
    const y = py + 60 + i * 30;
    const elegida = i === cursor;
    if (elegida) {
      ctxUi.fillStyle = t.cartaElegida;
      ctxUi.fillRect(px + 6, y - 12, ancho - 12, 24);
    }
    ctxUi.textAlign = 'left';
    ctxUi.font = `600 12px ${FUENTE}`;
    // "Empezar de cero" en rojo: es la única de la lista que no se deshace.
    ctxUi.fillStyle = o.id === 'borrar' ? '#e8907c' : (elegida ? '#ffffff' : t.titulo);
    ctxUi.fillText(o.texto, px + 18, y);

    ctxUi.textAlign = 'right';
    ctxUi.font = `600 11px ${FUENTE}`;
    ctxUi.fillStyle = t.texto;
    ctxUi.fillText(valorConfig(o.id), px + ancho - 18, y);
  }

  ctxUi.textAlign = 'center';
  ctxUi.font = `500 9px ${FUENTE}`;
  ctxUi.fillStyle = t.apagado;
  ctxUi.fillText('↑↓ elegir   ←→ ajustar   Enter activar   Esc volver',
                 ANCHO_UI / 2, py + alto - 13);
  ctxUi.restore();

  if (confirmando) dibujarConfirmacion(ctxUi);
}

// Qué se enseña a la derecha de cada opción.
function valorConfig(id) {
  if (id === 'musica') return Math.round(GestorAudio.volumenMusica() * 100) + '%';
  if (id === 'efectos') return Math.round(GestorAudio.volumenEfectos() * 100) + '%';
  if (id === 'pantalla') return document.fullscreenElement ? 'Sí' : 'No';
  return '';
}

// VENTANA DE CONFIRMACIÓN del borrado. Encima de todo y con el foco entero:
// borrar el progreso de todas las partidas jugadas no puede depender de una
// tecla mal pulsada, así que hay que decir Enter aquí y solo aquí.
function dibujarConfirmacion(ctxUi) {
  const t = Tema.actual;
  const ancho = 330, alto = 128;
  const px = (ANCHO_UI - ancho) / 2;
  const py = (ALTO_UI - alto) / 2;

  ctxUi.save();
  ctxUi.fillStyle = 'rgba(6,5,10,.78)';
  ctxUi.fillRect(0, 0, ANCHO_UI, ALTO_UI);
  panel(ctxUi, px, py, ancho, alto, '#a04a3c');

  ctxUi.textAlign = 'center';
  ctxUi.textBaseline = 'middle';
  ctxUi.font = `18px ${FUENTE_TITULO}`;
  ctxUi.fillStyle = '#e8b0a4';
  textoEspaciado(ctxUi, '¿EMPEZAR DE CERO?', ANCHO_UI / 2, py + 26, 3);

  ctxUi.font = `400 11px ${FUENTE}`;
  ctxUi.fillStyle = t.texto;
  ctxUi.fillText('Se pierden TODAS las monedas, las mejoras', ANCHO_UI / 2, py + 58);
  ctxUi.fillText('y las mascotas. No se puede deshacer.', ANCHO_UI / 2, py + 74);

  ctxUi.font = `600 11px ${FUENTE}`;
  ctxUi.fillStyle = '#e8907c';
  ctxUi.fillText('Enter · borrar', ANCHO_UI / 2 - 64, py + 104);
  ctxUi.fillStyle = t.titulo;
  ctxUi.fillText('Esc · cancelar', ANCHO_UI / 2 + 64, py + 104);
  ctxUi.restore();
}
