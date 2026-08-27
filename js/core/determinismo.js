// PRUEBA DE DETERMINISMO. Herramienta de desarrollo, no forma parte del juego:
// nada la llama sola, solo se ejecuta desde la consola por `EMERITA.determinismo`.
//
// POR QUÉ EXISTE. El cooperativo ONLINE por lockstep —el modelo en el que por la
// red viajan solo las pulsaciones y cada máquina simula su propia copia— se
// sostiene sobre una promesa: misma semilla y mismas pulsaciones producen la
// misma partida, fotograma a fotograma y bit a bit. Este motor parece cumplirla
// (paso fijo a 60 Hz, todo el azar de un RNG con semilla, y la simulación no
// lee el reloj de pared), pero "parece" no basta: una sola divergencia de un bit
// se multiplica en dos segundos y las dos partidas dejan de ser la misma.
//
// Esto lo comprueba en vez de suponerlo, y sobre todo dice DÓNDE falla.
//
// DOS PRUEBAS DISTINTAS, y hacen falta las dos:
//
//   1. `repetir()` corre la misma partida DOS VECES en esta misma pestaña y
//      compara. Caza lo que depende de algo que no es la semilla: un
//      Math.random suelto, una lectura del reloj, estado que sobrevive de una
//      partida a la siguiente, un pool que no se vacía.
//
//   2. `firmar()` devuelve una huella de texto para pegar en OTRO NAVEGADOR y
//      comparar a mano. Eso caza lo que la primera no puede ver: `Math.sin`,
//      `Math.cos` y `Math.atan2` NO están especificadas bit a bit en
//      ECMAScript, así que dos motores distintos pueden dar resultados
//      distintos en el último bit. `+ - * /` y `Math.sqrt` sí lo están.

// --- La firma ---------------------------------------------------------------
//
// Se mezclan los BITS EXACTOS de cada número, no su valor redondeado. Es la
// diferencia entre una prueba que sirve y una que engaña: dos simulaciones que
// difieren en el último bit del último decimal siguen divergiendo a los pocos
// segundos, y una comparación con tolerancia las daría por iguales.
const BUF = new ArrayBuffer(8);
const F64 = new Float64Array(BUF);
const U32 = new Uint32Array(BUF);

function mezclar(h, x) {
  F64[0] = x;
  h = Math.imul(h ^ U32[0], 0x01000193) >>> 0;
  h = Math.imul(h ^ U32[1], 0x01000193) >>> 0;
  return h;
}

// Las claves de un objeto se recorren SIEMPRE en el mismo orden, sacado una vez
// y ordenado alfabéticamente. El orden de inserción de un objeto de JavaScript
// es estable, pero depender de él aquí sería depender de en qué orden se
// escribieron los campos, y eso no es una garantía sobre la que apoyar una
// prueba.
const CLAVES = new Map();

// CAMPOS QUE NO SON LA SIMULACIÓN, aunque vivan al lado.
//
// Entran en la firma normal —comparar dos pasadas en la MISMA máquina— porque
// ahí tienen que coincidir. NO entran en la que se compara entre dos máquinas,
// donde difieren legítimamente y decir lo contrario es una falsa alarma.
//
// DE DIBUJO. `xVista`/`yVista` son la posición interpolada entre el paso
// anterior y el actual, y el factor de interpolación sale de cuánto tiempo
// sobra en el acumulador del bucle cuando toca pintar: depende de los fps y del
// reloj de cada máquina. `ordenada` es la marca de "ya se ha entregado al
// ordenado por profundidad".
//
// DEL MENÚ DE SUBIDA DE NIVEL. `relojGiro`, `giroTotal` y `animando` son la
// animación de las ruletas, y `seleccion` es dónde está el cursor. Todos
// avanzan MIENTRAS EL MUNDO ESTÁ PARADO, que es justo cuando las dos máquinas
// dejan de ir a la vez: el menú se abre en el mismo paso en las dos, pero se
// cierra cuando a cada jugador le da la gana, y la elección del otro llega por
// la red cuando llega. Ese rato dura un número distinto de fotogramas en cada
// una.
//
// Lo que SÍ tiene que coincidir de una subida de nivel es la carta elegida, y
// eso viaja por el canal fiable y se ve luego en el arsenal.
const SOLO_DIBUJO = ['xVista', 'yVista', 'ordenada',
                     'relojGiro', 'giroTotal', 'animando', 'seleccion'];
const CLAVES_SIN_VISTA = new Map();
let sinVista = false;

function clavesDe(obj) {
  const marca = Object.keys(obj).join(',');
  const cache = sinVista ? CLAVES_SIN_VISTA : CLAVES;
  let lista = cache.get(marca);
  if (!lista) {
    lista = Object.keys(obj).filter((k) => typeof obj[k] === 'number');
    if (sinVista) lista = lista.filter((k) => SOLO_DIBUJO.indexOf(k) < 0);
    lista = lista.sort();
    cache.set(marca, lista);
  }
  return lista;
}

function mezclarObjeto(h, obj) {
  const claves = clavesDe(obj);
  for (let i = 0; i < claves.length; i++) h = mezclar(h, obj[claves[i]]);
  return h;
}

// Un objeto de estado suelto —el director, la cámara— con sus arrays incluidos.
//
// Los TypedArray hay que recorrerlos aparte: no son números, así que
// `clavesDe` los descarta, y justo ahí es donde el director guarda sus
// acumuladores por evento. Dejarlos fuera es tener un punto ciego en el sitio
// donde más fácil se queda estado viejo.
// Del gestor de enemigos, lo que la simulación consulta para decidir.
const LEIDOS_ENEMIGOS = ['bajas', 'elitesVivos', 'escoltasVivos', 'paralisisRestante'];

function mezclarCampos(h, obj, campos) {
  if (!obj) return h;
  for (let i = 0; i < campos.length; i++) {
    const v = obj[campos[i]];
    h = mezclar(h, typeof v === 'number' ? v : 0);
  }
  return h;
}

function mezclarEstado(h, obj) {
  if (!obj) return h;
  const claves = Object.keys(obj).sort();
  for (let i = 0; i < claves.length; i++) {
    if (sinVista && SOLO_DIBUJO.indexOf(claves[i]) >= 0) continue;
    const v = obj[claves[i]];
    if (typeof v === 'number') h = mezclar(h, v);
    else if (typeof v === 'boolean') h = mezclar(h, v ? 1 : 0);
    else if (ArrayBuffer.isView(v)) {
      h = mezclar(h, v.length);
      for (let k = 0; k < v.length; k++) h = mezclar(h, v[k]);
    }
  }
  return h;
}

// Un pool entero, en el orden en que están sus activos.
//
// Ese orden IMPORTA y se comprueba a propósito: el pool intercambia con el
// último al dar de baja (ver core/pool.js), así que la secuencia de bajas deja
// una huella en el orden. Si dos simulaciones matan lo mismo pero en distinto
// orden, la firma lo canta — y para lockstep eso ya es una divergencia.
function mezclarPool(h, pool) {
  if (!pool || !pool.items) return h;
  h = mezclar(h, pool.activos);
  for (let i = 0; i < pool.activos; i++) h = mezclarObjeto(h, pool.items[i]);
  return h;
}

function mezclarLista(h, lista) {
  if (!lista) return h;
  h = mezclar(h, lista.length);
  for (let i = 0; i < lista.length; i++) h = mezclarObjeto(h, lista[i]);
  return h;
}

// La huella, POR PARTES.
//
// Una sola cifra dice que algo difiere; esto dice QUÉ. Con nueve piezas por
// separado, la primera comparación ya señala si el problema está en el azar, en
// el reloj del director, en los jugadores o en un pool concreto — y eso ahorra
// las tres horas de ir tapando agujeros a ciegas.
const PARTES = ['rng', 'director', 'camara', 'progresion', 'jugadores',
                'enemigos', 'gestorEnemigos', 'proyectiles', 'zonas', 'disparos',
                'recogibles', 'cofres', 'mascotas', 'jefes', 'particulas', 'vfx',
                'obstaculos', 'arsenales', 'lockstep'];

// De los obstáculos interesa el REPARTO, no cada columna: sobre qué fila se
// calculó, cuántos hay puestos y cuántas filas llevan ya su tanda invocada.
// Con esos tres números, un reinicio que no ocurre se ve al fotograma cero.
function mezclarObstaculos(h, o) {
  if (!o) return h;
  h = mezclar(h, o.activos | 0);
  // `_filaBase` arranca en NaN, que no se puede mezclar: se codifica aparte.
  h = mezclar(h, o._filaBase === o._filaBase ? o._filaBase : 0x7FFFFFFF);
  h = mezclar(h, o._filasConTorchas ? o._filasConTorchas.size : 0);
  return h;
}

function mezclarLockstep(h, L) {
  if (!L) return h;
  h = mezclar(h, L.paso | 0);
  h = mezclar(h, L.retardo | 0);
  const ejes = L._ejes, bot = L._botones;
  if (ejes) for (let i = 0; i < ejes.length; i++) h = mezclar(h, ejes[i]);
  if (bot) for (let i = 0; i < bot.length; i++) h = mezclar(h, bot[i]);
  return h;
}

// EL ARSENAL DE CADA JUGADOR: qué armas lleva, de qué nivel y POR DÓNDE VAN.
//
// Estaba fuera de la firma sin querer, y era el hueco más incómodo que quedaba.
// `mezclarLista` solo mezcla los campos NUMÉRICOS de un objeto, y un arsenal es
// un objeto con una lista dentro: se caía por el borde sin que nadie lo
// decidiera.
//
// Importa más que otros: el arma que se elige al subir de nivel es lo ÚNICO de
// la partida en red que viaja por un camino aparte —el canal fiable, porque el
// menú para el mundo y el búfer de pulsaciones no fluye—, así que es donde más
// fácil es que las dos máquinas acaben con cosas distintas. Y sin esto, dos
// arsenales distintos solo se notaban de rebote, cuando los proyectiles ya
// llevaban un rato divergiendo.
//
// SE MEZCLA EL OBJETO ENTERO, no una lista de campos elegidos. La primera
// versión firmaba solo `id` y `nivel`, y eso deja fuera lo que de verdad se
// mueve: el `temporizador` que decide EN QUÉ PASO dispara cada arma, los golpes
// encadenados que quedan pendientes y el ángulo de los orbitales. Dos máquinas
// con el mismo arsenal y un temporizador desfasado disparan en pasos distintos,
// que es una partida distinta — y con la versión corta la firma decía que los
// arsenales coincidían. Recorrer todas las claves también significa que un
// campo nuevo entra en la firma el día que alguien lo añada, sin acordarse de
// esto.
//
// El identificador es texto, así que se mezcla carácter a carácter: no hace
// falta que sea bonito, hace falta que dos armas distintas den números
// distintos.
//
// `def`, `stats`, `zona` y `repetir` no son números: quedan fuera del bucle.
// `stats` entra aparte porque es donde vive el daño, y es lo que separa un arma
// de nivel 3 de la misma arma evolucionada.
function mezclarTexto(h, s) {
  if (typeof s !== 'string') return mezclar(h, 0);
  h = mezclar(h, s.length);
  for (let c = 0; c < s.length; c++) h = mezclar(h, s.charCodeAt(c));
  return h;
}

// Números y booleanos de un objeto, por orden alfabético de clave. No usa
// `clavesDe` porque esa cachea qué claves eran numéricas la primera vez que vio
// la forma, y aquí hay campos que nacen `null` —`zona`, `repetir`— y otros que
// son booleanos de principio a fin.
function mezclarSueltos(h, obj) {
  if (!obj) return mezclar(h, 0);
  const claves = Object.keys(obj).sort();
  for (let i = 0; i < claves.length; i++) {
    const v = obj[claves[i]];
    if (typeof v === 'number') h = mezclar(h, v);
    else if (typeof v === 'boolean') h = mezclar(h, v ? 1 : 0);
  }
  return h;
}

// Los tajos y los rayos SON SIMULACIÓN, aunque se llamen como se llaman y el
// arsenal los guarde para dibujarlos: `disparos.barrer` los lee para decidir si
// una púa de medusa se deshace al cruzarlos (ver entidades/disparo.js). O sea
// que un tajo que en una máquina sigue vivo y en la otra no es un proyectil
// enemigo que allí sobrevive y aquí no.
//
// Se recorre el búfer ENTERO y no solo los vivos: son doce ranuras fijas, el
// orden en que se reutilizan forma parte del estado, y una ranura muerta con
// números distintos ya es una divergencia de hace un momento.
function mezclarBuffer(h, lista, n) {
  h = mezclar(h, n | 0);
  if (!lista) return h;
  h = mezclar(h, lista.length);
  for (let i = 0; i < lista.length; i++) h = mezclarSueltos(h, lista[i]);
  return h;
}

function mezclarArsenales(h, lista) {
  if (!lista) return h;
  h = mezclar(h, lista.length);
  for (let i = 0; i < lista.length; i++) {
    const ars = lista[i];
    if (!ars) { h = mezclar(h, -1); continue; }
    const eq = ars.equipadas;
    if (!eq) { h = mezclar(h, -1); continue; }
    h = mezclar(h, eq.length);
    for (let k = 0; k < eq.length; k++) {
      h = mezclarTexto(h, eq[k].id);
      h = mezclarSueltos(h, eq[k]);
      h = mezclarSueltos(h, eq[k].stats);
    }
    h = mezclarBuffer(h, ars.tajos, ars.nTajos);
    h = mezclarBuffer(h, ars.rayos, ars.nRayos);
  }
  return h;
}

function firmaDe(e) {
  const H = 0x811c9dc5;
  return [
    mezclar(H, e.rng ? e.rng.estado() : 0) >>> 0,
    mezclarEstado(H, e.director) >>> 0,
    mezclarEstado(H, e.camara) >>> 0,
    mezclarEstado(H, e.progresion) >>> 0,
    mezclarLista(H, e.jugadores) >>> 0,
    mezclarPool(H, e.enemigos && e.enemigos.pool) >>> 0,
    // El GESTOR de enemigos, pero SOLO los campos que la simulación lee.
    //
    // Firmarlo entero era demasiado: `reciclados` y `dibujados` son métricas
    // que solo mira el panel F3 —comprobado, no las lee nadie más— y
    // `_visibles`, `_orden` y `_conteo` son andamios de la ordenación por
    // profundidad, que vive en `dibujar`. Todo eso arrastra valores viejos sin
    // consecuencia, y una prueba que salta por ellos enseña a ignorarla.
    mezclarCampos(H, e.enemigos, LEIDOS_ENEMIGOS) >>> 0,
    mezclarPool(H, e.proyectiles && e.proyectiles.pool) >>> 0,
    mezclarPool(H, e.zonas && e.zonas.pool) >>> 0,
    mezclarPool(H, e.disparos && e.disparos.pool) >>> 0,
    mezclarPool(H, e.recogibles && e.recogibles.pool) >>> 0,
    mezclarPool(H, e.cofres && e.cofres.pool) >>> 0,
    mezclarLista(H, e.mascotas && e.mascotas.activas) >>> 0,
    mezclarEstado(H, e.jefes) >>> 0,
    // Partículas y VFX son cosméticos, PERO su ocupación se lee: cuando el pool
    // va lleno se emiten menos partículas, y emitir consume azar de la partida.
    // O sea que sí entran en la cuenta.
    mezclarPool(H, e.particulas && e.particulas.pool) >>> 0,
    mezclarPool(H, e.vfx && e.vfx.pool) >>> 0,
    // LOS OBSTÁCULOS, que parecían decoración y no lo son.
    //
    // Estaban fuera de la firma por eso mismo: columnas y estatuas que solo se
    // dibujan. Pero la misma plantilla coloca ENEMIGOS y antorchas destruibles,
    // así que este sistema aparece bichos —y gasta azar— como cualquier otro.
    // Quedarse fuera de la firma es justo lo que le permitió esconder durante
    // semanas que no se reiniciaba entre partidas.
    mezclarObstaculos(H, e.obstaculos) >>> 0,
    mezclarArsenales(H, e.arsenales) >>> 0,
    // EL BÚFER DE PULSACIONES. Entra en la firma por la misma razón por la que
    // acabaron entrando los obstáculos: es estado que vive en un módulo, y
    // todo lo que vive en un módulo se ha quedado sin reiniciar alguna vez.
    // Además, cuando haya red, un desajuste de un paso entre las dos máquinas
    // se verá aquí antes que en ninguna otra parte.
    mezclarLockstep(H, e.lockstep) >>> 0
  ];
}

// Una sola cifra a partir de las nueve, para la huella entre navegadores.
function fundir(partes) {
  let h = 0x811c9dc5;
  for (let i = 0; i < partes.length; i++) h = mezclar(h, partes[i]);
  return h >>> 0;
}

// Cuántas entidades hay de cada cosa. No entra en la firma: sirve para el
// informe, porque "difieren los enemigos" y "hay 3 enemigos en una pasada y 5 en
// la otra" son dos pistas muy distintas.
function recuento(e) {
  const n = (g) => (g && g.pool ? g.pool.activos : -1);
  return {
    jugadores: e.jugadores ? e.jugadores.length : -1,
    enemigos: n(e.enemigos), proyectiles: n(e.proyectiles), zonas: n(e.zonas),
    disparos: n(e.disparos), recogibles: n(e.recogibles), cofres: n(e.cofres),
    t: e.director ? e.director.t : -1
  };
}

// --- Las pulsaciones -------------------------------------------------------
//
// Guionizadas y sacadas de la propia semilla, para que las dos pasadas reciban
// exactamente lo mismo. Se sustituye `Entrada.actualizar` mientras dura la
// prueba: leer un mando de verdad metería en la simulación algo que no está en
// el guion, y entonces la prueba no probaría nada.
//
// El vector va NORMALIZADO y en pasos gruesos, que es como llegaría por la red:
// en lockstep no se manda el eje crudo del stick sino el movimiento ya
// decidido, y así de paso la trigonometría de la zona muerta se queda fuera.
const DIRECCIONES = [
  [0, 0], [1, 0], [0, 1], [-1, 0], [0, -1],
  [0.7071067811865476, 0.7071067811865476], [-0.7071067811865476, 0.7071067811865476],
  [0.7071067811865476, -0.7071067811865476], [-0.7071067811865476, -0.7071067811865476]
];

function pulsacionDe(paso, jugador) {
  // Un patrón que cambia a menudo y no depende de nada externo. No pretende
  // jugar bien: pretende MOVERSE, para que el mundo evolucione y haya algo que
  // comparar.
  //
  // LA DIRECCIÓN SE MANTIENE UN RATO, no cambia cada fotograma. Y no es un
  // detalle de estilo: el director sesga por dónde entra la horda según el
  // RUMBO de la cámara, y ese rumbo es una media móvil que solo se considera
  // válida por encima de cierto umbral. Con una dirección nueva cada fotograma
  // el rumbo nunca despega, la rama sesgada de `puntoDeEntrada` no se ejecuta
  // JAMÁS y una de las dos vías de aparición se quedaba sin probar.
  //
  // Se descubrió por las malas: un fallo que reventaba justo en esa rama pasó
  // limpiamente por 3600 fotogramas de prueba y apareció al jugar a mano.
  const tramo = (paso / 45) | 0;
  const k = ((tramo * 2654435761) ^ (jugador * 40503)) >>> 0;
  return DIRECCIONES[(k >>> 9) % DIRECCIONES.length];
}

// Devuelve los objetos de los pools a su estado de fábrica, a mano.
//
// SIRVIÓ PARA DEMOSTRAR el fallo que ahora está arreglado: `Pool.vaciar()` solo
// ponía `activos = 0` y los objetos conservaban los valores de la partida
// anterior. Comparando una partida con los pools limpiados así contra otra con
// los pools sucios salían doce enemigos y dos al primer segundo.
//
// Se queda como comprobación de que `vaciar()` sigue haciendo su trabajo: si
// limpiar a mano cambia algo, es que `vaciar()` ha dejado de limpiar.
//
// Usa la MISMA plantilla que el pool, no ceros. Poner todo a cero comparaba
// contra un estado que la fábrica no produce nunca —hay campos que nacen con
// otro valor— y entonces la prueba fallaba por una diferencia legítima.
function limpiarPools(e) {
  const gestores = [e.enemigos, e.proyectiles, e.zonas, e.disparos,
                    e.recogibles, e.cofres, e.particulas, e.vfx];
  for (let g = 0; g < gestores.length; g++) {
    const pool = gestores[g] && gestores[g].pool;
    if (!pool || !pool.items || !pool._plantilla) continue;
    const claves = pool._claves;
    for (let i = 0; i < pool.items.length; i++) {
      const o = pool.items[i];
      for (let k = 0; k < claves.length; k++) o[claves[k]] = pool._plantilla[claves[k]];
    }
  }
}

// QUÉ FUNCIONES DE `Math` DIFIEREN ENTRE MOTORES.
//
// No necesita el juego: son cuentas puras. Se ejecuta en dos navegadores y se
// comparan las cifras, y lo que salga decide el tamaño del trabajo.
//
// ECMAScript define EXACTAMENTE `+ - * /` y `Math.sqrt` —resultado correctamente
// redondeado, obligatorio— pero deja `sin`, `cos`, `atan2`, `exp` y compañía a
// "una aproximación dependiente de la implementación". Cada motor usa su propia
// biblioteca, y ahí es donde dos partidas idénticas dejan de serlo.
//
// Si solo difieren una o dos, hay que sustituir esas y punto. Si difieren
// todas, el trabajo es mayor. Y `sqrt` tiene que coincidir siempre: si no
// coincide, algo va muy mal en la medición.
export function huellaMotor(muestras = 200000) {
  const buf = new ArrayBuffer(8);
  const f64 = new Float64Array(buf);
  const u32 = new Uint32Array(buf);
  const mez = (h, x) => {
    f64[0] = x;
    h = Math.imul(h ^ u32[0], 0x01000193) >>> 0;
    return Math.imul(h ^ u32[1], 0x01000193) >>> 0;
  };

  // Las entradas se generan solo con multiplicaciones y divisiones, que sí
  // están definidas al bit: si las entradas ya difirieran, la comparación no
  // mediría lo que dice medir.
  const pruebas = {
    sqrt:  (x) => Math.sqrt(x),
    sin:   (x) => Math.sin(x),
    cos:   (x) => Math.cos(x),
    tan:   (x) => Math.tan(x),
    atan2: (x) => Math.atan2(x - 100, 37.5),
    hypot: (x) => Math.hypot(x, x * 0.5 + 1),
    exp:   (x) => Math.exp(-x / 1000),
    pow:   (x) => Math.pow(x / 100, 1.5),
    log:   (x) => Math.log(x + 1)
  };

  const salida = {};
  for (const nombre in pruebas) {
    const f = pruebas[nombre];
    let h = 0x811c9dc5;
    for (let i = 0; i < muestras; i++) h = mez(h, f(i / 97));
    salida[nombre] = h.toString(16).padStart(8, '0');
  }
  console.table(salida);
  return salida;
}

// CUÁNTAS TIRADAS SEPARAN DOS ESTADOS DEL GENERADOR.
//
// mulberry32 avanza su estado con `a = (a + 0x6D2B79F5) | 0` en cada tirada, y
// nada más: el resto de la función revuelve una copia para producir el número,
// pero no toca `a`. Así que el estado es una progresión aritmética y la
// distancia entre dos estados se despeja — basta con dividir por el incremento,
// que en aritmética de 32 bits es multiplicar por su inverso modular. Existe
// porque 0x6D2B79F5 es impar.
//
// Esto vale más de lo que parece: dice EXACTAMENTE cuánto azar ha gastado cada
// pasada, sin poner un contador en la ruta caliente. Cuando dos pasadas
// divergen, la primera pregunta siempre es "¿ha tirado alguien de más?", y la
// respuesta es un número en vez de una sospecha.
const RNG_PASO = 0x6D2B79F5;
const RNG_PASO_INV = 0xDC58AA5D;      // inverso de RNG_PASO módulo 2^32

export function tiradasEntre(antes, despues) {
  return Math.imul(((despues >>> 0) - (antes >>> 0)) | 0, RNG_PASO_INV) >>> 0;
}

export function crearProbador(gancho) {
  // La instantánea del arranque, para compararla después de haber jugado.
  let _instantanea = null;
  let _instantaneaSemilla = 0;
  let _instantaneaPasos = 600;

  // `gancho` lo monta main.js, que es el único que ve el estado de la partida:
  //   reiniciar(semilla)  deja una partida recién empezada con esa semilla
  //   estado()            devuelve los pools y los jugadores de ahora
  //   paso(dt)            un paso de lógica
  //   entrada             la instancia de Entrada, para guionizarla
  //   dt                  el timestep fijo

  function correr(pasos, cada) {
    const huellas = [];
    const original = gancho.entrada.actualizar;
    let paso = 0;

    // Las pulsaciones del guion, en lugar de las del mando.
    gancho.entrada.actualizar = function () {
      for (let i = 0; i < this.controles.length; i++) {
        const c = this.controles[i];
        const d = pulsacionDe(paso, i);
        c.ejeX = d[0];
        c.ejeY = d[1];
        c._flancoBotones = 0;
        c._botonesPrev = 0;
      }
      // Y CONFIRMAR CADA POCO, con el botón A del jugador 1.
      //
      // No es adorno: subir de nivel PARA EL MUNDO hasta que alguien elige
      // carta, y lo mismo hace un cofre. Sin esto, la prueba se quedaba
      // congelada en la primera subida de nivel y las dos pasadas coincidían
      // por no estar simulando nada — el peor resultado posible, porque es un
      // aprobado falso.
      //
      // Se elige siempre la carta señalada, que es la primera. La cadencia es
      // fija para que las dos pasadas pulsen en los mismos fotogramas.
      if (paso % 6 === 0 && this.controles.length > 0) {
        this.controles[0]._flancoBotones = 1;      // bit 0 = A
      }
      this._flanco.clear();
    };

    let simulados = 0;
    // La primera firma se toma ANTES de simular nada: si el reinicio ya deja a
    // las dos pasadas en sitios distintos, hay que verlo separado de lo que
    // haga el primer paso.
    huellas.push(firmaDe(gancho.estado()));
    const recuentos = [recuento(gancho.estado())];

    // LOS INTERRUPTORES QUE PARAN EL MUNDO, que no entran en la firma.
    //
    // La firma cubre los dieciséis componentes de la simulación, y por eso no
    // puede explicar el caso peor: que una pasada no simule NADA. Subir de
    // nivel, abrir un cofre, la pausa o el propio fin de la partida detienen el
    // mundo entero desde fuera, así que dos pasadas pueden diferir en el número
    // de enemigos sin que ninguno de los dieciséis haya hecho nada raro —
    // simplemente uno estaba corriendo y el otro estaba parado.
    //
    // Se anotan aparte, junto a los recuentos, y solo se enseñan al divergir.
    const mandos = [gancho.mando ? gancho.mando() : null];

    // FOTOS DETALLADAS, GUARDADAS SOBRE LA MARCHA.
    //
    // Hasta ahora el detalle se sacaba volviendo a correr la partida, y eso no
    // vale para el caso que queda: el fallo solo aparece entre la PRIMERA
    // partida tras cargar la página y la segunda, y para cuando quieres
    // repetirlo, la primera ya no existe. Guardando las fotos mientras se
    // simula, la comparación se puede hacer luego.
    //
    // Solo si van a caber pocas: con `cada = 1` y miles de pasos esto sería
    // copiar el mundo entero miles de veces.
    const conFoto = pasos / cada <= 60;
    const fotos = conFoto ? [fotoDe(gancho.estado())] : null;
    try {
      for (paso = 0; paso < pasos; paso++) {
        // SI LA PARTIDA SE ACABA, se para aquí.
        //
        // Es el otro aprobado falso que había que tapar: al morir el equipo, el
        // botón del guion pasa por los carteles de derrota y vuelve al menú, y
        // desde ahí `actualizar` sale por la primera rama sin simular nada. Las
        // dos pasadas seguirían coincidiendo —las dos no hacen nada— y la
        // prueba diría que todo va bien habiendo comprobado la mitad.
        if (!gancho.enPartida()) break;
        gancho.paso(gancho.dt);
        simulados++;
        if ((paso + 1) % cada === 0) {
          huellas.push(firmaDe(gancho.estado()));
          recuentos.push(recuento(gancho.estado()));
          if (gancho.mando) mandos.push(gancho.mando());
          if (conFoto) fotos.push(fotoDe(gancho.estado()));
        }
      }
    } finally {
      gancho.entrada.actualizar = original;
    }
    huellas.simulados = simulados;
    huellas.recuentos = recuentos;
    huellas.mandos = mandos;
    huellas.fotos = fotos;
    return huellas;
  }

  // Una foto de todos los números del estado, campo a campo. Sirve para
  // comparar DOS pasadas y decir exactamente qué se ha movido: cuando la firma
  // dice "difieren los enemigos" con el mismo recuento y el mismo azar, lo que
  // queda es un campo concreto de un bicho concreto, y hay que nombrarlo.
  function fotoDe(e, soloGrupos) {
    const foto = {};
    const quiere = (n) => !soloGrupos || soloGrupos.indexOf(n) >= 0;
    const dePool = (nombre, gestor) => {
      if (!quiere(nombre)) return;
      const pool = gestor && gestor.pool;
      if (!pool) return;
      const filas = [];
      for (let i = 0; i < pool.activos; i++) {
        const o = pool.items[i];
        const fila = {};
        const claves = Object.keys(o).sort();
        for (let k = 0; k < claves.length; k++) {
          if (sinVista && SOLO_DIBUJO.indexOf(claves[k]) >= 0) continue;
          const v = o[claves[k]];
          if (typeof v === 'number') fila[claves[k]] = v;
          else if (typeof v === 'boolean') fila[claves[k]] = v ? 1 : 0;
          else if (typeof v === 'string') fila[claves[k]] = v;
        }
        filas.push(fila);
      }
      foto[nombre] = filas;
    };
    dePool('enemigos', e.enemigos);
    dePool('proyectiles', e.proyectiles);
    dePool('zonas', e.zonas);
    dePool('disparos', e.disparos);
    dePool('recogibles', e.recogibles);
    dePool('cofres', e.cofres);
    const jug = [];
    const lista = e.jugadores || [];
    for (let i = 0; i < lista.length; i++) {
      const fila = {};
      const claves = Object.keys(lista[i]).sort();
      for (let k = 0; k < claves.length; k++) {
        const v = lista[i][claves[k]];
        if (typeof v === 'number') fila[claves[k]] = v;
      }
      jug.push(fila);
    }
    if (quiere('jugadores')) foto.jugadores = jug;

    // Y LAS MASCOTAS, que no son un pool y por eso se habían quedado fuera de
    // todas las comparaciones. `Mascotas.activas` es un array preasignado de
    // ranuras: `releer` las reconfigura al empezar partida, pero solo los
    // campos que le interesan. Lo que no toca —una posición, un reloj— se
    // queda con lo que dejó la partida anterior.
    const mas = [];
    const ranuras = (e.mascotas && e.mascotas.activas) || [];
    for (let i = 0; i < ranuras.length; i++) {
      const fila = {};
      const claves = Object.keys(ranuras[i]).sort();
      for (let k = 0; k < claves.length; k++) {
        const v = ranuras[i][claves[k]];
        if (typeof v === 'number') fila[claves[k]] = v;
        else if (typeof v === 'boolean') fila[claves[k]] = v ? 1 : 0;
        else if (typeof v === 'string') fila[claves[k]] = v;
      }
      mas.push(fila);
    }
    if (quiere('mascotas')) foto.mascotas = mas;

    // Y LOS ARSENALES, una fila por arma equipada.
    //
    // Sin esto, el detalle no tenía nada que decir justo en la parte más
    // delicada del montaje: cuando la firma señala `arsenales`, `pedirFoto`
    // pedía un grupo que la foto no producía y la respuesta llegaba vacía. La
    // pista se quedaba en "difieren las armas" sin decir cuál ni en qué.
    //
    // `stats` se aplana con prefijo en vez de anidarse: `diferencias` compara
    // campo a campo un nivel de profundidad, así que un objeto dentro de la
    // fila se compararía por identidad y nunca diría nada.
    const ars = [];
    const arsenales = e.arsenales || [];
    for (let i = 0; i < arsenales.length; i++) {
      const eq = (arsenales[i] && arsenales[i].equipadas) || [];
      for (let k = 0; k < eq.length; k++) {
        const fila = { _de: i, id: eq[k].id };
        const claves = Object.keys(eq[k]).sort();
        for (let c = 0; c < claves.length; c++) {
          const v = eq[k][claves[c]];
          if (typeof v === 'number') fila[claves[c]] = v;
          else if (typeof v === 'boolean') fila[claves[c]] = v ? 1 : 0;
        }
        const s = eq[k].stats || {};
        const sc = Object.keys(s).sort();
        for (let c = 0; c < sc.length; c++) {
          if (typeof s[sc[c]] === 'number') fila['s_' + sc[c]] = s[sc[c]];
        }
        ars.push(fila);
      }
    }
    if (quiere('arsenales')) foto.arsenales = ars;
    return foto;
  }

  function diferencias(A, B, tope) {
    const salida = [];
    for (const grupo in A) {
      const a = A[grupo], b = B[grupo] || [];
      if (a.length !== b.length) {
        salida.push({ grupo, indice: '-', campo: '(cuántos)', pasada1: a.length, pasada2: b.length });
        continue;
      }
      for (let i = 0; i < a.length && salida.length < tope; i++) {
        for (const campo in a[i]) {
          if (a[i][campo] !== b[i][campo]) {
            salida.push({ grupo, indice: i, campo, pasada1: a[i][campo], pasada2: b[i][campo] });
            if (salida.length >= tope) break;
          }
        }
      }
    }
    return salida;
  }

  const api = {
    // EL DETALLE: qué campo concreto difiere en un fotograma dado.
    //
    // Se corre la partida dos veces hasta ese fotograma y se comparan todos los
    // números uno a uno. Es lo que convierte un "difieren los enemigos" en un
    // "el enemigo 3 tiene `fase` a 1.2 en una pasada y a 0.7 en la otra", que ya
    // se puede ir a buscar al código.
    detallar(fotograma, semilla = 0xE3E21A, tope = 25) {
      gancho.reiniciar(semilla);
      correr(fotograma, 1e9);
      const A = fotoDe(gancho.estado());
      gancho.reiniciar(semilla);
      correr(fotograma, 1e9);
      const B = fotoDe(gancho.estado());

      const difs = diferencias(A, B, tope);
      if (difs.length === 0) {
        console.log(`En el fotograma ${fotograma} no hay ninguna diferencia numérica.`);
        return [];
      }
      console.error(`${difs.length} diferencias en el fotograma ${fotograma}:`);
      console.table(difs);
      return difs;
    },

    // LA PRUEBA QUE DECIDE SI EL LOCKSTEP ES VIABLE.
    //
    // Compara una partida con los pools RECIÉN PUESTOS A CERO contra la misma
    // partida con los pools SUCIOS de haber jugado antes. Y eso no es un caso
    // rebuscado: es exactamente lo que pasa online. Uno acaba de abrir el juego
    // y tiene los pools como los dejó la fábrica; el otro lleva tres partidas y
    // los tiene llenos de restos, en otro orden, porque el pool intercambia
    // posiciones al dar de baja.
    //
    // Si estas dos divergen, dos jugadores no pueden simular la misma partida
    // por muy bien que les llegue la red — y hay que arreglarlo antes de
    // escribir una sola línea de conexión.
    contraste(pasos = 600, cada = 60, semilla = 0xE3E21A) {
      gancho.reiniciar(semilla);
      limpiarPools(gancho.estado());
      const limpio = correr(pasos, cada);

      // Y ahora SIN limpiar: los pools llevan dentro lo que dejó la pasada de
      // arriba, que es justo la situación del jugador que ya llevaba un rato.
      gancho.reiniciar(semilla);
      const sucio = correr(pasos, cada);

      for (let i = 0; i < limpio.length; i++) {
        const culpables = [];
        for (let k = 0; k < PARTES.length; k++) {
          if (limpio[i][k] !== sucio[i][k]) culpables.push(PARTES[k]);
        }
        if (culpables.length === 0) continue;
        const fot = i === 0 ? 0 : i * cada;
        console.error(`Limpiar los pools a mano CAMBIA la partida (fotograma ${fot}): ` +
                      `Pool.vaciar() no los está devolviendo a su estado de fábrica.`);
        console.error('  partes que difieren: ' + culpables.join(', '));
        console.table({ 'pools limpios': limpio.recuentos[i], 'pools sucios': sucio.recuentos[i] });
        console.error('  => Revisar Pool.vaciar() en core/pool.js.');
        return { igual: false, fotograma: fot, partes: culpables };
      }
      console.log(`Pool.vaciar() deja los objetos como la fábrica: ` +
                  `${limpio.simulados} fotogramas idénticos.`);
      return { igual: true };
    },

    // CAMPOS QUE LA FÁBRICA NO CREÓ.
    //
    // `Pool.vaciar()` devuelve cada objeto a su plantilla, pero la plantilla
    // solo conoce los campos con los que nació. Si durante la partida alguien
    // le cuelga a una entidad una propiedad nueva —`e.loQueSea = 3`— ese campo
    // NO se reinicia jamás, y entonces empieza a importar qué objeto concreto
    // te da el pool. Como el orden del array cambia con las bajas, eso hace que
    // dos partidas con la misma semilla no sean la misma.
    //
    // Esto los caza. Hay que llamarlo DESPUÉS de jugar un rato, no recién
    // cargado: si nadie ha jugado, nadie ha colgado nada.
    camposExtra() {
      const e = gancho.estado();
      const gestores = {
        enemigos: e.enemigos, proyectiles: e.proyectiles, zonas: e.zonas,
        disparos: e.disparos, recogibles: e.recogibles, cofres: e.cofres,
        particulas: e.particulas, vfx: e.vfx
      };
      const hallazgos = [];
      for (const nombre in gestores) {
        const pool = gestores[nombre] && gestores[nombre].pool;
        if (!pool || !pool._claves) continue;
        const conocidas = new Set(pool._claves);
        const vistos = new Set();
        for (let i = 0; i < pool.items.length; i++) {
          const claves = Object.keys(pool.items[i]);
          for (let k = 0; k < claves.length; k++) {
            if (!conocidas.has(claves[k]) && !vistos.has(claves[k])) {
              vistos.add(claves[k]);
              hallazgos.push({ pool: nombre, campo: claves[k], ejemplo: pool.items[i][claves[k]] });
            }
          }
        }
      }
      if (hallazgos.length === 0) {
        console.log('Ningún campo fuera de la plantilla. Los pools se reinician enteros.');
      } else {
        console.error(`${hallazgos.length} campos que la fábrica no creó y que NADIE reinicia:`);
        console.table(hallazgos);
      }
      return hallazgos;
    },

    // HABER JUGADO ANTES, ¿CAMBIA LA SIGUIENTE PARTIDA?
    //
    // Es la pregunta que ninguna otra prueba de aquí puede hacer, porque todas
    // comparan dos pasadas seguidas y las dos arrastran lo mismo. Esta se parte
    // en dos mitades separadas por una partida DE VERDAD, jugada a mano:
    //
    //   1. Recargar la página.  EMERITA.determinismo.guardarInstantanea()
    //   2. Jugar una partida entera y volver al menú.
    //   3.                      EMERITA.determinismo.compararInstantanea()
    //
    // Y ES EL CASO REAL DEL COOPERATIVO, no un caso de laboratorio: uno de los
    // dos acaba de abrir el juego y el otro lleva tres partidas. Si el arranque
    // no es idéntico en los dos, no hay lockstep que aguante.
    guardarInstantanea(pasos = 600, semilla = 0xE3E21A) {
      gancho.reiniciar(semilla);
      // SE SIMULA UN RATO antes de la foto, no se retrata el arranque pelado.
      // Un resto puede estar en un campo que nadie lee hasta que la partida
      // arranca de verdad, y entonces el fotograma cero sale limpio y la
      // divergencia aparece diez segundos después.
      correr(pasos, 1e9);
      _instantanea = fotoDe(gancho.estado());
      _instantaneaSemilla = semilla;
      _instantaneaPasos = pasos;
      console.log('Instantánea del arranque guardada. Juega una partida entera, ' +
                  'vuelve al menú y llama a EMERITA.determinismo.compararInstantanea().');
      return true;
    },

    compararInstantanea() {
      if (!_instantanea) {
        console.error('No hay instantánea. Llama antes a guardarInstantanea(), ' +
                      'recién recargada la página.');
        return null;
      }
      gancho.reiniciar(_instantaneaSemilla);
      correr(_instantaneaPasos, 1e9);
      const ahora = fotoDe(gancho.estado());
      const difs = diferencias(_instantanea, ahora, 60);
      if (difs.length === 0) {
        console.log(`Los ${_instantaneaPasos} primeros fotogramas son IDÉNTICOS ` +
                    'antes y después de jugar. ' +
                    'Nada de la partida anterior sobrevive.');
        return [];
      }
      console.error(`${difs.length} campos que la partida anterior ha dejado sucios:`);
      console.error('  (pasada1 = recién cargado, pasada2 = después de jugar)');
      console.table(difs);
      return difs;
    },

    // ¿DE VERDAD SE ESTÁ APLICANDO EL RETARDO? Se cuenta, no se opina.
    //
    // "No noto diferencia entre 0 y 6" tiene dos explicaciones, y una es que el
    // búfer no esté haciendo nada. Esto las separa: se empuja el stick a tope
    // desde el primer paso y se mira EN QUÉ PASO empieza a moverse el
    // personaje. Con retardo 2 tiene que ser el tercero, ni antes ni después.
    //
    // Vale también como red de seguridad para cuando llegue la red: si algún
    // día el desfase real deja de coincidir con el configurado, el fallo está
    // en el búfer y no en la conexión.
    medirRetardo() {
      const L = gancho.estado().lockstep;
      if (!L) { console.error('No hay búfer de pulsaciones.'); return null; }
      const esperado = L.retardo;
      const pasos = esperado + 6;
      const original = gancho.entrada.actualizar;
      let primero = -1;

      gancho.reiniciar(0xE3E21A);
      // El stick a tope a la derecha, todos los pasos y sin tocar botones: no
      // queremos que salte el menú de subida de nivel a mitad de la medición.
      gancho.entrada.actualizar = function () {
        for (let i = 0; i < this.controles.length; i++) {
          const c = this.controles[i];
          c.ejeX = 1; c.ejeY = 0;
          c._flancoBotones = 0; c._botonesPrev = 0;
        }
        this._flanco.clear();
      };
      try {
        const j = gancho.estado().jugadores[0];
        let x = j.x;
        for (let p = 0; p < pasos; p++) {
          gancho.paso(gancho.dt);
          if (primero < 0 && j.x !== x) primero = p;
          x = j.x;
        }
      } finally {
        gancho.entrada.actualizar = original;
      }

      if (primero < 0) {
        console.error(`El personaje NO se ha movido en ${pasos} pasos con el stick a tope. ` +
                      'El búfer no está entregando nada.');
        return { esperado, medido: -1, correcto: false };
      }
      const correcto = primero === esperado;
      const msg = `Retardo configurado ${esperado}, medido ${primero} ` +
                  `(el personaje se mueve por primera vez en el paso ${primero}).`;
      if (correcto) console.log(msg + ' CORRECTO.');
      else console.error(msg + ' NO CUADRAN: el búfer no desfasa lo que dice.');
      return { esperado, medido: primero, correcto };
    },

    // PRUEBA 1: la misma partida dos veces en esta pestaña.
    repetir(pasos = 3600, cada = 60, semilla = 0xE3E21A, aFondo = false) {
      gancho.reiniciar(semilla);
      if (aFondo) limpiarPools(gancho.estado());
      const a = correr(pasos, cada);
      gancho.reiniciar(semilla);
      if (aFondo) limpiarPools(gancho.estado());
      const b = correr(pasos, cada);

      for (let i = 0; i < a.length; i++) {
        const culpables = [];
        for (let k = 0; k < PARTES.length; k++) {
          if (a[i][k] !== b[i][k]) culpables.push(PARTES[k]);
        }
        if (culpables.length === 0) continue;

        // El fotograma 0 es la foto de ANTES de simular: si diverge ahí, el
        // problema es el reinicio, no la simulación.
        const fot = i === 0 ? 0 : i * cada;
        const donde = i === 0
          ? 'ANTES de simular nada: el problema está en el REINICIO, no en la simulación'
          : `en el fotograma ${fot} (la firma de ${(i - 1) * cada} coincidía, ` +
            `así que está en esos ${cada} pasos)`;

        console.error(`DIVERGEN ${donde}.`);
        console.error('  partes que difieren: ' + culpables.join(', '));
        console.table({ 'pasada 1': a.recuentos[i], 'pasada 2': b.recuentos[i] });
        // Y los interruptores de fuera de la firma: si una pasada tiene el
        // mundo parado, se ve aquí y no hay que buscar más lejos.
        // CUÁNTO AZAR HA GASTADO CADA UNA desde el principio. Si difiere, la
        // divergencia está en QUIÉN TIRA, no en qué sale: alguien ha pedido un
        // número de más o de menos, y a partir de ahí las dos partidas leen la
        // misma secuencia desplazada.
        if (a.mandos[0] && a.mandos[i] && a.mandos[0].rngEstado !== undefined) {
          const ga = tiradasEntre(a.mandos[0].rngEstado, a.mandos[i].rngEstado);
          const gb = tiradasEntre(b.mandos[0].rngEstado, b.mandos[i].rngEstado);
          if (ga !== gb) {
            console.error(`  AZAR GASTADO distinto: ${ga} tiradas en la pasada 1 ` +
                          `y ${gb} en la pasada 2 (${ga > gb ? '+' : ''}${ga - gb}).`);
          } else {
            console.error(`  Azar gastado IGUAL en las dos (${ga} tiradas): ` +
                          `no sobra ni falta ninguna tirada, difiere lo que se hace con ellas.`);
          }
        }
        if (a.mandos[i] && b.mandos[i]) {
          const filas = {};
          for (const campo in a.mandos[i]) {
            const x = a.mandos[i][campo], y = b.mandos[i][campo];
            filas[campo] = { 'pasada 1': x, 'pasada 2': y, '': x === y ? '' : '<-- DIFIERE' };
          }
          console.table(filas);
        }
        // El detalle, si se guardó: qué campo de qué entidad, sin volver a
        // correr la partida.
        if (a.fotos && b.fotos) {
          const difs = diferencias(a.fotos[i], b.fotos[i], 25);
          if (difs.length > 0) {
            console.error(`  ${difs.length} diferencias concretas:`);
            console.table(difs);
          }
        }
        if (i > 0) console.error(`  Afinar con: EMERITA.determinismo.repetir(${fot}, 1)`);
        return { igual: false, fotograma: fot, partes: culpables };
      }
      if (a.simulados !== b.simulados) {
        console.error(`Las dos pasadas simularon distinto numero de fotogramas ` +
                      `(${a.simulados} y ${b.simulados}): eso YA es divergencia.`);
        return { igual: false, fotograma: Math.min(a.simulados, b.simulados), huellas: a.length };
      }
      if (a.simulados < pasos) {
        console.warn(`La partida se acabó en el fotograma ${a.simulados} de ${pasos}. ` +
                     `Idénticas hasta ahí, pero la prueba solo cubre eso: ` +
                     `repítela con menos pasos o con más jugadores.`);
      }
      console.log(`IDÉNTICAS: ${a.simulados} fotogramas simulados, ` +
                  `${a.length} firmas comparadas.`);
      return { igual: true, fotograma: -1, huellas: a.length, simulados: a.simulados };
    },

    // PRUEBA 2: la huella para comparar con OTRO navegador.
    //
    // Se ejecuta en los dos y se comparan las dos cadenas a ojo. Si la primera
    // prueba pasa y esta no, la culpa es de las funciones trascendentes, que es
    // exactamente lo que hay que saber antes de decidir si el lockstep es
    // viable sin reescribirlas.
    firmar(pasos = 3600, cada = 600, semilla = 0xE3E21A) {
      gancho.reiniciar(semilla);
      const h = correr(pasos, cada);
      const texto = h.map((p) => fundir(p).toString(16).padStart(8, '0')).join(' ');
      console.log(`Huella de ${pasos} fotogramas (semilla ${semilla.toString(16)}):`);
      console.log(texto);

      // Y LA MISMA HUELLA, DESGLOSADA POR COMPONENTE.
      //
      // Comparando entre navegadores no se pueden restar dos ejecuciones: cada
      // una vive en una maquina distinta. Con el desglose, quien compara ve en
      // que FILA difieren las dos tablas, que es la diferencia entre "algo
      // falla" y "fallan las particulas".
      const tabla = {};
      for (let k = 0; k < PARTES.length; k++) {
        tabla[PARTES[k]] = h.map((p) => p[k].toString(16).padStart(8, '0')).join(' ');
      }
      console.table(tabla);
      return texto;
    },

    // La firma de AHORA MISMO, sin tocar nada. Para mirar a mano.
    firma() { return fundir(firmaDe(gancho.estado())) >>> 0; },

    // LA HUELLA DEL MUNDO, SIN EL BÚFER DE PULSACIONES.
    //
    // Es la que se compara ENTRE DOS MÁQUINAS, y tiene que dejar fuera el
    // búfer porque los dos búferes nunca son iguales aunque la partida sea la
    // misma: cada máquina lleva registrado su propio futuro local -lo que se
    // está pulsando aquí, apuntado para dentro de `retardo` pasos- y ha
    // recibido del otro hasta donde le haya llegado, que depende de la red.
    //
    // Compararlo delataba una desincronización en el primer segundo de la
    // primera partida en red, y no había ninguna: lo que difería era la medida.
    // El búfer sigue dentro de la firma normal, que compara dos pasadas en la
    // MISMA máquina, donde sí tiene que coincidir.
    firmaMundo() {
      const p = this.partesMundo();
      let h = 0x811c9dc5;
      for (let i = 0; i < p.length; i++) h = mezclar(h, p[i]);
      return h >>> 0;
    },

    // Los componentes del mundo, uno a uno, sin el búfer ni los campos de
    // dibujo. Es lo que viaja entre las dos máquinas: comparando componente a
    // componente, una desincronización dice EN QUÉ se han separado —el azar, el
    // director, un pool concreto— en vez de dejar dos cifras que no se parecen.
    partesMundo() {
      sinVista = true;
      let f;
      try { f = firmaDe(gancho.estado()); } finally { sinVista = false; }
      const fuera = [];
      for (let i = 0; i < PARTES.length; i++) {
        if (PARTES[i] === 'lockstep') continue;
        fuera.push(f[i] >>> 0);
      }
      return fuera;
    },

    // UNA FOTO DE TODOS LOS NÚMEROS DEL MUNDO, para mandársela al otro.
    //
    // Cuando dos máquinas dicen que difieren "los disparos", eso todavía no se
    // puede arreglar: hay que saber QUÉ disparo y QUÉ campo. Esto es lo que
    // viaja en ese momento, una sola vez, y `comparaFotos` lo convierte en una
    // línea del estilo "el disparo 3 tiene `vida` a 1 aquí y a 0 allí".
    //
    // Se toma sin los campos de dibujo, igual que la firma que se compara: si
    // no, la tabla saldría llena de diferencias legítimas de interpolación.
    // `grupos` NO ES OPCIONAL EN PARTIDA, y esto costó un cuelgue.
    //
    // Tomarla entera crea un objeto por entidad viva con todos sus campos. Al
    // minuto cinco hay cientos de enemigos, y la partida en red la pedía tres
    // veces por segundo: eso es basura en caliente, justo lo que este motor
    // evita en todas partes. A Sergio se le congeló el navegador entero, sin un
    // error en la consola, porque no había ningún error — había un recolector
    // ahogado.
    //
    // Desde la consola, a mano y con la partida parada, pedirla entera está
    // bien. Desde el bucle, JAMÁS sin acotar los grupos.
    foto(grupos) {
      sinVista = true;
      let f;
      try { f = fotoDe(gancho.estado(), grupos); } finally { sinVista = false; }
      if (!grupos || grupos.length === 0) return f;
      const recorte = {};
      for (let i = 0; i < grupos.length; i++) {
        if (f[grupos[i]]) recorte[grupos[i]] = f[grupos[i]];
      }
      return recorte;
    },

    comparaFotos(mia, suya, tope = 40) { return diferencias(mia, suya, tope); },

    // Los nombres, en el mismo orden que `partesMundo`.
    nombresMundo() {
      return PARTES.filter((n) => n !== 'lockstep');
    },

    // Las nueve piezas por separado, con su nombre. Para inspeccionar sin
    // ejecutar ninguna prueba.
    partes() {
      const f = firmaDe(gancho.estado());
      const r = {};
      for (let i = 0; i < PARTES.length; i++) r[PARTES[i]] = f[i].toString(16);
      return r;
    }
  };

  // TODAS LAS PRUEBAS JUEGAN SIN TU PROGRESO, y te lo devuelven al terminar.
  //
  // Las mejoras compradas con denarios cambian la vida y el daño del personaje,
  // así que dos máquinas con distinto progreso guardado no comparan la misma
  // partida y la huella deja de significar nada. Se envuelven todos los métodos
  // de golpe en vez de repetir el try/finally en cada uno: si mañana se añade
  // una prueba, entra ya protegida sin que nadie tenga que acordarse.
  //
  // El `finally` no es adorno: si una prueba revienta a la mitad, el progreso
  // tiene que volver a su sitio igualmente. Y mientras dura, `guardar()` está
  // congelado, así que nada de esto puede llegar al disco.
  //
  // MENOS LAS QUE NO EMPIEZAN PARTIDA. `firma()` y `partes()` solo miran el
  // mundo tal como está, y la partida EN RED las llama una vez por segundo para
  // comparar con el otro jugador (ver red/sincro.js). Envolverlas ahí sería
  // cambiarte el progreso guardado sesenta veces por minuto en plena partida, y
  // devolvértelo justo después: un ir y venir por nada, con todas las
  // papeletas de dejarlo mal a la primera excepción.
  const SIN_META = ['firma', 'firmaMundo', 'partesMundo', 'nombresMundo',
                    'foto', 'comparaFotos', 'partes', 'camposExtra'];
  if (gancho.fijarMeta) {
    for (const nombre in api) {
      const original = api[nombre];
      if (typeof original !== 'function') continue;
      if (SIN_META.indexOf(nombre) >= 0) continue;
      api[nombre] = function (...args) {
        const previo = gancho.fijarMeta();
        try {
          return original.apply(api, args);
        } finally {
          gancho.restaurarMeta(previo);
        }
      };
    }
  }

  return api;
}
