import { ANCHO_FISICO, ESCALA_ARTE } from '../core/constantes.js';
import { FUENTE, FUENTE_TITULO, textoEspaciado } from './capa.js';

// Overlay de depuración (F3). Va en la CAPA DE INTERFAZ (ui/capa.js), como el
// resto de la interfaz: es texto de desarrollo y hay que poder leer décimas de
// milisegundo de un vistazo.
//
// Monoespaciada a propósito, y esta es la excepción a la fuente general: las
// columnas se alinean con padEnd y con una proporcional se descuadran.
const MONO = 'Consolas, "Cascadia Mono", ui-monospace, monospace';

const LINEAS = [];

const AYUDA = 'F3 · ESC · C personaje · J/H mas/menos jugadores · 1/2/3/4 enemigos · X vaciar · G inmortal · R revivir · M/, cambiar de arma · K +Gladius · L subir nivel'
            + '   ||   APAGAR: Y suelo · P particulas · N numeros · O efectos · T destello';

export function dibujarDepuracion(ctx, datos) {
  const pool = datos.pool;

  LINEAS.length = 0;
  // El tiempo de frame REAL sale de los intervalos de requestAnimationFrame, así
  // que incluye todo: lógica, emisión de órdenes de dibujo y lo que el navegador
  // tarde en rasterizar y componer. `resto` es esa última parte, la que el
  // cronómetro de dentro del bucle NO puede ver. Si resto es grande, el cuello
  // de botella está en el dibujado real, no en el JavaScript.
  const msFrame = datos.fps > 0 ? 1000 / datos.fps : 0;
  const resto = Math.max(0, msFrame - datos.msUpdate - datos.msRender);
  const p = datos.perfil;

  LINEAS.push(`fps        ${datos.fps.toFixed(1)}   frame ${msFrame.toFixed(2)} ms`);
  LINEAS.push(`update     ${datos.msUpdate.toFixed(2)} ms  (${datos.pasos} pasos)`);
  LINEAS.push(`render     ${datos.msRender.toFixed(2)} ms  ` +
              `[suelo ${p.suelo.toFixed(2)} · ent ${p.entidades.toFixed(2)} · ` +
              `fx ${p.efectos.toFixed(2)} · txt ${p.texto.toFixed(2)} · ` +
              `ui ${p.interfaz.toFixed(2)}]`);
  LINEAS.push(`navegador  ${resto.toFixed(2)} ms  (rasterizado y composicion)`);
  const a = datos.activo;
  const todos = a.suelo && a.particulas && a.numeros && a.efectos && a.destello;
  LINEAS.push(`apagados   ${a.suelo ? '' : 'suelo '}${a.particulas ? '' : 'particulas '}` +
              `${a.numeros ? '' : 'numeros '}${a.efectos ? '' : 'efectos '}` +
              `${a.destello ? '' : 'destello '}${todos ? 'ninguno' : ''}`);
  LINEAS.push(`entidades  ${datos.entidades}  (${datos.dibujados} en pantalla)`);
  LINEAS.push(`pool       ${pool.activos}/${pool.capacidad}  pico ${pool.pico}` +
              (pool.agotado > 0 ? `  AGOTADO x${pool.agotado}` : ''));
  LINEAS.push(`reciclados ${datos.reciclados}  ·  rejilla ${datos.celdas} celdas`);
  LINEAS.push(`bajas      ${datos.bajas}`);
  LINEAS.push(`efectos    ${datos.proyectiles} proy · ${datos.particulas} part · ${datos.numeros} num`);
  LINEAS.push(`tiles      ${datos.tiles}`);

  for (let i = 0; i < datos.jugadores.length; i++) {
    const j = datos.jugadores[i];
    LINEAS.push(`J${i + 1} ${j.personaje.padEnd(6)} ${j.vida.toFixed(0)}/${j.vidaMaxima} vida · ` +
                `${j.x.toFixed(0)},${j.y.toFixed(0)}` +
                `${j.inmortal ? ' [INMORTAL]' : ''}${j.abatido ? ' [ABATIDO]' : ''}`);
    const eq = datos.arsenales[i].equipadas;
    for (let k = 0; k < eq.length; k++) {
      const a = eq[k];
      LINEAS.push(`   ${a.def.nombre.padEnd(9)} niv ${a.nivel}  ` +
                  `${a.stats.danyo} dmg · ${a.stats.recarga.toFixed(2)}s`);
    }
  }

  LINEAS.push(`camara     ${datos.cx.toFixed(0)}, ${datos.cy.toFixed(0)}`);
  LINEAS.push(`entrada    ${datos.fuente} · ${datos.mandos} mando(s)`);
  LINEAS.push(`escala     ${ESCALA_ARTE}x arte · ${datos.zoom}x pantalla`);
  if (datos.sustituidos > 0) {
    LINEAS.push(`sustituidos ${datos.sustituidos} placeholder(s)`);
  }

  ctx.save();
  ctx.font = `12px ${MONO}`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';

  let ancho = 0;
  for (let i = 0; i < LINEAS.length; i++) {
    const m = ctx.measureText(LINEAS[i]).width;
    if (m > ancho) ancho = m;
  }

  ctx.fillStyle = 'rgba(10,8,14,.72)';
  ctx.fillRect(6, 6, ancho + 16, LINEAS.length * 15 + 12);

  for (let i = 0; i < LINEAS.length; i++) {
    ctx.fillStyle = i === 0 && datos.fps < 55 ? '#ff7a6b' : '#d7e8c8';
    ctx.fillText(LINEAS[i], 14, 12 + i * 15);
  }

  ctx.fillStyle = 'rgba(215,232,200,.45)';
  ctx.font = `11px ${MONO}`;
  ctx.fillText(AYUDA, 14, 12 + LINEAS.length * 15 + 2);
  ctx.restore();
}

// Pausa y derrota comparten forma: un panel PEQUEÑO y opaco en el centro, no un
// velo a pantalla completa.
//
// Opaco pero pequeño. Son dos cosas distintas y conviene no confundirlas: el
// panel no deja ver a través de sí mismo —eso arruinaría el contraste del
// texto— pero tampoco tapa la partida. Al reanudar sigues viendo dónde estabas
// y por dónde venían, que en pausa es justo lo que se quiere mirar.
const ANCHO_AVISO = 268;
const ALTO_AVISO = 84;

function pantallaDeAviso(ctx, alto, borde, titulo, colorTitulo, pie, colorPie) {
  const x = (ANCHO_FISICO - ANCHO_AVISO) / 2;
  const y = (alto - ALTO_AVISO) / 2;

  ctx.save();
  ctx.fillStyle = '#15121d';
  ctx.fillRect(x, y, ANCHO_AVISO, ALTO_AVISO);
  ctx.strokeStyle = '#0a0810';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 1.5, y - 1.5, ANCHO_AVISO + 3, ALTO_AVISO + 3);
  ctx.strokeStyle = borde;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 0.75, y + 0.75, ANCHO_AVISO - 1.5, ALTO_AVISO - 1.5);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.font = `24px ${FUENTE_TITULO}`;
  ctx.fillStyle = colorTitulo;
  textoEspaciado(ctx, titulo, ANCHO_FISICO / 2, y + 32, 5);

  ctx.font = `400 10px ${FUENTE}`;
  ctx.fillStyle = colorPie;
  ctx.fillText(pie, ANCHO_FISICO / 2, y + 60);
  ctx.restore();
}

export function dibujarPausa(ctx, alto) {
  pantallaDeAviso(ctx, alto, '#4a4256', 'PAUSA', '#e8dfc8',
                  'ESC o Start para continuar', '#948d81');
}

// Provisional. La pantalla de derrota de verdad (tiempo, nivel, bajas, arsenal)
// llega en la Fase 7; esto solo cierra el ciclo del daño por contacto para poder
// probarlo en la Fase 2.
export function dibujarAbatido(ctx, alto) {
  pantallaDeAviso(ctx, alto, '#7a3a34', 'ABATIDO', '#e8b0a4',
                  'R para revivir  ·  X para vaciar la horda', '#a4837c');
}
