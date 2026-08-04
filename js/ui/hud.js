import { ANCHO_FISICO, ALTO_FISICO } from '../core/constantes.js';
import { PASIVOS } from '../datos/pasivos.js';
import { Recursos } from '../core/recursos.js';

// Panel de información por jugador, siempre visible. Una esquina cada uno:
// J1 arriba izquierda, J2 arriba derecha, J3 abajo izquierda, J4 abajo derecha.
//
// Se dibuja en PÍXELES FÍSICOS con la matriz identidad: es interfaz.
//
// LOS ICONOS SON PROCEDURALES, dibujados por código a partir del comportamiento
// del arma y del color que trae en sus datos. No hay ni un PNG de icono, y es
// deliberado: son 19 armas y 8 pasivos, y encargar 27 iconos para descubrir
// después que la mitad de las armas cambian sería tirar el trabajo. La forma
// dice qué HACE el arma —flecha para proyectil, anillo para orbital, ráfaga
// para explosivo—, que es justo lo que hay que leer de un vistazo.
//
// Cuando existan iconos de verdad, basta con meterlos en el atlas y sustituir
// dibujarIcono: el resto del panel no se entera.

const ANCHO = 152;
const MARGEN = 6;
const ICONO = 17;          // lado de la casilla de icono
const CABEZA = 40;         // lado del retrato
const HUECO_ICONO = 3;

// SIN transparencia. El panel es una ficha, no un velo: con el fondo
// translúcido, la horda pasando por debajo hacía ilegibles los números de nivel
// justo cuando más falta hacen.
const COLOR_FONDO = '#191521';
const COLOR_FONDO_2 = '#221d2c';
const COLOR_BORDE = '#4a4256';
const COLOR_BORDE_LUZ = '#6d6480';

const COLOR_JUGADOR = ['#5aa9e6', '#e8b73a', '#8fbf5a', '#d64b8f'];

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
// Se dibuja CON suavizado, al revés que todo lo demás. El mundo es pixel art y
// va a vecino más próximo; el panel es interfaz y puede permitirse detalle. Un
// retrato suave junto a un mundo crujiente no desentona: se lee como la ficha
// del personaje, que es justo lo que es.
function dibujarCabeza(ctx, x, y, jugador) {
  const img = Recursos.imagen(jugador.id + 'Cara');

  ctx.fillStyle = '#0e0c14';
  ctx.fillRect(x, y, CABEZA, CABEZA);

  if (img) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, CABEZA, CABEZA);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, x, y, CABEZA, CABEZA);
    ctx.restore();
  }

  ctx.strokeStyle = COLOR_BORDE_LUZ;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, CABEZA - 1, CABEZA - 1);
}

// Casilla completa: fondo, glifo y número de nivel en la esquina.
function dibujarCasilla(ctx, x, y, color, nivel, pintarGlifo) {
  ctx.fillStyle = COLOR_FONDO_2;
  ctx.fillRect(x, y, ICONO, ICONO);
  ctx.strokeStyle = COLOR_BORDE;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, ICONO - 1, ICONO - 1);

  ctx.save();
  ctx.translate(x + ICONO / 2, y + ICONO / 2);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.4;
  ctx.lineJoin = 'round';
  pintarGlifo(ctx, ICONO * 0.36);
  ctx.restore();

  // Nivel abajo a la derecha, con sombra para que lea sobre cualquier glifo.
  ctx.font = 'bold 8px Consolas, monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'rgba(0,0,0,.85)';
  ctx.fillText(String(nivel), x + ICONO, y + ICONO + 1);
  ctx.fillStyle = '#fff';
  ctx.fillText(String(nivel), x + ICONO - 1, y + ICONO);
}

export function dibujarPaneles(ctx, jugadores) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  for (let i = 0; i < jugadores.length; i++) {
    const j = jugadores[i];
    const armas = j.arsenal ? j.arsenal.equipadas : [];
    const idsPasivos = Object.keys(j.pasivos);

    // Alto variable: solo se reservan las filas que hacen falta.
    const filas = (armas.length > 0 ? 1 : 0) + (idsPasivos.length > 0 ? 1 : 0);
    const alto = 8 + CABEZA + filas * (ICONO + HUECO_ICONO + 1);

    // Esquinas: 0 arriba-izq, 1 arriba-der, 2 abajo-izq, 3 abajo-der.
    const derecha = (i % 2) === 1;
    const abajo = i >= 2;
    const x = derecha ? ANCHO_FISICO - ANCHO - MARGEN : MARGEN;
    const y = abajo ? ALTO_FISICO - alto - MARGEN : MARGEN;

    // Fondo opaco con doble borde: el exterior oscuro separa del mundo y el
    // interior claro da relieve sin necesidad de degradados.
    ctx.fillStyle = COLOR_FONDO;
    ctx.fillRect(x, y, ANCHO, alto);
    ctx.strokeStyle = '#0b0910';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 0.5, y - 0.5, ANCHO + 1, alto + 1);
    ctx.strokeStyle = j.abatido ? '#c0453f' : COLOR_BORDE_LUZ;
    ctx.strokeRect(x + 0.5, y + 0.5, ANCHO - 1, alto - 1);

    // --- Cabeza del personaje, arriba a la izquierda --------------------
    dibujarCabeza(ctx, x + 4, y + 4, j);

    // --- A la derecha de la cabeza: nombre, nivel, vida y experiencia ---
    const bx = x + 4 + CABEZA + 5;
    const anchoBarra = x + ANCHO - 5 - bx;

    ctx.font = 'bold 9px Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = COLOR_JUGADOR[i % COLOR_JUGADOR.length];
    ctx.fillText(`J${i + 1} ${j.def.nombre}`, bx, y + 5);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#c9c2b4';
    ctx.fillText(`niv ${j.nivel}`, x + ANCHO - 5, y + 5);

    const fracVida = Math.max(0, j.vida / j.vidaMaxima);
    ctx.fillStyle = '#0e0c14';
    ctx.fillRect(bx, y + 17, anchoBarra, 6);
    ctx.fillStyle = fracVida > 0.5 ? '#8fbf5a' : (fracVida > 0.25 ? '#d8a13c' : '#c0453f');
    ctx.fillRect(bx, y + 17, Math.round(anchoBarra * fracVida), 6);

    ctx.font = '8px Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${Math.ceil(j.vida)}/${Math.round(j.vidaMaxima)}`, bx + 2, y + 17);

    // Experiencia: fina y pegada debajo, para no competir con la vida.
    const fracXp = j.xpNecesaria > 0 ? Math.min(1, j.xp / j.xpNecesaria) : 0;
    ctx.fillStyle = '#0e0c14';
    ctx.fillRect(bx, y + 25, anchoBarra, 3);
    ctx.fillStyle = COLOR_JUGADOR[i % COLOR_JUGADOR.length];
    ctx.fillRect(bx, y + 25, Math.round(anchoBarra * fracXp), 3);

    // --- Fila de armas -------------------------------------------------
    let filaY = y + 4 + CABEZA + 3;
    for (let k = 0; k < armas.length; k++) {
      const a = armas[k];
      const cx = x + 5 + k * (ICONO + HUECO_ICONO);
      dibujarCasilla(ctx, cx, filaY, a.def.color, a.nivel,
        (c, r) => glifoArma(c, a.def.comportamiento, r));
    }
    if (armas.length > 0) filaY += ICONO + HUECO_ICONO + 1;

    // --- Fila de pasivos ------------------------------------------------
    for (let k = 0; k < idsPasivos.length; k++) {
      const id = idsPasivos[k];
      const def = PASIVOS[id];
      if (!def) continue;
      const cx = x + 5 + k * (ICONO + HUECO_ICONO);
      dibujarCasilla(ctx, cx, filaY, '#9fd0e8', j.pasivos[id],
        (c, r) => glifoPasivo(c, def.campo, r));
    }
  }

  ctx.restore();
}
