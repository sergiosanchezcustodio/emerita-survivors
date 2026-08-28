// Comprueba la capa de sincronización (js/red/sincro.js) sin navegador.
//
//   node herramientas\probar-sincro.js
//
// POR QUÉ EXISTE. Los tres últimos fallos del cooperativo vivían aquí y ninguno
// se probó antes de dárselo a Sergio: comparar el búfer de pulsaciones —que
// nunca puede coincidir entre dos máquinas—, comparar los campos de dibujo —que
// dependen de los fps de cada una— y retratar el mundo entero tres veces por
// segundo, que colgó un navegador. Los tres son lógica pura. Ninguno necesitaba
// WebRTC para salir a la luz; solo hacía falta montar las dos puntas y mirarlas.
//
// Lo que NO cubre, y conviene tenerlo escrito: el transporte de verdad, el
// dibujado y el recolector de basura. O sea, exactamente donde vivía el tercero.
// Para eso siguen haciendo falta dos navegadores y una persona jugando.

import { crearSincro } from '../js/red/sincro.js';
import { crearBufer } from '../js/core/lockstep.js';

let fallos = 0;
function comprobar(condicion, texto) {
  console.log(`  ${condicion ? 'OK  ' : 'MAL '} ${texto}`);
  if (!condicion) fallos++;
}

// --- Un mundo de mentira -----------------------------------------------------
//
// No hace falta el juego entero: a la capa de sincronización le da igual qué
// simula: solo pide unos números y los compara. Aquí se puede además TORCER uno
// a voluntad, que es lo que ninguna partida de verdad deja hacer a mano.
function crearMundo(nombre) {
  return {
    nombres: ['rng', 'jugadores', 'enemigos', 'disparos'],
    valores: [1, 2, 3, 4],
    disparos: [{ id: 0, vida: 3, x: 10 }, { id: 1, vida: 5, x: 20 }],
    nombre,
    partes() { return this.valores.slice(); },
    foto(grupos) {
      const f = {};
      if (!grupos || grupos.indexOf('disparos') >= 0) {
        f.disparos = this.disparos.map((d) => ({ ...d }));
      }
      return f;
    }
  };
}

// Comparación de fotos, con la misma forma que la del juego.
function comparaFotos(A, B, tope) {
  const salida = [];
  for (const grupo in A) {
    const a = A[grupo], b = B[grupo] || [];
    if (a.length !== b.length) {
      salida.push({ grupo, indice: '-', campo: '(cuántos)', pasada1: a.length, pasada2: b.length });
      continue;
    }
    for (let i = 0; i < a.length && salida.length < tope; i++) {
      for (const campo in a[i]) {
        if (a[i][campo] !== b[i][campo]) {
          salida.push({ grupo, indice: i, campo, pasada1: a[i][campo], pasada2: b[i][campo] });
        }
      }
    }
  }
  return salida;
}

// --- Una conexión de mentira -------------------------------------------------
function crearParConexiones() {
  const a = { alControl: null, alJuego: null, alCerrar: null, cortado: false, control: [] };
  const b = { alControl: null, alJuego: null, alCerrar: null, cortado: false, control: [] };
  // La entrega se encola y se vacía a mano: así se controla exactamente cuándo
  // llega cada cosa, que es medio banco de pruebas.
  const cola = [];
  a.enviarControl = (t) => { a.control.push(t); cola.push([b, 'control', t]); return true; };
  b.enviarControl = (t) => { b.control.push(t); cola.push([a, 'control', t]); return true; };
  a.enviarJuego = (d) => { if (!a.cortado) cola.push([b, 'juego', d.slice()]); return true; };
  b.enviarJuego = (d) => { if (!b.cortado) cola.push([a, 'juego', d.slice()]); return true; };
  const entregar = () => {
    const ahora = cola.splice(0, cola.length);
    for (const [destino, via, dato] of ahora) {
      if (via === 'control' && destino.alControl) destino.alControl(dato);
      else if (via === 'juego' && destino.alJuego) destino.alJuego(dato);
    }
  };
  return { a, b, entregar, pendientes: () => cola.length };
}

// --- El montaje --------------------------------------------------------------
function montar() {
  const con = crearParConexiones();
  const bufA = crearBufer(), bufB = crearBufer();
  bufA.iniciar(4); bufB.iniciar(4);
  const sincroA = crearSincro(bufA), sincroB = crearSincro(bufB);
  const mundoA = crearMundo('A'), mundoB = crearMundo('B');
  const rotos = { A: '', B: '' };

  const opciones = (mundo, quien, jugadorLocal) => ({
    esAnfitrion: jugadorLocal === 0,
    jugadorLocal,
    jugadores: 2,
    partesDe: () => mundo.partes(),
    nombres: mundo.nombres,
    fotoDe: (grupos) => mundo.foto(grupos),
    comparaFotos,
    alRomperse: (t) => { rotos[quien] = t; }
  });

  sincroA.empezar(con.a, opciones(mundoA, 'A', 0));
  sincroB.empezar(con.b, opciones(mundoB, 'B', 1));
  return { con, bufA, bufB, sincroA, sincroB, mundoA, mundoB, rotos };
}

const mandoQuieto = { controles: [{ ejeX: 0.5, ejeY: -0.25, _flancoBotones: 0 }] };

function correr(m, pasos) {
  let dadosA = 0, dadosB = 0;
  for (let t = 0; t < pasos; t++) {
    m.con.entregar();
    if (m.sincroA.antesDelPaso(mandoQuieto)) { m.bufA.avanzar(); m.sincroA.despuesDelPaso(); dadosA++; }
    if (m.sincroB.antesDelPaso(mandoQuieto)) { m.bufB.avanzar(); m.sincroB.despuesDelPaso(); dadosB++; }
  }
  m.con.entregar();
  return { dadosA, dadosB };
}

console.log('CAPA DE SINCRONIZACIÓN\n');

console.log('Dos mundos iguales');
{
  const m = montar();
  const r = correr(m, 200);
  comprobar(r.dadosA > 190 && r.dadosB > 190,
            `las dos avanzan (${r.dadosA} y ${r.dadosB} pasos)`);
  comprobar(!m.rotos.A && !m.rotos.B, 'nadie declara una desincronización que no existe');
  comprobar(m.sincroA.huellasComparadas > 5,
            `se han comparado ${m.sincroA.huellasComparadas} huellas de verdad ` +
            '(si esto fuera 0, la prueba no estaría comprobando nada)');
}

console.log('\nUn mundo se tuerce');
{
  const m = montar();
  correr(m, 60);
  comprobar(!m.rotos.A, 'hasta aquí, ninguna queja');
  // El componente 3 es "disparos".
  m.mundoB.valores[3] = 999;
  correr(m, 60);
  comprobar(!!m.rotos.A || !!m.rotos.B, 'la desincronización se detecta');
  const aviso = m.rotos.A || m.rotos.B;
  comprobar(/disparos/.test(aviso), `y dice EN QUÉ componente: "${aviso.slice(0, 90)}..."`);
}

console.log('\nY dice qué campo, no solo qué componente');
{
  const m = montar();
  correr(m, 60);
  m.mundoB.valores[3] = 999;
  m.mundoB.disparos[1].vida = 0;          // la diferencia de verdad
  const salida = [];
  const tablaOriginal = console.table;
  console.table = (x) => salida.push(x);
  correr(m, 80);
  console.table = tablaOriginal;
  const difs = salida.find((x) => Array.isArray(x) && x.length > 0);
  comprobar(!!difs, 'se intercambian los números y sale una tabla');
  if (difs) {
    // Las DOS puntas sacan su tabla, cada una desde su lado, así que los
    // valores salen en un orden o en el otro según cuál se mire. Lo que tiene
    // que cumplirse es que señale la entidad y el campo, y que enfrente los dos
    // valores de verdad.
    const fila = difs.find((d) => d.campo === 'vida');
    const valores = fila ? [fila.pasada1, fila.pasada2].sort() : [];
    comprobar(!!fila && fila.indice === 1 && valores[0] === 0 && valores[1] === 5,
              `señala el campo exacto: disparo ${fila && fila.indice}, ` +
              `${fila && fila.campo} = ${fila && fila.pasada1} de un lado y ` +
              `${fila && fila.pasada2} del otro`);
  }
}

console.log('\nSi el otro se calla, el mundo se para (y no inventa)');
{
  const m = montar();
  correr(m, 60);
  const antes = m.bufA.paso;
  m.con.b.cortado = true;                 // B deja de mandar pulsaciones
  correr(m, 120);
  const avanzados = m.bufA.paso - antes;
  comprobar(avanzados <= m.bufA.retardo,
            `A solo avanza los ${m.bufA.retardo} pasos que tenía por delante ` +
            `(ha dado ${avanzados}) y luego espera`);
  comprobar(m.bufA.esperas > 0, `y lo anota: ${m.bufA.esperas} pasos de espera`);
  comprobar(!m.rotos.A, 'esperar NO es desincronizarse: no se declara nada roto');
}

console.log('\nY vuelve solo cuando el otro habla otra vez');
{
  const m = montar();
  correr(m, 60);
  m.con.b.cortado = true;
  correr(m, 120);
  const parado = m.bufA.paso;
  m.con.b.cortado = false;
  correr(m, 120);
  comprobar(m.bufA.paso > parado + 100,
            `A se pone al día en cuanto vuelven las pulsaciones ` +
            `(de ${parado} a ${m.bufA.paso})`);
  comprobar(!m.rotos.A, 'sin declarar nada roto por el camino');
}

// UN BACHE NO ES UNA CAÍDA, y estas cuatro pruebas son las de la diferencia.
//
// El caso más frecuente de una partida en red no es que se corte: es que el
// contacto se vaya unos segundos y vuelva. Hasta ahora eso no tenía forma de
// contarse -- o se jugaba, o se había acabado -- y lo que veía quien jugaba era
// la pantalla congelada sin una palabra.
console.log('\nUn bache que vuelve no rompe la partida');
{
  const m = montar();
  correr(m, 60);
  m.con.b.cortado = true;
  m.con.a.alBache('Se ha perdido el contacto; reintentando.');
  correr(m, 300);                          // cinco segundos caído
  const parado = m.bufA.paso;
  comprobar(!m.rotos.A, 'a los cinco segundos todavía no se ha rendido');
  const e = m.sincroA.espera();
  comprobar(!!e && !!e.motivo, `y tiene algo que contar: "${e && e.motivo}"`);
  comprobar(!!e && e.restan > 0 && e.restan < 15,
            `con cuenta atrás de verdad (quedan ${e && e.restan.toFixed(1)} s)`);

  m.con.b.cortado = false;
  m.con.a.alVolver();
  correr(m, 200);
  comprobar(m.sincroA.bache === '', 'al volver el contacto, el aviso se quita');
  comprobar(m.bufA.paso > parado + 150,
            'y se sigue donde estaba, sin transferir nada ' +
            `(de ${parado} a ${m.bufA.paso})`);
  comprobar(!m.rotos.A, 'sin declarar nada roto por el camino');
}

console.log('\nUn bache que NO vuelve acaba dándose por perdido');
{
  const m = montar();
  correr(m, 60);
  m.con.b.cortado = true;
  m.con.a.alBache('Se ha perdido el contacto; reintentando.');
  correr(m, 600);                          // diez segundos
  comprobar(!m.rotos.A, 'a los diez segundos aún se espera');
  correr(m, 400);                          // pasado el aguante
  comprobar(!!m.rotos.A, 'pasados los quince, se da por perdida');
  comprobar(/No ha vuelto/.test(m.rotos.A || ''),
            `y dice por qué: "${(m.rotos.A || '').slice(0, 70)}..."`);
}

// SIN BACHE NO HAY CUENTA ATRÁS. Callarse con el canal sano es otra cosa -- el
// otro puede tener la pestaña de fondo, que los navegadores frenan -- y ahí
// rendirse sería echar a alguien de su partida por haber mirado el navegador.
console.log('\nCallarse con el canal sano se espera sin límite');
{
  const m = montar();
  correr(m, 60);
  m.con.b.cortado = true;
  correr(m, 1200);                         // veinte segundos, mas que el aguante
  comprobar(!m.rotos.A, 'no se rompe nada: nadie ha dicho que el enlace se caiga');
  const e = m.sincroA.espera();
  comprobar(!!e && e.restan === 0, 'y no se le enseña una cuenta atrás inventada');
  comprobar(!!e && e.quien.indexOf(1) >= 0,
            `pero sí a quien se espera (jugador ${e && e.quien[0] + 1})`);
}

// CON CUATRO JUGADORES EL ANFITRIÓN TIENE TRES ENLACES, y que vuelva uno no
// significa que hayan vuelto los otros. Por eso se cuentan en vez de guardar un
// si/no: con un si/no, el primero que contestara borraba el aviso de los demás.
console.log('\nCon varios enlaces, el aviso se va con el último');
{
  const bufC = crearBufer(); bufC.iniciar(4);
  const sincroC = crearSincro(bufC);
  const mudo = () => ({ alControl: null, alJuego: null,
                        enviarControl: () => true, enviarJuego: () => true });
  const uno = mudo(), dos = mudo();
  sincroC.empezar([uno, dos], {
    esAnfitrion: true, jugadorLocal: 0, jugadores: 3,
    partesDe: () => [1, 2], nombres: ['a', 'b'], alRomperse: () => {}
  });
  uno.alBache('se fue uno');
  dos.alBache('se fue el otro');
  comprobar(sincroC.bache === 'se fue uno', 'el aviso es el del primero que cayó');
  uno.alVolver();
  comprobar(sincroC.bache !== '', 'con uno de vuelta y otro caído, el aviso sigue');
  dos.alVolver();
  comprobar(sincroC.bache === '', 'y se quita cuando han vuelto los dos');
}

// EL REENGANCHE: volver a una partida que sigue en pie, por un canal nuevo.
//
// Lo caro de esto no es ponerse al dia -- en lockstep los dos mundos se paran a
// la vez, así que no hay nada que recuperar -- sino no volver a la partida
// equivocada. Estas pruebas son casi todas de lo segundo.
console.log('\nSe vuelve a la partida sin tocar el búfer');
{
  const m = montar();
  correr(m, 200);
  const paso = m.bufA.paso;
  m.sincroA._romper('se ha cortado', true);
  m.sincroB._romper('se ha cortado', true);
  comprobar(m.sincroA.rotoPorRed, 'la ruptura queda marcada como de red');

  // Un canal NUEVO: las credenciales de una conexión no se reciclan, así que
  // esto es lo que pasa de verdad tras pegarse dos códigos nuevos.
  const otro = crearParConexiones();
  m.sincroA.reanudar(otro.a);
  m.sincroB.reanudar(otro.b);
  m.con = otro;
  comprobar(m.bufA.paso === paso,
            `el contador de pasos no se toca (sigue en ${m.bufA.paso})`);
  comprobar(m.sincroA.roto === '' && m.sincroA.activo, 'y la partida vuelve a estar viva');
  const r = correr(m, 200);
  comprobar(r.dadosA > 190 && r.dadosB > 190,
            `y se sigue jugando (${r.dadosA} y ${r.dadosB} pasos)`);
  comprobar(!m.sincroA.roto && !m.sincroB.roto, 'sin declarar nada roto al reanudar');
}

console.log('\nEl saludo del reenganche reconoce a la otra punta');
{
  const m = montar();
  correr(m, 200);
  comprobar(m.sincroA.comprobarReenganche(m.sincroB.puntoDeReenganche()) === '',
            'dos puntas de la misma partida se reconocen');
  comprobar(m.sincroB.comprobarReenganche(m.sincroA.puntoDeReenganche()) === '',
            'y en el otro sentido también');
}

// LA PRUEBA QUE JUSTIFICA TODO EL SALUDO. Basta con que uno haya elegido SEGUIR
// EN SOLITARIO antes de arrepentirse para que los dos mundos ya no sean el
// mismo, y reengancharlos sería dejarlos jugando dos partidas creyendo que son
// una -- justo lo que la vigilancia de este módulo existe para impedir.
console.log('\nY rechaza una partida que ya no es la misma');
{
  const m = montar();
  correr(m, 200);
  const suyo = m.sincroB.puntoDeReenganche();
  // Se tuerce la huella del punto que los dos tienen comprobado.
  const trozos = String(suyo.huellas[0]).split(':');
  suyo.huellas[0] = trozos[0] + ':' + ((parseInt(trozos[1], 10) ^ 1) >>> 0);
  const porque = m.sincroA.comprobarReenganche(suyo);
  comprobar(porque !== '', 'no se reengancha a ciegas');
  comprobar(/ya no son la misma/.test(porque), `y dice por qué: "${porque}"`);
}

console.log('\nY rechaza lo que no puede comprobar');
{
  const m = montar();
  correr(m, 200);
  const suyo = m.sincroB.puntoDeReenganche();
  // Huellas de pasos que esta punta no tiene: han parado demasiado lejos.
  suyo.huellas = ['99980:1', '99960:2'];
  const porque = m.sincroA.comprobarReenganche(suyo);
  comprobar(/ningún punto comprobado/.test(porque),
            `sin punto comun no se reanuda: "${porque}"`);

  const mismo = m.sincroB.puntoDeReenganche();
  mismo.puesto = m.sincroA.jugadorLocal;
  comprobar(m.sincroA.comprobarReenganche(mismo) !== '',
            'ni con dos puntas que se creen el mismo jugador');
}

// UNA DIVERGENCIA NO SE ARREGLA RECONECTANDO, y por eso no se ofrece: los dos
// mundos ya son distintos y un canal nuevo solo los dejaria seguir así.
console.log('\nUna divergencia no cuenta como caída de red');
{
  const m = montar();
  correr(m, 60);
  m.mundoB.valores[3] = 999;
  correr(m, 60);
  comprobar(!!(m.rotos.A || m.rotos.B), 'la divergencia se detecta');
  comprobar(!m.sincroA.rotoPorRed && !m.sincroB.rotoPorRed,
            'y NO queda marcada como caída de red');
}

console.log('\nLa elección de carta viaja');
{
  const m = montar();
  let elegidaEnB = -1;
  m.sincroB._alElegir = (i) => { elegidaEnB = i; };
  m.sincroA.avisarEleccion(2);
  m.con.entregar();
  comprobar(elegidaEnB === 2, `la carta elegida en A llega a B (índice ${elegidaEnB})`);
}

console.log(fallos === 0 ? '\nTODO CORRECTO.\n' : `\n${fallos} FALLO(S).\n`);
process.exit(fallos === 0 ? 0 : 1);
