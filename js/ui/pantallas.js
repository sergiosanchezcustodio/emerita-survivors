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
import * as Nube from '../core/nube.js';

// Pantallas de TÍTULO y de SELECCIÓN DE PERSONAJE.
//
// Las dos se apoyan en una ilustración que ha pintado Sergio y que trae ya
// horneado casi todo: el logo, las cuatro opciones del menú, el rótulo "Elige a
// tu Héroe" y la arquería. Nada de eso se vuelve a dibujar aquí — sería competir
// con el arte y perder. Lo único que se añade es lo que una imagen no puede
// tener: qué arco está elegido, de quién es cada cursor y qué hay que pulsar.
//
// CON UNA EXCEPCIÓN: QUIÉN HAY DENTRO DE CADA MARCO. La lámina de selección
// trae cuatro marcos VACÍOS a propósito —los repintó Sergio así— porque el
// catálogo pasó de cuatro héroes a ocho: son ventanas por las que corre una
// tira, no cuatro personajes. El retrato lo pone el código; ver la cabecera de
// la sección de selección, más abajo.
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
// LOS CUATRO MARCOS DE LA PANTALLA DE SELECCIÓN, y estos números NO se ponen a
// ojo: los saca `herramientas\medir-marcos.ps1` de la propia lámina, buscando
// el negro cálido del interior —que es lo único de la escena que no tira a
// azul— y midiendo el bloque de filas que queda cubierto de lado a lado. Cada
// vez que Sergio repinte `seleccion_jugador.png` se vuelve a pasar y se copian
// las cinco líneas de abajo. Un repintado que mueva los marcos no da ningún
// error: los retratos siguen saliendo, solo que fuera de su hueco.
//
// ES EL HUECO INTERIOR, no el marco con su piedra. Ahí es donde va el retrato
// del héroe, así que lo que hace falta es por dónde acaba el dibujo de Sergio y
// empieza el negro.
//
// LOS CUATRO CENTROS, UNO A UNO, y no un primero más un paso constante. Están a
// 321, 325 y 314,5 de distancia: son marcos pintados a mano y no cuadran al
// píxel. Con un paso único, el tercer retrato caía seis píxeles descentrado
// dentro de su marco — poco, pero de los que se ven cuando los cuatro están en
// fila. El paso medio sigue haciendo falta para lo que entra y sale por los
// lados, que no tiene marco donde encajar.
const ARCO_CENTRO = [375, 696, 1021, 1335.5];
const ARCO_PASO = 320.2;
const ARCO_ANCHO = 209;
const ARCO_Y = 305;
const ARCO_ALTO = 395;

// LAS CINCO OPCIONES DEL MENÚ, medidas sobre la ilustración (Main_menu.jpg,
// 1672x941). Vienen pintadas en su marco —JUGAR, JUGAR EN RED, TIENDA,
// CONFIGURACIÓN y SALIR—, así que aquí NO se vuelven a escribir: lo único que
// falta es decir cuál está señalada, y eso se hace ILUMINANDO SU RECUADRO. Es
// el criterio de toda esta pantalla: no competir con el arte.
//
// LAS MEDIDAS NO VAN A OJO NI SE SACAN A MANO: las da
// `herramientas\medir-lapida.ps1` en una tabla de texto, y ahí están escritas
// las tres precauciones que costó descubrir —los rieles del marco, el ruido del
// JPEG y el degradado de la piedra—. Cada vez que Sergio repinte la lápida, se
// vuelve a pasar y se copian los números de abajo.
//
// El marco del menú va de x=663 a x=1037, contando por dentro de los rieles.
//
// Lo medido, en píxeles de la imagen:
//
//     JUGAR            y 677..703   x 793..914   (122 de ancho)
//     JUGAR EN RED     y 719..745   x 717..987   (271)
//     TIENDA           y 762..789   x 776..925   (150)
//     CONFIGURACIÓN    y 806..831   x 698..1002  (305)
//     SALIR            y 849..874   x 794..908   (115)
//
// Las cinco miden lo mismo de alto y van separadas 43.
//
// LA LÁMINA CAMBIÓ DE TAMAÑO, no de composición: de 1376x768 a 1672x941, que es
// la misma escena redibujada más grande. Todos los números de aquí son píxeles
// de la imagen, así que TODOS cambian aunque no se haya movido nada — son los
// mismos multiplicados por 1,215. Comprobado uno a uno contra los viejos: los
// cinco anchos coinciden con el escalado dentro de cinco píxeles.
//
// Esa es la trampa de esta pantalla: repintar la lápida al mismo tamaño no
// obliga a tocar nada, y reexportarla más grande lo invalida todo sin que
// aparezca ningún error. Se vuelve a sacar con `herramientas\medir-lapida.ps1`,
// acotando la ventana al hueco de la placa.
//
// El texto está centrado en el marco: las cinco palabras caen en 851 —las cinco,
// con un píxel de diferencia entre ellas— y el hueco entre rieles tiene su
// centro en 850. Aun así el número se toma del TEXTO y no del marco, porque en
// una ilustración anterior no coincidían: las palabras iban siete píxeles a la
// izquierda del centro del marco.
const OPCION_X = 851;

// Un solo ancho para las cinco, y lo manda la más larga: CONFIGURACIÓN mide
// 305. Con 340 quedan diecisiete píxeles de aire a cada lado de esa palabra, y
// el recuadro entra holgado en el hueco del marco (663..1037).
//
// Que a SALIR —115 de ancho— le sobre sitio es deliberado: un recuadro que
// cambia de tamaño según la palabra no se lee como un cursor que se mueve, sino
// como cinco recuadros distintos.
const OPCION_ANCHO = 340;

// Alto: 27 de texto más 12 de aire. Con 43 de separación entre renglones, deja
// cuatro píxeles de hueco entre un recuadro y el siguiente.
const OPCIONES_TITULO = [
  { y: 690, alto: 39 },     // JUGAR
  { y: 732, alto: 39 },     // JUGAR EN RED
  { y: 776, alto: 39 },     // TIENDA
  { y: 818, alto: 39 },     // CONFIGURACIÓN
  { y: 862, alto: 39 }      // SALIR
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
  // `foco` es el personaje que acaba de tocar alguien: la tira se desplaza para
  // dejarlo a la vista. -1 (o nada) deja la ventana donde esté.
  seleccion(ctxMundo, ctxUi, puestos, foco) { dibujarSeleccion(ctxMundo, ctxUi, puestos, foco); },

  // AL ENTRAR en la pantalla: la tira se planta de golpe donde toca, sin
  // deslizarse desde donde se quedó la última vez. Un carrusel que arranca
  // corriendo solo parece que se ha movido alguien.
  centrarSeleccion(foco) {
    encuadrar(foco | 0);
    carrusel.vista = carrusel.desde;
    carrusel.reloj = 0;
  },
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

// EL @USUARIO DE GITHUB, arriba a la IZQUIERDA —espejo de la placa de denarios,
// que va a la derecha— en toda pantalla de MENÚ. Nunca durante la partida: ahí
// no hay HUD ajeno al combate, y conectar con GitHub es un gesto de antes de
// jugar, no de en medio.
//
// No pinta nada si no hay sesión: quien no se ha conectado no tiene nada que
// ver aquí, igual que `dibujarOro` no dibuja una cartela vacía.
export function dibujarUsuarioGithub(ctxUi, yPedida) {
  const login = Nube.login();
  if (!login) return;

  const y = yPedida !== undefined
            ? yPedida
            : Math.max(20, (ALTO_UI - Capa.altoVisible) / 2 + 15);
  const texto = '@' + login;

  ctxUi.save();
  ctxUi.textBaseline = 'middle';
  ctxUi.font = `700 12px ${FUENTE}`;

  const anchoTexto = ctxUi.measureText(texto).width;
  const izquierda = 16;
  const ancho = anchoTexto + RELLENO_PLACA * 2;

  ctxUi.beginPath();
  ctxUi.roundRect(izquierda, y - ALTO_PLACA / 2, ancho, ALTO_PLACA, ALTO_PLACA / 2);
  ctxUi.fillStyle = 'rgba(10,8,12,.62)';
  ctxUi.fill();
  ctxUi.lineWidth = 1;
  ctxUi.strokeStyle = 'rgba(232,183,58,.28)';
  ctxUi.stroke();

  ctxUi.textAlign = 'left';
  ctxUi.fillStyle = Tema.actual.texto;
  ctxUi.fillText(texto, izquierda + RELLENO_PLACA, y + 0.5);
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
  dibujarUsuarioGithub(ctxUi);
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
  //
  // AZUL ELÉCTRICO, por decisión de Sergio. Antes era un ámbar cálido que salía
  // de las antorchas de la ilustración; el azul no sale de ninguna parte de la
  // escena, y eso es justo lo que lo hace saltar: en una lápida de piedra a la
  // luz del fuego, el único frío de la pantalla es el cursor.
  //
  // El relleno va más claro que el trazo —casi blanco azulado— porque sumado
  // sobre piedra oscura un azul puro se apaga y deja la mancha sucia en vez de
  // encendida. El color lo pone el borde; el relleno solo aclara.
  const pulso = latido(1500, 0.45);
  ctxUi.globalCompositeOperation = 'lighter';
  ctxUi.globalAlpha = 0.17 * pulso;
  ctxUi.fillStyle = '#a8dcff';
  ctxUi.beginPath();
  ctxUi.roundRect(r.x, r.y, r.w, r.h, 6);
  ctxUi.fill();
  ctxUi.restore();

  // SIN LÍNEA DE AYUDA. La quitó Sergio y tiene razón: cuatro opciones en una
  // lápida con una de ellas encendida no necesitan que nadie explique que se
  // sube, se baja y se pulsa. Donde sí sigue estando es en las pantallas que
  // tienen atajos que no se adivinan —la tienda, la selección—.
  //
  // EL BORDE, MÁS FINO QUE ANTES —de 2 a 1,3— y azul eléctrico. Lo pidió Sergio
  // y le sienta bien al azul: un trazo frío y saturado pesa más que uno cálido
  // al mismo grosor, así que con los 2 de antes el marco se comía la palabra
  // que enmarca. Adelgazándolo se lee como un filo encendido y no como una caja.
  //
  // No baja de 1: por debajo, el suavizado lo reparte entre dos filas de píxeles
  // y el borde deja de verse como una línea para verse como una mancha.
  ctxUi.save();
  ctxUi.lineWidth = 1.3;
  ctxUi.strokeStyle = `rgba(64, 176, 255, ${0.6 + 0.4 * pulso})`;
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
//
// LOS CUATRO ARCOS SON VENTANAS, NO PERSONAJES. La ilustración trae cuatro
// arcos y el catálogo tiene ocho héroes, así que lo que se mueve es la TIRA:
// los arcos se quedan clavados donde los pintó Sergio y por detrás pasan los
// personajes, cada uno con su retrato de cuerpo entero —`<arte>Cuerpo`, el
// mismo dibujo que enseña la ficha—. Cuatro a la vista, los que hagan falta en
// total.
//
// EL RECORTE VA POR ARCO Y NO POR LA BANDA ENTERA. Entre arco y arco hay
// pilastra de piedra, y un cuerpo deslizándose por encima de la columna se lee
// como una calcomanía pegada delante. Recortando cada arco por su cuenta, la
// figura entra y sale POR DETRÁS de la piedra: se ve como mirar por una
// ventana, que es lo que son.
//
// EL VELO DEL INTERIOR YA CASI NO HACE FALTA. Durante un tiempo la ilustración
// traía cuatro figuras pintadas dentro y el velo estaba para taparlas; Sergio
// repintó la lámina con los marcos VACÍOS y ahora dentro solo hay piedra
// oscura. Lo que queda es un velo suave, y no es adorno: asienta al retrato
// sobre un fondo parejo en los cuatro marcos —el grano de la piedra no es igual
// en todos— y le da al blanco de las zapatillas contra qué recortarse.
const VISIBLES = 4;
const VELO_ARCO = 'rgba(6,5,10,.35)';

// La tira. `desde` es el personaje que le toca al primer arco y `vista` es por
// dónde va de verdad mientras se desliza. Vive en el módulo y no en main.js
// porque es estado de DIBUJO: la partida no cambia porque la tira esté a medio
// camino, y meterla en `puestos` la habría metido en el saludo de la red.
const carrusel = { desde: 0, vista: 0, reloj: 0 };

function topeCarrusel() {
  return Math.max(0, ORDEN_PERSONAJES.length - VISIBLES);
}

// Deja a la vista al personaje `foco` moviendo la tira LO MÍNIMO.
//
// Con cuatro jugadores mirando la misma pantalla no hay otra: la ventana es
// una y la sigue quien acaba de moverse. A quien se le queda el suyo fuera se
// le marca en el borde (ver `dibujarBordes`), que es lo que evita que un
// jugador desaparezca sin más porque otro se haya ido al otro extremo.
function encuadrar(foco) {
  if (foco >= 0) {
    if (foco < carrusel.desde) carrusel.desde = foco;
    else if (foco > carrusel.desde + VISIBLES - 1) carrusel.desde = foco - VISIBLES + 1;
  }
  carrusel.desde = Math.max(0, Math.min(topeCarrusel(), carrusel.desde));
}

// Acercamiento exponencial al sitio, medido en TIEMPO y no en fotogramas: esta
// pantalla no simula nada y el monitor puede ir a 60 o a 144 (mismo criterio
// que `latido`). Con 0,0005 de constante, un salto de una casilla está hecho en
// algo más de un tercio de segundo: se ve moverse y no se hace esperar.
function deslizar() {
  const ahora = performance.now();
  const dt = carrusel.reloj ? Math.min(0.1, (ahora - carrusel.reloj) / 1000) : 0;
  carrusel.reloj = ahora;
  carrusel.vista += (carrusel.desde - carrusel.vista) * (1 - Math.pow(0.0005, dt));
  if (Math.abs(carrusel.desde - carrusel.vista) < 0.002) carrusel.vista = carrusel.desde;
}

// Dónde cae el centro de la posición `pos` de la tira, contada en marcos y con
// decimales mientras se desliza.
//
// Entre los cuatro marcos se INTERPOLA entre sus centros medidos, así que en
// reposo cada retrato cae exactamente en el suyo; fuera de ellos se sigue con
// el paso medio, que es lo único que se puede hacer donde no hay marco.
function centroEn(pos) {
  const i = Math.floor(pos);
  return centroDe(i) + (centroDe(i + 1) - centroDe(i)) * (pos - i);
}

function centroDe(k) {
  if (k >= 0 && k < ARCO_CENTRO.length) return ARCO_CENTRO[k];
  const borde = k < 0 ? 0 : ARCO_CENTRO.length - 1;
  return ARCO_CENTRO[borde] + (k - borde) * ARCO_PASO;
}

// El marco número `s`, que es fijo —lo pintó Sergio ahí—, y el sitio donde cae
// el personaje `p`, que es móvil. Los dos en unidades de interfaz.
function ventanaDe(e, s) {
  return enUi(e, ARCO_CENTRO[s] - ARCO_ANCHO / 2, ARCO_Y, ARCO_ANCHO, ARCO_ALTO);
}

function rectoDe(e, p) {
  return enUi(e, centroEn(p - carrusel.vista) - ARCO_ANCHO / 2,
              ARCO_Y, ARCO_ANCHO, ARCO_ALTO);
}

function seSolapa(r, v) {
  return r.x < v.x + v.w && r.x + r.w > v.x;
}

function dibujarSeleccion(ctxMundo, ctxUi, puestos, foco = -1) {
  const img = Imagenes.seleccion;
  const e = cubrir(img || { width: ANCHO_UI, height: ALTO_UI }, 0.5);
  fondo(ctxMundo, img, e);

  dibujarOro(ctxUi);
  dibujarUsuarioGithub(ctxUi);
  const t = Tema.actual;
  const n = ORDEN_PERSONAJES.length;
  encuadrar(foco);
  deslizar();
  ctxUi.save();

  // 1. EL INTERIOR DE LOS ARCOS. Un recorte por arco, y dentro todo lo que
  //    asome por esa ventana: el velo, los retratos y el marco del jugador que
  //    haya cogido a alguno de ellos.
  for (let s = 0; s < VISIBLES; s++) {
    const v = ventanaDe(e, s);
    ctxUi.save();
    ctxUi.beginPath();
    ctxUi.rect(v.x, v.y, v.w, v.h);
    ctxUi.clip();
    ctxUi.fillStyle = VELO_ARCO;
    ctxUi.fillRect(v.x, v.y, v.w, v.h);

    for (let p = 0; p < n; p++) {
      const r = rectoDe(e, p);
      if (!seSolapa(r, v)) continue;
      dibujarRetrato(ctxUi, r, p, ocupantePersonaje(puestos, p), t);
    }
    for (let i = 0; i < puestos.length; i++) {
      if (!puestos[i]) continue;
      const r = rectoDe(e, puestos[i].personaje);
      if (!seSolapa(r, v)) continue;
      dibujarPuesto(ctxUi, r, i, puestos[i]);
    }
    ctxUi.restore();
  }

  // 2. LAS CARTELAS, colgadas encima y debajo de cada arco. Estas van FUERA del
  //    arco —el nombre sobre la cornisa, el arma bajo el zócalo— así que no
  //    pueden recortarse por ventana: se recortan a la BANDA entera del
  //    carrusel, y lo que se sale por los lados no se pinta.
  const izq = ventanaDe(e, 0);
  const der = ventanaDe(e, VISIBLES - 1);
  const banda = { x: izq.x - 2, w: der.x + der.w - izq.x + 4 };
  ctxUi.save();
  ctxUi.beginPath();
  ctxUi.rect(banda.x, 0, banda.w, ALTO_UI);
  ctxUi.clip();
  for (let p = 0; p < n; p++) {
    const r = rectoDe(e, p);
    if (!seSolapa(r, banda)) continue;
    dibujarTarjeta(ctxUi, r, p, puestos, t);
  }
  ctxUi.restore();

  // 3. Que la tira sigue a los lados: flechas, quién se ha quedado fuera y la
  //    cuenta de héroes.
  dibujarBordes(ctxUi, izq, der, puestos, n, t);

  // 4. Y el héroe que se está mirando, con letra: su arma y su frase.
  dibujarPieHeroe(ctxUi, Math.max(0, Math.min(n - 1, foco)), ALTO_UI - 36, t);

  // Pie: qué se puede hacer, en UNA sola línea.
  //
  // UNA de ayuda, y es la de más abajo del todo. Encima de ella van los otros
  // dos renglones del pie —el arma y la frase del héroe que se está mirando,
  // ver dibujarPieHeroe— y encima de esos, la cuenta de puntos. Los cuatro
  // caben porque desde que los rótulos se metieron dentro de los marcos, entre
  // el zócalo de la arquería y el borde inferior hay unas ciento veinte
  // unidades libres.
  //
  // La de ayuda dice UNA cosa y la más urgente de las tres que puede haber:
  // ver el orden justo debajo.
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
  //
  // Y por delante de todo eso, lo de un héroe que no es tuyo: ahí SÍ hay que
  // explicar por qué pulsar A no hace nada, que es la única forma que tiene
  // esta pantalla de quedarse muda sin motivo aparente.
  const enBloqueado = presentes.some(
    (p) => !p.listo && !MetaProgreso.heroeDesbloqueado(ORDEN_PERSONAJES[p.personaje]));
  let pie = 'Empezando...';
  if (enBloqueado) pie = 'Ese héroe se compra en la tienda';
  else if (faltan && hueco) pie = 'A o Start en otro mando  ·  se suma un jugador';
  else if (faltan) pie = '';
  if (pie) {
    ctxUi.globalAlpha = faltan ? 0.9 : latido(700, 0.4);
    // A 20 del borde, debajo de la frase. Es una nota al pie sobre cómo se suma
    // otro mando o sobre por qué un héroe no se deja coger: va la última porque
    // es la que se deja de leer en cuanto se ha entendido una vez.
    textoBorde(ctxUi, pie, ANCHO_UI / 2, ALTO_UI - 20, t.texto, 3.5);
  }
  ctxUi.restore();
}

// EL RETRATO DENTRO DEL ARCO. El de cuerpo entero de la ficha, que es el único
// dibujo del personaje que da la talla a este tamaño: el muñeco del mundo mide
// 26 unidades de alto y aquí hay cerca de 285, o sea que habría que ampliarlo
// once veces.
//
// Tres estados y se distinguen por la LUZ, no por un rótulo: a plena luz el que
// ha cogido alguien, a media luz el que está libre, y en penumbra el que
// todavía no es tuyo.
function dibujarRetrato(ctxUi, r, p, ocupante, t) {
  const id = ORDEN_PERSONAJES[p];
  const def = PERSONAJES[id];
  const bloqueado = !MetaProgreso.heroeDesbloqueado(id);
  const img = Recursos.imagen(def.sprite + 'Cuerpo');

  if (img) {
    // Encaje "contener" y APOYADO EN EL SUELO del hueco que le queda, que no es
    // el marco entero: arriba manda el nombre y abajo el cuadro del arma (ver
    // dibujarTarjeta). El retrato viene a 340x760 y el marco es de proporción
    // más ancha, así que manda el alto y sobra aire a los lados. No se estira
    // nunca, y si algún día llega un dibujo más ancho, se estrechará solo.
    const hueco = r.h - BANDA_NOMBRE - BANDA_ARMA;
    const esc = Math.min(r.w * 0.94 / img.width, hueco / img.height);
    const w = img.width * esc;
    const h = img.height * esc;
    ctxUi.save();
    ctxUi.globalAlpha = bloqueado ? 0.3 : (ocupante >= 0 ? 1 : 0.72);
    ctxUi.imageSmoothingEnabled = true;
    ctxUi.imageSmoothingQuality = 'high';
    ctxUi.drawImage(img, r.x + (r.w - w) / 2, r.y + BANDA_NOMBRE + hueco - h, w, h);
    ctxUi.restore();
  }

  // EL AVISO DE ARTE PRESTADA, dentro del arco y a media voz. Mientras un héroe
  // salga con el dibujo de otro (ver `provisional` en datos/personajes.js) hay
  // que decirlo donde se le mira: si no, dos arcos con la misma figura se leen
  // como un fallo del juego.
  if (def.provisional) {
    ctxUi.save();
    ctxUi.textAlign = 'center';
    ctxUi.textBaseline = 'middle';
    ctxUi.font = `600 8px ${FUENTE}`;
    ctxUi.fillStyle = t.apagado;
    ctxUi.fillText('ARTE PROVISIONAL', r.x + r.w / 2, r.y + r.h - BANDA_ARMA - 6);
    ctxUi.restore();
  }

  if (bloqueado) placaBloqueo(ctxUi, r, def.coste, t);
}

// LO QUE CUESTA, en el sitio donde se le mira. Misma cartela que la de los
// denarios de la esquina —moneda y cifra— porque es el mismo concepto: si el
// número de arriba llega al de aquí, es tuyo en dos pulsaciones.
function placaBloqueo(ctxUi, r, coste, t) {
  const cx = r.x + r.w / 2;
  const cy = r.y + BANDA_NOMBRE + (r.h - BANDA_NOMBRE - BANDA_ARMA) * 0.44;
  const cifra = String(coste);

  ctxUi.save();
  ctxUi.textBaseline = 'middle';
  ctxUi.font = `700 14px ${FUENTE}`;
  const contenido = LADO_MONEDA + HUECO_MONEDA + ctxUi.measureText(cifra).width;
  const ancho = contenido + RELLENO_PLACA * 2;

  ctxUi.beginPath();
  ctxUi.roundRect(cx - ancho / 2, cy - ALTO_PLACA / 2, ancho, ALTO_PLACA, ALTO_PLACA / 2);
  ctxUi.fillStyle = 'rgba(10,8,12,.8)';
  ctxUi.fill();
  ctxUi.lineWidth = 1;
  ctxUi.strokeStyle = 'rgba(232,183,58,.42)';
  ctxUi.stroke();

  const xMoneda = cx - contenido / 2 + LADO_MONEDA / 2;
  const meta = Recursos.meta('monedaHud');
  const img = Recursos.imagen('monedaHud');
  if (meta && img) {
    const esc = Math.min(LADO_MONEDA / meta.w, LADO_MONEDA / meta.h);
    const w = meta.w * esc;
    const h = meta.h * esc;
    ctxUi.drawImage(img, 0, 0, meta.w, meta.h, xMoneda - w / 2, cy - h / 2, w, h);
  }

  ctxUi.textAlign = 'left';
  ctxUi.fillStyle = COLOR_ORO;
  ctxUi.fillText(cifra, xMoneda + LADO_MONEDA / 2 + HUECO_MONEDA, cy + 0.5);

  ctxUi.textAlign = 'center';
  ctxUi.font = `700 9px ${FUENTE}`;
  ctxUi.fillStyle = t.apagado;
  textoEspaciado(ctxUi, 'EN LA TIENDA', cx, cy + ALTO_PLACA / 2 + 11, 1.2);
  ctxUi.restore();
}

// LO QUE HAY A LOS LADOS. Tres cosas que solo tienen sentido con la tira más
// larga que la ventana, y las tres se apagan solas cuando no la hay.
function dibujarBordes(ctxUi, izq, der, puestos, n, t) {
  const cy = izq.y + izq.h / 2;
  const pulso = latido(1100, 0.35);

  ctxUi.save();
  ctxUi.textAlign = 'center';
  ctxUi.textBaseline = 'middle';

  if (carrusel.desde > 0) flecha(ctxUi, izq.x - 15, cy, -1, pulso, t);
  if (carrusel.desde < topeCarrusel()) flecha(ctxUi, der.x + der.w + 15, cy, 1, pulso, t);

  // QUIÉN SE HA QUEDADO FUERA. En cooperativo la ventana la manda quien acaba
  // de moverse, así que el personaje de otro jugador puede salirse de los
  // cuatro arcos. Sin esto, ese jugador desaparece de la pantalla y no hay
  // forma de saber si sigue ahí.
  let aIzquierda = 0;
  let aDerecha = 0;
  for (let i = 0; i < puestos.length; i++) {
    if (!puestos[i]) continue;
    const pj = puestos[i].personaje;
    const antes = pj < carrusel.desde;
    const despues = pj > carrusel.desde + VISIBLES - 1;
    if (!antes && !despues) continue;
    const x = antes ? izq.x - 15 : der.x + der.w + 15;
    const y = cy + 26 + (antes ? aIzquierda++ : aDerecha++) * 21;
    const color = COLOR_JUGADOR[i % COLOR_JUGADOR.length];
    ctxUi.beginPath();
    ctxUi.roundRect(x - 12, y - 9, 24, 18, 5);
    ctxUi.fillStyle = 'rgba(6,5,10,.82)';
    ctxUi.fill();
    ctxUi.lineWidth = 1.2;
    ctxUi.strokeStyle = color;
    ctxUi.stroke();
    ctxUi.font = `700 10px ${FUENTE}`;
    ctxUi.fillStyle = color;
    ctxUi.fillText('P' + (i + 1), x, y + 0.5);
  }

  // LA CUENTA, un punto por héroe. Dice a la vez cuántos hay y por dónde va la
  // ventana, que es lo que una flecha sola no cuenta: con ocho puntos y cuatro
  // encendidos se ve que queda tanto detrás como delante.
  //
  // Y el punto del que ha cogido alguien va de SU color: en cooperativo eso
  // basta para saber que el que falta está dos casillas a la derecha.
  const paso = 11;
  const x0 = ANCHO_UI / 2 - (n - 1) * paso / 2;
  for (let p = 0; p < n; p++) {
    const dentro = p >= carrusel.desde && p <= carrusel.desde + VISIBLES - 1;
    const oc = ocupantePersonaje(puestos, p);
    // CON RIBETE OSCURO. Los puntos caen sobre el empedrado, que es claro y con
    // grano: sin el ribete, los apagados —los héroes que quedan fuera de la
    // ventana— desaparecían del todo y la cuenta dejaba de contar nada.
    ctxUi.beginPath();
    ctxUi.arc(x0 + p * paso, ALTO_UI - 66, dentro ? 3.2 : 2.4, 0, Math.PI * 2);
    ctxUi.fillStyle = oc >= 0 ? COLOR_JUGADOR[oc % COLOR_JUGADOR.length]
                              : (dentro ? t.filo : 'rgba(230,235,240,.55)');
    ctxUi.fill();
    ctxUi.lineWidth = 1.2;
    ctxUi.strokeStyle = 'rgba(6,5,10,.75)';
    ctxUi.stroke();
  }
  ctxUi.restore();
}

// Punta de flecha maciza CON RIBETE. El ribete no es adorno: a los lados de los
// marcos hay antorchas encendidas, columnas y estandartes rojos, y una punta
// lisa del color del filo se perdía contra ese revoltijo — se probó sin él y
// desde el sofá no se veía que hubiera más héroes a los lados, que es justo lo
// único que esta flecha tiene que decir.
function flecha(ctxUi, x, y, sentido, pulso, t) {
  ctxUi.save();
  ctxUi.globalAlpha = pulso;
  ctxUi.beginPath();
  ctxUi.moveTo(x + 7 * sentido, y);
  ctxUi.lineTo(x - 6 * sentido, y - 11);
  ctxUi.lineTo(x - 6 * sentido, y + 11);
  ctxUi.closePath();
  ctxUi.fillStyle = t.filo;
  ctxUi.lineWidth = 3;
  ctxUi.lineJoin = 'round';
  ctxUi.strokeStyle = 'rgba(6,5,10,.8)';
  ctxUi.stroke();
  ctxUi.fill();
  ctxUi.restore();
}

// Índice del puesto que tiene cogido el personaje `p`, o -1.
export function ocupantePersonaje(puestos, p) {
  for (let i = 0; i < puestos.length; i++) {
    if (puestos[i] && puestos[i].personaje === p) return i;
  }
  return -1;
}

// QUIÉN ES Y CON QUÉ PELEA, TODO DENTRO DEL MARCO.
//
// Antes esto eran dos cartelas negras colgadas FUERA: el nombre sobre la
// cornisa y el arma bajo el zócalo. Con la lámina vieja daba igual, pero la
// nueva trae coronas de calaveras encima de cada marco y coronas de laurel con
// su medallón debajo, y las dos cartelas caían justo encima de las dos cosas.
// Tapar con una caja negra lo que Sergio acaba de dibujar es competir con el
// arte y perder, que es el criterio de toda esta pantalla.
//
// Dentro no hace falta caja: el interior del marco YA es piedra oscura, así que
// basta el texto con reborde. Y el hueco da de sobra — 395 píxeles de lámina,
// unos 233 de interfaz — para el nombre arriba, el arma abajo y el retrato
// entre los dos.
//
// LA FRASE NO CABE AQUÍ, y se ha ido al pie: ver `dibujarPieHeroe`. Son cien
// caracteres en un hueco de 123 unidades de ancho, o sea seis renglones. Y
// cuatro frases a la vez tampoco eran cuatro frases: eran ruido. Abajo se lee
// la del que se está mirando, entera y de un tirón.
const BANDA_NOMBRE = 22;      // lo que se reserva arriba, dentro del marco
const BANDA_ARMA = 38;        // y abajo, para el cuadro del arma
const LADO_ARMA = 30;

function dibujarTarjeta(ctxUi, r, p, puestos, t) {
  const def = PERSONAJES[ORDEN_PERSONAJES[p]];
  const arma = ARMAS[def.arma];
  const cx = r.x + r.w / 2;
  const ocupante = ocupantePersonaje(puestos, p);
  const color = ocupante >= 0 ? COLOR_JUGADOR[ocupante % COLOR_JUGADOR.length] : null;

  ctxUi.save();
  ctxUi.textAlign = 'center';
  ctxUi.textBaseline = 'middle';

  // EL NOMBRE, arriba y del color de quien lo ha cogido. Con reborde y no con
  // cartela: sobre el interior del marco, un reborde de tres píxeles ya separa
  // la letra de la piedra, y no hay caja que tape nada.
  ctxUi.font = `700 12px ${FUENTE_TITULO}`;
  const nombre = def.nombre.toUpperCase();
  // `textoEspaciado` no acepta reborde, así que el espaciado se hace a mano
  // aquí: se mide el conjunto y se pinta letra a letra, cada una con su borde.
  const espaciado = 1.5;
  let ancho = -espaciado;
  for (const c of nombre) ancho += ctxUi.measureText(c).width + espaciado;
  let x = cx - ancho / 2;
  for (const c of nombre) {
    const w = ctxUi.measureText(c).width;
    textoBorde(ctxUi, c, x + w / 2, r.y + 13, color || t.titulo, 3);
    x += w + espaciado;
  }

  // EL ARMA, abajo: su dibujo sobre el mismo cuadro blanco que en la ficha y en
  // el menú de subida de nivel. Sin el nombre escrito al lado —no cabe sin
  // pisar al personaje— porque el del héroe que se está mirando ya sale en el
  // pie, con su frase.
  if (arma) {
    const yArma = r.y + r.h - BANDA_ARMA + 3;
    ctxUi.beginPath();
    ctxUi.roundRect(cx - LADO_ARMA / 2, yArma, LADO_ARMA, LADO_ARMA, 4);
    ctxUi.fillStyle = 'rgba(255,255,255,.92)';
    ctxUi.fill();
    ctxUi.lineWidth = 1;
    ctxUi.strokeStyle = color || 'rgba(255,255,255,.28)';
    ctxUi.stroke();
    // 13 de radio, por encima del umbral de la hoja grande (ver blitHoja en
    // ui/hud.js): por debajo saldría de la hoja de 32 ampliada y con el canto
    // roto, que es lo que se veía en el menú de subida de nivel.
    dibujarIconoArma(ctxUi, cx, yArma + LADO_ARMA / 2, 13, def.arma, arma.color);
  }

  ctxUi.restore();
}

// EL PIE DEL HÉROE QUE SE ESTÁ MIRANDO: su arma con nombre y su frase.
//
// Uno solo y no cuatro. Es el que tiene el foco del carrusel —el último que ha
// movido alguien, ver `encuadrar`—, que es exactamente el que se está mirando.
function dibujarPieHeroe(ctxUi, foco, y, t) {
  const id = ORDEN_PERSONAJES[foco];
  if (!id) return;
  const def = PERSONAJES[id];
  const arma = ARMAS[def.arma];

  ctxUi.save();
  ctxUi.textAlign = 'center';
  ctxUi.textBaseline = 'middle';

  // ENTRECOMILLADA. Es lo que el personaje DICE, no una descripción escrita por
  // el juego —"Coraje y Corazón" es el lema de Eric, no una etiqueta que le
  // hayamos puesto—, y las comillas son lo que separa una cosa de la otra sin
  // gastar una línea en explicarlo. Se añaden aquí y no en datos/personajes.js:
  // los datos guardan la frase, y cómo se puntúa al pintarla es de quien pinta.
  //
  // Se encoge hasta que quepa en una línea, sin partirla: aquí hay 900 unidades
  // de ancho y la frase más larga son cien caracteres, así que no baja de 10.
  const frase = `“${def.descripcion}”`;
  let tam = 12;
  while (tam > 8) {
    ctxUi.font = `500 ${tam}px ${FUENTE}`;
    if (ctxUi.measureText(frase).width <= ANCHO_UI - 120) break;
    tam -= 0.5;
  }
  textoBorde(ctxUi, frase, ANCHO_UI / 2, y, t.texto, 3.5);

  if (arma) {
    ctxUi.font = `700 10px ${FUENTE}`;
    textoBorde(ctxUi, arma.nombre.toUpperCase(), ANCHO_UI / 2, y - 15, t.apagado, 3);
  }
  ctxUi.restore();
}

// EL MARCO DE UN JUGADOR Y SU ETIQUETA, dentro del arco.
//
// Va aparte del nombre y del arma, y recortado por la ventana (ver
// dibujarSeleccion):
// es lo único que se mueve con el personaje elegido, y si se saliera del arco
// al deslizar la tira quedaría un recuadro de color flotando sobre la pilastra.
function dibujarPuesto(ctxUi, r, indice, puesto) {
  const color = COLOR_JUGADOR[indice % COLOR_JUGADOR.length];

  ctxUi.save();
  ctxUi.textAlign = 'center';
  ctxUi.textBaseline = 'middle';

  // Marco del color del jugador. Mientras elige PARPADEA y al confirmar se
  // queda fijo y más grueso: es la diferencia que hay que poder ver desde el
  // otro lado del sofá sin leer nada.
  // POR DENTRO DEL RECORTE, no encima de su línea. El marco se dibuja dentro de
  // la ventana recortada (ver dibujarSeleccion), así que un trazo centrado en el
  // borde pierde su mitad de fuera: quedaba un hilo de un píxel que no se veía
  // desde el sofá. Metiéndolo medio grosor hacia dentro se ve entero.
  const grosor = puesto.listo ? 3 : 2;
  ctxUi.globalAlpha = puesto.listo ? 1 : latido(900, 0.45);
  ctxUi.strokeStyle = color;
  ctxUi.lineWidth = grosor;
  ctxUi.strokeRect(r.x + grosor / 2, r.y + grosor / 2, r.w - grosor, r.h - grosor);
  ctxUi.globalAlpha = 1;

  // --- Etiqueta del puesto, DENTRO del marco ------------------------------
  //
  // Quién eres y si ya has decidido son la misma pregunta —"¿falta alguien?"— y
  // se responde de un vistazo por los cuatro marcos, sin bajar la vista a
  // ninguna otra parte.
  //
  // A LA IZQUIERDA Y BAJO EL NOMBRE. Estuvo pegada al borde de arriba mientras
  // el nombre iba en una cartela colgada fuera; desde que el nombre se metió
  // dentro (ver dibujarTarjeta), ese sitio es suyo y la etiqueta se le echaba
  // encima al llevar el "LISTO" detrás. Bajarla un renglón la deja sobre el
  // hombro del personaje, que es fondo oscuro y no molesta a nadie.
  const et = puesto.listo ? `P${indice + 1}  ·  LISTO` : `P${indice + 1}`;
  ctxUi.font = `700 11px ${FUENTE}`;
  const anchoEt = ctxUi.measureText(et).width + 12;
  const ALTO_ET = 17;
  const xEt = r.x + 4;
  const yEt = r.y + BANDA_NOMBRE + 2;
  ctxUi.fillStyle = 'rgba(6,5,10,.82)';
  ctxUi.beginPath();
  ctxUi.roundRect(xEt, yEt, anchoEt, ALTO_ET, 4);
  ctxUi.fill();
  ctxUi.strokeStyle = color;
  ctxUi.lineWidth = 1.2;
  ctxUi.stroke();
  ctxUi.fillStyle = color;
  ctxUi.fillText(et, xEt + anchoEt / 2, yEt + ALTO_ET / 2 + 0.5);

  ctxUi.restore();
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
  dibujarUsuarioGithub(ctxUi);

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

