import { POTENCIADORES } from '../datos/potenciadores.js';
import { MASCOTAS } from '../datos/mascotas.js';

// Progreso META: lo único que sobrevive entre partidas. Ver CLAUDE.md —
// `localStorage` está permitido aquí PORQUE nada de esto se lee durante la
// simulación de una partida activa: los denarios se ganan en memoria mientras
// se juega y solo se leen (para gastar en la tienda) o se escriben (para
// guardarlos) fuera de una partida en curso o en sus pausas naturales. La
// PARTIDA en sí sigue sin tocar `localStorage` para nada, así que dos
// partidas con la misma semilla siguen siendo reproducibles.
//
// `heroes` existe y se guarda ya (por si algún día hay un héroe que desbloquear)
// pero HOY no bloquea a ninguno de los cuatro: decisión de Sergio, para no
// quitarle a nadie personajes que ya tiene. `heroeDesbloqueado` devuelve
// siempre `true` mientras el catálogo no declare ningún héroe de pago.
const CLAVE = 'emerita-meta-v1';

function estadoPorDefecto() {
  return { denarios: 0, heroes: {}, potenciadores: {}, mascotas: {}, mascotaEquipada: '' };
}

function cargar() {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return estadoPorDefecto();
    const datos = JSON.parse(crudo);
    return {
      denarios: Math.max(0, datos.denarios | 0),
      heroes: (datos.heroes && typeof datos.heroes === 'object') ? datos.heroes : {},
      potenciadores: (datos.potenciadores && typeof datos.potenciadores === 'object')
                     ? datos.potenciadores : {},
      // Las mascotas se guardaron después que el resto, así que una partida
      // guardada antes de que existieran no las trae. Se leen con repliegue en
      // vez de descartar el guardado entero: nadie debería perder sus denarios
      // por haber jugado la versión de ayer.
      mascotas: (datos.mascotas && typeof datos.mascotas === 'object') ? datos.mascotas : {},
      mascotaEquipada: typeof datos.mascotaEquipada === 'string' ? datos.mascotaEquipada : ''
    };
  } catch {
    return estadoPorDefecto();     // JSON corrupto o localStorage no disponible
  }
}

export const MetaProgreso = {
  denarios: 0,
  heroes: {},            // id -> true. Vacío hoy: ver nota de arriba.
  potenciadores: {},     // id -> nivel
  mascotas: {},          // id -> true (comprada)
  mascotaEquipada: '',   // id de la que se lleva, o '' por ninguna

  iniciar() {
    const datos = cargar();
    this.denarios = datos.denarios;
    this.heroes = datos.heroes;
    this.potenciadores = datos.potenciadores;
    this.mascotas = datos.mascotas;
    this.mascotaEquipada = datos.mascotaEquipada;
    // Defensa contra un guardado con una mascota que ya no existe en el
    // catálogo (se renombró, se quitó): mejor sin mascota que con una que
    // no se puede resolver y deja media interfaz en blanco.
    if (this.mascotaEquipada && !MASCOTAS[this.mascotaEquipada]) this.mascotaEquipada = '';
  },

  guardar() {
    try {
      localStorage.setItem(CLAVE, JSON.stringify({
        denarios: this.denarios, heroes: this.heroes, potenciadores: this.potenciadores,
        mascotas: this.mascotas, mascotaEquipada: this.mascotaEquipada
      }));
    } catch {
      // Sin almacenamiento disponible (privado, cuota agotada...) se sigue
      // jugando igual; solo no se recuerda para la próxima vez.
    }
  },

  // Multiplicador de lo que se gana, que hoy solo mueve Nerón el Gato. Vive
  // AQUÍ y lo escribe sistemas/mascotas.js al empezar la partida, en vez de que
  // este módulo pregunte por la mascota equipada: core/ no debe importar de
  // sistemas/, y además hay tres sitios distintos que reparten denarios —bajas,
  // antorchas y cofres—, así que el único punto donde aplicarlo una sola vez es
  // este.
  factorDenarios: 1,

  // Se llama en caliente, muchas veces por partida (una baja, una antorcha).
  // NO escribe en localStorage aquí: serializar JSON en cada muerte de la
  // horda sería coste de sobra evitable. Lo gastado/ganado se persiste en los
  // puntos de guardado de main.js (derrota, compra en la tienda, cierre de
  // pestaña).
  ganar(cantidad) {
    if (cantidad > 0) this.denarios += Math.round(cantidad * this.factorDenarios);
  },

  heroeDesbloqueado(id) {
    return true;   // ver nota de cabecera: ningún héroe está bloqueado hoy
  },

  nivelPotenciador(id) { return this.potenciadores[id] || 0; },

  costePotenciador(id) {
    const def = POTENCIADORES[id];
    if (!def) return Infinity;
    const nivel = this.nivelPotenciador(id);
    if (nivel >= def.maxNivel) return -1;      // ya al máximo
    return def.costeBase + def.incremento * nivel;
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
  // No tienen niveles, al revés que los potenciadores: una mascota se compra
  // una vez y ya está. Lo que sí hay es una sola EQUIPADA a la vez, y esa es
  // toda la decisión — con las ocho puestas a la vez no habría ninguna.
  tieneMascota(id) { return !!this.mascotas[id]; },

  comprarMascota(id) {
    const def = MASCOTAS[id];
    if (!def || this.tieneMascota(id) || this.denarios < def.coste) return false;
    this.denarios -= def.coste;
    this.mascotas[id] = true;
    // Se equipa sola al comprarla. Comprar algo y que no pase nada hasta que
    // además lo equipes es un paso de más que solo se entiende cuando ya
    // tienes varias.
    this.mascotaEquipada = id;
    this.guardar();
    return true;
  },

  // Equipar la que ya está puesta la QUITA: es la única forma de jugar sin
  // ninguna una vez comprada la primera.
  equiparMascota(id) {
    if (!this.tieneMascota(id)) return false;
    this.mascotaEquipada = (this.mascotaEquipada === id) ? '' : id;
    this.guardar();
    return true;
  }
};
