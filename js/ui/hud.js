import { ANCHO_FISICO, ALTO_FISICO } from '../core/constantes.js';
import { PASIVOS } from '../datos/pasivos.js';
import { Recursos } from '../core/recursos.js';
import { FUENTE, textoBorde } from './capa.js';

// Panel de información por jugador, siempre visible. Una esquina cada uno:
// J1 arriba izquierda, J2 arriba derecha, J3 abajo izquierda, J4 abajo derecha.
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

const ANCHO = 152;         // ancho de la columna de contenido
const MARGEN = 10;
const CABEZA = 40;         // lado del retrato
const HUECO_ICONO = 6;

// SIEMPRE cuatro ranuras por fila, llenas o vacías, y reparten el ancho entero
// del panel. Las vacías no son decoración: MAX_ARMAS y MAX_PASIVOS son 4, así
// que el hueco vacío dice cuánto te queda por elegir, que es una decisión que
// se toma cada subida de nivel. Con las ranuras apareciendo según se llenan, la
// fila cambiaba de tamaño y no se sabía si cabía algo más.
const RANURAS = 4;
const RANURA = (ANCHO - (RANURAS - 1) * HUECO_ICONO) / RANURAS;

const COLOR_JUGADOR = ['#5aa9e6', '#e8b73a', '#8fbf5a', '#d64b8f'];
const COLOR_PASIVO = '#9fd0e8';

// Marco de la ranura: suave y translúcido. Lleva relleno oscuro Y borde claro
// porque el panel no tiene fondo: contra la arena del anfiteatro solo el borde
// claro desaparecería, y contra una zona de fuego solo el relleno oscuro.
const RANURA_FONDO = 'rgba(10,8,16,.30)';
const RANURA_BORDE = 'rgba(238,232,220,.20)';
const RANURA_BORDE_LLENA = 'rgba(238,232,220,.34)';

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
// `<id>Cara` a 72x72.
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
function dibujarRanura(ctx, x, y, color, nivel, pintarGlifo) {
  const llena = pintarGlifo !== null;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x + 0.5, y + 0.5, RANURA - 1, RANURA - 1, 4);
  ctx.fillStyle = RANURA_FONDO;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = llena ? RANURA_BORDE_LLENA : RANURA_BORDE;
  ctx.stroke();
  ctx.restore();

  if (!llena) return;

  ctx.save();
  ctx.translate(x + RANURA / 2, y + RANURA / 2);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.8;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  sombraDura(ctx);
  pintarGlifo(ctx, RANURA * 0.30);
  ctx.restore();

  // El nivel es un dato de apoyo, no un titular: pequeño y en la esquina.
  ctx.font = `600 7px ${FUENTE}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  textoBorde(ctx, String(nivel), x + RANURA - 2, y + RANURA - 1.5, '#ffffff', 2);
}

export function dibujarPaneles(ctx, jugadores) {
  ctx.save();

  for (let i = 0; i < jugadores.length; i++) {
    const j = jugadores[i];
    const armas = j.arsenal ? j.arsenal.equipadas : [];
    const idsPasivos = Object.keys(j.pasivos);
    const color = COLOR_JUGADOR[i % COLOR_JUGADOR.length];

    // Las dos filas están SIEMPRE, aunque no lleves nada: el panel no cambia de
    // tamaño durante la partida y la vista no tiene que reaprender dónde mirar.
    const alto = CABEZA + 2 * (RANURA + HUECO_ICONO);

    // Esquinas: 0 arriba-izq, 1 arriba-der, 2 abajo-izq, 3 abajo-der. Los de la
    // derecha van ESPEJADOS —retrato a la derecha, texto e iconos alineados a
    // la derecha— porque sin caja que los encuadre, un bloque alineado a la
    // izquierda pegado al borde derecho se lee como descolgado.
    const derecha = (i % 2) === 1;
    const abajo = i >= 2;
    const x = derecha ? ANCHO_FISICO - ANCHO - MARGEN : MARGEN;
    const y = abajo ? ALTO_FISICO - alto - MARGEN : MARGEN;

    // --- Retrato --------------------------------------------------------
    const xCabeza = derecha ? x + ANCHO - CABEZA : x;
    dibujarCabeza(ctx, xCabeza, y, j);

    // --- Nombre, nivel, vida y experiencia ------------------------------
    const bx = derecha ? x : x + CABEZA + 7;
    const anchoBarra = ANCHO - CABEZA - 7;
    const xFin = bx + anchoBarra;

    ctx.font = `600 13px ${FUENTE}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = derecha ? 'right' : 'left';
    const xNombre = derecha ? xFin : bx;
    textoBorde(ctx, `P${i + 1}  ${j.def.nombre}`, xNombre, y + 1,
               j.abatido ? '#c0453f' : color);

    ctx.textAlign = derecha ? 'left' : 'right';
    ctx.font = `500 10px ${FUENTE}`;
    textoBorde(ctx, `LV ${j.nivel}`, derecha ? bx : xFin, y + 3.5, '#cdc5b6');

    // Barra de vida. El carril oscuro no es "fondo del panel": es parte de la
    // barra, y sin él no se distingue lo que falta de lo que no hay.
    const fracVida = Math.max(0, j.vida / j.vidaMaxima);
    sombraDura(ctx);
    ctx.fillStyle = 'rgba(10,8,14,.8)';
    ctx.fillRect(bx, y + 19, anchoBarra, 8);
    sinSombra(ctx);
    ctx.fillStyle = fracVida > 0.5 ? '#8fbf5a' : (fracVida > 0.25 ? '#d8a13c' : '#c0453f');
    ctx.fillRect(bx, y + 19, anchoBarra * fracVida, 8);

    // La cifra exacta es de consulta, no de vistazo: lo que se lee de un golpe
    // es cuánto queda de barra verde. Pequeña y discreta.
    ctx.font = `600 7.5px ${FUENTE}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    textoBorde(ctx, `${Math.ceil(j.vida)} / ${Math.round(j.vidaMaxima)}`,
               bx + anchoBarra / 2, y + 23.5, '#ffffff', 2);

    // Experiencia: fina y pegada debajo, para no competir con la vida.
    const fracXp = j.xpNecesaria > 0 ? Math.min(1, j.xp / j.xpNecesaria) : 0;
    sombraDura(ctx);
    ctx.fillStyle = 'rgba(10,8,14,.8)';
    ctx.fillRect(bx, y + 29, anchoBarra, 4);
    sinSombra(ctx);
    ctx.fillStyle = color;
    ctx.fillRect(bx, y + 29, anchoBarra * fracXp, 4);

    // --- Filas de ranuras -----------------------------------------------
    // Se colocan de fuera hacia dentro: en los paneles espejados, la primera
    // ranura queda pegada al borde derecho, que es el borde "de casa".
    const filaArmas = y + CABEZA + HUECO_ICONO;
    const filaPasivos = filaArmas + RANURA + HUECO_ICONO;
    const colocar = (k) => derecha
      ? x + ANCHO - RANURA - k * (RANURA + HUECO_ICONO)
      : x + k * (RANURA + HUECO_ICONO);

    for (let k = 0; k < RANURAS; k++) {
      const a = armas[k];
      dibujarRanura(ctx, colocar(k), filaArmas,
        a ? a.def.color : null, a ? a.nivel : 0,
        a ? ((c, r) => glifoArma(c, a.def.comportamiento, r)) : null);
    }

    for (let k = 0; k < RANURAS; k++) {
      const id = idsPasivos[k];
      const def = id ? PASIVOS[id] : null;
      dibujarRanura(ctx, colocar(k), filaPasivos,
        def ? COLOR_PASIVO : null, def ? j.pasivos[id] : 0,
        def ? ((c, r) => glifoPasivo(c, def.campo, r)) : null);
    }
  }

  ctx.restore();
}
