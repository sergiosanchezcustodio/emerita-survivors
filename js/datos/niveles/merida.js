// Nivel 1 — Emerita Augusta. DATOS PUROS, cero lógica.
// Añadir Cáceres, Trujillo o Alcántara debe ser copiar este archivo y cambiar
// los valores. Si para meter un nivel hay que tocar algo fuera de datos/niveles/,
// el diseño está mal.

export const NIVEL = {
  id: 'merida',
  nombre: 'Emerita Augusta',
  subtitulo: 'Las ruinas del Imperio',
  duracion: 1200,                      // segundos

  // Ocres, arena tostada, piedra caliza, mármol roto, oliva y púrpura imperial.
  paleta: {
    arena:      '#b99b6b',
    arenaOscura:'#a68a5c',
    piedra:     '#8f8271',
    caliza:     '#cbbfa4',
    marmol:     '#e2dccb',
    oliva:      '#4a5138',
    purpura:    '#6d2743',
    cielo:      '#e0a15c'
  },

  // --- Tema de la interfaz -------------------------------------------------
  // Lo consume ui/tema.js: pausa, derrota y subida de nivel se pintan con esto.
  // Aquí solo hay colores y el NOMBRE de un ornamento; cómo se traza una greca
  // es lógica y vive en ui/.
  //
  // Piedra caliente en vez del morado genérico, marfil para el titular y bronce
  // para el marco y la cenefa. Es el mismo material que el anfiteatro que se ve
  // por debajo del panel, así que al abrir un menú no se sale del sitio.
  interfaz: {
    ornamento:    'romano',
    fondo:        '#241c16',           // piedra tostada, arriba
    fondoBajo:    '#160f0c',           // sombra, abajo
    fondoCarta:   '#2c221a',
    cartaElegida: '#453421',
    borde:        '#080503',
    filo:         '#b08c50',           // bronce
    titulo:       '#f0e4c4',           // marfil
    texto:        '#a8977a',
    apagado:      '#7b6c55'
  },

  // Configuración del suelo toroidal. Mientras no haya tiles pintados,
  // recursos.js los genera con estos parámetros (ver sistema de placeholders).
  suelo: {
    variantes: 4,
    base: 'arena',
    motas: ['arenaOscura', 'piedra', 'caliza'],
    densidadMotas: 42,                 // motas por tile
    grietas: 2                         // trazos de losa por tile
  },

  // --- Curva de oleadas ----------------------------------------------------
  // La lee sistemas/simulacro.js. Sigue la tabla de la sección 11 del plan.
  //
  // Cada evento es una FUENTE de enemigos que está viva entre `desde` y `hasta`
  // (segundos) y suelta `cantidad` bichos cada `cada` segundos con un `patron`
  // de aparición. Varias fuentes conviven: el enjambre de fondo va por su lado y
  // la línea de legionarios entra por encima, que es lo que hace que una oleada
  // se lea como un acontecimiento y no como más de lo mismo.
  //
  // `cantidad` y `cada` son a minuto 0; el escalado por minuto los aprieta.
  eventos: [
    // --- 0-2: solo serpientes. Lento a propósito: es donde se aprende a andar.
    { desde:    0, hasta:  120, patron: 'anillo', cada: 1.6, cantidad:  4,
      tipos: ['serpiente'] },

    // --- 2-4: entran las gárgolas y el primer muro de legionarios.
    { desde:  120, hasta:  240, patron: 'anillo', cada: 1.4, cantidad:  5,
      tipos: ['serpiente', 'serpiente', 'gargola'] },
    { desde:  150, hasta:  240, patron: 'linea',  cada: 22,  cantidad: 10,
      tipos: ['legionario'] },

    // --- 4-6: primera presión de velocidad. Gladiadores y arpías.
    { desde:  240, hasta:  360, patron: 'anillo', cada: 1.2, cantidad:  6,
      tipos: ['serpiente', 'gargola', 'gargola', 'gladiador'] },
    { desde:  255, hasta:  360, patron: 'oleada', cada: 16,  cantidad:  8,
      tipos: ['arpia'] },
    { desde:  300, hasta:  302, patron: 'individual', cada: 60, cantidad: 1,
      tipos: ['manticora'] },

    // --- 6-8: la medusa introduce la amenaza a distancia.
    { desde:  360, hasta:  480, patron: 'anillo', cada: 1.1, cantidad:  7,
      tipos: ['serpiente', 'gargola', 'gladiador', 'arpia'] },
    { desde:  360, hasta:  480, patron: 'oleada', cada: 18,  cantidad:  4,
      tipos: ['medusa'] },

    // --- 8-10: cíclopes y minotauros. Aquí se nota si el arma escala o no.
    { desde:  480, hasta:  600, patron: 'anillo', cada: 1.0, cantidad:  8,
      tipos: ['serpiente', 'gargola', 'legionario', 'gladiador', 'arpia'] },
    { desde:  480, hasta:  600, patron: 'oleada', cada: 20,  cantidad:  2,
      tipos: ['ciclope', 'minotauro'] },

    // --- 10-13: todo lo anterior, pero en cerco.
    { desde:  600, hasta:  780, patron: 'cerco',  cada: 12,  cantidad: 26,
      tipos: ['serpiente', 'gargola', 'legionario', 'gladiador', 'arpia', 'medusa'] },
    { desde:  600, hasta:  780, patron: 'anillo', cada: 1.0, cantidad:  8,
      tipos: ['serpiente', 'gargola', 'gladiador'] },
    { desde:  660, hasta:  662, patron: 'individual', cada: 60, cantidad: 1,
      tipos: ['manticora'] },
    { desde:  700, hasta:  780, patron: 'oleada', cada: 24,  cantidad:  3,
      tipos: ['ciclope', 'minotauro'] },

    // --- 13-16: enjambres. Serpientes y arpías en cantidad.
    { desde:  780, hasta:  960, patron: 'anillo', cada: 0.8, cantidad: 12,
      tipos: ['serpiente', 'serpiente', 'arpia'] },
    { desde:  780, hasta:  960, patron: 'cerco',  cada: 14,  cantidad: 30,
      tipos: ['gargola', 'gladiador', 'legionario', 'medusa'] },
    { desde:  840, hasta:  960, patron: 'oleada', cada: 22,  cantidad:  3,
      tipos: ['ciclope', 'minotauro'] },

    // --- 16-19: mezcla total, oleadas superpuestas.
    { desde:  960, hasta: 1140, patron: 'anillo', cada: 0.7, cantidad: 15,
      tipos: ['serpiente', 'gargola', 'arpia', 'gladiador'] },
    { desde:  960, hasta: 1140, patron: 'linea',  cada: 20,  cantidad: 20,
      tipos: ['legionario', 'gladiador'] },
    { desde:  980, hasta: 1140, patron: 'cerco',  cada: 15,  cantidad: 34,
      tipos: ['serpiente', 'gargola', 'arpia', 'medusa', 'minotauro'] },
    { desde:  990, hasta:  992, patron: 'individual', cada: 60, cantidad: 1,
      tipos: ['manticora'] },
    { desde: 1080, hasta: 1082, patron: 'individual', cada: 60, cantidad: 1,
      tipos: ['manticora'] }
  ],

  // Techo de enemigos VIVOS por tramo. No es un objetivo, es un freno: sin él,
  // un jugador que no mata a ritmo acumula la oleada anterior con la siguiente y
  // acaba con la pantalla llena por bloqueo, no por diseño. Interpolado entre
  // marcas, así que la presión sube de forma continua y no a escalones.
  densidad: [
    { t:    0, max:  60 },
    { t:  120, max:  90 },
    { t:  240, max: 130 },
    { t:  360, max: 180 },
    { t:  480, max: 250 },
    { t:  600, max: 300 },
    { t:  780, max: 450 },
    { t:  960, max: 700 },
    { t: 1200, max: 850 }
  ],

  // Escalado por minuto. Vida y daño de cada enemigo se multiplican por
  // 1 + factor * minutos al aparecer, así que una serpiente del minuto 15 no es
  // la del minuto 0. La velocidad NO escala: un bestiario en el que todo acelera
  // con el reloj acaba siendo imposible de leer.
  escalado: { vida: 0.09, danyo: 0.04 },

  // Momentos de la línea temporal que el simulacro solo ANUNCIA. Los jefes son
  // la Fase 6 y necesitan sus fases de patrón; meterlos aquí como enemigos
  // corrientes daría un saco de vida ambulante que estropea la lectura de la
  // curva justo cuando se está midiendo.
  hitos: [
    { t:  600, texto: 'Cerbero' },
    { t: 1140, texto: 'Hidra' }
  ],

  // --- Pendiente de fases posteriores -------------------------------------
  decoracion: [],                      // Fase 7: columnas, gradas, arcos
  enemigos:   {},                      // Fase 5: referencias al catálogo global
  jefes:      { intermedio: 'cerbero', final: 'hidra' },
  musica:     { ambiente: null, jefe: null }
};
