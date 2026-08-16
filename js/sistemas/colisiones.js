import { DT } from '../core/constantes.js';

// Colisiones sobre la rejilla espacial. Dos consumidores:
//   - separacion()      enemigo <-> enemigo, para que no se apilen en un punto
//   - contactoJugador() enemigo <-> jugador, daño por contacto
//
// Ambos leen la MISMA rejilla, construida una sola vez por paso de lógica.

// La separación es una RESTRICCIÓN POSICIONAL, no una fuerza.
//
// Primero se intentó como fuerza sumada a la velocidad y no funciona: la
// persecución tira siempre a tope hacia el jugador y el empuje solo aparece
// cuando ya hay solape, así que el montón se comprime hasta que ambos se
// igualan. Peor aún, dentro de un amontonamiento simétrico los empujes de todos
// los lados se cancelan y el que está en el centro no tiene a dónde ir. Con 500
// serpientes eso daba 2.354 pares gravemente solapados y una distancia mínima de
// 0,34px: literalmente unos dentro de otros.
//
// Como restricción no hay equilibrio de fuerzas que negociar: si dos siluetas se
// solapan, se separan y punto. La persecución puede empujar todo lo que quiera.
// El resultado es el muro de cuerpos del género: los de atrás no llegan al
// jugador porque los de delante ocupan el sitio.

// Fracción del solape que se corrige por paso.
//
// Las correcciones acumuladas se dividen por la RAÍZ del número de contactos.
// No es un número elegido a ojo: con 500 enemigos asentados alrededor del
// jugador, midiendo qué porcentaje de pasos invierte cada enemigo su dirección
// de movimiento (que es exactamente lo que se ve como vibración) sale
//
//   divisor 1 (sumar)      98,9% de pasos invertidos, 2,55px por paso  <- vibra
//   divisor raiz(c)         9,6%                      0,05px
//   divisor c (promediar)   5,7%                      0,11px
//
// Sumar sobrecorrige: un enemigo con doce vecinos recibe doce correcciones
// completas, se pasa de largo, al paso siguiente le corrigen en sentido
// contrario y vuelta a empezar, 60 veces por segundo. Promediar estabiliza pero
// se queda tan corto que deja de separar (la distancia mínima entre bichos cae
// a 0,08px y los pares solapados se multiplican por quince). La raíz da lo
// mejor de ambos: se asienta Y separa mejor que sumando (distancia mínima 3,76
// frente a 1,40).
const RELAJACION = 0.8;

// Tope del desplazamiento por paso, en px lógicos. Un enemigo en el centro de un
// apelotonamiento recibe la suma de veinte correcciones y sin tope saldría
// disparado a la otra punta del mapa.
const MAX_CORRECCION = 4;

// Pasadas del solucionador por paso de lógica. Es la palanca directa entre "no
// se solapan" y coste de CPU: cada pasada recorre TODOS los pares vecinos, y con
// los valores por defecto son cinco recorridos por paso.
//
// Ajustables en caliente desde la consola (`window.EMERITA.ajustes`) para poder
// medir su coste real en una máquina concreta, que es algo que no se puede
// deducir a ojo. Bajar `pasadasDuras` a 1 y `iteraciones` a 1 corta el trabajo
// de separación a la quinta parte, a cambio de que se interpenetren más.
export const ajustes = {
  iteraciones: 2,      // pasadas blandas, reparten la multitud
  pasadasDuras: 3      // pasadas duras, garantizan que no se solapen
};

// El daño por contacto alcanza un poco más lejos que el cuerpo sólido. Sin este
// margen, los enemigos quedarían empujados a exactamente el borde y el golpe
// entraría o no según el último bit del cálculo en coma flotante. Con el 10%,
// el que está pegado a ti te hace daño siempre.
const MARGEN_DANYO = 1.10;

// Acumula la corrección de un par. El chequeo va SIEMPRE con distancias al
// cuadrado; la raíz solo se paga en los pares que de verdad se solapan, y hace
// falta para tener la dirección.
//
// Acumular y aplicar al final (Jacobi) en vez de mover dentro del bucle
// (Gauss-Seidel): el segundo converge antes, pero hace que el resultado dependa
// del orden en que la rejilla visita las celdas, y ese orden cambia cuando el
// pool intercambia posiciones al reciclar. Mismo estado, distinto resultado.
function empujar(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const r = a.radioSep + b.radioSep;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return;

  let nx, ny, solape;
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    nx = dx / d;
    ny = dy / d;
    solape = r - d;              // en px, no normalizado: es una distancia
  } else {
    // Exactamente encima: cualquier dirección vale, pero tiene que ser siempre
    // la misma o el par vibraría. Determinista, que es el criterio 10.
    nx = 1; ny = 0; solape = r;
  }

  // Reparto por masa: el ligero cede. Un cíclope (masa 8) contra una serpiente
  // (masa 1) apenas se aparta y es la serpiente la que rodea.
  //
  // Dos inmunes al empuje (invMasa 0 los dos, ver entidades/enemigo.js) dan
  // total 0: sin esta salida sería una división por cero. Es un caso raro
  // —dos jefes solapados— pero posible si Cerbero sigue vivo cuando entra la
  // Loba, y no hay nada sensato que repartir entre dos cuerpos que ninguno de
  // los dos va a ceder.
  const total = a.invMasa + b.invMasa;
  if (total <= 0) return;   // los dos son inamovibles: no hay nada que repartir
  const corr = solape * RELAJACION;
  const ca = (corr * a.invMasa) / total;
  const cb = (corr * b.invMasa) / total;

  a.sepX -= nx * ca;
  a.sepY -= ny * ca;
  b.sepX += nx * cb;
  b.sepY += ny * cb;
  a.contactos++;
  b.contactos++;
}

// Resuelve una penetración REAL de los círculos de colisión, al instante y al
// 100%. Es el segundo escalón, y es el que garantiza el invariante duro: dos
// cuerpos no ocupan el mismo sitio, nunca.
//
// La separación blanda de arriba trabaja sobre `radioSep` (radio x 1.6) y es
// quien reparte la multitud, pero como se relaja y se promedia siempre deja un
// residuo: medido, 114 pares interpenetrados con hasta 4,73px de solape. Esta
// pasada los corrige de golpe.
//
// Aquí sí se mueve dentro del bucle (Gauss-Seidel) en vez de acumular: no hay
// riesgo de oscilación porque solo actúa sobre los que de verdad se solapan, que
// son pocos, y así una sola pasada basta.
function separarDuro(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const r = a.radioCuerpo + b.radioCuerpo;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return;

  let nx, ny, pen;
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    nx = dx / d;
    ny = dy / d;
    pen = r - d;
  } else {
    nx = 1; ny = 0; pen = r;
  }

  const total = a.invMasa + b.invMasa;
  if (total <= 0) return;   // dos inamovibles solapados: nada que repartir (ver empujar)
  const ca = (pen * a.invMasa) / total;
  const cb = (pen * b.invMasa) / total;
  a.x -= nx * ca;
  a.y -= ny * ca;
  b.x += nx * cb;
  b.y += ny * cb;
}

// Todos los pares entre dos celdas distintas.
function paresEntre(items, indices, iniA, finA, iniB, finB, fn) {
  for (let p = iniA; p < finA; p++) {
    const a = items[indices[p]];
    for (let q = iniB; q < finB; q++) fn(a, items[indices[q]]);
  }
}

// Recorre cada par de enemigos vecinos EXACTAMENTE UNA VEZ y le aplica `fn`.
// `fn` es una referencia a función de módulo, no una closure: no se asigna nada.
function recorrerPares(items, rejilla, fn) {
  const inicio = rejilla.inicio;
  const indices = rejilla.indices;
  const columnas = rejilla.columnas;
  const filas = rejilla.filas;

  // MEDIA vecindad. Con las 9 celdas cada par se visitaría dos veces; mirando
  // solo derecha, abajo-izquierda, abajo y abajo-derecha (más la propia celda
  // con q > p) cada par sale exactamente una vez y el trabajo se reduce a la
  // mitad, tanto en recorrido como en cuentas.
  for (let cy = 0; cy < filas; cy++) {
    const ultimaFila = cy === filas - 1;
    for (let cx = 0; cx < columnas; cx++) {
      const c = cy * columnas + cx;
      const ini = inicio[c];
      const fin = inicio[c + 1];
      if (ini === fin) continue;

      // Pares dentro de la propia celda
      for (let p = ini; p < fin; p++) {
        const a = items[indices[p]];
        for (let q = p + 1; q < fin; q++) fn(a, items[indices[q]]);
      }

      // Derecha
      if (cx + 1 < columnas) {
        const d = c + 1;
        paresEntre(items, indices, ini, fin, inicio[d], inicio[d + 1], fn);
      }
      if (ultimaFila) continue;

      const base = c + columnas;
      // Abajo-izquierda, abajo, abajo-derecha
      if (cx > 0)            paresEntre(items, indices, ini, fin, inicio[base - 1], inicio[base], fn);
      paresEntre(items, indices, ini, fin, inicio[base], inicio[base + 1], fn);
      if (cx + 1 < columnas) paresEntre(items, indices, ini, fin, inicio[base + 1], inicio[base + 2], fn);
    }
  }
}

// Vuelca lo acumulado sobre las posiciones.
function aplicarCorrecciones(items, n) {
  for (let k = 0; k < n; k++) {
    const e = items[k];
    const c = e.contactos;
    if (c === 0) continue;

    const div = Math.sqrt(c);
    let cx = e.sepX / div;
    let cy = e.sepY / div;
    const m2 = cx * cx + cy * cy;
    if (m2 > MAX_CORRECCION * MAX_CORRECCION) {
      const inv = MAX_CORRECCION / Math.sqrt(m2);
      cx *= inv;
      cy *= inv;
    }
    e.x += cx;
    e.y += cy;
  }
}

// Ningún enemigo puede ACERCARSE al jugador más rápido de lo que anda, pase lo
// que pase con la multitud.
//
// Sin esto, los de atrás empujan a los de delante y la primera línea avanza más
// deprisa que su propia velocidad: medido con 500 enemigos, serpientes de 68
// px/s llegaban a 83,6 y el jugador (85) no lograba despegarse ni un píxel en
// cinco segundos de huida. La horda entera corría más que el bicho más rápido
// que la compone.
//
// Se recorta SOLO la componente que apunta al jugador. De lado y hacia fuera la
// multitud sigue empujando todo lo que necesite, que es lo que deshace los
// amontonamientos.
function topeAcercamiento(items, n) {
  for (let k = 0; k < n; k++) {
    const e = items[k];
    if (e.contactos === 0) continue;     // sin vecinos nadie le ha empujado
    // Se recorta el acercamiento a SU objetivo, el mismo que eligió al moverse.
    const obj = e.objetivo;
    if (!obj) continue;

    let hx = obj.x - e.xPrev;
    let hy = obj.y - e.yPrev;
    const h2 = hx * hx + hy * hy;
    if (h2 < 0.0001) continue;
    const invH = 1 / Math.sqrt(h2);
    hx *= invH;
    hy *= invH;

    const avance = (e.x - e.xPrev) * hx + (e.y - e.yPrev) * hy;
    const tope = e.velocidad * DT;
    if (avance > tope) {
      const exceso = avance - tope;
      e.x -= hx * exceso;
      e.y -= hy * exceso;
    }
  }
}

// El jugador es un cuerpo SÓLIDO que aparta, y al que nadie aparta.
//
// La asimetría es deliberada y es lo único que hace jugable tener cuerpos
// sólidos en este género. Si el empuje fuera mutuo, quedar rodeado sería una
// sentencia: no podrías atravesar el muro de cuerpos ni retroceder. Apartando
// tú a ellos, te abres paso a tu velocidad y ellos ceden, que es como se siente
// caminar entre una multitud.
//
// Se resuelve al 100%, sin relajación: aquí no hay riesgo de oscilación porque
// es uno contra uno, no una red de restricciones, y el jugador NO puede quedar
// penetrado ni un frame o se vería el solape.
function apartarDelJugador(items, rejilla, jugador) {
  const inicio = rejilla.inicio;
  const indices = rejilla.indices;
  const columnas = rejilla.columnas;
  const filas = rejilla.filas;
  const jx = jugador.x;
  const jy = jugador.y;

  const cx = rejilla.columnaDe(jx);
  const cy = rejilla.filaDe(jy);

  for (let fy = cy - 1; fy <= cy + 1; fy++) {
    if (fy < 0 || fy >= filas) continue;
    for (let fx = cx - 1; fx <= cx + 1; fx++) {
      if (fx < 0 || fx >= columnas) continue;
      const c = fy * columnas + fx;
      for (let p = inicio[c]; p < inicio[c + 1]; p++) {
        const e = items[indices[p]];
        const dx = e.x - jx;
        const dy = e.y - jy;
        const r = jugador.radioCuerpo + e.radioCuerpo;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;

        // LAS ANTORCHAS NO SE MUEVEN: se aparta el JUGADOR.
        //
        // Son decoración con vida (`esObjeto`, ver datos/enemigos.js) y ya están
        // marcadas como inamovibles —masa 999 e `inmuneEmpuje`— así que ni la
        // horda ni un golpe las desplazan. Faltaba este sitio: el jugador las
        // empujaba por delante como si arrastrara una farola, que es lo que vio
        // Sergio. Ahora se resuelve al revés, igual que contra una columna.
        //
        // El invariante de arriba se mantiene: sigue sin haber penetración, solo
        // cambia cuál de los dos cuerpos cede.
        const inamovible = e.def.esObjeto;
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const f = (r - d) / d;         // escala el propio delta, sin normalizar
          if (inamovible) {
            jugador.x -= dx * f;
            jugador.y -= dy * f;
          } else {
            e.x += dx * f;
            e.y += dy * f;
          }
        } else if (inamovible) {
          jugador.x -= r;
        } else {
          e.x += r;                      // justo encima: sale por la derecha
        }
      }
    }
  }
}

// Un obstáculo del escenario (columna, antorcha, estatua, ruina) es, para la
// física, exactamente lo que es el jugador en `apartarDelJugador`: un cuerpo
// fijo que aparta y al que nadie aparta. Se factoriza en una función propia
// porque aquí el "fijo" cambia entre obstáculo y obstáculo, mientras que
// `apartarDelJugador` siempre gira alrededor de un jugador concreto.
// Radio de cuerpo del enemigo más grande del bestiario, para dimensionar el
// barrido de rejilla contra obstáculos. No hace falta que sea exacto: pasarse
// solo cuesta mirar alguna celda de más, y quedarse corto es perder empujones.
const MAYOR_CUERPO = 20;

// CAJA Y NO CÍRCULO NI ELIPSE. La huella de un obstáculo sale de su dibujo (ver
// sistemas/obstaculos.js) y ha pasado por las tres formas, así que conviene
// dejar escrito por qué se descartaron las dos primeras:
//
//   CÍRCULO. Un solo radio no puede describir a la vez una columna —26x80,
//     estrecha y alta, de la que solo estorba el pie— y unas ruinas —124x110,
//     un montón de escombro sólido de punta a punta—. Había que elegir, ganaba
//     el número pequeño, y las ruinas quedaban con un círculo en la base por el
//     que se colaba todo el mundo.
//
//   ELIPSE. Arregla lo anterior, pero una elipse INSCRITA en la caja del dibujo
//     solo cubre el 78% de su área: se dejaba las cuatro esquinas libres y un
//     10% del ancho. En un montón de escombro que llena casi su recuadro, eso
//     son cuatro bocas por las que meterse — que es justo lo que se veía.
//
//   CAJA. Cubre el recuadro entero, esquinas incluidas, y es lo que de verdad
//     significa "sólido".
//
// Es choque de CÍRCULO contra CAJA, resuelto por el punto de la caja más
// cercano al centro de la entidad: así el empuje sale por la normal correcta
// también en las esquinas, en vez de dar el salto que daría comparar ejes.
function empujarFueraDe(e, ox, oy, hx, hy) {
  const r = e.radioCuerpo;
  const dx = e.x - ox;
  const dy = e.y - oy;

  // Punto de la caja más próximo, en coordenadas relativas al centro.
  const px = dx < -hx ? -hx : (dx > hx ? hx : dx);
  const py = dy < -hy ? -hy : (dy > hy ? hy : dy);
  const sx = dx - px, sy = dy - py;
  const d2 = sx * sx + sy * sy;

  if (d2 > 0.000001) {
    if (d2 >= r * r) return;             // fuera de la caja y sin tocarla
    const d = Math.sqrt(d2);
    const f = (r - d) / d;
    e.x += sx * f;
    e.y += sy * f;
    return;
  }

  // CENTRO DENTRO DE LA CAJA. Aquí no hay normal que seguir, así que se sale
  // por el lado más cercano. Importa que sea el más cercano y no uno fijo: al
  // rozar un canto, empujar hacia el lado equivocado cruzaría la entidad por
  // dentro del obstáculo y saldría disparada por el otro extremo.
  const izq = dx + hx + r;
  const der = hx - dx + r;
  const arr = dy + hy + r;
  const aba = hy - dy + r;
  let m = izq;
  if (der < m) m = der;
  if (arr < m) m = arr;
  if (aba < m) m = aba;
  if (m === izq)      e.x -= izq;
  else if (m === der) e.x += der;
  else if (m === arr) e.y -= arr;
  else                e.y += aba;
}

// Objetos sólidos del escenario contra jugadores y enemigos. Los obstáculos
// son pocos y estáticos (sistemas/obstaculos.js), así que no llevan rejilla
// propia: contra los jugadores (como mucho 4) se compara directo, y contra
// los enemigos se reutiliza la rejilla que YA construyó `main.js` para este
// paso, con la misma consulta 3x3 de `apartarDelJugador`.
export function colisionarObstaculos(obstaculos, jugadores, enemigos) {
  const items = obstaculos.items;
  const n = obstaculos.activos;
  if (n === 0) return;

  const rejilla = enemigos.rejilla;
  const enemItems = enemigos.pool.items;
  const inicio = rejilla.inicio;
  const indices = rejilla.indices;
  const columnas = rejilla.columnas;
  const filas = rejilla.filas;

  for (let k = 0; k < n; k++) {
    const o = items[k];

    // `o.cy` es el centro de la HUELLA, que no es la posición del obstáculo:
    // su `y` es la línea donde se apoya el dibujo, y la huella sube desde ahí.
    for (let i = 0; i < jugadores.length; i++) {
      empujarFueraDe(jugadores[i], o.cx, o.cy, o.hx, o.hy);
    }

    // EL BARRIDO SALE DEL TAMAÑO DE LA HUELLA, no de una vecindad 3x3 fija.
    //
    // La celda mide 64 y el 3x3 garantiza alcanzar 64 unidades desde el centro,
    // que sobraba cuando el mayor obstáculo era una columna. Unas ruinas tienen
    // 56 de semieje y el enemigo más gordo 14 de cuerpo: 70, más de lo que el
    // 3x3 asegura. El fallo habría sido de los que no se ven —un bicho suelto
    // colándose por una esquina de vez en cuando— así que se calcula el rango
    // en vez de confiar en que quepa.
    const alcanceX = o.hx + MAYOR_CUERPO;
    const alcanceY = o.hy + MAYOR_CUERPO;
    const fx0 = rejilla.columnaDe(o.cx - alcanceX);
    const fx1 = rejilla.columnaDe(o.cx + alcanceX);
    const fy0 = rejilla.filaDe(o.cy - alcanceY);
    const fy1 = rejilla.filaDe(o.cy + alcanceY);
    for (let fy = fy0; fy <= fy1; fy++) {
      if (fy < 0 || fy >= filas) continue;
      for (let fx = fx0; fx <= fx1; fx++) {
        if (fx < 0 || fx >= columnas) continue;
        const c = fy * columnas + fx;
        for (let p = inicio[c]; p < inicio[c + 1]; p++) {
          empujarFueraDe(enemItems[indices[p]], o.cx, o.cy, o.hx, o.hy);
        }
      }
    }
  }
}

// Ataúdes: el sitio donde ha caído un jugador es SÓLIDO, ni se pisa ni se
// atraviesa. Misma resolución que un obstáculo del escenario, pero aparte
// porque estos aparecen y desaparecen durante la partida y son cuatro como
// mucho, así que ni pool ni rejilla propia: se recorre la lista de jugadores.
//
// El propio caído no se empuja a sí mismo —se quedaría vibrando dentro de su
// ataúd— y tampoco se empuja a otro caído: dos ataúdes juntos no tienen por qué
// separarse, y hacerlo los movería del sitio donde murieron, que es justo la
// información que da un ataúd.
//
// RADIO_ATAUD sale del sprite. Al subir los ataúdes a 34 de alto para que no
// se emborronaran (ver el catálogo de procesar-assets.ps1) pasaron a medir 96
// físicos de ancho, o sea 24 lógicos: la mitad son 12.
//
// Se queda en 10, algo por debajo, porque la caja del sprite incluye cosas que
// sobresalen y no son madera —la bufanda de Eric por la derecha, el balón por
// abajo— y empujar desde ahí se notaría como un obstáculo invisible. 10 cubre
// el cuerpo del ataúd, que es lo que se ve sólido.
const RADIO_ATAUD = 10;

export function colisionarAtaudes(jugadores, enemigos) {
  const rejilla = enemigos.rejilla;
  const enemItems = enemigos.pool.items;
  const inicio = rejilla.inicio;
  const indices = rejilla.indices;
  const columnas = rejilla.columnas;
  const filas = rejilla.filas;

  for (let k = 0; k < jugadores.length; k++) {
    const caido = jugadores[k];
    if (!caido.abatido) continue;

    for (let i = 0; i < jugadores.length; i++) {
      if (i === k || jugadores[i].abatido) continue;
      empujarFueraDe(jugadores[i], caido.x, caido.y, RADIO_ATAUD, RADIO_ATAUD);
    }

    const cx = rejilla.columnaDe(caido.x);
    const cy = rejilla.filaDe(caido.y);
    for (let fy = cy - 1; fy <= cy + 1; fy++) {
      if (fy < 0 || fy >= filas) continue;
      for (let fx = cx - 1; fx <= cx + 1; fx++) {
        if (fx < 0 || fx >= columnas) continue;
        const c = fy * columnas + fx;
        for (let p = inicio[c]; p < inicio[c + 1]; p++) {
          empujarFueraDe(enemItems[indices[p]], caido.x, caido.y, RADIO_ATAUD, RADIO_ATAUD);
        }
      }
    }
  }
}

export function separacion(enemigos, jugadores) {
  const pool = enemigos.pool;
  const items = pool.items;
  const n = pool.activos;

  // Varias pasadas del solucionador. Con una sola quedaban 1.507 pares
  // solapados: la persecución mete a los enemigos unos dentro de otros cada
  // paso y una única corrección parcial no llega a deshacerlo. Cada pasada
  // adicional recorre los pares otra vez sobre las posiciones ya corregidas.
  //
  // La rejilla se construyó antes y NO se reconstruye entre pasadas: cada una
  // mueve 4px como mucho, y entre el alcance real de un par (44,8 con dos
  // cíclopes) y los 64 que cubre la consulta 3x3 hay 19px de holgura de sobra.
  const rejilla = enemigos.rejilla;
  for (let iter = 0; iter < ajustes.iteraciones; iter++) {
    for (let k = 0; k < n; k++) {
      const e = items[k];
      e.sepX = 0;
      e.sepY = 0;
      e.contactos = 0;
    }
    recorrerPares(items, rejilla, empujar);
    aplicarCorrecciones(items, n);
  }

  // El ORDEN de lo que viene importa, y se descubrió midiendo: con la pasada
  // dura antes del tope y del empuje del jugador, esos dos volvían a meter unos
  // dentro de otros lo que la dura acababa de separar, y los pares
  // interpenetrados apenas bajaban de 114 a 102. Van de menor a mayor prioridad,
  // y el último en tocar una posición es el que manda:
  //
  //   1. tope de acercamiento  — restricción de velocidad, la más blanda
  //   2. pasada dura           — dos cuerpos no ocupan el mismo sitio
  //   3. empuje del jugador    — invariante absoluto, nunca se le penetra
  //
  // El empuje del jugador puede volver a meter a alguien dentro de otro enemigo,
  // pero solo a los pocos que le tocan, y el frame siguiente lo deshace.
  topeAcercamiento(items, n);
  for (let iter = 0; iter < ajustes.pasadasDuras; iter++) {
    recorrerPares(items, rejilla, separarDuro);
  }
  // Cada jugador aparta lo suyo. El último en tocar manda, y como los cuerpos
  // de dos jugadores nunca se solapan entre sí, no compiten por lo mismo.
  for (let i = 0; i < jugadores.length; i++) {
    if (!jugadores[i].abatido) apartarDelJugador(items, rejilla, jugadores[i]);
  }
}

// Daño por contacto. Solo se miran las 9 celdas alrededor del jugador: da igual
// que haya 800 enemigos vivos si solo un puñado puede estar tocándolo.
//
// Se aplica POR TICS, no por frame: quien impone la cadencia es la
// invulnerabilidad de 0,5s del jugador. Sin eso, estar dentro de un enjambre
// serían 60 impactos por segundo y la vida se evaporaría en un suspiro.
//
// De todos los que tocan se coge el de MÁS daño, no el primero que aparezca: el
// orden dentro de la celda depende del pool y cambiaría el resultado de un frame
// a otro sin que el jugador hiciera nada distinto.
//
// DESVIACIÓN DEL PLAN, consciente: el alcance es `radioCuerpo`, no el `radio` de
// la sección 10. Con los cuerpos sólidos, a una gárgola (cuerpo 17, radio de
// daño 7) la restricción física ya la mantiene a 27px del jugador, así que con
// el radio pequeño NUNCA podría hacer daño: sería inofensiva por geometría. El
// motivo original del radio pequeño era que rozar un ala no contase como
// impacto, y eso ahora lo garantiza el propio cuerpo sólido: si el ala te toca,
// es que el bicho está pegado a ti de verdad. `radio` sigue existiendo y será el
// que usen las armas en la Fase 3, donde el criterio original sí aplica.
// Daño por contacto de TODOS los jugadores. Cada uno con su cadencia propia:
// los i-frames son individuales, así que dos jugadores pegados al mismo bicho
// no comparten el reloj del golpe.
export function contactoJugadores(enemigos, jugadores) {
  for (let i = 0; i < jugadores.length; i++) contactoJugador(enemigos, jugadores[i]);
}

export function contactoJugador(enemigos, jugador) {
  if (jugador.abatido || jugador.invulnerable > 0) return 0;

  const rejilla = enemigos.rejilla;
  const items = enemigos.pool.items;
  const inicio = rejilla.inicio;
  const indices = rejilla.indices;
  const columnas = rejilla.columnas;
  const filas = rejilla.filas;

  const cx = rejilla.columnaDe(jugador.x);
  const cy = rejilla.filaDe(jugador.y);
  const jx = jugador.x;
  const jy = jugador.y;

  let peor = 0;
  // Dónde estaba el que más pega. El golpe se cuenta como si viniera de ÉL, que
  // es de quien viene el número: con seis bichos encima, promediar las
  // direcciones daría un vector corto apuntando a ninguna parte.
  let peorX = 0, peorY = 0;
  for (let fy = cy - 1; fy <= cy + 1; fy++) {
    if (fy < 0 || fy >= filas) continue;
    for (let fx = cx - 1; fx <= cx + 1; fx++) {
      if (fx < 0 || fx >= columnas) continue;
      const c = fy * columnas + fx;
      for (let p = inicio[c]; p < inicio[c + 1]; p++) {
        const e = items[indices[p]];
        const dx = e.x - jx;
        const dy = e.y - jy;
        const r = (e.radioCuerpo + jugador.radioCuerpo) * MARGEN_DANYO;
        // e.danyo, no e.def.danyo: el escalado por minuto se congela en la
        // entidad al aparecer (ver entidades/enemigo.js), y leer del catálogo
        // devolvería siempre el valor de minuto 0.
        if (dx * dx + dy * dy < r * r && e.danyo > peor) {
          peor = e.danyo;
          peorX = e.x;
          peorY = e.y;
        }
      }
    }
  }

  // La dirección va del que muerde hacia el jugador, sin normalizar: eso lo hace
  // recibirDanyo. Todo lo demás —sangre, marca, sacudida, borde rojo y parón—
  // vive ya ahí dentro, que es el único sitio por donde pasa TODO el daño que
  // recibe un jugador (ver entidades/jugador.js).
  if (peor > 0) jugador.recibirDanyo(peor, jx - peorX, jy - peorY);
  return peor;
}

// Los jugadores tampoco se atraviesan entre sí.
//
// Aquí el reparto es MITAD Y MITAD, sin masas: dos jugadores son iguales y
// ninguno tiene derecho a empujar al otro. Es la diferencia con el empuje contra
// enemigos, donde el jugador manda y nadie le aparta a él.
//
// Recorrido de todos los pares: con cuatro jugadores son seis comparaciones, así
// que la rejilla espacial aquí sobra por completo.
export function separarJugadores(jugadores) {
  const n = jugadores.length;
  if (n < 2) return;
  for (let i = 0; i < n; i++) {
    const a = jugadores[i];
    if (a.abatido) continue;
    for (let k = i + 1; k < n; k++) {
      const b = jugadores[k];
      if (b.abatido) continue;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const r = a.radioCuerpo + b.radioCuerpo;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;

      let nx, ny, pen;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        nx = dx / d; ny = dy / d; pen = r - d;
      } else {
        // Exactamente encima (dos que entran a la vez): se separan siempre en
        // la misma dirección para que no vibren.
        nx = 1; ny = 0; pen = r;
      }
      const mitad = pen * 0.5;
      a.x -= nx * mitad;
      a.y -= ny * mitad;
      b.x += nx * mitad;
      b.y += ny * mitad;
    }
  }
}

// --- Consultas para las armas -----------------------------------------------

// Enemigo vivo más cercano dentro de `alcance`, o null.
//
// Recorrido lineal sobre los activos, a propósito. Es O(n) POR DISPARO, no por
// frame: con las recargas del plan son un puñado de búsquedas por segundo, y
// 800 comprobaciones de distancia al cuadrado no se notan. Si algún arma
// llegara a disparar todos los frames, esto tendría que pasar a recorrer
// anillos de celdas de la rejilla.
export function enemigoMasCercano(enemigos, x, y, alcance) {
  const items = enemigos.pool.items;
  const n = enemigos.pool.activos;
  let mejor = null;
  let mejorD2 = alcance * alcance;
  for (let k = 0; k < n; k++) {
    const e = items[k];
    if (e.vida <= 0) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < mejorD2) { mejorD2 = d2; mejor = e; }
  }
  return mejor;
}

// Rellena `salida` (Int32Array preasignado) con los índices de pool de los
// enemigos vivos dentro del radio. Devuelve cuántos. Usa la rejilla porque esto
// sí puede llamarse a menudo y con la pantalla llena.
export function enemigosEnRadio(enemigos, x, y, radio, salida) {
  const rejilla = enemigos.rejilla;
  const items = enemigos.pool.items;
  const inicio = rejilla.inicio;
  const indices = rejilla.indices;
  const columnas = rejilla.columnas;
  const filas = rejilla.filas;

  const c0 = rejilla.columnaDe(x - radio);
  const c1 = rejilla.columnaDe(x + radio);
  const f0 = rejilla.filaDe(y - radio);
  const f1 = rejilla.filaDe(y + radio);
  const tope = salida.length;

  let n = 0;
  for (let fy = f0; fy <= f1 && fy < filas; fy++) {
    if (fy < 0) continue;
    for (let fx = c0; fx <= c1 && fx < columnas; fx++) {
      if (fx < 0) continue;
      const c = fy * columnas + fx;
      for (let p = inicio[c]; p < inicio[c + 1]; p++) {
        const idx = indices[p];
        const e = items[idx];
        if (e.vida <= 0) continue;
        const dx = e.x - x;
        const dy = e.y - y;
        // Radio del enemigo incluido: un cíclope se toca antes que una serpiente.
        const r = radio + e.radioCuerpo;
        if (dx * dx + dy * dy > r * r) continue;
        if (n >= tope) return n;
        salida[n++] = idx;
      }
    }
  }
  return n;
}

// Proyectiles contra enemigos. La perforación se resuelve con el sello: cada
// proyectil lleva una marca única y el enemigo guarda la del último que le dio,
// así que atravesar a alguien nunca cuenta dos veces aunque sigan solapados
// varios frames seguidos.
export function impactosProyectiles(proyectiles, enemigos, alEstallar) {
  const rejilla = enemigos.rejilla;
  const items = enemigos.pool.items;
  const inicio = rejilla.inicio;
  const indices = rejilla.indices;
  const columnas = rejilla.columnas;
  const filas = rejilla.filas;
  const pItems = proyectiles.pool.items;

  let k = 0;
  while (k < proyectiles.pool.activos) {
    const p = pItems[k];
    let agotado = false;

    const c0 = rejilla.columnaDe(p.x - p.radio);
    const c1 = rejilla.columnaDe(p.x + p.radio);
    const f0 = rejilla.filaDe(p.y - p.radio);
    const f1 = rejilla.filaDe(p.y + p.radio);

    for (let fy = f0; fy <= f1 && !agotado; fy++) {
      if (fy < 0 || fy >= filas) continue;
      for (let fx = c0; fx <= c1 && !agotado; fx++) {
        if (fx < 0 || fx >= columnas) continue;
        const c = fy * columnas + fx;
        for (let q = inicio[c]; q < inicio[c + 1]; q++) {
          const e = items[indices[q]];
          if (e.vida <= 0 || e.ultimoSello === p.sello) continue;
          const dx = e.x - p.x;
          const dy = e.y - p.y;
          const r = p.radio + e.radioCuerpo;
          if (dx * dx + dy * dy > r * r) continue;

          e.ultimoSello = p.sello;
          const v = Math.hypot(p.vx, p.vy) || 1;
          enemigos.danyar(e, p.danyo, p.vx / v, p.vy / v, p.empuje);

          if (p.perforacion > 0) p.perforacion--;
          else { agotado = true; break; }
        }
      }
    }

    if (agotado) {
      // Al gastarse deja su onda expansiva, si la lleva. El daño de la
      // explosión NO es el del impacto: un lanzagranadas reparte poco en el
      // punto y mucho alrededor.
      if (p.radioExplosion > 0 && alEstallar) alEstallar(p);
      proyectiles.liberarEn(k);              // sin avanzar k: ver Pool
    } else k++;
  }
}
