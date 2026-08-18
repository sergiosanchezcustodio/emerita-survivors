import { ANCHO_UI, ALTO_UI } from '../core/constantes.js';
import { Capa, FUENTE, FUENTE_TITULO, textoEspaciado, envolverTexto } from './capa.js';
import { Tema } from './tema.js';
import { fondoTitulo, dibujarOro } from './pantallas.js';

// EL ARMAZÓN DE LAS PANTALLAS DE TABLA: tienda y configuración.
//
// Las dos son lo mismo por dentro —una lista a pantalla completa sobre la
// ilustración del título, con su velo, sus rótulos de columna y una fila
// señalada— y Sergio pidió que la de configuración se viera igual que la de la
// tienda. La forma de que se vean igual no es copiar el dibujado, es que solo
// haya uno: con dos copias, el primer ajuste de márgenes que se haga en una
// deja a la otra descuadrada, y ese es el fallo que se descubre seis meses
// después mirando una captura.
//
// Aquí vive TODO lo que comparten: el fondo, el reparto vertical, las pestañas,
// las columnas, el resalte de la fila y el renglón de descripción. Lo que cambia
// de una pantalla a otra —qué filas hay y qué se pinta en cada columna— se queda
// en cada una.

// Todo en unidades de interfaz (960 de ancho por 540 de alto, ver
// core/constantes.js).
export const MARGEN = 54;

// Columnas. El icono va a la IZQUIERDA del todo porque es lo que se reconoce
// antes de leer: con diez filas en la lista, el dibujo distingue la fila de un
// vistazo y el nombre solo la confirma.
export const X_ICONO = MARGEN + 24;          // centro del icono
export const X_NOMBRE = MARGEN + 54;
// Columna de ARMA, solo en la pestaña de JUGADORES: dibujo del arma y su
// nombre. Cae en el hueco que hay entre el nombre de la fila y la columna de
// nivel, que en esa pestaña estaba vacío de punta a punta.
export const X_ARMA = 240;
export const X_NIVEL = 404;
export const X_EFECTO = 528;
export const X_VALOR = ANCHO_UI - MARGEN;    // alineado a la derecha

export const PASO_PUNTO = 12;
export const RADIO_PUNTO = 3.4;

// --- Pestañas ----------------------------------------------------------------
//
// COMO LAS DE UN NAVEGADOR, que es lo que pidió Sergio: la viva sale más clara,
// más alta y PEGADA a la tabla —la línea que cierra la fila se corta justo
// debajo de ella— y las demás quedan hundidas y apagadas detrás. Así no hay que
// leer para saber en qué tienda estás: se ve.
//
// Antes eran tres rótulos seguidos con un subrayado bajo el activo, y eso se
// leía como un titular con una palabra remarcada, no como tres sitios distintos
// entre los que se cambia.
const ALTO_PESTANYA = 30;
const HUNDIDO = 4;             // lo que baja una pestaña que no está viva
const RELLENO_PESTANYA = 16;   // aire a cada lado del rótulo
const HUECO_PESTANYA = 3;
const RADIO_PESTANYA = 7;
const TAM_PESTANYA = 15;
const ESPACIADO_PESTANYA = 1.4;

// El REPARTO VERTICAL se calcula en cada dibujo y no con constantes fijas,
// porque el alto disponible no es siempre el mismo. La capa mide 540 unidades de
// alto, pero el lienzo se centra en la ventana y si alguna vez se recorta (ver
// Capa.altoVisible) unas medidas fijas dejarían el rótulo de arriba y el renglón
// de abajo cortados por la mitad.
//
// Las filas se estrujan hasta caber. Una tabla con la última fila fuera de la
// pantalla no es una tabla.
const ALTO_MINIMO_FILA = 20;

export function rejilla(nFilas, altoMaxFila) {
  const recorte = Math.max(0, (ALTO_UI - Capa.altoVisible) / 2);
  const arriba = recorte + 8;
  const borde = arriba + ALTO_PESTANYA;   // donde la pestaña viva se une a la tabla
  const abajo = ALTO_UI - recorte - 10;
  const filas = borde + 38;
  const desc = abajo - 12;
  const hueco = Math.max(0, desc - 14 - filas);
  return {
    pestanyas: arriba,         // borde SUPERIOR de la fila de pestañas
    borde,
    cabecera: borde + 18,      // rótulos de columna
    regla: borde + 28,
    filas,
    alto: Math.min(altoMaxFila, Math.max(ALTO_MINIMO_FILA, hueco / nFilas)),
    desc                        // descripción larga de lo señalado
  };
}

// Una pestaña: las dos esquinas de ARRIBA redondeadas y las de abajo en pico,
// que es lo que la ata a la tabla en vez de dejarla flotando.
function trazarPestanya(ctx, x, y, w, h) {
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + RADIO_PESTANYA);
  ctx.quadraticCurveTo(x, y, x + RADIO_PESTANYA, y);
  ctx.lineTo(x + w - RADIO_PESTANYA, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + RADIO_PESTANYA);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
}

// Fondo, pestañas, denarios y rótulos de columna.
//
// `secciones` son los nombres de las pestañas y `activa` cuál está viva. La
// tienda pasa tres y la configuración una: con una sola sale una pestaña sola,
// que es exactamente lo que hace falta, sin ningún modo aparte.
//
// `columnas` son los cuatro rótulos, de los que el último va alineado a la
// derecha porque su columna también lo está.
// `ctxMundo` a null: NO se pinta la ilustración del título detrás. Lo pide la
// configuración cuando se abre EN PARTIDA, donde detrás está el mundo congelado
// y sustituirlo por la lápida del menú sería sacar al jugador de donde está.
export function armazon(ctxMundo, ctx, r, secciones, activa, columnas) {
  const t = Tema.actual;

  if (ctxMundo) fondoTitulo(ctxMundo);
  // Más opaco sin ilustración detrás: ahí lo que hay es la partida, y una tabla
  // que deja ver la horda moviéndose por debajo no se lee.
  ctx.fillStyle = ctxMundo ? 'rgba(6,5,10,.82)' : 'rgba(6,5,10,.93)';
  ctx.fillRect(0, 0, ANCHO_UI, ALTO_UI);

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `${TAM_PESTANYA}px ${FUENTE_TITULO}`;

  // Las anchuras primero: la línea de debajo necesita saber por dónde NO pasar.
  const anchos = [];
  for (let i = 0; i < secciones.length; i++) {
    anchos.push(ctx.measureText(secciones[i]).width
                + secciones[i].length * ESPACIADO_PESTANYA + RELLENO_PESTANYA * 2);
  }

  // Las hundidas van ANTES que la viva, para que la viva las tape por los
  // costados y se lea cuál está delante.
  let cx = MARGEN;
  let xViva = MARGEN, anchoViva = 0;
  for (let i = 0; i < secciones.length; i++) {
    if (activa === i) { xViva = cx; anchoViva = anchos[i]; cx += anchos[i] + HUECO_PESTANYA; continue; }
    const y = r.pestanyas + HUNDIDO;
    trazarPestanya(ctx, cx, y, anchos[i], ALTO_PESTANYA - HUNDIDO);
    ctx.fillStyle = 'rgba(14,13,18,.72)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,.10)';
    ctx.stroke();
    ctx.fillStyle = t.apagado;
    textoEspaciado(ctx, secciones[i], cx + RELLENO_PESTANYA,
                   y + (ALTO_PESTANYA - HUNDIDO) / 2, ESPACIADO_PESTANYA);
    cx += anchos[i] + HUECO_PESTANYA;
  }

  // La línea que cierra la fila de pestañas por abajo, CORTADA bajo la viva:
  // ese hueco es todo el truco de que una pestaña parezca la de delante.
  ctx.fillStyle = t.filo;
  ctx.globalAlpha = 0.55;
  ctx.fillRect(MARGEN, r.borde - 1.5, xViva - MARGEN, 1.5);
  ctx.fillRect(xViva + anchoViva, r.borde - 1.5,
               ANCHO_UI - MARGEN - xViva - anchoViva, 1.5);
  ctx.globalAlpha = 1;

  // Y la viva encima, de arriba al borde y sin tapa por abajo.
  trazarPestanya(ctx, xViva, r.pestanyas, anchoViva, ALTO_PESTANYA);
  ctx.fillStyle = t.cartaElegida;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = t.filo;
  ctx.stroke();
  ctx.font = `${TAM_PESTANYA}px ${FUENTE_TITULO}`;
  ctx.fillStyle = t.titulo;
  textoEspaciado(ctx, secciones[activa], xViva + RELLENO_PESTANYA,
                 r.pestanyas + ALTO_PESTANYA / 2 - 1, ESPACIADO_PESTANYA);

  // Los denarios, a la altura de las pestañas y no flotando por encima. Ahí
  // estaba el pisotón que vio Sergio: colocados por su cuenta, se metían en la
  // cabecera de unas ventanas y en los adornos de la ilustración de otras.
  dibujarOro(ctx, r.pestanyas + ALTO_PESTANYA / 2);

  // Títulos de columna, en la romana del juego y no en la de leer: son cuatro
  // palabras que rotulan, y ahí manda el carácter.
  ctx.font = `600 10px ${FUENTE_TITULO}`;
  ctx.fillStyle = t.apagado;
  ctx.textAlign = 'left';
  textoEspaciado(ctx, columnas[0], MARGEN, r.cabecera, 1.6);
  textoEspaciado(ctx, columnas[1], X_NIVEL, r.cabecera, 1.6);
  textoEspaciado(ctx, columnas[2], X_EFECTO, r.cabecera, 1.6);
  // Quinto rótulo OPCIONAL. Lo usa la pestaña de jugadores para su columna de
  // arma; las demás pasan cuatro y aquí no se pinta nada de más. Va al final
  // del array y no en medio para que las cuatro columnas de siempre sigan
  // nombrándose en el mismo orden en las tres pantallas que usan el armazón.
  if (columnas[4]) textoEspaciado(ctx, columnas[4], X_ARMA, r.cabecera, 1.6);
  ctx.textAlign = 'right';
  textoEspaciado(ctx, columnas[3], X_VALOR, r.cabecera, 1.6);

  ctx.globalAlpha = 0.3;
  ctx.fillStyle = t.filo;
  ctx.fillRect(MARGEN, r.regla, ANCHO_UI - MARGEN * 2, 1);
  ctx.globalAlpha = 1;
}

// '#rrggbb' -> 'rgba(r,g,b,a)'. Hace falta para los extremos transparentes del
// degradado del resalte: un color de tema es un hexadecimal opaco y un
// `addColorStop` necesita poder pedir ese MISMO color con alfa 0.
function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// --- El resalte de la fila señalada ------------------------------------------
//
// SE DESVANECE POR LOS CUATRO LADOS y tiene las esquinas redondeadas. Con los
// cantos rectos la banda se leía como una casilla dibujada encima de la lista
// —un objeto más—, y lo que tiene que ser es la propia fila iluminada: apagada
// por los bordes no tiene principio ni final, así que se ve dónde está el
// cursor sin que aparezca una caja que antes no estaba.
//
// POR QUÉ HACE FALTA UN LIENZO APARTE. Un `fillStyle` es UN degradado, y aquí
// hacen falta dos a la vez: uno vertical y otro horizontal, MULTIPLICADOS. Y no
// se pueden encadenar sobre el lienzo bueno, porque el modo que multiplica alfas
// ('destination-in') muerde todo lo que ya hay pintado debajo —la ilustración
// del fondo y el velo— y dejaría un agujero con la forma del degradado.
//
// Pintándolo aparte, el recorte solo puede comerse la propia banda, que es justo
// lo que se quiere, y al lienzo bueno llega ya resuelto de un solo blit.
//
// El lienzo se crea UNA vez y solo se rehace si cambia de tamaño, o sea cuando
// cambia el alto de fila o la densidad de la pantalla: al abrir la pantalla y
// poco más. No se crea uno por fotograma.
//
// Y VA EN PÍXELES DE DISPOSITIVO, no en unidades de interfaz. La capa de
// interfaz lleva puesta la escala de la pantalla (ver Capa.escala en ui/capa.js),
// así que un mapa de bits medido en unidades llegaría ampliado por esa escala y
// el degradado saldría con bandas. Horneado a la densidad real y pintado con su
// tamaño en unidades, el blit sale 1:1, que es además la regla de rendimiento
// del proyecto.
// AZUL CLARO, y no el gris del tema. La banda era `cartaElegida`, el mismo tono
// que la pestaña viva y que la carta elegida del menú de subida de nivel, y en
// una lista de veinte filas grises un gris un poco más claro es lo que menos se
// ve de toda la pantalla. En azul, la fila señalada se encuentra sin buscarla.
//
// Es un color PROPIO de este módulo y no una entrada del tema, a propósito: el
// tema lo pone el NIVEL en curso (ver ui/tema.js) y la tienda y la configuración
// son pantallas de fuera de la partida, donde puede no haber nivel ninguno. La
// pestaña viva y el menú de subida de nivel siguen con su `cartaElegida`.
//
// Y este azul en concreto —ni el celeste del HUD ni el del escudo— porque la
// banda lleva encima el nombre de la fila en BLANCO. Un azul de verdad claro
// deja el blanco ilegible; este es el más claro que aguanta el texto encima con
// contraste de sobra, y sigue siendo inconfundiblemente azul.
const COLOR_RESALTE = '#4c7fa8';

const RADIO_RESALTE = 6;
let _capa = null;
let _capaCtx = null;
let _capaW = 0;
let _capaH = 0;

function _prepararCapa(w, h) {
  if (_capa && _capaW === w && _capaH === h) return;
  if (!_capa) {
    _capa = document.createElement('canvas');
    _capaCtx = _capa.getContext('2d');
  }
  _capa.width = w;
  _capa.height = h;
  _capaW = w;
  _capaH = h;
}

// Fondo de la fila señalada, a todo el ancho de la tabla.
//
// UN 20% MÁS ALTA, creciendo desde el centro de la fila para no descolgarla del
// texto. Ese margen no es capricho: el degradado se come los extremos, así que
// la banda que de verdad se percibe es más baja que la que se pinta, y sin él
// difuminarla la habría dejado pareciendo más fina que la plana de antes.
export function resalte(ctx, y, alto) {
  const color = COLOR_RESALTE;
  const base = alto - 4;
  const h = Math.max(1, Math.round(base * 1.2));
  const w = ANCHO_UI - MARGEN * 2 + 20;
  const x0 = MARGEN - 10;
  const y0 = y + (base - h) / 2;

  // El horneado va en píxeles de dispositivo; el blit, en unidades de interfaz.
  const esc = Capa.escala || 1;
  const dw = Math.max(1, Math.round(w * esc));
  const dh = Math.max(1, Math.round(h * esc));
  _prepararCapa(dw, dh);
  const c = _capaCtx;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, dw, dh);

  // 1) La banda, con las esquinas redondeadas y apagándose arriba y abajo.
  c.globalCompositeOperation = 'source-over';
  const vert = c.createLinearGradient(0, 0, 0, dh);
  vert.addColorStop(0, rgba(color, 0));
  vert.addColorStop(0.28, color);
  vert.addColorStop(0.72, color);
  vert.addColorStop(1, rgba(color, 0));
  c.fillStyle = vert;
  c.beginPath();
  c.roundRect(0, 0, dw, dh, RADIO_RESALTE * esc);
  c.fill();

  // 2) Y se le multiplica el alfa por un degradado horizontal, que es lo que la
  //    apaga por los dos costados. Las paradas van mucho más cerca del borde que
  //    las verticales: la banda mide casi novecientos de ancho por veinte de
  //    alto, así que un mismo porcentaje por los dos ejes dejaría los extremos
  //    difuminados a lo largo de media tabla y el centro como único sitio
  //    legible.
  c.globalCompositeOperation = 'destination-in';
  const hor = c.createLinearGradient(0, 0, dw, 0);
  hor.addColorStop(0, 'rgba(0,0,0,0)');
  hor.addColorStop(0.08, 'rgba(0,0,0,1)');
  hor.addColorStop(0.92, 'rgba(0,0,0,1)');
  hor.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = hor;
  c.fillRect(0, 0, dw, dh);
  c.globalCompositeOperation = 'source-over';

  ctx.drawImage(_capa, x0, y0, w, h);
}

// La columna de nivel: un punto encendido por escalón conseguido.
export function puntos(ctx, x, y, nivel, maximo, resaltada) {
  const t = Tema.actual;
  for (let k = 0; k < maximo; k++) {
    ctx.beginPath();
    ctx.arc(x + k * PASO_PUNTO, y, RADIO_PUNTO, 0, Math.PI * 2);
    ctx.fillStyle = k < nivel ? (resaltada ? '#ffffff' : t.filo) : 'rgba(255,255,255,.15)';
    ctx.fill();
  }
}

// El NOMBRE de una fila. En la romana del juego, que es lo que pidió Sergio:
// "algo más marcadas y de algún tipo que encaje mejor con la ambientación".
//
// Los nombres van en la serifa y los NÚMEROS no (ver los precios y los valores,
// que siguen en la de leer): un precio es para comparar de un vistazo con el
// dinero que llevas, y para eso las cifras de palo seco ganan a cualquier cosa
// con remates.
export function nombreFila(ctx, texto, x, y, color) {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `15px ${FUENTE_TITULO}`;
  ctx.fillStyle = color;
  textoEspaciado(ctx, texto, x, y, 0.6);
}

// La frase larga de lo señalado, abajo del todo. Cambia con el cursor, así que
// las filas se quedan compactas y solo se lee una a la vez.
export function descripcion(ctx, r, texto) {
  const t = Tema.actual;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `500 12px ${FUENTE}`;
  ctx.fillStyle = t.texto;
  const lineas = envolverTexto(ctx, texto, ANCHO_UI - MARGEN * 4);
  ctx.fillText(lineas[0] || '', ANCHO_UI / 2, r.desc);
  if (lineas[1]) ctx.fillText(lineas[1], ANCHO_UI / 2, r.desc + 15);
}
