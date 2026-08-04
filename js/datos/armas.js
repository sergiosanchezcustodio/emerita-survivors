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
    danyo: 4, danyoExplosion: 22, radioExplosion: 42,
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
    danyo: 0, danyoExplosion: 26, radioExplosion: 38, duracion: 0.35,
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
    danyo: 12, radio: 92, duracion: 0.45, recarga: 2.4, empuje: 200,
    color: '#9adfff',
    niveles: [{}, { radio: 14 }, { danyo: 4 }, { recarga: -0.3 },
              { radio: 16 }, { danyo: 6 }, { recarga: -0.3 }, { radio: 22, danyo: 8 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },
  aquila: {
    nombre: 'Aquila',
    descripcion: 'Aura constante a tu alrededor. Poco daño, sin descanso.',
    comportamiento: 'auraPasiva',
    danyo: 3, intervalo: 0.4, recarga: 0.5, radio: 46, empuje: 50,
    color: '#ffd98a',
    niveles: [{}, { radio: 7 }, { danyo: 1 }, { radio: 7 },
              { danyo: 2 }, { empuje: 40 }, { radio: 9 }, { danyo: 3 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },

  // --- Suelo: control de zona -------------------------------------------
  fuegoGriego: {
    nombre: 'Fuego griego',
    descripcion: 'Charco incendiario que quema a quien lo pisa.',
    comportamiento: 'zonaPersistente',
    danyo: 4, intervalo: 0.35, recarga: 3.4, charcos: 1, duracion: 4.5, radio: 30,
    ralentiza: 0, empuje: 0, color: '#ff7a2a',
    niveles: [{}, { radio: 6 }, { duracion: 1.5 }, { danyo: 2 },
              { charcos: 1 }, { radio: 7 }, { duracion: 2 }, { charcos: 1, danyo: 3 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },
  rete: {
    nombre: 'Rete',
    descripcion: 'Red que frena a la mitad. Control, no matanza.',
    comportamiento: 'zonaPersistente',
    danyo: 3, intervalo: 0.5, recarga: 3.0, charcos: 1, duracion: 3.5, radio: 40,
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
    niveles: [{}, { perforacion: 2 }, { danyo: 8 }, { velocidad: 60 },
              { perforacion: 3 }, { danyo: 10 }, { recarga: -0.4 }, { danyo: 14, perforacion: 4 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  },
  tribulus: {
    nombre: 'Tribulus',
    descripcion: 'Abrojos que quedan clavados donde pisas.',
    comportamiento: 'zonaPersistente',
    danyo: 6, intervalo: 0.45, recarga: 2.8, charcos: 3, duracion: 5, radio: 14,
    ralentiza: 0.25, empuje: 30, color: '#c9bda0',
    niveles: [{}, { charcos: 1 }, { danyo: 2 }, { duracion: 2 },
              { charcos: 2 }, { danyo: 3 }, { duracion: 2 }, { charcos: 2, danyo: 4 },
              { danyo: 6 }, { danyo: 9, recarga: -0.15 }]
  }
};

// Con qué arranca cada personaje está en datos/personajes.js. Esto solo queda
// como repliegue por si alguien pide un arma que no existe.
export const ARMA_INICIAL = 'pilum';
