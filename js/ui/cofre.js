import { ANCHO_UI, ALTO_UI } from '../core/constantes.js';
import { Progresion } from '../sistemas/progresion.js';
import { FUENTE, FUENTE_TITULO, textoEspaciado } from './capa.js';
import { Tema, panel, cenefa } from './tema.js';
import { ALTO_FICHA, MARGEN_FICHA } from './hud.js';

// Pantalla de EVOLUCIÓN. Sale al abrir un cofre llevando un arma a nivel 8 con
// su pasivo, y es lo único que un cofre concede sin preguntar: las tres opciones
// normales las pinta el menú de subida de nivel (ui/menuNivel.js), que es el
// mismo para las dos cosas.
//
// Aquí no se elige nada porque no hay nada que elegir, y por eso se cierra con
// cualquier tecla. Existe como pantalla propia —en vez de un aviso en una
// esquina— porque una evolución pasa cinco veces por partida como mucho, y solo
// si te lo has montado para que pase: merece que el juego se pare a enseñarla.

const ANCHO_PANEL = 300;
const ALTO_PANEL = 128;
const MARGEN_PANTALLA = 14;
const HUECO = 8;
const ESTORBO_FICHA = ALTO_FICHA + MARGEN_FICHA;

const COLOR_EVOLUCION = '#ffd45a';
const COLOR_JUGADOR = ['#5aa9e6', '#e8b73a', '#8fbf5a', '#d64b8f'];

// Lo normal que sale de un cofre: una subida de nivel de algo que ya llevas —o
// tres, una de cada diez veces—. Panel bajo, una línea por mejora.
//
// No se elige nada aquí tampoco. Solo hay que enterarse, y por eso el panel es
// del tamaño de lo que tiene que decir en vez de del tamaño de una pantalla.
function dibujarMejoras(ctx, jugadores, j) {
  const t = Tema.actual;
  const n = Progresion.nMejoras;
  const alto = 62 + n * 20;
  const indice = jugadores ? jugadores.indexOf(j) : -1;
  const unSolo = !jugadores || jugadores.length <= 1;
  const { x: px, y: py } = situar(indice, unSolo, alto);
  const colorJ = COLOR_JUGADOR[(indice < 0 ? 0 : indice) % COLOR_JUGADOR.length];

  ctx.save();
  panel(ctx, px, py, ANCHO_PANEL, alto, COLOR_EVOLUCION);

  ctx.textBaseline = 'middle';
  const yCabecera = py + 17;
  ctx.textAlign = 'left';
  ctx.font = `600 10px ${FUENTE}`;
  ctx.fillStyle = colorJ;
  ctx.fillText(unSolo ? j.def.nombre : `P${indice + 1}  ${j.def.nombre}`, px + 12, yCabecera);

  ctx.textAlign = 'right';
  ctx.font = `17px ${FUENTE_TITULO}`;
  ctx.fillStyle = COLOR_EVOLUCION;
  // Tres mejoras es el premio gordo y merece decirlo: si saliera con el mismo
  // titular que una, el jugador no se enteraría de que le ha tocado.
  textoEspaciado(ctx, n > 1 ? 'GRAN TESORO' : 'TESORO',
                 px + ANCHO_PANEL - 12, yCabecera, 2.5);

  cenefa(ctx, px + 12, py + 26, ANCHO_PANEL - 24);

  let y = py + 44;
  for (let i = 0; i < n; i++) {
    const m = Progresion.mejoras[i];
    ctx.textAlign = 'left';
    ctx.font = `600 12px ${FUENTE}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(m.nombre, px + 20, y);

    ctx.textAlign = 'right';
    ctx.font = `500 10px ${FUENTE}`;
    ctx.fillStyle = t.texto;
    ctx.fillText(m.clase === 'curacion' ? '+30 de vida' : `nivel ${m.nivel}`,
                 px + ANCHO_PANEL - 20, y);
    y += 20;
  }

  ctx.textAlign = 'center';
  ctx.font = `500 9px ${FUENTE}`;
  ctx.fillStyle = t.apagado;
  ctx.fillText('cualquier tecla', px + ANCHO_PANEL / 2, py + alto - 13);
  ctx.restore();
}

function situar(indice, unSolo, alto = ALTO_PANEL) {
  if (unSolo || indice < 0) {
    return { x: (ANCHO_UI - ANCHO_PANEL) / 2, y: (ALTO_UI - alto) / 2 };
  }
  const derecha = (indice % 2) === 1;
  const abajo = indice >= 2;
  return {
    x: derecha ? ANCHO_UI - ANCHO_PANEL - MARGEN_PANTALLA : MARGEN_PANTALLA,
    y: abajo ? ALTO_UI - ESTORBO_FICHA - HUECO - alto : ESTORBO_FICHA + HUECO
  };
}

export function dibujarCofre(ctx, jugadores) {
  const j = Progresion.cofre;
  if (!j) return;
  if (!Progresion.cofreEsEvolucion) return dibujarMejoras(ctx, jugadores, j);

  const t = Tema.actual;
  const evo = Progresion.evolucion;
  const indice = jugadores ? jugadores.indexOf(j) : -1;
  const unSolo = !jugadores || jugadores.length <= 1;
  const { x: px, y: py } = situar(indice, unSolo);
  const colorJ = COLOR_JUGADOR[(indice < 0 ? 0 : indice) % COLOR_JUGADOR.length];

  ctx.save();

  // Marco de oro, no del color del jugador: es la pantalla más rara del juego y
  // tiene que verse desde el otro lado del sofá.
  panel(ctx, px, py, ANCHO_PANEL, ALTO_PANEL, COLOR_EVOLUCION);

  ctx.textBaseline = 'middle';
  const yCabecera = py + 17;

  ctx.textAlign = 'left';
  ctx.font = `600 10px ${FUENTE}`;
  ctx.fillStyle = colorJ;
  ctx.fillText(unSolo ? j.def.nombre : `P${indice + 1}  ${j.def.nombre}`, px + 12, yCabecera);

  ctx.textAlign = 'right';
  ctx.font = `17px ${FUENTE_TITULO}`;
  ctx.fillStyle = COLOR_EVOLUCION;
  textoEspaciado(ctx, 'EVOLUCION', px + ANCHO_PANEL - 12, yCabecera, 2.5);

  cenefa(ctx, px + 12, py + 26, ANCHO_PANEL - 24);

  // El nombre del arma, grande y centrado. Es el premio entero.
  const cx = px + ANCHO_PANEL / 2;
  ctx.textAlign = 'center';
  ctx.font = `600 ${evo.nombre.length > 20 ? 15 : 18}px ${FUENTE}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(evo.nombre, cx, py + 62);

  // La receta debajo, en pequeño: es lo que enseña la regla al que llega aquí
  // por primera vez sin saber cómo lo ha conseguido.
  ctx.font = `400 10px ${FUENTE}`;
  ctx.fillStyle = t.texto;
  ctx.fillText(evo.detalle, cx, py + 84);

  ctx.font = `500 9px ${FUENTE}`;
  ctx.fillStyle = t.apagado;
  ctx.fillText('cualquier tecla', cx, py + ALTO_PANEL - 16);

  ctx.restore();
}
