// Catálogo de mascotas. DATOS PUROS, cero lógica.
//
// Una mascota es un bicho pequeño que acompaña a cada jugador y hace UNA cosa.
// Se compran con denarios (progreso META, ver core/metaProgreso.js), se quedan
// compradas para siempre y solo se lleva una a la vez: elegir cuál es la
// decisión, y con varias equipadas a la vez no habría ninguna.
//
// Cuatro las pidió Sergio por nombre —Heladio, Oreo, Karim y el Pollito
// fantasma— y cuatro son propuesta. El reparto está pensado para que no haya
// dos que se pisen: cuatro PASIVAS, que cambian una estadística y ya, y cuatro
// ACTIVAS, que hacen algo cada tantos segundos y se ven hacerlo.
//
//   pasivas — heladio (recogida), escipion (aguante), plinio (nivel),
//             neron (dinero)
//   activas — karim (daño), cleopatra (curación), oreo (dinero),
//             pollito (control)
//
// Las PASIVAS declaran `campo`/`tipo`/`valor` y las aplica jugador.js con el
// mismo bucle exacto que los pasivos de partida y los potenciadores: no hay un
// tercer mecanismo, hay el mismo por tercera vez.
//
// Las ACTIVAS declaran `habilidad` —el nombre de una función de
// sistemas/mascotas.js— y `cada`, los segundos entre una vez y la siguiente.
//
// `corto` es el nombre a secas, para los sitios donde no cabe el completo (la
// carta de elegir mascota, la ficha del resumen final). Es un campo y no un
// `nombre.split(' ')[0]` porque ese apaño enseñaba "El" en la carta del Pollito
// Fantasma: partir por el espacio funciona hasta que un nombre empieza por
// artículo, y aquí ya hay uno.
//
// CÓMO SE ESCRIBE EL EFECTO EN LA TIENDA. Igual que en los potenciadores (ver
// datos/potenciadores.js): la frase no está escrita, se monta, porque Sergio
// pidió que la columna diga LO QUE LLEVAS y LO QUE DARÍA EL SIGUIENTE NIVEL, y
// de una frase escrita a mano no se multiplica.
//
//   campoEfecto  qué número de los de arriba es el que crece con el nivel. No es
//                el mismo en todas: en las pasivas es `valor` y en las activas
//                el que las define, que es justo el que multiplica
//                sistemas/mascotas.js por `factorMascota`.
//   escala       por cuánto se multiplica para enseñarlo (100 si se dice en %)
//   unidad       lo que va pegado a la cifra
//   concepto     lo que va detrás, redactado para valer con cualquier número
//   enteros      lo redondea el juego al aplicarlo, así que se enseña redondeado
//                (daño, cura y denarios pasan por Math.round; los segundos no)
//
// `descripcion` sigue siendo la frase larga del renglón de abajo.
//
// `vuela` lo llevan las dos que no pisan el suelo: el búho y el pollito
// fantasma. Solo esas dos flotan y se balancean al andar; las otras seis van a
// ras de suelo, que es lo que pidió Sergio —con su animación de andar ya se leen
// como que caminan, y el balanceo las hacía parecer levitando—.
//
// `color` es provisional: mientras no haya sprites, sistemas/mascotas.js dibuja
// a la mascota como una silueta de ese color con su inicial. En cuanto Sergio
// deje los dibujos en resources/mascotas/, se cambia el dibujado y estos datos
// no se tocan.

export const MASCOTAS = {
  // --- Pasivas -------------------------------------------------------------
  heladio: {
    nombre: 'Heladio el Hámster',
    corto: 'Heladio',
    descripcion: 'Recoge gemas desde mucho más lejos. Todo al carrillo.',
    campo: 'radioRecogida', tipo: 'factor', valor: 0.45,
    campoEfecto: 'valor', escala: 100, unidad: '%', concepto: 'de radio de recogida',
    coste: 600, color: '#e8a75a', inicial: 'H'
  },
  escipion: {
    nombre: 'Escipión la Tortuga',
    corto: 'Escipión',
    descripcion: 'Su caparazón te presta +2 de armadura.',
    campo: 'armadura', tipo: 'suma', valor: 2,
    campoEfecto: 'valor', escala: 1, unidad: '', concepto: 'de armadura',
    coste: 900, color: '#7fa860', inicial: 'E'
  },
  plinio: {
    nombre: 'Plinio el Búho',
    corto: 'Plinio',
    descripcion: 'Te lo explica todo: +20% de experiencia.',
    campo: 'bonusXp', tipo: 'suma', valor: 0.2,
    campoEfecto: 'valor', escala: 100, unidad: '%', concepto: 'de experiencia',
    vuela: true,
    coste: 1200, color: '#b0956a', inicial: 'P'
  },
  neron: {
    // La única que toca el progreso META en vez de la partida: multiplica los
    // denarios que se ganan, así que se paga sola y luego financia al resto.
    // Por eso es de las caras, y por eso su bonus es un `factorDenarios` y no
    // un `campo` del jugador: los denarios no son una estadística de la
    // partida, son lo que queda cuando termina.
    nombre: 'Nerón el Gato',
    corto: 'Nerón',
    descripcion: 'Le gusta el oro: +35% de denarios en cada partida.',
    factorDenarios: 0.35,
    campoEfecto: 'factorDenarios', escala: 100, unidad: '%', concepto: 'de denarios',
    coste: 1500, color: '#5a5a66', inicial: 'N'
  },

  // --- Activas -------------------------------------------------------------
  karim: {
    nombre: 'Karim el Perro',
    corto: 'Karim',
    descripcion: 'Se lanza a morder al enemigo más cercano.',
    habilidad: 'morder', cada: 1.8, danyo: 14, alcance: 90,
    campoEfecto: 'danyo', escala: 1, unidad: '', concepto: 'de daño cada 1,8 s', enteros: true,
    coste: 1000, color: '#c08a4a', inicial: 'K'
  },
  cleopatra: {
    nombre: 'Cleopatra la Gallina',
    corto: 'Cleopatra',
    descripcion: 'Pone un huevo cada poco. El huevo te cura.',
    habilidad: 'huevo', cada: 9, cura: 9,
    campoEfecto: 'cura', escala: 1, unidad: '', concepto: 'de cura cada 9 s', enteros: true,
    coste: 1300, color: '#e0d0a0', inicial: 'C'
  },
  oreo: {
    nombre: 'Oreo el Conejo',
    corto: 'Oreo',
    descripcion: 'Escarba sin parar y desentierra denarios.',
    habilidad: 'escarbar', cada: 11, denarios: 3,
    campoEfecto: 'denarios', escala: 1, unidad: '', concepto: 'denarios cada 11 s', enteros: true,
    coste: 1100, color: '#d8d8d8', inicial: 'O'
  },
  pollito: {
    // El único que da control de masas en vez de daño o recursos: no mata a
    // nadie, abre hueco. Con la horda del minuto 20 encima, abrir hueco vale
    // más que matar a cuatro.
    nombre: 'El Pollito Fantasma',
    corto: 'Pollito',
    descripcion: 'Un chillido de ultratumba y la horda de alrededor huye.',
    habilidad: 'espantar', cada: 12, radio: 95, duracion: 2.5,
    campoEfecto: 'duracion', escala: 1, unidad: ' s', concepto: 'de huida cada 12 s',
    vuela: true,
    coste: 1400, color: '#cfe8ff', inicial: 'F'
  }
};

// Orden en que salen en la tienda: primero las baratas, para que la primera
// compra de alguien que acaba de empezar sea una de las que se entienden solas.
export const ORDEN_MASCOTAS = [
  'heladio', 'escipion', 'karim', 'oreo', 'cleopatra', 'plinio', 'pollito', 'neron'
];

// --- Niveles ----------------------------------------------------------------
//
// Cinco por mascota. El nivel 1 es comprarla; del 2 al 5 se sube en la misma
// tienda, y cada escalón cuesta más.
//
// La mejora es UN SOLO NÚMERO para todas, no una tabla por mascota, y es a
// propósito: cada mascota ya se diferencia por LO QUE HACE, que es la decisión
// interesante. Si además cada una escalara distinto, elegir cuál subir dejaría
// de ser "cuál me gusta más" para ser "cuál tiene mejores números", y eso ya lo
// cubren los potenciadores.
//
// +25% por nivel sobre lo que haga: al 5 rinde el doble que al 1. En las
// pasivas multiplica su `valor`; en las activas, el número que las define
// —daño de Karim, cura de Cleopatra, denarios de Oreo, radio del Pollito—.
export const MAX_NIVEL_MASCOTA = 5;
export const MEJORA_POR_NIVEL = 0.25;

// Cuánto rinde una mascota de nivel `nivel`, como multiplicador.
export function factorMascota(nivel) {
  if (!nivel || nivel < 1) return 0;
  return 1 + (Math.min(nivel, MAX_NIVEL_MASCOTA) - 1) * MEJORA_POR_NIVEL;
}

// Precio del SIGUIENTE nivel. El primero es `coste` —comprarla— y los cuatro
// siguientes van subiendo un 60% del precio base cada uno, así que completar
// una mascota cuesta siete veces lo que costó adoptarla.
//
// Los `coste` de arriba se multiplicaron por diez junto con los de los
// potenciadores (ver datos/potenciadores.js), en dos pasadas de ajuste: se ganan
// unos dos mil denarios por partida y con los precios originales las ocho
// mascotas se completaban con lo de tres tardes.
export function costeMascota(def, nivelActual) {
  if (!def) return -1;
  if (nivelActual >= MAX_NIVEL_MASCOTA) return -1;
  if (nivelActual <= 0) return def.coste;
  return Math.round(def.coste * 0.6 * nivelActual);
}
