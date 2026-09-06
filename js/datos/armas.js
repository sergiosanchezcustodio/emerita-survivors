// Catálogo de armas. DATOS PUROS, cero lógica.
//
// `comportamiento` es la única bisagra con el motor: nombra una función de
// sistemas/armas.js. Todo lo demás son parámetros que esa función lee. Añadir un
// arma que reutilice un comportamiento existente es añadir una entrada aquí y
// nada más, que es el criterio 8 del plan.
//
// `niveles` son INCREMENTOS ACUMULATIVOS, no valores absolutos. El nivel 1 es la
// entrada base; subir a nivel 3 aplica los deltas de los niveles 2 y 3. Se
// expresa así para que la tabla se lea igual que la del plan ("+1 proyectil en
// el 3 y en el 6") sin tener que recalcular a mano ocho filas de absolutos.
//
// Unidades: daño en puntos, recarga en segundos, distancias y radios en
// unidades LÓGICAS, velocidades en unidades lógicas por segundo, ángulos en
// grados (el motor los pasa a radianes).

export const ARMAS = {
  // --- Implementadas en la Fase 3 -----------------------------------------
  pilum: {
    nombre: 'Pilum',
    descripcion: 'Jabalina al enemigo más cercano.',
    comportamiento: 'proyectilDirigido',
    // Golpe de polvo al soltar el brazo, hacia ATRÁS y no hacia el vuelo -es
    // el único dato que distingue este comportamiento del de un arma de
    // fuego. Ver `emitirLanzamiento` en sistemas/armas.js.
    lanzamiento: true,
    danyo: 10,
    recarga: 1.2,
    proyectiles: 1,
    velocidad: 230,
    alcance: 300,            // hasta dónde busca objetivo y cuánto vuela
    // ÁREA x3: el círculo de impacto pasa de 4 a 12. Es un salto grande para un
    // arma de un solo blanco, y se nota sobre todo en que deja de fallar por un
    // pelo a los que se cruzan de lado.
    radio: 12,               // círculo de impacto del proyectil
    perforacion: 0,          // enemigos extra que atraviesa
    dispersion: 7,           // grados entre proyectiles del mismo disparo
    empuje: 90,
    color: '#f0e2b6',
    // Una lanza larga: hoja de laurel al frente y fuste fino de una pieza
    // detrás. Llevaba la silueta del pilum histórico —punta pequeña, caña de
    // hierro y asta gruesa— y a tamaño de juego eso se leía como un palo con un
    // nudo en medio, porque la caña es una línea de un píxel que parte la
    // silueta en dos trozos. Ver el catálogo de generar-efectos.ps1.
    spriteProyectil: 'proyPilum',
    // DIBUJADO x2,4 sobre una hoja de 36x3,5 unidades: 86 de largo por 8,4 de
    // alto en pantalla.
    //
    // Son las dos cosas a la vez y por caminos distintos, que es lo que hay que
    // tener claro si se vuelve a tocar:
    //
    //   el doble de GRANDE -> esta escala, de 1,2 a 2,4. Afecta a todo.
    //   el doble de LARGA  -> la hoja, de 36 a 72 de fuente. Solo al largo.
    //
    // Estirar por la hoja y no por la escala es lo que mantiene el grosor: la
    // proporción sube a 10 a 1 y se lee lanza. Doblando solo la escala habría
    // salido la misma jabalina al doble de gorda.
    //
    // Y CUIDADO CON EL ANCLAJE si se sigue alargando. El dibujo se ancla por la
    // punta: sobresale un 20% por delante del punto que colisiona y el 80%
    // restante va por detrás. A 86 de largo eso son casi 70 unidades de fuste
    // arrastrando, así que al disparar a un enemigo pegado la culata asoma por
    // el lado contrario del personaje. Es geometría, no un fallo, pero es el
    // límite práctico de este anclaje.
    escalaProyectil: 2.4,
    estela: '#c89a4a',
    // Sección 9: nivel 8 + este pasivo a 1 o más, y un COFRE de élite.
    evolucion: { pasivo: 'anilloAugusto', arma: 'pilumJupiter' },
    niveles: [
      {},
      { danyo: 3 },
      { proyectiles: 1 },
      { danyo: 4, perforacion: 1 },
      { recarga: -0.15 },
      { proyectiles: 1 },
      { danyo: 6, perforacion: 1 },
      { danyo: 8, recarga: -0.15 },
      { danyo: 6 },
      { danyo: 9, recarga: -0.15 }
    ]
  },

  gladius: {
    nombre: 'Gladius',
    descripcion: 'Arco de corte en la dirección de avance.',
    comportamiento: 'arcoMelee',
    spriteTajo: 'tajoGladius',
    duracionTajo: 0.24,
    danyo: 20,
    recarga: 1.0,
    alcance: 46,
    angulo: 90,              // apertura total del arco
    golpes: 1,               // tajos por activación
    demoraGolpe: 0.12,       // segundos entre tajos encadenados
    empuje: 150,
    color: '#dfe6ef',
    evolucion: { pasivo: 'lorica', arma: 'gladiusHispaniensis' },
    niveles: [{}, { danyo: 8 }, { angulo: 20, alcance: 6 }, { danyo: 11 },
      { golpes: 1, danyo: 10 }, { angulo: 25, alcance: 8 }, { danyo: 16 },
      { danyo: 20, alcance: 10 }, { danyo: 11 }, { danyo: 16, recarga: -0.15 }]
  },

  pistola: {
    nombre: 'Pistola',
    descripcion: 'Tiro certero al más cercano. Rápida y de largo alcance.',
    comportamiento: 'proyectilDirigido',
    forma: 'bala',
    // Fogonazo en la boca del cañón, una vez por disparo. Solo las armas de
    // fuego lo llevan -el Pilum o la Honda también son `proyectilDirigido`
    // pero no queman pólvora- así que es un dato de esta arma, no del
    // comportamiento. Ver `emitirFogonazo` en sistemas/armas.js.
    fogonazo: true,
    danyo: 7,
    recarga: 0.55,
    proyectiles: 1,
    velocidad: 400,
    alcance: 340,
    radio: 3,
    perforacion: 0,
    dispersion: 4,
    empuje: 40,
    color: '#ffe9b0',
    estela: '#8f7a4a',
    // La bala en vuelo CON su llama, dibujada. Sustituye al punto con estela
    // que traza el motor —cuerpo, halo y rastro— y se orienta al vuelo.
    // Mide 43x19 píxeles físicos, o sea que el blit va 1:1.
    spriteProyectil: 'balaPistola',
    niveles: [
      {},
      { danyo: 2 },
      { recarga: -0.08 },
      { danyo: 3, perforacion: 1 },
      { proyectiles: 1 },
      { recarga: -0.08 },
      { danyo: 5 },
      { proyectiles: 1, danyo: 5 },
      { danyo: 6 },
      { danyo: 9, recarga: -0.15 }
    ]
  },

  escopeta: {
    nombre: 'Escopeta',
    descripcion: 'Abanico de perdigones. Poco alcance, mucho destrozo.',
    comportamiento: 'conoCorto',
    forma: 'bala',
    fogonazo: true,
    danyo: 6,
    recarga: 1.1,
    proyectiles: 6,
    velocidad: 260,
    alcance: 110,
    angulo: 55,
    radio: 3,
    perforacion: 0,
    empuje: 130,
    color: '#ffd9a0',
    estela: '#a05a2a',
    spriteProyectil: 'balaEscopeta',
    niveles: [
      {},
      { proyectiles: 2 },
      { danyo: 2 },
      { alcance: 25, angulo: 8 },
      { proyectiles: 2 },
      { danyo: 3, perforacion: 1 },
      { recarga: -0.2 },
      { proyectiles: 3, danyo: 4 },
      { danyo: 6 },
      { danyo: 9, recarga: -0.15 }
    ]
  },

  // --- Patrones fijos: no apuntan, barren -------------------------------
  lanzasGemelas: {
    nombre: 'Lanzas gemelas',
    descripcion: 'Barre a izquierda y derecha. No apunta: alíneate.',
    comportamiento: 'direccionFija', patron: 'horizontal',
    danyo: 14, recarga: 1.0, proyectiles: 1, velocidad: 250, alcance: 260,
    radio: 4, perforacion: 1, dispersion: 0, empuje: 90,
    color: '#e6dcc0', estela: '#8a7d5f', largoTrazo: 10,
    // Una lanza de mano, hoja de laurel sobre fresno. La comparte con el Muro
    // de lanzas: son la misma arma disparada en otra dirección, y compartir hoja
    // es lo que ya hacen las seis armas de fuego con la bala de la pistola.
    spriteProyectil: 'proyLanza',
    niveles: [{}, { danyo: 5 }, { perforacion: 1 }, { proyectiles: 1, dispersion: 9 },
              { recarga: -0.15 }, { danyo: 8 }, { perforacion: 2 }, { proyectiles: 1, danyo: 10 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },
  columnaDoble: {
    nombre: 'Columna doble',
    descripcion: 'Dispara arriba y abajo a la vez.',
    comportamiento: 'direccionFija', patron: 'vertical',
    danyo: 15, recarga: 1.1, proyectiles: 1, velocidad: 240, alcance: 230,
    radio: 4, perforacion: 1, dispersion: 0, empuje: 90,
    color: '#cfe3f0', estela: '#5f7d8a', largoTrazo: 10,
    // Fustes de mármol subiendo desde el personaje, arriba y abajo. El dibujo
    // se orienta al rumbo, así que el capitel va siempre por delante.
    spriteProyectil: 'proyColumna',
    // Y EN PARALELO, NO EN ABANICO. Al ganar la segunda columna, la dispersión
    // de 9 grados las habría abierto en uve: dos columnas torcidas. Con
    // `separacion` salen con el mismo rumbo, corridas 14 unidades a cada lado
    // del eje — que es una columnata, que es lo que el arma dice ser.
    //
    // 14 son algo más de dos anchos de fuste: se ven las dos enteras y siguen
    // leyéndose como una pareja, no como dos disparos sueltos.
    separacion: 14,
    niveles: [{}, { danyo: 5 }, { perforacion: 1 }, { proyectiles: 1 },
              { recarga: -0.15 }, { danyo: 8 }, { perforacion: 2 }, { proyectiles: 1, danyo: 10 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },
  rosaDeVientos: {
    nombre: 'Rosa de los vientos',
    descripcion: 'Estrellas en cruz que crecen con el nivel.',
    comportamiento: 'direccionFija', patron: 'cruz',
    danyo: 8, recarga: 1.3, proyectiles: 1, velocidad: 210, alcance: 200,
    radio: 3, perforacion: 0, dispersion: 0, empuje: 60,
    color: '#d8c8f0', estela: '#6a5a8a', largoTrazo: 7,
    // La estrella de la rosa de los vientos: ocho puntas, cuatro largas a los
    // rumbos cardinales y cuatro cortas en las diagonales, con cada punta
    // partida en cara clara y cara en sombra como en las cartas de navegar. Un
    // cuatro puntas era una estrella cualquiera; lo que la hace una rosa es
    // justamente la segunda serie más corta.
    //
    // Gira despacio sobre sí misma porque es simétrica: sin giro, orientarla al
    // vuelo no se notaría y parecería una pegatina.
    spriteProyectil: 'proyRosa',
    giroProyectil: 6,
    // CRECE CON EL NIVEL, y crecen las dos cosas a la vez y al mismo ritmo:
    // `radio` es lo que golpea y `escalaProyectil` lo que se ve.
    //
    // A UN TERCIO DE LO QUE CRECÍA. Llegó a x4 y a radio 12, y al máximo eran
    // cuatro ruedas de bronce que se comían la pantalla; ahora se queda en x1,33
    // y radio 4. Sigue notándose que sube —la estrella entra siendo una chispa y
    // acaba con cuerpo— sin convertirse en el arma más aparatosa del juego.
    //
    // Van clavadas la una a la otra a propósito, y por eso se reducen las dos:
    // una estrella dibujada al cuádruple golpeando a la distancia de siempre
    // sería una mentira de las gordas, y al revés todavía peor, daño invisible.
    escalaProyectil: 1,
    // El radio sube UNA sola vez, a mitad de camino, y la escala lo acompaña en
    // pasos pequeños: 3 -> 4 y x1 -> x1,33 son la MISMA proporción. Repartir el
    // radio en tres saltos como antes lo habría dejado en x2 con el dibujo en
    // x1,33, que es exactamente el descuadre que estas dos líneas evitan.
    niveles: [{}, { danyo: 3, escalaProyectil: 0.04 },
              { perforacion: 1, escalaProyectil: 0.04 },
              { recarga: -0.2, escalaProyectil: 0.04 },
              { danyo: 4, escalaProyectil: 0.04 },
              { proyectiles: 1, dispersion: 11, radio: 1, escalaProyectil: 0.04 },
              { perforacion: 1, escalaProyectil: 0.04 },
              { danyo: 6, escalaProyectil: 0.03 },
              { danyo: 6, escalaProyectil: 0.03 },
              { danyo: 9, recarga: -0.15, escalaProyectil: 0.03 }]
  },
  metralla: {
    nombre: 'Metralla',
    descripcion: 'Escupe en direcciones al azar. Caos barato.',
    comportamiento: 'direccionAleatoria',
    forma: 'bala',
    danyo: 6, recarga: 0.45, proyectiles: 2, velocidad: 200, alcance: 150,
    radio: 3, perforacion: 0, empuje: 40,
    color: '#ffcf8a', estela: '#8a5a2a', largoTrazo: 6,
    // Un casco de hierro roto, con aristas. No hay dos iguales en pantalla
    // porque salen girados en direcciones al azar, que es lo que hace el arma.
    spriteProyectil: 'proyMetralla',
    // EL DOBLE DE PIEDRAS AL 10: de 12 a 24, subiendo por el mismo camino de
    // antes (cada nivel suma, y el 8 suma el doble). El daño por impacto no se
    // toca: esta arma no va de pegar fuerte, va de llenar el aire — duplicar la
    // cantidad es subirla por donde es ella.
    niveles: [{}, { proyectiles: 2 }, { danyo: 2, proyectiles: 2 }, { recarga: -0.08, proyectiles: 2 },
              { proyectiles: 2 }, { danyo: 3, proyectiles: 2 }, { alcance: 50, proyectiles: 2 },
              { proyectiles: 4 }, { danyo: 6, proyectiles: 3 }, { danyo: 9, recarga: -0.15, proyectiles: 3 }]
  },

  // --- Explosivos: mucha área, poco daño directo ------------------------
  lanzagranadas: {
    nombre: 'Lanzagranadas',
    descripcion: 'Sale disparada y revienta al tocar. Área amplia.',
    comportamiento: 'proyectilExplosivo',
    spriteOnda: 'explosionFuego',
    danyo: 4, danyoExplosion: 22, radioExplosion: 27,
    recarga: 2.0, proyectiles: 1, velocidad: 170, alcance: 200,
    radio: 4, perforacion: 0, dispersion: 12, empuje: 150,
    color: '#ff9a4a', estela: '#8a3a10', largoTrazo: 7,
    niveles: [{}, { danyoExplosion: 7 }, { radioExplosion: 8 }, { proyectiles: 1 },
              { danyoExplosion: 9 }, { radioExplosion: 10 }, { recarga: -0.4 },
              { proyectiles: 1, danyoExplosion: 12 },
              { danyoExplosion: 6 }, { danyoExplosion: 9, recarga: -0.15 }]
  },
  bombardeo: {
    nombre: 'Bombardeo',
    descripcion: 'Bombas al azar por toda la pantalla. No hay que apuntar.',
    comportamiento: 'bombardeoAleatorio',
    spriteOnda: 'explosionFuego',
    danyo: 0, danyoExplosion: 26, radioExplosion: 24, duracion: 0.35,
    recarga: 2.6, proyectiles: 2, empuje: 120,
    color: '#ffb14a',
    niveles: [{}, { proyectiles: 1 }, { danyoExplosion: 8 }, { radioExplosion: 8 },
              { proyectiles: 1 }, { danyoExplosion: 10 }, { recarga: -0.5 },
              { proyectiles: 2, radioExplosion: 10 },
              { danyoExplosion: 6 }, { danyoExplosion: 9, recarga: -0.15 }]
  },

  // --- Ondas y auras: área grande, daño bajo ----------------------------
  ondaExpansiva: {
    nombre: 'Onda expansiva',
    descripcion: 'Anillo que se abre desde ti en todas direcciones.',
    comportamiento: 'ondaCircular',
    spriteOnda: 'ondaChoque',
    danyo: 12, radio: 58, duracion: 0.45, recarga: 2.4, empuje: 200,
    color: '#9adfff',
    niveles: [{}, { radio: 12 }, { danyo: 4, radio: 8 }, { recarga: -0.3 },
              { radio: 14 }, { danyo: 6, radio: 8 }, { recarga: -0.3 }, { radio: 18, danyo: 8 },
              { danyo: 6, radio: 8 }, { danyo: 9, radio: 10, recarga: -0.15 }]
  },
  aquila: {
    nombre: 'Aquila',
    descripcion: 'Aura constante a tu alrededor. Poco daño, sin descanso.',
    comportamiento: 'auraPasiva',
    // El AURA arranca pegada al cuerpo (24) y llega a 71 al nivel 10. Antes
    // salía ya a 46 —media pantalla de radio en el minuto 1— y con eso el
    // arma se jugaba sola desde el principio y luego no cambiaba en nada al
    // subirla. Ahora el crecimiento ES la mejora: cada nivel se ve.
    danyo: 3, intervalo: 0.4, recarga: 0.5, radio: 24, empuje: 50,
    sprite: 'auraAquila',
    // MENOS TRANSPARENTE QUE EL RESTO DE ZONAS. La transparencia baja un 40%
    // (de 0,60 a 0,36), o sea que tapa 0,64 en vez de 0,40. El 40% general está
    // puesto para que nueve armas de área a la vez no conviertan la pantalla en
    // una mancha; estas tres no son ese caso —son una sola, y las dos auras van
    // pegadas al jugador— así que pueden verse de verdad sin ensuciar nada.
    opacidad: 0.64,
    // Gira, y despacio. Se dejó quieta al principio razonando que un emblema
    // tiene un arriba claro y rotarlo lo deja boca abajo media vuelta de cada
    // dos; visto en el juego, no molesta y en cambio la quietud sí — un aura
    // permanente que no se mueve parece una calcomanía pegada al suelo.
    //
    // 0,619 rad/s, algo más de diez segundos por vuelta. Ha bajado dos veces un
    // cuarto desde el 1,1 original —que ya era la mitad de rápido que el campo
    // eléctrico, un chisporroteo— y las dos por lo mismo: cuanto más detalle
    // tiene el emblema, más tira de la vista el giro, y esto es un aura
    // PERMANENTE, lo único de la pantalla que no para nunca. A esta velocidad
    // se nota que está vivo sin que se pueda mirar otra cosa. Un estandarte no
    // chisporrotea: ondea.
    //
    // Comprobado que puede girar sin cortarse: su dibujo llega a 225 unidades
    // del pivote y el recorte da 232 (ver $HOJAS_ALFA en procesar-assets.ps1).
    // Lo que se saliera del recorte entraría y saldría del cuadro al dar la
    // vuelta, que es el defecto que hay que vigilar en todo lo que rota.
    giro: 0.61875,
    color: '#ffd98a',
    niveles: [{}, { radio: 5 }, { danyo: 1, radio: 4 }, { radio: 6 },
              { danyo: 2, radio: 5 }, { empuje: 40, radio: 5 }, { radio: 7 }, { danyo: 3, radio: 6 },
              { danyo: 6, radio: 4 }, { danyo: 9, radio: 5, recarga: -0.15 }]
  },

  // --- Suelo: control de zona -------------------------------------------
  fuegoGriego: {
    nombre: 'Fuego griego',
    sprite: 'charcoLava',
    descripcion: 'Charco incendiario que quema a quien lo pisa.',
    comportamiento: 'zonaPersistente',
    // NO para los proyectiles enemigos: es una mancha en el suelo, y lo que
    // vuela por encima no la toca. Ver Disparos.barrer (entidades/disparo.js).
    bloqueaDisparos: false,
    danyo: 4, intervalo: 0.35, recarga: 3.4, charcos: 1, duracion: 4.5, radio: 19,
    ralentiza: 0, empuje: 0, color: '#ff7a2a',
    // Sin `sprite` a propósito: la calcomanía de lava que se probó llevaba un
    // reborde de piedra que duplicaba el canto. Ver herramientas/
    // procesar-assets.ps1, $CELDAS_EFECTOS.
    evolucion: { pasivo: 'antorcha', arma: 'incendioEmerita' },
    niveles: [{}, { radio: 5 }, { duracion: 1.5, radio: 4 }, { danyo: 2 },
              { charcos: 1, radio: 4 }, { radio: 6 }, { duracion: 2, radio: 4 }, { charcos: 1, danyo: 3, radio: 5 },
              { danyo: 6, radio: 4 }, { danyo: 9, radio: 5, recarga: -0.15 }]
  },
  rete: {
    nombre: 'Rete',
    // La red del retiarius, y por fin una red: venía usando el charco de zarzas
    // por no tener hoja propia. Ver Pirotecnia.Red en generar-efectos.ps1 —una
    // malla de rombos es geometría, así que no hacía falta dibujarla a mano.
    sprite: 'redPesca',
    descripcion: 'Red que frena a la mitad. Control, no matanza.',
    comportamiento: 'zonaPersistente',
    // NO PARA LOS DISPAROS ENEMIGOS. Una red tirada en el suelo enreda los pies
    // de quien la pisa; no es una pared, y una flecha le pasa por encima. Misma
    // regla que el Fuego griego y sus evoluciones: una zona del suelo estorba a
    // quien anda, no a lo que vuela.
    bloqueaDisparos: false,
    danyo: 3, intervalo: 0.5, recarga: 3.0, charcos: 1, duracion: 3.5, radio: 25,
    ralentiza: 0.5, empuje: 0, color: '#b9c7d6',
    niveles: [{}, { radio: 8 }, { duracion: 1 }, { danyo: 2 },
              { charcos: 1 }, { duracion: 1.5 }, { radio: 10 }, { charcos: 1 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },

  // --- Rayos: alcance largo, daño contenido ------------------------------
  rayoHorizontal: {
    nombre: 'Rayo de Júpiter',
    descripcion: 'Cae del cielo a tu alrededor. No apunta: siembra.',
    comportamiento: 'tormentaRayos',
    danyo: 14, recarga: 2.2,
    // Cuántos rayos por tormenta y cada cuánto cae el siguiente. `demoraGolpe`
    // reutiliza el encadenado de golpes de las armas de arco (sistemas/armas.js).
    // `demoraGolpe` BAJA de 0,12 a 0,07 al doblar los rayos, y no es un ajuste
    // de gusto: es la cuenta de más abajo. Con 22 rayos a 0,12 la volea duraría
    // 2,52 s contra una recarga de 1,65 y la tormenta se pisaría a sí misma,
    // perdiendo rayos sin avisar. A 0,07 dura 1,47 y cabe.
    rayos: 2, demoraGolpe: 0.07,
    // `alcance` aquí NO es distancia de tiro: es el radio del ÁREA dentro de la
    // cual caen, centrada en el jugador. `radio` es lo que revienta cada uno.
    alcance: 120, radio: 22,
    // Largo del haz que se ve caer a plomo. Solo dibujo.
    caida: 150, grosor: 4, empuje: 60,
    color: '#bfe4ff',
    // Con qué revienta cada rayo al tocar tierra. Hoja propia y no la del Pilum
    // de Júpiter: una detonación se abre y un chispazo se descarga (el porqué,
    // con sus números, está en herramientas/generar-efectos.ps1).
    spriteOnda: 'reventonChispa',
    // Sube por los tres lados a la vez: más rayos, más daño y más área. Al
    // nivel 10 son 22 rayos de 52 de daño en radio 29, cada 1,65 s.
    //
    // DOS RAYOS POR NIVEL. Es lo que convierte a la tormenta en una tormenta de
    // verdad: no cae un rayo cada tanto, cae una cortina.
    //
    // LOS DOS NÚMEROS QUE HAY QUE MIRAR JUNTOS son `rayos` y `demoraGolpe`. Los
    // rayos no salen a la vez: se encadenan uno cada `demoraGolpe` segundos
    // (mismo mecanismo que los tajos de un arma melé, ver `actualizar` en
    // sistemas/armas.js), así que la volea entera dura (rayos-1) * demoraGolpe y
    // ESO tiene que caber en la recarga. Si no cabe, la siguiente activación
    // reinicia `golpesPendientes` y los rayos que faltaban no llegan a caer
    // nunca — el arma se comería su propia subida en silencio.
    //
    //   22 rayos * 0,07 = 1,47 s de volea, y la recarga al 10 es 1,65. Cabe.
    niveles: [{}, { danyo: 5, rayos: 2 }, { rayos: 2 }, { recarga: -0.25, rayos: 2 },
              { danyo: 7, radio: 3, rayos: 2 }, { rayos: 2 }, { alcance: 30, rayos: 2 },
              { danyo: 10, rayos: 2 }, { radio: 4, danyo: 6, rayos: 3 },
              { rayos: 3, danyo: 10, recarga: -0.3 }]
  },
  rayoCruzado: {
    nombre: 'Rayo cruzado',
    descripcion: 'Cuatro haces en cruz. Mucho alcance, poco daño.',
    comportamiento: 'rayoPerforante', patron: 'cruz',
    // El destello dura el doble que el de un rayo normal: se ve el haz en vez
    // de intuirlo. Mismo número y mismo motivo que el Aspa de luz.
    duracionRayo: 0.24,
    danyo: 6, recarga: 2.2, alcance: 260, grosor: 4, empuje: 50,
    color: '#e0c8ff',
    niveles: [{}, { danyo: 2 }, { grosor: 2 }, { recarga: -0.3 },
              { danyo: 3 }, { alcance: 50 }, { grosor: 2 }, { danyo: 5 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },

  // --- Orbitales: daño medio, cobertura pegada a ti ----------------------
  scutum: {
    nombre: 'Scutum',
    descripcion: 'Escudos que giran a tu alrededor y arrollan.',
    comportamiento: 'orbital',
    danyo: 13, recarga: 1.0, escudos: 2, radioOrbita: 40, radioEscudo: 8,
    velocidadAngular: 2.2, empuje: 120, color: '#e0c88a',
    // Sin `giroOrbital`: es un escudo de frente con su emblema, y rotarlo lo
    // dejaría boca abajo media vuelta de cada dos.
    spriteOrbital: 'orbScutum',
    evolucion: { pasivo: 'coronaLaurel', arma: 'testudo' },
    niveles: [{}, { escudos: 1 }, { radioOrbita: 8 }, { danyo: 5 },
              { escudos: 1 }, { velocidadAngular: 0.7 }, { escudos: 1 }, { danyo: 9 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },

  // --- Proyectil lineal perforante --------------------------------------
  ballista: {
    nombre: 'Ballista',
    descripcion: 'Virote pesado que atraviesa una fila entera.',
    comportamiento: 'direccionFija', patron: 'horizontal',
    danyo: 24, recarga: 2.3, proyectiles: 1, velocidad: 380, alcance: 460,
    radio: 5, perforacion: 4, dispersion: 0, empuje: 210,
    color: '#f0eada', estela: '#9aa7b5', largoTrazo: 14,
    // Virote pesado: cabeza gorda, asta gruesa y plumas cortas. Lo comparten la
    // Ballista, la Enfilada y el Escorpión, que son las tres máquinas de tiro
    // romanas del catálogo y disparan la misma munición.
    spriteProyectil: 'proyVirote',
    evolucion: { pasivo: 'clepsidra', arma: 'escorpion' },
    niveles: [{}, { perforacion: 2 }, { danyo: 8 }, { velocidad: 60 },
              { perforacion: 3 }, { danyo: 10 }, { recarga: -0.4 }, { danyo: 14, perforacion: 4 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },
  tribulus: {
    nombre: 'Tribulus',
    // ABROJOS DE VERDAD, Y LANZADOS. `spritePieza` es UN abrojo —el dibujo que
    // hizo Sergio, ver $DIBUJOS_SUELTOS en procesar-assets.ps1— y la zona pinta
    // veinte copias repartidas por su círculo en vez de una calcomanía estirada.
    // Es lo que de verdad es un tribulus: piezas de hierro sueltas por el suelo,
    // con suelo limpio entre una y otra.
    //
    // Y SALEN DEL PERSONAJE. `vueloPieza` es lo que tardan en posarse, y hasta
    // que no lo hacen la zona no hace su primer tic: lo que se ve es lo que
    // mata. Dos décimas sobre una zona que dura de 3,5 a 6 segundos y una
    // recarga de 3, así que la cadencia del arma no se entera.
    spritePieza: 'abrojo',
    // CINCO POR PARCELA, y la cuenta importa: el arma siembra `charcos` de
    // radio 10 cada uno, no una zona grande. Un abrojo dibujado ocupa unas 26
    // unidades cuadradas y la parcela son 314, así que cinco cubren un tercio y
    // dejan ver el suelo entre ellos — que es lo que distingue un puñado de
    // abrojos de una placa de hierro. Con veinte, la parcela quedaba tapada.
    //
    // Son 15 volando a la vez al nivel 1 y 40 al 10, porque las parcelas suben
    // de 3 a 8. La densidad por parcela no cambia; lo que crece es cuánto suelo
    // hay sembrado, que es como debe subir un arma de área.
    piezas: 5,
    vueloPieza: 0.22,
    // NO para los proyectiles enemigos. Cuatro puntas de hierro en el suelo
    // dejan pasar por encima cualquier cosa que vuele; es el mismo criterio que
    // los charcos (ver Disparos.barrer en entidades/disparo.js), y aquí canta
    // todavía más porque entre pincho y pincho se ve el suelo.
    bloqueaDisparos: false,
    descripcion: 'Abrojos que quedan clavados donde pisas.',
    comportamiento: 'zonaPersistente',
    danyo: 6, intervalo: 0.45, recarga: 2.8, charcos: 3, duracion: 5, radio: 10,
    ralentiza: 0.25, empuje: 30, color: '#c9bda0',
    niveles: [{}, { charcos: 1 }, { danyo: 2 }, { duracion: 2 },
              { charcos: 2 }, { danyo: 3 }, { duracion: 2 }, { charcos: 2, danyo: 4 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },

  // ==========================================================================
  // AMPLIACIÓN HASTA 50
  // ==========================================================================
  // Ni una sola de las que vienen abajo toca el motor: todas reutilizan los doce
  // comportamientos que ya existen. Eso es exactamente lo que el criterio 8 del
  // plan pide poder hacer, y es la prueba de que el motor genérico funciona.
  //
  // El eje de diseño NO es el daño por segundo: casi todas acaban pareciéndose
  // si se las mira así. Es QUÉ TE PIDE EL ARMA:
  //
  //   - las que apuntan solas premian moverte libre,
  //   - las de patrón fijo te piden alinearte con la horda,
  //   - las de cuerpo a cuerpo te obligan a dejarlos acercarse,
  //   - las de suelo te piden ir dejando rastro y no volver sobre él,
  //   - las de área te piden estar rodeado, que es donde no quieres estar.
  //
  // Con cuatro ranuras, la combinación decide dónde te tienes que colocar, y esa
  // es la partida. Dos armas que piden lo mismo son una sola arma.
  //
  // La ambientación va MEZCLADA a propósito: honda balear junto a subfusil. Es
  // una decisión tomada, no un descuido — Mérida es una ciudad romana en la que
  // vive gente hoy, y el juego se permite el chiste.

  // --- Apuntan solas: el arma trabaja, tú te mueves ------------------------
  arcoCorto: {
    nombre: 'Arco corto',
    descripcion: 'Flecha rápida al más cercano. Barato y constante.',
    comportamiento: 'proyectilDirigido',
    danyo: 9, recarga: 0.85, proyectiles: 1, velocidad: 320, alcance: 330,
    radio: 3, perforacion: 0, empuje: 50,
    color: '#dcc9a0', estela: '#7a6440', largoTrazo: 9,
    // Una flecha de verdad: punta, astil y plumas. Se orienta al vuelo y sin
    // giro propio — una flecha va derecha a donde apunta, que es justamente
    // toda su gracia.
    spriteProyectil: 'proyFlecha',
    // Y RECTAS DE VERDAD: `dispersion` fuera, `separacion` en su sitio.
    //
    // El abanico de 5 grados abría las flechas de más en uve, y una flecha
    // torcida contradice al arma entera — lo que un arco hace es poner la
    // flecha donde apuntas. Con `separacion` salen todas con el mismo rumbo,
    // corridas 7 unidades una de otra: una andanada de arquero.
    separacion: 7,
    // EL TRIPLE DE FLECHAS AL 10: de 3 a 9, una más en cada nivel salvo el
    // segundo. La subida del arma pasa a ser la andanada, que es lo suyo.
    niveles: [{}, { danyo: 3 }, { recarga: -0.1, proyectiles: 1 }, { proyectiles: 1 },
              { danyo: 4, perforacion: 1, proyectiles: 1 }, { recarga: -0.1, proyectiles: 1 },
              { proyectiles: 1 },
              { danyo: 7, proyectiles: 1 }, { danyo: 6, proyectiles: 1 },
              { danyo: 9, recarga: -0.15, proyectiles: 1 }]
  },
  honda: {
    nombre: 'Honda balear',
    descripcion: 'Piedra lenta que descalabra y tira de espaldas.',
    comportamiento: 'proyectilDirigido',
    // La piedra salta de un enemigo al siguiente: uno más al nivel 3, dos al 6
    // y tres al 10. Rebotar no es perforar — cambia de rumbo hacia otro blanco,
    // así que premia el bulto y no el alineamiento.
    rebotesEnemigo: 0,
    forma: 'bala',
    // SUBIDA. Se jugó y sale mala, y el número de daño no lo explicaba: sobre
    // el papel ya era de las mejores de su familia. Lo que la hunde es CÓMO
    // reparte ese daño — una piedra sola, lenta (190 frente a los 320-560 del
    // resto), sin perforación y con una recarga de un segundo entero. Falla
    // mucho y, cuando acierta, no hay una segunda.
    //
    // Por eso la subida va a la CADENCIA y al NÚMERO DE PIEDRAS antes que al
    // daño por impacto: más intentos, no golpes más gordos. Al 10 son cinco
    // piedras a la vez, que con `dispersion: 8` es una andanada corta — la
    // honda de un balear, no un francotirador.
    danyo: 32, recarga: 0.72, proyectiles: 1, velocidad: 190, alcance: 250,
    radio: 5, perforacion: 0, dispersion: 8, empuje: 280,
    color: '#b9b2a4', estela: '#5d5850', largoTrazo: 6,
    // El canto de la honda: casi redondo, porque un hondero elegía las piedras.
    // Gira despacio, que es lo que hace una piedra lanzada con correa.
    spriteProyectil: 'proyPiedra',
    giroProyectil: 5,
    // Los rebotes van a los niveles 3, 6 y 10, o sea uno más cada vez, y son lo
    // que la separa del resto: rebotar no es perforar, la piedra cambia de
    // rumbo hacia otro blanco y premia el bulto en vez del alineamiento.
    niveles: [{}, { danyo: 8 }, { empuje: 60, rebotesEnemigo: 1 }, { proyectiles: 1, danyo: 7 },
              { danyo: 10 }, { recarga: -0.06, rebotesEnemigo: 1, proyectiles: 1 },
              { empuje: 80, danyo: 12 }, { danyo: 9, proyectiles: 1 },
              { danyo: 12 },
              { danyo: 12, recarga: -0.06, proyectiles: 1, rebotesEnemigo: 1 }]
  },
  fusil: {
    nombre: 'Fusil',
    descripcion: 'Disparo largo y perforante. Pega donde mira.',
    comportamiento: 'proyectilDirigido',
    // Rebota en los márgenes de la pantalla VISIBLE: uno por nivel desde el 2, y
    // dos en el último, o sea DIEZ al máximo. Ver `rebotesPared` en
    // entidades/proyectil.js.
    //
    // Y cada rebote le devuelve el alcance entero Y LE SUBE UN 10% LA VELOCIDAD.
    // Eso último compone: diez rebotes son 1,1^10 = x2,59 de velocidad, así que
    // la última vuelta cruza la pantalla más del doble de rápido que la primera.
    // Una bala al máximo recorre once tramos de 440 sin salir de cuadro, cada
    // uno más largo que el anterior: la pantalla se convierte en una mesa de
    // billar y la bola va cada vez más lanzada.
    //
    // Es lo que separa al Fusil del Revólver, que pega igual de fuerte y solo
    // hacia delante.
    aceleraRebote: 0.10,
    rebotesPared: 0,
    forma: 'bala',
    fogonazo: true,
    danyo: 38, recarga: 1.35, proyectiles: 1, velocidad: 560, alcance: 440,
    radio: 3, perforacion: 1, dispersion: 3, empuje: 100,
    color: '#cfd6dd', estela: '#6d7480', largoTrazo: 14,
    spriteProyectil: 'balaFusil',
    niveles: [{}, { danyo: 18, rebotesPared: 1 },
              { perforacion: 1, danyo: 14, rebotesPared: 1 },
              { recarga: -0.2, danyo: 16, rebotesPared: 1 },
              { danyo: 24, rebotesPared: 1 },
              { perforacion: 1, danyo: 20, rebotesPared: 1 },
              { velocidad: 80, danyo: 22, rebotesPared: 1 },
              { danyo: 32, recarga: -0.2, rebotesPared: 1 },
              { danyo: 24, rebotesPared: 1 },
              { danyo: 32, recarga: -0.15, rebotesPared: 2 }]
  },
  subfusil: {
    nombre: 'Subfusil',
    descripcion: 'Ráfaga sin pausa. Cada bala pica poco.',
    comportamiento: 'proyectilDirigido',
    forma: 'bala',
    fogonazo: true,
    danyo: 4, recarga: 0.22, proyectiles: 1, velocidad: 420, alcance: 260,
    radio: 2, perforacion: 0, dispersion: 9, empuje: 25,
    color: '#ffe08a', estela: '#8a6a2a', largoTrazo: 7,
    spriteProyectil: 'balaSubfusil',
    // EL DOBLE DE BALAS AL 10: de 3 a 6, una más en los niveles 3, 5, 7, 9 y 10.
    // Sube por donde es ella: el Subfusil no va de pegar fuerte —cada bala pica
    // poco y así tiene que seguir— va de no parar de escupir. Con `dispersion: 9`
    // las seis salen en abanico corto, así que a bocajarro llegan todas y de
    // lejos se reparten.
    niveles: [{}, { danyo: 1 }, { recarga: -0.03, proyectiles: 1 }, { danyo: 2 },
              { proyectiles: 1 }, { recarga: -0.03 }, { proyectiles: 1 }, { danyo: 3 },
              { danyo: 6, proyectiles: 1 }, { danyo: 9, recarga: -0.15, proyectiles: 1 }]
  },
  revolver: {
    nombre: 'Revólver',
    descripcion: 'Un tiro, muy gordo, y a esperar.',
    comportamiento: 'proyectilDirigido',
    forma: 'bala',
    fogonazo: true,
    danyo: 30, recarga: 1.9, proyectiles: 1, velocidad: 480, alcance: 300,
    radio: 4, perforacion: 1, dispersion: 0, empuje: 190,
    color: '#ffd0a0', estela: '#8a4a2a', largoTrazo: 11,
    spriteProyectil: 'balaRevolver',
    niveles: [{}, { danyo: 10 }, { recarga: -0.2 }, { perforacion: 1 },
              { danyo: 12 }, { recarga: -0.2 }, { danyo: 14 }, { proyectiles: 1 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },

  // --- Cuerpo a cuerpo: hay que dejarles llegar ---------------------------
  // Son las únicas que piden lo contrario que el resto del juego. Bien llevadas
  // no son un castigo: el arco corta a varios a la vez y el empuje abre hueco.
  hacha: {
    nombre: 'Hacha',
    spriteTajo: 'tajoHacha',
    duracionTajo: 0.26,
    descripcion: 'Tajo corto y brutal. Poco alcance, mucho destrozo.',
    comportamiento: 'arcoMelee',
    danyo: 40, recarga: 1.35, alcance: 42, angulo: 70, golpes: 1, demoraGolpe: 0.1,
    empuje: 200, color: '#e0d2c0',
    niveles: [{}, { danyo: 14 }, { angulo: 15 }, { danyo: 18 }, { golpes: 1, danyo: 14 },
              { alcance: 8, danyo: 12 }, { danyo: 22 }, { danyo: 28, recarga: -0.2 },
              { danyo: 12 }, { danyo: 16, recarga: -0.15 }]
  },
  maza: {
    nombre: 'Maza',
    spriteTajo: 'tajoMaza',
    duracionTajo: 0.28,
    descripcion: 'Lenta y demoledora. Los manda por los aires.',
    comportamiento: 'arcoMelee',
    danyo: 60, recarga: 1.8, alcance: 40, angulo: 60, golpes: 1, demoraGolpe: 0.1,
    empuje: 340, color: '#c2b8a8',
    niveles: [{}, { danyo: 20 }, { empuje: 70, danyo: 14 }, { angulo: 18, danyo: 16 },
              { danyo: 26 }, { recarga: -0.3, danyo: 18 }, { empuje: 90, danyo: 20 },
              { danyo: 34, recarga: -0.25 }, { danyo: 18 }, { danyo: 24, recarga: -0.15 }]
  },
  latigo: {
    nombre: 'Látigo',
    spriteTajo: 'tajoLatigo',
    duracionTajo: 0.22,
    descripcion: 'Restallido largo y estrecho, casi sin pausa.',
    comportamiento: 'arcoMelee',
    danyo: 17, recarga: 0.65, alcance: 74, angulo: 38, golpes: 1, demoraGolpe: 0.08,
    empuje: 110, color: '#d8b48a',
    niveles: [{}, { danyo: 6, angulo: 15 }, { alcance: 10, danyo: 5, angulo: 16 },
              { recarga: -0.08, danyo: 7, angulo: 17 }, { golpes: 1, danyo: 6, angulo: 17 },
              { danyo: 9, angulo: 17 }, { angulo: 17, danyo: 8 },
              { danyo: 14, alcance: 12, angulo: 18 }, { danyo: 10, angulo: 18 },
              { danyo: 14, recarga: -0.15, angulo: 17 }]
  },
  motosierra: {
    nombre: 'Motosierra',
    spriteTajo: 'tajoMotosierra',
    duracionTajo: 0.2,
    descripcion: 'No corta: muele. Pégate y no sueltes.',
    comportamiento: 'arcoMelee',
    danyo: 9, recarga: 0.16, alcance: 32, angulo: 55, golpes: 1, demoraGolpe: 0.06,
    empuje: 20, color: '#ff8a6b',
    niveles: [{}, { danyo: 6 }, { angulo: 12, danyo: 7 }, { danyo: 8 }, { alcance: 6, danyo: 9 },
              { danyo: 9 }, { recarga: -0.03, danyo: 10 }, { danyo: 11, angulo: 15 },
              { danyo: 10 }, { danyo: 11, recarga: -0.02 }]
  },
  guadanya: {
    nombre: 'Guadaña',
    spriteTajo: 'tajoGuadanya',
    duracionTajo: 0.3,
    descripcion: 'Siega en semicírculo. Ancha antes que fuerte.',
    comportamiento: 'arcoMelee',
    danyo: 28, recarga: 1.25, alcance: 54, angulo: 145, golpes: 1, demoraGolpe: 0.1,
    empuje: 120, color: '#cfe0d0',
    niveles: [{}, { danyo: 10 }, { angulo: 25, danyo: 8 }, { alcance: 8, danyo: 10 },
              { danyo: 15 }, { golpes: 1, danyo: 12 }, { angulo: 30, danyo: 14 },
              { danyo: 22, alcance: 10 }, { danyo: 12 }, { danyo: 18, recarga: -0.2 }]
  },

  // --- Conos: sucios, cortos y contundentes -------------------------------
  lanzallamas: {
    nombre: 'Lanzallamas',
    descripcion: 'Lengua de fuego continua. Corto y sin descanso.',
    comportamiento: 'conoCorto',
    danyo: 2, recarga: 0.26, proyectiles: 5, velocidad: 150, alcance: 78, angulo: 42,
    radio: 5, perforacion: 2, empuje: 15,
    color: '#ff9a3a', estela: '#a03a10',
    // Lenguas de fuego en vez de balas trazadas: el chorro eran puntitos
    // redondos y ahora son llamas que apuntan hacia donde van.
    spriteProyectil: 'proyLengua',
    niveles: [{}, { proyectiles: 2 }, { danyo: 1 }, { alcance: 14 },
              { proyectiles: 2 }, { danyo: 1 }, { angulo: 10 }, { proyectiles: 3, danyo: 1 },
              { danyo: 3 }, { danyo: 5, recarga: -0.15 }]
  },
  recortada: {
    nombre: 'Recortada',
    descripcion: 'Dos cañones a bocajarro. Abre un pasillo.',
    comportamiento: 'conoCorto',
    forma: 'bala',
    fogonazo: true,
    danyo: 11, recarga: 1.6, proyectiles: 9, velocidad: 230, alcance: 82, angulo: 78,
    radio: 3, perforacion: 0, empuje: 220,
    color: '#ffc07a', estela: '#8a4a1a',
    spriteProyectil: 'balaRecortada',
    niveles: [{}, { proyectiles: 3 }, { danyo: 3 }, { empuje: 60 },
              { proyectiles: 3 }, { danyo: 4 }, { recarga: -0.3 }, { proyectiles: 4, danyo: 6 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },

  // --- Patrones fijos: no apuntan, te piden colocarte ---------------------
  aspa: {
    nombre: 'Aspa',
    descripcion: 'Disparos en aspa. Cubre las esquinas y se abre.',
    comportamiento: 'direccionFija', patron: 'diagonal',
    // BRAZOS. Arranca con los cuatro de su patrón y llega a ocho, uno más en los
    // niveles 4, 6, 8 y 10. `direcciones` reparte los rumbos regularmente por la
    // circunferencia anclados al primero del patrón (ver `direccionesDe` en
    // sistemas/armas.js), así que el arma sigue saliendo en diagonal y los pasos
    // intermedios —cinco brazos, seis, siete— quedan repartidos por igual.
    //
    // Es la subida más gorda que puede tener un arma de patrón: cada brazo es
    // una andanada entera, así que al 10 dispara el doble que al 1 sin tocarle
    // ni el daño ni la recarga.
    direcciones: 4,
    danyo: 9, recarga: 1.15, proyectiles: 1, velocidad: 230, alcance: 220,
    radio: 3, perforacion: 0, dispersion: 0, empuje: 60,
    color: '#b9e8d0', estela: '#4a8a6a', largoTrazo: 8,
    // SHURIKEN, y volteando. `giroProyectil` va en radianes por segundo: 18 son
    // casi tres vueltas por segundo, que a 230 de velocidad se lee como una
    // estrella girando y no como un molinillo. Un shuriken que viaja quieto
    // parece una pegatina.
    spriteProyectil: 'proyShuriken',
    giroProyectil: 18,
    niveles: [{}, { danyo: 3 }, { perforacion: 1 }, { recarga: -0.15, direcciones: 1 },
              { danyo: 4 }, { proyectiles: 1, dispersion: 10, direcciones: 1 },
              { perforacion: 1 }, { danyo: 7, direcciones: 1 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15, direcciones: 1 }]
  },
  enfilada: {
    nombre: 'Enfilada',
    descripcion: 'Cuatro virotes pesados en cruz. Atraviesan filas.',
    comportamiento: 'direccionFija', patron: 'cruz',
    danyo: 20, recarga: 2.1, proyectiles: 1, velocidad: 340, alcance: 380,
    radio: 5, perforacion: 3, dispersion: 0, empuje: 170,
    color: '#e8d8b0', estela: '#8a7a4a', largoTrazo: 13,
    // El mismo virote de la Ballista, aquí en cruz.
    spriteProyectil: 'proyVirote',
    niveles: [{}, { danyo: 7 }, { perforacion: 2 }, { recarga: -0.3 },
              { danyo: 9 }, { perforacion: 2 }, { velocidad: 70 }, { danyo: 13, perforacion: 3 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },
  agujas: {
    nombre: 'Lluvia de agujas',
    descripcion: 'Nube de púas en diagonal. Muchas y flojas.',
    comportamiento: 'direccionFija', patron: 'diagonal',
    danyo: 4, recarga: 0.75, proyectiles: 3, velocidad: 260, alcance: 170,
    radio: 2, perforacion: 0, dispersion: 14, empuje: 20,
    color: '#d0d8e8', estela: '#5a6a8a', largoTrazo: 5,
    // Kunai, con su anilla. Se orienta al vuelo y no gira: un cuchillo
    // arrojadizo bien lanzado va de punta, y es lo que dice que se va a clavar.
    spriteProyectil: 'proyKunai',
    niveles: [{}, { proyectiles: 1 }, { danyo: 1 }, { recarga: -0.1 },
              { proyectiles: 2 }, { danyo: 2 }, { alcance: 50 }, { proyectiles: 2, danyo: 2 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },
  muroDeLanzas: {
    nombre: 'Muro de lanzas',
    descripcion: 'Salva ancha arriba y abajo. Corta el paso.',
    comportamiento: 'direccionFija', patron: 'vertical',
    danyo: 11, recarga: 1.4, proyectiles: 3, velocidad: 220, alcance: 210,
    radio: 4, perforacion: 1, dispersion: 16, empuje: 80,
    color: '#e0c8a0', estela: '#7a5a3a', largoTrazo: 10,
    // La misma lanza que las Lanzas gemelas, aquí en vertical.
    spriteProyectil: 'proyLanza',
    niveles: [{}, { proyectiles: 1 }, { danyo: 4 }, { perforacion: 1 },
              { proyectiles: 1 }, { danyo: 5 }, { recarga: -0.25 }, { proyectiles: 2, danyo: 7 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },
  enjambre: {
    nombre: 'Enjambre',
    descripcion: 'Nube de avispas en todas direcciones.',
    comportamiento: 'direccionAleatoria',
    danyo: 3, recarga: 0.3, proyectiles: 4, velocidad: 170, alcance: 130,
    radio: 3, perforacion: 0, empuje: 15,
    color: '#e8e07a', estela: '#8a8a2a', largoTrazo: 4,
    // Cada avispa, una abeja dibujada. Se orienta al vuelo, sin giro propio:
    // un bicho vuela mirando hacia donde va.
    spriteProyectil: 'proyAbeja',
    niveles: [{}, { proyectiles: 2 }, { danyo: 1 }, { recarga: -0.05 },
              { proyectiles: 2 }, { danyo: 2 }, { alcance: 40 }, { proyectiles: 3, danyo: 2 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },

  // --- Explosivos: el daño va en la onda, no en el impacto ----------------
  molotov: {
    nombre: 'Cóctel molotov',
    descripcion: 'Botella que revienta en llamas. Poco alcance.',
    comportamiento: 'proyectilExplosivo',
    spriteOnda: 'explosionMolotov',
    danyo: 2, danyoExplosion: 18, radioExplosion: 48,
    recarga: 1.8, proyectiles: 1, velocidad: 150, alcance: 150,
    radio: 4, perforacion: 0, dispersion: 16, empuje: 110,
    color: '#ffb04a', estela: '#8a4a10', largoTrazo: 6,
    // La botella con el trapo ardiendo, dando vueltas LENTAS: 3,4 rad/s es algo
    // más de media vuelta por segundo. Es la diferencia entre una botella que
    // alguien ha lanzado por el aire y un proyectil teledirigido — y con el
    // vuelo de 150 de velocidad y 150 de alcance, da un giro por trayecto.
    spriteProyectil: 'proyMolotov',
    giroProyectil: 3.4,
    niveles: [{}, { danyoExplosion: 6 }, { radioExplosion: 8 }, { proyectiles: 1 },
              { danyoExplosion: 8 }, { radioExplosion: 9 }, { recarga: -0.35 },
              { proyectiles: 1, danyoExplosion: 10 },
              { danyoExplosion: 6 }, { danyoExplosion: 9, recarga: -0.15 }]
  },
  lanzacohetes: {
    nombre: 'Lanzacohetes',
    descripcion: 'Un cohete cada mucho. Se lleva media pantalla.',
    comportamiento: 'proyectilExplosivo',
    spriteOnda: 'explosionCohete',
    // CADENCIA A LA MITAD (3.4 -> 6.8 de recarga). Disparaba casi tan a menudo
    // como el lanzagranadas llevándose media pantalla por disparo, así que no
    // había ningún motivo para llevar otra cosa. Ahora es lo que dice su nombre:
    // un cohete cada mucho, y hay que elegir el momento. El área también baja,
    // como en el resto de la familia.
    //
    // Y ESA CADENCIA SE TRIPLICA CON EL NIVEL: 3,4 s de recarga al 1 y 1,13 al
    // 10, bajando un cuarto de segundo por nivel. No contradice lo de arriba,
    // que iba del nivel 1 y ahí no se toca ni una décima: el arma sigue
    // entrando como "un cohete cada mucho" y lo que se gana subiéndola es
    // justamente dejar de esperar. Antes llegaba al 10 con 2,6 s, o sea que
    // subirla apenas se notaba en lo único que de verdad molestaba de ella.
    danyo: 6, danyoExplosion: 46, radioExplosion: 44,
    recarga: 3.4, proyectiles: 1, velocidad: 210, alcance: 300,
    radio: 5, perforacion: 0, dispersion: 0, empuje: 260,
    color: '#ff7a5a', estela: '#8a2a10', largoTrazo: 12,
    niveles: [{}, { danyoExplosion: 14, recarga: -0.25 }, { radioExplosion: 8, recarga: -0.25 },
              { recarga: -0.25 }, { danyoExplosion: 16, recarga: -0.25 },
              { radioExplosion: 9, recarga: -0.25 }, { proyectiles: 1, recarga: -0.25 },
              { danyoExplosion: 22, recarga: -0.25 },
              { danyoExplosion: 6, recarga: -0.25 },
              { danyoExplosion: 9, recarga: -0.27 }]
  },
  artilleria: {
    nombre: 'Artillería',
    descripcion: 'Obuses pesados que caen lejos y solos.',
    comportamiento: 'bombardeoAleatorio',
    spriteOnda: 'explosionFuego',
    danyo: 0, danyoExplosion: 40, radioExplosion: 54, duracion: 0.4,
    recarga: 3.2, proyectiles: 1, empuje: 200,
    color: '#ffa06a',
    niveles: [{}, { danyoExplosion: 12 }, { proyectiles: 1 }, { radioExplosion: 10 },
              { danyoExplosion: 14 }, { recarga: -0.6 }, { proyectiles: 1 },
              { danyoExplosion: 18, radioExplosion: 12 },
              { danyoExplosion: 6 }, { danyoExplosion: 9, recarga: -0.15 }]
  },
  lluviaDeFlechas: {
    nombre: 'Lluvia de flechas',
    descripcion: 'Andanada que cae por todas partes. Fina y constante.',
    comportamiento: 'bombardeoAleatorio',
    danyo: 0, danyoExplosion: 11, radioExplosion: 22, duracion: 0.28,
    recarga: 1.5, proyectiles: 4, empuje: 40,
    color: '#d8c89a',
    // SE VE CAER CADA FLECHA. `caida` son las unidades desde las que se lanza,
    // por encima del punto de impacto, y `velocidad` lo rápido que baja: 150 a
    // 420 son 0,36 s de vuelo, lo justo para verlas venir y apartarse sin que
    // el arma pierda su cadencia.
    //
    // Antes la onda aparecía en el suelo sin más y el arma no se distinguía de
    // un bombardeo. Una lluvia de flechas es lo que se ve en el aire.
    caida: 150, velocidad: 420,
    spriteProyectil: 'proyFlecha',
    // Y AL CLAVARSE, UNA ONDA REDONDA Y DORADA. Llevaba el reventón de tierra,
    // que es polvo desgarrado y en composición normal; ahora que las flechas se
    // ven caer de verdad, lo que hay que enseñar en el suelo no es un impacto
    // sucio sino el círculo exacto que acaban de cubrir. De ahí la
    // circunferencia limpia —`rugosidad` a cero, la única del catálogo— y el
    // dorado, que es el color de la andanada.
    spriteOnda: 'ondaAurea',
    niveles: [{}, { proyectiles: 2 }, { danyoExplosion: 3 }, { recarga: -0.2 },
              { proyectiles: 2 }, { danyoExplosion: 4 }, { radioExplosion: 6 },
              { proyectiles: 3, danyoExplosion: 5 },
              { danyoExplosion: 6 }, { danyoExplosion: 9, recarga: -0.15 }]
  },

  // --- Ondas: castigan estar rodeado, que es donde acabas siempre ---------
  gritoDeGuerra: {
    nombre: 'Grito de guerra',
    descripcion: 'Empujón sonoro. Aparta más de lo que mata.',
    comportamiento: 'ondaCircular',
    spriteOnda: 'ondaGrito',
    danyo: 7, radio: 74, duracion: 0.35, recarga: 1.5, empuje: 380,
    color: '#ffd8a0',
    niveles: [{}, { radio: 10 }, { empuje: 70 }, { danyo: 3 },
              { recarga: -0.2 }, { radio: 12 }, { empuje: 90 }, { danyo: 6, radio: 14 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },
  sismo: {
    nombre: 'Sismo',
    descripcion: 'La tierra se abre a lo ancho. Tarda, pero llega lejos.',
    comportamiento: 'ondaCircular',
    spriteOnda: 'reventonTierra',
    // POR DEBAJO DE TODO. Las ondas se dibujan encima de la horda porque una
    // explosión está en el aire; esta no. El Sismo es la tierra abriéndose, y
    // pasando por delante de una columna o de una estatua no se lee como una
    // grieta sino como una nube — y a 140 de radio, que es media pantalla, se
    // come el combate entero.
    //
    // Es la única de las cuatro `ondaCircular` que lo lleva: la Onda expansiva,
    // el Grito de guerra y el Gladius Hispaniensis sí van por el aire.
    ondaEnSuelo: true,
    danyo: 22, radio: 140, duracion: 0.7, recarga: 4.0, empuje: 150,
    color: '#c0a070',
    niveles: [{}, { radio: 18 }, { danyo: 7 }, { recarga: -0.5 },
              { radio: 20 }, { danyo: 9 }, { recarga: -0.4 }, { radio: 26, danyo: 13 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },

  // --- Suelo: dejas rastro y no vuelves sobre él --------------------------
  aceiteHirviendo: {
    nombre: 'Aceite hirviendo',
    descripcion: 'Charco ancho que abrasa despacio.',
    comportamiento: 'zonaPersistente',
    // NO para los proyectiles enemigos: es una mancha en el suelo, y lo que
    // vuela por encima no la toca. Ver Disparos.barrer (entidades/disparo.js).
    bloqueaDisparos: false,
    danyo: 5, intervalo: 0.4, recarga: 3.0, charcos: 1, duracion: 5.5, radio: 38,
    // Calcomania de suelo con hoja propia (el valor es el id del atlas).
    sprite: 'zonaAceite',
    // MENOS TRANSPARENTE QUE EL RESTO DE ZONAS. La transparencia baja un 40%
    // (de 0,60 a 0,36), o sea que tapa 0,64 en vez de 0,40. El 40% general está
    // puesto para que nueve armas de área a la vez no conviertan la pantalla en
    // una mancha; estas tres no son ese caso —son una sola, y las dos auras van
    // pegadas al jugador— así que pueden verse de verdad sin ensuciar nada.
    opacidad: 0.64,
    ralentiza: 0.2, empuje: 0, color: '#e8b04a',
    niveles: [{}, { radio: 7 }, { duracion: 1.5 }, { danyo: 2 },
              { charcos: 1 }, { radio: 8 }, { duracion: 2 }, { charcos: 1, danyo: 3 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },
  minas: {
    nombre: 'Minas',
    sprite: 'minaExplosiva',
    // Con qué revienta al pisarla.
    spriteOnda: 'explosionFuego',
    descripcion: 'Siembra minas. Explotan cuando algo las pisa.',
    comportamiento: 'minaProximidad',
    // EL DOBLE DE DAÑO Y CUATRO VECES LAS MINAS. La curva entera de daño va
    // multiplicada por dos (70->140 de salida, 260->520 al nivel 10) y
    // `charcos` —que son las minas por siembra— pasa de llegar a 6 a llegar a
    // 24, repartido nivel a nivel en vez de en tres saltos.
    //
    // Es mucho de golpe y es a propósito: una mina solo cobra si la pisan, así
    // que el arma no vale por lo que hace sino por cuánto suelo cubre. Con seis
    // no cubría nada; con veinticuatro es un campo minado, que es lo que
    // promete el nombre.
    // NO PARAN LOS DISPAROS ENEMIGOS. Una mina está EN el suelo, esperando a que
    // la pisen: no hay nada ahí arriba contra lo que un proyectil pueda chocar.
    bloqueaDisparos: false,
    danyo: 140, intervalo: 0.9, recarga: 3.6, charcos: 2, duracion: 8, radio: 16,
    ralentiza: 0, empuje: 180, color: '#ff8a6b',
    niveles: [{}, { charcos: 2 }, { danyo: 50, charcos: 2 }, { duracion: 2, charcos: 2 },
              { charcos: 3, danyo: 40 }, { danyo: 60, charcos: 2 }, { radio: 5, charcos: 3 },
              { charcos: 3, danyo: 80 }, { danyo: 60, charcos: 2 },
              { danyo: 90, recarga: -0.15, charcos: 3 }]
  },
  alquitran: {
    nombre: 'Alquitrán',
    sprite: 'charcoAlquitran',
    descripcion: 'Casi no duele, pero de ahí no salen.',
    comportamiento: 'zonaPersistente',
    // NO para los proyectiles enemigos: es una mancha en el suelo, y lo que
    // vuela por encima no la toca. Ver Disparos.barrer (entidades/disparo.js).
    bloqueaDisparos: false,
    danyo: 2, intervalo: 0.6, recarga: 3.2, charcos: 1, duracion: 6, radio: 46,
    ralentiza: 0.7, empuje: 0, color: '#6a5a5a',
    niveles: [{}, { radio: 9 }, { duracion: 1.5 }, { charcos: 1 },
              { radio: 10 }, { duracion: 2 }, { danyo: 2 }, { charcos: 1, radio: 12 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },
  campoElectrico: {
    nombre: 'Campo eléctrico',
    descripcion: 'Chisporroteo pegado a ti. Nadie se acerca gratis.',
    comportamiento: 'auraPasiva',
    danyo: 5, intervalo: 0.3, recarga: 0.5, radio: 34, empuje: 90,
    color: '#9adfff',
    // Hoja propia (id del atlas), no una celda de un catálogo compartido.
    sprite: 'auraCampoElectrico',
    // MENOS TRANSPARENTE QUE EL RESTO DE ZONAS. La transparencia baja un 40%
    // (de 0,60 a 0,36), o sea que tapa 0,64 en vez de 0,40. El 40% general está
    // puesto para que nueve armas de área a la vez no conviertan la pantalla en
    // una mancha; estas tres no son ese caso —son una sola, y las dos auras van
    // pegadas al jugador— así que pueden verse de verdad sin ensuciar nada.
    opacidad: 0.64,
    // Radianes por segundo. Es UNA sola imagen: el giro es lo que la hace
    // parecer viva sin pedirle fotogramas al artista. 1.8 son unos 3,5 s por
    // vuelta — se ve que se mueve sin marear, y es el número a tocar.
    giro: 1.8,
    niveles: [{}, { radio: 5 }, { danyo: 2 }, { empuje: 40 },
              { radio: 6 }, { danyo: 3 }, { radio: 7 }, { danyo: 5, empuje: 50 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },

  // --- Rayos: instantáneos, alcance largo ---------------------------------
  laser: {
    nombre: 'Láser',
    descripcion: 'Haz fino que cruza la pantalla de lado a lado.',
    comportamiento: 'rayoPerforante', patron: 'horizontal',
    // El destello dura el doble que el de un rayo normal (0,12): un haz que
    // cruza la pantalla entera merece verse cruzarla.
    duracionRayo: 0.24,
    // `grosor` es el MEDIO ancho del haz: la altura de lo que barre a cada lado
    // de la línea (ver rayoPerforante en sistemas/armas.js, donde se compara
    // contra la distancia perpendicular). Sube de 4 a 24, o sea el doble de lo
    // que llegaba a ser antes, y ya arranca algo más ancho: un haz que cruza la
    // pantalla entera tiene que verse como un haz y no como una raya.
    danyo: 16, recarga: 1.4, alcance: 420, grosor: 4, empuje: 40,
    color: '#ff6b8a',
    niveles: [{}, { danyo: 6, grosor: 2 }, { grosor: 2 }, { recarga: -0.2, grosor: 2 },
              { danyo: 8, grosor: 2 }, { alcance: 70, grosor: 2 }, { grosor: 3 },
              { danyo: 12, recarga: -0.2, grosor: 2 }, { danyo: 6, grosor: 2 },
              { danyo: 9, recarga: -0.15, grosor: 3 }]
  },
  aspaDeLuz: {
    nombre: 'Aspa de luz',
    descripcion: 'Cuatro haces en diagonal. Corta por las esquinas.',
    comportamiento: 'rayoPerforante', patron: 'diagonal',
    danyo: 8, recarga: 2.0, alcance: 280, grosor: 4, empuje: 40,
    color: '#ffe8a0',
    // AL MÁXIMO, EL ASPA GIRA. `giroRayo` son los grados que barre cada haz
    // mientras se apaga, hacia la derecha, y solo lo gana al nivel 10: es el
    // remate del arma, no una subida más.
    //
    // Y barre de verdad, no de mentira: el daño se resuelve sobre el ABANICO
    // entero y no sobre la recta de partida (ver rayoPerforante en
    // sistemas/armas.js). Girar solo el dibujo se habría visto enseguida — el
    // haz pasándole por encima a un enemigo sin hacerle nada es peor que no
    // girar. A 280 de alcance, 20 grados son 98 unidades de barrido en la punta.
    giroRayo: 0,
    // Y EL DESTELLO DURA EL DOBLE: 0,24 s en vez de los 0,12 de los demás rayos.
    //
    // Con el barrido puesto, la duración ES la velocidad de giro —el haz recorre
    // sus veinte grados mientras se apaga— así que este número hace las dos
    // cosas a la vez: se ve más rato y gira más despacio. Es lo que convierte el
    // barrido en un movimiento que se sigue con la vista en vez de un
    // parpadeo torcido.
    duracionRayo: 0.24,
    niveles: [{}, { danyo: 3 }, { grosor: 2 }, { recarga: -0.25 },
              { danyo: 4 }, { alcance: 60 }, { grosor: 2 }, { danyo: 7, recarga: -0.25 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15, giroRayo: 20 }]
  },

  // --- Orbitales: cobertura pegada, sin pedirte nada ----------------------
  satelites: {
    nombre: 'Satélites',
    descripcion: 'Esferas lejanas y lentas. Guardan el perímetro.',
    comportamiento: 'orbital',
    // ÁREA x3 Y DAÑO x2 AL NIVEL 10, los dos progresivos: `radioEscudo` va de 7
    // a 21 y el daño de 10 a 72 (antes llegaba a 36).
    //
    // `radioEscudo` es a la vez lo que golpea y lo que se dibuja, así que las
    // lunas crecen solas con el arma — no hay nada que sincronizar y no puede
    // desincronizarse. Ver dibujarOrbitales en sistemas/armas.js.
    danyo: 10, recarga: 1.0, escudos: 2, radioOrbita: 68, radioEscudo: 7,
    velocidadAngular: 1.4, empuje: 80, color: '#a0c8ff',
    // LUNAS EN CUARTO MENGUANTE. Era el último orbital sin dibujo, y el único
    // que no se podía sacar del generador... hasta que se vio que una luna son
    // dos circunferencias y una resta (ver Pirotecnia.Luna en
    // herramientas/generar-efectos.ps1).
    //
    // Sin `giroOrbital`, y a propósito: la fase es lo que hace reconocible a una
    // luna, y rotándola queda del revés media vuelta de cada dos. Mismo motivo
    // que el escudo del Scutum, que lleva emblema.
    spriteOrbital: 'orbLuna',
    // LA LUNA SE DIBUJA x1,5 SOBRE SU RADIO DE DAÑO. `escalaOrbital` afecta solo
    // al dibujo.
    //
    // BAJA DE 2,5 A 1,5, y no es un cambio de gusto: es la consecuencia de
    // triplicar el área. Con 2,5 sobre un `radioEscudo` de 21, cada luna se
    // dibujaría a 52 de radio —más de un tercio del alto de la pantalla por
    // satélite, y son hasta seis—. El 2,5 se puso cuando el radio era 7 fijo y
    // la luna se veía diminuta; ahora el radio hace ese trabajo él solo.
    //
    // Y BAJA OTRO 25%, de 1,5 a 1,125: con el radio ya triplicado, las lunas se
    // veían más grandes de lo que hacía falta para saber dónde estaban.
    //
    // Sigue habiendo algo de exceso sobre el radio de daño, y es a propósito: lo
    // que sobresale es sobre todo el aura, que se lee como resplandor y no como
    // filo. La salida honrada, si molesta, es bajar esto a 1 — nunca subir el
    // radio para justificar el dibujo.
    escalaOrbital: 1.125,
    // CADA LUNA, SU FASE. La hoja trae el ciclo lunar entero en 16 fotogramas y
    // el motor elige el suyo por la posición de cada una en la órbita, así que
    // las seis enseñan fases distintas y una vuelta al jugador es un ciclo
    // completo. No hace falta declarar nada más: sale de `frames` en el atlas
    // (ver dibujarOrbitales en sistemas/armas.js).
    //
    // Y GIRAN SOBRE SÍ MISMAS. Lo tuve sin girar a propósito y me equivocaba de
    // miedo: pensé que rotar haría bailar los cráteres y taparía la fase. Pero
    // 0,55 rad/s es una vuelta cada once segundos —más lento que la propia
    // órbita, que da una vuelta cada cuatro— así que no compite con nada: la
    // fase sigue leyéndose y lo que se gana es que la luna deje de parecer una
    // pegatina clavada al aire.
    //
    // Despacio y en el sentido de la órbita, que es como gira un satélite de
    // verdad: acompaña, no marea.
    giroOrbital: 0.55,
    niveles: [{}, { escudos: 1, danyo: 5, radioEscudo: 1 },
              { radioOrbita: 8, danyo: 6, radioEscudo: 2 },
              { danyo: 8, radioEscudo: 1 },
              { escudos: 1, danyo: 6, radioEscudo: 2 },
              { velocidadAngular: 0.5, danyo: 7, radioEscudo: 1 },
              { escudos: 1, danyo: 6, radioEscudo: 2 },
              { danyo: 10, radioEscudo: 1 },
              { danyo: 7, radioEscudo: 2 },
              { danyo: 7, recarga: -0.15, radioEscudo: 2 }]
  },
  discosDeSierra: {
    nombre: 'Discos de sierra',
    descripcion: 'Giran pegados y rápido. No dejan acercarse.',
    comportamiento: 'orbital',
    danyo: 16, recarga: 1.0, escudos: 2, radioOrbita: 26, radioEscudo: 9,
    velocidadAngular: 4.2, empuje: 60, color: '#cfd8e0',
    spriteOrbital: 'orbDiscos',
    // Gira sobre su eje AL REVÉS que su órbita (4.2) y más rápido: girando en
    // el mismo sentido y a la misma velocidad, el disco parecería clavado a la
    // órbita y no cortaría nada. Negativo y 12 para que se lea la sierra.
    giroOrbital: -12,
    niveles: [{}, { danyo: 5 }, { escudos: 1 }, { velocidadAngular: 0.8 },
              { danyo: 7 }, { escudos: 1 }, { radioEscudo: 3 }, { danyo: 11, escudos: 1 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },

  // --- El arma de Say: el Códice Infernal --------------------------------
  //
  // Pedida por Sergio, y es un orbital que crece EN NÚMERO DE LIBROS: uno al
  // nivel 1 y uno más en cada subida, hasta los diez de la lámina. Es la única
  // arma del juego en la que subir de nivel se ve antes de leer nada — hay un
  // libro más dando vueltas.
  //
  // CADA LIBRO ES UN LIBRO DISTINTO, no diez copias del mismo. La lámina trae
  // los diez y el motor reparte uno por orbital (`fotogramaPorEscudo`, ver
  // dibujarOrbitales en sistemas/armas.js), así que la biblioteca se va
  // abriendo según se sube: el que sale al nivel 7 no lo habías visto nunca.
  //
  // Y GIRAN MÁS DEPRISA CON EL NIVEL. `velocidadAngular` sube en casi todas las
  // subidas, de 1,6 a 4,4 rad/s: al 1 es un libro paseando y al 10 son diez
  // rodeándote a la carrera. Es lo que evita que el arma sea solo "más cosas":
  // la última subida no añade un décimo del daño, cambia cómo se siente.
  //
  // EL DAÑO SUBE POCO A POCO Y EL RADIO CASI NADA, a propósito. Con diez
  // orbitales, cada punto de daño se cobra diez veces por vuelta: la cuenta que
  // importa aquí no es el golpe, es cuántos hay dando vueltas y a qué
  // velocidad. Por eso arranca en 9 —por debajo de los Satélites, que solo
  // llevan dos— y llega a 40 y no a 72.
  //
  // `radioOrbita` 46: entre los Discos de sierra (26, pegados al cuerpo) y los
  // Satélites (68, guardando el perímetro). Un libro a media distancia es lo
  // que deja pasar a un enemigo por dentro y por fuera, que es lo que hace que
  // colocarse importe.
  codiceInfernal: {
    nombre: 'Códice Infernal',
    descripcion: 'Diez libros que no deberían abrirse. Cada nivel despierta a otro.',
    comportamiento: 'orbital',
    danyo: 9, recarga: 1.0, escudos: 1, radioOrbita: 46, radioEscudo: 6,
    velocidadAngular: 1.6, empuje: 55, color: '#b07de0',
    spriteOrbital: 'orbCodice',
    // El libro por número de orbital y no por posición en la órbita: ver la
    // nota larga de `porEscudo` en dibujarOrbitales.
    fotogramaPorEscudo: true,
    // 1,15 sobre el radio de daño. Un poco por encima, como las lunas, porque el
    // libro es ALTO Y ESTRECHO y su dibujo entra en un cuadro: lo que sobresale
    // del círculo es el alto del libro, no filo — el daño sigue siendo el
    // círculo de `radioEscudo`, como en todos los orbitales.
    //
    // Llegó a estar en 1,7 y era demasiado: con el radio al máximo, cada libro
    // salía más alto que la propia Say —34 unidades contra 26— y diez de esos
    // dando vueltas tapaban a quien los llevaba. Un libro tiene que leerse como
    // un objeto que ella maneja, no como un decorado con una niña dentro.
    escalaOrbital: 1.15,
    // SIN `giroOrbital`. Mismo motivo que las lunas y que el escudo del Scutum:
    // un libro tiene derecho y revés, y rotándolo se lee del revés media vuelta
    // de cada dos. Lo que da la sensación de magia aquí es que sean muchos y
    // vayan rápido, no que volteen.
    // EL RADIO DE DAÑO CRECE POCO —de 6 a 8— y no por tacañería: son DIEZ
    // círculos girando. Cada unidad de radio se multiplica por diez alrededor
    // del jugador, así que lo que en un arma de dos orbitales es un ajuste
    // menor, aquí es cerrar el paso del todo.
    niveles: [{},
              { escudos: 1, velocidadAngular: 0.35, danyo: 3 },
              { escudos: 1, velocidadAngular: 0.3, danyo: 3, radioEscudo: 1 },
              { escudos: 1, velocidadAngular: 0.3, danyo: 3 },
              { escudos: 1, velocidadAngular: 0.3, danyo: 4, radioOrbita: 6 },
              { escudos: 1, velocidadAngular: 0.3, danyo: 3 },
              { escudos: 1, velocidadAngular: 0.3, danyo: 4 },
              { escudos: 1, velocidadAngular: 0.3, danyo: 4, radioEscudo: 1 },
              { escudos: 1, velocidadAngular: 0.3, danyo: 3, radioOrbita: 6 },
              { escudos: 1, velocidadAngular: 0.4, danyo: 4, recarga: -0.15 }]
  },

  // --- Barrido completo: la katana --------------------------------------
  // Pedida por Sergio. Es un arcoMelee con la apertura al máximo: 360 grados,
  // así que no hay que orientarse ni acercarse por un lado concreto — barre todo
  // lo que te rodea y empuja.
  //
  // Lo que la hace distinta del Gladius no es el arco, es el ALCANCE. Corto (38
  // frente a 46) y con dos tajos encadenados: te obliga a estar DENTRO del
  // montón, no en su borde. Un barrido de 360 con alcance largo sería
  // sencillamente el arma buena, y aquí lo que se paga por cubrir todo el
  // círculo es tener que meterse.
  //
  // Su hueco en el catálogo lo justifica la ambientación mezclada, igual que el
  // revólver o la artillería.
  katana: {
    nombre: 'Katana',
    descripcion: 'Barrido de 360° a tu alrededor. Hay que estar dentro.',
    comportamiento: 'arcoMelee',
    danyo: 24,
    recarga: 1.35,
    alcance: 38,
    angulo: 360,
    golpes: 2,
    demoraGolpe: 0.16,
    empuje: 130,
    color: '#e8f0ff',
    // `spriteTajo`: animación de barrido. El valor es DIRECTAMENTE el id de la
    // entrada del atlas donde vive su hoja, así que añadir el tajo de otra arma
    // no renumera ni toca nada de lo que ya está.
    //
    // Va aquí y no en `sprite` porque son cosas distintas: `sprite` son
    // calcomanías de suelo, quietas; esto es una animación que gira con el
    // golpe.
    spriteTajo: 'tajoKatana',
    // Cuánto dura el DIBUJO del tajo. Solo visual: el daño se resuelve entero
    // en el instante del golpe. Los 0,16 s por defecto son los de un arco
    // trazado, que es un destello; repartidos entre los seis fotogramas de la
    // hoja salían a 27 ms cada uno y la animación pasaba sin verse.
    duracionTajo: 0.34,
    niveles: [{}, { danyo: 8 }, { alcance: 5, danyo: 6 }, { danyo: 11 }, { golpes: 1, danyo: 8 },
              { alcance: 6, danyo: 10 }, { recarga: -0.2, danyo: 8 },
              { danyo: 18, alcance: 6 }, { danyo: 10 }, { danyo: 14, recarga: -0.15 }]
  },

  // --- Orbital intermitente ----------------------------------------------
  // También de Sergio: escudos de sierra que orbitan y se ACTIVAN cada cierto
  // tiempo. Los tres orbitales que ya había (Scutum, Satélites, Discos de
  // sierra) giran para siempre en cuanto se equipan; este sale, da vueltas seis
  // segundos y se retira hasta la próxima recarga.
  //
  // Por eso pega casi el triple que los discos permanentes: lo que compras con
  // ese daño es tener que mirar el reloj.
  sierrasVotivas: {
    nombre: 'Sierras votivas',
    descripcion: 'Cuatro sierras que salen a girar unos segundos y vuelven.',
    comportamiento: 'orbitalPulsante',
    danyo: 42, recarga: 6.5, duracion: 6, escudos: 4, radioOrbita: 38, radioEscudo: 10,
    velocidadAngular: 5.0, empuje: 140, color: '#ffb14a',
    spriteOrbital: 'orbSierras',
    // Gira sobre su eje al reves que su orbita, igual que los discos: es lo
    // que hace que se lea que cortan y no que van dando vueltas pegadas.
    giroOrbital: -14,
    niveles: [{}, { danyo: 10 }, { duracion: 1 }, { escudos: 1 },
              { recarga: -0.8 }, { danyo: 14 }, { escudos: 1, radioOrbita: 6 },
              { duracion: 1.5, danyo: 18 },
              { danyo: 10 }, { danyo: 14, recarga: -0.7 }]
  },

  // === EVOLUCIONES (sección 9 del plan) ==================================
  //
  // NO SALEN EN EL SORTEO DE SUBIDA DE NIVEL. `esEvolucion` las saca del sorteo
  // de sistemas/progresion.js: la única forma de conseguirlas es abrir un COFRE
  // de élite llevando el arma base a nivel 8 y el pasivo requerido a 1 o más.
  //
  // Tampoco suben de nivel: llegan con sus números finales, que es lo que las
  // convierte en el techo de una rama y no en un escalón más. Por eso no llevan
  // `niveles`.
  //
  // Reutilizan comportamientos ya implementados, como manda el criterio 8 del
  // plan. Tres de las cinco quedan a falta de un matiz que depende de sistemas
  // que todavía no existen, y está marcado en cada una: el arma es jugable y
  // está equilibrada, pero el detalle fino llegará con su sistema.
  pilumJupiter: {
    nombre: 'Pilum de Júpiter',
    descripcion: 'La jabalina revienta en rayo al clavarse.',
    comportamiento: 'proyectilExplosivo',
    spriteOnda: 'explosionJupiter',
    esEvolucion: true,
    danyo: 26, danyoExplosion: 40, radioExplosion: 46,
    recarga: 0.85, proyectiles: 3, velocidad: 300, alcance: 340,
    radio: 5, perforacion: 2, dispersion: 9, empuje: 190,
    color: '#dff0ff', estela: '#7fa8ff', largoTrazo: 9,
    // EL RAYO DE VERDAD: una columna que cae a plomo sobre el punto donde se
    // clava la jabalina. `rayoCaida` es desde cuánto más arriba entra —190 son
    // dos tercios de la altura de la pantalla, así que viene de fuera de cuadro
    // y no de un punto flotante— y `rayoGrosor` su trazo.
    //
    // Es SOLO dibujo. El daño ya lo pone la explosión y el arma está equilibrada
    // con esos números; darle daño propio al haz sería subirle el dps por la
    // puerta de atrás con la excusa de un efecto. Ver VFX.haz.
    rayoCaida: 190, rayoGrosor: 5
  },
  gladiusHispaniensis: {
    nombre: 'Gladius Hispaniensis',
    descripcion: 'Corte de 360° que barre y empuja.',
    comportamiento: 'ondaCircular',
    spriteOnda: 'ondaChoque',
    esEvolucion: true,
    danyo: 62, radio: 108, duracion: 0.34, recarga: 1.15, empuje: 320,
    color: '#ffffff'
  },
  testudo: {
    nombre: 'Testudo',
    descripcion: 'Seis escudos en formación cerrada.',
    comportamiento: 'orbital',
    esEvolucion: true,
    danyo: 44, recarga: 1.0, escudos: 6, radioOrbita: 46, radioEscudo: 10,
    velocidadAngular: 3.0, empuje: 200, color: '#f0dca8',
    // El escudo del Scutum, que es de donde evoluciona: son los mismos seis
    // escudos de la misma legión, no un objeto nuevo. Sin esto, evolucionar
    // cambiaba el dibujo por el círculo trazado y parecía una rebaja.
    spriteOrbital: 'orbScutum',
    // Y EL AURA ROJA, que es lo que separa la evolución del arma base. El mismo
    // escudo con el mismo dibujo, pero encendido: se dibuja por detrás, en
    // aditivo, así que se suma a lo que haya debajo en vez de taparlo.
    //
    // Va aquí y no en la hoja porque la hoja es la del Scutum y se comparte: si
    // el aura viniera horneada en el PNG, la llevarían los dos.
    auraOrbital: 'auraRoja',
    escalaAura: 2.2
    // Destruye proyectiles enemigos, y sin necesitar nada suyo: lo hace CUALQUIER
    // orbital, porque el barrido está en el sistema y no en el arma (ver
    // Disparos.barrer, entidades/disparo.js). Con seis escudos en formación
    // cerrada el Testudo es sencillamente el que menos huecos deja.
  },
  incendioEmerita: {
    nombre: 'Incendio de Emerita',
    sprite: 'charcoLava',
    descripcion: 'El fuego cubre el suelo y no se apaga.',
    comportamiento: 'zonaPersistente',
    // NO para los proyectiles enemigos: es una mancha en el suelo, y lo que
    // vuela por encima no la toca. Ver Disparos.barrer (entidades/disparo.js).
    bloqueaDisparos: false,
    esEvolucion: true,
    danyo: 16, intervalo: 0.25, recarga: 1.6, charcos: 4, duracion: 7, radio: 52,
    ralentiza: 0.2, empuje: 0, color: '#ff5a1a',
    // EL FUEGO SALTA AL QUE CAE DENTRO: quien muere en el charco deja otro más
    // pequeño donde ha caído, del 55% del radio y de vida más corta. Es lo que
    // separa a un incendio de un charco grande — se extiende por donde hay
    // cuerpos, así que castiga a la horda apretada y no a un enemigo suelto.
    //
    // Los hijos NO se propagan a su vez; el porqué está en `crearZona`
    // (entidades/zonaDanyo.js), y es que si lo hicieran no pararía nunca.
    propaga: 0.55
  },
  escorpion: {
    nombre: 'Escorpión',
    descripcion: 'Disparo continuo que atraviesa la fila entera.',
    comportamiento: 'direccionFija', patron: 'horizontal',
    esEvolucion: true,
    // DAÑO DIVIDIDO ENTRE TRES (40 -> 13). Arrasaba desde el momento en que se
    // conseguía. El número single-target no contaba la mitad del problema:
    // `perforacion: 999` sobre un alcance de 620 significa que cada disparo
    // cruza la pantalla entera atravesando TODO, así que su daño real es el de
    // aquí multiplicado por cuánta gente haya en la línea — en una horda, por
    // decenas. Medido, era la evolución más fuerte del juego a igualdad de
    // blanco (266 de dps contra 54 del Gladius Hispaniensis).
    danyo: 13, recarga: 0.3, proyectiles: 2, velocidad: 460, alcance: 620,
    radio: 6, perforacion: 999, dispersion: 4, empuje: 240,
    color: '#fff4d8', estela: '#c08a3a', largoTrazo: 18,
    // El mismo virote: el scorpio era precisamente una ballesta de campaña.
    spriteProyectil: 'proyVirote',
  }
};

// Con qué arranca cada personaje está en datos/personajes.js. Esto solo queda
// como repliegue por si alguien pide un arma que no existe.
export const ARMA_INICIAL = 'pilum';
