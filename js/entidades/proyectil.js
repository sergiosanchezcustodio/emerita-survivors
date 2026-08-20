import { ANCHO_LOGICO, ALTO_LOGICO, ESCALA_ARTE } from '../core/constantes.js';
import { Pool } from '../core/pool.js';
import { Recursos } from '../core/recursos.js';

// Proyectiles. Mismo patrón que los enemigos: pool preasignado, activos
// contiguos, cero `new` en partida.
//
// NO usan sprite. El plan es explícito: proyectiles, explosiones, charcos y
// partículas se dibujan por código con formas y `globalCompositeOperation =
// 'lighter'`. Rinden mejor que un PNG escalado y, sobre todo, se ven mejor:
// una jabalina de 8 píxeles dibujada como trazo siempre estará más limpia que
// un sprite reducido.

// Margen fuera de pantalla antes de reciclar.
//
// Era 48, que basta para lo que SALE de cámara: un proyectil que se va ya no le
// importa a nadie. Pero desde la Lluvia de flechas también hay proyectiles que
// ENTRAN —nacen por encima del borde superior y caen dentro— y con el margen
// corto se reciclaban en el mismo frame en que se lanzaban, antes de que nadie
// los viera. La caja tiene que ser lo bastante alta para sostenerlos mientras
// bajan.
//
// 200 cubre una caída de 150 sobre un blanco en el borde de la pantalla. Lo que
// cuesta es que un proyectil que se va de cuadro tarda un poco más en devolver
// su hueco al pool; da igual, porque de todas formas muere solo al agotar su
// `vida`, que es su alcance partido por su velocidad.
const MARGEN = 200;

function crearProyectil() {
  return {
    x: 0, y: 0, xPrev: 0, yPrev: 0,
    vx: 0, vy: 0,
    vida: 0,                 // segundos que le quedan
    vidaMax: 0,              // con los que nació; se repone al rebotar
    danyo: 0, empuje: 0,
    radio: 0,
    // Enemigos que aún puede atravesar. NEGATIVO significa "en seco": gastado
    // pero todavía volando, que es lo que le pasa a una bala con rebotes de
    // pared pendientes (ver `rebotesPared` y sistemas/colisiones.js).
    perforacion: 0,
    perforacionMax: 0,       // con la que nació; se repone al rebotar
    sello: 0,                // marca para no golpear dos veces al mismo
    // Al agotarse deja una onda expansiva de este radio. 0 = no estalla.
    radioExplosion: 0, danyoExplosion: 0,
    estallaAlExpirar: false, // las granadas revientan aunque no den a nadie
    // Id de atlas de la hoja de explosión, para que la onda que deja al
    // estallar sepa con qué dibujarse. Quien la crea es main.js, y allí ya no
    // queda arma: solo el proyectil.
    spriteOnda: null,
    // COLUMNA DE RAYO al estallar. `rayoCaida` es desde cuánto más arriba cae
    // el haz —0 = no cae ninguno— y `rayoGrosor` su trazo. Viaja con el
    // proyectil por lo mismo que `spriteOnda`: quien revienta es main.js y allí
    // ya no hay arma a la que preguntarle.
    rayoCaida: 0, rayoGrosor: 3,
    // REBOTES CONTRA EL BORDE DE LA PANTALLA. Cuántas veces le queda por
    // rebotar antes de seguir de largo. El Fusil los usa: la bala vuelve del
    // margen y barre otra vez, que convierte un arma de un solo blanco en una
    // que castiga los pasillos.
    rebotesPared: 0,
    // Cuánto gana de velocidad en CADA rebote de pared, en tanto por uno. 0 =
    // vuelve igual de rápido que se fue, que es lo normal.
    aceleraRebote: 0,
    // REBOTES DE ENEMIGO A ENEMIGO. Al gastarse contra uno, en vez de morir
    // salta al más cercano que no haya tocado ya. Es la Honda: una piedra que
    // va haciendo cabriolas entre la horda.
    rebotesEnemigo: 0,
    color: '#fff', estela: null,
    largo: 8,                // longitud del trazo al dibujar
    // Cómo se dibuja: dardo, bala, bola, rayo o el trazo de siempre. Sale del
    // comportamiento del arma (ver FORMA_POR_COMPORTAMIENTO en sistemas/armas.js).
    forma: 'raya',
    // Id de atlas de un dibujo propio. Si lo trae, sustituye a la forma
    // trazada; si no carga, se vuelve a la forma sin avisar.
    hoja: null,
    // CUÁNTO SE AMPLÍA SU DIBUJO. 1 = a su tamaño horneado, que es lo normal.
    //
    // Lo usa la Rosa de los vientos, que crece con el nivel del arma: su hitbox
    // sube de 3 a 12 y la estrella tiene que subir con él, o al máximo estaría
    // haciendo daño a cuatro veces la distancia de lo que se ve.
    escala: 1,
    // GIRO SOBRE SÍ MISMO, en radianes por segundo. 0 = el dibujo se orienta
    // según su vuelo, que es lo normal en un proyectil.
    //
    // Hay cosas que no apuntan a donde van: un shuriken voltea, una botella da
    // vueltas por el aire. Para esas, orientar el dibujo al rumbo lo deja
    // clavado y rígido, que es justo lo contrario de lo que hacen de verdad.
    giro: 0
  };
}

// Marca única por proyectil. Cada enemigo golpeado guarda el sello del
// proyectil que le dio; comparándolo, un proyectil perforante nunca cuenta dos
// veces al mismo enemigo aunque siga solapándolo varios frames.
//
// Es preferible a que el proyectil lleve una lista de a quién ha tocado: esa
// lista habría que asignarla, vaciarla y recorrerla, y los índices del pool de
// enemigos cambian de posición al reciclar.
let contadorSello = 1;

// Un sello nuevo. Lo necesita el rebote entre enemigos (sistemas/colisiones.js):
// un proyectil que cambia de rumbo hacia otro blanco es un golpe nuevo y tiene
// que poder volver a tocar a quien ya tocó. Se exporta el CONTADOR y no se
// duplica en el otro archivo para que no haya dos series que puedan chocar.
export function nuevoSello() { return contadorSello++; }

export class Proyectiles {
  constructor(capacidad) {
    this.pool = new Pool(crearProyectil, capacidad);
    this.dibujados = 0;
  }

  get activos() { return this.pool.activos; }

  lanzar(x, y, vx, vy, def) {
    const p = this.pool.obtener();
    if (!p) return null;
    p.x = p.xPrev = x;
    p.y = p.yPrev = y;
    p.vx = vx;
    p.vy = vy;
    p.vida = def.vida;
    p.danyo = def.danyo;
    p.empuje = def.empuje;
    p.radio = def.radio;
    p.perforacion = p.perforacionMax = def.perforacion;
    p.color = def.color;
    p.estela = def.estela || null;
    p.largo = def.largo || 8;
    p.forma = def.forma || 'raya';
    p.hoja = def.hoja || null;
    p.giro = def.giro || 0;
    p.escala = def.escala || 1;
    p.radioExplosion = def.radioExplosion || 0;
    p.danyoExplosion = def.danyoExplosion || 0;
    p.estallaAlExpirar = !!def.estallaAlExpirar;
    p.spriteOnda = def.spriteOnda || null;
    p.rayoCaida = def.rayoCaida || 0;
    p.rayoGrosor = def.rayoGrosor || 3;
    p.vidaMax = p.vida;
    p.rebotesPared = def.rebotesPared || 0;
    p.aceleraRebote = def.aceleraRebote || 0;
    p.rebotesEnemigo = def.rebotesEnemigo || 0;
    p.sello = contadorSello++;
    return p;
  }

  // `alEstallar` es una referencia de función, no una closure: la fija main.js
  // una vez. Se llama con el proyectil que acaba de expirar y que debe reventar.
  // `camara` solo hace falta para los proyectiles que rebotan; se pasa siempre
  // porque comprobar `rebotesPared` es una comparación con cero y no compensa
  // tener dos caminos.
  mover(dt, alEstallar, camara) {
    const items = this.pool.items;
    let k = 0;
    while (k < this.pool.activos) {
      const p = items[k];
      p.xPrev = p.x;
      p.yPrev = p.y;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // REBOTE CONTRA EL MARGEN VISIBLE, y contra el visible a propósito: el
      // borde contra el que rebota tiene que ser uno que el jugador VEA, o el
      // rebote parece que sale de la nada. Por eso se usa la cámara y no los
      // límites del nivel.
      //
      // Se invierte la componente y se recoloca justo dentro del borde: sin
      // recolocar, un proyectil rápido puede quedarse fuera un paso más y
      // gastar los dos rebotes contra la misma pared en dos frames seguidos.
      if (p.rebotesPared > 0 && camara) {
        // El borde sale de la cámara LÓGICA (`camara.x`) y no de `izquierda`,
        // que se calcula sobre `xVista` — la posición YA INTERPOLADA para
        // dibujar. Rebotar es lógica: cambia la trayectoria y por tanto a quién
        // se mata, así que no puede depender de un valor que se mueve con los
        // fps. Con `xVista`, la misma semilla daba rebotes distintos a 60 y a
        // 144 Hz, que es justo lo que la reproducibilidad prohíbe.
        const cx = camara.x - ANCHO_LOGICO / 2, cy = camara.y - ALTO_LOGICO / 2;
        const izq = cx, der = cx + ANCHO_LOGICO;
        const arr = cy, aba = cy + ALTO_LOGICO;
        let reboto = false;
        if (p.x < izq && p.vx < 0)      { p.x = izq; p.vx = -p.vx; reboto = true; }
        else if (p.x > der && p.vx > 0) { p.x = der; p.vx = -p.vx; reboto = true; }
        else if (p.y < arr && p.vy < 0) { p.y = arr; p.vy = -p.vy; reboto = true; }
        else if (p.y > aba && p.vy > 0) { p.y = aba; p.vy = -p.vy; reboto = true; }
        if (reboto) {
          p.rebotesPared--;
          // Se le devuelve el alcance. El `vida` de un proyectil es su alcance
          // partido por su velocidad, o sea la distancia que le queda: sin
          // reponerlo, la bala llega al margen ya agotada y el rebote se ve
          // apagarse a los dos palmos en vez de volver.
          p.vida = p.vidaMax;
          // Y vuelve a poder golpear a quien ya golpeó: el sello es lo que
          // impide que un proyectil dañe dos veces al mismo, y una bala que
          // vuelve del margen es un golpe nuevo.
          p.sello = contadorSello++;
          // Con la perforación entera otra vez, que es lo que hace que el
          // rebote SIRVA. Una bala que vuelve gastada rebota de adorno: cruza
          // la horda sin tocar a nadie y lo único que se ve es una raya. Y es
          // coherente con las otras dos líneas: si el margen la deja como un
          // disparo nuevo, lo es entera. El daño sigue acotado, porque cada
          // tramo entre paredes gasta como mucho su perforación.
          p.perforacion = p.perforacionMax;

          // Y SALE MÁS RÁPIDA DE LO QUE ENTRÓ. Es lo que convierte los rebotes
          // de un recurso a una amenaza que crece: la primera vuelta es una
          // bala y la décima es un latigazo cruzando la pantalla.
          //
          // Se multiplica la velocidad y NO se toca `vida`, que se acaba de
          // reponer entera: como `vida` es tiempo y no distancia, una bala más
          // rápida recorre más en ese mismo tiempo. O sea que cada rebote alarga
          // también el tramo siguiente, que es justo lo que hace falta para que
          // le dé tiempo a llegar a la pared de enfrente.
          if (p.aceleraRebote > 0) {
            const k = 1 + p.aceleraRebote;
            p.vx *= k;
            p.vy *= k;
          }
        }
      }

      p.vida -= dt;
      if (p.vida <= 0) {
        // Una granada que no acierta a nadie tiene que estallar igual: caer al
        // suelo y desaparecer sin más sería lo contrario de lo que promete.
        if (p.estallaAlExpirar && p.radioExplosion > 0 && alEstallar) alEstallar(p);
        this.pool.liberarEn(k);                  // sin avanzar k: ver Pool
      } else k++;
    }
  }

  // Baja inmediata, la usa el sistema de colisiones cuando se agota la
  // perforación.
  liberarEn(i) { this.pool.liberarEn(i); }

  vaciar() { this.pool.vaciar(); }

  // Recicla lo que ha salido de cámara. Va aparte de mover() porque necesita la
  // cámara y mover() se llama antes de que la cámara se actualice.
  reciclarFuera(camara) {
    const items = this.pool.items;
    const izq = camara.x - ANCHO_LOGICO / 2 - MARGEN;
    const der = camara.x + ANCHO_LOGICO / 2 + MARGEN;
    const arr = camara.y - ALTO_LOGICO / 2 - MARGEN;
    const aba = camara.y + ALTO_LOGICO / 2 + MARGEN;
    let k = 0;
    while (k < this.pool.activos) {
      const p = items[k];
      if (p.x < izq || p.x > der || p.y < arr || p.y > aba) this.pool.liberarEn(k);
      else k++;
    }
  }

  // Trazo orientado según la velocidad, con un núcleo claro encima y un
  // resplandor suave en la punta. El modo 'lighter' suma luz en vez de
  // taparla, que es lo que hace que los impactos se vean calientes cuando se
  // amontonan.
  //
  // EL RESPLANDOR VA A ALFA BAJO A PROPÓSITO (0.22). Este es un juego de
  // "muchas balas en pantalla a la vez" —a nivel alto, un arma puede tener
  // varios proyectiles vivos y varias armas disparan juntas— así que un halo
  // intenso por proyectil se acumularía hasta lavar la lectura del combate.
  // Con 'lighter' ya activo, los que SÍ se solapan se ven más calientes solos
  // por la suma, sin tener que subir el alfa base de cada uno. El radio del
  // halo se acota (máximo 16) para que un arma con hitbox grande no deje una
  // mancha desproporcionada.
  // CADA ARMA CON SU SILUETA.
  //
  // Los 52 del catálogo se dibujaban igual: una raya de color con estela. Con
  // eso, el pilum, la bala de un fusil, una granada y un rayo eran el mismo
  // trazo en cuatro colores, y la personalidad de un arma se quedaba entera en
  // el número de daño.
  //
  // Cuatro formas y el trazo de siempre de repliegue. No son cincuenta y dos
  // dibujos: son cuatro maneras de moverse por el aire, que es lo que de verdad
  // distingue a un proyectil de otro. El color sigue separando dentro de cada
  // familia, como hasta ahora.
  //
  // Todo va en `lighter` —sumando luz— porque son destellos, no objetos: es lo
  // que hace que se lean sobre la piedra oscura y sobre la horda por igual.
  dibujar(ctx, alpha) {
    const items = this.pool.items;
    const n = this.pool.activos;
    if (n === 0) { this.dibujados = 0; return; }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let k = 0; k < n; k++) {
      const p = items[k];
      const x = p.xPrev + (p.x - p.xPrev) * alpha;
      const y = p.yPrev + (p.y - p.yPrev) * alpha;

      const v = Math.hypot(p.vx, p.vy);
      if (v < 0.001) continue;
      const ux = p.vx / v, uy = p.vy / v;
      const l = p.largo;

      // CON DIBUJO PROPIO: el sprite orientado al vuelo, y nada más. Ni halo ni
      // trazo — el dibujo ya trae su propio cuerpo y su estela.
      if (p.hoja) {
        const img = Recursos.imagen(p.hoja);
        const meta = Recursos.meta(p.hoja);
        if (img && meta) {
          const aw = meta.w / ESCALA_ARTE * p.escala;
          const ah = meta.h / ESCALA_ARTE * p.escala;
          ctx.save();
          ctx.globalAlpha = 1;
          // FUERA EL 'lighter' PARA LOS QUE TRAEN DIBUJO.
          //
          // El modo aditivo de arriba es para los proyectiles TRAZADOS: son
          // destellos y sumar luz es lo que los hace legibles sobre la piedra
          // oscura. Con una ilustración es al revés: sumando, los tonos
          // oscuros del dibujo no aportan nada y desaparecen, los claros se
          // queman, y la bala entera se ve translúcida — que es exactamente lo
          // que Sergio vio en la de la pistola. Dibujada en 'source-over' se
          // respeta el alfa que trae el PNG, que además es DURO (silueta
          // recortada al pixel, sin bordes a medias), así que la bala sale
          // maciza y con su contorno.
          //
          // Vale para TODAS las armas que usen un `spriteProyectil`, no solo
          // para la pistola: el criterio es tener dibujo propio, no ser un
          // arma concreta. Hoy son seis las que comparten esta bala.
          ctx.globalCompositeOperation = 'source-over';
          ctx.translate(x, y);

          if (p.giro !== 0) {
            // GIRA SOBRE SÍ MISMO: el shuriken y la botella del molotov. Se
            // dibuja CENTRADO, porque una cosa que voltea no tiene punta que
            // anclar — anclarla por el borde la haría orbitar alrededor del
            // punto de impacto en vez de girar sobre su eje.
            //
            // La fase sale de la vida ya gastada y del sello, no de un reloj:
            // dt es fijo, así que dos partidas con la misma semilla giran igual,
            // y el sello hace que dos proyectiles a la vez no salgan
            // sincronizados. Es el mismo truco que el núcleo de `_bola`.
            ctx.rotate(p.sello * 0.7 + (p.vidaMax - p.vida) * p.giro);
            ctx.drawImage(img, 0, 0, meta.w, meta.h, -aw / 2, -ah / 2, aw, ah);
          } else {
            ctx.rotate(Math.atan2(p.vy, p.vx));
            // ESPEJADO, no girado 180°. El dibujo mira a la izquierda, y aquí
            // hay dos maneras de darle la vuelta que NO son la misma: rotar
            // media vuelta invertiría también el eje vertical —la llama y los
            // brillos saldrían del revés— mientras que espejar solo cambia el
            // sentido de la marcha, que es lo único que hay que corregir.
            ctx.scale(-1, 1);
            // ANCLADO POR LA PUNTA, no por el centro: detrás del proyectil lo
            // que hay es llama, y anclar por el centro dejaría media estela por
            // delante del punto que de verdad colisiona.
            //
            // Con el espejo puesto, lo que se dibuja en x=d aparece en -d: el
            // borde izquierdo del dibujo —que es la punta— acaba en +0,2 de
            // largo por delante, y la llama se extiende 0,8 hacia atrás. La
            // abeja usa el mismo convenio: cabeza a la izquierda del dibujo.
            ctx.drawImage(img, 0, 0, meta.w, meta.h, -aw * 0.2, -ah / 2, aw, ah);
          }
          ctx.restore();
          continue;
        }
      }

      // El halo lo llevan todas: es lo que las hace visibles con la pantalla
      // llena, y su tamaño ya lo separa el radio de cada arma.
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(x, y, Math.min(p.radio * 2.2, 16), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      if (p.forma === 'dardo') this._dardo(ctx, p, x, y, ux, uy, l);
      else if (p.forma === 'bala') this._bala(ctx, p, x, y, ux, uy, l);
      else if (p.forma === 'bola') this._bola(ctx, p, x, y, ux, uy, l);
      else if (p.forma === 'rayo') this._rayo(ctx, p, x, y, ux, uy, l);
      else this._raya(ctx, p, x, y, ux, uy, l);
    }

    ctx.restore();
    this.dibujados = n;
  }

  // DARDO: lo que se lanza con punta —pilum, jabalina, flecha, aguja—. Asta
  // larga y fina, punta ancha y dos aletas atrás. Es la forma que dice "esto
  // viene clavándose" en vez de "esto viene pasando".
  _dardo(ctx, p, x, y, ux, uy, l) {
    const px = -uy, py = ux;                  // perpendicular, para las aletas
    if (p.estela) {
      ctx.strokeStyle = p.estela;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x - ux * l * 2.6, y - uy * l * 2.6);
      ctx.lineTo(x - ux * l, y - uy * l);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x - ux * l, y - uy * l);
    ctx.lineTo(x + ux * l * 0.5, y + uy * l * 0.5);
    // Aletas.
    ctx.moveTo(x - ux * l, y - uy * l);
    ctx.lineTo(x - ux * l * 1.35 + px * l * 0.28, y - uy * l * 1.35 + py * l * 0.28);
    ctx.moveTo(x - ux * l, y - uy * l);
    ctx.lineTo(x - ux * l * 1.35 - px * l * 0.28, y - uy * l * 1.35 - py * l * 0.28);
    ctx.stroke();
    // Punta: un triángulo lleno, que es lo que se ve a esta escala.
    ctx.beginPath();
    ctx.moveTo(x + ux * l * 0.75, y + uy * l * 0.75);
    ctx.lineTo(x + px * l * 0.2, y + py * l * 0.2);
    ctx.lineTo(x - px * l * 0.2, y - py * l * 0.2);
    ctx.closePath();
    ctx.fillStyle = p.color;
    ctx.fill();
  }

  // BALA: corta, compacta y con la estela larga. Lo que cuenta de un disparo de
  // fuego no es el proyectil —que apenas se ve— sino el rastro.
  _bala(ctx, p, x, y, ux, uy, l) {
    ctx.strokeStyle = p.estela || p.color;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(x - ux * l * 3.2, y - uy * l * 3.2);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1.4, p.radio * 0.7), 0, Math.PI * 2);
    ctx.fill();
  }

  // BOLA: lo que va a estallar. Redonda, con núcleo claro y un giro lento que
  // se nota — una granada rueda por el aire, no vuela derecha.
  _bola(ctx, p, x, y, ux, uy, l) {
    const r = Math.max(2.2, p.radio * 0.9);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    // El núcleo gira alrededor del centro con el sello del proyectil como fase:
    // así dos granadas a la vez no giran sincronizadas.
    const a = p.sello * 0.7 + p.vida * 9;
    ctx.fillStyle = '#fff4d2';
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * r * 0.32, y + Math.sin(a) * r * 0.32, r * 0.42, 0, Math.PI * 2);
    ctx.fill();
    if (p.estela) {
      ctx.strokeStyle = p.estela;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = r * 0.9;
      ctx.beginPath();
      ctx.moveTo(x - ux * l * 1.6, y - uy * l * 1.6);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // RAYO: quebrado. Tres tramos con el codo desplazado a un lado y a otro, y el
  // desplazamiento sale del sello y de la vida, así que tiembla mientras avanza
  // sin necesitar azar ni memoria por proyectil.
  _rayo(ctx, p, x, y, ux, uy, l) {
    const px = -uy, py = ux;
    const f = p.sello * 1.7 + p.vida * 40;
    const a1 = Math.sin(f) * l * 0.45;
    const a2 = Math.sin(f * 1.7 + 2) * l * 0.45;
    const x0 = x - ux * l * 2, y0 = y - uy * l * 2;
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + ux * l * 0.7 + px * a1, y0 + uy * l * 0.7 + py * a1);
    ctx.lineTo(x0 + ux * l * 1.4 + px * a2, y0 + uy * l * 1.4 + py * a2);
    ctx.lineTo(x + ux * l * 0.4, y + uy * l * 0.4);
    ctx.stroke();
    // Segundo trazo más fino y claro por encima: es lo que le da el brillo de
    // descarga en vez de parecer una cuerda doblada.
    ctx.strokeStyle = '#ffffff';
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 0.9;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // RAYA: el trazo de siempre. Es el repliegue de los comportamientos que no
  // declaran forma, y lo que usan los que no son proyectiles al uso.
  _raya(ctx, p, x, y, ux, uy, l) {
    if (p.estela) {
      ctx.strokeStyle = p.estela;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - ux * l * 2.2, y - uy * l * 2.2);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x - ux * l, y - uy * l);
    ctx.lineTo(x + ux * l * 0.35, y + uy * l * 0.35);
    ctx.stroke();
  }
}
