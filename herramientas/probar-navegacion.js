// IR Y VOLVER POR LOS MENÚS, en un navegador de verdad.
//
//   node herramientas\probar-navegacion.js
//
// Comprueba que se llega a cada pantalla y, sobre todo, QUE SE PUEDE VOLVER.
// Lo segundo es lo que se rompe sin que nadie se entere: un menú al que entras
// y del que no sales no da error, no escribe nada en la consola y solo lo
// descubre quien está jugando.
//
// Pasó: desde la pantalla de mascotas, ESC no hacía nada. Volvía a personajes,
// pero allí todos seguían confirmados y la condición de salida disparaba en el
// mismo fotograma de vuelta a mascotas. Ibas y volvías sin llegar a ver nada.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 8127;

const NOMBRE = { 0: 'titulo', 1: 'seleccion', 2: 'juego', 3: 'tienda',
                 4: 'mascotas', 5: 'config', 6: 'intro', 7: 'huecos', 8: 'red' };

let fallos = 0;
function comprobar(condicion, texto) {
  console.log(`  ${condicion ? 'OK  ' : 'MAL '} ${texto}`);
  if (!condicion) fallos++;
}

function arrancarServidor() {
  return spawn(process.execPath, ['-e', `
    const http = require('http'), fs = require('fs'), path = require('path');
    const T = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
                '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg',
                '.gif':'image/gif', '.mp3':'audio/mpeg' };
    http.createServer((q, r) => {
      const l = decodeURIComponent(q.url.split('?')[0]);
      const f = path.join(${JSON.stringify(RAIZ)}, l === '/' ? 'index.html' : l);
      fs.readFile(f, (e, d) => {
        if (e) { r.writeHead(404); r.end(); return; }
        r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' });
        r.end(d);
      });
    }).listen(${PUERTO});
  `], { stdio: 'ignore' });
}

async function principal() {
  console.log('NAVEGACIÓN POR LOS MENÚS\n');
  const servidor = arrancarServidor();
  await new Promise((r) => setTimeout(r, 500));
  const nav = await chromium.launch();
  const pagina = await (await nav.newContext()).newPage();
  const excepciones = [];
  pagina.on('pageerror', (e) => excepciones.push(e.message));

  try {
    await pagina.goto(`http://localhost:${PUERTO}/index.html`);
    await pagina.waitForFunction(() => window.EMERITA && window.EMERITA.mando,
                                 null, { timeout: 30000 });

    const donde = async () => NOMBRE[await pagina.evaluate(() => window.EMERITA.mando().pantalla)];
    const pulsar = async (t, ms = 450) => { await pagina.keyboard.press(t); await pagina.waitForTimeout(ms); };

    // SE SALE DE LA INTRO PULSANDO HASTA SALIR, no contando pulsaciones.
    //
    // Antes eran dos Enter contados —splash y relato— y el día que se añadió una
    // tercera pantalla a la intro reventaron SEIS comprobaciones de golpe, todas
    // por estar una pantalla por detrás. Ninguna tenía que ver con lo que se
    // estaba probando.
    // LA ÚLTIMA PANTALLA DE LA INTRO ESPERA, Y ESO HAY QUE COMPROBARLO.
    //
    // La portada lleva "PULSE UNA TECLA PARA CONTINUAR" pintado en la propia
    // ilustración: si algún día se le pusiera un temporizador, la pantalla diría
    // una cosa y haría otra, y eso no da error ni se nota salvo mirándola. Se
    // salta el splash y el relato, y en la portada se deja correr el reloj.
    await pulsar('Enter', 900);   // splash -> relato
    await pulsar('Enter', 900);   // relato -> portada
    comprobar(await donde() === 'intro', 'tras el relato queda una pantalla más');
    await pagina.waitForTimeout(5000);
    comprobar(await donde() === 'intro',
              'y NO se va sola: cinco segundos después sigue ahí');

    let vueltas = 0;
    while (await donde() === 'intro' && vueltas++ < 8) await pulsar('Enter', 900);
    comprobar(await donde() === 'huecos',
              `y con una tecla lleva a elegir partida (${vueltas} pulsación/es)`);
    await pulsar('Enter', 600);
    comprobar(await donde() === 'titulo', 'elegir partida lleva al título');

    // UNA MASCOTA COMPRADA, Y AQUÍ, no antes: sin ninguna, esa pantalla se salta
    // entera y no se puede comprobar que se vuelva de ella. Va después de elegir
    // el hueco porque elegirlo CARGA el progreso guardado encima, así que
    // ponerla antes era ponerla para nada.
    await pagina.evaluate(() => { window.EMERITA.meta.mascotas = { heladio: 1 }; });

    // --- IDA Y VUELTA por cada rama ------------------------------------------
    await pulsar('Enter', 600);
    comprobar(await donde() === 'seleccion', 'JUGAR lleva a elegir personajes');
    await pulsar('Escape', 600);
    comprobar(await donde() === 'titulo', 'y ESC vuelve al título');

    // LA SEGUNDA OPCIÓN DE LA LÁPIDA. Se comprueba la ida y la vuelta como
    // todas, pero esta importa por una razón de más: hasta que se repintó la
    // ilustración, al cooperativo solo se entraba por un atajo sin escribir en
    // ninguna parte.
    await pulsar('ArrowDown', 400);
    await pulsar('Enter', 700);
    comprobar(await donde() === 'red', 'JUGAR EN RED lleva al cooperativo online');
    await pulsar('Escape', 600);
    comprobar(await donde() === 'titulo',
              'y ESC vuelve AL TÍTULO, que es de donde se entró');

    // El cursor se quedó en JUGAR EN RED: se sube antes de seguir, o el Enter
    // de abajo volvería al cooperativo en vez de ir a personajes.
    await pulsar('ArrowUp', 400);
    await pulsar('Enter', 600);
    await pulsar('KeyO', 700);
    comprobar(await donde() === 'red', 'el atajo O sigue llevando al cooperativo');
    await pulsar('Escape', 600);
    comprobar(await donde() === 'seleccion',
              'y desde ahí ESC vuelve a personajes, no al título');

    await pulsar('Enter', 700);
    comprobar(await donde() === 'mascotas', 'confirmar personaje lleva a mascotas');
    await pulsar('Escape', 700);
    comprobar(await donde() === 'seleccion',
              'y ESC vuelve a personajes (sin rebotar de vuelta a mascotas)');
    await pulsar('Escape', 600);
    comprobar(await donde() === 'titulo', 'y otra vez al título: la cadena entera');

    comprobar(excepciones.length === 0,
              excepciones.length === 0 ? 'sin excepciones por el camino'
                                       : 'EXCEPCIONES: ' + excepciones.join(' | '));
  } finally {
    await nav.close().catch(() => {});
    servidor.kill();
  }

  console.log(fallos === 0 ? '\nTODO CORRECTO.\n' : `\n${fallos} FALLO(S).\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

principal().catch((e) => {
  console.error('\nLa prueba ha reventado: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
