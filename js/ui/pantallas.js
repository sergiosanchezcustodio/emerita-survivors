import { ANCHO_UI, ALTO_UI, ANCHO_FISICO } from '../core/constantes.js';
import { Recursos } from '../core/recursos.js';
import { Capa, FUENTE, FUENTE_TITULO, textoBorde, textoEspaciado } from './capa.js';
import { Tema } from './tema.js';
import { PERSONAJES, ORDEN_PERSONAJES } from '../datos/personajes.js';
import { ARMAS } from '../datos/armas.js';
import { COLOR_JUGADOR, dibujarIconoArma } from './hud.js';
import { MetaProgreso } from '../core/metaProgreso.js';
import { MASCOTAS, MAX_NIVEL_MASCOTA } from '../datos/mascotas.js';
import { TituloVivo } from './tituloVivo.js';

// Pantallas de TÍTULO y de SELECCIÓN DE PERSONAJE.
//
// Las dos se apoyan en una ilustración que ha pintado Sergio y que trae ya
// horneado casi todo: el logo, las cuatro opciones del menú, el rótulo "Elige a
// tu Héroe" y los cuatro arcos con sus personajes dentro. Aquí NO se vuelve a dibujar nada
// de eso — sería competir con el arte y perder. Lo único que se añade es lo que
// una imagen no puede tener: qué arco está elegido, de quién es cada cursor y
// qué hay que pulsar.
//
// EN DOS LIENZOS, como el resto del juego (ver ui/capa.js):
//
//   - La ilustración va en el lienzo del MUNDO, que mide 1920x1080 fijos.
//   - Los resaltados y los textos, en la CAPA DE INTERFAZ, que va a la
//     resolución real del monitor. Un "PULSA A" trazado en el lienzo del mundo
//     saldría ampliado y escalonado.
//
// Y la ilustración se dibuja CON SUAVIZADO, al revés que todo el arte del
// mundo. Es la misma decisión que el retrato de la ficha: ninguna de las dos
// imágenes encaja en 1920x1080 por un múltiplo entero —la del título pide
// 1,30x y la de selección 1,18x— así que a vecino más próximo saldrían filas de
// píxeles dobladas sí y no, que en las letras del logo se ve como un defecto.
// Son pantallas quietas: no hay hormigueo que temer, solo un pelo de blandura.

const RUTA_TITULO = 'assets/menus/titulo.jpg';

// Por dónde se recortaría la ilustración del título si hubiera que recortarla.
//
// YA NO SE RECORTA: con el dibujo nuevo, la ilustración se encaja entera a lo
// alto y los lados se rellenan por detrás (ver ui/tituloVivo.js). Recortar
// dejaba SALIR fuera de la pantalla y CONFIGURACIÓN partida por la mitad,
// porque las cuatro opciones están pintadas mucho más abajo que en el dibujo
// anterior.
//
// La constante sobrevive para el REPLIEGUE: si la imagen no carga, `cubrir` la
// sigue necesitando para pintar el fondo liso de reserva.
const ANCLA_TITULO = 0.2;
const RUTA_SELECCION = 'assets/menus/seleccion.jpg';

// Píxeles del lienzo del mundo por unidad de interfaz. Las dos rejillas cubren
// el mismo rectángulo, así que basta la proporción entre sus anchos.
const K = ANCHO_FISICO / ANCHO_UI;

// --- Medidas tomadas SOBRE las ilustraciones --------------------------------
//
// En píxeles de la imagen original, no de pantalla. Se convierten con el encaje
// que devuelve `cubrir`, así que siguen valiendo con cualquier zoom o densidad.
//
// Los cuatro arcos de la pantalla de selección están a un paso constante de
// 316,3 px medido sobre el arte; el primero, centrado en 374.
//
// RECUADRO AGRANDADO Y CORREGIDO DE SITIO. Lo vio Sergio: el marco quedaba
// estrecho para el arco que enmarca —dejaba aire de sobra a los lados dentro
// del propio arco— y encima estaba escorado a la izquierda, así que no se leía
// como "este arco" sino como "un rectángulo por aquí". El centro se va 14 a la
// derecha, el ancho crece 24 y el alto 20, repartido arriba y abajo (de ahí que
// ARCO_Y baje 10): el recuadro sigue centrado sobre el mismo arco, solo que
// ahora lo abraza.
//
// El paso entre arcos NO se toca: es la medida del arte y sigue siendo exacta.
const ARCO_X0 = 374;
const ARCO_PASO = 316.3;
const ARCO_ANCHO = 292;
const ARCO_Y = 264;
const ARCO_ALTO = 482;

// LAS CUATRO OPCIONES DEL MENÚ, medidas sobre la ilustración (Main_menu.jpg,
// 1264x842). Vienen pintadas en su marco —START, TIENDA, CONFIGURACIÓN y
// SALIR—, así que aquí NO se vuelven a escribir: lo único que falta es decir
// cuál está señalada, y eso se hace ILUMINANDO SU RECUADRO. Es el criterio de
// toda esta pantalla: no competir con el arte.
//
// LAS MEDIDAS NO VAN A OJO, y con este dibujo hubo que afinar cómo se toman.
// La versión anterior del menú tenía una placa de fondo OSCURO y bastaba con
// buscar píxeles claros; esta trae un marco CALADO, con el escenario visible
// por detrás, así que el empedrado se colaba en el recuento. Se calibró
// midiendo la luminancia máxima por fila en la banda del menú: los renglones de
// texto dan 120-141 y los huecos entre ellos 35-58, sin solape ninguno, así que
// el corte en 90 los separa limpiamente.
//
// Lo medido, en píxeles de la imagen:
//
//     START            y 641..664   x 574..692   (119 de ancho)
//     TIENDA           y 680..702   x 569..699   (131)
//     CONFIGURACIÓN    y 718..740   x 498..767   (270)
//     SALIR            y 756..778   x 583..683   (101)
//
// Las cuatro miden lo mismo de alto y van separadas 38-39.
//
// EL CENTRO ES EL DEL TEXTO, NO EL DEL MARCO. Los rieles del marco están en
// x=462 y x=814 —salen como dos picos de luz al perfilar la banda por columnas—
// así que su hueco interior va de 472 a 808 y su centro cae en 640. Pero las
// cuatro palabras están centradas en 633, siete píxeles a la izquierda. Poner
// el recuadro en el centro del marco fue justo el fallo de la primera versión
// de esta pantalla, y se notaba: sobraba margen por un lado.
const OPCION_X = 633;

// Un solo ancho para las cuatro, y lo manda la más larga: CONFIGURACIÓN mide
// 270. Con 296 quedan trece píxeles de aire a cada lado de esa palabra, y el
// recuadro sigue holgado dentro del hueco del marco (472..808).
//
// Que a SALIR —101 de ancho— le sobre sitio es deliberado: un recuadro que
// cambia de tamaño según la palabra no se lee como un cursor que se mueve, sino
// como cuatro recuadros distintos.
const OPCION_ANCHO = 296;

// Alto: 23 de texto más 10 de aire. Con 38 de separación entre renglones, deja
// cinco píxeles de hueco entre un recuadro y el siguiente — suficiente para que
// se vean como cajas separadas y no como una columna continua.
const OPCIONES_TITULO = [
  { y: 652, alto: 33 },     // START
  { y: 691, alto: 33 },     // TIENDA
  { y: 729, alto: 33 },     // CONFIGURACIÓN
  { y: 767, alto: 33 }      // SALIR
];

const Imagenes = { titulo: null, seleccion: null };

export const Pantallas = {
  // Se llama una vez al arrancar, junto al resto de recursos. Si alguna no
  // carga, la pantalla se pinta igual sobre un fondo liso: se pierde el
  // decorado, no la posibilidad de empezar una partida.
  async cargar() {
    const [t, s] = await Promise.all([
      Recursos.cargarSuelta(RUTA_TITULO),
      Recursos.cargarSuelta(RUTA_SELECCION)
    ]);
    Imagenes.titulo = t;
    Imagenes.seleccion = s;

    // La pantalla de título se hornea aquí: la ilustración escalada una sola vez
    // a su propio lienzo. A partir de ahí cada fotograma es una copia 1:1 más el
    // fuego de las antorchas (ver tituloVivo.js).
    TituloVivo.hornear(t);
  },

  titulo(ctxMundo, ctxUi, menu, cursor) { dibujarTitulo(ctxMundo, ctxUi, menu, cursor); },
  seleccion(ctxMundo, ctxUi, puestos) { dibujarSeleccion(ctxMundo, ctxUi, puestos); },
  mascotas(ctxMundo, ctxUi, disponibles, cursor, turno, puestos, elegidas) {
    dibujarMascotas(ctxMundo, ctxUi, disponibles, cursor, turno, puestos, elegidas);
  }
};

// Monedas acumuladas, arriba a la derecha. Sale en TODAS las pantallas de menú
// —título, selección de personaje, mascotas, tienda y configuración— porque es
// el número que decide si merece la pena entrar en la tienda, y eso hay que
// saberlo antes de entrar, no dentro.
//
// La moneda es el áureo de Augusto que dibujó Sergio. Antes era un círculo
// trazado con una "D" dentro, que era lo que había mientras no hubiera arte.
const COLOR_ORO = '#e8b73a';
// Medidas de la cartela de los denarios. La moneda ha bajado dos veces: de 21 a
// 17 y de 17 a 14. Al lado de una cifra de 13 es el tamaño en que acompaña sin
// competir, y es lo que le deja sitio a la cartela para rodearla entera en vez
// de que asome por arriba y por abajo.
const LADO_MONEDA = 14;
const HUECO_MONEDA = 5;      // entre la moneda y la cifra
const RELLENO_PLACA = 9;     // aire a cada lado del contenido
const ALTO_PLACA = 22;

export function dibujarOro(ctxUi, yPedida) {
  // Por defecto se aparta del borde SUPERIOR REAL, no del del lienzo: la capa
  // mide 540 de alto siempre, y si alguna vez se recorta (ver Capa.altoVisible)
  // una medida fija saldría descabezada.
  //
  // Las pantallas de tabla —tienda y configuración— pasan su propia `y` para que
  // la cartela caiga centrada en la fila de pestañas.
  const y = yPedida !== undefined
            ? yPedida
            : Math.max(20, (ALTO_UI - Capa.altoVisible) / 2 + 15);
  const cifra = String(MetaProgreso.denarios);

  ctxUi.save();
  ctxUi.textBaseline = 'middle';
  ctxUi.font = `700 13px ${FUENTE}`;

  // LA CARTELA SE MIDE DESDE DENTRO. Antes se colocaba el número contra el borde
  // de la pantalla y la cartela se estiraba hacia atrás a ojo, y de ahí venían
  // las dos cosas que no encajaban: la moneda se salía por arriba y por abajo, y
  // el conjunto quedaba descentrado dentro de su óvalo.
  //
  // Ahora se mide el contenido —moneda, hueco y cifra—, se le suma el mismo aire
  // por los cuatro lados y eso ES la cartela. Todo lo que va dentro se coloca
  // respecto a ella, así que no puede descuadrarse.
  const anchoCifra = ctxUi.measureText(cifra).width;
  const anchoContenido = LADO_MONEDA + HUECO_MONEDA + anchoCifra;
  const derecha = ANCHO_UI - 16;
  const izquierda = derecha - anchoContenido - RELLENO_PLACA * 2;

  ctxUi.beginPath();
  ctxUi.roundRect(izquierda, y - ALTO_PLACA / 2, derecha - izquierda,
                  ALTO_PLACA, ALTO_PLACA / 2);
  ctxUi.fillStyle = 'rgba(10,8,12,.62)';
  ctxUi.fill();
  ctxUi.lineWidth = 1;
  ctxUi.strokeStyle = 'rgba(232,183,58,.28)';
  ctxUi.stroke();

  // La moneda, pegada al aire de la izquierda.
  const cx = izquierda + RELLENO_PLACA + LADO_MONEDA / 2;
  const meta = Recursos.meta('monedaHud');
  const img = Recursos.imagen('monedaHud');
  if (meta && img) {
    const esc = Math.min(LADO_MONEDA / meta.w, LADO_MONEDA / meta.h);
    const w = meta.w * esc;
    const h = meta.h * esc;
    ctxUi.drawImage(img, 0, 0, meta.w, meta.h, cx - w / 2, y - h / 2, w, h);
  } else {
    // Sin el dibujo cargado, un disco. No es adorno: sin moneda, el número no
    // dice de qué es.
    ctxUi.beginPath();
    ctxUi.arc(cx, y, LADO_MONEDA / 2, 0, Math.PI * 2);
    ctxUi.fillStyle = COLOR_ORO;
    ctxUi.fill();
    ctxUi.lineWidth = 1.2;
    ctxUi.strokeStyle = 'rgba(20,14,4,.65)';
    ctxUi.stroke();
  }

  // Y la cifra, pegada al de la derecha. Sin reborde: ya tiene la cartela
  // detrás, y un reborde sobre un fondo oscuro solo engorda los palos.
  ctxUi.textAlign = 'right';
  ctxUi.fillStyle = COLOR_ORO;
  ctxUi.fillText(cifra, derecha - RELLENO_PLACA, y + 0.5);
  ctxUi.restore();
}

// --- Encaje de la ilustración -----------------------------------------------
//
// "Cubrir": se escala por el lado que se quede corto, así que la imagen llena
// la pantalla entera y lo que sobra del otro lado se sale. Nunca hay bandas
// negras, que en una pantalla de título se leen como que algo ha fallado.
//
// `anclaY` decide POR DÓNDE se recorta lo que sobra en vertical. La del título
// va anclada arriba (0) y no centrada: la ilustración es más cuadrada que la
// pantalla y le sobran 200 píxeles de alto, y recortando por el centro se
// perdía la punta de la espada y media luna del remate. Por abajo lo que sobra
// es empedrado, que no lo echa nadie de menos.
//
// Devuelve el encaje en UNIDADES DE INTERFAZ, que es donde se colocan después
// los resaltados; el lienzo del mundo solo tiene que multiplicar por K.
function cubrir(img, anclaY) {
  const esc = Math.max(ANCHO_UI / img.width, ALTO_UI / img.height);
  const ancho = img.width * esc;
  const alto = img.height * esc;
  return { esc, x: (ANCHO_UI - ancho) / 2, y: (ALTO_UI - alto) * anclaY, ancho, alto };
}

// Rectángulo de la imagen -> rectángulo en unidades de interfaz.
function enUi(e, x, y, ancho, alto) {
  return { x: e.x + x * e.esc, y: e.y + y * e.esc, w: ancho * e.esc, h: alto * e.esc };
}

function fondo(ctxMundo, img, e) {
  ctxMundo.setTransform(1, 0, 0, 1, 0, 0);
  if (!img) {
    // Sin ilustración: piedra del tema. Fea, pero jugable.
    ctxMundo.fillStyle = Tema.actual.fondoBajo;
    ctxMundo.fillRect(0, 0, ANCHO_UI * K, ALTO_UI * K);
    return;
  }
  ctxMundo.imageSmoothingEnabled = true;
  ctxMundo.imageSmoothingQuality = 'high';
  ctxMundo.drawImage(img, e.x * K, e.y * K, e.ancho * K, e.alto * K);
  ctxMundo.imageSmoothingEnabled = false;
}

// La ilustración del título, sola, para que otra pantalla la use de decorado.
// La pide la TIENDA, que desde que ocupa el lienzo entero ya no es un panel
// flotando sobre lo que hubiera detrás: sin fondo propio se quedaba sobre el
// último fotograma dibujado, que podía ser la partida anterior.
//
// Vive aquí y no en tienda.js porque el encaje de la ilustración (`cubrir`, el
// ancla vertical, el repliegue sin imagen) ya está resuelto en este módulo, y
// dos sitios calculándolo por su cuenta es la forma segura de que un día dejen
// de coincidir.
export function fondoTitulo(ctxMundo) {
  if (TituloVivo.listo()) { TituloVivo.fondo(ctxMundo); return; }
  const img = Imagenes.titulo;
  fondo(ctxMundo, img, cubrir(img || { width: ANCHO_UI, height: ALTO_UI }, ANCLA_TITULO));
}

// Latido lento para lo que pide una pulsación. Va con performance.now() y no
// con el reloj de la simulación a propósito: estas pantallas no simulan nada,
// y el criterio 10 (misma semilla, misma partida) no se toca porque aquí
// todavía no ha empezado ninguna partida.
function latido(periodo, minimo) {
  const t = (performance.now() % periodo) / periodo;
  return minimo + (1 - minimo) * (0.5 + 0.5 * Math.sin(t * Math.PI * 2));
}

// --- Título ------------------------------------------------------------------
// El menú entero viene pintado en la lápida de la ilustración. Lo único que se
// añade aquí es el recuadro encendido de la opción señalada y la línea de
// ayuda: ver OPCIONES_TITULO arriba.
function dibujarTitulo(ctxMundo, ctxUi, menu, cursor) {
  const img = Imagenes.titulo;

  // El encuadre es FIJO: la ilustración no se mueve ni un píxel (ver la cabecera
  // de tituloVivo.js). Lo único que cambia de un fotograma a otro es la luz que
  // se suma encima.
  let e;
  if (TituloVivo.listo()) {
    TituloVivo.avanzar();
    TituloVivo.fondo(ctxMundo);
    TituloVivo.efectos(ctxMundo);
    e = TituloVivo.encaje();
  } else {
    e = cubrir(img || { width: ANCHO_UI, height: ALTO_UI }, ANCLA_TITULO);
    fondo(ctxMundo, img, e);
  }

  dibujarOro(ctxUi);
  if (!img || !menu) return;

  // EL BOTÓN DE LA ESQUINA. Va con los demás en la lista del menú —se llega
  // bajando desde SALIR, porque un botón al que no se llega con el mando no es
  // un botón— pero se dibuja abajo a la derecha y aparte, que es donde lo quería
  // Sergio: borrar el progreso de todas las partidas no se pulsa por error si no
  // está donde se pulsa lo de todos los días.
  const esquina = menu.findIndex((m) => m.esquina);
  if (esquina >= 0) dibujarBotonEsquina(ctxUi, menu[esquina], cursor === esquina);
  if (cursor === esquina) return;

  const i = Math.max(0, Math.min(OPCIONES_TITULO.length - 1, cursor));
  const o = OPCIONES_TITULO[i];
  const r = enUi(e, OPCION_X - OPCION_ANCHO / 2, o.y - o.alto / 2, OPCION_ANCHO, o.alto);

  ctxUi.save();

  // EL RECUADRO ENCENDIDO. Va con 'lighter', es decir SUMANDO luz sobre la
  // piedra, no pintando un color encima: sobre una lápida gris cualquier relleno
  // opaco se lee como un parche, y sumando luz parece que la propia piedra está
  // iluminada. El latido lento es lo que hace que se vea que ESO es lo que se
  // mueve cuando cambias de opción.
  const pulso = latido(1500, 0.45);
  ctxUi.globalCompositeOperation = 'lighter';
  ctxUi.globalAlpha = 0.17 * pulso;
  ctxUi.fillStyle = '#ffd9a0';
  ctxUi.beginPath();
  ctxUi.roundRect(r.x, r.y, r.w, r.h, 6);
  ctxUi.fill();
  ctxUi.restore();

  // SIN LÍNEA DE AYUDA. La quitó Sergio y tiene razón: cuatro opciones en una
  // lápida con una de ellas encendida no necesitan que nadie explique que se
  // sube, se baja y se pulsa. Donde sí sigue estando es en las pantallas que
  // tienen atajos que no se adivinan —la tienda, la selección—.
  ctxUi.save();
  ctxUi.lineWidth = 2;
  ctxUi.strokeStyle = `rgba(255, 214, 130, ${0.55 + 0.35 * pulso})`;
  ctxUi.beginPath();
  ctxUi.roundRect(r.x, r.y, r.w, r.h, 6);
  ctxUi.stroke();
  ctxUi.restore();
}

// Botón de la esquina inferior derecha. Apagado y rojo: tiene que verse que
// está y a la vez que no es de los que se pulsan.
function dibujarBotonEsquina(ctxUi, opcion, elegido) {
  const t = Tema.actual;
  const recorte = Math.max(0, (ALTO_UI - Capa.altoVisible) / 2);
  ctxUi.save();
  ctxUi.textAlign = 'right';
  ctxUi.textBaseline = 'middle';
  ctxUi.font = `500 11px ${FUENTE}`;

  const y = ALTO_UI - recorte - 20;
  const x = ANCHO_UI - 18;
  const ancho = ctxUi.measureText(opcion.texto).width + 26;

  ctxUi.beginPath();
  ctxUi.roundRect(x - ancho, y - 11, ancho, 22, 11);
  ctxUi.fillStyle = elegido ? 'rgba(64,20,18,.9)' : 'rgba(10,8,12,.6)';
  ctxUi.fill();
  ctxUi.lineWidth = elegido ? 1.8 : 1;
  ctxUi.strokeStyle = elegido ? '#e8907c' : 'rgba(232,144,124,.35)';
  ctxUi.stroke();

  ctxUi.fillStyle = elegido ? '#ffd9d0' : 'rgba(232,144,124,.75)';
  ctxUi.fillText(opcion.texto, x - 13, y + 0.5);
  ctxUi.restore();
}

// Despedida, cuando "Salir" no ha podido cerrar la pestaña. Ver salirDelJuego()
// en main.js: el navegador solo deja cerrar ventanas que ha abierto un script.
export function dibujarDespedida(ctxUi) {
  ctxUi.save();
  ctxUi.fillStyle = 'rgba(6,5,10,.85)';
  ctxUi.fillRect(0, 0, ANCHO_UI, ALTO_UI);
  ctxUi.textAlign = 'center';
  ctxUi.textBaseline = 'middle';
  ctxUi.font = `28px ${FUENTE_TITULO}`;
  ctxUi.fillStyle = Tema.actual.titulo;
  textoEspaciado(ctxUi, 'HASTA LA PRÓXIMA', ANCHO_UI / 2, ALTO_UI / 2 - 16, 6);
  ctxUi.font = `400 12px ${FUENTE}`;
  ctxUi.fillStyle = Tema.actual.texto;
  ctxUi.fillText('Tu progreso está guardado. Ya puedes cerrar la pestaña.',
                 ANCHO_UI / 2, ALTO_UI / 2 + 18);
  ctxUi.restore();
}

// --- Selección de personaje --------------------------------------------------
//
// `puestos` es un array de MAX_JUGADORES con un hueco por control: null si ese
// jugador no se ha sumado, y si no `{ personaje, listo }`. El array lo lleva
// main.js —es estado de partida, no de dibujo— y aquí solo se pinta.
function dibujarSeleccion(ctxMundo, ctxUi, puestos) {
  const img = Imagenes.seleccion;
  const e = cubrir(img || { width: ANCHO_UI, height: ALTO_UI }, 0.5);
  fondo(ctxMundo, img, e);

  dibujarOro(ctxUi);
  const t = Tema.actual;
  ctxUi.save();

  // Primero se APAGA lo no elegido y luego se resalta lo elegido. Al revés, el
  // velo oscuro de un arco libre caería encima del marco del arco de al lado.
  for (let p = 0; p < ORDEN_PERSONAJES.length; p++) {
    if (ocupantePersonaje(puestos, p) >= 0) continue;
    const r = enUi(e, ARCO_X0 + p * ARCO_PASO - ARCO_ANCHO / 2, ARCO_Y, ARCO_ANCHO, ARCO_ALTO);
    ctxUi.fillStyle = 'rgba(6,5,10,.5)';
    ctxUi.fillRect(r.x, r.y, r.w, r.h);
  }

  for (let i = 0; i < puestos.length; i++) {
    const puesto = puestos[i];
    if (!puesto) continue;
    dibujarPuesto(ctxUi, e, i, puesto, t);
  }

  // Pie: qué se puede hacer, en UNA sola línea.
  //
  // Una sola por dos motivos. El de fondo es que dos renglones de ayuda debajo
  // de cuatro cartelas ya no son ayuda, son ruido. El práctico es que entre las
  // cartelas y el borde inferior caben unas cincuenta unidades, y el lienzo
  // mide 1080 de alto FIJOS: en una ventana más baja se recorta centrado (ver
  // ESCALA_ARTE en core/constantes.js), así que el segundo renglón sería justo
  // lo primero que dejaría de verse.
  const presentes = puestos.filter(Boolean);
  const faltan = presentes.some((p) => !p.listo);
  const hueco = presentes.length < puestos.length;
  ctxUi.textAlign = 'center';
  ctxUi.textBaseline = 'middle';
  ctxUi.font = `600 11px ${FUENTE}`;
  // Solo se dice lo que NO se adivina. Mover, confirmar y volver se dan por
  // sabidos —Sergio quitó esos renglones de todos los menús—, pero que el
  // segundo jugador entra pulsando A o Start en SU mando no hay forma de
  // deducirlo mirando la pantalla, y es justo lo que hace falta saber para que
  // el cooperativo exista.
  let pie = 'Empezando...';
  if (faltan && hueco) pie = 'A o Start en otro mando  ·  se suma un jugador';
  else if (faltan) pie = '';
  if (pie) {
    ctxUi.globalAlpha = faltan ? 0.9 : latido(700, 0.4);
    // MÁS ABAJO, hasta 20 del borde. La cartela del arma llega a 500 y con el
    // renglón donde estaba (a 44 del borde, o sea 496) se le echaba encima. Y
    // más abajo es además donde tiene que estar: es una nota al pie sobre cómo
    // se suma otro mando, no algo que compita con las cuatro cartelas.
    //
    // El renglón sigue siendo UNO, que es lo que de verdad protegía del recorte
    // de una ventana baja (ver ESCALA_ARTE en core/constantes.js).
    textoBorde(ctxUi, pie, ANCHO_UI / 2, ALTO_UI - 20, t.texto, 3.5);
  }
  ctxUi.restore();
}

// Índice del puesto que tiene cogido el personaje `p`, o -1.
export function ocupantePersonaje(puestos, p) {
  for (let i = 0; i < puestos.length; i++) {
    if (puestos[i] && puestos[i].personaje === p) return i;
  }
  return -1;
}

// Reparte un texto en UNA o DOS líneas que quepan en `ancho`, con la fuente que
// tenga puesta el contexto. Devuelve null si no hay forma, para que quien llama
// pruebe con una letra más pequeña; con `forzar`, devuelve el mejor reparto que
// haya aunque se salga.
//
// Se prueban TODOS los cortes por espacio y gana el más equilibrado, no el
// primero que quepa: el reparto codicioso deja siempre la segunda línea corta y
// eso, en cuatro cartelas alineadas, se ve como un fallo de maquetación.
//
// Aquí sí se pueden crear arrays y cadenas: esto es un MENÚ, no la partida. La
// prohibición de reservar memoria (criterio 6) vale para el bucle de juego.
function repartirDosLineas(ctxUi, texto, ancho, forzar = false) {
  if (ctxUi.measureText(texto).width <= ancho) return [texto, ''];

  const palabras = texto.split(' ');
  let mejor = -1;
  let mejorDif = Infinity;
  let respaldo = -1;
  let respaldoDif = Infinity;
  for (let i = 1; i < palabras.length; i++) {
    const a = palabras.slice(0, i).join(' ');
    const b = palabras.slice(i).join(' ');
    const wa = ctxUi.measureText(a).width;
    const wb = ctxUi.measureText(b).width;
    const dif = Math.abs(wa - wb);
    if (dif < respaldoDif) { respaldoDif = dif; respaldo = i; }
    if (wa > ancho || wb > ancho) continue;
    if (dif < mejorDif) { mejorDif = dif; mejor = i; }
  }
  if (mejor < 0) {
    if (!forzar || respaldo < 0) return null;
    mejor = respaldo;
  }
  return [palabras.slice(0, mejor).join(' '), palabras.slice(mejor).join(' ')];
}

function dibujarPuesto(ctxUi, e, indice, puesto, t) {
  const color = COLOR_JUGADOR[indice % COLOR_JUGADOR.length];
  const r = enUi(e, ARCO_X0 + puesto.personaje * ARCO_PASO - ARCO_ANCHO / 2,
                 ARCO_Y, ARCO_ANCHO, ARCO_ALTO);
  const def = PERSONAJES[ORDEN_PERSONAJES[puesto.personaje]];
  const arma = ARMAS[def.arma];
  const cx = r.x + r.w / 2;

  ctxUi.save();
  ctxUi.textAlign = 'center';
  ctxUi.textBaseline = 'middle';

  // Marco del color del jugador. Mientras elige PARPADEA y al confirmar se
  // queda fijo y más grueso: es la diferencia que hay que poder ver desde el
  // otro lado del sofá sin leer nada.
  ctxUi.globalAlpha = puesto.listo ? 1 : latido(900, 0.45);
  ctxUi.strokeStyle = color;
  ctxUi.lineWidth = puesto.listo ? 3 : 2;
  ctxUi.strokeRect(r.x, r.y, r.w, r.h);
  ctxUi.globalAlpha = 1;

  // --- QUIÉN ES: cartela de ARRIBA, sobre el arco -------------------------
  //
  // El nombre y la frase se han venido aquí desde debajo del retrato, que es lo
  // que pidió Sergio: se lee de arriba abajo —quién es, cómo es, y ya luego con
  // qué pelea—, y de paso deja la cartela de abajo entera para el arma.
  //
  // EL ALTO ESTÁ MEDIDO CONTRA EL ARTE, no elegido a ojo. Entre el pie del
  // rótulo "Elige a tu Héroe" (fila 215 de la ilustración) y la cornisa de los
  // arcos (fila 285) hay setenta filas, que en unidades de interfaz son unas
  // cuarenta y una. La cartela ocupa 34 y se cuelga a 4 del arco: así los dos
  // arcos centrales, que son los que caen bajo el rótulo, no le tapan ni una
  // letra. Crecer más obligaría a pisarlo.
  const CAJA_SUP = 34;
  const ySup = r.y - 4 - CAJA_SUP;
  cartela(ctxUi, r.x, ySup, r.w, CAJA_SUP, puesto.listo ? color : null);

  ctxUi.font = `700 12px ${FUENTE_TITULO}`;
  ctxUi.fillStyle = t.titulo;
  textoEspaciado(ctxUi, def.nombre.toUpperCase(), cx, ySup + 11, 1.5);

  // LA FRASE SE PARTE, NO SE ENCOGE HASTA DESAPARECER.
  //
  // Antes cabía siempre en UNA línea, y como las frases de Sara y de Vicky pasan
  // de noventa caracteres, la única forma de meterlas era bajar la letra hasta
  // el suelo de 6 px: se veía la frase, pero no se leía. Ahora se reparte en dos
  // renglones y solo se encoge lo justo para que los dos quepan en el ancho de
  // la cartela, que es el ancho del recuadro del jugador.
  //
  // El corte se busca lo más EQUILIBRADO posible (ver repartirDosLineas): una
  // línea larga y otra de dos palabras se lee peor que dos medias, y con cuatro
  // cartelas en fila las de renglones desiguales cantan.
  //
  // ENTRECOMILLADA. Es lo que cada personaje DICE, no una descripción escrita
  // por el juego —"Coraje y Corazón" es el lema de Eric, no una etiqueta que
  // le hayamos puesto—, y las comillas son lo que separa una cosa de la otra
  // sin gastar una línea en explicarlo. Se añaden aquí y no en
  // datos/personajes.js: los datos guardan la frase, y cómo se puntúa al
  // pintarla es decisión de quien la pinta.
  const frase = `“${def.descripcion}”`;
  const anchoDesc = r.w - 10;
  let tamDesc = 8;
  let lineas = null;
  while (tamDesc >= 6) {
    ctxUi.font = `500 ${tamDesc}px ${FUENTE}`;
    lineas = repartirDosLineas(ctxUi, frase, anchoDesc);
    if (lineas) break;
    tamDesc -= 0.5;
  }
  // Ni partiéndola a 6 px cabe: se pinta el mejor reparto posible y que
  // desborde un pelo. Que falte un trozo de frase nunca puede impedir elegir
  // personaje, que es para lo que está esta pantalla.
  if (!lineas) {
    ctxUi.font = `500 6px ${FUENTE}`;
    lineas = repartirDosLineas(ctxUi, frase, anchoDesc, true);
  }
  ctxUi.fillStyle = t.texto;
  if (lineas[1]) {
    ctxUi.fillText(lineas[0], cx, ySup + 21);
    ctxUi.fillText(lineas[1], cx, ySup + 29);
  } else {
    ctxUi.fillText(lineas[0], cx, ySup + 25);
  }

  // --- Etiqueta del puesto, DENTRO del arco -------------------------------
  //
  // Estaba a caballo del borde superior y ahí ya no cabe: ese sitio lo ocupa
  // ahora la cartela del nombre. Baja al interior, donde el fondo del arco es
  // negro y cualquier texto se lee sin pelearse con la piedra.
  //
  // Y se lleva el "LISTO", que antes estaba abajo ocupando el renglón que ahora
  // es del arma. Es donde le toca: quién eres y si ya has decidido son la misma
  // pregunta —"¿falta alguien?"— y se responde de un vistazo por los cuatro
  // arcos, sin bajar la vista a cuatro cartelas distintas.
  // ARRIBA A LA IZQUIERDA, a 4 de cada línea del marco. Centrada quedaba en
  // mitad del arco, justo por donde asoma la cabeza del personaje; en la
  // esquina no se pone delante de nadie y, con los cuatro arcos en fila, los
  // cuatro números caen a la misma altura y a la misma sangría, que es lo que
  // permite contar de un vistazo quién se ha sumado.
  const et = puesto.listo ? `P${indice + 1}  ·  LISTO` : `P${indice + 1}`;
  ctxUi.font = `700 12px ${FUENTE}`;
  const anchoEt = ctxUi.measureText(et).width + 14;
  const ALTO_ET = 18;
  const xEt = r.x + 4;
  const yEt = r.y + 4;
  ctxUi.fillStyle = 'rgba(6,5,10,.82)';
  ctxUi.beginPath();
  ctxUi.roundRect(xEt, yEt, anchoEt, ALTO_ET, 4);
  ctxUi.fill();
  ctxUi.strokeStyle = color;
  ctxUi.lineWidth = 1.2;
  ctxUi.stroke();
  ctxUi.fillStyle = color;
  ctxUi.fillText(et, xEt + anchoEt / 2, yEt + ALTO_ET / 2);

  // --- CON QUÉ PELEA: cartela de ABAJO ------------------------------------
  //
  // El arma ya no es un renglón de texto: es SU DIBUJO, el mismo que se va a
  // ver luego en la ficha y en el menú de subida de nivel, sobre el mismo fondo
  // blanco que en esos dos sitios. Un nombre de arma no dice nada la primera
  // vez que se lee; la silueta del pilum sí, y además es la que hay que
  // reconocer durante toda la partida.
  //
  // El nombre se queda ENCIMA del dibujo, no debajo: es el orden en que se usan
  // —se mira el icono, y si no se sabe qué es, se lee— y así el icono queda
  // pegado al borde inferior de la cartela, que es donde tiene sitio para ser
  // grande.
  const LADO_ARMA = 32;
  const CAJA_INF = 56;
  const yInf = r.y + r.h + 4;
  cartela(ctxUi, r.x, yInf, r.w, CAJA_INF, puesto.listo ? color : null);

  ctxUi.font = `600 9px ${FUENTE}`;
  ctxUi.fillStyle = puesto.listo ? color : t.apagado;
  ctxUi.fillText(arma ? arma.nombre : '', cx, yInf + 11);

  if (arma) {
    // Fondo blanco, como en la ficha del jugador y en el menú de subida de
    // nivel: los iconos son pixel art recortado al filo y sobre la cartela
    // oscura las siluetas negras perdían el trazo.
    const yArma = yInf + 18;
    ctxUi.beginPath();
    ctxUi.roundRect(cx - LADO_ARMA / 2, yArma, LADO_ARMA, LADO_ARMA, 4);
    ctxUi.fillStyle = 'rgba(255,255,255,.92)';
    ctxUi.fill();
    ctxUi.lineWidth = 1;
    ctxUi.strokeStyle = puesto.listo ? color : 'rgba(255,255,255,.22)';
    ctxUi.stroke();
    // 13 de radio, por encima del umbral de la hoja grande (ver blitHoja en
    // ui/hud.js): por debajo saldría de la hoja de 32 ampliada y con el canto
    // roto, que es lo que se veía en el menú de subida de nivel.
    dibujarIconoArma(ctxUi, cx, yArma + LADO_ARMA / 2, 13, def.arma, arma.color);
  }

  ctxUi.restore();
}

// La caja oscura de las dos cartelas del puesto. Misma receta que tenían: negro
// casi opaco porque el fondo es piedra y ruinas, y borde del color del jugador
// solo cuando ya ha confirmado.
function cartela(ctxUi, x, y, ancho, alto, color) {
  ctxUi.fillStyle = 'rgba(6,5,10,.8)';
  ctxUi.beginPath();
  ctxUi.roundRect(x, y, ancho, alto, 4);
  ctxUi.fill();
  ctxUi.strokeStyle = color || 'rgba(255,255,255,.16)';
  ctxUi.lineWidth = 1;
  ctxUi.stroke();
}

// --- Elección de mascota ------------------------------------------------------
//
// Va DESPUÉS de elegir personaje y solo si hay alguna comprada. Cada jugador
// elige por turnos, y no se puede repetir: main.js ya filtra las que lleva otro
// (ver mascotasDisponibles), así que aquí solo llegan las que este puede coger.
//
// Sin ilustración propia: se reutiliza el fondo de la selección de personaje,
// oscurecido. Son el mismo momento —montar la partida— y cambiar de decorado
// entre dos pasos seguidos se lee como haber salido a otro sitio.
const CARTA_MASCOTA = 84;
const HUECO_MASCOTA = 10;

function dibujarMascotas(ctxMundo, ctxUi, disponibles, cursor, turno, puestos, elegidas) {
  const img = Imagenes.seleccion;
  const e = cubrir(img || { width: ANCHO_UI, height: ALTO_UI }, 0.5);
  fondo(ctxMundo, img, e);

  const t = Tema.actual;
  ctxUi.save();
  ctxUi.fillStyle = 'rgba(6,5,10,.72)';
  ctxUi.fillRect(0, 0, ANCHO_UI, ALTO_UI);
  dibujarOro(ctxUi);

  // Cabecera: de quién es el turno. En cooperativo es lo primero que hay que
  // saber, porque los cuatro miran la misma pantalla.
  const color = COLOR_JUGADOR[turno % COLOR_JUGADOR.length];
  const def = puestos[turno] ? PERSONAJES[ORDEN_PERSONAJES[puestos[turno].personaje]] : null;
  ctxUi.textAlign = 'center';
  ctxUi.textBaseline = 'middle';
  ctxUi.font = `26px ${FUENTE_TITULO}`;
  ctxUi.fillStyle = t.titulo;
  textoEspaciado(ctxUi, 'ELIGE TU MASCOTA', ANCHO_UI / 2, 84, 4);

  ctxUi.font = `600 13px ${FUENTE}`;
  ctxUi.fillStyle = color;
  ctxUi.fillText(`P${turno + 1}${def ? '  ·  ' + def.nombre : ''}`, ANCHO_UI / 2, 110);

  // Una carta por mascota disponible, más una final de "ninguna".
  const n = disponibles.length + 1;
  const anchoTotal = n * CARTA_MASCOTA + (n - 1) * HUECO_MASCOTA;
  const x0 = (ANCHO_UI - anchoTotal) / 2;
  const yCarta = 150;

  for (let i = 0; i < n; i++) {
    const x = x0 + i * (CARTA_MASCOTA + HUECO_MASCOTA);
    const elegida = i === cursor;
    const id = i < disponibles.length ? disponibles[i] : '';
    const dm = id ? MASCOTAS[id] : null;
    const nivel = id ? MetaProgreso.nivelMascota(id) : 0;

    ctxUi.beginPath();
    ctxUi.roundRect(x, yCarta, CARTA_MASCOTA, CARTA_MASCOTA + 30, 6);
    ctxUi.fillStyle = elegida ? 'rgba(40,44,52,.95)' : 'rgba(16,16,20,.8)';
    ctxUi.fill();
    ctxUi.lineWidth = elegida ? 2.2 : 1;
    ctxUi.strokeStyle = elegida ? color : 'rgba(238,240,243,.16)';
    ctxUi.stroke();

    if (dm) {
      // El RETRATO del bicho (`mascota<Id>Ficha`), no el sprite que corre por el
      // mundo: aquí no hace falta animar, hace falta reconocerlo. Y el sprite
      // del mundo mide once unidades de alto, así que meterlo en un hueco de 52
      // era AMPLIARLO por 1,18 —un factor roto— y el pixel art salía con filas
      // dobladas sí y no. El retrato viene a 160 y siempre se reduce.
      const idAtlas = 'mascota' + id.charAt(0).toUpperCase() + id.slice(1) + 'Ficha';
      const meta = Recursos.meta(idAtlas);
      const imgM = Recursos.imagen(idAtlas);
      if (meta && imgM) {
        const esc = Math.min((CARTA_MASCOTA - 12) / meta.w, 52 / meta.h);
        const w = meta.w * esc, h = meta.h * esc;
        ctxUi.drawImage(imgM, 0, 0, meta.w, meta.h,
                        x + (CARTA_MASCOTA - w) / 2, yCarta + 12 + (52 - h) / 2, w, h);
      }
      ctxUi.font = `600 9px ${FUENTE}`;
      ctxUi.fillStyle = elegida ? '#ffffff' : t.texto;
      ctxUi.fillText(dm.corto, x + CARTA_MASCOTA / 2, yCarta + 78);

      // Nivel en puntos: se lee de un vistazo cuánto le queda por mejorar.
      for (let k = 0; k < MAX_NIVEL_MASCOTA; k++) {
        ctxUi.beginPath();
        ctxUi.arc(x + CARTA_MASCOTA / 2 + (k - 2) * 8, yCarta + 96, 2.4, 0, Math.PI * 2);
        ctxUi.fillStyle = k < nivel ? t.filo : 'rgba(255,255,255,.15)';
        ctxUi.fill();
      }
    } else {
      ctxUi.font = `600 11px ${FUENTE}`;
      ctxUi.fillStyle = elegida ? '#ffffff' : t.apagado;
      ctxUi.fillText('SIN', x + CARTA_MASCOTA / 2, yCarta + 44);
      ctxUi.fillText('MASCOTA', x + CARTA_MASCOTA / 2, yCarta + 58);
    }
  }

  // Descripción de la señalada, debajo. Solo la de una: la lista se lee
  // recorriéndola, no leyendo ocho párrafos a la vez.
  const idSel = cursor < disponibles.length ? disponibles[cursor] : '';
  ctxUi.font = `400 11px ${FUENTE}`;
  ctxUi.fillStyle = t.texto;
  ctxUi.fillText(idSel ? MASCOTAS[idSel].descripcion : 'Jugarás sin mascota.',
                 ANCHO_UI / 2, yCarta + CARTA_MASCOTA + 62);

  // Lo ya elegido por los demás, para que nadie tenga que preguntar cuál se ha
  // llevado el otro.
  const yaElegidas = [];
  for (let i = 0; i < elegidas.length; i++) {
    if (i !== turno && elegidas[i]) {
      yaElegidas.push(`P${i + 1}: ${MASCOTAS[elegidas[i]].corto}`);
    }
  }
  if (yaElegidas.length) {
    ctxUi.font = `500 10px ${FUENTE}`;
    ctxUi.fillStyle = t.apagado;
    ctxUi.fillText(yaElegidas.join('     '), ANCHO_UI / 2, yCarta + CARTA_MASCOTA + 84);
  }

  ctxUi.restore();
}

