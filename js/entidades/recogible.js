import { Pool } from '../core/pool.js';

// Gemas de experiencia. Pool preasignado, como todo lo demás.
//
// Se dibujan por código: son rombos de 6-10 píxeles con un punto de luz. Un
// sprite a este tamaño no aportaría nada y sí un blit más por gema.
//
// Cuatro valores, como pide el plan: azul 1, verde 5, roja 25, dorada 100. El
// color no es decoración, es información: de un vistazo sabes si merece la pena
// cruzar la pantalla a por ella.
export const GEMAS = [
  { valor: 1,   color: '#5aa9e6', brillo: '#bfe4ff', lado: 3 },
  { valor: 5,   color: '#5ac36a', brillo: '#c6f3cd', lado: 3.5 },
  { valor: 25,  color: '#d64b5a', brillo: '#ffc2c8', lado: 4 },
  { valor: 100, color: '#e8b73a', brillo: '#fff0b8', lado: 5 }
];

// Por encima de esto, las gemas más lejanas se fusionan (requisito 5 del plan).
// Sin ello, veinte minutos de partida dejan miles de rombos en el suelo y el
// dibujado se hunde por acumulación, no por dificultad.
const TOPE_ANTES_DE_FUSIONAR = 150;

// Imán: dentro del radio de recogida vuela hacia el jugador ACELERANDO. Que
// acelere es lo que hace que recoger se sienta bien; a velocidad constante
// parecen limaduras arrastrándose.
const VELOCIDAD_INICIAL = 40;
const ACELERACION = 620;
const VELOCIDAD_MAXIMA = 420;

function crearGema() {
  return {
    x: 0, y: 0, xPrev: 0, yPrev: 0,
    vx: 0, vy: 0,
    valor: 0, tipo: 0,
    atraidaPor: null,        // jugador que la está absorbiendo
    fase: 0                  // para el cabeceo cuando está quieta
  };
}

export class Recogibles {
  constructor(capacidad, rng) {
    this.pool = new Pool(crearGema, capacidad);
    this._rng = rng;
    this.recogidas = 0;
  }

  get activas() { return this.pool.activos; }

  // Suelta la gema que corresponde al valor de experiencia dado, eligiendo el
  // escalón más grande que quepa. Un enemigo que vale 30 deja una roja, no
  // treinta azules.
  soltar(x, y, xp) {
    let tipo = 0;
    for (let i = GEMAS.length - 1; i >= 0; i--) {
      if (xp >= GEMAS[i].valor) { tipo = i; break; }
    }
    const g = this.pool.obtener();
    if (!g) return null;
    g.x = g.xPrev = x + (this._rng() - 0.5) * 6;
    g.y = g.yPrev = y + (this._rng() - 0.5) * 4;
    g.vx = 0; g.vy = 0;
    g.tipo = tipo;
    g.valor = GEMAS[tipo].valor;
    g.atraidaPor = null;
    g.fase = this._rng() * Math.PI * 2;
    return g;
  }

  // Devuelve la XP recogida en este paso, ya repartida a cada jugador.
  actualizar(dt, jugadores) {
    const items = this.pool.items;
    let k = 0;
    while (k < this.pool.activos) {
      const g = items[k];
      g.xPrev = g.x;
      g.yPrev = g.y;
      g.fase += dt * 3;

      // Buscar quién la atrae. Una vez enganchada NO cambia de dueño: si dos
      // jugadores se cruzan, la gema iría dando bandazos entre los dos.
      if (!g.atraidaPor) {
        for (let i = 0; i < jugadores.length; i++) {
          const j = jugadores[i];
          if (j.abatido) continue;
          const dx = j.x - g.x;
          const dy = j.y - g.y;
          if (dx * dx + dy * dy < j.radioRecogida * j.radioRecogida) {
            g.atraidaPor = j;
            const d = Math.hypot(dx, dy) || 1;
            g.vx = (dx / d) * VELOCIDAD_INICIAL;
            g.vy = (dy / d) * VELOCIDAD_INICIAL;
            break;
          }
        }
      }

      if (g.atraidaPor) {
        const j = g.atraidaPor;
        if (j.abatido) { g.atraidaPor = null; k++; continue; }
        let dx = j.x - g.x;
        let dy = j.y - g.y;
        const d2 = dx * dx + dy * dy;

        // Absorbida
        if (d2 < 36) {
          j.ganarXp(g.valor);
          this.recogidas++;
          this.pool.liberarEn(k);       // sin avanzar k
          continue;
        }

        const d = Math.sqrt(d2);
        dx /= d; dy /= d;
        const v = Math.min(VELOCIDAD_MAXIMA, Math.hypot(g.vx, g.vy) + ACELERACION * dt);
        g.vx = dx * v;
        g.vy = dy * v;
        g.x += g.vx * dt;
        g.y += g.vy * dt;
      }
      k++;
    }

    if (this.pool.activos > TOPE_ANTES_DE_FUSIONAR) this._fusionar(jugadores);
  }

  // Fusiona las más lejanas al grupo en gemas de mayor valor. Se conserva el
  // valor total: no se regala ni se roba experiencia, solo se agrupa.
  _fusionar(jugadores) {
    const items = this.pool.items;
    const sobran = this.pool.activos - TOPE_ANTES_DE_FUSIONAR;
    let hechas = 0;

    // Centro del grupo, para saber qué es "lejos".
    let cx = 0, cy = 0, n = 0;
    for (let i = 0; i < jugadores.length; i++) {
      if (jugadores[i].abatido) continue;
      cx += jugadores[i].x; cy += jugadores[i].y; n++;
    }
    if (n === 0) return;
    cx /= n; cy /= n;

    let k = 0;
    while (k < this.pool.activos && hechas < sobran) {
      const g = items[k];
      const dx = g.x - cx, dy = g.y - cy;
      // Solo las que están de verdad lejos y no se están recogiendo ya.
      if (g.atraidaPor || dx * dx + dy * dy < 400 * 400 || g.tipo >= GEMAS.length - 1) {
        k++;
        continue;
      }
      // Busca otra lejana del mismo escalón con la que juntarse.
      let pareja = -1;
      for (let q = k + 1; q < this.pool.activos; q++) {
        const o = items[q];
        if (o.tipo === g.tipo && !o.atraidaPor) { pareja = q; break; }
      }
      if (pareja < 0) { k++; continue; }

      const sumado = g.valor + items[pareja].valor;
      let tipo = g.tipo;
      while (tipo < GEMAS.length - 1 && GEMAS[tipo + 1].valor <= sumado) tipo++;
      g.tipo = tipo;
      g.valor = sumado;
      this.pool.liberarEn(pareja);
      hechas++;
    }
  }

  vaciar() { this.pool.vaciar(); }

  // Rombo con un punto de luz. Las atraídas dejan una estela corta: es lo que
  // convierte la recogida en un efecto y no en una desaparición.
  dibujar(ctx, alpha) {
    const items = this.pool.items;
    const n = this.pool.activos;
    if (n === 0) return;

    for (let k = 0; k < n; k++) {
      const g = items[k];
      const def = GEMAS[g.tipo];
      const x = g.xPrev + (g.x - g.xPrev) * alpha;
      // Cabeceo suave mientras espera en el suelo.
      const y = g.yPrev + (g.y - g.yPrev) * alpha +
                (g.atraidaPor ? 0 : Math.sin(g.fase) * 1.2);
      const l = def.lado;

      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.moveTo(x, y - l);
      ctx.lineTo(x + l * 0.7, y);
      ctx.lineTo(x, y + l);
      ctx.lineTo(x - l * 0.7, y);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = def.brillo;
      ctx.fillRect(x - l * 0.2, y - l * 0.5, l * 0.4, l * 0.5);
    }
  }
}
