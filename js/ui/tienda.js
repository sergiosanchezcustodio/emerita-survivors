import { FUENTE } from './capa.js';
import { Tema } from './tema.js';
import { MetaProgreso } from '../core/metaProgreso.js';
import { Recursos } from '../core/recursos.js';
import { POTENCIADORES } from '../datos/potenciadores.js';
import { MASCOTAS, ORDEN_MASCOTAS, MAX_NIVEL_MASCOTA, factorMascota } from '../datos/mascotas.js';
import { PERSONAJES, ORDEN_PERSONAJES } from '../datos/personajes.js';
import { ARMAS } from '../datos/armas.js';
import { dibujarIconoArma } from './hud.js';
import {
  rejilla, armazon, resalte, puntos, descripcion, nombreFila,
  MARGEN, X_ICONO, X_NOMBRE, X_ARMA, X_NIVEL, X_EFECTO, X_VALOR, RADIO_PUNTO
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

const NOMBRES = ['POTENCIADORES', 'MASCOTAS', 'JUGADORES'];

// --- Piezas sueltas -----------------------------------------------------------

// LO QUE LLEVAS Y LO QUE DARÍA EL SIGUIENTE NIVEL, que es lo que pidió Sergio
// para esta columna. Antes decía siempre lo que da UN nivel —"+4% vida
// máxima"— y con eso, llevando tres comprados, no había forma de saber ni lo
// que tenías ni si merecía la pena el cuarto sin hacer la multiplicación de
// cabeza.
//
// Sin comprar todavía sale una sola cifra: no hay nada acumulado, y un "0 → +4%"
// es una resta que no hace falta. Al máximo también sale una sola, porque no hay
// siguiente.
//
// Los números salen del `valor` de verdad del catálogo, no de una frase escrita
// al lado (ver la cabecera de datos/potenciadores.js): así no pueden decir una
// cosa distinta de la que se aplica.
// Precisión por tamaño y coma decimal, que es como se escriben los números en
// el resto del juego: a partir de diez, los decimales no dicen nada y estorban
// —"+68%" se lee y "+67,5%" se descifra—; por debajo son justo lo que hay que
// ver, porque la Panacea da 0,15 de vida por segundo y redondearlo a 0,2 sería
// enseñar un número que el juego no aplica.
function cifra(v, unidad, signo, enteros) {
  let n;
  if (enteros || Math.abs(v) >= 10) n = Math.round(v);
  else n = Math.round(v * 100) / 100;
  return (signo || '+') + String(n).replace('.', ',') + unidad;
}

function efectoEscalonado(porNivel, nivel, maximo, unidad, concepto, signo, enteros) {
  const ahora = cifra(porNivel * Math.max(1, nivel), unidad, signo, enteros);
  if (nivel === 0 || nivel >= maximo) return `${ahora} ${concepto}`;
  return `${ahora} → ${cifra(porNivel * (nivel + 1), unidad, signo, enteros)} ${concepto}`;
}

// Un potenciador crece en línea recta: cada nivel suma otro `valor`.
function efectoPotenciador(def, nivel) {
  return efectoEscalonado(def.valor * def.escala, nivel, def.maxNivel,
                          def.unidad, def.concepto, def.signo, false);
}

// Una mascota no: su número base se multiplica por `factorMascota`, que va de 1
// al nivel 1 hasta 2 al nivel 5. Por eso aquí se calculan los dos extremos en
// vez de multiplicar por el nivel.
function efectoMascota(def, nivel) {
  const base = def[def.campoEfecto] * def.escala;
  const ahora = cifra(base * factorMascota(Math.max(1, nivel)),
                      def.unidad, def.signo, def.enteros);
  if (nivel === 0 || nivel >= MAX_NIVEL_MASCOTA) return `${ahora} ${def.concepto}`;
  const luego = cifra(base * factorMascota(nivel + 1), def.unidad, def.signo, def.enteros);
  return `${ahora} → ${luego} ${def.concepto}`;
}


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

// El icono de un potenciador: su dibujo del atlas, encajado en el hueco.
//
// Los diez tienen el suyo (ver `arte` en datos/potenciadores.js), así que aquí
// ya no hay casos: antes esto repartía entre dibujo propio, icono del pasivo
// gemelo y dos glifos trazados a mano, y de eso no queda nada.
//
// Si el atlas no trae el dibujo se deja un disco apagado. No es un repliegue de
// verdad —significa que la herramienta no se ha ejecutado— pero deja la columna
// ocupada en vez de con un hueco que parezca un fallo del juego.
function iconoPotenciador(ctx, def, cx, cy, r) {
  const meta = def.arte ? Recursos.meta(def.arte) : null;
  const img = def.arte ? Recursos.imagen(def.arte) : null;
  if (meta && img) {
    const esc = Math.min(r * 2 / meta.w, r * 2 / meta.h);
    const w = meta.w * esc;
    const h = meta.h * esc;
    ctx.drawImage(img, 0, 0, meta.w, meta.h, cx - w / 2, cy - h / 2, w, h);
    return;
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(159,208,232,.25)';
  ctx.fill();
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
  // La pestaña de JUGADORES lleva una columna más —el arma con la que empieza
  // cada uno— y por eso los rótulos no son los mismos en las tres. En las otras
  // dos ese hueco no tiene nada que enseñar: un potenciador o una mascota no
  // traen arma.
  armazon(ctxMundo, ctx, r, NOMBRES, seccion,
          seccion === 2 ? ['OBJETO', 'NIVEL', 'EFECTO', 'PRECIO', 'ARMA']
                        : ['OBJETO', 'NIVEL', 'EFECTO', 'PRECIO']);
  if (seccion === 1) filasMascotas(ctx, cursor, r);
  else if (seccion === 2) filasPersonajes(ctx, cursor, r);
  else filasPotenciadores(ctx, cursor, r);
  ctx.restore();
}

// --- Potenciadores ------------------------------------------------------------
const ALTO_POTENCIADOR = 36;

function filasPotenciadores(ctx, cursor, r) {
  const t = Tema.actual;
  // 17 y no 14: los dibujos de Sergio traen detalle -el laurel del ánfora, el
  // SPQR de la lorica- y a 28 unidades se perdía. La fila mide 36, así que
  // caben 34 sin tocar la de al lado.
  const radio = Math.min(17, r.alto * 0.47);
  for (let i = 0; i < IDS.length; i++) {
    const id = IDS[i];
    const def = POTENCIADORES[id];
    const nivel = MetaProgreso.nivelPotenciador(id);
    const coste = MetaProgreso.costePotenciador(id);
    const elegida = i === cursor;
    const y = r.filas + i * r.alto;
    const yc = y + r.alto / 2 - 2;

    if (elegida) resalte(ctx, y, r.alto);

    iconoPotenciador(ctx, def, X_ICONO, yc, radio);

    nombreFila(ctx, def.nombre, X_NOMBRE, yc, elegida ? '#ffffff' : t.titulo);

    puntos(ctx, X_NIVEL + RADIO_PUNTO, yc, nivel, def.maxNivel, elegida);

    ctx.textAlign = 'left';
    ctx.font = `600 11px ${FUENTE}`;
    ctx.fillStyle = nivel > 0 ? t.titulo : t.texto;
    ctx.fillText(efectoPotenciador(def, nivel), X_EFECTO, yc);

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

    nombreFila(ctx, def.nombre, X_NOMBRE, yc,
               elegida ? '#ffffff' : (tiene ? t.titulo : t.texto));

    puntos(ctx, X_NIVEL + RADIO_PUNTO, yc, nivel, MAX_NIVEL_MASCOTA, elegida);

    ctx.textAlign = 'left';
    ctx.font = `600 11px ${FUENTE}`;
    ctx.fillStyle = tiene ? t.titulo : t.texto;
    ctx.fillText(efectoMascota(def, nivel), X_EFECTO, yc);

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
// Lado del cuadro blanco del arma. 30 en una fila de 58: deja 14 de aire arriba
// y abajo, y el icono de 26 que va dentro cruza el umbral de la hoja grande.
const LADO_ARMA = 30;

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
    // `def.sprite` y no `id`: un héroe con dibujo prestado no tiene retrato
    // propio todavía (ver `provisional` en datos/personajes.js).
    const meta = Recursos.meta(def.sprite + 'Cara');
    const img = Recursos.imagen(def.sprite + 'Cara');
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

    // El nombre, ya CENTRADO en su fila. Estaba subido 8 para dejarle sitio
    // debajo al renglón "Arma: ..." en letra pequeña, y ese renglón se ha ido a
    // su propia columna: un dato con rótulo en la cabecera se compara entre las
    // cuatro filas de un vistazo, y colgado bajo el nombre había que leerlo
    // cuatro veces.
    nombreFila(ctx, def.nombre, X_NOMBRE, yc,
               elegida ? '#ffffff' : (tuyo ? t.titulo : t.texto));

    // COLUMNA DE ARMA: el dibujo y el nombre. Es lo que de verdad diferencia a
    // un personaje de otro —los `mods` mueven los números, el arma cambia a qué
    // se juega—, así que se enseña con su icono y no solo con su nombre: es el
    // mismo dibujo que se va a ver luego en la ficha y en el menú de subida de
    // nivel, sobre el mismo fondo blanco.
    const arma = ARMAS[def.arma];
    if (arma) {
      ctx.globalAlpha = tuyo ? 1 : 0.4;
      ctx.beginPath();
      ctx.roundRect(X_ARMA, yc - LADO_ARMA / 2, LADO_ARMA, LADO_ARMA, 4);
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = elegida ? t.filo : 'rgba(255,255,255,.22)';
      ctx.stroke();
      // 13 de radio: por encima del umbral de la hoja grande (ver blitHoja en
      // ui/hud.js), así que el icono sale del arte de 96 reducido y no del de
      // 32 ampliado, que es lo que se veía roto.
      dibujarIconoArma(ctx, X_ARMA + LADO_ARMA / 2, yc, 13, def.arma, arma.color);

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `600 11px ${FUENTE}`;
      ctx.fillStyle = tuyo ? t.titulo : t.texto;
      ctx.fillText(arma.nombre, X_ARMA + LADO_ARMA + 8, yc);
      ctx.globalAlpha = 1;
    }

    // Un personaje no tiene niveles: se tiene o no se tiene. Un solo punto.
    puntos(ctx, X_NIVEL + RADIO_PUNTO, yc, tuyo ? 1 : 0, 1, elegida);

    ctx.textAlign = 'left';
    ctx.font = `600 11px ${FUENTE}`;
    ctx.fillStyle = tuyo ? t.titulo : t.texto;
    ctx.fillText(efectoDePersonaje(def), X_EFECTO, yc);

    precio(ctx, yc, tuyo ? -1 : MetaProgreso.costeHeroe(id), 'TUYO');
  }

  const id = ORDEN_PERSONAJES[cursor];
  descripcion(ctx, r, PERSONAJES[id].descripcion);
}
