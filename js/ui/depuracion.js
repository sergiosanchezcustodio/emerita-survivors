import { ANCHO_FISICO, ESCALA_ARTE } from '../core/constantes.js';

// Overlay de depuración (F3). Se dibuja en píxeles FÍSICOS, sin la escala del
// arte: es interfaz de desarrollo, no pixel art, y tiene que leerse.
const LINEAS = [];

const AYUDA = 'F3 depuracion · ESC pausa · C personaje · 1/2/3 +100/+500/+800 lentos · 4 +300 con arpias · X vaciar · G inmortal · R revivir';

export function dibujarDepuracion(ctx, datos) {
  const pool = datos.pool;

  LINEAS.length = 0;
  LINEAS.push(`fps        ${datos.fps.toFixed(1)}`);
  LINEAS.push(`update     ${datos.msUpdate.toFixed(2)} ms  (${datos.pasos} pasos)`);
  LINEAS.push(`render     ${datos.msRender.toFixed(2)} ms`);
  LINEAS.push(`entidades  ${datos.entidades}  (${datos.dibujados} en pantalla)`);
  LINEAS.push(`pool       ${pool.activos}/${pool.capacidad}  pico ${pool.pico}` +
              (pool.agotado > 0 ? `  AGOTADO x${pool.agotado}` : ''));
  LINEAS.push(`reciclados ${datos.reciclados}  ·  rejilla ${datos.celdas} celdas`);
  LINEAS.push(`tiles      ${datos.tiles}`);
  LINEAS.push(`jugador    ${datos.jx.toFixed(0)}, ${datos.jy.toFixed(0)}`);
  LINEAS.push(`vida       ${datos.vida.toFixed(0)}/${datos.vidaMaxima}  ` +
              `golpes ${datos.golpes}${datos.inmortal ? '  [INMORTAL]' : ''}`);
  LINEAS.push(`camara     ${datos.cx.toFixed(0)}, ${datos.cy.toFixed(0)}`);
  LINEAS.push(`entrada    ${datos.fuente}${datos.gamepad ? ' (mando ok)' : ''}`);
  LINEAS.push(`escala     ${ESCALA_ARTE}x arte · ${datos.zoom}x pantalla`);
  if (datos.sustituidos > 0) {
    LINEAS.push(`sustituidos ${datos.sustituidos} placeholder(s)`);
  }

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = '12px Consolas, ui-monospace, monospace';
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
  ctx.font = '11px Consolas, ui-monospace, monospace';
  ctx.fillText(AYUDA, 14, 12 + LINEAS.length * 15 + 2);
  ctx.restore();
}

export function dibujarPausa(ctx, alto) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = 'rgba(8,6,12,.55)';
  ctx.fillRect(0, 0, ANCHO_FISICO, alto);
  ctx.font = 'bold 28px Consolas, ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#e2dccb';
  ctx.fillText('PAUSA', ANCHO_FISICO / 2, alto / 2);
  ctx.font = '14px Consolas, ui-monospace, monospace';
  ctx.fillStyle = 'rgba(226,220,203,.7)';
  ctx.fillText('ESC o Start para continuar', ANCHO_FISICO / 2, alto / 2 + 28);
  ctx.restore();
}

// Provisional. La pantalla de derrota de verdad (tiempo, nivel, bajas, arsenal)
// llega en la Fase 7; esto solo cierra el ciclo del daño por contacto para poder
// probarlo en la Fase 2.
export function dibujarAbatido(ctx, alto) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = 'rgba(40,6,12,.45)';
  ctx.fillRect(0, 0, ANCHO_FISICO, alto);
  ctx.font = 'bold 28px Consolas, ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#e8b0a4';
  ctx.fillText('ABATIDO', ANCHO_FISICO / 2, alto / 2);
  ctx.font = '14px Consolas, ui-monospace, monospace';
  ctx.fillStyle = 'rgba(232,176,164,.7)';
  ctx.fillText('R para revivir · X para vaciar la horda', ANCHO_FISICO / 2, alto / 2 + 28);
  ctx.restore();
}
