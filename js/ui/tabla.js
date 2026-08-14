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
export function armazon(ctxMundo, ctx, r, secciones, activa, columnas) {
  const t = Tema.actual;

  fondoTitulo(ctxMundo);
  ctx.fillStyle = 'rgba(6,5,10,.82)';
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
  ctx.textAlign = 'right';
  textoEspaciado(ctx, columnas[3], X_VALOR, r.cabecera, 1.6);

  ctx.globalAlpha = 0.3;
  ctx.fillStyle = t.filo;
  ctx.fillRect(MARGEN, r.regla, ANCHO_UI - MARGEN * 2, 1);
  ctx.globalAlpha = 1;
}

// Fondo de la fila señalada, a todo el ancho de la tabla.
export function resalte(ctx, y, alto) {
  ctx.fillStyle = Tema.actual.cartaElegida;
  ctx.fillRect(MARGEN - 10, y, ANCHO_UI - MARGEN * 2 + 20, alto - 4);
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
