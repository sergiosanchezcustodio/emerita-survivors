import { FUENTE, textoEspaciado } from './capa.js';
import { Tema } from './tema.js';
import {
  MARGEN, X_NIVEL, X_EFECTO, X_VALOR,
  rejilla, armazon, resalte, nombreFila, descripcion
} from './tabla.js';

// LA PANTALLA DE ELEGIR NIVEL. Una fila por sitio de la región, y la de abajo
// cuenta lo que es.
//
// Va sobre el mismo armazón que la tienda y la configuración (ui/tabla.js) y no
// sobre un dibujado propio, por el mismo motivo que ellas dos: con dos copias,
// el primer ajuste de márgenes deja una descuadrada y eso se descubre seis
// meses después mirando una captura.
//
// LO QUE SE ENSEÑA DE CADA NIVEL sale del propio archivo de datos —nombre,
// subtítulo, duración— y no de una lista escrita aquí. Escribir los nombres a
// mano sería tener dos verdades y que la pantalla anunciara un nivel con un
// nombre que el juego ya no usa.
const NOMBRES = ['ELEGIR NIVEL'];
const ALTO_FILA = 48;

// El gris de lo que está cerrado. Se apaga a la vez el nombre, el subtítulo y
// la duración: apagar solo el nombre dejaba la fila leyéndose como una abierta
// con el título en mal color.
const APAGADO = 'rgba(255,255,255,.28)';

// El tema con el que se pinta esta pantalla es el del nivel EN CURSO, no el del
// señalado: cambiarlo con el cursor haría que la pantalla entera parpadeara de
// color cada vez que se sube o se baja una fila.
export function dibujarNiveles(ctxMundo, ctx, lista, cursor, cargando) {
  const r = rejilla(lista.length, ALTO_FILA);

  ctx.save();
  // La TERCERA columna va sin rótulo a propósito: solo lleva algo en las filas
  // a las que no se puede entrar, y una cabecera con las demás vacías debajo
  // rotula aire.
  armazon(ctxMundo, ctx, r, NOMBRES, 0, ['NIVEL', 'AMBIENTACIÓN', '', 'DURACIÓN']);

  const t = Tema.actual;
  for (let i = 0; i < lista.length; i++) {
    const f = lista[i];
    const elegida = i === cursor;
    const y = r.filas + i * r.alto;
    const yc = y + r.alto / 2 - 2;

    if (elegida) resalte(ctx, y, r.alto);

    // El nombre arranca EN EL MARGEN, no en X_NOMBRE: esa sangría de la tienda
    // es el hueco del icono de cada fila, y aquí no hay icono. Empezando donde
    // empieza su propio rótulo, la columna queda a plomo.
    //
    // LO QUE NO SE PUEDE JUGAR SE VE, PERO APAGADO: sale en su sitio, para que
    // se sepa que la región sigue más allá, y el renglón de abajo dice por qué
    // no se puede entrar todavía.
    nombreFila(ctx, f.nombre, MARGEN, yc,
               !f.abierto ? APAGADO : elegida ? '#ffffff' : t.titulo);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `500 11px ${FUENTE}`;
    ctx.fillStyle = f.abierto ? t.texto : APAGADO;

    if (!f.nivel) {
      // Un sitio anunciado y sin escribir. No tiene ambientación que contar ni
      // duración que prometer: lo único cierto de él es que va a estar.
      textoEspaciado(ctx, 'PRÓXIMAMENTE', X_NIVEL, yc, 1);
    } else {
      // Recortado a su columna. Un subtítulo largo se metía encima de la
      // duración y las dos cosas quedaban ilegibles a la vez.
      //
      // Y la columna es MÁS ANCHA cuando el nivel está abierto: la de al lado
      // solo lleva algo en los cerrados, así que en los demás el subtítulo
      // puede seguir hasta donde empieza la duración en vez de cortarse contra
      // una columna vacía.
      const tope = f.abierto ? X_VALOR - 70 : X_EFECTO - 12;
      recortado(ctx, f.subtitulo, X_NIVEL, yc, tope - X_NIVEL);
    }

    if (f.nivel && !f.abierto) {
      ctx.font = `600 11px ${FUENTE}`;
      ctx.fillStyle = APAGADO;
      textoEspaciado(ctx, 'CERRADO', X_EFECTO, yc, 1);
    }

    // La duración EN MINUTOS: nadie decide dónde jugar leyendo 1800. Y en la
    // de palo seco, como los precios de la tienda — es una cifra para comparar
    // con la de al lado, no un nombre. Una raya donde todavía no hay nivel: es
    // más honesto que dejar el hueco en blanco, que se lee como un fallo.
    ctx.textAlign = 'right';
    ctx.font = `600 12px ${FUENTE}`;
    ctx.fillStyle = f.abierto ? t.titulo : APAGADO;
    ctx.fillText(f.nivel ? `${f.minutos} min` : '—', X_VALOR, yc);
  }

  // El renglón de abajo: mientras se carga el suelo, lo que se está haciendo;
  // el resto del tiempo, qué es el sitio señalado o por qué no se puede ir.
  const sel = lista[cursor];
  descripcion(ctx, r, cargando ? 'Cargando el mapa…' : pie(sel));
  ctx.restore();
}

function pie(f) {
  if (!f.nivel) return 'La región sigue. Este sitio todavía no está en pie.';
  if (f.abierto) return f.subtitulo;
  return `Se abre al terminar ${f.requiereNombre || 'el nivel anterior'}.`;
}

// Un texto que no se sale de su columna: si no cabe, se le come el final y se
// remata con puntos suspensivos. Se mide y se corta en vez de recortar el
// lienzo porque un texto cortado a la mitad de una letra se lee como un fallo
// de dibujado, y con puntos se lee como lo que es: que sigue.
function recortado(ctx, texto, x, y, ancho) {
  if (ctx.measureText(texto).width <= ancho) { ctx.fillText(texto, x, y); return; }
  let corte = texto;
  while (corte.length > 1 && ctx.measureText(corte + '…').width > ancho) {
    corte = corte.slice(0, -1);
  }
  ctx.fillText(corte + '…', x, y);
}
