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

// Margen fuera de pantalla antes de reciclar. Basta con poco: un proyectil que
// sale de cámara ya no le importa a nadie.
const MARGEN = 48;

function crearProyectil() {
  return {
    x: 0, y: 0, xPrev: 0, yPrev: 0,
    vx: 0, vy: 0,
    vida: 0,                 // segundos que le quedan
    danyo: 0, empuje: 0,
    radio: 0,
    perforacion: 0,          // enemigos que aún puede atravesar
    sello: 0,                // marca para no golpear dos veces al mismo
    // Al agotarse deja una onda expansiva de este radio. 0 = no estalla.
    radioExplosion: 0, danyoExplosion: 0,
    estallaAlExpirar: false, // las granadas revientan aunque no den a nadie
    color: '#fff', estela: null,
    largo: 8,                // longitud del trazo al dibujar
    // Cómo se dibuja: dardo, bala, bola, rayo o el trazo de siempre. Sale del
    // comportamiento del arma (ver FORMA_POR_COMPORTAMIENTO en sistemas/armas.js).
    forma: 'raya',
    // Id de atlas de un dibujo propio. Si lo trae, sustituye a la forma
    // trazada; si no carga, se vuelve a la forma sin avisar.
    hoja: null
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
    p.perforacion = def.perforacion;
    p.color = def.color;
    p.estela = def.estela || null;
    p.largo = def.largo || 8;
    p.forma = def.forma || 'raya';
    p.hoja = def.hoja || null;
    p.radioExplosion = def.radioExplosion || 0;
    p.danyoExplosion = def.danyoExplosion || 0;
    p.estallaAlExpirar = !!def.estallaAlExpirar;
    p.sello = contadorSello++;
    return p;
  }

  // `alEstallar` es una referencia de función, no una closure: la fija main.js
  // una vez. Se llama con el proyectil que acaba de expirar y que debe reventar.
  mover(dt, alEstallar) {
    const items = this.pool.items;
    let k = 0;
    while (k < this.pool.activos) {
      const p = items[k];
      p.xPrev = p.x;
      p.yPrev = p.y;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
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
          const aw = meta.w / ESCALA_ARTE;
          const ah = meta.h / ESCALA_ARTE;
          ctx.save();
          ctx.globalAlpha = 1;
          ctx.translate(x, y);
          ctx.rotate(Math.atan2(p.vy, p.vx));
          // ESPEJADO, no girado 180°. El dibujo mira a la izquierda, y aquí hay
          // dos maneras de darle la vuelta que NO son la misma: rotar media
          // vuelta invertiría también el eje vertical —la llama y los brillos
          // saldrían del revés— mientras que espejar solo cambia el sentido de
          // la marcha, que es lo único que hay que corregir.
          ctx.scale(-1, 1);
          // ANCLADO POR LA PUNTA, no por el centro: detrás del proyectil lo que
          // hay es llama, y anclar por el centro dejaría media estela por
          // delante del punto que de verdad colisiona.
          //
          // Con el espejo puesto, lo que se dibuja en x=d aparece en -d: el
          // borde izquierdo del dibujo —que es la punta— acaba en +0,2 de largo
          // por delante, y la llama se extiende 0,8 hacia atrás.
          ctx.drawImage(img, 0, 0, meta.w, meta.h, -aw * 0.2, -ah / 2, aw, ah);
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
