import { ANCHO_FISICO, ALTO_FISICO } from '../core/constantes.js';
import { PASIVOS } from '../datos/pasivos.js';
import { Recursos } from '../core/recursos.js';
import { FUENTE, textoBorde } from './capa.js';

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
// LOS ICONOS SON PROCEDURALES, dibujados por código a partir del comportamiento
// del arma y del color que trae en sus datos. No hay ni un PNG de icono, y es
// deliberado: son 50 armas y 8 pasivos, y encargar 58 iconos para descubrir
// después que la mitad de las armas cambian sería tirar el trabajo. La forma
// dice qué HACE el arma —flecha para proyectil, anillo para orbital, ráfaga
// para explosivo—, que es justo lo que hay que leer de un vistazo. Con 50 armas
// repartidas en 12 comportamientos, el glifo agrupa por familia y eso es más
// útil que 50 dibujos distintos: lo que necesitas saber en mitad de una horda
// es si eso que llevas apunta solo o hay que colocarse.
//
// Cuando existan iconos de verdad, basta con meterlos en el atlas y sustituir
// dibujarIcono: el resto del panel no se entera.

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

const COLOR_JUGADOR = ['#5aa9e6', '#e8b73a', '#8fbf5a', '#d64b8f'];
const COLOR_PASIVO = '#9fd0e8';

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
function glifoArma(ctx, comportamiento, r) {
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
    default:
      ctx.arc(0, 0, r * 0.7, 0, Math.PI * 2); ctx.stroke();
  }
}

// Los pasivos se distinguen por el campo que tocan, no por su nombre: así un
// pasivo nuevo que suba la velocidad hereda el glifo de velocidad sin tocar nada.
function glifoPasivo(ctx, campo, r) {
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
function dibujarRanura(ctx, x, y, marco, color, nivel, pintarGlifo) {
  caja(ctx, x + 0.5, y + 0.5, RANURA_W - 1, RANURA_H - 1, R_RANURA,
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
    const x = derecha ? ANCHO_FISICO - ANCHO - MARGEN : MARGEN;
    const y = abajo ? ALTO_FISICO - ALTO_FICHA - MARGEN : MARGEN;

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

    // La cifra va DENTRO de la barra y centrada, como en la referencia: es el
    // mismo dato que la longitud, así que ponerla aparte sería gastar una línea
    // de ficha en repetir algo que ya se está diciendo.
    ctx.font = `700 7.5px ${FUENTE}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    textoBorde(ctx, `${Math.ceil(j.vida)} / ${Math.round(j.vidaMaxima)}`,
               bx + COLUMNA / 2, y + Y_VIDA + ALTO_VIDA / 2 + 0.5, '#ffffff', 2.4);

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
        a ? ((c, r) => glifoArma(c, a.def.comportamiento, r)) : null);
    }

    for (let k = 0; k < RANURAS; k++) {
      const id = idsPasivos[k];
      const def = id ? PASIVOS[id] : null;
      dibujarRanura(ctx, colocar(k), y + Y_PASIVOS, def ? llena : vacia,
        def ? COLOR_PASIVO : null, def ? j.pasivos[id] : 0,
        def ? ((c, r) => glifoPasivo(c, def.campo, r)) : null);
    }
  }

  ctx.restore();
}
