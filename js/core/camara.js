import { ANCHO_LOGICO, ALTO_LOGICO } from './constantes.js';

// Cuánto se queda el jugador por dentro del borde al topar con la correa. Es
// medio sprite más un respiro: pegado al filo no se le vería entero.
const MARGEN_CORREA = 22;

// Seguimiento con suavizado exponencial. Guarda el estado anterior para que el
// render pueda interpolar: sin eso, la cámara va a 60 Hz y la imagen a 144 y se
// nota un temblor constante en el fondo.
export class Camara {
  constructor() {
    this.x = 0; this.y = 0;
    this.xPrev = 0; this.yPrev = 0;
    this.xVista = 0; this.yVista = 0;    // posición ya interpolada, para dibujar
    this.suavizado = 8;                  // mayor = más pegada al jugador
  }

  situar(x, y) {
    this.x = this.xPrev = this.xVista = x;
    this.y = this.yPrev = this.yVista = y;
  }

  seguir(objetivoX, objetivoY, dt) {
    this.xPrev = this.x;
    this.yPrev = this.y;
    // Independiente del dt: con timestep fijo da igual, pero así no se rompe
    // si algún día el paso cambia.
    const k = 1 - Math.exp(-this.suavizado * dt);
    this.x += (objetivoX - this.x) * k;
    this.y += (objetivoY - this.y) * k;
  }

  interpolar(alpha) {
    this.xVista = this.xPrev + (this.x - this.xPrev) * alpha;
    this.yVista = this.yPrev + (this.y - this.yPrev) * alpha;
  }

  // Sigue al CENTRO del grupo. Con un solo jugador es exactamente lo de antes.
  seguirGrupo(jugadores, dt) {
    let sx = 0, sy = 0, n = 0;
    for (let i = 0; i < jugadores.length; i++) {
      const j = jugadores[i];
      if (j.abatido) continue;      // un caído no arrastra la cámara
      sx += j.x; sy += j.y; n++;
    }
    if (n === 0) { this.xPrev = this.x; this.yPrev = this.y; return; }
    this.seguir(sx / n, sy / n, dt);
  }

  // Correa: nadie puede salirse de la pantalla.
  //
  // Es la consecuencia de diseño que impone el cooperativo local. El juego corre
  // a 480x270 con escalado ENTERO, que es lo que le da la nitidez; alejar la
  // cámara cuando el grupo se abre rompería esa rejilla de píxeles, y partir la
  // pantalla en cuatro dejaría viewports de 240x135, diminutos para este género.
  // Así que el grupo va junto y quien se queda atrás topa con el borde, como en
  // los beat'em ups cooperativos de toda la vida.
  //
  // Se sujeta la posición, no la velocidad: frenar por velocidad dejaría al
  // rezagado pegado al borde temblando contra el tope.
  sujetar(jugadores) {
    const izq = this.x - ANCHO_LOGICO / 2 + MARGEN_CORREA;
    const der = this.x + ANCHO_LOGICO / 2 - MARGEN_CORREA;
    const arr = this.y - ALTO_LOGICO / 2 + MARGEN_CORREA;
    const aba = this.y + ALTO_LOGICO / 2 - MARGEN_CORREA;
    for (let i = 0; i < jugadores.length; i++) {
      const j = jugadores[i];
      if (j.x < izq) j.x = izq; else if (j.x > der) j.x = der;
      if (j.y < arr) j.y = arr; else if (j.y > aba) j.y = aba;
    }
  }

  // Esquina superior izquierda del viewport en coordenadas de mundo.
  get izquierda() { return this.xVista - ANCHO_LOGICO / 2; }
  get arriba()    { return this.yVista - ALTO_LOGICO / 2; }
}
