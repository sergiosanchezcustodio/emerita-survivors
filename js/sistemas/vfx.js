import { ESCALA_ARTE } from '../core/constantes.js';
import { Pool } from '../core/pool.js';
import { Recursos } from '../core/recursos.js';
import { FUENTE } from '../ui/capa.js';

// Efectos de realimentación: números de daño flotantes, sacudida de cámara y
// hitstop. Singleton, como Particulas.
//
// Los números se dibujan en PÍXELES FÍSICOS, no en la escala del arte: son
// tipografía, no pixel art, y a 2x saldrían gigantes y borrosos. Se convierte la
// posición del mundo a pantalla y se pinta con la matriz identidad.

// Cadenas de los números precalculadas. `fillText` recibe una DOMString, así que
// pasarle un número lo convierte, y convertir asigna: con la pantalla llena son
// cientos de cadenas por frame. Aquí se construyen una vez al arrancar.
const TOPE_CACHE = 1000;
const CACHE_NUM = new Array(TOPE_CACHE);
for (let i = 0; i < TOPE_CACHE; i++) CACHE_NUM[i] = String(i);

const SUBIDA = 26;          // px lógicos que asciende el número en su vida
const VIDA_NUMERO = 0.65;
const UMBRAL_GORDO = 25;    // a partir de aquí el número se pinta destacado

// Números nuevos como máximo por paso de lógica. A 60 Hz son 360 por segundo,
// de sobra para que se lea que estás pegando, y pone techo al coste de texto
// pase lo que pase con el área de las armas.
const NUMEROS_POR_PASO = 6;

// Mínimo entre dos hitstops, en segundos.
const ESPERA_HITSTOP = 0.6;

// Tope absoluto de la sacudida. Por encima de esto la cámara deja de contar un
// golpe y pasa a estorbar: no se lee la pantalla.
const TOPE_SACUDIDA = 5.5;

// LA SACUDIDA DE MASA SE QUITÓ.
//
// Estuvo racionada —una cada 0,22 s y con un techo bajo— para que la matanza
// fuera un rumor de fondo en vez de un terremoto. No bastaba: con un arma de
// explosión las muertes en cadena no paran, así que el racionamiento solo
// convertía el terremoto en un zumbido continuo, y una cámara que nunca está
// quieta no cuenta nada, solo cansa. Ver `sacudir`.

// Fracción de vida por debajo de la cual el borde de la pantalla late en rojo.
// Un tercio y no un cuarto: con el ritmo de la horda, la diferencia entre 25 y
// 33 son dos mordiscos, y avisar cuando ya no da tiempo a reaccionar no es
// avisar.
const UMBRAL_VIDA_BAJA = 0.33;

function crearNumero() {
  return { x: 0, y: 0, vida: 0, texto: '0', gordo: false, desvio: 0 };
}

// REVENTONES: una hoja de efecto animada que se reproduce UNA vez en un punto
// del mundo y se acaba. Es la versión "esto pasa y ya está" de las zonas de
// daño: no golpea a nadie —de eso ya se encargó quien lo pidió— y solo se ve.
//
// Existe porque los ataques de los ENEMIGOS no viven en el pool de zonas. El
// sismo del cíclope, por ejemplo, es un `Disparo` (entidades/disparo.js), y al
// reventar solo soltaba cuatro chispas: telegrafiaba de maravilla durante casi
// un segundo y luego el golpe no se veía. Aquí es donde se le pone el golpe.
//
// Doce a la vez: son adorno, y si con la pantalla ardiendo se pierde uno no lo
// nota nadie. Mismo criterio que los anillos.
const REVENTONES = 12;

function crearReventon() {
  return {
    x: 0, y: 0,
    radio: 0,             // radio en unidades lógicas al que se dibuja
    vida: 0, vidaMax: 1,
    hoja: null,           // id de atlas de la hoja animada
    giro: 0               // orientación fija, sorteada al nacer
  };
}

// MARCAS DE IMPACTO: un trazo corto y luminoso, atravesado en la dirección del
// golpe, que aparece y se va en dos décimas.
//
// Existe porque las chispas son lo primero que se sacrifica cuando hay matanza
// (ver Particulas.saturado) y justo entonces —con la pantalla llena— es cuando
// más falta hace ver que estás dando. Una marca son dos líneas trazadas y no
// pasa por el racionamiento de las partículas, así que el golpe se ve siempre.
//
// Pool propio y pequeño: no hacen falta muchas a la vez porque duran nada, y
// tener el suyo evita competir por el hueco con los números de daño.
const MARCAS = 64;
const VIDA_MARCA = 0.16;

function crearMarca() {
  return { x: 0, y: 0, dx: 1, dy: 0, largo: 6, vida: 0 };
}

// ANILLOS: una circunferencia que se abre desde un punto y se apaga.
//
// Es la forma de "aquí acaba de pasar algo bueno", y hacía falta una: el juego
// tenía cómo contar los golpes —chispas, marcas, números— y NADA con lo que
// contar un premio. Subir de nivel y curarse solo sonaban.
//
// Se abre en vez de cerrarse, al revés que los avisos de los enemigos
// (entidades/disparo.js), y esa es toda la diferencia entre las dos gramáticas:
// lo que se cierra sobre un punto va a pasar y hay que apartarse; lo que se abre
// ya ha pasado y era para ti. Que sean opuestas es lo que las hace legibles de
// un vistazo sin haberlas visto nunca.
//
// Pool propio y pequeño: son cosas que pasan de una en una —una subida de
// nivel, una curación— y no en avalancha como las chispas.
const ANILLOS = 12;

function crearAnillo() {
  return { x: 0, y: 0, radio: 20, vida: 0, vidaMax: 1, color: '#ffffff', grosor: 1.5 };
}

export const VFX = {
  pool: null,

  // --- Sacudida de cámara ------------------------------------------------
  sacudida: 0,              // amplitud actual, en px lógicos
  _fase: 0,
  desvioX: 0,
  desvioY: 0,

  // --- Hitstop -----------------------------------------------------------
  // Congela la LÓGICA unos milisegundos en los golpes fuertes. El render sigue,
  // así que se ve como un frenazo seco y no como un tirón de fps.
  congelado: 0,
  _esperaHitstop: 0,

  // --- Marcas de impacto ---------------------------------------------------
  marcas: null,

  // --- Anillos de recompensa -----------------------------------------------
  anillos: null,

  // --- Reventones dibujados -------------------------------------------------
  reventones: null,

  iniciar(capacidad) {
    this.pool = new Pool(crearNumero, capacidad);
    this.marcas = new Pool(crearMarca, MARCAS);
    this.anillos = new Pool(crearAnillo, ANILLOS);
    this.reventones = new Pool(crearReventon, REVENTONES);
    this.sacudida = 0;
    this.congelado = 0;
    this._esperaHitstop = 0;
    this._presupuesto = 0;
    this.herida = 0;
    this._faseVida = 0;
  },

  get numerosActivos() { return this.pool ? this.pool.activos : 0; },

  // PRESUPUESTO POR PASO. Un arco de melé a nivel 8 alcanza a un centenar de
  // enemigos de una vez, y con cuatro jugadores dando dos tajos cada uno eso
  // serían ochocientos números de daño por segundo. Ni se leen ni se pueden
  // rasterizar: el texto es de lo más caro que hay en un canvas.
  //
  // Se muestran los primeros de cada paso y el resto se pierde. Lo que importa
  // es la sensación de que el golpe hace daño, no auditar cada impacto.
  numero(x, y, cantidad, rng) {
    if (this._presupuesto >= NUMEROS_POR_PASO) return;
    const p = this.pool.obtener();
    if (!p) return;
    this._presupuesto++;
    const v = cantidad | 0;
    p.texto = v < TOPE_CACHE ? CACHE_NUM[v] : CACHE_NUM[TOPE_CACHE - 1];
    p.x = x;
    p.y = y;
    p.vida = VIDA_NUMERO;
    p.gordo = v >= UMBRAL_GORDO;
    // Desvío horizontal para que dos golpes simultáneos no se pisen.
    p.desvio = (rng() - 0.5) * 12;
  },

  // `masa` la pone lo que puede pasar decenas de veces por segundo: hoy, las
  // muertes del bestiario (ver entidades/enemigo.js). Lo que pasa una vez —un
  // jefe, una caída, una evolución— no la pone y conserva toda su fuerza.
  sacudir(amplitud, masa = false) {
    // LA SACUDIDA DE MASA SE HA QUITADO DEL TODO. El racionamiento de abajo
    // —una cada 0,22 s y con techo bajo— hacía la pantalla legible, pero
    // no arreglaba el fondo del problema: con un arma de explosión hay muertes
    // en cadena TODO EL RATO, así que la cámara nunca llegaba a estar quieta y
    // lo que quedaba era un zumbido constante. Lo pidió Sergio y es lo correcto:
    // una sacudida que no para de sonar deja de contar nada y solo cansa.
    //
    // La llamada y el parámetro se quedan: el hitstop de esas mismas muertes SÍ
    // sigue (ese es un parón, no un temblor, y se lee como el golpe que es), y
    // las sacudidas de suceso único —jefe, jugador abatido, llamarada— entran
    // por aquí sin `masa` y conservan toda su fuerza.
    if (masa) return;
    if (amplitud > TOPE_SACUDIDA) amplitud = TOPE_SACUDIDA;
    if (amplitud > this.sacudida) this.sacudida = amplitud;
  },

  // ESCARCHA: velo frío sobre toda la pantalla mientras el Reloj de Emerita
  // tiene parada a la horda (entidades/cofre.js).
  //
  // Hace falta un aviso: los enemigos se quedan clavados, y sin nada que lo
  // explique lo primero que piensa cualquiera es que el juego se ha colgado. Un
  // velo azulado que se va apagando dice "esto lo has hecho tú" y además cuenta
  // cuánto queda, porque se desvanece con el efecto.
  escarcha: 0,
  escarchaTotal: 0,

  helar(segundos) {
    this.escarcha = segundos;
    this.escarchaTotal = segundos;
  },

  // HERIDA: el borde de la pantalla se enrojece. Dos cosas a la vez, y por eso
  // van juntas y no en dos efectos:
  //
  //   - el FOGONAZO de recibir un golpe, que se apaga en medio segundo;
  //   - el LATIDO sostenido de estar a punto de caer, que no se apaga.
  //
  // Existe porque el aviso de vida baja estaba en la barra de la esquina, y la
  // esquina es justo donde no se mira cuando hay ochocientos bichos encima: uno
  // pasa de 30 a 0 sin haber apartado la vista del centro. El borde de la
  // pantalla se ve sin mirarlo, que es la única propiedad que hacía falta.
  herida: 0,
  _faseVida: 0,
  _grad: null,
  _gradW: 0,
  _gradH: 0,

  // `intensidad` es 0..1: cuánto se ha llevado el golpe de tu vida máxima.
  // Se queda el mayor, no se suma, por lo mismo que la sacudida: tres mordiscos
  // en el mismo frame son un golpe gordo, no tres pantallas rojas encadenadas.
  herir(intensidad) {
    if (intensidad > this.herida) this.herida = intensidad;
  },

  // Segundo cinturón de seguridad, independiente de quién lo pida: por muy a
  // menudo que llegue la petición, no se congela más de una vez cada
  // ESPERA_HITSTOP. Un hitstop es un signo de puntuación; encadenados dejan de
  // subrayar nada y se convierten en tartamudeo.
  //
  // `forzar` se salta la espera, y lo usa SOLO lo que pasa una vez y no puede
  // perderse: un jugador cayendo. El caso concreto es el que se cuela por el
  // hueco de los i-frames —te muerden, y medio segundo después te rematan— en
  // el que la espera seguía viva y la caída se quedaba sin parón justo cuando
  // más falta hacía. Racionar tiene sentido para lo que se repite; caer no se
  // repite.
  congelar(segundos, forzar = false) {
    if (this._esperaHitstop > 0 && !forzar) return;
    this._esperaHitstop = ESPERA_HITSTOP;
    if (segundos > this.congelado) this.congelado = segundos;
  },

  actualizar(dt) {
    this._presupuesto = 0;             // se renueva cada paso
    if (this.escarcha > 0) this.escarcha = Math.max(0, this.escarcha - dt);
    // El fogonazo cae rápido; el latido de vida baja avanza siempre, para que
    // no arranque desde cero —y por tanto invisible— justo el frame en que la
    // vida cruza el umbral. Contador propio y no el reloj: reproducibilidad.
    if (this.herida > 0) this.herida = Math.max(0, this.herida - dt * 2.4);
    this._faseVida += dt * 4.2;
    // Corre también durante la congelación: es quien la deja expirar. Por eso
    // el bucle llama a VFX.actualizar aunque salte el resto de la lógica.
    if (this._esperaHitstop > 0) this._esperaHitstop -= dt;
    const items = this.pool.items;
    let k = 0;
    while (k < this.pool.activos) {
      const p = items[k];
      p.vida -= dt;
      if (p.vida <= 0) this.pool.liberarEn(k);   // sin avanzar k
      else k++;
    }

    const marcas = this.marcas.items;
    let j = 0;
    while (j < this.marcas.activos) {
      marcas[j].vida -= dt;
      if (marcas[j].vida <= 0) this.marcas.liberarEn(j);
      else j++;
    }

    const reventones = this.reventones.items;
    let v = 0;
    while (v < this.reventones.activos) {
      reventones[v].vida -= dt;
      if (reventones[v].vida <= 0) this.reventones.liberarEn(v);
      else v++;
    }

    const anillos = this.anillos.items;
    let a = 0;
    while (a < this.anillos.activos) {
      anillos[a].vida -= dt;
      if (anillos[a].vida <= 0) this.anillos.liberarEn(a);
      else a++;
    }

    // La sacudida decae exponencialmente y oscila rápido. Determinista: sale de
    // un contador propio, no del reloj ni del azar, para no romper el criterio
    // de reproducibilidad.
    if (this.sacudida > 0.01) {
      this._fase += dt * 47;
      this.desvioX = Math.sin(this._fase) * this.sacudida;
      this.desvioY = Math.cos(this._fase * 1.7) * this.sacudida * 0.7;
      this.sacudida *= Math.exp(-9 * dt);
    } else {
      this.sacudida = 0;
      this.desvioX = 0;
      this.desvioY = 0;
    }
  },

  // Una marca de golpe. `fuerza` es el daño: los golpes gordos dejan un trazo
  // más largo, que es lo que distingue un arañazo de un mandoble sin tener que
  // leer el número.
  impacto(x, y, dirX, dirY, fuerza) {
    if (!this.marcas) return;
    const m = this.marcas.obtener();
    if (!m) return;
    const v = Math.hypot(dirX, dirY) || 1;
    m.x = x; m.y = y;
    m.dx = dirX / v; m.dy = dirY / v;
    m.largo = 5 + Math.min(9, fuerza * 0.22);
    m.vida = VIDA_MARCA;
  },

  // Un anillo. `radio` es el que alcanza al final: arranca en un quinto de ese
  // tamaño, que ya es un círculo y no un punto — abrirse desde cero hace que el
  // primer fotograma no se vea y el efecto parezca empezar tarde.
  anillo(x, y, radio, color, grosor = 1.5, vida = 0.42) {
    if (!this.anillos) return;
    const a = this.anillos.obtener();
    if (!a) return;
    a.x = x; a.y = y;
    a.radio = radio;
    a.color = color;
    a.grosor = grosor;
    a.vida = a.vidaMax = vida;
  },

  // UN REVENTÓN. `hoja` es el id de atlas de una tira generada por
  // herramientas/generar-efectos.ps1; `radio` es en unidades lógicas y marca
  // dónde tiene que caer el filo del dibujo, o sea el borde de lo que ha hecho
  // daño. Si la hoja no está cargada no se dibuja nada y no pasa nada: misma
  // red que los placeholders del atlas.
  reventon(x, y, radio, hoja, vida = 0.34, rng = null) {
    if (!this.reventones || !hoja) return;
    const r = this.reventones.obtener();
    if (!r) return;
    r.x = x; r.y = y;
    r.radio = radio;
    r.hoja = hoja;
    r.vida = r.vidaMax = vida;
    // Orientación al azar. La hoja es una sola, así que sin esto dos sismos
    // seguidos en el mismo sitio salen calcados y se lee como un sello
    // repetido en vez de como dos reventones. Mismo truco que el tajo.
    r.giro = rng ? rng() * Math.PI * 2 : 0;
  },

  // Los reventones, en el lienzo del MUNDO y en ADITIVO. Aditivo por lo mismo
  // que las explosiones: son luz, y dos solapados tienen que verse más
  // calientes. Las hojas están horneadas sin tonos oscuros justo para esto.
  dibujarReventones(ctx) {
    if (!this.reventones) return;
    const items = this.reventones.items;
    const n = this.reventones.activos;
    if (n === 0) return;

    ctx.save();
    for (let k = 0; k < n; k++) {
      const v = items[k];
      const img = Recursos.imagen(v.hoja);
      const meta = Recursos.meta(v.hoja);
      if (!img || !meta) continue;

      // La composición la trae la hoja: el fuego y el veneno suman luz, la
      // tierra tapa. Ver el mismo criterio en zonaDanyo.dibujarAire.
      ctx.globalCompositeOperation = meta.aditivo === false ? 'source-over' : 'lighter';

      const t = 1 - v.vida / v.vidaMax;       // 0 al nacer, 1 al apagarse
      const fases = meta.frames || 1;

      // La hoja se recorre de principio a fin en la vida del reventón. Aquí no
      // hay radio de daño que seguir —el golpe ya se resolvió cuando nació—
      // así que el fotograma va por reloj, y esto es lo que lo diferencia de
      // una zona de modo 'onda': allí el dibujo tiene que ir clavado al radio
      // que mata, aquí no hay nada a lo que ir clavado.
      let f = (t * fases) | 0;
      if (f >= fases) f = fases - 1;
      if (f < 0) f = 0;

      ctx.globalAlpha = t > 0.82 ? (1 - t) / 0.18 : 1;

      // Medio lado = radio * margen, igual que las ondas: la bola nominal de la
      // hoja llega al radio pedido y lo que sobresale son cascotes y chispas.
      const r = v.radio * (meta.margen || 1);
      ctx.save();
      ctx.translate(v.x, v.y);
      if (v.giro !== 0) ctx.rotate(v.giro);
      ctx.drawImage(img, f * meta.w, 0, meta.w, meta.h, -r, -r, r * 2, r * 2);
      ctx.restore();
    }
    ctx.restore();
  },

  // Con las marcas de impacto, en el lienzo del MUNDO: es algo que le pasa a un
  // sitio concreto y tiene que moverse con la cámara.
  //
  // Se abre DESACELERANDO, no a velocidad constante. Un anillo que se abre igual
  // de rápido al principio que al final se lee como un círculo escalado; frenando
  // al final se lee como una onda que se disipa, que es lo que es.
  dibujarAnillos(ctx) {
    if (!this.anillos) return;
    const items = this.anillos.items;
    const n = this.anillos.activos;
    if (n === 0) return;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < n; k++) {
      const a = items[k];
      const t = 1 - a.vida / a.vidaMax;        // 0 recién salido, 1 al apagarse
      const abertura = 1 - (1 - t) * (1 - t);  // rápido al principio, frena al final
      ctx.globalAlpha = (1 - t) * 0.85;
      ctx.strokeStyle = a.color;
      ctx.lineWidth = a.grosor * (1 - t * 0.6);
      ctx.beginPath();
      ctx.arc(a.x, a.y, a.radio * (0.2 + 0.8 * abertura), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  },

  // Se dibujan en el lienzo del MUNDO, con las partículas: son parte del golpe,
  // no de la interfaz, y tienen que moverse con la cámara.
  dibujarImpactos(ctx) {
    if (!this.marcas) return;
    const items = this.marcas.items;
    const n = this.marcas.activos;
    if (n === 0) return;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let k = 0; k < n; k++) {
      const m = items[k];
      const t = m.vida / VIDA_MARCA;
      // El trazo va ATRAVESADO al golpe, no en su misma dirección: una raya que
      // sigue al proyectil se confunde con el proyectil, y una perpendicular se
      // lee como el corte que ha abierto.
      const px = -m.dy, py = m.dx;
      const l = m.largo * (0.5 + 0.5 * t);
      ctx.globalAlpha = t * 0.9;
      ctx.strokeStyle = '#ffe9a8';
      ctx.lineWidth = 1 + t * 1.6;
      ctx.beginPath();
      ctx.moveTo(m.x - px * l, m.y - py * l);
      ctx.lineTo(m.x + px * l, m.y + py * l);
      ctx.stroke();
      // Y un chispazo en el punto exacto del choque.
      ctx.globalAlpha = t * 0.55;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 1.5 + t * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff6d8';
      ctx.fill();
    }
    ctx.restore();
  },

  vaciar() {
    if (this.anillos) this.anillos.vaciar();
    if (this.reventones) this.reventones.vaciar();
    if (this.marcas) this.marcas.vaciar();
    if (this.pool) this.pool.vaciar();
    this.escarcha = 0;
    this.escarchaTotal = 0;
    this.sacudida = 0;
    this.desvioX = 0;
    this.desvioY = 0;
    this.congelado = 0;
    this.herida = 0;
  },

  // Se dibujan en la CAPA DE INTERFAZ (ui/capa.js), no en el lienzo del juego.
  //
  // Son tipografía, y el lienzo del juego se amplía por enteros con el vecino
  // más próximo: cualquier letra trazada ahí sale escalonada por definición. Con
  // la pantalla llena, los números de daño son el texto MÁS presente que hay, o
  // sea que era justo el peor sitio donde dejarlos.
  //
  // Las coordenadas no cambian ni un ápice: la capa trabaja en las mismas
  // unidades físicas que ya usaban estos números, así que el anclaje al mundo
  // sigue saliendo de offX/offY igual que antes.
  //
  // offX/offY: desplazamiento de cámara YA redondeado a píxel físico, el mismo
  // que usa el mundo. Así el número se ancla al enemigo sin bailar respecto a él.
  // El velo, en la CAPA DE INTERFAZ y no en el lienzo del juego: la interfaz va
  // a la resolución real del monitor y una banda de color a media opacidad sale
  // limpia; en el lienzo del mundo saldría ampliada por el zoom entero.
  //
  // Un solo rectángulo. Se pensó en un degradado radial —viñeta de hielo por los
  // bordes— y no compensa: `createLinearGradient` asigna memoria y esto se pinta
  // durante seis segundos seguidos a sesenta por segundo.
  dibujarEscarcha(ctx, ancho, alto) {
    if (this.escarcha <= 0) return;
    // Entra de golpe y se va despacio: el fogonazo del principio es lo que dice
    // que ha pasado algo, y el resto solo tiene que recordar que sigue pasando.
    const u = this.escarchaTotal > 0 ? this.escarcha / this.escarchaTotal : 0;
    ctx.save();
    ctx.globalAlpha = 0.10 + 0.16 * u * u;
    ctx.fillStyle = '#9fd8ff';
    ctx.fillRect(0, 0, ancho, alto);
    ctx.restore();
  },

  // La viñeta de herida, también en la CAPA DE INTERFAZ y por los mismos dos
  // motivos que la escarcha: va a la resolución del monitor, así que el
  // degradado sale liso, y no se la come el ampliado entero del mundo.
  //
  // AQUÍ SÍ HAY DEGRADADO, al revés que en la escarcha. Allí se descartó porque
  // un velo uniforme cubre toda la pantalla y no necesita forma; una viñeta ES
  // su forma —tiene que dejar limpio el centro, que es donde se está mirando— y
  // sin degradado sería un marco recortado. El motivo de aquel descarte era que
  // `createRadialGradient` asigna, así que aquí se construye UNA vez y se
  // guarda: solo se rehace si cambia el tamaño de la capa, es decir nunca
  // durante una partida.
  //
  // `fracVida` es la del jugador PEOR PARADO de los que siguen en pie. En
  // cooperativo eso es lo correcto: si uno está a punto de caer, es urgente para
  // los cuatro, porque levantarle va a costarle la posición a otro.
  dibujarHerida(ctx, ancho, alto, fracVida) {
    // Latido de vida baja: crece según se acerca a cero y respira.
    let alfa = 0;
    if (fracVida < UMBRAL_VIDA_BAJA) {
      const gravedad = 1 - fracVida / UMBRAL_VIDA_BAJA;
      alfa = gravedad * (0.20 + 0.10 * Math.sin(this._faseVida));
    }
    // Y el fogonazo del golpe por encima, que se suma al latido: recibir un
    // mordisco estando ya a punto de caer tiene que verse peor que recibirlo
    // entero. Al cuadrado para que entre de golpe y se vaya suave.
    if (this.herida > 0) alfa += this.herida * this.herida * 0.75;
    if (alfa <= 0.005) return;

    if (!this._grad || this._gradW !== ancho || this._gradH !== alto) {
      const cx = ancho / 2, cy = alto / 2;
      const radio = Math.hypot(cx, cy);
      const g = ctx.createRadialGradient(cx, cy, radio * 0.42, cx, cy, radio);
      g.addColorStop(0, 'rgba(150,14,20,0)');
      g.addColorStop(0.65, 'rgba(150,14,20,.55)');
      g.addColorStop(1, 'rgba(120,8,14,1)');
      this._grad = g;
      this._gradW = ancho;
      this._gradH = alto;
    }

    ctx.save();
    ctx.globalAlpha = alfa > 1 ? 1 : alfa;
    ctx.fillStyle = this._grad;
    ctx.fillRect(0, 0, ancho, alto);
    ctx.restore();
  },

  dibujarNumeros(ctx, offX, offY) {
    const items = this.pool.items;
    const n = this.pool.activos;
    if (n === 0) return;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';

    // DOS PASADAS, una por tamaño de letra.
    //
    // Asignar ctx.font es de las operaciones más caras del canvas 2D: obliga a
    // parsear la cadena y a resolver la fuente. Hacerlo por número eran treinta
    // resoluciones de fuente por frame. Agrupando, son dos.
    for (let pasada = 0; pasada < 2; pasada++) {
      const gordo = pasada === 1;
      let usada = false;

      for (let k = 0; k < n; k++) {
        const p = items[k];
        if (p.gordo !== gordo) continue;
        if (!usada) {
          ctx.font = gordo ? `700 15px ${FUENTE}` : `600 12px ${FUENTE}`;
          ctx.lineWidth = gordo ? 3.5 : 3;
          usada = true;
        }
        const t = p.vida / VIDA_NUMERO;        // 1 recién salido, 0 al apagarse
        const subida = (1 - t) * SUBIDA;
        const px = Math.round((p.x + p.desvio) * ESCALA_ARTE - offX);
        const py = Math.round((p.y - subida) * ESCALA_ARTE - offY);

        ctx.globalAlpha = t > 0.6 ? 1 : t / 0.6;
        // Contorno en vez de sombra desplazada: la sombra a un píxel funcionaba
        // cuando el número ERA de un píxel de rejilla, pero aquí se traza a la
        // resolución del monitor y quedaba como una letra mal impresa. El
        // contorno cerrado lee igual de bien sobre la arena y no dobla la
        // figura.
        ctx.strokeStyle = 'rgba(18,11,9,.9)';
        ctx.strokeText(p.texto, px, py);
        ctx.fillStyle = gordo ? '#ffd24a' : '#f4efe2';
        ctx.fillText(p.texto, px, py);
      }
    }

    ctx.restore();
  }
};
