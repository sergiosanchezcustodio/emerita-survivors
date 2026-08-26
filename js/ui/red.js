import { ANCHO_UI, ALTO_UI, ANCHO_FISICO, ALTO_FISICO } from '../core/constantes.js';
import { FUENTE, FUENTE_TITULO, textoEspaciado } from './capa.js';
import { Tema, panel } from './tema.js';
import { fondoTitulo } from './pantallas.js';

// LA PANTALLA DEL COOPERATIVO ONLINE.
//
// Aquí se hace a mano lo que hasta ahora se hacía desde la consola del
// navegador: generar el código, mandárselo al otro, pegar el suyo. Nada de lo
// que hay debajo cambia — es la misma conexión, el mismo códec y el mismo
// saludo—; lo único nuevo es que se puede usar sin saber que existe F12.
//
// POR QUÉ HAY QUE PASARSE UN CÓDIGO Y NO HAY UNA LISTA DE PARTIDAS. Para que
// dos navegadores se hablen tienen que intercambiar antes una descripción de
// cómo encontrarse, y para eso todavía no pueden hablarse. Lo normal es que
// haga de intermediario un servidor; aquí el intermediario sois vosotros, con
// el chat que ya uséis. Es la decisión de no depender de nada externo, y su
// precio es este: dos mensajes antes de jugar.
//
// EL PORTAPAPELES ES EL TECLADO DE ESTA PANTALLA. Un código son trescientos
// caracteres y no se teclean; se copian y se pegan. Copiar lo hace el juego
// solo; pegar necesita que lo pidas tú, porque el navegador no deja leer el
// portapapeles sin un gesto por delante.

const PANEL_ANCHO = 640;
const MARGEN = 26;

// El código, partido en trozos que quepan. No se enseña para leerlo —nadie va a
// copiarlo a mano— sino para que se vea que existe y que hay algo que mandar.
const TROZO = 48;

export const OPCIONES_RED = ['CREAR PARTIDA', 'UNIRME A UNA PARTIDA', 'VOLVER'];

function lineas(texto, cuantas) {
  const fuera = [];
  for (let i = 0; i < texto.length && fuera.length < cuantas; i += TROZO) {
    fuera.push(texto.slice(i, i + TROZO));
  }
  if (texto.length > cuantas * TROZO) {
    fuera[fuera.length - 1] = fuera[fuera.length - 1].slice(0, TROZO - 1) + '…';
  }
  return fuera;
}

function fondo(ctxMundo) {
  fondoTitulo(ctxMundo);
  ctxMundo.setTransform(1, 0, 0, 1, 0, 0);
  // MÁS OSCURO QUE LA PANTALLA DE PARTIDAS, y por una razón concreta: allí las
  // tres filas tapan el centro, y aquí hay poco texto sobre mucha ilustración.
  // Con el velo de allí se leían por debajo las opciones del menú del título
  // —START, TIENDA, CONFIGURACIÓN— y eso en una pantalla que no es esa no es
  // ambiente, es ruido: parece que se puedan pulsar.
  ctxMundo.fillStyle = 'rgba(6,6,12,.965)';
  ctxMundo.fillRect(0, 0, ANCHO_FISICO, ALTO_FISICO);
}

function titulo(ctx, texto) {
  const t = Tema.actual;
  ctx.font = `22px ${FUENTE_TITULO}`;
  ctx.fillStyle = t.titulo;
  textoEspaciado(ctx, texto, ANCHO_UI / 2, 52, 4);
}

// Un párrafo centrado, con las líneas que hagan falta.
function parrafo(ctx, textos, y, color, tamano = 15, salto = 22) {
  ctx.font = `${tamano}px ${FUENTE}`;
  ctx.fillStyle = color;
  for (let i = 0; i < textos.length; i++) {
    ctx.fillText(textos[i], ANCHO_UI / 2, y + i * salto);
  }
  return y + textos.length * salto;
}

// El menú de las tres opciones.
function dibujarMenu(ctx, cursor) {
  const t = Tema.actual;
  const ALTO = 40, HUECO = 12;
  const total = OPCIONES_RED.length * ALTO + (OPCIONES_RED.length - 1) * HUECO;
  let y = 150 + (ALTO_UI - 150 - 60 - total) / 2;
  const x = (ANCHO_UI - 360) / 2;

  for (let i = 0; i < OPCIONES_RED.length; i++) {
    const elegida = i === cursor;
    ctx.save();
    if (!elegida) ctx.globalAlpha = 0.45;
    panel(ctx, x, y, 360, ALTO, elegida);
    ctx.restore();
    ctx.font = `17px ${FUENTE}`;
    ctx.fillStyle = elegida ? t.titulo : t.texto;
    ctx.fillText(OPCIONES_RED[i], ANCHO_UI / 2, y + ALTO / 2);
    y += ALTO + HUECO;
  }
}

// El bloque con el código propio y qué hacer con él.
function dibujarCodigo(ctx, estado, y) {
  const t = Tema.actual;
  if (!estado.codigo) return y;
  const trozos = lineas(estado.codigo, 4);
  const alto = trozos.length * 18 + 34;
  const x = (ANCHO_UI - PANEL_ANCHO) / 2;
  panel(ctx, x, y, PANEL_ANCHO, alto, false);

  ctx.font = `12px ${FUENTE}`;
  ctx.fillStyle = t.apagado;
  for (let i = 0; i < trozos.length; i++) {
    ctx.fillText(trozos[i], ANCHO_UI / 2, y + 22 + i * 18);
  }
  return y + alto + MARGEN;
}

export function dibujarRed(ctxMundo, ctx, estado) {
  fondo(ctxMundo);
  const t = Tema.actual;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (estado.fase === 'menu') {
    titulo(ctx, 'COOPERATIVO ONLINE');
    parrafo(ctx, [
      'Uno crea la partida y le manda un código al otro por donde habléis.',
      'El otro contesta con el suyo. Dos mensajes y a jugar.'
    ], 100, t.apagado, 14, 20);
    dibujarMenu(ctx, estado.cursor);
    ctx.restore();
    return;
  }

  if (estado.fase === 'creando' || estado.fase === 'uniendo') {
    titulo(ctx, estado.fase === 'creando' ? 'CREANDO PARTIDA' : 'UNIÉNDOME');
    parrafo(ctx, [estado.aviso || 'Un momento…'], ALTO_UI / 2, t.texto, 17);
    ctx.restore();
    return;
  }

  if (estado.fase === 'esperando') {
    titulo(ctx, estado.esAnfitrion ? 'MANDA TU CÓDIGO' : 'DEVUELVE TU CÓDIGO');
    // El bloque arranca por debajo del tercio: con todo pegado arriba, la mitad
    // inferior quedaba vacía y la pantalla se leía como si le faltara algo.
    let y = 150;
    y = parrafo(ctx, estado.copiado
      ? ['Tu código está COPIADO: pégalo donde habléis.']
      : ['Copia el código de abajo y mándaselo.'], y, t.texto, 16) + 6;
    y = dibujarCodigo(ctx, estado, y);
    parrafo(ctx, estado.esAnfitrion
      ? ['Cuando te devuelva el suyo, pulsa  V  para pegarlo.',
         'ESC para volver.']
      : ['En cuanto lo pegue, entráis a la partida.',
         'ESC para volver.'], y, t.apagado, 15);
    ctx.restore();
    return;
  }

  if (estado.fase === 'pegar') {
    titulo(ctx, 'PEGA SU CÓDIGO');
    parrafo(ctx, [
      'Pulsa  V  para pegar el código que te han mandado.',
      '',
      'ESC para volver.'
    ], ALTO_UI / 2 - 20, t.texto, 17);
    ctx.restore();
    return;
  }

  if (estado.fase === 'conectado') {
    titulo(ctx, 'CONECTADOS');
    parrafo(ctx, estado.esAnfitrion
      ? ['Ya estáis conectados.', '', 'ENTER para empezar la partida.']
      : ['Ya estáis conectados.', '', 'Esperando a que empiece el anfitrión…'],
      ALTO_UI / 2 - 24, t.texto, 17);
    ctx.restore();
    return;
  }

  // Error.
  titulo(ctx, 'NO HA PODIDO SER');
  parrafo(ctx, lineas(estado.aviso || 'Algo ha fallado.', 3), ALTO_UI / 2 - 20,
          t.texto, 15);
  parrafo(ctx, ['ESC para volver.'], ALTO_UI / 2 + 60, t.apagado, 15);
  ctx.restore();
}
