import { ANCHO_UI, ALTO_UI } from '../core/constantes.js';
import { Capa, FUENTE, FUENTE_TITULO, textoEspaciado, envolverTexto } from './capa.js';
import { Tema, cenefa } from './tema.js';
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
// Aquí vive TODO lo que comparten: el fondo, el reparto vertical, la cabecera,
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

// Fondo, secciones, denarios, cenefa y rótulos de columna.
//
// `secciones` son los nombres de arriba a la izquierda y `activa` cuál está
// viva. La tienda pasa tres y la configuración una: con una sola, esto dibuja
// exactamente un titular subrayado, que es lo que hace falta, sin necesidad de
// un modo aparte.
//
// `columnas` son los cuatro rótulos, de los que el último va alineado a la
// derecha porque su columna también lo está.
export function armazon(ctxMundo, ctx, r, secciones, activa, columnas) {
  const t = Tema.actual;

  fondoTitulo(ctxMundo);
  ctx.fillStyle = 'rgba(6,5,10,.82)';
  ctx.fillRect(0, 0, ANCHO_UI, ALTO_UI);

  // Siempre TODAS a la vista aunque solo una esté viva: media gracia de una
  // pestaña es que se vea que hay otras.
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  let cx = MARGEN;
  for (let i = 0; i < secciones.length; i++) {
    const viva = activa === i;
    ctx.font = `${viva ? 17 : 15}px ${FUENTE_TITULO}`;
    ctx.fillStyle = viva ? t.titulo : t.apagado;
    const w = textoEspaciado(ctx, secciones[i], cx, r.pestanyas, 1.6);
    if (viva) {
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
  textoEspaciado(ctx, columnas[0], MARGEN, r.cabecera, 1.4);
  textoEspaciado(ctx, columnas[1], X_NIVEL, r.cabecera, 1.4);
  textoEspaciado(ctx, columnas[2], X_EFECTO, r.cabecera, 1.4);
  ctx.textAlign = 'right';
  ctx.fillText(columnas[3], X_VALOR, r.cabecera);

  ctx.globalAlpha = 0.35;
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

// La frase larga de lo señalado, abajo del todo. Cambia con el cursor, así que
// las filas se quedan compactas y solo se lee una a la vez.
export function descripcion(ctx, r, texto) {
  const t = Tema.actual;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `400 11px ${FUENTE}`;
  ctx.fillStyle = t.texto;
  const lineas = envolverTexto(ctx, texto, ANCHO_UI - MARGEN * 4);
  ctx.fillText(lineas[0] || '', ANCHO_UI / 2, r.desc);
  if (lineas[1]) ctx.fillText(lineas[1], ANCHO_UI / 2, r.desc + 14);
}
