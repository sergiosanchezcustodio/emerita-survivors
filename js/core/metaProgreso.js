import { POTENCIADORES } from '../datos/potenciadores.js';

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
  return { denarios: 0, heroes: {}, potenciadores: {} };
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
                     ? datos.potenciadores : {}
    };
  } catch {
    return estadoPorDefecto();     // JSON corrupto o localStorage no disponible
  }
}

export const MetaProgreso = {
  denarios: 0,
  heroes: {},            // id -> true. Vacío hoy: ver nota de arriba.
  potenciadores: {},     // id -> nivel

  iniciar() {
    const datos = cargar();
    this.denarios = datos.denarios;
    this.heroes = datos.heroes;
    this.potenciadores = datos.potenciadores;
  },

  guardar() {
    try {
      localStorage.setItem(CLAVE, JSON.stringify({
        denarios: this.denarios, heroes: this.heroes, potenciadores: this.potenciadores
      }));
    } catch {
      // Sin almacenamiento disponible (privado, cuota agotada...) se sigue
      // jugando igual; solo no se recuerda para la próxima vez.
    }
  },

  // Se llama en caliente, muchas veces por partida (una baja, una antorcha).
  // NO escribe en localStorage aquí: serializar JSON en cada muerte de la
  // horda sería coste de sobra evitable. Lo gastado/ganado se persiste en los
  // puntos de guardado de main.js (derrota, compra en la tienda, cierre de
  // pestaña).
  ganar(cantidad) {
    if (cantidad > 0) this.denarios += cantidad;
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
  }
};
