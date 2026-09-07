import { ANCHO_UI, ESCALA_ARTE } from '../core/constantes.js';
import { Recursos } from '../core/recursos.js';
import { FUENTE, FUENTE_TITULO, textoEspaciado } from './capa.js';
import { Tema } from './tema.js';
import { MARGEN, rejilla, armazon, resalte, descripcion } from './tabla.js';

// LA PANTALLA DE ELEGIR NIVEL. La lista de sitios a la izquierda y, a la
// derecha, una ventana con el que está señalado.
//
// Va sobre el mismo armazón que la tienda y la configuración (ui/tabla.js) y no
// sobre un dibujado propio, por el mismo motivo que ellas dos: con dos copias,
// el primer ajuste de márgenes deja una descuadrada y eso se descubre seis
// meses después mirando una captura. Lo único que se le ha pedido de más al
// armazón es poder ESTRECHAR la tabla, para que la regla y la última columna no
// crucen por encima de la ventana.
//
// LO QUE SE ENSEÑA DE CADA NIVEL sale del propio archivo de datos —nombre,
// subtítulo, duración, suelo y decoración— y no de una lista escrita aquí.
// Escribir los nombres a mano sería tener dos verdades y que la pantalla
// anunciara un nivel con un nombre que el juego ya no usa.
const NOMBRES = ['ELEGIR NIVEL'];

// La fila lleva DOS renglones —el nombre grande y su subtítulo debajo— así que
// necesita más alto que una fila de tienda.
const ALTO_FILA = 52;

// Dónde acaba la lista y empieza la ventana. La lista se queda con poco más de
// la mitad izquierda: le sobra, porque ya solo lleva el nombre y la duración.
const TABLA_DER = 520;

// LA VENTANA DEL NIVEL. 320x180 son las proporciones de la pantalla del juego
// (480x270), así que lo que se ve dentro se lee como una pantalla y no como una
// ilustración recortada. "No muy grande" es literal: ocupa un tercio del ancho
// y no compite con la lista, que es donde está la decisión.
const VISTA_ANCHO = 320;
const VISTA_ALTO = 180;

// El gris de lo que está cerrado. Se apaga a la vez el nombre, el subtítulo y
// la duración: apagar solo el nombre dejaba la fila leyéndose como una abierta
// con el título en mal color.
const APAGADO = 'rgba(255,255,255,.28)';

// Los suelos ya cargados, por id de nivel. `null` es "se pidió y no había".
//
// SE PIDEN DE UNO EN UNO, según se señalan. Cargar los seis al abrir la
// pantalla sería traer seis mapas pintados para enseñar uno. Y se guardan
// porque bajar y subir por la lista pasaría por los mismos sitios una y otra
// vez.
const suelos = new Map();

// PEDIR EL SUELO DEL NIVEL SEÑALADO. Lo llama main.js al entrar en la pantalla
// y cada vez que se mueve el cursor, no el dibujado: una función de dibujo que
// arranca descargas se llama sesenta veces por segundo y no hay forma de saber
// desde fuera cuántas peticiones ha hecho.
export function pedirVista(nivel) {
  if (!nivel || !nivel.suelo || !nivel.suelo.imagen) return;
  if (suelos.has(nivel.id)) return;
  // Se marca ANTES de esperar: sin esto, el segundo fotograma pediría otra vez
  // la misma imagen porque la primera todavía no ha llegado.
  suelos.set(nivel.id, undefined);
  Recursos.cargarSuelta('assets/' + nivel.suelo.imagen)
    .then((img) => suelos.set(nivel.id, img || null));
}

export function dibujarNiveles(ctxMundo, ctx, lista, cursor, cargando) {
  const r = rejilla(lista.length, ALTO_FILA);

  ctx.save();
  // Dos columnas y nada más: el sitio y lo que dura. El subtítulo ya no es una
  // columna —va debajo del nombre, que es donde se lee como lo que es— y el
  // estado tampoco: lo dice el propio nombre apagado.
  armazon(ctxMundo, ctx, r, NOMBRES, 0, ['NIVEL', '', '', 'DURACIÓN'],
          { x: [MARGEN, 0, 0, TABLA_DER], derecha: TABLA_DER });

  const t = Tema.actual;
  for (let i = 0; i < lista.length; i++) {
    const f = lista[i];
    const elegida = i === cursor;
    const y = r.filas + i * r.alto;
    const yc = y + r.alto / 2 - 2;

    if (elegida) resalte(ctx, y, r.alto, TABLA_DER);

    // EL NOMBRE, GRANDE. Es lo que se viene a leer a esta pantalla: no se elige
    // un sitio por su duración ni por su subtítulo, se elige por dónde es. A 15
    // px y en la misma línea que todo lo demás se leía como una fila de tienda,
    // que es una lista de cosas comparables — y aquí no se comparan cosas, se
    // escoge un destino.
    //
    // En la romana del juego y espaciado, como una inscripción. Empieza EN EL
    // MARGEN, no sangrado: la sangría de la tienda es el hueco de su icono y
    // aquí no hay icono, así que la columna queda a plomo con su rótulo.
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `22px ${FUENTE_TITULO}`;
    ctx.fillStyle = !f.abierto ? APAGADO : elegida ? '#ffffff' : t.titulo;
    textoEspaciado(ctx, f.nombre, MARGEN, yc + 1, 1.5);

    // Y debajo, en pequeño y en la de leer, lo que es el sitio. Un texto largo
    // en la romana no se lee: la serifa espaciada está para nombrar, no para
    // contar.
    ctx.font = `500 10px ${FUENTE}`;
    ctx.fillStyle = f.abierto ? t.texto : APAGADO;
    ctx.fillText(f.nivel ? f.subtitulo : 'PRÓXIMAMENTE', MARGEN + 1, yc + 15);

    // La duración EN MINUTOS: nadie decide dónde jugar leyendo 1800. Y en la de
    // palo seco, como los precios de la tienda — es una cifra para comparar con
    // la de al lado, no un nombre. Una raya donde todavía no hay nivel: es más
    // honesto que dejar el hueco en blanco, que se lee como un fallo.
    ctx.textAlign = 'right';
    ctx.font = `600 12px ${FUENTE}`;
    ctx.fillStyle = f.abierto ? t.titulo : APAGADO;
    ctx.fillText(f.nivel ? `${f.minutos} min` : '—', TABLA_DER, yc + 1);
  }

  // La ventana del sitio señalado, centrada a lo alto sobre el bloque de filas.
  const sel = lista[cursor];
  const vx = ANCHO_UI - MARGEN - VISTA_ANCHO;
  const alturaFilas = lista.length * r.alto;
  const vy = r.filas + Math.max(0, (alturaFilas - VISTA_ALTO) / 2);
  vista(ctx, sel, vx, vy, t);

  // El renglón de abajo: mientras se carga el suelo del nivel elegido, lo que
  // se está haciendo; el resto del tiempo, por qué no se puede ir todavía —o
  // nada, porque el subtítulo ya está arriba y repetirlo no añade.
  descripcion(ctx, r, cargando ? 'Cargando el mapa…' : pie(sel));
  ctx.restore();
}

function pie(f) {
  if (!f.nivel) return 'La región sigue. Este sitio todavía no está en pie.';
  if (f.abierto) return '';
  return `Se abre al terminar ${f.requiereNombre || 'el nivel anterior'}.`;
}

// --- La ventana --------------------------------------------------------------
//
// UN TROZO DEL MAPA DE VERDAD, sin un solo personaje ni un solo bicho: el suelo
// pintado del nivel con su decoración encima, que es lo que de verdad distingue
// un sitio de otro. Lo pidió Sergio así —"sin personajes ni monstruos"— y
// además es lo correcto: quien mira esta pantalla está eligiendo un ESCENARIO,
// y meterle una horda dentro contaría otra cosa.
//
// No es una captura guardada. Se compone aquí con las mismas piezas que usa la
// partida —`suelo.imagen` y `decoracion` del archivo de datos, y los sprites
// del atlas— así que el día que se retoque el mapa o se mueva una columna, la
// ventana lo enseña sin que nadie tenga que rehacer una imagen.
function vista(ctx, f, x, y, t) {
  ctx.save();

  // El trazado del marco primero y el recorte después: todo lo que venga detrás
  // se queda dentro de la ventana pase lo que pase con las medidas del mapa.
  ctx.beginPath();
  ctx.roundRect(x, y, VISTA_ANCHO, VISTA_ALTO, 4);
  ctx.save();
  ctx.clip();

  // Fondo de reserva con los colores del propio nivel, si los tiene. Es lo que
  // se ve mientras llega la imagen y lo que queda si no llega nunca: una
  // ventana negra se lee como un fallo, y un ocre apagado como "todavía no".
  const pal = f.nivel && f.nivel.paleta;
  ctx.fillStyle = pal ? pal.arena : '#141119';
  ctx.fillRect(x, y, VISTA_ANCHO, VISTA_ALTO);
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#0b0910';
  ctx.fillRect(x, y, VISTA_ANCHO, VISTA_ALTO);
  ctx.globalAlpha = 1;

  const img = f.nivel ? suelos.get(f.nivel.id) : null;
  if (img) {
    // ESCALA POR EL ANCHO DEL MAPA, no por el de la pantalla del juego. La
    // avenida de Mérida mide 361 unidades de ancho y la ventana 320: cabe
    // entera, y verla entera dice más de cómo es el sitio que un recorte
    // centrado al tamaño real, que solo enseñaría un trozo de suelo.
    const anchoMapa = img.width / ESCALA_ARTE;
    const esc = VISTA_ANCHO / anchoMapa;
    const alto = (img.height / ESCALA_ARTE) * esc;

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, x, y, VISTA_ANCHO, alto);

    // Y la decoración encima, con el mismo criterio de anclaje que en la
    // partida: `x` es el centro y `y` la base, o sea los pies (ver
    // dibujarObstaculo en sistemas/obstaculos.js). Sin esto se vería una
    // calzada vacía, y lo que hace reconocible a Mérida son sus columnas.
    const deco = f.nivel.decoracion || [];
    for (let i = 0; i < deco.length; i++) {
      const meta = Recursos.meta(deco[i].tipo);
      const sprite = Recursos.imagen(deco[i].tipo);
      if (!meta || !sprite) continue;      // entrada del mapa que no es objeto
      const w = (meta.w / ESCALA_ARTE) * esc;
      const h = (meta.h / ESCALA_ARTE) * esc;
      const dx = x + deco[i].x * esc - w / 2;
      const dy = y + deco[i].y * esc - h;
      if (dy > y + VISTA_ALTO || dy + h < y) continue;
      ctx.drawImage(sprite, dx, dy, w, h);
    }

    // Un velo por abajo, para que el corte del mapa contra el borde de la
    // ventana no se lea como una imagen cortada a medias.
    const deg = ctx.createLinearGradient(0, y + VISTA_ALTO - 46, 0, y + VISTA_ALTO);
    deg.addColorStop(0, 'rgba(6,5,10,0)');
    deg.addColorStop(1, 'rgba(6,5,10,.85)');
    ctx.fillStyle = deg;
    ctx.fillRect(x, y + VISTA_ALTO - 46, VISTA_ANCHO, 46);
  } else {
    // Sin mapa que enseñar: se dice, y no se deja la ventana muda.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 11px ${FUENTE}`;
    ctx.fillStyle = 'rgba(255,255,255,.30)';
    textoEspaciado(ctx, f.nivel ? 'SIN MAPA' : 'PRÓXIMAMENTE',
                   x + VISTA_ANCHO / 2, y + VISTA_ALTO / 2, 2);
  }

  ctx.restore();     // fuera del recorte

  // El canto, encima de todo, para que la ventana tenga marco y no parezca un
  // agujero en la tabla.
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(0,0,0,.75)';
  ctx.stroke();
  ctx.strokeStyle = t.filo;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Y el nombre del sitio bajo la ventana, para que se sepa de quién es lo que
  // se está viendo sin tener que cruzar la vista a la lista.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = `600 10px ${FUENTE}`;
  ctx.fillStyle = t.apagado;
  textoEspaciado(ctx, f.nombre.toUpperCase(), x + VISTA_ANCHO / 2, y + VISTA_ALTO + 7, 2);

  ctx.restore();
}
