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

import gestor, { validar } from '../nube/worker.js';

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
  return {
    filas,
    prepare(sql) {
      let atados = [];
      const api = {
        bind(...args) { atados = args; return api; },
        async first() {
          const f = filas.get(atados[0]);
          return f ? { ...f } : null;
        },
        async run() {
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
const RAIZ = 'https://nube.ejemplo/p/';

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

console.log(fallos === 0 ? '\nTODO CORRECTO.\n' : `\n${fallos} FALLO(S).\n`);
process.exit(fallos === 0 ? 0 : 1);
