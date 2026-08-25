Add-Type -AssemblyName System.Drawing

# La raiz SALE DE DONDE ESTA EL SCRIPT. Estaba escrita a mano y apuntaba a
# C:\Claude\emerita-survivors, que no es donde vive el repositorio: la
# herramienta llevaba rota desde que la carpeta cambio de sitio, y como nadie la
# ejecutaba, no se noto hasta que hubo que rehacer un sprite.
$raiz = Split-Path -Parent $PSScriptRoot
$salida = Join-Path $raiz "manual\sprites"
if (-not (Test-Path $salida)) { New-Item -ItemType Directory -Path $salida | Out-Null }

function Recortar($origen, $x, $y, $w, $h, $destino) {
  $src = [System.Drawing.Image]::FromFile($origen)
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $bmp.SetResolution($src.HorizontalResolution, $src.VerticalResolution)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  $rectDestino = New-Object System.Drawing.Rectangle 0, 0, $w, $h
  $g.DrawImage($src, $rectDestino, $x, $y, $w, $h, [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose()
  $bmp.Save((Join-Path $salida $destino), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  $src.Dispose()
  Write-Output "OK  $destino  (${w}x${h} desde $x,$y)"
}

# --- Bestiario: frame 0 de cada hoja -----------------------------------
#
# LOS TAMANOS SALEN DEL ATLAS, no de una lista escrita a mano. Estaban a mano y
# se quedaron atras en cuanto cambio un sprite: la gargola figuraba como 68x74
# cuando su hoja pasa a 86x72, asi que recortarla por esos numeros le cortaba un
# trozo y le dejaba un pedazo del fotograma siguiente.
#
# El atlas ya dice el ancho y el alto de cada fotograma, que es exactamente lo
# que hay que recortar. Cambiando el arte, esto se ajusta solo.
$atlas = Get-Content (Join-Path $raiz 'assets\atlas.json') -Raw | ConvertFrom-Json

$BESTIAS = @('serpiente','gargola','arpia','medusa','legionario','gladiador',
             'minotauro','ciclope','manticora','gemelo','cerbero','hidra','loba')

foreach ($id in $BESTIAS) {
    $meta = $atlas.entidades.$id
    if ($null -eq $meta) { Write-Output "AVISO: $id no esta en el atlas"; continue }
    Recortar (Join-Path $raiz "assets\enemigos\$id.png") 0 0 ([int]$meta.w) ([int]$meta.h) "$id.png"
}


# --- Iconos de armas: 32x32, indice*32 en X -----------------------------
Recortar (Join-Path $raiz "assets\iconos\armas.png") (2*32)  0 32 32 "icono-pistola.png"
Recortar (Join-Path $raiz "assets\iconos\armas.png") (16*32) 0 32 32 "icono-scutum.png"
Recortar (Join-Path $raiz "assets\iconos\armas.png") (45*32) 0 32 32 "icono-campoelectrico.png"
Recortar (Join-Path $raiz "assets\iconos\armas.png") (50*32) 0 32 32 "icono-katana.png"

# --- Iconos de objetos pasivos: 32x32, indice*32 en X -------------------
Recortar (Join-Path $raiz "assets\iconos\objetos.png") (0*32) 0 32 32 "icono-sandalias.png"
Recortar (Join-Path $raiz "assets\iconos\objetos.png") (1*32) 0 32 32 "icono-lorica.png"
Recortar (Join-Path $raiz "assets\iconos\objetos.png") (2*32) 0 32 32 "icono-anillo.png"
Recortar (Join-Path $raiz "assets\iconos\objetos.png") (3*32) 0 32 32 "icono-clepsidra.png"
Recortar (Join-Path $raiz "assets\iconos\objetos.png") (4*32) 0 32 32 "icono-corona.png"
Recortar (Join-Path $raiz "assets\iconos\objetos.png") (5*32) 0 32 32 "icono-antorcha.png"
Recortar (Join-Path $raiz "assets\iconos\objetos.png") (6*32) 0 32 32 "icono-piedraiman.png"
Recortar (Join-Path $raiz "assets\iconos\objetos.png") (7*32) 0 32 32 "icono-anfora.png"

Write-Output "Listo."
