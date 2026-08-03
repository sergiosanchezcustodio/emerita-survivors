import { ANCHO_FISICO, ESCALA_ARTE } from '../core/constantes.js';

// Overlay de depuración (F3). Se dibuja en píxeles FÍSICOS, sin la escala del
// arte: es interfaz de desarrollo, no pixel art, y tiene que leerse.
const LINEAS = [];

const AYUDA = 'F3 · ESC · C personaje · 1/2/3/4 enemigos · X vaciar · G inmortal · R revivir · K +Gladius · L subir armas'
            + '   ||   APAGAR: Y suelo · P particulas · N numeros · O efectos';

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
              `fx ${p.efectos.toFixed(2)} · txt ${p.texto.toFixed(2)}]`);
  LINEAS.push(`navegador  ${resto.toFixed(2)} ms  (rasterizado y composicion)`);
  LINEAS.push(`apagados   ${datos.activo.suelo ? '' : 'suelo '}` +
              `${datos.activo.particulas ? '' : 'particulas '}` +
              `${datos.activo.numeros ? '' : 'numeros '}` +
              `${datos.activo.efectos ? '' : 'efectos '}` +
              `${datos.activo.suelo && datos.activo.particulas &&
                 datos.activo.numeros && datos.activo.efectos ? 'ninguno' : ''}`);
  LINEAS.push(`entidades  ${datos.entidades}  (${datos.dibujados} en pantalla)`);
  LINEAS.push(`pool       ${pool.activos}/${pool.capacidad}  pico ${pool.pico}` +
              (pool.agotado > 0 ? `  AGOTADO x${pool.agotado}` : ''));
  LINEAS.push(`reciclados ${datos.reciclados}  ·  rejilla ${datos.celdas} celdas`);
  LINEAS.push(`bajas      ${datos.bajas}`);
  LINEAS.push(`efectos    ${datos.proyectiles} proy · ${datos.particulas} part · ${datos.numeros} num`);
  for (let i = 0; i < datos.armas.length; i++) {
    const a = datos.armas[i];
    LINEAS.push(`  ${a.def.nombre.padEnd(9)} niv ${a.nivel}  ` +
                `${a.stats.danyo} dmg · ${a.stats.recarga.toFixed(2)}s`);
  }
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
