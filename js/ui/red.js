import { ANCHO_UI, ALTO_UI, ANCHO_FISICO, ALTO_FISICO } from '../core/constantes.js';
import { FUENTE, FUENTE_TITULO, textoEspaciado, Capa } from './capa.js';
import { Tema, panel } from './tema.js';
import { fondoTitulo } from './pantallas.js';
import { actualizarCodigoRed, ocultarCodigoRed } from './codigoRed.js';

// LA PANTALLA DEL COOPERATIVO ONLINE.
//
// Aquí se hace a mano lo que hasta ahora se hacía desde la consola del
// navegador: generar el código, mandárselo al otro, pegar el suyo. Nada de lo
// que hay debajo cambia — es la misma conexión, el mismo códec y el mismo
// saludo—; lo único nuevo es que se puede usar sin saber que existe F12.
//
// POR QUÉ HAY QUE PASARSE UN CÓDIGO Y NO HAY UNA LISTA DE PARTIDAS. Para que
// dos navegadores se hablen tienen que intercambiar antes una descripción de
// cómo encontrarse, y para eso todavía no pueden hablarse. Lo normal es que
// haga de intermediario un servidor; aquí el intermediario sois vosotros, con
// el chat que ya uséis. Es la decisión de no depender de nada externo, y su
// precio es este: dos mensajes antes de jugar.
//
// EL PORTAPAPELES ES EL TECLADO DE ESTA PANTALLA. Un código son trescientos
// caracteres y no se teclean; se copian y se pegan. Copiar lo hace el juego
// solo; pegar necesita que lo pidas tú, porque el navegador no deja leer el
// portapapeles sin un gesto por delante.

const PANEL_ANCHO = 640;
const MARGEN = 26;

// El código, partido en trozos que quepan. No se enseña para leerlo —nadie va a
// copiarlo a mano— sino para que se vea que existe y que hay algo que mandar.
const TROZO = 48;

export const OPCIONES_RED = ['CREAR PARTIDA', 'UNIRME A UNA PARTIDA', 'VOLVER'];

function lineas(texto, cuantas) {
  const fuera = [];
  for (let i = 0; i < texto.length && fuera.length < cuantas; i += TROZO) {
    fuera.push(texto.slice(i, i + TROZO));
  }
  if (texto.length > cuantas * TROZO) {
    fuera[fuera.length - 1] = fuera[fuera.length - 1].slice(0, TROZO - 1) + '…';
  }
  return fuera;
}

function fondo(ctxMundo) {
  fondoTitulo(ctxMundo);
  ctxMundo.setTransform(1, 0, 0, 1, 0, 0);
  // MÁS OSCURO QUE LA PANTALLA DE PARTIDAS, y por una razón concreta: allí las
  // tres filas tapan el centro, y aquí hay poco texto sobre mucha ilustración.
  // Con el velo de allí se leían por debajo las opciones del menú del título
  // —JUGAR, TIENDA, CONFIGURACIÓN— y eso en una pantalla que no es esa no es
  // ambiente, es ruido: parece que se puedan pulsar.
  ctxMundo.fillStyle = 'rgba(6,6,12,.985)';
  ctxMundo.fillRect(0, 0, ANCHO_FISICO, ALTO_FISICO);
}

function titulo(ctx, texto) {
  const t = Tema.actual;
  ctx.font = `22px ${FUENTE_TITULO}`;
  ctx.fillStyle = t.titulo;
  textoEspaciado(ctx, texto, ANCHO_UI / 2, 52, 4);
}

// Un párrafo centrado, con las líneas que hagan falta.
function parrafo(ctx, textos, y, color, tamano = 15, salto = 22) {
  ctx.font = `${tamano}px ${FUENTE}`;
  ctx.fillStyle = color;
  for (let i = 0; i < textos.length; i++) {
    ctx.fillText(textos[i], ANCHO_UI / 2, y + i * salto);
  }
  return y + textos.length * salto;
}

// El menú de las tres opciones.
function dibujarMenu(ctx, cursor) {
  const t = Tema.actual;
  const ALTO = 40, HUECO = 12;
  const total = OPCIONES_RED.length * ALTO + (OPCIONES_RED.length - 1) * HUECO;
  let y = 150 + (ALTO_UI - 150 - 60 - total) / 2;
  const x = (ANCHO_UI - 360) / 2;

  for (let i = 0; i < OPCIONES_RED.length; i++) {
    const elegida = i === cursor;
    ctx.save();
    if (!elegida) ctx.globalAlpha = 0.45;
    panel(ctx, x, y, 360, ALTO, elegida);
    ctx.restore();
    ctx.font = `17px ${FUENTE}`;
    ctx.fillStyle = elegida ? t.titulo : t.texto;
    ctx.fillText(OPCIONES_RED[i], ANCHO_UI / 2, y + ALTO / 2);
    y += ALTO + HUECO;
  }
}

// EL AVISO DE POR QUÉ ESTO NO VA A CONECTAR, cuando se sabe de antemano.
//
// Va en amarillo y con marco, no como un párrafo más: es lo único de esta
// pantalla que puede ahorrarte media hora. Las dos primeras partidas en red de
// verdad fracasaron por motivos que estaban escritos dentro del código que los
// jugadores ya se habían mandado, y el juego se calló los dos.
//
// Se dibuja DEBAJO del código y no encima: el código sigue siendo lo que hay
// que mandar, y hay routers que sí conectan a pesar del aviso. Esto informa, no
// prohíbe.
function dibujarAviso(ctx, aviso, y) {
  if (!aviso) return y;
  const t = Tema.actual;
  const detalle = envolverEn(ctx, aviso.detalle, PANEL_ANCHO - 44);
  const alto = 30 + detalle.length * 17 + 14;
  const x = (ANCHO_UI - PANEL_ANCHO) / 2;
  panel(ctx, x, y, PANEL_ANCHO, alto, false);

  ctx.font = `600 15px ${FUENTE}`;
  ctx.fillStyle = '#ffd27a';
  ctx.fillText(aviso.titulo, ANCHO_UI / 2, y + 20);
  ctx.font = `13px ${FUENTE}`;
  ctx.fillStyle = t.texto;
  for (let i = 0; i < detalle.length; i++) {
    ctx.fillText(detalle[i], ANCHO_UI / 2, y + 40 + i * 17);
  }
  return y + alto + MARGEN;
}

// El bloque con el código propio y qué hacer con él.
function dibujarCodigo(ctx, estado, y) {
  const t = Tema.actual;
  if (!estado.codigo) return y;
  const trozos = lineas(estado.codigo, 4);
  const alto = trozos.length * 18 + 34;
  const x = (ANCHO_UI - PANEL_ANCHO) / 2;
  panel(ctx, x, y, PANEL_ANCHO, alto, false);

  ctx.font = `12px ${FUENTE}`;
  ctx.fillStyle = t.apagado;
  for (let i = 0; i < trozos.length; i++) {
    ctx.fillText(trozos[i], ANCHO_UI / 2, y + 22 + i * 18);
  }
  return y + alto + MARGEN;
}

// LA MISMA PANTALLA SIRVE PARA VOLVER, y hay que decirlo o engaña.
//
// El baile de códigos es idéntico —las credenciales de una conexión no se
// reciclan, así que reengancharse es pasarse dos códigos nuevos— pero lo que
// pasa al final no lo es: aquí no empieza una partida, se reanuda la que está
// congelada detrás. Sin esta línea, la pantalla dice CREANDO PARTIDA y quien la
// mira cree que ha perdido la suya.
function marcaReenganche(ctx, estado) {
  if (!estado.reenganche) return;
  const t = Tema.actual;
  ctx.font = `13px ${FUENTE}`;
  ctx.fillStyle = '#ffd27a';
  ctx.fillText('VOLVER A LA PARTIDA · sigue en pie, esperando a reanudarse',
               ANCHO_UI / 2,
               ALTO_UI - Math.max(0, (ALTO_UI - Capa.altoVisible) / 2) - 22);
}

export function dibujarRed(ctxMundo, ctx, estado) {
  fondo(ctxMundo);
  const t = Tema.actual;
  // La caja del código solo existe cuando hay un código que enseñar.
  actualizarCodigoRed(estado.fase === 'esperando' ? estado.codigo : '');

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (estado.fase === 'menu') {
    titulo(ctx, 'COOPERATIVO ONLINE');
    parrafo(ctx, [
      'Uno crea la partida y le manda un código al otro por donde habléis.',
      'El otro contesta con el suyo. Dos mensajes y a jugar.'
    ], 100, t.apagado, 14, 20);
    dibujarMenu(ctx, estado.cursor);
    // LA DIRECCIÓN DE CASA, al pie y en pequeño. No es del camino normal: solo
    // sirve para jugar con alguien de tu misma red, y ponerla arriba haría
    // pensar que hace falta siempre.
    parrafo(ctx, [estado.ipLocal
      ? `Tu dirección de casa: ${estado.ipLocal}   ·   L para cambiarla`
      : '¿Jugáis en la misma casa? Pulsa  L  y escribe tu dirección de red.'],
      // Al pie del hueco QUE SE VE, no del lienzo: en pantallas más anchas que
      // 16:9 al lienzo se le recortan franjas arriba y abajo, y una línea puesta
      // a ras del borde se pierde entera. Mismo cálculo que el botón de la
      // esquina del título (ui/pantallas.js).
      ALTO_UI - Math.max(0, (ALTO_UI - Capa.altoVisible) / 2) - 22, t.apagado, 13);
    ctx.restore();
    return;
  }

  // ESCRIBIENDO LA DIRECCIÓN DE CASA.
  //
  // Se teclea, no se pega: son doce caracteres y montar aquí el baile del
  // portapapeles por eso sería peor. Es la única pantalla del juego donde se
  // escribe algo, y se acepta solo lo que puede formar una dirección.
  if (estado.fase === 'ip') {
    titulo(ctx, 'TU DIRECCIÓN DE CASA');
    parrafo(ctx, [
      'Solo hace falta si el otro jugador está en TU MISMA wifi.',
      'En Windows sale con  ipconfig ; en Mac, en Ajustes de red.'
    ], 104, t.apagado, 14, 20);

    const x = (ANCHO_UI - 300) / 2;
    panel(ctx, x, 180, 300, 46, true);
    ctx.font = `22px ${FUENTE}`;
    ctx.fillStyle = estado.ipTecleada ? t.titulo : t.apagado;
    ctx.fillText(estado.ipTecleada || '192.168.1.__', ANCHO_UI / 2, 203);

    parrafo(ctx, estado.aviso ? [estado.aviso] : [''], 250, '#ffd27a', 14);
    parrafo(ctx, [
      'ENTER para guardarla   ·   BORRAR para corregir   ·   ESC para dejarlo'
    ], 300, t.apagado, 14);
    ctx.restore();
    return;
  }

  if (estado.fase === 'creando' || estado.fase === 'uniendo') {
    titulo(ctx, estado.reenganche
      ? (estado.fase === 'creando' ? 'PREPARANDO LA VUELTA' : 'VOLVIENDO')
      : (estado.fase === 'creando' ? 'CREANDO PARTIDA' : 'UNIÉNDOME'));
    parrafo(ctx, [estado.aviso || 'Un momento…'], ALTO_UI / 2, t.texto, 17);
    marcaReenganche(ctx, estado);
    ctx.restore();
    return;
  }

  if (estado.fase === 'esperando') {
    titulo(ctx, estado.esAnfitrion ? 'MANDA TU CÓDIGO' : 'DEVUELVE TU CÓDIGO');
    parrafo(ctx, estado.copiado
      ? ['Tu código ya está copiado: pégalo donde habléis.']
      : ['Cópialo con el botón, o selecciónalo y Ctrl+C.'], 104, t.texto, 16);
    // AQUÍ NO SE DIBUJA EL CÓDIGO: lo pone un `<textarea>` de verdad encima del
    // lienzo, para que se pueda seleccionar y copiar. Ver ui/codigoRed.js. Este
    // hueco entre el 150 y el 290 es el suyo.
    parrafo(ctx, estado.esAnfitrion
      ? ['Cuando te devuelva el suyo, pulsa  V  para pegarlo.',
         'ESC para volver.']
      : ['En cuanto lo pegue, entráis a la partida.',
         'ESC para volver.'], 320, t.apagado, 15);
    // Y debajo de todo, lo que ya se sabe que va a fallar. Ver dibujarAviso.
    dibujarAviso(ctx, estado.avisoConexion, 366);
    marcaReenganche(ctx, estado);
    ctx.restore();
    return;
  }

  if (estado.fase === 'pegar') {
    titulo(ctx, 'PEGA SU CÓDIGO');
    parrafo(ctx, [
      'Pulsa  V  para pegar el código que te han mandado.',
      '',
      'ESC para volver.'
    ], ALTO_UI / 2 - 20, t.texto, 17);
    marcaReenganche(ctx, estado);
    ctx.restore();
    return;
  }

  if (estado.fase === 'conectado') {
    const cuantos = 1 + (estado.conectados || 1);
    titulo(ctx, 'CONECTADOS');
    parrafo(ctx, [`Sois ${cuantos} jugadores.`], 110, t.titulo, 18);
    if (estado.reenganche) {
      parrafo(ctx, ['Comprobando que seguís en la misma partida…'],
              ALTO_UI / 2, t.texto, 16);
      marcaReenganche(ctx, estado);
      ctx.restore();
      return;
    }
    parrafo(ctx, estado.esAnfitrion
      ? cuantos < 4
        ? ['ENTER para empezar la partida.', '',
           'O pulsa  I  para invitar a alguien más (hasta cuatro).']
        : ['Ya sois cuatro, que es el máximo.', '', 'ENTER para empezar la partida.']
      : ['Esperando a que empiece el anfitrión…'],
      ALTO_UI / 2, t.texto, 16);
    // LO QUE TARDA LA CONEXIÓN Y QUÉ SE HA HECHO CON ELLO.
    //
    // El retardo llevaba clavado en 4 desde que se eligió sobre 1,4 ms entre dos
    // pestañas de la misma máquina, que no es una latencia. Ahora sale de medir
    // esta conexión, y se enseña porque es el único número de esta pantalla que
    // dice cómo se va a jugar. Tarda un segundo en aparecer: hasta entonces, no
    // se pinta nada en vez de un cero que engaña.
    if (estado.retardo) {
      parrafo(ctx, [`Viaje: ${Math.round(estado.rtt)} ms  ·  ` +
                    `retardo de entrada: ${estado.retardo} fotogramas`],
              ALTO_UI / 2 + 70, t.apagado, 14);
    }
    ctx.restore();
    return;
  }

  // Error. Es también donde acaba un reenganche que no cuadra, y ahí el texto no
  // es un "algo ha fallado": es la razón concreta por la que esas dos partidas
  // ya no se pueden juntar. Ver `comprobarReenganche` en red/sincro.js.
  titulo(ctx, 'NO HA PODIDO SER');
  // Partido POR PALABRAS y no cada 48 caracteres: `lineas` es para el código,
  // que no tiene palabras, y aquí cortaba los motivos por la mitad justo cuando
  // el motivo es lo único que hay.
  ctx.font = `15px ${FUENTE}`;
  parrafo(ctx, envolverEn(ctx, estado.aviso || 'Algo ha fallado.',
                          PANEL_ANCHO - 40).slice(0, 4),
          ALTO_UI / 2 - 40, t.texto, 15);
  parrafo(ctx, [estado.reenganche
    ? 'ESC para volver al cartel.'
    : 'ESC para volver.'], ALTO_UI / 2 + 60, t.apagado, 15);
  marcaReenganche(ctx, estado);
  ctx.restore();
}

// --- Cuando se cae la red ----------------------------------------------------
//
// Hasta ahora la partida se paraba y lo decía por la consola, que es como no
// decirlo: quien está jugando ve el mundo congelado y no sabe si ha sido su
// wifi, el del otro o un fallo del juego.
//
// ESTE CARTEL YA NO SALE POR CUALQUIER TROPIEZO. Antes lo sacaba el primer
// corte, y la mayoría de los cortes vuelven solos a los pocos segundos; ahora
// delante hay un compás de espera —`dibujarEspera`, aquí arriba— y aquí se
// llega cuando ya se ha esperado y no ha vuelto.
//
// Dos salidas y ninguna más, porque no hay más: seguir tú solo con la partida
// donde está, o volver al menú. Volver a engancharse tras un corte de verdad
// exige repetir el baile de códigos, porque la señalización sois vosotros, y
// eso no está hecho.
export const OPCIONES_CAIDA = ['SEGUIR EN SOLITARIO', 'VOLVER AL MENÚ'];

// Y CON EL REENGANCHE DELANTE, cuando se puede. Va primero porque es lo que casi
// todo el mundo quiere: seguir la partida que estabais jugando. Las otras dos
// siguen debajo y en el mismo orden, para que quien ya se sepa el cartel no
// pulse lo que no era.
export const OPCIONES_CAIDA_RE = ['RECONECTAR', 'SEGUIR EN SOLITARIO', 'VOLVER AL MENÚ'];

// TAMBIÉN CON TRES O CUATRO. En estrella, un invitado que se cae solo ha
// perdido SU enlace con el anfitrión; los demás siguen enganchados y
// esperando. `sePuedeReenganchar` en main.js decide esto mirando si la caída
// fue de red y no una desincronización; `Sincro.reanudar` en red/sincro.js es
// quien sustituye solo el enlace que se cayó sin tocar los otros — ver
// "Con tres o cuatro" en docs/cooperativo-online.md.
export function opcionesCaida(sePuedeReenganchar) {
  return sePuedeReenganchar ? OPCIONES_CAIDA_RE : OPCIONES_CAIDA;
}

// EL COMPÁS DE ESPERA, que es el cartel que faltaba.
//
// Hasta ahora una partida en red solo tenía dos estados a la vista: se juega, o
// se ha cortado y salen las dos salidas. Entre medias estaba el caso más
// frecuente de todos —el contacto se va unos segundos y vuelve— y se veía como
// lo peor que puede verse: la imagen congelada, sin un mensaje, sin saber si ha
// sido tu wifi, la del otro o que el juego se ha colgado.
//
// NO SE OSCURECE LA PANTALLA, a diferencia del cartel de caída. Es deliberado:
// la partida no se ha perdido, sigue ahí entera esperando a seguir, y taparla
// diría justo lo contrario. Una tira abajo basta para explicar la quietud sin
// dar a entender que se acabó.
export function dibujarEspera(ctx, espera) {
  const t = Tema.actual;
  const ancho = 400, alto = 56;
  const px = (ANCHO_UI - ancho) / 2;
  const py = ALTO_UI - alto - 34;

  ctx.save();
  panel(ctx, px, py, ancho, alto, true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // El motivo del transporte manda sobre el genérico: "se ha perdido el
  // contacto" dice a qué atenerse, y "esperando a jugador 2" no dice nada que no
  // se vea ya en la pantalla parada.
  let texto = espera.motivo;
  if (!texto) {
    const quien = espera.quien.map((i) => 'jugador ' + (i + 1)).join(', ');
    texto = 'Esperando a ' + (quien || 'el otro jugador') + '…';
  }
  ctx.font = `13px ${FUENTE}`;
  ctx.fillStyle = t.texto;
  ctx.fillText(texto, ANCHO_UI / 2, py + 20);

  // LA CUENTA ATRÁS SOLO SALE SI DE VERDAD LA HAY. Con el canal sano se espera
  // sin límite —el otro puede tener la pestaña de fondo— y un número bajando
  // ahí sería una amenaza inventada.
  ctx.font = `11px ${FUENTE}`;
  ctx.fillStyle = t.apagado;
  if (espera.restan > 0) {
    ctx.fillText('Se sigue solo si vuelve · ' + Math.ceil(espera.restan) + ' s',
                 ANCHO_UI / 2, py + 40);
  } else {
    ctx.fillText('La partida sigue entera; se reanuda sola · ' +
                 espera.segundos.toFixed(0) + ' s', ANCHO_UI / 2, py + 40);
  }
  ctx.restore();
}

export function dibujarCaida(ctx, motivo, cursor, opciones) {
  const OPCIONES = opciones || OPCIONES_CAIDA;
  const t = Tema.actual;
  const ancho = 460, alto = 190 + (OPCIONES.length - 2) * 40;
  const px = (ANCHO_UI - ancho) / 2;
  const py = (ALTO_UI - alto) / 2;

  ctx.save();
  ctx.fillStyle = 'rgba(6,5,10,.82)';
  ctx.fillRect(0, 0, ANCHO_UI, ALTO_UI);
  panel(ctx, px, py, ancho, alto, true);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `18px ${FUENTE_TITULO}`;
  ctx.fillStyle = t.titulo;
  textoEspaciado(ctx, 'SE HA CORTADO', ANCHO_UI / 2, py + 32, 3);

  // El motivo, en pequeño y con sus palabras. Da igual que sea largo: lo que
  // importa es que quien lo lee sepa si tiene que llamar a su hermana o mirarse
  // el router.
  ctx.font = `13px ${FUENTE}`;
  ctx.fillStyle = t.apagado;
  const trozos = envolverEn(ctx, motivo || 'Se ha perdido la conexión.', ancho - 48);
  for (let i = 0; i < trozos.length && i < 3; i++) {
    ctx.fillText(trozos[i], ANCHO_UI / 2, py + 62 + i * 18);
  }

  const ALTO_OP = 32;
  let y = py + alto - 24 - OPCIONES.length * (ALTO_OP + 8);
  for (let i = 0; i < OPCIONES.length; i++) {
    const elegida = i === cursor;
    ctx.font = `15px ${FUENTE}`;
    ctx.fillStyle = elegida ? t.titulo : t.texto;
    ctx.fillText((elegida ? '> ' : '') + OPCIONES[i], ANCHO_UI / 2, y + ALTO_OP / 2);
    y += ALTO_OP + 8;
  }
  ctx.restore();
}

// Partir un texto por palabras para que quepa. No usa `envolverTexto` de capa.js
// porque aquí hace falta a lo ancho de un panel concreto, no del lienzo.
function envolverEn(ctx, texto, anchoMax) {
  const palabras = String(texto).split(' ');
  const fuera = [];
  let linea = '';
  for (let i = 0; i < palabras.length; i++) {
    const prueba = linea ? linea + ' ' + palabras[i] : palabras[i];
    if (ctx.measureText(prueba).width > anchoMax && linea) { fuera.push(linea); linea = palabras[i]; }
    else linea = prueba;
  }
  if (linea) fuera.push(linea);
  return fuera;
}
