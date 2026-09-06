import { ANCHO_FISICO, ALTO_FISICO } from '../core/constantes.js';
import { FUENTE_TITULO, FUENTE_RELATO, textoEspaciado } from './capa.js';
import { fondoTitulo } from './pantallas.js';

// EL MOTOR DEL RELATO: un texto que sube por el hueco de una placa de piedra.
//
// Estaba dentro de ui/intro.js, que era el único sitio donde se contaba algo.
// Ahora hay dos: la intro presenta EL JUEGO, y cada nivel cuenta SU historia
// antes de empezar (ver ui/historia.js). Las dos pantallas son la misma placa
// con otro guion, así que lo que se saca aquí es todo salvo el guion.
//
// EL RELATO NO VA EN PERSPECTIVA. La primera versión era un rótulo estilo Star
// Wars, con el texto alejándose hacia un horizonte, y se cambió por texto PLANO
// que sube sin encoger. La perspectiva tenía sentido sobre un cielo abierto;
// dentro del hueco rectangular de una placa, el texto que mengua hacia el fondo
// pelea con el marco en vez de acompañarlo — y además obligaba a leer lo que
// venía cada vez más pequeño. Lo que queda es más simple y se lee mejor: entra
// por abajo, sube a tamaño constante y sale por arriba.
//
// EN DOS LIENZOS, como el resto de la interfaz (ver ui/capa.js): las
// ilustraciones van al lienzo del MUNDO y TODO el texto a la capa de interfaz,
// que va a la resolución real del monitor.

// EL RITMO: cada cuántos segundos asoma un renglón nuevo por abajo.
//
// Es el único número que gobierna la velocidad, y se expresa así —y no como una
// duración total— porque es lo que de verdad se percibe. Reescribir el guion
// cambia lo que dura la pantalla, no el ritmo al que se lee, que es justo lo
// que hay que conservar.
//
// Ojo con confundirlo con el tiempo de lectura: un renglón tarda 1,4 s en
// aparecer detrás del anterior, pero se pasa DOCE SEGUNDOS cruzando el hueco de
// la placa antes de salir por arriba. Tiempo para leerlo sobra.
const SEGUNDOS_POR_LINEA = 1.4;

// EL FINAL, en dos tiempos. Cuando el último renglón sale por arriba la placa
// se queda un rato vacía —ESPERA— y solo después empieza el fundido. Sin esa
// espera, el negro pisa la última frase justo cuando se acaba de leer, y lo que
// queda es sensación de prisa.
export const ESPERA = 2;
export const FUNDIDO = 1.5;

// Entrada desde el negro que deja la pantalla anterior. Es la contrapartida del
// fundido de salida: si una se apaga y la siguiente aparece de golpe, el corte
// se nota más que si no hubiera fundido ninguno.
export const ENTRADA = 0.6;

const ORO = '#e8b73a';
const ORO_CLARO = '#f7dc9a';

// --- El hueco de la placa ----------------------------------------------------
//
// Medido sobre la ilustración recorriendo desde el centro hacia fuera hasta
// salir de lo oscuro, y quedándose con la MAYOR extensión que contiene al
// centro: los lazos de la bandera cruzan el panel, así que una sola fila o una
// sola columna se corta contra un lazo y devuelve un hueco más pequeño que el
// que hay.
//
// LO QUE HAY QUE MEDIR NO ES EL AGUJERO, ES LA BANDA LIMPIA, y esto costó una
// captura con el relato montado encima de un lazo.
//
// La primera medida cogió la mayor extensión oscura que contiene al centro y
// dio y=156..726 en píxeles: 90 a 417 en unidades. Con esos números el texto
// bajaba hasta el lazo de abajo y se leía por encima de la tricolor. El barrido
// se había colado POR el lazo, que también tiene partes oscuras.
//
// Lo que vale es dónde cabe una línea CENTRADA sin tocar nada, y eso se saca
// mirando el hueco de cinco columnas del centro a la vez y quedándose con lo
// común a las cinco: y=287..661 en píxeles de la lámina (1672x941), o sea
// 165..379 en unidades.
//
// A lo ancho manda el mismo criterio de siempre —el texto va centrado en el
// hueco— y la placa tiene su centro en 481.
const PANEL = { x0: 241, x1: 721, y0: 165, y1: 379 };
const PANEL_CX = (PANEL.x0 + PANEL.x1) / 2;

// Aire entre la piedra y el texto, para que el relato no roce el labrado.
const MARGEN = 10;

// Ancho de la columna de texto. El hueco de la placa mide 480, así que quedan
// diez unidades de respiro a cada lado.
const ANCHO_TEXTO = 460;

// Y un pelo más de guarda para el AJUSTE A LO ANCHO (ver `escalaQueEntra`): si
// se apurara hasta el borde exacto, un carácter con un adorno que se salga de
// su caja tocaría el canto del lienzo.
const GUARDA = 8;

// Por dónde entra y sale el texto. Un corte limpio contra el borde del hueco
// partiría las letras por la mitad; con este desvanecido, el renglón asoma y se
// apaga como si la piedra tuviera sombra en los bordes.
const DESVANECE = 26;

// Alto de las tiras en que se dibuja el texto. Al no haber perspectiva no hacen
// falta para deformar nada: son solo para que el desvanecido de los bordes
// pueda variar de una a otra.
const PASO = 2;

// El texto se traza al doble para que al pasarlo a pantalla siga estando fino.
const RES = 2;

// --- Cuerpos de letra, en unidades de interfaz -------------------------------
//
// Sin perspectiva, lo que se escribe aquí es LO QUE SE VE: un cuerpo de 19 se
// dibuja de 19 unidades de alto, siempre, esté el renglón donde esté.
//
// Son un tope, no una promesa: si la fuente que le toque a la máquina mide más
// de la cuenta, `escalaQueEntra` los baja hasta que el renglón entre.
const CUERPO = 19, SALTO = 27;
const CUERPO_TITULAR = 32, SALTO_TITULAR = 44;
const CUERPO_ANTE = 14, SALTO_ANTE = 24;
const SALTO_BLANCO = 15;

// Separación entre letras del titular y del antetítulo. Una inscripción romana
// va espaciada; un párrafo no.
const ESPACIADO_TITULAR = 3;
const ESPACIADO_ANTE = 6;

// UN RELATO PREPARADO: el guion ya trazado en su lienzo, con lo que tarda en
// cruzar la placa entera.
//
// El guion son líneas PARTIDAS A MANO, no envueltas por `envolverTexto`: en un
// texto que se lee renglón a renglón según entra, el corte de cada línea es
// parte del ritmo, y un reparto automático deja líneas viudas de dos palabras
// justo donde más se ven. Una cadena vacía es un renglón en blanco.
//
// Los prefijos: '#' es el titular y '@' el antetítulo. Un carácter en vez de
// una estructura con tipos porque son dos casos y solo se usan aquí.
//
// Se prepara UNA VEZ por guion. Lo que cambia cada fotograma es por dónde se
// corta el lienzo, no lo que pone.
export function prepararRelato(guion) {
  const ancho = ANCHO_TEXTO * RES;

  // Primero se suma el alto, para saber de qué tamaño hace falta el lienzo. No
  // hace falta medir con el contexto: el alto de cada renglón lo fija su tipo
  // de línea, no lo que ponga en ella.
  let alto = 0;
  for (let i = 0; i < guion.length; i++) alto += altoLinea(guion[i]);

  const c = document.createElement('canvas');
  c.width = ancho;
  c.height = Math.ceil(alto * RES) + 40;
  const ctx = c.getContext('2d');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // AJUSTE A LO ANCHO, antes de trazar nada.
  //
  // Hace falta porque el cuerpo de letra que se escribe aquí no dice cuánto va
  // a MEDIR la línea: eso lo decide la fuente que tenga la máquina. Trajan Pro
  // no está instalada en casi ningún sitio, así que el titular cae en la
  // primera de repuesto, y las de repuesto no miden todas igual — medidas
  // sobre el guion de la intro, Georgia pide un 14% más de ancho que Palatino.
  //
  // Sin esto, "LA HORDA DE EMERITA" a cuerpo 32 pedía 1378 píxeles de los 860
  // que había, y se dibujaba centrada: se perdían la L del principio y la A del
  // final. Los párrafos también se salían, solo que se notaba menos.
  //
  // Se calcula UN factor por tipo de renglón, no uno por línea: encoger solo la
  // frase larga dejaría un párrafo con dos tamaños distintos, que se lee como
  // un error de maquetación.
  const cabe = ancho - GUARDA * RES;
  const escTitular = escalaQueEntra(ctx, guion, cabe, '#');
  const escAnte = escalaQueEntra(ctx, guion, cabe, '@');
  const escCuerpo = escalaQueEntra(ctx, guion, cabe, '');

  let y = 0;
  for (let i = 0; i < guion.length; i++) {
    const linea = guion[i];
    const salto = altoLinea(linea);
    if (linea.length > 0) {
      // La base del renglón, no su borde de arriba: por eso el 0,78.
      const base = (y + salto * 0.78) * RES;
      if (linea[0] === '#') {
        // El titular SÍ va en la romana capital: dos palabras en versales son
        // una inscripción, que es exactamente lo que pide una placa de piedra.
        ctx.font = fuente('#', escTitular);
        ctx.fillStyle = ORO_CLARO;
        textoEspaciado(ctx, linea.slice(1), ancho / 2, base,
                       ESPACIADO_TITULAR * escTitular * RES);
      } else if (linea[0] === '@') {
        ctx.font = fuente('@', escAnte);
        ctx.fillStyle = ORO;
        textoEspaciado(ctx, linea.slice(1), ancho / 2, base,
                       ESPACIADO_ANTE * escAnte * RES);
      } else {
        ctx.font = fuente('', escCuerpo);
        ctx.fillStyle = ORO;
        ctx.fillText(linea, ancho / 2, base);
      }
    }
    y += salto;
  }

  // Velocidad: la que hace que asome un renglón cada SEGUNDOS_POR_LINEA.
  const velocidad = SALTO / SEGUNDOS_POR_LINEA;
  // Y la duración: lo que tarda el guion entero en cruzar el hueco de punta a
  // punta —su propio alto MÁS el alto del hueco, porque el primer renglón
  // todavía tiene que subirlo entero—, la espera con la placa ya vacía y el
  // fundido.
  const util = (PANEL.y1 - MARGEN) - (PANEL.y0 + MARGEN);
  const duracion = (y + util) / velocidad + ESPERA + FUNDIDO;

  return { texto: c, altoTexto: y, velocidad, duracion };
}

// El texto sube a TAMAÑO CONSTANTE. Se dibuja en tiras horizontales, pero al
// revés que en la versión en perspectiva: aquí todas las tiras miden lo mismo y
// van a escala 1:1, y lo único que cambia de una a otra es la opacidad cerca de
// los bordes del hueco.
export function dibujarRelato(ctx, relato, reloj) {
  if (!relato || !relato.texto) return;
  const arriba = PANEL.y0 + MARGEN;
  const abajo = PANEL.y1 - MARGEN;

  // Dónde cae la primera fila del texto: pegada al borde de abajo al empezar, y
  // subiendo a partir de ahí.
  const origen = abajo - reloj * relato.velocidad;
  const x = PANEL_CX - ANCHO_TEXTO / 2;

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  for (let y = arriba; y < abajo; y += PASO) {
    const alto = Math.min(PASO, abajo - y);
    const fila = y - origen;
    if (fila < 0 || fila + alto > relato.altoTexto) continue;

    const borde = Math.min(y - arriba, abajo - y);
    const a = Math.max(0, Math.min(1, borde / DESVANECE));
    if (a <= 0.01) continue;

    ctx.globalAlpha = a;
    ctx.drawImage(relato.texto,
                  0, fila * RES, relato.texto.width, alto * RES,
                  x, y, ANCHO_TEXTO, alto);
  }

  ctx.restore();
}

// La fuente de un tipo de renglón a una escala dada. En un solo sitio, porque
// el ajuste tiene que medir con EXACTAMENTE la misma fuente con la que después
// se traza; si se escribieran en dos sitios, un día dejarían de coincidir y la
// medida mentiría.
function fuente(tipo, esc) {
  if (tipo === '#') return '700 ' + (CUERPO_TITULAR * esc * RES).toFixed(2) + 'px ' + FUENTE_TITULO;
  if (tipo === '@') return '600 ' + (CUERPO_ANTE * esc * RES).toFixed(2) + 'px ' + FUENTE_TITULO;
  return (CUERPO * esc * RES).toFixed(2) + 'px ' + FUENTE_RELATO;
}

// Cuánto hay que encoger un tipo de renglón para que el más largo de los suyos
// entre en la columna. Devuelve 1 si ya entran todos, que es el caso normal.
//
// El ancho crece proporcional al cuerpo, así que basta medir una vez al tamaño
// nominal y dividir: no hace falta probar tamaños uno a uno.
function escalaQueEntra(ctx, guion, cabe, tipo) {
  let peor = 0;
  for (let i = 0; i < guion.length; i++) {
    const linea = guion[i];
    if (linea.length === 0) continue;
    const suyo = (linea[0] === '#' || linea[0] === '@') ? linea[0] : '';
    if (suyo !== tipo) continue;
    ctx.font = fuente(tipo, 1);
    const w = tipo === ''
      ? ctx.measureText(linea).width
      : anchoEspaciado(ctx, linea.slice(1), espaciadoDe(tipo) * RES);
    if (w > peor) peor = w;
  }
  return peor > cabe ? cabe / peor : 1;
}

function espaciadoDe(tipo) {
  return tipo === '#' ? ESPACIADO_TITULAR : ESPACIADO_ANTE;
}

// Lo que va a ocupar `textoEspaciado`, sin dibujar nada. Repite su cuenta letra
// a letra a propósito: medir la cadena entera daría OTRO número, porque el
// navegador aplica kerning entre pares y el trazado letra a letra no.
function anchoEspaciado(ctx, txt, extra) {
  const letras = [...txt];
  if (letras.length === 0) return 0;
  let total = 0;
  for (let i = 0; i < letras.length; i++) total += ctx.measureText(letras[i]).width + extra;
  return total - extra;
}

function altoLinea(linea) {
  if (linea.length === 0) return SALTO_BLANCO;
  if (linea[0] === '#') return SALTO_TITULAR;
  if (linea[0] === '@') return SALTO_ANTE;
  return SALTO;
}

// --- Las ilustraciones -------------------------------------------------------
//
// Se hornean UNA VEZ al tamaño de la pantalla. Sin hornear, cada fotograma
// repetiría un reescalado con suavizado alto para una imagen que no cambia
// nunca — la misma lección que el fondo del título (ver tituloVivo.js).
//
// `estirar` decide qué hacer con la diferencia de proporción, y las dos piden
// cosas distintas:
//
//   - EL SPLASH se estira a 1920x1080. Mide 1672x941, que es 16:9 salvo por un
//     0,06%: la deformación es invisible y así llena la pantalla.
//   - LA PLACA DE LA HISTORIA va por el otro camino: se encaja ENTERA a lo alto
//     y lo que sobre a los lados se rellena con la propia imagen estirada y
//     apagada por detrás. Es un MARCO, y a un marco cortarle los bordes es
//     quitarle lo que es; y las bandas negras, en una pantalla de presentación,
//     se leen como que algo ha fallado.
//
//     Hoy da igual cuál de los dos se use —la placa también es 1672x941, así
//     que encajarla a lo alto la deja llenando la pantalla y el telón de detrás
//     no se ve—, pero la placa anterior era 1248x832, o sea 3:2 contra 16:9, y
//     estirarla un 18% ensanchaba las calaveras y las cintas. El camino se
//     queda puesto por eso: la próxima placa puede volver a no ser 16:9, y esto
//     lo aguanta sin tocar nada.
export function hornearPantalla(img, estirar) {
  const c = document.createElement('canvas');
  c.width = ANCHO_FISICO;
  c.height = ALTO_FISICO;
  const cx = c.getContext('2d');
  cx.imageSmoothingEnabled = true;
  cx.imageSmoothingQuality = 'high';

  if (estirar) {
    cx.drawImage(img, 0, 0, ANCHO_FISICO, ALTO_FISICO);
    return c;
  }

  // El telón: la misma imagen a todo lo ancho y apagada, solo para que los
  // lados no queden vacíos.
  cx.drawImage(img, 0, 0, ANCHO_FISICO, ALTO_FISICO);
  cx.fillStyle = 'rgba(4,3,8,0.66)';
  cx.fillRect(0, 0, ANCHO_FISICO, ALTO_FISICO);

  // Y encima el marco entero, sin recortar, centrado.
  const esc = ALTO_FISICO / img.height;
  const ancho = img.width * esc;
  cx.drawImage(img, (ANCHO_FISICO - ancho) / 2, 0, ancho, ALTO_FISICO);
  return c;
}

export function fondoPantalla(ctxMundo, horneada) {
  ctxMundo.setTransform(1, 0, 0, 1, 0, 0);
  if (horneada) {
    ctxMundo.imageSmoothingEnabled = false;
    ctxMundo.drawImage(horneada, 0, 0);
    return;
  }
  // Sin ilustración: la del título con un velo. Fea de reserva, pero arranca.
  fondoTitulo(ctxMundo);
  ctxMundo.setTransform(1, 0, 0, 1, 0, 0);
  ctxMundo.fillStyle = 'rgba(6,6,12,0.80)';
  ctxMundo.fillRect(0, 0, ANCHO_FISICO, ALTO_FISICO);
}

// El negro que entra al principio y sale al final de cada pantalla. `sobra` es
// lo que le queda de vida a la pantalla; `fundido`, cuánto de eso es apagarse.
export function velo(ctxMundo, reloj, sobra, fundido) {
  let a = 0;
  if (reloj < ENTRADA) a = 1 - reloj / ENTRADA;
  if (sobra < fundido) a = Math.max(a, Math.min(1, 1 - sobra / fundido));
  if (a <= 0.002) return;
  ctxMundo.setTransform(1, 0, 0, 1, 0, 0);
  ctxMundo.fillStyle = 'rgba(0,0,0,' + a.toFixed(3) + ')';
  ctxMundo.fillRect(0, 0, ANCHO_FISICO, ALTO_FISICO);
}
