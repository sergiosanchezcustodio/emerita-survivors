import { ESCALA_ARTE } from '../core/constantes.js';
import { Recursos } from '../core/recursos.js';

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
  constructor(personaje = 'eric') {
    this.personaje = personaje;
    this.x = 0; this.y = 0;
    this.xPrev = 0; this.yPrev = 0;
    this.xVista = 0; this.yVista = 0;

    this.vida = BASE.vidaMaxima;
    this.vidaMaxima = BASE.vidaMaxima;
    this.velocidad = BASE.velocidad;
    this.armadura = BASE.armadura;
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
    const meta = Recursos.meta(this.personaje);
    const img = this.mirandoDerecha
      ? Recursos.imagen(this.personaje)
      : Recursos.espejo(this.personaje);
    if (!meta || !img) return;

    this._barraVida(ctx);

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

  // Barra de vida flotante bajo el jugador (sección 14). Versión mínima: la HUD
  // completa llega en la Fase 7, pero sin esto el daño por contacto no se ve.
  // Va en unidades lógicas, como todo lo que se dibuja dentro de la cámara.
  _barraVida(ctx) {
    if (this.vida >= this.vidaMaxima && !this.abatido) return;   // llena: no estorba
    const EA = ESCALA_ARTE;
    const wF = 44, hF = 5;                       // píxeles físicos
    const xF = Math.round(this.xVista * EA) - (wF >> 1);
    const yF = Math.round(this.yVista * EA) + 6;
    const frac = this.vida / this.vidaMaxima;

    ctx.fillStyle = 'rgba(12,8,10,.75)';
    ctx.fillRect((xF - 1) / EA, (yF - 1) / EA, (wF + 2) / EA, (hF + 2) / EA);
    ctx.fillStyle = frac > 0.5 ? '#8fbf5a' : (frac > 0.25 ? '#d8a13c' : '#c0453f');
    ctx.fillRect(xF / EA, yF / EA, Math.round(wF * frac) / EA, hF / EA);
  }
}
