import { ANCHO_UI, ALTO_UI } from '../core/constantes.js';
import { Progresion, DURACION_TIRADA } from '../sistemas/progresion.js';
import { FUENTE, FUENTE_TITULO, textoEspaciado } from './capa.js';
import { Tema, panel, cenefa } from './tema.js';
import {
  ALTO_FICHA, MARGEN_FICHA, dibujarIconoArma, dibujarIconoPasivo, COLOR_PASIVO
} from './hud.js';
import { ARMAS } from '../datos/armas.js';
import { PASIVOS } from '../datos/pasivos.js';

// Pantalla de subida de nivel. Va en la CAPA DE INTERFAZ (ui/capa.js), a
// resolución de pantalla: aquí hay que leer, y leer deprisa, porque el juego
// está parado esperando una decisión.
//
// NO TAPA LA PARTIDA. Es un panel compacto, no un velo a pantalla completa.
// Cubrirlo todo obligaba a reconstruir mentalmente la situación al cerrarlo:
// dónde estaba la horda, por dónde venía el cerco, cuánta vida quedaba. Ahora
// eliges viendo el problema, que es lo que hace que la elección signifique algo.
//
// En cooperativo el panel se va a LA ESQUINA DEL JUGADOR que está eligiendo, la
// misma en la que tiene su ficha. Con cuatro personas mirando la misma pantalla,
// que el menú salga siempre en el centro obliga a preguntar en voz alta de quién
// es; saliendo en tu esquina, lo sabes sin mirar el nombre.
//
// EL ASPECTO LO PONE EL NIVEL, no este archivo: fondo, marco, ornamento y
// colores salen de ui/tema.js, que los lee del NIVEL en curso. En Emerita el
// panel es piedra tostada, marfil y bronce con greca; el nivel que venga después
// traerá el suyo sin tocar nada de aquí.
//
// Tres opciones, no las cuatro del plan: decisión de diseño. Con tres, la
// elección se lee de un vistazo y no interrumpe tanto el ritmo.

const ANCHO_CARTA = 132;
const ALTO_CARTA = 112;      // 18 más que antes: el icono pide su sitio

// Medallón del icono. Va entre la etiqueta y el nombre, centrado, y es lo
// primero que se ve de la carta: la forma dice de qué familia es el arma —flecha
// para proyectil, anillo para orbital, charco para zona— y eso se lee de un
// vistazo, antes que el nombre. Con tres cartas y el mundo parado esperando, esa
// décima de segundo es la diferencia entre elegir y leer.
const ICONO_R = 15;          // radio del medallón
const Y_ICONO = 36;
const HUECO = 8;
const RELLENO = 12;         // margen interior del panel
const CABECERA = 36;        // titular + cenefa
const PIE = 15;

const MARGEN_PANTALLA = 14;
// El menú se coloca por detrás de la ficha del jugador para no taparle a nadie
// su propia vida. La medida la exporta ui/hud.js: cuando estaba copiada aquí,
// cambiar el tamaño de la ficha dejaba las dos cosas solapadas.
const ESTORBO_FICHA = ALTO_FICHA + MARGEN_FICHA;

const COLOR_ARMA_NUEVA    = '#e8b73a';
const COLOR_ARMA_MEJORA   = '#cbbfa4';
const COLOR_PASIVO_NUEVO  = '#7fc4e8';
const COLOR_PASIVO_MEJORA = '#9fb0bd';
const COLOR_CURACION      = '#8fbf5a';
const COLOR_COFRE         = '#ffd45a';   // bronce del cofre, en el titular
const COLOR_AUTO          = '#7fd68a';   // interruptor de subida automática
const COLOR_JUGADOR = ['#5aa9e6', '#e8b73a', '#8fbf5a', '#d64b8f'];

// --- Ruleta de la tirada -----------------------------------------------------
// Las cartas ya están decididas cuando el menú se abre (Progresion.opciones
// sale de `_generar`, con el RNG de siempre); esto solo tapa el resultado un
// instante y lo enseña girando, como una tragaperras. La rueda cicla iconos
// de armas y pasivos AL AZAR DE VERDAD —no los candidatos reales de esta
// tirada—, precisamente para que no dé ninguna pista de lo que va a salir.
const RUEDA_SPIN = [];
{
  const idsArma = Object.keys(ARMAS).filter((id) => !ARMAS[id].esEvolucion);
  const idsPasivo = Object.keys(PASIVOS);
  const max = Math.max(idsArma.length, idsPasivo.length);
  for (let i = 0; i < max; i++) {
    if (idsArma[i]) RUEDA_SPIN.push({ clase: 'arma', id: idsArma[i] });
    if (idsPasivo[i]) RUEDA_SPIN.push({ clase: 'pasivo', id: idsPasivo[i] });
  }
}

const INTERVALO_SIMBOLO = 0.06;   // cuánto dura cada icono antes de cambiar
const DESFASE_CARRETE = 5;        // separa lo que enseña cada carrete a la vez
const ESCALONADO = 0.14;          // cuánto tarda cada carrete de más en pararse
const DURACION_POP = 0.18;        // rebote al parar

// Un carrete por carta, de izquierda a derecha: la de más a la derecha es la
// última en pararse, como en cualquier tragaperras de verdad.
function paraEn(indice, nOpciones) {
  return ESCALONADO * (nOpciones - 1 - indice);
}

function colorDe(o) {
  if (o.clase === 'curacion') return COLOR_CURACION;
  if (o.clase === 'arma') return o.nuevo ? COLOR_ARMA_NUEVA : COLOR_ARMA_MEJORA;
  return o.nuevo ? COLOR_PASIVO_NUEVO : COLOR_PASIVO_MEJORA;
}

function etiquetaDe(o) {
  if (o.clase === 'curacion') return 'RECOMPENSA';
  const esArma = o.clase === 'arma';
  if (o.nuevo) return esArma ? 'ARMA NUEVA' : 'PASIVO NUEVO';
  return `${esArma ? 'ARMA' : 'PASIVO'}   ${o.nivelActual} → ${o.nivelActual + 1}`;
}

// Corta la descripción en dos líneas por el hueco más cercano al centro, para
// que no quede una línea larga y otra de dos palabras.
function partir(texto) {
  if (texto.length <= 26) return [texto, ''];
  const medio = texto.length >> 1;
  let corte = -1;
  for (let i = 0; i < texto.length; i++) {
    if (texto[i] !== ' ') continue;
    if (corte < 0 || Math.abs(i - medio) < Math.abs(corte - medio)) corte = i;
  }
  if (corte < 0) return [texto, ''];
  return [texto.slice(0, corte), texto.slice(corte + 1)];
}

// Medallón con el icono de la oferta: disco oscuro, aro del color de la carta y
// el glifo dentro. Los glifos son los MISMOS que la ficha del jugador dibuja en
// sus ranuras (ui/hud.js) y eso es medio propósito de esto: el icono que eliges
// aquí es el que vas a buscar luego en tu ficha, y si no fueran el mismo dibujo
// habría que aprenderse dos.
function dibujarMedallon(ctx, cx, cy, o, color, elegida) {
  ctx.save();

  ctx.beginPath();
  ctx.arc(cx, cy, ICONO_R, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(10,7,6,.45)';
  ctx.fill();
  ctx.lineWidth = elegida ? 1.6 : 1;
  ctx.strokeStyle = color;
  ctx.globalAlpha = elegida ? 1 : 0.6;
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.translate(cx, cy);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.6;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (o.clase === 'arma') {
    if (ARMAS[o.id]) dibujarIconoArma(ctx, 0, 0, ICONO_R * 0.62, o.id, color);
  } else if (o.clase === 'pasivo') {
    if (PASIVOS[o.id]) dibujarIconoPasivo(ctx, 0, 0, ICONO_R * 0.62, o.id, COLOR_PASIVO);
  } else {
    // Curación: una copa. No tiene comportamiento ni campo del que sacar glifo,
    // y dejarla con el círculo por defecto la haría parecer un arma sin icono.
    const r = ICONO_R * 0.6;
    ctx.beginPath();
    ctx.moveTo(-r * 0.7, -r * 0.7);
    ctx.lineTo(r * 0.7, -r * 0.7);
    ctx.lineTo(r * 0.35, r * 0.2);
    ctx.lineTo(-r * 0.35, r * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, r * 0.2); ctx.lineTo(0, r * 0.75);
    ctx.moveTo(-r * 0.5, r * 0.85); ctx.lineTo(r * 0.5, r * 0.85);
    ctx.stroke();
  }
  ctx.restore();
}

// Esquina del panel. Con un solo jugador va centrado; con más, a la esquina de
// quien elige, por detrás de su ficha.
function situar(indice, unSolo, ancho, alto) {
  if (unSolo || indice < 0) {
    return { x: (ANCHO_UI - ancho) / 2, y: (ALTO_UI - alto) / 2 };
  }
  const derecha = (indice % 2) === 1;
  const abajo = indice >= 2;
  return {
    x: derecha ? ANCHO_UI - ancho - MARGEN_PANTALLA : MARGEN_PANTALLA,
    y: abajo
      ? ALTO_UI - ESTORBO_FICHA - HUECO - alto
      : ESTORBO_FICHA + HUECO
  };
}

export function dibujarMenuNivel(ctx, jugadores) {
  const j = Progresion.actual;
  if (!j) return;

  const t = Tema.actual;
  const n = Progresion.nOpciones;
  const ancho = n * ANCHO_CARTA + (n - 1) * HUECO + RELLENO * 2;
  const alto = CABECERA + ALTO_CARTA + PIE + RELLENO;

  const indice = jugadores ? jugadores.indexOf(j) : -1;
  const unSolo = !jugadores || jugadores.length <= 1;
  const { x: px, y: py } = situar(indice, unSolo, ancho, alto);
  const colorJ = COLOR_JUGADOR[(indice < 0 ? 0 : indice) % COLOR_JUGADOR.length];

  ctx.save();

  // Fondo, marcos y escuadras. El marco interior lleva el color del jugador, que
  // es el segundo indicio de a quién le toca sin tener que leer nada.
  panel(ctx, px, py, ancho, alto, colorJ);

  // --- Cabecera: de quién es y qué nivel ---------------------------------
  ctx.textBaseline = 'middle';
  const yCabecera = py + RELLENO + 5;

  ctx.textAlign = 'left';
  ctx.font = `600 10px ${FUENTE}`;
  ctx.fillStyle = colorJ;
  ctx.fillText(unSolo ? j.def.nombre : `P${indice + 1}  ${j.def.nombre}`,
               px + RELLENO, yCabecera);

  // El mismo menú sirve para la subida de nivel y para el cofre de un élite; lo
  // único que cambia es el titular y su color. Son dos momentos distintos y hay
  // que saber cuál es sin pensarlo —de un cofre se espera otra cosa—, pero la
  // navegación es idéntica y duplicar la pantalla para cambiar una palabra
  // habría sido mantener dos veces las mismas cartas y el mismo mando.
  const deCofre = Progresion.origen === 'cofre';
  ctx.textAlign = 'right';
  ctx.font = `17px ${FUENTE_TITULO}`;
  ctx.fillStyle = deCofre ? COLOR_COFRE : t.titulo;
  textoEspaciado(ctx, deCofre ? 'COFRE' : `NIVEL ${j.nivel}`,
                 px + ancho - RELLENO, yCabecera, 2.5);

  // Cenefa de separación: es el ornamento del nivel, no una raya cualquiera.
  cenefa(ctx, px + RELLENO, py + RELLENO + 14, ancho - RELLENO * 2);

  // --- Cartas ------------------------------------------------------------
  const x0 = px + RELLENO;
  const y0 = py + CABECERA;

  const transcurrido = DURACION_TIRADA - Progresion.animando;

  for (let i = 0; i < n; i++) {
    const o = Progresion.opciones[i];
    const x = x0 + i * (ANCHO_CARTA + HUECO);
    const elegida = i === Progresion.seleccion;
    const pararEn = paraEn(i, n);
    const girando = Progresion.animando > pararEn;

    ctx.fillStyle = elegida ? t.cartaElegida : t.fondoCarta;
    ctx.fillRect(x, y0, ANCHO_CARTA, ALTO_CARTA);

    const color = girando ? t.filo : colorDe(o);

    // Franja de color arriba: identifica de un vistazo si es arma o pasivo,
    // nuevo o mejora, sin tener que leer la etiqueta. Mientras gira no dice
    // nada todavía, así que se queda en el tono neutro del tema.
    ctx.fillStyle = color;
    ctx.fillRect(x, y0, ANCHO_CARTA, elegida ? 3 : 2);

    ctx.strokeStyle = elegida ? color : t.filo;
    ctx.globalAlpha = elegida ? 1 : 0.5;
    ctx.lineWidth = elegida ? 1.5 : 1;
    ctx.strokeRect(x + 0.5, y0 + 0.5, ANCHO_CARTA - 1, ALTO_CARTA - 1);
    ctx.globalAlpha = 1;

    const centro = x + ANCHO_CARTA / 2;
    ctx.textAlign = 'center';

    if (girando) {
      // El carrete: cicla iconos AL AZAR DE VERDAD (no los candidatos de esta
      // tirada) para no adelantar nada de lo que va a salir. Cada carta lleva
      // su propio desfase para que las tres no enseñen el mismo icono a la vez.
      const indice = (i * DESFASE_CARRETE + Math.floor(transcurrido / INTERVALO_SIMBOLO))
                     % RUEDA_SPIN.length;
      dibujarMedallon(ctx, centro, y0 + Y_ICONO, RUEDA_SPIN[indice], color, false);
      continue;
    }

    // Recién parada: un pequeño rebote en el medallón, el "clac" de la
    // tragaperras. Puramente cosmético, se calcula del propio contador de la
    // tirada, no de nada nuevo.
    const tiempoParado = pararEn - Progresion.animando;
    const escala = tiempoParado < DURACION_POP
      ? 1 + 0.14 * (1 - tiempoParado / DURACION_POP) ** 2
      : 1;

    ctx.font = `600 8px ${FUENTE}`;
    ctx.fillStyle = color;
    textoEspaciado(ctx, etiquetaDe(o), centro, y0 + 15, 1);

    if (escala === 1) {
      dibujarMedallon(ctx, centro, y0 + Y_ICONO, o, color, elegida);
    } else {
      ctx.save();
      ctx.translate(centro, y0 + Y_ICONO);
      ctx.scale(escala, escala);
      dibujarMedallon(ctx, 0, 0, o, color, elegida);
      ctx.restore();
    }

    ctx.font = `600 14px ${FUENTE}`;
    ctx.fillStyle = elegida ? '#ffffff' : t.titulo;
    ctx.fillText(o.nombre, centro, y0 + 68);

    ctx.font = `400 9.5px ${FUENTE}`;
    ctx.fillStyle = t.texto;
    const [l1, l2] = partir(o.descripcion || '');
    if (l2) {
      ctx.fillText(l1, centro, y0 + 85);
      ctx.fillText(l2, centro, y0 + 98);
    } else {
      ctx.fillText(l1, centro, y0 + 91);
    }
  }

  // --- Pie: solo datos, ninguna instrucción ------------------------------
  // Se han quitado los números de atajo de las cartas y la línea de controles.
  // Con tres cartas y una flecha, cómo se elige se aprende la primera vez; a
  // partir de la segunda subida es ruido que hay que saltarse cincuenta veces
  // por partida. Lo que sí queda es lo que CAMBIA: rerolls y cola.
  const yPie = y0 + ALTO_CARTA + 9;
  ctx.textBaseline = 'middle';

  ctx.textAlign = 'left';
  ctx.font = `500 9px ${FUENTE}`;
  ctx.fillStyle = t.apagado;
  let xPie = px + RELLENO;
  if (j.rerolls > 0) {
    ctx.fillText(`R  ×${j.rerolls}`, xPie, yPie);
    xPie += 42;
  }

  // El interruptor de subida automática solo aparece cuando ya se puede usar:
  // con ranuras libres cada elección todavía decide la partida y ofrecer
  // delegarla sería ofrecer perderse el juego. Con las ocho llenas, en cambio,
  // esto son cincuenta menús menos.
  if (Progresion.puedeAutomatizar(j)) {
    ctx.fillStyle = j.autoNivel ? COLOR_AUTO : t.apagado;
    ctx.fillText(`F  automático: ${j.autoNivel ? 'sí' : 'no'}`, xPie, yPie);
  }

  if (Progresion.cola.length > 0) {
    ctx.textAlign = 'right';
    ctx.font = `500 9px ${FUENTE}`;
    ctx.fillStyle = COLOR_ARMA_NUEVA;
    ctx.fillText(`${Progresion.cola.length} esperando`, px + ancho - RELLENO, yPie);
  }

  ctx.restore();
}
