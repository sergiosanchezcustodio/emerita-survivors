// ¿LA FIRMA VE EL ARSENAL? Campo a campo, en un navegador de verdad.
//
//   node herramientas\probar-firma-arsenal.js
//
// POR QUÉ EXISTE. El arsenal se quedó fuera de la firma durante meses sin que
// nadie lo decidiera: `mezclarLista` solo mira los campos numéricos de un
// objeto y un arsenal es un objeto con una lista dentro, así que se caía por el
// borde. Cuando se metió, se metió a medias —solo `id` y `nivel`—, y eso deja
// fuera lo que de verdad se mueve: el temporizador que decide en qué paso
// dispara cada arma, los golpes encadenados pendientes, el ángulo de los
// orbitales y los tajos vivos, que `disparos.barrer` LEE para decidir si una
// púa de medusa se deshace.
//
// Una firma que no mira un campo no avisa de nada, y no avisa EN SILENCIO: la
// partida en red se separa media hora después por otro sitio y ya no hay forma
// de saber de dónde venía. Así que esto no comprueba que dos partidas
// coincidan —eso lo hace `probar-partida-en-red.js`—, sino lo contrario: que
// cuando algo del arsenal cambia, la firma LO DICE.
//
// El método es tocar un campo a mano, volver a firmar y exigir dos cosas:
//
//   1. que el componente `arsenales` cambie, o sea que el campo está mirado;
//   2. que NINGÚN otro componente cambie, o sea que se está mirando ahí y no
//      de rebote por otro lado.
//
// Todo dentro de un mismo `evaluate`: JavaScript no cede el turno, así que
// entre la firma de antes y la de después no cabe un fotograma. Si se hiciera
// en dos llamadas, el mundo avanzaría por su cuenta y cambiaría todo.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 8129;

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
  console.log('LA FIRMA DEL ARSENAL, CAMPO A CAMPO\n');
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

    // A jugar, a base de Enter. Las pantallas previas cambian de sitio cada
    // pocas semanas, así que se pulsa hasta llegar en vez de contar pasos.
    for (let i = 0; i < 12; i++) {
      if (await pagina.evaluate(() => window.EMERITA.pantalla) === 2) break;
      await pagina.keyboard.press('Enter');
      await pagina.waitForTimeout(500);
    }
    comprobar(await pagina.evaluate(() => window.EMERITA.pantalla) === 2,
              'se ha llegado a la partida');

    // Dos segundos de partida y un arsenal con de todo: un arco de melé para
    // que haya tajos y un orbital para que haya escudos girando. Sin ellos, la
    // mitad de los campos que se prueban no existirían todavía.
    await pagina.evaluate(() => {
      const a = window.EMERITA.arsenales[0];
      if (!a.equipadas.some((x) => x.id === 'gladius')) a.equipar('gladius');
      if (!a.equipadas.some((x) => x.id === 'scutum')) a.equipar('scutum');
    });
    await pagina.waitForTimeout(2000);

    const informe = await pagina.evaluate(() => {
      const D = window.EMERITA.determinismo;
      const nombres = D.nombresMundo();
      const iArs = nombres.indexOf('arsenales');
      const ars = window.EMERITA.arsenales[0];
      const gladius = ars.equipadas.find((x) => x.id === 'gladius');
      const scutum = ars.equipadas.find((x) => x.id === 'scutum');
      const base = D.partesMundo();
      const casos = [];

      // Se toca el campo, se firma, se devuelve a su sitio y se firma otra vez.
      // La vuelta atrás no es cortesía: si dejara el mundo tocado, el segundo
      // caso ya no partiría del mismo sitio y a partir del tercero la prueba
      // estaría midiendo su propia basura.
      const probar = (nombre, tocar, devolver) => {
        tocar();
        const tocada = D.partesMundo();
        devolver();
        const vuelta = D.partesMundo();
        const otros = [];
        for (let i = 0; i < base.length; i++) {
          if (i !== iArs && tocada[i] !== base[i]) otros.push(nombres[i]);
        }
        casos.push({
          nombre,
          visto: tocada[iArs] !== base[iArs],
          otros,
          restaurado: vuelta.join(',') === base.join(',')
        });
      };

      // Un pelo, no un número redondo: la firma mezcla los BITS del número, así
      // que si ve el último bit ve cualquier cosa. Y una divergencia de verdad
      // empieza siempre por el último bit.
      const pelo = (o, k) => probar(k, () => { o[k] += 1e-9; }, () => { o[k] -= 1e-9; });

      probar('id del arma', () => { gladius.id = 'otra'; },
                            () => { gladius.id = 'gladius'; });
      probar('nivel', () => { gladius.nivel++; }, () => { gladius.nivel--; });
      pelo(gladius, 'temporizador');
      pelo(gladius, 'golpesPendientes');
      pelo(gladius, 'demoraGolpe');
      pelo(scutum, 'anguloOrbital');
      pelo(scutum, 'relojOrbital');
      pelo(scutum, 'selloOrbital');
      pelo(scutum, 'faseGiro');
      probar('orbitalActivo (booleano)',
             () => { scutum.orbitalActivo = !scutum.orbitalActivo; },
             () => { scutum.orbitalActivo = !scutum.orbitalActivo; });
      pelo(gladius.stats, 'danyo');
      pelo(gladius.stats, 'recarga');
      pelo(ars.tajos[0], 'vida');
      pelo(ars.tajos[0], 'x');
      pelo(ars.tajos[0], 'alcance');
      pelo(ars.rayos[0], 'largo');
      pelo(ars.rayos[0], 'ang');
      probar('nTajos', () => { ars.nTajos++; }, () => { ars.nTajos--; });
      probar('nRayos', () => { ars.nRayos++; }, () => { ars.nRayos--; });
      probar('un arma de más',
             () => { ars.equipadas.push(ars.equipadas[0]); },
             () => { ars.equipadas.pop(); });

      // Y LA FOTO, que es lo que se pide por la red cuando la firma señala a los
      // arsenales. Si el grupo no existe, la petición viaja, llega vacía y el
      // rastro se pierde justo cuando iba a servir.
      const foto = D.foto(['arsenales']);
      const filas = foto.arsenales || [];
      return {
        casos,
        armas: ars.equipadas.length,
        filas: filas.length,
        campos: filas[0] ? Object.keys(filas[0]).length : 0,
        conStats: filas[0] ? Object.keys(filas[0]).some((k) => k.indexOf('s_') === 0) : false,
        conTemporizador: filas[0] ? 'temporizador' in filas[0] : false
      };
    });

    for (const c of informe.casos) {
      comprobar(c.visto, `la firma ve ${c.nombre}`);
      if (c.otros.length > 0) {
        comprobar(false, `  ...pero también movió: ${c.otros.join(', ')}`);
      }
      if (!c.restaurado) {
        comprobar(false, `  ...y no volvió a su sitio tras ${c.nombre}`);
      }
    }

    comprobar(informe.filas === informe.armas,
              `la foto trae una fila por arma (${informe.filas} de ${informe.armas})`);
    comprobar(informe.conTemporizador, 'y cada fila lleva el temporizador');
    comprobar(informe.conStats, 'y las stats aplanadas con prefijo');

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
  console.error(e);
  process.exit(1);
});
