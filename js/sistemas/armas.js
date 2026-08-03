import { ARMAS } from '../datos/armas.js';
import { enemigoMasCercano, enemigosEnRadio } from './colisiones.js';
import { Particulas, COLOR_CHISPA } from './particulas.js';

// Motor genérico de armas.
//
// Un arma equipada es {def, nivel, stats, temporizador}. Cada paso baja el
// temporizador y, al llegar a cero, ejecuta la función que nombra
// `def.comportamiento`. Los datos de datos/armas.js solo parametrizan: añadir un
// arma que reutilice un comportamiento existente no toca este archivo.
//
// Los comportamientos viven en un objeto plano indexado por nombre, no en un
// switch. Así el motor no conoce ninguna arma concreta y basta con añadir una
// función para inventar una familia nueva.

const GRADOS = Math.PI / 180;

// Tope de enemigos que un solo golpe en área puede tocar. Preasignado: sin él
// haría falta un array nuevo por tajo.
const MAX_ALCANZADOS = 256;

// Tajos visibles a la vez. Es efecto, no lógica: si se pierde uno con la
// pantalla ardiendo, no lo nota nadie.
const MAX_TAJOS = 12;

// --- Comportamientos ---------------------------------------------------------
// Firma común: (arma, sis, ctx). `sis` es el sistema (para sus buffers), `ctx`
// trae jugador, enemigos, proyectiles y rng.

const COMPORTAMIENTOS = {

  // Proyectil al enemigo más cercano. Con varios proyectiles se abren en
  // abanico alrededor de la misma dirección.
  proyectilDirigido(arma, sis, ctx) {
    const s = arma.stats;
    const objetivo = enemigoMasCercano(ctx.enemigos, ctx.jugador.x, ctx.jugador.y, s.alcance);
    if (!objetivo) return false;          // sin blanco no se gasta la recarga

    let dx = objetivo.x - ctx.jugador.x;
    let dy = objetivo.y - ctx.jugador.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;

    const base = Math.atan2(dy, dx);
    const n = s.proyectiles;
    for (let i = 0; i < n; i++) {
      // Abanico centrado: con 1 sale recto, con 3 uno recto y dos abiertos.
      const desvio = (i - (n - 1) / 2) * s.dispersion * GRADOS;
      const a = base + desvio;
      sis.defProyectil.danyo = s.danyo;
      sis.defProyectil.empuje = s.empuje;
      sis.defProyectil.radio = s.radio;
      sis.defProyectil.perforacion = s.perforacion;
      sis.defProyectil.vida = s.alcance / s.velocidad;
      sis.defProyectil.color = arma.def.color;
      sis.defProyectil.estela = arma.def.estela;
      sis.defProyectil.largo = 9;
      ctx.proyectiles.lanzar(
        ctx.jugador.x, ctx.jugador.y - 8,
        Math.cos(a) * s.velocidad, Math.sin(a) * s.velocidad,
        sis.defProyectil);
    }
    return true;
  },

  // Arco de corte en la dirección de avance. No hay proyectil: se resuelve el
  // cono al instante y se deja un tajo dibujado.
  //
  // Con más de un golpe por activación, los siguientes quedan encolados con su
  // demora: encadenar dos tajos seguidos se siente como una combinación, y
  // soltarlos en el mismo frame no se vería.
  arcoMelee(arma, sis, ctx) {
    sis.golpear(arma, ctx);
    arma.golpesPendientes = arma.stats.golpes - 1;
    arma.demoraGolpe = arma.def.demoraGolpe;
    return true;
  }
};

export class Armas {
  constructor(rng) {
    this.equipadas = [];
    this._rng = rng;
    this._alcanzados = new Int32Array(MAX_ALCANZADOS);
    this._avisadas = new Set();       // comportamientos sin implementar ya avisados

    // Descriptor reutilizado para lanzar proyectiles: se rellena y se pasa, en
    // vez de construir un objeto literal por disparo.
    this.defProyectil = {
      vida: 0, danyo: 0, empuje: 0, radio: 0,
      perforacion: 0, color: '#fff', estela: null, largo: 8
    };

    // Tajos para dibujar, preasignados.
    this.tajos = new Array(MAX_TAJOS);
    for (let i = 0; i < MAX_TAJOS; i++) {
      this.tajos[i] = { x: 0, y: 0, ang: 0, semi: 0, alcance: 0, vida: 0, vidaMax: 1, color: '#fff' };
    }
    this.nTajos = 0;
  }

  equipar(id) {
    const def = ARMAS[id];
    if (!def) return null;
    const arma = {
      id, def, nivel: 1,
      temporizador: 0,
      golpesPendientes: 0,
      demoraGolpe: 0,
      stats: {}
    };
    this._recalcular(arma);
    this.equipadas.push(arma);
    return arma;
  }

  subirNivel(id) {
    const arma = this.equipadas.find((a) => a.id === id);
    if (!arma || arma.nivel >= 8) return false;
    arma.nivel++;
    this._recalcular(arma);
    return true;
  }

  // Aplana la entrada base más los incrementos acumulados hasta el nivel
  // actual. Se hace al equipar y al subir de nivel, nunca en caliente.
  _recalcular(arma) {
    const s = arma.stats;
    for (const k in arma.def) {
      const v = arma.def[k];
      if (typeof v === 'number') s[k] = v;
    }
    const niveles = arma.def.niveles;
    if (!niveles) return;
    for (let i = 1; i < arma.nivel && i < niveles.length; i++) {
      const delta = niveles[i];
      for (const k in delta) s[k] = (s[k] || 0) + delta[k];
    }
    if (s.recarga !== undefined && s.recarga < 0.15) s.recarga = 0.15;
  }

  actualizar(dt, ctx) {
    for (let i = 0; i < this.equipadas.length; i++) {
      const arma = this.equipadas[i];

      // Golpes encadenados pendientes de la activación anterior.
      if (arma.golpesPendientes > 0) {
        arma.demoraGolpe -= dt;
        if (arma.demoraGolpe <= 0) {
          this.golpear(arma, ctx);
          arma.golpesPendientes--;
          arma.demoraGolpe = arma.def.demoraGolpe;
        }
      }

      arma.temporizador -= dt;
      if (arma.temporizador > 0) continue;

      const fn = COMPORTAMIENTOS[arma.def.comportamiento];
      if (!fn) {
        // Comportamiento aún no implementado (Fase 4). Se avisa UNA vez y se
        // deja el arma inerte, en vez de reventar la partida.
        if (!this._avisadas.has(arma.def.comportamiento)) {
          this._avisadas.add(arma.def.comportamiento);
          console.warn(`[armas] comportamiento sin implementar: ${arma.def.comportamiento}`);
        }
        arma.temporizador = 1;
        continue;
      }

      // Si el comportamiento no encuentra a quién pegar, se reintenta pronto en
      // vez de gastar la recarga entera: el arma no debe "perder" un ciclo por
      // haber disparado al vacío.
      arma.temporizador = fn(arma, this, ctx) ? arma.stats.recarga : 0.1;
    }
  }

  // Resuelve un tajo: daña a todo lo vivo dentro del cono y deja el efecto.
  golpear(arma, ctx) {
    const s = arma.stats;
    const j = ctx.jugador;
    // Dirección: hacia donde se mueve; si está parado, hacia donde mira.
    let ax = j.x - j.xPrev;
    let ay = j.y - j.yPrev;
    if (Math.abs(ax) < 0.0001 && Math.abs(ay) < 0.0001) {
      ax = j.mirandoDerecha ? 1 : -1;
      ay = 0;
    }
    const ang = Math.atan2(ay, ax);
    const semi = s.angulo * 0.5 * GRADOS;

    const n = enemigosEnRadio(ctx.enemigos, j.x, j.y, s.alcance, this._alcanzados);
    const items = ctx.enemigos.pool.items;
    for (let i = 0; i < n; i++) {
      const e = items[this._alcanzados[i]];
      const dx = e.x - j.x;
      const dy = e.y - j.y;
      // Diferencia angular normalizada a [-PI, PI]
      let d = Math.atan2(dy, dx) - ang;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) > semi) continue;

      const m = Math.hypot(dx, dy) || 1;
      ctx.enemigos.danyar(e, s.danyo, dx / m, dy / m, s.empuje);
    }

    this._anotarTajo(j.x, j.y - 6, ang, semi, s.alcance, arma.def.color);
    Particulas.estallido(j.x + Math.cos(ang) * s.alcance * 0.6,
                         j.y - 6 + Math.sin(ang) * s.alcance * 0.6,
                         3, 55, 0.18, 1, COLOR_CHISPA, 0.3, this._rng);
  }

  _anotarTajo(x, y, ang, semi, alcance, color) {
    // Buffer circular: el más viejo cede el sitio.
    const t = this.tajos[this.nTajos % MAX_TAJOS];
    this.nTajos++;
    t.x = x; t.y = y; t.ang = ang; t.semi = semi;
    t.alcance = alcance; t.vida = t.vidaMax = 0.16; t.color = color;
  }

  actualizarTajos(dt) {
    for (let i = 0; i < MAX_TAJOS; i++) {
      const t = this.tajos[i];
      if (t.vida > 0) t.vida -= dt;
    }
  }

  // El arco se dibuja por código, como el resto de efectos: un sector con el
  // borde encendido que se abre y se apaga.
  dibujarTajos(ctx) {
    let hay = false;
    for (let i = 0; i < MAX_TAJOS; i++) if (this.tajos[i].vida > 0) { hay = true; break; }
    if (!hay) return;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < MAX_TAJOS; i++) {
      const t = this.tajos[i];
      if (t.vida <= 0) continue;
      const k = t.vida / t.vidaMax;              // 1 al salir, 0 al apagarse
      const r = t.alcance * (0.75 + (1 - k) * 0.25);
      ctx.globalAlpha = k * 0.75;
      ctx.strokeStyle = t.color;
      ctx.lineWidth = 2 + k * 2;
      ctx.beginPath();
      ctx.arc(t.x, t.y, r, t.ang - t.semi, t.ang + t.semi);
      ctx.stroke();
    }
    ctx.restore();
  }

  vaciar() {
    for (let i = 0; i < MAX_TAJOS; i++) this.tajos[i].vida = 0;
    for (let i = 0; i < this.equipadas.length; i++) {
      this.equipadas[i].temporizador = 0;
      this.equipadas[i].golpesPendientes = 0;
    }
  }
}
