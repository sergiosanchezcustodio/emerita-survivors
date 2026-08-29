import { ANCHO_UI, ALTO_UI, ANCHO_FISICO, ALTO_FISICO } from '../core/constantes.js';
import { FUENTE, FUENTE_TITULO, textoEspaciado, Capa } from './capa.js';
import { Tema, panel } from './tema.js';
import { Recursos } from '../core/recursos.js';
import { MetaProgreso } from '../core/metaProgreso.js';
import { MASCOTAS } from '../datos/mascotas.js';
import { POTENCIADORES } from '../datos/potenciadores.js';
import { fondoTitulo } from './pantallas.js';

// LAS TRES PARTIDAS. Se elige una antes de llegar al menú principal, y desde
// aquí se borra la que no se quiera.
//
// POR QUÉ VA ANTES DEL MENÚ Y NO DENTRO. La tienda gasta denarios, las mascotas
// se compran con denarios y el contador de denarios sale en la esquina de TODAS
// las pantallas de menú. Todo eso pertenece a una partida concreta, así que si
// se eligiera después —al pulsar JUGAR, por ejemplo— entrar a la tienda desde
// el menú no sabría de qué hucha está gastando.
//
// Y BORRAR VIVE AQUÍ. Antes era un botón en la esquina del título que decía
// "EMPEZAR DE CERO" y se llevaba por delante todo lo guardado. Con tres
// partidas eso deja de tener sentido: lo que se borra es UNA, y el sitio donde
// eso se entiende es la pantalla donde se ven las tres.
//
// Ese botón de la esquina no desaparece: pasa a ser "CAMBIAR PARTIDA", que es
// como se vuelve aquí sin reiniciar el juego. Se puede porque ese botón lo
// dibuja el código y no está pintado en la ilustración del menú, al revés que
// las cuatro opciones de la lápida.

const FILA_ALTO = 92;
const FILA_HUECO = 14;
const FILA_ANCHO = 430;

// LA FILA DE GITHUB, más baja que una partida a propósito: no lleva
// estadísticas, solo una frase y un estado. Ponerla del mismo alto que una
// partida la haría pesar tanto como ellas, y no es una partida más, es una
// forma de encontrarlas.
const FILA_GITHUB_ALTO = 40;

// EL BOTÓN DE BORRAR, a la derecha de su partida y solo si esa partida existe.
//
// Va fuera del panel de la fila y no dentro, porque no es un dato más de la
// partida: es otra cosa que se puede hacer con ella. Y solo aparece cuando hay
// algo que borrar — un botón que no hace nada en una fila vacía es un botón que
// enseña a no fiarse de los botones.
const BORRAR_ANCHO = 78;
const BORRAR_ALTO = 34;
const BORRAR_HUECO = 10;
const COLOR_PELIGRO = '#e8907c';
const COLOR_ORO = '#e8b73a';

// EL NOMBRE DE LA PARTIDA, en la romana del juego y en el naranja de las
// antorchas: es el rótulo de la fila y tiene que leerse antes que los números.
const COLOR_PARTIDA = '#e8964a';

// EL AZUL DE LOS VALORES, y por qué NO es azul oscuro.
//
// Sergio lo pidió azul oscuro en negrita. Medido sobre la piedra del panel
// —que va de #26282d a #16181b—, un azul marino de verdad no se ve: #001f4d da
// 1,10 de contraste y #12306b da 1,41, cuando el mínimo legible son 4,5. Ni
// siquiera un azul medio como #2f5fb8 llega (2,92).
//
// Este es el azul MÁS OSCURO que se sostiene sobre ese fondo: 4,91. Sigue
// leyéndose como azul frente al oro y al hueso del resto de la pantalla, que es
// lo que se buscaba. Si algún día el panel se aclara, aquí se puede oscurecer.
const COLOR_VALOR = '#4d86e0';

// Lado de la moneda que sustituye al rótulo "DENARIOS".
const LADO_MONEDA = 15;

// Segundos a "mm:ss". El tiempo total puede pasar de la hora, así que ahí sí
// hace falta la hora delante; el de una partida nunca, porque la partida dura
// treinta minutos.
function reloj(segundos) {
  const s = Math.max(0, Math.round(segundos));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  const dos = (n) => (n < 10 ? '0' + n : String(n));
  return h > 0 ? `${h}:${dos(m)}:${dos(seg)}` : `${m}:${dos(seg)}`;
}

// Los tres resúmenes, LEÍDOS UNA VEZ y no en cada fotograma.
//
// Cada `resumen` es un `localStorage.getItem` más un `JSON.parse`, y dibujar
// llamándolos serían ciento ochenta lecturas por segundo para tres datos que
// solo cambian cuando se borra una partida. localStorage además es síncrono:
// no es coste que se pueda dejar corriendo en un bucle de dibujo.
let cache = null;

// La llama main.js al entrar en la pantalla y después de borrar, que son los
// dos únicos momentos en que lo de dentro puede haber cambiado.
export function refrescarHuecos() {
  cache = [];
  for (let i = 0; i < MetaProgreso.NUM_HUECOS; i++) cache.push(MetaProgreso.resumen(i));
}

export function dibujarHuecos(ctxMundo, ctx, cursor, enBorrar, nube, enGithub) {
  if (!cache) refrescarHuecos();
  const t = Tema.actual;

  // La ilustración del menú de fondo, con un velo: esta pantalla es antesala
  // del menú, no otro sitio.
  fondoTitulo(ctxMundo);
  ctxMundo.setTransform(1, 0, 0, 1, 0, 0);
  ctxMundo.fillStyle = 'rgba(6,6,12,.82)';
  ctxMundo.fillRect(0, 0, ANCHO_FISICO, ALTO_FISICO);

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.font = `22px ${FUENTE_TITULO}`;
  ctx.fillStyle = t.titulo;
  textoEspaciado(ctx, 'ELIGE TU PARTIDA', ANCHO_UI / 2, 52, 4);

  const filasPartidas = MetaProgreso.NUM_HUECOS * FILA_ALTO +
                        (MetaProgreso.NUM_HUECOS - 1) * FILA_HUECO;
  // LA FILA DE GITHUB CUENTA EN EL HUECO SOLO SI LA NUBE ESTÁ ENCENDIDA. Con
  // la nube apagada esta pantalla se ve exactamente como antes de que
  // existiera el login: no hay nada que conectar, así que no hay fila.
  const total = nube ? filasPartidas + FILA_GITHUB_ALTO + FILA_HUECO : filasPartidas;

  // Centrado en lo que queda por debajo del rótulo. Antes reservaba sitio abajo
  // para el pie de atajos; sin pie, esa reserva dejaba las tres filas altas.
  const ARRIBA = 76, ABAJO = 24;
  let y = ARRIBA + (ALTO_UI - ARRIBA - ABAJO - total) / 2;
  // LAS FILAS SE CENTRAN EN EL EJE DE LA PANTALLA, el mismo del rótulo de
  // arriba, y el botón de borrar CUELGA a su derecha sin entrar en la cuenta.
  //
  // Antes se centraba el conjunto —fila más botón— y el resultado era que las
  // tres partidas quedaban escoradas a la izquierda respecto al título, que es
  // lo único con lo que se comparan de un vistazo. El botón tiene sitio de
  // sobra: la fila acaba en 695 y él ocupa hasta 783 de los 960.
  const x = (ANCHO_UI - FILA_ANCHO) / 2;

  // LA FILA DE GITHUB, ARRIBA DE LAS TRES PARTIDAS. Antes esto era una línea
  // de 12px en el pie de la pantalla —"G con GitHub"— y ahí no la veía nadie
  // que no leyera el pie: la prueba de que esto hacía falta es que Sergio
  // mismo la usó por primera vez sin darse cuenta bien de qué hacía. Va
  // ANTES de las partidas y no dentro de ellas: conectar con GitHub decide
  // QUÉ partidas vas a ver, así que tiene que pasar primero, no ser una nota
  // al pie de la que ya estás mirando.
  if (nube) {
    filaGithub(ctx, x, y, nube, !!enGithub, t);
    y += FILA_GITHUB_ALTO + FILA_HUECO;
  }

  for (let i = 0; i < MetaProgreso.NUM_HUECOS; i++) {
    // DOS COSAS DISTINTAS, y confundirlas era un fallo: `actual` es la fila en
    // la que está el jugador, y `elegida` es que además el cursor esté sobre la
    // fila y no sobre su botón de borrar. Antes se pasaba solo lo segundo, así
    // que al irse a BORRAR la fila perdía TODO el resaltado y ya no se veía de
    // cuál era ese botón.
    const actual = !enGithub && i === cursor;
    fila(ctx, x, y, i, cache[i], actual, actual && !enBorrar, t);
    if (cache[i]) {
      ctx.save();
      if (!actual) ctx.globalAlpha = APAGADO_OTRAS;
      botonBorrar(ctx, x + FILA_ANCHO + BORRAR_HUECO, y + (FILA_ALTO - BORRAR_ALTO) / 2,
                  actual && enBorrar, t);
      ctx.restore();
    }
    y += FILA_ALTO + FILA_HUECO;
  }

  // SOLO EL CÓDIGO EN CRUDO, al pie y en pequeño. La conexión con GitHub ya
  // tiene su fila arriba, bien a la vista; esto es lo que queda para quien
  // prefiere copiar y pegar el código a mano, que sigue funcionando igual.
  if (nube) {
    const abajo = ALTO_UI - Math.max(0, (ALTO_UI - Capa.altoVisible) / 2) - 18;
    ctx.font = `12px ${FUENTE}`;
    ctx.fillStyle = t.apagado;
    ctx.fillText(`Tu código de partida:  ${nube.codigo}    ·    C copiar    ·    V traer otra`,
                 ANCHO_UI / 2, abajo);
    if (nube.aviso) {
      ctx.font = `13px ${FUENTE}`;
      ctx.fillStyle = '#ffd27a';
      ctx.fillText(nube.aviso, ANCHO_UI / 2, abajo - 20);
    }
  }
  ctx.restore();
}

// EL RESALTADO SE APOYA EN TRES COSAS A LA VEZ, y hacen falta las tres.
//
// La primera versión solo sumaba un velo de luz al 6% sobre la fila elegida, y
// entre tres paneles iguales eso no se ve: el ojo compara, y si las tres están
// igual de encendidas no hay nada que comparar.
//
//   1. LAS OTRAS SE APAGAN. Es lo que más hace, y es gratis: bajar las que no
//      son deja sola a la que sí, sin tener que gritar con la elegida.
//   2. Y el velo de luz, ahora al doble, más un filo dorado alrededor, del
//      MISMO grosor por los cuatro lados.
//
// Llegó a llevar además una barra de oro pegada al canto izquierdo —el gesto de
// "estás aquí" de cualquier lista— y se quitó: dejaba ese lado mucho más gordo
// que los otros tres y el recuadro se leía torcido en vez de resaltado.
//
// Con el cursor sobre el botón de BORRAR la fila conserva la barra y el filo
// pero a media intensidad: sigue diciendo de quién es ese botón sin robarle la
// atención al botón.
const APAGADO_OTRAS = 0.42;

function fila(ctx, x, y, indice, res, actual, elegida, t) {
  ctx.save();
  if (!actual) ctx.globalAlpha = APAGADO_OTRAS;

  panel(ctx, x, y, FILA_ANCHO, FILA_ALTO, actual ? t.filo : 'rgba(255,255,255,.10)');

  if (actual) {
    const fuerza = elegida ? 1 : 0.5;

    // Velo de luz: sumando sobre la piedra, como el recuadro del menú del
    // título. Un relleno opaco se leería como un parche.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.13 * fuerza;
    ctx.fillStyle = '#ffd9a0';
    ctx.fillRect(x, y, FILA_ANCHO, FILA_ALTO);
    ctx.restore();

    // Filo dorado, por dentro del borde del panel para no comérselo.
    ctx.save();
    ctx.globalAlpha = 0.85 * fuerza;
    ctx.strokeStyle = COLOR_ORO;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.75, y + 0.75, FILA_ANCHO - 1.5, FILA_ALTO - 1.5);
    ctx.restore();
  }

  const izq = x + 22;
  ctx.textAlign = 'left';

  ctx.font = `600 15px ${FUENTE_TITULO}`;
  ctx.fillStyle = COLOR_PARTIDA;
  textoEspaciado(ctx, 'PARTIDA ' + (indice + 1), izq, y + 22, 3);

  if (!res) {
    ctx.font = `italic 12px ${FUENTE}`;
    ctx.fillStyle = t.apagado;
    ctx.fillText('Vacía — empieza aquí', izq, y + FILA_ALTO / 2 + 12);
    ctx.textAlign = 'center';
    ctx.restore();
    return;
  }

  // Los denarios, grandes y a la derecha: es el número por el que se reconoce
  // una partida propia antes que por ningún otro. Y con LA MONEDA a su derecha
  // en vez del rótulo "DENARIOS" debajo: el dibujo dice de qué es la cifra sin
  // gastar un renglón, que es justo lo que hace el contador del menú.
  const derecha = x + FILA_ANCHO - 22;
  moneda(ctx, derecha - LADO_MONEDA / 2, y + 26);
  ctx.textAlign = 'right';
  ctx.font = `600 20px ${FUENTE_TITULO}`;
  ctx.fillStyle = COLOR_ORO;
  ctx.fillText(String(res.denarios), derecha - LADO_MONEDA - 7, y + 26);

  // Y debajo, dos renglones de etiqueta + valor. El valor va en azul y en
  // negrita para que la vista salte de cifra en cifra sin leerse las etiquetas.
  const nMascotas = Object.keys(MASCOTAS).length;
  const nPot = Object.keys(POTENCIADORES).length;
  const nFases = 1;              // niveles que existen hoy: solo Mérida

  parejas(ctx, izq, y + 50, t, [
    ['Mascotas', `${res.mascotas}/${nMascotas}`],
    ['Potenciadores', `${res.potenciadores}/${nPot}`]
  ]);
  parejas(ctx, izq, y + 71, t, [
    ['Partidas', String(res.partidas)],
    ['Fases superadas', `${res.fases}/${nFases}`],
    ['Tiempo jugado', reloj(res.tiempoTotal)]
  ]);

  ctx.textAlign = 'center';
  ctx.restore();
}

// LA FILA DE GITHUB: conectar, o decir con quién ya se está. Mismo lenguaje
// visual que una fila de partida —panel, velo dorado y filo si está
// elegida— pero con una sola línea centrada: aquí no hay estadísticas que
// enseñar, solo un estado y una acción.
function filaGithub(ctx, x, y, nube, elegida, t) {
  ctx.save();

  panel(ctx, x, y, FILA_ANCHO, FILA_GITHUB_ALTO, elegida ? t.filo : 'rgba(255,255,255,.10)');

  if (elegida) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.13;
    ctx.fillStyle = '#ffd9a0';
    ctx.fillRect(x, y, FILA_ANCHO, FILA_GITHUB_ALTO);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = COLOR_ORO;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.75, y + 0.75, FILA_ANCHO - 1.5, FILA_GITHUB_ALTO - 1.5);
    ctx.restore();
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cy = y + FILA_GITHUB_ALTO / 2;
  ctx.font = `600 13px ${FUENTE}`;

  if (nube.login) {
    ctx.fillStyle = COLOR_ORO;
    ctx.fillText(`Conectado con GitHub como @${nube.login}`, x + FILA_ANCHO / 2, cy);
  } else {
    ctx.fillStyle = elegida ? t.titulo : t.texto;
    ctx.fillText('Conectar con GitHub, para recordar tu código', x + FILA_ANCHO / 2, cy);
  }

  ctx.restore();
}

// Una fila de "etiqueta valor  etiqueta valor", con las etiquetas apagadas y
// los valores en azul y negrita. Se van encadenando midiendo lo ya escrito: son
// dos o tres parejas por renglón, no una tabla, y una rejilla de columnas fijas
// dejaría huecos raros entre unas y otras.
function parejas(ctx, x, y, t, lista) {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  let cx = x;
  for (let i = 0; i < lista.length; i++) {
    ctx.font = `11px ${FUENTE}`;
    ctx.fillStyle = t.apagado;
    ctx.fillText(lista[i][0], cx, y);
    cx += ctx.measureText(lista[i][0]).width + 6;

    ctx.font = `700 11px ${FUENTE}`;
    ctx.fillStyle = COLOR_VALOR;
    ctx.fillText(lista[i][1], cx, y);
    cx += ctx.measureText(lista[i][1]).width + 18;
  }
}

// La moneda del contador, la misma que sale en el menú. Sin ella cargada, un
// disco: sin moneda, el número no dice de qué es.
function moneda(ctx, cx, cy) {
  const meta = Recursos.meta('monedaHud');
  const img = Recursos.imagen('monedaHud');
  if (meta && img) {
    const esc = Math.min(LADO_MONEDA / meta.w, LADO_MONEDA / meta.h);
    const w = meta.w * esc, h = meta.h * esc;
    ctx.drawImage(img, 0, 0, meta.w, meta.h, cx - w / 2, cy - h / 2, w, h);
    return;
  }
  ctx.beginPath();
  ctx.arc(cx, cy, LADO_MONEDA / 2, 0, Math.PI * 2);
  ctx.fillStyle = COLOR_ORO;
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(20,14,4,.65)';
  ctx.stroke();
}

function botonBorrar(ctx, x, y, elegido, t) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, BORRAR_ANCHO, BORRAR_ALTO, 5);
  if (elegido) {
    ctx.fillStyle = 'rgba(64,20,18,.9)';
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = COLOR_PELIGRO;
  } else {
    ctx.fillStyle = 'rgba(10,8,12,.55)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(232,144,124,.30)';
  }
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 11px ${FUENTE}`;
  ctx.fillStyle = elegido ? '#ffd9d0' : 'rgba(232,144,124,.7)';
  ctx.fillText('BORRAR', x + BORRAR_ANCHO / 2, y + BORRAR_ALTO / 2 + 0.5);
  ctx.restore();
  void t;
}

// ¿Tiene datos ese hueco? Lo pregunta main.js para decidir si el cursor puede
// irse a la derecha, y sale del MISMO cache que se dibuja: preguntárselo a
// localStorage en cada pulsación de flecha sería releer y reparsear por nada.
export function huecoOcupado(indice) {
  if (!cache) refrescarHuecos();
  return !!cache[indice];
}

// El aviso de borrar, con el número de la partida dentro. Que diga CUÁL se va a
// borrar no es un detalle de estilo: es lo único que separa "borro la que no
// uso" de "borro la buena".
export function textoBorrado(indice) {
  return {
    titulo: `¿BORRAR LA PARTIDA ${indice + 1}?`,
    lineas: [
      'Se pierden sus denarios, sus mejoras y sus mascotas.',
      'Las otras dos partidas no se tocan.'
    ]
  };
}
