import { comprimir, descomprimir, comprobarCodec, contarCandidatos,
         resumenCandidatos } from './codigo.js';

// LA CONEXIÓN ENTRE DOS JUGADORES, sin servidor de por medio.
//
// WebRTC conecta dos navegadores directamente, pero tiene un problema de huevo
// y gallina: para hablarse tienen que intercambiar primero una descripción de
// cómo encontrarse, y todavía no pueden hablarse. Eso se llama SEÑALIZACIÓN, y
// normalmente lo resuelve un servidor que hace de intermediario.
//
// Aquí no hay servidor porque Sergio no quiere nada externo, así que el
// intermediario SOIS VOSOTROS: el anfitrión genera un código, se lo manda a su
// hermana por donde ya hablan —WhatsApp, Discord, un SMS—, ella genera otro y se
// lo devuelve. Dos mensajes y están conectados. No es peor que un servidor: es
// más lento de poner en marcha y no depende de que nada siga vivo dentro de
// cinco años.
//
//   ANFITRIÓN                          INVITADA
//   invitar()      --- código A --->
//                                      responder(A)
//                  <--- código B ---
//   aceptar(B)
//   ...............conectados...............
//
// DOS CANALES, no uno, y la diferencia importa:
//
//   control  fiable y ordenado. El saludo, la versión del juego, el progreso
//            meta de cada jugador, "empezamos". Cosas que TIENEN que llegar y
//            que no corren prisa.
//   juego    ni fiable ni ordenado. Las pulsaciones de cada paso. Reintentar un
//            paquete de hace 200 ms no sirve de nada: cuando llegara, ese paso
//            ya se habría jugado. Lo que se hará en su lugar es mandar las
//            últimas N pulsaciones en cada paquete, de modo que perder uno no
//            se note porque el siguiente ya trae lo que faltaba.
//
// SOBRE LLEGAR DE VERDAD AL OTRO EXTREMO. Sin servidores ICE, los candidatos
// son solo direcciones locales: esto conecta en la MISMA CASA. Para jugar entre
// ciudades hace falta que cada extremo averigüe su dirección pública, y eso lo
// hace un servidor STUN, que es un servicio de terceros —no uno propio, pero
// externo—. Se deja apagado por defecto y se enciende poniendo `Red.servidores`.
// Está explicado en docs/cooperativo-online.md.

// SERVIDORES STUN. Decisión de Sergio: se usan.
//
// Un STUN no es un servidor de partida ni ve el juego: se le pregunta una sola
// cosa, "¿con qué dirección me ves?", y contesta. Nada del cooperativo pasa por
// él — las pulsaciones van de casa a casa directamente— y solo se le habla
// durante los segundos en que se genera el código.
//
// Es lo que convierte esto de "dos ordenadores de la misma casa" a "dos casas
// cualesquiera": detrás de un router, tu ordenador no conoce su propia dirección
// pública, y sin ella el otro extremo no tiene adónde llamar.
//
// Lo que sí implica, y hay que decirlo: tu IP queda vista por ese servidor. Es
// inherente a preguntar, no de esta implementación en concreto.
//
// DOS Y DE DUEÑOS DISTINTOS, a propósito: si uno no contesta, el otro responde y
// la partida sigue pudiéndose crear. Y si no contestara ninguno, no se rompe
// nada — se acaba con candidatos solo locales, que es exactamente lo que había
// antes de esta decisión: se puede jugar en la misma casa y no fuera.
export const SERVIDORES_POR_DEFECTO = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' }
];

// Con STUN hay que darle tiempo a la ida y vuelta hasta el servidor. 2,5
// segundos bastaban de sobra para las direcciones locales, que no salen de la
// máquina; para una pregunta que cruza internet se queda corto y el código
// saldría sin dirección pública justo cuando más falta hace.
const ESPERA_ICE = 6000;        // ms como mucho recogiendo candidatos
const ESPERA_CONEXION = 20000;  // ms como mucho hasta que se abre el canal
// Cuánto se espera antes de creerse un `failed`. Ver el manejador de estado: los
// candidatos mDNS de Chrome hacen que ese aviso salte y se cure solo.
const MARGEN_FALLO = 4000;

export const ESTADOS = {
  SUELTO: 'suelto',
  INVITANDO: 'invitando',
  ESPERANDO: 'esperando-respuesta',
  RESPONDIENDO: 'respondiendo',
  CONECTANDO: 'conectando',
  CONECTADO: 'conectado',
  CERRADO: 'cerrado',
  ERROR: 'error'
};

// Espera a que ICE termine de recoger direcciones.
//
// Sin trickle: se manda UN código con todo dentro, porque el intercambio es a
// mano y pedir que se peguen tres códigos seguidos no lo hace nadie. El precio
// es esta espera, que en local es instantánea y con STUN son décimas.
//
// El tope existe porque `icegatheringstate` a veces no llega nunca a 'complete'
// —un servidor STUN que no responde deja la recogida colgada— y es mejor un
// código con los candidatos que haya que un botón que no hace nada.
function esperarCandidatos(pc) {
  return new Promise((resolver) => {
    if (pc.iceGatheringState === 'complete') { resolver(); return; }
    let hecho = false;
    const terminar = () => {
      if (hecho) return;
      hecho = true;
      pc.removeEventListener('icegatheringstatechange', mirar);
      pc.removeEventListener('icecandidate', porCandidato);
      clearTimeout(reloj);
      clearTimeout(relojPublico);
      resolver();
    };
    const mirar = () => { if (pc.iceGatheringState === 'complete') terminar(); };

    // EN CUANTO HAY DIRECCIÓN PÚBLICA, SE ESPERA POCO MÁS.
    //
    // El segundo servidor STUN suele contestar bastante después del primero, y
    // esperar a que terminen los dos son segundos mirando una pantalla quieta
    // para conseguir un candidato de repuesto que casi nunca hace falta. Con el
    // primero público ya se puede jugar entre casas, así que se le da un margen
    // corto al resto y se cierra.
    let relojPublico = 0;
    const porCandidato = (ev) => {
      if (!ev.candidate || relojPublico) return;
      if (ev.candidate.type === 'srflx' || / typ srflx /.test(ev.candidate.candidate)) {
        relojPublico = setTimeout(terminar, 600);
      }
    };
    pc.addEventListener('icecandidate', porCandidato);
    pc.addEventListener('icegatheringstatechange', mirar);
    const reloj = setTimeout(terminar, ESPERA_ICE);
  });
}

export function crearConexion(opciones) {
  const servidores = (opciones && opciones.servidores) || SERVIDORES_POR_DEFECTO;

  const con = {
    // Un nombre corto para esta conexión, que sale en todos sus mensajes.
    //
    // Hace falta porque en esta pantalla puede haber varias a la vez —la que
    // acaba de fracasar y la que está funcionando— y sin distinguirlas, un aviso
    // de la muerta se lee como un fallo de la viva. Ya pasó: "la conexión no
    // llegó a establecerse" justo antes de "conectado".
    id: Math.random().toString(36).slice(2, 6),
    estado: ESTADOS.SUELTO,
    esAnfitrion: false,
    error: '',
    // Cuántos candidatos llevaba el código propio, y de qué clase. Sin ninguno
    // no hay por dónde conectar; sin ninguno PÚBLICO se puede jugar en la misma
    // casa pero no entre dos. Las dos cosas conviene decirlas antes de que el
    // otro pegue el código, no después.
    candidatos: 0,
    locales: 0,
    publicos: 0,
    ultimoCodigo: '',

    // Enganches. Los pone quien use esto; por defecto no hacen nada.
    alAbrir: null,
    alCerrar: null,
    alEstado: null,
    alControl: null,      // (texto)
    alJuego: null,        // (ArrayBuffer)

    _cerrado: false,
    _relojFallo: 0,
    _pc: null,
    _control: null,
    _juego: null,
    _abierto: null,       // promesa que se resuelve al abrirse el canal control
    _resolverAbierto: null,
    _pings: new Map()
  };

  function cambiar(estado, error) {
    // Una conexión cerrada ya no opina. ICE sigue trabajando un rato después de
    // `close()` y sus avisos llegaban tarde, cuando el usuario ya estaba mirando
    // otra conexión.
    if (con._cerrado) return;
    con.estado = estado;
    con.error = error || '';
    if (con.alEstado) con.alEstado(estado, con.error);
  }

  function nuevaPc() {
    if (typeof RTCPeerConnection === 'undefined') {
      throw new Error('Este navegador no tiene WebRTC.');
    }
    const pc = new RTCPeerConnection({ iceServers: servidores });
    pc.addEventListener('connectionstatechange', () => {
      const e = pc.connectionState;
      // 'failed' NO ES DEFINITIVO, y darlo por definitivo era el fallo.
      //
      // Medido: Chrome anuncia `failed` y a los pocos cientos de milisegundos
      // conecta igual. Pasa con los candidatos mDNS —los nombres `.local` con
      // los que Chrome esconde la IP de tu casa— porque el primer par de
      // direcciones se descarta mientras el nombre todavía se está resolviendo,
      // y el estado global se pinta de rojo antes de que el que sirve termine de
      // probarse. En la consola de Sergio salió "la conexión no llegó a
      // establecerse" y justo después "conectado", que es lo peor de los dos
      // mundos: te alarma y encima miente.
      //
      // Así que se le da un margen. Si pasado ese tiempo el canal sigue sin
      // abrirse, entonces sí es un fracaso y se dice. Si se abre, nadie se entera
      // de que hubo un sobresalto, que es exactamente lo que hay que hacer con
      // los sobresaltos que se curan solos.
      if (e === 'failed') {
        if (con.estado === ESTADOS.CONECTADO) return;
        if (con._relojFallo) return;                 // ya hay un margen corriendo
        con._relojFallo = setTimeout(() => {
          con._relojFallo = 0;
          if (con.estado === ESTADOS.CONECTADO || con._cerrado) return;
          cambiar(ESTADOS.ERROR, 'La conexión no llegó a establecerse.');
          if (con.alCerrar) con.alCerrar();
        }, MARGEN_FALLO);
        return;
      }
      if (e === 'connected' && con._relojFallo) {
        clearTimeout(con._relojFallo);
        con._relojFallo = 0;
      }
      if (e === 'closed') {
        cambiar(ESTADOS.CERRADO, '');
        if (con.alCerrar) con.alCerrar();
      } else if (e === 'disconnected') {
        // 'disconnected' no es definitivo: ICE reintenta y a menudo vuelve.
        // No se cierra nada aquí, solo se anota.
        cambiar(ESTADOS.CONECTANDO, 'Se ha perdido el contacto; reintentando.');
      }
    });
    con._pc = pc;
    con._abierto = new Promise((r) => { con._resolverAbierto = r; });
    return pc;
  }

  function montarControl(canal) {
    con._control = canal;
    canal.addEventListener('open', () => {
      cambiar(ESTADOS.CONECTADO);
      if (con._resolverAbierto) con._resolverAbierto(true);
      if (con.alAbrir) con.alAbrir();
    });
    canal.addEventListener('close', () => {
      if (con.estado === ESTADOS.CONECTADO) cambiar(ESTADOS.CERRADO);
      if (con.alCerrar) con.alCerrar();
    });
    canal.addEventListener('message', (ev) => {
      const t = typeof ev.data === 'string' ? ev.data : '';
      // El ping se contesta aquí mismo y no sube: medir el viaje es asunto del
      // transporte, no de quien lo usa.
      if (t.startsWith('ping ')) { canal.send('pong ' + t.slice(5)); return; }
      if (t.startsWith('pong ')) {
        const id = t.slice(5);
        const salida = con._pings.get(id);
        if (salida !== undefined) {
          con._pings.delete(id);
          if (con._alPong) con._alPong(performance.now() - salida);
        }
        return;
      }
      if (con.alControl) con.alControl(t);
    });
  }

  function montarJuego(canal) {
    con._juego = canal;
    canal.binaryType = 'arraybuffer';
    canal.addEventListener('message', (ev) => {
      if (con.alJuego) con.alJuego(ev.data);
    });
  }

  // --- Anfitrión -------------------------------------------------------------
  con.invitar = async function () {
    const pc = nuevaPc();
    con.esAnfitrion = true;
    cambiar(ESTADOS.INVITANDO);

    // Los canales los crea SIEMPRE el anfitrión: si los crearan los dos, cada
    // uno abriría su par y habría cuatro canales para dos usos.
    montarControl(pc.createDataChannel('control', { ordered: true }));
    montarJuego(pc.createDataChannel('juego', { ordered: false, maxRetransmits: 0 }));

    const oferta = await pc.createOffer();
    await pc.setLocalDescription(oferta);
    await esperarCandidatos(pc);

    const sdp = pc.localDescription.sdp;
    const resumen = resumenCandidatos(sdp);
    con.candidatos = resumen.total;
    con.locales = resumen.locales;
    con.publicos = resumen.publicos;
    con.ultimoCodigo = comprimir(sdp);
    cambiar(ESTADOS.ESPERANDO);
    return con.ultimoCodigo;
  };

  con.aceptar = async function (codigo) {
    if (!con._pc) throw new Error('Primero hay que llamar a invitar().');
    cambiar(ESTADOS.CONECTANDO);
    await con._pc.setRemoteDescription({ type: 'answer', sdp: descomprimir(codigo) });
    return con.esperarAbierto();
  };

  // --- Invitada --------------------------------------------------------------
  con.responder = async function (codigo) {
    const pc = nuevaPc();
    con.esAnfitrion = false;
    cambiar(ESTADOS.RESPONDIENDO);

    // Los canales llegan del otro lado; aquí solo se recogen.
    pc.addEventListener('datachannel', (ev) => {
      if (ev.channel.label === 'control') montarControl(ev.channel);
      else if (ev.channel.label === 'juego') montarJuego(ev.channel);
    });

    await pc.setRemoteDescription({ type: 'offer', sdp: descomprimir(codigo) });
    const respuesta = await pc.createAnswer();
    await pc.setLocalDescription(respuesta);
    await esperarCandidatos(pc);

    const sdp = pc.localDescription.sdp;
    const resumen = resumenCandidatos(sdp);
    con.candidatos = resumen.total;
    con.locales = resumen.locales;
    con.publicos = resumen.publicos;
    con.ultimoCodigo = comprimir(sdp);
    cambiar(ESTADOS.CONECTANDO);
    return con.ultimoCodigo;
  };

  // --- Común -----------------------------------------------------------------
  con.esperarAbierto = function (ms = ESPERA_CONEXION) {
    if (con.estado === ESTADOS.CONECTADO) return Promise.resolve(true);
    return Promise.race([
      con._abierto,
      new Promise((r) => setTimeout(() => r(false), ms))
    ]);
  };

  con.enviarControl = function (texto) {
    if (!con._control || con._control.readyState !== 'open') return false;
    con._control.send(texto);
    return true;
  };

  con.enviarJuego = function (datos) {
    if (!con._juego || con._juego.readyState !== 'open') return false;
    con._juego.send(datos);
    return true;
  };

  // Cuánto tarda un mensaje en ir y volver. Es EL número que decide cuántos
  // fotogramas de retardo hacen falta: con la ida y vuelta medida en `t`, el
  // viaje de una pulsación es la mitad, y el retardo tiene que cubrirlo.
  con.medirLatencia = function (veces = 10) {
    return new Promise((resolver) => {
      if (con.estado !== ESTADOS.CONECTADO) { resolver(null); return; }
      const muestras = [];
      con._alPong = (ms) => {
        muestras.push(ms);
        if (muestras.length >= veces) {
          con._alPong = null;
          muestras.sort((a, b) => a - b);
          resolver({
            muestras: muestras.length,
            min: muestras[0],
            mediana: muestras[muestras.length >> 1],
            max: muestras[muestras.length - 1]
          });
        }
      };
      for (let i = 0; i < veces; i++) {
        const id = String(i) + '-' + String(Math.floor(performance.now()));
        con._pings.set(id, performance.now());
        con.enviarControl('ping ' + id);
      }
      // Si se pierden pongs, no dejar la promesa colgada para siempre.
      setTimeout(() => {
        if (con._alPong) {
          con._alPong = null;
          if (muestras.length === 0) { resolver(null); return; }
          muestras.sort((a, b) => a - b);
          resolver({
            muestras: muestras.length,
            min: muestras[0],
            mediana: muestras[muestras.length >> 1],
            max: muestras[muestras.length - 1]
          });
        }
      }, 3000);
    });
  };

  con.cerrar = function () {
    con._cerrado = true;
    if (con._relojFallo) { clearTimeout(con._relojFallo); con._relojFallo = 0; }
    if (con._control) { try { con._control.close(); } catch {} }
    if (con._juego) { try { con._juego.close(); } catch {} }
    if (con._pc) { try { con._pc.close(); } catch {} }
    con._control = con._juego = con._pc = null;
    cambiar(ESTADOS.CERRADO);
  };

  return con;
}

// --- Autoprueba --------------------------------------------------------------
//
// Monta las DOS PUNTAS EN ESTA MISMA PÁGINA y las conecta entre sí pasando los
// códigos por el códec, igual que harían dos personas. Comprueba de una vez el
// códec, el intercambio, la apertura de los dos canales y el viaje de ida y
// vuelta — sin necesitar dos ordenadores ni a nadie al otro lado.
//
// Lo que NO comprueba, y conviene tenerlo claro: que se atraviese un router.
// Aquí las dos puntas están en la misma máquina, así que ICE lo resuelve con
// direcciones locales y nunca se pone a prueba el camino de verdad. Eso solo lo
// dice una partida entre dos casas.
export async function autoprueba() {
  const anfitrion = crearConexion();
  const invitada = crearConexion();
  const informe = { pasos: [], ok: false };
  const apunte = (t) => { informe.pasos.push(t); console.log('  ' + t); };

  try {
    console.log('Autoprueba de red (las dos puntas en esta misma página):');

    const codigoA = await anfitrion.invitar();
    apunte(`invitación: ${codigoA.length} caracteres, ${anfitrion.candidatos} candidato(s)`);
    if (anfitrion.candidatos === 0) {
      apunte('SIN CANDIDATOS: no hay ninguna dirección por la que conectar.');
    }

    // El códec, comprobado sobre el SDP de verdad de este navegador.
    const chequeo = comprobarCodec(anfitrion._pc.localDescription.sdp);
    if (chequeo.fallos.length > 0) {
      apunte('EL CÓDEC PIERDE DATOS: ' + chequeo.fallos.join(' · '));
    } else {
      apunte(`códec correcto: ${chequeo.original} caracteres de SDP -> ` +
             `${chequeo.largo} de código (${Math.round(100 - 100 * chequeo.largo / chequeo.original)}% menos)`);
    }

    const codigoB = await invitada.responder(codigoA);
    apunte(`respuesta: ${codigoB.length} caracteres, ${invitada.candidatos} candidato(s)`);

    await anfitrion.aceptar(codigoB);
    const abierto = await anfitrion.esperarAbierto(10000) && await invitada.esperarAbierto(10000);
    if (!abierto) {
      apunte('NO SE ABRIÓ EL CANAL en 10 segundos.');
      informe.ok = false;
      return informe;
    }
    apunte('canal de control abierto en las dos puntas');

    // Ida y vuelta por el canal de juego, que es el que llevará las pulsaciones.
    const eco = await new Promise((r) => {
      const reloj = setTimeout(() => r(false), 3000);
      invitada.alJuego = (datos) => {
        const v = new Uint8Array(datos);
        clearTimeout(reloj);
        r(v.length === 3 && v[0] === 7 && v[1] === 8 && v[2] === 9);
      };
      anfitrion.enviarJuego(new Uint8Array([7, 8, 9]));
    });
    apunte(eco ? 'canal de juego: los bytes llegan intactos'
               : 'CANAL DE JUEGO: no llegó el mensaje.');

    const lat = await anfitrion.medirLatencia(10);
    if (lat) {
      apunte(`ida y vuelta: mediana ${lat.mediana.toFixed(2)} ms ` +
             `(min ${lat.min.toFixed(2)}, max ${lat.max.toFixed(2)}) — ` +
             'en la misma máquina, así que es el suelo, no una medida de red');
    }

    informe.ok = abierto && eco && chequeo.fallos.length === 0;
    return informe;
  } catch (e) {
    apunte('EXCEPCIÓN: ' + (e && e.message ? e.message : String(e)));
    informe.ok = false;
    return informe;
  } finally {
    anfitrion.cerrar();
    invitada.cerrar();
    console.log(informe.ok ? 'AUTOPRUEBA CORRECTA.' : 'AUTOPRUEBA FALLIDA (ver arriba).');
  }
}
