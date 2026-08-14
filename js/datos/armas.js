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
    danyo: 10,
    recarga: 1.2,
    proyectiles: 1,
    velocidad: 230,
    alcance: 300,            // hasta dónde busca objetivo y cuánto vuela
    radio: 4,                // círculo de impacto del proyectil
    perforacion: 0,          // enemigos extra que atraviesa
    dispersion: 7,           // grados entre proyectiles del mismo disparo
    empuje: 90,
    color: '#f0e2b6',
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
    danyo: 12,
    recarga: 1.0,
    alcance: 46,
    angulo: 90,              // apertura total del arco
    golpes: 1,               // tajos por activación
    demoraGolpe: 0.12,       // segundos entre tajos encadenados
    empuje: 150,
    color: '#dfe6ef',
    evolucion: { pasivo: 'lorica', arma: 'gladiusHispaniensis' },
    niveles: [
      {},
      { danyo: 4 },
      { angulo: 20, alcance: 6 },
      { danyo: 6 },
      { golpes: 1 },
      { angulo: 25, alcance: 8 },
      { danyo: 9 },
      { danyo: 12, alcance: 10 },
      { danyo: 6 },
      { danyo: 9, recarga: -0.15 }
    ]
  },

  pistola: {
    nombre: 'Pistola',
    descripcion: 'Tiro certero al más cercano. Rápida y de largo alcance.',
    comportamiento: 'proyectilDirigido',
    forma: 'bala',
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
    niveles: [{}, { danyo: 5 }, { perforacion: 1 }, { proyectiles: 1, dispersion: 9 },
              { recarga: -0.15 }, { danyo: 8 }, { perforacion: 2 }, { proyectiles: 1, danyo: 10 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },
  rosaDeVientos: {
    nombre: 'Rosa de los vientos',
    descripcion: 'Cuatro disparos en cruz. Cubre, pero pega flojo.',
    comportamiento: 'direccionFija', patron: 'cruz',
    danyo: 8, recarga: 1.3, proyectiles: 1, velocidad: 210, alcance: 200,
    radio: 3, perforacion: 0, dispersion: 0, empuje: 60,
    color: '#d8c8f0', estela: '#6a5a8a', largoTrazo: 7,
    niveles: [{}, { danyo: 3 }, { perforacion: 1 }, { recarga: -0.2 },
              { danyo: 4 }, { proyectiles: 1, dispersion: 11 }, { perforacion: 1 }, { danyo: 6 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },
  metralla: {
    nombre: 'Metralla',
    descripcion: 'Escupe en direcciones al azar. Caos barato.',
    comportamiento: 'direccionAleatoria',
    forma: 'bala',
    danyo: 6, recarga: 0.45, proyectiles: 2, velocidad: 200, alcance: 150,
    radio: 3, perforacion: 0, empuje: 40,
    color: '#ffcf8a', estela: '#8a5a2a', largoTrazo: 6,
    niveles: [{}, { proyectiles: 1 }, { danyo: 2 }, { recarga: -0.08 },
              { proyectiles: 1 }, { danyo: 3 }, { alcance: 50 }, { proyectiles: 2 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },

  // --- Explosivos: mucha área, poco daño directo ------------------------
  lanzagranadas: {
    nombre: 'Lanzagranadas',
    descripcion: 'Sale disparada y revienta al tocar. Área amplia.',
    comportamiento: 'proyectilExplosivo',
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
    color: '#ffd98a',
    niveles: [{}, { radio: 5 }, { danyo: 1, radio: 4 }, { radio: 6 },
              { danyo: 2, radio: 5 }, { empuje: 40, radio: 5 }, { radio: 7 }, { danyo: 3, radio: 6 },
              { danyo: 6, radio: 4 }, { danyo: 9, radio: 5, recarga: -0.15 }]
  },

  // --- Suelo: control de zona -------------------------------------------
  fuegoGriego: {
    nombre: 'Fuego griego',
    descripcion: 'Charco incendiario que quema a quien lo pisa.',
    comportamiento: 'zonaPersistente',
    danyo: 4, intervalo: 0.35, recarga: 3.4, charcos: 1, duracion: 4.5, radio: 19,
    ralentiza: 0, empuje: 0, color: '#ff7a2a',
    evolucion: { pasivo: 'antorcha', arma: 'incendioEmerita' },
    niveles: [{}, { radio: 5 }, { duracion: 1.5, radio: 4 }, { danyo: 2 },
              { charcos: 1, radio: 4 }, { radio: 6 }, { duracion: 2, radio: 4 }, { charcos: 1, danyo: 3, radio: 5 },
              { danyo: 6, radio: 4 }, { danyo: 9, radio: 5, recarga: -0.15 }]
  },
  rete: {
    nombre: 'Rete',
    descripcion: 'Red que frena a la mitad. Control, no matanza.',
    comportamiento: 'zonaPersistente',
    danyo: 3, intervalo: 0.5, recarga: 3.0, charcos: 1, duracion: 3.5, radio: 25,
    ralentiza: 0.5, empuje: 0, color: '#b9c7d6',
    niveles: [{}, { radio: 8 }, { duracion: 1 }, { danyo: 2 },
              { charcos: 1 }, { duracion: 1.5 }, { radio: 10 }, { charcos: 1 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },

  // --- Rayos: alcance largo, daño contenido ------------------------------
  rayoHorizontal: {
    nombre: 'Rayo de Júpiter',
    descripcion: 'Haz que atraviesa a todos, de lado a lado.',
    comportamiento: 'rayoPerforante', patron: 'horizontal',
    danyo: 11, recarga: 1.8, alcance: 300, grosor: 5, empuje: 70,
    color: '#bfe4ff',
    niveles: [{}, { danyo: 4 }, { grosor: 2 }, { recarga: -0.25 },
              { danyo: 6 }, { alcance: 60 }, { grosor: 3 }, { danyo: 9, recarga: -0.25 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },
  rayoCruzado: {
    nombre: 'Rayo cruzado',
    descripcion: 'Cuatro haces en cruz. Mucho alcance, poco daño.',
    comportamiento: 'rayoPerforante', patron: 'cruz',
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
    evolucion: { pasivo: 'clepsidra', arma: 'escorpion' },
    niveles: [{}, { perforacion: 2 }, { danyo: 8 }, { velocidad: 60 },
              { perforacion: 3 }, { danyo: 10 }, { recarga: -0.4 }, { danyo: 14, perforacion: 4 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },
  tribulus: {
    nombre: 'Tribulus',
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
    radio: 3, perforacion: 0, dispersion: 5, empuje: 50,
    color: '#dcc9a0', estela: '#7a6440', largoTrazo: 9,
    niveles: [{}, { danyo: 3 }, { recarga: -0.1 }, { proyectiles: 1 },
              { danyo: 4, perforacion: 1 }, { recarga: -0.1 }, { proyectiles: 1 },
              { danyo: 7 }, { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },
  honda: {
    nombre: 'Honda balear',
    descripcion: 'Piedra lenta que descalabra y tira de espaldas.',
    comportamiento: 'proyectilDirigido',
    forma: 'bala',
    danyo: 17, recarga: 1.5, proyectiles: 1, velocidad: 190, alcance: 250,
    radio: 5, perforacion: 0, dispersion: 8, empuje: 280,
    color: '#b9b2a4', estela: '#5d5850', largoTrazo: 6,
    niveles: [{}, { danyo: 6 }, { empuje: 60 }, { proyectiles: 1 },
              { danyo: 8 }, { recarga: -0.25 }, { empuje: 80 }, { danyo: 12 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },
  fusil: {
    nombre: 'Fusil',
    descripcion: 'Disparo largo y perforante. Pega donde mira.',
    comportamiento: 'proyectilDirigido',
    forma: 'bala',
    danyo: 19, recarga: 1.45, proyectiles: 1, velocidad: 560, alcance: 440,
    radio: 3, perforacion: 1, dispersion: 3, empuje: 100,
    color: '#cfd6dd', estela: '#6d7480', largoTrazo: 14,
    niveles: [{}, { danyo: 6 }, { perforacion: 1 }, { recarga: -0.2 },
              { danyo: 8 }, { perforacion: 1 }, { velocidad: 80 }, { danyo: 13, recarga: -0.2 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },
  subfusil: {
    nombre: 'Subfusil',
    descripcion: 'Ráfaga sin pausa. Cada bala pica poco.',
    comportamiento: 'proyectilDirigido',
    forma: 'bala',
    danyo: 4, recarga: 0.22, proyectiles: 1, velocidad: 420, alcance: 260,
    radio: 2, perforacion: 0, dispersion: 9, empuje: 25,
    color: '#ffe08a', estela: '#8a6a2a', largoTrazo: 7,
    niveles: [{}, { danyo: 1 }, { recarga: -0.03 }, { proyectiles: 1 },
              { danyo: 2 }, { recarga: -0.03 }, { proyectiles: 1 }, { danyo: 3 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },
  revolver: {
    nombre: 'Revólver',
    descripcion: 'Un tiro, muy gordo, y a esperar.',
    comportamiento: 'proyectilDirigido',
    forma: 'bala',
    danyo: 30, recarga: 1.9, proyectiles: 1, velocidad: 480, alcance: 300,
    radio: 4, perforacion: 1, dispersion: 0, empuje: 190,
    color: '#ffd0a0', estela: '#8a4a2a', largoTrazo: 11,
    niveles: [{}, { danyo: 10 }, { recarga: -0.2 }, { perforacion: 1 },
              { danyo: 12 }, { recarga: -0.2 }, { danyo: 14 }, { proyectiles: 1 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },

  // --- Cuerpo a cuerpo: hay que dejarles llegar ---------------------------
  // Son las únicas que piden lo contrario que el resto del juego. Bien llevadas
  // no son un castigo: el arco corta a varios a la vez y el empuje abre hueco.
  hacha: {
    nombre: 'Hacha',
    descripcion: 'Tajo corto y brutal. Poco alcance, mucho destrozo.',
    comportamiento: 'arcoMelee',
    danyo: 24, recarga: 1.35, alcance: 42, angulo: 70, golpes: 1, demoraGolpe: 0.1,
    empuje: 200, color: '#e0d2c0',
    niveles: [{}, { danyo: 8 }, { angulo: 15 }, { danyo: 10 },
              { golpes: 1 }, { alcance: 8 }, { danyo: 13 }, { danyo: 16, recarga: -0.2 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },
  maza: {
    nombre: 'Maza',
    descripcion: 'Lenta y demoledora. Los manda por los aires.',
    comportamiento: 'arcoMelee',
    danyo: 34, recarga: 1.9, alcance: 40, angulo: 60, golpes: 1, demoraGolpe: 0.1,
    empuje: 340, color: '#c2b8a8',
    niveles: [{}, { danyo: 11 }, { empuje: 70 }, { angulo: 18 },
              { danyo: 14 }, { recarga: -0.3 }, { empuje: 90 }, { danyo: 20 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },
  latigo: {
    nombre: 'Látigo',
    descripcion: 'Restallido largo y estrecho, casi sin pausa.',
    comportamiento: 'arcoMelee',
    danyo: 10, recarga: 0.65, alcance: 74, angulo: 38, golpes: 1, demoraGolpe: 0.08,
    empuje: 110, color: '#d8b48a',
    niveles: [{}, { danyo: 3 }, { alcance: 10 }, { recarga: -0.08 },
              { golpes: 1 }, { danyo: 5 }, { angulo: 14 }, { danyo: 8, alcance: 12 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },
  motosierra: {
    nombre: 'Motosierra',
    descripcion: 'No corta: muele. Pégate y no sueltes.',
    comportamiento: 'arcoMelee',
    danyo: 4, recarga: 0.16, alcance: 32, angulo: 55, golpes: 1, demoraGolpe: 0.06,
    empuje: 20, color: '#ff8a6b',
    niveles: [{}, { danyo: 1 }, { angulo: 12 }, { danyo: 2 },
              { alcance: 6 }, { danyo: 2 }, { recarga: -0.03 }, { danyo: 3, angulo: 15 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },
  guadanya: {
    nombre: 'Guadaña',
    descripcion: 'Siega en semicírculo. Ancha antes que fuerte.',
    comportamiento: 'arcoMelee',
    danyo: 16, recarga: 1.25, alcance: 54, angulo: 145, golpes: 1, demoraGolpe: 0.1,
    empuje: 120, color: '#cfe0d0',
    niveles: [{}, { danyo: 5 }, { angulo: 25 }, { alcance: 8 },
              { danyo: 7 }, { golpes: 1 }, { angulo: 30 }, { danyo: 11, alcance: 10 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },

  // --- Conos: sucios, cortos y contundentes -------------------------------
  lanzallamas: {
    nombre: 'Lanzallamas',
    descripcion: 'Lengua de fuego continua. Corto y sin descanso.',
    comportamiento: 'conoCorto',
    danyo: 3, recarga: 0.26, proyectiles: 5, velocidad: 150, alcance: 78, angulo: 42,
    radio: 5, perforacion: 2, empuje: 15,
    color: '#ff9a3a', estela: '#a03a10',
    niveles: [{}, { proyectiles: 2 }, { danyo: 1 }, { alcance: 14 },
              { proyectiles: 2 }, { danyo: 2 }, { angulo: 10 }, { proyectiles: 3, danyo: 2 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },
  recortada: {
    nombre: 'Recortada',
    descripcion: 'Dos cañones a bocajarro. Abre un pasillo.',
    comportamiento: 'conoCorto',
    forma: 'bala',
    danyo: 11, recarga: 1.6, proyectiles: 9, velocidad: 230, alcance: 82, angulo: 78,
    radio: 3, perforacion: 0, empuje: 220,
    color: '#ffc07a', estela: '#8a4a1a',
    niveles: [{}, { proyectiles: 3 }, { danyo: 3 }, { empuje: 60 },
              { proyectiles: 3 }, { danyo: 4 }, { recarga: -0.3 }, { proyectiles: 4, danyo: 6 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },

  // --- Patrones fijos: no apuntan, te piden colocarte ---------------------
  aspa: {
    nombre: 'Aspa',
    descripcion: 'Cuatro disparos en diagonal. Cubre las esquinas.',
    comportamiento: 'direccionFija', patron: 'diagonal',
    danyo: 9, recarga: 1.15, proyectiles: 1, velocidad: 230, alcance: 220,
    radio: 3, perforacion: 0, dispersion: 0, empuje: 60,
    color: '#b9e8d0', estela: '#4a8a6a', largoTrazo: 8,
    niveles: [{}, { danyo: 3 }, { perforacion: 1 }, { recarga: -0.15 },
              { danyo: 4 }, { proyectiles: 1, dispersion: 10 }, { perforacion: 1 }, { danyo: 7 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },
  enfilada: {
    nombre: 'Enfilada',
    descripcion: 'Cuatro virotes pesados en cruz. Atraviesan filas.',
    comportamiento: 'direccionFija', patron: 'cruz',
    danyo: 20, recarga: 2.1, proyectiles: 1, velocidad: 340, alcance: 380,
    radio: 5, perforacion: 3, dispersion: 0, empuje: 170,
    color: '#e8d8b0', estela: '#8a7a4a', largoTrazo: 13,
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
    niveles: [{}, { proyectiles: 2 }, { danyo: 1 }, { recarga: -0.05 },
              { proyectiles: 2 }, { danyo: 2 }, { alcance: 40 }, { proyectiles: 3, danyo: 2 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },

  // --- Explosivos: el daño va en la onda, no en el impacto ----------------
  molotov: {
    nombre: 'Cóctel molotov',
    descripcion: 'Botella que revienta en llamas. Poco alcance.',
    comportamiento: 'proyectilExplosivo',
    danyo: 2, danyoExplosion: 18, radioExplosion: 48,
    recarga: 1.8, proyectiles: 1, velocidad: 150, alcance: 150,
    radio: 4, perforacion: 0, dispersion: 16, empuje: 110,
    color: '#ffb04a', estela: '#8a4a10', largoTrazo: 6,
    niveles: [{}, { danyoExplosion: 6 }, { radioExplosion: 8 }, { proyectiles: 1 },
              { danyoExplosion: 8 }, { radioExplosion: 9 }, { recarga: -0.35 },
              { proyectiles: 1, danyoExplosion: 10 },
              { danyoExplosion: 6 }, { danyoExplosion: 9, recarga: -0.15 }]
  },
  lanzacohetes: {
    nombre: 'Lanzacohetes',
    descripcion: 'Un cohete cada mucho. Se lleva media pantalla.',
    comportamiento: 'proyectilExplosivo',
    // CADENCIA A LA MITAD (3.4 -> 6.8 de recarga). Disparaba casi tan a menudo
    // como el lanzagranadas llevándose media pantalla por disparo, así que no
    // había ningún motivo para llevar otra cosa. Ahora es lo que dice su nombre:
    // un cohete cada mucho, y hay que elegir el momento. El área también baja,
    // como en el resto de la familia.
    danyo: 6, danyoExplosion: 46, radioExplosion: 44,
    recarga: 6.8, proyectiles: 1, velocidad: 210, alcance: 300,
    radio: 5, perforacion: 0, dispersion: 0, empuje: 260,
    color: '#ff7a5a', estela: '#8a2a10', largoTrazo: 12,
    niveles: [{}, { danyoExplosion: 14 }, { radioExplosion: 8 }, { recarga: -0.6 },
              { danyoExplosion: 16 }, { radioExplosion: 9 }, { proyectiles: 1 },
              { danyoExplosion: 22, recarga: -0.6 },
              { danyoExplosion: 6 }, { danyoExplosion: 9, recarga: -0.4 }]
  },
  artilleria: {
    nombre: 'Artillería',
    descripcion: 'Obuses pesados que caen lejos y solos.',
    comportamiento: 'bombardeoAleatorio',
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
    danyo: 5, intervalo: 0.4, recarga: 3.0, charcos: 1, duracion: 5.5, radio: 38,
    ralentiza: 0.2, empuje: 0, color: '#e8b04a',
    niveles: [{}, { radio: 7 }, { duracion: 1.5 }, { danyo: 2 },
              { charcos: 1 }, { radio: 8 }, { duracion: 2 }, { charcos: 1, danyo: 3 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },
  minas: {
    nombre: 'Minas',
    descripcion: 'Cargas pequeñas repartidas. Pisa y paga.',
    comportamiento: 'zonaPersistente',
    danyo: 14, intervalo: 0.9, recarga: 3.6, charcos: 2, duracion: 8, radio: 16,
    ralentiza: 0, empuje: 180, color: '#ff8a6b',
    niveles: [{}, { charcos: 1 }, { danyo: 5 }, { duracion: 2 },
              { charcos: 1 }, { danyo: 6 }, { radio: 5 }, { charcos: 2, danyo: 8 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },
  alquitran: {
    nombre: 'Alquitrán',
    descripcion: 'Casi no duele, pero de ahí no salen.',
    comportamiento: 'zonaPersistente',
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
    niveles: [{}, { radio: 5 }, { danyo: 2 }, { empuje: 40 },
              { radio: 6 }, { danyo: 3 }, { radio: 7 }, { danyo: 5, empuje: 50 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },

  // --- Rayos: instantáneos, alcance largo ---------------------------------
  laser: {
    nombre: 'Láser',
    descripcion: 'Haz fino que cruza la pantalla de lado a lado.',
    comportamiento: 'rayoPerforante', patron: 'horizontal',
    danyo: 16, recarga: 1.4, alcance: 420, grosor: 3, empuje: 40,
    color: '#ff6b8a',
    niveles: [{}, { danyo: 6 }, { grosor: 2 }, { recarga: -0.2 },
              { danyo: 8 }, { alcance: 70 }, { grosor: 2 }, { danyo: 12, recarga: -0.2 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },
  aspaDeLuz: {
    nombre: 'Aspa de luz',
    descripcion: 'Cuatro haces en diagonal. Corta por las esquinas.',
    comportamiento: 'rayoPerforante', patron: 'diagonal',
    danyo: 8, recarga: 2.0, alcance: 280, grosor: 4, empuje: 40,
    color: '#ffe8a0',
    niveles: [{}, { danyo: 3 }, { grosor: 2 }, { recarga: -0.25 },
              { danyo: 4 }, { alcance: 60 }, { grosor: 2 }, { danyo: 7, recarga: -0.25 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },

  // --- Orbitales: cobertura pegada, sin pedirte nada ----------------------
  satelites: {
    nombre: 'Satélites',
    descripcion: 'Esferas lejanas y lentas. Guardan el perímetro.',
    comportamiento: 'orbital',
    danyo: 10, recarga: 1.0, escudos: 2, radioOrbita: 68, radioEscudo: 7,
    velocidadAngular: 1.4, empuje: 80, color: '#a0c8ff',
    niveles: [{}, { escudos: 1 }, { radioOrbita: 8 }, { danyo: 4 },
              { escudos: 1 }, { velocidadAngular: 0.5 }, { escudos: 1 }, { danyo: 7 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },
  discosDeSierra: {
    nombre: 'Discos de sierra',
    descripcion: 'Giran pegados y rápido. No dejan acercarse.',
    comportamiento: 'orbital',
    danyo: 16, recarga: 1.0, escudos: 2, radioOrbita: 26, radioEscudo: 9,
    velocidadAngular: 4.2, empuje: 60, color: '#cfd8e0',
    niveles: [{}, { danyo: 5 }, { escudos: 1 }, { velocidadAngular: 0.8 },
              { danyo: 7 }, { escudos: 1 }, { radioEscudo: 3 }, { danyo: 11, escudos: 1 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
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
    danyo: 15,
    recarga: 1.35,
    alcance: 38,
    angulo: 360,
    golpes: 2,
    demoraGolpe: 0.16,
    empuje: 130,
    color: '#e8f0ff',
    niveles: [
      {}, { danyo: 5 }, { alcance: 5 }, { danyo: 7 },
      { golpes: 1 }, { alcance: 6, danyo: 6 }, { recarga: -0.2 }, { danyo: 12, alcance: 6 },
      { danyo: 6 }, { danyo: 9, recarga: -0.15 }
    ]
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
    esEvolucion: true,
    danyo: 26, danyoExplosion: 40, radioExplosion: 46,
    recarga: 0.85, proyectiles: 3, velocidad: 300, alcance: 340,
    radio: 5, perforacion: 2, dispersion: 9, empuje: 190,
    color: '#dff0ff', estela: '#7fa8ff', largoTrazo: 9
    // Pendiente: el rayo de verdad (columna vertical que cae en el impacto) pide
    // un efecto vertical que no existe; de momento el estallido hace su papel.
  },
  gladiusHispaniensis: {
    nombre: 'Gladius Hispaniensis',
    descripcion: 'Corte de 360° que barre y empuja.',
    comportamiento: 'ondaCircular',
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
    velocidadAngular: 3.0, empuje: 200, color: '#f0dca8'
    // Pendiente: destruir proyectiles enemigos. No hay proyectiles enemigos hasta
    // la Fase 6, así que hoy no habría nada que destruir.
  },
  incendioEmerita: {
    nombre: 'Incendio de Emerita',
    descripcion: 'El fuego cubre el suelo y no se apaga.',
    comportamiento: 'zonaPersistente',
    esEvolucion: true,
    danyo: 16, intervalo: 0.25, recarga: 1.6, charcos: 4, duracion: 7, radio: 52,
    ralentiza: 0.2, empuje: 0, color: '#ff5a1a'
    // Pendiente: la propagación al morir un enemigo dentro del charco. Necesita
    // un aviso de muerte con posición desde el sistema de zonas.
  },
  escorpion: {
    nombre: 'Escorpión',
    descripcion: 'Disparo continuo que atraviesa la fila entera.',
    comportamiento: 'direccionFija', patron: 'horizontal',
    esEvolucion: true,
    danyo: 40, recarga: 0.3, proyectiles: 2, velocidad: 460, alcance: 620,
    radio: 6, perforacion: 999, dispersion: 4, empuje: 240,
    color: '#fff4d8', estela: '#c08a3a', largoTrazo: 18
  }
};

// Con qué arranca cada personaje está en datos/personajes.js. Esto solo queda
// como repliegue por si alguien pide un arma que no existe.
export const ARMA_INICIAL = 'pilum';
