import { ANCHO_UI, ALTO_UI } from '../core/constantes.js';
import { Progresion, CASILLAS_RULETA, duracionGiro } from '../sistemas/progresion.js';
import { Capa, FUENTE, FUENTE_TITULO, textoEspaciado } from './capa.js';
import { Tema, panel, cenefa } from './tema.js';
import { Recursos } from '../core/recursos.js';
import { ARMAS } from '../datos/armas.js';
import { dibujarIconoArma, dibujarIconoPasivo, ALTO_FICHA, MARGEN_FICHA } from './hud.js';

// Ventana del COFRE. Sale al recoger el tesoro que suelta un élite, y enseña
// dos cosas distintas según lo que haya tocado:
//
//   - una EVOLUCIÓN, que es el premio raro y se concede sin sortear nada;
//   - una o TRES SUBIDAS DE NIVEL de lo que ya llevas, sorteadas EN UNA RULETA.
//
// La ruleta la pidió Sergio y cambia lo que era la ventana: antes decía "te ha
// subido el gladius" y ya. Ahora se ve girar la rueda con las candidatas
// pintadas en sus ocho sectores hasta que se para en una. El resultado no lo
// decide la rueda —lo decide el RNG antes de que empiece a girar, ver
// abrirCofre en sistemas/progresion.js— pero enseñar QUÉ podía haber salido es
// lo que convierte un aviso en un premio.
//
// TRES RUEDAS EN HORIZONTAL cuando el cofre sube tres cosas, y la ventana se
// ensancha para ellas. Paran de izquierda a derecha, una detrás de otra: si las
// tres se pararan a la vez no habría forma de mirarlas.

const MARGEN_PANTALLA = 14;
const HUECO = 8;
const ESTORBO_FICHA = ALTO_FICHA + MARGEN_FICHA;

const COLOR_EVOLUCION = '#ffd45a';
const COLOR_JUGADOR = ['#5aa9e6', '#e8b73a', '#8fbf5a', '#d64b8f'];

// --- Panel de evolución -------------------------------------------------------
// El de siempre: aquí no hay nada que sortear, así que no hay rueda.
const ANCHO_PANEL = 300;
const ALTO_PANEL = 128;

// --- Ventana de la ruleta -----------------------------------------------------
//
// La rueda se estrecha cuando son tres, pero no a un tercio: tres ruedas de 190
// ocupan 570 de los 960 del lienzo y se leen igual de bien que una de 210. Lo
// que no cabe es hacerlas del mismo tamaño que la única y punto.
const ANCHO_RUEDA_UNA = 216;
const ANCHO_RUEDA_TRES = 190;
const HUECO_RUEDA = 14;
const RELLENO_VENTANA = 22;
const ALTO_CABECERA = 46;
const ALTO_RESULTADO = 42;
const ALTO_PIE = 22;

// Radio al que se colocan los iconos, en fracción del radio de la rueda. 0,60
// los deja centrados en la parte ancha del sector: más adentro se amontonan
// contra el eje y más afuera se meten en el aro.
const RADIO_ICONOS = 0.60;

// Y su tamaño, también en fracción del radio. Bajado de 0,30 a 0,225 a petición
// de Sergio: a 0,30 el icono llegaba de un radio del sector al otro y se comía
// las líneas que separan las porciones, así que la rueda se leía como un
// amasijo de dibujos en vez de como ocho casillas con una cosa en cada una.
const ICONO_POR_RADIO = 0.225;
const ICONO_MAX = 13;

// Vueltas que da cada rueda antes de pararse. Cuatro es lo que hace falta para
// que se lea como "ha girado" y no como "ha saltado a su sitio".
const VUELTAS = 4;

const TAU = Math.PI * 2;

// Frenada. Cúbica invertida: arranca a toda velocidad y se va parando, que es
// como frena una ruleta de verdad —el rozamiento la para, nadie la sujeta—.
function frenada(u) {
  const q = 1 - u;
  return 1 - q * q * q;
}

// Ángulo de la rueda `i` en este instante. Termina exactamente en la posición
// que deja su casilla ganadora arriba, debajo del puntero.
function anguloRueda(i, m) {
  const t = duracionGiro(i);
  const u = t <= 0 ? 1 : Math.min(1, Progresion.relojGiro / t);
  const destino = VUELTAS * TAU - m.ganadora * (TAU / CASILLAS_RULETA);
  return destino * frenada(u);
}

function ruedaParada(i) {
  return Progresion.relojGiro >= duracionGiro(i);
}

// Los ocho colores de la cara, muestreados del propio dibujo de Sergio y en su
// orden: el rojo arriba y de ahí en el sentido de las agujas del reloj.
const COLORES_SECTOR = [
  '#e60205', '#fd7101', '#fdda04', '#05ca03',
  '#00daef', '#004cfa', '#7809fb', '#fb1fc4'
];
const COLOR_LATON = '#d8a640';
const COLOR_LATON_ALTO = '#ffe2a0';

// LA CARA DE LA RUEDA SE TRAZA, NO SE GIRA.
//
// Esto empezó girando el dibujo entero de la ruleta y no valía: "al girar la
// imagen se distorsiona y se rompe". El motivo no era el suavizado ni el tamaño,
// era que LA RUEDA DIBUJADA NO ES UN CÍRCULO —su canto va de 528 a 541 píxeles
// según por dónde se mida y el borde interior del aro es aún más irregular—, así
// que al girarla su silueta giraba con ella: el canto ondulaba, el aro parecía
// doble y una costura recorría la rueda. Ningún radio de corte lo arregla,
// porque el problema es girar un dibujo hecho a mano que no es simétrico de
// revolución.
//
// Así que gira lo único que puede girar sin romperse: ocho sectores trazados,
// que son circulares por definición y no tienen píxeles que remuestrear. El
// dibujo de Sergio se queda con la parte que NO gira y que es la que tiene
// carácter —aro, tachones, puntero y soporte—, y se pinta encima recortado a un
// círculo exacto (ver RecortarRuleta en la herramienta).
function dibujarCara(ctx, cx, cy, radio, ang) {
  const paso = TAU / CASILLAS_RULETA;

  for (let k = 0; k < CASILLAS_RULETA; k++) {
    // La casilla k está CENTRADA en su ángulo, que es lo que hace que la
    // ganadora quede debajo del puntero y no a medio sector de él.
    const a0 = ang + k * paso - paso / 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radio, a0, a0 + paso);
    ctx.closePath();
    ctx.fillStyle = COLORES_SECTOR[k];
    ctx.fill();
  }

  // Los radios de latón que separan las porciones. Van DESPUÉS de los rellenos
  // para que tapen la juntura entre sectores contiguos, que si no se ve como una
  // línea dentada donde se tocan dos colores.
  ctx.lineCap = 'butt';
  ctx.lineWidth = Math.max(1.5, radio * 0.035);
  ctx.strokeStyle = COLOR_LATON;
  ctx.beginPath();
  for (let k = 0; k < CASILLAS_RULETA; k++) {
    const a = ang + (k + 0.5) * paso - Math.PI / 2;
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * radio, cy + Math.sin(a) * radio);
  }
  ctx.stroke();

  // Sombra por dentro del aro: es lo que ata la cara trazada con el aro dibujado
  // en vez de dejar los colores cortados a cuchillo contra el latón.
  const grosor = Math.max(1.5, radio * 0.06);
  ctx.lineWidth = grosor;
  ctx.strokeStyle = 'rgba(52,26,8,.5)';
  ctx.beginPath();
  ctx.arc(cx, cy, radio - grosor / 2, 0, TAU);
  ctx.stroke();

  // El eje, en el centro. Redondo y de latón, como en el dibujo: un anillo
  // exterior, el cuerpo y un brillo pequeño arriba a la izquierda, que es lo que
  // lo lee como una pieza abombada en vez de como un círculo pintado.
  const rEje = Math.max(4, radio * 0.155);
  ctx.beginPath();
  ctx.arc(cx, cy, rEje, 0, TAU);
  ctx.fillStyle = 'rgba(52,26,8,.75)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, rEje * 0.82, 0, TAU);
  ctx.fillStyle = COLOR_LATON;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx - rEje * 0.22, cy - rEje * 0.22, rEje * 0.34, 0, TAU);
  ctx.fillStyle = COLOR_LATON_ALTO;
  ctx.fill();
}

// Una rueda con sus ocho iconos. `cx`,`cy` es el centro del ARO, no el de la
// imagen: el dibujo trae el soporte debajo, así que su centro geométrico cae por
// debajo del eje de la rueda y alinear por ahí descuadraría las tres.
function dibujarRueda(ctx, cx, cy, ancho, m, i) {
  const marco = Recursos.meta('ruletaMarco');
  const imgMarco = Recursos.imagen('ruletaMarco');
  if (!marco) return;

  const esc = ancho / marco.w;
  const radio = marco.radio * esc;          // canto exterior, para colocar iconos
  const radioCara = marco.radioCara * esc;  // hasta donde llega lo que gira
  const ang = anguloRueda(i, m);

  dibujarCara(ctx, cx, cy, radioCara, ang);

  // Los iconos ORBITAN con la cara pero se dibujan DERECHOS. Girarlos con su
  // sector sería más fiel a una ruleta física y peor de leer: media rueda
  // quedaría boca abajo, y lo que hay que reconocer aquí es un arma.
  const rIcono = Math.min(ICONO_MAX, radio * ICONO_POR_RADIO);
  for (let k = 0; k < CASILLAS_RULETA; k++) {
    const c = m.casillas[k];
    if (!c.id) continue;
    const a = ang + k * (TAU / CASILLAS_RULETA) - Math.PI / 2;
    const ix = cx + Math.cos(a) * radio * RADIO_ICONOS;
    const iy = cy + Math.sin(a) * radio * RADIO_ICONOS;
    if (c.clase === 'arma') {
      const def = ARMAS[c.id];
      dibujarIconoArma(ctx, ix, iy, rIcono, c.id, def ? def.color : '#ccc');
    } else {
      dibujarIconoPasivo(ctx, ix, iy, rIcono, c.id, '#9fd0e8');
    }
  }

  // El armazón encima y quieto: aro, tachones, puntero y soporte. Con suavizado
  // explícito porque se reduce de 640 al ancho de la ventana, y a vecino más
  // próximo una reducción por un factor roto se come filas enteras de píxeles.
  if (imgMarco) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(imgMarco, 0, 0, marco.w, marco.h,
                  cx - marco.centroX * esc, cy - marco.centroY * esc,
                  marco.w * esc, marco.h * esc);
    ctx.restore();
  }

  // Parada: se enciende la casilla premiada. Sin esto, con ocho iconos en la
  // rueda hay que fiarse de dónde cae el puntero, y el puntero es fino.
  if (ruedaParada(i)) {
    const a = ang + m.ganadora * (TAU / CASILLAS_RULETA) - Math.PI / 2;
    const ix = cx + Math.cos(a) * radio * RADIO_ICONOS;
    const iy = cy + Math.sin(a) * radio * RADIO_ICONOS;
    const latido = 0.55 + 0.45 * Math.sin(performance.now() / 180);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.30 + 0.20 * latido;
    ctx.beginPath();
    ctx.arc(ix, iy, rIcono * 1.7, 0, TAU);
    ctx.fillStyle = COLOR_EVOLUCION;
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(ix, iy, rIcono * 1.35, 0, TAU);
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLOR_EVOLUCION;
    ctx.stroke();
  }
}

// Nombre y nivel de lo que ha tocado, debajo de su rueda. No aparece hasta que
// esa rueda para: leer el resultado antes de que la rueda llegue quitaría la
// única gracia que tiene mirarla.
function dibujarResultado(ctx, cx, y, m, i) {
  if (!ruedaParada(i)) return;
  const t = Tema.actual;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 13px ${FUENTE}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(m.nombre, cx, y);

  ctx.font = `500 11px ${FUENTE}`;
  ctx.fillStyle = t.texto;
  ctx.fillText(m.clase === 'curacion' ? '+30 de vida' : `nivel ${m.nivel}`, cx, y + 17);
}

function dibujarRuletas(ctx, jugadores, j) {
  const t = Tema.actual;
  const n = Progresion.nMejoras;
  const ancho = n > 1 ? ANCHO_RUEDA_TRES : ANCHO_RUEDA_UNA;

  const marco = Recursos.meta('ruletaMarco');
  const altoRueda = marco ? ancho * marco.h / marco.w : ancho;

  const anchoVentana = RELLENO_VENTANA * 2 + n * ancho + (n - 1) * HUECO_RUEDA;
  const altoVentana = ALTO_CABECERA + altoRueda + ALTO_RESULTADO + ALTO_PIE;

  // Centrada en la franja que de verdad se ve: el lienzo mide 540 de alto
  // siempre, pero en una ventana más baja se recorta por arriba y por abajo.
  const recorte = Math.max(0, (ALTO_UI - Capa.altoVisible) / 2);
  const px = (ANCHO_UI - anchoVentana) / 2;
  const py = recorte + (Capa.altoVisible - altoVentana) / 2;

  const indice = jugadores ? jugadores.indexOf(j) : -1;
  const unSolo = !jugadores || jugadores.length <= 1;
  const colorJ = COLOR_JUGADOR[(indice < 0 ? 0 : indice) % COLOR_JUGADOR.length];

  ctx.save();
  panel(ctx, px, py, anchoVentana, altoVentana, COLOR_EVOLUCION);

  ctx.textBaseline = 'middle';
  const yCabecera = py + 20;
  ctx.textAlign = 'left';
  ctx.font = `600 11px ${FUENTE}`;
  ctx.fillStyle = colorJ;
  ctx.fillText(unSolo ? j.def.nombre : `P${indice + 1}  ${j.def.nombre}`,
               px + RELLENO_VENTANA, yCabecera);

  ctx.textAlign = 'right';
  ctx.font = `20px ${FUENTE_TITULO}`;
  ctx.fillStyle = COLOR_EVOLUCION;
  // Tres mejoras es el premio gordo y merece decirlo: con el mismo titular que
  // una, el jugador no se enteraría de que le ha tocado.
  textoEspaciado(ctx, n > 1 ? 'GRAN TESORO' : 'TESORO',
                 px + anchoVentana - RELLENO_VENTANA, yCabecera, 2.5);

  cenefa(ctx, px + RELLENO_VENTANA, py + 32, anchoVentana - RELLENO_VENTANA * 2);

  // El centro del ARO, que no es el centro de la imagen: el soporte de madera
  // cuelga por debajo del eje.
  const yEje = py + ALTO_CABECERA + (marco ? marco.centroY * ancho / marco.w : altoRueda / 2);
  for (let i = 0; i < n; i++) {
    const cx = px + RELLENO_VENTANA + ancho / 2 + i * (ancho + HUECO_RUEDA);
    dibujarRueda(ctx, cx, yEje, ancho, Progresion.mejoras[i], i);
    dibujarResultado(ctx, cx, py + ALTO_CABECERA + altoRueda + 14,
                     Progresion.mejoras[i], i);
  }

  ctx.textAlign = 'center';
  ctx.font = `500 9px ${FUENTE}`;
  ctx.fillStyle = t.apagado;
  ctx.fillText(Progresion.relojGiro < Progresion.giroTotal
               ? 'cualquier tecla para ir al grano' : 'cualquier tecla',
               px + anchoVentana / 2, py + altoVentana - 12);
  ctx.restore();
}

// Repliegue: todo al máximo y el cofre paga en vida. No hay nada que sortear,
// así que tampoco hay rueda — el panel bajo de siempre.
function dibujarSinRuleta(ctx, jugadores, j) {
  const t = Tema.actual;
  const alto = 82;
  const indice = jugadores ? jugadores.indexOf(j) : -1;
  const unSolo = !jugadores || jugadores.length <= 1;
  const { x: px, y: py } = situar(indice, unSolo, alto);

  ctx.save();
  panel(ctx, px, py, ANCHO_PANEL, alto, COLOR_EVOLUCION);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  ctx.font = `17px ${FUENTE_TITULO}`;
  ctx.fillStyle = COLOR_EVOLUCION;
  textoEspaciado(ctx, 'TESORO', px + ANCHO_PANEL - 12, py + 17, 2.5);
  ctx.textAlign = 'left';
  ctx.font = `600 10px ${FUENTE}`;
  ctx.fillStyle = COLOR_JUGADOR[(indice < 0 ? 0 : indice) % COLOR_JUGADOR.length];
  ctx.fillText(unSolo ? j.def.nombre : `P${indice + 1}  ${j.def.nombre}`, px + 12, py + 17);
  cenefa(ctx, px + 12, py + 26, ANCHO_PANEL - 24);

  ctx.textAlign = 'center';
  ctx.font = `600 13px ${FUENTE}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(Progresion.mejoras[0].nombre, px + ANCHO_PANEL / 2, py + 48);
  ctx.font = `500 10px ${FUENTE}`;
  ctx.fillStyle = t.texto;
  ctx.fillText('+30 de vida', px + ANCHO_PANEL / 2, py + 64);
  ctx.restore();
}

function situar(indice, unSolo, alto = ALTO_PANEL) {
  if (unSolo || indice < 0) {
    return { x: (ANCHO_UI - ANCHO_PANEL) / 2, y: (ALTO_UI - alto) / 2 };
  }
  const derecha = (indice % 2) === 1;
  const abajo = indice >= 2;
  return {
    x: derecha ? ANCHO_UI - ANCHO_PANEL - MARGEN_PANTALLA : MARGEN_PANTALLA,
    y: abajo ? ALTO_UI - ESTORBO_FICHA - HUECO - alto : ESTORBO_FICHA + HUECO
  };
}

export function dibujarCofre(ctx, jugadores) {
  const j = Progresion.cofre;
  if (!j) return;
  if (!Progresion.cofreEsEvolucion) {
    if (Progresion.mejoras[0].clase === 'curacion') return dibujarSinRuleta(ctx, jugadores, j);
    return dibujarRuletas(ctx, jugadores, j);
  }

  const t = Tema.actual;
  const evo = Progresion.evolucion;
  const indice = jugadores ? jugadores.indexOf(j) : -1;
  const unSolo = !jugadores || jugadores.length <= 1;
  const { x: px, y: py } = situar(indice, unSolo);
  const colorJ = COLOR_JUGADOR[(indice < 0 ? 0 : indice) % COLOR_JUGADOR.length];

  ctx.save();

  // Marco de oro, no del color del jugador: es la pantalla más rara del juego y
  // tiene que verse desde el otro lado del sofá.
  panel(ctx, px, py, ANCHO_PANEL, ALTO_PANEL, COLOR_EVOLUCION);

  ctx.textBaseline = 'middle';
  const yCabecera = py + 17;

  ctx.textAlign = 'left';
  ctx.font = `600 10px ${FUENTE}`;
  ctx.fillStyle = colorJ;
  ctx.fillText(unSolo ? j.def.nombre : `P${indice + 1}  ${j.def.nombre}`, px + 12, yCabecera);

  ctx.textAlign = 'right';
  ctx.font = `17px ${FUENTE_TITULO}`;
  ctx.fillStyle = COLOR_EVOLUCION;
  textoEspaciado(ctx, 'EVOLUCION', px + ANCHO_PANEL - 12, yCabecera, 2.5);

  cenefa(ctx, px + 12, py + 26, ANCHO_PANEL - 24);

  // El nombre del arma, grande y centrado. Es el premio entero.
  const cx = px + ANCHO_PANEL / 2;
  ctx.textAlign = 'center';
  ctx.font = `600 ${evo.nombre.length > 20 ? 15 : 18}px ${FUENTE}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(evo.nombre, cx, py + 62);

  // La receta debajo, en pequeño: es lo que enseña la regla al que llega aquí
  // por primera vez sin saber cómo lo ha conseguido.
  ctx.font = `400 10px ${FUENTE}`;
  ctx.fillStyle = t.texto;
  ctx.fillText(evo.detalle, cx, py + 84);

  ctx.font = `500 9px ${FUENTE}`;
  ctx.fillStyle = t.apagado;
  ctx.fillText('cualquier tecla', cx, py + ALTO_PANEL - 16);

  ctx.restore();
}
