// Comprueba el códec del código de invitación (js/red/codigo.js) sin navegador.
//
//   node herramientas\probar-codigo.js
//
// WebRTC no existe en Node, así que aquí no se puede conectar nada. Lo que SÍ se
// puede es coger SDPs de verdad —uno de Chrome y uno de Firefox, con sus manías
// propias— y comprobar que la ida y vuelta no pierde nada y que el código sale
// lo bastante corto como para pegarlo en un mensaje.
//
// La prueba de que dos navegadores se conectan de verdad es otra y vive en el
// juego: EMERITA.red.autoprueba().

import { comprimir, descomprimir, comprobarCodec, contarCandidatos } from '../js/red/codigo.js';

// Oferta de Chrome. Trae candidato mDNS (Chrome esconde la IP local detrás de un
// nombre .local por privacidad), candidatos TCP que hay que tirar y un srflx.
const CHROME = [
  'v=0',
  'o=- 8395419147453 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'a=group:BUNDLE 0',
  'a=extmap-allow-mixed',
  'a=msid-semantic: WMS',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
  'c=IN IP4 0.0.0.0',
  'a=candidate:1510613869 1 udp 2113937151 3f7d9c2a-1e4b-4a1f-9d3e-0c7b1a2f5e88.local 54321 typ host generation 0 network-cost 999',
  'a=candidate:842163049 1 udp 1677729535 88.12.34.56 41234 typ srflx raddr 0.0.0.0 rport 0 generation 0 network-cost 999',
  'a=candidate:1510613869 1 tcp 1518283007 3f7d9c2a-1e4b-4a1f-9d3e-0c7b1a2f5e88.local 9 typ host tcptype active generation 0',
  'a=ice-ufrag:Xk3P',
  'a=ice-pwd:9mQZ2vB7LrT4sXnW1cYdKe0f',
  'a=ice-options:trickle',
  'a=fingerprint:sha-256 AB:CD:12:34:56:78:9A:BC:DE:F0:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:13:24:35:46:57:68',
  'a=setup:actpass',
  'a=mid:0',
  'a=sctp-port:5000',
  'a=max-message-size:262144'
].join('\r\n') + '\r\n';

// Respuesta de Firefox. Ordena los atributos distinto, usa IP local a pelo (no
// mDNS), mete un candidato IPv6 que hay que tirar y pone setup:active.
const FIREFOX = [
  'v=0',
  'o=mozilla...THIS_IS_SDPARTA-99.0 4611686018427387904 0 IN IP4 0.0.0.0',
  's=-',
  't=0 0',
  'a=sendrecv',
  'a=fingerprint:sha-256 11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:AB:CD:12:34:56:78:9A:BC:DE:F0:13:24:35:46:57:68',
  'a=group:BUNDLE 0',
  'a=ice-options:trickle',
  'a=msid-semantic:WMS *',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
  'c=IN IP4 0.0.0.0',
  'a=candidate:0 1 UDP 2122252543 192.168.1.42 51234 typ host',
  'a=candidate:1 1 UDP 2122187007 fe80::1c2d:3e4f:5a6b:7c8d 51235 typ host',
  'a=sendrecv',
  'a=ice-pwd:c4b8a1d9e2f37065a4b3c2d1e0f9a8b7',
  'a=ice-ufrag:9f2c',
  'a=mid:0',
  'a=setup:active',
  'a=sctp-port:5000',
  'a=max-message-size:1073741823'
].join('\r\n') + '\r\n';

let fallos = 0;

function probar(nombre, sdp, candidatosEsperados) {
  console.log(`\n${nombre}`);
  const r = comprobarCodec(sdp);
  if (r.fallos.length > 0) {
    console.log('  MAL  la ida y vuelta pierde datos:');
    for (const f of r.fallos) console.log('       ' + f);
    fallos++;
  } else {
    console.log('  OK   ufrag, contraseña, huella, setup y candidatos sobreviven');
  }
  if (r.candidatos !== candidatosEsperados) {
    console.log(`  MAL  esperaba ${candidatosEsperados} candidato(s) útiles y salen ${r.candidatos}`);
    fallos++;
  } else {
    console.log(`  OK   ${r.candidatos} candidato(s) útiles (los TCP y los IPv6 se descartan)`);
  }
  const ahorro = Math.round(100 - 100 * r.largo / r.original);
  console.log(`       ${r.original} caracteres de SDP -> ${r.largo} de código (${ahorro}% menos)`);
  if (r.largo > 700) {
    console.log('  MAL  el código pasa de 700 caracteres: eso ya no se pega cómodo en un chat');
    fallos++;
  }
  return r;
}

console.log('CÓDEC DEL CÓDIGO DE INVITACIÓN');
probar('Oferta de Chrome (mDNS + srflx + TCP)', CHROME, 2);
probar('Respuesta de Firefox (IP local + IPv6)', FIREFOX, 1);

console.log('\nCASOS DE BORDE');
const casos = [
  ['código vacío', ''],
  ['código con basura', 'esto-no-es-un-codigo'],
  ['código de otra versión', Buffer.from('E9|a|b|c|0|').toString('base64url')],
  ['código cortado a la mitad', comprimir(CHROME).slice(0, 40)]
];
for (const [nombre, codigo] of casos) {
  try {
    descomprimir(codigo);
    console.log(`  MAL  "${nombre}" ha pasado sin protestar`);
    fallos++;
  } catch (e) {
    console.log(`  OK   "${nombre}" -> ${e.message.split(':')[0]}`);
  }
}

// Un SDP sin lo imprescindible tiene que protestar al comprimir, no al conectar.
try {
  comprimir('v=0\r\ns=-\r\n');
  console.log('  MAL  un SDP sin ufrag se ha comprimido igual');
  fallos++;
} catch {
  console.log('  OK   un SDP sin ufrag no se comprime');
}

// Un código sin ningún candidato es válido de formato pero inútil: tiene que
// poder leerse (para dar un mensaje decente) y no reventar.
const sinCandidatos = comprimir(CHROME.replace(/a=candidate:.*\r\n/g, ''));
const sdpVacio = descomprimir(sinCandidatos);
console.log(contarCandidatos(sdpVacio) === 0
  ? '  OK   un código sin candidatos se lee sin reventar (y se queda sin candidatos)'
  : '  MAL  un código sin candidatos ha inventado alguno');

console.log(fallos === 0 ? '\nTODO CORRECTO.\n' : `\n${fallos} FALLO(S).\n`);
process.exit(fallos === 0 ? 0 : 1);
