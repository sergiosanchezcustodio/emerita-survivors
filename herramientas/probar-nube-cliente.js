// EL CLIENTE DE LA NUBE, contra un servidor de mentira.
//
//   node herramientas\probar-nube-cliente.js
//
// Lo que se comprueba es lo que hace honesto ofrecer esto:
//
//   1. CON LA NUBE APAGADA, el juego no habla con nadie. Ni una petición. Es el
//      estado por defecto y tiene que ser inerte de verdad, no "falla rápido".
//   2. SIN RED, no pasa nada. Guardar sigue guardando y jugar sigue jugando: el
//      disco manda y esto es una copia.
//   3. NO SE MACHACA lo bueno con lo malo, ni de subida ni de bajada.
//
// El servidor de mentira es el Worker de verdad -nube/worker.js- montado sobre
// un Map, igual que en probar-nube.js. Así el cliente habla con la misma lógica
// que va a encontrarse desplegada.

import gestor from '../nube/worker.js';
import * as Nube from '../js/core/nube.js';
import { empaquetar, pesoDe } from '../js/core/progresoPortable.js';

let fallos = 0;
function comprobar(condicion, texto) {
  console.log(`  ${condicion ? 'OK  ' : 'MAL '} ${texto}`);
  if (!condicion) fallos++;
}

// --- El navegador que le falta a Node ---------------------------------------
const almacen = new Map();
globalThis.localStorage = {
  getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
  setItem: (k, v) => almacen.set(k, String(v)),
  removeItem: (k) => almacen.delete(k)
};

// --- El servidor de mentira, y la cuenta de cuántas veces se le llama --------
let llamadas = 0;
let hayRed = true;
const filas = new Map();
const DB = {
  prepare(sql) {
    let atados = [];
    const api = {
      bind(...a) { atados = a; return api; },
      async first() { const f = filas.get(atados[0]); return f ? { ...f } : null; },
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

globalThis.fetch = async (url, opciones) => {
  llamadas++;
  if (!hayRed) throw new Error('sin red');
  return gestor.fetch(new Request(url, opciones), { DB });
};

const HUECOS = (tiempo, partidas) => ([
  { denarios: 100, partidas, tiempoTotal: tiempo, mejorTiempo: 60,
    potenciadores: { vida: 2 }, mascotas: { oreo: 1 }, fases: {}, personajes: { eric: true } },
  null,
  { denarios: 5, partidas: 1, tiempoTotal: 30, mejorTiempo: 30,
    potenciadores: {}, mascotas: {}, fases: {}, personajes: { eric: true } }
]);

console.log('EL CLIENTE DE LA NUBE\n');

console.log('Con la nube apagada');
{
  llamadas = 0;
  Nube.apuntarA('');
  Nube.subir(HUECOS(1000, 10));
  comprobar(await Nube.subirYa(HUECOS(1000, 10)) === false, 'subir no hace nada');
  comprobar(await Nube.bajar() === null, 'bajar tampoco');
  comprobar(llamadas === 0, `y NO se ha llamado a nadie (${llamadas} peticiones)`);
  comprobar(Nube.ultimoEstado() === 'apagada', 'y lo dice: ' + Nube.ultimoEstado());
}

console.log('\nEl código del jugador');
{
  const c = Nube.codigo();
  comprobar(/^[A-Za-z0-9_-]{22,64}$/.test(c), `se genera solo y tiene la forma buena (${c})`);
  comprobar(Nube.codigo() === c, 'y no cambia cada vez que se pregunta');
  comprobar(Nube.usarCodigo('otroCodigoDe22CaracteresX') === true, 'se puede poner el de otro sitio');
  comprobar(Nube.usarCodigo('corto') === false, 'pero no cualquier cosa');
  Nube.usarCodigo(c);
}

console.log('\nCon la nube encendida');
{
  Nube.apuntarA('https://nube.ejemplo');
  hayRed = true;
  comprobar(await Nube.subirYa(HUECOS(1000, 10)) === true, 'la primera copia sube');
  const abajo = await Nube.bajar();
  comprobar(abajo !== null && abajo.tiempo === 1030,
            `y baja con el peso de los TRES huecos sumados (${abajo && abajo.tiempo})`);
  comprobar(abajo.huecos[0].denarios === 100 && abajo.huecos[2].denarios === 5,
            'con las dos partidas que había');
  comprobar(abajo.huecos[1] === undefined, 'y el hueco vacío sigue vacío');
}

console.log('\nLo que protege una partida de veinte horas');
{
  await Nube.subirYa(HUECOS(46512, 37));
  const peor = await Nube.subirYa(HUECOS(900, 2));
  comprobar(peor === false, 'subir una copia con menos juego no la guarda');
  comprobar(Nube.ultimoEstado() === 'hay-mejor', 'y el juego se entera: ' + Nube.ultimoEstado());
  const abajo = await Nube.bajar();
  comprobar(abajo.huecos[0].tiempoTotal === 46512, 'arriba sigue la buena');
  comprobar(await Nube.subirYa(HUECOS(900, 2), true) === true,
            'y forzando sí se impone, que para eso está');
}

console.log('\nSin red');
{
  hayRed = false;
  comprobar(await Nube.subirYa(HUECOS(99999, 99)) === false, 'subir no revienta, solo devuelve false');
  comprobar(await Nube.bajar() === null, 'y bajar devuelve null');
  comprobar(Nube.ultimoEstado() === 'sin-red', 'diciendo por qué: ' + Nube.ultimoEstado());
  hayRed = true;
}

console.log('\nLas subidas se agrupan');
{
  llamadas = 0;
  // `guardar()` se llama varias veces seguidas al comprar en la tienda. Cada una
  // no puede ser una escritura en la nube.
  for (let i = 0; i < 5; i++) Nube.subir(HUECOS(2000 + i, 20));
  comprobar(llamadas === 0, 'cinco guardados seguidos no mandan nada de inmediato');
  await new Promise((r) => setTimeout(r, 4500));
  comprobar(llamadas === 1, `y al final sale UNA sola petición (${llamadas})`);
}

console.log('\nEl paquete de los tres huecos');
{
  const p = empaquetar(HUECOS(46512, 37));
  comprobar(p.length < 2048, `cabe en el tope del servidor (${p.length} < 2048)`);
  const peso = pesoDe(HUECOS(46512, 37));
  comprobar(peso.tiempo === 46542 && peso.partidas === 38,
            `y el peso suma los huecos: ${peso.tiempo} s, ${peso.partidas} partidas`);
}

console.log(fallos === 0 ? '\nTODO CORRECTO.\n' : `\n${fallos} FALLO(S).\n`);
process.exit(fallos === 0 ? 0 : 1);
