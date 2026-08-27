// EL DIAGNÓSTICO DE UNA CONEXIÓN, sobre códigos de verdad.
//
//   node herramientas\probar-diagnostico.js
//
// POR QUÉ EXISTE. Las dos primeras partidas en red entre máquinas de verdad no
// llegaron a empezar, y las dos fallaron por un motivo distinto que estaba
// escrito DENTRO del código que los dos jugadores se habían intercambiado. El
// juego lo tenía delante y no lo dijo: "no se ha podido conectar" al cabo de un
// rato, dos veces, media hora de dos personas cada vez.
//
// Estas son esas dos tentativas, guardadas tal cual llegaron. Son el banco de
// pruebas más honesto que hay para el diagnóstico: si alguna vez deja de
// reconocerlas, el aviso ha dejado de servir para lo único que se hizo.
//
// (Los códigos llevan direcciones públicas de casa de Sergio. No es un
// descuido: un código ICE es eso, y estos son de sesiones muertas hace días.)

import { diagnosticar, descomprimir, conIpLocal, esIpLocal, ipPublicaDe }
  from '../js/red/codigo.js';
import { avisoDeConexion, avisoMismaRed } from '../js/red/consola.js';

let fallos = 0;
function comprobar(condicion, texto) {
  console.log(`  ${condicion ? 'OK  ' : 'MAL '} ${texto}`);
  if (!condicion) fallos++;
}

// --- Tentativa 1: los dos en la misma casa, misma wifi ---------------------
const CASA_INVITACION =
  'RTF8aFF3R3xMdmM1ZjF5OWJWb0pQYjRhQStGeFgySmt8RjE5NDYxNTAxMjI0ODQ1RkRBOEM2Rjc1RjdD' +
  'M0EzQzNDNjdGRUIwM0MyMUFBOEM0QTkxRTJGNTJBMjdCREY4QnwwfDIxMTM5MzcxNTEsYjRiMGZlOWQt' +
  'ZjM5YS00NWJiLTk5YzktNTA5YTBjYWQ0MjQyLmxvY2FsLDU5NTU4LGg7MjExMzk0MjI3MSxhOGJiNTJl' +
  'Yy0yNzBjLTRmMWItYTAwYS0yMDY4MDI4ZDYxZDkubG9jYWwsNTk1NTksaDsxNjc3NzI5NTM1LDgzLjM5' +
  'LjEzMy4xNTgsNTk1NTgscywwLjAuMC4wLDA';
const CASA_RESPUESTA =
  'RTF8SjlCa3xVRGtpZlBKTEFDZ3NTRmxyRlMwUTdCS3d8MjQzNjlBMEEzNEFFNEY4MDFEM0RFREY2N0Y1' +
  'NThEMjY2ODJEN0I3MUNDNERCMDJEMDNDNUJGQTA2RDFGNkExQXwxfDIxMTM5MzcxNTEsNmY0ZWJiZTQt' +
  'MTNmNS00ZmQwLTljN2ItN2MyMWUzNDhlMzIxLmxvY2FsLDYxMzc4LGg7MjExMzk0MjI3MSw2MzA1ZGIy' +
  'NS01ODU5LTQ1YmEtYTMwMC0zYTVhZTcyNTg0MjEubG9jYWwsNTg1MzksaDsxNjc3NzI5NTM1LDgzLjM5' +
  'LjEzMy4xNTgsNjEzNzgscywwLjAuMC4wLDA';

// --- Tentativa 2: el MacBook por 5G ----------------------------------------
const MOVIL_INVITACION =
  'RTF8TG5jUnxkcnNOZEQrdHgvWGUyelAvc1MzOGdyS3d8NUYyMjYxNDUxNEY5NTMwNURDNTJENUQzQkM2' +
  'NTNGNzAxMDcwREFCOTgyOEVCNTgxMTE5RjhGNzVCNUY2QzhEMnwwfDIxMTM5MzcxNTEsNzgxYjkwZjYt' +
  'ZWY2Yy00ZDRjLWJkNmYtNGJkOGQ0NzA5NGZkLmxvY2FsLDU4MTUwLGg7MjExMzkzOTcxMSxkMWRlZjcz' +
  'ZS1iMzA3LTQwNjEtYjJiYy02ZGEwY2MwNjg5NTgubG9jYWwsNDk5NzcsaDsxNjc3NzI5NTM1LDk1LjEy' +
  'Ny4yMy40NSw1MDY5MSxzLDAuMC4wLjAsMDsxNjc3NzI5NTM1LDk1LjEyNy4yMy40NSw1MDc0NCxzLDAu' +
  'MC4wLjAsMA';
const MOVIL_RESPUESTA =
  'RTF8YTZNVHw5bjgxUW5CejlIL0N0NnpBeEtET2pBdmR8MERENTU4QzRGMzhCRDhDQzJDRjEwNzk5OUZC' +
  'NzI1MjJBRUY1RUREQzY3N0Y3NTUxRTNGRkUzOUJGQTM4MUQ0Q3wxfDIxMTM5MzcxNTEsOWE4NTkxM2Yt' +
  'YzQ3Ny00NTczLWJmNTQtMTc4M2QyNGQ5YmVjLmxvY2FsLDUwMjMzLGg7MjExMzk0MjI3MSxjZDc0ZDQ2' +
  'ZS1mNTk2LTQ1ODEtYjg1YS00ZDE2YWU1YzkyYjIubG9jYWwsNTAyMzQsaDsxNjc3NzI5NTM1LDgzLjM5' +
  'LjEzMy4xNTgsNTAyMzMscywwLjAuMC4wLDA';

console.log('DIAGNÓSTICO DE CONEXIÓN\n');

console.log('Tentativa 1: dos ordenadores en la misma casa');
{
  const a = diagnosticar(descomprimir(CASA_INVITACION));
  const b = diagnosticar(descomprimir(CASA_RESPUESTA));
  comprobar(!a.simetrico && !b.simetrico, 'ninguno de los dos tiene NAT simétrico');
  comprobar(a.publicos === 1 && b.publicos === 1, 'cada uno trae una dirección pública');
  comprobar(a.ip === b.ip,
            `y es LA MISMA en los dos (${a.ip}): están detrás del mismo router`);
  comprobar(ipPublicaDe(CASA_RESPUESTA) === a.ip,
            'se reconoce leyendo el código del otro, antes de intentar nada');
}

console.log('\nTentativa 2: el que invita, por datos móviles');
{
  const a = diagnosticar(descomprimir(MOVIL_INVITACION));
  const b = diagnosticar(descomprimir(MOVIL_RESPUESTA));
  comprobar(a.simetrico,
            `NAT simétrico en quien invita: ${a.ip} por los puertos ${a.puertos.join(' y ')}`);
  comprobar(!b.simetrico, 'y NO en quien responde, que está en una línea fija');
  comprobar(a.ip !== b.ip, 'esta vez las direcciones públicas son distintas');
}

// --- Que no cante donde no hay nada --------------------------------------
//
// Un aviso que salta cuando no pasa nada se aprende a ignorar en dos días, y
// entonces ya no avisa de lo que sí pasa. Dos direcciones públicas DISTINTAS
// —dos tarjetas de red, el cable y la wifi— son de lo más normal y no son un
// NAT simétrico: lo que lo delata es el mismo socket visto por dos puertos.
console.log('\nY no salta donde no debe');
{
  const dosTarjetas = 'a=candidate:1 1 udp 1677729535 90.1.2.3 40000 typ srflx raddr 0.0.0.0 rport 0\r\n' +
                      'a=candidate:2 1 udp 1677721000 90.1.2.4 40001 typ srflx raddr 0.0.0.0 rport 0';
  comprobar(!diagnosticar(dosTarjetas).simetrico,
            'dos tarjetas de red con direcciones distintas no son NAT simétrico');

  const mismoSocket = 'a=candidate:1 1 udp 1677729535 90.1.2.3 40000 typ srflx raddr 0.0.0.0 rport 0\r\n' +
                      'a=candidate:2 1 udp 1677729535 90.1.2.3 40001 typ srflx raddr 0.0.0.0 rport 0';
  comprobar(diagnosticar(mismoSocket).simetrico,
            'el mismo socket por dos puertos SÍ lo es');

  const unoSolo = 'a=candidate:1 1 udp 1677729535 90.1.2.3 40000 typ srflx raddr 0.0.0.0 rport 0';
  comprobar(!diagnosticar(unoSolo).simetrico,
            'con un solo servidor STUN contestando no se acusa a nadie');
}

// --- La dirección de casa escrita a mano -----------------------------------
console.log('\nLa IP local, escrita a mano');
{
  const sdp = descomprimir(CASA_INVITACION);
  const antes = diagnosticar(sdp);
  const ahora = diagnosticar(conIpLocal(sdp, '192.168.1.39'));
  comprobar(ahora.locales === antes.locales + 2,
            `añade un candidato por puerto local (${antes.locales} -> ${ahora.locales})`);
  const puestos = (conIpLocal(sdp, '192.168.1.39').match(/192\.168\.1\.39 (\d+)/g) || []);
  comprobar(puestos.join(' ') === '192.168.1.39 59558 192.168.1.39 59559',
            'y conserva los puertos que ya traía: ' + puestos.join(' · '));
  comprobar(conIpLocal(sdp, '83.39.133.158') === sdp,
            'una dirección pública NO se acepta: no serviría y taparía el motivo');
  comprobar(conIpLocal(sdp, 'lo que sea') === sdp, 'ni una cadena que no es una IP');
  comprobar(esIpLocal('10.0.0.4') && esIpLocal('172.20.1.1') && esIpLocal('192.168.0.2'),
            'valen los tres rangos privados');
  comprobar(!esIpLocal('172.32.0.1') && !esIpLocal('8.8.8.8') && !esIpLocal('192.168.0.300'),
            'y no vale lo que cae fuera');
}

// --- Y que el aviso que lee el jugador diga lo que pasa --------------------
//
// El diagnóstico y el texto se prueban juntos a propósito: un diagnóstico
// correcto que no se traduce en una frase no sirve de nada, que es exactamente
// la situación de la que salen estas dos tentativas.
console.log('\nLo que se le dice al jugador');
{
  const movil = avisoDeConexion(diagnosticar(descomprimir(MOVIL_INVITACION)));
  comprobar(!!movil, 'por datos móviles SÍ hay aviso');
  comprobar(movil && /50691/.test(movil.detalle) && /50744/.test(movil.detalle),
            'y nombra los dos puertos, que es la prueba de lo que dice');
  comprobar(movil && /wifi/i.test(movil.detalle), 'y dice qué hacer: probar por wifi');

  const casa = avisoDeConexion(diagnosticar(descomprimir(CASA_INVITACION)));
  comprobar(casa === null,
            'estando en la misma casa, el código propio por sí solo NO da aviso');

  const juntos = avisoMismaRed(false);
  comprobar(/ipconfig/.test(juntos.detalle),
            'ese caso lo dice el otro aviso, y manda a escribir la dirección de casa');
  comprobar(!/ipconfig/.test(avisoMismaRed(true).detalle),
            'y si ya está escrita, no la vuelve a pedir');
}

console.log(fallos === 0 ? '\nTODO CORRECTO.\n' : `\n${fallos} FALLO(S).\n`);
process.exit(fallos === 0 ? 0 : 1);
