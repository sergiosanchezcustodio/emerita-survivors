// LAS TRES PRUEBAS DE DETERMINISMO, SIN ABRIR EL NAVEGADOR A MANO.
//
//   node herramientas\probar-determinismo.js
//
// Las tres existian ya en el juego (core/determinismo.js) pero solo se podian
// lanzar escribiendo en la consola del navegador con la partida cargada, que es
// justo el tipo de comprobacion que no se hace: hay que acordarse, abrir, pegar
// tres lineas y leer tres tablas. Aqui se pasan solas.
//
//   1. repetir()    la misma partida DOS VECES en la misma pestana. Caza el
//                   estado que no se reinicia y cualquier azar sin semilla.
//   2. contraste()  la misma partida con los pools RECIEN PUESTOS A CERO contra
//                   los pools sucios de haber jugado. Es literalmente el caso
//                   del cooperativo online: uno acaba de abrir el juego y el
//                   otro lleva tres partidas. Cazo cinco fugas de estado.
//   3. firmar()     una huella de 3600 fotogramas. Comparada con la de otro
//                   navegador dice si las matematicas coinciden; comparada
//                   consigo misma ANTES Y DESPUES de tocar el motor, dice si un
//                   cambio ha alterado la partida o solo su velocidad.
//
// LA HUELLA ESPERADA ESTA ESCRITA ABAJO. Si cambia, hay que mirar por que: o se
// ha tocado la simulacion a proposito —y entonces se copia la nueva— o se ha
// tocado sin querer, que es de lo que avisa. No es lo mismo que las otras dos:
// esas comprueban una propiedad, esta compara con lo que habia.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 8143;

// Huella de la semilla por defecto (0xE3E21A), 3600 fotogramas de seis en seis
// centenas. Rehecha el 7 de septiembre de 2026, al empezar a contar el daño.
//
// POR QUE CAMBIA, que es lo unico que hay que saber para no asustarse: esta vez
// se movio ENTERA, desde el primer grupo, y no solo la cola. El resumen de
// partida enseña ahora cuanto ha pegado cada jugador y cada arma, asi que hay
// contadores nuevos —`danyoHecho` en el jugador y en cada arma del arsenal, y
// `bajas` por arma— y esos numeros entran en la foto del mundo desde el primer
// golpe. Antes solo se movia la cola porque lo que cambiaba era el sorteo de la
// subida de nivel, que no llega hasta el minuto cuarenta.
//
// La simulacion NO se ha tocado: nadie pega mas ni menos que ayer, solo se
// apunta lo que pega. Las dos primeras pruebas de este mismo archivo siguen
// diciendo que la misma partida jugada dos veces sale igual, que es la
// propiedad; esta tercera solo compara con lo que habia.
// Y rehecha otra vez el 7 de septiembre al entrar tres armas de golpe
// —Cartas, Cayado y Campana—: mas candidatos en el sorteo, el azar se gasta en
// otro orden a partir de la primera subida de nivel. Los cuatro primeros grupos
// no se mueven, que es la firma de este tipo de cambio.
// Y otra vez el 7 de septiembre, al entrar siete objetos nuevos. Esta se movio
// ENTERA, desde el primer grupo, no solo la cola: los objetos traen SEIS CAMPOS
// NUEVOS en el jugador -alcance, velocidad de proyectil, duracion de zona,
// perforacion, dano de contacto y denarios- y esos numeros entran en la foto
// del mundo desde el primer fotograma, aunque valgan cero. Es la misma firma
// que dejo el contador de dano de la semana pasada.
// Y al entrar los Aros de ritmica: un arma mas en el sorteo. Se movio UN SOLO
// grupo de los siete, el sexto — o sea que la partida de la prueba solo se
// desvia en un tramo y vuelve a coincidir despues. Es lo normal cuando lo que
// cambia es el reparto del azar y no lo que se hace con el.
const HUELLA_ESPERADA = '4837249a 4875a3a0 7e981868 b5967e65 83b3a255 fe10a79f b874d5ad';

let fallos = 0;
function comprobar(condicion, texto) {
  console.log(`  ${condicion ? 'OK  ' : 'MAL '} ${texto}`);
  if (!condicion) fallos++;
}

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
  console.log('DETERMINISMO\n');
  await pagina.goto(`http://localhost:${PUERTO}/index.html`);
  await pagina.waitForFunction(() => window.EMERITA && window.EMERITA.determinismo,
                               null, { timeout: 30000 });

  const r = await pagina.evaluate(() => {
    // Las tres hablan mucho por consola y aqui solo interesa el veredicto.
    const consola = console.log, tabla = console.table, aviso = console.warn;
    console.log = () => {}; console.table = () => {}; console.warn = () => {};
    const t0 = performance.now();
    const huella = window.EMERITA.determinismo.firmar();
    const ms = performance.now() - t0;
    const rep = window.EMERITA.determinismo.repetir(1800, 60);
    const con = window.EMERITA.determinismo.contraste(600, 60);
    console.log = consola; console.table = tabla; console.warn = aviso;
    return { huella, ms, repetir: rep.igual, repFot: rep.fotograma,
             contraste: con.igual, conFot: con.fotograma };
  });

  comprobar(r.repetir,
            r.repetir ? 'la misma partida dos veces sale igual'
                      : `dos pasadas difieren en el fotograma ${r.repFot}`);
  comprobar(r.contraste,
            r.contraste ? 'con los pools sucios de otra partida, sale igual'
                        : `los pools sucios cambian la partida en el fotograma ${r.conFot}`);
  comprobar(r.huella === HUELLA_ESPERADA,
            r.huella === HUELLA_ESPERADA
              ? 'la huella de 3600 fotogramas es la de siempre'
              : `LA HUELLA HA CAMBIADO\n       esperada: ${HUELLA_ESPERADA}\n       ahora:    ${r.huella}`);
  comprobar(errores.length === 0,
            errores.length === 0 ? 'sin excepciones' : 'EXCEPCIONES: ' + errores.slice(0, 3).join(' | '));
  console.log(`\n  3600 pasos simulados en ${r.ms.toFixed(0)} ms ` +
              `(${(r.ms / 3600).toFixed(3)} ms por paso, sin horda encima)`);
} finally {
  await nav.close().catch(() => {});
  servidor.kill();
}

console.log(fallos === 0 ? '\nTODO CORRECTO.\n' : `\n${fallos} FALLO(S).\n`);
process.exit(fallos ? 1 : 0);
