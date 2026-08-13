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
const CLAVE = 'emerita-meta-v1';

// `personajes: null` y no `{}`, que es la diferencia entre "no hay nada
// guardado" y "hay un guardado que dice que no tienes ninguno". Con `{}`,
// normalizar lo daba por bueno y marcaba los cuatro como bloqueados: empezar de
// cero te dejaba sin personajes y sin poder jugar.
function estadoPorDefecto() {
  return { denarios: 0, personajes: null, potenciadores: {}, mascotas: {}, mascotaEquipada: '' };
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
    personajes,
    potenciadores: (datos.potenciadores && typeof datos.potenciadores === 'object')
                   ? datos.potenciadores : {},
    mascotas,
    mascotaEquipada: typeof datos.mascotaEquipada === 'string' ? datos.mascotaEquipada : ''
  };
}

function cargar() {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return estadoPorDefecto();
    return normalizar(JSON.parse(crudo));
  } catch {
    return estadoPorDefecto();     // JSON corrupto o localStorage no disponible
  }
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

  iniciar() {
    const datos = cargar();
    this.denarios = datos.denarios;
    this.personajes = datos.personajes;
    this.potenciadores = datos.potenciadores;
    this.mascotas = datos.mascotas;
    this.mascotaEquipada = datos.mascotaEquipada;
    if (this.mascotaEquipada && !this.mascotas[this.mascotaEquipada]) this.mascotaEquipada = '';
  },

  guardar() {
    try {
      localStorage.setItem(CLAVE, JSON.stringify({
        denarios: this.denarios, personajes: this.personajes,
        potenciadores: this.potenciadores, mascotas: this.mascotas,
        mascotaEquipada: this.mascotaEquipada
      }));
    } catch {
      // Sin almacenamiento disponible (privado, cuota agotada...) se sigue
      // jugando igual; solo no se recuerda para la próxima vez.
    }
  },

  // EMPEZAR DE CERO. Lo pide la pantalla de configuración, y solo después de
  // que el jugador confirme en una ventana aparte: borra los denarios de todas
  // las partidas jugadas, los potenciadores y las mascotas.
  //
  // Se escribe el estado por defecto en vez de borrar la clave: así queda un
  // guardado válido y no depende de que el arranque siguiente acierte con el
  // repliegue.
  reiniciarTodo() {
    const limpio = normalizar(estadoPorDefecto());
    this.denarios = limpio.denarios;
    this.personajes = limpio.personajes;
    this.potenciadores = limpio.potenciadores;
    this.mascotas = limpio.mascotas;
    this.mascotaEquipada = '';
    this.factorDenarios = 1;
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
