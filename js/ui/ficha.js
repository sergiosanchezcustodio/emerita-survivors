import { ANCHO_FISICO, ALTO_FISICO } from '../core/constantes.js';
import { Recursos } from '../core/recursos.js';
import { ARMAS } from '../datos/armas.js';
import { PASIVOS } from '../datos/pasivos.js';
import { Progresion, MAX_ARMAS, MAX_PASIVOS, MAX_NIVEL } from '../sistemas/progresion.js';
import { Director } from '../sistemas/director.js';
import { FUENTE, FUENTE_TITULO, textoEspaciado } from './capa.js';
import { Tema, panel, cenefa } from './tema.js';
import {
  ALTO_FICHA, MARGEN_FICHA, glifoArma, glifoPasivo, COLOR_JUGADOR, COLOR_PASIVO
} from './hud.js';

// FICHA DE JUGADOR. Se abre con Select en el mando o Tab en el teclado, y para
// el mundo mientras está en pantalla.
//
// Es la pantalla de los NÚMEROS. El panel de la esquina dice lo justo para jugar
// —vida, experiencia y qué llevas— y ni siquiera trae cifras en la barra de
// vida: mientras esquivas no se lee un número. Todo lo que sí interesa mirar con
// calma vive aquí, y aquí el mundo está parado a propósito.
//
// Se abre en LA ESQUINA DE SU JUGADOR, igual que el menú de subida de nivel: con
// cuatro personas delante de la misma pantalla, que la ficha salga siempre en el
// centro obliga a preguntar de quién es. Con un solo jugador va centrada.
//
// --- SEGUNDA VERSIÓN, tras verla en pantalla ---------------------------------
//
// La primera dejaba un hueco muerto abajo a la derecha y las ranuras se comían
// la cenefa de encima. Lo que cambia:
//   - El retrato ocupa TODO el alto del panel, de borde a borde, sobre un hueco
//     gris claro que lo separa del fondo oscuro. Antes flotaba en una caja con
//     aire por los cuatro lados y el personaje salía pequeño.
//   - El nombre del jugador manda: es lo más grande de la ficha, por encima del
//     nivel. Es SU ficha.
//   - Armas y objetos se reparten el ancho entero en dos filas con su propio
//     espacio medido, en vez de colocarse a ojo detrás de una etiqueta.
//   - El interruptor de subida automática ocupa el hueco que sobraba abajo.

const ANCHO_PANEL = 486;
// 274 y no 250: con el alto anterior, la fila de OBJETOS y sus números caían
// justo encima del pie. Las medidas de dentro son fijas —cabecera, barras, dos
// cenefas y dos filas de ranuras— así que lo que tiene que ceder es el panel.
const ALTO_PANEL = 274;
const RELLENO = 12;
const MARGEN_PANTALLA = 14;
const HUECO = 8;
const ESTORBO_FICHA = ALTO_FICHA + MARGEN_FICHA;

const COL_IZQ = 146;             // columna del retrato
const HUECO_COL = 14;

const COLOR_VIDA = '#c8443c';
const COLOR_XP = '#4d7fd6';

// Las características se declaran como DATOS y se pintan en bucle. Añadir una es
// una línea aquí, no un bloque de dibujo más.
//
// `valor` recibe al jugador y devuelve ya la cadena formateada, porque cada una
// se lee en una unidad distinta y un formateador genérico acabaría con más
// excepciones que casos.
const CARACTERISTICAS = [
  { etiqueta: 'Armadura',  valor: (j) => j.armadura.toFixed(1) },
  { etiqueta: 'Regener.',  valor: (j) => `${j.regeneracion.toFixed(1)}/s` },
  { etiqueta: 'Velocidad', valor: (j) => Math.round(j.velocidad) },
  { etiqueta: 'Recogida',  valor: (j) => Math.round(j.radioRecogida) },
  { etiqueta: 'Potencia',  valor: (j) => `+${Math.round(j.bonusDanyo * 100)}%` },
  { etiqueta: 'Cadencia',  valor: (j) => `+${Math.round(j.reduccionRecarga * 100)}%` },
  { etiqueta: 'Área',      valor: (j) => `+${Math.round(j.bonusArea * 100)}%` },
  { etiqueta: 'Rerolls',   valor: (j) => `×${j.rerolls}` }
];

function barra(ctx, x, y, w, h, frac, color) {
  ctx.fillStyle = 'rgba(8,9,11,.65)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, Math.max(0, Math.min(1, frac)) * w, h);
  ctx.strokeStyle = 'rgba(238,240,243,.22)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

// Ranura del inventario: medallón con el glifo y el nivel debajo. Mismo glifo
// que el panel de la esquina y que las cartas del menú, para que sea el mismo
// objeto en los tres sitios.
// Ranura del inventario.
//
// ARMAS EN CUADRADO Y OBJETOS EN CÍRCULO, a petición de Sergio, y es un acierto:
// con ocho medallones idénticos en dos filas había que contar cuál era cuál; con
// dos formas distintas se sabe de un vistazo qué estás mirando aunque la ficha
// esté en la esquina y de reojo.
//
// AL MÁXIMO se enciende: relleno claro, borde grueso y un halo alrededor. Es el
// dato que más se busca al abrir esta pantalla —dónde NO hay que invertir más— y
// leerlo como un "MAX" pequeño debajo obligaba a repasar los ocho.
function ranura(ctx, x, y, r, color, glifo, nivel, maximo, cuadrada) {
  const tope = glifo && nivel >= maximo;
  ctx.save();

  if (tope) {
    // Halo del color del objeto. Lo primero que se ve, antes que la forma.
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r + 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.beginPath();
  if (cuadrada) ctx.roundRect(x - r, y - r, r * 2, r * 2, 3);
  else ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = tope ? 'rgba(255,255,255,.16)' : 'rgba(10,11,13,.5)';
  ctx.fill();
  ctx.lineWidth = tope ? 2 : 1;
  ctx.strokeStyle = glifo ? color : 'rgba(238,240,243,.16)';
  ctx.stroke();

  if (glifo) {
    ctx.save();
    ctx.translate(x, y);
    // Al máximo el glifo va en blanco: el color ya lo lleva el marco y el halo,
    // y el blanco es lo que hace que la ranura "brille".
    ctx.strokeStyle = tope ? '#ffffff' : color;
    ctx.fillStyle = tope ? '#ffffff' : color;
    ctx.lineWidth = 1.4;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    glifo(ctx, r * 0.58);
    ctx.restore();

    ctx.font = `700 8px ${FUENTE}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = tope ? '#ffffff' : 'rgba(238,240,243,.66)';
    ctx.fillText(tope ? 'MAX' : `${nivel}`, x, y + r + 2);
  }
  ctx.restore();
}

// Interruptor de la subida automática. Se apaga en gris cuando todavía no se
// puede usar —quedan ranuras libres— porque explicarlo así cuesta menos que un
// texto: se ve que existe y que aún no toca.
function interruptor(ctx, x, y, activo, disponible, t) {
  const w = 15, h = 9;
  ctx.save();
  ctx.globalAlpha = disponible ? 1 : 0.38;

  ctx.beginPath();
  ctx.roundRect(x, y - h / 2, w, h, h / 2);
  ctx.fillStyle = activo && disponible ? '#5a9e63' : 'rgba(10,11,13,.6)';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(238,240,243,.28)';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(activo && disponible ? x + w - h / 2 : x + h / 2, y, h / 2 - 1.5, 0, Math.PI * 2);
  ctx.fillStyle = '#eef0f3';
  ctx.fill();

  // El texto se mide con la MISMA fuente con la que se ha pintado, no con la
  // siguiente: midiendo después de cambiar la fuente, la coletilla se montaba
  // encima de la etiqueta.
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `500 9px ${FUENTE}`;
  ctx.fillStyle = t.texto;
  const etiqueta = 'Subida automática';
  const xTexto = x + w + 6;
  ctx.fillText(etiqueta, xTexto, y);
  const ancho = ctx.measureText(etiqueta).width;

  ctx.font = `500 8px ${FUENTE}`;
  ctx.fillStyle = t.apagado;
  ctx.fillText(disponible ? '[F]' : 'con las 8 ranuras llenas', xTexto + ancho + 8, y);
  ctx.restore();
}

function situar(indice, unSolo) {
  if (unSolo || indice < 0) {
    return { x: (ANCHO_FISICO - ANCHO_PANEL) / 2, y: (ALTO_FISICO - ALTO_PANEL) / 2 };
  }
  const derecha = (indice % 2) === 1;
  const abajo = indice >= 2;
  return {
    x: derecha ? ANCHO_FISICO - ANCHO_PANEL - MARGEN_PANTALLA : MARGEN_PANTALLA,
    y: abajo ? ALTO_FISICO - ESTORBO_FICHA - HUECO - ALTO_PANEL : ESTORBO_FICHA + HUECO
  };
}

export function dibujarFicha(ctx, jugadores, indice) {
  const j = jugadores[indice];
  if (!j) return;

  const t = Tema.actual;
  const unSolo = jugadores.length <= 1;
  const { x: px, y: py } = situar(indice, unSolo);
  const color = COLOR_JUGADOR[indice % COLOR_JUGADOR.length];

  ctx.save();
  panel(ctx, px, py, ANCHO_PANEL, ALTO_PANEL, color);

  // --- Columna izquierda: el personaje, de arriba abajo -------------------
  // Hueco GRIS CLARO. El retrato es la única imagen de la ficha y sobre el
  // granito oscuro del panel se hundía; con el fondo claro la silueta se recorta
  // y el personaje se lee entero.
  const xIzq = px + RELLENO;
  const yCol = py + RELLENO;
  const altoCol = ALTO_PANEL - RELLENO * 2;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(xIzq, yCol, COL_IZQ, altoCol, 4);
  ctx.fillStyle = t.fondoClaro;
  ctx.fill();
  ctx.clip();

  const img = Recursos.imagen(j.id + 'Cuerpo');
  if (img) {
    // Se dibuja CON suavizado, al revés que el mundo: esto es interfaz y puede
    // permitirse todo el detalle que traiga la ilustración de origen.
    //
    // Encaje "contener" y apoyado abajo, como viene recortado el PNG: la figura
    // no se recorta nunca ni se estira si su proporción no cuadra.
    const escala = Math.min(COL_IZQ / img.width, altoCol / img.height);
    const w = img.width * escala;
    const h = img.height * escala;
    ctx.drawImage(img, xIzq + (COL_IZQ - w) / 2, yCol + altoCol - h, w, h);
  }
  ctx.restore();

  ctx.strokeStyle = 'rgba(10,11,13,.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(xIzq + 0.5, yCol + 0.5, COL_IZQ - 1, altoCol - 1, 4);
  ctx.stroke();

  // --- Columna derecha ---------------------------------------------------
  const xDer = xIzq + COL_IZQ + HUECO_COL;
  const anchoDer = ANCHO_PANEL - RELLENO * 2 - COL_IZQ - HUECO_COL;

  // Cabecera: EL NOMBRE manda, y el nivel va debajo en pequeño. Es la ficha de
  // este jugador, no una tabla de estadísticas que resulta que es suya.
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `24px ${FUENTE_TITULO}`;
  ctx.fillStyle = color;
  textoEspaciado(ctx, unSolo ? j.def.nombre : `P${indice + 1}  ${j.def.nombre}`,
                 xDer, py + RELLENO + 18, 1.5);

  ctx.textAlign = 'right';
  ctx.font = `500 10px ${FUENTE}`;
  ctx.fillStyle = t.apagado;
  ctx.fillText(Director.reloj, px + ANCHO_PANEL - RELLENO, py + RELLENO + 18);

  ctx.textAlign = 'left';
  ctx.font = `600 11px ${FUENTE}`;
  ctx.fillStyle = t.titulo;
  ctx.fillText(`NIVEL ${j.nivel}`, xDer, py + RELLENO + 33);

  ctx.textAlign = 'right';
  ctx.font = `400 9.5px ${FUENTE}`;
  ctx.fillStyle = t.texto;
  ctx.fillText(j.def.descripcion, px + ANCHO_PANEL - RELLENO, py + RELLENO + 33);

  cenefa(ctx, xDer, py + RELLENO + 40, anchoDer);

  // --- Vida y experiencia -------------------------------------------------
  let y = py + RELLENO + 52;
  ctx.textBaseline = 'middle';
  ctx.font = `500 9px ${FUENTE}`;
  const anchoBarra = anchoDer - 66;

  barra(ctx, xDer, y, anchoBarra, 9, j.vida / j.vidaMaxima, COLOR_VIDA);
  ctx.textAlign = 'right';
  ctx.fillStyle = t.titulo;
  ctx.fillText(`${Math.ceil(j.vida)} / ${Math.round(j.vidaMaxima)}`,
               xDer + anchoDer, y + 4);

  y += 15;
  barra(ctx, xDer, y, anchoBarra, 7, j.xp / j.xpNecesaria, COLOR_XP);
  ctx.fillStyle = t.texto;
  ctx.fillText(`${Math.floor(j.xp)} / ${j.xpNecesaria}`, xDer + anchoDer, y + 3);

  // --- Características, en dos columnas ---------------------------------
  y += 18;
  const anchoCol = anchoDer / 2;
  const filas = Math.ceil(CARACTERISTICAS.length / 2);
  ctx.font = `400 9.5px ${FUENTE}`;
  for (let i = 0; i < CARACTERISTICAS.length; i++) {
    const c = CARACTERISTICAS[i];
    const cx = xDer + (i < filas ? 0 : anchoCol);
    const cy = y + (i % filas) * 13;
    ctx.textAlign = 'left';
    ctx.fillStyle = t.apagado;
    ctx.fillText(c.etiqueta, cx, cy);
    ctx.textAlign = 'right';
    ctx.fillStyle = t.titulo;
    ctx.fillText(String(c.valor(j)), cx + anchoCol - 12, cy);
  }

  // --- Inventario --------------------------------------------------------
  // Dos filas que reparten el ancho ENTERO, con la etiqueta encima y no al lado:
  // al lado, la etiqueta se comía el sitio del primer medallón y las ranuras se
  // salían de la columna.
  y += filas * 13 + 2;
  cenefa(ctx, xDer, y, anchoDer);
  y += 14;

  const armas = j.arsenal ? j.arsenal.equipadas : [];
  const idsPasivos = Object.keys(j.pasivos);
  const r = 12;
  const paso = anchoDer / MAX_ARMAS;

  ctx.textAlign = 'left';
  ctx.font = `600 8px ${FUENTE}`;
  ctx.fillStyle = t.apagado;
  textoEspaciado(ctx, 'ARMAS', xDer, y, 1);
  y += 16;
  for (let k = 0; k < MAX_ARMAS; k++) {
    const a = armas[k];
    const def = a ? ARMAS[a.id] : null;
    ranura(ctx, xDer + paso * (k + 0.5), y, r, a ? def.color : null,
           def ? ((c, rr) => glifoArma(c, def.comportamiento, rr)) : null,
           a ? a.nivel : 0, def && def.esEvolucion ? 1 : MAX_NIVEL, true);
  }

  y += 26;
  ctx.fillStyle = t.apagado;
  ctx.font = `600 8px ${FUENTE}`;
  textoEspaciado(ctx, 'OBJETOS', xDer, y, 1);
  y += 16;
  for (let k = 0; k < MAX_PASIVOS; k++) {
    const id = idsPasivos[k];
    const def = id ? PASIVOS[id] : null;
    ranura(ctx, xDer + paso * (k + 0.5), y, r, COLOR_PASIVO,
           def ? ((c, rr) => glifoPasivo(c, def.campo, rr)) : null,
           def ? j.pasivos[id] : 0, def ? def.maxNivel : 10, false);
  }

  // --- Pie: el interruptor de automático y cómo se cierra ----------------
  const yPie = py + ALTO_PANEL - RELLENO - 3;
  interruptor(ctx, xDer, yPie, j.autoNivel, Progresion.puedeAutomatizar(j), t);

  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.font = `500 9px ${FUENTE}`;
  ctx.fillStyle = t.apagado;
  ctx.fillText('Tab / Select', px + ANCHO_PANEL - RELLENO, yPie);

  ctx.restore();
}
