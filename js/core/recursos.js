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
  tilesSuelo: [],           // canvas o imágenes del suelo, todas del mismo tamaño
  // Lado del tile de suelo en unidades LÓGICAS. Con suelo procedural es TILE en
  // los dos ejes; con un mapa pintado sale del tamaño de la imagen, que no tiene
  // por qué ser cuadrada — el de Emerita es una avenida vertical de 240x368.
  anchoSuelo: TILE,
  altoSuelo: TILE,
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

    await this._generarSuelo(nivel);
  },

  // Carga suelta, fuera del atlas. La usan el suelo del nivel y las pantallas
  // de título y selección: son imágenes de UNA pieza, sin fotogramas ni ancla,
  // y meterlas en el atlas solo les habría inventado metadatos que nadie mira.
  // Devuelve null si no carga, y todo lo que la usa sabe seguir sin ella.
  cargarSuelta(ruta) {
    return new Promise((resolver) => {
      const img = new Image();
      img.onload = () => resolver(img);
      img.onerror = () => { console.warn(`[recursos] no carga ${ruta}`); resolver(null); };
      img.src = ruta;
    });
  },

  _cargarEntidad(id) {
    const meta = this.atlas.entidades[id];
    return new Promise((resolver) => {
      const registrar = (fuente) => {
        this.imagenes.set(id, fuente);
        // `plano`: la entrada no es un sprite del mundo, es una hoja de iconos
        // de interfaz. No mira a ningún lado y no recibe golpes, así que ni
        // espejo ni destello — serían dos lienzos de 1664x32 que no usa nadie.
        if (meta.plano) return;
        const espejo = this._espejo(fuente, meta);
        this.espejos.set(id, espejo);
        this.tintes.set(id, this._tinte(fuente, meta));
        this.tintesEspejo.set(id, this._tinte(espejo, meta));
      };
      const conPlaceholder = () => {
        // Una hoja de iconos que no carga se queda SIN registrar, a propósito.
        // La silueta de repuesto tiene sentido para un bicho —el juego sigue
        // siendo jugable con un rectángulo persiguiéndote— pero como icono
        // sería el mismo rectángulo repetido cincuenta veces. Sin imagen,
        // ui/hud.js lo detecta y vuelve a sus glifos vectoriales, que sí dicen
        // algo. Ver el repliegue de dibujarIconoArma.
        if (meta.plano) { this.sustituidos.push(id); return resolver(); }
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

  // Suelo del nivel. Dos vías, y el resto del motor no distingue cuál se ha
  // usado: acaba habiendo tiles en `tilesSuelo` y un tamaño en `anchoSuelo` /
  // `altoSuelo`, y main.js los repite igual.
  //
  //   1. MAPA PINTADO, si el nivel declara `suelo.imagen`. Es una sola pieza,
  //      ya hecha teselable por la herramienta (ver HacerTeselable), y se
  //      dibuja a 1:1 porque su tamaño en píxeles es múltiplo exacto de
  //      ESCALA_ARTE.
  //   2. TILES PROCEDURALES, si no hay imagen o si falla. El juego tiene que
  //      seguir siendo jugable sin un solo PNG, así que esto no es un
  //      apaño: es la misma red de seguridad que los placeholders del atlas.
  //
  // En las dos, el mapa del juego es INFINITO con scroll toroidal, así que el
  // tile tiene que casar consigo mismo. En el procedural eso se consigue
  // dibujando cada mota también en su posición envuelta; en el pintado, en la
  // herramienta.
  async _generarSuelo(nivel) {
    const cfg = nivel.suelo;

    this.tilesSuelo.length = 0;
    if (cfg.imagen) {
      const img = await this.cargarSuelta('assets/' + cfg.imagen);
      if (img) {
        this.tilesSuelo.push(img);
        this.anchoSuelo = img.width / ESCALA_ARTE;
        this.altoSuelo = img.height / ESCALA_ARTE;
        return;
      }
      console.warn('[recursos] sin mapa de suelo: se usan tiles generados');
    }

    const pal = nivel.paleta;
    const lado = TILE * ESCALA_ARTE;
    const rng = crearRng(0xE3E21A);
    this.anchoSuelo = this.altoSuelo = TILE;

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

  // --- Variantes de color -----------------------------------------------
  //
  // Registra una copia TEÑIDA de un sprite ya cargado con un id propio. A partir
  // de ahí la variante es un sprite más: comparte meta con su base y tiene su
  // espejo y su destello de impacto, así que quien la dibuja no se entera de que
  // no es un PNG.
  //
  // Existe para la serpiente dorada de la sección 11 del plan, que es la misma
  // serpiente en otro color, y sirve para cualquier variante futura (un cíclope
  // de élite, una gárgola de invierno) sin encargar un dibujo nuevo.
  //
  // El teñido va con la operación 'color', que conserva la LUMINANCIA del
  // original y solo cambia tono y saturación: el sombreado, la luz de borde y el
  // volumen del dibujo siguen ahí, y la serpiente se lee como la misma serpiente
  // bañada en oro. Rellenar con el color a pelo daría una silueta plana.
  //
  // El rectángulo del relleno pinta también fuera de la silueta, así que después
  // se recorta con 'destination-in' contra la fuente para recuperar el alfa.
  variante(id, idBase, color) {
    const meta = this.atlas.entidades[idBase];
    const fuente = this.imagenes.get(idBase);
    if (!meta || !fuente) {
      console.warn(`[recursos] variante ${id}: falta la base ${idBase}`);
      return false;
    }
    if (this.imagenes.has(id)) return true;      // ya registrada

    const frames = meta.frames || 1;
    const c = document.createElement('canvas');
    c.width = meta.w * frames;
    c.height = meta.h;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;

    g.drawImage(fuente, 0, 0, c.width, c.height);
    g.globalCompositeOperation = 'color';
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    // Un velo cálido por encima, solo dentro de la silueta: sube el brillo lo
    // justo para que la variante destaque entre veinte iguales sin quemarla.
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(255,236,170,.16)';
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(fuente, 0, 0, c.width, c.height);

    // Comparte la ENTRADA del atlas con su base: mismo tamaño, mismo ancla,
    // mismos fotogramas. Copiarla dejaría dos verdades que se pueden desincronizar.
    this.atlas.entidades[id] = meta;
    this.imagenes.set(id, c);
    const espejo = this._espejo(c, meta);
    this.espejos.set(id, espejo);
    this.tintes.set(id, this._tinte(c, meta));
    this.tintesEspejo.set(id, this._tinte(espejo, meta));
    return true;
  },

  meta(id) { return this.atlas.entidades[id]; },
  imagen(id) { return this.imagenes.get(id); },
  espejo(id) { return this.espejos.get(id); },
  tinte(id) { return this.tintes.get(id); },
  tinteEspejo(id) { return this.tintesEspejo.get(id); }
};
