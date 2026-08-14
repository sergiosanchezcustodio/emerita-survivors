import { ANCHO_LOGICO, ALTO_LOGICO } from '../core/constantes.js';
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
      ctx.proyectiles.lanzar(
        ctx.jugador.x, ctx.jugador.y - 8,
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
      ctx.proyectiles.lanzar(j.x, j.y - 8, Math.cos(a) * v, Math.sin(a) * v,
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
        ctx.proyectiles.lanzar(j.x, j.y - 8,
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
      ctx.proyectiles.lanzar(j.x, j.y - 8,
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
      ctx.proyectiles.lanzar(j.x, j.y - 8,
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
        modo: 'zona', color: arma.def.color, relleno: 0.22
      });
    }
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
    arma.zona = ctx.zonas.crear({
      x: j.x, y: j.y - 6,
      radio: areaDe(s.radio, j), duracion: 1.0,
      danyo: danyoDe(s, j), intervalo: s.intervalo,
      empuje: s.empuje, modo: 'zona', seguir: j,
      color: arma.def.color, relleno: 0.10
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
      perforacion: 0, color: '#fff', estela: null, largo: 8, forma: 'raya'
    };

    // Tajos para dibujar, preasignados.
    this.tajos = new Array(MAX_TAJOS);
    for (let i = 0; i < MAX_TAJOS; i++) {
      this.tajos[i] = { x: 0, y: 0, ang: 0, semi: 0, alcance: 0, vida: 0, vidaMax: 1, color: '#fff' };
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

      arma.anguloOrbital += dt * s.velocidadAngular;
      arma.relojOrbital -= dt;
      if (arma.relojOrbital <= 0) {
        arma.relojOrbital = ORBITAL_CADENCIA;
        arma.selloOrbital = -(++contadorSelloOrbital);   // negativo: no choca
      }                                                   // con los proyectiles

      const radio = areaDe(s.radioOrbita, j);
      const danyo = danyoDe(s, j);
      const items = ctx.enemigos.pool.items;

      for (let k = 0; k < s.escudos; k++) {
        const a = arma.anguloOrbital + (k / s.escudos) * Math.PI * 2;
        const ox = j.x + Math.cos(a) * radio;
        const oy = j.y - 6 + Math.sin(a) * radio;
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

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = arma.def.color;
      for (let k = 0; k < s.escudos; k++) {
        const a = arma.anguloOrbital + k * paso;
        ctx.beginPath();
        ctx.arc(jugador.x + Math.cos(a) * radio, jugador.y - 6 + Math.sin(a) * radio,
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
        const ox = jugador.x + Math.cos(a) * radio;
        const oy = jugador.y - 6 + Math.sin(a) * radio;

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
      if (arma.golpesPendientes > 0) {
        arma.demoraGolpe -= dt;
        if (arma.demoraGolpe <= 0) {
          this.golpear(arma, ctx);
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

    this._anotarTajo(j.x, j.y - 6, ang, semi, alcance, arma.def.color);
    Particulas.estallido(j.x + Math.cos(ang) * alcance * 0.6,
                         j.y - 6 + Math.sin(ang) * alcance * 0.6,
                         3, 55, 0.18, 1, COLOR_CHISPA, 0.3, this._rng);
  }

  _anotarTajo(x, y, ang, semi, alcance, color) {
    // Buffer circular: el más viejo cede el sitio.
    const t = this.tajos[this.nTajos % MAX_TAJOS];
    this.nTajos++;
    t.x = x; t.y = y; t.ang = ang; t.semi = semi;
    t.alcance = alcance; t.vida = t.vidaMax = 0.16; t.color = color;
  }

  actualizarTajos(dt) {
    for (let i = 0; i < MAX_TAJOS; i++) {
      const t = this.tajos[i];
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
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < MAX_TAJOS; i++) {
      const t = this.tajos[i];
      if (t.vida <= 0) continue;
      const k = t.vida / t.vidaMax;              // 1 al salir, 0 al apagarse
      const r = t.alcance * (0.75 + (1 - k) * 0.25);
      ctx.globalAlpha = k * 0.75;
      ctx.strokeStyle = t.color;
      ctx.lineWidth = 2 + k * 2;
      ctx.beginPath();
      ctx.arc(t.x, t.y, r, t.ang - t.semi, t.ang + t.semi);
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
