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
// Cinco niveles, no diez: el coste ya crece por sí solo (`costeBase` +
// `incremento` por nivel ya comprado) y diez pasos habría sido subir de
// precio para siempre sin que el propio numerito se notara.
export const POTENCIADORES = {
  vitalidad: {
    nombre: 'Vitalidad',
    descripcion: '+4% de vida máxima, en toda partida futura',
    campo: 'vidaMaxima', tipo: 'factor', valor: 0.04,
    maxNivel: 5, costeBase: 20, incremento: 15
  },
  premura: {
    nombre: 'Premura',
    descripcion: '+2% de velocidad, en toda partida futura',
    campo: 'velocidad', tipo: 'factor', valor: 0.02,
    maxNivel: 5, costeBase: 20, incremento: 15
  },
  coraza: {
    nombre: 'Coraza',
    descripcion: '+1 de armadura, en toda partida futura',
    campo: 'armadura', tipo: 'suma', valor: 1,
    maxNivel: 5, costeBase: 25, incremento: 20
  },
  codicia: {
    nombre: 'Codicia',
    descripcion: '+5% de radio de recogida, en toda partida futura',
    campo: 'radioRecogida', tipo: 'factor', valor: 0.05,
    maxNivel: 5, costeBase: 15, incremento: 10
  },
  furia: {
    nombre: 'Furia',
    descripcion: '+3% de daño, en toda partida futura',
    campo: 'bonusDanyo', tipo: 'suma', valor: 0.03,
    maxNivel: 5, costeBase: 30, incremento: 25
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
    maxNivel: 5, costeBase: 30, incremento: 25
  },
  onda: {
    nombre: 'Onda expansiva',
    descripcion: '+2% de área de efecto, en toda partida futura',
    campo: 'bonusArea', tipo: 'suma', valor: 0.02,
    maxNivel: 5, costeBase: 25, incremento: 20
  },
  panacea: {
    nombre: 'Panacea',
    descripcion: '+0.15 de vida por segundo, en toda partida futura',
    campo: 'regeneracion', tipo: 'suma', valor: 0.15,
    maxNivel: 5, costeBase: 35, incremento: 30
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
    maxNivel: 5, costeBase: 40, incremento: 35
  },

  // RESURRECCIÓN: una vida extra por nivel. Al caer se gasta una y vuelves en
  // el sitio a media vida, sin esperar a nadie.
  //
  // ES EL MÁS CARO CON DIFERENCIA, y no por capricho: cinco niveles son cinco
  // vidas extra, y eso es exactamente la clase de cosa que puede volver la
  // partida imposible de perder en los primeros quince minutos. Subirlo entero
  // cuesta 900 denarios —muchas partidas—, así que llega tarde y como
  // recompensa de largo plazo. Aun así es el número que más conviene mirar la
  // primera vez que se juegue con él: si sobra, se recorta aquí y ya está.
  faroDeLaMuerte: {
    nombre: 'Moneda de Caronte',
    descripcion: 'Una vida extra por nivel: vuelves a media vida donde caíste',
    campo: 'resurreccionesMax', tipo: 'suma', valor: 1,
    maxNivel: 5, costeBase: 60, incremento: 60
  }
};
