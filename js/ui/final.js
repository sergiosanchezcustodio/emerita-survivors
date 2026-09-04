import { ANCHO_UI, ALTO_UI } from '../core/constantes.js';
import { Capa, FUENTE, FUENTE_TITULO, textoEspaciado } from './capa.js';
import { Tema, cenefa } from './tema.js';
import { Recursos } from '../core/recursos.js';
import { ARMAS } from '../datos/armas.js';
import { dibujarIconoArma, dibujarIconoPasivo, COLOR_JUGADOR } from './hud.js';

// PANTALLA FINAL: tiempo sobrevivido, bajas, denarios y la ficha de CADA
// jugador, tanto si se sobrevive a la horda como si no. Victoria y derrota
// comparten forma —solo cambian título, color y una línea de cierre— porque las
// dos son el mismo momento: la partida ha terminado y toca mirar el resumen.
//
// A PANTALLA COMPLETA y con UNA COLUMNA POR JUGADOR, que es lo que pidió
// Sergio. Antes era un panel de 300x188 con las cifras del jugador 1 y ya, y en
// cooperativo eso es justo lo que no vale: cuatro personas acaban de jugar la
// misma partida y solo una salía en el resumen. El reloj y las bajas TOTALES son
// de equipo, pero el nivel, las bajas propias, el arsenal, los golpes recibidos
// y quién quedó en pie son de cada
// uno, y son lo que se comenta al terminar.
//
// Se sale de aquí AL MENÚ PRINCIPAL, no recargando la página: ver volverAlMenu()
// en main.js.

const COLOR_VICTORIA = { titulo: '#e8c368', borde: '#e8c368', pie: '#d7c9a0' };
const COLOR_DERROTA = { titulo: '#e8b0a4', borde: '#a04a3c', pie: '#a4837c' };
const COLOR_EN_PIE = '#7fd68a';
const COLOR_CAIDO = '#e8907c';

// CARTEL de derrota: primer tiempo, antes del resumen. Solo la palabra y una
// línea de "pulsa para seguir", SIN panel detrás.
//
// Que no haya panel es el punto entero: lo que hay debajo —el ataúd, dónde ha
// caído, la horda que lo rodea— es lo que se quiere mirar en ese momento, y un
// rectángulo opaco en el centro lo tapaba justo cuando más se mira. Jugando
// solo el ataúd propio no llegaba a verse nunca.
//
// Arriba y no en el centro, por lo mismo: el centro es donde está el cuerpo.
const ALTURA_CARTEL = 0.22;      // fracción del alto, medida desde arriba

export function dibujarCartelFinal(ctx, alto, victoria) {
  const color = victoria ? COLOR_VICTORIA : COLOR_DERROTA;
  const y = alto * ALTURA_CARTEL;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Reborde oscuro en vez de caja, como el resto de textos sobre el mundo (ver
  // textoBorde en ui/capa.js): se lee sobre la arena, sobre la piedra y sobre
  // una horda entera sin tapar ninguno.
  ctx.font = `44px ${FUENTE_TITULO}`;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 7;
  ctx.strokeStyle = 'rgba(6,5,10,.92)';
  ctx.fillStyle = color.titulo;
  const texto = victoria ? 'VICTORIA' : 'DERROTA';
  const ancho = medirEspaciado(ctx, texto, 10);
  trazarEspaciado(ctx, texto, ANCHO_UI / 2 - ancho / 2, y, 10);

  ctx.font = `400 11px ${FUENTE}`;
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = 'rgba(6,5,10,.92)';
  ctx.fillStyle = color.pie;
  const pie = 'Pulsa cualquier tecla para ver el resumen';
  ctx.strokeText(pie, ANCHO_UI / 2, y + 36);
  ctx.fillText(pie, ANCHO_UI / 2, y + 36);

  ctx.restore();
}

// textoEspaciado de ui/capa.js solo rellena; aquí hace falta trazar el reborde
// ANTES del relleno letra a letra, así que se separan medir y trazar.
function medirEspaciado(ctx, txt, extra) {
  let total = 0;
  for (const c of txt) total += ctx.measureText(c).width + extra;
  return total - extra;
}

function trazarEspaciado(ctx, txt, x, y, extra) {
  const alineacion = ctx.textAlign;
  ctx.textAlign = 'left';
  let cx = x;
  for (const c of txt) {
    ctx.strokeText(c, cx, y);
    ctx.fillText(c, cx, y);
    cx += ctx.measureText(c).width + extra;
  }
  ctx.textAlign = alineacion;
}

// mm:ss. El reloj de la partida es un número de segundos con decimales, y
// enseñar "1263.4817" como tiempo sobrevivido no lo lee nadie.
function formatoTiempo(segundos) {
  const s = Math.max(0, Math.floor(segundos || 0));
  const m = Math.floor(s / 60);
  return m + ':' + String(s % 60).padStart(2, '0');
}

// Etiqueta pequeña arriba, cifra grande debajo. Es el bloque de las cifras de
// equipo, que van centradas y sin caja: son cuatro números y el ojo los agrupa
// solo si están alineados.
function cifra(ctx, x, y, etiqueta, valor, color) {
  const t = Tema.actual;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 9px ${FUENTE}`;
  ctx.fillStyle = t.apagado;
  textoEspaciado(ctx, etiqueta, x, y, 1.4);
  ctx.font = `700 22px ${FUENTE}`;
  ctx.fillStyle = color || t.titulo;
  ctx.fillText(valor, x, y + 22);
}

// Fila de la ficha de un jugador: etiqueta a la izquierda, valor a la derecha.
function filaEstadistica(ctx, x, y, w, etiqueta, valor, color) {
  const t = Tema.actual;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `500 10px ${FUENTE}`;
  ctx.fillStyle = t.apagado;
  ctx.fillText(etiqueta, x, y);
  ctx.textAlign = 'right';
  ctx.font = `700 11px ${FUENTE}`;
  ctx.fillStyle = color || t.titulo;
  ctx.fillText(valor, x + w, y);
}

// --- Medidas de la rejilla ----------------------------------------------------
// Igual que en la tienda: el reparto vertical se calcula en cada dibujo. La capa
// mide 540 de alto siempre, pero el lienzo se centra en la ventana y en una más
// baja se recorta por arriba y por abajo (ver Capa.altoVisible). Con medidas
// fijas, el titular y la línea de "pulsa para volver al menú" se cortaban.
const HUECO_CARTA = 18;
const ALTO_MAXIMO_CARTA = 308;

function rejilla() {
  const recorte = Math.max(0, (ALTO_UI - Capa.altoVisible) / 2);
  const arriba = recorte + 10;
  const abajo = ALTO_UI - recorte - 10;
  const cartas = arriba + 132;
  return {
    titulo: arriba + 36,
    cenefa: arriba + 60,
    cifras: arriba + 82,
    cartas,
    altoCarta: Math.min(ALTO_MAXIMO_CARTA, Math.max(150, abajo - 22 - cartas)),
    pie: abajo
  };
}

const RADIO_ICONO = 11;
const PASO_ICONO = 26;

// `stats` sale de main.js, capturado UNA vez en el instante en que termina la
// partida (ver capturarStats):
//   { tiempo, bajas, denarios, monedero, jugadores: [...] }
// y cada jugador trae { id, nombre, nivel, bajas, golpes, resurrecciones, enPie,
// mascota, armas: [{id, nivel}], pasivos: {id: nivel} }.
export function dibujarFinal(ctx, alto, victoria, stats) {
  const color = victoria ? COLOR_VICTORIA : COLOR_DERROTA;
  const fichas = (stats && stats.jugadores) || [];
  const r = rejilla();

  ctx.save();

  // Velo a pantalla completa y CASI OPACO. Aquí sí tapa el mundo, al revés que
  // el cartel: el momento de mirar el campo de batalla ya ha pasado y lo que
  // toca es leer cifras con calma. A .9 se transparentaban las fichas de vida de
  // los jugadores, que están en las cuatro esquinas y son justo donde van las
  // columnas del resumen.
  ctx.fillStyle = 'rgba(6,5,10,.97)';
  ctx.fillRect(0, 0, ANCHO_UI, ALTO_UI);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `38px ${FUENTE_TITULO}`;
  ctx.fillStyle = color.titulo;
  textoEspaciado(ctx, victoria ? 'VICTORIA' : 'DERROTA', ANCHO_UI / 2, r.titulo, 8);
  cenefa(ctx, 140, r.cenefa, ANCHO_UI - 280);

  // --- Cifras de equipo ----------------------------------------------------
  // Van arriba y separadas de las fichas porque son de todos: el tiempo que
  // aguantó la partida, la horda entera que cayó y lo que se llevan a la tienda.
  const etiquetas = ['TIEMPO', 'BAJAS', 'DENARIOS', 'MONEDERO'];
  const valores = [formatoTiempo(stats.tiempo), String(stats.bajas),
                   '+' + stats.denarios, String(stats.monedero)];
  const colores = [null, null, '#e8b73a', '#e8b73a'];
  const pasoCifra = 190;
  const x0Cifra = ANCHO_UI / 2 - (etiquetas.length - 1) * pasoCifra / 2;
  for (let i = 0; i < etiquetas.length; i++) {
    cifra(ctx, x0Cifra + i * pasoCifra, r.cifras, etiquetas[i], valores[i], colores[i]);
  }

  // --- Una ficha por jugador ------------------------------------------------
  // Más anchas cuando son pocas: con un solo jugador, una columna de 208 en
  // medio de 960 se lee como que falta algo.
  const n = Math.max(1, fichas.length);
  const ancho = n >= 3 ? 208 : 262;
  const total = n * ancho + (n - 1) * HUECO_CARTA;
  const x0 = (ANCHO_UI - total) / 2;

  for (let i = 0; i < fichas.length; i++) {
    dibujarFicha(ctx, fichas[i], i, x0 + i * (ancho + HUECO_CARTA), r.cartas, ancho,
                 r.altoCarta);
  }

  ctx.textAlign = 'center';
  ctx.font = `400 11px ${FUENTE}`;
  ctx.fillStyle = color.pie;
  ctx.fillText('Pulsa cualquier tecla para volver al menú', ANCHO_UI / 2, r.pie);

  ctx.restore();
}

function dibujarFicha(ctx, f, indice, x, y, ancho, altoCarta) {
  const t = Tema.actual;
  const acento = COLOR_JUGADOR[indice % COLOR_JUGADOR.length];
  const cx = x + ancho / 2;
  const relleno = 14;

  ctx.beginPath();
  ctx.roundRect(x, y, ancho, altoCarta, 7);
  ctx.fillStyle = 'rgba(18,18,23,.85)';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = acento;
  ctx.stroke();

  // Retrato, el mismo que usa su ficha en partida. Se tiñe el aro con el color
  // del jugador: en cooperativo es lo que dice de quién es la columna sin tener
  // que leer el nombre.
  const idArte = f.sprite || f.id;
  const meta = Recursos.meta(idArte + 'Cara');
  const img = Recursos.imagen(idArte + 'Cara');
  const yCara = y + 40;
  if (meta && img) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, yCara, 26, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, 0, 0, meta.w, meta.h, cx - 26, yCara - 26, 52, 52);
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(cx, yCara, 26, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = acento;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `17px ${FUENTE_TITULO}`;
  ctx.fillStyle = t.titulo;
  textoEspaciado(ctx, f.nombre.toUpperCase(), cx, y + 84, 2);

  // EN PIE o CAÍDO. En una victoria hay quien llega y quien no, y en una derrota
  // hay quien cayó el primero: es la línea que más se comenta al terminar.
  ctx.font = `600 10px ${FUENTE}`;
  ctx.fillStyle = f.enPie ? COLOR_EN_PIE : COLOR_CAIDO;
  textoEspaciado(ctx, f.enPie ? 'EN PIE' : 'CAÍDO', cx, y + 102, 1.6);

  const xIzq = x + relleno;
  const anchoFila = ancho - relleno * 2;
  // CINCO filas, y el paso baja de 17 a 15 por eso. Con 17, la quinta dejaba
  // ocho píxeles hasta el rótulo ARSENAL de abajo y las dos cosas se leían como
  // un solo bloque apelotonado; el rótulo no se puede bajar porque los iconos
  // del arsenal cuelgan de él y la carta tiene alto máximo.
  const PASO_FILA = 15;
  let yFila = y + 126;
  filaEstadistica(ctx, xIzq, yFila, anchoFila, 'NIVEL', String(f.nivel));
  yFila += PASO_FILA;
  // ENEMIGOS ELIMINADOS por ESTE jugador, no por el equipo. El total de la
  // horda sigue estando arriba, en la cabecera del resumen; esto contesta la
  // otra pregunta, que es la que se discute al terminar: cuántos cayeron por mí.
  filaEstadistica(ctx, xIzq, yFila, anchoFila, 'ENEMIGOS ELIMINADOS', String(f.bajas));
  yFila += PASO_FILA;
  filaEstadistica(ctx, xIzq, yFila, anchoFila, 'GOLPES RECIBIDOS', String(f.golpes));
  yFila += PASO_FILA;
  filaEstadistica(ctx, xIzq, yFila, anchoFila, 'RESURRECCIONES', String(f.resurrecciones));
  yFila += PASO_FILA;
  filaEstadistica(ctx, xIzq, yFila, anchoFila, 'MASCOTA', f.mascota || '—');

  // --- Arsenal --------------------------------------------------------------
  // Armas primero y objetos después, con el nivel de cada arma encima: es el
  // retrato de la partida que se acaba de jugar, y lo que decide si la siguiente
  // se monta igual o distinta.
  ctx.textAlign = 'left';
  ctx.font = `600 9px ${FUENTE}`;
  ctx.fillStyle = t.apagado;
  textoEspaciado(ctx, 'ARSENAL', xIzq, y + 202, 1.4);

  const porFila = Math.max(1, Math.floor(anchoFila / PASO_ICONO));
  let k = 0;
  const situar = () => {
    const fila = Math.floor(k / porFila);
    const col = k % porFila;
    const enFila = Math.min(porFila, totalIconos - fila * porFila);
    const anchoUsado = enFila * PASO_ICONO - (PASO_ICONO - RADIO_ICONO * 2);
    return {
      x: cx - anchoUsado / 2 + RADIO_ICONO + col * PASO_ICONO,
      y: y + 226 + fila * PASO_ICONO
    };
  };

  const idsPasivos = Object.keys(f.pasivos || {});
  const totalIconos = f.armas.length + idsPasivos.length;

  for (let i = 0; i < f.armas.length; i++, k++) {
    const a = f.armas[i];
    const def = ARMAS[a.id];
    const p = situar();
    dibujarIconoArma(ctx, p.x, p.y, RADIO_ICONO, a.id, def ? def.color : '#ccc');
    if (a.nivel > 1) insignia(ctx, p.x + RADIO_ICONO - 1, p.y + RADIO_ICONO - 2, a.nivel);
  }
  for (let i = 0; i < idsPasivos.length; i++, k++) {
    const p = situar();
    dibujarIconoPasivo(ctx, p.x, p.y, RADIO_ICONO, idsPasivos[i], '#9fd0e8');
    const nivel = f.pasivos[idsPasivos[i]];
    if (nivel > 1) insignia(ctx, p.x + RADIO_ICONO - 1, p.y + RADIO_ICONO - 2, nivel);
  }
}

// Nivel del arma, pegado a su icono. Con reborde y no con caja: una caja por
// icono, con dieciséis iconos, es más caja que arsenal.
function insignia(ctx, x, y, nivel) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 9px ${FUENTE}`;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(6,5,10,.95)';
  ctx.strokeText(String(nivel), x, y);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(nivel), x, y);
}
