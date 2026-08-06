import { ANCHO_UI, ALTO_UI } from '../core/constantes.js';
import { Recursos } from '../core/recursos.js';
import { ARMAS } from '../datos/armas.js';
import { PASIVOS } from '../datos/pasivos.js';
import { Progresion, MAX_ARMAS, MAX_PASIVOS, MAX_NIVEL } from '../sistemas/progresion.js';
import { Director } from '../sistemas/director.js';
import { FUENTE, FUENTE_TITULO, textoEspaciado, textoBorde } from './capa.js';
import { Tema, panel, cenefa } from './tema.js';
import {
  ALTO_FICHA, MARGEN_FICHA, dibujarIconoArma, dibujarIconoPasivo, COLOR_JUGADOR, COLOR_PASIVO
} from './hud.js';

// FICHA DE JUGADOR. Se abre con Select en el mando o Tab en el teclado (las
// dos se cierran igual, y también con ESC o B), y para el mundo mientras está
// en pantalla.
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
// --- TERCERA VERSIÓN, sobre un boceto de Sergio ------------------------------
//
// El boceto (resources/menus/ficha_jugador.png) traía tres cosas que no
// encajan con este juego tal cual, y se han adaptado así:
//   - La barra azul decía "ENERGÍA": aquí no existe ese recurso, solo vida y
//     experiencia. Es la misma barra de experiencia que ya había, con icono y
//     etiqueta.
//   - "HABILIDAD PASIVA" no tiene datos detrás —los cuatro personajes no
//     tienen una habilidad única aparte de las armas y objetos que ya se ven
//     arriba—, así que se ha quitado. Solo queda el interruptor.
//   - La cinta con el número de la esquina es el NÚMERO DE JUGADOR (P1-P4),
//     no el nivel: el nivel ya tiene su propia placa bajo el retrato, y
//     poner el mismo dato dos veces no ayuda a leerlo más rápido.
//
// Lo que sí se conserva del diseño anterior: el nombre tiñéndose del color del
// jugador (con cuatro fichas en pantalla a la vez, es la forma más rápida de
// saber cuál es la tuya) y el retrato a toda altura.

const ANCHO_PANEL = 486;
// 258: las barras con icono y etiqueta ocupan menos que la fila suelta de
// antes de la segunda versión, así que el panel bajó a 250 aunque sumara las
// cajas de estadísticas e inventario. Ahora sube 8 de vuelta porque el pase
// de espaciado (separar etiquetas de sus barras, más aire tras el nombre)
// necesitaba ese margen para no dejar el pie pegado al inventario.
const ALTO_PANEL = 258;
const RELLENO = 12;
const MARGEN_PANTALLA = 14;
const HUECO = 8;
const ESTORBO_FICHA = ALTO_FICHA + MARGEN_FICHA;

const COL_IZQ = 146;             // columna del retrato
const HUECO_COL = 14;

const COLOR_VIDA = '#c8443c';
const COLOR_XP = '#4d7fd6';
const COLOR_NIVEL = '#e8c368';   // bronce claro, el mismo aire que la placa del boceto

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

// Caja de agrupación: un rectángulo redondeado tenue con una etiqueta pegada
// arriba a la izquierda, pisando el borde (misma idea que el nivel de una
// ranura en ui/hud.js). Es lo que separa visualmente "esto es un grupo" sin
// gastar una cenefa entera por sección.
function caja(ctx, x, y, w, h, etiqueta, t) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 4);
  ctx.fillStyle = 'rgba(10,7,6,.22)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(238,240,243,.18)';
  ctx.lineWidth = 1;
  ctx.stroke();

  if (etiqueta) {
    ctx.font = `600 7.5px ${FUENTE}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const anchoTexto = ctx.measureText(etiqueta).width + 8;
    ctx.fillStyle = t.fondoCarta;
    ctx.fillRect(x + 6, y - 4, anchoTexto, 8);
    ctx.fillStyle = t.apagado;
    textoEspaciado(ctx, etiqueta, x + 10, y, 1);
  }
  ctx.restore();
}

// Corazón para la vida y una chispa de cuatro puntas para la experiencia. Son
// procedurales, como todos los glifos de la interfaz (ver ui/hud.js): no hay
// PNG de icono en todo el juego, así que uno nuevo es una función más, no un
// encargo de arte.
function iconoVida(ctx, r) {
  ctx.beginPath();
  ctx.moveTo(0, r * 0.32);
  ctx.bezierCurveTo(0, -r * 0.15, -r * 0.95, -r * 0.2, -r * 0.95, r * 0.28);
  ctx.bezierCurveTo(-r * 0.95, r * 0.62, -r * 0.4, r * 0.9, 0, r * 1.15);
  ctx.bezierCurveTo(r * 0.4, r * 0.9, r * 0.95, r * 0.62, r * 0.95, r * 0.28);
  ctx.bezierCurveTo(r * 0.95, -r * 0.2, 0, -r * 0.15, 0, r * 0.32);
  ctx.closePath();
  ctx.fill();
}

function iconoXp(ctx, r) {
  ctx.beginPath();
  ctx.moveTo(0, -r);       ctx.lineTo(r * 0.24, -r * 0.24);
  ctx.lineTo(r, 0);        ctx.lineTo(r * 0.24, r * 0.24);
  ctx.lineTo(0, r);        ctx.lineTo(-r * 0.24, r * 0.24);
  ctx.lineTo(-r, 0);       ctx.lineTo(-r * 0.24, -r * 0.24);
  ctx.closePath();
  ctx.fill();
}

// Fila de icono + etiqueta a la izquierda y cifras a la derecha, con la barra
// debajo. Devuelve cuánto alto ha ocupado, para que quien llama no tenga que
// llevar la cuenta a mano.
//
// SEPARACIÓN MÍNIMA entre la fila de texto y la barra: antes la barra
// empezaba a solo 5px del centro del texto (prácticamente pegada a la letra),
// y a Sergio le chocó. Ahora hay un hueco de verdad entre una cosa y la otra,
// como entre cualquier par de elementos de la ficha.
const HUECO_TEXTO_BARRA = 8;
const ALTO_BARRA_STAT = 7;
const MARGEN_TRAS_BARRA = 3;

function filaBarra(ctx, x, y, w, icono, etiqueta, cifras, frac, color, t) {
  ctx.save();
  ctx.translate(x + 5, y + 4);
  ctx.fillStyle = color;
  icono(ctx, 4.5);
  ctx.restore();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `700 8.5px ${FUENTE}`;
  ctx.fillStyle = t.titulo;
  ctx.fillText(etiqueta, x + 13, y + 4);

  ctx.textAlign = 'right';
  ctx.font = `500 8.5px ${FUENTE}`;
  ctx.fillStyle = t.texto;
  ctx.fillText(cifras, x + w, y + 4);

  const yBarra = y + 4 + HUECO_TEXTO_BARRA;
  barra(ctx, x, yBarra, w, ALTO_BARRA_STAT, frac, color);
  return (yBarra + ALTO_BARRA_STAT - y) + MARGEN_TRAS_BARRA;
}

// Placa hexagonal del nivel, a caballo del borde inferior del retrato. Es LA
// cifra de nivel de la ficha —la otra referencia al nivel, arriba del todo en
// la cabecera, se ha quitado para no decir lo mismo dos veces.
function placaNivel(ctx, cx, cy, r, nivel, t) {
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 3;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = t.fondoBajo;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = COLOR_NIVEL;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 6px ${FUENTE}`;
  ctx.fillStyle = COLOR_NIVEL;
  ctx.globalAlpha = 0.85;
  ctx.fillText('NIVEL', cx, cy - 6);
  ctx.globalAlpha = 1;
  ctx.font = `700 13px ${FUENTE_TITULO}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(nivel), cx, cy + 5);
  ctx.restore();
}

// Distintivo del jugador en la esquina del retrato: en qué esquina de la
// pantalla hay que mirar para encontrar esta ficha. Con un solo jugador no
// aporta nada —solo hay una ficha— y por eso no se dibuja.
function distintivoJugador(ctx, x, y, indice, color) {
  const r = 9;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(10,7,6,.6)';
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  // "P1", no solo "1": a petición de Sergio, para que no haya que aprender
  // que ese número suelto es el jugador y no, por ejemplo, un nivel.
  ctx.font = `700 8px ${FUENTE}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('P' + (indice + 1), x, y + 0.5);
  ctx.restore();
}

// Ranura del inventario: medallón con el glifo y el nivel debajo. Mismo glifo
// que el panel de la esquina y que las cartas del menú, para que sea el mismo
// objeto en los tres sitios.
//
// ARMAS EN CUADRADO Y OBJETOS EN CÍRCULO, a petición de Sergio, y es un acierto:
// con ocho medallones idénticos en dos filas había que contar cuál era cuál; con
// dos formas distintas se sabe de un vistazo qué estás mirando aunque la ficha
// esté en la esquina y de reojo.
//
// AL MÁXIMO se enciende con un RESPLANDOR de verdad sobre el marco y el icono
// (shadowBlur + 'lighter'), no un disco plano detrás — y el número de nivel
// desaparece: el resplandor ya dice "esto está al tope", así que un "MAX"
// deletreado al lado sería decir lo mismo dos veces. Es el dato que más se
// busca al abrir esta pantalla —dónde NO hay que invertir más— y con el
// glow se lee de un vistazo, sin tener que leer letra por letra.
//
// El nivel (cuando SÍ hay uno que enseñar) va en la esquina inferior derecha,
// pisando el borde: la misma posición exacta que usa la ranura del panel de
// la esquina en ui/hud.js, para que sea el mismo lenguaje visual en los dos
// sitios donde aparece un medallón de arma u objeto.
function ranura(ctx, x, y, r, color, glifo, nivel, maximo, cuadrada) {
  const tope = glifo && nivel >= maximo;
  ctx.save();

  if (tope) {
    // Resplandor: 'lighter' suma luz sobre el fondo en vez de taparlo, y
    // shadowBlur da un halo que se apaga hacia fuera en vez de un borde duro.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = color;
    ctx.shadowBlur = 9;
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.75, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.beginPath();
  if (cuadrada) ctx.roundRect(x - r, y - r, r * 2, r * 2, 3);
  else ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = tope ? 'rgba(255,255,255,.16)' : 'rgba(10,11,13,.5)';
  ctx.fill();
  ctx.lineWidth = tope ? 2 : 1;
  ctx.strokeStyle = glifo ? color : 'rgba(238,240,243,.16)';
  if (tope) { ctx.shadowColor = color; ctx.shadowBlur = 6; }
  ctx.stroke();
  ctx.shadowBlur = 0;

  if (glifo) {
    ctx.save();
    ctx.translate(x, y);
    // Al máximo el glifo va en blanco con su propio resplandor: el color ya
    // lo lleva el marco, y el blanco es lo que hace que la ranura "brille".
    // El color se lo pasa quien llama a `glifo` (no ctx.fillStyle): el icono
    // ahora es un blit de pixel art cacheado por color, así que hace falta el
    // valor real para elegir —o crear— el lienzo que toca.
    if (tope) { ctx.shadowColor = color; ctx.shadowBlur = 5; }
    glifo(ctx, r * 0.58, tope ? '#ffffff' : color);
    ctx.restore();

    if (!tope) {
      ctx.font = `700 8px ${FUENTE}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      textoBorde(ctx, String(nivel), x + r - 0.5, y + r, '#ffffff', 2.2);
    }
  }
  ctx.restore();
}

// Interruptor de la subida automática. Se apaga en gris cuando todavía no se
// puede usar —quedan ranuras libres— porque explicarlo así cuesta menos que un
// texto: se ve que existe y que aún no toca.
//
// Muestra el atajo de TECLADO Y DE MANDO a la vez ("[F] · X"): antes solo
// salía el de teclado, así que en mando el interruptor parecía no tener forma
// de activarse aunque el botón X ya lo hacía desde el principio.
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
  ctx.fillText(disponible ? '[F] · X' : 'con las 8 ranuras llenas', xTexto + ancho + 8, y);
  ctx.restore();
}

function situar(indice, unSolo) {
  if (unSolo || indice < 0) {
    return { x: (ANCHO_UI - ANCHO_PANEL) / 2, y: (ALTO_UI - ALTO_PANEL) / 2 };
  }
  const derecha = (indice % 2) === 1;
  const abajo = indice >= 2;
  return {
    x: derecha ? ANCHO_UI - ANCHO_PANEL - MARGEN_PANTALLA : MARGEN_PANTALLA,
    y: abajo ? ALTO_UI - ESTORBO_FICHA - HUECO - ALTO_PANEL : ESTORBO_FICHA + HUECO
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
    //
    // FACTOR_RETRATO < 1: a petición de Sergio, el ajuste exacto dejaba al
    // personaje pegado al marco por los lados o por arriba según su silueta.
    // Encogerlo un poco dentro de la misma caja deja aire en los cuatro
    // lados, incluido un margen abajo en vez de apoyarlo justo en el borde.
    const escala = Math.min(COL_IZQ / img.width, altoCol / img.height) * 0.88;
    const w = img.width * escala;
    const h = img.height * escala;
    ctx.drawImage(img, xIzq + (COL_IZQ - w) / 2, yCol + altoCol - h - 3, w, h);
  }
  ctx.restore();

  // Marco doble: el oscuro de siempre y, un pelín por dentro, uno fino en
  // bronce. Es lo que da el aire de "carta enmarcada" del boceto sin tener
  // que trazar una cenefa entera alrededor de una imagen.
  ctx.strokeStyle = 'rgba(10,11,13,.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(xIzq + 0.5, yCol + 0.5, COL_IZQ - 1, altoCol - 1, 4);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(232,195,104,.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(xIzq + 2.5, yCol + 2.5, COL_IZQ - 5, altoCol - 5, 3);
  ctx.stroke();

  // Distintivo de jugador, esquina superior izquierda del retrato. Solo en
  // cooperativo: con un jugador no hay nada que distinguir.
  if (!unSolo) distintivoJugador(ctx, xIzq + 12, yCol + 12, indice, color);

  // Placa de nivel, DENTRO del marco del retrato, esquina superior derecha (a
  // petición de Sergio; antes iba a caballo del borde y luego centrada abajo).
  // Es LA referencia de nivel de toda la ficha, y hace pareja con el
  // distintivo de jugador: una esquina cada una, arriba las dos, las dos sin
  // salirse del recuadro.
  placaNivel(ctx, xIzq + COL_IZQ - 17, yCol + 17, 13, j.nivel, t);

  // --- Columna derecha ---------------------------------------------------
  const xDer = xIzq + COL_IZQ + HUECO_COL;
  const anchoDer = ANCHO_PANEL - RELLENO * 2 - COL_IZQ - HUECO_COL;

  // Cabecera: EL NOMBRE manda, y la descripción del personaje va justo debajo.
  // Es la ficha de este jugador, no una tabla de estadísticas que resulta que
  // es suya.
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `26px ${FUENTE_TITULO}`;
  ctx.fillStyle = color;
  textoEspaciado(ctx, j.def.nombre, xDer, py + RELLENO + 19, 1.5);

  ctx.textAlign = 'right';
  ctx.font = `500 9.5px ${FUENTE}`;
  ctx.fillStyle = t.apagado;
  ctx.fillText(Director.reloj, px + ANCHO_PANEL - RELLENO, py + RELLENO + 19);

  ctx.textAlign = 'left';
  ctx.font = `400 9.5px ${FUENTE}`;
  ctx.fillStyle = t.texto;
  // +33, no +31: el nombre va a 26px y una descendente (la "y" de Lucy) podía
  // llegar a rozar esta línea con solo 12px de por medio.
  ctx.fillText(j.def.descripcion, xDer, py + RELLENO + 33);

  let y = py + RELLENO + 41;
  cenefa(ctx, xDer, y, anchoDer);
  y += 10;

  // --- Vida y experiencia, con icono y etiqueta ---------------------------
  y += filaBarra(ctx, xDer, y, anchoDer, iconoVida, 'VIDA',
                 `${Math.ceil(j.vida)} / ${Math.round(j.vidaMaxima)}`,
                 j.vida / j.vidaMaxima, COLOR_VIDA, t);
  y += 3;
  y += filaBarra(ctx, xDer, y, anchoDer, iconoXp, 'EXPERIENCIA',
                 `${Math.floor(j.xp)} / ${j.xpNecesaria}`,
                 j.xp / j.xpNecesaria, COLOR_XP, t);

  // --- Características, en una caja de dos columnas ----------------------
  y += 6;
  const altoCaja = Math.ceil(CARACTERISTICAS.length / 2) * 13 + 8;
  caja(ctx, xDer, y, anchoDer, altoCaja, 'ESTADÍSTICAS', t);
  const anchoCol = anchoDer / 2;
  const filas = Math.ceil(CARACTERISTICAS.length / 2);
  const yEstad = y + 9;
  ctx.font = `400 9.5px ${FUENTE}`;
  for (let i = 0; i < CARACTERISTICAS.length; i++) {
    const c = CARACTERISTICAS[i];
    const cx = xDer + 6 + (i < filas ? 0 : anchoCol);
    const cy = yEstad + (i % filas) * 13;
    ctx.textAlign = 'left';
    ctx.fillStyle = t.apagado;
    ctx.fillText(c.etiqueta, cx, cy);
    ctx.textAlign = 'right';
    ctx.fillStyle = t.titulo;
    ctx.fillText(String(c.valor(j)), cx + anchoCol - 18, cy);
  }
  y += altoCaja + 8;

  // --- Inventario: armas y objetos, cada uno en su caja -------------------
  const armas = j.arsenal ? j.arsenal.equipadas : [];
  const idsPasivos = Object.keys(j.pasivos);
  const r = 11;
  const anchoGrupo = (anchoDer - HUECO) / 2;
  const pasoArmas = anchoGrupo / MAX_ARMAS;
  const altoGrupo = 42;

  caja(ctx, xDer, y, anchoGrupo, altoGrupo, 'ARMAS', t);
  const yMedallon = y + 22;
  for (let k = 0; k < MAX_ARMAS; k++) {
    const a = armas[k];
    const def = a ? ARMAS[a.id] : null;
    ranura(ctx, xDer + pasoArmas * (k + 0.5), yMedallon, r, a ? def.color : null,
           def ? ((c, rr, col) => dibujarIconoArma(c, 0, 0, rr, a.id, col)) : null,
           a ? a.nivel : 0, def && def.esEvolucion ? 1 : MAX_NIVEL, true);
  }

  const xObjetos = xDer + anchoGrupo + HUECO;
  caja(ctx, xObjetos, y, anchoGrupo, altoGrupo, 'OBJETOS', t);
  const pasoObjetos = anchoGrupo / MAX_PASIVOS;
  for (let k = 0; k < MAX_PASIVOS; k++) {
    const id = idsPasivos[k];
    const def = id ? PASIVOS[id] : null;
    ranura(ctx, xObjetos + pasoObjetos * (k + 0.5), yMedallon, r, COLOR_PASIVO,
           def ? ((c, rr, col) => dibujarIconoPasivo(c, 0, 0, rr, id, col)) : null,
           def ? j.pasivos[id] : 0, def ? def.maxNivel : 10, false);
  }

  // --- Pie: el interruptor de automático y cómo se cierra ----------------
  const yPie = py + ALTO_PANEL - RELLENO - 3;
  interruptor(ctx, xDer, yPie, j.autoNivel, Progresion.puedeAutomatizar(j), t);

  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.font = `500 9px ${FUENTE}`;
  ctx.fillStyle = t.apagado;
  ctx.fillText('Tab/Select · ESC/B cierra', px + ANCHO_PANEL - RELLENO, yPie);

  ctx.restore();
}
