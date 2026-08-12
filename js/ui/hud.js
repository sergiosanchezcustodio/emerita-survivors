import { ANCHO_UI, ALTO_UI } from '../core/constantes.js';
import { PASIVOS } from '../datos/pasivos.js';
import { ARMAS } from '../datos/armas.js';
import { Recursos } from '../core/recursos.js';
import { FUENTE, textoBorde } from './capa.js';
import { Tema } from './tema.js';
import { Director } from '../sistemas/director.js';

// Panel de información por jugador, siempre visible. Una esquina cada uno:
// P1 arriba izquierda, P2 arriba derecha, P3 abajo izquierda, P4 abajo derecha.
//
// La ficha va TEÑIDA con el color de su jugador: el nombre y el marco de las
// ocho ranuras. Con cuatro personas mirando la misma pantalla, saber cuál de las
// cuatro esquinas es la tuya tiene que costar cero: en cuanto hay que leer "P3"
// para averiguarlo, ya se ha perdido el instante que se estaba mirando.
//
// Se dibuja en la CAPA DE INTERFAZ (ver ui/capa.js), que va a resolución de
// pantalla. Las coordenadas siguen siendo las de 960x540, pero el texto se
// rasteriza a la resolución real del monitor.
//
// CAJA TRANSLÚCIDA, no opaca, y ese es el punto entero. La ficha vuelve a tener
// marco y fondo —dan cohesión y evitan que ocho elementos sueltos floten sobre
// la arena— pero se ve el juego a través de ella. Con la caja opaca, cuatro
// jugadores tapaban cuatro esquinas del anfiteatro, y en un juego donde lo que
// mata es quedar rodeado eso son cuatro sitios por los que te llegan sin verlos
// venir. Todos los rellenos van por debajo del 40% de alfa y los textos llevan
// además reborde oscuro, que es lo que les permite leerse sobre lo que sea que
// pase por debajo.
//
// LOS ICONOS YA SON DIBUJO DE VERDAD. Sergio ha entregado las dos hojas —52
// armas y 8 objetos, cada una en su hueco— y están en el atlas como
// `iconosArmas` e `iconosObjetos`. Pasó exactamente lo que decía este
// comentario cuando eran procedurales: metidos en el atlas, el resto del panel
// no se ha enterado.
//
// Los glifos vectoriales SE QUEDAN, y no por nostalgia. Son el repliegue si
// falta una hoja o si aparece un arma sin icono dibujado, y en ese caso siguen
// diciendo lo que decían: la forma agrupa por COMPORTAMIENTO —flecha para
// proyectil, anillo para orbital— así que un arma nueva sin arte se lee por su
// familia en vez de salir en blanco. Ver dibujarIconoArma.

// --- Medidas -----------------------------------------------------------------
//
// DOS BLOQUES separados por una línea vertical: a un lado la TARJETA DE
// IDENTIDAD (retrato, nombre y nivel), al otro el ESTADO (vida, experiencia y
// las ocho ranuras). Sigue el diseño de referencia que pasó Sergio.
//
// La separación no es decorativa: son dos cosas que se consultan en momentos
// distintos. Quién eres se mira una vez al empezar y luego solo de reojo para
// localizar tu esquina; cuánta vida te queda se mira cada pocos segundos. Con
// todo mezclado en una sola columna, el ojo tenía que recorrer la ficha entera
// para encontrar la barra.
const ANCHO = 162;
const MARGEN = 9;              // separación al borde de la pantalla
const RELLENO_H = 5;           // margen interior horizontal
const RELLENO_V = 4;           // margen interior vertical

const TARJETA_ANCHO = 42;      // bloque de identidad
const HUECO_SEP = 4;           // aire a cada lado de la línea separadora
const COLUMNA = ANCHO - RELLENO_H * 2 - TARJETA_ANCHO - HUECO_SEP * 2;

const HUECO_RANURA = 5;        // entre ranuras de la misma fila
const HUECO_FILA = 4;          // entre la fila de armas y la de pasivos

// SIEMPRE cuatro ranuras por fila, llenas o vacías, y reparten el ancho entero
// de SU columna. Las vacías no son decoración: MAX_ARMAS y MAX_PASIVOS son 4,
// así que el hueco vacío dice cuánto te queda por elegir, que es una decisión
// que se toma cada subida de nivel. Con las ranuras apareciendo según se
// llenan, la fila cambiaba de tamaño y no se sabía si cabía algo más.
const RANURAS = 4;
const RANURA_W = (COLUMNA - (RANURAS - 1) * HUECO_RANURA) / RANURAS;
const RANURA_H = 17.5;         // algo más anchas que altas, como la referencia

// --- Alturas, medidas desde el borde superior de la ficha --------------------
const Y_VIDA = RELLENO_V, ALTO_VIDA = 9;
const Y_XP = 15, ALTO_XP = 6;
const Y_ARMAS = 24.5;
const Y_PASIVOS = Y_ARMAS + RANURA_H + HUECO_FILA;

// Alto total de la ficha, y su margen. Los exporta para que el menú de subida de
// nivel pueda colocarse por detrás sin repetir la aritmética: cuando la ficha
// cambiaba de tamaño, el menú se quedaba con el número viejo y se solapaban.
export const ALTO_FICHA = Y_PASIVOS + RANURA_H + RELLENO_V;
export const MARGEN_FICHA = MARGEN;

// Dentro de la tarjeta de identidad.
const TARJETA_ALTO = ALTO_FICHA - RELLENO_V * 2;
const RETRATO_INSET = 3;
const RETRATO_ANCHO = TARJETA_ANCHO - RETRATO_INSET * 2;
const Y_RETRATO = RELLENO_V + 2;
const ALTO_RETRATO = 36;
const Y_NOMBRE = 49.5;
const Y_NIVEL = 58.5;

// Radios de esquina. Todo redondeado y en cascada: la ficha más que la tarjeta,
// la tarjeta más que las ranuras. Es lo que hace que las piezas pequeñas se lean
// como contenidas dentro de las grandes y no como pegatinas encima.
const R_FICHA = 5;
const R_TARJETA = 3;
const R_RANURA = 2.5;
const R_BARRA = 1.5;

export const COLOR_JUGADOR = ['#5aa9e6', '#e8b73a', '#8fbf5a', '#d64b8f'];
export const COLOR_PASIVO = '#9fd0e8';

// --- Colores -----------------------------------------------------------------
// TODOS los rellenos son translúcidos. La ficha tiene caja, pero se ve el juego
// a través de ella: con cuatro jugadores, cuatro cajas opacas taparían las
// cuatro esquinas del anfiteatro.
const PANEL_FONDO   = 'rgba(18,13,10,.34)';
const PANEL_BORDE   = 'rgba(236,226,206,.30)';
const HUECO_FONDO   = 'rgba(10,7,6,.26)';   // tarjeta y ranuras
const SEPARADOR     = 'rgba(236,226,206,.28)';
const CARRIL        = 'rgba(8,6,5,.52)';    // fondo de las barras
const CARRIL_BORDE  = 'rgba(236,226,206,.22)';

// Vida ROJA, siempre, sin cambiar de color al bajar. El semáforo verde-ámbar-
// rojo daba la misma información dos veces —la longitud de la barra ya dice
// cuánto queda— y a cambio hacía que la barra llena y la barra crítica fueran
// dos objetos distintos en pantalla, que es justo lo que no quieres cuando
// buscas tu propia ficha entre cuatro.
const COLOR_VIDA = '#c8443c';
const COLOR_VIDA_ALTO = 'rgba(255,196,186,.40)';   // filo superior, da volumen
// Escudo de la Égida, sobre la misma barra que la vida. Azul acero y no otro
// rojo: tiene que distinguirse de la vida de un vistazo, porque se pierde y se
// recupera solo mientras la vida no se mueve.
const COLOR_ESCUDO = '#6fa8d6';
const COLOR_ESCUDO_ALTO = 'rgba(220,240,255,.55)';

// Experiencia en azul oscuro e IGUAL para los cuatro: es la única barra que mide
// lo mismo para todo el mundo —cuánto falta para la siguiente elección— y
// teñirla del color de cada jugador la convertía en otra marca de identidad
// más, compitiendo con el nombre y con las ranuras.
const COLOR_XP = '#2f5aa8';
const COLOR_XP_ALTO = 'rgba(150,190,255,.35)';

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
// Precalculadas al cargar el módulo. Componer estas cadenas dentro del bucle de
// dibujado serían ocho por jugador y frame tiradas a la basura.
const BORDE_VACIA = COLOR_JUGADOR.map((c) => rgba(c, 0.26));
const BORDE_LLENA = COLOR_JUGADOR.map((c) => rgba(c, 0.55));

// Sombra de las formas. Para el texto se usa textoBorde, que da un contorno más
// duro; para los glifos basta con esto y no hay que pelearse con los grosores de
// línea que cada uno se pone por su cuenta.
//
// No hace falta apagarla a mano: la sombra sí entra en la pila de save/restore
// del canvas —al contrario que letterSpacing, ver ui/capa.js— y todos los sitios
// que la ponen están dentro de un save.
function sombraDura(ctx) {
  ctx.shadowColor = 'rgba(5,4,9,.95)';
  ctx.shadowBlur = 2.5;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;
}

// --- Iconos -----------------------------------------------------------------
// Cada comportamiento tiene su glifo. Todos caben en una casilla de 15x15 y se
// dibujan centrados en (0,0) tras trasladar, para no repetir la aritmética.
export function glifoArma(ctx, comportamiento, r) {
  ctx.beginPath();
  switch (comportamiento) {
    case 'proyectilDirigido':          // punta de flecha: busca blanco
      ctx.moveTo(-r * 0.7, r * 0.6); ctx.lineTo(r * 0.8, 0); ctx.lineTo(-r * 0.7, -r * 0.6);
      ctx.closePath(); ctx.fill();
      break;
    case 'arcoMelee':                  // arco de corte
      ctx.arc(-r * 0.3, 0, r * 0.9, -1.0, 1.0);
      ctx.stroke();
      break;
    case 'conoCorto':                  // cono abierto de perdigones
      ctx.moveTo(-r * 0.8, 0);
      ctx.lineTo(r * 0.8, -r * 0.75); ctx.moveTo(-r * 0.8, 0);
      ctx.lineTo(r * 0.8, 0); ctx.moveTo(-r * 0.8, 0);
      ctx.lineTo(r * 0.8, r * 0.75);
      ctx.stroke();
      break;
    case 'direccionFija':              // dos flechas opuestas
      ctx.moveTo(-r * 0.9, 0); ctx.lineTo(r * 0.9, 0);
      ctx.moveTo(r * 0.9, 0); ctx.lineTo(r * 0.3, -r * 0.45);
      ctx.moveTo(r * 0.9, 0); ctx.lineTo(r * 0.3, r * 0.45);
      ctx.moveTo(-r * 0.9, 0); ctx.lineTo(-r * 0.3, -r * 0.45);
      ctx.moveTo(-r * 0.9, 0); ctx.lineTo(-r * 0.3, r * 0.45);
      ctx.stroke();
      break;
    case 'direccionAleatoria':         // chispas dispersas
      for (let i = 0; i < 5; i++) {
        const a = i * 1.257;
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85);
      }
      ctx.stroke();
      break;
    case 'proyectilExplosivo':         // proyectil con estallido delante
      ctx.moveTo(-r * 0.9, 0); ctx.lineTo(0, 0); ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = i * 1.047;
        ctx.moveTo(r * 0.35, 0);
        ctx.lineTo(r * 0.35 + Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55);
      }
      ctx.stroke();
      break;
    case 'bombardeoAleatorio':         // tres impactos cayendo
      for (let i = 0; i < 3; i++) {
        const x = -r * 0.7 + i * r * 0.7;
        ctx.moveTo(x, -r * 0.9); ctx.lineTo(x, r * 0.1);
        ctx.moveTo(x - r * 0.3, r * 0.5); ctx.lineTo(x + r * 0.3, r * 0.5);
      }
      ctx.stroke();
      break;
    case 'ondaCircular':               // dos anillos concéntricos
      ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.9, 0, Math.PI * 2); ctx.stroke();
      break;
    case 'auraPasiva':                 // disco relleno tenue con borde
      ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2);
      ctx.globalAlpha *= 0.35; ctx.fill(); ctx.globalAlpha /= 0.35;
      ctx.stroke();
      break;
    case 'zonaPersistente':            // charco irregular
      ctx.ellipse(0, r * 0.15, r * 0.9, r * 0.55, 0, 0, Math.PI * 2);
      ctx.globalAlpha *= 0.4; ctx.fill(); ctx.globalAlpha /= 0.4;
      ctx.stroke();
      break;
    case 'rayoPerforante':             // haz recto que cruza entero
      ctx.moveTo(-r, -r * 0.25); ctx.lineTo(r, -r * 0.25);
      ctx.moveTo(-r, r * 0.25); ctx.lineTo(r, r * 0.25);
      ctx.stroke();
      break;
    case 'orbital':                    // órbita con dos cuentas
      ctx.arc(0, 0, r * 0.7, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.arc(r * 0.7, 0, r * 0.28, 0, Math.PI * 2);
      ctx.arc(-r * 0.7, 0, r * 0.28, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'orbitalPulsante':            // la misma órbita, pero a trazos: va y viene
      for (let i = 0; i < 4; i++) {
        const a0 = i * (Math.PI / 2) + 0.35;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.7, a0, a0 + 0.8);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(r * 0.7, 0, r * 0.28, 0, Math.PI * 2);
      ctx.arc(-r * 0.7, 0, r * 0.28, 0, Math.PI * 2);
      ctx.fill();
      break;
    default:
      ctx.arc(0, 0, r * 0.7, 0, Math.PI * 2); ctx.stroke();
  }
}

// Los pasivos se distinguen por el campo que tocan, no por su nombre: así un
// pasivo nuevo que suba la velocidad hereda el glifo de velocidad sin tocar nada.
export function glifoPasivo(ctx, campo, r) {
  ctx.beginPath();
  switch (campo) {
    case 'velocidad':                  // ala
      ctx.moveTo(-r * 0.8, r * 0.4); ctx.lineTo(r * 0.8, -r * 0.5);
      ctx.lineTo(r * 0.1, r * 0.5); ctx.closePath(); ctx.fill();
      break;
    case 'armadura':                   // escudo
      ctx.moveTo(0, -r * 0.9); ctx.lineTo(r * 0.75, -r * 0.4);
      ctx.lineTo(r * 0.5, r * 0.8); ctx.lineTo(0, r);
      ctx.lineTo(-r * 0.5, r * 0.8); ctx.lineTo(-r * 0.75, -r * 0.4);
      ctx.closePath(); ctx.fill();
      break;
    case 'bonusDanyo':                 // anillo
      ctx.arc(0, 0, r * 0.7, 0, Math.PI * 2); ctx.lineWidth = 2.5; ctx.stroke();
      break;
    case 'reduccionRecarga':           // reloj
      ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -r * 0.55);
      ctx.moveTo(0, 0); ctx.lineTo(r * 0.4, 0); ctx.stroke();
      break;
    case 'regeneracion':               // cruz
      ctx.fillRect(-r * 0.22, -r * 0.85, r * 0.44, r * 1.7);
      ctx.fillRect(-r * 0.85, -r * 0.22, r * 1.7, r * 0.44);
      break;
    case 'bonusArea':                  // llama
      ctx.moveTo(0, -r); ctx.quadraticCurveTo(r * 0.9, 0, 0, r * 0.85);
      ctx.quadraticCurveTo(-r * 0.9, 0, 0, -r); ctx.fill();
      break;
    case 'radioRecogida':              // imán
      ctx.arc(0, r * 0.2, r * 0.75, Math.PI, 0); ctx.lineWidth = 3; ctx.stroke();
      break;
    case 'vidaMaxima':                 // ánfora
      ctx.moveTo(-r * 0.4, -r * 0.8); ctx.lineTo(r * 0.4, -r * 0.8);
      ctx.lineTo(r * 0.6, r * 0.5); ctx.lineTo(0, r * 0.95);
      ctx.lineTo(-r * 0.6, r * 0.5); ctx.closePath(); ctx.fill();
      break;
    default:
      ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2); ctx.fill();
  }
}

// --- Iconos en PIXEL ART real -------------------------------------------
//
// Los glifos de arriba son trazos vectoriales: limpios a cualquier tamaño,
// pero lisos, y este juego es pixel art en todo lo demás (sección 13 del
// plan). Sin encargar 58 ilustraciones —una por arma y por pasivo—, la forma
// de que el icono hable el mismo idioma que el resto del arte es rasterizar
// cada glifo UNA VEZ a una rejilla pequeña y clavarlo luego a cualquier
// tamaño sin suavizado, igual que ESCALA_ARTE hace con el mundo: se ven los
// bloques de píxel en vez de una curva perfecta reducida.
//
// SE CACHEA POR (tipo, color). Con doce comportamientos de arma y ocho
// campos de pasivo, y bastantes colores repetidos entre armas del catálogo
// de 50, son como mucho unas pocas docenas de lienzos diminutos — creados la
// PRIMERA vez que hace falta cada combinación, nunca en el bucle de dibujado.
// No es el "cero `new` durante la partida" de las entidades del mundo (eso es
// para el bucle de 60 pasos por segundo con la pantalla llena); esto son unos
// pocos lienzos de 20x20 que se crean una vez, normalmente en la primera
// subida de nivel, y se reutilizan el resto de la partida.
const REJILLA_ICONO = 20;
const _cacheIconos = new Map();

function rasterizarIcono(pintar, color) {
  const c = document.createElement('canvas');
  c.width = c.height = REJILLA_ICONO;
  const cx = c.getContext('2d');
  cx.translate(REJILLA_ICONO / 2, REJILLA_ICONO / 2);
  cx.strokeStyle = color;
  cx.fillStyle = color;
  cx.lineWidth = 1.7;
  cx.lineJoin = 'round';
  cx.lineCap = 'round';
  pintar(cx, REJILLA_ICONO * 0.34);
  return c;
}

// Blit sin suavizado a cualquier tamaño. `imageSmoothingEnabled` se restaura
// al valor que traía el contexto: la capa de interfaz lo deja encendido para
// el retrato y el texto (ver ui/capa.js), y este es el único rincón que lo
// quiere apagado un instante.
function blitIcono(ctx, canvasIcono, x, y, r) {
  const suavizado = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  const d = r * 2;
  ctx.drawImage(canvasIcono, x - r, y - r, d, d);
  ctx.imageSmoothingEnabled = suavizado;
}

// --- Reparto de las hojas de iconos --------------------------------------
//
// Cada hoja es una tira horizontal de fotogramas cuadrados y trae en el atlas
// su propio `orden`: la lista de ids, hueco por hueco, tal como la escribió
// herramientas/procesar-assets.ps1. Se le da la vuelta UNA vez, la primera vez
// que hace falta un icono, y a partir de ahí buscar el hueco de un arma es
// mirar un Map. Se hace tarde y no al cargar el módulo porque en ese momento
// el atlas todavía no existe: lo llena Recursos.cargar() antes del primer
// frame, y este archivo se importa mucho antes.
const _huecos = new Map();          // 'iconosArmas' -> Map(id -> fotograma)

function repartoDe(idHoja) {
  let mapa = _huecos.get(idHoja);
  if (mapa) return mapa;

  mapa = new Map();
  _huecos.set(idHoja, mapa);
  const meta = Recursos.meta(idHoja);
  // Sin imagen no hay reparto: el mapa se queda vacío y todo cae al glifo.
  if (!meta || !meta.orden || !Recursos.imagen(idHoja)) return mapa;
  for (let i = 0; i < meta.orden.length; i++) mapa.set(meta.orden[i], i);

  // Las EVOLUCIONES no llevan icono propio en la hoja: heredan el del arma de
  // la que salen. Quién evoluciona en qué ya está en datos/armas.js, así que
  // pedir cinco dibujos más habría sido duplicar en el arte algo que los datos
  // ya dicen. Además se lee bien en la ficha: el Pilum de Júpiter enseña el
  // pilum, que es de donde viene.
  if (idHoja === 'iconosArmas') {
    for (const id of Object.keys(ARMAS)) {
      const evo = ARMAS[id].evolucion;
      if (evo && mapa.has(id) && !mapa.has(evo.arma)) mapa.set(evo.arma, mapa.get(id));
    }
  }
  return mapa;
}

// Un fotograma de la hoja, centrado en (x,y) con radio r y sin suavizado.
// `ctx.shadowBlur`/`shadowColor` puestos por quien llama SÍ afectan al blit
// —drawImage respeta la sombra del contexto igual que fill/stroke— así que el
// resplandor de "al máximo" de ui/ficha.js sigue funcionando igual.
function blitHoja(ctx, idHoja, hueco, x, y, r) {
  const img = Recursos.imagen(idHoja);
  const meta = Recursos.meta(idHoja);
  const suavizado = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  const d = r * 2;
  ctx.drawImage(img, hueco * meta.w, 0, meta.w, meta.h, x - r, y - r, d, d);
  ctx.imageSmoothingEnabled = suavizado;
}

// Icono de un arma, centrado en (x,y) con radio r.
//
// `color` es el del arma en sus datos y ya SOLO se usa en el repliegue: los
// iconos dibujados traen su propia paleta y teñirlos sería taparla.
export function dibujarIconoArma(ctx, x, y, r, idArma, color) {
  const hueco = repartoDe('iconosArmas').get(idArma);
  if (hueco !== undefined) return blitHoja(ctx, 'iconosArmas', hueco, x, y, r);

  const def = ARMAS[idArma];
  const comportamiento = def ? def.comportamiento : '';
  const llave = 'a:' + comportamiento + '|' + color;
  let c = _cacheIconos.get(llave);
  if (!c) { c = rasterizarIcono((cx, rr) => glifoArma(cx, comportamiento, rr), color); _cacheIconos.set(llave, c); }
  blitIcono(ctx, c, x, y, r);
}

export function dibujarIconoPasivo(ctx, x, y, r, idPasivo, color) {
  const hueco = repartoDe('iconosObjetos').get(idPasivo);
  if (hueco !== undefined) return blitHoja(ctx, 'iconosObjetos', hueco, x, y, r);

  const def = PASIVOS[idPasivo];
  const campo = def ? def.campo : '';
  const llave = 'p:' + campo + '|' + color;
  let c = _cacheIconos.get(llave);
  if (!c) { c = rasterizarIcono((cx, rr) => glifoPasivo(cx, campo, rr), color); _cacheIconos.set(llave, c); }
  blitIcono(ctx, c, x, y, r);
}

// Retrato del personaje: un BUSTO —cabeza, hombros y pecho— recortado de la
// ILUSTRACIÓN ORIGINAL por la herramienta (ver RecortarCabeza en
// procesar-assets.ps1) y guardado en el atlas como `<id>Cara` a 264x438.
//
// CUADRADO: de los hombros a la cabeza y nada más. El busto largo que llegaba al
// pecho encajaba en la columna vertical del diseño anterior, pero aquí el
// retrato va en un recuadro casi cuadrado dentro de su tarjeta, y ahí un busto
// obliga a alejar la cámara: la cara —lo único que identifica al jugador de un
// vistazo— se quedaba pequeña para dejar sitio a una camiseta que no dice nada.
//
// 288x288 y no 192x192, que es lo que había: esta capa dibuja a la resolución
// real del monitor, así que con zoom de pantalla 3x y densidad 2x un retrato de
// 36 unidades pide 216 píxeles de verdad. Desde 192 había que AMPLIARLO, y por
// eso se veía blando pese a venir de una ilustración de 650x1492.
//
// Se dibuja CON suavizado, al revés que el mundo. El juego es pixel art y va a
// vecino más próximo; el retrato es interfaz y puede permitirse todo el detalle
// que tenga la ilustración.
function dibujarCabeza(ctx, x, y, ancho, alto, jugador) {
  const img = Recursos.imagen(jugador.id + 'Cara');
  if (!img) return;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, ancho, alto, R_TARJETA);
  ctx.clip();

  // Encaje "cubrir": se escala por el lado que se quede corto y se centra, así
  // que el hueco queda lleno pase lo que pase con la proporción de la fuente.
  // Recortar unas décimas por los lados es invisible; una banda vacía, no.
  const escala = Math.max(ancho / img.width, alto / img.height);
  const w = img.width * escala;
  const h = img.height * escala;
  ctx.drawImage(img, x + (ancho - w) / 2, y + (alto - h) / 2, w, h);
  ctx.restore();
}

// Rectángulo redondeado, relleno y/o con borde. Se repite en la ficha, la
// tarjeta, las ranuras y las barras, y siempre con las mismas tres decisiones.
function caja(ctx, x, y, w, h, r, relleno, borde, grosor = 1) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (relleno) { ctx.fillStyle = relleno; ctx.fill(); }
  if (borde) { ctx.lineWidth = grosor; ctx.strokeStyle = borde; ctx.stroke(); }
}

// Barra con carril, relleno redondeado y un filo claro arriba que le da volumen.
// El carril oscuro no es "fondo del panel": es parte de la barra, y sin él no se
// distingue lo que falta de lo que directamente no hay.
function dibujarBarra(ctx, x, y, w, h, frac, color, filo) {
  caja(ctx, x, y, w, h, R_BARRA, CARRIL, CARRIL_BORDE);
  if (frac <= 0) return;

  // El relleno se recorta contra el carril, así que a fracciones bajas conserva
  // la esquina redondeada de la izquierda y no se convierte en una astilla.
  const w2 = Math.max(h * 0.5, w * frac);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, R_BARRA);
  ctx.clip();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w2, h, R_BARRA);
  ctx.fill();
  ctx.fillStyle = filo;
  ctx.fillRect(x, y + 0.5, w2, 1);
  ctx.restore();
}

// Ranura: marco suave siempre, y dentro el glifo y el nivel si está ocupada.
// `marco` es el borde ya teñido con el color del jugador.
// `redonda` distingue objetos de armas también aquí, con la misma regla que la
// ficha de jugador: cuadrado el arma, redondo el objeto. Que las dos pantallas
// usen la misma forma para la misma cosa es la mitad de lo que hace que se
// puedan leer de reojo.
function dibujarRanura(ctx, x, y, marco, color, nivel, pintarGlifo, redonda) {
  const r = redonda ? RANURA_H / 2 : R_RANURA;
  caja(ctx, x + 0.5, y + 0.5, RANURA_W - 1, RANURA_H - 1, r,
       HUECO_FONDO, marco);

  if (pintarGlifo === null) return;

  ctx.save();
  ctx.translate(x + RANURA_W / 2, y + RANURA_H / 2 - 1);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  sombraDura(ctx);
  pintarGlifo(ctx, RANURA_H * 0.34);
  ctx.restore();

  // El nivel va en la esquina inferior derecha, PISANDO el borde de la ranura.
  // Dentro tendría que competir con el glifo por el mismo hueco; encima del
  // borde, con su propio reborde oscuro, se lee sin quitarle sitio a nada.
  ctx.font = `700 7px ${FUENTE}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  textoBorde(ctx, String(nivel), x + RANURA_W - 0.5, y + RANURA_H, '#ffffff', 2.4);
}

// --- Reloj de partida --------------------------------------------------------
// El tiempo que llevas es el dato más importante que hay en pantalla después de
// tu vida: la curva de dificultad está escrita contra el reloj, así que saber
// que quedan dos minutos para el minuto 10 es saber lo que viene.
//
// Arriba en el centro, la única franja que ni las fichas ni los menús usan. Sin
// caja: solo reborde oscuro, como manda la interfaz en capa nítida.
//
// Debajo van los AVISOS del director —élites y hitos de jefe—, que duran unos
// segundos y desaparecen. Es lo único de la interfaz que aparece y se va, y por
// eso puede permitirse el amarillo: no compite con nada porque no está casi
// nunca.
const COLOR_AVISO = '#ffd45a';

export function dibujarReloj(ctx) {
  if (!Director.nivel) return;
  const t = Tema.actual;
  const cx = ANCHO_UI / 2;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  ctx.font = `600 16px ${FUENTE}`;
  textoBorde(ctx, Director.reloj, cx, 6, Director.activo ? t.titulo : t.apagado, 3);

  if (Director.avisoRestante > 0) {
    // Se desvanece al final en vez de cortarse en seco: un texto que se apaga
    // no roba la vista, y en este juego la vista hace falta en otro sitio.
    ctx.globalAlpha = Math.min(1, Director.avisoRestante / 1.2);
    ctx.font = `600 11px ${FUENTE}`;
    textoBorde(ctx, Director.aviso, cx, 26, COLOR_AVISO, 3);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

export function dibujarPaneles(ctx, jugadores) {
  ctx.save();

  for (let i = 0; i < jugadores.length; i++) {
    const j = jugadores[i];
    const armas = j.arsenal ? j.arsenal.equipadas : [];
    const idsPasivos = Object.keys(j.pasivos);
    const indice = i % COLOR_JUGADOR.length;
    const color = COLOR_JUGADOR[indice];

    // Esquinas: 0 arriba-izq, 1 arriba-der, 2 abajo-izq, 3 abajo-der. Los de la
    // derecha van ESPEJADOS —tarjeta de identidad hacia el borde de pantalla—
    // para que las dos fichas de arriba se lean como un par simétrico y no como
    // la misma pieza repetida y descolgada.
    const derecha = (i % 2) === 1;
    const abajo = i >= 2;
    const x = derecha ? ANCHO_UI - ANCHO - MARGEN : MARGEN;
    const y = abajo ? ALTO_UI - ALTO_FICHA - MARGEN : MARGEN;

    // --- Caja de la ficha -------------------------------------------------
    caja(ctx, x + 0.5, y + 0.5, ANCHO - 1, ALTO_FICHA - 1, R_FICHA,
         PANEL_FONDO, PANEL_BORDE);

    // --- Tarjeta de identidad: retrato, nombre y nivel --------------------
    const xTarjeta = derecha ? x + ANCHO - RELLENO_H - TARJETA_ANCHO
                             : x + RELLENO_H;
    caja(ctx, xTarjeta, y + RELLENO_V, TARJETA_ANCHO, TARJETA_ALTO, R_TARJETA,
         HUECO_FONDO, null);
    dibujarCabeza(ctx, xTarjeta + RETRATO_INSET, y + Y_RETRATO,
                  RETRATO_ANCHO, ALTO_RETRATO, j);

    const cxTarjeta = xTarjeta + TARJETA_ANCHO / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 9px ${FUENTE}`;
    textoBorde(ctx, `P${i + 1} ${j.def.nombre}`, cxTarjeta, y + Y_NOMBRE,
               j.abatido ? '#c0453f' : color, 2.6);
    ctx.font = `700 8.5px ${FUENTE}`;
    textoBorde(ctx, `LV ${j.nivel}`, cxTarjeta, y + Y_NIVEL, '#f0e8d8', 2.6);

    // --- Línea separadora -------------------------------------------------
    // Marca que a un lado está QUIÉN eres y al otro CÓMO estás. Son dos cosas
    // que se consultan en momentos distintos.
    const xSep = derecha ? xTarjeta - HUECO_SEP : xTarjeta + TARJETA_ANCHO + HUECO_SEP;
    ctx.beginPath();
    ctx.moveTo(xSep, y + RELLENO_V + 1);
    ctx.lineTo(xSep, y + ALTO_FICHA - RELLENO_V - 1);
    ctx.lineWidth = 1;
    ctx.strokeStyle = SEPARADOR;
    ctx.stroke();

    // --- Columna de estado -------------------------------------------------
    const bx = derecha ? x + RELLENO_H : xSep + HUECO_SEP;

    const fracVida = Math.max(0, j.vida / j.vidaMaxima);
    dibujarBarra(ctx, bx, y + Y_VIDA, COLUMNA, ALTO_VIDA, fracVida,
                 COLOR_VIDA, COLOR_VIDA_ALTO);

    // ESCUDO (potenciador Égida) POR ENCIMA de la barra de vida, en azul y sin
    // carril propio. Compartir la barra y no tener una suya es lo correcto:
    // ocupa lo que le toca sobre la MISMA escala que la vida, así que se lee de
    // un vistazo cuánto aguantas en total. Una segunda barra debajo obligaría a
    // sumar dos números en mitad de una horda.
    //
    // Solo aparece si hay escudo que enseñar: quien no haya comprado la Égida
    // no ve un hueco vacío pidiendo ser rellenado.
    if (j.escudo > 0) {
      const fracEscudo = Math.min(1, j.escudo / j.vidaMaxima);
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(bx, y + Y_VIDA, COLUMNA, ALTO_VIDA, R_BARRA);
      ctx.clip();
      ctx.fillStyle = COLOR_ESCUDO;
      ctx.fillRect(bx, y + Y_VIDA, COLUMNA * fracEscudo, ALTO_VIDA);
      ctx.fillStyle = COLOR_ESCUDO_ALTO;
      ctx.fillRect(bx, y + Y_VIDA + 0.5, COLUMNA * fracEscudo, 1);
      ctx.restore();
    }

    // SIN CIFRAS. La barra dice cuánta vida queda con su longitud y eso es todo
    // lo que hace falta mientras esquivas; el "83 / 115" encima obligaba a leer
    // un número en el peor momento posible para leer nada. Las cifras exactas
    // están en la ficha de jugador (ui/ficha.js), que se abre a propósito y con
    // el mundo parado, que es cuando de verdad se quieren mirar.
    const fracXp = j.xpNecesaria > 0 ? Math.min(1, j.xp / j.xpNecesaria) : 0;
    dibujarBarra(ctx, bx, y + Y_XP, COLUMNA, ALTO_XP, fracXp,
                 COLOR_XP, COLOR_XP_ALTO);

    // --- Filas de ranuras -----------------------------------------------
    // Se colocan de fuera hacia dentro: en las fichas espejadas, la primera
    // ranura queda pegada al borde de pantalla, que es el borde "de casa".
    const vacia = BORDE_VACIA[indice];
    const llena = BORDE_LLENA[indice];
    const paso = RANURA_W + HUECO_RANURA;
    const colocar = (k) => derecha
      ? bx + COLUMNA - RANURA_W - k * paso
      : bx + k * paso;

    for (let k = 0; k < RANURAS; k++) {
      const a = armas[k];
      dibujarRanura(ctx, colocar(k), y + Y_ARMAS, a ? llena : vacia,
        a ? a.def.color : null, a ? a.nivel : 0,
        a ? ((c, r) => dibujarIconoArma(c, 0, 0, r, a.id, a.def.color)) : null, false);
    }

    for (let k = 0; k < RANURAS; k++) {
      const id = idsPasivos[k];
      const def = id ? PASIVOS[id] : null;
      dibujarRanura(ctx, colocar(k), y + Y_PASIVOS, def ? llena : vacia,
        def ? COLOR_PASIVO : null, def ? j.pasivos[id] : 0,
        def ? ((c, r) => dibujarIconoPasivo(c, 0, 0, r, id, COLOR_PASIVO)) : null, true);
    }
  }

  ctx.restore();
}

// --- Barra de jefe (Fase 6, sección 14 del plan) -----------------------------
// A lo ancho de la parte inferior, solo mientras un jefe sigue en pie. Lo
// alimenta sistemas/jefes.js con Jefes.info(): este archivo no sabe nada de
// Cerbero ni de la Loba, solo pinta una fracción, un nombre y, si le llegan,
// unas marcas de fase o un aviso de furia.
const ANCHO_BARRA_JEFE = 300;
const ALTO_BARRA_JEFE = 9;
const MARGEN_BARRA_JEFE = 15;

const COLOR_JEFE = '#8a2f3a';          // púrpura-sangre, distinto del rojo de vida
const COLOR_JEFE_ALTO = 'rgba(255,180,170,.35)';
const COLOR_JEFE_FURIA = '#ff5a3a';
const COLOR_JEFE_FURIA_ALTO = 'rgba(255,220,180,.55)';
const COLOR_REGEN = '#e8c23a';         // dorado: se está curando, no pierdas el tiempo en su cuerpo

export function dibujarBarraJefe(ctx, info) {
  if (!info) return;
  const x = (ANCHO_UI - ANCHO_BARRA_JEFE) / 2;
  const y = ALTO_UI - MARGEN_BARRA_JEFE - ALTO_BARRA_JEFE;
  const t = Tema.actual;

  ctx.save();

  // Nombre encima, centrado. Reborde oscuro y ya, como el reloj: no hace
  // falta caja propia, con la barra de abajo el conjunto ya se lee como una
  // sola pieza.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 10px ${FUENTE}`;
  const titulo = info.furia ? `${info.nombre} · FURIA` : info.nombre;
  textoBorde(ctx, titulo, ANCHO_UI / 2, y - 4,
             info.furia ? COLOR_JEFE_FURIA : t.titulo, 3);

  // Pulso suave de la furia. Es puramente cosmético —no altera nada de la
  // simulación, así que tirar de performance.now() no rompe la
  // reproducibilidad del criterio 10— y es lo que hace que "furia" se lea
  // como un estado activo y no como un simple cambio de color fijo.
  const pulso = info.furia ? 0.75 + 0.25 * Math.sin(performance.now() * 0.012) : 1;

  caja(ctx, x + 0.5, y + 0.5, ANCHO_BARRA_JEFE - 1, ALTO_BARRA_JEFE - 1, R_BARRA,
       CARRIL, CARRIL_BORDE);

  const color = info.furia ? COLOR_JEFE_FURIA : COLOR_JEFE;
  const filo = info.furia ? COLOR_JEFE_FURIA_ALTO : COLOR_JEFE_ALTO;
  const w2 = Math.max(ALTO_BARRA_JEFE * 0.5, ANCHO_BARRA_JEFE * Math.max(0, info.frac));

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, ANCHO_BARRA_JEFE, ALTO_BARRA_JEFE, R_BARRA);
  ctx.clip();
  ctx.globalAlpha = pulso;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w2, ALTO_BARRA_JEFE, R_BARRA);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = filo;
  ctx.fillRect(x, y + 0.5, w2, 1);
  ctx.restore();

  // Marcas de fase (Cerbero): una raya fina en cada tercio de vida en el que
  // cambia de comportamiento. Es la única pista de que "cuando baje de aquí,
  // pasa algo distinto" sin tener que memorizar el plan.
  if (info.marcas) {
    ctx.strokeStyle = 'rgba(10,7,6,.75)';
    ctx.lineWidth = 1;
    for (let i = 0; i < info.marcas.length; i++) {
      const mx = Math.round(x + ANCHO_BARRA_JEFE * info.marcas[i]) + 0.5;
      ctx.beginPath();
      ctx.moveTo(mx, y + 1);
      ctx.lineTo(mx, y + ALTO_BARRA_JEFE - 1);
      ctx.stroke();
    }
  }

  // Regenerando (la Loba, con algún gemelo vivo): un filo dorado en vez de
  // dejar que la barra suba sola sin que se entienda por qué.
  if (info.regenerando) {
    ctx.strokeStyle = COLOR_REGEN;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.roundRect(x + 0.75, y + 0.75, ANCHO_BARRA_JEFE - 1.5, ALTO_BARRA_JEFE - 1.5, R_BARRA);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.strokeStyle = PANEL_BORDE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x + 0.5, y + 0.5, ANCHO_BARRA_JEFE - 1, ALTO_BARRA_JEFE - 1, R_BARRA);
  ctx.stroke();

  ctx.restore();
}
