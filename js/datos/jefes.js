// Fase 6 (y su ampliación a 30 minutos): comportamiento de los tres jefes.
// DATOS PUROS, cero lógica — la lee sistemas/jefes.js, que es el motor
// genérico.
//
// Por qué un archivo aparte y no más campos en datos/enemigos.js: un jefe no es
// una entrada de bestiario con un `ataque`, es una SECUENCIA con fases y
// eventos propios. Metelo en enemigos.js habría obligado a que el catálogo
// entero conviviera con campos que solo dos entradas usan.
//
// CERBERO — sección 10 del plan, tal cual: tres fases por tercios de vida.
//   1. 100-66%   persecución simple y mordisco corto. Ya lo da gratis el motor
//                genérico (persecución + daño de contacto), así que esta fase
//                no necesita ningún dato: es la ausencia de comportamiento
//                especial.
//   2. 66-33%    las tres cabezas escupen conos de fuego ALTERNOS que dejan
//                charcos. `angulos` son los tres rumbos que van turnándose en
//                cada disparo — eso es lo que hace que se lea como "una cabeza
//                distinta cada vez" sin tener que dibujar tres cabezas.
//   3. 33-0%     encadena embestidas mientras invoca serpientes en tandas de
//                10. `cadena` es cuántas embestidas seguidas antes de la
//                pausa larga.
export const JEFES = {
  cerbero: {
    fases: [0.66, 0.33],           // umbral de vida al que ENTRA cada fase siguiente

    // AJUSTADO tras jugarlo: la línea de charcos cubría casi 100 unidades de
    // ancho con solo 0.55s de aviso — una pared, no una amenaza que se pueda
    // leer y esquivar. Menos charcos, más juntos y más pequeños (98 -> 66 de
    // alcance total) y un poco más de aviso para poder salir del cono antes
    // de que prenda. El daño por tic también baja: la pared castigaba doble,
    // por tamaño Y por dolor.
    fuego: {
      cadencia: 3.4,
      aviso: 0.7,                  // telegrafía antes de escupir
      angulos: [-0.34, 0, 0.34],   // rad, alterna una cabeza distinta por disparo
      pasos: 3, paso: 20,          // charcos por cono y separación entre ellos
      radioCharco: 15, duracionCharco: 3, danyoCharco: 6, intervaloCharco: 0.5,
      color: '#ff7a2a',
      sprite: 'charcoLava'
    },

    embestida: {
      cadencia: 4.6,               // entre CADENAS, no entre embestidas sueltas
      cadenaMin: 2, cadenaMax: 3,
      pausaCadena: 0.45,           // respiro entre una embestida y la siguiente de la cadena
      aviso: 0.6,
      velocidad: 2.7,              // multiplica la velocidad base del jefe
      duracion: 0.5,
      multDanyo: 1.25              // 1.4 -> 1.25: el contacto en plena carga pegaba demasiado fuerte
    },

    invocacion: {
      cadencia: 7,
      cantidad: 10,
      tipo: 'serpiente',
      radio: 46,
      escala: 2.0                  // vida/daño fijos: es un set-piece, no la curva del director
    }
  },

  // HIDRA — jefe del minuto 20, entre Cerbero y la Loba. Recupera el sprite
  // del jefe final ORIGINAL del plan, que se quedó sin usar cuando la Loba
  // Capitolina lo sustituyó (ver datos/enemigos.js): con la partida ampliada a
  // 30 minutos hacía falta un segundo jefe intermedio, y ya había un dragón de
  // varias cabezas completo esperando en resources/.
  //
  // Más sencilla que Cerbero a propósito: no tiene fases por tercios, tiene
  // DOS rasgos que conviven desde que aparece:
  //   - VENENO constante: dos cabezas escupen alternando (Cerbero tiene tres),
  //     el mismo mecanismo que sus conos de fuego pero con charcos más chicos
  //     y más largos, y verdes en vez de naranjas.
  //   - FURIA DE UNA SOLA VEZ: al cruzar el 50% de vida se enfurece para
  //     siempre —más rápida, más dañina, y regenera un goteo— en vez de
  //     encadenar varias veces como la Loba. Es la tensión de "la herida no
  //     cierra" contada con un interruptor, no con una cadena de eventos.
  // AJUSTADO tras jugarlo: con cadencia 3.0s y cada charco vivo 0.5+3.5=4.0s,
  // la SIGUIENTE cabeza escupía antes de que el veneno de la anterior se
  // apagara —el mismo problema de la "pared" que ya se corrigió una vez en
  // el fuego de Cerbero (ver su comentario más arriba), pero aquí sin
  // corregir: el suelo quedaba envenenado sin hueco entre volea y volea,
  // que es justo lo que se lee como "imposible de esquivar". Ahora la
  // cadencia (4.2s) sí supera el tiempo de vida del charco (0.5+2.6=3.1s),
  // dejando ~1.1s de suelo limpio entre cabezazo y cabezazo.
  hidra: {
    veneno: {
      cadencia: 4.2,
      aviso: 0.5,
      angulos: [-0.3, 0.3],         // dos cabezas, no tres como Cerbero
      pasos: 3, paso: 22,
      radioCharco: 18, duracionCharco: 2.6, danyoCharco: 6, intervaloCharco: 0.6,
      color: '#6fbf4a',
      sprite: 'charcoPonzona'
    },
    furia: {
      umbral: 0.5,                 // se dispara UNA vez, al cruzar el 50% de vida
      multDanyo: 1.15,             // 1.3 -> 1.15: es PERMANENTE el resto del combate
      multVelocidad: 1.2,
      regenFraccion: 0.006
    }
  },

  // La Loba no tiene fases por vida: su amenaza es el vínculo con los gemelos.
  //   - Mientras viva alguno, ella REGENERA: plantarse a pegarle a su cuerpo sin
  //     antes arrancarle los gemelos es perder el tiempo.
  //   - Cada gemelo que cae la ENFURECE: más rápida y más dañina un rato. Es el
  //     control de DPS que el plan pedía para la hidra, pero contado con una
  //     imagen en vez de con una regla de cabezas.
  loba: {
    regenFraccion: 0.009,          // fracción de vida máxima curada por segundo
    furia: { duracion: 6, multDanyo: 1.6, multVelocidad: 1.3 }
  }
};

// Nombres de aviso, para no repetir cadenas mágicas en sistemas/jefes.js.
export const AVISO_FURIA = 'LA LOBA SE ENFURECE';
