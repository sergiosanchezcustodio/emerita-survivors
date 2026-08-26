// Comprueba el búfer de pulsaciones (js/core/lockstep.js) sin navegador.
//
//   node herramientas\probar-lockstep.js
//
// Monta LAS DOS PUNTAS de una partida en red en la misma memoria y las hace
// hablar entre ellas, con un canal falso que se puede maltratar a voluntad:
// perder paquetes, entregarlos al revés, retrasarlos, colar basura. Nada de eso
// se puede provocar a mano en una partida de verdad, y todo va a pasar.
//
// Lo que se comprueba es lo que decide si el cooperativo funciona:
//
//   - que las dos puntas acaben con EXACTAMENTE las mismas pulsaciones
//   - que perder paquetes sueltos no se note, gracias a la redundancia
//   - que perder demasiados haga ESPERAR y no inventar
//   - que un paquete tardío no cambie el pasado ya jugado
//   - que nadie pueda hablar por el puesto de otro

import { crearBufer, FORMATO } from '../js/core/lockstep.js';

const JUGADORES = 4;
let fallos = 0;

function comprobar(condicion, texto) {
  console.log(`  ${condicion ? 'OK  ' : 'MAL '} ${texto}`);
  if (!condicion) fallos++;
}

// Un mando de mentira que devuelve algo distinto en cada paso, para que haya
// datos que comparar y no una ristra de ceros que coincidiría por accidente.
function entradaFalsa(paso, puesto) {
  const k = ((paso * 2654435761) ^ (puesto * 40503)) >>> 0;
  const controles = [];
  for (let i = 0; i < JUGADORES; i++) {
    controles.push({
      // EL VALOR VA EN EL CONTROL 0, no en el del puesto, porque es lo que pasa
      // de verdad: quien se une lleva el puesto 1 de la partida pero juega con
      // SU teclado, que es el control 0 de su máquina. Poniéndolo en el control
      // 1, el jugador 2 registraba ceros y todo salía verde sin comprobar nada.
      ejeX: i === 0 ? ((k % 201) - 100) / 100 : 0,
      ejeY: i === 0 ? (((k >>> 8) % 201) - 100) / 100 : 0,
      _flancoBotones: i === 0 ? ((k >>> 16) & 0xff) : 0
    });
  }
  return { controles };
}

// Un par de búferes conectados por un canal que se porta mal a voluntad.
function montarPareja(perdida, retardoRed) {
  const a = crearBufer(), b = crearBufer();
  a.iniciar(JUGADORES); b.iniciar(JUGADORES);
  a.reiniciar(2, [0]);       // esta máquina lleva el puesto 0
  b.reiniciar(2, [1]);       // la otra, el 1
  const enVuelo = [];        // paquetes viajando: [paso de entrega, destino, bytes]
  let perdidos = 0, mandados = 0;

  function mandar(de, para, bytes, ahora) {
    mandados++;
    if (perdida(mandados)) { perdidos++; return; }
    // Copia: el búfer de envío se reutiliza, así que quedarse con la referencia
    // sería quedarse con lo que se mande DESPUÉS. Es justo lo que hace la red de
    // verdad —se lleva una copia— y no simularlo daría un aprobado falso.
    enVuelo.push([ahora + retardoRed, para, bytes.slice()]);
  }

  function entregar(ahora) {
    for (let i = enVuelo.length - 1; i >= 0; i--) {
      if (enVuelo[i][0] > ahora) continue;
      enVuelo[i][1].aplicar(enVuelo[i][2]);
      enVuelo.splice(i, 1);
    }
  }

  // Entrega inmediata, para la fase de desagüe del final.
  function entregarDirecto(para, bytes) { para.aplicar(bytes.slice()); }

  return { a, b, mandar, entregar, entregarDirecto,
           stats: () => ({ mandados, perdidos }) };
}

// Juega N pasos en las dos puntas y devuelve lo que cada una consumió.
//
// Al final se dejan correr unos pasos con el canal limpio para que las dos se
// pongan al día. Sin eso, cortar la cuenta en seco deja a una punta unos pasos
// por delante de la otra y la comparación diría "divergen" cuando lo único que
// pasa es que una iba más adelantada — que en lockstep es normal y momentáneo.
function jugar(pasos, perdida, retardoRed) {
  const p = montarPareja(perdida, retardoRed);
  const consumidoA = [], consumidoB = [];
  const DESAGUE = 80;

  for (let t = 0; t < pasos + DESAGUE; t++) {
    p.entregar(t);
    const limpio = t >= pasos;

    // SE MANDA AUNQUE NO SE PUEDA AVANZAR, y esto no es un detalle.
    //
    // Una punta parada esperando sigue teniendo pulsaciones registradas que el
    // otro necesita. Si se callara mientras espera, lo mataría de hambre: el
    // otro tampoco podría avanzar, y los dos se quedarían esperándose para
    // siempre. Callarse al esperar es como se construye un bloqueo mutuo.
    for (const [buf, otro, puesto] of [[p.a, p.b, 0], [p.b, p.a, 1]]) {
      if (buf.listo()) buf.registrar(entradaFalsa(buf.paso, puesto));
      const bytes = buf.empaquetar(puesto);
      if (!bytes) continue;                 // todavía no hay nada que contar
      if (limpio) p.entregarDirecto(otro, bytes);
      else p.mandar(buf, otro, bytes, t);
    }

    // Y se da el paso solo si se sabe todo.
    for (const [buf, salida] of [[p.a, consumidoA], [p.b, consumidoB]]) {
      if (!buf.listo()) { if (!limpio) buf.anotarEspera(); continue; }
      const m0 = buf.marcoDe(0), m1 = buf.marcoDe(1);
      salida.push(`${buf.paso}:${m0.ejeX.toFixed(4)},${m0.ejeY.toFixed(4)},${m0.botones}|` +
                  `${m1.ejeX.toFixed(4)},${m1.ejeY.toFixed(4)},${m1.botones}`);
      buf.avanzar();
    }
  }
  return { p, consumidoA, consumidoB };
}

// Compara lo que han consumido las dos puntas. Lo que TIENE que cumplirse es
// que los pasos que las dos han jugado sean idénticos; que una vaya unos pasos
// por delante no es un fallo.
function mismasPulsaciones(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return false;
  return n > 0;
}

console.log('BÚFER DE PULSACIONES\n');
console.log(`Formato: ${FORMATO.CABECERA + FORMATO.REDUNDANCIA * FORMATO.POR_MARCO} bytes ` +
            `por paquete (${FORMATO.REDUNDANCIA} pulsaciones de redundancia), ` +
            `${((FORMATO.CABECERA + FORMATO.REDUNDANCIA * FORMATO.POR_MARCO) * 60 / 1024).toFixed(1)} KB/s a 60 Hz.\n`);

console.log('Canal perfecto');
{
  const r = jugar(400, () => false, 0);
  comprobar(r.consumidoA.length > 380, `las dos puntas avanzan (${r.consumidoA.length} pasos)`);
  comprobar(mismasPulsaciones(r.consumidoA, r.consumidoB),
            'las dos consumen EXACTAMENTE las mismas pulsaciones');
  comprobar(r.p.a.esperas === 0 && r.p.b.esperas === 0, 'nadie ha tenido que esperar');
}

console.log('\nUno de cada tres paquetes se pierde');
{
  const r = jugar(400, (n) => n % 3 === 0, 0);
  comprobar(mismasPulsaciones(r.consumidoA, r.consumidoB),
            'las dos siguen consumiendo lo mismo');
  comprobar(r.p.a.esperas === 0 && r.p.b.esperas === 0,
            'y NO ha hecho falta esperar: la redundancia lo tapa');
  const s = r.p.stats();
  console.log(`       ${s.perdidos} de ${s.mandados} paquetes perdidos, sin consecuencias`);
}

console.log('\nSe pierden SIETE seguidos (más que la redundancia)');
{
  // Del paquete 50 al 56 de cada punta: siete seguidos contra seis de repuesto.
  const r = jugar(200, (n) => n >= 100 && n < 114, 0);
  comprobar(mismasPulsaciones(r.consumidoA, r.consumidoB),
            'las dos siguen consumiendo lo mismo');
  comprobar(r.p.a.esperas > 0 || r.p.b.esperas > 0,
            `alguien ha tenido que ESPERAR (${r.p.a.esperas + r.p.b.esperas} pasos), ` +
            'que es lo correcto: mejor parar que inventar');
}

console.log('\nRed con 3 pasos de viaje');
{
  const r = jugar(400, () => false, 3);
  comprobar(mismasPulsaciones(r.consumidoA, r.consumidoB),
            'las dos consumen lo mismo');
  comprobar(r.p.a.esperas === 0 && r.p.b.esperas === 0,
            'sin esperas: 3 pasos de viaje caben en los 4 de retardo');
}

console.log('\nRed con 6 pasos de viaje (más que el retardo)');
{
  const r = jugar(400, () => false, 6);
  comprobar(mismasPulsaciones(r.consumidoA, r.consumidoB),
            'las dos consumen lo mismo AUNQUE haya que esperar');
  comprobar(r.p.a.esperas > 0,
            `se espera (${r.p.a.esperas} pasos de ${400}): el retardo se ha quedado corto, ` +
            'y así es como se nota');
}

console.log('\nCASOS QUE TIENEN QUE RECHAZARSE');
{
  const b = crearBufer();
  b.iniciar(JUGADORES);
  b.reiniciar(2, [0]);

  // Un paquete que dice ser del puesto 0, que es de esta máquina.
  const suplantador = crearBufer();
  suplantador.iniciar(JUGADORES);
  suplantador.reiniciar(2, [0]);
  suplantador.registrar(entradaFalsa(0, 0));
  comprobar(b.aplicar(suplantador.empaquetar(0)) === 0,
            'nadie puede hablar por un puesto de esta máquina');

  // Un paquete del pasado.
  const otro = crearBufer();
  otro.iniciar(JUGADORES);
  otro.reiniciar(2, [1]);
  otro.registrar(entradaFalsa(0, 1));
  const viejo = otro.empaquetar(1).slice();
  for (let i = 0; i < 40; i++) {
    b.registrar(entradaFalsa(b.paso, 0));
    otro.registrar(entradaFalsa(otro.paso, 1));
    b.aplicar(otro.empaquetar(1));
    if (b.listo()) b.avanzar();
    if (otro.listo()) otro.avanzar();
  }
  comprobar(b.aplicar(viejo) === 0, 'un paquete tardío no cambia el pasado ya jugado');

  // Basura.
  comprobar(b.aplicar(new Uint8Array([0])) === 0, 'un paquete cortado se descarta');
  comprobar(b.aplicar(new Uint8Array(42)) === 0, 'un paquete con tipo desconocido se descarta');
  const puestoRaro = new Uint8Array(FORMATO.CABECERA + FORMATO.POR_MARCO);
  puestoRaro[0] = FORMATO.TIPO_PULSACIONES;
  puestoRaro[1] = 99;
  comprobar(b.aplicar(puestoRaro) === 0, 'un puesto que no existe se descarta');
}

console.log('\nCADA PUESTO PROPIO LEE SU MANDO');
{
  // Quien se une lleva el puesto 1 pero juega con el control 0 de su maquina.
  const b = crearBufer();
  b.iniciar(JUGADORES);
  b.reiniciar(2, [1]);
  b.registrar(entradaFalsa(0, 1));
  const ranura = (b.paso + b.retardo) & (FORMATO.CAPACIDAD - 1);
  const leido = b._ejes[ranura * JUGADORES * 2 + 1 * 2];
  comprobar(leido !== 0,
            'el puesto 1 de quien se une lee el control 0, no un segundo mando ' +
            `que no existe (leido ${leido})`);
}

console.log('\nEL PRIMER PASO NO ESPERA A NADIE');
{
  const b = crearBufer();
  b.iniciar(JUGADORES);
  b.reiniciar(2, [0]);
  comprobar(b.listo(), 'con el anillo vacío, los primeros pasos ya se pueden dar');
  let dados = 0;
  while (b.listo() && dados < 50) { b.registrar(entradaFalsa(b.paso, 0)); b.avanzar(); dados++; }
  comprobar(dados === b.retardo,
            `se dan exactamente ${b.retardo} pasos antes de tener que esperar al otro ` +
            `(dados ${dados}), que son los del retardo`);
}

console.log(fallos === 0 ? '\nTODO CORRECTO.\n' : `\n${fallos} FALLO(S).\n`);
process.exit(fallos === 0 ? 0 : 1);
