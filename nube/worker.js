// LA COPIA EN LA NUBE DE UNA PARTIDA. Un Worker de Cloudflare y una tabla.
//
// QUÉ RESUELVE. El progreso vive en el `localStorage` del navegador, o sea por
// dominio y por máquina: hoy lo que juegas en github.io y lo que juegas en
// itch.io ya son dos partidas distintas, y cambiar de ordenador es empezar de
// cero. Esto guarda una COPIA para poder seguir donde lo dejaste.
//
// LO QUE NO ES, y conviene tenerlo claro antes de leer una línea:
//
//   - No es una cuenta. No hay correo, ni contraseña, ni registro. La identidad
//     es un código aleatorio que el juego genera solo y guarda en tu navegador.
//     Sin datos personales no hay nada que proteger, nada que recuperar y nada
//     que gestionar.
//   - No es la fuente de la verdad. El juego sigue guardando en su sitio de
//     siempre y esto es una copia. Si el Worker se cae, se borra o se acaba el
//     plan gratuito, se juega exactamente igual que hoy y nadie pierde nada.
//     Esa es la condición que hace honesto ofrecérselo a desconocidos.
//   - No es seguridad. Quien tenga tu código puede leer y escribir tu partida.
//     Por eso el código es de 128 bits: adivinarlo no es una opción, y no se
//     publica en ninguna parte.
//
// LA API, entera:
//
//   GET  /p/<codigo>   devuelve la copia guardada, o 404 si no hay ninguna
//   PUT  /p/<codigo>   guarda una copia   (cuerpo JSON, ver `validar`)
//
// No hay listado y no lo va a haber: solo se puede leer el código exacto que ya
// tienes. Un extremo que permita enumerar convierte "hay que adivinar 128 bits"
// en "hay que pedir la lista".

// El código es lo único que separa una partida de otra, así que se comprueba su
// forma antes de tocar la base de datos. 22 caracteres son los 128 bits que
// genera el juego; se admite hasta 64 por si algún día se alarga.
const FORMA_CODIGO = /^[A-Za-z0-9_-]{22,64}$/;

// Tope del cuerpo. Una partida con todo desbloqueado ronda los 300 caracteres
// (medido: 274 con 37 partidas y 13 horas jugadas), así que 2 KB es diez veces
// lo que hace falta. El tope no es tacañería: es lo que impide que un extremo
// público y anónimo se convierta en el disco duro gratis de otro.
const TOPE_CUERPO = 2048;

// CORS abierto, y es una decisión, no un descuido. El juego se sirve desde tres
// sitios distintos —github.io, el subdominio que le toque a itch.io ese día, y
// localhost mientras se desarrolla— y esa lista cambia sin avisar. Cerrar por
// origen no protegería nada, además: cualquiera puede hablar con esto desde una
// terminal. Lo que protege es el código, no el origen del navegador.
const CABECERAS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
};

function respuesta(objeto, estado = 200) {
  return new Response(JSON.stringify(objeto), {
    status: estado,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CABECERAS }
  });
}

// ¿El cuerpo que llega es una copia de partida con sentido?
//
// Se exporta y se prueba aparte porque es lo único del Worker que tiene lógica:
// el resto es una consulta. Ver herramientas\probar-nube.js.
export function validar(datos) {
  if (!datos || typeof datos !== 'object') return 'El cuerpo no es un objeto.';
  const { cuerpo, tiempo, partidas, sello } = datos;
  if (typeof cuerpo !== 'string' || cuerpo.length === 0) return 'Falta el progreso.';
  if (cuerpo.length > TOPE_CUERPO) return 'El progreso ocupa demasiado.';
  // Se comprueba la MARCA del formato, no el contenido: el Worker no sabe leer
  // un progreso y no tiene por qué. Lo suyo es guardar el texto que le den,
  // igual que un buzón no lee las cartas.
  if (cuerpo.slice(0, 2) !== 'P1') return 'Eso no es un progreso de Emerita.';
  if (!Number.isFinite(tiempo) || tiempo < 0) return 'El tiempo jugado no es un número.';
  if (!Number.isInteger(partidas) || partidas < 0) return 'Las partidas no son un número.';
  if (!Number.isInteger(sello) || sello < 0) return 'El sello no es un número.';
  return '';
}

// EL TIEMPO Y LAS PARTIDAS VIAJAN APARTE, y no es duplicar datos por gusto: son
// lo que decide cuál de dos copias gana, y así el Worker puede decidirlo con
// dos comparaciones de números en vez de aprender a leer el formato del juego.
// El día que el formato cambie, esto no se entera.
//
// Y se decide en el SERVIDOR además de en el cliente, que es lo que protege del
// caso feo de verdad: un ordenador que llevaba semanas sin abrirse sincroniza su
// partida vieja y se lleva por delante la buena. Con esto, subir algo peor no
// hace nada. `?forzar=1` se salta la regla, para cuando de verdad quieras que
// mande lo que tienes aquí.
const GUARDAR = `
  INSERT INTO partidas (codigo, cuerpo, tiempo, partidas, sello, actualizado)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6)
  ON CONFLICT(codigo) DO UPDATE SET
    cuerpo = excluded.cuerpo, tiempo = excluded.tiempo,
    partidas = excluded.partidas, sello = excluded.sello,
    actualizado = excluded.actualizado
  WHERE excluded.tiempo > partidas.tiempo
     OR (excluded.tiempo = partidas.tiempo AND excluded.partidas > partidas.partidas)`;

const GUARDAR_FORZADO = `
  INSERT INTO partidas (codigo, cuerpo, tiempo, partidas, sello, actualizado)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6)
  ON CONFLICT(codigo) DO UPDATE SET
    cuerpo = excluded.cuerpo, tiempo = excluded.tiempo,
    partidas = excluded.partidas, sello = excluded.sello,
    actualizado = excluded.actualizado`;

export default {
  async fetch(peticion, entorno) {
    if (peticion.method === 'OPTIONS') return new Response(null, { headers: CABECERAS });

    const url = new URL(peticion.url);
    const trozos = url.pathname.split('/').filter(Boolean);
    if (trozos.length !== 2 || trozos[0] !== 'p') {
      return respuesta({ error: 'Ruta desconocida.' }, 404);
    }
    const codigo = trozos[1];
    if (!FORMA_CODIGO.test(codigo)) {
      return respuesta({ error: 'Ese código no tiene la forma de un código de partida.' }, 400);
    }

    if (peticion.method === 'GET') {
      const fila = await entorno.DB.prepare(
        'SELECT cuerpo, tiempo, partidas, sello, actualizado FROM partidas WHERE codigo = ?1'
      ).bind(codigo).first();
      if (!fila) return respuesta({ error: 'No hay ninguna copia con ese código.' }, 404);
      return respuesta(fila);
    }

    if (peticion.method === 'PUT') {
      let datos;
      try { datos = await peticion.json(); }
      catch { return respuesta({ error: 'El cuerpo no es JSON.' }, 400); }
      const mal = validar(datos);
      if (mal) return respuesta({ error: mal }, 400);

      const forzar = url.searchParams.get('forzar') === '1';
      const ahora = Math.floor(Date.now() / 1000);
      const r = await entorno.DB.prepare(forzar ? GUARDAR_FORZADO : GUARDAR)
        .bind(codigo, datos.cuerpo, datos.tiempo, datos.partidas, datos.sello, ahora)
        .run();

      // `changes` a cero significa que la regla ha rechazado el guardado: lo que
      // hay arriba es mejor que lo que se manda. NO es un error —el juego lo
      // usará para quedarse con lo de la nube— así que se contesta 200 con la
      // verdad, y no un 409 que cualquier cliente trataría como avería.
      const guardado = (r.meta && r.meta.changes) > 0;
      return respuesta({ guardado, motivo: guardado ? '' : 'Hay una copia con más juego encima.' });
    }

    return respuesta({ error: 'Solo GET y PUT.' }, 405);
  }
};
