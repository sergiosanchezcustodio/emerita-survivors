// EL WORKER DE LA NUBE, sin desplegarlo.
//
//   node herramientas\probar-nube.js
//
// POR QUÉ EXISTE. Lo que guarda las partidas de otra gente no se prueba en
// producción. Y desplegarlo para cada cambio es lento y necesita cuenta, así
// que aquí se monta el Worker con una base de datos de mentira —un Map con la
// misma regla de guardado que el SQL— y se le hacen las peticiones de verdad,
// con `Request` y `Response` nativos de Node.
//
// LO QUE SE COMPRUEBA es lo que puede costar la partida de alguien:
//
//   1. Que subir algo PEOR no machaque lo bueno. Es el caso feo de verdad: un
//      ordenador que llevaba semanas sin abrirse sincroniza su copia vieja.
//   2. Que un código con mala forma no llegue nunca a la base de datos.
//   3. Que un cuerpo enorme se rechace: un extremo público y anónimo sin tope
//      es el disco duro gratis de otro.

import gestor, { validar, _ajustarFreno } from '../nube/worker.js';

let fallos = 0;
function comprobar(condicion, texto) {
  console.log(`  ${condicion ? 'OK  ' : 'MAL '} ${texto}`);
  if (!condicion) fallos++;
}

// --- La base de datos de mentira --------------------------------------------
//
// Reproduce el `INSERT ... ON CONFLICT DO UPDATE ... WHERE` del Worker. Es la
// única parte que no es el código de verdad, así que la regla se escribe aquí
// UNA vez y se compara con la del SQL leyéndolos en paralelo: si algún día
// dejan de coincidir, esta prueba pasa y el Worker falla. Es su límite conocido.
function baseFalsa() {
  const filas = new Map();
  // github_id -> {codigo, login, actualizado}. Misma tabla de mentira que
  // `partidas`, con su propia regla: ver el `run()` de abajo para por qué el
  // código no se sobrescribe en el conflicto.
  const vinculos = new Map();
  return {
    filas,
    vinculos,
    prepare(sql) {
      let atados = [];
      const esVinculo = /github_vinculos/.test(sql);
      const api = {
        bind(...args) { atados = args; return api; },
        async first() {
          const mapa = esVinculo ? vinculos : filas;
          const f = mapa.get(atados[0]);
          return f ? { ...f } : null;
        },
        async run() {
          if (esVinculo) {
            // El Worker ya ha decidido `codigoFinal` -pesando las dos
            // partidas- antes de llegar aquí: la fila de mentira solo tiene
            // que guardar lo que le llega, igual que hace el
            // `ON CONFLICT ... DO UPDATE SET codigo = excluded.codigo` real.
            const [githubId, codigo, login, actualizado] = atados;
            vinculos.set(githubId, { codigo, login, actualizado });
            return { meta: { changes: 1 } };
          }
          const [codigo, cuerpo, tiempo, partidas, sello, actualizado] = atados;
          const antes = filas.get(codigo);
          const forzado = !/WHERE excluded/.test(sql);
          const mejor = !antes || tiempo > antes.tiempo ||
                        (tiempo === antes.tiempo && partidas > antes.partidas);
          if (!antes || forzado || mejor) {
            filas.set(codigo, { cuerpo, tiempo, partidas, sello, actualizado });
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        }
      };
      return api;
    }
  };
}

const CODIGO = 'aB3dEfGhIjKlMnOpQrStUv';        // 22 caracteres, como los de verdad
const CODIGO_B = 'zZ9yXwVuTsRqPoNmLkJiHg';      // otro código, para el segundo navegador
const RAIZ = 'https://nube.ejemplo/p/';
const RAIZ_AUTH = 'https://nube.ejemplo/auth/github/';
const ENTORNO_GITHUB = { GITHUB_CLIENT_ID: 'id-de-mentira', GITHUB_CLIENT_SECRET: 'secreto-de-mentira' };

// El mismo `state` que compone `urlLoginGithub()` en js/core/nube.js: el
// código y la página, comprimidos en base64url. Se reimplementa aquí a
// propósito -igual que la regla de guardado más arriba- para poder construir
// casos concretos, incluidos los que el cliente nunca mandaría a propósito
// (un origen que no está en la lista).
function construirState(codigo, pagina) {
  const b64 = btoa(pagina).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return codigo + '.' + b64;
}

// EL GITHUB DE MENTIRA. El Worker habla con dos rutas de verdad -el
// intercambio de token y el perfil- y aquí se sustituye `fetch` global por
// esto durante el bloque de pruebas, restaurándolo al salir. Mismo patrón
// que ya usa este fichero de al lado con `console.table`.
function fetchFalsoGithub(perfil) {
  return async (url) => {
    const u = String(url);
    if (u.startsWith('https://github.com/login/oauth/access_token')) {
      return { json: async () => ({ access_token: 'token-de-mentira' }) };
    }
    if (u.startsWith('https://api.github.com/user')) {
      return { json: async () => perfil };
    }
    throw new Error('fetch falso de GitHub: URL inesperada ' + u);
  };
}

async function pedir(db, metodo, codigo, cuerpo, extra = '') {
  const opciones = { method: metodo };
  if (cuerpo !== undefined) {
    opciones.body = JSON.stringify(cuerpo);
    opciones.headers = { 'Content-Type': 'application/json' };
  }
  const r = await gestor.fetch(new Request(RAIZ + codigo + extra, opciones), { DB: db });
  let json = null;
  try { json = await r.json(); } catch {}
  return { estado: r.status, json, cors: r.headers.get('Access-Control-Allow-Origin') };
}

const PARTIDA = (tiempo, partidas) => ({
  cuerpo: 'P1abcdef01' + 'x'.repeat(200), tiempo, partidas, sello: 1756300000
});

console.log('EL WORKER DE LA NUBE\n');

console.log('Guardar y recuperar');
{
  const db = baseFalsa();
  comprobar((await pedir(db, 'GET', CODIGO)).estado === 404,
            'un código que nadie ha usado devuelve 404, no un vacío');
  const puesta = await pedir(db, 'PUT', CODIGO, PARTIDA(1000, 10));
  comprobar(puesta.estado === 200 && puesta.json.guardado === true, 'la primera copia se guarda');
  const leida = await pedir(db, 'GET', CODIGO);
  comprobar(leida.estado === 200 && leida.json.tiempo === 1000 && leida.json.partidas === 10,
            'y se recupera igual que se dejó');
  comprobar(leida.json.actualizado > 0, 'con la hora que le pone el SERVIDOR, no el cliente');
}

console.log('\nLo que protege una partida de veinte horas');
{
  const db = baseFalsa();
  await pedir(db, 'PUT', CODIGO, PARTIDA(46512, 37));          // la buena
  const vieja = await pedir(db, 'PUT', CODIGO, PARTIDA(900, 2)); // el portátil olvidado
  comprobar(vieja.estado === 200 && vieja.json.guardado === false,
            'subir una copia PEOR no machaca la buena: ' + vieja.json.motivo);
  comprobar((await pedir(db, 'GET', CODIGO)).json.tiempo === 46512,
            'y arriba sigue estando la de 46512 segundos');

  const mejor = await pedir(db, 'PUT', CODIGO, PARTIDA(50000, 40));
  comprobar(mejor.json.guardado === true, 'una copia con más juego sí entra');

  const empate = await pedir(db, 'PUT', CODIGO, PARTIDA(50000, 40));
  comprobar(empate.json.guardado === false, 'y un empate exacto no toca nada');

  // La salida de emergencia: cuando de verdad quieres que mande lo de aquí.
  const forzada = await pedir(db, 'PUT', CODIGO, PARTIDA(5, 1), '?forzar=1');
  comprobar(forzada.json.guardado === true, 'con ?forzar=1 se puede imponer lo de esta máquina');
  comprobar((await pedir(db, 'GET', CODIGO)).json.tiempo === 5, 'y entonces sí se pisa');
}

console.log('\nLo que no llega a la base de datos');
{
  const db = baseFalsa();
  const malos = ['corto', 'con espacio y todo', 'a'.repeat(65), 'tiene/barra/dentro'];
  for (const c of malos) {
    const r = await pedir(db, 'PUT', encodeURIComponent(c), PARTIDA(10, 1));
    comprobar(r.estado === 400 || r.estado === 404, `código "${c.slice(0, 18)}" -> ${r.estado}`);
  }
  comprobar((await pedir(db, 'GET', CODIGO)).estado === 404, 'y la base sigue vacía');

  comprobar((await pedir(db, 'PUT', CODIGO, { cuerpo: 'P1' + 'x'.repeat(3000), tiempo: 1, partidas: 1, sello: 1 })).estado === 400,
            'un cuerpo de 3 KB se rechaza: esto no es un disco duro gratis');
  comprobar((await pedir(db, 'PUT', CODIGO, { cuerpo: 'hola', tiempo: 1, partidas: 1, sello: 1 })).estado === 400,
            'y algo que no empieza por P1 tampoco es un progreso');
  comprobar((await pedir(db, 'PUT', CODIGO, { cuerpo: 'P1abc', tiempo: 'mucho', partidas: 1, sello: 1 })).estado === 400,
            'ni un tiempo que no es un número');
  comprobar((await pedir(db, 'PUT', CODIGO, { cuerpo: 'P1abc', tiempo: -5, partidas: 1, sello: 1 })).estado === 400,
            'ni un tiempo negativo, que ganaría por debajo');
}

console.log('\nLo que hace falta para que el juego pueda llamarlo');
{
  const db = baseFalsa();
  const r = await pedir(db, 'GET', CODIGO);
  comprobar(r.cors === '*', 'las respuestas llevan CORS abierto');
  const previa = await gestor.fetch(new Request(RAIZ + CODIGO, { method: 'OPTIONS' }), { DB: db });
  comprobar(previa.status === 200 && previa.headers.get('Access-Control-Allow-Methods').includes('PUT'),
            'y la petición previa del navegador se contesta');
  const otro = await gestor.fetch(new Request('https://nube.ejemplo/lista', { method: 'GET' }), { DB: db });
  comprobar(otro.status === 404, 'no hay ninguna ruta que liste nada');
}

console.log('\nLa validación, por su cuenta');
{
  comprobar(validar({ cuerpo: 'P1x', tiempo: 0, partidas: 0, sello: 0 }) === '',
            'una partida recién empezada es válida (todo a cero)');
  comprobar(validar(null) !== '' && validar({}) !== '', 'y un cuerpo vacío no');
  comprobar(validar({ cuerpo: 'P1x', tiempo: 1.5, partidas: 1.5, sello: 1 }) !== '',
            'las partidas tienen que ser un entero');
}

console.log('\nEl freno por IP');
{
  const db = baseFalsa();
  // Topes pequeños para no tener que hacer sesenta peticiones. Ver `_ajustarFreno`.
  _ajustarFreno(3, 2);
  const desde = (ip, metodo, cuerpo) => gestor.fetch(
    new Request(RAIZ + CODIGO, {
      method: metodo,
      headers: { 'CF-Connecting-IP': ip, 'Content-Type': 'application/json' },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined
    }), { DB: db });

  const l = [];
  for (let i = 0; i < 4; i++) l.push((await desde('1.2.3.4', 'GET')).status);
  comprobar(l.slice(0, 3).every((e) => e !== 429) && l[3] === 429,
            'a la cuarta lectura seguida se le contesta 429: ' + l.join(', '));

  const otra = await desde('9.9.9.9', 'GET');
  comprobar(otra.status !== 429, 'y a OTRA dirección no le afecta: ' + otra.status);

  _ajustarFreno(3, 2);
  const e = [];
  for (let i = 0; i < 3; i++) e.push((await desde('1.2.3.4', 'PUT', PARTIDA(10 + i, 1))).status);
  comprobar(e[0] !== 429 && e[1] !== 429 && e[2] === 429,
            'las escrituras tienen menos margen que las lecturas: ' + e.join(', '));

  const freno = await desde('1.2.3.4', 'PUT', PARTIDA(99, 9));
  comprobar(freno.headers.get('Retry-After') === '60', 'y se dice cuándo volver: Retry-After 60');
  comprobar(freno.headers.get('Access-Control-Allow-Origin') === '*',
            'con CORS, o el navegador ni llegaría a leer el motivo');

  // SIN CABECERA DE IP NO SE FRENA. `CF-Connecting-IP` la pone el borde de
  // Cloudflare y no se puede falsear desde fuera; si no está, esto no viene por
  // ahí. Es lo que permite que el resto de esta prueba no se atasque a la cuarta
  // petición, y la razón de que el orden de los bloques de aquí no importe.
  _ajustarFreno(2, 1);
  const sinIp = [];
  for (let i = 0; i < 5; i++) sinIp.push((await pedir(db, 'GET', CODIGO)).estado);
  comprobar(sinIp.every((x) => x !== 429), 'sin CF-Connecting-IP no se limita nada');
  _ajustarFreno(60, 30);
}

console.log('\nRecordar el código con GitHub');
{
  const db = baseFalsa();
  const PAGINA = 'http://localhost:8000/index.html';
  const OTRA_PAGINA = 'http://localhost:8000/otra-pestana.html';
  const PERFIL = { id: 4242, login: 'octocat' };

  // ORIGEN NO PERMITIDO: ni se llega a hablar con GitHub. Es la comprobación
  // que evita el open redirect -sin ella, cualquiera podría fabricar un
  // `state` que mandara el código de sesión a una página suya.
  const stateMalo = construirState(CODIGO, 'https://malicioso.ejemplo/robar');
  const rMalo = await gestor.fetch(
    new Request(RAIZ_AUTH + 'inicio?state=' + encodeURIComponent(stateMalo)),
    { DB: db, ...ENTORNO_GITHUB });
  comprobar(rMalo.status === 400, 'un origen fuera de la lista blanca no redirige a ningún sitio');
  comprobar(db.vinculos.size === 0, 'y no se ha tocado la base de datos');

  // INICIO: redirige a GitHub con lo que hace falta, y nada de scope.
  const stateBueno = construirState(CODIGO, PAGINA);
  const rInicio = await gestor.fetch(
    new Request(RAIZ_AUTH + 'inicio?state=' + encodeURIComponent(stateBueno)),
    { DB: db, ...ENTORNO_GITHUB });
  const destino = rInicio.headers.get('Location') || '';
  comprobar(rInicio.status === 302 && destino.startsWith('https://github.com/login/oauth/authorize'),
            'inicio redirige a GitHub de verdad');
  comprobar(destino.includes('client_id=id-de-mentira') && destino.includes('scope='),
            'con el client_id y sin pedir ningún scope de más');

  // LA PRIMERA CONEXIÓN enlaza el código con el que se vino.
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = fetchFalsoGithub(PERFIL);
  let rCallback;
  try {
    rCallback = await gestor.fetch(
      new Request(RAIZ_AUTH + `callback?code=abc123&state=${encodeURIComponent(stateBueno)}`),
      { DB: db, ...ENTORNO_GITHUB });
  } finally {
    globalThis.fetch = fetchOriginal;
  }
  const vuelta = new URL(rCallback.headers.get('Location') || 'https://x/');
  comprobar(rCallback.status === 302 && vuelta.origin + vuelta.pathname === PAGINA,
            'y devuelve a la MISMA página de la que se vino');
  comprobar(vuelta.searchParams.get('nube_codigo') === CODIGO,
            `con el código que traía el state (${vuelta.searchParams.get('nube_codigo')})`);
  comprobar(vuelta.searchParams.get('nube_login') === 'octocat', 'y el @usuario, para enseñarlo');
  comprobar(db.vinculos.get(4242).codigo === CODIGO, 'la base de datos enlaza esa cuenta con ese código');

  // LA SEGUNDA CONEXIÓN, misma cuenta de GitHub, OTRO navegador -otro
  // código local, otra página-, y NINGUNO de los dos códigos ha subido nada
  // todavía: EMPATE a cero, y en un empate gana el que ya estaba (no hay
  // motivo para cambiar nada).
  const stateSegundo = construirState(CODIGO_B, OTRA_PAGINA);
  globalThis.fetch = fetchFalsoGithub(PERFIL);       // misma cuenta: mismo id
  let rSegunda;
  try {
    rSegunda = await gestor.fetch(
      new Request(RAIZ_AUTH + `callback?code=xyz789&state=${encodeURIComponent(stateSegundo)}`),
      { DB: db, ...ENTORNO_GITHUB });
  } finally {
    globalThis.fetch = fetchOriginal;
  }
  const vuelta2 = new URL(rSegunda.headers.get('Location') || 'https://x/');
  comprobar(vuelta2.searchParams.get('nube_codigo') === CODIGO,
            `un empate a cero se queda con el que ya estaba enlazado ` +
            `(${vuelta2.searchParams.get('nube_codigo')})`);
  comprobar(db.vinculos.get(4242).codigo === CODIGO,
            'y en la base de datos el código enlazado no ha cambiado');
  comprobar(vuelta2.origin + vuelta2.pathname === OTRA_PAGINA,
            'pero SÍ vuelve a la página nueva desde la que se ha conectado esta vez');

  // Y AHORA CODIGO_B SUBE UNA PARTIDA DE VERDAD -es justo lo que le faltaba
  // al caso de arriba-. Al reconectar la MISMA cuenta desde ese código, el
  // enlace tiene que CAMBIAR: es el fallo de producción del 28 de agosto,
  // convertido en prueba para que no vuelva a colarse. Un enlace a una
  // partida vacía no puede ganarle a una partida de verdad.
  await pedir(db, 'PUT', CODIGO_B, PARTIDA(500, 3));
  globalThis.fetch = fetchFalsoGithub(PERFIL);
  let rTercera;
  try {
    rTercera = await gestor.fetch(
      new Request(RAIZ_AUTH + `callback?code=def456&state=${encodeURIComponent(stateSegundo)}`),
      { DB: db, ...ENTORNO_GITHUB });
  } finally {
    globalThis.fetch = fetchOriginal;
  }
  const vuelta3 = new URL(rTercera.headers.get('Location') || 'https://x/');
  comprobar(vuelta3.searchParams.get('nube_codigo') === CODIGO_B,
            `el código con partidas de verdad SÍ sustituye al vacío ` +
            `(${vuelta3.searchParams.get('nube_codigo')})`);
  comprobar(db.vinculos.get(4242).codigo === CODIGO_B,
            'y el enlace en la base de datos se ha corregido solo');

  // Y SI DESPUÉS SE RECONECTA DESDE EL CÓDIGO VIEJO -el vacío-, el enlace NO
  // vuelve atrás: sigue ganando quien más ha jugado, sea cual sea el orden
  // en que se conecten.
  globalThis.fetch = fetchFalsoGithub(PERFIL);
  let rCuarta;
  try {
    rCuarta = await gestor.fetch(
      new Request(RAIZ_AUTH + `callback?code=ghi789&state=${encodeURIComponent(stateBueno)}`),
      { DB: db, ...ENTORNO_GITHUB });
  } finally {
    globalThis.fetch = fetchOriginal;
  }
  const vuelta4 = new URL(rCuarta.headers.get('Location') || 'https://x/');
  comprobar(vuelta4.searchParams.get('nube_codigo') === CODIGO_B,
            'y reconectar desde el código vacío no lo vuelve a robar');

  // SIN CLIENT ID NI SECRETO CONFIGURADOS, se dice claramente y no se
  // intenta hablar con GitHub -es el estado del Worker recién desplegado,
  // antes de que alguien rellene el secreto-.
  const rSinConfigurar = await gestor.fetch(
    new Request(RAIZ_AUTH + 'inicio?state=' + encodeURIComponent(stateBueno)), { DB: db });
  comprobar(rSinConfigurar.status === 501,
            'sin GITHUB_CLIENT_ID configurado, inicio lo dice en vez de fallar por sorpresa');
}

console.log(fallos === 0 ? '\nTODO CORRECTO.\n' : `\n${fallos} FALLO(S).\n`);
process.exit(fallos === 0 ? 0 : 1);
