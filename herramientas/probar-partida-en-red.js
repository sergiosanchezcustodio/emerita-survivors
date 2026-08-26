// UNA PARTIDA EN RED DE VERDAD, jugada sola.
//
//   node herramientas\probar-partida-en-red.js [segundos]
//
// Abre dos pestañas del juego en un navegador de verdad, las conecta entre
// ellas con el mismo baile de códigos que harían dos personas, empieza una
// partida y la juega moviéndose. Al final dice si las dos siguieron simulando
// el mismo mundo y cuánto avanzó cada una.
//
// POR QUÉ EXISTE. Hasta hoy, cada cambio en el bucle del juego salía sin
// ejecutarse ni una vez: `node --check` valida la sintaxis y no dice nada del
// alcance de un `return`, y las otras cuatro pruebas cubren el búfer, la
// sincronización, el códec y las matemáticas —todo lógica pura— pero no el
// bucle, porque necesita navegador. Quien lo probaba era Sergio, ronda a ronda.
// Un `return` mal puesto le costó dos tardes.
//
// Lo que SÍ cubre ahora: que el mundo avance, que los dos jugadores se muevan,
// que aparezcan enemigos y decoración, que las dos partidas no se separen y que
// no haya errores en ninguna de las dos consolas.
//
// Lo que sigue sin cubrir: el aspecto. Que algo se dibuje mal, feo o en el
// sitio equivocado no lo va a ver esta prueba jamás.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 8123;
const SEGUNDOS = Number(process.argv[2]) || 60;

let fallos = 0;
function comprobar(condicion, texto) {
  console.log(`  ${condicion ? 'OK  ' : 'MAL '} ${texto}`);
  if (!condicion) fallos++;
}

// --- Servidor -----------------------------------------------------------------
// El juego son módulos ES6, así que hace falta servirlo por http: abrirlo como
// file:// lo bloquea el navegador.
function arrancarServidor() {
  const proc = spawn(process.execPath, ['-e', `
    const http = require('http'), fs = require('fs'), path = require('path');
    const TIPOS = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
                    '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg',
                    '.gif':'image/gif', '.mp3':'audio/mpeg', '.ogg':'audio/ogg' };
    http.createServer((req, res) => {
      const limpio = decodeURIComponent(req.url.split('?')[0]);
      const f = path.join(${JSON.stringify(RAIZ)}, limpio === '/' ? 'index.html' : limpio);
      fs.readFile(f, (err, datos) => {
        if (err) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'Content-Type': TIPOS[path.extname(f)] || 'application/octet-stream' });
        res.end(datos);
      });
    }).listen(${PUERTO});
  `], { stdio: 'ignore' });
  return proc;
}

// --- Una pestaña con el juego -------------------------------------------------
async function abrirJuego(navegador, nombre) {
  const contexto = await navegador.newContext();
  const pagina = await contexto.newPage();
  // `console.table` no llega aquí como texto: Playwright entrega el mensaje sin
  // la tabla montada. Y esa tabla es justo el detalle de una desincronización,
  // o sea lo único que se quiere leer cuando algo falla. Se guarda aparte.
  await pagina.addInitScript(() => {
    window.__tablas = [];
    const original = console.table.bind(console);
    console.table = (datos, ...resto) => {
      try { window.__tablas.push(JSON.parse(JSON.stringify(datos))); } catch {}
      return original(datos, ...resto);
    };
  });
  const errores = [];
  pagina.on('console', (m) => {
    if (m.type() === 'error') errores.push(m.text());
  });
  pagina.on('pageerror', (e) => errores.push('EXCEPCIÓN: ' + e.message));

  await pagina.goto(`http://localhost:${PUERTO}/index.html`);
  // Esperar a que el juego termine de cargar y monte su consola.
  await pagina.waitForFunction(() => window.EMERITA && window.EMERITA.red, null,
                               { timeout: 30000 });
  return { nombre, pagina, contexto, errores };
}

// Pulsa una tecla del teclado de esa pestaña. Es entrada de verdad: pasa por
// los mismos manejadores que la de una persona.
async function teclear(p, tecla, ms) {
  await p.pagina.keyboard.down(tecla);
  await p.pagina.waitForTimeout(ms);
  await p.pagina.keyboard.up(tecla);
}

async function principal() {
  console.log(`PARTIDA EN RED, ${SEGUNDOS} segundos\n`);
  const servidor = arrancarServidor();
  await new Promise((r) => setTimeout(r, 500));

  const navegador = await chromium.launch({
    args: ['--autoplay-policy=no-user-gesture-required',
           // Sin esto, Chrome esconde las IP locales detrás de nombres mDNS y
           // dos contextos del mismo navegador no llegan a conectarse.
           '--disable-features=WebRtcHideLocalIpsWithMdns',
           // SIN ESTO, LA PESTAÑA QUE NO ESTÁ DELANTE SE QUEDA CASI PARADA.
           //
           // Chromium frena a propósito lo que no se está mirando: los
           // temporizadores y el repintado de una pestaña de fondo van a
           // cámara lenta para no gastar batería. En un juego normal da igual;
           // aquí significa que una de las dos puntas simula diez veces menos
           // que la otra, y la prueba lo cuenta como si el juego se hubiera
           // atascado. Pasó: 12331 pasos en una y 1874 en la otra, sin esperas
           // y sin un solo error, que es justo la firma de un frenado y no la
           // de un fallo.
           '--disable-background-timer-throttling',
           '--disable-backgrounding-occluded-windows',
           '--disable-renderer-backgrounding']
  });

  let A, B;
  try {
    A = await abrirJuego(navegador, 'anfitrión');
    B = await abrirJuego(navegador, 'invitada');
    comprobar(true, 'las dos pestañas cargan el juego');

    // --- El baile de códigos, igual que lo harían dos personas ---------------
    const invitacion = await A.pagina.evaluate(() => window.EMERITA.red.invitar());
    comprobar(typeof invitacion === 'string' && invitacion.length > 100,
              `invitación de ${invitacion ? invitacion.length : 0} caracteres`);

    const respuesta = await B.pagina.evaluate((c) => window.EMERITA.red.responder(c),
                                              invitacion);
    comprobar(typeof respuesta === 'string' && respuesta.length > 100,
              `respuesta de ${respuesta ? respuesta.length : 0} caracteres`);

    const conectado = await A.pagina.evaluate((c) => window.EMERITA.red.aceptar(c),
                                              respuesta);
    comprobar(conectado === true, 'se conectan');
    if (!conectado) return;

    // --- La partida ----------------------------------------------------------
    await A.pagina.evaluate(() => window.EMERITA.red.jugar());
    await A.pagina.waitForTimeout(500);

    const enPartida = await B.pagina.evaluate(() => !!window.EMERITA.lockstep);
    comprobar(enPartida, 'la invitada entra en la partida sola');

    // Moverse de verdad, en las dos, en direcciones distintas. Quedarse quieto
    // probaría mucho menos: sin movimiento no hay rumbo de cámara, y sin rumbo
    // no se ejecuta la mitad de la lógica de aparición de la horda.
    const teclas = ['KeyD', 'KeyS', 'KeyA', 'KeyW'];
    const hasta = Date.now() + SEGUNDOS * 1000;
    let vuelta = 0;
    while (Date.now() < hasta) {
      await Promise.all([
        teclear(A, teclas[vuelta % 4], 700),
        teclear(B, teclas[(vuelta + 2) % 4], 700)
      ]);
      // Confirmar de vez en cuando: subir de nivel PARA EL MUNDO hasta que
      // alguien elige carta. Sin esto, la partida se congela en la primera
      // subida y la prueba diría que todo va bien sin haber simulado nada.
      await Promise.all([
        A.pagina.keyboard.press('Enter'),
        B.pagina.keyboard.press('Enter')
      ]);
      vuelta++;
    }

    // --- El veredicto --------------------------------------------------------
    const leer = (p) => p.pagina.evaluate(() => {
      const L = window.EMERITA.lockstep;
      const S = window.EMERITA.red.sesion;
      return {
        paso: L.paso,
        esperas: L.esperas,
        esperaMax: L.esperaMax,
        conectado: S ? S.estado : 'sin sesión',
        // POR QUÉ no avanza, si no avanza. Sin esto, una punta parada solo
        // sabía decir que estaba parada.
        mando: window.EMERITA.mando ? window.EMERITA.mando() : null
      };
    });
    const rA = await leer(A), rB = await leer(B);

    console.log('\nRESULTADO');
    console.log(`  anfitrión: paso ${rA.paso}, ${rA.esperas} esperas (la mayor ${rA.esperaMax})`);
    console.log(`  invitada:  paso ${rB.paso}, ${rB.esperas} esperas (la mayor ${rB.esperaMax})`);
    if (rA.mando && rB.mando) {
      const filas = {};
      for (const campo in rA.mando) {
        const x = rA.mando[campo], y = rB.mando[campo];
        filas[campo] = { anfitrión: x, invitada: y, '': x === y ? '' : '<-- DIFIERE' };
      }
      console.log('\nEN QUÉ ESTADO HA QUEDADO CADA UNA');
      console.table(filas);
    }

    const esperados = SEGUNDOS * 60 * 0.5;   // la mitad ya sería un problema gordo
    comprobar(rA.paso > esperados,
              `el mundo AVANZA en el anfitrión (${rA.paso} pasos de ~${SEGUNDOS * 60})`);
    comprobar(rB.paso > esperados,
              `el mundo AVANZA en la invitada (${rB.paso} pasos)`);
    comprobar(Math.abs(rA.paso - rB.paso) < 300,
              `las dos van a la par (se llevan ${Math.abs(rA.paso - rB.paso)} pasos)`);

    // Lo que de verdad importa: que nadie haya cantado desincronización.
    const rotos = [];
    for (const p of [A, B]) {
      const separadas = p.errores.filter((t) => /se han separado/.test(t));
      if (separadas.length > 0) rotos.push(`${p.nombre}: ${separadas[0]}`);
    }
    comprobar(rotos.length === 0,
              rotos.length === 0
                ? 'las dos partidas siguen siendo la misma'
                : 'SE HAN SEPARADO -> ' + rotos.join(' | '));

    // Y que el mundo esté vivo, no solo avanzando.
    const vivo = await A.pagina.evaluate(() => {
      const e = window.EMERITA.determinismo.partes();
      return { enemigos: e.enemigos, obstaculos: e.obstaculos };
    });
    comprobar(!!vivo.enemigos, 'hay horda (el componente de enemigos no está vacío)');

    // El detalle de la separación, si lo hubo. Es lo que dice qué campo de qué
    // entidad se ha ido, y sin esto la prueba solo sabría decir "se separaron".
    for (const p of [A, B]) {
      const tablas = await p.pagina.evaluate(() => window.__tablas || []);
      const detalle = tablas.find((t) => Array.isArray(t) && t.length > 0 && t[0].campo);
      if (detalle) {
        console.log(`
  DETALLE (${p.nombre}):`);
        console.table(detalle);
      }
    }

    for (const p of [A, B]) {
      const otros = p.errores.filter((t) => !/se han separado/.test(t) &&
                                            !/diferencia\(s\) concreta/.test(t) &&
                                            !/AudioContext/.test(t) &&
                                            !/favicon/.test(t));
      comprobar(otros.length === 0,
                otros.length === 0 ? `sin errores en la consola (${p.nombre})`
                                   : `errores en ${p.nombre}: ${otros.slice(0, 3).join(' | ')}`);
    }
  } finally {
    if (A) await A.contexto.close().catch(() => {});
    if (B) await B.contexto.close().catch(() => {});
    await navegador.close().catch(() => {});
    servidor.kill();
  }

  console.log(fallos === 0 ? '\nTODO CORRECTO.\n' : `\n${fallos} FALLO(S).\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

principal().catch((e) => {
  console.error('\nLa prueba ha reventado: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
