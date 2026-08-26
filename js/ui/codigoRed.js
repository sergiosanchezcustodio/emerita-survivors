import { ANCHO_UI, ALTO_UI } from '../core/constantes.js';

// EL CÓDIGO DE INVITACIÓN, EN HTML DE VERDAD.
//
// Todo lo demás de este juego se dibuja en un lienzo, y eso está bien para todo
// lo demás. Para esto no: un texto pintado en un canvas es un dibujo, no se
// puede seleccionar con el ratón ni copiar con Ctrl+C. Y un código de
// trescientos caracteres que no se puede copiar no sirve para nada — nadie lo
// va a teclear.
//
// Así que aquí hay un `<textarea>` de verdad y un botón de verdad, encima del
// lienzo. Tres formas de llevarse el código, porque cada persona usa la suya:
// el botón, seleccionar y Ctrl+C, o el copiado automático que ya hace el juego
// al generarlo.
//
// Es el mismo patrón que el botón de pantalla completa (ver index.html): cuando
// hace falta algo que el ratón o el teclado tengan que tocar de verdad, se pone
// un elemento y no un dibujo.

// Dónde cae la caja, en las coordenadas de la interfaz (960x540). Tiene que
// coincidir con el hueco que deja el dibujo de ui/red.js.
const CAJA = { x: 160, y: 150, ancho: 640, alto: 96 };

let raiz = null;
let campo = null;
let boton = null;
let lienzo = null;
let visible = false;
let relojHecho = 0;

function montar() {
  if (raiz) return true;
  raiz = document.getElementById('codigoRed');
  campo = document.getElementById('codigoRedTexto');
  boton = document.getElementById('codigoRedCopiar');
  lienzo = document.getElementById('interfaz');
  if (!raiz || !campo || !boton || !lienzo) { raiz = null; return false; }

  boton.addEventListener('click', async () => {
    campo.select();
    let bien = false;
    try {
      await navigator.clipboard.writeText(campo.value);
      bien = true;
    } catch {
      // Sin permiso de portapapeles queda el camino de siempre, que además ya
      // está hecho: el texto está seleccionado y Ctrl+C funciona.
      bien = false;
    }
    boton.textContent = bien ? 'Copiado' : 'Pulsa Ctrl+C';
    boton.classList.toggle('hecho', bien);
    relojHecho = 90;
  });

  // Al hacer clic en el campo se selecciona entero. Seleccionar a mano
  // trescientos caracteres repartidos en cuatro líneas es justo el tipo de cosa
  // que sale mal por la mitad y no se nota hasta que el código no funciona.
  //
  // VA EN UN `setTimeout` PARA QUE LA SELECCIÓN OCURRA DESPUÉS de que el
  // navegador termine de colocar el cursor donde se ha pulsado. Es el remedio
  // de siempre para esto; sin él, según el momento, la selección puede
  // deshacerse sola.
  const seleccionar = () => setTimeout(() => campo.select(), 0);
  campo.addEventListener('focus', seleccionar);
  campo.addEventListener('click', seleccionar);

  addEventListener('resize', colocar);
  return true;
}

// La interfaz se dibuja en 960x540 lógicos y el lienzo se estira a lo que sea.
// Aquí se traduce de lo uno a lo otro para que la caja caiga donde el dibujo la
// espera, sea cual sea el tamaño de la ventana.
function colocar() {
  if (!raiz || !lienzo) return;
  const ancho = lienzo.clientWidth || ANCHO_UI;
  const alto = lienzo.clientHeight || ALTO_UI;
  const ex = ancho / ANCHO_UI;
  const ey = alto / ALTO_UI;

  raiz.style.left = `${CAJA.x * ex}px`;
  raiz.style.top = `${CAJA.y * ey}px`;
  raiz.style.width = `${CAJA.ancho * ex}px`;

  // La letra también escala: con la ventana pequeña, un tamaño fijo se saldría
  // de la caja y partiría el código donde no toca.
  campo.style.height = `${CAJA.alto * ey}px`;
  campo.style.fontSize = `${Math.max(9, Math.round(13 * ex))}px`;
  boton.style.fontSize = `${Math.max(11, Math.round(14 * ex))}px`;
}

// Se llama cada fotograma desde el dibujado de la pantalla de red.
export function actualizarCodigoRed(codigo) {
  if (!montar()) return;

  const quiere = !!codigo;
  if (quiere && campo.value !== codigo) {
    campo.value = codigo;
    boton.textContent = 'Copiar';
    boton.classList.remove('hecho');
  }
  if (quiere !== visible) {
    visible = quiere;
    raiz.hidden = !quiere;
    if (quiere) colocar();
  }
  if (!quiere) return;

  colocar();
  if (relojHecho > 0 && --relojHecho === 0) {
    boton.textContent = 'Copiar';
    boton.classList.remove('hecho');
  }
}

// Al salir de la pantalla. Se llama aparte de `actualizar` porque el dibujado
// de otra pantalla no pasa por aquí y la caja se quedaría flotando encima.
export function ocultarCodigoRed() {
  if (!raiz || !visible) return;
  visible = false;
  raiz.hidden = true;
}
