// VEINTE MINUTOS DE PARTIDA SEGUIDOS, en un navegador de verdad.
//
//   node herramientas\probar-aguante.js [minutos]
//
// Las demas pruebas miran una cosa cada una y duran segundos. Esta mira lo que
// solo aparece jugando de verdad y hasta el final: que ninguna cuenta se vuelve
// NaN, que ningun pool se agota en silencio, que la memoria no crece sin parar
// y que no salta una excepcion en el minuto dieciocho — que es donde nadie
// llega probando a mano, porque hay que estar veinte minutos delante.
//
// COMO SE JUEGAN VEINTE MINUTOS EN UN MINUTO. Se llama a `EMERITA.avanzar`, que
// da pasos de logica sin dibujar ni esperar al reloj. El jugador se queda
// quieto y es inmortal, asi que lo que se prueba es la HORDA: aparecer, morir,
// reciclarse y volver, con los tres jefes por el camino.
//
// Y las subidas de nivel se eligen solas: `Progresion.elegir(0)` coge la
// primera carta. Sin eso el mundo se para en el primer nivel — el menu congela
// la simulacion a proposito— y la prueba se quedaria mirando el minuto uno.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 8145;
const MINUTOS = Number(process.argv[2]) || 20;
// Con cuantos jugadores. Con cuatro se recorre ademas todo lo que solo existe
// en cooperativo: ataudes, reanimacion, la cola de subidas de nivel y el cofre
// que uno abre y los cuatro miran.
const JUGADORES = Math.max(1, Math.min(4, Number(process.argv[3]) || 1));

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
const nav = await chromium.launch({ args: ['--js-flags=--expose-gc'] });
const pagina = await (await nav.newContext({ viewport: { width: 960, height: 540 } })).newPage();
const excepciones = [];
const quejas = [];
pagina.on('pageerror', (e) => excepciones.push(e.message));
pagina.on('console', (m) => {
  if (m.type() === 'error' && !esRuidoDeNube(m.text())) quejas.push(m.text());
});
// El 404 de la nube NO es un fallo: un codigo de jugador que todavia no ha
// subido nada no existe en el servidor, y asi es como el cliente se entera (ver
// core/nube.js). El navegador lo pinta en rojo igualmente, asi que se filtra
// aqui en vez de andar persiguiendo un fantasma cada vez que se pasa la prueba.
const esRuidoDeNube = (t) => /workers\.dev|Failed to load resource/.test(t);
pagina.on('response', (r) => {
  if (r.status() >= 400 && !esRuidoDeNube(r.url())) quejas.push('HTTP ' + r.status() + ' ' + r.url());
});

try {
  console.log(`AGUANTE: ${MINUTOS} MINUTOS DE PARTIDA, ${JUGADORES} JUGADOR(ES)\n`);
  await pagina.goto(`http://localhost:${PUERTO}/index.html`);
  await pagina.waitForFunction(() => window.EMERITA && window.EMERITA.mando, null, { timeout: 30000 });
  const pulsar = async (t, ms = 260) => { await pagina.keyboard.press(t); await pagina.waitForTimeout(ms); };
  const donde = async () => pagina.evaluate(() => window.EMERITA.pantalla);

  let v = 0;
  while (await donde() === 6 && v++ < 8) await pulsar('Enter', 700);
  await pulsar('Enter', 600);    // hueco -> titulo
  await pulsar('Enter', 700);    // JUGAR -> seleccion
  await pulsar('Enter', 900);    // confirmar -> partida
  comprobar(await donde() === 2, 'la partida arranca');
  for (let j = 1; j < JUGADORES; j++) await pulsar('KeyJ', 250);
  comprobar(await pagina.evaluate(() => window.EMERITA.jugadores().length) === JUGADORES,
            `juegan ${JUGADORES}`);
  await pulsar('KeyG', 200);     // inmortal: lo que se prueba es la horda

  const informe = await pagina.evaluate(async (minutos) => {
    const E = window.EMERITA;
    E.bucle.parar();
    const P = E.progresion;
    const pasos = minutos * 60 * 60;
    const trozo = 300;

    const malos = [];
    const marcas = [];
    let picoEnemigos = 0, nivelesSubidos = 0, cofresAbiertos = 0;

    const finito = (v) => typeof v === 'number' && Number.isFinite(v);
    const revisar = (t) => {
      for (const j of E.jugadores()) {
        if (!finito(j.x) || !finito(j.y) || !finito(j.vida)) {
          malos.push(`jugador NaN en el paso ${t}`); return;
        }
      }
      const pe = E.enemigos.pool;
      for (let k = 0; k < pe.activos; k++) {
        const e = pe.items[k];
        if (!finito(e.x) || !finito(e.y) || !finito(e.vida)) {
          malos.push(`enemigo NaN en el paso ${t}`); return;
        }
      }
      const pp = E.proyectiles.pool;
      for (let k = 0; k < pp.activos; k++) {
        const p = pp.items[k];
        if (!finito(p.x) || !finito(p.y)) {
          malos.push(`proyectil NaN en el paso ${t}`); return;
        }
      }

      // LOS CONTADORES QUE SE LLEVAN A MANO. `elitesVivos` y `escoltasVivos` se
      // suben al aparecer y se bajan en DOS sitios —al morir y al reciclarse por
      // lejania—, asi que una tercera puerta de salida los desviaria sin que
      // saltara nada. Y desviados no se ven: lo que se ve es que dejan de salir
      // elites (el director exige `elitesVivos === 0` para soltar el siguiente)
      // o que la Hidra se queda regenerandose para siempre.
      let elites = 0, escoltas = 0;
      for (let k = 0; k < pe.activos; k++) {
        if (pe.items[k].def && pe.items[k].def.cofre) elites++;
        if (pe.items[k].def && pe.items[k].def.escolta) escoltas++;
      }
      if (elites !== E.enemigos.elitesVivos) {
        malos.push(`elitesVivos dice ${E.enemigos.elitesVivos} y hay ${elites} (paso ${t})`);
      }
      if (escoltas !== E.enemigos.escoltasVivos) {
        malos.push(`escoltasVivos dice ${E.enemigos.escoltasVivos} y hay ${escoltas} (paso ${t})`);
      }
      // La cola de subidas de nivel no puede crecer sin parar: si crece, hay
      // jugadores encolados que nunca llegan a elegir.
      if (P.cola.length > 8) malos.push(`la cola de subidas tiene ${P.cola.length} (paso ${t})`);
    };

    for (let t = 0; t < pasos; t += trozo) {
      // La subida de nivel congela el mundo hasta que alguien elige.
      for (let k = 0; k < trozo; k++) {
        if (P.abierto) {
          P.animando = 0;
          P.relojGiro = P.giroTotal;
          P.elegir(0);
          nivelesSubidos++;
        }
        // Y el cofre, que congela el mundo igual y solo lo cierra una
        // pulsacion. Sin esto la partida se quedaba parada en el primer cofre y
        // el reloj no llegaba nunca al minuto veinte.
        if (P.cofreAbierto) { P.saltarGiro(); P.cerrarCofre(); cofresAbiertos++; }
        E.avanzar(1);
      }
      if (E.enemigos.activos > picoEnemigos) picoEnemigos = E.enemigos.activos;
      revisar(t);
      if (malos.length) break;
      if ((t / trozo) % 20 === 0) {
        marcas.push({
          minuto: +(E.director.t / 60).toFixed(1),
          enemigos: E.enemigos.activos,
          memoria: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1
        });
      }
    }

    const pools = {
      enemigos: { pico: E.enemigos.pool.pico, agotado: E.enemigos.pool.agotado,
                  cap: E.enemigos.pool.capacidad },
      proyectiles: { pico: E.proyectiles.pool.pico, agotado: E.proyectiles.pool.agotado,
                     cap: E.proyectiles.pool.capacidad },
      recogibles: { pico: E.recogibles.pool.pico, agotado: E.recogibles.pool.agotado,
                    cap: E.recogibles.pool.capacidad },
      disparos: { pico: E.disparos.pool.pico, agotado: E.disparos.pool.agotado,
                  cap: E.disparos.pool.capacidad },
      zonas: { pico: E.zonas.pool.pico, agotado: E.zonas.pool.agotado,
               cap: E.zonas.pool.capacidad }
    };
    E.bucle.arrancar();
    return {
      malos, marcas, pools, picoEnemigos, nivelesSubidos, cofresAbiertos,
      absorbidas: E.recogibles.absorbidas,
      minuto: E.director.t / 60,
      bajas: E.enemigos.bajas,
      nivel: E.jugadores()[0].nivel,
      fases: Object.keys(E.meta.fases || {}).length
    };
  }, MINUTOS);

  console.log(`\n  minuto ${informe.minuto.toFixed(1)} · ${informe.bajas} bajas · ` +
              `nivel ${informe.nivel} · ${informe.nivelesSubidos} subidas · ` +
              `${informe.cofresAbiertos} cofres`);
  console.log('  pico de enemigos vivos:', informe.picoEnemigos);
  console.log('\n  POOLS (pico / capacidad / peticiones rechazadas)');
  for (const [k, p] of Object.entries(informe.pools)) {
    console.log(`    ${k.padEnd(12)} ${String(p.pico).padStart(5)} / ${String(p.cap).padStart(5)}` +
                `   agotado: ${p.agotado}`);
  }
  if (informe.marcas.length && informe.marcas[0].memoria > 0) {
    const m = informe.marcas;
    console.log(`\n  memoria: ${m[0].memoria} MB al empezar -> ` +
                `${m[m.length - 1].memoria} MB al acabar`);
  }

  console.log('');
  comprobar(informe.malos.length === 0,
            informe.malos.length ? informe.malos[0] : 'ninguna coordenada se vuelve NaN');
  // EL RELOJ VA UN 2-3% POR DETRAS DE LOS PASOS DADOS, y es correcto: el
  // hitstop congela la logica unos fotogramas en cada golpe fuerte (ver
  // VFX.congelado en main.js) y el director no corre mientras dura. Medido: 30
  // segundos de congelado repartidos en veinte minutos de matanza. Lo que esta
  // comprobacion busca no es el minuto exacto, es que la partida no se quede
  // ATASCADA -un menu que nadie cierra, un cofre esperando una pulsacion-, que
  // es lo que dejaria el reloj clavado.
  // El margen es del 10% porque el congelado ESCALA CON LOS JUGADORES: cada
  // golpe fuerte de cada uno para el mundo unos fotogramas, asi que con cuatro
  // se pierde el doble que con uno (medido: 0,5 min con uno, 1,0 con cuatro).
  comprobar(informe.minuto >= MINUTOS * 0.90,
            `el reloj avanza hasta el final sin atascarse: minuto ` +
            `${informe.minuto.toFixed(1)} de ${MINUTOS} (el resto es hitstop)`);
  // El minimo va POR MINUTO y no como cifra fija: la prueba se lanza tambien con
  // tres o cinco minutos para mirar algo concreto, y un umbral pensado para
  // veinte fallaba siempre en esas. Medido: unas 195 bajas por minuto con un
  // jugador quieto y 434 con cuatro, asi que 60 es un suelo que solo se rompe si
  // la horda ha dejado de morir de verdad.
  comprobar(informe.bajas > MINUTOS * 60,
            `la horda muere de verdad (${informe.bajas} bajas en ${MINUTOS} min)`);
  for (const [k, p] of Object.entries(informe.pools)) {
    // El de gemas es la excepcion, y a proposito: cuando se llena, la
    // experiencia de la siguiente gema se le SUMA a una que ya existe
    // (`_absorber` en entidades/recogible.js), asi que agotarse no pierde nada
    // — solo junta. Lo que se comprueba de el es que esa via se use, no que no
    // se use: con el jugador quieto y sin recoger nada, tiene que llenarse.
    if (k === 'recogibles') continue;
    comprobar(p.agotado === 0, `el pool de ${k} no se agota (pico ${p.pico}/${p.cap})`);
  }
  comprobar(informe.pools.recogibles.agotado === 0 || informe.absorbidas > 0,
            `las gemas que no caben se absorben en otras (${informe.absorbidas} absorbidas, ` +
            `ninguna experiencia perdida)`);
  comprobar(excepciones.length === 0,
            excepciones.length === 0 ? 'sin excepciones' : 'EXCEPCIONES: ' + excepciones.slice(0, 3).join(' | '));
  comprobar(quejas.length === 0,
            quejas.length === 0 ? 'sin errores en consola' : 'CONSOLA: ' + quejas.slice(0, 3).join(' | '));
} finally {
  await nav.close().catch(() => {});
  servidor.kill();
}

console.log(fallos === 0 ? '\nTODO CORRECTO.\n' : `\n${fallos} FALLO(S).\n`);
process.exit(fallos ? 1 : 0);
