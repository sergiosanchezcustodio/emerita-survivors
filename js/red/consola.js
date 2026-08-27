import { crearConexion, autoprueba, ESTADOS, SERVIDORES_POR_DEFECTO } from './conexion.js';
import { tipoDe, esIpLocal } from './codigo.js';
import { vigilarCada } from './sincro.js';
import { Lockstep, RETARDO_MAX } from '../core/lockstep.js';
import { MetaProgreso } from '../core/metaProgreso.js';

// LA RED DESDE LA CONSOLA, mientras no haya pantallas.
//
// Las pantallas de "crear partida" y "unirse" llegan cuando el transporte esté
// probado; montarlas antes sería decorar algo que todavía puede cambiar de
// forma. Hasta entonces se maneja desde la consola del navegador, que es como se
// ha llevado todo el determinismo y ha funcionado bien.
//
//   ANFITRIÓN                        INVITADA
//   EMERITA.red.invitar()
//   (manda el código)          --->  EMERITA.red.responder('...')
//                              <---  (devuelve el suyo)
//   EMERITA.red.aceptar('...')
//
// Todo lo que imprime va en un solo bloque y con el código a pelo, para que se
// pueda seleccionar de una pasada sin arrastrar adornos.

// LA CONEXIÓN EN CURSO —la última que se ha creado— y TODAS las abiertas.
//
// Quien se une tiene una sola, con el anfitrión. El anfitrión tiene una por
// invitado: invita, pega la respuesta, y vuelve a invitar para el siguiente.
// Cada invitado necesita su propio par de códigos, porque cada conexión trae
// sus propias credenciales.
let sesion = null;
const enlaces = [];
// Lo enchufa main.js: empezar y terminar una partida en red. Aquí no se puede
// importar de main.js sin cerrar un círculo entre los dos módulos.
let juego = null;

// A quién avisar cuando el retardo de entrada se reajusta solo. Lo pone la
// pantalla del cooperativo para poder enseñarlo; sin nadie escuchando, el
// ajuste se hace igual y solo se ve en la consola.
let alRetardo = null;
// ¿Hay una medida en marcha? Ver `ajustarRetardo`.
let midiendo = false;

// Mide el viaje por todos los enlaces abiertos y deja puesto el retardo que pide
// el peor de ellos. Ver el comentario largo de `ajustarRetardo`, que es donde
// está el razonamiento; aquí solo está la cuenta.
async function medirYPonerRetardo(abiertos, veces) {
  // CON VARIOS INVITADOS MANDA EL PEOR. El mundo espera a todos: el retardo que
  // sirve es el que le vale al que está más lejos, no el promedio.
  let peor = null;
  for (let i = 0; i < abiertos.length; i++) {
    const r = await abiertos[i].medirLatencia(veces);
    if (!r) continue;
    if (!peor || r.mediana > peor.mediana) peor = r;
  }
  if (!peor) return null;

  const FOTOGRAMA = 16.667;
  const viaje = peor.mediana / 2;
  const baile = Math.max(0, peor.max - peor.mediana) / 2;
  const jitter = Math.min(2, Math.ceil(baile / FOTOGRAMA));
  let fotogramas = Math.ceil(viaje / FOTOGRAMA) + 1 + 1 + jitter;
  if (fotogramas < 3) fotogramas = 3;
  if (fotogramas > RETARDO_MAX) fotogramas = RETARDO_MAX;

  // Con la partida ya en marcha se mide pero NO se aplica: mover el retardo a
  // mitad de partida deja huecos en el búfer y bloquea el mundo para siempre.
  const enMarcha = !!(juego && juego.enPartida && juego.enPartida());
  if (!enMarcha) Lockstep.retardo = fotogramas;

  return { fotogramas, mediana: peor.mediana, max: peor.max, jitter, aplicado: !enMarcha };
}

// LA VERSIÓN DEL JUEGO VIAJA EN EL SALUDO, y no es burocracia.
//
// Dos máquinas con distinta versión simulan mundos distintos: basta un ajuste de
// balance para que la misma semilla produzca otra partida. Y va a pasar — el día
// que se publique una actualización con alguien jugando. Sin esta comprobación,
// el síntoma sería una desincronización a los diez segundos y nadie sabría por
// qué. Con ella, se dice antes de empezar.
//
// Se sube A MANO cada vez que cambie algo que afecte a la simulación.
const VERSION_JUEGO = '2026-08-26';

// Una conexión más.
//
// OJO CON CERRAR LA ANTERIOR: cuando el anfitrión invita al tercer jugador, la
// conexión con el segundo TIENE que seguir viva. Solo se cierra la anterior si
// no llegó a conectarse — un intento a medias que se queda por ahí solo sirve
// para hablar tarde y confundir (ver el comentario de más abajo).
function nueva(servidores) {
  // AL INTENTO ANTERIOR SE LE QUITA LA VOZ ANTES DE CERRARLO.
  //
  // Una conexión que no llegó a cuajar no muere en el momento: ICE sigue
  // probando por su cuenta y avisa de que ha fracasado medio minuto después. Sin
  // esto, ese aviso aparecía en la consola CUANDO YA ESTABAS CONECTADO por el
  // segundo intento, y se leía como si la conexión buena se hubiera caído. Le
  // pasó a Sergio: "La conexión no llegó a establecerse" justo antes de
  // "conectado".
  if (sesion && sesion.estado !== ESTADOS.CONECTADO) {
    sesion.alEstado = null;
    sesion.alCerrar = null;
    sesion.alControl = null;
    sesion.alJuego = null;
    sesion.cerrar();
    const i = enlaces.indexOf(sesion);
    if (i >= 0) enlaces.splice(i, 1);
  }
  sesion = crearConexion({ servidores, ipLocal: RedConsola.ipLocal });
  enlaces.push(sesion);
  // El identificador va en todos los mensajes: si alguna vez vuelve a hablar una
  // conexión que no es la que estás mirando, se ve en el acto de cuál es.
  const yo = sesion.id;
  sesion.alEstado = (estado, error) => {
    if (estado === ESTADOS.CONECTADO) {
      console.log(`RED[${yo}]: conectado.`);
      // EL RETARDO SE AJUSTA AQUÍ, en la conexión, y no en la pantalla.
      //
      // Da igual por dónde se haya conectado —el menú del juego, la consola o el
      // banco de pruebas—: el retardo depende del viaje, no de quién lo pidiera.
      // Puesto en la pantalla, el que conecta desde la consola se quedaba con el
      // valor de fábrica sin enterarse, y las pruebas medirían otra cosa que lo
      // que se juega.
      RedConsola.ajustarRetardo().then((r) => {
        if (!r) return;
        console.log(`RED: viaje ${r.mediana.toFixed(1)} ms (punta ${r.max.toFixed(1)}) ` +
                    `-> retardo de entrada ${r.fotogramas} fotogramas` +
                    (r.aplicado ? '.' : ' (NO aplicado: la partida ya ha empezado).'));
        if (alRetardo) alRetardo(r);
      }).catch(() => {});
    }
    else if (estado === ESTADOS.ERROR) console.error(`RED[${yo}]: ` + (error || 'error'));
    else if (estado === ESTADOS.CERRADO) console.log(`RED[${yo}]: conexión cerrada.`);
  };
  sesion.alControl = (t) => {
    // El saludo se atiende AQUÍ y no en sincro.js: cuando llega, la partida
    // todavía no existe y no hay nadie a quien dárselo.
    if (t.startsWith('inicio ')) { empezarPorInvitacion(t); return; }
    // El anfitrión pide el progreso de esta máquina para poder simularla igual.
    if (t === 'dameMeta') {
      sesion.enviarControl('meta ' + JSON.stringify(MetaProgreso.aCompartir()));
      return;
    }
    if (t.startsWith('meta ')) {
      if (pendienteMeta) {
        const r = pendienteMeta;
        pendienteMeta = null;
        try { r(JSON.parse(t.slice(5))); } catch { r(null); }
      }
      return;
    }
    console.log(`RED[${yo}] (control): ` + t);
  };
  return sesion;
}

// Quien está esperando el progreso del otro, si hay alguien.
let pendienteMeta = null;

// Lo recibe quien se ha unido: el anfitrión ha dado el pistoletazo.
function empezarPorInvitacion(texto) {
  let cfg;
  try { cfg = JSON.parse(texto.slice('inicio '.length)); }
  catch { console.error('El saludo del anfitrión no se ha podido leer.'); return; }

  if (cfg.version !== VERSION_JUEGO) {
    console.error(`No podéis jugar juntos: el anfitrión tiene la versión ` +
                  `${cfg.version} y tú la ${VERSION_JUEGO}. Actualizad los dos.`);
    return;
  }
  if (!juego) { console.error('El juego todavía no está listo.'); return; }
  const puesto = cfg.tuPuesto | 0 || 1;
  juego.empezar([sesion], {
    esAnfitrion: false,
    jugadorLocal: puesto,
    personajes: cfg.personajes,
    semilla: cfg.semilla >>> 0,
    metas: cfg.metas
  });
  console.log(`Partida en red empezada con ${cfg.personajes.length} jugadores ` +
              `(semilla ${(cfg.semilla >>> 0).toString(16)}). ` +
              `Eres el jugador ${puesto + 1}.`);
}

async function alPortapapeles(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // Sin permiso o sin foco en la página. No es un fallo: el código está
    // impreso justo encima y se puede seleccionar a mano.
    return false;
  }
}

// Un aviso honesto sobre lo que se ha conseguido, según lo que traiga el código.
//
// Es la diferencia entre "ya podéis jugar" y "va a fallar dentro de un minuto y
// no vais a saber por qué", y solo cuesta mirar un número.
function comentarCandidatos(c) {
  if (c.candidatos === 0) {
    console.error('SIN CANDIDATOS: este navegador no ha encontrado ninguna ' +
                  'dirección. La conexión no se va a establecer.');
  } else if (c.publicos === 0) {
    console.warn(`Solo direcciones locales (${c.locales}). Esto vale para dos ` +
                 'ordenadores de la misma casa, pero NO entre dos casas: no ha ' +
                 'contestado ningún servidor STUN. ¿Hay internet?');
  } else {
    console.log(`${c.publicos} dirección(es) pública(s) y ${c.locales} local(es): ` +
                'vale para jugar entre dos casas.');
  }
  const aviso = avisoDeConexion(c.diagnostico);
  if (aviso) console.warn('RED: ' + aviso.titulo + ' ' + aviso.detalle);
}

// EL AVISO EN UNA FRASE, o cadena vacía si no hay nada que avisar.
//
// Vive aquí y no en la pantalla porque lo dicen los dos: la consola para quien
// esté depurando y ui/red.js para quien esté jugando. Dos textos distintos para
// el mismo hecho acaban contando cosas distintas.
//
// NO SE AVISA DE TODO LO RARO, solo de lo que impide jugar. Un aviso que salta
// cuando no pasa nada se aprende a ignorar en dos días, y entonces ya no avisa
// de lo que sí pasa.
export function avisoDeConexion(d) {
  if (!d) return null;
  if (d.simetrico) {
    return {
      titulo: 'Tu conexión no deja jugar directamente.',
      detalle: 'Dos servidores te ven por puertos distintos (' +
               d.puertos.join(' y ') + '), así que tu router abre una puerta ' +
               'nueva para cada destino y nadie puede saber cuál será la del ' +
               'otro jugador. Es lo normal en datos móviles: prueba por wifi.'
    };
  }
  if (d.publicos === 0) {
    return {
      titulo: 'No tienes dirección pública.',
      detalle: 'No ha contestado ningún servidor STUN, así que solo se puede ' +
               'jugar con alguien de tu misma red.'
    };
  }
  return null;
}

// Y el otro aviso, el que solo se puede dar cuando ya hay un código del otro
// delante: que los dos salís por el mismo router.
export function avisoMismaRed(hayIpLocal) {
  return {
    titulo: 'Estáis los dos en la misma red.',
    detalle: hayIpLocal
      ? 'El camino público no sirve entre vosotros, pero has escrito tu ' +
        'dirección de casa, así que hay por dónde conectar.'
      : 'Vuestro router tendría que dejar salir y volver a entrar por la misma ' +
        'puerta, y casi ninguno lo hace. Volved al menú y escribid vuestra ' +
        'dirección de casa (la de ipconfig): con eso os conectáis por la wifi.'
  };
}

export const RedConsola = {
  enganchar(api) { juego = api; },

  // Servidores ICE. Ver SERVIDORES_POR_DEFECTO en conexion.js y el apartado
  // correspondiente de docs/cooperativo-online.md. Ponerlo a [] vuelve al
  // comportamiento de "solo la misma casa", sin hablar con nadie de fuera.
  servidores: SERVIDORES_POR_DEFECTO,

  // TU DIRECCIÓN DE CASA, escrita a mano.
  //
  // Solo hace falta para jugar con alguien de tu MISMA red, y hace falta porque
  // el navegador esconde esa dirección detrás de un nombre `.local` que el otro
  // ordenador tiene que resolver por mDNS — y eso lo rompe cualquier router que
  // aísle a sus clientes o cualquier cortafuegos que se coma el UDP 5353.
  //
  // VIVE EN MEMORIA Y SE PIERDE AL RECARGAR, a propósito. `localStorage` está
  // reservado en este proyecto al progreso META (denarios, héroes,
  // potenciadores) y esto no lo es; además una dirección de red cambia al
  // cambiar de casa o de wifi, y una guardada de la semana pasada sería un
  // candidato que no responde y un motivo menos a la vista.
  ipLocal: '',

  // La devuelve tal cual si es de un rango privado, y '' si no. Escribir aquí la
  // dirección PÚBLICA —que es la que sale al buscar "cuál es mi ip"— es el error
  // natural, y no serviría de nada: ver `esIpLocal` en codigo.js.
  ponerIpLocal(ip) {
    const limpia = String(ip || '').trim();
    if (limpia === '') { this.ipLocal = ''; return ''; }
    if (!esIpLocal(limpia)) return '';
    this.ipLocal = limpia;
    return limpia;
  },

  // Lo que se sabe de la conexión de esta máquina, para que lo pinte la pantalla.
  diagnostico() { return sesion ? sesion.diagnostico : null; },

  // ¿El código que me han pasado viene de mi misma red?
  mismaRedQue(codigo) {
    return !!(sesion && sesion.mismaRedQue && sesion.mismaRedQue(codigo));
  },

  // Cuántos hay conectados ahora mismo, sin contarte a ti.
  get conectados() {
    let n = 0;
    for (let i = 0; i < enlaces.length; i++) {
      if (enlaces[i].estado === ESTADOS.CONECTADO) n++;
    }
    return n;
  },

  async invitar() {
    const c = nueva(this.servidores);
    const codigo = await c.invitar();
    const copiado = await alPortapapeles(codigo);
    console.log(`Código de invitación (${codigo.length} caracteres):` +
                (copiado ? ' — copiado al portapapeles' : ''));
    console.log(codigo);
    comentarCandidatos(c);
    console.log('Mándaselo a quien se une. Cuando te devuelva el suyo, pégalo ' +
                'EN ESTA MISMA VENTANA:');
    console.log("  EMERITA.red.aceptar('el-codigo-que-te-han-dado')");
    // Esto hay que decirlo: la conexión a medio negociar vive en esta pestaña y
    // en ninguna parte más. Recargar es empezar de cero.
    console.log('No recargues esta ventana mientras tanto: la invitación se pierde.');
    return codigo;
  },

  async responder(codigo) {
    if (!codigo || typeof codigo !== 'string') {
      console.error("Hace falta el código de quien invita: EMERITA.red.responder('...')");
      return null;
    }
    const tipo = tipoDe(codigo);
    if (tipo === 'respuesta') {
      console.error('Eso es un código de RESPUESTA, y aquí hay que pegar una ' +
                    'INVITACIÓN. Si el código lo has generado tú, quien tiene que ' +
                    'pegarlo es la otra persona.');
      return null;
    }
    if (tipo === 'desconocido') {
      console.error('Eso no parece un código de Emerita. ¿Se ha copiado entero, ' +
                    'y entre comillas?');
      return null;
    }
    const c = nueva(this.servidores);
    let respuesta;
    try {
      respuesta = await c.responder(codigo);
    } catch (e) {
      console.error('No se ha podido leer ese código: ' + (e && e.message ? e.message : e));
      return null;
    }
    const copiado = await alPortapapeles(respuesta);
    console.log(`Tu código de respuesta (${respuesta.length} caracteres):` +
                (copiado ? ' — copiado al portapapeles' : ''));
    console.log(respuesta);
    comentarCandidatos(c);
    console.log('Devuélveselo a quien te invitó. En cuanto lo pegue, quedáis conectados.');
    c.esperarAbierto().then((ok) => {
      if (!ok) console.warn('RED: sigue sin abrirse el canal. ¿Ha pegado el código?');
    });
    return respuesta;
  },

  async aceptar(codigo) {
    // LOS TRES ERRORES DE ESTE PASO, cada uno con lo que hay que hacer.
    //
    // Se comprueban antes de tocar WebRTC porque si no, el sintoma de los tres
    // es el mismo -la conexion no se abre- y no hay forma de distinguirlos.
    const tipo = tipoDe(codigo);
    if (tipo === 'invitacion') {
      console.error('Eso es una INVITACIÓN, no una respuesta. Lo que hay que pegar ' +
                    'aquí es el código que te ha devuelto la otra persona después ' +
                    "de hacer EMERITA.red.responder('tu-invitación').");
      return false;
    }
    if (tipo === 'desconocido') {
      console.error('Eso no parece un código de Emerita. ¿Se ha copiado entero, ' +
                    'y entre comillas?');
      return false;
    }
    if (!sesion) {
      console.error('Esta ventana no tiene ninguna invitación pendiente. ' +
                    'El código de respuesta hay que pegarlo en la MISMA ventana ' +
                    'donde se hizo EMERITA.red.invitar(), y sin recargarla por el ' +
                    'camino. Si la has recargado, hay que empezar de nuevo.');
      return false;
    }
    if (!sesion.esAnfitrion) {
      console.error('Esta ventana es la que se ha UNIDO, no la que invitó. ' +
                    'Aquí no hay que aceptar nada: en cuanto la otra persona pegue ' +
                    'tu respuesta, quedáis conectados solos.');
      return false;
    }
    try {
      await sesion.aceptar(codigo);
    } catch (e) {
      console.error('No se ha podido leer ese código: ' + (e && e.message ? e.message : e));
      return false;
    }
    const ok = await sesion.esperarAbierto();
    if (ok) {
      console.log('Conectados. Mide el viaje con: EMERITA.red.latencia()');
    } else {
      console.error('No se ha abierto el canal. Ver estado con EMERITA.red.estado()');
    }
    return ok;
  },

  // Cuánto tarda un mensaje en ir y volver, y cuántos fotogramas de retardo
  // pide eso. Es la medida que decide el ajuste de core/lockstep.js.
  async latencia(veces = 20) {
    if (!sesion) {
      console.error('No hay conexión.');
      return null;
    }
    // SI TODAVÍA SE ESTÁ ABRIENDO, SE ESPERA. `aceptar()` devuelve una promesa,
    // así que pegar las dos líneas seguidas en la consola ejecuta esto antes de
    // que la conexión exista. Fallar ahí era técnicamente correcto e inútil: lo
    // que quiere quien lo escribe es la medida, no una regañina por el orden.
    if (sesion.estado !== ESTADOS.CONECTADO) {
      console.log('Esperando a que se abra el canal…');
      const ok = await sesion.esperarAbierto(10000);
      if (!ok) {
        console.error('No se ha abierto el canal. Estado: ' + sesion.estado);
        return null;
      }
    }
    const r = await sesion.medirLatencia(veces);
    if (!r) { console.error('No ha vuelto ningún ping.'); return null; }
    // El viaje de una pulsación es la MITAD de la ida y vuelta. Se redondea
    // hacia arriba y se le suma uno de margen: quedarse corto significa que la
    // partida se para a esperar, y eso se nota mucho más que un fotograma de más.
    const fotogramas = Math.ceil((r.mediana / 2) / 16.667) + 1;
    console.log(`Ida y vuelta: mediana ${r.mediana.toFixed(1)} ms ` +
                `(min ${r.min.toFixed(1)}, max ${r.max.toFixed(1)}, ${r.muestras} muestras)`);
    console.log(`Retardo recomendado: ${fotogramas} fotogramas. ` +
                `Ahora mismo: EMERITA.lockstep.retardo`);
    return { ...r, fotogramas };
  },

  // EL RETARDO DE ENTRADA, PUESTO SOLO, a partir de lo que tarda esta conexión.
  //
  // POR QUÉ. El retardo llevaba clavado en 4 fotogramas desde que se eligió, y
  // se eligió sobre una ida y vuelta de 1,4 ms entre dos pestañas de la misma
  // máquina — que no es una latencia, es el suelo del sistema. Servía para
  // probar el búfer y no significaba nada sobre una red de verdad. Con dos
  // máquinas conectadas por fin hay un número que quiere decir algo.
  //
  // QUÉ ES ESTE NÚMERO. Los fotogramas que se espera antes de jugar lo que
  // pulsas, y que son el tiempo que tiene el paquete del otro para llegar. Si se
  // queda CORTO, el mundo se para a esperar y eso se ve como tirones; si se pasa,
  // el mando responde tarde. Quedarse corto se nota mucho más, así que en la
  // duda se redondea hacia arriba.
  //
  // LA CUENTA, y cada sumando responde a algo distinto:
  //
  //   viaje    la MITAD de la ida y vuelta: una pulsación va en un sentido.
  //   +1       margen fijo. Un fotograma de más no se percibe -medido: Sergio
  //            jugó con 0, con 2 y con 6 sin distinguirlos- y uno de menos es
  //            una partida que se para.
  //   +1       EL PASO DEL OTRO. Un paquete no se atiende cuando llega, sino en
  //            el siguiente paso de quien lo recibe: si llega justo después de
  //            uno, espera un fotograma entero antes de entrar. Eso no aparece
  //            en la ida y vuelta y hay que sumarlo aparte.
  //   +jitter  lo que baila la red, del peor viaje contra el normal. Es lo que
  //            de verdad hace esperar: no la latencia media, sino el paquete que
  //            llega tarde. Se le pone tope de dos, o una sola punta de 300 ms
  //            dejaría el mando pastoso para siempre.
  //
  // EL SUELO ES 3, Y LO PUSO UNA PRUEBA QUE SE BLOQUEÓ. Con la primera versión
  // de esta cuenta —sin el paso del otro y con suelo 2— cuatro pestañas en la
  // misma máquina se quedaron paradas esperándose: la ida y vuelta era de un
  // milisegundo, así que salía un retardo de 2, y con eso no hay hueco para que
  // una pestaña de fondo pierda un fotograma. Y las pestañas de fondo pierden
  // fotogramas, porque el navegador las frena a propósito.
  //
  // La lección es que el ping mide LA RED y no lo que tarda el otro en
  // atenderlo. Cuando el cuello es la máquina de enfrente —y con cuatro
  // ventanas abiertas siempre lo es— la medida se queda corta por debajo.
  //
  // NO HACE FALTA QUE LAS DOS MÁQUINAS PONGAN EL MISMO. Cada una elige cuándo
  // entra LO SUYO, y el paso al que va apuntado viaja en el paquete, así que las
  // dos colocan cada pulsación en el mismo sitio. Un retardo más alto de un lado
  // solo le da más margen a ese lado. Y `retardo` no entra en la firma que se
  // compara entre máquinas (ver PARTES en core/determinismo.js), así que esto no
  // puede inventarse una desincronización.
  // CON LA PARTIDA YA EN MARCHA NO SE TOCA, y esto costó una prueba entera.
  //
  // El búfer de pulsaciones apunta lo que pulsas en la casilla `paso + retardo`.
  // Subir el retardo con la partida andando deja SIN ESCRIBIR las casillas que
  // quedan en medio, y el mundo espera para siempre una pulsación tuya que nadie
  // va a poner nunca. No es una desincronización: es un bloqueo permanente de
  // las dos máquinas, y se ve como que el juego se queda congelado sin dar un
  // solo error.
  //
  // Con dos jugadores no salía: el ajuste terminaba antes de empezar la partida.
  // Con cuatro, el anfitrión mide una vez por invitado y la última medida caía ya
  // dentro de la partida. `probar-partida-en-red.js 40 nada 4` lo cazó: las
  // cuatro pestañas paradas en el mismo paso, cero avance.
  //
  // Se mide igual y se devuelve el número —sirve para enseñarlo—; lo que no se
  // hace es aplicarlo.
  async ajustarRetardo(veces = 20) {
    const abiertos = enlaces.filter((e) => e.estado === ESTADOS.CONECTADO);
    if (abiertos.length === 0) return null;
    // NI DOS MEDIDAS A LA VEZ. `medirLatencia` guarda un solo manejador de pong
    // por conexión, así que la segunda pisa a la primera y la primera se queda
    // esperando pongs que ya se ha llevado otro.
    if (midiendo) return null;
    midiendo = true;
    try {
      return await medirYPonerRetardo(abiertos, veces);
    } finally {
      midiendo = false;
    }
  },

  // Por dónde va la conexión: la única prueba de que se ha atravesado un router.
  async camino() {
    if (!sesion) { console.error('Sin conexión.'); return null; }
    const c = await sesion.camino();
    if (!c) { console.error('Todavía no hay un camino elegido.'); return null; }
    const explica = {
      local: 'los dos extremos están en la misma red. Esto NO prueba que ' +
             'funcione entre dos casas.',
      publica: 'se ha atravesado un router: esta es la prueba de que el ' +
               'cooperativo entre dos casas funciona.',
      relevada: 'a través de un servidor TURN. No debería pasar: aquí no hay ' +
                'ninguno configurado.'
    };
    console.log(`Camino: ${c.clase} (${c.local} <-> ${c.remoto})` +
                (c.ms != null ? ` · ${c.ms.toFixed(1)} ms medidos por WebRTC` : ''));
    console.log('  ' + explica[c.clase]);
    return c;
  },

  // EMPEZAR LA PARTIDA. Lo hace el anfitrión; la otra máquina se entera sola.
  //
  // Todo lo que decide cómo va a ser la partida se manda desde aquí: la semilla
  // del azar y qué personaje lleva cada puesto. Si cada máquina eligiera lo
  // suyo, serían dos partidas distintas desde el primer fotograma.
  async jugar(personajes) {
    if (!sesion || sesion.estado !== ESTADOS.CONECTADO) {
      console.error('No hay conexión abierta.');
      return false;
    }
    if (!sesion.esAnfitrion) {
      console.error('La partida la empieza quien invitó. Espera a que lo haga.');
      return false;
    }
    const cuantos = 1 + enlaces.filter((e) => e.estado === ESTADOS.CONECTADO).length;
    const pers = personajes && personajes.length >= cuantos
      ? personajes.slice(0, cuantos)
      : Array.from({ length: cuantos }, (_, i) => i % 4);
    const semilla = (Math.random() * 0xffffffff) >>> 0;

    const invitados = enlaces.filter((e) => e.estado === ESTADOS.CONECTADO);
    if (invitados.length === 0) {
      console.error('No hay nadie conectado todavía.');
      return false;
    }

    // PRIMERO SE PIDE EL PROGRESO DE TODOS, y hasta que llega no se empieza.
    //
    // Las mejoras compradas cambian la vida y el daño de un personaje, y cada
    // máquina simula a los DOS jugadores. Sin saber las del otro, tu máquina le
    // daría a él tus mejoras y la suya te daría a ti las de él: dos mundos
    // distintos desde el primer fotograma.
    //
    // Va por el canal fiable y se espera de verdad, porque empezar sin esto es
    // empezar mal.
    console.log(`Pidiendo el progreso a ${invitados.length} jugador(es)…`);
    const suyos = [];
    for (let i = 0; i < invitados.length; i++) {
      const enlace = invitados[i];
      const suyo = await new Promise((resolver) => {
        pendienteMeta = resolver;
        enlace.enviarControl('dameMeta');
        setTimeout(() => { if (pendienteMeta) { pendienteMeta = null; resolver(null); } }, 5000);
      });
      if (!suyo) {
        console.error(`El jugador ${i + 2} no ha contestado con su progreso. ` +
                      '¿Tiene la misma versión?');
        return false;
      }
      suyos.push(suyo);
    }

    // LOS PUESTOS SE REPARTEN AQUÍ Y SE MANDAN. El anfitrión es siempre el 0 y
    // los invitados van en el orden en que se conectaron. Si cada máquina
    // decidiera el suyo, dos podrían creerse el mismo jugador.
    const metas = [MetaProgreso.aCompartir()].concat(suyos);
    // El saludo va por el canal de control, que es el fiable: si esto se
    // perdiera, una máquina empezaría la partida y la otra no.
    // A cada invitado se le dice ADEMÁS qué puesto le toca: el mismo saludo
    // para todos salvo ese número.
    for (let i = 0; i < invitados.length; i++) {
      invitados[i].enviarControl('inicio ' + JSON.stringify({
        version: VERSION_JUEGO, semilla, personajes: pers, metas, tuPuesto: i + 1
      }));
    }
    juego.empezar(invitados, {
      esAnfitrion: true, jugadorLocal: 0, personajes: pers, semilla, metas
    });
    console.log(`Partida en red empezada con ${pers.length} jugadores ` +
                `(semilla ${semilla.toString(16)}). Eres el jugador 1.`);
    return true;
  },

  salir() {
    if (sesion) sesion.enviarControl('adios');
    if (juego) juego.terminar(true);       // true = colgar de verdad
    console.log('Fuera de la partida en red.');
  },

  // Cada cuántos pasos se compara el mundo con el del otro. Menos es antes y
  // más preciso; más es menos tráfico. Ver CADA_HUELLA en red/sincro.js.
  vigilancia(pasos) {
    const n = vigilarCada(pasos);
    console.log(`El mundo se compara cada ${n} pasos (${(n / 60).toFixed(2)} s).`);
    return n;
  },

  // Lo que necesita la pantalla de cooperativo (ui/red.js), que no puede
  // depender de que alguien lea la consola.
  copiar: alPortapapeles,

  // Aviso de que el retardo se ha reajustado, para quien quiera enseñarlo.
  alAjustarRetardo(fn) { alRetardo = fn; },

  // Avisar cuando el canal se abra. Lo usa quien se ha unido: despues de
  // devolver su codigo no tiene nada que hacer salvo esperar, y la pantalla
  // tiene que enterarse sola de que ya estan dentro.

  alConectar(fn) {
    if (!sesion) return;
    sesion.alAbrir = fn;
    if (sesion.estado === ESTADOS.CONECTADO) fn();
  },

  estado() {
    if (!sesion) { console.log('Sin conexión.'); return 'suelto'; }
    console.log(`estado: ${sesion.estado}` +
                (sesion.error ? ` (${sesion.error})` : '') +
                ` · ${sesion.esAnfitrion ? 'anfitrión' : 'invitada'}` +
                ` · ${sesion.publicos} pública(s) y ${sesion.locales} local(es)`);
    return sesion.estado;
  },

  decir(texto) {
    if (!sesion) { console.error('Sin conexión.'); return false; }
    const ok = sesion.enviarControl(String(texto));
    if (!ok) console.error('El canal de control no está abierto.');
    return ok;
  },

  cerrar() {
    for (let i = 0; i < enlaces.length; i++) enlaces[i].cerrar();
    enlaces.length = 0;
    sesion = null;
  },

  autoprueba,

  // Acceso crudo, para trastear.
  get sesion() { return sesion; }
};
