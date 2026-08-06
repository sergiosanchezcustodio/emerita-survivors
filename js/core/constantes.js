// Constantes del motor. La separación lógica/arte vive aquí y en ningún otro sitio.

// El juego calcula SIEMPRE en unidades lógicas. Velocidades, radios, alcances
// y la celda del spatial hash están expresados en esta rejilla.
export const ANCHO_LOGICO = 480;
export const ALTO_LOGICO  = 270;

// El arte está autorizado a cuadruplicar la unidad lógica. Un personaje de
// 32x32 lógicos es un PNG de 128x128. Subido de 2 a 3 y de 3 a 4 en la misma
// sesión: primero por detalle (ver el historial), y la segunda vez por encaje
// en pantalla completa. 480×270×4 = 1920×1080, que es EXACTO en el monitor
// más común (zoom entero ×1, sin márgenes) y en 4K (×2); a 3 no encajaba en
// ninguno porque 3 no divide a 4 (1920/480). Bajar esto a 1, 2 o 3 recupera
// rendimiento sin recalcular una sola constante de balance —es la palanca de
// la Fase 8 si no se sostienen las 800 entidades— a cambio de volver a dejar
// margen en pantallas de 1920 de ancho. La interfaz NO depende de esto (ver
// ANCHO_UI/ALTO_UI): cambiar este número solo afecta al arte del mundo.
//
// En portátiles con menos de 1920px de ancho el lienzo (1920×1080) no cabe
// entero: se recorta centrado, sin scroll ni layout roto, pero se ve menos
// mundo que en un monitor de sobremesa. Si eso pesa más que encajar perfecto
// en un monitor grande, esta es la constante a bajar.
export const ESCALA_ARTE = 4;

export const ANCHO_FISICO = ANCHO_LOGICO * ESCALA_ARTE;   // 960
export const ALTO_FISICO  = ALTO_LOGICO  * ESCALA_ARTE;   // 540

// Resolución de referencia de la INTERFAZ (HUD, ficha, menús, pausa), FIJA e
// independiente de ESCALA_ARTE. Antes la interfaz usaba ANCHO_FISICO/ALTO_FISICO
// como su propia rejilla de coordenadas, y como esos dos valores dependen de
// ESCALA_ARTE, subir la resolución del arte del mundo encogía todos los paneles
// a la mitad sin tocar una sola línea de ui/. Con esta rejilla propia, el arte
// puede ganar resolución sin que la interfaz se entere: ui/capa.js corrige la
// proporción entre esta rejilla y el tamaño real en pantalla.
export const ANCHO_UI = 960;
export const ALTO_UI  = 540;

// Timestep fijo a 60 Hz exactos.
export const DT        = 1 / 60;
export const MAX_PASOS = 5;        // tope por frame: evita la espiral de la muerte

export const TILE = 32;            // lado del tile de suelo, en unidades lógicas
