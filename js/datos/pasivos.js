// Catálogo de pasivos. DATOS PUROS, cero lógica.
//
// `campo` nombra la estadística del jugador que tocan y `tipo` cómo la tocan:
//
//   'suma'     — se añade tal cual (armadura, regeneración, vida máxima)
//   'factor'   — porcentaje acumulativo sobre el valor base (velocidad, daño)
//
// El motor no conoce ningún pasivo concreto: recorre los que llevas y aplica.
// Añadir uno nuevo es añadir una entrada aquí, siempre que use un campo que el
// jugador ya tenga.
//
// Máximo 10 niveles, igual que las armas. El plan decía 5, pero con solo 4
// ranuras de pasivo hace falta poder seguir invirtiendo en lo que ya llevas.
//
// Al doblar los niveles se ha PARTIDO POR LA MITAD el valor de cada uno, así que
// el tope sigue siendo el mismo que antes: unas sandalias al 10 dan el +50% de
// velocidad que daban al 5. Lo que cambia es el grano, no el techo.

export const PASIVOS = {
  sandalias: {
    nombre: 'Sandalias aladas',
    descripcion: '+5% de velocidad por nivel',
    campo: 'velocidad', tipo: 'factor', valor: 0.05, maxNivel: 10
  },
  lorica: {
    nombre: 'Lorica segmentata',
    descripcion: '+0.5 de armadura por nivel',
    campo: 'armadura', tipo: 'suma', valor: 0.5, maxNivel: 10
  },
  anilloAugusto: {
    nombre: 'Anillo de Augusto',
    descripcion: '+5% de daño por nivel',
    campo: 'bonusDanyo', tipo: 'suma', valor: 0.05, maxNivel: 10
  },
  clepsidra: {
    nombre: 'Clepsidra',
    descripcion: '-4% de recarga por nivel',
    campo: 'reduccionRecarga', tipo: 'suma', valor: 0.04, maxNivel: 10
  },
  coronaLaurel: {
    // 0.1/s eran 2 puntos de vida por cada veinte segundos: literalmente no se
    // notaba, y el pasivo se descartaba siempre. A 0.9/s por nivel, al máximo
    // recupera 9 por segundo, que es una barra entera cada trece segundos y
    // convierte "aguantar" en una estrategia de verdad.
    nombre: 'Corona de laurel',
    descripcion: '+0.9 de vida por segundo',
    campo: 'regeneracion', tipo: 'suma', valor: 0.9, maxNivel: 10
  },
  antorcha: {
    nombre: 'Antorcha votiva',
    descripcion: '+6% de área de efecto',
    campo: 'bonusArea', tipo: 'suma', valor: 0.06, maxNivel: 10
  },
  piedraIman: {
    nombre: 'Piedra imán',
    descripcion: '+12.5% de radio de recogida',
    campo: 'radioRecogida', tipo: 'factor', valor: 0.125, maxNivel: 10
  },
  anfora: {
    // 30 y no 10: un 200% más de lo que daba. Con 10 por nivel, el Ánfora al
    // máximo sumaba 100 de vida sobre una base de poco más de 100, o sea que
    // diez elecciones seguidas doblaban el aguante justo cuando los golpes de
    // la horda ya pegan por cientos. Era la elección que nunca compensaba.
    // Ahora al tope son 300, que sí cambia con qué te atreves a cruzar.
    nombre: 'Ánfora de vino',
    descripcion: '+30 de vida máxima, y cura esa cantidad',
    campo: 'vidaMaxima', tipo: 'suma', valor: 30, maxNivel: 10, curaAlSubir: 30
  }
};
