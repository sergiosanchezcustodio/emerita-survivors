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
// SIN MARCO Y SIN FONDO. No hay rectángulo detrás: los elementos flotan sobre
// el juego y se sostienen con un reborde oscuro. Con caja, el panel tapaba una
// esquina entera del anfiteatro y, con cuatro jugadores, cuatro esquinas — que
// en un juego donde lo que mata es quedar rodeado significa cuatro sitios por
// los que te llegan sin verlos venir. El reborde da la misma legibilidad y no
// cuesta ni un píxel de campo de visión.
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
// La ficha entera se redujo alrededor de un 20%, y las ranuras algo MÁS que el
// resto: seguían repartiendo el ancho completo, pero con un hueco mayor entre
// ellas quedan más pequeñas sin dejar de cuadrar con los bordes de la ficha.
// Ocupar el ancho entero era el requisito; ser gruesas, no.
const ANCHO = 122;         // ancho de la columna de contenido (antes 152)
const MARGEN = 9;
const CABEZA = 28;         // lado del retrato (antes 40)
const HUECO_CABEZA = 6;    // separación entre retrato y columna de texto
const HUECO_RANURA = 7;    // entre ranuras de la misma fila
const HUECO_FILA = 5;      // entre la fila de armas y la de pasivos

// SIEMPRE cuatro ranuras por fila, llenas o vacías, y reparten el ancho entero
// del panel. Las vacías no son decoración: MAX_ARMAS y MAX_PASIVOS son 4, así
// que el hueco vacío dice cuánto te queda por elegir, que es una decisión que
// se toma cada subida de nivel. Con las ranuras apareciendo según se llenan, la
// fila cambiaba de tamaño y no se sabía si cabía algo más.
const RANURAS = 4;
const RANURA = (ANCHO - (RANURAS - 1) * HUECO_RANURA) / RANURAS;

// --- Alturas de la banda superior --------------------------------------------
// El retrato termina EXACTAMENTE donde termina la barra de experiencia, y las
// filas de ranuras arrancan justo debajo de las dos. Antes la cabeza colgaba por
// debajo del bloque de texto y dejaba una franja muerta a su derecha; subirla y
// cerrarla contra la barra de experiencia es lo que permite recortar la ficha
// sin quitarle nada.
const Y_VIDA = 13, ALTO_VIDA = 7;
const Y_XP = 24, ALTO_XP = 4;          // 24 + 4 = 28 = CABEZA

// Alto total de la ficha, y su margen. Los exporta para que el menú de subida de
// nivel pueda colocarse por detrás sin repetir la aritmética: cuando la ficha
// cambiaba de tamaño, el menú se quedaba con el número viejo y se solapaban.
export const ALTO_FICHA = CABEZA + 2 * (RANURA + HUECO_FILA);
export const MARGEN_FICHA = MARGEN;

const COLOR_JUGADOR = ['#5aa9e6', '#e8b73a', '#8fbf5a', '#d64b8f'];
const COLOR_PASIVO = '#9fd0e8';

// La experiencia es IGUAL para los cuatro. Es la única barra que mide lo mismo
// para todo el mundo —cuánto falta para la siguiente elección— y teñirla del
// color de cada jugador la convertía en otra marca de identidad más, compitiendo
// con el nombre y con las ranuras. Marfil, que además es el material del nivel.
const COLOR_XP = '#e9d9a4';

// Marco de la ranura: suave, translúcido y TEÑIDO DEL COLOR DEL JUGADOR. Lleva
// relleno oscuro Y borde claro porque el panel no tiene fondo: contra la arena
// del anfiteatro solo el borde de color desaparecería, y contra una zona de
// fuego solo el relleno oscuro.
const RANURA_FONDO = 'rgba(10,8,16,.30)';

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
// Precalculadas al cargar el módulo. Componer estas cadenas dentro del bucle de
// dibujado serían ocho por jugador y frame tiradas a la basura.
const BORDE_VACIA = COLOR_JUGADOR.map((c) => rgba(c, 0.24));
const BORDE_LLENA = COLOR_JUGADOR.map((c) => rgba(c, 0.46));

// Sombra de las formas. Para el texto se usa textoBorde, que da un contorno más
// duro; para los glifos basta con esto y no hay que pelearse con los grosores de
// línea que cada uno se pone por su cuenta.
function sombraDura(ctx) {
  ctx.shadowColor = 'rgba(5,4,9,.95)';
  ctx.shadowBlur = 2.5;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;
}
function sinSombra(ctx) {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
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

// Retrato del personaje, recortado de la ILUSTRACIÓN ORIGINAL por la herramienta
// (ver RecortarCabeza en procesar-assets.ps1) y guardado en el atlas como
// `<id>Cara` a 192x192.
//
// 192 y no 72, que es lo que había: esta capa dibuja a la resolución real del
// monitor, así que con zoom de pantalla 3x y densidad 2x un retrato de 28
// unidades pide 168 píxeles de verdad. Desde una fuente de 72 había que
// AMPLIARLO, y por eso se veía blando pese a venir de una ilustración enorme.
//
// Se dibuja CON suavizado, al revés que el mundo. El juego es pixel art y va a
// vecino más próximo; el retrato es interfaz y puede permitirse todo el detalle
// que tenga la ilustración. Ahora además se resuelve a la resolución real de la
// pantalla, así que en un monitor denso se ve la pincelada.
//
// Sin marco: se desvanece por abajo con un degradado en vez de cortarse contra
// un borde. Un recorte duro sin caja que lo justifique parece un error.
function dibujarCabeza(ctx, x, y, jugador) {
  const img = Recursos.imagen(jugador.id + 'Cara');
  if (!img) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, CABEZA, CABEZA);
  ctx.clip();

  sombraDura(ctx);
  ctx.drawImage(img, x, y, CABEZA, CABEZA);
  sinSombra(ctx);

  // Desvanecido por abajo. Se BORRA con 'destination-out' en vez de pintar un
  // degradado del color del fondo, porque aquí no hay fondo: debajo está el
  // juego, y un degradado a un color concreto se vería como una mancha.
  const desde = y + CABEZA * 0.70;
  const grad = ctx.createLinearGradient(0, desde, 0, y + CABEZA);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = grad;
  ctx.fillRect(x, desde, CABEZA, CABEZA * 0.30);
  ctx.restore();
}

// Ranura: marco suave siempre, y dentro el glifo y el nivel si está ocupada.
// `marco` es el borde ya teñido con el color del jugador.
function dibujarRanura(ctx, x, y, marco, color, nivel, pintarGlifo) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x + 0.5, y + 0.5, RANURA - 1, RANURA - 1, 3);
  ctx.fillStyle = RANURA_FONDO;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = marco;
  ctx.stroke();
  ctx.restore();

  if (pintarGlifo === null) return;

  ctx.save();
  ctx.translate(x + RANURA / 2, y + RANURA / 2);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  sombraDura(ctx);
  pintarGlifo(ctx, RANURA * 0.31);
  ctx.restore();

  // El nivel es un dato de apoyo, no un titular: pequeño y en la esquina.
  ctx.font = `600 6px ${FUENTE}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  textoBorde(ctx, String(nivel), x + RANURA - 1.5, y + RANURA - 1, '#ffffff', 1.8);
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
    // derecha van ESPEJADOS —retrato a la derecha, texto e iconos alineados a
    // la derecha— porque sin caja que los encuadre, un bloque alineado a la
    // izquierda pegado al borde derecho se lee como descolgado.
    const derecha = (i % 2) === 1;
    const abajo = i >= 2;
    const x = derecha ? ANCHO_FISICO - ANCHO - MARGEN : MARGEN;
    const y = abajo ? ALTO_FISICO - ALTO_FICHA - MARGEN : MARGEN;

    // --- Retrato --------------------------------------------------------
    const xCabeza = derecha ? x + ANCHO - CABEZA : x;
    dibujarCabeza(ctx, xCabeza, y, j);

    // --- Nombre, nivel, vida y experiencia ------------------------------
    const bx = derecha ? x : x + CABEZA + HUECO_CABEZA;
    const anchoBarra = ANCHO - CABEZA - HUECO_CABEZA;
    const xFin = bx + anchoBarra;

    ctx.font = `600 11px ${FUENTE}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = derecha ? 'right' : 'left';
    const xNombre = derecha ? xFin : bx;
    textoBorde(ctx, `P${i + 1}  ${j.def.nombre}`, xNombre, y,
               j.abatido ? '#c0453f' : color, 2.6);

    ctx.textAlign = derecha ? 'left' : 'right';
    ctx.font = `500 8.5px ${FUENTE}`;
    textoBorde(ctx, `LV ${j.nivel}`, derecha ? bx : xFin, y + 2, '#cdc5b6', 2.6);

    // Barra de vida. El carril oscuro no es "fondo del panel": es parte de la
    // barra, y sin él no se distingue lo que falta de lo que no hay.
    const fracVida = Math.max(0, j.vida / j.vidaMaxima);
    sombraDura(ctx);
    ctx.fillStyle = 'rgba(10,8,14,.8)';
    ctx.fillRect(bx, y + Y_VIDA, anchoBarra, ALTO_VIDA);
    sinSombra(ctx);
    ctx.fillStyle = fracVida > 0.5 ? '#8fbf5a' : (fracVida > 0.25 ? '#d8a13c' : '#c0453f');
    ctx.fillRect(bx, y + Y_VIDA, anchoBarra * fracVida, ALTO_VIDA);

    // La cifra exacta es de consulta, no de vistazo: lo que se lee de un golpe
    // es cuánto queda de barra verde. Pequeña y discreta.
    ctx.font = `600 6.5px ${FUENTE}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    textoBorde(ctx, `${Math.ceil(j.vida)} / ${Math.round(j.vidaMaxima)}`,
               bx + anchoBarra / 2, y + Y_VIDA + ALTO_VIDA / 2, '#ffffff', 1.8);

    // Experiencia: fina, pegada debajo y del MISMO color para los cuatro.
    const fracXp = j.xpNecesaria > 0 ? Math.min(1, j.xp / j.xpNecesaria) : 0;
    sombraDura(ctx);
    ctx.fillStyle = 'rgba(10,8,14,.8)';
    ctx.fillRect(bx, y + Y_XP, anchoBarra, ALTO_XP);
    sinSombra(ctx);
    ctx.fillStyle = COLOR_XP;
    ctx.fillRect(bx, y + Y_XP, anchoBarra * fracXp, ALTO_XP);

    // --- Filas de ranuras -----------------------------------------------
    // Arrancan justo debajo del retrato, que ahora termina a la altura de la
    // barra de experiencia. Se colocan de fuera hacia dentro: en los paneles
    // espejados, la primera ranura queda pegada al borde derecho, que es el
    // borde "de casa".
    const filaArmas = y + CABEZA + HUECO_FILA;
    const filaPasivos = filaArmas + RANURA + HUECO_FILA;
    const vacia = BORDE_VACIA[indice];
    const llena = BORDE_LLENA[indice];
    const colocar = (k) => derecha
      ? x + ANCHO - RANURA - k * (RANURA + HUECO_RANURA)
      : x + k * (RANURA + HUECO_RANURA);

    for (let k = 0; k < RANURAS; k++) {
      const a = armas[k];
      dibujarRanura(ctx, colocar(k), filaArmas, a ? llena : vacia,
        a ? a.def.color : null, a ? a.nivel : 0,
        a ? ((c, r) => glifoArma(c, a.def.comportamiento, r)) : null);
    }

    for (let k = 0; k < RANURAS; k++) {
      const id = idsPasivos[k];
      const def = id ? PASIVOS[id] : null;
      dibujarRanura(ctx, colocar(k), filaPasivos, def ? llena : vacia,
        def ? COLOR_PASIVO : null, def ? j.pasivos[id] : 0,
        def ? ((c, r) => glifoPasivo(c, def.campo, r)) : null);
    }
  }

  ctx.restore();
}
