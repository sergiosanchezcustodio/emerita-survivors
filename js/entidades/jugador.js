import { ESCALA_ARTE } from '../core/constantes.js';
import { Recursos } from '../core/recursos.js';
import { PERSONAJES } from '../datos/personajes.js';
import { PASIVOS } from '../datos/pasivos.js';
import { Progresion, xpNecesaria, REROLLS } from '../sistemas/progresion.js';

// --- Animación ---------------------------------------------------------------
//
// El jugador usa hojas de fotogramas reales, generadas offline por
// herramientas/procesar-assets.ps1 a partir de la única pose de cada personaje.
// El atlas trae los clips con nombre: `quieto` (2 fotogramas) y `andar` (4).
//
// Esto sustituye al "bombeo de zancada" que deformaba el sprite en tiempo real
// cortándolo en franjas. Aquel apaño escalaba las dos piernas a la vez, o sea
// simétricamente, y un paso es justo lo contrario: una pierna sube mientras la
// otra apoya. Se veía patizambo, y encima reescalar en fracciones de píxel cada
// frame hacía hormiguear los bordes. Ahora es un drawImage y punto.
//
// Repliegue: si un personaje no trae clips (arte antiguo, o un placeholder), se
// dibuja el fotograma 0 y no pasa nada.
const CLIP_QUIETO  = 'quieto';
const CLIP_ANDAR   = 'andar';
const CLIP_LATERAL = 'andar_lateral';

// Estadísticas base de la sección 6 del plan.
const BASE = {
  vidaMaxima: 100,
  velocidad: 85,          // px lógicos por segundo
  armadura: 0,
  regeneracion: 0,
  radioRecogida: 40,
  radio: 10               // círculo de colisión
};

// Invulnerabilidad tras golpe. Es lo que convierte el daño de contacto en tics:
// estar metido en un enjambre son 2 impactos por segundo, no 60.
const INVULNERABILIDAD = 0.5;
const PARPADEO = 0.07;     // periodo del destello mientras dura

export class Jugador {
  constructor(idPersonaje = 'eric') {
    const def = PERSONAJES[idPersonaje] || PERSONAJES.eric;
    this.id = idPersonaje;
    this.def = def;
    this.personaje = def.sprite;
    this.arsenal = null;          // lo enchufa quien crea al jugador

    // --- Progresión ------------------------------------------------------
    this.nivel = 1;
    this.xp = 0;
    this.xpNecesaria = xpNecesaria(1);
    this.pasivos = {};            // id -> nivel
    this.rerolls = REROLLS;

    this.x = 0; this.y = 0;
    this.xPrev = 0; this.yPrev = 0;
    this.xVista = 0; this.yVista = 0;

    // Estadísticas derivadas. NUNCA se escriben a mano: salen de la base, los
    // modificadores del personaje y los pasivos, y las recalcula recalcularStats.
    this.vidaMaxima = 0;
    this.velocidad = 0;
    this.armadura = 0;
    this.regeneracion = 0;
    this.radioRecogida = 0;
    this.bonusDanyo = 0;
    this.reduccionRecarga = 0;
    this.bonusArea = 0;
    this.recalcularStats();
    this.vida = this.vidaMaxima;
    this.radio = BASE.radio;
    // Cuerpo físico. Los cuatro personajes comparten marco de 32x32 lógicos y
    // sus siluetas miden 12-16 de ancho, así que el radio de daño (10) ya cubre
    // la silueta y no hay que derivarlo del sprite como en los enemigos. Que sea
    // el mismo para los cuatro es justo lo que pedía el plan: una única caja.
    this.radioCuerpo = BASE.radio;

    this.invulnerable = 0;         // segundos restantes de i-frames
    this.abatido = false;
    this.inmortal = false;         // depuración: permite medir sin morir
    this.golpesRecibidos = 0;

    this.mirandoDerecha = true;
    this.andando = false;
    this.lateral = false;    // se mueve más en horizontal que en vertical
    this.magAndar = 0;       // 0..1, cuánto se inclina el stick

    this.clip = CLIP_QUIETO;
    this.frame = 0;
    this.relojAnim = 0;
  }

  // Recalcula todo desde cero: base del plan, modificadores del personaje y
  // pasivos. Desde cero y no incremental a propósito — sumar sobre lo ya sumado
  // acumula errores de redondeo y hace imposible quitar un pasivo si algún día
  // hiciera falta.
  //
  // 'suma' añade tal cual (armadura, regeneración). 'factor' es porcentual
  // acumulativo sobre el valor ya modificado por el personaje.
  recalcularStats() {
    const mods = this.def.mods;
    const vidaAnterior = this.vidaMaxima;

    this.vidaMaxima = BASE.vidaMaxima * (mods.vidaMaxima || 1);
    this.velocidad = BASE.velocidad * (mods.velocidad || 1);
    this.radioRecogida = BASE.radioRecogida * (mods.radioRecogida || 1);
    this.armadura = BASE.armadura;
    this.regeneracion = BASE.regeneracion;
    this.bonusDanyo = 0;
    this.reduccionRecarga = 0;
    this.bonusArea = 0;

    for (const id in this.pasivos) {
      const def = PASIVOS[id];
      if (!def) continue;
      const nivel = this.pasivos[id];
      if (def.tipo === 'suma') this[def.campo] += def.valor * nivel;
      else this[def.campo] *= (1 + def.valor * nivel);
    }

    // La recarga no puede llegar a cero por muchas clepsidras que se acumulen.
    if (this.reduccionRecarga > 0.7) this.reduccionRecarga = 0.7;

    // Al ampliar la vida máxima se conserva lo que faltaba, no el porcentaje:
    // si te quedaban 20 de 100, te quedan 20 de 120, no 24.
    if (vidaAnterior > 0 && this.vidaMaxima > vidaAnterior && this.vida !== undefined) {
      // el ánfora cura aparte, en progresion.js
    }
  }

  // Experiencia. Puede subir VARIOS niveles de golpe con una gema dorada, y cada
  // subida encola su propia elección.
  ganarXp(cantidad) {
    if (this.abatido) return;
    this.xp += cantidad;
    while (this.xp >= this.xpNecesaria) {
      this.xp -= this.xpNecesaria;
      this.nivel++;
      this.xpNecesaria = xpNecesaria(this.nivel);
      Progresion.encolar(this);
    }
  }

  // Reducción PLANA por armadura, nunca porcentual, pero con un mínimo de 1: si
  // la armadura pudiera anular el daño, un pasivo barato haría inmune al jugador
  // frente a las serpientes durante los 20 minutos.
  recibirDanyo(cantidad) {
    if (this.abatido || this.invulnerable > 0 || this.inmortal) return false;
    this.vida -= Math.max(1, cantidad - this.armadura);
    this.invulnerable = INVULNERABILIDAD;
    this.golpesRecibidos++;
    if (this.vida <= 0) {
      this.vida = 0;
      this.abatido = true;
    }
    return true;
  }

  reiniciar() {
    this.recalcularStats();
    this.vida = this.vidaMaxima;
    this.invulnerable = 0;
    this.abatido = false;
    this.golpesRecibidos = 0;
  }

  actualizar(dt, entrada) {
    this.xPrev = this.x;
    this.yPrev = this.y;

    if (this.invulnerable > 0) {
      this.invulnerable -= dt;
      if (this.invulnerable < 0) this.invulnerable = 0;
    }
    if (this.abatido) { this.andando = false; return; }

    // Regeneración de la corona de laurel. Goteo continuo, no por tics: a 0.2/s
    // un tic entero cada segundo se notaría como un parpadeo en la barra.
    if (this.regeneracion > 0 && this.vida < this.vidaMaxima) {
      this.vida = Math.min(this.vidaMaxima, this.vida + this.regeneracion * dt);
    }

    const vx = entrada.ejeX * this.velocidad;
    const vy = entrada.ejeY * this.velocidad;
    this.x += vx * dt;
    this.y += vy * dt;

    const mag = Math.hypot(entrada.ejeX, entrada.ejeY);
    this.andando = mag > 0.02;
    this.magAndar = Math.min(1, mag);
    if (this.andando) {
      // Manda el eje dominante. El sprite está dibujado de frente, así que
      // moverse en horizontal es justo lo que peor se lee: hay un clip aparte
      // con el cuerpo escorado hacia donde va.
      this.lateral = Math.abs(entrada.ejeX) > Math.abs(entrada.ejeY);
      if (entrada.ejeX > 0.05) this.mirandoDerecha = true;
      else if (entrada.ejeX < -0.05) this.mirandoDerecha = false;
    }
    this._animar(dt);
  }

  // Avanza el clip que toca. La cadencia del paso sigue al stick: andando
  // despacio, los pasos salen más lentos, que es lo que espera la mano.
  _animar(dt) {
    const meta = Recursos.meta(this.personaje);
    const clips = meta && meta.clips;
    if (!clips) return;

    let nombre = CLIP_QUIETO;
    if (this.andando) {
      nombre = this.lateral && clips[CLIP_LATERAL] ? CLIP_LATERAL : CLIP_ANDAR;
    }
    if (nombre !== this.clip) {
      // Al cambiar de frontal a lateral NO se reinicia el fotograma: los dos
      // ciclos tienen la misma longitud y la misma fase, así que conservarlo
      // hace que girar en marcha no dé un tirón en el paso.
      const mismoCiclo = this.clip !== CLIP_QUIETO && nombre !== CLIP_QUIETO;
      this.clip = nombre;
      if (!mismoCiclo) { this.frame = 0; this.relojAnim = 0; }
    }
    const clip = clips[nombre];
    if (!clip || clip.n <= 1) { this.frame = 0; return; }

    const fps = this.andando ? clip.fps * this.magAndar : clip.fps;
    if (fps <= 0) return;
    const paso = 1 / fps;
    this.relojAnim += dt;
    while (this.relojAnim >= paso) {
      this.relojAnim -= paso;
      this.frame = (this.frame + 1) % clip.n;
    }
  }

  interpolar(alpha) {
    this.xVista = this.xPrev + (this.x - this.xPrev) * alpha;
    this.yVista = this.yPrev + (this.y - this.yPrev) * alpha;
  }

  // Un drawImage y nada más: el fotograma que toca de la hoja.
  //
  // El volteo sale de la copia espejada precacheada, igual que en los enemigos,
  // y esa copia está volteada fotograma a fotograma para que la animación no
  // corra del revés al mirar a la izquierda.
  //
  // El ancla es el centro de los pies. Todo se cuadra a píxel FÍSICO entero:
  // con el suavizado apagado, un destino fraccionario hace que el vecino más
  // próximo elija filas distintas cada frame y el sprite hierva.
  dibujar(ctx) {
    // DOS HOJAS POR PERSONAJE SI EL ATLAS LAS TRAE: `<id>` mira a la derecha y
    // `<id>Izq` a la izquierda.
    //
    // Es mejor que espejar por código en cuanto el arte NO es simétrico: un
    // arma colgada de una cadera, la raya del pelo, una cicatriz. El espejo se
    // las cambia de lado cada vez que giras, y eso se nota más de lo que
    // parece porque girar es lo que más se hace en este juego.
    //
    // Si no hay hoja izquierda se sigue usando la copia espejada precacheada,
    // así que el arte antiguo y los placeholders siguen funcionando sin tocar
    // nada. Las dos hojas deben declarar los MISMOS clips: el reloj de
    // animación es uno solo y no se reinicia al girar.
    let meta = Recursos.meta(this.personaje);
    let img;
    if (this.mirandoDerecha) {
      img = Recursos.imagen(this.personaje);
    } else {
      const idIzq = this.personaje + 'Izq';
      const metaIzq = Recursos.meta(idIzq);
      if (metaIzq) { meta = metaIzq; img = Recursos.imagen(idIzq); }
      else img = Recursos.espejo(this.personaje);
    }
    if (!meta || !img) return;

    // Parpadeo de los i-frames. Se salta el sprite, no la barra de vida: durante
    // medio segundo hay que poder seguir leyendo cuánta queda.
    if (this.invulnerable > 0 &&
        (((this.invulnerable / PARPADEO) | 0) & 1) === 1) return;

    const clip = meta.clips && meta.clips[this.clip];
    const indice = clip ? clip.desde + this.frame : 0;

    const cxF = Math.round(this.xVista * ESCALA_ARTE);
    const cyF = Math.round(this.yVista * ESCALA_ARTE);

    ctx.drawImage(img,
      indice * meta.w, 0, meta.w, meta.h,
      (cxF - (meta.w >> 1)) / ESCALA_ARTE, (cyF - meta.h) / ESCALA_ARTE,
      meta.w / ESCALA_ARTE, meta.h / ESCALA_ARTE);
  }


}
