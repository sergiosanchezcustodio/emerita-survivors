import { Pool } from '../core/pool.js';
import { Particulas, COLOR_CHISPA } from '../sistemas/particulas.js';

// DISPAROS ENEMIGOS. Los sueltan los enemigos que llevan `ataque` en su ficha
// (medusa y mantícora, de momento): los poderosos, nunca la masa.
//
// POR QUÉ EXISTEN. Hasta ahora todo el bestiario mataba por contacto, así que la
// única pregunta que hacía el juego era "cuánta gente tengo encima" y la única
// respuesta era moverse. Con enemigos que disparan aparecen dos preguntas más:
// dónde está el que dispara, y qué hago con lo que ya viene de camino.
//
// SE PUEDEN DESTRUIR, y eso es la mitad de la idea. Cualquier arma que los toque
// —un proyectil, un charco, un tajo de melé, un orbital— los rompe. Así el
// jugador no está obligado a esquivar: puede plantarse y limpiar el aire, que es
// una decisión distinta y a veces mejor.
//
// Pool propio y no el de los proyectiles del jugador: van en sentido contrario,
// chocan contra cosas distintas y se dibujan distinto. Meterlos en el mismo pool
// obligaría a preguntar de quién es cada uno en todos los bucles calientes.

// Cuánto vive un disparo si no toca nada. Es un seguro: el culling normal es por
// distancia a la cámara, y un disparo lento podría quedarse dando vueltas.
const VIDA_MAXIMA = 6;

// A cuánto de la cámara se recicla. Generoso, porque un disparo que sale de
// pantalla y vuelve sería peor que uno que desaparece.
const CULL = 700;

function crearDisparo() {
  return {
    x: 0, y: 0, xPrev: 0, yPrev: 0,
    vx: 0, vy: 0,
    danyo: 0, radio: 0, vida: 0, restante: 0,
    // Sismo: segundos de aviso antes de estallar. 0 = proyectil normal.
    aviso: 0, sismo: false,
    // Charco (Fase 6, los conos de fuego de Cerbero): igual que el sismo
    // avisa y luego se activa, pero en vez de reventar una vez se queda
    // dañando por tics durante `duracion`. Es la versión "ataca al jugador"
    // del modo 'zona' de sistemas/zonaDanyo.js, que solo daña enemigos.
    charco: false, duracion: 0, intervalo: 0, relojTic: 0,
    color: '#ffffff', fase: 0
  };
}

export class Disparos {
  constructor(capacidad, rng) {
    this.pool = new Pool(crearDisparo, capacidad);
    this._rng = rng;
    this.destruidos = 0;      // por armas del jugador
    this.impactos = 0;        // los que han llegado a dar
  }

  get activos() { return this.pool.activos; }

  // `def` es el bloque `ataque` de datos/enemigos.js.
  lanzar(x, y, dirX, dirY, def) {
    const d = this.pool.obtener();
    if (!d) return null;
    d.x = d.xPrev = x;
    d.y = d.yPrev = y;
    d.vx = dirX * def.velocidad;
    d.vy = dirY * def.velocidad;
    d.danyo = def.danyo;
    d.radio = def.radio;
    d.vida = def.vida || 1;
    d.restante = VIDA_MAXIMA;
    d.color = def.color;
    d.aviso = 0;
    d.sismo = false;
    d.charco = false;           // por si este hueco del pool venía de un charco
    d.fase = this._rng() * Math.PI * 2;
    return d;
  }

  // SISMO: un círculo marcado en el suelo que revienta tras su aviso. No se
  // mueve, no se puede destruir y hace daño UNA vez, a todo el que esté dentro
  // cuando estalla.
  //
  // Vive en el pool de disparos y no en el de zonas por un motivo práctico: las
  // zonas son del jugador y dañan enemigos; esto es al revés. Compartir el pool
  // que ya sabe golpear al jugador ahorra un sistema entero.
  sismo(x, y, def) {
    const d = this.pool.obtener();
    if (!d) return null;
    d.x = d.xPrev = x;
    d.y = d.yPrev = y;
    d.vx = 0; d.vy = 0;
    d.danyo = def.danyo;
    d.radio = def.radio;
    d.vida = 9999;              // indestructible: se esquiva, no se limpia
    d.restante = def.aviso;
    d.aviso = def.aviso;
    d.sismo = true;
    d.charco = false;           // por si este hueco del pool venía de un charco
    d.color = def.color;
    d.fase = 0;
    return d;
  }

  // CHARCO: aviso y luego zona activa que daña por tics durante `duracion`, sin
  // moverse. Es lo que dejan los conos de fuego de Cerbero (Fase 6, datos/jefes.js).
  // Comparte pool con el proyectil y el sismo porque las tres cosas son "un
  // enemigo hace daño al jugador desde un punto del suelo", y ya sabe dibujarse,
  // reciclarse y quedar fuera del alcance de las armas del jugador.
  charco(x, y, def) {
    const d = this.pool.obtener();
    if (!d) return null;
    d.x = d.xPrev = x;
    d.y = d.yPrev = y;
    d.vx = 0; d.vy = 0;
    d.danyo = def.danyo;
    d.radio = def.radio;
    d.vida = 9999;              // indestructible, como el sismo: es terreno, no un proyectil
    d.restante = def.aviso;
    d.aviso = def.aviso;
    d.duracion = def.duracion;
    d.intervalo = def.intervalo;
    d.relojTic = 0;             // el primer tic entra en cuanto se activa
    d.charco = true;
    d.sismo = false;
    d.color = def.color;
    d.fase = 0;
    return d;
  }

  // Mueve, comprueba impacto contra jugadores y recicla lo que caduca o se aleja.
  actualizar(dt, jugadores, camara) {
    const items = this.pool.items;
    let k = 0;
    while (k < this.pool.activos) {
      const d = items[k];
      d.xPrev = d.x;
      d.yPrev = d.y;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.restante -= dt;
      d.fase += dt * 9;

      let fuera = d.restante <= 0 ||
                  Math.abs(d.x - camara.x) > CULL || Math.abs(d.y - camara.y) > CULL;

      // El sismo no golpea al tocarte: golpea CUANDO REVIENTA, y a todo el que
      // siga dentro del círculo. Salirse a tiempo es la única defensa, y por eso
      // el aviso se dibuja bien grande.
      if (d.sismo) {
        if (d.restante <= 0) {
          for (let i = 0; i < jugadores.length; i++) {
            const j = jugadores[i];
            if (j.abatido) continue;
            const dx = j.x - d.x, dy = j.y - d.y;
            if (dx * dx + dy * dy < d.radio * d.radio) {
              // El sismo empuja hacia AFUERA desde su centro: es el suelo
              // reventando bajo los pies, y lo que sale despedido sale en la
              // dirección en la que estabas respecto al reventón. A quien pille
              // justo en el centro le sale redondo, que es lo que toca.
              j.recibirDanyo(d.danyo, dx, dy);
              this.impactos++;
            }
          }
          this._reventar(d);
          this.pool.liberarEn(k);
          continue;
        }
        k++;
        continue;
      }

      // CHARCO: mismo aviso que el sismo, pero al activarse no revienta una vez
      // y se queda: daña por tics durante `duracion`, que es su propio
      // cronómetro de caducidad (el `restante` de arriba solo cubre el aviso).
      if (d.charco) {
        if (d.restante > 0) { k++; continue; }   // sigue avisando
        d.duracion -= dt;
        d.relojTic -= dt;
        if (d.relojTic <= 0) {
          d.relojTic = d.intervalo;
          for (let i = 0; i < jugadores.length; i++) {
            const j = jugadores[i];
            if (j.abatido) continue;
            const dx = j.x - d.x, dy = j.y - d.y;
            if (dx * dx + dy * dy < d.radio * d.radio) {
              // Como el sismo: hacia afuera desde el centro del charco.
              j.recibirDanyo(d.danyo, dx, dy);
              this.impactos++;
            }
          }
        }
        if (d.duracion <= 0) { this.pool.liberarEn(k); continue; }
        k++;
        continue;
      }

      if (!fuera) {
        for (let i = 0; i < jugadores.length; i++) {
          const j = jugadores[i];
          if (j.abatido) continue;
          const dx = j.x - d.x;
          const dy = j.y - d.y;
          const r = d.radio + j.radio;
          if (dx * dx + dy * dy < r * r) {
            // El proyectil sí trae dirección de serie: la suya. La sangre sale
            // en la línea que traía el disparo, que es lo que dice de dónde te
            // están tirando cuando no has visto salir el tiro.
            j.recibirDanyo(d.danyo, d.vx, d.vy);
            this.impactos++;
            this._reventar(d);
            fuera = true;
            break;
          }
        }
      }

      if (fuera) this.pool.liberarEn(k);      // sin avanzar k
      else k++;
    }
  }

  // --- Destrucción por las armas del jugador -------------------------------
  //
  // Un solo barrido central en vez de meter la comprobación dentro de cada
  // comportamiento de arma. Son doce comportamientos y crecerán; con la
  // comprobación repartida, cada arma nueva tendría que acordarse de limpiar el
  // aire y la mitad se olvidaría.
  //
  // Se mira contra las tres familias que cubren el catálogo entero:
  //   - proyectiles del jugador (incluidos rayos y virotes)
  //   - zonas activas: charcos, auras, ondas y explosiones
  //   - tajos de melé recientes
  //
  // El coste es el producto de dos números pequeños —rara vez pasan de veinte
  // disparos y unas decenas de proyectiles— y solo se paga cuando hay disparos
  // en el aire, que es cuando hay medusas o mantícoras vivas.
  barrer(proyectiles, zonas, arsenales, jugadores) {
    if (this.pool.activos === 0) return;
    const items = this.pool.items;

    let k = 0;
    while (k < this.pool.activos) {
      const d = items[k];
      if (d.sismo || d.charco) { k++; continue; }   // terreno: no se destruye, se esquiva
      let tocado = false;

      // Proyectiles del jugador
      const pi = proyectiles.pool.items;
      for (let q = 0; q < proyectiles.pool.activos && !tocado; q++) {
        const p = pi[q];
        const dx = p.x - d.x, dy = p.y - d.y;
        const r = p.radio + d.radio;
        if (dx * dx + dy * dy < r * r) tocado = true;
      }

      // Zonas: charcos, auras, ondas, explosiones. `radioActual` es el que crece
      // en las ondas; las zonas fijas no lo mueven y vale igual.
      if (!tocado) {
        const zi = zonas.pool.items;
        for (let q = 0; q < zonas.pool.activos && !tocado; q++) {
          const z = zi[q];
          const dx = z.x - d.x, dy = z.y - d.y;
          const r = (z.radioActual || z.radio) + d.radio;
          if (dx * dx + dy * dy < r * r) tocado = true;
        }
      }

      // ORBITALES: escudos, satélites, discos y sierras. Se les olvidaba, y era
      // el fallo más visible de los cuatro: un escudo que gira a tu alrededor es
      // justo lo que uno espera que pare un proyectil, y las púas de la medusa
      // le atravesaban como si no estuviera.
      //
      // Hay que recalcular dónde está cada escudo porque el arsenal no guarda su
      // posición: la deriva del ángulo y el radio bastan, son los mismos dos
      // números con los que se dibujan.
      if (!tocado) {
        for (let a = 0; a < arsenales.length && !tocado; a++) {
          const j = jugadores[a];
          if (!j) continue;
          const eq = arsenales[a].equipadas;
          for (let w = 0; w < eq.length && !tocado; w++) {
            const arma = eq[w];
            if (!arma.orbitalActivo) continue;
            const s = arma.stats;
            for (let e = 0; e < s.escudos && !tocado; e++) {
              const ang = arma.anguloOrbital + (e / s.escudos) * Math.PI * 2;
              const ox = j.x + Math.cos(ang) * s.radioOrbita;
              const oy = j.y - 6 + Math.sin(ang) * s.radioOrbita;
              const dx = ox - d.x, dy = oy - d.y;
              const r = s.radioEscudo + d.radio;
              if (dx * dx + dy * dy < r * r) tocado = true;
            }
          }
        }
      }

      // Tajos de melé. El arsenal guarda los últimos con su centro y alcance;
      // se aprovechan tal cual en vez de recalcular el arco.
      if (!tocado) {
        for (let a = 0; a < arsenales.length && !tocado; a++) {
          const tajos = arsenales[a].tajos;
          for (let q = 0; q < tajos.length && !tocado; q++) {
            const t = tajos[q];
            if (t.vida <= 0) continue;
            const dx = t.x - d.x, dy = t.y - d.y;
            const r = t.alcance + d.radio;
            if (dx * dx + dy * dy < r * r) tocado = true;
          }
        }
      }

      // Rayos: son segmentos, así que se mide la distancia del disparo al
      // segmento y no a su centro. Un haz que cruza media pantalla tiene que
      // limpiar todo lo que hay en su camino, no solo lo que pase por el medio.
      if (!tocado) {
        for (let a = 0; a < arsenales.length && !tocado; a++) {
          const rayos = arsenales[a].rayos;
          for (let q = 0; q < rayos.length && !tocado; q++) {
            const r = rayos[q];
            if (r.vida <= 0) continue;
            const ex = Math.cos(r.ang) * r.largo;
            const ey = Math.sin(r.ang) * r.largo;
            const px = d.x - r.x, py = d.y - r.y;
            const largo2 = ex * ex + ey * ey;
            let t = largo2 > 0 ? (px * ex + py * ey) / largo2 : 0;
            if (t < 0) t = 0; else if (t > 1) t = 1;
            const cx = px - ex * t, cy = py - ey * t;
            const alcance = r.grosor * 0.5 + d.radio;
            if (cx * cx + cy * cy < alcance * alcance) tocado = true;
          }
        }
      }

      if (tocado) {
        d.vida--;
        if (d.vida <= 0) {
          this.destruidos++;
          this._reventar(d);
          this.pool.liberarEn(k);            // sin avanzar k
          continue;
        }
      }
      k++;
    }
  }

  _reventar(d) {
    if (Particulas.saturado()) return;
    Particulas.estallido(d.x, d.y, 4, 60, 0.25, 1.5, COLOR_CHISPA, 0.8, this._rng);
  }

  vaciar() { this.pool.vaciar(); }

  // Bola con halo y núcleo claro, latiendo. Se dibuja POR ENCIMA de todo lo
  // demás del mundo: un disparo que viene tiene que verse aunque cruce por
  // detrás de un cíclope, porque la decisión de esquivarlo o reventarlo se toma
  // en menos de un segundo.
  dibujar(ctx, alpha) {
    const items = this.pool.items;
    const n = this.pool.activos;
    if (n === 0) return;

    ctx.save();
    for (let k = 0; k < n; k++) {
      const d = items[k];
      const x = d.xPrev + (d.x - d.xPrev) * alpha;
      const y = d.yPrev + (d.y - d.yPrev) * alpha;
      if (d.sismo) {
        // Círculo de aviso que se va llenando. El anillo exterior marca DÓNDE y
        // el relleno marca CUÁNTO FALTA: las dos cosas a la vez, porque saber
        // que viene sin saber cuándo no sirve para decidir si da tiempo a salir.
        const prog = 1 - d.restante / d.aviso;
        ctx.globalAlpha = 0.22 + 0.2 * prog;
        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.arc(x, y, d.radio * prog, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = d.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, d.radio, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        continue;
      }

      if (d.charco) {
        if (d.restante > 0) {
          // Mismo aviso que el sismo: anillo fijo, relleno que crece con lo
          // que queda por venir.
          const prog = 1 - d.restante / d.aviso;
          ctx.globalAlpha = 0.22 + 0.2 * prog;
          ctx.fillStyle = d.color;
          ctx.beginPath();
          ctx.arc(x, y, d.radio * prog, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 0.85;
          ctx.strokeStyle = d.color;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(x, y, d.radio, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          // Activo: relleno caliente que titila mientras dura. Sin anillo de
          // aviso porque ya no hay nada que anunciar, el peligro ES el charco.
          const late = 1 + Math.sin(d.fase) * 0.15;
          ctx.globalAlpha = 0.32;
          ctx.fillStyle = d.color;
          ctx.beginPath();
          ctx.arc(x, y, d.radio * late, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 0.7;
          ctx.strokeStyle = d.color;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(x, y, d.radio, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        continue;
      }

      const late = 1 + Math.sin(d.fase) * 0.12;

      // ESTELA HACIA ATRÁS. Un disco no dice a dónde va, y saber a dónde va un
      // proyectil enemigo es media esquiva: con la pantalla llena, para cuando
      // deduces el rumbo mirándolo dos frames ya te ha dado. La cola apunta de
      // dónde viene, así que la línea de peligro se lee en un vistazo.
      const v = Math.hypot(d.vx, d.vy);
      if (v > 1) {
        const ux = d.vx / v, uy = d.vy / v;
        const largo = d.radio * 4.5;
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = d.color;
        ctx.lineCap = 'round';
        ctx.lineWidth = d.radio * 1.1;
        ctx.beginPath();
        ctx.moveTo(x - ux * largo, y - uy * largo);
        ctx.lineTo(x, y);
        ctx.stroke();
      }

      ctx.globalAlpha = 0.30;
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(x, y, d.radio * 2.1 * late, 0, Math.PI * 2);
      ctx.fill();

      // FILO OSCURO. Es lo que impide que un proyectil enemigo se confunda con
      // los efectos del jugador, que se dibujan sumando luz: sobre una pantalla
      // llena de destellos claros, lo que tiene contorno negro es lo que te
      // puede matar.
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(x, y, d.radio * late + 1.2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(14,8,10,.85)';
      ctx.fill();

      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(x, y, d.radio * late, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x - d.radio * 0.25, y - d.radio * 0.25, d.radio * 0.42, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
