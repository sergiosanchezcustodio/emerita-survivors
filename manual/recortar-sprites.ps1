Add-Type -AssemblyName System.Drawing

$raiz = "C:\Claude\emerita-survivors"
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
Recortar (Join-Path $raiz "assets\enemigos\serpiente.png")  0 0 54  48  "serpiente.png"
Recortar (Join-Path $raiz "assets\enemigos\gargola.png")    0 0 68  74  "gargola.png"
Recortar (Join-Path $raiz "assets\enemigos\arpia.png")      0 0 93  76  "arpia.png"
Recortar (Join-Path $raiz "assets\enemigos\medusa.png")     0 0 78  96  "medusa.png"
Recortar (Join-Path $raiz "assets\enemigos\legionario.png") 0 0 105 112 "legionario.png"
Recortar (Join-Path $raiz "assets\enemigos\gladiador.png")  0 0 103 108 "gladiador.png"
Recortar (Join-Path $raiz "assets\enemigos\minotauro.png")  0 0 113 120 "minotauro.png"
Recortar (Join-Path $raiz "assets\enemigos\ciclope.png")    0 0 159 140 "ciclope.png"
Recortar (Join-Path $raiz "assets\enemigos\manticora.png")  0 0 204 172 "manticora.png"
Recortar (Join-Path $raiz "assets\enemigos\cerbero.png")    0 0 310 280 "cerbero.png"
Recortar (Join-Path $raiz "assets\enemigos\hidra.png")      0 0 365 320 "hidra.png"
Recortar (Join-Path $raiz "assets\enemigos\loba.png")       0 0 320 360 "loba.png"

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
