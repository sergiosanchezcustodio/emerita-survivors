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

  // --- Los cuatro que van por reloj ---------------------------------------
  //
  // Cuarta tanda. Los tres primeros dicen CADA CUANTOS SEGUNDOS pasa lo suyo,
  // asi que su numero BAJA con el nivel: son `escalon`, como la Pira funeraria.
  // Cuanto dura o cuanto cura cada uno esta en entidades/jugador.js, porque lo
  // que mejora al subir es la frecuencia y no el efecto — un objeto que
  // mejorara las dos cosas a la vez seria dos objetos.
  virgenNegra: {
    nombre: 'Virgen Negra',
    descripcion: 'Invulnerable un instante cada 20 s (menos por nivel)',
    campo: 'invulnerableCada', tipo: 'escalon', valor: 20, paso: -1.3, suelo: 8,
    maxNivel: 10
  },
  balsamoFierabras: {
    nombre: 'Bálsamo de Fierabrás',
    // El trago que te saca de una, no un goteo: por eso salta solo por debajo
    // del 25% de vida y cura un tercio del maximo de golpe. La Corona de laurel
    // y Panacea te mantienen arriba; esto te levanta del suelo.
    descripcion: 'Bajo el 25% de vida te cura un tercio. Cada 60 s (menos por nivel)',
    campo: 'balsamoCada', tipo: 'escalon', valor: 60, paso: -4, suelo: 24,
    maxNivel: 10
  },
  cencerrosSanAnton: {
    nombre: 'Cencerros de San Antón',
    descripcion: 'Cada 30 s llaman a todas las gemas del mapa (menos por nivel)',
    campo: 'imanCada', tipo: 'escalon', valor: 30, paso: -2, suelo: 12,
    maxNivel: 10
  },
  diademaAliseda: {
    nombre: 'Diadema de Aliseda',
    // EL TERCER OBJETO DE VELOCIDAD del juego y el unico que no es un
    // porcentaje plano: las Sandalias y Premura te hacen rapido siempre, y esta
    // te hace rapido si juegas bien. Cinco segundos sin que te toquen para
    // llenarla; un golpe y a cero.
    descripcion: '+4% de velocidad por nivel, si llevas 5 s sin que te toquen',
    campo: 'impulsoMax', tipo: 'suma', valor: 0.04, maxNivel: 10
  },

  // --- Los cuatro de cooperativo ------------------------------------------
  //
  // Quinta tanda, y los unicos que miran a los DEMAS. Llevan
  // `soloCooperativo: true`, que los saca del sorteo jugando solo: curar al
  // equipo no es un efecto flojo cuando estas tu nada mas, es NINGUN efecto, y
  // una carta que no hace nada es peor que una carta mala.
  //
  // El filtro esta en la generacion de ofertas (sistemas/progresion.js) y mira
  // cuantos hay jugando AHORA. En cooperativo local se suman a mitad de
  // partida, asi que quien empiece solo y reciba compania empezara a verlos en
  // la siguiente subida de nivel.
  selloMagacela: {
    nombre: 'Sello de los Caballeros de Magacela',
    // Reparte a los OTROS, no a quien lo lleva. Es un tercio de lo que da el
    // Anillo de Augusto (+5% por nivel) porque va multiplicado por cuanta gente
    // haya: con cuatro, tres reciben lo tuyo y tu recibes lo de tres.
    descripcion: '+1.7% de daño por nivel A TUS COMPAÑEROS, no a ti',
    campo: 'auraDanyo', tipo: 'suma', valor: 0.017, maxNivel: 10,
    soloCooperativo: true
  },
  coronaEspinas: {
    nombre: 'Corona de Espinas',
    // El objeto del que aguanta: no te protege de nada, convierte tu vida en la
    // de los demas. Lo lleva quien se pone delante.
    descripcion: 'El 15% del daño que recibes por nivel se lo dan de vida a cada compañero',
    campo: 'reparteVida', tipo: 'suma', valor: 0.15, maxNivel: 10,
    soloCooperativo: true
  },
  grialAlconetar: {
    nombre: 'El Grial de Alconétar',
    descripcion: 'Cura 6 de vida a todo el equipo cada 25 s (menos por nivel)',
    campo: 'grialCada', tipo: 'escalon', valor: 25, paso: -1.5, suelo: 12,
    maxNivel: 10, soloCooperativo: true
  },
  llaveDelPerdon: {
    nombre: 'La Llave del Perdón',
    // LA LLEVA EL QUE VA A LEVANTAR, no el caido: no te salva a ti, te
    // convierte a ti en quien salva.
    descripcion: '+10% por nivel de prisa y de alcance al reanimar a un caído',
    campo: 'perdon', tipo: 'suma', valor: 0.10, maxNivel: 10,
    soloCooperativo: true
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
