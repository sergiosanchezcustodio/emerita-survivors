// CUATRO VENTANAS YA CONECTADAS, para mirar el cooperativo con los ojos.
//
//   node herramientas\jugar-en-red.js [jugadores]     (2, 3 o 4; por defecto 4)
//
// Abre las ventanas del juego, hace por ti el baile de códigos —que a mano son
// tres invitaciones y tres respuestas copiadas y pegadas— y empieza la partida.
// Luego se queda ahí: las ventanas son de verdad y se pueden usar. Se cierra
// todo con Ctrl+C en esta consola.
//
// PARA QUÉ SIRVE Y PARA QUÉ NO. Sirve para VER el cooperativo: que los cuatro
// aparecen, que se mueven a la vez, que la horda es la misma en las cuatro
// pantallas, que subir de nivel funciona. Para eso hay que verlo, y ninguna
// prueba automática lo va a juzgar.
//
// No sirve para medir el rendimiento. Cuatro copias del juego en un solo
// ordenador se pisan por la CPU y ninguna va a sesenta pasos por segundo; en
// una partida de verdad cada persona pone su máquina. Tampoco sirve para jugar
// de verdad a cuatro: el teclado va a la ventana que tenga el foco, así que se
// mueve uno cada vez.
//
// Las ventanas se lanzan SIN el frenado de segundo plano. Sin eso, las tres que
// no estás mirando bajan a cámara lenta y, como el cooperativo espera a todos,
// la partida se arrastra entera.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 8130;
const CUANTOS = Math.max(2, Math.min(4, Number(process.argv[2]) || 4));

// Ventanas pequeñas y en rejilla, para que quepan las cuatro y se vean a la vez.
const ANCHO = 720, ALTO = 460;
const SITIOS = [[0, 0], [ANCHO, 0], [0, ALTO + 40], [ANCHO, ALTO + 40]];

function arrancarServidor() {
  return spawn(process.execPath, ['-e', `
    const http = require('http'), fs = require('fs'), path = require('path');
    const T = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
                '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg',
                '.gif':'image/gif', '.mp3':'audio/mpeg', '.ogg':'audio/ogg' };
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

async function abrir(navegador, i) {
  const contexto = await navegador.newContext({
    viewport: null,
    permissions: ['clipboard-read', 'clipboard-write']
  });
  const pagina = await contexto.newPage();
  pagina.on('console', (m) => {
    // Los avisos de la red sí interesan mirándolos jugar; el resto es ruido.
    const t = m.text();
    if (/^RED/.test(t) || m.type() === 'error') console.log(`  [${i + 1}] ${t}`);
  });
  await pagina.goto(`http://localhost:${PUERTO}/index.html`);
  await pagina.waitForFunction(() => window.EMERITA && window.EMERITA.red,
                               null, { timeout: 30000 });
  return pagina;
}

async function principal() {
  console.log(`Abriendo ${CUANTOS} ventanas…\n`);
  const servidor = arrancarServidor();
  await new Promise((r) => setTimeout(r, 500));

  const navegador = await chromium.launch({
    headless: false,
    args: [
      '--autoplay-policy=no-user-gesture-required',
      // Sin esto, dos ventanas del mismo navegador no se ven entre ellas: Chrome
      // esconde las direcciones locales detrás de nombres mDNS.
      '--disable-features=WebRtcHideLocalIpsWithMdns',
      // Y sin esto, la ventana que no miras se queda a cámara lenta y arrastra
      // a las demás, porque el cooperativo espera a todos.
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      `--window-size=${ANCHO},${ALTO}`
    ]
  });

  const paginas = [];
  for (let i = 0; i < CUANTOS; i++) {
    paginas.push(await abrir(navegador, i));
    // Colocarlas en rejilla. Es cosmético, pero cuatro ventanas apiladas una
    // encima de otra no dejan ver lo único que esto viene a enseñar.
    const [x, y] = SITIOS[i];
    const sesion = await paginas[i].context().newCDPSession(paginas[i]);
    const { windowId } = await sesion.send('Browser.getWindowForTarget');
    await sesion.send('Browser.setWindowBounds', {
      windowId, bounds: { left: x, top: y, width: ANCHO, height: ALTO }
    });
  }

  const anfitrion = paginas[0];
  console.log('Conectando…');
  for (let i = 1; i < paginas.length; i++) {
    const invitacion = await anfitrion.evaluate(() => window.EMERITA.red.invitar());
    const respuesta = await paginas[i].evaluate((c) => window.EMERITA.red.responder(c),
                                                invitacion);
    const ok = await anfitrion.evaluate((c) => window.EMERITA.red.aceptar(c), respuesta);
    console.log(`  jugador ${i + 1}: ${ok ? 'dentro' : 'NO HA PODIDO CONECTAR'}`);
    if (!ok) { await navegador.close(); servidor.kill(); process.exit(1); }
  }

  await anfitrion.evaluate(() => window.EMERITA.red.jugar());
  console.log(`\nPartida empezada con ${CUANTOS} jugadores.`);
  console.log('El teclado va a la ventana que tenga el FOCO: haz clic en una y');
  console.log('muévete con WASD. Pulsa F3 en cualquiera para ver el estado de la red.');
  console.log('\nCtrl+C aquí para cerrarlo todo.');

  // Y aquí se queda. Nada de cerrar: la gracia es poder mirarlas.
  const cerrar = async () => {
    await navegador.close().catch(() => {});
    servidor.kill();
    process.exit(0);
  };
  process.on('SIGINT', cerrar);
  navegador.on('disconnected', cerrar);
  await new Promise(() => {});
}

principal().catch((e) => {
  console.error('Ha reventado: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
