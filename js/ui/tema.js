// Tema visual de la interfaz, tomado del NIVEL en curso.
//
// POR QUÉ EXISTE. Las pantallas de pausa, subida de nivel y cofre son las
// únicas en las que el juego se detiene y se mira. Si todas las fases del juego
// las pintan igual —el mismo panel morado genérico— esos son justo los momentos
// en los que el juego deja de estar ambientado en ningún sitio. En Emerita
// Augusta el panel tiene que ser piedra, marfil y bronce; el nivel de las minas
// o el del acueducto tendrán el suyo, y no hay que tocar ui/ para conseguirlo.
//
// El nivel declara COLORES y el NOMBRE de un ornamento; el trazado de ese
// ornamento vive aquí, porque es lógica y datos/ no lleva lógica. Un nivel que
// no declare `interfaz` se pinta con el tema por defecto y no falla.
//
// Se inyecta desde main.js (Tema.usar(NIVEL)) en vez de importar el nivel: si
// ui/ importara datos/niveles/merida.js, añadir un nivel obligaría a tocar la
// interfaz, que es exactamente lo que el contrato de niveles prohíbe.

export const TEMA_POR_DEFECTO = {
  ornamento: 'ninguno',
  fondo:        '#26282d',   // arriba del panel
  fondoBajo:    '#16181b',   // abajo: el degradado da volumen de piedra
  fondoCarta:   '#2f3238',
  cartaElegida: '#41454d',
  fondoClaro:   '#8b9099',   // huecos claros (el retrato de la ficha)
  borde:        '#0a0b0d',   // línea exterior, despega el panel del juego
  filo:         '#8d8c96',   // marco interior y ornamentos
  titulo:       '#eef0f3',
  texto:        '#a8adb5',
  apagado:      '#787d85'
};

export const Tema = {
  actual: TEMA_POR_DEFECTO,

  // Se llama UNA vez al arrancar el nivel. El objeto resultante se reutiliza
  // durante toda la partida: aquí sí se puede asignar, no estamos en el bucle.
  usar(nivel) {
    const t = nivel && nivel.interfaz;
    this.actual = t ? Object.assign({}, TEMA_POR_DEFECTO, t) : TEMA_POR_DEFECTO;
  }
};

// --- Degradado del fondo -----------------------------------------------------
// createLinearGradient asigna memoria, y estos paneles se repintan en cada frame
// mientras están abiertos. Se cachean por (y, alto): hay tres tamaños de panel
// en todo el juego y cinco posiciones como mucho, así que la caché no crece.
const CACHE = [];
const CACHE_MAX = 12;

function degradado(ctx, y, alto) {
  for (let i = 0; i < CACHE.length; i++) {
    const c = CACHE[i];
    if (c.y === y && c.alto === alto) return c.grad;
  }
  const t = Tema.actual;
  const g = ctx.createLinearGradient(0, y, 0, y + alto);
  g.addColorStop(0, t.fondo);
  g.addColorStop(1, t.fondoBajo);
  if (CACHE.length >= CACHE_MAX) CACHE.length = 0;   // cambio de tema o de zoom
  CACHE.push({ y, alto, grad: g });
  return g;
}

// Invalida la caché. La llama quien cambie de tema o de resolución: el degradado
// guarda coordenadas absolutas y dejaría bandas donde no toca.
export function olvidarDegradados() { CACHE.length = 0; }

// --- Ornamentos --------------------------------------------------------------

// Escuadras en las cuatro esquinas. Es lo que da la lectura de "placa" sin
// necesidad de un marco grueso: dos trazos por esquina y el ojo cierra el resto.
function escuadras(ctx, x, y, ancho, alto, color, brazo) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  const p = 3.5;                     // separación respecto al borde
  const x1 = x + p, y1 = y + p, x2 = x + ancho - p, y2 = y + alto - p;
  ctx.moveTo(x1, y1 + brazo); ctx.lineTo(x1, y1); ctx.lineTo(x1 + brazo, y1);
  ctx.moveTo(x2 - brazo, y1); ctx.lineTo(x2, y1); ctx.lineTo(x2, y1 + brazo);
  ctx.moveTo(x1, y2 - brazo); ctx.lineTo(x1, y2); ctx.lineTo(x1 + brazo, y2);
  ctx.moveTo(x2 - brazo, y2); ctx.lineTo(x2, y2); ctx.lineTo(x2, y2 - brazo);
  ctx.stroke();
  ctx.restore();
}

// --- Panel -------------------------------------------------------------------
// Fondo, marcos y ornamento. Lo comparten la pausa, la derrota y la subida de
// nivel: son la misma pieza de mobiliario y tienen que verse como tal.
//
// OPACO pero PEQUEÑO. Son dos cosas distintas y conviene no confundirlas: el
// panel no deja ver a través de sí mismo —eso arruinaría el contraste del
// texto— pero tampoco tapa la partida.
//
// `acento` es el color de quien mira el panel: en cooperativo, el borde teñido
// dice de quién es el menú sin tener que leer el nombre. Si no se pasa, manda
// el filo del tema.
export function panel(ctx, x, y, ancho, alto, acento) {
  const t = Tema.actual;

  ctx.save();
  ctx.fillStyle = degradado(ctx, y, alto);
  ctx.fillRect(x, y, ancho, alto);

  // Línea exterior oscura: separa el panel del juego pase lo que pase por
  // debajo, incluida una horda entera.
  ctx.strokeStyle = t.borde;
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 1.5, y - 1.5, ancho + 3, alto + 3);

  // Marco interior con el color de quien elige.
  ctx.strokeStyle = acento || t.filo;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 0.75, y + 0.75, ancho - 1.5, alto - 1.5);

  if (t.ornamento === 'romano') escuadras(ctx, x, y, ancho, alto, t.filo, 7);
  ctx.restore();
}

// Separación bajo una cabecera. Devuelve el alto que ha ocupado, para que quien
// la pide no tenga que saber cuánto mide.
//
// ANTES ERA UNA GRECA: una hilera de llaves cuadradas, el meandro romano de
// toda la vida. La quitó Sergio de todas las ventanas —"no queda bien"— y con
// razón: a seis unidades de alto y repetida en ocho sitios, lo que aportaba de
// ambientación no compensaba lo que pesaba en pantallas que ya tienen mucho que
// leer. Se queda la raya fina, que es lo que de verdad hacía falta: separar.
export function cenefa(ctx, x, y, ancho) {
  const t = Tema.actual;
  ctx.save();
  ctx.strokeStyle = t.filo;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + 2.5);
  ctx.lineTo(x + ancho, y + 2.5);
  ctx.stroke();
  ctx.restore();
  return 5;
}
