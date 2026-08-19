import { Pool } from '../core/pool.js';
import { Recursos } from '../core/recursos.js';
import { enemigosEnRadio } from '../sistemas/colisiones.js';

// Zonas de daño: charcos, trampas, auras, explosiones y ondas expansivas.
//
// Un solo pool para todas porque, por debajo, son lo mismo: un círculo que hace
// daño a lo que tiene dentro durante un tiempo. Lo que cambia es CÓMO trata ese
// círculo al enemigo, y eso son tres modos:
//
//   'zona'  — radio fijo, daña por TICS cada `intervalo`. Charcos, trampas,
//             auras. Si `seguir` apunta a un jugador, se mueve con él.
//   'onda'  — el radio CRECE de `radioIni` a `radio` durante su vida y daña a
//             cada enemigo UNA sola vez, al pasarle por encima. Explosiones y
//             ondas expansivas.
//
// La distinción importa: una explosión que dañara por tics mataría lo que pilla
// dentro varias veces en el mismo instante, y un charco que dañara una sola vez
// dejaría de ser un charco.

const MAX_ALCANZADOS = 256;

// CALCOMANÍAS DE SUELO. Las zonas de modo 'zona' pueden llevar un dibujo en vez
// del círculo de color. Salen todas de una misma hoja plana (assets/efectos/
// zonas.png, ver herramientas/procesar-assets.ps1), así que la zona guarda
// solo el ÍNDICE de su fotograma y el dibujado hace un drawImage con recorte.
//
// El índice se resuelve UNA vez, al crear la zona, y no por frame: buscar una
// cadena en un Map sesenta veces por segundo por charco es justo el tipo de
// trabajo que este motor evita en todas partes.
// Se exportan la hoja y el resolutor porque los charcos de los JEFES no viven
// en este pool —son `Disparos`, que es lo que hace daño al jugador— pero salen
// de la misma hoja y son la misma clase de cosa: una mancha en el suelo. Ver
// entidades/disparo.js.
export const HOJA_ZONAS = 'efectosZonas';
let huecos = null;

export function huecoDe(id) {
  if (huecos === null) {
    huecos = new Map();
    const meta = Recursos.meta(HOJA_ZONAS);
    // Sin hoja no hay reparto: el mapa se queda vacío y todo cae al círculo
    // trazado de siempre. Es la misma red que los placeholders del atlas — el
    // juego tiene que seguir siendo jugable sin un solo PNG.
    if (meta && meta.orden && Recursos.imagen(HOJA_ZONAS)) {
      for (let i = 0; i < meta.orden.length; i++) huecos.set(meta.orden[i], i);
    }
  }
  const h = huecos.get(id);
  return h === undefined ? -1 : h;
}

function crearZona() {
  return {
    x: 0, y: 0,
    radio: 0, radioIni: 0, radioActual: 0,
    vida: 0, vidaMax: 1,
    danyo: 0, intervalo: 0, reloj: 0,
    empuje: 0, ralentiza: 0,
    modo: 'zona',
    sello: 0,                 // para que una onda no golpee dos veces
    seguir: null,             // jugador al que se pega (auras)
    // Cuánto se sube la zona sobre la posición de aquel al que sigue. La `y` de
    // un jugador es su LÍNEA DE PIES, así que una zona centrada ahí deja medio
    // cuerpo fuera por arriba; subiéndola media altura del sprite, la figura
    // entera queda dentro del área. Lo calcula quien la crea, porque es quien
    // sabe de qué sprite se trata.
    desvioY: 0,
    color: '#fff', relleno: 0.18,
    sprite: -1,               // fotograma en la hoja compartida; -1 = sin dibujo
    // Hoja propia: cuando el efecto tiene su PNG en vez de una celda de la hoja
    // compartida, aquí va su id del atlas y `sprite` se ignora.
    hoja: null,
    // Giro en radianes por segundo. 0 = quieto, que es lo normal: un charco no
    // gira. Lo usan los campos y auras, donde la rotación es lo que los hace
    // parecer vivos sin necesitar fotogramas.
    giro: 0,
    fase: 0,
    // MINA. `radioGatillo` es lo que hay que pisar para que salte; `radio` es
    // lo que revienta después, y es bastante mayor. `hojaOnda` es con qué se
    // dibuja ese reventón: se guarda al sembrarla porque al detonar ya no hay
    // arma a la que preguntárselo.
    radioGatillo: 0,
    hojaOnda: null
  };
}

let contadorSello = 1;

export class Zonas {
  constructor(capacidad) {
    this.pool = new Pool(crearZona, capacidad);
    this._alcanzados = new Int32Array(MAX_ALCANZADOS);
  }

  get activas() { return this.pool.activos; }

  crear(def) {
    const z = this.pool.obtener();
    if (!z) return null;
    z.x = def.x; z.y = def.y;
    z.radio = def.radio;
    z.radioIni = def.radioIni || 0;
    z.radioActual = z.radioIni;
    z.vida = z.vidaMax = def.duracion;
    z.danyo = def.danyo;
    z.intervalo = def.intervalo || 0.4;
    z.reloj = 0;                       // el primer tic entra ya
    z.empuje = def.empuje || 0;
    z.ralentiza = def.ralentiza || 0;
    z.modo = def.modo || 'zona';
    z.seguir = def.seguir || null;
    z.color = def.color;
    z.relleno = def.relleno === undefined ? 0.18 : def.relleno;
    // Un efecto puede venir de la hoja compartida (una celda de un catálogo) o
    // traer su PNG propio. Se distingue por si `sprite` nombra una entrada del
    // atlas: si la nombra, es hoja propia; si no, se busca como celda.
    if (def.sprite && Recursos.meta(def.sprite)) {
      z.hoja = def.sprite;
      z.sprite = 0;
    } else {
      z.hoja = null;
      z.sprite = def.sprite ? huecoDe(def.sprite) : -1;
    }
    z.giro = def.giro || 0;
    z.fase = 0;
    z.radioGatillo = def.radioGatillo || 0;
    z.hojaOnda = (def.spriteOnda && Recursos.meta(def.spriteOnda)) ? def.spriteOnda : null;
    z.desvioY = def.desvioY || 0;
    z.sello = contadorSello++;
    return z;
  }

  actualizar(dt, enemigos) {
    const items = this.pool.items;
    let k = 0;
    while (k < this.pool.activos) {
      const z = items[k];
      z.vida -= dt;
      if (z.vida <= 0) { this.pool.liberarEn(k); continue; }   // sin avanzar k

      if (z.seguir) { z.x = z.seguir.x; z.y = z.seguir.y - z.desvioY; }

      // La fase de giro avanza con el PASO DE LÓGICA, no con el reloj: dt es
      // fijo, así que dos partidas con la misma semilla giran igual. Es la
      // misma regla que la sacudida de cámara y las fases de los disparos.
      if (z.giro !== 0) z.fase += z.giro * dt;

      const t = 1 - z.vida / z.vidaMax;      // 0 recién nacida, 1 al expirar
      // MINA ARMADA: no hace nada hasta que algo la pisa. No daña por tics, no
      // crece, solo mira. En cuanto entra un enemigo en su gatillo, detona.
      if (z.modo === 'mina') {
        z.radioActual = z.radioGatillo;
        if (enemigosEnRadio(enemigos, z.x, z.y, z.radioGatillo, this._alcanzados) > 0) {
          this._detonar(z);
        }
        k++;
        continue;
      }
      if (z.modo === 'onda') {
        // El radio crece deprisa al principio y frena al final: es lo que hace
        // que una explosión se sienta como un golpe y no como un globo.
        z.radioActual = z.radioIni + (z.radio - z.radioIni) * Math.sqrt(t);
        this._danyar(z, enemigos, true);
      } else {
        z.radioActual = z.radio;
        z.reloj -= dt;
        if (z.reloj <= 0) {
          z.reloj = z.intervalo;
          this._danyar(z, enemigos, false);
        }
      }
      k++;
    }
  }

  // La mina se convierte en onda EN SU SITIO. Ni se libera ni se pide otra
  // zona: mutar el objeto que ya está en el pool evita tocar la lista mientras
  // se la está recorriendo, que es la clase de cosa que rompe un bucle de
  // pool, y además no asigna nada. La mina y su explosión son la misma cosa en
  // dos momentos distintos, así que también es lo que mejor lo describe.
  _detonar(z) {
    z.modo = 'onda';
    z.radioIni = z.radio * 0.15;
    z.radioActual = z.radioIni;
    z.vida = z.vidaMax = 0.32;
    z.relleno = 0.3;
    z.hoja = z.hojaOnda;      // el dibujo pasa de ser la mina a ser el reventón
    z.sprite = z.hojaOnda ? 0 : -1;
    // Sello nuevo: una onda golpea UNA vez a cada enemigo, y el reparto de
    // sellos es lo que lo garantiza. Sin renovarlo, heredaría el de la mina.
    z.sello = contadorSello++;
  }

  _danyar(z, enemigos, unaVez) {
    const n = enemigosEnRadio(enemigos, z.x, z.y, z.radioActual, this._alcanzados);
    const items = enemigos.pool.items;
    for (let i = 0; i < n; i++) {
      const e = items[this._alcanzados[i]];
      if (unaVez) {
        if (e.ultimoSello === z.sello) continue;
        e.ultimoSello = z.sello;
      }
      let dx = e.x - z.x;
      let dy = e.y - z.y;
      const d = Math.hypot(dx, dy) || 1;
      enemigos.danyar(e, z.danyo, dx / d, dy / d, z.empuje);
      if (z.ralentiza > 0) e.frenado = Math.max(e.frenado, z.ralentiza);
    }
  }

  vaciar() { this.pool.vaciar(); }

  // EL DIBUJADO VA EN DOS CAPAS, Y NO ES UNA SUTILEZA DE ORDEN.
  //
  // Antes esto era un solo método que se llamaba después de las entidades, con
  // este motivo: los efectos tienen que leerse aunque haya ochocientos cuerpos
  // encima. El motivo sigue siendo cierto, pero el resultado era que un charco
  // de aceite se pintaba POR ENCIMA de los cuerpos, y un charco es una mancha
  // en el suelo: lo correcto es que se pise.
  //
  // Se resuelve partiendo la zona, no moviéndola entera:
  //
  //   dibujarSuelo — el RELLENO, entre el terreno y las entidades. Es la
  //     calcomanía: el aceite, el fuego, el campo. Se pisa.
  //   dibujarAire  — el CANTO, por encima de todo. Es la frontera del daño, o
  //     sea la única información que una zona da, y esa no puede quedar
  //     enterrada bajo la horda.
  //
  // Y hay una segunda división, por `modo`, que sale sola: una explosión no
  // está en el suelo, está en el aire. Las ondas se quedan arriba enteras.

  // Capa de SUELO: el relleno de las zonas persistentes. Va justo encima del
  // terreno, antes que las gemas y que cualquier entidad.
  dibujarSuelo(ctx) {
    const items = this.pool.items;
    const n = this.pool.activos;
    if (n === 0) return;

    // 1. Las que tienen calcomanía, en composición NORMAL.
    //
    // Normal y no 'lighter' por dos motivos. Uno, las láminas vienen sobre
    // blanco y no sobre negro, así que sumarlas lavaría la pantalla en vez de
    // encenderla. Y dos, una mancha en el suelo TAPA el suelo: sumar luz es lo
    // que hace un fuego, no lo que hace un charco de alquitrán.
    {
      // BASE TENUE BAJO LA CALCOMANÍA. La silueta de un charco no es un disco:
      // tiene entrantes, y por esos entrantes se ve suelo limpio DENTRO del
      // aro. Pero el aro es la zona de daño entera, así que ese suelo limpio
      // quema igual — y el jugador que mete el pie ahí lee que está a salvo.
      //
      // Un velo del color de la zona lo tapa. Va bajo a propósito: no tiene que
      // verse como un charco, solo tiene que impedir que dentro del aro haya un
      // solo píxel que parezca terreno normal. La calcomanía sigue siendo lo
      // que se ve; esto es la red debajo.
      //
      // 0.20 y no 0.14, que fue el primer valor: con el Rete —zarzas sobre gris
      // pálido, y que solo cubre el 78% del aro— el velo no se veía y quedaba
      // corona de suelo desnudo. Es EL número a tocar si el velo ensucia: subirlo
      // devuelve el disco lavado que la calcomanía vino a quitar.
      //
      // Y NO se pone bajo las hojas propias. El velo existe porque una celda
      // recortada de un catálogo tiene silueta irregular y deja entrantes; un
      // efecto con su PNG propio está dibujado para llenar su cuadro, así que
      // el velo solo añadiría un disco de color encima del suelo — y en un aura,
      // que está siempre en pantalla, eso se nota mucho más que en un charco que
      // dura cuatro segundos.
      ctx.save();
      for (let k = 0; k < n; k++) {
        const z = items[k];
        if (z.modo !== 'zona' || z.sprite < 0 || z.hoja) continue;
        const t = z.vida / z.vidaMax;
        ctx.globalAlpha = (t > 0.25 ? 1 : t / 0.25) * 0.20;
        ctx.fillStyle = z.color;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.radioActual, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let k = 0; k < n; k++) {
        const z = items[k];
        if (z.modo !== 'zona' || z.sprite < 0) continue;
        // La hoja se resuelve por zona: puede ser la compartida —una celda de
        // un catálogo— o el PNG propio del efecto. Ver `crear`.
        const idHoja = z.hoja || HOJA_ZONAS;
        const img = Recursos.imagen(idHoja);
        const meta = Recursos.meta(idHoja);
        if (!img || !meta) continue;

        const t = z.vida / z.vidaMax;
        // Entra a plena opacidad y solo se apaga en el último cuarto de vida:
        // un charco no se desvanece mientras quema, desaparece cuando se
        // consume. Aparecer ya translúcido lo haría parecer un fantasma.
        // TRANSLÚCIDAS AL 40%. Estaban al 92% y con nueve armas de zona a la vez
        // la pantalla acababa siendo una mancha: el charco tapaba el terreno,
        // los cuerpos y los otros charcos. Una zona tiene que decir DÓNDE
        // quema, no sustituir al suelo.
        //
        // El número es EL que hay que tocar si se ven poco: subirlo devuelve la
        // pantalla manchada, bajarlo hace que un charco de alquitrán sobre
        // losa oscura desaparezca.
        const OPACIDAD_ZONA = 0.40;
        ctx.globalAlpha = (t > 0.25 ? 1 : t / 0.25) * OPACIDAD_ZONA;

        // CHARCO ANIMADO EN BUCLE. Una hoja con `bucle` trae un hervor cíclico
        // —el fotograma último enlaza con el primero por construcción, ver
        // Pirotecnia.Charco— y se recorre a `fps` fijos, no repartido sobre la
        // vida de la zona: un charco de 2,6 s y otro de 5 s tienen que hervir
        // al mismo ritmo, porque es el mismo líquido. Repartir sobre la vida
        // haría que el Alquitrán burbujeara a cámara lenta solo por durar más.
        //
        // El reloj sale del tiempo YA VIVIDO y no de un contador propio, así
        // que no hay estado nuevo que guardar ni que reproducir con la semilla.
        let hueco = z.sprite;
        if (meta.bucle && meta.frames > 1) {
          const vivido = z.vidaMax - z.vida;
          hueco = ((vivido * (meta.fps || 11)) | 0) % meta.frames;
        }

        // El margen de la celda, igual que en las ondas: la mancha llega al
        // radio de daño y lo que sobresale es el borde irregular. Sin esto la
        // calcomanía se dibujaría un 18% pequeña y volvería a dejar corona de
        // suelo limpio dentro de la zona, que es el defecto que retiró las
        // cinco calcomanías del intento anterior.
        const r = z.radioActual * (meta.margen || 1);

        // BLIT ESCALADO, y aquí sí se puede. El radio de una zona crece con el
        // nivel del arma —el Alquitrán va de 46 a 77— así que no existe un
        // tamaño horneado que sirva. La regla de dejar los blits a 1:1 se
        // escribió para el bucle de los setecientos enemigos; aquí son tres o
        // cuatro charcos en pantalla y el coste no se nota.
        if (z.giro !== 0) {
          // GIRAR es lo que da vida a un efecto de UNA sola imagen sin pedirle
          // fotogramas al artista. Y funciona porque el recorte se hizo
          // centrado en el centro de simetría del dibujo: al rotar, ninguna
          // parte entra o sale del cuadro.
          ctx.save();
          ctx.translate(z.x, z.y);
          ctx.rotate(z.fase);
          ctx.drawImage(img, hueco * meta.w, 0, meta.w, meta.h,
                        -r, -r, r * 2, r * 2);
          ctx.restore();
        } else {
          ctx.drawImage(img, hueco * meta.w, 0, meta.w, meta.h,
                        z.x - r, z.y - r, r * 2, r * 2);
        }
      }
      ctx.restore();
    }

    // 1.bis LAS MINAS ARMADAS.
    //
    // Van aparte de las calcomanías por una razón concreta: se dibujan a TAMAÑO
    // FIJO. Una mina es un objeto que hay en el suelo, y su tamaño no tiene
    // nada que ver con lo que revienta al pisarla; el radio del arma crece con
    // el nivel y la mina no. El tamaño sale de `radioDibujo` del atlas, que lo
    // fija quien la horneó.
    //
    // Opacas, y en composición normal: es chapa, no luz.
    {
      ctx.save();
      ctx.globalAlpha = 1;
      for (let k = 0; k < n; k++) {
        const z = items[k];
        if (z.modo !== 'mina' || !z.hoja) continue;
        const img = Recursos.imagen(z.hoja);
        const meta = Recursos.meta(z.hoja);
        if (!img || !meta) continue;

        const fases = meta.frames || 1;
        let hueco = 0;
        if (meta.bucle && fases > 1) {
          const vivido = z.vidaMax - z.vida;
          hueco = ((vivido * (meta.fps || 9)) | 0) % fases;
        }
        // Parpadea más deprisa cuando le queda poco: es un aviso de que se va
        // a desarmar sola, y le da al arma una lectura que no tenía.
        const r = meta.radioDibujo || 9;
        ctx.drawImage(img, hueco * meta.w, 0, meta.w, meta.h,
                      z.x - r, z.y - r, r * 2, r * 2);
      }
      ctx.restore();
    }

    // 2. Y las que NO la tienen, con el círculo aditivo de siempre. Es el
    //    repliegue: mientras el catálogo de calcomanías no esté completo, la
    //    mayoría de las armas de zona pasan por aquí y se ven igual que antes.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < n; k++) {
      const z = items[k];
      if (z.modo !== 'zona' || z.sprite >= 0 || z.relleno <= 0) continue;
      const t = z.vida / z.vidaMax;          // 1 al nacer, 0 al morir
      ctx.globalAlpha = (0.35 + t * 0.35) * z.relleno;
      ctx.fillStyle = z.color;
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.radioActual, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 3. Y EL CANTO, TAMBIÉN AQUÍ ABAJO.
    //
    // Al principio se quedó arriba con las ondas, razonando que marca la
    // frontera del daño y que eso no puede quedar enterrado bajo la horda. El
    // razonamiento es bueno pero se aplicó donde no toca: vale para lo que te
    // hace daño A TI —el fuego de Cerbero, el veneno de la Hidra, que siguen
    // teniendo su canto arriba en entidades/disparo.js— y no vale para TU
    // propia arma. El aro del Campo eléctrico o del Aquila no es una amenaza
    // que esquivar, es el alcance de lo que llevas puesto, y dibujarlo sobre
    // los cuerpos hacía que el aura pareciera ir por delante de los enemigos.
    //
    // Con el canto abajo, la zona del jugador es una pieza entera pegada al
    // suelo: relleno y borde por debajo de todo lo que camina.
    //
    // NO SE DIBUJA SOBRE LAS HOJAS PROPIAS, y es el mismo criterio que el velo.
    // El canto existe para decir dónde acaba el daño cuando lo que hay dentro
    // no lo dice: un círculo translúcido no tiene borde, y una celda recortada
    // de un catálogo tiene silueta irregular que no llega al radio. Pero un
    // efecto con su PNG propio está horneado para llenar su cuadro justo hasta
    // el radio de daño, así que EL DIBUJO YA ES LA FRONTERA. Añadirle el aro
    // encima es dibujar dos veces el mismo borde, y se ve como lo que es: el
    // círculo de siempre pintado sobre la animación nueva.
    ctx.save();
    for (let k = 0; k < n; k++) {
      const z = items[k];
      if (z.modo !== 'zona' || z.hoja) continue;
      const t = z.vida / z.vidaMax;
      ctx.globalAlpha = 0.55 + t * 0.45;

      ctx.strokeStyle = 'rgba(16,11,20,.55)';
      ctx.lineWidth = 3.6;
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.radioActual, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = z.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.radioActual, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Capa de AIRE: solo las ONDAS, relleno y canto. Una explosión no está en el
  // suelo, está en el aire, y tiene que tapar lo que pilla debajo.
  dibujarAire(ctx) {
    const items = this.pool.items;
    const n = this.pool.activos;
    if (n === 0) return;

    // 1. Las ondas CON HOJA PROPIA: la explosión dibujada, en aditivo.
    //
    // La hoja trae la secuencia entera —la bola creciendo, vaciándose y
    // apagándose— así que el blit es de TAMAÑO CONSTANTE y quien crece es el
    // dibujo de dentro. Es al revés que las calcomanías de suelo, que son una
    // imagen fija escalada al radio del momento.
    //
    // Y por eso el radio de la hoja tiene que abrirse con la MISMA curva que
    // el daño. Lo hace: generar-efectos.ps1 hornea la bola con el
    // `0.15 + 0.85*sqrt(t)` de `actualizar`, que es el sitio donde se calcula
    // `radioActual`. Si las dos curvas se separan, el fuego va por delante o
    // por detrás de lo que mata.
    ctx.save();
    for (let k = 0; k < n; k++) {
      const z = items[k];
      if (z.modo !== 'onda' || !z.hoja) continue;
      const img = Recursos.imagen(z.hoja);
      const meta = Recursos.meta(z.hoja);
      if (!img || !meta) continue;

      // LA COMPOSICIÓN LA DECIDE LA HOJA, no este bucle. Casi todas son luz
      // —fuego, veneno, ondas de choque— y van sumando, que es lo que hace que
      // dos explosiones solapadas se vean más calientes. Pero el reventón de
      // TIERRA no es luz: es polvo y cascotes, y tiene que tapar lo que hay
      // detrás en vez de sumarse a ello.
      //
      // Se montó todo aditivo y la tierra sencillamente no se veía: aporta un
      // tercio de la luz que aporta el fuego, y sobre un suelo claro eso es
      // nada. El error no era el brillo, era la premisa.
      ctx.globalCompositeOperation = meta.aditivo === false ? 'source-over' : 'lighter';

      const t = 1 - z.vida / z.vidaMax;        // 0 al nacer, 1 al expirar
      const fases = meta.frames || 1;

      // EL FOTOGRAMA SE ELIGE POR RADIO, NO POR RELOJ, y se busca el MÁS
      // CERCANO en la tabla de la hoja.
      //
      // Por radio, porque con el reparto por reloj el primer fotograma se comía
      // el 26% del radio de golpe —sqrt es empinadísima al principio— y el
      // fuego se quedaba muy por detrás de lo que ya estaba matando.
      //
      // Y por tabla en vez de por fórmula, porque así el motor NO necesita
      // saber cómo repartió los fotogramas quien horneó la hoja. Hoy es una
      // progresión geométrica; si mañana es otra cosa, esto sigue valiendo. Son
      // diez comparaciones sobre las dos o tres explosiones que hay en pantalla.
      const objetivo = z.radio > 0 ? z.radioActual / z.radio : 1;
      let f = 0;
      if (meta.radios) {
        let mejor = Infinity;
        for (let i = 0; i < meta.radios.length; i++) {
          // Distancia en PROPORCIÓN y no en diferencia: lo que se quiere
          // minimizar es cuánto hay que ampliar o encoger la celda, y eso es un
          // cociente. Con la diferencia, los fotogramas pequeños salían siempre
          // perdiendo y se ampliaban de más.
          const rr = meta.radios[i];
          const d = rr > objetivo ? rr / objetivo : objetivo / rr;
          if (d < mejor) { mejor = d; f = i; }
        }
      }
      if (f >= fases) f = fases - 1;
      if (f < 0) f = 0;

      // Un desvanecido corto al final. La hoja termina a poco más de un tercio
      // de su brillo de pico, pero no en cero: sin esto la explosión se
      // cortaría en seco. Mismo remate que el tajo de la Katana.
      ctx.globalAlpha = t > 0.82 ? (1 - t) / 0.18 : 1;

      // MEDIO LADO. La celda se escala para que el filo del fuego caiga
      // EXACTAMENTE sobre el radio que mata en este instante, no en el del
      // fotograma más cercano: `radios[f]` dice a qué radio se horneó esta
      // fase, y dividir por él quita el error de cuantización que dejaría el
      // salto de un fotograma al siguiente. Lo que sobresale del cuadro son el
      // desgarro de la silueta y las chispas, y para eso está `margen`.
      const rn = (meta.radios && meta.radios[f]) || 1;
      const r = z.radioActual * (meta.margen || 1) / rn;
      ctx.drawImage(img, f * meta.w, 0, meta.w, meta.h,
                    z.x - r, z.y - r, r * 2, r * 2);
    }
    ctx.restore();

    // 2. Y las que NO la tienen, con el círculo aditivo de siempre. Dos
    //    explosiones solapadas se ven más calientes, y eso es correcto.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < n; k++) {
      const z = items[k];
      if (z.modo !== 'onda' || z.hoja || z.relleno <= 0) continue;
      const t = z.vida / z.vidaMax;
      ctx.globalAlpha = t * 0.75 * z.relleno;
      ctx.fillStyle = z.color;
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.radioActual, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 3. El canto de la onda, en composición normal y con una línea oscura por
    // fuera. Un canto oscuro contra uno claro se lee sobre cualquier fondo, que
    // es lo que un contorno tiene que garantizar.
    //
    // NO SE DIBUJA SOBRE LAS HOJAS PROPIAS, mismo criterio que en dibujarSuelo:
    // el aro existe para decir dónde acaba el daño cuando lo de dentro no lo
    // dice, y una explosión horneada al radio de daño YA ES la frontera.
    // Añadírselo encima es pintar dos veces el mismo borde, y se ve como lo que
    // es: el círculo de siempre encima de la animación nueva.
    ctx.save();
    for (let k = 0; k < n; k++) {
      const z = items[k];
      if (z.modo !== 'onda' || z.hoja) continue;
      const t = z.vida / z.vidaMax;
      // Adelgaza según se abre: es lo que la lee como onda que se disipa y no
      // como un círculo que crece.
      const grosor = 1 + t * 2.5;
      ctx.globalAlpha = t;

      ctx.strokeStyle = 'rgba(16,11,20,.55)';
      ctx.lineWidth = grosor + 1.6;
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.radioActual, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = z.color;
      ctx.lineWidth = grosor;
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.radioActual, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}
