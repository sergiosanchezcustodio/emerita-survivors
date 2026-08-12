import { ANCHO_UI, ALTO_UI } from '../core/constantes.js';
import { FUENTE, FUENTE_TITULO, textoEspaciado, envolverTexto } from './capa.js';
import { Tema, panel, cenefa } from './tema.js';
import { MetaProgreso } from '../core/metaProgreso.js';
import { Recursos } from '../core/recursos.js';
import { POTENCIADORES } from '../datos/potenciadores.js';
import { MASCOTAS, ORDEN_MASCOTAS } from '../datos/mascotas.js';

// Tienda de potenciadores permanentes. Se abre desde el título (T) y no desde
// dentro de la partida: son compras para SIEMPRE (progreso META, ver
// core/metaProgreso.js), así que tienen su sitio antes de jugar, no como un
// menú más de los que ya interrumpen una partida en marcha.
//
// Panel de siempre (ui/tema.js), nada de ilustración propia: a diferencia del
// título y la selección, esto no lo ha dibujado Sergio y una lista de compra
// no necesita arte, necesita leerse rápido.

const IDS = Object.keys(POTENCIADORES);

// 268 y no los 236 de cuando había cinco mejoras: con diez, tres de los nombres
// nuevos ("Clepsidra eterna", "Onda expansiva", "Moneda de Caronte") se comían
// la columna de puntos. Se ensancha el panel y se aparta la columna en vez de
// acortar los nombres: el nombre es lo único que dice qué compras.
const ANCHO_PANEL = 268;
const ALTO_FILA = 22;
const RELLENO = 12;
const CABECERA = 34;
const ALTO_DESC = 22;      // dos líneas de descripción del seleccionado
const PIE = 16;

const COLOR_DENARIO = '#e8b73a';
const COLOR_MAX = '#7fd68a';
const COL_DOTS = 132;       // columna donde empiezan los puntos de nivel

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

// Cabecera común a las dos pestañas: título, denarios y la cenefa. Se saca
// aparte para que las dos listas empiecen exactamente en la misma línea y
// cambiar de pestaña no mueva nada de sitio.
function cabecera(ctx, px, py, pestanya) {
  const t = Tema.actual;
  ctx.textBaseline = 'middle';
  const yCab = py + RELLENO + 5;

  // Las dos pestañas, la activa en claro. Se dibujan siempre las dos aunque
  // solo una esté viva: media gracia de una pestaña es que se vea que hay otra.
  ctx.textAlign = 'left';
  ctx.font = `13px ${FUENTE_TITULO}`;
  ctx.fillStyle = pestanya === 0 ? t.titulo : t.apagado;
  const anchoPot = textoEspaciado(ctx, 'MEJORAS', px + RELLENO, yCab, 1.5);
  ctx.fillStyle = pestanya === 1 ? t.titulo : t.apagado;
  textoEspaciado(ctx, 'MASCOTAS', px + RELLENO + anchoPot + 12, yCab, 1.5);

  moneda(ctx, px + ANCHO_PANEL - RELLENO - 38, yCab, 6);
  ctx.textAlign = 'right';
  ctx.font = `700 13px ${FUENTE}`;
  ctx.fillStyle = COLOR_DENARIO;
  ctx.fillText(String(MetaProgreso.denarios), px + ANCHO_PANEL - RELLENO, yCab);

  cenefa(ctx, px + RELLENO, py + RELLENO + 16, ANCHO_PANEL - RELLENO * 2);
}

export function dibujarTienda(ctx, cursor, pestanya) {
  if (pestanya === 1) return dibujarMascotas(ctx, cursor);

  const t = Tema.actual;
  const n = IDS.length;
  const alto = CABECERA + n * ALTO_FILA + ALTO_DESC + PIE + RELLENO;
  const px = (ANCHO_UI - ANCHO_PANEL) / 2;
  const py = (ALTO_UI - alto) / 2;

  ctx.save();
  panel(ctx, px, py, ANCHO_PANEL, alto, t.filo);
  cabecera(ctx, px, py, 0);

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
  ctx.fillText('↑↓ elegir   ←→ pestaña   Enter comprar   Esc volver',
               px + ANCHO_PANEL / 2, py + alto - PIE / 2 + 2);

  ctx.restore();
}

// --- Pestaña de mascotas -----------------------------------------------------
//
// Se parece a la de mejoras pero no es la misma lista: una mascota no tiene
// niveles, así que en lugar de los puntitos lleva su ESTADO —el precio si no la
// tienes, "EN USO" si la llevas puesta, "guardada" si la tienes y no— y a la
// izquierda EL MISMO DIBUJO que se ve en la partida, no un icono aparte: lo que
// se elige aquí es el bicho que va a ir trotando al lado, y verlo antes de
// pagarlo es medio motivo para comprarlo.
const ALTO_FILA_MASCOTA = 26;
const COLOR_EN_USO = '#7fd68a';

function dibujarMascotas(ctx, cursor) {
  const t = Tema.actual;
  const n = ORDEN_MASCOTAS.length;
  const alto = CABECERA + n * ALTO_FILA_MASCOTA + ALTO_DESC + PIE + RELLENO;
  const px = (ANCHO_UI - ANCHO_PANEL) / 2;
  const py = (ALTO_UI - alto) / 2;

  ctx.save();
  panel(ctx, px, py, ANCHO_PANEL, alto, t.filo);
  cabecera(ctx, px, py, 1);

  const y0 = py + CABECERA;
  for (let i = 0; i < n; i++) {
    const id = ORDEN_MASCOTAS[i];
    const def = MASCOTAS[id];
    const tiene = MetaProgreso.tieneMascota(id);
    const enUso = MetaProgreso.mascotaEquipada === id;
    const seleccionada = i === cursor;
    const yc = y0 + i * ALTO_FILA_MASCOTA + ALTO_FILA_MASCOTA / 2;

    if (seleccionada) {
      ctx.fillStyle = t.cartaElegida;
      ctx.fillRect(px + 4, y0 + i * ALTO_FILA_MASCOTA, ANCHO_PANEL - 8, ALTO_FILA_MASCOTA - 2);
    }

    // El mismo dibujo que se ve en la partida, encajado en su hueco. Apagado
    // si no la tienes: se ve qué hay a la venta sin que parezca que ya es tuya.
    // Sin suavizado, que es pixel art; se restaura después porque toda la capa
    // de interfaz lo quiere encendido para el texto.
    const idAtlas = 'mascota' + id.charAt(0).toUpperCase() + id.slice(1);
    const meta = Recursos.meta(idAtlas);
    const img = Recursos.imagen(idAtlas);
    const cxIcono = px + RELLENO + 9;
    ctx.globalAlpha = tiene ? 1 : 0.4;
    if (meta && img) {
      const esc = Math.min(20 / meta.w, 20 / meta.h);
      const w = meta.w * esc;
      const h = meta.h * esc;
      const suavizado = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      // SIEMPRE el fotograma 0. Las mascotas animadas son una tira de
      // fotogramas en un solo PNG, así que dibujarla entera saldría como una
      // fila de búhos; y animarla aquí sería una animación en una lista de
      // compra, que no aporta nada y encima obliga a repintar el panel.
      ctx.drawImage(img, 0, 0, meta.w, meta.h, cxIcono - w / 2, yc - h / 2, w, h);
      ctx.imageSmoothingEnabled = suavizado;
    } else {
      ctx.beginPath();
      ctx.arc(cxIcono, yc, 7, 0, Math.PI * 2);
      ctx.fillStyle = def.color;
      ctx.fill();
      ctx.fillStyle = 'rgba(12,10,14,.8)';
      ctx.font = `700 8px ${FUENTE}`;
      ctx.textAlign = 'center';
      ctx.fillText(def.inicial, cxIcono, yc + 0.5);
    }
    ctx.globalAlpha = 1;

    // Marca de "puesta": un punto verde, que se lee antes que el texto de la
    // derecha cuando se recorre la lista de arriba abajo.
    if (enUso) {
      ctx.beginPath();
      ctx.arc(cxIcono + 9, yc - 8, 2.4, 0, Math.PI * 2);
      ctx.fillStyle = COLOR_EN_USO;
      ctx.fill();
    }

    ctx.textAlign = 'left';
    ctx.font = `600 11px ${FUENTE}`;
    ctx.fillStyle = seleccionada ? '#ffffff' : (tiene ? t.titulo : t.texto);
    ctx.fillText(def.nombre, px + RELLENO + 24, yc);

    ctx.textAlign = 'right';
    ctx.font = `600 10px ${FUENTE}`;
    if (enUso) {
      ctx.fillStyle = COLOR_EN_USO;
      ctx.fillText('EN USO', px + ANCHO_PANEL - RELLENO - 4, yc);
    } else if (tiene) {
      ctx.fillStyle = t.apagado;
      ctx.fillText('guardada', px + ANCHO_PANEL - RELLENO - 4, yc);
    } else {
      ctx.fillStyle = MetaProgreso.denarios >= def.coste ? COLOR_DENARIO : t.apagado;
      ctx.fillText(String(def.coste), px + ANCHO_PANEL - RELLENO - 4, yc);
    }
  }

  const yDesc = y0 + n * ALTO_FILA_MASCOTA + 3;
  const defSel = MASCOTAS[ORDEN_MASCOTAS[cursor]];
  ctx.textAlign = 'center';
  ctx.font = `400 9px ${FUENTE}`;
  ctx.fillStyle = t.texto;
  const lineas = envolverTexto(ctx, defSel.descripcion, ANCHO_PANEL - RELLENO * 2);
  ctx.fillText(lineas[0] || '', px + ANCHO_PANEL / 2, yDesc);
  if (lineas[1]) ctx.fillText(lineas[1], px + ANCHO_PANEL / 2, yDesc + 11);

  ctx.font = `500 9px ${FUENTE}`;
  ctx.fillStyle = t.apagado;
  const accion = MetaProgreso.tieneMascota(ORDEN_MASCOTAS[cursor]) ? 'equipar' : 'comprar';
  ctx.fillText(`↑↓ elegir   ←→ pestaña   Enter ${accion}   Esc volver`,
               px + ANCHO_PANEL / 2, py + alto - PIE / 2 + 2);

  ctx.restore();
}
