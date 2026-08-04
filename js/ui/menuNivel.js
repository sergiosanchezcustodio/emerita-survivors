import { ANCHO_FISICO, ALTO_FISICO } from '../core/constantes.js';
import { Progresion } from '../sistemas/progresion.js';
import { FUENTE, FUENTE_TITULO, textoEspaciado } from './capa.js';
import { Tema, panel, cenefa } from './tema.js';
import { ALTO_FICHA, MARGEN_FICHA } from './hud.js';

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
const ALTO_CARTA = 94;
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
const COLOR_JUGADOR = ['#5aa9e6', '#e8b73a', '#8fbf5a', '#d64b8f'];

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

// Esquina del panel. Con un solo jugador va centrado; con más, a la esquina de
// quien elige, por detrás de su ficha.
function situar(indice, unSolo, ancho, alto) {
  if (unSolo || indice < 0) {
    return { x: (ANCHO_FISICO - ancho) / 2, y: (ALTO_FISICO - alto) / 2 };
  }
  const derecha = (indice % 2) === 1;
  const abajo = indice >= 2;
  return {
    x: derecha ? ANCHO_FISICO - ancho - MARGEN_PANTALLA : MARGEN_PANTALLA,
    y: abajo
      ? ALTO_FISICO - ESTORBO_FICHA - HUECO - alto
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

  ctx.textAlign = 'right';
  ctx.font = `17px ${FUENTE_TITULO}`;
  ctx.fillStyle = t.titulo;
  textoEspaciado(ctx, `NIVEL ${j.nivel}`, px + ancho - RELLENO, yCabecera, 2.5);

  // Cenefa de separación: es el ornamento del nivel, no una raya cualquiera.
  cenefa(ctx, px + RELLENO, py + RELLENO + 14, ancho - RELLENO * 2);

  // --- Cartas ------------------------------------------------------------
  const x0 = px + RELLENO;
  const y0 = py + CABECERA;

  for (let i = 0; i < n; i++) {
    const o = Progresion.opciones[i];
    const x = x0 + i * (ANCHO_CARTA + HUECO);
    const elegida = i === Progresion.seleccion;
    const color = colorDe(o);

    ctx.fillStyle = elegida ? t.cartaElegida : t.fondoCarta;
    ctx.fillRect(x, y0, ANCHO_CARTA, ALTO_CARTA);

    // Franja de color arriba: identifica de un vistazo si es arma o pasivo,
    // nuevo o mejora, sin tener que leer la etiqueta.
    ctx.fillStyle = color;
    ctx.fillRect(x, y0, ANCHO_CARTA, elegida ? 3 : 2);

    ctx.strokeStyle = elegida ? color : t.filo;
    ctx.globalAlpha = elegida ? 1 : 0.5;
    ctx.lineWidth = elegida ? 1.5 : 1;
    ctx.strokeRect(x + 0.5, y0 + 0.5, ANCHO_CARTA - 1, ALTO_CARTA - 1);
    ctx.globalAlpha = 1;

    const centro = x + ANCHO_CARTA / 2;
    ctx.textAlign = 'center';

    ctx.font = `600 8px ${FUENTE}`;
    ctx.fillStyle = color;
    textoEspaciado(ctx, etiquetaDe(o), centro, y0 + 17, 1);

    ctx.font = `600 14px ${FUENTE}`;
    ctx.fillStyle = elegida ? '#ffffff' : t.titulo;
    ctx.fillText(o.nombre, centro, y0 + 40);

    ctx.font = `400 9.5px ${FUENTE}`;
    ctx.fillStyle = t.texto;
    const [l1, l2] = partir(o.descripcion || '');
    if (l2) {
      ctx.fillText(l1, centro, y0 + 62);
      ctx.fillText(l2, centro, y0 + 76);
    } else {
      ctx.fillText(l1, centro, y0 + 69);
    }
  }

  // --- Pie: solo datos, ninguna instrucción ------------------------------
  // Se han quitado los números de atajo de las cartas y la línea de controles.
  // Con tres cartas y una flecha, cómo se elige se aprende la primera vez; a
  // partir de la segunda subida es ruido que hay que saltarse cincuenta veces
  // por partida. Lo que sí queda es lo que CAMBIA: rerolls y cola.
  const yPie = y0 + ALTO_CARTA + 9;
  ctx.textBaseline = 'middle';

  if (j.rerolls > 0) {
    ctx.textAlign = 'left';
    ctx.font = `500 9px ${FUENTE}`;
    ctx.fillStyle = t.apagado;
    ctx.fillText(`R  ×${j.rerolls}`, px + RELLENO, yPie);
  }

  if (Progresion.cola.length > 0) {
    ctx.textAlign = 'right';
    ctx.font = `500 9px ${FUENTE}`;
    ctx.fillStyle = COLOR_ARMA_NUEVA;
    ctx.fillText(`${Progresion.cola.length} esperando`, px + ancho - RELLENO, yPie);
  }

  ctx.restore();
}
