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
      { danyo: 8, recarga: -0.15 }
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
      { danyo: 12, alcance: 10 }
    ]
  },

  // --- Catálogo completo, pendiente de comportamiento (Fase 4) ------------
  // Las entradas existen ya porque son datos del plan y no cuesta nada
  // tenerlas. Sus comportamientos todavía no están implementados: el motor
  // avisa por consola una vez y las ignora, en vez de reventar.
  scutum: {
    nombre: 'Scutum', descripcion: 'Escudos que orbitan.',
    comportamiento: 'orbital',
    danyo: 15, recarga: 0, escudos: 1, radioOrbita: 40, velocidadAngular: 2.2,
    empuje: 120, color: '#c9b07a',
    niveles: [{}, { escudos: 1 }, { radioOrbita: 8 }, { danyo: 6 },
              { escudos: 1 }, { velocidadAngular: 0.6 }, { escudos: 1 }, { danyo: 10 }]
  },
  tribulus: {
    nombre: 'Tribulus', descripcion: 'Abrojos que quedan en el suelo.',
    comportamiento: 'trampaSuelo',
    danyo: 8, recarga: 3.0, cantidad: 3, duracion: 5, radio: 10,
    empuje: 40, color: '#8f8271',
    niveles: [{}, { cantidad: 1 }, { danyo: 3 }, { duracion: 2 },
              { cantidad: 2 }, { danyo: 4 }, { duracion: 2 }, { cantidad: 2 }]
  },
  fuegoGriego: {
    nombre: 'Fuego griego', descripcion: 'Charco incendiario.',
    comportamiento: 'zonaPersistente',
    danyo: 5, intervalo: 0.4, recarga: 4.0, charcos: 1, duracion: 4, radio: 26,
    empuje: 0, color: '#ff8a3c',
    niveles: [{}, { radio: 5 }, { duracion: 1.5 }, { danyo: 2 },
              { charcos: 1 }, { radio: 6 }, { duracion: 2 }, { charcos: 1 }]
  },
  ballista: {
    nombre: 'Ballista', descripcion: 'Virote horizontal perforante.',
    comportamiento: 'proyectilLineal',
    danyo: 18, recarga: 2.5, proyectiles: 1, velocidad: 340, alcance: 480,
    radio: 5, perforacion: 3, empuje: 200, color: '#e8e2d0', estela: '#9aa7b5',
    niveles: [{}, { perforacion: 2 }, { danyo: 6 }, { velocidad: 60 },
              { proyectiles: 1 }, { danyo: 8 }, { perforacion: 3 }, { proyectiles: 1 }]
  },
  aquila: {
    nombre: 'Aquila', descripcion: 'Aura de daño constante.',
    comportamiento: 'auraPasiva',
    danyo: 3, intervalo: 0.4, recarga: 0, radio: 44, empuje: 60, color: '#ffd98a',
    niveles: [{}, { radio: 6 }, { danyo: 1 }, { radio: 6 },
              { danyo: 2 }, { empuje: 40 }, { radio: 8 }, { danyo: 3 }]
  },
  rete: {
    nombre: 'Rete', descripcion: 'Red que frena y daña en área.',
    comportamiento: 'zonaPersistente',
    danyo: 14, intervalo: 0.5, recarga: 3.5, charcos: 1, duracion: 3, radio: 34,
    ralentiza: 0.5, empuje: 0, color: '#b9c7d6',
    niveles: [{}, { radio: 6 }, { duracion: 1 }, { danyo: 5 },
              { radio: 6 }, { duracion: 1 }, { danyo: 7 }, { charcos: 1 }]
  }
};

// Con qué arranca la partida. En la Fase 4 lo elegirá el personaje.
export const ARMA_INICIAL = 'pilum';
