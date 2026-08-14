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
// `efecto` es la versión corta para la columna de la tabla. `descripcion` sigue
// existiendo para el renglón de abajo, que tiene sitio para la frase entera.
export const POTENCIADORES = {
  vitalidad: {
    nombre: 'Vitalidad',
    descripcion: '+4% de vida máxima, en toda partida futura',
    campo: 'vidaMaxima', tipo: 'factor', valor: 0.04,
    efecto: '+4% vida máxima',
    arte: 'potVitalidad',
    maxNivel: 5, costeBase: 400
  },
  premura: {
    nombre: 'Premura',
    descripcion: '+2% de velocidad, en toda partida futura',
    campo: 'velocidad', tipo: 'factor', valor: 0.02,
    efecto: '+2% velocidad',
    arte: 'potPremura',
    maxNivel: 5, costeBase: 400
  },
  coraza: {
    nombre: 'Coraza',
    descripcion: '+1 de armadura, en toda partida futura',
    campo: 'armadura', tipo: 'suma', valor: 1,
    efecto: '+1 armadura',
    arte: 'potCoraza',
    maxNivel: 5, costeBase: 500
  },
  codicia: {
    nombre: 'Codicia',
    descripcion: '+5% de radio de recogida, en toda partida futura',
    campo: 'radioRecogida', tipo: 'factor', valor: 0.05,
    efecto: '+5% recogida',
    arte: 'potCodicia',
    maxNivel: 5, costeBase: 300
  },
  furia: {
    nombre: 'Furia',
    descripcion: '+3% de daño, en toda partida futura',
    campo: 'bonusDanyo', tipo: 'suma', valor: 0.03,
    efecto: '+3% daño',
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
    efecto: '-1.5% recarga',
    arte: 'potClepsidra',
    maxNivel: 5, costeBase: 600
  },
  onda: {
    nombre: 'Onda expansiva',
    descripcion: '+2% de área de efecto, en toda partida futura',
    campo: 'bonusArea', tipo: 'suma', valor: 0.02,
    efecto: '+2% área',
    arte: 'potOnda',
    maxNivel: 5, costeBase: 500
  },
  panacea: {
    nombre: 'Panacea',
    descripcion: '+0.15 de vida por segundo, en toda partida futura',
    campo: 'regeneracion', tipo: 'suma', valor: 0.15,
    efecto: '+0.15 vida/s',
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
    efecto: '+6 escudo',
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
  faroDeLaMuerte: {
    nombre: 'Moneda de Caronte',
    descripcion: 'Una vida extra por nivel: vuelves a media vida donde caíste',
    campo: 'resurreccionesMax', tipo: 'suma', valor: 1,
    efecto: '1 vida extra',
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
