// Teclado, gamepad y joystick virtual táctil unificados en un solo vector.

const ZONA_MUERTA = 0.18;     // radial, nunca por eje
const RADIO_STICK = 42;       // px de pantalla que equivalen a stick al máximo

const IZQUIERDA = ['KeyA', 'ArrowLeft'];
const DERECHA   = ['KeyD', 'ArrowRight'];
const ARRIBA    = ['KeyW', 'ArrowUp'];
const ABAJO     = ['KeyS', 'ArrowDown'];

export class Entrada {
  constructor(lienzo) {
    this.ejeX = 0;
    this.ejeY = 0;
    this.fuente = 'teclado';       // teclado | gamepad | tactil
    this.hayGamepad = false;

    // Estado del joystick virtual
    this.tactilActivo = false;
    this.tactilBaseX = 0;
    this.tactilBaseY = 0;
    this.tactilX = 0;
    this.tactilY = 0;
    this._punteroId = -1;

    this._teclas = new Set();
    this._flanco = new Set();      // pulsadas desde el último paso de lógica
    this._botonesPrev = 0;
    this._flancoBotones = 0;

    addEventListener('keydown', (e) => {
      if (e.repeat) { this._teclas.add(e.code); return; }
      this._teclas.add(e.code);
      this._flanco.add(e.code);
      // F3 y las flechas las reclama el navegador; aquí mandan nosotros.
      if (e.code === 'F3' || e.code === 'Escape' || e.code.startsWith('Arrow')) {
        e.preventDefault();
      }
    });
    addEventListener('keyup', (e) => this._teclas.delete(e.code));
    addEventListener('blur', () => { this._teclas.clear(); this._flanco.clear(); });

    addEventListener('gamepadconnected', () => { this.hayGamepad = true; });
    addEventListener('gamepaddisconnected', () => { this.hayGamepad = false; });

    this._instalarTactil(lienzo);
  }

  _instalarTactil(lienzo) {
    lienzo.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      // Solo la mitad izquierda: la derecha queda libre para futuros gestos.
      if (e.clientX > innerWidth / 2) return;
      this._punteroId = e.pointerId;
      this.tactilActivo = true;
      this.tactilBaseX = this.tactilX = e.clientX;
      this.tactilBaseY = this.tactilY = e.clientY;
      lienzo.setPointerCapture(e.pointerId);
    });

    lienzo.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this._punteroId) return;
      this.tactilX = e.clientX;
      this.tactilY = e.clientY;
    });

    const soltar = (e) => {
      if (e.pointerId !== this._punteroId) return;
      this._punteroId = -1;
      this.tactilActivo = false;
    };
    lienzo.addEventListener('pointerup', soltar);
    lienzo.addEventListener('pointercancel', soltar);
  }

  // Se llama una vez por PASO DE LÓGICA, no por frame: el gamepad se sondea,
  // no emite eventos, y su instantánea debe alinearse con el timestep fijo.
  actualizar() {
    let x = 0, y = 0, fuente = 'teclado';

    // --- Teclado: vector discreto, se normaliza la diagonal ----------------
    let tx = 0, ty = 0;
    if (this._algunaTecla(DERECHA))   tx += 1;
    if (this._algunaTecla(IZQUIERDA)) tx -= 1;
    if (this._algunaTecla(ABAJO))     ty += 1;
    if (this._algunaTecla(ARRIBA))    ty -= 1;
    if (tx !== 0 && ty !== 0) {
      const inv = Math.SQRT1_2;      // 1/raiz(2): nada de ir un 41% más rápido
      tx *= inv; ty *= inv;
    }
    let magMax = Math.hypot(tx, ty);
    x = tx; y = ty;

    // --- Táctil ------------------------------------------------------------
    if (this.tactilActivo) {
      let dx = (this.tactilX - this.tactilBaseX) / RADIO_STICK;
      let dy = (this.tactilY - this.tactilBaseY) / RADIO_STICK;
      const m = Math.hypot(dx, dy);
      if (m > 1) { dx /= m; dy /= m; }
      if (m > magMax) { x = dx; y = dy; magMax = Math.min(m, 1); fuente = 'tactil'; }
    }

    // --- Gamepad -----------------------------------------------------------
    const gp = this._primerGamepad();
    let botones = 0;
    if (gp) {
      let gx = gp.axes[0] || 0;
      let gy = gp.axes[1] || 0;
      const m = Math.hypot(gx, gy);
      if (m > ZONA_MUERTA) {
        // Reescalado desde el borde de la zona muerta: el primer milímetro útil
        // del stick vale 0, no 0.18, o el personaje arranca a tirones.
        const util = Math.min(1, (m - ZONA_MUERTA) / (1 - ZONA_MUERTA));
        gx = (gx / m) * util;
        gy = (gy / m) * util;
        // ACOTAR a 1, jamás normalizar a 1: normalizar mataría el control
        // analógico y el personaje iría siempre a velocidad máxima.
        if (util > magMax) { x = gx; y = gy; magMax = util; fuente = 'gamepad'; }
      }
      for (let i = 0; i < gp.buttons.length && i < 32; i++) {
        if (gp.buttons[i].pressed) botones |= (1 << i);
      }
    }
    this._flancoBotones = botones & ~this._botonesPrev;
    this._botonesPrev = botones;

    this.ejeX = x;
    this.ejeY = y;
    this.fuente = fuente;
  }

  // Consume el flanco: devuelve true una sola vez por pulsación.
  consumirFlanco(codigo, boton = -1) {
    let pulsada = this._flanco.has(codigo);
    if (pulsada) this._flanco.delete(codigo);
    if (boton >= 0 && (this._flancoBotones & (1 << boton))) pulsada = true;
    return pulsada;
  }

  limpiarFlanco() { this._flanco.clear(); }

  _algunaTecla(lista) {
    for (let i = 0; i < lista.length; i++) {
      if (this._teclas.has(lista[i])) return true;
    }
    return false;
  }

  _primerGamepad() {
    // navigator.getGamepads() construye una lista NUEVA en cada llamada, y esto
    // se llama una vez por paso de lógica: son 60 asignaciones por segundo
    // regaladas cuando se juega con teclado, justo la presión sobre el
    // recolector que el pool existe para evitar. El evento gamepadconnected ya
    // dice si hay mando, así que ni se pregunta hasta entonces.
    if (!this.hayGamepad) return null;
    const lista = navigator.getGamepads ? navigator.getGamepads() : null;
    if (!lista) return null;
    for (let i = 0; i < lista.length; i++) {
      // En Chrome el mando no aparece hasta que se pulsa un botón: es una
      // medida antihuella, no un fallo. Por eso la portada pide "pulsa A".
      if (lista[i] && lista[i].connected) { this.hayGamepad = true; return lista[i]; }
    }
    return null;
  }
}
