// EL CÓDIGO DE INVITACIÓN: una descripción de conexión hecha texto pegable.
//
// Para conectar dos navegadores hace falta que cada uno le cuente al otro cómo
// encontrarle. Eso es un SDP, y un SDP de WebRTC son entre mil y tres mil
// caracteres con líneas que no le importan a nadie: códecs de vídeo que no
// vamos a usar, extensiones de cabecera, identificadores de flujo. Mandar eso
// por WhatsApp es impracticable — y aquí "impracticable" significa que la gente
// no juega.
//
// Así que se extraen las cuatro cosas que de verdad hacen falta para un canal
// de datos y se reconstruye el SDP entero en el otro lado. El resto es siempre
// igual y se puede escribir de memoria:
//
//   ice-ufrag, ice-pwd   usuario y contraseña de la negociación ICE
//   fingerprint          hash del certificado, para que nadie se cuele en medio
//   setup                quién hace de cliente y quién de servidor en el DTLS
//   candidatos           las direcciones por las que se puede intentar llegar
//
// Con eso, un código típico se queda en unos 300 caracteres en vez de 3000: cabe
// en un mensaje y se pega de una vez.
//
// NO ES CIFRADO ni lo pretende. Es una compresión de formato conocido: quien
// tenga el código puede unirse a la partida, igual que con el SDP entero.

const VERSION = 'E1';

// --- Base64 seguro para pegar en un chat -------------------------------------
// El base64 normal usa `+` y `/`, y hay clientes de mensajería que los rompen o
// que convierten el texto en un enlace. La variante URL usa `-` y `_`, y sin
// relleno no queda ningún `=` final que alguien pueda comerse al copiar.
function aBase64(texto) {
  const bytes = new TextEncoder().encode(texto);
  let bruto = '';
  for (let i = 0; i < bytes.length; i++) bruto += String.fromCharCode(bytes[i]);
  return btoa(bruto).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deBase64(codigo) {
  let b = codigo.replace(/-/g, '+').replace(/_/g, '/');
  while (b.length % 4 !== 0) b += '=';
  const bruto = atob(b);
  const bytes = new Uint8Array(bruto.length);
  for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// --- Lectura del SDP ---------------------------------------------------------

function primeraCoincidencia(sdp, re) {
  const m = sdp.match(re);
  return m ? m[1] : '';
}

const SETUP = { actpass: '0', active: '1', passive: '2' };
const SETUP_INV = { 0: 'actpass', 1: 'active', 2: 'passive' };

// Un candidato ICE, reducido a lo que hace falta para volver a escribirlo.
//
// Se tiran `generation`, `network-id`, `network-cost` y los demás añadidos de
// cada navegador: son pistas para priorizar, no información de contacto, y el
// otro extremo funciona igual sin ellas.
//
// TCP fuera: para un canal en tiempo real solo interesa UDP, y los candidatos
// TCP son la mitad de la lista en Chrome. IPv6 tampoco viaja — abulta y hoy no
// aporta nada que no dé IPv4 en las dos situaciones que importan, la misma casa
// y el mismo router.
function leerCandidatos(sdp) {
  const fuera = [];
  const lineas = sdp.split(/\r?\n/);
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i].trim();
    if (!l.startsWith('a=candidate:')) continue;
    // foundation componente protocolo prioridad ip puerto typ tipo [raddr X rport Y]
    const p = l.slice('a=candidate:'.length).split(' ');
    if (p.length < 8) continue;
    if (p[2].toLowerCase() !== 'udp') continue;
    const ip = p[4];
    if (ip.indexOf(':') >= 0) continue;             // IPv6
    const tipo = p[7];
    if (tipo !== 'host' && tipo !== 'srflx') continue;
    let raddr = '', rport = '';
    for (let k = 8; k + 1 < p.length; k += 2) {
      if (p[k] === 'raddr') raddr = p[k + 1];
      else if (p[k] === 'rport') rport = p[k + 1];
    }
    const campos = [p[3], ip, p[5], tipo === 'host' ? 'h' : 's'];
    if (tipo === 'srflx') campos.push(raddr, rport);
    fuera.push(campos.join(','));
  }
  return fuera;
}

export function contarCandidatos(sdp) { return leerCandidatos(sdp).length; }

// De un SDP completo al código corto.
export function comprimir(sdp) {
  const ufrag = primeraCoincidencia(sdp, /a=ice-ufrag:(\S+)/);
  const pwd = primeraCoincidencia(sdp, /a=ice-pwd:(\S+)/);
  const huella = primeraCoincidencia(sdp, /a=fingerprint:sha-256 (\S+)/i);
  const setup = primeraCoincidencia(sdp, /a=setup:(\S+)/);
  if (!ufrag || !pwd || !huella) {
    throw new Error('Este SDP no trae ufrag, contraseña o huella: no se puede comprimir.');
  }
  const partes = [
    VERSION,
    ufrag,
    pwd,
    // La huella viene en hexadecimal con dos puntos entre bytes. Los dos puntos
    // son la mitad de sus caracteres y se pueden volver a poner al descomprimir.
    huella.replace(/:/g, ''),
    SETUP[setup] || '0',
    leerCandidatos(sdp).join(';')
  ];
  return aBase64(partes.join('|'));
}

// --- Reconstrucción ----------------------------------------------------------
//
// Todo lo que no viaja en el código se escribe aquí igual siempre. Son los
// valores que produce cualquier navegador para un SDP de solo canal de datos:
// un único medio `application`, agrupado en BUNDLE con identificador 0, SCTP en
// el puerto 5000 y mensajes de hasta 256 KB.
//
// La `c=IN IP4 0.0.0.0` y el puerto 9 del `m=` no son marcadores rotos: es lo
// que dice la norma cuando la dirección de verdad la ponen los candidatos ICE.
function ponerDosPuntos(hex) {
  const trozos = [];
  for (let i = 0; i < hex.length; i += 2) trozos.push(hex.slice(i, i + 2));
  return trozos.join(':');
}

export function descomprimir(codigo) {
  let texto;
  try {
    texto = deBase64(codigo.trim());
  } catch {
    throw new Error('Esto no parece un código de Emerita: ¿se ha copiado entero?');
  }
  const p = texto.split('|');
  // DOS MENSAJES DISTINTOS, y la diferencia importa para quien lo lee.
  //
  // Un código con la marca de otra versión es un problema REAL y accionable:
  // uno de los dos tiene el juego desactualizado. Cualquier otra cosa —texto
  // pegado a medias, un enlace, el mensaje de al lado— no es una versión
  // antigua, es que eso no era un código. Meter la basura descodificada en el
  // mensaje, como hacía antes, llenaba la consola de caracteres ilegibles y
  // hacía pensar en un fallo del juego.
  if (!/^E\d+$/.test(p[0])) {
    throw new Error('Esto no parece un código de Emerita: ¿se ha copiado entero?');
  }
  if (p[0] !== VERSION) {
    throw new Error(`Código de la versión ${p[0]} y este juego usa la ${VERSION}. ` +
                    'Los dos jugadores tienen que tener la misma versión.');
  }
  if (p.length < 6) throw new Error('Código incompleto o cortado al copiar.');

  const ufrag = p[1], pwd = p[2], huellaHex = p[3], setupCod = p[4], candidatos = p[5];
  const lineas = [
    'v=0',
    'o=- 0 0 IN IP4 127.0.0.1',
    's=-',
    't=0 0',
    'a=group:BUNDLE 0',
    'a=msid-semantic: WMS',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
    'c=IN IP4 0.0.0.0',
    `a=ice-ufrag:${ufrag}`,
    `a=ice-pwd:${pwd}`,
    'a=ice-options:trickle',
    `a=fingerprint:sha-256 ${ponerDosPuntos(huellaHex).toUpperCase()}`,
    `a=setup:${SETUP_INV[setupCod] || 'actpass'}`,
    'a=mid:0',
    'a=sctp-port:5000',
    'a=max-message-size:262144'
  ];

  if (candidatos) {
    const lista = candidatos.split(';');
    for (let i = 0; i < lista.length; i++) {
      const c = lista[i].split(',');
      if (c.length < 4) continue;
      // La `foundation` y el componente se inventan aquí: solo tienen que ser
      // coherentes dentro de este SDP, y con un único medio en BUNDLE hay un
      // solo componente.
      let linea = `a=candidate:${i + 1} 1 udp ${c[0]} ${c[1]} ${c[2]} typ ` +
                  (c[3] === 'h' ? 'host' : 'srflx');
      if (c[3] === 's' && c.length >= 6) linea += ` raddr ${c[4]} rport ${c[5]}`;
      lineas.push(linea);
    }
  }
  lineas.push('a=end-of-candidates');
  return lineas.join('\r\n') + '\r\n';
}

// Ida y vuelta sobre un SDP de verdad, para comprobar que el códec no se deja
// nada por el camino. Lo usa la autoprueba de red.
export function comprobarCodec(sdp) {
  const codigo = comprimir(sdp);
  const vuelta = descomprimir(codigo);
  const fallos = [];
  const mirar = [
    ['ice-ufrag', /a=ice-ufrag:(\S+)/],
    ['ice-pwd', /a=ice-pwd:(\S+)/],
    ['setup', /a=setup:(\S+)/]
  ];
  for (let i = 0; i < mirar.length; i++) {
    const a = primeraCoincidencia(sdp, mirar[i][1]);
    const b = primeraCoincidencia(vuelta, mirar[i][1]);
    if (a !== b) fallos.push(`${mirar[i][0]}: "${a}" -> "${b}"`);
  }
  const ha = primeraCoincidencia(sdp, /a=fingerprint:sha-256 (\S+)/i).toUpperCase();
  const hb = primeraCoincidencia(vuelta, /a=fingerprint:sha-256 (\S+)/i).toUpperCase();
  if (ha !== hb) fallos.push('huella distinta tras la ida y vuelta');

  const ca = leerCandidatos(sdp).length;
  const cb = leerCandidatos(vuelta).length;
  if (ca !== cb) fallos.push(`candidatos: ${ca} -> ${cb}`);

  return { fallos, candidatos: ca, largo: codigo.length, original: sdp.length };
}
