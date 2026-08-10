import { ANCHO_UI, ALTO_UI } from '../core/constantes.js';
import { FUENTE, FUENTE_TITULO, textoEspaciado, envolverTexto } from './capa.js';
import { Tema, panel, cenefa } from './tema.js';
import { MetaProgreso } from '../core/metaProgreso.js';
import { POTENCIADORES } from '../datos/potenciadores.js';

// Tienda de potenciadores permanentes. Se abre desde el título (T) y no desde
// dentro de la partida: son compras para SIEMPRE (progreso META, ver
// core/metaProgreso.js), así que tienen su sitio antes de jugar, no como un
// menú más de los que ya interrumpen una partida en marcha.
//
// Panel de siempre (ui/tema.js), nada de ilustración propia: a diferencia del
// título y la selección, esto no lo ha dibujado Sergio y una lista de compra
// no necesita arte, necesita leerse rápido.

const IDS = Object.keys(POTENCIADORES);

const ANCHO_PANEL = 236;
const ALTO_FILA = 22;
const RELLENO = 12;
const CABECERA = 34;
const ALTO_DESC = 22;      // dos líneas de descripción del seleccionado
const PIE = 16;

const COLOR_DENARIO = '#e8b73a';
const COLOR_MAX = '#7fd68a';
const COL_DOTS = 88;        // columna donde empiezan los puntos de nivel

function moneda(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = COLOR_DENARIO;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = 'rgba(20,14,4,.55)';
  ctx.font = `700 ${Math.round(r * 1.1)}px ${FUENTE_TITULO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('D', x, y + 0.5);
}

export function dibujarTienda(ctx, cursor) {
  const t = Tema.actual;
  const n = IDS.length;
  const alto = CABECERA + n * ALTO_FILA + ALTO_DESC + PIE + RELLENO;
  const px = (ANCHO_UI - ANCHO_PANEL) / 2;
  const py = (ALTO_UI - alto) / 2;

  ctx.save();
  panel(ctx, px, py, ANCHO_PANEL, alto, t.filo);

  ctx.textBaseline = 'middle';
  const yCab = py + RELLENO + 5;

  ctx.textAlign = 'left';
  ctx.font = `17px ${FUENTE_TITULO}`;
  ctx.fillStyle = t.titulo;
  textoEspaciado(ctx, 'TIENDA', px + RELLENO, yCab, 2);

  moneda(ctx, px + ANCHO_PANEL - RELLENO - 38, yCab, 6);
  ctx.textAlign = 'right';
  ctx.font = `700 13px ${FUENTE}`;
  ctx.fillStyle = COLOR_DENARIO;
  ctx.fillText(String(MetaProgreso.denarios), px + ANCHO_PANEL - RELLENO, yCab);

  cenefa(ctx, px + RELLENO, py + RELLENO + 16, ANCHO_PANEL - RELLENO * 2);

  const y0 = py + CABECERA;
  for (let i = 0; i < n; i++) {
    const id = IDS[i];
    const def = POTENCIADORES[id];
    const nivel = MetaProgreso.nivelPotenciador(id);
    const coste = MetaProgreso.costePotenciador(id);
    const alMaximo = coste < 0;
    const seleccionada = i === cursor;
    const yc = y0 + i * ALTO_FILA + ALTO_FILA / 2;

    if (seleccionada) {
      ctx.fillStyle = t.cartaElegida;
      ctx.fillRect(px + 4, y0 + i * ALTO_FILA, ANCHO_PANEL - 8, ALTO_FILA - 2);
    }

    ctx.textAlign = 'left';
    ctx.font = `600 11px ${FUENTE}`;
    ctx.fillStyle = seleccionada ? '#ffffff' : t.titulo;
    ctx.fillText(def.nombre, px + RELLENO + 4, yc);

    for (let k = 0; k < def.maxNivel; k++) {
      ctx.beginPath();
      ctx.arc(px + COL_DOTS + k * 9, yc, 2.6, 0, Math.PI * 2);
      ctx.fillStyle = k < nivel ? (seleccionada ? '#ffffff' : t.filo) : 'rgba(255,255,255,.15)';
      ctx.fill();
    }

    ctx.textAlign = 'right';
    ctx.font = `600 10px ${FUENTE}`;
    if (alMaximo) {
      ctx.fillStyle = COLOR_MAX;
      ctx.fillText('AL MÁXIMO', px + ANCHO_PANEL - RELLENO - 4, yc);
    } else {
      ctx.fillStyle = MetaProgreso.denarios >= coste ? COLOR_DENARIO : t.apagado;
      ctx.fillText(String(coste), px + ANCHO_PANEL - RELLENO - 4, yc);
    }
  }

  // Descripción del potenciador señalado: cambia con el cursor, así que las
  // filas se quedan compactas y solo se lee una a la vez.
  const yDesc = y0 + n * ALTO_FILA + 3;
  const defSel = POTENCIADORES[IDS[cursor]];
  ctx.textAlign = 'center';
  ctx.font = `400 9px ${FUENTE}`;
  ctx.fillStyle = t.texto;
  const lineas = envolverTexto(ctx, defSel.descripcion, ANCHO_PANEL - RELLENO * 2);
  ctx.fillText(lineas[0] || '', px + ANCHO_PANEL / 2, yDesc);
  if (lineas[1]) ctx.fillText(lineas[1], px + ANCHO_PANEL / 2, yDesc + 11);

  ctx.font = `500 9px ${FUENTE}`;
  ctx.fillStyle = t.apagado;
  ctx.fillText('↑↓ elegir   Enter comprar   Esc volver',
               px + ANCHO_PANEL / 2, py + alto - PIE / 2 + 2);

  ctx.restore();
}
