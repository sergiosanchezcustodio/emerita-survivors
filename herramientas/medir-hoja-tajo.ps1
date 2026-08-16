# ---------------------------------------------------------------------------
# medir-hoja-tajo.ps1 - Saca los numeros de una hoja de animacion de tajo.
#
# Herramienta OFFLINE de medida. No recorta nada ni escribe nada: SOLO INFORMA,
# en texto, de lo que hay que poner en $HOJAS_TAJOS dentro de procesar-assets.ps1.
#
#   .\herramientas\medir-hoja-tajo.ps1 resources\armas\efectos\sprite_x.png
#   .\herramientas\medir-hoja-tajo.ps1 <ruta> -Cols 3 -Filas 2
#
# POR QUE EXISTE. Los tres numeros que necesita el recorte -la rejilla, el
# pivote y el medio lado- no se pueden estimar a ojo sin equivocarse, y
# equivocarse en el pivote deja el tajo despegado de la mano. Aqui se miden:
#
#   REJILLA  se deduce de las bandas de filas y columnas vacias.
#   PIVOTE   el jugador va en el hueco del anillo. Se propone el centroide de
#            los fotogramas MAS CERRADOS (los ultimos), que son los unicos
#            simetricos alrededor de el; en los primeros el arco esta a medias y
#            su centroide no dice nada.
#   MEDIO    el radio del contenido mas lejano de TODA la hoja. Poniendolo asi,
#            el filo del dibujo cae en el borde del fotograma, y entonces el
#            juego puede dibujarlo con medio lado = alcance del arma y el tajo
#            acaba exactamente donde acaba el dano.
#
# Y recuerda el ultimo numero, que no sale de aqui: `lado` debe ser
# alcance * 2 * 4 del arma en su nivel base, para que el blit salga 1:1.
# ---------------------------------------------------------------------------
param(
    [Parameter(Mandatory = $true)][string]$Ruta,
    [int]$Cols = 0,
    [int]$Filas = 0
)
Add-Type -AssemblyName System.Drawing

if (-not (Test-Path $Ruta)) { "no existe: $Ruta"; exit 1 }
$bmp = New-Object System.Drawing.Bitmap (Resolve-Path $Ruta).Path
$W = $bmp.Width; $H = $bmp.Height
$rect = New-Object System.Drawing.Rectangle 0, 0, $W, $H
$d = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly,
                   [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$stride = $d.Stride
$buf = New-Object byte[] ($stride * $H)
[System.Runtime.InteropServices.Marshal]::Copy($d.Scan0, $buf, 0, $buf.Length)
$bmp.UnlockBits($d); $bmp.Dispose()

"imagen ${W}x${H}"

# --- perfiles de opacidad, para deducir la rejilla ------------------------
$filaTiene = New-Object bool[] $H
$colTiene = New-Object bool[] $W
for ($y = 0; $y -lt $H; $y++) {
    $base = $y * $stride
    for ($x = 0; $x -lt $W; $x++) {
        if ($buf[$base + $x * 4 + 3] -gt 24) { $filaTiene[$y] = $true; $colTiene[$x] = $true }
    }
}
function Bandas([bool[]]$p) {
    $o = New-Object System.Collections.ArrayList
    $i = -1
    for ($k = 0; $k -lt $p.Length; $k++) {
        if ($p[$k] -and $i -lt 0) { $i = $k }
        elseif (-not $p[$k] -and $i -ge 0) { [void]$o.Add([PSCustomObject]@{ a = $i; b = $k - 1 }); $i = -1 }
    }
    if ($i -ge 0) { [void]$o.Add([PSCustomObject]@{ a = $i; b = $p.Length - 1 }) }
    return $o
}
# @() a la fuerza: PowerShell desenvuelve la lista al devolverla, y con UNA sola
# banda -que es el caso de cualquier hoja de un solo dibujo- lo que llega no es
# un array sino el objeto suelto, sin .Count. Sin esto la herramienta se rendia
# justo con las hojas mas sencillas.
$bY = @(Bandas $filaTiene)
$bX = @(Bandas $colTiene)
"bandas con contenido: $($bY.Count) horizontales, $($bX.Count) verticales"
if ($bY.Count -eq 1 -and $bX.Count -eq 1) {
    "  -> una sola mancha de contenido: es una imagen suelta, no una rejilla."
}

if ($Filas -le 0) { $Filas = $bY.Count }
if ($Cols -le 0) { $Cols = $bX.Count }
if ($Filas -le 0 -or $Cols -le 0) { "no se deduce la rejilla; pasa -Cols y -Filas"; exit 1 }
$cw = [math]::Floor($W / $Cols); $ch = [math]::Floor($H / $Filas)
"rejilla: $Cols x $Filas   celdas de ${cw}x${ch}"
if ($W % $Cols -ne 0 -or $H % $Filas -ne 0) {
    "  AVISO: la imagen no es multiplo exacto de la rejilla; se trunca."
}

# --- centroide de brillo por celda -----------------------------------------
"`ncelda   centroide del brillo   opacos"
$cents = @()
for ($f = 0; $f -lt ($Cols * $Filas); $f++) {
    $cx = ($f % $Cols) * $cw; $cy = [math]::Floor($f / $Cols) * $ch
    $sx = 0.0; $sy = 0.0; $peso = 0.0; $n = 0
    for ($y = 0; $y -lt $ch; $y++) {
        $base = ($cy + $y) * $stride
        for ($x = 0; $x -lt $cw; $x++) {
            $a = $buf[$base + ($cx + $x) * 4 + 3]
            if ($a -le 96) { continue }
            $n++; $sx += $x * $a; $sy += $y * $a; $peso += $a
        }
    }
    if ($peso -le 0) { "F$($f+1)      (vacia)"; $cents += $null; continue }
    $mx = [math]::Round($sx / $peso); $my = [math]::Round($sy / $peso)
    $cents += [PSCustomObject]@{ x = $mx; y = $my; n = $n }
    "F$($f+1)      ($mx, $my)              $n"
}

# Propuesta de pivote: media de los centroides de la MITAD FINAL de la hoja,
# que son los fotogramas cerrados y por tanto simetricos alrededor del jugador.
$ultimos = @($cents | Where-Object { $_ -ne $null })
$mitad = [math]::Max(1, [math]::Floor($ultimos.Count / 2))
$fin = $ultimos[($ultimos.Count - $mitad)..($ultimos.Count - 1)]
$pivX = [math]::Round(($fin | Measure-Object -Property x -Average).Average)
$pivY = [math]::Round(($fin | Measure-Object -Property y -Average).Average)
"`nPIVOTE propuesto: ($pivX, $pivY)   [media de los $mitad fotogramas finales]"
"  centro geometrico de la celda: ($([math]::Floor($cw/2)), $([math]::Floor($ch/2)))"

# --- radio del contenido mas lejano, respecto a ese pivote -----------------
"`ncelda   radio max al pivote"
$rGlobal = 0.0
for ($f = 0; $f -lt ($Cols * $Filas); $f++) {
    $cx = ($f % $Cols) * $cw; $cy = [math]::Floor($f / $Cols) * $ch
    $rmax = 0.0
    for ($y = 0; $y -lt $ch; $y++) {
        $base = ($cy + $y) * $stride
        for ($x = 0; $x -lt $cw; $x++) {
            if ($buf[$base + ($cx + $x) * 4 + 3] -le 24) { continue }
            $dx = $x - $pivX; $dy = $y - $pivY
            $r = [math]::Sqrt($dx * $dx + $dy * $dy)
            if ($r -gt $rmax) { $rmax = $r }
        }
    }
    if ($rmax -gt $rGlobal) { $rGlobal = $rmax }
    "F$($f+1)      $([math]::Round($rmax,1))"
}
$medio = [math]::Ceiling($rGlobal) + 2
# El recorte se hace centrado en el pivote, asi que no puede pasarse de ninguno
# de los cuatro bordes de la celda o se saldria a la celda vecina.
$tope = [math]::Min([math]::Min($pivX, $cw - $pivX), [math]::Min($pivY, $ch - $pivY))
if ($medio -gt $tope) {
    "`nAVISO: el contenido llega a $([math]::Round($rGlobal,1)) pero desde el pivote"
    "  solo caben $tope px sin salirse de la celda. Se recortara algo del dibujo."
    $medio = $tope
}

"`n--- PARA `$HOJAS_TAJOS EN procesar-assets.ps1 ---"
"    @{ src='<ruta bajo resources\>'; dst='efectos\tajo-<arma>.png'"
"       id='tajo<Arma>'; cols=$Cols; filas=$Filas; pivX=$pivX; pivY=$pivY; medio=$medio; lado=<alcance*8> }"
"`n  `lado` = alcance del arma en nivel 1, por 2 (diametro) y por 4 (ESCALA_ARTE)."
"  Con eso el blit sale 1:1 en el caso base."
""
"  EL PIVOTE ES UNA PROPUESTA Y HAY QUE CONFIRMARLO VIENDOLO. Sale del centroide"
"  de brillo, que se desvia hacia donde el dibujo tiene los destellos mas"
"  fuertes: en la katana propone 254 y el bueno resulto ser 240. Un error de"
"  pivote no se nota en ningun numero -- se nota en que el tajo sale despegado"
"  de la mano, y eso solo se ve mirando al personaje dentro del efecto."
