// EL PROGRESO, EN UN TEXTO QUE SE PUEDE LLEVAR A OTRO SITIO.
//
// POR QUÉ EXISTE. Lo que has conseguido —denarios, potenciadores, mascotas,
// tiempos— vive en el `localStorage` del navegador, y eso significa por DOMINIO
// y por máquina. Consecuencia que ya está pasando hoy: lo que juegas en
// github.io y lo que juegas en itch.io son dos partidas distintas, en el mismo
// ordenador y en el mismo navegador. Y cambiar de portátil es empezar de cero.
//
// Esto convierte un hueco de partida en unos cientos de caracteres y al revés.
// Sobre eso se monta todo lo demás:
//
//   - El código para llevártelo a mano, que no necesita servidor ninguno.
//   - Y la copia en la nube, que manda exactamente este mismo texto.
//
// Si algún día el servidor deja de existir, el código sigue funcionando: es la
// razón de que esta pieza esté separada y no dentro del cliente de red.
//
// NO ES SEGURIDAD, ES TRANSPORTE. Cualquiera puede abrir el código, cambiar un
// número y volver a pegarlo. No se intenta impedir —en un juego de un jugador,
// hacer trampas es asunto de quien juega— pero sí se comprueba que el texto no
// venga ROTO, que es otra cosa: un código cortado al copiarlo tiene que dar un
// mensaje claro y no un progreso a medias.

// La versión del formato. Va delante y sirve para lo mismo que en los códigos
// de red: poder cambiar lo que se guarda sin que un código viejo se lea al
// revés y destroce una partida.
const VERSION = 'P1';

// --- Base64 sin los caracteres que rompen una URL ---------------------------
//
// Es el mismo truco que `js/red/codigo.js` y NO se comparte a propósito: aquel
// vive y muere con la negociación de WebRTC, este viaja por WhatsApp y por la
// barra de direcciones. Son seis líneas; acoplar dos cosas que cambian por
// motivos distintos sale más caro que repetirlas.
function aBase64(texto) {
  const bytes = new TextEncoder().encode(texto);
  let crudo = '';
  for (let i = 0; i < bytes.length; i++) crudo += String.fromCharCode(bytes[i]);
  return btoa(crudo).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deBase64(codigo) {
  const normal = String(codigo).replace(/-/g, '+').replace(/_/g, '/');
  const crudo = atob(normal);
  const bytes = new Uint8Array(crudo.length);
  for (let i = 0; i < crudo.length; i++) bytes[i] = crudo.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// --- Comprobación de integridad ---------------------------------------------
//
// Una suma de 32 bits del contenido, en hexadecimal, delante del texto. No
// protege de nada —quien quiera tocar el código puede recalcularla— y no es
// para eso: es para distinguir "esto no es un código de Emerita" de "esto es un
// código de Emerita al que le falta el final", que son dos avisos distintos
// para la persona que lo está pegando.
function suma(texto) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h = Math.imul(h ^ texto.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// --- Qué se lleva ------------------------------------------------------------
//
// SOLO LO QUE SE HA GANADO. Nada de la partida en curso: ni la semilla, ni la
// oleada, ni dónde estaba nadie. Eso es estado de simulación y no sobrevive a
// cerrar el juego ni aquí ni en ninguna parte (ver la regla del proyecto sobre
// `localStorage`); lo que viaja es la hoja de servicios.
//
// Los nombres se acortan a una letra porque esto va en un mensaje y cada
// carácter cuenta: con nombres largos, el código pasa de 300 a 500 y deja de
// caber cómodo. La correspondencia está aquí y en ningún otro sitio.
const CAMPOS = [
  ['d', 'denarios'],
  ['p', 'partidas'],
  ['t', 'tiempoTotal'],
  ['m', 'mejorTiempo'],
  ['q', 'mascotaEquipada']
];
const MAPAS = [
  ['P', 'potenciadores'],
  ['M', 'mascotas'],
  ['F', 'fases'],
  ['J', 'personajes']
];

export function serializar(meta) {
  const fuera = {};
  for (const [corto, largo] of CAMPOS) {
    const v = meta[largo];
    if (v !== undefined && v !== null && v !== '' && v !== 0) fuera[corto] = v;
  }
  for (const [corto, largo] of MAPAS) {
    const m = meta[largo];
    if (!m || typeof m !== 'object') continue;
    const recorte = {};
    // LOS CEROS Y LOS FALSOS NO VIAJAN. Un potenciador a nivel cero es lo mismo
    // que no tenerlo, y un personaje bloqueado es el estado por defecto: quitar
    // todo eso deja el código en la mitad sin perder nada.
    for (const k in m) if (m[k]) recorte[k] = m[k] === true ? 1 : m[k];
    if (Object.keys(recorte).length > 0) fuera[corto] = recorte;
  }
  return fuera;
}

// De un progreso a su código. `sello` es el momento en que se hizo, en segundos,
// y sirve para desempatar y para poder decir "esta copia es de hace dos días".
export function aCodigo(meta, sello) {
  const cuerpo = JSON.stringify({ v: 1, s: sello | 0, d: serializar(meta) });
  return VERSION + suma(cuerpo) + aBase64(cuerpo);
}

// Y al revés. Devuelve `{ ok: false, motivo }` en vez de lanzar: quien llama es
// una pantalla, y lo que necesita es una frase que enseñar.
export function deCodigo(codigo) {
  const limpio = String(codigo || '').trim().replace(/\s+/g, '');
  if (!limpio) return { ok: false, motivo: 'No has pegado nada.' };
  if (limpio.slice(0, 2) !== VERSION) {
    return { ok: false, motivo: 'Esto no es un código de progreso de Emerita.' };
  }
  const firma = limpio.slice(2, 10);
  let cuerpo;
  try { cuerpo = deBase64(limpio.slice(10)); }
  catch { return { ok: false, motivo: 'El código está incompleto o cortado al copiar.' }; }
  if (suma(cuerpo) !== firma) {
    return { ok: false, motivo: 'El código está incompleto o cortado al copiar.' };
  }
  let datos;
  try { datos = JSON.parse(cuerpo); }
  catch { return { ok: false, motivo: 'El código está incompleto o cortado al copiar.' }; }
  if (!datos || typeof datos.d !== 'object') {
    return { ok: false, motivo: 'Ese código no lleva ningún progreso dentro.' };
  }

  // Se devuelve con los nombres largos, que es lo que entiende `MetaProgreso`.
  const meta = {};
  for (const [corto, largo] of CAMPOS) if (datos.d[corto] !== undefined) meta[largo] = datos.d[corto];
  for (const [corto, largo] of MAPAS) if (datos.d[corto] !== undefined) meta[largo] = datos.d[corto];
  return { ok: true, meta, sello: datos.s | 0 };
}

// --- Cuál de los dos progresos gana -----------------------------------------
//
// El caso de verdad: juegas en el sobremesa, luego en el portátil sin
// sincronizar, y hay dos progresos distintos. Alguien tiene que perder.
//
// NO SE DECIDE POR LA HORA, y esto importa. El reloj de una máquina puede ir
// mal, puede estar en otra zona horaria, y un ordenador recién formateado se
// cree que estamos en 2016: con "gana el más reciente", una máquina con la hora
// adelantada machaca una partida buena para siempre.
//
// Se decide por LO QUE SOLO PUEDE CRECER: el tiempo jugado. No se puede
// devolver, no se puede gastar y no depende de ningún reloj de pared — sale de
// sumar partidas. Los denarios NO valen para esto, aunque parezca lo natural:
// se gastan en la tienda, así que quien más ha jugado puede tener menos.
//
// Empates: más partidas, y si también empatan, se queda lo que ya había. Que
// ante la duda no se toque nada es la respuesta correcta cuando lo que está en
// juego son veinte horas de otra persona.
export function comparar(mio, suyo) {
  if (!suyo) return 'mio';
  if (!mio) return 'suyo';
  const t1 = +mio.tiempoTotal || 0, t2 = +suyo.tiempoTotal || 0;
  if (t2 > t1) return 'suyo';
  if (t1 > t2) return 'mio';
  const p1 = mio.partidas | 0, p2 = suyo.partidas | 0;
  if (p2 > p1) return 'suyo';
  return 'mio';
}

// --- LOS TRES HUECOS DE GOLPE, que es lo que va a la nube --------------------
//
// UN CÓDIGO POR JUGADOR, NO POR PARTIDA. El código de arriba lleva un hueco y
// sirve para pasarle UNA partida a alguien; pero para llevarte lo tuyo a otro
// ordenador, un código por hueco significa cargar con tres, y eso no lo hace
// nadie. Así que lo que se sincroniza es el jugador entero.
//
// Cabe de sobra: un hueco lleno son 274 caracteres, tres son unos 800, y el tope
// del servidor está en 2048.
export function empaquetar(huecos) {
  const dentro = {};
  for (let i = 0; i < huecos.length; i++) {
    if (huecos[i]) dentro[i] = serializar(huecos[i]);
  }
  return VERSION + 'H' + aBase64(JSON.stringify({ v: 1, h: dentro }));
}

export function desempaquetar(paquete) {
  const limpio = String(paquete || '').trim().replace(/\s+/g, '');
  if (limpio.slice(0, 3) !== VERSION + 'H') {
    return { ok: false, motivo: 'Eso no es un progreso de Emerita.' };
  }
  let datos;
  try { datos = JSON.parse(deBase64(limpio.slice(3))); }
  catch { return { ok: false, motivo: 'El progreso ha llegado incompleto.' }; }
  if (!datos || typeof datos.h !== 'object') {
    return { ok: false, motivo: 'Ese progreso no lleva ninguna partida dentro.' };
  }
  const huecos = [];
  for (const i in datos.h) {
    const meta = {};
    for (const [corto, largo] of CAMPOS) if (datos.h[i][corto] !== undefined) meta[largo] = datos.h[i][corto];
    for (const [corto, largo] of MAPAS) if (datos.h[i][corto] !== undefined) meta[largo] = datos.h[i][corto];
    huecos[i | 0] = meta;
  }
  return { ok: true, huecos };
}

// LO QUE DECIDE QUIÉN GANA, sumado de los tres huecos.
//
// Es la misma regla que `comparar` —el tiempo jugado, que solo puede crecer— y
// se suma en vez de mirar hueco a hueco porque la nube guarda al jugador, no a
// la partida: dos ordenadores se comparan enteros o no se comparan.
//
// Estos dos números viajan APARTE del progreso, en su propia columna, para que
// el servidor pueda decidir sin aprender a leer el formato. Ver nube/worker.js.
export function pesoDe(huecos) {
  let tiempo = 0, partidas = 0;
  for (let i = 0; i < huecos.length; i++) {
    if (!huecos[i]) continue;
    tiempo += +huecos[i].tiempoTotal || 0;
    partidas += huecos[i].partidas | 0;
  }
  return { tiempo, partidas };
}

// Una frase para enseñar en pantalla antes de pisar nada. Sin esto, "importar"
// es un botón que no dice qué va a pasar.
export function resumir(meta) {
  const horas = Math.floor((+meta.tiempoTotal || 0) / 3600);
  const minutos = Math.floor(((+meta.tiempoTotal || 0) % 3600) / 60);
  const tiempo = horas > 0 ? `${horas} h ${minutos} min` : `${minutos} min`;
  const mejor = Math.floor((+meta.mejorTiempo || 0) / 60);
  return `${meta.partidas | 0} partidas · ${tiempo} jugados · ` +
         `${meta.denarios | 0} denarios · mejor marca ${mejor} min`;
}
