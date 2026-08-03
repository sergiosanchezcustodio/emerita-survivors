import { ANCHO_LOGICO, ALTO_LOGICO } from './constantes.js';

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

  // Esquina superior izquierda del viewport en coordenadas de mundo.
  get izquierda() { return this.xVista - ANCHO_LOGICO / 2; }
  get arriba()    { return this.yVista - ALTO_LOGICO / 2; }
}
