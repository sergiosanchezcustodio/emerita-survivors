// EL PROGRESO PORTABLE: que lo que sale vuelva a entrar, y que lo roto se note.
//
//   node herramientas\probar-progreso.js
//
// Es la pieza sobre la que se monta llevarse la partida a otro ordenador —a
// mano con un código, o por la copia en la nube—, así que lo que se comprueba
// es lo que de verdad puede salir mal:
//
//   1. Que el ida y vuelta no pierda ni cambie nada.
//   2. Que un código cortado al copiar lo DIGA, en vez de dejar un progreso a
//      medias. Es el fallo probable de verdad: nadie teclea estos códigos, se
//      copian, y una selección que se queda corta es lo normal del mundo.
//   3. Que al haber dos progresos distintos gane el que hay que elegir, y que
//      la regla no dependa del reloj de nadie.

import { aCodigo, deCodigo, comparar, resumir, serializar }
  from '../js/core/progresoPortable.js';

// `btoa`/`atob` existen en Node desde la 16; `TextEncoder` es global desde la 11.
// El módulo se escribió para el navegador y aquí corre tal cual, sin adaptador.

let fallos = 0;
function comprobar(condicion, texto) {
  console.log(`  ${condicion ? 'OK  ' : 'MAL '} ${texto}`);
  if (!condicion) fallos++;
}

// Un progreso con de todo: mascotas a medio subir, potenciadores, una fase
// terminada y un personaje bloqueado.
const META = {
  denarios: 4820,
  partidas: 37,
  tiempoTotal: 46512.5,
  mejorTiempo: 1683.25,
  mascotaEquipada: 'heladio',
  potenciadores: { vida: 5, danyo: 3, velocidad: 1, imanRecogida: 0 },
  mascotas: { heladio: 3, oreo: 1, plinio: 0 },
  fases: { merida: 1 },
  personajes: { eric: true, lucy: true, sara: true, vicky: false }
};

console.log('EL PROGRESO PORTABLE\n');

console.log('Ida y vuelta');
{
  const codigo = aCodigo(META, 1756300000);
  const r = deCodigo(codigo);
  comprobar(r.ok, `se lee lo que se escribió (${codigo.length} caracteres)`);
  comprobar(r.sello === 1756300000, 'y el momento en que se hizo');
  for (const campo of ['denarios', 'partidas', 'tiempoTotal', 'mejorTiempo', 'mascotaEquipada']) {
    comprobar(r.meta[campo] === META[campo], `${campo}: ${r.meta[campo]}`);
  }
  comprobar(JSON.stringify(r.meta.mascotas) === JSON.stringify({ heladio: 3, oreo: 1 }),
            'las mascotas, sin las de nivel cero: ' + JSON.stringify(r.meta.mascotas));
  comprobar(JSON.stringify(r.meta.potenciadores) === JSON.stringify({ vida: 5, danyo: 3, velocidad: 1 }),
            'los potenciadores, igual');
  comprobar(r.meta.personajes.vicky === undefined && r.meta.personajes.eric === 1,
            'y los personajes bloqueados tampoco viajan');

  // CABE EN UN MENSAJE. Es el requisito que decide el formato entero: si no
  // cupiera, esto dejaría de ser "pégaselo por WhatsApp" y habría que montar
  // otra cosa.
  comprobar(codigo.length < 400, `y el código entero cabe en un mensaje (${codigo.length} < 400)`);
}

console.log('\nUn progreso recién empezado');
{
  const nuevo = { denarios: 0, partidas: 0, tiempoTotal: 0, mejorTiempo: 0,
                  mascotaEquipada: '', potenciadores: {}, mascotas: {}, fases: {},
                  personajes: { eric: true } };
  const r = deCodigo(aCodigo(nuevo, 1));
  comprobar(r.ok, 'también se puede llevar uno sin nada');
  comprobar(Object.keys(serializar(nuevo)).length === 1,
            'y ocupa lo mínimo: solo lo que no está a cero');
}

console.log('\nLo que llega roto');
{
  const bueno = aCodigo(META, 1756300000);
  const casos = [
    ['', 'No has pegado nada.'],
    ['   ', 'No has pegado nada.'],
    ['hola que tal', 'Esto no es un código de progreso de Emerita.'],
    [bueno.slice(0, bueno.length - 25), 'El código está incompleto o cortado al copiar.'],
    [bueno.slice(0, 40), 'El código está incompleto o cortado al copiar.']
  ];
  for (const [entrada, esperado] of casos) {
    const r = deCodigo(entrada);
    comprobar(!r.ok && r.motivo === esperado,
              `"${entrada.slice(0, 22)}${entrada.length > 22 ? '…' : ''}" -> ${r.motivo}`);
  }
  // Y el caso que justifica la suma de comprobación: un código al que le han
  // cambiado un carácter por el medio. Sin ella, esto entra como progreso bueno.
  const tocado = bueno.slice(0, 60) + (bueno[60] === 'A' ? 'B' : 'A') + bueno.slice(61);
  comprobar(!deCodigo(tocado).ok, 'un carácter cambiado por el medio se caza');

  // Los espacios y saltos de línea que mete cualquier chat al copiar NO son un
  // error: se limpian.
  const partido = bueno.slice(0, 50) + '\n ' + bueno.slice(50);
  comprobar(deCodigo(partido).ok, 'pero un salto de línea del chat no estorba');
}

console.log('\nCuál de los dos progresos gana');
{
  const mucho = { tiempoTotal: 46512, partidas: 37, denarios: 10 };
  const poco  = { tiempoTotal: 900, partidas: 2, denarios: 9000 };
  comprobar(comparar(poco, mucho) === 'suyo', 'gana el que más tiempo lleva jugado');
  comprobar(comparar(mucho, poco) === 'mio', 'y da igual el orden en que se pregunte');
  comprobar(comparar(mucho, { tiempoTotal: 46512, partidas: 99 }) === 'suyo',
            'empatados a tiempo, decide el número de partidas');
  comprobar(comparar(mucho, { tiempoTotal: 46512, partidas: 37 }) === 'mio',
            'y empatados del todo NO se toca lo que ya había');
  comprobar(comparar(mucho, null) === 'mio', 'sin nada enfrente, se queda lo de aquí');

  // LA REGLA NO MIRA EL RELOJ, y esta es la comprobación que lo fija: un
  // progreso de nada hecho por una máquina con la hora adelantada no puede
  // machacar veinte horas de juego.
  comprobar(comparar(mucho, { tiempoTotal: 60, partidas: 1, sello: 4102444800 }) === 'mio',
            'una máquina con la hora adelantada no gana por eso');
  // Ni los denarios, que se gastan: quien más ha jugado puede tener menos.
  comprobar(comparar({ tiempoTotal: 46512, partidas: 37, denarios: 0 },
                     { tiempoTotal: 100, partidas: 1, denarios: 99999 }) === 'mio',
            'ni los denarios, que bajan al gastarlos');
}

console.log('\nLo que se le enseña a quien va a pegarlo');
{
  const texto = resumir(META);
  comprobar(/37 partidas/.test(texto) && /12 h/.test(texto) && /4820 denarios/.test(texto),
            texto);
}

console.log(fallos === 0 ? '\nTODO CORRECTO.\n' : `\n${fallos} FALLO(S).\n`);
process.exit(fallos === 0 ? 0 : 1);
