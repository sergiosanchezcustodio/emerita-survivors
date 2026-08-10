import { ANCHO_UI, ALTO_UI } from '../core/constantes.js';
import { FUENTE, FUENTE_TITULO, textoBorde, textoEspaciado } from './capa.js';
import { Tema, panel, cenefa } from './tema.js';
import { COLOR_JUGADOR } from './hud.js';
import { Recursos } from '../core/recursos.js';
import { COFRE } from '../entidades/cofre.js';

// Mapa/radar (F4). El nivel es un pasillo que crece sin límite hacia el
// norte —no hay "el mapa entero" que enseñar, como en un nivel cerrado—, así
// que esto es un RADAR local: una franja centrada en la cámara, ancha como la
// calzada y alta unas cuantas pantallas, con jugadores, enemigos y cofres
// como puntos. Sirve sobre todo para lo que el visor no alcanza: saber si el
// jefe sigue de camino, o si se acerca una oleada por detrás.
//
// No pausa la partida —igual que la ficha (Tab)—: es una consulta rápida, no
// un menú.

const ANCHO_PANEL = 130;
const ALTO_PANEL = 380;

// Cuánto mundo entra en el radar, en unidades lógicas por encima y por debajo
// de la cámara. 550 son poco más de dos pantallas de alto (ALTO_LOGICO=270),
// suficiente para ver venir algo que el visor todavía no muestra.
const RANGO_Y = 550;

const COLOR_ENEMIGO = '#c0553f';
const COLOR_ELITE = '#e0a15c';
const COLOR_JEFE = '#e04b4b';
const COLOR_COFRE = '#f0c987';

function punto(ctx, x, y, radio, color) {
  ctx.beginPath();
  ctx.arc(x, y, radio, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

export function dibujarMapa(ctx, jugadores, enemigos, cofres, camara) {
  const t = Tema.actual;
  const px = (ANCHO_UI - ANCHO_PANEL) / 2;
  const py = (ALTO_UI - ALTO_PANEL) / 2;
  const relleno = 10;

  panel(ctx, px, py, ANCHO_PANEL, ALTO_PANEL, t.filo);

  ctx.textAlign = 'center';
  ctx.font = `700 13px ${FUENTE_TITULO}`;
  ctx.fillStyle = t.titulo;
  textoEspaciado(ctx, 'MAPA', px + ANCHO_PANEL / 2, py + 18, 1.5);
  let y = py + 27;
  cenefa(ctx, px + relleno, y, ANCHO_PANEL - relleno * 2);
  y += 8;

  // --- Área del radar, recortada al panel ---------------------------------
  const rx = px + relleno;
  const ry = y;
  const rw = ANCHO_PANEL - relleno * 2;
  const rh = py + ALTO_PANEL - relleno - ry;
  const centroY = camara.yVista || camara.y;

  ctx.save();
  ctx.beginPath();
  ctx.rect(rx, ry, rw, rh);
  ctx.clip();

  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.fillRect(rx, ry, rw, rh);

  // Ancho real del nivel mapeado al ancho del radar entero —jugadores y
  // enemigos ya están clampados a ese ancho (MARGEN_NIVEL en main.js), así
  // que el propio radar ES el ancho de la calzada, de borde a borde. Sin
  // mapa pintado (suelo procedural de emergencia) no hay ancho de nivel que
  // medir; se usa el del radar tal cual.
  const anchoNivel = Recursos.mapaPintado ? Recursos.anchoSuelo : rw;
  const escalaX = rw / anchoNivel;

  const mundoAY = (wy) => ry + ((wy - (centroY - RANGO_Y)) / (RANGO_Y * 2)) * rh;
  const mundoAX = (wx) => rx + wx * escalaX;

  // Cofres: un cuadrito, se leen distinto de cualquier bicho.
  if (cofres && cofres.pool) {
    const items = cofres.pool.items;
    for (let i = 0; i < cofres.pool.activos; i++) {
      const c = items[i];
      if (c.tipo !== COFRE) continue;
      const cx = mundoAX(c.x), cy = mundoAY(c.y);
      if (cy < ry - 4 || cy > ry + rh + 4) continue;
      ctx.fillStyle = COLOR_COFRE;
      ctx.fillRect(cx - 2.5, cy - 2.5, 5, 5);
    }
  }

  // Enemigos: puntos pequeños, más grandes y dorados los que imponen. Los
  // objetos del escenario (antorchas, ver datos/enemigos.js `esObjeto`) no
  // son una amenaza y no aparecen: llenarían el radar de puntos quietos que
  // no dicen nada.
  if (enemigos && enemigos.pool) {
    const items = enemigos.pool.items;
    for (let i = 0; i < enemigos.pool.activos; i++) {
      const e = items[i];
      if (e.def.esObjeto) continue;
      const ey = mundoAY(e.y);
      if (ey < ry - 4 || ey > ry + rh + 4) continue;
      const ex = mundoAX(e.x);
      if (e.def.rol === 'jefe') punto(ctx, ex, ey, 4, COLOR_JEFE);
      else if (e.def.cofre) punto(ctx, ex, ey, 3, COLOR_ELITE);
      else punto(ctx, ex, ey, 1.4, COLOR_ENEMIGO);
    }
  }

  // Jugadores: siempre visibles, agarrados al borde del radar si se salen de
  // rango en vez de desaparecer —da igual lo lejos que ande el jefe, quien
  // consulta el mapa quiere verse a sí mismo antes que nada—.
  for (let i = 0; i < jugadores.length; i++) {
    const j = jugadores[i];
    if (j.abatido) continue;
    const ex = mundoAX(j.x);
    let ey = mundoAY(j.y);
    if (ey < ry + 3) ey = ry + 3; else if (ey > ry + rh - 3) ey = ry + rh - 3;
    const color = COLOR_JUGADOR[i % COLOR_JUGADOR.length];
    ctx.strokeStyle = 'rgba(6,5,10,.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(ex, ey, 3.5, 0, Math.PI * 2);
    ctx.stroke();
    punto(ctx, ex, ey, 3, color);
  }

  ctx.restore();
  ctx.strokeStyle = t.borde;
  ctx.lineWidth = 1;
  ctx.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1);

  ctx.font = `500 9px ${FUENTE}`;
  ctx.fillStyle = t.apagado;
  textoBorde(ctx, 'F4 cerrar', px + ANCHO_PANEL / 2, py + ALTO_PANEL - 6, t.apagado, 2.5);
}
