import { DT, MAX_PASOS } from './constantes.js';

// Timestep fijo con acumulador: la lógica corre a 60 Hz exactos pase lo que
// pase, y el render va desacoplado interpolando entre el estado anterior y el
// actual. Sin esto, el balance depende de los fps del jugador.
export class Bucle {
  constructor(actualizar, dibujar) {
    this.actualizar = actualizar;
    this.dibujar = dibujar;

    this.corriendo = false;
    this.acumulador = 0;
    this.ultimo = 0;

    // Métricas para el overlay F3
    this.fps = 0;
    this.msUpdate = 0;
    this.msRender = 0;
    this.pasosUltimoFrame = 0;

    this._frames = 0;
    this._ventana = 0;

    // Un único enlace, creado una vez: nada de closures por frame.
    this._tick = this._tick.bind(this);
  }

  arrancar() {
    if (this.corriendo) return;
    this.corriendo = true;
    this.ultimo = performance.now();
    this.acumulador = 0;
    requestAnimationFrame(this._tick);
  }

  parar() {
    this.corriendo = false;
  }

  _tick(ahora) {
    if (!this.corriendo) return;
    requestAnimationFrame(this._tick);

    let transcurrido = (ahora - this.ultimo) / 1000;
    this.ultimo = ahora;

    // Un cambio de pestaña puede devolver saltos enormes. Se recorta antes de
    // acumular para no encadenar cien pasos de golpe al volver.
    if (transcurrido > 0.25) transcurrido = 0.25;
    this.acumulador += transcurrido;

    const t0 = performance.now();
    let pasos = 0;
    while (this.acumulador >= DT && pasos < MAX_PASOS) {
      this.actualizar(DT);
      this.acumulador -= DT;
      pasos++;
    }
    // Si se agotó el tope, se descarta el sobrante: mejor ir lento que entrar
    // en la espiral de la muerte intentando recuperar tiempo imposible.
    if (pasos === MAX_PASOS) this.acumulador = 0;
    this.pasosUltimoFrame = pasos;
    this.msUpdate = performance.now() - t0;

    const t1 = performance.now();
    this.dibujar(this.acumulador / DT);   // alpha de interpolación
    this.msRender = performance.now() - t1;

    this._frames++;
    this._ventana += transcurrido;
    if (this._ventana >= 0.5) {
      this.fps = this._frames / this._ventana;
      this._frames = 0;
      this._ventana = 0;
    }
  }
}
