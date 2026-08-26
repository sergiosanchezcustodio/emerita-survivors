import { crearConexion, autoprueba, ESTADOS } from './conexion.js';
import { tipoDe } from './codigo.js';

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

let sesion = null;

function nueva(servidores) {
  if (sesion) sesion.cerrar();
  sesion = crearConexion({ servidores });
  sesion.alEstado = (estado, error) => {
    if (estado === ESTADOS.CONECTADO) console.log('RED: conectado.');
    else if (estado === ESTADOS.ERROR) console.error('RED: ' + (error || 'error'));
    else if (estado === ESTADOS.CERRADO) console.log('RED: conexión cerrada.');
  };
  sesion.alControl = (t) => console.log('RED (control): ' + t);
  return sesion;
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

export const RedConsola = {
  // Servidores ICE. Vacío = nada externo, y entonces esto conecta solo dentro
  // de la misma casa. Ver docs/cooperativo-online.md antes de tocarlo.
  servidores: [],

  async invitar() {
    const c = nueva(this.servidores);
    const codigo = await c.invitar();
    const copiado = await alPortapapeles(codigo);
    console.log(`Código de invitación (${codigo.length} caracteres, ` +
                `${c.candidatos} candidato(s))` + (copiado ? ' — copiado al portapapeles:' : ':'));
    console.log(codigo);
    if (c.candidatos === 0) {
      console.warn('Sin candidatos: este navegador no ha encontrado ninguna dirección. ' +
                   'La conexión no va a llegar a establecerse.');
    }
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
    console.log(`Tu código de respuesta (${respuesta.length} caracteres)` +
                (copiado ? ' — copiado al portapapeles:' : ':'));
    console.log(respuesta);
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
    console.log(ok ? 'Conectados.' : 'No se ha abierto el canal. Ver estado con EMERITA.red.estado()');
    return ok;
  },

  // Cuánto tarda un mensaje en ir y volver, y cuántos fotogramas de retardo
  // pide eso. Es la medida que decide el ajuste de core/lockstep.js.
  async latencia(veces = 20) {
    if (!sesion || sesion.estado !== ESTADOS.CONECTADO) {
      console.error('No hay conexión abierta.');
      return null;
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

  estado() {
    if (!sesion) { console.log('Sin conexión.'); return 'suelto'; }
    console.log(`estado: ${sesion.estado}` +
                (sesion.error ? ` (${sesion.error})` : '') +
                ` · ${sesion.esAnfitrion ? 'anfitrión' : 'invitada'}` +
                ` · ${sesion.candidatos} candidato(s)`);
    return sesion.estado;
  },

  decir(texto) {
    if (!sesion) { console.error('Sin conexión.'); return false; }
    const ok = sesion.enviarControl(String(texto));
    if (!ok) console.error('El canal de control no está abierto.');
    return ok;
  },

  cerrar() {
    if (sesion) sesion.cerrar();
    sesion = null;
  },

  autoprueba,

  // Acceso crudo, para trastear.
  get sesion() { return sesion; }
};
