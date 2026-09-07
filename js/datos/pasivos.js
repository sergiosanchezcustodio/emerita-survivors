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
  // --- Los siete de Extremadura -------------------------------------------
  //
  // Segunda tanda de objetos, pedida por Sergio, y todos del mismo corte: un
  // campo del jugador que alguien lee en un sitio concreto. No hay mecanismo
  // nuevo en ninguno — el bucle que aplica `campo`/`tipo`/`valor` es el mismo
  // que llevan los ocho de arriba, las mascotas y los potenciadores.
  //
  // Lo que sí es nuevo es DÓNDE se leen. Los ocho primeros describen el cuerpo
  // —cuánto aguantas, cuánto corres— y se leen al recalcular las estadísticas.
  // Estos describen lo que hacen tus armas y lo que te pasa a ti, así que cada
  // uno se lee donde ocurre: al lanzar, al crear una zona, al cobrar, al
  // recibir un golpe. Ver los campos en entidades/jugador.js.
  campanaMilagrosa: {
    nombre: 'Campana Milagrosa',
    descripcion: '+7% de alcance de tus armas por nivel',
    campo: 'bonusAlcance', tipo: 'suma', valor: 0.07, maxNivel: 10
  },
  alaDeMercurio: {
    nombre: 'Ala de Mercurio',
    // Lo que se lanza vuela más deprisa, y llega IGUAL DE LEJOS: la vida del
    // proyectil se calcula con esta misma velocidad, así que lo que se gana es
    // que alcance antes a lo que huye, no que cubra más campo. Para eso está la
    // Campana Milagrosa.
    descripcion: '+8% de velocidad de tus proyectiles por nivel',
    campo: 'bonusVelProyectil', tipo: 'suma', valor: 0.08, maxNivel: 10
  },
  amuletoAzogue: {
    nombre: 'Amuleto de azogue',
    descripcion: '+10% de duración de lo que dejas en el suelo, por nivel',
    campo: 'bonusDuracionZona', tipo: 'suma', valor: 0.10, maxNivel: 10
  },
  astaEscornao: {
    nombre: 'Asta del Escornao',
    // MEDIO PUNTO POR NIVEL, no uno. La perforación se redondea al aplicarla,
    // así que esto da +1 al nivel 2, +2 al 4 y +5 al 10 — la mitad de deprisa
    // que subiéndolo de uno en uno, y aun así es de lo más fuerte que hay:
    // cinco cuerpos más por bala multiplica armas enteras. Lo avisó Sergio y
    // por eso va a este ritmo.
    descripcion: '+0.5 de perforación por nivel: tus disparos atraviesan más',
    campo: 'bonusPerforacion', tipo: 'suma', valor: 0.5, maxNivel: 10
  },
  lagartoCalzadilla: {
    nombre: 'Lagarto de Calzadilla',
    // Un PORCENTAJE, al revés que la Lorica, que quita una cantidad fija. Por
    // eso conviven: la placa vale contra la horda que pica de tres en tres y la
    // escama contra el mordisco que te quita media vida.
    descripcion: '-4% del daño que recibes por nivel',
    campo: 'reduccionContacto', tipo: 'suma', valor: 0.04, maxNivel: 10
  },
  becerroDeOro: {
    nombre: 'Becerro de Oro',
    descripcion: '+8% de denarios por cada enemigo que remates, por nivel',
    campo: 'bonusDenarios', tipo: 'suma', valor: 0.08, maxNivel: 10
  },
  musa: {
    nombre: 'Musa',
    // El único de los siete que no ha necesitado NADA: `bonusXp` ya existía
    // porque lo usa Plinio el Búho, y la progresión ya lo leía. Es literalmente
    // cinco líneas de datos.
    descripcion: '+6% de experiencia por nivel',
    campo: 'bonusXp', tipo: 'suma', valor: 0.06, maxNivel: 10
  },

  // --- Los cinco que enganchan en un golpe --------------------------------
  //
  // Tercera tanda. Estos no cambian una estadistica: se enteran de que ha
  // pasado algo. Cuatro viven en el camino del dano —`danyar` en
  // entidades/enemigo.js y `recibirDanyo` en el jugador— y el quinto en el
  // calculo del dano de las armas.
  sanguijuelasGuadiana: {
    nombre: 'Sanguijuelas del Guadiana',
    // Sobre el dano EFECTIVO, no sobre el pedido: rematar a una serpiente de
    // siete de vida con un golpe de cincuenta cura por siete. Si no, cualquier
    // arma de las que barren la horda de un toque seria inmortalidad barata.
    descripcion: '+1.2% del daño que haces vuelve como vida, por nivel',
    campo: 'robaVida', tipo: 'suma', valor: 0.012, maxNivel: 10
  },
  capaErizo: {
    nombre: 'Capa del erizo',
    descripcion: '+12% del daño que recibes se lo devuelves a quien te toca',
    campo: 'espinas', tipo: 'suma', valor: 0.12, maxNivel: 10
  },
  cruzDelGigante: {
    nombre: 'Cruz del Gigante',
    // El PRIMER golpe de cada enemigo, no el primero de cada arma: premia
    // abrir, no rematar. Y es del enemigo, asi que en cooperativo se lo lleva
    // quien llega antes.
    descripcion: '+10% al primer golpe que recibe cada enemigo, por nivel',
    campo: 'primerGolpeDoble', tipo: 'suma', valor: 0.10, maxNivel: 10
  },
  piraFuneraria: {
    nombre: 'Pira funeraria',
    // AL REVES QUE TODOS LOS DEMAS: el valor BAJA con el nivel, porque lo que
    // dice es cada cuantas muertes revienta una. Empieza en 25 y llega a 7.
    //
    // `tipo: 'escalon'` es nuevo y existe solo por esto: los otros dos —`suma`
    // y `factor`— van sobre un campo que crece, y aqui hace falta un valor que
    // se acerca a un suelo. Se aplica en jugador.js con dos lineas.
    descripcion: 'Cada 25 enemigos que matas, el siguiente estalla (menos por nivel)',
    campo: 'piraCada', tipo: 'escalon', valor: 25, paso: -2, suelo: 7, maxNivel: 10
  },
  lagrimaDeLaMora: {
    nombre: 'Lágrima de la Mora',
    descripcion: '+8% de daño por nivel cuando estás al 10% de vida',
    campo: 'furiaMoribundo', tipo: 'suma', valor: 0.08, maxNivel: 10
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
