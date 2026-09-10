// Catálogo de potenciadores permanentes. DATOS PUROS, cero lógica — mismo
// formato exacto que datos/pasivos.js (`campo`/`tipo`/`valor`), porque
// jugador.js los aplica con el mismo mecanismo de recalcularStats: son un
// pasivo que en vez de elegirse en una partida se compra con denarios (ver
// core/metaProgreso.js) y queda para SIEMPRE, en todas las partidas futuras.
//
// Por eso los valores por nivel son mucho más pequeños que los de un pasivo
// de partida: un pasivo lo llevas un rato y compite con otros siete huecos;
// esto se acumula sin límite de ranuras y sin que termine la partida.
//
// Cinco niveles, no diez: diez pasos habría sido subir de precio para siempre
// sin que el propio numerito se notara.
//
// EL PRECIO DOBLA EN CADA NIVEL (petición de Sergio): `costeBase * 2^nivel`, así
// que completar uno cuesta 31 veces su precio de salida. El primer nivel es
// barato y se compra en dos partidas; el quinto es una meta de muchas. Antes
// crecía sumando una cantidad fija y los últimos niveles salían casi al mismo
// precio que los primeros, con lo que subir del 4 al 5 no se sentía como una
// conquista sino como el siguiente recibo.
//
// Y TODA LA TABLA SE MULTIPLICÓ POR DIEZ, a petición de Sergio y en dos pasadas
// —primero por cinco y luego otra vez por dos, jugando y mirando—: se ganan del
// orden de dos mil denarios por partida (casi uno por baja, ver MULT_DENARIOS en
// entidades/enemigo.js) y con los precios originales la tienda entera se
// completaba en una docena de partidas. Aquí no hay más ajuste que este: los
// diez números de abajo son lo único que decide cuánto dura la progresión de
// largo plazo.
//
// `arte` es la entrada del atlas con el dibujo de cada uno. Los diez lo tienen
// y los diez son suyos: hasta hace nada, ocho se dibujaban con el icono del
// pasivo gemelo —la Vitalidad salía con el ánfora, la Coraza con la lorica—
// porque no había arte y compartir dibujo se leía mejor que inventarse diez
// glifos. Ya lo hay, y un potenciador que se compra para siempre merece no
// parecer un objeto de partida.
//
// Y LOS QUINCE, desde la última tanda: los cinco de la lista de Sergio
// salieron prestados —el Manto con el ánfora de la Vitalidad, la Bandolera
// con la onda— y en la tienda se veían dos casillas distintas con la misma
// ilustración, que es justo lo que se había arreglado antes. Los suyos son
// provisionales generados con Replicate hasta que Sergio los dibuje.
//
// CÓMO SE ESCRIBE EL EFECTO EN LA TIENDA. Antes había un `efecto` con la frase
// ya montada —'+4% vida máxima'— y era un número copiado a mano del `valor` de
// al lado: dos sitios que decir lo mismo y uno de los dos quedándose viejo el
// día que se toque el balance. Y sobre todo no servía para lo que pidió Sergio,
// que la columna diga LO QUE LLEVAS y LO QUE DARÍA EL SIGUIENTE NIVEL: para eso
// hay que multiplicar, y de una frase no se multiplica.
//
// Así que la frase se monta a partir del `valor` de verdad:
//
//   escala    por cuánto se multiplica para enseñarlo (100 si se dice en %)
//   unidad    lo que va pegado a la cifra
//   concepto  lo que va detrás, redactado para que valga con cualquier número
//   signo     '-' en los que restan; si no se pone, '+'
//
// `descripcion` sigue existiendo para el renglón de abajo, que tiene sitio para
// la frase entera.
export const POTENCIADORES = {
  vitalidad: {
    nombre: 'Vitalidad',
    descripcion: '+4% de vida máxima, en toda partida futura',
    campo: 'vidaMaxima', tipo: 'factor', valor: 0.04,
    escala: 100, unidad: '%', concepto: 'de vida máxima',
    arte: 'potVitalidad',
    maxNivel: 5, costeBase: 400
  },
  premura: {
    nombre: 'Premura',
    descripcion: '+2% de velocidad, en toda partida futura',
    campo: 'velocidad', tipo: 'factor', valor: 0.02,
    escala: 100, unidad: '%', concepto: 'de velocidad',
    arte: 'potPremura',
    maxNivel: 5, costeBase: 400
  },
  coraza: {
    nombre: 'Coraza',
    descripcion: '+1 de armadura, en toda partida futura',
    campo: 'armadura', tipo: 'suma', valor: 1,
    escala: 1, unidad: '', concepto: 'de armadura',
    arte: 'potCoraza',
    maxNivel: 5, costeBase: 500
  },
  codicia: {
    nombre: 'Codicia',
    descripcion: '+5% de radio de recogida, en toda partida futura',
    campo: 'radioRecogida', tipo: 'factor', valor: 0.05,
    escala: 100, unidad: '%', concepto: 'de radio de recogida',
    arte: 'potCodicia',
    maxNivel: 5, costeBase: 300
  },
  furia: {
    nombre: 'Furia',
    descripcion: '+3% de daño, en toda partida futura',
    campo: 'bonusDanyo', tipo: 'suma', valor: 0.03,
    escala: 100, unidad: '%', concepto: 'de daño',
    arte: 'potFuria',
    maxNivel: 5, costeBase: 600
  },

  // --- Los cinco que pidió Sergio ------------------------------------------
  // Los tres primeros no necesitaron nada nuevo: `reduccionRecarga`,
  // `bonusArea` y `regeneracion` son campos que el jugador ya tenía porque los
  // usan los pasivos de partida, así que son datos y punto. Los valores por
  // nivel son deliberadamente PEQUEÑOS al lado de sus pasivos equivalentes
  // (la clepsidra da 4% de recarga por nivel, esto 1,5%): un pasivo lo llevas
  // una partida y ocupa una de cuatro ranuras, esto no caduca nunca.
  clepsidraEterna: {
    nombre: 'Clepsidra eterna',
    descripcion: '-1.5% de recarga, en toda partida futura',
    campo: 'reduccionRecarga', tipo: 'suma', valor: 0.015,
    escala: 100, unidad: '%', concepto: 'de recarga', signo: '-',
    arte: 'potClepsidra',
    maxNivel: 5, costeBase: 600
  },
  onda: {
    nombre: 'Onda expansiva',
    descripcion: '+2% de área de efecto, en toda partida futura',
    campo: 'bonusArea', tipo: 'suma', valor: 0.02,
    escala: 100, unidad: '%', concepto: 'de área',
    arte: 'potOnda',
    maxNivel: 5, costeBase: 500
  },
  panacea: {
    nombre: 'Panacea',
    descripcion: '+0.15 de vida por segundo, en toda partida futura',
    campo: 'regeneracion', tipo: 'suma', valor: 0.15,
    escala: 1, unidad: '', concepto: 'de vida por segundo',
    arte: 'potPanacea',
    maxNivel: 5, costeBase: 700
  },

  // ESCUDO: mecánica nueva, no un campo que ya existiera. Absorbe daño ANTES
  // que la vida y se rellena solo tras unos segundos sin recibir golpes (ver
  // jugador.js). Es lo contrario que la armadura, y por eso convive con ella
  // sin ser redundante: la armadura quita una cantidad fija a CADA golpe —vale
  // mucho contra una horda de serpientes que pican de 3— y el escudo aguanta
  // un total —vale contra el mordisco de un jefe—.
  egida: {
    nombre: 'Égida',
    descripcion: '+6 de escudo, se recarga solo si no te golpean',
    campo: 'escudoMax', tipo: 'suma', valor: 6,
    escala: 1, unidad: '', concepto: 'de escudo',
    arte: 'potEgida',
    maxNivel: 5, costeBase: 800
  },

  // RESURRECCIÓN: una vida extra por nivel. Al caer se gasta una y vuelves en
  // el sitio a media vida, sin esperar a nadie.
  //
  // ES EL MÁS CARO CON DIFERENCIA, y no por capricho: cinco niveles son cinco
  // vidas extra, y eso es exactamente la clase de cosa que puede volver la
  // partida imposible de perder en los primeros quince minutos. Con el precio
  // doblando por nivel, subirlo entero cuesta 37.200 denarios —veinte partidas
  // largas solo para esto—, así que llega tarde y como recompensa de mucho
  // plazo. Aun así es el número que más conviene mirar la primera vez que se
  // juegue con él: si sobra, se recorta aquí y ya está.
  // --- Los cinco de la lista de Sergio -------------------------------------
  //
  // Todos de UN SOLO NIVEL menos la Bellota, y eso es lo que los separa de los
  // diez de arriba: aquellos son porcentajes que se suben poco a poco y estos
  // son cosas que tienes o no tienes. Comprar el Zurrón dos veces no tendría
  // sentido — o hay una ranura más o no la hay.
  //
  // Y por eso son caros de golpe en vez de ir doblando: el precio de un
  // potenciador dobla en cada nivel (ver `costePotenciador`), y con un solo
  // nivel ese mecanismo no se usa nunca. Lo que se paga es lo que pone aquí.
  mantoPeregrino: {
    nombre: 'Capa del Peregrino',
    // Se come el GOLPE ENTERO, no una parte, y no gasta i-frames al hacerlo.
    // Eso es lo que lo separa del escudo, que absorbe pero deja el golpe
    // existiendo para todo lo demás. Ver `recibirDanyo` en entidades/jugador.js.
    descripcion: 'Te para un golpe entero cada 10 segundos',
    campo: 'mantoCada', tipo: 'suma', valor: 10,
    escala: 1, unidad: ' s', concepto: 'entre golpe y golpe parado',
    arte: 'potManto',
    maxNivel: 1, costeBase: 2200
  },
  bellotaDeOro: {
    nombre: 'Bellota de oro',
    // El único de los cinco con dos niveles, porque es el único donde "otro
    // más" sigue significando algo. Solo toca a las armas de proyectil, y las
    // que se desdibujarían con uno de regalo pueden decir que no
    // (`sinBellota`: hoy solo la Petanca).
    descripcion: 'Un proyectil más en todas tus armas que disparan',
    campo: 'bonusProyectiles', tipo: 'suma', valor: 1,
    escala: 1, unidad: '', concepto: 'proyectil más',
    arte: 'potBellota',
    maxNivel: 2, costeBase: 3000
  },
  ultimoAliento: {
    nombre: 'Último aliento',
    // EL ÚNICO OBJETO DEL JUEGO QUE SOLO SIRVE CUANDO HAS FALLADO. No cambia
    // cómo juegas: cambia lo que vale tu muerte. En solitario no hace nada, y
    // no se esconde por eso —la tienda se mira antes de elegir con cuántos se
    // juega, así que aquí sí tiene sentido que se pueda comprar y guardar.
    descripcion: 'Al caer, curas un 25% de vida a los que sigan en pie',
    campo: 'ultimoAliento', tipo: 'suma', valor: 0.25,
    escala: 100, unidad: '%', concepto: 'de vida a quien siga en pie',
    arte: 'potAliento',
    maxNivel: 1, costeBase: 1800
  },
  zurron: {
    nombre: 'Zurrón',
    descripcion: 'Una ranura más de objeto: cinco en vez de cuatro',
    campo: 'maxPasivos', tipo: 'suma', valor: 1,
    escala: 1, unidad: '', concepto: 'ranura de objeto',
    arte: 'potZurron',
    maxNivel: 1, costeBase: 4000
  },
  bandolera: {
    nombre: 'Bandolera',
    // LA MÁS CARA DE TODA LA TIENDA, y con motivo: una ranura de arma no es un
    // porcentaje, es un arma entera más con sus diez niveles. Cambia la partida
    // más que cualquier otra cosa que se pueda comprar.
    descripcion: 'Una ranura más de arma: cinco en vez de cuatro',
    campo: 'maxArmas', tipo: 'suma', valor: 1,
    escala: 1, unidad: '', concepto: 'ranura de arma',
    arte: 'potBandolera',
    maxNivel: 1, costeBase: 6000
  },

  faroDeLaMuerte: {
    nombre: 'Moneda de Caronte',
    descripcion: 'Una vida extra por nivel: vuelves a media vida donde caíste',
    campo: 'resurreccionesMax', tipo: 'suma', valor: 1,
    escala: 1, unidad: '', concepto: 'de vida extra',
    arte: 'potCaronte',
    maxNivel: 5, costeBase: 1200
  }
};

// Precio del SIGUIENTE nivel: dobla en cada escalón, así que del 1 al 5 se paga
// base + 2·base + 4·base + 8·base + 16·base = 31 veces el precio de salida.
// Devuelve -1 si ya está al máximo.
export function costePotenciador(def, nivelActual) {
  if (!def) return -1;
  if (nivelActual >= def.maxNivel) return -1;
  return def.costeBase * Math.pow(2, nivelActual);
}
