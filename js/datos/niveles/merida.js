// Nivel 1 — Emerita Augusta. DATOS PUROS, cero lógica.
// Añadir Cáceres, Trujillo o Alcántara debe ser copiar este archivo y cambiar
// los valores. Si para meter un nivel hay que tocar algo fuera de datos/niveles/,
// el diseño está mal.

export const NIVEL = {
  id: 'merida',
  nombre: 'Emerita Augusta',
  subtitulo: 'Las ruinas del Imperio',
  duracion: 1200,                      // segundos

  // Ocres, arena tostada, piedra caliza, mármol roto, oliva y púrpura imperial.
  paleta: {
    arena:      '#b99b6b',
    arenaOscura:'#a68a5c',
    piedra:     '#8f8271',
    caliza:     '#cbbfa4',
    marmol:     '#e2dccb',
    oliva:      '#4a5138',
    purpura:    '#6d2743',
    cielo:      '#e0a15c'
  },

  // Configuración del suelo toroidal. Mientras no haya tiles pintados,
  // recursos.js los genera con estos parámetros (ver sistema de placeholders).
  suelo: {
    variantes: 4,
    base: 'arena',
    motas: ['arenaOscura', 'piedra', 'caliza'],
    densidadMotas: 42,                 // motas por tile
    grietas: 2                         // trazos de losa por tile
  },

  // --- Pendiente de fases posteriores -------------------------------------
  decoracion: [],                      // Fase 7: columnas, gradas, arcos
  enemigos:   {},                      // Fase 5: referencias al catálogo global
  eventos:    [],                      // Fase 5: el director de oleadas
  jefes:      { intermedio: 'cerbero', final: 'hidra' },
  musica:     { ambiente: null, jefe: null }
};
