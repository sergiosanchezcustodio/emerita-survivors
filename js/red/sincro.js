import { Lockstep } from '../core/lockstep.js';

// LA PARTIDA EN RED: quien junta la conexión con el búfer de pulsaciones.
//
// Ni `conexion.js` sabe qué es una partida ni `lockstep.js` sabe qué es una
// conexión. Este módulo es lo único que sabe las dos cosas, y a propósito: así
// el búfer se puede probar entero en Node sin WebRTC —y se prueba— y la
// conexión sirve para cualquier cosa que haya que mandar.
//
// LO QUE HACE EN CADA PASO DE LÓGICA, y el orden importa:
//
//   1. Manda lo que se está pulsando aquí. SIEMPRE, aunque el mundo esté
//      parado esperando: si una punta se calla mientras espera, deja al otro sin
//      las pulsaciones que ya tiene y los dos se quedan esperándose. Callarse al
//      esperar es como se construye un bloqueo mutuo.
//   2. Deja avanzar al mundo solo si conoce las pulsaciones de todos.
//   3. De vez en cuando compara una huella del mundo con la del otro. Si se han
//      separado, LO DICE Y PARA, en vez de seguir jugando dos partidas distintas
//      creyendo que son una.
//
// EL PUNTO 3 ES EL QUE DA LA CARA. Todo lo anterior —las matemáticas
// deterministas, los reinicios de estado, la cuantización del stick— existe para
// que esa comparación salga bien. Si algo de eso falla, se entera aquí.

const VERSION_PROTOCOLO = 1;

// CADA CUÁNTOS PASOS SE COMPARA EL MUNDO.
//
// Empezó en 60 —una vez por segundo— y era demasiado espaciado para lo que hace
// falta ahora. Con un segundo entre medidas, cuando salta el aviso ya difieren
// siete componentes: la divergencia nació en algún punto de esos sesenta pasos y
// se ha propagado a todo lo que toca. Con la ventana corta, el primer aviso
// suele traer UN solo componente, y ese sí señala el origen.
//
// Cuesta unos 450 B/s por el canal fiable. Nada al lado de los 2,5 KB/s de las
// pulsaciones, y se puede aflojar cuando el cooperativo esté rodado:
// EMERITA.red.vigilancia(60).
let CADA_HUELLA = 20;

export function vigilarCada(pasos) {
  CADA_HUELLA = Math.max(1, pasos | 0);
  return CADA_HUELLA;
}

// Cuántas huellas propias se recuerdan, para poder comparar una que llegue
// tarde. Treinta son medio minuto.
const HUELLAS_GUARDADAS = 30;

export const Sincro = {
  activo: false,
  esAnfitrion: false,
  jugadorLocal: 0,
  jugadores: 1,
  // Motivo por el que se ha roto la partida, si se ha roto.
  roto: '',
  // Cuántas huellas se han comparado y en cuántos pasos ha habido que esperar.
  huellasComparadas: 0,
  desdeUltimaHuella: 0,
  // El último paso que se comprobó y salió bien. Al romperse, acota la
  // divergencia a la ventana entre ese paso y el que falla.
  ultimoBueno: -1,

  _con: null,
  _huellaDe: null,          // función que devuelve la huella del mundo
  _partesDe: null,          // los componentes por separado, para señalar el culpable
  // Fotos recientes del mundo, guardadas para poder comparar campo a campo
  // cuando algo se separa. Ver `_pedirFoto`.
  _fotoDe: null,
  _comparaFotos: null,
  _fotos: null,
  _nombres: null,
  _alElegir: null,          // (indice) aplicar la carta que ha elegido el otro
  _mias: null,              // Map paso -> huella
  _alRomperse: null,

  // Arranca la partida en red. `conexion` ya tiene que estar conectada.
  //
  //   jugadorLocal   qué puesto maneja esta máquina
  //   jugadores      cuántos juegan en total
  //   huellaDe()     devuelve un entero con el estado del mundo (determinismo.js)
  //   alRomperse(t)  se llama si las dos partidas se separan
  empezar(conexion, opciones) {
    this._con = conexion;
    this.esAnfitrion = !!opciones.esAnfitrion;
    this.jugadorLocal = opciones.jugadorLocal | 0;
    this.jugadores = Math.max(2, opciones.jugadores | 0);
    this._huellaDe = opciones.huellaDe || null;
    this._partesDe = opciones.partesDe || null;
    this._fotoDe = opciones.fotoDe || null;
    this._comparaFotos = opciones.comparaFotos || null;
    this._fotos = new Map();
    this._nombres = opciones.nombres || [];
    this._alElegir = opciones.alElegir || null;
    this._alRomperse = opciones.alRomperse || null;
    this._mias = new Map();
    this.roto = '';
    this.huellasComparadas = 0;
    this.desdeUltimaHuella = 0;
    this.activo = true;

    // El búfer, con los puestos repartidos: el mío es local, el resto viene por
    // la red.
    Lockstep.reiniciar(this.jugadores, [this.jugadorLocal]);

    conexion.alJuego = (datos) => { Lockstep.aplicar(datos); };
    conexion.alControl = (texto) => this._recibirControl(texto);
    conexion.alCerrar = () => {
      if (this.activo) this._romper('Se ha cortado la conexión.');
    };
  },

  parar() {
    this.activo = false;
    if (this._con) {
      this._con.alJuego = null;
      this._con.alControl = null;
    }
    this._con = null;
  },

  // Se llama UNA vez por paso de lógica, antes de decidir si el mundo avanza.
  // Devuelve true si se puede dar el paso.
  antesDelPaso(entrada) {
    if (!this.activo) return true;
    if (this.roto) return false;

    // Registrar lo de aquí solo tiene sentido si el mundo va a avanzar: el
    // búfer apunta al paso EN CURSO más el retardo, y si el paso no se da, ese
    // destino no cambia. Registrar de nuevo lo mismo no hace daño, pero mandar
    // sí hace falta siempre.
    if (Lockstep.listo()) Lockstep.registrar(entrada);

    const bytes = Lockstep.empaquetar(this.jugadorLocal);
    if (bytes) this._con.enviarJuego(bytes);

    if (!Lockstep.listo()) {
      Lockstep.anotarEspera();
      return false;
    }
    return true;
  },

  // La carta que acaba de elegir quien juega aquí. Va por el canal FIABLE: si
  // se perdiera, las dos partidas se quedarían con arsenales distintos, y eso
  // no lo tapa ninguna redundancia.
  avisarEleccion(indice) {
    if (!this.activo || this.roto) return;
    this._con.enviarControl(`e ${indice | 0}`);
  },

  // Se llama DESPUÉS de que el mundo haya dado el paso.
  despuesDelPaso() {
    if (!this.activo || this.roto || !this._huellaDe) return;
    this.desdeUltimaHuella++;
    if (this.desdeUltimaHuella < CADA_HUELLA) return;
    this.desdeUltimaHuella = 0;

    const paso = Lockstep.paso;
    // SE MANDAN LOS COMPONENTES, NO UNA CIFRA. Son diecisiete números, unos 150
    // bytes por segundo por el canal fiable — nada al lado de las pulsaciones.
    // Y valen la diferencia entre "las partidas se han separado" y "se han
    // separado EN LOS ENEMIGOS", que es lo único con lo que se puede empezar a
    // buscar.
    const partes = this._partesDe ? this._partesDe() : [this._huellaDe() >>> 0];
    this._mias.set(paso, partes);
    // Y la foto del mundo en ese mismo paso. Solo se guardan unas pocas: sirven
    // para el instante en que algo se separa, no para llevar un historial.
    if (this._fotoDe) {
      this._fotos.set(paso, this._fotoDe());
      if (this._fotos.size > 4) {
        this._fotos.delete(this._fotos.keys().next().value);
      }
    }
    // No se guarda historia infinita: si la huella del otro no ha llegado en
    // medio minuto, la partida ya tiene un problema mayor que este.
    if (this._mias.size > HUELLAS_GUARDADAS) {
      const primera = this._mias.keys().next().value;
      this._mias.delete(primera);
    }
    this._con.enviarControl(`h ${paso} ${partes.join(',')}`);
  },

  _recibirControl(texto) {
    if (texto.startsWith('h ')) {
      const p = texto.split(' ');
      const paso = parseInt(p[1], 10);
      const suyas = p[2].split(',').map((x) => parseInt(x, 10) >>> 0);
      const mias = this._mias.get(paso);
      // Que no esté todavía no es un problema: puede llegar antes de que esta
      // máquina alcance ese paso. Se ignora y ya la comparará la del siguiente
      // segundo, porque las dos mandan.
      if (mias === undefined) return;
      this.huellasComparadas++;

      const culpables = [];
      const nombresQueDifieren = [];
      for (let i = 0; i < mias.length && i < suyas.length; i++) {
        if (mias[i] !== suyas[i]) {
          nombresQueDifieren.push(this._nombres[i] || String(i));
          culpables.push(`${(this._nombres[i] || i)} (aquí ${mias[i].toString(16)}, ` +
                         `allí ${suyas[i].toString(16)})`);
        }
      }
      if (culpables.length > 0) {
        this._romper(`Las dos partidas se han separado entre el paso ` +
                     `${this.ultimoBueno} y el ${paso}. ` +
                     `Difieren: ${culpables.join(' · ')}`);
        // Y ahora el detalle: se le piden al otro sus números de ESOS
        // componentes en ESE paso, y se comparan campo a campo. Es una sola
        // petición, ya rota la partida, y es la diferencia entre "difieren los
        // disparos" y "el disparo 3 tiene vida 1 aquí y 0 allí".
        this._pedirFoto(paso, nombresQueDifieren);
      } else {
        this.ultimoBueno = paso;
      }
      return;
    }
    if (texto.startsWith('dame ')) {
      // El otro se ha dado cuenta de que difieren y pide sus números.
      const p = texto.split(' ');
      const paso = parseInt(p[1], 10);
      const foto = this._fotos.get(paso);
      if (!foto) { this._con.enviarControl(`nofoto ${paso}`); return; }
      const grupos = (p[2] || '').split(',');
      const recorte = {};
      for (let i = 0; i < grupos.length; i++) {
        if (foto[grupos[i]]) recorte[grupos[i]] = foto[grupos[i]];
      }
      this._con.enviarControl('foto ' + paso + ' ' + JSON.stringify(recorte));
      return;
    }
    if (texto.startsWith('foto ')) {
      const corte = texto.indexOf(' ', 5);
      const paso = parseInt(texto.slice(5, corte), 10);
      const mia = this._fotos.get(paso);
      if (!mia) { console.error('RED: no guardo la foto de ese paso.'); return; }
      let suya;
      try { suya = JSON.parse(texto.slice(corte + 1)); }
      catch { console.error('RED: la foto del otro no se ha podido leer.'); return; }
      const difs = this._comparaFotos ? this._comparaFotos(mia, suya, 40) : [];
      if (difs.length === 0) {
        console.warn('RED: los números coinciden campo a campo. Lo que difiere ' +
                     'está en un campo que la foto no recoge.');
      } else {
        console.error(`RED: ${difs.length} diferencia(s) concreta(s) ` +
                      '(pasada1 = aquí, pasada2 = allí):');
        console.table(difs);
      }
      return;
    }
    if (texto.startsWith('nofoto ')) {
      console.warn('RED: el otro ya no guardaba la foto de ese paso.');
      return;
    }
    if (texto.startsWith('e ')) {
      const indice = parseInt(texto.slice(2), 10) | 0;
      if (this._alElegir) this._alElegir(indice);
      return;
    }
    if (texto === 'adios') { this._romper('El otro jugador ha salido.'); return; }
  },

  _pedirFoto(paso, grupos) {
    if (!this._fotos.has(paso) || !grupos || grupos.length === 0) return;
    this._con.enviarControl(`dame ${paso} ${grupos.join(',')}`);
  },

  _romper(motivo) {
    if (this.roto) return;
    this.roto = motivo;
    console.error('RED: ' + motivo);
    if (this._alRomperse) this._alRomperse(motivo);
  },

  // Para el panel de depuración.
  resumen() {
    if (!this.activo) return null;
    return {
      paso: Lockstep.paso,
      jugadorLocal: this.jugadorLocal,
      esperas: Lockstep.esperas,
      esperaMax: Lockstep.esperaMax,
      huellas: this.huellasComparadas,
      roto: this.roto
    };
  }
};

export const PROTOCOLO = { VERSION: VERSION_PROTOCOLO, CADA_HUELLA };
