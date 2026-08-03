// Constantes del motor. La separación lógica/arte vive aquí y en ningún otro sitio.

// El juego calcula SIEMPRE en unidades lógicas. Velocidades, radios, alcances
// y la celda del spatial hash están expresados en esta rejilla.
export const ANCHO_LOGICO = 480;
export const ALTO_LOGICO  = 270;

// El arte está autorizado al doble. Un personaje de 32x32 lógicos es un PNG de
// 64x64. Bajar esto a 1 recupera rendimiento sin recalcular una sola constante
// de balance: es la palanca de la Fase 8 si no se sostienen las 800 entidades.
export const ESCALA_ARTE = 2;

export const ANCHO_FISICO = ANCHO_LOGICO * ESCALA_ARTE;   // 960
export const ALTO_FISICO  = ALTO_LOGICO  * ESCALA_ARTE;   // 540

// Timestep fijo a 60 Hz exactos.
export const DT        = 1 / 60;
export const MAX_PASOS = 5;        // tope por frame: evita la espiral de la muerte

export const TILE = 32;            // lado del tile de suelo, en unidades lógicas
