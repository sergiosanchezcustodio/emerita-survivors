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
  }
};
