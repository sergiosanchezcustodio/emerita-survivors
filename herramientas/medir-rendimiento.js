// QUE CUESTA UN PASO DE PARTIDA, con la pantalla llena.
//
//   node herramientas\medir-rendimiento.js            cuanto cuesta (ms/paso)
//   node herramientas\medir-rendimiento.js logica     perfil de CPU de la logica
//   node herramientas\medir-rendimiento.js dibujo     perfil de CPU del dibujado
//   node herramientas\medir-rendimiento.js memoria    donde se reserva memoria
//
// Existe porque optimizar a ojo en este juego sale mal. El bucle tiene su
// overlay F3, pero eso dice CUANTO tarda un frame, no QUIEN se lo lleva, y la
// respuesta no ha coincidido ni una vez con lo que parecia. La ultima vez, el
// 78% de la logica se iba en la separacion entre enemigos —un sistema que en el
// codigo ocupa treinta lineas— y el dibujado de setecientos bichos, que era el
// sospechoso, no llegaba al 1%.
//
// COMO MONTA EL PEOR CASO. Empieza una partida, salta al minuto 15, llena el
// arsenal, sube las armas, se hace inmortal y suelta 800 enemigos de golpe con
// la tecla 3. Eso es mas horda de la que da el director en el minuto 20.
//
// LO QUE MIDE ES COMPARABLE CONSIGO MISMO, no con el juego en el monitor de
// Sergio: esto corre en un Chromium sin GPU, asi que los numeros de dibujado
// salen inflados y los de logica —que es JavaScript puro— valen tal cual. Para
// decidir si un cambio mejora, se pasa antes y despues.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 8141;
const MODO = process.argv[2] || 'coste';   // coste | logica | dibujo | memoria

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
const ctx = await nav.newContext({ viewport: { width: 960, height: 540 } });
const pagina = await ctx.newPage();
const errores = [];
pagina.on('pageerror', (e) => errores.push(e.message));

// Nombre legible de una funcion dentro de un perfil de V8.
function nombreDe(cf) {
  return (cf.functionName || '(anonima)') + '  ' +
         (cf.url || '').split('/').slice(-2).join('/') +
         (cf.lineNumber >= 0 ? ':' + (cf.lineNumber + 1) : '');
}

try {
  await pagina.goto(`http://localhost:${PUERTO}/index.html`);
  await pagina.waitForFunction(() => window.EMERITA && window.EMERITA.mando, null, { timeout: 30000 });
  const pulsar = async (t, ms = 240) => { await pagina.keyboard.press(t); await pagina.waitForTimeout(ms); };
  const donde = async () => pagina.evaluate(() => window.EMERITA.pantalla);

  let v = 0;
  while (await donde() === 6 && v++ < 8) await pulsar('Enter', 700);
  await pulsar('Enter', 600);    // hueco -> titulo
  await pulsar('Enter', 700);    // JUGAR -> seleccion
  await pulsar('Enter', 900);    // confirmar -> partida

  for (let i = 0; i < 15; i++) await pulsar('Digit6', 110);   // al minuto 15
  await pulsar('KeyG', 200);                                  // inmortal
  await pagina.evaluate(() => {
    const ars = window.EMERITA.arsenales[0];
    for (const id of ['pilum', 'gladius', 'rayoHorizontal', 'satelites',
                      'lanzallamas', 'arcoCorto', 'minas', 'campoElectrico']) {
      try { ars.equipar(id); } catch (e) { /* ranuras llenas */ }
    }
  });
  await pulsar('KeyL', 300);     // armas al maximo
  await pulsar('Digit3', 900);   // 800 enemigos
  await pagina.waitForTimeout(1200);

  const cdp = await ctx.newCDPSession(pagina);

  // --- CUANTO CUESTA ---------------------------------------------------------
  if (MODO === 'coste') {
    const m = await pagina.evaluate(() => {
      const E = window.EMERITA;
      // La logica se mide con el bucle PARADO: si no, el dibujado le compite por
      // el mismo hilo y lo que sale no es el coste, es el reparto.
      E.bucle.parar();
      const t0 = performance.now();
      E.avanzar(600);              // diez segundos de partida
      const logica = (performance.now() - t0) / 600;
      E.bucle.arrancar();
      return { logica, enemigos: E.enemigos.activos };
    });
    await pagina.waitForTimeout(3000);
    const f = await pagina.evaluate(() => ({
      fps: window.EMERITA.bucle.fps,
      msUpdate: window.EMERITA.bucle.msUpdate,
      msRender: window.EMERITA.bucle.msRender,
      perfil: { ...window.EMERITA.perfil }
    }));
    console.log(`\n  ${m.enemigos} enemigos en pantalla\n`);
    console.log('  LOGICA   ' + m.logica.toFixed(3) + ' ms por paso' +
                '   (el presupuesto de un frame a 60 Hz son 16,6)');
    console.log('  FRAME    ' + f.fps.toFixed(0) + ' fps  ·  update ' +
                f.msUpdate.toFixed(2) + '  ·  render ' + f.msRender.toFixed(2));
    console.log('  RENDER   ' + Object.entries(f.perfil)
                                 .map(([k, x]) => `${k}:${Number(x).toFixed(2)}`).join('  '));
    console.log('\n  errores:', errores.length ? errores.slice(0, 3).join(' | ') : 'ninguno');
  }

  // --- DONDE SE RESERVA MEMORIA ---------------------------------------------
  // El pooling prohibe reservar durante la partida (ver core/pool.js). Esto lo
  // comprueba de verdad en vez de confiar en que nadie haya escrito un `new`.
  else if (MODO === 'memoria') {
    await cdp.send('HeapProfiler.enable');
    await cdp.send('HeapProfiler.startSampling', { samplingInterval: 2048 });
    await pagina.evaluate(() => {
      const E = window.EMERITA;
      E.bucle.parar(); E.avanzar(900); E.bucle.arrancar();
    });
    await pagina.waitForTimeout(2500);
    const { profile } = await cdp.send('HeapProfiler.stopSampling');
    const filas = [];
    (function anda(nodo) {
      if (nodo.selfSize > 0) filas.push({ nombre: nombreDe(nodo.callFrame), bytes: nodo.selfSize });
      for (const h of nodo.children || []) anda(h);
    })(profile.head);
    filas.sort((a, b) => b.bytes - a.bytes);
    console.log('\nRESERVAS DE MEMORIA (900 pasos de logica y 2,5 s de bucle)\n');
    for (const f of filas.slice(0, 20)) {
      console.log('  ' + (f.bytes / 1024).toFixed(1).padStart(9) + ' KB   ' + f.nombre);
    }
    console.log('\n  total: ' +
                (filas.reduce((a, b) => a + b.bytes, 0) / 1048576).toFixed(2) + ' MB');
  }

  // --- PERFIL DE CPU, POR FUNCION -------------------------------------------
  else {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
    await cdp.send('Profiler.start');
    if (MODO === 'logica') {
      await pagina.evaluate(() => {
        const E = window.EMERITA;
        E.bucle.parar(); E.avanzar(900); E.bucle.arrancar();
      });
    } else {
      await pagina.waitForTimeout(4000);
    }
    const { profile } = await cdp.send('Profiler.stop');

    // Tiempo PROPIO por funcion: el de sus hijas no cuenta, o `actualizar`
    // saldria siempre primera con el 100% y no diria nada.
    const porNodo = new Map();
    for (const n of profile.nodes) porNodo.set(n.id, n);
    const golpes = new Map();
    for (const id of profile.samples) golpes.set(id, (golpes.get(id) || 0) + 1);
    const total = profile.samples.length || 1;
    const dur = (profile.endTime - profile.startTime) / 1000;

    const filas = [];
    for (const [id, n] of golpes) {
      const nodo = porNodo.get(id);
      if (nodo) filas.push({ nombre: nombreDe(nodo.callFrame), pct: (n / total) * 100, ms: (n / total) * dur });
    }
    filas.sort((a, b) => b.pct - a.pct);
    console.log(`\nPERFIL DE ${MODO.toUpperCase()}  (${dur.toFixed(0)} ms de muestreo)\n`);
    for (const f of filas.slice(0, 25)) {
      console.log('  ' + f.pct.toFixed(1).padStart(5) + '%  ' + f.ms.toFixed(0).padStart(5) +
                  ' ms   ' + f.nombre);
    }
    const est = await pagina.evaluate(() => ({
      enemigos: window.EMERITA.enemigos.activos,
      armas: window.EMERITA.arsenales[0].equipadas.map((a) => a.id + ':' + a.nivel).join(' ')
    }));
    console.log('\n  ' + est.enemigos + ' enemigos · armas: ' + est.armas);
    console.log('  errores:', errores.length ? errores.slice(0, 3).join(' | ') : 'ninguno');
  }
} finally {
  await nav.close().catch(() => {});
  servidor.kill();
}
