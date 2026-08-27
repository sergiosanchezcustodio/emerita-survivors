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
// MODO MARATÓN: los jugadores aguantan muchísimo.
//
//   node herramientas\probar-partida-en-red.js 330 maraton
//
// Moviéndose al tuntún, el equipo suele caer entre los dos y los cinco minutos,
// y hay fallos que solo aparecen pasado ese rato.
//
// SE HACE CON UNA MEJORA ENORME DE VIDA, NO PONIENDO `inmortal` A MANO, y la
// diferencia importa. La primera versión recorría las pestañas poniéndoles el
// booleano una detrás de otra: eso es cambiar el estado de la simulación en
// momentos distintos en cada máquina, así que durante unos fotogramas unas
// jugaban con jugadores inmortales y otras no. Con dos pestañas la ventana era
// tan corta que casi nunca se notaba; con cuatro se abrió y la partida se
// separó a los veintitrés segundos. Parecía un fallo del juego y era del banco
// de pruebas.
//
// La mejora, en cambio, viaja en el saludo: las cuatro máquinas la reciben
// antes de empezar y la aplican al crear a los jugadores. Idéntica por
// construcción, sin ventana que se pueda abrir.
const MARATON = process.argv[3] === 'maraton';
const VIDA_MARATON = 2000;   // +4% por nivel: unas ochenta veces la vida normal
// MODO CORTE: a mitad de partida, el anfitrión se va de golpe.
//
//   node herramientas\probar-partida-en-red.js 20 corte
//
// Comprueba lo que pasa cuando se cae la red, que es lo que NO se puede
// ensayar jugando de verdad sin desenchufar algo: que salga el cartel, que el
// mundo se quede quieto esperando decisión, y que al elegir seguir en solitario
// la partida continúe donde estaba y quien queda pueda moverse.
//
// Se corta al ANFITRIÓN a propósito: quien sobrevive es entonces quien se
// unió, que llevaba el puesto 1. Ese es el caso delicado — si el búfer de
// pulsaciones no cambia de puesto, se queda sin poder moverse.
const CORTE = process.argv[3] === 'corte';
// CUÁNTOS JUGADORES. Dos por defecto; con `3` o `4` se prueba la estrella, que
// es donde el anfitrión tiene que REENVIAR lo que pulsa cada invitado a los
// demás — los invitados no se ven entre ellos.
const CUANTOS = Math.max(2, Math.min(4, Number(process.argv[4]) || 2));

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

// El corte, con el juego ya en marcha.
async function probarCorte(A, B) {
  const estado = (p) => p.pagina.evaluate(() => ({
    paso: window.EMERITA.lockstep.paso,
    jugadores: window.EMERITA.jugadores().length,
    red: window.EMERITA.mando().redActiva
  }));

  await A.pagina.waitForTimeout(2500);
  const antes = await estado(B);
  comprobar(antes.red === 1 && antes.jugadores === 2,
            `en marcha: ${antes.jugadores} jugadores, paso ${antes.paso}`);

  // El anfitrión se va. Sobrevive quien se unió, que lleva el puesto 1.
  await A.pagina.evaluate(() => window.EMERITA.red.salir());
  await B.pagina.waitForTimeout(1200);
  const cortado = await estado(B);
  comprobar(cortado.red === 0, 'la partida en red se da por terminada');

  await B.pagina.waitForTimeout(1200);
  const quieto = await estado(B);
  comprobar(quieto.paso === cortado.paso,
            `el mundo se queda quieto esperando decisión (paso ${quieto.paso})`);

  // SEGUIR EN SOLITARIO.
  await B.pagina.keyboard.press('Enter');
  await B.pagina.waitForTimeout(1500);
  const solo = await estado(B);
  comprobar(solo.jugadores === 1, 'queda un solo jugador');
  comprobar(solo.paso > quieto.paso,
            `y la partida sigue DONDE ESTABA, no desde cero ` +
            `(${quieto.paso} -> ${solo.paso})`);

  const antesX = await B.pagina.evaluate(() => window.EMERITA.jugadores()[0].x);
  await teclear(B, 'KeyD', 900);
  const despuesX = await B.pagina.evaluate(() => window.EMERITA.jugadores()[0].x);
  comprobar(Math.abs(despuesX - antesX) > 5,
            'y quien queda PUEDE MOVERSE, aunque llevara el puesto 2');

  for (const p of [A, B]) {
    const otros = p.errores.filter((t) => !/AudioContext/.test(t) && !/favicon/.test(t) &&
                                          !/ha salido/.test(t));
    comprobar(otros.length === 0,
              otros.length === 0 ? `sin errores (${p.nombre})`
                                 : `errores en ${p.nombre}: ${otros.slice(0, 2).join(' | ')}`);
  }
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
  const otras = [];
  let todas = [];
  try {
    A = await abrirJuego(navegador, 'anfitrión');
    B = await abrirJuego(navegador, 'invitada');
    for (let i = 2; i < CUANTOS; i++) {
      otras.push(await abrirJuego(navegador, `invitada ${i + 1}`));
    }
    todas = [A, B].concat(otras);
    comprobar(true, `${todas.length} pestañas cargan el juego`);

    // MEJORAS DISTINTAS EN CADA PUNTA, y esto es lo que de verdad hay que
    // comprobar.
    //
    // Con las dos pestañas recién abiertas, el progreso guardado está vacío en
    // las dos y son iguales por accidente: una prueba así pasaría aunque el
    // progreso no viajara en el saludo. Se le dan mejoras diferentes a cada una
    // —que es lo normal entre dos personas— y así, si cada máquina no simula al
    // otro con LAS SUYAS, la partida se separa en cuanto alguien recibe un
    // golpe.
    const MEJORAS = [{ vitalidad: 3, furia: 2 }, { premura: 4, coraza: 1 },
                     { codicia: 2, furia: 1 }, { coraza: 3, premura: 1 }];
    for (let i = 0; i < todas.length; i++) {
      const suyas = { ...MEJORAS[i % MEJORAS.length] };
      if (MARATON) suyas.vitalidad = VIDA_MARATON;
      await todas[i].pagina.evaluate((m) => { window.EMERITA.meta.potenciadores = m; }, suyas);
    }
    comprobar(true, `cada punta con mejoras distintas (${todas.length} juegos distintos)`);

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

    // UNA INVITACIÓN MÁS POR CADA JUGADOR EXTRA. Cada conexión trae sus propias
    // credenciales, así que el baile se repite entero: no vale reenviar el
    // mismo código a dos personas.
    for (let i = 0; i < otras.length; i++) {
      const inv = await A.pagina.evaluate(() => window.EMERITA.red.invitar());
      const res = await otras[i].pagina.evaluate((c) => window.EMERITA.red.responder(c), inv);
      const ok = await A.pagina.evaluate((c) => window.EMERITA.red.aceptar(c), res);
      comprobar(ok === true, `se conecta el jugador ${i + 3}`);
      if (!ok) return;
    }
    const cuantosVe = await A.pagina.evaluate(() => window.EMERITA.red.conectados);
    comprobar(cuantosVe === todas.length - 1,
              `el anfitrión ve ${cuantosVe} invitado(s)`);

    // EL RETARDO DE ENTRADA SE PONE SOLO, midiendo el viaje.
    //
    // Llevaba clavado en 4 fotogramas desde que se eligió, y se eligió sobre una
    // ida y vuelta de 1,4 ms entre dos pestañas de la misma máquina — que no es
    // una latencia, es el suelo del sistema. Aquí el viaje es igual de corto, así
    // que lo que se comprueba es que el número LO PONGA LA MEDIDA y caiga en lo
    // razonable. El suelo son tres fotogramas, y lo puso esta misma prueba: con
    // dos, cuatro pestañas en una máquina se bloquearon esperándose.
    //
    // Se le da un segundo: son veinte pings y van por el canal fiable.
    await A.pagina.waitForTimeout(1200);
    const retardos = [];
    for (const p of todas) {
      retardos.push(await p.pagina.evaluate(() => window.EMERITA.lockstep.retardo));
    }
    comprobar(retardos.every((r) => r >= 3 && r <= 8),
              `el retardo queda dentro de lo admitido: ${retardos.join(', ')}`);

    // Y QUE LO HAYA PUESTO LA MEDIDA, no que se parezca a un número.
    //
    // Aquí el viaje es de un milisegundo y la cuenta da 4, que es justo el valor
    // que traía de fábrica: comparar contra 4 no distinguiría "medido" de "sin
    // tocar". Se le pide la medida otra vez y se comprueba que lo que devuelve
    // es lo que hay puesto.
    const medida = await A.pagina.evaluate(async () => {
      const r = await window.EMERITA.red.ajustarRetardo();
      return r ? { ...r, puesto: window.EMERITA.lockstep.retardo } : null;
    });
    comprobar(medida && medida.fotogramas === medida.puesto,
              medida
                ? `la medida manda: viaje ${medida.mediana.toFixed(1)} ms -> ` +
                  `${medida.fotogramas} fotogramas, y es lo que hay puesto`
                : 'la medida no ha devuelto nada');

    // --- La partida ----------------------------------------------------------
    await A.pagina.evaluate(() => window.EMERITA.red.jugar());
    await A.pagina.waitForTimeout(500);

    const enPartida = await B.pagina.evaluate(() => !!window.EMERITA.lockstep);
    comprobar(enPartida, 'la invitada entra en la partida sola');

    // ¿Ha llegado el progreso del otro? Se mira en la vida máxima: el jugador 1
    // lleva vitalidad 3 y el 2 no, así que TIENEN que ser distintas — y las dos
    // máquinas tienen que ver los mismos dos números.
    const vidas = (p) => p.pagina.evaluate(
      () => window.EMERITA.jugadores().map((j) => j.vidaMaxima));
    const vA = await vidas(A);
    comprobar(vA.length === todas.length && new Set(vA).size === vA.length,
              `los ${vA.length} jugadores tienen estadísticas distintas (${vA.join(' · ')})`);
    let coinciden = true;
    for (const p of todas) {
      if (JSON.stringify(await vidas(p)) !== JSON.stringify(vA)) coinciden = false;
    }
    comprobar(coinciden,
              'y TODAS las máquinas ven las mismas: el progreso de cada uno ha viajado');

    if (MARATON) {
      const vidas = await A.pagina.evaluate(
        () => window.EMERITA.jugadores().map((j) => Math.round(j.vidaMaxima)));
      console.log(`  ..  modo maratón: vida ${vidas.join(' / ')}`);
    }

    if (CORTE) { await probarCorte(A, B); return; }

    // Moverse de verdad, en las dos, en direcciones distintas. Quedarse quieto
    // probaría mucho menos: sin movimiento no hay rumbo de cámara, y sin rumbo
    // no se ejecuta la mitad de la lógica de aparición de la horda.
    const teclas = ['KeyD', 'KeyS', 'KeyA', 'KeyW'];
    const hasta = Date.now() + SEGUNDOS * 1000;
    let vuelta = 0;
    let terminada = '';
    while (Date.now() < hasta) {
      await Promise.all(todas.map((p, i) => teclear(p, teclas[(vuelta + i * 2) % 4], 700)));

      // CONFIRMAR SOLO SI HAY UN MENÚ DE NIVEL ABIERTO.
      //
      // Antes se pulsaba Enter a ciegas cada vuelta, y eso convertía la prueba
      // en basura en cuanto la partida se acababa: el equipo muere, sale el
      // resumen, y los Enter siguientes navegan los menús y arrancan PARTIDAS
      // NUEVAS sueltas. Todo lo medido a partir de ahí es de otra partida. Se
      // vio porque los dos jugadores acabaron con distinta vida máxima y
      // distinta velocidad: ya no eran ni el mismo personaje.
      for (const p of todas) {
        const m = await p.pagina.evaluate(() => window.EMERITA.mando());
        if (m.subiendoNivel || m.cofre) await p.pagina.keyboard.press('Enter');
      }

      // Y SI LA PARTIDA SE HA ACABADO, se para aquí. Que el equipo muera no es
      // un fallo -- es un juego- pero seguir midiendo después sí lo es.
      const fin = await A.pagina.evaluate(() => {
        const m = window.EMERITA.mando();
        return m.final || (m.pantalla !== 2 ? 'fuera de la partida' : '');
      });
      if (fin) { terminada = fin; break; }
      vuelta++;
    }
    if (terminada) {
      console.log(`
  La partida se acabó por su cuenta (${terminada}). ` +
                  'Lo medido hasta ahí vale; lo de después no se mide.');
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
    // ¿SIGUE VIVA AL FINAL? Esto es distinto de "ha avanzado", y la diferencia
    // importa: una partida que se bloquea a la mitad ha avanzado mucho y está
    // muerta. Pasó con cuatro jugadores —el anfitrión no reenviaba la carta
    // elegida a los demás invitados, sus menús no se cerraban nunca y todo se
    // paraba— y esta prueba lo dio por bueno, porque miraba el total.
    // EL MENÚ DE NIVEL PARA EL MUNDO A PROPÓSITO, y hay que cerrarlo antes de
    // medir esto o la prueba se acusa a sí misma.
    //
    // El bucle de arriba pulsa Enter una vez por vuelta, así que puede acabar
    // justo con el menú abierto: entonces el mundo está parado porque TIENE que
    // estarlo —espera a que los cuatro elijan carta— y este pulso lo leía como
    // "se han quedado bloqueadas". Salía con cuatro jugadores y no con dos,
    // porque hacen falta cuatro elecciones y hay cuatro veces más ocasiones de
    // pillarlo abierto. Dos horas buscando un bloqueo que no existía.
    for (let intento = 0; intento < 8; intento++) {
      let abiertos = 0;
      for (const p of todas) {
        const m = await p.pagina.evaluate(() => window.EMERITA.mando());
        if (m.subiendoNivel || m.cofre) { abiertos++; await p.pagina.keyboard.press('Enter'); }
      }
      if (abiertos === 0) break;
      await A.pagina.waitForTimeout(250);
    }

    const antesDelPulso = [];
    for (const p of todas) antesDelPulso.push((await leer(p)).paso);
    await A.pagina.waitForTimeout(2000);
    let vivas = 0;
    for (let i = 0; i < todas.length; i++) {
      if ((await leer(todas[i])).paso > antesDelPulso[i]) vivas++;
    }
    comprobar(vivas === todas.length,
              vivas === todas.length
                ? 'las partidas SIGUEN avanzando al final, no solo han avanzado'
                : `SE HAN QUEDADO BLOQUEADAS: solo ${vivas} de ${todas.length} avanzan`);

    const rA = await leer(A), rB = await leer(B);
    const rTodas = [];
    for (const p of todas) rTodas.push(await leer(p));

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

    // QUE LA PARTIDA SE ACABE NO ES UN FALLO. Es un juego: el equipo muere.
    // Lo que se comprueba entonces es que llegó a jugarse de verdad y que las
    // dos puntas terminaron en el mismo sitio.
    //
    // EL LISTÓN ES EL MISMO CON DOS QUE CON CUATRO. Hubo un rato en que estaba
    // rebajado para tres o más, porque una tanda de cuatro dio siete pasos por
    // segundo y lo achaqué a que cuatro copias del juego se pisan por la CPU.
    // Era mentira: estaban BLOQUEADAS. Con el bloqueo arreglado, cuatro
    // pestañas en esta misma máquina van a sesenta pasos por segundo, o sea a
    // tiempo real. Rebajar el listón habría tapado el siguiente bloqueo igual
    // que tapó aquel.
    const minimo = terminada ? 600 : SEGUNDOS * 60 * 0.5;
    const ritmo = rA.paso / SEGUNDOS;
    if (CUANTOS >= 3) {
      console.log(`  ..  ${ritmo.toFixed(1)} pasos por segundo con ${CUANTOS} ` +
                  'pestañas en esta máquina (60 es tiempo real)');
    }
    comprobar(rA.paso > minimo,
              `el mundo AVANZA en el anfitrión (${rA.paso} pasos` +
              (terminada ? ', partida terminada' : ` de ~${SEGUNDOS * 60}`) + ')');
    comprobar(rB.paso > minimo,
              `el mundo AVANZA en la invitada (${rB.paso} pasos)`);
    let masLejos = 0;
    for (const r of rTodas) masLejos = Math.max(masLejos, Math.abs(r.paso - rA.paso));
    comprobar(masLejos < 300,
              `las ${todas.length} van a la par (la que más, ${masLejos} pasos)`);

    // Lo que de verdad importa: que nadie haya cantado desincronización.
    const rotos = [];
    for (const p of todas) {
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
    for (const p of todas) {
      const tablas = await p.pagina.evaluate(() => window.__tablas || []);
      const detalle = tablas.find((t) => Array.isArray(t) && t.length > 0 && t[0].campo);
      if (detalle) {
        console.log(`
  DETALLE (${p.nombre}):`);
        console.table(detalle);
      }
    }

    for (const p of todas) {
      const otros = p.errores.filter((t) => !/se han separado/.test(t) &&
                                            !/diferencia\(s\) concreta/.test(t) &&
                                            !/AudioContext/.test(t) &&
                                            !/favicon/.test(t));
      comprobar(otros.length === 0,
                otros.length === 0 ? `sin errores en la consola (${p.nombre})`
                                   : `errores en ${p.nombre}: ${otros.slice(0, 3).join(' | ')}`);
    }
  } finally {
    for (const p of [A, B].concat(otras)) {
      if (p) await p.contexto.close().catch(() => {});
    }
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
