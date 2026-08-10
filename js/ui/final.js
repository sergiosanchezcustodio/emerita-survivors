import { ANCHO_UI } from '../core/constantes.js';
import { FUENTE, FUENTE_TITULO, textoEspaciado } from './capa.js';
import { Tema, panel, cenefa } from './tema.js';
import { ARMAS } from '../datos/armas.js';
import { PASIVOS } from '../datos/pasivos.js';
import { dibujarIconoArma, dibujarIconoPasivo } from './hud.js';

// PANTALLA FINAL (Fase 7, sección 14 del plan): tiempo sobrevivido, nivel,
// bajas, arsenal y denarios, tanto si se sobrevive a la horda como si no.
// Victoria y derrota comparten forma —solo cambian título, color y una
// línea de cierre— porque las dos son el mismo momento: la partida ha
// terminado y toca mirar el resumen, no seguir jugando.
//
// UN PANEL GRANDE, no el aviso pequeño de pausa/abatido de siempre (ver
// ui/depuracion.js): ahí solo hacía falta una frase, aquí hay cifras que
// leer con calma y un inventario que enseñar.
const ANCHO_PANEL = 300;
const ALTO_PANEL = 188;
const RELLENO = 16;

const COLOR_VICTORIA = { titulo: '#e8c368', borde: '#e8c368', pie: '#d7c9a0' };
const COLOR_DERROTA = { titulo: '#e8b0a4', borde: '#a04a3c', pie: '#a4837c' };

function filaEstadistica(ctx, x, y, w, etiqueta, valor, t) {
  ctx.textAlign = 'left';
  ctx.font = `500 10px ${FUENTE}`;
  ctx.fillStyle = t.apagado;
  ctx.fillText(etiqueta, x, y);
  ctx.textAlign = 'right';
  ctx.font = `700 11px ${FUENTE}`;
  ctx.fillStyle = t.titulo;
  ctx.fillText(valor, x + w, y);
}

// `stats` sale de main.js, capturado UNA vez en el instante en que termina
// la partida (ver el flanco de victoria/derrota): { tiempo, nivel, bajas,
// denarios, armas, pasivos }. `armas` son las equipadas del arsenal
// (jugador 1 — con cooperativo el nivel y las bajas ya son de equipo, pero
// el arsenal es personal de cada uno, y hay que elegir uno para no montar
// cuatro inventarios en la misma pantalla).
export function dibujarFinal(ctx, alto, victoria, stats) {
  const t = Tema.actual;
  const color = victoria ? COLOR_VICTORIA : COLOR_DERROTA;
  const x = (ANCHO_UI - ANCHO_PANEL) / 2;
  const y = (alto - ALTO_PANEL) / 2;

  ctx.save();
  panel(ctx, x, y, ANCHO_PANEL, ALTO_PANEL, color.borde);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `30px ${FUENTE_TITULO}`;
  ctx.fillStyle = color.titulo;
  textoEspaciado(ctx, victoria ? 'VICTORIA' : 'DERROTA', ANCHO_UI / 2, y + 30, 6);

  cenefa(ctx, x + RELLENO, y + 48, ANCHO_PANEL - RELLENO * 2);

  // --- Estadísticas, dos columnas -----------------------------------------
  const yStats = y + 66;
  const colIzq = x + RELLENO;
  const colDer = x + ANCHO_PANEL / 2 + 4;
  const anchoCol = ANCHO_PANEL / 2 - RELLENO - 4;

  filaEstadistica(ctx, colIzq, yStats, anchoCol, 'TIEMPO', stats.tiempo, t);
  filaEstadistica(ctx, colDer, yStats, anchoCol, 'NIVEL', String(stats.nivel), t);
  filaEstadistica(ctx, colIzq, yStats + 16, anchoCol, 'BAJAS', String(stats.bajas), t);
  filaEstadistica(ctx, colDer, yStats + 16, anchoCol, 'DENARIOS', String(stats.denarios), t);

  // --- Arsenal final -------------------------------------------------------
  const yArsenal = yStats + 40;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `500 9px ${FUENTE}`;
  ctx.fillStyle = t.apagado;
  ctx.fillText('ARSENAL', colIzq, yArsenal);

  const r = 12;
  const paso = r * 2 + 6;
  let cx = colIzq + r;
  const cy = yArsenal + 18;
  for (let i = 0; i < stats.armas.length; i++) {
    const a = stats.armas[i];
    const def = ARMAS[a.id];
    dibujarIconoArma(ctx, cx, cy, r, a.id, def ? def.color : '#ccc');
    cx += paso;
  }
  const idsPasivos = Object.keys(stats.pasivos);
  for (let i = 0; i < idsPasivos.length; i++) {
    dibujarIconoPasivo(ctx, cx, cy, r, idsPasivos[i], '#9fd0e8');
    cx += paso;
  }

  // --- Pie -----------------------------------------------------------------
  ctx.textAlign = 'center';
  ctx.font = `400 9.5px ${FUENTE}`;
  ctx.fillStyle = color.pie;
  ctx.fillText('Recarga la página para intentarlo de nuevo',
               ANCHO_UI / 2, y + ALTO_PANEL - 10);

  ctx.restore();
}
