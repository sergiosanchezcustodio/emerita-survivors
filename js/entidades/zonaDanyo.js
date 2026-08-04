import { Pool } from '../core/pool.js';
import { enemigosEnRadio } from '../sistemas/colisiones.js';

// Zonas de daño: charcos, trampas, auras, explosiones y ondas expansivas.
//
// Un solo pool para todas porque, por debajo, son lo mismo: un círculo que hace
// daño a lo que tiene dentro durante un tiempo. Lo que cambia es CÓMO trata ese
// círculo al enemigo, y eso son tres modos:
//
//   'zona'  — radio fijo, daña por TICS cada `intervalo`. Charcos, trampas,
//             auras. Si `seguir` apunta a un jugador, se mueve con él.
//   'onda'  — el radio CRECE de `radioIni` a `radio` durante su vida y daña a
//             cada enemigo UNA sola vez, al pasarle por encima. Explosiones y
//             ondas expansivas.
//
// La distinción importa: una explosión que dañara por tics mataría lo que pilla
// dentro varias veces en el mismo instante, y un charco que dañara una sola vez
// dejaría de ser un charco.

const MAX_ALCANZADOS = 256;

function crearZona() {
  return {
    x: 0, y: 0,
    radio: 0, radioIni: 0, radioActual: 0,
    vida: 0, vidaMax: 1,
    danyo: 0, intervalo: 0, reloj: 0,
    empuje: 0, ralentiza: 0,
    modo: 'zona',
    sello: 0,                 // para que una onda no golpee dos veces
    seguir: null,             // jugador al que se pega (auras)
    color: '#fff', relleno: 0.18
  };
}

let contadorSello = 1;

export class Zonas {
  constructor(capacidad) {
    this.pool = new Pool(crearZona, capacidad);
    this._alcanzados = new Int32Array(MAX_ALCANZADOS);
  }

  get activas() { return this.pool.activos; }

  crear(def) {
    const z = this.pool.obtener();
    if (!z) return null;
    z.x = def.x; z.y = def.y;
    z.radio = def.radio;
    z.radioIni = def.radioIni || 0;
    z.radioActual = z.radioIni;
    z.vida = z.vidaMax = def.duracion;
    z.danyo = def.danyo;
    z.intervalo = def.intervalo || 0.4;
    z.reloj = 0;                       // el primer tic entra ya
    z.empuje = def.empuje || 0;
    z.ralentiza = def.ralentiza || 0;
    z.modo = def.modo || 'zona';
    z.seguir = def.seguir || null;
    z.color = def.color;
    z.relleno = def.relleno === undefined ? 0.18 : def.relleno;
    z.sello = contadorSello++;
    return z;
  }

  actualizar(dt, enemigos) {
    const items = this.pool.items;
    let k = 0;
    while (k < this.pool.activos) {
      const z = items[k];
      z.vida -= dt;
      if (z.vida <= 0) { this.pool.liberarEn(k); continue; }   // sin avanzar k

      if (z.seguir) { z.x = z.seguir.x; z.y = z.seguir.y - 6; }

      const t = 1 - z.vida / z.vidaMax;      // 0 recién nacida, 1 al expirar
      if (z.modo === 'onda') {
        // El radio crece deprisa al principio y frena al final: es lo que hace
        // que una explosión se sienta como un golpe y no como un globo.
        z.radioActual = z.radioIni + (z.radio - z.radioIni) * Math.sqrt(t);
        this._danyar(z, enemigos, true);
      } else {
        z.radioActual = z.radio;
        z.reloj -= dt;
        if (z.reloj <= 0) {
          z.reloj = z.intervalo;
          this._danyar(z, enemigos, false);
        }
      }
      k++;
    }
  }

  _danyar(z, enemigos, unaVez) {
    const n = enemigosEnRadio(enemigos, z.x, z.y, z.radioActual, this._alcanzados);
    const items = enemigos.pool.items;
    for (let i = 0; i < n; i++) {
      const e = items[this._alcanzados[i]];
      if (unaVez) {
        if (e.ultimoSello === z.sello) continue;
        e.ultimoSello = z.sello;
      }
      let dx = e.x - z.x;
      let dy = e.y - z.y;
      const d = Math.hypot(dx, dy) || 1;
      enemigos.danyar(e, z.danyo, dx / d, dy / d, z.empuje);
      if (z.ralentiza > 0) e.frenado = Math.max(e.frenado, z.ralentiza);
    }
  }

  vaciar() { this.pool.vaciar(); }

  // Círculo relleno tenue con el borde encendido. En 'lighter', como el resto de
  // efectos: se suman entre sí y dos charcos solapados se ven más calientes.
  dibujar(ctx) {
    const items = this.pool.items;
    const n = this.pool.activos;
    if (n === 0) return;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < n; k++) {
      const z = items[k];
      const t = z.vida / z.vidaMax;          // 1 al nacer, 0 al morir
      ctx.globalAlpha = z.modo === 'onda' ? t * 0.9 : (0.5 + t * 0.5) * 0.7;

      if (z.relleno > 0) {
        ctx.fillStyle = z.color;
        ctx.globalAlpha *= z.relleno;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.radioActual, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha /= z.relleno;
      }
      ctx.strokeStyle = z.color;
      ctx.lineWidth = z.modo === 'onda' ? 1 + t * 2.5 : 1.5;
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.radioActual, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}
