import { ANCHO_UI, ALTO_UI } from '../core/constantes.js';
import { FUENTE, FUENTE_TITULO, textoEspaciado } from './capa.js';
import { Tema } from './tema.js';
import { Recursos } from '../core/recursos.js';
import { rejilla, armazon, MARGEN } from './tabla.js';
import { dibujarIconoArma, dibujarIconoPasivo } from './hud.js';
import { ARMAS } from '../datos/armas.js';
import { PASIVOS } from '../datos/pasivos.js';
import { POTENCIADORES } from '../datos/potenciadores.js';

// ============================================================================
// GALERÍA DE ARTE — PANTALLA TEMPORAL. NO ES PARTE DEL JUEGO.
// ============================================================================
//
// Existe para una sola cosa: mirar de un tirón CÓMO QUEDA cada dibujo de arma,
// objeto y potenciador EN LOS SITIOS DONDE EL JUEGO LO VA A DIBUJAR DE VERDAD,
// que es lo único que decide si un dibujo vale o hay que rehacerlo. Un icono
// que se ve estupendo a 34 unidades puede ser una mancha en la ranura del HUD,
// y eso no se descubre jugando media hora hasta que sale el arma.
//
// NO REDIBUJA NADA POR SU CUENTA. Llama a las MISMAS funciones que las pantallas
// reales —dibujarIconoArma y dibujarIconoPasivo de ui/hud.js— con los MISMOS
// radios y la MISMA escala que les pasa cada sitio. Si aquí se ve bien y en la
// ficha no, es que esta pantalla está mintiendo y hay que arreglarla; los
// radios de abajo llevan al lado de dónde salen para poder comprobarlo.
//
// PARA QUITARLA: borrar este archivo y las cinco marcas `GALERÍA (temporal)`
// de js/main.js. No la importa nadie más.

// --- Los sitios donde el juego dibuja un icono ------------------------------
//
// Cada entrada es un sitio REAL del juego, con las cuatro cosas que deciden
// cómo se ve un dibujo ahí: el radio con que se pide el icono, la escala del
// contexto de esa pantalla, y la RANURA que hay detrás —su radio, su forma y si
// lleva papel blanco o no—. Todos los números llevan al lado de dónde salen,
// porque el día que uno cambie esta página tiene que cambiar con él o deja de
// servir para lo único que sirve.
//
// LA RANURA IMPORTA TANTO COMO EL ICONO. Un dibujo de 11,22 dentro de un
// medallón de 17 y el mismo dibujo suelto sobre el fondo de una carta no se ven
// igual, y hasta ahora esta página los pintaba a los dos con una ranura del
// tamaño del icono: enseñaba el dibujo, sí, pero no lo que se ve en pantalla.
// `rRanura` a 0 significa que ahí NO hay ranura: el icono va directo sobre lo
// que haya —la cara de la ruleta, el papel de la carta final, la fila de la
// tienda—.
//
// OJO CON LA FICHA, que ya se equivocó una vez. Su icono NO mide lo que dice
// ICONO_UNIFICADO: ese panel dibuja con el contexto a 1,125, así que allí se
// pide 13/1,125 = 11,556 para que en pantalla se vea igual que en los demás
// sitios. Los dos números de su fila —11,556 y ×1,125— son eso, y multiplicados
// dan 13 como todo lo demás.
const SITIOS_ARMA = [
  // ICONO_UNIFICADO dentro de RANURA_W/2, ui/hud.js. La ranura bajó de 37 a 30
  // (ver ANCHO en ui/hud.js), así que su radio es 15 y no los 18,5 de antes:
  // aquí el icono ya no cabe holgado, que es exactamente lo que hay que ver.
  { rot: 'HUD',          r: 13, rRanura: 15,    escala: 1,     redonda: false, blanca: true },
  // ICONO_UNIFICADO/ESCALA_FICHA dentro de 41,25/2/1,125, ui/ficha.js
  { rot: 'FICHA',        r: 11.556, rRanura: 18.33, escala: 1.125, redonda: false, blanca: true },
  // ICONO_UNIFICADO dentro de ICONO_R, ui/menuNivel.js
  { rot: 'SUBIR NIVEL',  r: 13, rRanura: 18.5,  escala: 1,     redonda: true,  blanca: true },
  // ICONO_MAX, ui/cofre.js. Sin ranura: va sobre la cara de la ruleta.
  { rot: 'COFRE',        r: 13, rRanura: 0,     escala: 1,     redonda: false, blanca: false },
  // LADO_ARMA/2 de ui/tienda.js, y el mismo cuadro en ui/pantallas.js
  { rot: 'TIENDA/HÉROE', r: 13, rRanura: 15,    escala: 1,     redonda: false, blanca: true },
  // RADIO_MINI, ui/final.js. Sin ranura, y FUERA de la unificación a propósito:
  // es una lista de cuatro columnas en una carta de 208 de ancho, y ahí un icono
  // de 13 empujaría el nombre del arma contra las cifras de daño y bajas.
  { rot: 'RESUMEN',      r: 7,  rRanura: 0,     escala: 1,     redonda: false, blanca: false },
  // No existe en el juego: está para OPINAR del dibujo, no para comprobar nada.
  { rot: 'AL DOBLE',     r: 34, rRanura: 36,    escala: 1,     redonda: false, blanca: true }
];

const SITIOS_OBJETO = [
  // ICONO_UNIFICADO dentro de RANURA_H/2, ui/hud.js. 15 desde que la ranura
  // bajó a 30: en la redonda es donde más se nota, porque el dibujo llega a las
  // esquinas de su cuadrado y el aro ya no las contiene.
  { rot: 'HUD',         r: 13, rRanura: 15,    escala: 1,     redonda: true,  blanca: true },
  // ICONO_UNIFICADO/ESCALA_FICHA, ui/ficha.js
  { rot: 'FICHA',       r: 11.556, rRanura: 18.33, escala: 1.125, redonda: true,  blanca: true },
  // ui/menuNivel.js
  { rot: 'SUBIR NIVEL', r: 13, rRanura: 18.5,  escala: 1,     redonda: true,  blanca: true },
  // ui/cofre.js
  { rot: 'COFRE',       r: 13, rRanura: 0,     escala: 1,     redonda: true,  blanca: false },
  // RADIO_ICONO, ui/final.js. Fuera de la unificación, igual que el de armas.
  { rot: 'RESUMEN',     r: 11, rRanura: 0,     escala: 1,     redonda: true,  blanca: false },
  { rot: 'AL DOBLE',    r: 34, rRanura: 36,    escala: 1,     redonda: true,  blanca: true }
];

// Los potenciadores solo se ven en un sitio, y ahí van SIN ranura: la tienda los
// pinta directos sobre el oscuro de su fila (iconoPotenciador, ui/tienda.js).
// Su 17 no entra en la unificación: no son iconos de partida, son las casillas
// de una tabla que se lee parada.
const SITIOS_POTENCIADOR = [
  { rot: 'TIENDA',   r: 17, rRanura: 0, escala: 1, redonda: false, blanca: false },
  { rot: 'AL DOBLE', r: 34, rRanura: 0, escala: 1, redonda: false, blanca: false }
];

// --- Las cuatro pestañas ----------------------------------------------------
//
// APARTADAS son las armas que existen enteras —datos, dibujo y comportamiento—
// pero que hoy NO salen en el juego: llevan `retirada: true` en datos/armas.js y
// el sorteo de subida de nivel las salta (ver sistemas/progresion.js).
//
// Tienen pestaña propia porque son justo lo que hay que poder mirar para
// decidir si vuelven, y mezcladas con las demás no se distinguían: la galería
// listaba `Object.keys(ARMAS)` entero, así que una apartada se veía igual que
// una que está en partida y no había forma de saber cuál era cuál.
const SECCIONES = ['ARMAS', 'OBJETOS', 'POTENCIADORES', 'APARTADAS'];
export const NUM_SECCIONES = SECCIONES.length;

// ¿Esta pestaña enseña armas? Las apartadas lo son, y se dibujan igual.
function esArma(seccion) { return seccion === 0 || seccion === 3; }

function listaDe(seccion) {
  if (seccion === 1) return Object.keys(PASIVOS);
  if (seccion === 2) return Object.keys(POTENCIADORES);
  // Las evoluciones se quedan en ARMAS: no salen en el sorteo, pero SÍ están en
  // el juego —se consiguen abriendo un cofre— y su arte es el del arma de la
  // que salen. Lo que separa a una apartada es que no hay forma de verla
  // jugando.
  const retirada = (id) => !!ARMAS[id].retirada;
  return Object.keys(ARMAS).filter(seccion === 3 ? retirada : (id) => !retirada(id));
}

export function tamanyoSeccion(seccion) { return listaDe(seccion).length; }

function nombreDe(seccion, id) {
  const def = (seccion === 1 ? PASIVOS : seccion === 2 ? POTENCIADORES : ARMAS)[id];
  return def ? def.nombre || id : id;
}

function sitiosDe(seccion) {
  return seccion === 1 ? SITIOS_OBJETO : seccion === 2 ? SITIOS_POTENCIADOR : SITIOS_ARMA;
}

// Dibuja el icono que toque por el MISMO camino que la pantalla de verdad.
// Los potenciadores no pasan por ui/hud.js: su arte es un PNG suelto del atlas
// y la tienda lo pinta a mano (iconoPotenciador en ui/tienda.js). Se repite ese
// encaje aquí, que son cuatro líneas, en vez de exportarlo: el día que se borre
// esta pantalla no debe quedar nada suyo en la tienda.
function pintar(ctx, seccion, id, x, y, r, escala) {
  if (esArma(seccion)) return dibujarIconoArma(ctx, x, y, r, id, ARMAS[id].color, escala);
  if (seccion === 1) return dibujarIconoPasivo(ctx, x, y, r, id, '#9fd0e8', escala);

  const arte = POTENCIADORES[id].arte;
  const meta = arte ? Recursos.meta(arte) : null;
  const img = arte ? Recursos.imagen(arte) : null;
  if (!meta || !img) return;
  const esc = Math.min(r * 2 / meta.w, r * 2 / meta.h);
  const w = meta.w * esc, h = meta.h * esc;
  ctx.drawImage(img, 0, 0, meta.w, meta.h, x - w / 2, y - h / 2, w, h);
}

// La ranura de debajo, con el MISMO blanco al 92% que usan la ficha y el HUD:
// los iconos son pixel art recortado al filo y sobre fondo oscuro las siluetas
// negras pierden el trazo. Mirar un dibujo sobre un fondo que no es el suyo es
// exactamente el error que esta pantalla viene a evitar.
// `blanca` a false para los POTENCIADORES: la tienda los pinta directamente
// sobre el oscuro de su fila, sin ranura ninguna, y darles aquí un fondo que no
// van a tener sería el mismo error al revés.
function ranura(ctx, x, y, r, redonda, elegida, blanca) {
  ctx.beginPath();
  if (redonda) ctx.arc(x, y, r, 0, Math.PI * 2);
  else ctx.roundRect(x - r, y - r, r * 2, r * 2, 3);
  ctx.fillStyle = blanca ? 'rgba(255,255,255,.92)' : 'rgba(255,255,255,.04)';
  ctx.fill();
  ctx.lineWidth = elegida ? 2 : 1;
  ctx.strokeStyle = elegida ? '#ffd479' : 'rgba(255,255,255,.28)';
  ctx.stroke();
}

// Nombre partido en DOS RENGLONES como mucho, cada uno dentro del ancho de su
// casilla. A un solo renglón se salían del hueco la mitad de las armas —"Aceite
// hirviendo", "Lluvia de agujas", "Onda expansiva"— y un nombre que se mete
// debajo del icono del vecino es peor que no ponerlo: dice el arma equivocada.
//
// Se corta por ESPACIOS, y solo se recurre a los puntos suspensivos cuando una
// palabra suelta ya no cabe. Así "Lanzas gemelas" se lee entero en dos líneas
// en vez de quedarse en "Lanzas geme…".
//
// Dos y no tres: el tercer renglón se comería el aire entre filas del mosaico y
// las casillas dejarían de leerse como casillas. Lo que no quepa en dos se
// termina de leer abajo, en la ficha del señalado, que da el nombre completo.
const RENGLONES = 2;

function repartirNombre(ctx, txt, ancho) {
  const palabras = txt.split(' ');
  const lineas = [];
  let i = 0;
  while (i < palabras.length && lineas.length < RENGLONES) {
    let linea = palabras[i++];
    while (i < palabras.length &&
           ctx.measureText(linea + ' ' + palabras[i]).width <= ancho) {
      linea += ' ' + palabras[i++];
    }
    // En el ÚLTIMO renglón se vuelca todo lo que queda y se recorta de una:
    // dejar palabras fuera sin más señal que su ausencia haría que "Rosa de los
    // vientos" se leyera como "Rosa de los", que es otra cosa.
    const ultimo = lineas.length === RENGLONES - 1;
    if (ultimo && i < palabras.length) linea += ' ' + palabras.slice(i).join(' ');
    lineas.push(recortar(ctx, linea, ancho));
    if (ultimo) break;
  }
  return lineas;
}

// Los números de esta pantalla se leen, no se calculan: van con coma decimal
// como el resto del juego y sin ceros de relleno.
function cifra(n) { return String(Math.round(n * 1000) / 1000).replace('.', ','); }

function recortar(ctx, txt, ancho) {
  if (ctx.measureText(txt).width <= ancho) return txt;
  let t = txt;
  while (t.length > 1 && ctx.measureText(t + '…').width > ancho) t = t.slice(0, -1);
  return t + '…';
}

// --- Mosaico ----------------------------------------------------------------
const COLS = 13;
const AIRE_NOMBRE = 8;      // lo que se le quita al paso para que dos vecinos no se toquen
const ALTO_RENGLON = 9;
const ALTO_DETALLE = 132;   // franja de abajo con el señalado en todos sus sitios
const R_MOSAICO = 17;

export function columnasGaleria() { return COLS; }

export function dibujarGaleria(ctxMundo, ctx, seccion, cursor) {
  const t = Tema.actual;
  const ids = listaDe(seccion);
  const r = rejilla(1, 10);

  ctx.save();
  armazon(ctxMundo, ctx, r, SECCIONES, seccion,
          ['GALERÍA DE ARTE — PANTALLA TEMPORAL', '', '', '←→↑↓ mover · TAB pestaña · ESC salir']);

  const izq = MARGEN;
  const ancho = ANCHO_UI - MARGEN * 2;
  const paso = ancho / COLS;
  const yMosaico = r.filas + 6;
  const altoMosaico = r.desc - ALTO_DETALLE - yMosaico - 10;
  const filas = Math.ceil(ids.length / COLS);
  // Alto de casilla: el medallón, el hueco y el renglón del nombre. Se estruja
  // hasta que quepan todas las filas, porque una galería con la última fila
  // fuera de pantalla no enseña justo lo que se acaba de añadir.
  // El alto de casilla tiene que dar para el medallón MÁS los dos renglones del
  // nombre; si no, el segundo renglón se mete en el icono de la fila de abajo.
  const altoCasilla = Math.min(58, altoMosaico / Math.max(1, filas));
  const rIcono = Math.min(R_MOSAICO, (altoCasilla - RENGLONES * ALTO_RENGLON - 6) / 2);

  // Un velo propio DEBAJO del mosaico. El del armazón deja ver la ilustración
  // del título, que en la tienda no molesta porque las filas la tapan, y aquí
  // sí: entre casilla y casilla hay hueco, y juzgar un dibujo con un templo
  // romano asomando por detrás es juzgar otra cosa.
  //
  // Y cubre el MOSAICO ENTERO, no solo las filas que hay. Cortándolo a la
  // altura de la última fila, una pestaña corta —APARTADAS son siete armas en
  // una fila— dejaba media pantalla de logo a la vista y sus iconos se juzgaban
  // sobre otro fondo que los de la pestaña de al lado. El velo tiene que ser el
  // mismo en las cuatro o la comparación entre pestañas deja de valer.
  ctx.beginPath();
  ctx.roundRect(izq, yMosaico - 6, ancho,
                Math.max(altoCasilla * filas + 10, altoMosaico + 10), 6);
  ctx.fillStyle = 'rgba(8,8,11,.72)';
  ctx.fill();

  for (let i = 0; i < ids.length; i++) {
    const col = i % COLS, fila = (i / COLS) | 0;
    const cx = izq + paso * (col + 0.5);
    const cy = yMosaico + altoCasilla * fila + rIcono + 4;
    const elegida = i === cursor;

    ranura(ctx, cx, cy, rIcono, seccion === 1, elegida, seccion !== 2);
    pintar(ctx, seccion, ids[i], cx, cy, rIcono * 0.92, 1);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = `600 8px ${FUENTE}`;
    ctx.fillStyle = elegida ? '#ffd479' : t.texto;
    // El ancho útil descuenta el aire entre columnas: si se midiera contra el
    // paso entero, dos nombres largos seguidos se tocarían aunque cada uno
    // cupiera en su casilla.
    const lineas = repartirNombre(ctx, nombreDe(seccion, ids[i]), paso - AIRE_NOMBRE);
    for (let k = 0; k < lineas.length; k++) {
      ctx.fillText(lineas[k], cx, cy + rIcono + 4 + k * ALTO_RENGLON);
    }
  }

  // --- El señalado, en todos sus sitios ------------------------------------
  const yDet = r.desc - ALTO_DETALLE;
  ctx.fillStyle = 'rgba(8,8,11,.86)';
  ctx.beginPath();
  ctx.roundRect(izq, yDet, ancho, ALTO_DETALLE - 6, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.12)';
  ctx.lineWidth = 1;
  ctx.stroke();

  const id = ids[Math.min(cursor, ids.length - 1)];
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 15px ${FUENTE_TITULO}`;
  ctx.fillStyle = t.titulo;
  textoEspaciado(ctx, nombreDe(seccion, id), izq + 14, yDet + 22, 1.2);

  // El id es lo que hace falta para saber QUÉ PNG hay que volver a dibujar:
  // el nombre bonito no dice de qué archivo de resources/ ha salido.
  ctx.font = `600 10px ${FUENTE}`;
  ctx.fillStyle = t.apagado;
  ctx.fillText(id, izq + 14, yDet + 37);

  const sitios = sitiosDe(seccion);
  // Cada sitio ocupa lo mismo, y el reparto empieza donde acaba el nombre para
  // que las medallas no se le monten encima en las armas de nombre largo.
  const x0 = izq + 200;
  const pasoSitio = (ancho - 214) / sitios.length;
  for (let s = 0; s < sitios.length; s++) {
    const sit = sitios[s];
    const cx = x0 + pasoSitio * (s + 0.5);
    const cy = yDet + 52;

    // La ranura a SU tamaño y el icono al suyo, cada uno con el número de su
    // pantalla. Donde no hay ranura no se dibuja ninguna: el icono va sobre el
    // fondo del panel, que es lo más parecido que hay aquí a la cara de la
    // ruleta o al papel de la carta final.
    if (sit.rRanura > 0) ranura(ctx, cx, cy, sit.rRanura, sit.redonda, false, sit.blanca);
    ctx.save();
    // La escala se pasa TAL CUAL la pasa el sitio real: es lo que decide si el
    // icono sale de la hoja de 32 o de la de 96 (ver blitHoja en ui/hud.js), y
    // falsearla aquí enseñaría un dibujo que el juego no va a dibujar nunca.
    pintar(ctx, seccion, id, cx, cy, sit.r, sit.escala);
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = `700 8px ${FUENTE}`;
    ctx.fillStyle = t.titulo;
    ctx.fillText(sit.rot, cx, yDet + 96);
    ctx.font = `600 7px ${FUENTE}`;
    ctx.fillStyle = t.apagado;
    ctx.fillText(cifra(sit.r) + (sit.escala !== 1 ? ' ×' + cifra(sit.escala) : '')
                 + (sit.rRanura ? '  ·  ranura ' + cifra(sit.rRanura * 2) : '  ·  sin ranura'),
                 cx, yDet + 107);
  }

  ctx.restore();
}
