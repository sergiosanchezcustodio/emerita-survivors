// Comprobación de un solo uso: comprar un héroe y poder elegirlo.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 8132;
let fallos = 0;
const comprobar = (c, t) => { console.log(`  ${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) fallos++; };

const servidor = spawn(process.execPath, ['-e', `
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

await new Promise((r) => setTimeout(r, 500));
const nav = await chromium.launch();
const pagina = await (await nav.newContext({ viewport: { width: 960, height: 540 } })).newPage();
const errores = [];
pagina.on('pageerror', (e) => errores.push(e.message));

try {
  await pagina.goto(`http://localhost:${PUERTO}/index.html`);
  await pagina.waitForFunction(() => window.EMERITA && window.EMERITA.mando, null, { timeout: 30000 });
  const pulsar = async (t, ms = 260) => { await pagina.keyboard.press(t); await pagina.waitForTimeout(ms); };
  const donde = async () => pagina.evaluate(() => window.EMERITA.pantalla);

  let v = 0;
  while (await donde() === 6 && v++ < 8) await pulsar('Enter', 700);
  await pulsar('Enter', 600);   // hueco -> título

  comprobar(await pagina.evaluate(() => window.EMERITA.meta.heroeDesbloqueado('eric')),
            'los cuatro gratis salen desbloqueados de fábrica');
  comprobar(!(await pagina.evaluate(() => window.EMERITA.meta.heroeDesbloqueado('helen'))),
            'y los de pago NO, con la partida recién estrenada');

  // Sin dinero no se compra.
  await pagina.evaluate(() => { window.EMERITA.meta.denarios = 100; });
  await pulsar('KeyT', 500);
  await pulsar('ArrowRight'); await pulsar('ArrowRight');   // pestaña JUGADORES
  for (let i = 0; i < 4; i++) await pulsar('ArrowDown');    // hasta Helen
  await pulsar('Enter', 400);
  comprobar(!(await pagina.evaluate(() => window.EMERITA.meta.heroeDesbloqueado('helen'))),
            'con 100 denarios, Helen sigue sin ser tuya');

  // Con dinero, sí.
  await pagina.evaluate(() => { window.EMERITA.meta.denarios = 6000; });
  await pulsar('Enter', 400);
  comprobar(await pagina.evaluate(() => window.EMERITA.meta.heroeDesbloqueado('helen')),
            'con 6000, comprado');
  comprobar(await pagina.evaluate(() => window.EMERITA.meta.denarios) === 4500,
            'y se ha cobrado el precio: quedan 4500');

  await pulsar('Escape', 500);
  await pulsar('Enter', 600);   // JUGAR
  comprobar(await donde() === 1, 'de vuelta en la selección');

  // Cuatro a la derecha: eric -> lucy -> sara -> vicky -> helen.
  for (let i = 0; i < 4; i++) await pulsar('ArrowRight', 220);
  comprobar(await pagina.evaluate(() => window.EMERITA.puestos[0].personaje) === 4,
            'el cursor llega hasta Helen, que ahora es la quinta de la tira');
  // Confirmar con un solo jugador y sin mascotas arranca la partida: que la
  // pantalla se vaya ES la prueba de que se ha podido confirmar.
  await pulsar('Enter', 900);
  comprobar(await donde() !== 1, 'y se puede confirmar: la selección se cierra');

  // Y uno que no se ha comprado: se recorre pero no se confirma.
  await pagina.evaluate(() => window.EMERITA.volverAlMenu());
  await pagina.waitForTimeout(500);
  await pulsar('Enter', 700);    // JUGAR otra vez
  comprobar(await donde() === 1, 'y se vuelve a entrar a la selección');
  for (let i = 0; i < 7; i++) await pulsar('ArrowRight', 220);
  comprobar(await pagina.evaluate(() => window.EMERITA.puestos[0].personaje) === 7,
            'el cursor SÍ pasa por los bloqueados: llega a Sofi');
  await pulsar('Enter', 500);
  comprobar(!(await pagina.evaluate(() => window.EMERITA.puestos[0].listo)),
            'pero confirmar un héroe que no es tuyo no hace nada');

  comprobar(errores.length === 0,
            errores.length === 0 ? 'sin excepciones por el camino' : 'EXCEPCIONES: ' + errores.join(' | '));
} finally {
  await nav.close().catch(() => {});
  servidor.kill();
}

console.log(fallos === 0 ? '\nTODO CORRECTO.\n' : `\n${fallos} FALLO(S).\n`);
process.exit(fallos ? 1 : 0);
