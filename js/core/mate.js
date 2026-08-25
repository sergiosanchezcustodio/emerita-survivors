// MATEMÁTICAS DETERMINISTAS. Las mismas cuentas, el mismo bit, en cualquier
// navegador.
//
// POR QUÉ EXISTE ESTE FICHERO. ECMAScript especifica EXACTAMENTE `+ - * /` y
// `Math.sqrt`: el resultado tiene que ser el correctamente redondeado, sin
// margen. De `Math.sin`, `Math.cos`, `Math.atan2` y `Math.exp` solo dice que
// devuelvan "una aproximación dependiente de la implementación", así que cada
// motor trae su propia biblioteca y cada una redondea a su manera.
//
// Medido en este proyecto, con `EMERITA.huellaMotor()`: sobre doscientas mil
// entradas, V8 (Chrome, Edge) y SpiderMonkey (Firefox) coinciden en `sqrt` y NO
// coinciden en sin, cos, tan, atan2, hypot, exp, pow ni log.
//
// Un bit de diferencia no se nota jugando —nadie ve que un enemigo esté a una
// diezmilbillonésima de unidad de otro sitio— pero el COOPERATIVO ONLINE por
// lockstep exige que dos máquinas produzcan exactamente la misma partida
// durante media hora. Ahí, un bit en el segundo diez es una partida distinta en
// el veinte.
//
// CÓMO SE CONSIGUE. Todo lo de aquí abajo está hecho SOLO con sumas, restas,
// multiplicaciones, divisiones y `Math.sqrt`. Nada más. Al usar únicamente
// operaciones que el estándar clava, el resultado es idéntico en todas partes
// por construcción, no por suerte.
//
// La técnica es la de siempre y tiene cuarenta años: reducir el argumento a un
// intervalo pequeño y evaluar ahí un polinomio ajustado. Los coeficientes son
// los de fdlibm, la biblioteca de Sun de 1993 que está debajo de media
// informática — incluidos, con vueltas, los propios navegadores.
//
// NO ES MÁS LENTO. Medido con Node: ver `herramientas/probar-mate.js`.

export const PI = 3.141592653589793;
export const TAU = 6.283185307179586;
export const MEDIO_PI = 1.5707963267948966;

// --- Reducción del argumento -------------------------------------------------
//
// π/2 partido en DOS TROZOS, y esto es el corazón del asunto. Restar `n * π/2`
// de un ángulo grande pierde precisión: si el ángulo vale 9000 y π/2 se guarda
// con 53 bits, al restar se cancelan las cifras altas y las bajas que quedan ya
// venían sucias. Con π/2 partido en una parte "gorda" —que cabe exacta en
// pocos bits, así que `n * PIO2_1` es exacto— y un resto pequeñito, la
// cancelación se hace contra un número exacto y la precisión sobrevive.
//
// Es el truco de Cody y Waite, de 1980. Aguanta ángulos hasta unos 2^20
// radianes; el juego no pasa de unos pocos miles.
const INV_MEDIO_PI = 0.6366197723675814;      // 2/π
const PIO2_1 = 1.5707963267341256;            // π/2, primeros 33 bits
const PIO2_1T = 6.077100506506192e-11;        // lo que le falta

// Coeficientes del seno en [-π/4, π/4] (fdlibm __kernel_sin).
const S1 = -1.66666666666666324348e-01;
const S2 = 8.33333333332248946124e-03;
const S3 = -1.98412698298579493134e-04;
const S4 = 2.75573137070700676789e-06;
const S5 = -2.50507602534068634195e-08;
const S6 = 1.58969099521155010221e-10;

// Y los del coseno (fdlibm __kernel_cos).
const C1 = 4.16666666666666019037e-02;
const C2 = -1.38888888888741095749e-03;
const C3 = 2.48015872894767294178e-05;
const C4 = -2.75573143513906633035e-07;
const C5 = 2.08757232129817482790e-09;
const C6 = -1.13596475577881948265e-11;

// Seno en el intervalo pequeño. El polinomio va en forma de Horner —anidado— y
// no como suma de potencias: menos operaciones y menos error acumulado.
function nucleoSen(x) {
  const z = x * x;
  const v = z * x;
  const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  return x + v * (S1 + z * r);
}

function nucleoCos(x) {
  const z = x * x;
  const r = z * z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  // El `1 - z/2` va aparte del resto para que la resta grande se haga con dos
  // números exactos y el polinomio solo aporte la corrección pequeña.
  return 1.0 - 0.5 * z + r;
}

// Cuántos cuartos de vuelta hay en x, y lo que sobra.
let _resto = 0;
function cuadrante(x) {
  const n = Math.round(x * INV_MEDIO_PI);
  _resto = (x - n * PIO2_1) - n * PIO2_1T;
  // Los dos bits bajos bastan: el seno y el coseno se repiten cada cuatro
  // cuartos de vuelta. El `% 4` con signo se corrige sumando 4.
  const q = n % 4;
  return q < 0 ? q + 4 : q;
}

export function sen(x) {
  const q = cuadrante(x);
  const r = _resto;
  if (q === 0) return nucleoSen(r);
  if (q === 1) return nucleoCos(r);
  if (q === 2) return -nucleoSen(r);
  return -nucleoCos(r);
}

export function cos(x) {
  const q = cuadrante(x);
  const r = _resto;
  if (q === 0) return nucleoCos(r);
  if (q === 1) return -nucleoSen(r);
  if (q === 2) return -nucleoCos(r);
  return nucleoSen(r);
}

// --- Arco tangente -----------------------------------------------------------
//
// Coeficientes de fdlibm __atan, para |x| <= tan(π/16).
const A0 = 3.33333333333329318027e-01;
const A1 = -1.99999999998764832476e-01;
const A2 = 1.42857142725034663711e-01;
const A3 = -1.11111104054623557880e-01;
const A4 = 9.09088713343650656196e-02;
const A5 = -7.69187620504482999495e-02;
const A6 = 6.66107313738753120669e-02;
const A7 = -5.83357013379057348645e-02;
const A8 = 4.97687799461593236017e-02;
const A9 = -3.65315727442169155270e-02;
const A10 = 1.62858201153657823623e-02;

// Los cuatro tramos en que se parte [0, ∞), con su ángulo base. Partirlo es lo
// que permite que un polinomio corto llegue a la precisión del double: cuanto
// más pequeño el intervalo, menos grado hace falta.
const ATAN_HI = [4.63647609000806093515e-01, 7.85398163397448278999e-01,
                 9.82793723247329054082e-01, 1.57079632679489655800e+00];
const ATAN_LO = [2.26987774529616870924e-17, 3.06161699786838301793e-17,
                 1.39033110312309984516e-17, 6.12323399573676603587e-17];

// OJO: devuelve LA CORRECCIÓN, no el arco tangente. Es decir, lo que hay que
// RESTARLE a x para obtener atan(x), que es `x * (s1 + s2)`.
//
// Se devuelve así y no ya restado porque los tramos de fuera la necesitan
// suelta: reconstruyen el resultado como `base - ((correccion - baseFina) - t)`,
// y ese orden de operaciones está elegido para que las cancelaciones ocurran
// entre números del mismo tamaño. Devolver `x - correccion` y volver a sumarlo
// después perdería precisión — y de hecho la primera versión de este fichero
// hacía justo eso y daba resultados que solo acertaban en los puntos de
// anclaje.
function nucleoAtan(x) {
  const z = x * x;
  const w = z * z;
  const s1 = z * (A0 + w * (A2 + w * (A4 + w * (A6 + w * (A8 + w * A10)))));
  const s2 = w * (A1 + w * (A3 + w * (A5 + w * (A7 + w * A9))));
  return x * (s1 + s2);
}

export function atan(x) {
  const negativo = x < 0;
  let t = negativo ? -x : x;
  let id;

  if (t < 0.4375) {
    if (t < 3.7252902984e-09) return x;      // tan tiny que atan(x) = x
    id = -1;
  } else if (t < 1.1875) {
    if (t < 0.6875) { id = 0; t = (2.0 * t - 1.0) / (2.0 + t); }
    else { id = 1; t = (t - 1.0) / (t + 1.0); }
  } else if (t < 2.4375) {
    id = 2; t = (t - 1.5) / (1.0 + 1.5 * t);
  } else {
    id = 3; t = -1.0 / t;
  }

  const correccion = nucleoAtan(t);
  if (id < 0) {
    const z = t - correccion;
    return negativo ? -z : z;
  }
  const r = ATAN_HI[id] - ((correccion - ATAN_LO[id]) - t);
  return negativo ? -r : r;
}

// atan2 con los mismos casos de borde que el de la plataforma: signo del cero
// incluido, porque hay código que se apoya en él sin saberlo.
export function atan2(y, x) {
  if (x !== x || y !== y) return NaN;
  if (y === 0) {
    // 1/x distingue +0 de -0, que `x === 0` no puede.
    return (x > 0 || (x === 0 && 1 / x > 0)) ? y : (y >= 0 ? PI : -PI);
  }
  if (x === 0) return y > 0 ? MEDIO_PI : -MEDIO_PI;

  if (x === Infinity) {
    if (y === Infinity) return PI / 4;
    if (y === -Infinity) return -PI / 4;
    return y > 0 ? 0 : -0;
  }
  if (x === -Infinity) {
    if (y === Infinity) return 3 * PI / 4;
    if (y === -Infinity) return -3 * PI / 4;
    return y > 0 ? PI : -PI;
  }
  if (y === Infinity) return MEDIO_PI;
  if (y === -Infinity) return -MEDIO_PI;

  const z = atan(y / x);
  if (x > 0) return z;
  return y > 0 ? z + PI : z - PI;
}

// --- Distancia ---------------------------------------------------------------
//
// `Math.hypot` no está especificada al bit —y medido, difiere entre motores—
// pero la raíz cuadrada SÍ. Y a las escalas de este juego, donde nada pasa de
// unos miles de unidades, la protección de `hypot` contra desbordamientos no
// hace ninguna falta: lo que aporta es un resultado distinto en cada navegador.
export function hipot(x, y) {
  return Math.sqrt(x * x + y * y);
}

// --- Exponencial -------------------------------------------------------------
//
// La usan los frenados: `exp(-k * dt)`, que es la forma correcta de escribir un
// rozamiento que no dependa del paso de tiempo.
const INV_LN2 = 1.4426950408889634;
const LN2_HI = 6.93147180369123816490e-01;    // partido en dos, como π/2
const LN2_LO = 1.90821492927058770002e-10;
const E1 = 1.66666666666666019037e-01;
const E2 = -2.77777777770155933842e-03;
const E3 = 6.61375632143793436117e-05;
const E4 = -1.65339022054652515390e-06;
const E5 = 4.13813679705723846039e-08;

// Multiplicar por 2^k SIN usar `pow`: se escribe el exponente directamente en
// los bits del número. Es exacto por definición —cambiar el exponente de un
// double es multiplicar por una potencia de dos— y por tanto idéntico en todas
// partes.
const BUF = new ArrayBuffer(8);
const F64 = new Float64Array(BUF);
const U32 = new Uint32Array(BUF);
function porDosElevadoA(k) {
  if (k > 1023) return Infinity;
  if (k < -1022) return 0;
  U32[0] = 0;
  U32[1] = (k + 1023) << 20;
  return F64[0];
}

export function exp(x) {
  if (x !== x) return NaN;
  if (x > 709.782712893384) return Infinity;
  if (x < -745.1332191019411) return 0;

  const k = Math.round(x * INV_LN2);
  const hi = x - k * LN2_HI;
  const lo = k * LN2_LO;
  const r = hi - lo;

  const t = r * r;
  const c = r - t * (E1 + t * (E2 + t * (E3 + t * (E4 + t * E5))));
  const y = 1.0 + (r * c / (2.0 - c) - lo + hi);
  return y * porDosElevadoA(k);
}
