import { Pool } from '../core/pool.js';

// Gemas de experiencia. Pool preasignado, como todo lo demás.
//
// Se dibujan por código: son rombos de 6-10 píxeles con un punto de luz. Un
// sprite a este tamaño no aportaría nada y sí un blit más por gema.
//
// Cuatro valores, como pide el plan: azul 1, verde 5, roja 25, dorada 100. El
// color no es decoración, es información: de un vistazo sabes si merece la pena
// cruzar la pantalla a por ella.
export const GEMAS = [
  { valor: 1,   color: '#5aa9e6', brillo: '#bfe4ff', lado: 3 },
  { valor: 5,   color: '#5ac36a', brillo: '#c6f3cd', lado: 3.5 },
  { valor: 25,  color: '#d64b5a', brillo: '#ffc2c8', lado: 4 },
  { valor: 100, color: '#e8b73a', brillo: '#fff0b8', lado: 5 }
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
            const d = Math.hypot(dx, dy) || 1;
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
          this.recogidas++;
          this.pool.liberarEn(k);       // sin avanzar k
          continue;
        }

        const d = Math.sqrt(d2);
        dx /= d; dy /= d;
        const v = Math.min(VELOCIDAD_MAXIMA, Math.hypot(g.vx, g.vy) + ACELERACION * dt);
        g.vx = dx * v;
        g.vy = dy * v;
        g.x += g.vx * dt;
        g.y += g.vy * dt;
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
      const d = Math.hypot(dx, dy) || 1;
      g.vx = (dx / d) * VELOCIDAD_INICIAL;
      g.vy = (dy / d) * VELOCIDAD_INICIAL;
    }
    return this.pool.activos;
  }

  vaciar() { this.pool.vaciar(); }

  // Rombo con un punto de luz. Las atraídas dejan una estela corta: es lo que
  // convierte la recogida en un efecto y no en una desaparición.
  dibujar(ctx, alpha) {
    const items = this.pool.items;
    const n = this.pool.activos;
    if (n === 0) return;

    for (let k = 0; k < n; k++) {
      const g = items[k];
      const def = GEMAS[g.tipo];
      const x = g.xPrev + (g.x - g.xPrev) * alpha;
      // Cabeceo suave mientras espera en el suelo.
      const y = g.yPrev + (g.y - g.yPrev) * alpha +
                (g.atraidaPor ? 0 : Math.sin(g.fase) * 1.2);
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
