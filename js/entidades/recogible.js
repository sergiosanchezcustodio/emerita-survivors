import { Pool } from '../core/pool.js';
import { ESCALA_ARTE } from '../core/constantes.js';
import { Recursos } from '../core/recursos.js';
import { GestorAudio } from '../sistemas/audio.js';
import { sen, hipot } from '../core/mate.js';

// Gemas de experiencia. Pool preasignado, como todo lo demás.
//
// Cada una tiene su dibujo (`arte`), de los que ha hecho Sergio. Antes eran
// rombos trazados de seis a diez píxeles con un punto de luz, que era lo que
// había mientras no hubiera arte.
//
// Cuatro valores, como pide el plan: 1, 5, 25 y 100. El ORDEN DEL NOMBRE ES EL
// VALOR —gema1 la más pobre, gema4 la mejor— que es como las entregó Sergio.
//
// TODAS DEL MISMO TAMAÑO. Antes crecían con el valor, razonando que en un suelo
// sembrado de gemas el tamaño se ve antes que el color. Descartado viéndolo: lo
// que separa una gema de otra es QUÉ GEMA ES, y escalarlas por valor hacía que
// las buenas parecieran otro objeto en vez de la misma cosa mejor. Por eso
// `lado` es igual en las cuatro, y el tamaño de los dibujos lo iguala el marco
// fijo del recorte (ver $CATALOGO en herramientas/procesar-assets.ps1).
//
// `lado` va a la par de ese marco: manda en el grosor de la estela cuando el
// imán las arrastra y en el rombo de repliegue si el PNG no carga, así que al
// encoger las gemas a la mitad tuvo que encogerse con ellas o el rastro habría
// quedado más gordo que la gema que lo deja.
export const GEMAS = [
  { valor: 1,   color: '#5aa9e6', brillo: '#bfe4ff', lado: 2, arte: 'gema1' },
  { valor: 5,   color: '#5ac36a', brillo: '#c6f3cd', lado: 2, arte: 'gema2' },
  { valor: 25,  color: '#d64b5a', brillo: '#ffc2c8', lado: 2, arte: 'gema3' },
  { valor: 100, color: '#e8b73a', brillo: '#fff0b8', lado: 2, arte: 'gema4' }
];

// Por encima de esto, las gemas más lejanas se fusionan (requisito 5 del plan).
// Sin ello, veinte minutos de partida dejan miles de rombos en el suelo y el
// dibujado se hunde por acumulación, no por dificultad.
const TOPE_ANTES_DE_FUSIONAR = 150;

// --- Por qué esto se ha tenido que arreglar ---------------------------------
//
// La fusión solo tocaba gemas a más de 400 unidades del grupo. La pantalla mide
// 480x270, así que ese radio es casi toda la vista: en la práctica no se fusionaba
// casi nada, el pool de 600 se llenaba, y a partir de ahí `soltar` DESCARTABA la
// gema. Medido con la curva nueva y un jugador quieto: 98 gemas recogidas, 1003
// tiradas a la basura en cuatro minutos. O sea, la mayoría de los enemigos que
// matabas no daban absolutamente nada y el nivel se quedaba clavado.
//
// Lo peor es que no se veía: no hay error, no hay aviso, solo una progresión que
// se atasca sin motivo aparente. Se descubrió al medir por qué subir de nivel se
// había vuelto lento después de subir la densidad de la curva.
//
// Dos cambios y una garantía:
//   - El radio protegido baja a 90: solo se libran las gemas que el jugador
//     tiene encima y está a punto de recoger. El resto se agrupa.
//   - La fusión se acota por frame. Antes podía intentar cientos de fusiones en
//     un paso, cada una escaneando el pool entero: eso es N² justo cuando la
//     pantalla está llena, que es cuando menos se puede pagar.
//   - Y si aun así el pool se llena, el valor NO se pierde: se le suma a una
//     gema que ya existe. La experiencia total de la partida es siempre la que
//     han soltado los enemigos, pase lo que pase.
const RADIO_PROTEGIDO = 90;
const FUSIONES_POR_PASO = 24;
const BUSQUEDA_PAREJA = 48;

// Imán: dentro del radio de recogida vuela hacia el jugador ACELERANDO. Que
// acelere es lo que hace que recoger se sienta bien; a velocidad constante
// parecen limaduras arrastrándose.
const VELOCIDAD_INICIAL = 40;
const ACELERACION = 620;
const VELOCIDAD_MAXIMA = 420;

function crearGema() {
  return {
    x: 0, y: 0, xPrev: 0, yPrev: 0,
    vx: 0, vy: 0,
    valor: 0, tipo: 0,
    atraidaPor: null,        // jugador que la está absorbiendo
    fase: 0                  // para el cabeceo cuando está quieta
  };
}

export class Recogibles {
  constructor(capacidad, rng) {
    this.pool = new Pool(crearGema, capacidad);
    this._rng = rng;
    this.recogidas = 0;
    this.absorbidas = 0;     // gemas que llegaron con el pool lleno
    this._cursor = 0;        // turno rotatorio de _absorber
    // Cuántas van volando hacia alguien AHORA MISMO. Se lleva la cuenta en el
    // paso de lógica para que el dibujado pueda saltarse el bloque de estelas de
    // un vistazo: lo normal es que no haya ninguna.
    this.atraidas = 0;
  }

  get activas() { return this.pool.activos; }

  // Suelta la gema que corresponde al valor de experiencia dado, eligiendo el
  // escalón más grande que quepa. Un enemigo que vale 30 deja una roja, no
  // treinta azules.
  soltar(x, y, xp) {
    let tipo = 0;
    for (let i = GEMAS.length - 1; i >= 0; i--) {
      if (xp >= GEMAS[i].valor) { tipo = i; break; }
    }
    const g = this.pool.obtener();
    if (!g) { this._absorber(xp); return null; }
    g.x = g.xPrev = x + (this._rng() - 0.5) * 6;
    g.y = g.yPrev = y + (this._rng() - 0.5) * 4;
    g.vx = 0; g.vy = 0;
    g.tipo = tipo;
    g.valor = GEMAS[tipo].valor;
    g.atraidaPor = null;
    g.fase = this._rng() * Math.PI * 2;
    return g;
  }

  // Devuelve la XP recogida en este paso, ya repartida a cada jugador.
  actualizar(dt, jugadores) {
    const items = this.pool.items;
    this.atraidas = 0;
    let k = 0;
    while (k < this.pool.activos) {
      const g = items[k];
      g.xPrev = g.x;
      g.yPrev = g.y;
      g.fase += dt * 3;

      // Buscar quién la atrae. Una vez enganchada NO cambia de dueño: si dos
      // jugadores se cruzan, la gema iría dando bandazos entre los dos.
      if (!g.atraidaPor) {
        for (let i = 0; i < jugadores.length; i++) {
          const j = jugadores[i];
          if (j.abatido) continue;
          const dx = j.x - g.x;
          const dy = j.y - g.y;
          if (dx * dx + dy * dy < j.radioRecogida * j.radioRecogida) {
            g.atraidaPor = j;
            const d = hipot(dx, dy) || 1;
            g.vx = (dx / d) * VELOCIDAD_INICIAL;
            g.vy = (dy / d) * VELOCIDAD_INICIAL;
            break;
          }
        }
      }

      if (g.atraidaPor) {
        const j = g.atraidaPor;
        if (j.abatido) { g.atraidaPor = null; k++; continue; }
        let dx = j.x - g.x;
        let dy = j.y - g.y;
        const d2 = dx * dx + dy * dy;

        // Absorbida
        if (d2 < 36) {
          j.ganarXp(g.valor, jugadores);
          j.absorberGema();
          GestorAudio.recogerGema();
          this.recogidas++;
          this.pool.liberarEn(k);       // sin avanzar k
          continue;
        }

        const d = Math.sqrt(d2);
        dx /= d; dy /= d;
        const v = Math.min(VELOCIDAD_MAXIMA, hipot(g.vx, g.vy) + ACELERACION * dt);
        g.vx = dx * v;
        g.vy = dy * v;
        g.x += g.vx * dt;
        g.y += g.vy * dt;
        this.atraidas++;
      }
      k++;
    }

    if (this.pool.activos > TOPE_ANTES_DE_FUSIONAR) this._fusionar(jugadores);
  }

  // Última red: el pool está lleno y hay que colocar `xp` en algún sitio. Se le
  // suma a una gema ya existente, elegida por turno rotatorio para no cargarlo
  // todo sobre la misma. Sube de escalón si con lo sumado le corresponde otro,
  // así que el jugador ve una gema más valiosa, no una gema que miente.
  //
  // Cargar sobre una que ya va volando hacia el jugador es correcto y además es
  // lo mejor que puede pasar: ese valor llega enseguida.
  _absorber(xp) {
    const n = this.pool.activos;
    if (n === 0) return;                 // no hay dónde ponerlo: caso imposible
    this._cursor = (this._cursor + 1) % n;
    const g = this.pool.items[this._cursor];
    g.valor += xp;
    let tipo = g.tipo;
    while (tipo < GEMAS.length - 1 && GEMAS[tipo + 1].valor <= g.valor) tipo++;
    g.tipo = tipo;
    this.absorbidas++;
  }

  // Fusiona las más lejanas al grupo en gemas de mayor valor. Se conserva el
  // valor total: no se regala ni se roba experiencia, solo se agrupa.
  //
  // El trabajo está acotado por paso —tantas fusiones como mucho, y la pareja se
  // busca en una ventana corta— porque esto corre con la pantalla llena. Quedarse
  // corto en un frame no importa: el sobrante se fusiona en el siguiente, y
  // mientras tanto ninguna experiencia se pierde.
  _fusionar(jugadores) {
    const items = this.pool.items;
    const sobran = Math.min(FUSIONES_POR_PASO,
                            this.pool.activos - TOPE_ANTES_DE_FUSIONAR);
    let hechas = 0;

    // Centro del grupo, para saber qué es "lejos".
    let cx = 0, cy = 0, n = 0;
    for (let i = 0; i < jugadores.length; i++) {
      if (jugadores[i].abatido) continue;
      cx += jugadores[i].x; cy += jugadores[i].y; n++;
    }
    if (n === 0) return;
    cx /= n; cy /= n;

    let k = 0;
    while (k < this.pool.activos && hechas < sobran) {
      const g = items[k];
      const dx = g.x - cx, dy = g.y - cy;
      // Se libran las que el jugador tiene encima y las que ya vuelan hacia él:
      // fusionar una gema bajo los pies la haría desaparecer en la cara del
      // jugador y parecería que se le ha quitado algo.
      if (g.atraidaPor || dx * dx + dy * dy < RADIO_PROTEGIDO * RADIO_PROTEGIDO ||
          g.tipo >= GEMAS.length - 1) {
        k++;
        continue;
      }
      // Busca otra del mismo escalón con la que juntarse, en una ventana corta.
      let pareja = -1;
      const hasta = Math.min(this.pool.activos, k + 1 + BUSQUEDA_PAREJA);
      for (let q = k + 1; q < hasta; q++) {
        const o = items[q];
        if (o.tipo === g.tipo && !o.atraidaPor) { pareja = q; break; }
      }
      if (pareja < 0) { k++; continue; }

      const sumado = g.valor + items[pareja].valor;
      let tipo = g.tipo;
      while (tipo < GEMAS.length - 1 && GEMAS[tipo + 1].valor <= sumado) tipo++;
      g.tipo = tipo;
      g.valor = sumado;
      this.pool.liberarEn(pareja);
      hechas++;
    }
  }

  // Súper imán: TODAS las gemas del mapa vuelan hacia un jugador. No las recoge
  // en el sitio, las engancha: siguen su vuelo normal con su aceleración, así
  // que el efecto se ve —una lluvia de gemas cruzando la pantalla— en vez de
  // aparecer un número de golpe. La mitad del premio es mirarlo.
  atraerTodas(jugador) {
    const items = this.pool.items;
    for (let k = 0; k < this.pool.activos; k++) {
      const g = items[k];
      if (g.atraidaPor) continue;
      g.atraidaPor = jugador;
      const dx = jugador.x - g.x;
      const dy = jugador.y - g.y;
      const d = hipot(dx, dy) || 1;
      g.vx = (dx / d) * VELOCIDAD_INICIAL;
      g.vy = (dy / d) * VELOCIDAD_INICIAL;
    }
    return this.pool.activos;
  }

  vaciar() { this.pool.vaciar(); this.atraidas = 0; }

  // El dibujo de la gema, y una ESTELA CORTA detrás de las que vuelan.
  //
  // Sin ella, una gema que cruza media pantalla a 420 unidades por segundo es un
  // rombo teletransportándose: a 60 fps recorre siete píxeles entre fotograma y
  // fotograma, o sea más que su propio tamaño, y el ojo no la sigue. Con la
  // estela se ve el recorrido, y ver el recorrido es lo que convierte recoger en
  // un efecto en vez de una desaparición.
  //
  // AGRUPADA POR TIPO, una pasada por color, igual que las partículas: asignar
  // strokeStyle obliga a parsear la cadena CSS y con el imán soltando
  // seiscientas gemas serían seiscientas asignaciones por frame. Y todo el
  // bloque se salta entero si no hay ninguna volando, que es lo normal.
  _dibujarEstelas(ctx, alpha) {
    const items = this.pool.items;
    const n = this.pool.activos;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.45;
    ctx.lineCap = 'round';
    for (let t = 0; t < GEMAS.length; t++) {
      let abierta = false;
      for (let k = 0; k < n; k++) {
        const g = items[k];
        if (g.tipo !== t || !g.atraidaPor) continue;
        const v = hipot(g.vx, g.vy);
        if (v < 1) continue;
        if (!abierta) {
          ctx.strokeStyle = GEMAS[t].brillo;
          ctx.lineWidth = GEMAS[t].lado * 0.5;
          ctx.beginPath();
          abierta = true;
        }
        const x = g.xPrev + (g.x - g.xPrev) * alpha;
        const y = g.yPrev + (g.y - g.yPrev) * alpha;
        // El largo sale de la VELOCIDAD, no es fijo: la gema acelera hacia el
        // jugador, así que la estela se estira a medida que se acerca y eso es
        // justo lo que se siente al recogerla.
        const largo = Math.min(14, v * 0.03);
        ctx.moveTo(x - (g.vx / v) * largo, y - (g.vy / v) * largo);
        ctx.lineTo(x, y);
      }
      if (abierta) ctx.stroke();
    }
    ctx.restore();
  }

  // Rombo con un punto de luz, o el dibujo de Sergio si está cargado.
  dibujar(ctx, alpha) {
    const items = this.pool.items;
    const n = this.pool.activos;
    if (n === 0) return;

    if (this.atraidas > 0) this._dibujarEstelas(ctx, alpha);

    for (let k = 0; k < n; k++) {
      const g = items[k];
      const def = GEMAS[g.tipo];
      const x = g.xPrev + (g.x - g.xPrev) * alpha;
      // Cabeceo suave mientras espera en el suelo.
      const y = g.yPrev + (g.y - g.yPrev) * alpha +
                (g.atraidaPor ? 0 : sen(g.fase) * 1.2);
      const meta = Recursos.meta(def.arte);
      const img = Recursos.imagen(def.arte);
      if (meta && img) {
        // Cuadre a píxel físico entero, como los enemigos y los obstáculos: sin
        // esto las gemas tiemblan al moverse la cámara aunque estén quietas.
        const cxF = Math.round(x * ESCALA_ARTE);
        const cyF = Math.round(y * ESCALA_ARTE);
        ctx.drawImage(img,
          (cxF - (meta.w >> 1)) / ESCALA_ARTE, (cyF - (meta.h >> 1)) / ESCALA_ARTE,
          meta.w / ESCALA_ARTE, meta.h / ESCALA_ARTE);
        continue;
      }

      // Sin dibujo cargado, el rombo de siempre. Los colores de arriba siguen
      // siendo los que decide la paleta, así que el repliegue no desentona.
      const l = def.lado;
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.moveTo(x, y - l);
      ctx.lineTo(x + l * 0.7, y);
      ctx.lineTo(x, y + l);
      ctx.lineTo(x - l * 0.7, y);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = def.brillo;
      ctx.fillRect(x - l * 0.2, y - l * 0.5, l * 0.4, l * 0.5);
    }
  }
}
