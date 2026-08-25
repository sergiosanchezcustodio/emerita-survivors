import { ANCHO_UI, ALTO_UI, ANCHO_FISICO, ALTO_FISICO } from '../core/constantes.js';
import { FUENTE, FUENTE_TITULO, FUENTE_RELATO, textoEspaciado } from './capa.js';
import { fondoTitulo } from './pantallas.js';
import { Recursos } from '../core/recursos.js';

// LA INTRO: dos pantallas antes del menú.
//
//   1. EL SPLASH. Una ilustración de Sergio que YA TRAE TODO ESCRITO: las
//      tecnologías, el crédito de IA, la licencia y su propio "pulsa cualquier
//      tecla". Aquí NO se dibuja nada encima. Llegó a llevar los enlaces del
//      repositorio y de itch.io escritos por código y se quitaron: en una
//      ilustración tan cargada, tres direcciones en una esquina no se leían como
//      información, se leían como una pegatina.
//   2. EL RELATO. La historia subiendo por el hueco de una placa de piedra que
//      dibujó Sergio, con la tricolor extremeña envolviéndola.
//
// EL RELATO NO VA EN PERSPECTIVA. La primera versión era un rótulo estilo Star
// Wars, con el texto alejándose hacia un horizonte, y se cambió por texto PLANO
// que sube sin encoger. La perspectiva tenía sentido sobre un cielo abierto;
// dentro del hueco rectangular de una placa, el texto que mengua hacia el fondo
// pelea con el marco en vez de acompañarlo — y además obligaba a leer lo que
// venía cada vez más pequeño. Lo que queda es más simple y se lee mejor: entra
// por abajo, sube a tamaño constante y sale por arriba.
//
// CÓMO SE SALTA. Dos gestos distintos a propósito:
//
//   - Start, ESC o Enter: pasa a la SIGUIENTE pantalla.
//   - Mantener A: se salta la intro ENTERA, de una vez.
//
// Un solo gesto para las dos cosas obligaría a pulsar dos veces a quien ya se
// la sabe, y un gesto sostenido para pasar de pantalla sería lento para quien
// solo quiere avanzar. Los dos salen escritos en el pie: un atajo que no se ve
// no existe.
//
// EN DOS LIENZOS, como el resto de la interfaz (ver ui/capa.js): las
// ilustraciones van al lienzo del MUNDO y TODO el texto a la capa de interfaz,
// que va a la resolución real del monitor.

const FASE_SPLASH = 0;
const FASE_RELATO = 1;

// Lo que dura el splash solo, si nadie toca nada. Su placa invita a pulsar, pero
// la pantalla NO se queda esperando para siempre: un juego que se planta en el
// arranque hasta que alguien toque una tecla es un juego que parece colgado si
// lo dejas puesto. Trece segundos dan para leer los cinco renglones sin prisa.
const SPLASH_DURA = 13;

// EL RITMO DEL RELATO: cada cuántos segundos asoma un renglón nuevo por abajo.
//
// Es el único número que gobierna la velocidad, y se expresa así —y no como una
// duración total— porque es lo que de verdad se percibe. Reescribir el guion
// cambia lo que dura la pantalla, no el ritmo al que se lee, que es justo lo
// que hay que conservar.
//
// Ojo con confundirlo con el tiempo de lectura: un renglón tarda 1,4 s en
// aparecer detrás del anterior, pero se pasa DOCE SEGUNDOS cruzando el hueco de
// la placa antes de salir por arriba. Tiempo para leerlo sobra.
const SEGUNDOS_POR_LINEA = 1.4;

// Fundido a negro del final, ya con el texto fuera. Un corte seco de la placa al
// menú se ve como un fallo; un fundido se lee como que la intro ha terminado.
const CIERRE = 2;

// Cuánto hay que mantener A para saltarse la intro entera.
const MANTENER = 0.7;
const BOTON_A = 0;
const BOTON_START = 9;

const RUTA_SPLASH = 'assets/menus/splash.jpg';
const RUTA_HISTORIA = 'assets/menus/intro-historia.jpg';

// EL GUION. Las líneas van PARTIDAS A MANO, no envueltas por `envolverTexto`:
// en un texto que se lee renglón a renglón según entra, el corte de cada línea
// es parte del ritmo, y un reparto automático deja líneas viudas de dos palabras
// justo donde más se ven. Una cadena vacía es un renglón en blanco.
//
// Los prefijos: '#' es el titular y '@' el antetítulo. Un carácter en vez de una
// estructura con tipos porque son dos casos y solo se usan aquí.
const GUION = [
  '@CAPÍTULO I',
  '#LA HORDA',
  '#DE EMERITA',
  '',
  '',
  'Hace veinte siglos Roma levantó',
  'Emerita Augusta sobre el Guadiana',
  'y la nombró capital de Lusitania.',
  '',
  'Su teatro, su anfiteatro, su',
  'acueducto y su puente siguen hoy',
  'en pie, en la ciudad de Mérida.',
  '',
  'Pero algo se ha despertado bajo',
  'las piedras. Cuando cae la noche,',
  'la horda sale del foro y de las',
  'cloacas, y no deja de crecer.',
  '',
  'Treinta minutos. Ni uno menos.',
  'Sube de nivel, elige tus armas',
  'y llega hasta la Loba Capitolina.',
  '',
  'Nadie ha aguantado tanto.'
];

const ORO = '#e8b73a';
const ORO_CLARO = '#f7dc9a';
const APAGADO = '#9aa0ab';

// --- El hueco de la placa ----------------------------------------------------
//
// Medido sobre la ilustración recorriendo desde el centro hacia fuera hasta
// salir de lo oscuro: el panel va de x=240 a x=1013 y de y=196 a y=622 en
// píxeles de la imagen (1248x832). De ahí, con la imagen encajada a lo alto del
// lienzo y centrada, salen estas unidades de interfaz.
const PANEL = { x0: 239, x1: 725, y0: 135, y1: 397 };
const PANEL_CX = (PANEL.x0 + PANEL.x1) / 2;

// Aire entre la piedra y el texto, para que el relato no roce el labrado.
const MARGEN = 10;

// Ancho de la columna de texto. El hueco de la placa mide 486, así que quedan
// diez unidades de respiro a cada lado.
const ANCHO_TEXTO = 466;

// Y un pelo más de guarda para el AJUSTE A LO ANCHO (ver `escalaQueEntra`): si
// se apurara hasta el borde exacto, un carácter con un adorno que se salga de
// su caja tocaría el canto del lienzo.
const GUARDA = 8;

// Por dónde entra y sale el texto. Un corte limpio contra el borde del hueco
// partiría las letras por la mitad; con este desvanecido, el renglón asoma y se
// apaga como si la piedra tuviera sombra en los bordes.
const DESVANECE = 26;

// Alto de las tiras en que se dibuja el texto. Al no haber perspectiva no hacen
// falta para deformar nada: son solo para que el desvanecido de los bordes
// pueda variar de una a otra.
const PASO = 2;

// El texto se traza al doble para que al pasarlo a pantalla siga estando fino.
const RES = 2;

// --- Cuerpos de letra, en unidades de interfaz -------------------------------
//
// Sin perspectiva, lo que se escribe aquí es LO QUE SE VE: un cuerpo de 19 se
// dibuja de 19 unidades de alto, siempre, esté el renglón donde esté. Antes no
// era así —la perspectiva estiraba o encogía según la altura— y por eso estos
// números no se parecen a los de la versión anterior.
//
// Son un tope, no una promesa: si la fuente que le toque a la máquina mide más
// de la cuenta, `escalaQueEntra` los baja hasta que el renglón entre.
const CUERPO = 19, SALTO = 27;
const CUERPO_TITULAR = 32, SALTO_TITULAR = 44;
const CUERPO_ANTE = 14, SALTO_ANTE = 24;
const SALTO_BLANCO = 15;

// Separación entre letras del titular y del antetítulo. Una inscripción romana
// va espaciada; un párrafo no.
const ESPACIADO_TITULAR = 3;
const ESPACIADO_ANTE = 6;

const estado = {
  fase: FASE_SPLASH,
  reloj: 0,
  mantenido: 0,
  texto: null,        // lienzo con el guion trazado
  altoTexto: 0,       // su alto, en unidades de interfaz
  velocidad: 0,
  duracion: 0,
  splash: null,       // el splash, horneado al tamaño de la pantalla
  historia: null      // la placa de la historia, horneada igual
};

export const Intro = {
  // Se llama una vez al arrancar, con el resto de recursos. Si una ilustración
  // no carga, su pantalla sale con un fondo de reserva: se pierde el dibujo, no
  // la posibilidad de llegar al menú.
  async cargar() {
    const [splash, historia] = await Promise.all([
      Recursos.cargarSuelta(RUTA_SPLASH),
      Recursos.cargarSuelta(RUTA_HISTORIA)
    ]);
    if (splash) estado.splash = hornearPantalla(splash, true);
    if (historia) estado.historia = hornearPantalla(historia, false);
  },

  iniciar() {
    estado.fase = FASE_SPLASH;
    estado.reloj = 0;
    estado.mantenido = 0;
    if (!estado.texto) prepararRelato();
  },

  // Devuelve true cuando la intro se ha acabado y toca ir al menú.
  actualizar(dt, entrada) {
    estado.reloj += dt;

    // MANTENER A: salta la intro entera. Se cuenta con el paso de lógica, que
    // es fijo a 60 Hz, así que los 0,7 s son los mismos en cualquier máquina.
    if (entrada.botonMantenido(BOTON_A)) {
      estado.mantenido += dt;
      if (estado.mantenido >= MANTENER) return true;
    } else {
      estado.mantenido = 0;
    }

    // START / ESC / ENTER: siguiente pantalla.
    //
    // Y en el SPLASH, cualquier tecla o botón, porque es lo que promete su
    // propia placa. Un cartel que dice "pulsa cualquier tecla" y luego solo
    // acepta tres es peor que no poner cartel: el que prueba con la barra
    // espaciadora concluye que el juego se ha colgado.
    let pasa = entrada.consumirFlanco('Escape', BOTON_START) ||
               entrada.consumirFlanco('Enter');
    if (!pasa && estado.fase === FASE_SPLASH) pasa = entrada.algunFlanco();
    if (pasa) return siguiente();

    if (estado.fase === FASE_SPLASH && estado.reloj >= SPLASH_DURA) return siguiente();
    if (estado.fase === FASE_RELATO && estado.reloj >= estado.duracion) return true;
    return false;
  },

  dibujar(ctxMundo, ctxUi) {
    if (estado.fase === FASE_SPLASH) {
      fondoPantalla(ctxMundo, estado.splash);
    } else {
      fondoPantalla(ctxMundo, estado.historia);
      relato(ctxUi);
      velo(ctxMundo);
    }
    pie(ctxUi);
  }
};

function siguiente() {
  if (estado.fase === FASE_SPLASH) {
    estado.fase = FASE_RELATO;
    estado.reloj = 0;
    return false;
  }
  return true;
}

// --- Las dos ilustraciones ---------------------------------------------------
//
// Se hornean UNA VEZ al tamaño de la pantalla. Sin hornear, cada fotograma
// repetiría un reescalado con suavizado alto para una imagen que no cambia
// nunca — la misma lección que el fondo del título (ver tituloVivo.js).
//
// `estirar` decide qué hacer con la diferencia de proporción, y las dos piden
// cosas distintas:
//
//   - EL SPLASH se estira a 1920x1080. Mide 1672x941, que es 16:9 salvo por un
//     0,06%: la deformación es invisible y así llena la pantalla.
//   - LA PLACA DE LA HISTORIA, no. Mide 1248x832 —3:2 contra 16:9— y estirarla
//     un 18% ensancharía las calaveras y las cintas. Pero recortarla tampoco
//     vale: es un MARCO, y a un marco cortarle los bordes es quitarle lo que
//     es. Así que se encaja entera a lo alto y las dos franjas que sobran a los
//     lados se rellenan con la propia imagen estirada y apagada por detrás. Ni
//     se deforma el marco ni aparecen bandas negras, que en una pantalla de
//     presentación se leen como que algo ha fallado.
function hornearPantalla(img, estirar) {
  const c = document.createElement('canvas');
  c.width = ANCHO_FISICO;
  c.height = ALTO_FISICO;
  const cx = c.getContext('2d');
  cx.imageSmoothingEnabled = true;
  cx.imageSmoothingQuality = 'high';

  if (estirar) {
    cx.drawImage(img, 0, 0, ANCHO_FISICO, ALTO_FISICO);
    return c;
  }

  // El telón: la misma imagen a todo lo ancho y apagada, solo para que los
  // lados no queden vacíos.
  cx.drawImage(img, 0, 0, ANCHO_FISICO, ALTO_FISICO);
  cx.fillStyle = 'rgba(4,3,8,0.66)';
  cx.fillRect(0, 0, ANCHO_FISICO, ALTO_FISICO);

  // Y encima el marco entero, sin recortar, centrado.
  const esc = ALTO_FISICO / img.height;
  const ancho = img.width * esc;
  cx.drawImage(img, (ANCHO_FISICO - ancho) / 2, 0, ancho, ALTO_FISICO);
  return c;
}

function fondoPantalla(ctxMundo, horneada) {
  ctxMundo.setTransform(1, 0, 0, 1, 0, 0);
  if (horneada) {
    ctxMundo.imageSmoothingEnabled = false;
    ctxMundo.drawImage(horneada, 0, 0);
    return;
  }
  // Sin ilustración: la del título con un velo. Fea de reserva, pero arranca.
  fondoTitulo(ctxMundo);
  ctxMundo.setTransform(1, 0, 0, 1, 0, 0);
  ctxMundo.fillStyle = 'rgba(6,6,12,0.80)';
  ctxMundo.fillRect(0, 0, ANCHO_FISICO, ALTO_FISICO);
}

// --- El relato ---------------------------------------------------------------

// El guion, trazado una sola vez en un lienzo aparte. Lo que cambia cada
// fotograma es por dónde se corta, no lo que pone.
function prepararRelato() {
  const ancho = ANCHO_TEXTO * RES;

  // Primero se suma el alto, para saber de qué tamaño hace falta el lienzo. No
  // hace falta medir con el contexto: el alto de cada renglón lo fija su tipo de
  // línea, no lo que ponga en ella.
  let alto = 0;
  for (let i = 0; i < GUION.length; i++) alto += altoLinea(GUION[i]);

  const c = document.createElement('canvas');
  c.width = ancho;
  c.height = Math.ceil(alto * RES) + 40;
  const ctx = c.getContext('2d');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // AJUSTE A LO ANCHO, antes de trazar nada.
  //
  // Hace falta porque el cuerpo de letra que se escribe aquí no dice cuánto va
  // a MEDIR la línea: eso lo decide la fuente que tenga la máquina. Trajan Pro
  // no está instalada en casi ningún sitio, así que el titular cae en la
  // primera de repuesto, y las de repuesto no miden todas igual — medidas
  // sobre este mismo guion, Georgia pide un 14% más de ancho que Palatino.
  //
  // Sin esto, "LA HORDA DE EMERITA" a cuerpo 32 pedía 1378 píxeles de los 860
  // que había, y se dibujaba centrada: se perdían la L del principio y la A del
  // final. Los párrafos también se salían, solo que se notaba menos.
  //
  // Se calcula UN factor por tipo de renglón, no uno por línea: encoger solo la
  // frase larga dejaría un párrafo con dos tamaños distintos, que se lee como
  // un error de maquetación.
  const cabe = ancho - GUARDA * RES;
  const escTitular = escalaQueEntra(ctx, cabe, '#');
  const escAnte = escalaQueEntra(ctx, cabe, '@');
  const escCuerpo = escalaQueEntra(ctx, cabe, '');

  let y = 0;
  for (let i = 0; i < GUION.length; i++) {
    const linea = GUION[i];
    const salto = altoLinea(linea);
    if (linea.length > 0) {
      // La base del renglón, no su borde de arriba: por eso el 0,78.
      const base = (y + salto * 0.78) * RES;
      if (linea[0] === '#') {
        // El titular SÍ va en la romana capital: dos palabras en versales son
        // una inscripción, que es exactamente lo que pide una placa de piedra.
        ctx.font = fuente('#', escTitular);
        ctx.fillStyle = ORO_CLARO;
        textoEspaciado(ctx, linea.slice(1), ancho / 2, base,
                       ESPACIADO_TITULAR * escTitular * RES);
      } else if (linea[0] === '@') {
        ctx.font = fuente('@', escAnte);
        ctx.fillStyle = ORO;
        textoEspaciado(ctx, linea.slice(1), ancho / 2, base,
                       ESPACIADO_ANTE * escAnte * RES);
      } else {
        ctx.font = fuente('', escCuerpo);
        ctx.fillStyle = ORO;
        ctx.fillText(linea, ancho / 2, base);
      }
    }
    y += salto;
  }

  estado.texto = c;
  estado.altoTexto = y;

  // Velocidad: la que hace que asome un renglón cada SEGUNDOS_POR_LINEA.
  estado.velocidad = SALTO / SEGUNDOS_POR_LINEA;
  // Y la duración: lo que tarda el guion entero en cruzar el hueco de punta a
  // punta —su propio alto MÁS el alto del hueco, porque el primer renglón
  // todavía tiene que subirlo entero— y el fundido final.
  const util = (PANEL.y1 - MARGEN) - (PANEL.y0 + MARGEN);
  estado.duracion = (y + util) / estado.velocidad + CIERRE;
}

// La fuente de un tipo de renglón a una escala dada. En un solo sitio, porque
// el ajuste tiene que medir con EXACTAMENTE la misma fuente con la que después
// se traza; si se escribieran en dos sitios, un día dejarían de coincidir y la
// medida mentiría.
function fuente(tipo, esc) {
  if (tipo === '#') return '700 ' + (CUERPO_TITULAR * esc * RES).toFixed(2) + 'px ' + FUENTE_TITULO;
  if (tipo === '@') return '600 ' + (CUERPO_ANTE * esc * RES).toFixed(2) + 'px ' + FUENTE_TITULO;
  return (CUERPO * esc * RES).toFixed(2) + 'px ' + FUENTE_RELATO;
}

// Cuánto hay que encoger un tipo de renglón para que el más largo de los suyos
// entre en la columna. Devuelve 1 si ya entran todos, que es el caso normal.
//
// El ancho crece proporcional al cuerpo, así que basta medir una vez al tamaño
// nominal y dividir: no hace falta probar tamaños uno a uno.
function escalaQueEntra(ctx, cabe, tipo) {
  let peor = 0;
  for (let i = 0; i < GUION.length; i++) {
    const linea = GUION[i];
    if (linea.length === 0) continue;
    const suyo = (linea[0] === '#' || linea[0] === '@') ? linea[0] : '';
    if (suyo !== tipo) continue;
    ctx.font = fuente(tipo, 1);
    const w = tipo === ''
      ? ctx.measureText(linea).width
      : anchoEspaciado(ctx, linea.slice(1), espaciadoDe(tipo) * RES);
    if (w > peor) peor = w;
  }
  return peor > cabe ? cabe / peor : 1;
}

function espaciadoDe(tipo) {
  return tipo === '#' ? ESPACIADO_TITULAR : ESPACIADO_ANTE;
}

// Lo que va a ocupar `textoEspaciado`, sin dibujar nada. Repite su cuenta letra
// a letra a propósito: medir la cadena entera daría OTRO número, porque el
// navegador aplica kerning entre pares y el trazado letra a letra no.
function anchoEspaciado(ctx, txt, extra) {
  const letras = [...txt];
  if (letras.length === 0) return 0;
  let total = 0;
  for (let i = 0; i < letras.length; i++) total += ctx.measureText(letras[i]).width + extra;
  return total - extra;
}

function altoLinea(linea) {
  if (linea.length === 0) return SALTO_BLANCO;
  if (linea[0] === '#') return SALTO_TITULAR;
  if (linea[0] === '@') return SALTO_ANTE;
  return SALTO;
}

// El texto sube a TAMAÑO CONSTANTE. Se dibuja en tiras horizontales, pero al
// revés que en la versión en perspectiva: aquí todas las tiras miden lo mismo y
// van a escala 1:1, y lo único que cambia de una a otra es la opacidad cerca de
// los bordes del hueco.
function relato(ctx) {
  if (!estado.texto) return;
  const arriba = PANEL.y0 + MARGEN;
  const abajo = PANEL.y1 - MARGEN;

  // Dónde cae la primera fila del texto: pegada al borde de abajo al empezar, y
  // subiendo a partir de ahí.
  const origen = abajo - estado.reloj * estado.velocidad;
  const x = PANEL_CX - ANCHO_TEXTO / 2;

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  for (let y = arriba; y < abajo; y += PASO) {
    const alto = Math.min(PASO, abajo - y);
    const fila = y - origen;
    if (fila < 0 || fila + alto > estado.altoTexto) continue;

    const borde = Math.min(y - arriba, abajo - y);
    const a = Math.max(0, Math.min(1, borde / DESVANECE));
    if (a <= 0.01) continue;

    ctx.globalAlpha = a;
    ctx.drawImage(estado.texto,
                  0, fila * RES, estado.texto.width, alto * RES,
                  x, y, ANCHO_TEXTO, alto);
  }

  ctx.restore();
}

function velo(ctxMundo) {
  const sobra = estado.duracion - estado.reloj;
  if (sobra >= CIERRE) return;
  const a = Math.min(1, (CIERRE - sobra) / CIERRE);
  ctxMundo.setTransform(1, 0, 0, 1, 0, 0);
  ctxMundo.fillStyle = 'rgba(0,0,0,' + a.toFixed(3) + ')';
  ctxMundo.fillRect(0, 0, ANCHO_FISICO, ALTO_FISICO);
}

// --- El pie, en las dos pantallas -------------------------------------------

function pie(ctx) {
  ctx.save();
  ctx.textAlign = 'center';

  // EN EL SPLASH NO SE ESCRIBE EL ATAJO: la ilustración ya trae su placa de
  // "PULSA CUALQUIER TECLA PARA CONTINUAR", y poner debajo otra línea diciendo
  // lo mismo con otras palabras es ruido, además de tapar el dibujo.
  if (estado.fase !== FASE_SPLASH) {
    ctx.font = '11px ' + FUENTE;
    ctx.fillStyle = APAGADO;
    ctx.globalAlpha = 0.85;
    ctx.fillText('START · ESC · ENTER   siguiente          MANTÉN A   saltar la intro',
                 ANCHO_UI / 2, ALTO_UI - 16);
  }

  // Mientras se mantiene A, una barra que se llena. Sin ella, el gesto es fe
  // ciega: no se sabe si el juego lo está oyendo ni cuánto falta.
  if (estado.mantenido > 0) {
    const u = Math.min(1, estado.mantenido / MANTENER);
    const ancho = 130;
    const x = ANCHO_UI / 2 - ancho / 2;
    const y = ALTO_UI - 10;
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x, y, ancho, 2);
    ctx.fillStyle = ORO;
    ctx.fillRect(x, y, ancho * u, 2);
  }
  ctx.restore();
}
