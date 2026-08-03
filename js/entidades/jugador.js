import { ESCALA_ARTE } from '../core/constantes.js';
import { Recursos } from '../core/recursos.js';

// --- Bombeo de zancada -------------------------------------------------------
//
// PENDIENTE (Fase 7, pulido de feedback): esto NO se lee como andar.
// El escalado horizontal de abajo es SIMÉTRICO respecto al eje del sprite, así
// que las dos piernas se abren y se cierran a la vez y el personaje alterna
// entre patizambo y estevado en vez de dar un paso. Un paso es antisimétrico:
// una pierna adelante mientras la otra va atrás. Además el escalado arrastra la
// cadera y ensancha la ropa.
//
// Dos salidas, ambas contenidas en este archivo:
//   a) Cizalla alternante (skewX) sobre la mitad inferior en vez de escalado:
//      las piernas pendulan como un bloque. Tres líneas y ya se lee.
//   b) Partir las piernas por la vertical y desplazar cada mitad en sentido
//      contrario, con un alzado leve de la que pisa. Es el paso real; cuesta
//      2 blits más, asumible porque solo lo hace el jugador.
//
// Se aplaza a propósito: sin enemigos en pantalla no hay contra qué juzgar la
// sensación de movimiento, y el empuje y el hitstop cambiarán la referencia.
//
// Lo que SÍ se ha quitado ya es la inclinación del cuerpo (ctx.rotate de ±0,045
// rad). Girar pixel art unos pocos grados obliga a remuestrear el sprite entero
// en cada frame y los bordes se ponen a hormiguear. Eso no era estilo, era ruido.
const CADERA   = 0.52;   // fracción del alto a la que empiezan las piernas
const FRANJAS  = 5;      // franjas en las que se corta la mitad inferior
const AMPLITUD = 0.22;   // cuánto se abre la zancada en el pico
const BOTE_PX  = 1.5;    // amplitud del bote, en píxeles FÍSICOS

// Dibuja el torso de una pieza y las piernas en franjas con ensanchado
// progresivo. Solo para el jugador: son 6 blits por entidad, asumible para uno
// pero no para las 800 del minuto 16, que se quedan con el bote simple.
//
// Trabaja en PÍXELES FÍSICOS ENTEROS y divide entre ESCALA_ARTE justo al
// dibujar: la transformación del contexto lo devuelve a enteros de dispositivo.
// Sin esto, cada franja cae en una fracción distinta cada frame y el vecino más
// próximo duplica columnas diferentes: el personaje vibra.
function dibujarConZancada(ctx, img, meta, cxF, cyF, hF, wF, zancada) {
  const EA = ESCALA_ARTE;
  const caderaSrc = Math.round(meta.h * CADERA);
  const caderaDstF = Math.round(hF * CADERA);

  ctx.drawImage(img, 0, 0, meta.w, caderaSrc,
    (cxF - (wF >> 1)) / EA, (cyF - hF) / EA, wF / EA, (caderaDstF + 1) / EA);

  const altoSrc = meta.h - caderaSrc;
  const altoDstF = hF - caderaDstF;
  for (let i = 0; i < FRANJAS; i++) {
    const t0 = i / FRANJAS;
    const t1 = (i + 1) / FRANJAS;
    const sy = caderaSrc + Math.round(altoSrc * t0);
    const sh = Math.round(altoSrc * (t1 - t0));
    const dyF = cyF - hF + caderaDstF + Math.round(altoDstF * t0);
    // +1 de solape: tapa la costura entre franjas sin dejar una línea de fondo.
    const dhF = Math.round(altoDstF * (t1 - t0)) + 1;

    // La deformación crece hacia los pies: en la cadera es nula, así que no
    // aparece un escalón contra el torso.
    const k = 1 + AMPLITUD * zancada * ((t0 + t1) * 0.5);
    const anchoF = Math.round(wF * k);
    ctx.drawImage(img, 0, sy, meta.w, sh,
      (cxF - (anchoF >> 1)) / EA, dyF / EA, anchoF / EA, dhF / EA);
  }
}

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
    this.faseAndar = 0;      // reloj del bob procedural
    this.faseRespirar = 0;
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
    if (this.andando) {
      // La cadencia del paso sigue a la velocidad real: al andar despacio con
      // el stick, el personaje da pasos más lentos.
      this.faseAndar += dt * 12 * mag;
      if (entrada.ejeX > 0.05) this.mirandoDerecha = true;
      else if (entrada.ejeX < -0.05) this.mirandoDerecha = false;
    } else {
      this.faseAndar *= 0.9;      // se apaga suave, sin corte seco
    }
    this.faseRespirar += dt * 2.2;
  }

  interpolar(alpha) {
    this.xVista = this.xPrev + (this.x - this.xPrev) * alpha;
    this.yVista = this.yPrev + (this.y - this.yPrev) * alpha;
  }

  // Un solo frame estático animado por código.
  //
  // El cuerpo lleva squash & stretch y las piernas un "bombeo de zancada": la
  // mitad inferior se ensancha y se estrecha en franjas, con la deformación
  // creciendo hacia los pies (ver el PENDIENTE de arriba: esto se rehace en la
  // Fase 7 porque no acaba de leerse como un paso).
  //
  // El bote vertical va al DOBLE de frecuencia que la zancada: el cuerpo sube y
  // baja una vez por cada pie que apoya, no una vez por ciclo completo.
  //
  // El volteo sale de la copia espejada precacheada, igual que en los enemigos.
  // Un ctx.scale(-1,1) haría lo mismo, pero obliga a un save/restore y a tocar la
  // matriz, y aquí ya no hace falta ninguna transformación.
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

    // El ancla es el centro de los pies: deformar desde ahí es lo que hace que
    // el personaje se aplaste contra el suelo y no flote. Todo en píxeles
    // físicos enteros, que es lo que quita el hormigueo.
    const cxF = Math.round(this.xVista * ESCALA_ARTE);
    const cyF = Math.round(this.yVista * ESCALA_ARTE);

    if (!this.andando) {
      // Quieto: solo respira, un píxel arriba y abajo. Un blit.
      const resp = Math.round(Math.sin(this.faseRespirar) * 0.6);
      const hF = meta.h + resp;
      const wF = meta.w - resp;
      ctx.drawImage(img,
        (cxF - (wF >> 1)) / ESCALA_ARTE, (cyF - hF) / ESCALA_ARTE,
        wF / ESCALA_ARTE, hF / ESCALA_ARTE);
      return;
    }

    const bote = Math.round(Math.sin(this.faseAndar * 2) * BOTE_PX);
    dibujarConZancada(ctx, img, meta, cxF, cyF,
      meta.h + bote, meta.w - bote, Math.sin(this.faseAndar));
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
