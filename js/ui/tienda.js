import { FUENTE } from './capa.js';
import { Tema } from './tema.js';
import { MetaProgreso } from '../core/metaProgreso.js';
import { Recursos } from '../core/recursos.js';
import { POTENCIADORES } from '../datos/potenciadores.js';
import { MASCOTAS, ORDEN_MASCOTAS, MAX_NIVEL_MASCOTA } from '../datos/mascotas.js';
import { PERSONAJES, ORDEN_PERSONAJES } from '../datos/personajes.js';
import { ARMAS } from '../datos/armas.js';
import { dibujarIconoPasivo } from './hud.js';
import {
  rejilla, armazon, resalte, puntos, descripcion,
  MARGEN, X_ICONO, X_NOMBRE, X_NIVEL, X_EFECTO, X_VALOR, RADIO_PUNTO
} from './tabla.js';

// TIENDA. Se abre desde el menú principal y no desde dentro de la partida: son
// compras para SIEMPRE (progreso META, ver core/metaProgreso.js), así que tienen
// su sitio antes de jugar, no como un menú más de los que ya interrumpen una
// partida en marcha.
//
// TRES SECCIONES, que son las que pidió Sergio: POTENCIADORES, MASCOTAS y
// JUGADORES. Una sola tienda con secciones y no tres entradas del menú porque
// se pagan con los mismos denarios y se miran en el mismo momento: separarlas
// obligaría a salir de una para ver cuánto queda para lo de la otra.
//
// A PANTALLA COMPLETA, sobre la ilustración del título. El armazón —fondo,
// velo, cabecera, columnas y resalte— lo pone ui/tabla.js, que es el mismo que
// usa la pantalla de configuración: aquí solo quedan las filas.

const IDS = Object.keys(POTENCIADORES);

const COLOR_DENARIO = '#e8b73a';
const COLOR_MAX = '#7fd68a';
const COLOR_ICONO = '#9fd0e8';

const NOMBRES = ['POTENCIADORES', 'MASCOTAS', 'JUGADORES'];

// --- Piezas sueltas -----------------------------------------------------------

// Precio, "AL MÁXIMO" o "TUYO", siempre pegado al borde derecho. En apagado
// cuando no llega el dinero: se ve lo que cuesta y se ve que hoy no.
function precio(ctx, y, coste, textoLleno) {
  const t = Tema.actual;
  ctx.textAlign = 'right';
  if (coste < 0) {
    ctx.font = `600 11px ${FUENTE}`;
    ctx.fillStyle = COLOR_MAX;
    ctx.fillText(textoLleno, X_VALOR, y);
    return;
  }
  ctx.font = `700 13px ${FUENTE}`;
  ctx.fillStyle = MetaProgreso.denarios >= coste ? COLOR_DENARIO : t.apagado;
  ctx.fillText(String(coste), X_VALOR, y);
}

// Retrato de menú de una mascota, encajado en su hueco.
//
// Usa el RETRATO (`mascota<Id>Ficha`, ver el catálogo de
// herramientas/procesar-assets.ps1) y no el sprite que corre por el mundo. Son
// dos dibujos del mismo bicho a dos tamaños distintos porque sirven para dos
// cosas distintas: en el mundo hace falta un bicho de once unidades de alto y
// animado, y aquí hace falta reconocerlo y que se vea bien. Aquí no hay nada
// que animar.
//
// CON SUAVIZADO, al revés que el arte del mundo, y es el mismo criterio que el
// retrato de los personajes: el retrato viene a 160 píxeles de alto y el hueco
// pide unos 136, así que siempre se REDUCE. Reducir a vecino más próximo por un
// factor roto tira filas enteras de píxeles, que era exactamente lo que le
// pasaba al conejo cuando esto reutilizaba el sprite de once unidades.
//
// El hueco es más ancho que alto a propósito: Escipión la Tortuga es casi el
// doble de ancha que alta, y encajarla en un cuadrado la dejaba diminuta al
// lado del resto para no salirse por los lados.
function retrato(ctx, id, cx, cy, ancho, alto) {
  const idAtlas = 'mascota' + id.charAt(0).toUpperCase() + id.slice(1) + 'Ficha';
  const meta = Recursos.meta(idAtlas);
  const img = Recursos.imagen(idAtlas);
  if (!meta || !img) return false;
  const esc = Math.min(ancho / meta.w, alto / meta.h);
  const w = meta.w * esc;
  const h = meta.h * esc;
  ctx.drawImage(img, 0, 0, meta.w, meta.h, cx - w / 2, cy - h / 2, w, h);
  return true;
}

// Los dos potenciadores que NO tienen equivalente entre los pasivos de partida
// —Égida y Moneda de Caronte son mecánicas nuevas— se dibujan a mano. El resto
// reutiliza el icono de su pasivo gemelo (ver `icono` en datos/potenciadores.js).
function glifoEgida(ctx, cx, cy, r) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.9);
  ctx.lineTo(cx + r * 0.78, cy - r * 0.52);
  ctx.lineTo(cx + r * 0.78, cy + r * 0.12);
  ctx.quadraticCurveTo(cx + r * 0.62, cy + r * 0.78, cx, cy + r * 0.98);
  ctx.quadraticCurveTo(cx - r * 0.62, cy + r * 0.78, cx - r * 0.78, cy + r * 0.12);
  ctx.lineTo(cx - r * 0.78, cy - r * 0.52);
  ctx.closePath();
  ctx.fillStyle = COLOR_ICONO;
  ctx.fill();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = 'rgba(8,10,14,.75)';
  ctx.stroke();
  // Banda horizontal: sin ella el escudo se lee como una gota.
  ctx.fillStyle = 'rgba(8,10,14,.5)';
  ctx.fillRect(cx - r * 0.78, cy - r * 0.16, r * 1.56, r * 0.26);
}

function glifoObolo(ctx, cx, cy, r) {
  // Moneda de HUESO, no de oro: al lado del contador de denarios, que es
  // dorado, una moneda dorada más sería otra cosa que cuesta dinero y no lo
  // que se compra.
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.85, 0, Math.PI * 2);
  ctx.fillStyle = '#d8d2bd';
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = 'rgba(8,10,14,.7)';
  ctx.stroke();

  // Un busto acuñado —cabeza y hombros—, que es lo que tiene una moneda y lo
  // que la hace reconocible a 28 píxeles. Antes llevaba una cruz aspada y a
  // este tamaño se leía como el aspa de "cancelar", justo lo contrario de lo
  // que hace: dar una vida de más.
  ctx.fillStyle = 'rgba(8,10,14,.68)';
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.16, r * 0.24, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy + r * 0.62, r * 0.44, Math.PI * 1.12, Math.PI * 1.88);
  ctx.fill();
}

function iconoPotenciador(ctx, id, def, cx, cy, r) {
  if (def.icono) return dibujarIconoPasivo(ctx, cx, cy, r, def.icono, COLOR_ICONO);
  if (id === 'faroDeLaMuerte') return glifoObolo(ctx, cx, cy, r);
  glifoEgida(ctx, cx, cy, r);
}

// Lo que cambia un personaje respecto al patrón, sacado de sus `mods`. Se deriva
// aquí en vez de guardarse en datos/personajes.js para que no haya dos verdades:
// el número que se enseña ES el que se aplica.
function efectoDePersonaje(def) {
  const m = def.mods || {};
  const partes = [];
  const pct = (v) => (v > 1 ? '+' : '') + Math.round((v - 1) * 100) + '%';
  if (m.vidaMaxima && m.vidaMaxima !== 1) partes.push(pct(m.vidaMaxima) + ' vida');
  if (m.velocidad && m.velocidad !== 1) partes.push(pct(m.velocidad) + ' velocidad');
  if (m.radioRecogida && m.radioRecogida !== 1) partes.push(pct(m.radioRecogida) + ' recogida');
  return partes.length ? partes.join('   ·   ') : 'Equilibrado en todo';
}

// --- Armazón: fondo, secciones, cabecera de tabla y pie ----------------------

// --- Reparto ------------------------------------------------------------------

export function dibujarTienda(ctxMundo, ctx, cursor, seccion) {
  const nFilas = seccion === 1 ? ORDEN_MASCOTAS.length
               : seccion === 2 ? ORDEN_PERSONAJES.length
               : IDS.length;
  const altoMax = seccion === 1 ? ALTO_MASCOTA
                : seccion === 2 ? ALTO_PERSONAJE
                : ALTO_POTENCIADOR;
  const r = rejilla(nFilas, altoMax);

  ctx.save();
  armazon(ctxMundo, ctx, r, NOMBRES, seccion, ['OBJETO', 'NIVEL', 'EFECTO', 'PRECIO']);
  if (seccion === 1) filasMascotas(ctx, cursor, r);
  else if (seccion === 2) filasPersonajes(ctx, cursor, r);
  else filasPotenciadores(ctx, cursor, r);
  ctx.restore();
}

// --- Potenciadores ------------------------------------------------------------
const ALTO_POTENCIADOR = 36;

function filasPotenciadores(ctx, cursor, r) {
  const t = Tema.actual;
  const radio = Math.min(14, r.alto * 0.4);
  for (let i = 0; i < IDS.length; i++) {
    const id = IDS[i];
    const def = POTENCIADORES[id];
    const nivel = MetaProgreso.nivelPotenciador(id);
    const coste = MetaProgreso.costePotenciador(id);
    const elegida = i === cursor;
    const y = r.filas + i * r.alto;
    const yc = y + r.alto / 2 - 2;

    if (elegida) resalte(ctx, y, r.alto);

    iconoPotenciador(ctx, id, def, X_ICONO, yc, radio);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `600 13px ${FUENTE}`;
    ctx.fillStyle = elegida ? '#ffffff' : t.titulo;
    ctx.fillText(def.nombre, X_NOMBRE, yc);

    puntos(ctx, X_NIVEL + RADIO_PUNTO, yc, nivel, def.maxNivel, elegida);

    ctx.font = `500 11px ${FUENTE}`;
    ctx.fillStyle = nivel > 0 ? t.titulo : t.texto;
    // Lo que da CADA nivel, y al lado lo que llevas acumulado. Sin el acumulado
    // no hay forma de saber si los cuatro niveles que ya pagaste hacen algo.
    ctx.fillText(def.efecto + (nivel > 0 ? `   (llevas ${nivel} de ${def.maxNivel})` : ''),
                 X_EFECTO, yc);

    precio(ctx, yc, coste, 'AL MÁXIMO');
  }

  descripcion(ctx, r, POTENCIADORES[IDS[cursor]].descripcion);
}

// --- Mascotas -----------------------------------------------------------------
//
// El icono es EL MISMO DIBUJO que se ve en la partida, no un símbolo aparte: lo
// que se compra aquí es el bicho que va a ir trotando al lado, y verlo antes de
// pagarlo es medio motivo para comprarlo.
//
// Aquí NO se equipa: cuál lleva cada jugador se decide en su propia pantalla,
// después de elegir personaje, porque en cooperativo son hasta cuatro decisiones
// distintas y esta lista solo tiene sitio para una.
const ALTO_MASCOTA = 44;

function filasMascotas(ctx, cursor, r) {
  const t = Tema.actual;
  const alto = Math.min(34, r.alto * 0.78);
  const ancho = alto * 1.35;
  for (let i = 0; i < ORDEN_MASCOTAS.length; i++) {
    const id = ORDEN_MASCOTAS[i];
    const def = MASCOTAS[id];
    const nivel = MetaProgreso.nivelMascota(id);
    const tiene = nivel > 0;
    const coste = MetaProgreso.costeMascota(id);
    const elegida = i === cursor;
    const y = r.filas + i * r.alto;
    const yc = y + r.alto / 2 - 2;

    if (elegida) resalte(ctx, y, r.alto);

    // Apagada si no la tienes: se ve qué hay a la venta sin que parezca tuya.
    ctx.globalAlpha = tiene ? 1 : 0.4;
    if (!retrato(ctx, id, X_ICONO, yc, ancho, alto)) {
      ctx.beginPath();
      ctx.arc(X_ICONO, yc, alto * 0.38, 0, Math.PI * 2);
      ctx.fillStyle = def.color;
      ctx.fill();
      ctx.fillStyle = 'rgba(12,10,14,.8)';
      ctx.font = `700 13px ${FUENTE}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(def.inicial, X_ICONO, yc + 0.5);
    }
    ctx.globalAlpha = 1;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `600 13px ${FUENTE}`;
    ctx.fillStyle = elegida ? '#ffffff' : (tiene ? t.titulo : t.texto);
    ctx.fillText(def.nombre, X_NOMBRE, yc);

    puntos(ctx, X_NIVEL + RADIO_PUNTO, yc, nivel, MAX_NIVEL_MASCOTA, elegida);

    ctx.font = `500 11px ${FUENTE}`;
    ctx.fillStyle = tiene ? t.titulo : t.texto;
    ctx.fillText(def.efecto, X_EFECTO, yc);

    precio(ctx, yc, coste, 'AL MÁXIMO');
  }

  const id = ORDEN_MASCOTAS[cursor];
  descripcion(ctx, r, MASCOTAS[id].descripcion);
}

// --- Jugadores ----------------------------------------------------------------
//
// Hoy los cuatro salen como "TUYO" porque están todos a coste 0 (ver `coste` en
// datos/personajes.js): fue una decisión de Sergio no ponerles precio a
// personajes con los que sus hijas ya juegan. La sección existe montada y
// funcionando, así que convertir cualquiera en comprable es subirle el número en
// los datos y nada más.
const ALTO_PERSONAJE = 58;

function filasPersonajes(ctx, cursor, r) {
  const t = Tema.actual;
  const radio = Math.min(22, r.alto * 0.38);
  for (let i = 0; i < ORDEN_PERSONAJES.length; i++) {
    const id = ORDEN_PERSONAJES[i];
    const def = PERSONAJES[id];
    const tuyo = MetaProgreso.heroeDesbloqueado(id);
    const elegida = i === cursor;
    const y = r.filas + i * r.alto;
    const yc = y + r.alto / 2 - 2;

    if (elegida) resalte(ctx, y, r.alto);

    // El retrato, el mismo que usa su ficha, recortado en círculo.
    ctx.globalAlpha = tuyo ? 1 : 0.4;
    const meta = Recursos.meta(id + 'Cara');
    const img = Recursos.imagen(id + 'Cara');
    if (meta && img) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(X_ICONO, yc, radio, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, 0, 0, meta.w, meta.h,
                    X_ICONO - radio, yc - radio, radio * 2, radio * 2);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(X_ICONO, yc, radio, 0, Math.PI * 2);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = elegida ? t.filo : 'rgba(255,255,255,.2)';
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `600 14px ${FUENTE}`;
    ctx.fillStyle = elegida ? '#ffffff' : (tuyo ? t.titulo : t.texto);
    ctx.fillText(def.nombre, X_NOMBRE, yc - 8);

    // Su arma exclusiva, que es lo que de verdad diferencia a un personaje de
    // otro: los `mods` mueven los números, el arma cambia a qué se juega.
    const arma = ARMAS[def.arma];
    ctx.font = `500 10px ${FUENTE}`;
    ctx.fillStyle = t.apagado;
    ctx.fillText(arma ? 'Arma: ' + arma.nombre : '', X_NOMBRE, yc + 9);

    // Un personaje no tiene niveles: se tiene o no se tiene. Un solo punto.
    puntos(ctx, X_NIVEL + RADIO_PUNTO, yc, tuyo ? 1 : 0, 1, elegida);

    ctx.font = `500 11px ${FUENTE}`;
    ctx.fillStyle = tuyo ? t.titulo : t.texto;
    ctx.fillText(efectoDePersonaje(def), X_EFECTO, yc);

    precio(ctx, yc, tuyo ? -1 : MetaProgreso.costeHeroe(id), 'TUYO');
  }

  const id = ORDEN_PERSONAJES[cursor];
  descripcion(ctx, r, PERSONAJES[id].descripcion);
}
