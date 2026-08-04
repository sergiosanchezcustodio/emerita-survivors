// Los cuatro personajes jugables. DATOS PUROS, cero lógica.
//
// `sprite` es el id del atlas. `arma` es con la que empieza: en cooperativo eso
// ya garantiza que los cuatro arrancan con arsenales distintos, y el sorteo de
// subida de nivel se encarga de que sigan sin repetirse.
//
// `mods` son multiplicadores sobre las estadísticas base de la sección 6 del
// plan (vida 100, velocidad 85, recogida 40). Se aplican al crear el personaje,
// antes que cualquier pasivo. Se han dejado suaves a propósito: la identidad de
// cada uno tiene que venir del arma inicial, que es lo que cambia cómo juegas,
// no de un 15% de vida que no se nota.

export const PERSONAJES = {
  eric: {
    nombre: 'Eric',
    sprite: 'eric',
    descripcion: 'Aguanta el tipo en primera línea.',
    arma: 'pilum',
    mods: { vidaMaxima: 1.15, velocidad: 0.95, radioRecogida: 1.0 }
  },
  lucy: {
    nombre: 'Lucy',
    sprite: 'lucy',
    descripcion: 'Frágil, pero no la alcanza nadie.',
    arma: 'pistola',
    mods: { vidaMaxima: 0.85, velocidad: 1.15, radioRecogida: 1.0 }
  },
  sara: {
    nombre: 'Sara',
    sprite: 'sara',
    descripcion: 'Recoge el botín desde lejos.',
    arma: 'escopeta',
    mods: { vidaMaxima: 1.0, velocidad: 1.0, radioRecogida: 1.45 }
  },
  vicky: {
    nombre: 'Vicky',
    sprite: 'vicky',
    descripcion: 'Pega primero y pregunta después.',
    arma: 'gladius',
    mods: { vidaMaxima: 0.95, velocidad: 1.05, radioRecogida: 1.0 }
  }
};

// Orden en el que entran los jugadores al sumarse a la partida.
export const ORDEN_PERSONAJES = ['eric', 'lucy', 'sara', 'vicky'];
