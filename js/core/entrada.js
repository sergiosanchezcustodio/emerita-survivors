// Teclado, gamepad y joystick virtual táctil, repartidos POR JUGADOR.
//
// Reparto: el teclado siempre maneja al jugador 1; el mando k maneja al jugador
// k. Jugando solo con mando, el mando 0 y el teclado mandan sobre el mismo
// personaje y no estorban entre sí, porque gana el que más desplace el stick.
// Es la regla más simple que funciona sin pantalla de asignación, y esa
// pantalla llega con los menús de la Fase 7.
//
// Las teclas globales (F3, pausa, depuración) NO son de nadie: se leen del
// teclado directamente, no del control de un jugador.

const ZONA_MUERTA = 0.18;     // radial, nunca por eje
const RADIO_STICK = 42;       // px de pantalla que equivalen a stick al máximo

const IZQUIERDA = ['KeyA', 'ArrowLeft'];
const DERECHA   = ['KeyD', 'ArrowRight'];
const ARRIBA    = ['KeyW', 'ArrowUp'];
const ABAJO     = ['KeyS', 'ArrowDown'];

// Cruceta en el mapeo estándar del navegador. NO son ejes, son botones.
const CRUZ_ARRIBA = 12, CRUZ_ABAJO = 13, CRUZ_IZQ = 14, CRUZ_DER = 15;

// Umbrales del stick cuando se usa como cruceta en los menús. Dos, no uno:
// hace falta histéresis o el temblor del stick en el límite dispara flancos sin
// parar. Ver Control.flancoEje.
const UMBRAL_MENU = 0.65;
const UMBRAL_SUELTA = 0.4;

// El vector de movimiento de un jugador y el flanco de sus botones. Uno por
// jugador, preasignados: no se crean ni se destruyen durante la partida.
export class Control {
  constructor(indice) {
    this.indice = indice;
    this.ejeX = 0;
    this.ejeY = 0;
    this.fuente = 'teclado';
    this.conectado = false;       // ¿tiene mando propio enchufado?
    this._botonesPrev = 0;
    this._flancoBotones = 0;
    this._ejeXFlanco = 0;
    this._ejeYFlanco = 0;
  }

  consumirBoton(boton) {
    const bit = 1 << boton;
    if (this._flancoBotones & bit) { this._flancoBotones &= ~bit; return true; }
    return false;
  }

  // ¿Está el botón pulsado AHORA MISMO? Es otra pregunta que `consumirBoton`,
  // que pregunta por el flanco —el instante en que se pulsó— y además lo gasta.
  //
  // Hace falta porque la intro se salta MANTENIENDO A, y un gesto que hay que
  // sostener no se puede leer de un flanco: el flanco dura un solo paso.
  // `_botonesPrev` es la instantánea que dejó `Entrada.actualizar` al final de
  // este mismo paso, así que es el estado de AHORA pese a llamarse "prev".
  botonMantenido(boton) {
    return (this._botonesPrev & (1 << boton)) !== 0;
  }

  // Flanco del STICK tratado como si fuera una cruceta.
  //
  // Hace falta porque en los menús el stick no servía: la cruceta son botones y
  // tiene flanco, pero el stick es un eje continuo, así que "moverlo a la
  // derecha" no es un evento, es un estado. Sin esto, el jugador que use stick
  // se queda mirando el menú sin poder cambiar de opción.
  //
  // El umbral de vuelta (0.4) es MENOR que el de ida (0.65) a propósito: con un
  // solo umbral, un stick temblando en el límite dispararía una ristra de
  // flancos. Es la misma histéresis de un termostato.
  flancoEje(horizontal) {
    const v = horizontal ? this.ejeX : this.ejeY;
    const prev = horizontal ? this._ejeXFlanco : this._ejeYFlanco;
    let signo = 0;
    if (v > UMBRAL_MENU) signo = 1;
    else if (v < -UMBRAL_MENU) signo = -1;
    else if (Math.abs(v) < UMBRAL_SUELTA) signo = 0;
    else signo = prev;                    // en tierra de nadie, no cambia

    if (horizontal) this._ejeXFlanco = signo; else this._ejeYFlanco = signo;
    return signo !== prev ? signo : 0;    // solo el instante del cruce
  }
}

export class Entrada {
  constructor(lienzo, maxJugadores) {
    this.controles = new Array(maxJugadores);
    for (let i = 0; i < maxJugadores; i++) this.controles[i] = new Control(i);

    this.hayGamepad = false;
    this.mandosConectados = 0;

    // Estado del joystick virtual (solo jugador 1: el táctil es de un móvil,
    // y en un móvil no hay cooperativo local).
    this.tactilActivo = false;
    this.tactilBaseX = 0;
    this.tactilBaseY = 0;
    this.tactilX = 0;
    this.tactilY = 0;
    this._punteroId = -1;

    this._teclas = new Set();
    this._flanco = new Set();      // pulsadas desde el último paso de lógica

    addEventListener('keydown', (e) => {
      if (e.repeat) { this._teclas.add(e.code); return; }
      this._teclas.add(e.code);
      this._flanco.add(e.code);
      // F3, F4, Tab y las flechas las reclama el navegador; aquí mandamos nosotros.
      // Tab sobre todo: sin esto, abrir la ficha de jugador mueve además el foco
      // fuera del lienzo y la siguiente tecla ya no llega al juego.
      if (e.code === 'F3' || e.code === 'F4' || e.code === 'Escape' || e.code === 'Tab' ||
          e.code.startsWith('Arrow')) {
        e.preventDefault();
      }
    });
    addEventListener('keyup', (e) => this._teclas.delete(e.code));
    addEventListener('blur', () => { this._teclas.clear(); this._flanco.clear(); });

    addEventListener('gamepadconnected', () => { this.hayGamepad = true; });
    addEventListener('gamepaddisconnected', () => {
      // No se apaga `hayGamepad` a la ligera: con varios mandos, desenchufar
      // uno no debe dejar de sondear a los demás.
      this.hayGamepad = this._contarMandos() > 0;
    });

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
    const lista = this._listaMandos();
    this.mandosConectados = 0;

    for (let i = 0; i < this.controles.length; i++) {
      const c = this.controles[i];
      let x = 0, y = 0, magMax = 0, fuente = 'teclado';

      // --- Teclado y táctil: solo el jugador 1 ----------------------------
      if (i === 0) {
        let tx = 0, ty = 0;
        if (this._algunaTecla(DERECHA))   tx += 1;
        if (this._algunaTecla(IZQUIERDA)) tx -= 1;
        if (this._algunaTecla(ABAJO))     ty += 1;
        if (this._algunaTecla(ARRIBA))    ty -= 1;
        if (tx !== 0 && ty !== 0) {
          const inv = Math.SQRT1_2;      // 1/raiz(2): nada de ir un 41% más rápido
          tx *= inv; ty *= inv;
        }
        magMax = Math.hypot(tx, ty);
        x = tx; y = ty;

        if (this.tactilActivo) {
          let dx = (this.tactilX - this.tactilBaseX) / RADIO_STICK;
          let dy = (this.tactilY - this.tactilBaseY) / RADIO_STICK;
          const m = Math.hypot(dx, dy);
          if (m > 1) { dx /= m; dy /= m; }
          if (m > magMax) { x = dx; y = dy; magMax = Math.min(m, 1); fuente = 'tactil'; }
        }
      }

      // --- Mando del jugador ---------------------------------------------
      const gp = lista ? lista[i] : null;
      c.conectado = !!(gp && gp.connected);
      let botones = 0;
      if (c.conectado) {
        this.mandosConectados++;

        let gx = gp.axes[0] || 0;
        let gy = gp.axes[1] || 0;
        const m = Math.hypot(gx, gy);
        if (m > ZONA_MUERTA) {
          // Reescalado desde el borde de la zona muerta: el primer milímetro
          // útil del stick vale 0, no 0.18, o el personaje arranca a tirones.
          const util = Math.min(1, (m - ZONA_MUERTA) / (1 - ZONA_MUERTA));
          gx = (gx / m) * util;
          gy = (gy / m) * util;
          // ACOTAR a 1, jamás normalizar a 1: normalizar mataría el control
          // analógico y el personaje iría siempre a velocidad máxima.
          if (util > magMax) { x = gx; y = gy; magMax = util; fuente = 'gamepad'; }
        }

        // Cruceta: digital, así que vale 1 a secas. No hay medias pulsaciones.
        const bs = gp.buttons;
        let cx = 0, cy = 0;
        if (bs.length > CRUZ_DER) {
          if (bs[CRUZ_ARRIBA] && bs[CRUZ_ARRIBA].pressed) cy -= 1;
          if (bs[CRUZ_ABAJO]  && bs[CRUZ_ABAJO].pressed)  cy += 1;
          if (bs[CRUZ_IZQ]    && bs[CRUZ_IZQ].pressed)    cx -= 1;
          if (bs[CRUZ_DER]    && bs[CRUZ_DER].pressed)    cx += 1;
        }
        if (cx !== 0 || cy !== 0) {
          if (cx !== 0 && cy !== 0) { const inv = Math.SQRT1_2; cx *= inv; cy *= inv; }
          if (magMax < 1) { x = cx; y = cy; magMax = 1; fuente = 'gamepad'; }
        }

        for (let b = 0; b < bs.length && b < 32; b++) {
          if (bs[b].pressed) botones |= (1 << b);
        }
      }

      c._flancoBotones = botones & ~c._botonesPrev;
      c._botonesPrev = botones;
      c.ejeX = x;
      c.ejeY = y;
      c.fuente = fuente;
    }

    if (this.mandosConectados > 0) this.hayGamepad = true;
  }

  // --- Teclas globales, no atribuidas a ningún jugador ---------------------
  // Consume el flanco: devuelve true una sola vez por pulsación. Acepta también
  // un botón de mando, que se busca en CUALQUIER control: la pausa la puede
  // pedir quien sea.
  consumirFlanco(codigo, boton = -1) {
    let pulsada = this._flanco.has(codigo);
    if (pulsada) this._flanco.delete(codigo);
    if (boton >= 0) {
      for (let i = 0; i < this.controles.length; i++) {
        if (this.controles[i].consumirBoton(boton)) pulsada = true;
      }
    }
    return pulsada;
  }

  limpiarFlanco() { this._flanco.clear(); }

  // "Atrás": B en CUALQUIER mando (botón 1 del mapeo estándar). Es el gesto
  // general para cerrar una pantalla, y a propósito solo CIERRA, nunca abre:
  // Start y Select ya abren cosas distintas según la ventana (pausa, ficha...)
  // y cada una tiene su propio botón para eso. B es el único que hace lo mismo
  // en todas partes, así que no debe además ponerse a abrir la que le toque a
  // cada sitio.
  consumirAtras() {
    for (let i = 0; i < this.controles.length; i++) {
      if (this.controles[i].consumirBoton(1)) return true;
    }
    return false;
  }

  // ¿Se ha pulsado ALGO en este paso? Teclado o cualquier botón de cualquier
  // mando. Lo usa la pantalla del cofre, que no pide una decisión sino un
  // "vale": obligar a buscar la tecla correcta para cerrar un aviso es fricción
  // por nada, y en cooperativo además nadie sabría a quién le toca pulsarla.
  algunFlanco() {
    if (this._flanco.size > 0) return true;
    for (let i = 0; i < this.controles.length; i++) {
      if (this.controles[i]._flancoBotones !== 0) return true;
    }
    return false;
  }

  // ¿Alguien mantiene pulsado ese botón, en CUALQUIER mando? Igual que la
  // pausa, saltar la intro no es de nadie en particular.
  botonMantenido(boton) {
    for (let i = 0; i < this.controles.length; i++) {
      if (this.controles[i].botonMantenido(boton)) return true;
    }
    return false;
  }

  _algunaTecla(lista) {
    for (let i = 0; i < lista.length; i++) {
      if (this._teclas.has(lista[i])) return true;
    }
    return false;
  }

  _listaMandos() {
    // navigator.getGamepads() construye una lista NUEVA en cada llamada, y esto
    // se llama una vez por paso de lógica: son 60 asignaciones por segundo
    // regaladas cuando se juega con teclado. El evento gamepadconnected ya dice
    // si hay mando, así que ni se pregunta hasta entonces.
    if (!this.hayGamepad || !navigator.getGamepads) return null;
    return navigator.getGamepads();
  }

  _contarMandos() {
    const lista = navigator.getGamepads ? navigator.getGamepads() : null;
    if (!lista) return 0;
    let n = 0;
    for (let i = 0; i < lista.length; i++) if (lista[i] && lista[i].connected) n++;
    return n;
  }
}
