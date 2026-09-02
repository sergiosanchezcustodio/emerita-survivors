#!/usr/bin/env python3
"""Reimplementación en Python de RecortarSuelto (herramientas/procesar-assets.ps1),
para poder hornear sprites sueltos en Mac sin PowerShell.

Mismo criterio que el original:
  1. Quitar el fondo de color plano (chroma key) si la imagen no trae alfa real.
  2. Recortar a la caja de la silueta (alfa > 24).
  3. Reescalar por PROMEDIO DE ÁREA ponderado por alfa (premultiplicado) al
     tamaño físico pedido — no vecino más próximo, no Lanczos.

Uso:
  python3 herramientas/hornear_suelto.py entrada.png salida.png ANCHO ALTO [--chroma RRGGBB] [--tol N]
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage


def quitar_chroma(im, chroma_hex, tol):
    """`chroma_hex=None` MUESTREA el propio fondo de las cuatro esquinas de la
    imagen, en vez de un verde fijo de referencia: el fondo que sueltan los
    modelos de imagen no siempre es el mismo verde exacto de una imagen a
    otra (varía con la iluminación que "imagina" el modelo), así que fijar un
    solo hexadecimal para todas fallaba en las que salían más oscuras o más
    claras. Con las esquinas de CADA imagen, el color de referencia siempre
    es el fondo real de esa imagen."""
    if chroma_hex is None:
        arr0 = np.array(im.convert('RGBA'), dtype=np.int32)
        h, w = arr0.shape[:2]
        esquinas = [arr0[0, 0, :3], arr0[0, w - 1, :3], arr0[h - 1, 0, :3], arr0[h - 1, w - 1, :3]]
        media = np.mean(esquinas, axis=0)
        chroma_hex = '%02x%02x%02x' % tuple(int(round(c)) for c in media)
    return _quitar_chroma(im, chroma_hex, tol)


def _quitar_chroma(im, chroma_hex, tol):
    """Vuelve transparente el FONDO VERDE, por COMPONENTES CONEXOS que tocan
    el borde del lienzo — no un simple umbral de color global.

    Por qué: el fondo que sueltan los modelos de imagen no es un verde plano
    de verdad, trae una veta o un degradado leve, así que un umbral de
    distancia de color puede dejar fuera una esquina y de ahí saldría
    contando como "silueta" el lienzo entero. Por componentes conexos, basta
    con que el UMBRAL SEA HOLGADO — de sobra para separar el verde de
    cualquier color del dibujo— porque lo que importa no es acertar el verde
    exacto, es que la región de fondo siga estando conectada al borde."""
    arr = np.array(im.convert('RGBA'), dtype=np.int32)
    r = int(chroma_hex[0:2], 16)
    g = int(chroma_hex[2:4], 16)
    b = int(chroma_hex[4:6], 16)
    dist = np.sqrt((arr[:, :, 0] - r) ** 2 + (arr[:, :, 1] - g) ** 2 + (arr[:, :, 2] - b) ** 2)
    parecido = dist < tol

    etiquetas, n = ndimage.label(parecido)
    h, w = parecido.shape
    etiquetas_borde = set(etiquetas[0, :]) | set(etiquetas[-1, :]) | \
                       set(etiquetas[:, 0]) | set(etiquetas[:, -1])
    etiquetas_borde.discard(0)
    mascara_fondo = np.isin(etiquetas, list(etiquetas_borde))

    arr[:, :, 3] = np.where(mascara_fondo, 0, 255)
    return Image.fromarray(arr.astype(np.uint8), 'RGBA')


def recortar_suelto(entrada, salida, ancho_sal, alto_sal, chroma=None, tol=40):
    """`chroma`: None = la imagen ya trae alfa real, no tocar nada.
    'auto' = fondo de color plano pero variable, muestrear las esquinas.
    'RRGGBB' = fondo de ese color exacto en todas las entradas."""
    im = Image.open(entrada).convert('RGBA')
    if chroma == 'auto':
        im = quitar_chroma(im, None, tol)
    elif chroma:
        im = quitar_chroma(im, chroma, tol)

    arr = np.array(im, dtype=np.float64)
    alfa = arr[:, :, 3]
    filas = np.where(np.any(alfa > 24, axis=1))[0]
    cols = np.where(np.any(alfa > 24, axis=0))[0]
    if len(filas) == 0 or len(cols) == 0:
        raise RuntimeError('VACIA: no hay ningún píxel con alfa > 24')

    y0, y1 = filas[0], filas[-1] + 1
    x0, x1 = cols[0], cols[-1] + 1
    recorte = arr[y0:y1, x0:x1, :]
    sil_h, sil_w = recorte.shape[0], recorte.shape[1]

    # PROMEDIO DE ÁREA PONDERADO POR ALFA, como EscalarBloque en el .ps1: cada
    # píxel de destino promedia su bloque de origen, premultiplicando color por
    # alfa antes de sumar y dividiendo por la suma de alfa (no por N), para que
    # los bordes semitransparentes no oscurezcan el resultado.
    r = recorte[:, :, 0] * recorte[:, :, 3]
    g = recorte[:, :, 1] * recorte[:, :, 3]
    b = recorte[:, :, 2] * recorte[:, :, 3]
    a = recorte[:, :, 3]

    salida_arr = np.zeros((alto_sal, ancho_sal, 4), dtype=np.float64)
    for y in range(alto_sal):
        ay0 = int(y * sil_h / alto_sal)
        ay1 = max(ay0 + 1, int((y + 1) * sil_h / alto_sal))
        for x in range(ancho_sal):
            ax0 = int(x * sil_w / ancho_sal)
            ax1 = max(ax0 + 1, int((x + 1) * sil_w / ancho_sal))
            bloque_a = a[ay0:ay1, ax0:ax1]
            suma_a = bloque_a.sum()
            n = bloque_a.size
            if suma_a <= 0:
                continue
            salida_arr[y, x, 0] = r[ay0:ay1, ax0:ax1].sum() / suma_a
            salida_arr[y, x, 1] = g[ay0:ay1, ax0:ax1].sum() / suma_a
            salida_arr[y, x, 2] = b[ay0:ay1, ax0:ax1].sum() / suma_a
            salida_arr[y, x, 3] = suma_a / n

    salida_arr = np.clip(salida_arr, 0, 255).astype(np.uint8)
    Image.fromarray(salida_arr).save(salida)
    return ancho_sal, alto_sal, sil_w, sil_h


if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('entrada')
    ap.add_argument('salida')
    ap.add_argument('ancho', type=int)
    ap.add_argument('alto', type=int)
    ap.add_argument('--chroma', default=None, help='RRGGBB del fondo a quitar, si no trae alfa real')
    ap.add_argument('--tol', type=float, default=40)
    args = ap.parse_args()

    w, h, sw, sh = recortar_suelto(args.entrada, args.salida, args.ancho, args.alto,
                                    args.chroma, args.tol)
    print(f'{args.salida}: silueta {sw}x{sh} -> {w}x{h}')
