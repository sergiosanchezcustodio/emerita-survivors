import { ANCHO_FISICO, ALTO_FISICO } from '../core/constantes.js';
import { Progresion } from '../sistemas/progresion.js';

// Pantalla de subida de nivel. Se dibuja en PÍXELES FÍSICOS con la matriz
// identidad: es interfaz, no pixel art, y tiene que leerse.
//
// Tres opciones, no las cuatro del plan: decisión de diseño. Con tres, la
// elección se lee de un vistazo y no interrumpe tanto el ritmo.
//
// En cooperativo el menú es de UN jugador cada vez —los demás esperan— porque
// dos menús simultáneos sobre la misma pantalla no hay forma de leerlos. Se
// indica de quién es arriba del todo.

const ANCHO_CARTA = 258;
const ALTO_CARTA = 132;
const HUECO = 18;

// SIN transparencias. El menú detiene el juego, así que no tiene por qué dejar
// ver lo que hay detrás: un panel translúcido sobre ochocientos enemigos es
// ilegible justo en el momento en que hay que decidir. Fondo opaco, bordes
// dobles y tipografía con contraste.
const FONDO_VELO   = '#12101a';
const FONDO_CARTA  = '#1d1926';
const FONDO_ELEGIDA= '#2e2740';
const BORDE_OSCURO = '#0a0810';
const BORDE_SUAVE  = '#4a4256';

const COLOR_ARMA_NUEVA   = '#e8b73a';
const COLOR_ARMA_MEJORA  = '#cbbfa4';
const COLOR_PASIVO_NUEVO = '#7fc4e8';
const COLOR_PASIVO_MEJORA= '#9fb0bd';
const COLOR_CURACION     = '#8fbf5a';

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
  return `${que}  ·  nivel ${o.nivelActual} → ${o.nivelActual + 1}`;
}

export function dibujarMenuNivel(ctx) {
  const j = Progresion.actual;
  if (!j) return;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // Fondo OPACO. El juego está congelado detrás y no aporta nada verlo; lo que
  // aporta es que las tres cartas se lean sin competir con la horda.
  ctx.fillStyle = FONDO_VELO;
  ctx.fillRect(0, 0, ANCHO_FISICO, ALTO_FISICO);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.font = 'bold 22px Consolas, monospace';
  ctx.fillStyle = '#e2dccb';
  ctx.fillText(`NIVEL ${j.nivel}`, ANCHO_FISICO / 2, 44);

  ctx.font = '13px Consolas, monospace';
  ctx.fillStyle = '#a49d90';
  ctx.fillText(`${j.def.nombre}  ·  elige una mejora`, ANCHO_FISICO / 2, 68);

  const n = Progresion.nOpciones;
  const anchoTotal = n * ANCHO_CARTA + (n - 1) * HUECO;
  const x0 = (ANCHO_FISICO - anchoTotal) / 2;
  const y0 = 108;

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
    ctx.fillRect(x, y0, ANCHO_CARTA, 3);

    ctx.strokeStyle = BORDE_OSCURO;
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 0.5, y0 - 0.5, ANCHO_CARTA + 1, ALTO_CARTA + 1);
    ctx.strokeStyle = elegida ? color : BORDE_SUAVE;
    ctx.lineWidth = elegida ? 2 : 1;
    ctx.strokeRect(x + 1, y0 + 1, ANCHO_CARTA - 2, ALTO_CARTA - 2);

    ctx.textAlign = 'center';
    ctx.font = '10px Consolas, monospace';
    ctx.fillStyle = color;
    ctx.fillText(etiquetaDe(o), x + ANCHO_CARTA / 2, y0 + 24);

    ctx.font = 'bold 17px Consolas, monospace';
    ctx.fillStyle = '#f0ead9';
    ctx.fillText(o.nombre, x + ANCHO_CARTA / 2, y0 + 54);

    // Descripción partida a mano en dos líneas: measureText por frame para
    // ajustar el corte sería caro y aquí el texto es fijo.
    ctx.font = '11px Consolas, monospace';
    ctx.fillStyle = '#b9b2a4';
    const desc = o.descripcion || '';
    const corte = desc.length > 34 ? desc.lastIndexOf(' ', 34) : -1;
    if (corte > 0) {
      ctx.fillText(desc.slice(0, corte), x + ANCHO_CARTA / 2, y0 + 84);
      ctx.fillText(desc.slice(corte + 1), x + ANCHO_CARTA / 2, y0 + 100);
    } else {
      ctx.fillText(desc, x + ANCHO_CARTA / 2, y0 + 92);
    }

    // Número de atajo, para elegir con 1/2/3 sin moverse por el menú.
    ctx.font = 'bold 12px Consolas, monospace';
    ctx.fillStyle = '#7d7669';
    ctx.textAlign = 'left';
    ctx.fillText(String(i + 1), x + 8, y0 + ALTO_CARTA - 12);
  }

  ctx.textAlign = 'center';
  ctx.font = '12px Consolas, monospace';
  ctx.fillStyle = '#a49d90';
  ctx.fillText('◀ ▶ o 1/2/3 para elegir  ·  ENTER o A confirma', ANCHO_FISICO / 2, y0 + ALTO_CARTA + 30);

  if (j.rerolls > 0) {
    ctx.fillStyle = '#7d7669';
    ctx.fillText(`R vuelve a tirar  (${j.rerolls})`, ANCHO_FISICO / 2, y0 + ALTO_CARTA + 50);
  }

  // Aviso de cola: con cooperativo puede haber varios esperando turno.
  if (Progresion.cola.length > 0) {
    ctx.fillStyle = '#e8b73a';
    ctx.fillText(`${Progresion.cola.length} jugador(es) esperando turno`,
                 ANCHO_FISICO / 2, ALTO_FISICO - 24);
  }

  ctx.restore();
}
