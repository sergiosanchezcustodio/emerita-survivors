import { ANCHO_FISICO, ALTO_FISICO } from '../core/constantes.js';
import { Progresion } from '../sistemas/progresion.js';
import { FUENTE, FUENTE_TITULO, textoEspaciado } from './capa.js';

// Pantalla de subida de nivel. Se dibuja en la CAPA DE INTERFAZ (ui/capa.js),
// a resolución de pantalla: aquí hay que leer, y leer deprisa, porque el juego
// está parado esperando una decisión.
//
// Tres opciones, no las cuatro del plan: decisión de diseño. Con tres, la
// elección se lee de un vistazo y no interrumpe tanto el ritmo.
//
// En cooperativo el menú es de UN jugador cada vez —los demás esperan— porque
// dos menús simultáneos sobre la misma pantalla no hay forma de leerlos. Se
// indica de quién es arriba del todo.

const ANCHO_CARTA = 262;
const ALTO_CARTA = 150;
const HUECO = 20;

// SIN TRANSPARENCIAS, en el velo y en las cartas. El menú detiene el juego, así
// que no tiene por qué dejar ver lo que hay detrás: un panel translúcido sobre
// ochocientos enemigos es ilegible justo en el momento en que hay que decidir.
const FONDO_VELO    = '#12101a';
const FONDO_CARTA   = '#1d1926';
const FONDO_ELEGIDA = '#2e2740';
const BORDE_OSCURO  = '#0a0810';
const BORDE_SUAVE   = '#4a4256';

const COLOR_ARMA_NUEVA    = '#e8b73a';
const COLOR_ARMA_MEJORA   = '#cbbfa4';
const COLOR_PASIVO_NUEVO  = '#7fc4e8';
const COLOR_PASIVO_MEJORA = '#9fb0bd';
const COLOR_CURACION      = '#8fbf5a';

function colorDe(o) {
  if (o.clase === 'curacion') return COLOR_CURACION;
  if (o.clase === 'arma') return o.nuevo ? COLOR_ARMA_NUEVA : COLOR_ARMA_MEJORA;
  return o.nuevo ? COLOR_PASIVO_NUEVO : COLOR_PASIVO_MEJORA;
}

function etiquetaDe(o) {
  if (o.clase === 'curacion') return 'RECOMPENSA';
  const esArma = o.clase === 'arma';
  if (o.nuevo) return esArma ? 'ARMA NUEVA' : 'PASIVO NUEVO';
  const que = esArma ? 'ARMA' : 'PASIVO';
  return `${que}   ${o.nivelActual} → ${o.nivelActual + 1}`;
}

// Corta la descripción en dos líneas por el hueco más cercano al centro, para
// que no quede una línea larga y otra de dos palabras.
function partir(texto) {
  if (texto.length <= 30) return [texto, ''];
  const medio = texto.length >> 1;
  let corte = -1;
  for (let i = 0; i < texto.length; i++) {
    if (texto[i] !== ' ') continue;
    if (corte < 0 || Math.abs(i - medio) < Math.abs(corte - medio)) corte = i;
  }
  if (corte < 0) return [texto, ''];
  return [texto.slice(0, corte), texto.slice(corte + 1)];
}

export function dibujarMenuNivel(ctx) {
  const j = Progresion.actual;
  if (!j) return;

  ctx.save();

  // Fondo OPACO. El juego está congelado detrás y no aporta nada verlo; lo que
  // aporta es que las tres cartas se lean sin competir con la horda.
  ctx.fillStyle = FONDO_VELO;
  ctx.fillRect(0, 0, ANCHO_FISICO, ALTO_FISICO);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.font = `28px ${FUENTE_TITULO}`;
  ctx.fillStyle = '#e8dfc8';
  textoEspaciado(ctx, `NIVEL ${j.nivel}`, ANCHO_FISICO / 2, 46, 4);

  ctx.font = `400 14px ${FUENTE}`;
  ctx.fillStyle = '#948d81';
  ctx.fillText(`${j.def.nombre}   ·   elige una mejora`, ANCHO_FISICO / 2, 74);

  const n = Progresion.nOpciones;
  const anchoTotal = n * ANCHO_CARTA + (n - 1) * HUECO;
  const x0 = (ANCHO_FISICO - anchoTotal) / 2;
  const y0 = 104;

  for (let i = 0; i < n; i++) {
    const o = Progresion.opciones[i];
    const x = x0 + i * (ANCHO_CARTA + HUECO);
    const elegida = i === Progresion.seleccion;
    const color = colorDe(o);

    ctx.fillStyle = elegida ? FONDO_ELEGIDA : FONDO_CARTA;
    ctx.fillRect(x, y0, ANCHO_CARTA, ALTO_CARTA);

    // Franja de color arriba: identifica de un vistazo si es arma o pasivo,
    // nuevo o mejora, sin tener que leer la etiqueta.
    ctx.fillStyle = color;
    ctx.fillRect(x, y0, ANCHO_CARTA, elegida ? 4 : 3);

    ctx.strokeStyle = BORDE_OSCURO;
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 0.5, y0 - 0.5, ANCHO_CARTA + 1, ALTO_CARTA + 1);
    ctx.strokeStyle = elegida ? color : BORDE_SUAVE;
    ctx.lineWidth = elegida ? 2 : 1;
    ctx.strokeRect(x + 1, y0 + 1, ANCHO_CARTA - 2, ALTO_CARTA - 2);

    ctx.textAlign = 'center';
    const centro = x + ANCHO_CARTA / 2;

    ctx.font = `600 10px ${FUENTE}`;
    ctx.fillStyle = color;
    textoEspaciado(ctx, etiquetaDe(o), centro, y0 + 30, 1.5);

    ctx.font = `600 20px ${FUENTE}`;
    ctx.fillStyle = '#f2ecdc';
    ctx.fillText(o.nombre, centro, y0 + 62);

    ctx.font = `400 12px ${FUENTE}`;
    ctx.fillStyle = '#a9a396';
    const [l1, l2] = partir(o.descripcion || '');
    if (l2) {
      ctx.fillText(l1, centro, y0 + 95);
      ctx.fillText(l2, centro, y0 + 113);
    } else {
      ctx.fillText(l1, centro, y0 + 104);
    }

    // Número de atajo, para elegir con 1/2/3 sin moverse por el menú.
    ctx.font = `600 12px ${FUENTE}`;
    ctx.fillStyle = elegida ? color : '#6b6459';
    ctx.textAlign = 'left';
    ctx.fillText(String(i + 1), x + 11, y0 + ALTO_CARTA - 14);
  }

  ctx.textAlign = 'center';
  ctx.font = `400 13px ${FUENTE}`;
  ctx.fillStyle = '#948d81';
  ctx.fillText('◀ ▶ o 1/2/3 para elegir   ·   ENTER o A confirma',
               ANCHO_FISICO / 2, y0 + ALTO_CARTA + 32);

  if (j.rerolls > 0) {
    ctx.font = `400 12px ${FUENTE}`;
    ctx.fillStyle = '#6b6459';
    ctx.fillText(`R vuelve a tirar   (${j.rerolls})`,
                 ANCHO_FISICO / 2, y0 + ALTO_CARTA + 54);
  }

  // Aviso de cola: con cooperativo puede haber varios esperando turno.
  if (Progresion.cola.length > 0) {
    ctx.font = `500 12px ${FUENTE}`;
    ctx.fillStyle = '#e8b73a';
    ctx.fillText(`${Progresion.cola.length} jugador(es) esperando turno`,
                 ANCHO_FISICO / 2, ALTO_FISICO - 26);
  }

  ctx.restore();
}
