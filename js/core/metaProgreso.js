import { POTENCIADORES, costePotenciador } from '../datos/potenciadores.js';
import { MASCOTAS, MAX_NIVEL_MASCOTA, costeMascota } from '../datos/mascotas.js';
import { PERSONAJES, ORDEN_PERSONAJES } from '../datos/personajes.js';

// Progreso META: lo único que sobrevive entre partidas. Ver CLAUDE.md —
// `localStorage` está permitido aquí PORQUE nada de esto se lee durante la
// simulación de una partida activa: los denarios se ganan en memoria mientras
// se juega y solo se leen (para gastar en la tienda) o se escriben (para
// guardarlos) fuera de una partida en curso o en sus pausas naturales. La
// PARTIDA en sí sigue sin tocar `localStorage` para nada, así que dos
// partidas con la misma semilla siguen siendo reproducibles.
//
// Qué se guarda: los denarios, el nivel de cada potenciador, el nivel de cada
// mascota y qué personajes están desbloqueados. Es lo que pidió Sergio: el
// dinero no se pierde al morir, se acumula, y todo lo comprado sigue ahí en la
// partida siguiente.
// TRES HUECOS, TRES CLAVES, y no una clave con las tres partidas dentro.
//
// Cada hueco guarda EXACTAMENTE el mismo objeto que guardaba la versión de una
// sola partida, así que `normalizar` no ha tenido que cambiar. Y un guardado
// corrupto se lleva por delante un hueco, no los tres: con todo en una clave,
// un JSON roto dejaría al jugador sin ninguna de sus partidas.
const NUM_HUECOS = 3;
const CLAVE_HUECO = 'emerita-meta-v2-hueco';
const CLAVE_ULTIMO = 'emerita-hueco-usado';

// La clave de la versión de una sola partida. NO se lee ni se borra: se queda
// donde está, intacta, y simplemente ya no la mira nadie. Sergio pidió que los
// tres huecos empezaran vacíos, y eso se cumple igual sin tirar lo acumulado —
// si algún día lo quiere de vuelta, sigue en el navegador.
const CLAVE_VIEJA = 'emerita-meta-v1';
void CLAVE_VIEJA;

function claveDe(hueco) { return CLAVE_HUECO + hueco; }

// `personajes: null` y no `{}`, que es la diferencia entre "no hay nada
// guardado" y "hay un guardado que dice que no tienes ninguno". Con `{}`,
// normalizar lo daba por bueno y marcaba los cuatro como bloqueados: empezar de
// cero te dejaba sin personajes y sin poder jugar.
function estadoPorDefecto() {
  return {
    // Mientras vale true, `guardar()` no escribe. Ver core/determinismo.js.
  _congelado: false,
  denarios: 0, personajes: null, potenciadores: {}, mascotas: {}, mascotaEquipada: '',
    // La hoja de servicios del hueco, que es lo que distingue una partida de
    // otra de un vistazo. `mejorTiempo` en segundos aguantados, no en
    // "victorias": se puede morir en el minuto 28 y eso también cuenta como
    // hasta dónde llegaste.
    partidas: 0, tiempoTotal: 0, mejorTiempo: 0,
    // FASES SUPERADAS: qué niveles se han llegado a terminar, por id. Se guarda
    // el conjunto y no un número porque lo que interesa es CUÁLES, no cuántas
    // veces: terminar Mérida tres veces sigue siendo una fase superada.
    //
    // Hoy solo existe Mérida, así que esto vale 0 o 1. Está preparado para
    // cuando lleguen Cáceres, Trujillo y las demás, que es lo que hay en la
    // hoja de ruta del proyecto.
    fases: {}
  };
}

// Convierte lo guardado al formato de hoy. Es la función que permite cambiar el
// formato sin que nadie pierda lo que llevaba.
function normalizar(datos) {
  const mascotas = {};
  const crudas = (datos.mascotas && typeof datos.mascotas === 'object') ? datos.mascotas : {};
  for (const id in crudas) {
    if (!MASCOTAS[id]) continue;                 // mascota que ya no existe
    // Las mascotas se guardaron primero como `true` (comprada, sin niveles) y
    // ahora como número de nivel. Un `true` de antes vale por el nivel 1: nadie
    // pierde la mascota que ya tenía por haber jugado la versión de ayer.
    const v = crudas[id];
    const nivel = v === true ? 1 : (v | 0);
    if (nivel > 0) mascotas[id] = Math.min(nivel, MAX_NIVEL_MASCOTA);
  }

  const personajes = {};
  const pj = (datos.personajes && typeof datos.personajes === 'object') ? datos.personajes : null;
  for (const id of ORDEN_PERSONAJES) {
    // Sin nada guardado, TODOS desbloqueados. Ver la nota de `coste` en
    // datos/personajes.js: hoy los cuatro son gratis y esto respeta a quien ya
    // venía jugando con ellos.
    personajes[id] = pj ? !!pj[id] : true;
  }

  return {
    denarios: Math.max(0, datos.denarios | 0),
    partidas: Math.max(0, datos.partidas | 0),
    tiempoTotal: Math.max(0, +datos.tiempoTotal || 0),
    mejorTiempo: Math.max(0, +datos.mejorTiempo || 0),
    fases: (datos.fases && typeof datos.fases === 'object') ? datos.fases : {},
    personajes,
    potenciadores: (datos.potenciadores && typeof datos.potenciadores === 'object')
                   ? datos.potenciadores : {},
    mascotas,
    mascotaEquipada: typeof datos.mascotaEquipada === 'string' ? datos.mascotaEquipada : ''
  };
}

function cargar(hueco) {
  try {
    const crudo = localStorage.getItem(claveDe(hueco));
    if (!crudo) return estadoPorDefecto();
    return normalizar(JSON.parse(crudo));
  } catch {
    return estadoPorDefecto();     // JSON corrupto o localStorage no disponible
  }
}

// ¿Hay algo escrito en ese hueco? Se mira la EXISTENCIA de la clave y no si el
// contenido está a cero: un hueco donde se ha jugado y se ha gastado todo sigue
// siendo un hueco ocupado, no uno vacío.
function ocupado(hueco) {
  try { return localStorage.getItem(claveDe(hueco)) !== null; } catch { return false; }
}

// El progreso de OTRO jugador, con la misma forma que necesita entidades/
// jugador.js: sus potenciadores y de qué nivel lleva la mascota. Es un objeto
// tonto, sin nada que guardar ni comprar — el progreso ajeno no se toca.
export function metaAjena(datos) {
  const potenciadores = (datos && datos.potenciadores) || {};
  const mascotas = (datos && datos.mascotas) || {};
  return {
    potenciadores,
    nivelMascota(id) { return mascotas[id] || 0; }
  };
}

export const MetaProgreso = {
  denarios: 0,
  personajes: {},        // id -> true si está desbloqueado
  potenciadores: {},     // id -> nivel
  mascotas: {},          // id -> nivel (1..5). Sin entrada = no comprada.
  mascotaEquipada: '',   // última elegida por el jugador 1, solo como sugerencia

  // Multiplicador de lo que se gana, que hoy solo mueve Nerón el Gato. Vive
  // AQUÍ y lo escribe sistemas/mascotas.js al empezar la partida, en vez de que
  // este módulo pregunte por la mascota equipada: core/ no debe importar de
  // sistemas/, y además hay tres sitios distintos que reparten denarios —bajas,
  // antorchas y cofres—, así que el único punto donde aplicarlo una sola vez es
  // `ganar()`.
  factorDenarios: 1,

  // Hoja de servicios del hueco cargado.
  partidas: 0,
  tiempoTotal: 0,
  mejorTiempo: 0,
  fases: {},              // id de nivel -> true si se ha terminado

  // Qué hueco está cargado. Empieza en -1 —NINGUNO— a propósito: hasta que la
  // pantalla de partidas no elige uno, no hay hucha de la que gastar, y un cero
  // por defecto habría dejado a la tienda operando sobre el hueco 1 sin que
  // nadie lo hubiera elegido.
  hueco: -1,
  NUM_HUECOS,

  iniciar() {
    // Ya NO carga nada: cargar sin saber qué partida es no significa nada. La
    // que manda es `usar`, que llama la pantalla de selección.
    this.hueco = -1;
  },

  // Carga un hueco y lo deja como partida en curso.
  usar(hueco) {
    const datos = cargar(hueco);
    this.hueco = hueco;
    this.denarios = datos.denarios;
    this.personajes = datos.personajes;
    this.potenciadores = datos.potenciadores;
    this.mascotas = datos.mascotas;
    this.mascotaEquipada = datos.mascotaEquipada;
    this.partidas = datos.partidas;
    this.tiempoTotal = datos.tiempoTotal;
    this.mejorTiempo = datos.mejorTiempo;
    this.fases = datos.fases;
    this.factorDenarios = 1;
    if (this.mascotaEquipada && !this.mascotas[this.mascotaEquipada]) this.mascotaEquipada = '';
    try { localStorage.setItem(CLAVE_ULTIMO, String(hueco)); } catch { /* da igual */ }
  },

  // Cuál se usó la última vez, solo para poner el cursor encima al abrir la
  // pantalla de partidas. Si no hay nada, el primero.
  ultimoUsado() {
    try {
      const v = parseInt(localStorage.getItem(CLAVE_ULTIMO), 10);
      return (v >= 0 && v < NUM_HUECOS) ? v : 0;
    } catch { return 0; }
  },

  // Lo que enseña la pantalla de selección de cada hueco, SIN cargarlo: mirar
  // los tres no puede tener el efecto de dejar cargado el último mirado.
  // Devuelve null si el hueco está vacío.
  resumen(hueco) {
    if (!ocupado(hueco)) return null;
    const d = cargar(hueco);
    let mascotas = 0;
    for (const id in d.mascotas) if (d.mascotas[id] > 0) mascotas++;
    let potenciadores = 0;
    for (const id in d.potenciadores) if (d.potenciadores[id] > 0) potenciadores++;
    return {
      denarios: d.denarios, mascotas, potenciadores,
      partidas: d.partidas, tiempoTotal: d.tiempoTotal, mejorTiempo: d.mejorTiempo,
      fases: Object.keys(d.fases || {}).length
    };
  },

  // Borrar UN hueco, que es lo que pidió Sergio al mover el borrado a la
  // pantalla de partidas: aquí no se empieza de cero en todo, se tira una
  // partida y las otras dos siguen donde estaban.
  //
  // Se quita la clave entera en vez de escribir un estado limpio: así el hueco
  // vuelve a estar VACÍO de verdad y la pantalla lo dibuja como tal, en vez de
  // como una partida a cero denarios, que no es lo mismo.
  borrarHueco(hueco) {
    try { localStorage.removeItem(claveDe(hueco)); } catch { /* nada que hacer */ }
    if (this.hueco === hueco) this.usar(hueco);
  },

  // LO QUE VIAJA AL OTRO JUGADOR: solo lo que cambia sus estadísticas.
  //
  // Ni denarios, ni héroes desbloqueados, ni tiempos: nada de eso toca la
  // simulación, así que no tiene por qué salir de esta máquina.
  aCompartir() {
    return { potenciadores: { ...this.potenciadores }, mascotas: { ...this.mascotas } };
  },

  guardar() {
    // CONGELADO: la prueba de determinismo sustituye el progreso por uno
    // conocido para que dos máquinas puedan comparar huellas, y mientras dura
    // eso NADA puede llegar al disco. Sin esta guarda, la primera partida de
    // prueba escribiría el progreso falso encima del hueco de verdad y se
    // llevaría por delante las horas de juego de alguien.
    if (this._congelado) return;
    if (this.hueco < 0) return;      // sin hueco elegido no hay dónde escribir
    try {
      localStorage.setItem(claveDe(this.hueco), JSON.stringify({
        denarios: this.denarios, personajes: this.personajes,
        potenciadores: this.potenciadores, mascotas: this.mascotas,
        mascotaEquipada: this.mascotaEquipada,
        partidas: this.partidas, tiempoTotal: this.tiempoTotal,
        mejorTiempo: this.mejorTiempo, fases: this.fases
      }));
    } catch {
      // Sin almacenamiento disponible (privado, cuota agotada...) se sigue
      // jugando igual; solo no se recuerda para la próxima vez.
    }
  },

  // Una partida terminada, gane o pierda: cuenta igual para el tiempo jugado y
  // para la marca. Aguantar 28 minutos y morir es un dato tan bueno como ganar.
  anotarPartida(segundos) {
    this.partidas++;
    this.tiempoTotal += Math.max(0, segundos);
    if (segundos > this.mejorTiempo) this.mejorTiempo = segundos;
    this.guardar();
  },

  // Una fase terminada. Solo la llama la VICTORIA: morir en el minuto 28 cuenta
  // para el tiempo jugado y para la marca, pero no es haber superado la fase.
  superarFase(idNivel) {
    if (!idNivel || this.fases[idNivel]) return;
    this.fases[idNivel] = true;
    this.guardar();
  },

  // Se llama en caliente, muchas veces por partida (una baja, una antorcha).
  // NO escribe en localStorage aquí: serializar JSON en cada muerte de la
  // horda sería coste de sobra evitable. Lo gastado/ganado se persiste en los
  // puntos de guardado de main.js (derrota, compra en la tienda, cierre de
  // pestaña).
  ganar(cantidad) {
    if (cantidad > 0) this.denarios += Math.round(cantidad * this.factorDenarios);
  },

  // --- Personajes -----------------------------------------------------------
  // Un personaje GRATIS es tuyo siempre, diga lo que diga el guardado. No es
  // una comodidad: es lo que impide que un guardado viejo, corrupto o recién
  // borrado te deje sin nadie con quien jugar. Hoy los cuatro están a coste 0.
  heroeDesbloqueado(id) {
    const def = PERSONAJES[id];
    if (def && !def.coste) return true;
    return this.personajes[id] === true;
  },

  costeHeroe(id) {
    const def = PERSONAJES[id];
    if (!def) return -1;
    if (this.heroeDesbloqueado(id)) return -1;   // ya es tuyo
    return def.coste || 0;
  },

  comprarHeroe(id) {
    const coste = this.costeHeroe(id);
    if (coste < 0 || this.denarios < coste) return false;
    this.denarios -= coste;
    this.personajes[id] = true;
    this.guardar();
    return true;
  },

  // --- Potenciadores --------------------------------------------------------
  nivelPotenciador(id) { return this.potenciadores[id] || 0; },

  costePotenciador(id) {
    return costePotenciador(POTENCIADORES[id], this.nivelPotenciador(id));
  },

  comprarPotenciador(id) {
    const coste = this.costePotenciador(id);
    if (coste < 0 || this.denarios < coste) return false;
    this.denarios -= coste;
    this.potenciadores[id] = this.nivelPotenciador(id) + 1;
    this.guardar();
    return true;
  },

  // --- Mascotas -------------------------------------------------------------
  // A diferencia de antes, tienen NIVELES: comprarla la deja a 1 y de ahí sube
  // hasta 5 en la misma tienda. Un solo método para las dos cosas, porque para
  // el jugador es el mismo gesto —pagar por tener más mascota— y separarlo en
  // "comprar" y "mejorar" solo añadía un concepto.
  nivelMascota(id) { return this.mascotas[id] || 0; },
  tieneMascota(id) { return this.nivelMascota(id) > 0; },

  costeMascota(id) {
    return costeMascota(MASCOTAS[id], this.nivelMascota(id));
  },

  comprarMascota(id) {
    const coste = this.costeMascota(id);
    if (coste < 0 || this.denarios < coste) return false;
    this.denarios -= coste;
    const nuevo = this.nivelMascota(id) + 1;
    this.mascotas[id] = nuevo;
    if (nuevo === 1 && !this.mascotaEquipada) this.mascotaEquipada = id;
    this.guardar();
    return true;
  },

  // ¿Hay alguna comprada? Lo pregunta main.js para saber si toca enseñar la
  // pantalla de elegir mascota o saltársela: sin ninguna no hay nada que elegir.
  algunaMascota() {
    for (const id in this.mascotas) if (this.mascotas[id] > 0) return true;
    return false;
  }
};
