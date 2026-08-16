import { ANCHO_LOGICO, ALTO_LOGICO, ESCALA_ARTE } from '../core/constantes.js';
import { Recursos } from '../core/recursos.js';
import { ARMAS } from '../datos/armas.js';
import { MAX_NIVEL } from './progresion.js';
import { enemigoMasCercano, enemigosEnRadio } from './colisiones.js';
import { Particulas, COLOR_CHISPA } from './particulas.js';

// Motor genérico de armas.
//
// Un arma equipada es {def, nivel, stats, temporizador}. Cada paso baja el
// temporizador y, al llegar a cero, ejecuta la función que nombra
// `def.comportamiento`. Los datos de datos/armas.js solo parametrizan: añadir un
// arma que reutilice un comportamiento existente no toca este archivo.
//
// Los comportamientos viven en un objeto plano indexado por nombre, no en un
// switch. Así el motor no conoce ninguna arma concreta y basta con añadir una
// función para inventar una familia nueva.

const GRADOS = Math.PI / 180;

// --- Estadísticas efectivas --------------------------------------------------
// Los pasivos del jugador se aplican AQUÍ, al usar el arma, no al calcular sus
// stats. El motivo es que las stats del arma se recalculan solo al subir de
// nivel, mientras que los pasivos cambian por su cuenta: si se hornearan juntos
// habría que recorrer todas las armas de todos los jugadores cada vez que
// alguien coge un anillo.
function danyoDe(s, j) { return Math.round(s.danyo * (1 + j.bonusDanyo)); }
function areaDe(v, j)  { return v * (1 + j.bonusArea); }
function recargaDe(s, j) {
  const r = s.recarga * (1 - j.reduccionRecarga);
  return r < 0.08 ? 0.08 : r;
}

// ¿Existe ese comportamiento? Lo consulta la generación de ofertas para no
// ofrecer un arma que todavía no hace nada.
export function comportamientoImplementado(nombre) {
  return typeof COMPORTAMIENTOS[nombre] === 'function';
}

// Tope de enemigos que un solo golpe en área puede tocar. Preasignado: sin él
// haría falta un array nuevo por tajo.
const MAX_ALCANZADOS = 256;

// Tajos visibles a la vez. Es efecto, no lógica: si se pierde uno con la
// pantalla ardiendo, no lo nota nadie.
const MAX_TAJOS = 12;

// TAJOS DIBUJADOS. Un arma cuerpo a cuerpo puede traer una animación de barrido
// en vez del arco trazado: lo declara en `spriteTajo` (datos/armas.js), y el
// valor es directamente el ID DEL ATLAS de su hoja.
//
// Una hoja por arma, y no una tira compartida como las zonas. Cada animación
// trae su propia rejilla, su pivote y su número de fases, así que compartir
// tira obligaría a llevar la cuenta de dónde empieza cada arma; nombrando la
// entrada del atlas no hay contabilidad ninguna y añadir un arma no renumera
// nada de lo que ya está.
//
// Si la hoja no está cargada, el tajo cae al arco trazado de siempre sin
// avisar: misma red que los placeholders del atlas.

// Media altura del sprite de un jugador, en unidades lógicas.
//
// La `y` de un jugador es su LÍNEA DE PIES: el sprite se dibuja con el borde
// inferior ahí, así que el cuerpo ocupa de `y - alto` a `y` y su centro visual
// está media altura más arriba. Un aura centrada en los pies deja al personaje
// asomando por la mitad de arriba; centrada aquí, la figura entera queda dentro
// del área del arma.
//
// Sale del atlas y no de una constante, para que siga valiendo si el arte
// cambia de tamaño. El 13 de repliegue es media altura de los cuatro sprites de
// hoy (104 px físicos = 26 unidades), por si el atlas no ha cargado.
function medioAlto(j) {
  const meta = Recursos.meta(j.personaje);
  return meta ? meta.h / ESCALA_ARTE / 2 : 13;
}

// DE DÓNDE SALE UN DISPARO.
//
// Antes nacían todos en (x, y-8), o sea dentro del pecho del personaje: el
// proyectil aparecía encima de él y lo primero que hacía era atravesarlo, lo
// que se ve como si le brotara del cuerpo. Ahora salen por FUERA, del lado
// hacia el que se dispara: apuntando a la derecha sale por su costado derecho,
// hacia abajo por sus pies, y así con todas.
//
// El desplazamiento es el radio del cuerpo más un dedo de margen. El margen
// importa: pegado exacto al borde, el proyectil nace rozando la silueta y a
// media velocidad todavía se solapa un frame.
const ALTURA_DISPARO = 8;      // a qué altura del cuerpo se empuña
const MARGEN_BOCA = 3;

// Rellena `origenDisparo` con el punto de salida para un ángulo dado. Objeto de
// módulo reutilizado: esto se llama varias veces por disparo —un abanico de
// escopeta son trece— y devolver un objeto nuevo sería asignar en caliente.
const origenDisparo = { x: 0, y: 0 };
function bocaDe(j, ang) {
  const d = j.radioCuerpo + MARGEN_BOCA;
  origenDisparo.x = j.x + Math.cos(ang) * d;
  origenDisparo.y = j.y - ALTURA_DISPARO + Math.sin(ang) * d;
  return origenDisparo;
}

// Cada cuánto puede un mismo escudo orbital volver a golpear al mismo enemigo.
const ORBITAL_CADENCIA = 0.35;
let contadorSelloOrbital = 0;

// --- Comportamientos ---------------------------------------------------------
// Firma común: (arma, sis, ctx). `sis` es el sistema (para sus buffers), `ctx`
// trae jugador, enemigos, proyectiles y rng.

const COMPORTAMIENTOS = {

  // Proyectil al enemigo más cercano. Con varios proyectiles se abren en
  // abanico alrededor de la misma dirección.
  proyectilDirigido(arma, sis, ctx) {
    const s = arma.stats;
    const objetivo = enemigoMasCercano(ctx.enemigos, ctx.jugador.x, ctx.jugador.y, s.alcance);
    if (!objetivo) return false;          // sin blanco no se gasta la recarga

    let dx = objetivo.x - ctx.jugador.x;
    let dy = objetivo.y - ctx.jugador.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;

    const base = Math.atan2(dy, dx);
    const n = s.proyectiles;
    for (let i = 0; i < n; i++) {
      // Abanico centrado: con 1 sale recto, con 3 uno recto y dos abiertos.
      const desvio = (i - (n - 1) / 2) * s.dispersion * GRADOS;
      const a = base + desvio;
      sis.defProyectil.danyo = danyoDe(s, ctx.jugador);
      sis.defProyectil.empuje = s.empuje;
      sis.defProyectil.radio = s.radio;
      sis.defProyectil.perforacion = s.perforacion;
      sis.defProyectil.vida = s.alcance / s.velocidad;
      sis.defProyectil.color = arma.def.color;
      sis.defProyectil.estela = arma.def.estela;
      sis.defProyectil.largo = 9;
      // `defProyectil` es UN objeto compartido por todas las armas, así que todo
      // campo que este comportamiento no escriba se queda con el valor que dejó
      // el disparo anterior —de otra arma—. Sin esta línea, la pistola salía con
      // la forma del lanzagranadas si acababa de disparar el lanzagranadas.
      sis.defProyectil.forma = formaDe(arma);
      // Mismo motivo que `forma`: `hoja` es campo compartido y hay que
      // escribirlo siempre, o el arma hereda el dibujo de la anterior.
      sis.defProyectil.hoja = arma.def.spriteProyectil || null;
      const b = bocaDe(ctx.jugador, a);
      ctx.proyectiles.lanzar(
        b.x, b.y,
        Math.cos(a) * s.velocidad, Math.sin(a) * s.velocidad,
        sis.defProyectil);
    }
    return true;
  },

  // Arco de corte en la dirección de avance. No hay proyectil: se resuelve el
  // cono al instante y se deja un tajo dibujado.
  //
  // Con más de un golpe por activación, los siguientes quedan encolados con su
  // demora: encadenar dos tajos seguidos se siente como una combinación, y
  // soltarlos en el mismo frame no se vería.
  arcoMelee(arma, sis, ctx) {
    sis.golpear(arma, ctx);
    arma.golpesPendientes = arma.stats.golpes - 1;
    arma.demoraGolpe = arma.def.demoraGolpe;
    return true;
  },

  // Escopeta: muchos proyectiles, muy abiertos, de alcance corto.
  //
  // No es el proyectil dirigido con más dispersión. La diferencia está en que
  // aquí el abanico se reparte al AZAR dentro del cono en vez de en posiciones
  // fijas, y los perdigones llevan vida distinta entre sí: eso es lo que hace
  // que el disparo se sienta sucio y no como una formación de tres jabalinas.
  conoCorto(arma, sis, ctx) {
    const s = arma.stats;
    const j = ctx.jugador;
    const objetivo = enemigoMasCercano(ctx.enemigos, j.x, j.y, s.alcance);

    let base;
    if (objetivo) {
      base = Math.atan2(objetivo.y - j.y, objetivo.x - j.x);
    } else {
      // Sin blanco dispara igual, hacia donde mira: una escopeta a bocajarro no
      // espera a tener puntería.
      base = j.mirandoDerecha ? 0 : Math.PI;
    }

    const semi = s.angulo * 0.5 * GRADOS;
    const danyo = danyoDe(s, j);
    for (let i = 0; i < s.proyectiles; i++) {
      const a = base + (ctx.rng() * 2 - 1) * semi;
      const v = s.velocidad * (0.82 + ctx.rng() * 0.36);
      sis.defProyectil.danyo = danyo;
      sis.defProyectil.empuje = s.empuje;
      sis.defProyectil.radio = s.radio;
      sis.defProyectil.perforacion = s.perforacion;
      sis.defProyectil.vida = (s.alcance / v) * (0.8 + ctx.rng() * 0.4);
      sis.defProyectil.color = arma.def.color;
      sis.defProyectil.estela = arma.def.estela;
      sis.defProyectil.largo = 5;
      sis.defProyectil.forma = formaDe(arma);      // ver la nota de arriba
      // Mismo motivo que `forma`: `hoja` es campo compartido y hay que
      // escribirlo siempre, o el arma hereda el dibujo de la anterior.
      sis.defProyectil.hoja = arma.def.spriteProyectil || null;
      const b = bocaDe(j, a);
      ctx.proyectiles.lanzar(b.x, b.y, Math.cos(a) * v, Math.sin(a) * v,
                             sis.defProyectil);
    }
    return true;
  },

  // --- Patrones que NO apuntan -------------------------------------------
  //
  // Todo lo de aquí abajo dispara sin buscar blanco, y esa es la gracia: el
  // jugador no apunta, se COLOCA. Un arma que barre en horizontal te pide
  // alinearte con la horda; una que suelta bombas al azar te pide quedarte en
  // el centro del enjambre. Con seis armas a la vez, la posición correcta es la
  // que satisface a la mayoría, y ahí está la decisión.
  //
  // `patron` decide las direcciones. Se recorren TODAS en cada disparo: un arma
  // de cruz dispara cuatro, no una al azar entre cuatro.
  direccionFija(arma, sis, ctx) {
    const s = arma.stats;
    const j = ctx.jugador;
    const dirs = PATRONES[arma.def.patron] || PATRONES.horizontal;
    const danyo = danyoDe(s, j);

    for (let d = 0; d < dirs.length; d++) {
      const base = dirs[d];
      for (let i = 0; i < s.proyectiles; i++) {
        const desvio = (i - (s.proyectiles - 1) / 2) * s.dispersion * GRADOS;
        sis._rellenarProyectil(arma, s, danyo);
        sis.defProyectil.vida = s.alcance / s.velocidad;
        const a = base + desvio;
        const b = bocaDe(j, a);
        ctx.proyectiles.lanzar(b.x, b.y,
          Math.cos(a) * s.velocidad, Math.sin(a) * s.velocidad, sis.defProyectil);
      }
    }
    return true;
  },

  // Dirección al azar en cada disparo. Cubre el mapa a la larga y no pide nada
  // al jugador salvo estar rodeado, que es donde quiere estar de todas formas.
  direccionAleatoria(arma, sis, ctx) {
    const s = arma.stats;
    const j = ctx.jugador;
    const danyo = danyoDe(s, j);
    for (let i = 0; i < s.proyectiles; i++) {
      const a = ctx.rng() * Math.PI * 2;
      sis._rellenarProyectil(arma, s, danyo);
      sis.defProyectil.vida = s.alcance / s.velocidad;
      const b = bocaDe(j, a);
      ctx.proyectiles.lanzar(b.x, b.y,
        Math.cos(a) * s.velocidad, Math.sin(a) * s.velocidad, sis.defProyectil);
    }
    return true;
  },

  // Lanzagranadas: sale en una dirección y REVIENTA al tocar a alguien, o al
  // agotar su vuelo. El daño de impacto es pequeño; el gordo va en la onda.
  proyectilExplosivo(arma, sis, ctx) {
    const s = arma.stats;
    const j = ctx.jugador;
    const danyo = danyoDe(s, j);

    let base;
    if (arma.def.patron) {
      const dirs = PATRONES[arma.def.patron];
      base = dirs[(ctx.rng() * dirs.length) | 0];
    } else {
      const obj = enemigoMasCercano(ctx.enemigos, j.x, j.y, s.alcance);
      base = obj ? Math.atan2(obj.y - j.y, obj.x - j.x) : ctx.rng() * Math.PI * 2;
    }

    for (let i = 0; i < s.proyectiles; i++) {
      const a = base + (i - (s.proyectiles - 1) / 2) * s.dispersion * GRADOS;
      sis._rellenarProyectil(arma, s, danyo);
      sis.defProyectil.vida = s.alcance / s.velocidad;
      sis.defProyectil.radioExplosion = areaDe(s.radioExplosion, j);
      sis.defProyectil.danyoExplosion = Math.round(s.danyoExplosion * (1 + j.bonusDanyo));
      sis.defProyectil.estallaAlExpirar = true;
      const b = bocaDe(j, a);
      ctx.proyectiles.lanzar(b.x, b.y,
        Math.cos(a) * s.velocidad, Math.sin(a) * s.velocidad, sis.defProyectil);
    }
    return true;
  },

  // Bombardeo: las bombas caen en puntos AL AZAR de la pantalla visible. No hay
  // nada que apuntar y llega a sitios donde el jugador no está.
  bombardeoAleatorio(arma, sis, ctx) {
    const s = arma.stats;
    const j = ctx.jugador;
    const danyo = Math.round(s.danyoExplosion * (1 + j.bonusDanyo));
    const radio = areaDe(s.radioExplosion, j);

    for (let i = 0; i < s.proyectiles; i++) {
      // Dentro del viewport, centrado en el jugador: caer fuera de cámara sería
      // regalar daño que nadie ve.
      const x = j.x + (ctx.rng() - 0.5) * ANCHO_LOGICO * 0.9;
      const y = j.y + (ctx.rng() - 0.5) * ALTO_LOGICO * 0.9;
      ctx.zonas.crear({
        x, y, radio, radioIni: radio * 0.15, duracion: s.duracion,
        danyo, empuje: s.empuje, modo: 'onda', color: arma.def.color,
        relleno: 0.3
      });
    }
    return true;
  },

  // Onda circular que sale del jugador y se expande. Barre los 360 grados, así
  // que premia estar rodeado en vez de buscar un flanco.
  ondaCircular(arma, sis, ctx) {
    const s = arma.stats;
    const j = ctx.jugador;
    ctx.zonas.crear({
      x: j.x, y: j.y - 6,
      radio: areaDe(s.radio, j), radioIni: 6,
      duracion: s.duracion,
      danyo: danyoDe(s, j), empuje: s.empuje,
      modo: 'onda', color: arma.def.color, relleno: 0.08
    });
    return true;
  },

  // Charco o red que se queda en el suelo dañando por tics. `ralentiza` la
  // convierte en arma de control en vez de de daño.
  zonaPersistente(arma, sis, ctx) {
    const s = arma.stats;
    const j = ctx.jugador;
    for (let i = 0; i < s.charcos; i++) {
      const a = ctx.rng() * Math.PI * 2;
      const d = i === 0 ? 0 : 20 + ctx.rng() * 45;
      ctx.zonas.crear({
        x: j.x + Math.cos(a) * d, y: j.y + Math.sin(a) * d,
        radio: areaDe(s.radio, j), duracion: s.duracion,
        danyo: danyoDe(s, j), intervalo: s.intervalo,
        empuje: s.empuje, ralentiza: s.ralentiza || 0,
        modo: 'zona', color: arma.def.color, relleno: 0.22,
        sprite: arma.def.sprite, giro: arma.def.giro
      });
    }
    return true;
  },

  // TORMENTA: rayos que caen del cielo en un área alrededor del jugador y
  // revientan donde tocan.
  //
  // No apunta a nadie, y esa es toda su personalidad. El resto del arsenal
  // busca —al más cercano, hacia donde avanzas, en la dirección del ratón— y
  // esta siembra: cubre un área y lo que esté dentro se lleva lo suyo. Se juega
  // distinto porque premia meterse en el montón en vez de encarar.
  //
  // Los rayos NO caen todos a la vez: se encadenan con `demoraGolpe` usando el
  // mismo mecanismo que los tajos de un arma melé (ver `actualizar`). Soltar
  // siete de golpe sería un fogonazo único; escalonados a doce centésimas se
  // lee como una tormenta, que es lo que se pidió.
  tormentaRayos(arma, sis, ctx) {
    sis.caerRayo(arma, ctx);
    arma.golpesPendientes = arma.stats.rayos - 1;
    arma.demoraGolpe = arma.def.demoraGolpe;
    arma.repetir = sis.caerRayo;
    return true;
  },

  // Aura pegada al jugador. No se recrea cada ciclo: se refresca la que hay, o
  // el pool se llenaría de auras muertas.
  auraPasiva(arma, sis, ctx) {
    const s = arma.stats;
    const j = ctx.jugador;
    if (arma.zona && arma.zona.vida > 0 && arma.zona.seguir === j) {
      arma.zona.vida = arma.zona.vidaMax;
      arma.zona.radio = areaDe(s.radio, j);
      arma.zona.danyo = danyoDe(s, j);
      return true;
    }
    const desvio = medioAlto(j);
    arma.zona = ctx.zonas.crear({
      x: j.x, y: j.y - desvio, desvioY: desvio,
      radio: areaDe(s.radio, j), duracion: 1.0,
      danyo: danyoDe(s, j), intervalo: s.intervalo,
      empuje: s.empuje, modo: 'zona', seguir: j,
      color: arma.def.color, relleno: 0.10,
      sprite: arma.def.sprite, giro: arma.def.giro
    });
    return true;
  },

  // Rayo que atraviesa. Es instantáneo: no hay proyectil que seguir, se resuelve
  // la línea y se deja el trazo dibujado. Perfora sin límite por definición.
  rayoPerforante(arma, sis, ctx) {
    const s = arma.stats;
    const j = ctx.jugador;
    const dirs = PATRONES[arma.def.patron] || PATRONES.horizontal;
    const danyo = danyoDe(s, j);
    const items = ctx.enemigos.pool.items;

    for (let d = 0; d < dirs.length; d++) {
      const a = dirs[d];
      const ux = Math.cos(a), uy = Math.sin(a);
      // Se busca en un radio igual al alcance y se filtra por distancia a la
      // recta: mucho más barato que marchar el rayo paso a paso.
      const n = enemigosEnRadio(ctx.enemigos, j.x, j.y, s.alcance, sis._alcanzados);
      for (let i = 0; i < n; i++) {
        const e = items[sis._alcanzados[i]];
        const dx = e.x - j.x, dy = e.y - (j.y - 8);
        const proy = dx * ux + dy * uy;
        if (proy < 0) continue;                       // detrás del jugador
        const perp = Math.abs(dx * uy - dy * ux);     // distancia a la recta
        if (perp > s.grosor + e.radioCuerpo) continue;
        ctx.enemigos.danyar(e, danyo, ux, uy, s.empuje);
      }
      sis._anotarRayo(j.x, j.y - 8, a, s.alcance, s.grosor, arma.def.color);
    }
    return true;
  },

  // Escudos que orbitan. No usan proyectil: su posición sale del ángulo, y el
  // daño se resuelve por contacto en cada paso con su propio sello para no
  // machacar al mismo enemigo sesenta veces por segundo.
  orbital(arma, sis, ctx) {
    // Se "dispara" una vez y luego vive en actualizarOrbitales.
    arma.orbitalActivo = true;
    return true;
  },

  // Orbital INTERMITENTE: sale, gira unos segundos y se retira hasta la próxima
  // recarga. El orbital normal, una vez encendido, ya no se apaga nunca.
  //
  // La diferencia no es cosmética, es de juego. Un orbital permanente es una
  // defensa: mientras lo lleves, nadie te toca por ese anillo, y eso vuelve
  // pasiva la posición del jugador. Uno que aparece y desaparece te obliga a
  // llevar la cuenta y a decidir cuándo te metes en el montón y cuándo esperas
  // fuera. A cambio de esa ventana pega mucho más que el permanente.
  orbitalPulsante(arma, sis, ctx) {
    arma.orbitalActivo = true;
    arma.restanteOrbital = arma.stats.duracion;
    return true;
  }
};

// Direcciones de cada patrón, en radianes. Y crece hacia ABAJO en pantalla.
const PATRONES = {
  horizontal: [0, Math.PI],
  vertical: [-Math.PI / 2, Math.PI / 2],
  cruz: [0, Math.PI / 2, Math.PI, -Math.PI / 2],
  diagonal: [Math.PI / 4, 3 * Math.PI / 4, -3 * Math.PI / 4, -Math.PI / 4],
  adelante: [0]
};

// CÓMO SE DIBUJA CADA PROYECTIL.
//
// Hasta ahora los 52 armas del catálogo se veían igual: una raya de color con
// estela. El comportamiento —lo que el arma HACE, que ya está en datos/armas.js—
// es también lo que mejor describe qué debería parecer, así que la forma sale de
// ahí por defecto y no hay que anotarla arma por arma.
//
// Un arma puede llevar su propio `forma` en los datos cuando el comportamiento
// se queda corto. Pasa con las armas de fuego: comparten `proyectilDirigido` con
// el pilum y con el arco, pero una bala no es una jabalina.
function formaDe(arma) {
  return arma.def.forma || FORMA_POR_COMPORTAMIENTO[arma.def.comportamiento] || 'raya';
}

const FORMA_POR_COMPORTAMIENTO = {
  proyectilDirigido:   'dardo',
  direccionFija:       'dardo',
  direccionAleatoria:  'dardo',
  proyectilExplosivo:  'bola',
  rayoPerforante:      'rayo'
};

export class Armas {
  constructor(rng) {
    this.equipadas = [];
    this._rng = rng;
    this._alcanzados = new Int32Array(MAX_ALCANZADOS);
    this._avisadas = new Set();       // comportamientos sin implementar ya avisados

    // Descriptor reutilizado para lanzar proyectiles: se rellena y se pasa, en
    // vez de construir un objeto literal por disparo.
    this.defProyectil = {
      vida: 0, danyo: 0, empuje: 0, radio: 0,
      perforacion: 0, color: '#fff', estela: null, largo: 8, forma: 'raya',
      hoja: null
    };

    // Tajos para dibujar, preasignados.
    this.tajos = new Array(MAX_TAJOS);
    for (let i = 0; i < MAX_TAJOS; i++) {
      this.tajos[i] = { x: 0, y: 0, ang: 0, semi: 0, alcance: 0, vida: 0, vidaMax: 1,
                        color: '#fff', hoja: null,
                        // A quién va pegado el tajo, y cuánto por encima de su
                        // posición. Ver actualizarTajos.
                        seguir: null, desvioY: 0 };
    }
    this.nTajos = 0;

    // Rayos dibujados, mismo esquema de buffer circular que los tajos.
    this.rayos = new Array(MAX_TAJOS);
    for (let i = 0; i < MAX_TAJOS; i++) {
      this.rayos[i] = { x: 0, y: 0, ang: 0, largo: 0, grosor: 0, vida: 0, vidaMax: 1, color: '#fff' };
    }
    this.nRayos = 0;
  }

  // Rellena el descriptor de proyectil con lo común a todos los comportamientos.
  // Cada uno ajusta después lo suyo (vida, explosión).
  _rellenarProyectil(arma, s, danyo) {
    const d = this.defProyectil;
    // La FORMA con que se dibuja. Sale del comportamiento salvo que el arma diga
    // otra cosa: ver FORMA_POR_COMPORTAMIENTO, aquí arriba.
    d.forma = formaDe(arma);
    // Dibujo propio del proyectil, si el arma lo declara. Sustituye a la forma
    // trazada entera (cuerpo, halo y estela): ver entidades/proyectil.js.
    d.hoja = arma.def.spriteProyectil || null;
    d.danyo = danyo;
    d.empuje = s.empuje;
    d.radio = s.radio;
    d.perforacion = s.perforacion;
    d.color = arma.def.color;
    d.estela = arma.def.estela;
    d.largo = arma.def.largoTrazo || 8;
    d.radioExplosion = 0;
    d.danyoExplosion = 0;
    d.estallaAlExpirar = false;
  }

  // UN rayo de la tormenta. Va aquí y no dentro del comportamiento porque se
  // llama dos veces: al activarse el arma y luego una vez por cada rayo
  // encadenado (ver `repetir` en `actualizar`).
  caerRayo(arma, ctx) {
    const s = arma.stats;
    const j = ctx.jugador;

    // Punto al azar dentro del DISCO de alcance. La raíz cuadrada es lo que
    // reparte uniforme por ÁREA: sin ella, la mitad de los rayos caería en el
    // círculo central —que es una cuarta parte del área— y la tormenta se
    // apelotonaría encima del jugador en vez de cubrir la zona.
    const a = ctx.rng() * Math.PI * 2;
    const d = Math.sqrt(ctx.rng()) * areaDe(s.alcance, j);
    const x = j.x + Math.cos(a) * d;
    const y = j.y - medioAlto(j) + Math.sin(a) * d;

    // El reventón. Modo 'onda' y no 'zona': hace daño UNA vez a lo que pilla al
    // abrirse, como una explosión, en vez de por tics — un rayo golpea al caer,
    // no se queda quemando.
    const radio = areaDe(s.radio, j);
    ctx.zonas.crear({
      x, y,
      radio, radioIni: radio * 0.18,
      duracion: 0.26, danyo: danyoDe(s, j),
      empuje: s.empuje, modo: 'onda',
      color: arma.def.color, relleno: 0.34
    });

    // Y el haz cayendo a plomo sobre el punto: se traza desde `caida` unidades
    // más arriba hacia abajo (PI/2), así que entra en cuadro desde el cielo.
    this._anotarRayo(x, y - s.caida, Math.PI / 2, s.caida, s.grosor, arma.def.color);
    if (!Particulas.saturado()) {
      Particulas.estallido(x, y, 5, 95, 0.24, 1.5, COLOR_CHISPA, 0.35, this._rng);
    }
  }

  _anotarRayo(x, y, ang, largo, grosor, color) {
    const r = this.rayos[this.nRayos % MAX_TAJOS];
    this.nRayos++;
    r.x = x; r.y = y; r.ang = ang; r.largo = largo;
    r.grosor = grosor; r.vida = r.vidaMax = 0.12; r.color = color;
  }

  // Los orbitales no "disparan": existen. Se actualizan aparte, cada paso, y
  // dañan por contacto. El sello se renueva cada ORBITAL_CADENCIA segundos para
  // que un escudo pegado a un enemigo no le pegue sesenta veces por segundo.
  actualizarOrbitales(dt, ctx) {
    for (let i = 0; i < this.equipadas.length; i++) {
      const arma = this.equipadas[i];
      if (!arma.orbitalActivo) continue;
      const s = arma.stats;
      const j = ctx.jugador;

      // Los intermitentes traen `duracion` y se retiran al agotarla. Los
      // permanentes no la tienen, así que ni se compara: es la misma rama para
      // los dos y no hay que preguntar por el nombre del comportamiento en el
      // bucle.
      if (s.duracion > 0) {
        arma.restanteOrbital -= dt;
        if (arma.restanteOrbital <= 0) { arma.orbitalActivo = false; continue; }
      }

      // Giro del escudo SOBRE SÍ MISMO, distinto de su vuelta alrededor del
      // jugador. Un disco de sierra que orbita sin girar parece una chapa
      // pegada; un escudo, en cambio, no debe girar nunca o su emblema acaba
      // boca abajo la mitad del tiempo. Por eso es un dato del arma y no una
      // regla del motor. Fase propia y avanzada con dt: determinista.
      if (arma.def.giroOrbital) arma.faseGiro += arma.def.giroOrbital * dt;

      arma.anguloOrbital += dt * s.velocidadAngular;
      arma.relojOrbital -= dt;
      if (arma.relojOrbital <= 0) {
        arma.relojOrbital = ORBITAL_CADENCIA;
        arma.selloOrbital = -(++contadorSelloOrbital);   // negativo: no choca
      }                                                   // con los proyectiles

      const radio = areaDe(s.radioOrbita, j);
      const danyo = danyoDe(s, j);
      const items = ctx.enemigos.pool.items;
      const cy = j.y - medioAlto(j);       // centro visual, no la línea de pies

      for (let k = 0; k < s.escudos; k++) {
        const a = arma.anguloOrbital + (k / s.escudos) * Math.PI * 2;
        const ox = j.x + Math.cos(a) * radio;
        const oy = cy + Math.sin(a) * radio;
        const n = enemigosEnRadio(ctx.enemigos, ox, oy, s.radioEscudo, this._alcanzados);
        for (let q = 0; q < n; q++) {
          const e = items[this._alcanzados[q]];
          if (e.ultimoSello === arma.selloOrbital) continue;
          e.ultimoSello = arma.selloOrbital;
          const dx = e.x - j.x, dy = e.y - j.y;
          const d = Math.hypot(dx, dy) || 1;
          ctx.enemigos.danyar(e, danyo, dx / d, dy / d, s.empuje);
        }
      }
    }
  }

  // Un orbital es un OBJETO, no una luz.
  //
  // Estaba dibujado como disco relleno en 'lighter' y sobre la arena clara del
  // anfiteatro eso satura enseguida: salían bolas BLANCAS, sin el color del
  // arma, sin canto, y tapando a los enemigos de debajo. Un escudo que no se
  // distingue de otro escudo no informa de nada, y con tres armas orbitales en
  // el catálogo eso importa.
  //
  // Van en dos pasadas. Primero un halo aditivo flojo, que es lo que da el calor
  // y lo que se acumula cuando varios se juntan; encima el cuerpo opaco con
  // reborde oscuro, que le devuelve el color y el borde.
  dibujarOrbitales(ctx, jugador) {
    for (let i = 0; i < this.equipadas.length; i++) {
      const arma = this.equipadas[i];
      if (!arma.orbitalActivo) continue;
      const s = arma.stats;
      const radio = areaDe(s.radioOrbita, jugador);
      const r = s.radioEscudo;
      const paso = (Math.PI * 2) / s.escudos;
      // MISMO centro que usa la colisión en `actualizarOrbitales`: el visual y
      // el daño de un orbital tienen que orbitar el mismo punto o el escudo
      // pega donde no se ve.
      // Posición INTERPOLADA, la misma con la que se dibuja el personaje. Con
      // la del paso de lógica los escudos van un paso por detrás de su dueño y
      // a mucho fps se nota como un baile alrededor de él.
      const cx = jugador.xVista;
      const cy = jugador.yVista - medioAlto(jugador);

      // CON HOJA PROPIA: el dibujo y nada más. Ni halo ni aro, por el mismo
      // motivo que en las zonas — el sprite está horneado para llenar su cuadro
      // hasta el radio del escudo, así que ya dice dónde está y hasta dónde
      // llega. Añadirle el aro encima sería el círculo de siempre pintado sobre
      // el dibujo nuevo.
      const imgOrb = arma.def.spriteOrbital ? Recursos.imagen(arma.def.spriteOrbital) : null;
      const metaOrb = arma.def.spriteOrbital ? Recursos.meta(arma.def.spriteOrbital) : null;
      if (imgOrb && metaOrb) {
        for (let k = 0; k < s.escudos; k++) {
          const a = arma.anguloOrbital + k * paso;
          // save/restore por escudo, como en los tajos: la matriz del mundo la
          // fija main.js con el desvío de cámara ya redondeado, y reconstruirla
          // aquí sería copiar ese cálculo en un segundo sitio.
          ctx.save();
          ctx.translate(cx + Math.cos(a) * radio, cy + Math.sin(a) * radio);
          if (arma.def.giroOrbital) ctx.rotate(arma.faseGiro);
          ctx.drawImage(imgOrb, 0, 0, metaOrb.w, metaOrb.h, -r, -r, r * 2, r * 2);
          ctx.restore();
        }
        continue;
      }

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = arma.def.color;
      for (let k = 0; k < s.escudos; k++) {
        const a = arma.anguloOrbital + k * paso;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * radio, cy + Math.sin(a) * radio,
                r * 1.35, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Aro, no moneda. Relleno translúcido y canto marcado: relleno opaco
      // tapaba al enemigo que tienes justo encima, y en un juego donde lo que
      // mata es no ver quién se te ha pegado, eso es un efecto que juega en tu
      // contra. Con el aro se sabe dónde está el escudo y se sigue viendo qué
      // hay debajo.
      ctx.save();
      ctx.lineWidth = 1.4;
      for (let k = 0; k < s.escudos; k++) {
        const a = arma.anguloOrbital + k * paso;
        const ox = cx + Math.cos(a) * radio;
        const oy = cy + Math.sin(a) * radio;

        ctx.globalAlpha = 0.32;
        ctx.fillStyle = arma.def.color;
        ctx.beginPath();
        ctx.arc(ox, oy, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(18,12,22,.8)';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.arc(ox, oy, r, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = arma.def.color;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(ox, oy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  equipar(id) {
    const def = ARMAS[id];
    if (!def) return null;
    const arma = {
      id, def, nivel: 1,
      temporizador: 0,
      golpesPendientes: 0,
      demoraGolpe: 0,
      // Estado propio de los comportamientos que lo necesitan.
      orbitalActivo: false, anguloOrbital: 0, relojOrbital: 0, selloOrbital: 0,
      faseGiro: 0,             // giro del escudo sobre sí mismo
      repetir: null,           // qué encadena esta arma; null = un tajo
      restanteOrbital: 0,      // solo el orbital intermitente
      zona: null,
      stats: {}
    };
    this._recalcular(arma);
    this.equipadas.push(arma);
    return arma;
  }

  subirNivel(id) {
    const arma = this.equipadas.find((a) => a.id === id);
    if (!arma || arma.nivel >= MAX_NIVEL) return false;
    arma.nivel++;
    this._recalcular(arma);
    return true;
  }

  // Sustituye un arma por su evolución (sección 9 del plan). Solo lo llama
  // sistemas/progresion.js al abrir un cofre, tras comprobar los requisitos.
  //
  // EN SU SITIO, conservando la posición en `equipadas`: esa posición es la
  // ranura que ocupa en la ficha del jugador, y verla saltar al final de la fila
  // haría parecer que se ha perdido un arma y ganado otra distinta.
  //
  // Se reinicia todo el estado vivo. El comportamiento cambia —un arco de melé
  // pasa a ser una onda, un orbital cambia de número de escudos— y arrastrar el
  // temporizador o el ángulo del anterior deja el primer disparo descolocado.
  //
  // `stats` se cambia por un objeto nuevo en vez de vaciarlo: borrar claves con
  // `delete` mete el objeto en modo diccionario en V8 y este objeto se lee en
  // cada disparo durante el resto de la partida. Es la única asignación, y pasa
  // como mucho cinco veces por partida y siempre con el juego parado en el menú
  // del cofre, nunca dentro del bucle.
  evolucionar(id, idEvo) {
    const arma = this.equipadas.find((a) => a.id === id);
    const def = ARMAS[idEvo];
    if (!arma || !def) return null;

    arma.id = idEvo;
    arma.def = def;
    arma.nivel = 1;
    arma.temporizador = 0;
    arma.golpesPendientes = 0;
    arma.demoraGolpe = 0;
    arma.orbitalActivo = false;
    arma.anguloOrbital = 0;
    arma.relojOrbital = 0;
    arma.selloOrbital = 0;
    arma.restanteOrbital = 0;
    arma.zona = null;          // el charco que hubiera sigue su vida y expira
    arma.stats = {};
    this._recalcular(arma);
    return arma;
  }

  // Aplana la entrada base más los incrementos acumulados hasta el nivel
  // actual. Se hace al equipar y al subir de nivel, nunca en caliente.
  _recalcular(arma) {
    const s = arma.stats;
    for (const k in arma.def) {
      const v = arma.def[k];
      if (typeof v === 'number') s[k] = v;
    }
    const niveles = arma.def.niveles;
    if (!niveles) return;
    for (let i = 1; i < arma.nivel && i < niveles.length; i++) {
      const delta = niveles[i];
      for (const k in delta) s[k] = (s[k] || 0) + delta[k];
    }
    if (s.recarga !== undefined && s.recarga < 0.15) s.recarga = 0.15;
  }

  actualizar(dt, ctx) {
    for (let i = 0; i < this.equipadas.length; i++) {
      const arma = this.equipadas[i];

      // Golpes encadenados pendientes de la activación anterior.
      //
      // QUIÉN repite lo decide el arma, no este bucle. Un arco melé encadena
      // tajos y una tormenta encadena rayos, y son cosas distintas; el
      // comportamiento deja su función en `arma.repetir` al activarse y aquí
      // solo se la llama. Preguntar por el nombre del comportamiento habría
      // metido en el motor genérico el conocimiento de un arma concreta, que es
      // justo lo que este archivo evita.
      if (arma.golpesPendientes > 0) {
        arma.demoraGolpe -= dt;
        if (arma.demoraGolpe <= 0) {
          (arma.repetir || this.golpear).call(this, arma, ctx);
          arma.golpesPendientes--;
          arma.demoraGolpe = arma.def.demoraGolpe;
        }
      }

      arma.temporizador -= dt;
      if (arma.temporizador > 0) continue;

      const fn = COMPORTAMIENTOS[arma.def.comportamiento];
      if (!fn) {
        // Comportamiento aún no implementado (Fase 4). Se avisa UNA vez y se
        // deja el arma inerte, en vez de reventar la partida.
        if (!this._avisadas.has(arma.def.comportamiento)) {
          this._avisadas.add(arma.def.comportamiento);
          console.warn(`[armas] comportamiento sin implementar: ${arma.def.comportamiento}`);
        }
        arma.temporizador = 1;
        continue;
      }

      // Si el comportamiento no encuentra a quién pegar, se reintenta pronto en
      // vez de gastar la recarga entera: el arma no debe "perder" un ciclo por
      // haber disparado al vacío.
      arma.temporizador = fn(arma, this, ctx)
        ? recargaDe(arma.stats, ctx.jugador)
        : 0.1;
    }
  }

  // Resuelve un tajo: daña a todo lo vivo dentro del cono y deja el efecto.
  golpear(arma, ctx) {
    const s = arma.stats;
    const j = ctx.jugador;
    // Dirección: hacia donde se mueve; si está parado, hacia donde mira.
    let ax = j.x - j.xPrev;
    let ay = j.y - j.yPrev;
    if (Math.abs(ax) < 0.0001 && Math.abs(ay) < 0.0001) {
      ax = j.mirandoDerecha ? 1 : -1;
      ay = 0;
    }
    const ang = Math.atan2(ay, ax);
    const semi = s.angulo * 0.5 * GRADOS;
    const alcance = areaDe(s.alcance, j);
    const danyo = danyoDe(s, j);

    const n = enemigosEnRadio(ctx.enemigos, j.x, j.y, alcance, this._alcanzados);
    const items = ctx.enemigos.pool.items;
    for (let i = 0; i < n; i++) {
      const e = items[this._alcanzados[i]];
      const dx = e.x - j.x;
      const dy = e.y - j.y;
      // Diferencia angular normalizada a [-PI, PI]
      let d = Math.atan2(dy, dx) - ang;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) > semi) continue;

      const m = Math.hypot(dx, dy) || 1;
      ctx.enemigos.danyar(e, danyo, dx / m, dy / m, s.empuje);
    }

    // Centro visual del jugador, no su línea de pies: el área de un arma tiene
    // que envolver la figura entera, no salirle por debajo. Ver `medioAlto`.
    const desvio = medioAlto(j);
    const cyj = j.y - desvio;
    this._anotarTajo(j.x, cyj, ang, semi, alcance, arma.def.color,
                     arma.def.spriteTajo || null, arma.def.duracionTajo, j, desvio);
    Particulas.estallido(j.x + Math.cos(ang) * alcance * 0.6,
                         cyj + Math.sin(ang) * alcance * 0.6,
                         3, 55, 0.18, 1, COLOR_CHISPA, 0.3, this._rng);
  }

  // `duracion` es SOLO VISUAL. El daño de un arco se resuelve entero en el
  // instante del golpe (ver `golpear`), y el tajo que se anota aquí es el
  // dibujo y nada más — así que alargarlo no cambia el juego, solo cuánto se ve.
  //
  // Por eso los 0,16 s de siempre valían para un arco trazado, que es un
  // destello, y se quedan cortos para una animación de seis fotogramas: salen a
  // 27 ms cada uno y no da tiempo a leerlos. Quien traiga hoja pide su propia
  // duración en `duracionTajo`.
  _anotarTajo(x, y, ang, semi, alcance, color, hoja = null, duracion, seguir = null, desvioY = 0) {
    if (!duracion) duracion = 0.16;
    // Buffer circular: el más viejo cede el sitio.
    const t = this.tajos[this.nTajos % MAX_TAJOS];
    this.nTajos++;
    t.seguir = seguir; t.desvioY = desvioY;
    t.x = x; t.y = y; t.ang = ang; t.semi = semi;
    t.alcance = alcance; t.vida = t.vidaMax = duracion; t.color = color;
    // Referencia a una cadena constante del catálogo, no una cadena nueva: esto
    // corre en cada golpe y aquí no se asigna nada.
    t.hoja = hoja;
  }

  actualizarTajos(dt) {
    for (let i = 0; i < MAX_TAJOS; i++) {
      const t = this.tajos[i];
      // EL TAJO VA PEGADO AL JUGADOR mientras dura.
      //
      // Antes se anotaba la posición del golpe y ahí se quedaba, y con un arco
      // trazado de 0,16 s casi no se notaba. Con una animación de 0,34 s sí: al
      // moverse, el barrido se quedaba atrás y se veía como un aro suelto en el
      // suelo en vez de un arma girando alrededor del personaje.
      //
      // Solo afecta al DIBUJO. El daño de un arco se resuelve entero en el
      // instante del golpe, así que arrastrar el trazo no alarga ni desplaza a
      // quién alcanza: lo que se corrige es la mentira de que el efecto esté
      // donde el personaje ya no está.
      if (t.vida > 0 && t.seguir) {
        t.x = t.seguir.x;
        t.y = t.seguir.y - t.desvioY;
      }
      if (t.vida > 0) t.vida -= dt;
      const r = this.rayos[i];
      if (r.vida > 0) r.vida -= dt;
    }
  }

  // Trazo del rayo: un haz que se abre y se apaga. Como el resto de efectos, en
  // 'lighter' y por código.
  dibujarRayos(ctx) {
    let hay = false;
    for (let i = 0; i < MAX_TAJOS; i++) if (this.rayos[i].vida > 0) { hay = true; break; }
    if (!hay) return;

    // Dos trazos: un halo aditivo ancho y flojo, y encima el núcleo del COLOR
    // del arma en composición normal.
    //
    // Antes era un solo trazo grueso en 'lighter' y sobre la arena clara se
    // saturaba a blanco puro: un rayo rosa y uno azul se veían idénticos, y una
    // recta blanca cruzando la pantalla de lado a lado parece un fallo de
    // dibujado más que un disparo. El núcleo opaco es lo que le devuelve el
    // color y lo que hace que se lea como un haz.
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < MAX_TAJOS; i++) {
      const r = this.rayos[i];
      if (r.vida <= 0) continue;
      const k = r.vida / r.vidaMax;
      const x2 = r.x + Math.cos(r.ang) * r.largo;
      const y2 = r.y + Math.sin(r.ang) * r.largo;

      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = k * 0.4;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.grosor * (0.8 + k * 2.2);
      ctx.beginPath();
      ctx.moveTo(r.x, r.y);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = k;
      ctx.lineWidth = r.grosor * (0.35 + k * 0.5);
      ctx.beginPath();
      ctx.moveTo(r.x, r.y);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // El arco se dibuja por código, como el resto de efectos: un sector con el
  // borde encendido que se abre y se apaga.
  dibujarTajos(ctx) {
    let hay = false;
    for (let i = 0; i < MAX_TAJOS; i++) if (this.tajos[i].vida > 0) { hay = true; break; }
    if (!hay) return;

    ctx.save();
    // Aditivo, igual que el arco trazado que había antes. Y con la hoja de la
    // katana no es solo coherencia: está pintada sobre negro y con un halo muy
    // difuso que se desborda de su celda, así que sumando luz el halo oscuro
    // sencillamente no existe y no hay canto recto que disimular.
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < MAX_TAJOS; i++) {
      const t = this.tajos[i];
      if (t.vida <= 0) continue;
      const k = t.vida / t.vidaMax;              // 1 al salir, 0 al apagarse

      // Pegado a la posición INTERPOLADA del jugador, no a la del último paso
      // de lógica: el personaje se dibuja interpolado, y usar aquí la otra
      // dejaría el barrido un paso por detrás de su propio dueño — justo el
      // temblor que se quería quitar, pero más fino.
      const tx = t.seguir ? t.seguir.xVista : t.x;
      const ty = t.seguir ? t.seguir.yVista - t.desvioY : t.y;

      const img = t.hoja ? Recursos.imagen(t.hoja) : null;
      const meta = t.hoja ? Recursos.meta(t.hoja) : null;
      if (img && meta) {
        // FASE POR VIDA. La hoja son fotogramas de un barrido que CRECE, así
        // que se recorren de principio a fin en los 0,16 s que dura el tajo.
        const fases = meta.frames || 1;
        let f = ((1 - k) * fases) | 0;
        if (f >= fases) f = fases - 1;

        // Y SE APAGA AL FINAL, que la hoja no trae. Los seis fotogramas van de
        // destello a anillo cerrado y ahí se acaban: sin esto, el tajo
        // desaparecería de golpe en su fotograma más denso. El último tercio de
        // vida se desvanece.
        ctx.globalAlpha = k < 0.34 ? k / 0.34 : 1;

        // Girado con la dirección del golpe. En la Katana —un barrido de 360°—
        // esto no cambia dónde se hace daño, pero evita que dos tajos seguidos
        // salgan calcados: el anillo entra orientado hacia donde atacas.
        //
        // save/restore por tajo, y no un setTransform de vuelta: la matriz del
        // mundo la fija main.js con el desvío de cámara ya redondeado, y
        // reconstruirla aquí sería copiar ese cálculo en un segundo sitio para
        // que se desincronice el día que cambie. Son doce como mucho.
        ctx.save();
        ctx.translate(tx, ty);
        ctx.rotate(t.ang);
        const r = t.alcance;
        // Medio lado = alcance. El recorte se hizo con el radio del contenido
        // más lejano de la hoja, así que el filo del dibujo cae justo donde
        // acaba el daño. Ver RecortarRejilla en herramientas/procesar-assets.ps1.
        ctx.drawImage(img, f * meta.w, 0, meta.w, meta.h,
                      -r, -r, r * 2, r * 2);
        ctx.restore();
        continue;
      }

      const r = t.alcance * (0.75 + (1 - k) * 0.25);
      ctx.globalAlpha = k * 0.75;
      ctx.strokeStyle = t.color;
      ctx.lineWidth = 2 + k * 2;
      ctx.beginPath();
      ctx.arc(tx, ty, r, t.ang - t.semi, t.ang + t.semi);
      ctx.stroke();
    }
    ctx.restore();
  }

  vaciar() {
    for (let i = 0; i < MAX_TAJOS; i++) this.tajos[i].vida = 0;
    for (let i = 0; i < this.equipadas.length; i++) {
      this.equipadas[i].temporizador = 0;
      this.equipadas[i].golpesPendientes = 0;
    }
  }
}
