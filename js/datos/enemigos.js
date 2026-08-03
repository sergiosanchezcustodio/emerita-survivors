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
// - radio: círculo de COLISIÓN, no del sprite. Sale de min(0.35*alto, 0.45*ancho)
//   para que rozar un ala o un cuerno no cuente como impacto.
// - masa: reparte el empuje. Un cíclope no sale despedido como una serpiente.
//   No es un peso realista, es un divisor de empuje.
// - vuela: ignora la decoración del suelo y flota en vez de pisar.
// - inmuneEmpuje: el empuje por daño no le afecta (la separación entre bichos
//   sí, o se apilarían en un punto).
// - sprite: id en el atlas. Existe aparte del id de la entrada porque las
//   variantes tintadas (la serpiente dorada de la sección 11) reutilizan arte.

export const ENEMIGOS = {
  // --- Masa: carne de cañón, aparecen en enjambres -------------------------
  serpiente:  { sprite:'serpiente',  rol:'masa',      vida:6,     velocidad:68, danyo:2,  radio:6,  masa:1.0,  vuela:false, inmuneEmpuje:false },
  gargola:    { sprite:'gargola',    rol:'masa',      vida:10,    velocidad:52, danyo:3,  radio:7,  masa:1.2,  vuela:true,  inmuneEmpuje:false },

  // --- Base: los guardianes humanos ---------------------------------------
  legionario: { sprite:'legionario', rol:'base',      vida:28,    velocidad:38, danyo:5,  radio:7,  masa:2.4,  vuela:false, inmuneEmpuje:false },
  gladiador:  { sprite:'gladiador',  rol:'base',      vida:34,    velocidad:46, danyo:6,  radio:8,  masa:2.8,  vuela:false, inmuneEmpuje:false },

  // --- Rápido -------------------------------------------------------------
  arpia:      { sprite:'arpia',      rol:'rapido',    vida:18,    velocidad:92, danyo:4,  radio:8,  masa:1.6,  vuela:true,  inmuneEmpuje:false },

  // --- Distancia ----------------------------------------------------------
  medusa:     { sprite:'medusa',     rol:'distancia', vida:30,    velocidad:26, danyo:3,  radio:9,  masa:2.0,  vuela:false, inmuneEmpuje:false },

  // --- Tanques ------------------------------------------------------------
  ciclope:    { sprite:'ciclope',    rol:'tanque',    vida:90,    velocidad:24, danyo:14, radio:14, masa:8.0,  vuela:false, inmuneEmpuje:true  },
  minotauro:  { sprite:'minotauro',  rol:'tanque',    vida:70,    velocidad:30, danyo:12, radio:13, masa:7.0,  vuela:false, inmuneEmpuje:false },

  // --- Élite: suelta cofre garantizado ------------------------------------
  manticora:  { sprite:'manticora',  rol:'elite',     vida:500,   velocidad:60, danyo:7,  radio:18, masa:12.0, vuela:true,  inmuneEmpuje:false },

  // --- Jefes --------------------------------------------------------------
  // La velocidad y el daño de contacto de los jefes son provisionales: el plan
  // solo les fija vida, sprite y radio porque su amenaza real está en las fases
  // de patrón, que llegan en la Fase 6. Estos valores solo sirven para que se
  // puedan invocar y probar antes.
  cerbero:    { sprite:'cerbero',    rol:'jefe',      vida:3500,  velocidad:45, danyo:18, radio:30, masa:40.0, vuela:false, inmuneEmpuje:true  },
  hidra:      { sprite:'hidra',      rol:'jefe',      vida:14000, velocidad:30, danyo:22, radio:39, masa:60.0, vuela:false, inmuneEmpuje:true  }
};
