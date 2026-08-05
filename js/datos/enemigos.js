// Catálogo global de enemigos. DATOS PUROS, cero lógica.
//
// Todas las medidas van en unidades LÓGICAS (rejilla de 480x270). El PNG de
// assets/ es el doble, pero eso solo lo sabe el atlas: aquí no aparece ni una
// constante de arte.
//
// Añadir un enemigo nuevo es añadir una entrada a este objeto y su sprite al
// atlas. Nada de esto obliga a tocar el motor.
//
// - vida / velocidad / danyo / radio: sección 10 del plan, a minuto 0.
// - xp: experiencia que suelta al morir, en la gema del escalón que le toque.
// - radio: círculo de COLISIÓN, no del sprite. Sale de min(0.35*alto, 0.45*ancho)
//   para que rozar un ala o un cuerno no cuente como impacto.
// - masa: reparte el empuje. Un cíclope no sale despedido como una serpiente.
//   No es un peso realista, es un divisor de empuje.
// - vuela: ignora la decoración del suelo y flota en vez de pisar.
// - inmuneEmpuje: el empuje por daño no le afecta (la separación entre bichos
//   sí, o se apilarían en un punto).
// - sprite: id en el atlas. Existe aparte del id de la entrada porque las
//   variantes tintadas (la serpiente dorada de la sección 11) reutilizan arte.
// - spriteBase + tinte: variante de COLOR. El motor genera al cargar una copia
//   teñida del sprite base y la registra con el id de `sprite`, así que a partir
//   de ahí la variante se dibuja exactamente igual que cualquier otro enemigo.
//   Es lo que permite que la serpiente dorada no necesite arte propio.
// - cofre: suelta un cofre al morir, además de su gema. Solo los élites.
// - persistente: el culling lo perdona hasta el doble de distancia. Un élite
//   que se recicla por haberse alejado se lleva con él su cofre, y con él la
//   vía de las evoluciones.
// - ataque: si lo lleva, DISPARA. Ver el bloque de la medusa más abajo.
// - movimiento: cómo se acerca. Ver el bloque de patrones al final de esta
//   cabecera.

// === SEGUNDO AJUSTE, CONTRA PARTIDA JUGADA ===================================
//
// Sergio jugó la curva entera y el diagnóstico fue claro: se llega al nivel 12
// sin esfuerzo, casi sin moverse, y los enemigos "superiores" mueren igual de
// fácil que la serpiente del minuto 0. Tres cambios, y los tres a la vez, porque
// por separado ninguno arregla nada:
//
//   1. VIDA MUY ARRIBA, y sobre todo SEPARADA POR ROL. Antes, entre la serpiente
//      (12) y el gladiador (75) había seis veces; con cuatro armas a nivel medio
//      las dos morían en el mismo golpe, así que el bestiario entero se sentía
//      igual. Ahora hay del orden de doce veces entre la masa y la base, y
//      cuarenta hasta el tanque. Ver un cíclope tiene que dar pereza.
//
//   2. VELOCIDAD ABAJO, otra vez. Parece contradictorio con "más difícil", pero
//      es justo al revés: en este género la masa amenaza por NÚMERO, y lo que
//      mata es quedar rodeado. Un enemigo lento y duro cierra el cerco y no se
//      puede atravesar; uno rápido y blando se disuelve al tocarlo. Además hace
//      legible al que sí corre: la arpía sigue siendo la única de la que no se
//      escapa en línea recta.
//
//   3. DAÑO DE CONTACTO ARRIBA. Con enemigos más lentos hay menos contactos, y
//      sin subir el daño la vida del jugador dejaba de ser un recurso.
//
// La otra mitad del ajuste no está aquí: la densidad, la variedad temprana y el
// escalado por minuto viven en datos/niveles/merida.js.
//
// --- ESPECIALES ---------------------------------------------------------------
//
// `especial` marca la variante potente de un enemigo corriente. La regla es de
// Sergio y es buena: MISMA VELOCIDAD que su versión básica, pero muy por encima
// en todo lo demás. Un especial no se distingue por correr más —eso solo genera
// persecuciones frustrantes— sino por aguantar, y por lo que suelta al caer.
//
// --- AJUSTE ANTERIOR (se conserva por qué se hizo) ---------------------------
// AJUSTE DE VELOCIDAD Y VIDA respecto a la tabla original del plan.
//
// Velocidades: dos correcciones, no una.
//
// La primera, bajarlo todo. El jugador va a 85 y el plan ponía a la masa en 68,
// un 80% de tu velocidad: asfixiante. En este género la masa es LENTA y amenaza
// por número, no por alcance; lo que mata es quedar rodeado.
//
// La segunda, y la que más se notaba: SEPARARLAS ENTRE SÍ. Con casi todo entre
// 28 y 40 daba igual qué bicho te persiguiera, y un bestiario en el que todos se
// mueven igual es un bestiario de un solo enemigo con once sprites. Ahora el
// abanico va del 12% de tu velocidad (cíclope, un muro que camina) al 78%
// (arpía, la única de la que no puedes escapar en línea recta). Entre la
// serpiente del minuto 0 y el gladiador hay más del doble.
//
// El arranque tiene que ser MUY lento: serpiente y gárgola son lo primero que
// se ve.
//
// --- TERCERA BAJADA: TODO UN 25% MÁS LENTO ----------------------------------
//
// Petición de Sergio tras jugar: "todo se mueve demasiado rápido, tanto jugadores
// como enemigos". Baja el bestiario ENTERO y también el jugador (BASE.velocidad
// en entidades/jugador.js), así que la proporción entre ambos no cambia y lo que
// se ha aprendido sobre huir sigue valiendo. Lo que cambia es el ritmo: hay más
// tiempo para leer la pantalla y decidir, y el agobio pasa a venir de que el
// cerco se cierra, no de que no da tiempo a reaccionar.
//
// Tabla VIGENTE. Porcentaje sobre los 64 del jugador:
//
//   ciclope     7   11%      medusa       8   13%
//   serpiente  10   16%      serp. dorada 11  17%
//   legionario 13   20%      loba        12   19%
//   minotauro  15   23%      gargola     16   25%
//   gladiador  24   38%      gemelo      25   39%
//   manticora  28   44%      arpia       32   50%
//
// Vida: también estaba baja. Con el Pilum a 10 de daño, casi todo moría de un
// disparo y no se sentía ningún peso. (Ese ajuste se quedó corto y es lo que
// corrige el bloque de arriba: ver "SEGUNDO AJUSTE".)
//
// Estos números se afinarán contra la curva real en la Fase 8; lo que buscan de
// momento es que el minuto 0 se sienta como debe.
// RADIOS REDUCIDOS AL 70%, en la misma proporción que el arte (ver el catálogo
// de herramientas/procesar-assets.ps1). Se encogieron los cuerpos para que
// quepa más campo en pantalla; si el radio de colisión no bajara con ellos,
// los enemigos golpearían desde fuera de su propia silueta.
//
// --- CÓMO SE MUEVE CADA UNO --------------------------------------------------
//
// `movimiento` es lo que rompe la sensación de REBAÑO. Con todos persiguiendo
// en línea recta al mismo objetivo, doscientos enemigos se comportan como un
// solo bloque que se desliza: no hay nada que leer en la horda, solo una masa
// que avanza, y esquivar deja de ser una decisión. Cada patrón mete una
// trayectoria distinta, y encima cada individuo lleva su fase, su sentido de
// giro y su velocidad (±14%), así que dos serpientes del mismo enjambre nunca
// van sincronizadas.
//
//   directo    — recto al jugador más cercano. Los disciplinados y los muros.
//   zigzag     — culebrea de lado a lado mientras avanza.
//   revoloteo  — vuelo errático: dos ondas de periodo distinto, así que no se
//                le ve la repetición, y la velocidad también oscila.
//   orbita     — se acerca en espiral y da vueltas buscando el hueco.
//   acecho     — avanza a tirones: se para y embiste.
//   huida      — se aleja del jugador y le da vueltas a distancia. El único que
//                no quiere alcanzarte: hay que ir a por él.
//
// Todos tiran RECTO en el último tramo, o un enemigo que culebrea pegado a ti
// no llegaría a tocarte nunca y el combate sería incomprensible.
export const ENEMIGOS = {
  // --- Masa: carne de cañón, aparecen en enjambres -------------------------
  // La serpiente ya no muere de un solo disparo del Pilum base (10). Es el
  // enemigo del minuto 0 y tiene que enseñar que aquí las cosas hay que
  // matarlas; con un golpe por bicho, los dos primeros minutos se juegan solos.
  //
  // Su RADIO baja a la mitad con su sprite (ver el catálogo de la herramienta):
  // el círculo de daño no puede sobrar por fuera de la silueta, o el bicho muerde
  // desde donde no está.
  serpiente:  { sprite:'serpiente',  rol:'masa',      xp:1, vida:16,    velocidad:10, danyo:4,  radio:2.1,  masa:1.0,  vuela:false, inmuneEmpuje:false, movimiento:'zigzag'    },
  gargola:    { sprite:'gargola',    rol:'masa',      xp:2, vida:40,    velocidad:16, danyo:5,  radio:4.9,  masa:1.6,  vuela:true,  inmuneEmpuje:false, movimiento:'revoloteo' },

  // --- Base: los guardianes humanos ---------------------------------------
  // Casi diez veces la serpiente. Un legionario no es "otra serpiente con
  // casco": es un muro que hay que decidir si rodear o romper. Sus radios suben
  // con el sprite, que ahora es un 40% más alto.
  legionario: { sprite:'legionario', rol:'base',      xp:6, vida:140,   velocidad:13, danyo:9,  radio:6.9,  masa:3.5,  vuela:false, inmuneEmpuje:false, movimiento:'directo'   },
  gladiador:  { sprite:'gladiador',  rol:'base',      xp:8, vida:190,   velocidad:24, danyo:11, radio:7.8,  masa:4.5,  vuela:false, inmuneEmpuje:false, movimiento:'orbita'    },

  // --- Rápido: el único que te alcanza si huyes en línea recta ------------
  // Bajada EXTRA por encima del 25% general: a 50 se hacía insoportable, porque
  // vuela errática y no hay forma de anticiparla. A 32 sigue siendo la más rápida
  // del bestiario y la única que gana terreno si huyes en línea recta, pero da
  // tiempo a verla llegar.
  arpia:      { sprite:'arpia',      rol:'rapido',    xp:5, vida:70,    velocidad:32, danyo:8,  radio:5.6,  masa:2.2,  vuela:true,  inmuneEmpuje:false, movimiento:'revoloteo' },

  // --- Distancia: los que NO matan por contacto ---------------------------
  //
  // `ataque` es lo que convierte a un enemigo en amenaza a distancia. Hasta ahora
  // TODO el bestiario mataba pegándose a ti, y eso hace que solo exista una
  // pregunta: cuánta gente tengo encima. Con enemigos que disparan hay que mirar
  // la pantalla entera, y además aparece una decisión nueva: los disparos SE
  // PUEDEN DESTRUIR con cualquier arma, así que un proyectil que viene se puede
  // esquivar o reventar.
  //
  // Solo lo llevan los poderosos. La masa nunca dispara: si la carne de cañón
  // tuviera alcance, no habría ningún sitio seguro y el mapa dejaría de importar.
  //
  //   danyo       daño del proyectil al jugador
  //   cadencia    segundos entre disparos
  //   alcance     a partir de aquí deja de disparar (y nunca dispara desde fuera
  //               de la pantalla: sería un golpe llegado de la nada)
  //   velocidad   la del proyectil. Lenta a propósito en los grandes: un disparo
  //               que no se puede ver venir no es un ataque, es un impuesto
  //   proyectiles + dispersion   abanico, en grados entre uno y otro
  //   vida        impactos que aguanta antes de romperse
  medusa:     { sprite:'medusa',     rol:'distancia', xp:8, vida:160,   velocidad:8,  danyo:7,  radio:6.3,  masa:3.5,  vuela:false, inmuneEmpuje:false, movimiento:'acecho',
                ataque: { danyo:12, cadencia:2.8, alcance:190, velocidad:78, proyectiles:1, dispersion:0, radio:4.5, color:'#9ae86a', vida:1 } },

  // --- Tanques: cuestan de verdad, y no son jefes -------------------------
  // Cuarenta veces una serpiente. Con el arsenal del minuto 8 son varios
  // segundos de fuego concentrado, y ese es el punto: mientras le pegas a un
  // cíclope, el resto de la oleada te está rodeando.
  // El CÍCLOPE ya no es solo un muro que pega al tocarlo: levanta una roca y la
  // estampa contra el suelo donde estás. `tipo:'sismo'` no vuela hacia ti como un
  // proyectil —marca un círculo en el suelo, avisa, y revienta—, así que no se
  // puede destruir en el aire: se esquiva saliendo del círculo.
  //
  // Es el enemigo que obliga a MOVERSE aunque le estés dando. Con daño solo por
  // contacto, un cíclope se resolvía quedándose a dos pasos y disparando.
  ciclope:    { sprite:'ciclope',    rol:'tanque',    xp:45, vida:950,   velocidad:7,  danyo:30, radio:9.8,  masa:20.0, vuela:false, inmuneEmpuje:true,  movimiento:'directo',
                ataque: { tipo:'sismo', danyo:34, cadencia:4.2, alcance:230, aviso:0.85, radio:46, color:'#c98a3a' } },
  minotauro:  { sprite:'minotauro',  rol:'tanque',    xp:24, vida:520,   velocidad:15, danyo:21, radio:9.1,  masa:14.0, vuela:false, inmuneEmpuje:false, movimiento:'acecho'    },

  // --- Élite: suelta cofre garantizado ------------------------------------
  // La mantícora dispara el abanico de tres púas que pedía la sección 10 del
  // plan. Desde lejos y en abanico: es lo que la convierte en un enemigo al que
  // hay que acercarse con cuidado, en vez de un saco de vida al que rodear.
  manticora:  { sprite:'manticora',  rol:'elite',     xp:120, vida:2600,  velocidad:28, danyo:13, radio:12.6, masa:30.0, vuela:true,  inmuneEmpuje:false, movimiento:'orbita',  cofre:true, persistente:true,
                ataque: { danyo:14, cadencia:2.5, alcance:260, velocidad:105, proyectiles:3, dispersion:16, radio:4, color:'#ffb14a', vida:1 } },

  // Serpiente dorada (sección 11 del plan): la SEGUNDA vía de las evoluciones.
  // Variante de color de la serpiente, así que no cuesta ni un PNG.
  //
  // CORREGIDA tras jugarla. Iba a 78 sobre los 85 del jugador y la sensación era
  // mala: se pasaba la aparición entera escapándose, y alcanzarla dependía de
  // arrinconarla, no de decidir nada. Ahora es al revés y sigue la regla de los
  // especiales — misma velocidad que la serpiente corriente, todo lo demás por
  // las nubes:
  //
  //   velocidad 11  — uno por encima de la serpiente básica. Se la alcanza
  //                   andando, sin perseguirla.
  //   vida 1400     — casi noventa veces la serpiente de la que sale, y más que
  //                   dos cíclopes. AQUÍ está el reto: no es cazarla, es aguantar
  //                   plantado el tiempo que cuesta tumbarla mientras la oleada
  //                   sigue llegando. Esa es la decisión que plantea el cofre.
  //   danyo 2       — huye, no muerde. Si además pegara, quedarse a matarla sería
  //                   un castigo y nadie lo haría.
  //
  // `persistente` sigue haciendo falta: aunque se aleje despacio, se aleja.
  serpienteDorada: { sprite:'serpienteDorada', spriteBase:'serpiente', tinte:'#e8b73a',
                     rol:'elite', especial:'serpiente', xp:70, vida:1400, velocidad:11, danyo:2,
                     radio:2.1, masa:10.0,
                     vuela:false, inmuneEmpuje:false, movimiento:'huida', cofre:true, persistente:true },

  // Gárgola de bronce: el segundo especial, para que el recurso no sea "la
  // serpiente dorada y nada más". Misma gárgola, mismo vuelo errático, misma
  // velocidad, pero aguanta como un tanque y suelta cofre. No huye: esta se te
  // queda encima, así que el dilema es el contrario que con la dorada —no hay
  // que ir a buscarla, hay que sobrevivir a ella mientras la tumbas.
  gargolaBronce:   { sprite:'gargolaBronce', spriteBase:'gargola', tinte:'#c9822f',
                     rol:'elite', especial:'gargola', xp:90, vida:1800, velocidad:16, danyo:12,
                     radio:4.9, masa:14.0,
                     vuela:true, inmuneEmpuje:false, movimiento:'revoloteo', cofre:true, persistente:true },

  // === DORADOS: la versión que suelta tesoro ================================
  //
  // Cualquier enemigo puede tener su dorado. Son variantes de color con la MISMA
  // velocidad que su original —la regla de los especiales— pero muchísima más
  // vida, mucha más experiencia y un cofre garantizado.
  //
  // Aparecen poco, y los de los enemigos poderosos aparecen TARDE: ver un
  // legionario dorado en el minuto 3 sería ver un muro imposible; verlo en el 11,
  // cuando ya tienes arsenal, es una oportunidad. La escala de aparición está en
  // datos/niveles/merida.js.
  //
  // La serpiente dorada de más arriba es el primero de la familia y se queda
  // donde está por su papel especial: es la única que HUYE.
  gargolaDorada:    { sprite:'gargolaDorada', spriteBase:'gargola', tinte:'#e8c23a',
                      rol:'elite', especial:'gargola', xp:110, vida:2000, velocidad:16, danyo:7,
                      radio:4.9, masa:12.0,
                      vuela:true, inmuneEmpuje:false, movimiento:'revoloteo', cofre:true, persistente:true },
  legionarioDorado: { sprite:'legionarioDorado', spriteBase:'legionario', tinte:'#e8c23a',
                      rol:'elite', especial:'legionario', xp:150, vida:3200, velocidad:13, danyo:12,
                      radio:6.9, masa:18.0,
                      vuela:false, inmuneEmpuje:false, movimiento:'directo', cofre:true, persistente:true },
  gladiadorDorado:  { sprite:'gladiadorDorado', spriteBase:'gladiador', tinte:'#e8c23a',
                      rol:'elite', especial:'gladiador', xp:190, vida:4000, velocidad:24, danyo:14,
                      radio:7.8, masa:22.0,
                      vuela:false, inmuneEmpuje:false, movimiento:'orbita', cofre:true, persistente:true },
  minotauroDorado:  { sprite:'minotauroDorado', spriteBase:'minotauro', tinte:'#e8c23a',
                      rol:'elite', especial:'minotauro', xp:280, vida:6500, velocidad:15, danyo:22,
                      radio:9.1, masa:40.0,
                      vuela:false, inmuneEmpuje:false, movimiento:'acecho', cofre:true, persistente:true },

  // --- Jefes --------------------------------------------------------------
  // La velocidad y el daño de contacto de los jefes son provisionales: el plan
  // solo les fija vida, sprite y radio porque su amenaza real está en las fases
  // de patrón, que llegan en la Fase 6. Estos valores solo sirven para que se
  // puedan invocar y probar antes.
  //
  // EL JEFE FINAL DEL NIVEL 1 CAMBIA: la Hidra del plan la sustituye LA LOBA
  // CAPITOLINA con los gemelos, por decisión de Sergio. Y es mejor decisión que
  // la del plan: la hidra es un monstruo griego genérico que podría cerrar
  // cualquier nivel de cualquier juego; la loba amamantando a Rómulo y Remo es
  // LA imagen de Roma, y verla deformada en algo monstruoso cierra un nivel que
  // se llama Emerita Augusta y transcurre en un anfiteatro romano.
  //
  // El diseño que sostiene esa imagen (para la Fase 6): la loba pelea con los
  // dos gemelos colgados. Mientras siga alguno vivo, ella se regenera —están
  // mamando de ella— así que hay que arrancárselos primero, y cada vez que cae
  // uno, ella se enfurece. Es el control de DPS que el plan pedía para la hidra,
  // pero contado con una imagen en vez de con una regla.
  //
  // Sus MASAS son enormes a propósito: el empuje por daño es inverso a la masa,
  // así que un jefe apenas se inmuta y una serpiente sale despedida. Ver el
  // comentario de `danyar` en entidades/enemigo.js.
  cerbero:    { sprite:'cerbero',    rol:'jefe',      xp:600,  vida:9000,  velocidad:18, danyo:34, radio:21,   masa:80.0,  vuela:false, inmuneEmpuje:true,  movimiento:'directo' },
  loba:       { sprite:'loba',       rol:'jefe',      xp:1500, vida:26000, velocidad:12, danyo:38, radio:27.3, masa:120.0, vuela:false, inmuneEmpuje:true,  movimiento:'acecho'  },
  gemelo:     { sprite:'gemelo',     rol:'jefe',      xp:200,  vida:3000,  velocidad:25, danyo:18, radio:8,    masa:16.0,  vuela:false, inmuneEmpuje:false, movimiento:'zigzag'  }
};
