import { ANCHO_LOGICO, ALTO_LOGICO } from '../core/constantes.js';
import { Pool } from '../core/pool.js';

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
    largo: 8                 // longitud del trazo al dibujar
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
  dibujar(ctx, alpha) {
    const items = this.pool.items;
    const n = this.pool.activos;
    if (n === 0) { this.dibujados = 0; return; }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';

    for (let k = 0; k < n; k++) {
      const p = items[k];
      const x = p.xPrev + (p.x - p.xPrev) * alpha;
      const y = p.yPrev + (p.y - p.yPrev) * alpha;

      const v = Math.hypot(p.vx, p.vy);
      if (v < 0.001) continue;
      const ux = p.vx / v, uy = p.vy / v;
      const l = p.largo;

      if (p.estela) {
        ctx.strokeStyle = p.estela;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x - ux * l * 2.2, y - uy * l * 2.2);
        ctx.lineTo(x, y);
        ctx.stroke();
      }

      ctx.globalAlpha = 0.22;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(x, y, Math.min(p.radio * 2.2, 16), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x - ux * l, y - uy * l);
      ctx.lineTo(x + ux * l * 0.35, y + uy * l * 0.35);
      ctx.stroke();
    }

    ctx.restore();
    this.dibujados = n;
  }
}
