# ---------------------------------------------------------------------------
# ver-assets.ps1 - Describe imagenes SIN abrirlas.
#
# Herramienta OFFLINE, como procesar-assets.ps1: no forma parte del juego.
#
# POR QUE EXISTE. Casi todo lo que hay que saber de un asset -si mide lo que
# deberia, si la transparencia es de verdad, si el dibujo esta centrado, si el
# recorte se ha comido un borde- es una pregunta con respuesta de TEXTO. Abrir
# la imagen para contestarla cuesta unos 4.700 tokens en el contexto de Claude,
# y ese peso no se va: se vuelve a leer en cada llamada posterior de la sesion.
# Esta tabla cuesta unas decenas de tokens y responde lo mismo.
#
# Abrir la imagen sigue teniendo sentido para UNA cosa: opinar sobre el dibujo.
# Para todo lo demas, esto.
#
#   .\herramientas\ver-assets.ps1                        todo assets\
#   .\herramientas\ver-assets.ps1 assets\objetos         una carpeta
#   .\herramientas\ver-assets.ps1 assets\objetos\gema1.png
#   .\herramientas\ver-assets.ps1 resources\mascotas\*.gif
# ---------------------------------------------------------------------------
param(
    [Parameter(Position = 0)]
    [string]$Ruta = 'assets'
)

Add-Type -AssemblyName System.Drawing

Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public class Ojo {

    // Una sola pasada por los pixeles saca todo lo que preguntamos: caja del
    // contenido, reparto del alfa y numero de colores. Se normaliza a 32bpp
    // ARGB primero -igual que hace Procesador- porque un PNG indexado o en
    // escala de grises no se puede recorrer con un stride fijo de cuatro bytes.
    //
    // Devuelve: w|h|fotogramas|minX|minY|maxX|maxY|vacios|parciales|colores|tope
    public static string Mirar(string ruta) {
        using (Bitmap orig = new Bitmap(ruta)) {
            int w = orig.Width, h = orig.Height;

            // Fotogramas: los GIF de Sergio son animaciones de 16, y saber
            // cuantos trae sin abrirlo es media pregunta contestada.
            int fotogramas = 1;
            try {
                if (orig.FrameDimensionsList.Length > 0) {
                    FrameDimension fd = new FrameDimension(orig.FrameDimensionsList[0]);
                    fotogramas = orig.GetFrameCount(fd);
                }
            } catch { fotogramas = 1; }

            byte[] px; int stride;
            using (Bitmap src = new Bitmap(w, h, PixelFormat.Format32bppArgb)) {
                using (Graphics g = Graphics.FromImage(src)) { g.DrawImage(orig, 0, 0, w, h); }
                BitmapData d = src.LockBits(new Rectangle(0, 0, w, h),
                    ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
                stride = d.Stride;
                px = new byte[stride * h];
                Marshal.Copy(d.Scan0, px, 0, px.Length);
                src.UnlockBits(d);
            }

            int minX = w, minY = h, maxX = -1, maxY = -1;
            int vacios = 0, parciales = 0;
            HashSet<int> colores = new HashSet<int>();
            bool tope = false;              // se dejo de contar colores

            for (int y = 0; y < h; y++) {
                int fila = y * stride;
                for (int x = 0; x < w; x++) {
                    int i = fila + x * 4;   // BGRA
                    int a = px[i + 3];
                    if (a == 0) { vacios++; continue; }
                    if (a < 255) parciales++;
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                    // Un contador de colores sin techo es un HashSet de un
                    // millon de entradas en cuanto entra una foto. Pasado el
                    // tope da igual el numero exacto: ya no es pixel art.
                    if (!tope) {
                        colores.Add((px[i + 2] << 16) | (px[i + 1] << 8) | px[i]);
                        if (colores.Count > 4096) tope = true;
                    }
                }
            }

            return string.Join("|", new string[] {
                w.ToString(), h.ToString(), fotogramas.ToString(),
                minX.ToString(), minY.ToString(), maxX.ToString(), maxY.ToString(),
                vacios.ToString(), parciales.ToString(),
                colores.Count.ToString(), tope ? "1" : "0"
            });
        }
    }
}
"@

# --- Que ficheros mirar ------------------------------------------------------
# Se acepta fichero suelto, carpeta o comodin, porque las tres formas salen
# solas al escribir y no hay razon para obligar a una.
$raiz = Split-Path -Parent $PSScriptRoot
if (-not [System.IO.Path]::IsPathRooted($Ruta)) { $Ruta = Join-Path $raiz $Ruta }

# El filtrado va por extension a mano y no con -Include: sobre una carpeta con
# -Recurse, -Include se ignora en silencio y devuelve TODO -mp3 y json incluidos-
# que luego solo se detecta como ILEGIBLE, ensuciando la tabla y el total.
$EXTS = @('.png', '.gif', '.jpg', '.jpeg')
if (Test-Path -LiteralPath $Ruta -PathType Container) {
    $ficheros = Get-ChildItem -LiteralPath $Ruta -Recurse -File
} else {
    $ficheros = Get-ChildItem -Path $Ruta -File -ErrorAction SilentlyContinue
}
$ficheros = $ficheros | Where-Object { $EXTS -contains $_.Extension.ToLower() }

if (-not $ficheros -or $ficheros.Count -eq 0) {
    Write-Output "No hay imagenes en: $Ruta"
    return
}

# --- Mirar y tabular ---------------------------------------------------------
$filas = New-Object System.Collections.ArrayList
foreach ($f in $ficheros | Sort-Object FullName) {
    try { $d = [Ojo]::Mirar($f.FullName) -split '\|' } catch {
        $null = $filas.Add([pscustomobject]@{
            fichero = $f.FullName.Substring($raiz.Length + 1)
            medidas = 'ILEGIBLE'; KB = [math]::Round($f.Length / 1KB, 1)
            fot = ''; alfa = ''; contenido = ''; margenes = ''; colores = ''
        })
        continue
    }

    $w = [int]$d[0]; $h = [int]$d[1]; $fot = [int]$d[2]
    $minX = [int]$d[3]; $minY = [int]$d[4]; $maxX = [int]$d[5]; $maxY = [int]$d[6]
    $vacios = [int]$d[7]; $parciales = [int]$d[8]
    $nColores = [int]$d[9]; $tope = $d[10] -eq '1'
    $total = $w * $h

    # Tres estados y no un porcentaje: lo que se pregunta de verdad es si el
    # borde va a quedar dentado (binaria) o suave, o si no hay recorte alguno.
    $alfa = if ($vacios -eq 0 -and $parciales -eq 0) { 'opaca' }
            elseif ($parciales -eq 0) { 'binaria' }
            else { 'suave ' + [math]::Round(100 * $parciales / $total) + '%' }

    if ($maxX -lt 0) {
        $contenido = 'VACIA'
        $margenes = ''
    } else {
        $cw = $maxX - $minX + 1
        $ch = $maxY - $minY + 1
        $contenido = "${cw}x${ch}"
        # Izquierda, arriba, derecha, abajo. Un margen asimetrico es un dibujo
        # descentrado, y eso en el juego se ve como que el sprite "baila".
        $margenes = "$minX,$minY,$($w - 1 - $maxX),$($h - 1 - $maxY)"
    }

    $null = $filas.Add([pscustomobject]@{
        fichero   = $f.FullName.Substring($raiz.Length + 1)
        medidas   = "${w}x${h}"
        KB        = [math]::Round($f.Length / 1KB, 1)
        fot       = if ($fot -gt 1) { $fot } else { '' }
        alfa      = $alfa
        contenido = $contenido
        margenes  = $margenes
        colores   = if ($tope) { '>4096' } else { $nColores }
    })
}

# Format-Table emite objetos de formato, no texto: si la salida se captura en
# una variable o se canaliza, PowerShell se queja de que la secuencia esta rota.
# Se aplana a texto aqui, y ADEMAS se parte en lineas: una sola cadena gigante
# se captura bien pero no se puede filtrar, y `.\ver-assets.ps1 | Select-String
# mascotas` devolveria la tabla entera por haber coincidido una vez.
Write-Output ((($filas | Format-Table -AutoSize | Out-String -Width 200).TrimEnd()) -split "`r?`n")
Write-Output ''

$bytes = ($ficheros | Measure-Object Length -Sum).Sum
$peso = if ($bytes -ge 1MB) { "{0:N1} MB" -f ($bytes / 1MB) } else { "{0:N0} KB" -f ($bytes / 1KB) }
Write-Output ("{0} imagenes, {1} en disco." -f $filas.Count, $peso)
Write-Output "margenes = izquierda,arriba,derecha,abajo en pixeles de la propia imagen."
