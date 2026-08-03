import { ANCHO_LOGICO, ALTO_LOGICO, ESCALA_ARTE } from '../core/constantes.js';
import { Pool } from '../core/pool.js';
import { Rejilla } from '../core/rejilla.js';
import { Recursos } from '../core/recursos.js';
import { ENEMIGOS } from '../datos/enemigos.js';

// --- Culling ----------------------------------------------------------------
// 1.5 pantallas medidas desde el CENTRO de la cámara. Lo que sale de aquí vuelve
// al pool: un enemigo que el jugador ha dejado atrás no vuelve a alcanzarle
// nunca, así que mantenerlo vivo es pagar IA y colisiones por nada.
export const CULL_X = ANCHO_LOGICO * 1.5;   // 720 unidades lógicas
export const CULL_Y = ALTO_LOGICO  * 1.5;   // 405

// Hay DOS radios por enemigo y hacen cosas distintas:
//
//   radio       — círculo de DAÑO. Sale del plan: min(0.35*alto, 0.45*ancho),
//                 deliberadamente pequeño para que rozar un ala o un cuerno no
//                 cuente como impacto.
//   radioCuerpo — círculo FÍSICO, el que impide que dos bichos ocupen el mismo
//                 sitio. Este sí tiene que cubrir la silueta dibujada.
//
// Separarlos es lo que permite que una gárgola con las alas abiertas (38 de
// ancho, radio de daño 7) no se solape con su vecina sin volver injusto el
// impacto. Con un solo radio hay que elegir entre alas atravesándose o golpes
// que entran desde media pantalla.
const FACTOR_CUERPO = 0.45;      // del ancho del sprite: 0.9 del semiancho

// Holgura de la separación blanda sobre el cuerpo. Reparte la multitud dejando
// un respiro entre siluetas; el escalón duro de colisiones.js garantiza después
// que nadie se meta dentro de nadie.
export const FACTOR_SEPARACION = 1.25;

// Palanca global de velocidad de los enemigos. Los valores del bestiario salen
// de la sección 10 del plan y se mantienen tal cual en datos/enemigos.js: las
// proporciones entre roles (la arpía sigue siendo el doble de rápida que un
// legionario) son diseño y no se tocan. Esto escala el conjunto.
//
// A 1.0 la serpiente iba a 68 contra los 85 del jugador: sobre el papel se huye,
// pero en la práctica la persecución resultaba asfixiante. A 0.75 el jugador le
// gana 34 px/s en vez de 17, y despegarse se nota.
//
// OJO con subirlo por encima de 0.92: ahí la arpía (92 nominal) vuelve a superar
// al jugador, que es su papel en el plan pero también lo que hacía imposible
// escapar.
export const ESCALA_VELOCIDAD = 0.75;

// --- Márgenes de dibujo -----------------------------------------------------
// El ancla es el centro de los pies, así que el sprite crece hacia ARRIBA: la
// hidra mide 112 lógicos de alto y su ancla puede estar 112px por debajo del
// borde superior y aun así verse.
const MARGEN_X      = 64;
const MARGEN_ARRIBA = 128;
const MARGEN_ABAJO  = 32;

// Amplitud de la animación procedural, en PÍXELES FÍSICOS. En píxeles y no en
// porcentaje a propósito: redondeada al entero, la deformación solo toma unos
// pocos valores discretos y el sprite deja de remuestrearse en cada frame.
const BOTE_PX  = 1.5;    // redondeado: -2, -1, 0, 1, 2
const FLOTE_PX = 3;      // desplazamiento vertical de los que vuelan

// Cadencia de las hojas de animación reales. 10 fps es la que traen los GIF de
// origen; a más, el aleteo se vuelve nervioso y deja de leerse.
const SEG_POR_FRAME = 0.1;

// Cubos de la ordenación por Y, uno por unidad lógica de alto visible.
const CUBOS_Y = MARGEN_ARRIBA + ALTO_LOGICO + MARGEN_ABAJO;

// Forma única para todos los enemigos: un solo tipo oculto en V8. Si unos
// enemigos tuvieran campos que otros no, cada acceso pasaría a ser polimórfico.
function crearEnemigo() {
  return {
    def: null, tipo: '',
    x: 0, y: 0, xPrev: 0, yPrev: 0, xVista: 0, yVista: 0,
    vida: 0, velocidad: 0,
    sepX: 0, sepY: 0, contactos: 0,
    radio: 0, radioCuerpo: 0, radioSep: 0, invMasa: 1, vuela: false,
    fase: 0, cadencia: 0, mirandoDerecha: true,
    frames: 1, frame: 0, relojAnim: 0,
    // Referencias resueltas al aparecer: dibujar 800 entidades no puede pagar
    // dos búsquedas en Map por entidad y frame.
    meta: null, img: null, imgEspejo: null
  };
}

export class Enemigos {
  constructor(capacidad, rng) {
    this.pool = new Pool(crearEnemigo, capacidad);
    this.rejilla = new Rejilla(capacidad, CULL_X, CULL_Y);
    this._rng = rng;

    this._visibles = new Int32Array(capacidad);
    this._cubo     = new Int32Array(capacidad);
    this._orden    = new Int32Array(capacidad);
    this._conteo   = new Int32Array(CUBOS_Y + 1);

    this.dibujados = 0;
    this.reciclados = 0;
  }

  get activos() { return this.pool.activos; }

  aparecer(tipo, x, y) {
    const e = this.pool.obtener();
    if (!e) return null;                     // pool lleno: se ignora, sin asignar

    const def = ENEMIGOS[tipo];
    e.def = def;
    e.tipo = tipo;
    e.x = e.xPrev = e.xVista = x;
    e.y = e.yPrev = e.yVista = y;
    e.vida = def.vida;
    // Las estadísticas se instancian POR ENEMIGO al aparecer, no se leen del
    // catálogo en cada paso. Aquí es donde la Fase 5 aplicará el escalado por
    // minuto (multiplicadorVida = 1 + 0.09 x minuto) sin tocar nada más.
    e.velocidad = def.velocidad * ESCALA_VELOCIDAD;
    e.sepX = 0; e.sepY = 0;
    e.radio = def.radio;
    e.invMasa = 1 / def.masa;
    e.vuela = def.vuela;
    e.mirandoDerecha = true;

    e.meta = Recursos.meta(def.sprite);
    // El cuerpo nunca es más pequeño que el círculo de daño: si el sprite es
    // estrecho manda el radio del plan, y si es ancho manda la silueta.
    const anchoLogico = e.meta ? e.meta.w / ESCALA_ARTE : def.radio * 2;
    e.radioCuerpo = Math.max(def.radio, anchoLogico * FACTOR_CUERPO);
    e.radioSep = e.radioCuerpo * FACTOR_SEPARACION;

    // Fase inicial aleatoria: si todos botaran sincronizados el enjambre
    // parecería un solo organismo latiendo.
    e.fase = this._rng() * Math.PI * 2;
    e.cadencia = 4 + e.velocidad * 0.06;

    // Hoja de animación real, si la hay. El fotograma inicial también va al
    // azar: con veinte gárgolas aleteando a la vez y en fase, el enjambre
    // parecería un solo bicho repetido.
    e.frames = (e.meta && e.meta.frames) || 1;
    e.frame = e.frames > 1 ? (this._rng() * e.frames) | 0 : 0;
    e.relojAnim = this._rng() * SEG_POR_FRAME;

    e.img = Recursos.imagen(def.sprite);
    e.imgEspejo = Recursos.espejo(def.sprite);
    return e;
  }

  // Persecución directa hacia el jugador. La separación NO entra aquí: se aplica
  // después, como corrección de posición, una vez construida la rejilla (ver
  // sistemas/colisiones.js). Mezclarla en la velocidad no funciona, porque la
  // persecución tira siempre a tope y acaba ganando.
  //
  // xPrev queda con la posición de principio de paso, así que la interpolación
  // del render recoge también lo que mueva la separación.
  mover(dt, jugador) {
    const items = this.pool.items;
    const n = this.pool.activos;
    const jx = jugador.x, jy = jugador.y;

    for (let k = 0; k < n; k++) {
      const e = items[k];
      e.xPrev = e.x;
      e.yPrev = e.y;

      let dx = jx - e.x;
      let dy = jy - e.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 0.0001) {
        const inv = 1 / Math.sqrt(d2);
        dx *= inv; dy *= inv;
      } else {
        dx = 0; dy = 0;
      }

      const v = e.velocidad;
      e.x += dx * v * dt;
      e.y += dy * v * dt;

      // Umbral ancho a propósito: con uno estrecho, un enemigo que persigue casi
      // en vertical se pasa el rato volteándose por el ruido de la separación.
      if (dx > 0.08) e.mirandoDerecha = true;
      else if (dx < -0.08) e.mirandoDerecha = false;

      if (e.frames > 1) {
        e.relojAnim += dt;
        while (e.relojAnim >= SEG_POR_FRAME) {
          e.relojAnim -= SEG_POR_FRAME;
          e.frame = (e.frame + 1) % e.frames;
        }
      } else {
        e.fase += dt * e.cadencia;
      }
    }
  }

  // Devuelve al pool todo lo que ha quedado fuera de la región activa.
  // OJO: libera intercambiando con el último, así que k NO avanza cuando hay
  // baja; el que acaba de caer en la posición k todavía no se ha mirado.
  reciclarLejanos(centroX, centroY) {
    const items = this.pool.items;
    let k = 0;
    while (k < this.pool.activos) {
      const e = items[k];
      if (Math.abs(e.x - centroX) > CULL_X || Math.abs(e.y - centroY) > CULL_Y) {
        this.pool.liberarEn(k);
        this.reciclados++;
      } else {
        k++;
      }
    }
  }

  vaciar() { this.pool.vaciar(); }

  // Ordenación por profundidad (eje Y) mediante ordenación por CONTEO sobre
  // arrays tipados preasignados. Nada de Array.sort con una closure de
  // comparación por frame: eso asigna, y además su coste es n log n cuando aquí
  // el rango de Y está acotado y se puede hacer en O(n + k).
  //
  // El jugador se intercala en el mismo orden mediante `yCorte` + `pintarCorte`,
  // en vez de pintarse antes o después del bloque: con la pantalla llena, un
  // jugador siempre encima flota sobre el enjambre y siempre debajo desaparece.
  // `pintarCorte` es una referencia creada UNA vez en el arranque; construir una
  // closure aquí sería asignar memoria por frame.
  dibujar(ctx, camara, alpha, yCorte, pintarCorte) {
    const items = this.pool.items;
    const n = this.pool.activos;
    const izq = camara.izquierda;
    const arr = camara.arriba;
    const yBase = arr - MARGEN_ARRIBA;

    const conteo = this._conteo;
    const visibles = this._visibles;
    const cubos = this._cubo;
    const orden = this._orden;

    conteo.fill(0);

    // 1. Interpolar, descartar lo que no toca el viewport y clasificar por Y.
    let vis = 0;
    const limIzq = izq - MARGEN_X;
    const limDer = izq + ANCHO_LOGICO + MARGEN_X;
    const limAbajo = arr + ALTO_LOGICO + MARGEN_ABAJO;
    for (let k = 0; k < n; k++) {
      const e = items[k];
      const x = e.xPrev + (e.x - e.xPrev) * alpha;
      const y = e.yPrev + (e.y - e.yPrev) * alpha;
      if (x < limIzq || x > limDer || y < yBase || y > limAbajo) continue;
      e.xVista = x;
      e.yVista = y;

      let b = (y - yBase) | 0;
      if (b < 0) b = 0; else if (b >= CUBOS_Y) b = CUBOS_Y - 1;
      visibles[vis] = k;
      cubos[vis] = b;
      vis++;
      conteo[b + 1]++;
    }

    // 2. Suma acumulada y colocación. `conteo` hace de cursor: al terminar queda
    //    desplazado, pero se vuelve a poner a cero al principio del frame.
    for (let b = 1; b <= CUBOS_Y; b++) conteo[b] += conteo[b - 1];
    for (let i = 0; i < vis; i++) orden[conteo[cubos[i]]++] = visibles[i];

    // 3. Pintar de arriba a abajo. Un solo drawImage por entidad: el volteo sale
    //    de la copia espejada precacheada, no de tocar la matriz del contexto.
    let faltaCorte = pintarCorte !== undefined;
    for (let i = 0; i < vis; i++) {
      const e = items[orden[i]];
      const meta = e.meta;
      if (!meta) continue;
      if (faltaCorte && e.yVista > yCorte) { pintarCorte(); faltaCorte = false; }
      const img = e.mirandoDerecha ? e.img : e.imgEspejo;

      // Todo se cuadra a PÍXEL FÍSICO ENTERO antes de dibujar.
      //
      // Con imageSmoothingEnabled = false, un rectángulo de destino fraccionario
      // hace que el muestreo por vecino más próximo elija filas y columnas
      // distintas de un frame al siguiente: el sprite hierve aunque la entidad
      // apenas se mueva. Esa era la mitad de la vibración que se veía.
      const cxF = Math.round(e.xVista * ESCALA_ARTE);
      const cyF = Math.round(e.yVista * ESCALA_ARTE);

      // Con hoja de animación real no se aplica NADA procedural: el bote y el
      // flote existen para dar vida a una ilustración estática, y superpuestos a
      // un aleteo dibujado a mano se pelean con él. El artista ya decidió cómo
      // se mueve este bicho.
      if (e.frames > 1) {
        ctx.drawImage(img,
          e.frame * meta.w, 0, meta.w, meta.h,
          (cxF - (meta.w >> 1)) / ESCALA_ARTE, (cyF - meta.h) / ESCALA_ARTE,
          meta.w / ESCALA_ARTE, meta.h / ESCALA_ARTE);
        continue;
      }

      const seno = Math.sin(e.fase);
      if (e.vuela) {
        // Los que vuelan flotan: no pisan, así que aplastarlos contra el suelo
        // sería mentira. Solo se desplaza el ancla, sin deformar, y así no hay
        // remuestreo ninguno.
        const dyF = cyF - meta.h + Math.round(seno * FLOTE_PX);
        ctx.drawImage(img,
          (cxF - (meta.w >> 1)) / ESCALA_ARTE, dyF / ESCALA_ARTE,
          meta.w / ESCALA_ARTE, meta.h / ESCALA_ARTE);
      } else {
        // Squash & stretch desde los pies, en escalones de un píxel: se ensancha
        // al aplastarse y se estrecha al estirarse, que es lo que conserva el
        // volumen aparente. Al ir de entero en entero, la deformación se lee
        // como animación en vez de como ruido.
        const bote = Math.round(seno * BOTE_PX);
        const hF = meta.h + bote;
        const wF = meta.w - bote;
        ctx.drawImage(img,
          (cxF - (wF >> 1)) / ESCALA_ARTE, (cyF - hF) / ESCALA_ARTE,
          wF / ESCALA_ARTE, hF / ESCALA_ARTE);
      }
    }
    // Nadie por detrás del jugador, o ningún enemigo visible.
    if (faltaCorte) pintarCorte();

    this.dibujados = vis;
  }
}
