import { Recursos } from '../core/recursos.js';
import { Intro } from './intro.js';
import {
  FUNDIDO, prepararRelato, dibujarRelato, hornearPantalla, fondoPantalla, velo
} from './relato.js';

// LA HISTORIA DEL NIVEL: la misma placa de piedra de la intro, con el relato
// del sitio al que se va a entrar. Se ve UNA VEZ por partida, después de elegir
// dónde se juega y antes del primer fotograma.
//
// POR QUÉ AQUÍ Y NO EN LA INTRO. La intro contaba la historia de Mérida porque
// Mérida era todo lo que había. Con la región por delante, meter los seis
// relatos en el arranque sería un cuarto de hora de lectura antes de tocar el
// juego, y cinco sextos de ella hablando de sitios donde todavía no se puede
// entrar. Cada historia se cuenta cuando significa algo: al ir a jugarla.
//
// EL GUION VIVE EN EL ARCHIVO DE DATOS DEL NIVEL (`historia`), no aquí. Es lo
// mismo que la paleta o las oleadas: parte de lo que ES ese sitio. Un nivel sin
// `historia` no pasa por esta pantalla; no es un error, es que no tiene nada
// que contar todavía.
//
// SE SALTA CON CUALQUIER TECLA, igual que la intro, y por el mismo motivo: en
// la décima partida en Mérida el relato ya no informa de nada.

const estado = {
  reloj: 0,
  relato: null,
  placa: null,
  // Los relatos ya trazados, por id de nivel. Trazar el lienzo cuesta una
  // pasada de texto y un canvas del alto del guion: barato, pero no como para
  // repetirlo en cada partida de las veinte que se juegan seguidas.
  cache: new Map(),
  // Y las placas propias ya horneadas, por ruta. Hornear son 1920x1080 con
  // suavizado alto; dos niveles que compartan lámina la hornean una vez.
  placas: new Map()
};

export const Historia = {
  // ¿Tiene este nivel algo que contar? Lo pregunta main.js para saber si hay
  // pantalla que enseñar o se entra directo a jugar.
  hay(nivel) {
    return !!(nivel && nivel.historia && nivel.historia.length);
  },

  // LA LÁMINA DE FONDO, si el nivel trae la suya. Es asíncrono, así que se hace
  // al cargar el nivel (ver `usarNivel` en main.js) y no al abrir la pantalla:
  // una pantalla que empieza a pedir una imagen cuando ya se está viendo sale
  // primero sin ella y se le pone el fondo encima a media lectura.
  //
  // Sin `historiaImagen` se usa la placa de la intro, que es la de todos. No es
  // un apaño: la placa ES el marco del relato, y un nivel solo necesita la suya
  // si quiere otro marco.
  async cargarPlaca(nivel) {
    const ruta = nivel && nivel.historiaImagen;
    if (!ruta) return;
    if (estado.placas.has(ruta)) return;
    const img = await Recursos.cargarSuelta('assets/' + ruta);
    // El null también se guarda: si la imagen no está, no hay que volver a
    // pedirla en cada partida para que vuelva a fallar.
    estado.placas.set(ruta, img ? hornearPantalla(img, false) : null);
  },

  iniciar(nivel) {
    estado.reloj = 0;
    if (!estado.cache.has(nivel.id)) {
      estado.cache.set(nivel.id, prepararRelato(nivel.historia));
    }
    estado.relato = estado.cache.get(nivel.id);
    const propia = nivel.historiaImagen ? estado.placas.get(nivel.historiaImagen) : null;
    estado.placa = propia || Intro.placa;
  },

  // Devuelve true cuando se ha acabado y toca empezar la partida.
  actualizar(dt, entrada) {
    estado.reloj += dt;
    if (entrada.algunFlanco()) return true;
    return estado.reloj >= estado.relato.duracion;
  },

  dibujar(ctxMundo, ctxUi) {
    fondoPantalla(ctxMundo, estado.placa);
    dibujarRelato(ctxUi, estado.relato, estado.reloj);
    velo(ctxMundo, estado.reloj, estado.relato.duracion - estado.reloj, FUNDIDO);
  }
};
