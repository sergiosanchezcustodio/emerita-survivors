import { ESCALA_ARTE, TILE } from './constantes.js';
import { crearRng } from './rng.js';

// Carga del atlas con sustitución automática. El juego debe ser 100% jugable
// sin un solo PNG: si falta el atlas o falla una imagen, se genera un
// placeholder con la silueta correcta y la partida sigue. Poner el arte real
// es dejar los archivos en assets/ sin tocar una línea de código.

// Repliegue mínimo por si ni siquiera hay atlas.json. Tamaños en píxeles
// FÍSICOS, igual que en el atlas real.
const ATLAS_REPLIEGUE = {
  escalaArte: ESCALA_ARTE,
  entidades: {
    eric:  { w: 64, h: 64, anclaX: 32, anclaY: 64, frames: 1 },
    lucy:  { w: 64, h: 64, anclaX: 32, anclaY: 64, frames: 1 },
    sara:  { w: 64, h: 64, anclaX: 32, anclaY: 64, frames: 1 },
    vicky: { w: 64, h: 64, anclaX: 32, anclaY: 64, frames: 1 }
  }
};

const COLORES_PLACEHOLDER = {
  eric: '#4b8fd6', lucy: '#d64b8f', sara: '#d6c14b', vicky: '#4bd6a1'
};

export const Recursos = {
  atlas: null,
  imagenes: new Map(),      // id -> HTMLImageElement | HTMLCanvasElement
  espejos: new Map(),       // id -> canvas volteado en horizontal
  tintes: new Map(),        // id -> canvas blanqueado (destello de impacto)
  tintesEspejo: new Map(),  // id -> el mismo, volteado
  tilesSuelo: [],           // canvas de 64x64 físicos
  sustituidos: [],          // ids que acabaron con placeholder
  paleta: null,

  async cargar(nivel) {
    this.paleta = nivel.paleta;

    try {
      const resp = await fetch('assets/atlas.json');
      if (!resp.ok) throw new Error(resp.status);
      this.atlas = await resp.json();
    } catch {
      this.atlas = ATLAS_REPLIEGUE;
      console.warn('[recursos] sin atlas.json: se usan placeholders generados');
    }

    const cargas = [];
    for (const id of Object.keys(this.atlas.entidades)) {
      cargas.push(this._cargarEntidad(id));
    }
    await Promise.all(cargas);

    this._generarSuelo(nivel);
  },

  _cargarEntidad(id) {
    const meta = this.atlas.entidades[id];
    return new Promise((resolver) => {
      const registrar = (fuente) => {
        const espejo = this._espejo(fuente, meta);
        this.imagenes.set(id, fuente);
        this.espejos.set(id, espejo);
        this.tintes.set(id, this._tinte(fuente, meta));
        this.tintesEspejo.set(id, this._tinte(espejo, meta));
      };
      const conPlaceholder = () => {
        registrar(this._placeholder(id, meta));
        this.sustituidos.push(id);
        resolver();
      };
      if (!meta.archivo) return conPlaceholder();

      const img = new Image();
      img.onload = () => {
        registrar(img);
        resolver();
      };
      img.onerror = conPlaceholder;
      img.src = 'assets/' + meta.archivo;
    });
  },

  // Copia volteada en horizontal, generada UNA vez al cargar.
  //
  // Todos los sprites miran a la derecha y la mitad de los enemigos van hacia la
  // izquierda, así que hay que voltear. Hacerlo con ctx.scale(-1,1) por entidad
  // significa un save/restore y un cambio de matriz por bicho: con 800 en
  // pantalla eso son 1.600 cambios de estado del contexto por frame, y el
  // canvas 2D los paga caros. Con la copia ya volteada, dibujar a izquierda o a
  // derecha cuesta exactamente lo mismo: un drawImage y nada más.
  //
  // Es la misma idea que los tintes precacheados de la sección 4 del plan:
  // trabajo de carga a cambio de trabajo por frame.
  // Con hojas de animación se voltea FOTOGRAMA A FOTOGRAMA, no la tira entera:
  // espejar la tira completa dejaría el fotograma 0 al final y la animación
  // correría del revés.
  _espejo(fuente, meta) {
    const frames = meta.frames || 1;
    const c = document.createElement('canvas');
    c.width = meta.w * frames;
    c.height = meta.h;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    for (let f = 0; f < frames; f++) {
      g.save();
      g.translate((f + 1) * meta.w, 0);
      g.scale(-1, 1);
      g.drawImage(fuente, f * meta.w, 0, meta.w, meta.h, 0, 0, meta.w, meta.h);
      g.restore();
    }
    return c;
  },

  // Copia blanqueada para el destello de impacto.
  //
  // Se genera UNA vez al cargar, nunca por frame: es el requisito 6 del plan.
  // Blanquear en caliente exigiría un canvas temporal o un filtro por entidad
  // golpeada, y en el minuto 16 hay decenas de impactos por frame.
  //
  // 'source-atop' pinta el blanco SOLO donde ya había píxel, así que respeta la
  // silueta y el alfa del borde. Se deja algo de color original asomando para
  // que el bicho siga reconociéndose en el fogonazo.
  _tinte(fuente, meta) {
    const frames = meta.frames || 1;
    const c = document.createElement('canvas');
    c.width = meta.w * frames;
    c.height = meta.h;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(fuente, 0, 0, c.width, c.height);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(255,255,255,.82)';
    g.fillRect(0, 0, c.width, c.height);
    return c;
  },

  // Silueta geométrica con la forma y el tamaño correctos: permite tocar el
  // balance sin esperar al arte.
  _placeholder(id, meta) {
    // Un solo fotograma: el sustituto no anima, y con `frames` a 1 en el atlas
    // el motor lo dibujará entero sin buscar hojas que no existen.
    meta.frames = 1;
    const c = document.createElement('canvas');
    c.width = meta.w; c.height = meta.h;
    const g = c.getContext('2d');
    const color = COLORES_PLACEHOLDER[id] || '#c0553f';

    g.fillStyle = color;
    g.strokeStyle = 'rgba(0,0,0,.55)';
    g.lineWidth = Math.max(2, meta.w * 0.05);
    const r = Math.min(meta.w, meta.h) * 0.18;
    const x = g.lineWidth / 2, y = g.lineWidth / 2;
    const w = meta.w - g.lineWidth, h = meta.h - g.lineWidth;
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y,     x + w, y + h, r);
    g.arcTo(x + w, y + h, x,     y + h, r);
    g.arcTo(x,     y + h, x,     y,     r);
    g.arcTo(x,     y,     x + w, y,     r);
    g.closePath();
    g.fill(); g.stroke();

    // Marca de orientación: todos los sprites miran a la derecha.
    g.fillStyle = 'rgba(255,255,255,.8)';
    g.beginPath();
    g.moveTo(w * 0.62, h * 0.38);
    g.lineTo(w * 0.86, h * 0.5);
    g.lineTo(w * 0.62, h * 0.62);
    g.closePath();
    g.fill();
    return c;
  },

  // Tiles de suelo procedurales. El mapa es infinito con scroll toroidal, así
  // que el tile tiene que casar consigo mismo: cada mota se dibuja también en
  // su posición envuelta, y por eso no aparecen costuras.
  _generarSuelo(nivel) {
    const cfg = nivel.suelo;
    const pal = nivel.paleta;
    const lado = TILE * ESCALA_ARTE;
    const rng = crearRng(0xE3E21A);

    this.tilesSuelo.length = 0;
    for (let v = 0; v < cfg.variantes; v++) {
      const c = document.createElement('canvas');
      c.width = c.height = lado;
      const g = c.getContext('2d');

      g.fillStyle = pal[cfg.base];
      g.fillRect(0, 0, lado, lado);

      for (let i = 0; i < cfg.densidadMotas; i++) {
        const mx = rng() * lado;
        const my = rng() * lado;
        const rad = 0.6 + rng() * 2.2;
        g.fillStyle = pal[cfg.motas[(rng() * cfg.motas.length) | 0]];
        g.globalAlpha = 0.18 + rng() * 0.32;
        this._puntoEnvuelto(g, mx, my, rad, lado);
      }
      g.globalAlpha = 1;

      // Juntas de losa: trazos rectos tenues, también envueltos.
      g.strokeStyle = pal.piedra;
      g.globalAlpha = 0.22;
      g.lineWidth = 1;
      for (let i = 0; i < cfg.grietas; i++) {
        const horizontal = rng() < 0.5;
        const p = Math.floor(rng() * lado) + 0.5;
        g.beginPath();
        if (horizontal) { g.moveTo(0, p); g.lineTo(lado, p); }
        else            { g.moveTo(p, 0); g.lineTo(p, lado); }
        g.stroke();
      }
      g.globalAlpha = 1;

      this.tilesSuelo.push(c);
    }
  },

  _puntoEnvuelto(g, x, y, r, lado) {
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const px = x + ox * lado;
        const py = y + oy * lado;
        if (px < -r || py < -r || px > lado + r || py > lado + r) continue;
        g.beginPath();
        g.arc(px, py, r, 0, Math.PI * 2);
        g.fill();
      }
    }
  },

  meta(id) { return this.atlas.entidades[id]; },
  imagen(id) { return this.imagenes.get(id); },
  espejo(id) { return this.espejos.get(id); },
  tinte(id) { return this.tintes.get(id); },
  tinteEspejo(id) { return this.tintesEspejo.get(id); }
};
