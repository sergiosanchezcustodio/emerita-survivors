// Catálogo de mascotas. DATOS PUROS, cero lógica.
//
// Una mascota es un bicho pequeño que acompaña a cada jugador y hace UNA cosa.
// Se compran con denarios (progreso META, ver core/metaProgreso.js), se quedan
// compradas para siempre y solo se lleva una a la vez: elegir cuál es la
// decisión, y con varias equipadas a la vez no habría ninguna.
//
// Cuatro las pidió Sergio por nombre —Heladio, Oreo, Karim y el Pollito
// fantasma— y cuatro son propuesta. El reparto está pensado para que no haya
// dos que se pisen: cuatro PASIVAS, que cambian una estadística y ya, y cuatro
// ACTIVAS, que hacen algo cada tantos segundos y se ven hacerlo.
//
//   pasivas — heladio (recogida), escipion (aguante), plinio (nivel),
//             neron (dinero)
//   activas — karim (daño), cleopatra (curación), oreo (dinero),
//             pollito (control)
//
// Las PASIVAS declaran `campo`/`tipo`/`valor` y las aplica jugador.js con el
// mismo bucle exacto que los pasivos de partida y los potenciadores: no hay un
// tercer mecanismo, hay el mismo por tercera vez.
//
// Las ACTIVAS declaran `habilidad` —el nombre de una función de
// sistemas/mascotas.js— y `cada`, los segundos entre una vez y la siguiente.
//
// `color` es provisional: mientras no haya sprites, sistemas/mascotas.js dibuja
// a la mascota como una silueta de ese color con su inicial. En cuanto Sergio
// deje los dibujos en resources/mascotas/, se cambia el dibujado y estos datos
// no se tocan.

export const MASCOTAS = {
  // --- Pasivas -------------------------------------------------------------
  heladio: {
    nombre: 'Heladio el Hámster',
    descripcion: 'Recoge gemas desde mucho más lejos. Todo al carrillo.',
    campo: 'radioRecogida', tipo: 'factor', valor: 0.45,
    coste: 60, color: '#e8a75a', inicial: 'H'
  },
  escipion: {
    nombre: 'Escipión la Tortuga',
    descripcion: 'Su caparazón te presta +2 de armadura.',
    campo: 'armadura', tipo: 'suma', valor: 2,
    coste: 90, color: '#7fa860', inicial: 'E'
  },
  plinio: {
    nombre: 'Plinio el Búho',
    descripcion: 'Te lo explica todo: +20% de experiencia.',
    campo: 'bonusXp', tipo: 'suma', valor: 0.2,
    coste: 120, color: '#b0956a', inicial: 'P'
  },
  neron: {
    // La única que toca el progreso META en vez de la partida: multiplica los
    // denarios que se ganan, así que se paga sola y luego financia al resto.
    // Por eso es de las caras, y por eso su bonus es un `factorDenarios` y no
    // un `campo` del jugador: los denarios no son una estadística de la
    // partida, son lo que queda cuando termina.
    nombre: 'Nerón el Gato',
    descripcion: 'Le gusta el oro: +35% de denarios en cada partida.',
    factorDenarios: 0.35,
    coste: 150, color: '#5a5a66', inicial: 'N'
  },

  // --- Activas -------------------------------------------------------------
  karim: {
    nombre: 'Karim el Perro',
    descripcion: 'Se lanza a morder al enemigo más cercano.',
    habilidad: 'morder', cada: 1.8, danyo: 14, alcance: 90,
    coste: 100, color: '#c08a4a', inicial: 'K'
  },
  cleopatra: {
    nombre: 'Cleopatra la Gallina',
    descripcion: 'Pone un huevo cada poco. El huevo te cura.',
    habilidad: 'huevo', cada: 9, cura: 9,
    coste: 130, color: '#e0d0a0', inicial: 'C'
  },
  oreo: {
    nombre: 'Oreo el Conejo',
    descripcion: 'Escarba sin parar y desentierra denarios.',
    habilidad: 'escarbar', cada: 11, denarios: 3,
    coste: 110, color: '#d8d8d8', inicial: 'O'
  },
  pollito: {
    // El único que da control de masas en vez de daño o recursos: no mata a
    // nadie, abre hueco. Con la horda del minuto 20 encima, abrir hueco vale
    // más que matar a cuatro.
    nombre: 'El Pollito Fantasma',
    descripcion: 'Un chillido de ultratumba y la horda de alrededor huye.',
    habilidad: 'espantar', cada: 12, radio: 95, duracion: 2.5,
    coste: 140, color: '#cfe8ff', inicial: 'F'
  }
};

// Orden en que salen en la tienda: primero las baratas, para que la primera
// compra de alguien que acaba de empezar sea una de las que se entienden solas.
export const ORDEN_MASCOTAS = [
  'heladio', 'escipion', 'karim', 'oreo', 'cleopatra', 'plinio', 'pollito', 'neron'
];

// --- Niveles ----------------------------------------------------------------
//
// Cinco por mascota. El nivel 1 es comprarla; del 2 al 5 se sube en la misma
// tienda, y cada escalón cuesta más.
//
// La mejora es UN SOLO NÚMERO para todas, no una tabla por mascota, y es a
// propósito: cada mascota ya se diferencia por LO QUE HACE, que es la decisión
// interesante. Si además cada una escalara distinto, elegir cuál subir dejaría
// de ser "cuál me gusta más" para ser "cuál tiene mejores números", y eso ya lo
// cubren los potenciadores.
//
// +25% por nivel sobre lo que haga: al 5 rinde el doble que al 1. En las
// pasivas multiplica su `valor`; en las activas, el número que las define
// —daño de Karim, cura de Cleopatra, denarios de Oreo, radio del Pollito—.
export const MAX_NIVEL_MASCOTA = 5;
export const MEJORA_POR_NIVEL = 0.25;

// Cuánto rinde una mascota de nivel `nivel`, como multiplicador.
export function factorMascota(nivel) {
  if (!nivel || nivel < 1) return 0;
  return 1 + (Math.min(nivel, MAX_NIVEL_MASCOTA) - 1) * MEJORA_POR_NIVEL;
}

// Precio del SIGUIENTE nivel. El primero es `coste` —comprarla— y los cuatro
// siguientes van subiendo un 60% del precio base cada uno, así que completar
// una mascota cuesta unas 3,4 veces lo que costó adoptarla.
export function costeMascota(def, nivelActual) {
  if (!def) return -1;
  if (nivelActual >= MAX_NIVEL_MASCOTA) return -1;
  if (nivelActual <= 0) return def.coste;
  return Math.round(def.coste * 0.6 * nivelActual);
}
