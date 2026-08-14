import { ANCHO_UI, ALTO_UI } from '../core/constantes.js';
import { FUENTE, FUENTE_TITULO, textoEspaciado } from './capa.js';
import { Tema, panel } from './tema.js';
import { GestorAudio } from '../sistemas/audio.js';
import {
  rejilla, armazon, resalte, puntos, descripcion,
  X_ICONO, X_NOMBRE, X_NIVEL, X_EFECTO, X_VALOR, RADIO_PUNTO
} from './tabla.js';

// CONFIGURACIÓN. La misma pantalla que la tienda —pantalla completa, velo sobre
// la ilustración del título, cabecera, columnas y fila resaltada— pero con los
// ajustes en vez de con lo que se compra. Lo pidió Sergio así y tiene sentido:
// son las dos únicas listas del juego que se recorren de arriba abajo, y que se
// vieran distintas era una diferencia sin motivo.
//
// El armazón entero lo pone ui/tabla.js. Aquí solo están las cuatro filas.
//
// LOS VOLÚMENES VAN EN LA COLUMNA DE NIVEL, con los mismos puntos que usa la
// tienda para los escalones de un potenciador. Encaja de suerte y encaja bien:
// el volumen se mueve de diez en diez (ver ajustarMusica en sistemas/audio.js),
// así que son exactamente diez puntos y se lee de un vistazo dónde está el
// mando sin tener que buscar el porcentaje.
const PASOS_VOLUMEN = 10;

const ALTO_FILA = 46;
const COLOR_PELIGRO = '#e8907c';

// Lo que dice cada ajuste, corto para la columna y largo para el renglón de
// abajo. Va aquí y no en datos/ porque no es contenido del juego: es la etiqueta
// de un mando de esta pantalla.
const TEXTOS = {
  musica:   { efecto: 'Banda sonora',
              larga: 'Volumen de la música del menú y de la partida.' },
  efectos:  { efecto: 'Golpes, gemas y voces',
              larga: 'Volumen de todo lo que suena al jugar, sin contar la música.' },
  pantalla: { efecto: 'Ocupa el monitor entero',
              larga: 'También se entra y se sale con el botón de la esquina.' },
  borrar:   { efecto: 'Denarios, potenciadores y mascotas',
              larga: 'Borra TODO el progreso guardado. Pregunta antes, y no se puede deshacer.' }
};

function valor(id) {
  if (id === 'musica') return Math.round(GestorAudio.volumenMusica() * 100) + '%';
  if (id === 'efectos') return Math.round(GestorAudio.volumenEfectos() * 100) + '%';
  if (id === 'pantalla') return document.fullscreenElement ? 'Sí' : 'No';
  return 'Borrar';
}

function nivel(id) {
  if (id === 'musica') return Math.round(GestorAudio.volumenMusica() * PASOS_VOLUMEN);
  if (id === 'efectos') return Math.round(GestorAudio.volumenEfectos() * PASOS_VOLUMEN);
  return -1;                    // sin escalones: no es un mando graduado
}

// Un icono por ajuste, trazado a mano. No hay arte para esto y tampoco hace
// falta: son cuatro símbolos que se reconocen por la silueta —una nota, un
// altavoz, un marco y una calavera— y a este tamaño un dibujo detallado se
// vería peor que una forma limpia.
function icono(ctx, id, cx, cy, r) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (id === 'musica') {
    // Corchea: cabeza, plica y banderola.
    ctx.fillStyle = '#9fd0e8';
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.25, cy + r * 0.45, r * 0.34, r * 0.26, -0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#9fd0e8';
    ctx.lineWidth = Math.max(1.5, r * 0.16);
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.06, cy + r * 0.45);
    ctx.lineTo(cx + r * 0.06, cy - r * 0.7);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.06, cy - r * 0.7);
    ctx.quadraticCurveTo(cx + r * 0.8, cy - r * 0.45, cx + r * 0.5, cy - r * 0.02);
    ctx.stroke();

  } else if (id === 'efectos') {
    // Altavoz con dos ondas.
    ctx.fillStyle = '#9fd0e8';
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.75, cy - r * 0.28);
    ctx.lineTo(cx - r * 0.36, cy - r * 0.28);
    ctx.lineTo(cx + r * 0.04, cy - r * 0.72);
    ctx.lineTo(cx + r * 0.04, cy + r * 0.72);
    ctx.lineTo(cx - r * 0.36, cy + r * 0.28);
    ctx.lineTo(cx - r * 0.75, cy + r * 0.28);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#9fd0e8';
    ctx.lineWidth = Math.max(1.4, r * 0.14);
    for (let k = 1; k <= 2; k++) {
      ctx.beginPath();
      ctx.arc(cx + r * 0.1, cy, r * (0.2 + k * 0.28), -0.9, 0.9);
      ctx.stroke();
    }

  } else if (id === 'pantalla') {
    // Marco con las cuatro esquinas marcadas: el mismo gesto que el botón de la
    // esquina de la página.
    ctx.strokeStyle = '#9fd0e8';
    ctx.lineWidth = Math.max(1.4, r * 0.14);
    ctx.strokeRect(cx - r * 0.72, cy - r * 0.56, r * 1.44, r * 1.12);
    ctx.lineWidth = Math.max(2, r * 0.22);
    const b = r * 0.34;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.72, cy - r * 0.56 + b); ctx.lineTo(cx - r * 0.72, cy - r * 0.56); ctx.lineTo(cx - r * 0.72 + b, cy - r * 0.56);
    ctx.moveTo(cx + r * 0.72 - b, cy - r * 0.56); ctx.lineTo(cx + r * 0.72, cy - r * 0.56); ctx.lineTo(cx + r * 0.72, cy - r * 0.56 + b);
    ctx.moveTo(cx - r * 0.72, cy + r * 0.56 - b); ctx.lineTo(cx - r * 0.72, cy + r * 0.56); ctx.lineTo(cx - r * 0.72 + b, cy + r * 0.56);
    ctx.moveTo(cx + r * 0.72 - b, cy + r * 0.56); ctx.lineTo(cx + r * 0.72, cy + r * 0.56); ctx.lineTo(cx + r * 0.72, cy + r * 0.56 - b);
    ctx.stroke();

  } else {
    // Calavera: lo único de esta pantalla que no se deshace, y se avisa desde
    // el icono.
    ctx.fillStyle = COLOR_PELIGRO;
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.12, r * 0.62, Math.PI, 0);
    ctx.lineTo(cx + r * 0.62, cy + r * 0.28);
    ctx.lineTo(cx - r * 0.62, cy + r * 0.28);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(cx - r * 0.34, cy + r * 0.28, r * 0.68, r * 0.34);
    ctx.fillStyle = 'rgba(20,12,10,.85)';
    ctx.beginPath();
    ctx.arc(cx - r * 0.26, cy - r * 0.1, r * 0.19, 0, Math.PI * 2);
    ctx.arc(cx + r * 0.26, cy - r * 0.1, r * 0.19, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx - r * 0.1, cy + r * 0.3, r * 0.08, r * 0.3);
    ctx.fillRect(cx + r * 0.04, cy + r * 0.3, r * 0.08, r * 0.3);
  }
  ctx.restore();
}

export function dibujarConfig(ctxMundo, ctx, opciones, cursor, confirmando) {
  const t = Tema.actual;
  const r = rejilla(opciones.length, ALTO_FILA);

  ctx.save();
  armazon(ctxMundo, ctx, r, ['CONFIGURACIÓN'], 0,
          ['AJUSTE', 'NIVEL', 'QUÉ CAMBIA', 'VALOR']);

  const radio = Math.min(15, r.alto * 0.34);
  for (let i = 0; i < opciones.length; i++) {
    const o = opciones[i];
    const txt = TEXTOS[o.id] || { efecto: '', larga: '' };
    const elegida = i === cursor;
    const peligro = o.id === 'borrar';
    const y = r.filas + i * r.alto;
    const yc = y + r.alto / 2 - 2;

    if (elegida) resalte(ctx, y, r.alto);

    icono(ctx, o.id, X_ICONO, yc, radio);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `600 13px ${FUENTE}`;
    ctx.fillStyle = peligro ? COLOR_PELIGRO : (elegida ? '#ffffff' : t.titulo);
    ctx.fillText(o.texto, X_NOMBRE, yc);

    const n = nivel(o.id);
    if (n >= 0) puntos(ctx, X_NIVEL + RADIO_PUNTO, yc, n, PASOS_VOLUMEN, elegida);

    ctx.font = `500 11px ${FUENTE}`;
    ctx.fillStyle = t.texto;
    ctx.fillText(txt.efecto, X_EFECTO, yc);

    ctx.textAlign = 'right';
    ctx.font = `700 13px ${FUENTE}`;
    ctx.fillStyle = peligro ? COLOR_PELIGRO : t.titulo;
    ctx.fillText(valor(o.id), X_VALOR, yc);
  }

  descripcion(ctx, r, (TEXTOS[opciones[cursor].id] || { larga: '' }).larga);
  ctx.restore();

  if (confirmando) dibujarConfirmacion(ctx);
}

// Ventana de confirmar el borrado. Esta SÍ se queda como panel pequeño en el
// centro y con sus dos teclas escritas: es lo contrario de una lista que se
// recorre —es una pregunta que hay que contestar— y aquí las teclas no son una
// ayuda que sobre, son los dos botones del diálogo.
export function dibujarConfirmacion(ctx) {
  const t = Tema.actual;
  const ancho = 330, alto = 128;
  const px = (ANCHO_UI - ancho) / 2;
  const py = (ALTO_UI - alto) / 2;

  ctx.save();
  ctx.fillStyle = 'rgba(6,5,10,.78)';
  ctx.fillRect(0, 0, ANCHO_UI, ALTO_UI);
  panel(ctx, px, py, ancho, alto, '#a04a3c');

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `18px ${FUENTE_TITULO}`;
  ctx.fillStyle = '#e8b0a4';
  textoEspaciado(ctx, '¿EMPEZAR DE CERO?', ANCHO_UI / 2, py + 26, 3);

  ctx.font = `400 11px ${FUENTE}`;
  ctx.fillStyle = t.texto;
  ctx.fillText('Se pierden TODAS las monedas, las mejoras', ANCHO_UI / 2, py + 58);
  ctx.fillText('y las mascotas. No se puede deshacer.', ANCHO_UI / 2, py + 74);

  ctx.font = `600 11px ${FUENTE}`;
  ctx.fillStyle = COLOR_PELIGRO;
  ctx.fillText('Enter · borrar', ANCHO_UI / 2 - 64, py + 104);
  ctx.fillStyle = t.titulo;
  ctx.fillText('Esc · cancelar', ANCHO_UI / 2 + 64, py + 104);
  ctx.restore();
}
