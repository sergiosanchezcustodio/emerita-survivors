# ---------------------------------------------------------------------------
# medir-lapida.ps1 - Donde caen los renglones del menu del titulo.
#
#   .\herramientas\medir-lapida.ps1 [ruta]
#
# El menu del titulo no se escribe por codigo: las palabras vienen PINTADAS en
# la lapida de la ilustracion (assets/menus/titulo.jpg). Lo unico que pone el
# juego encima es el recuadro de luz de la opcion senalada, y para eso hace
# falta saber a que altura queda cada palabra: es la tabla OPCIONES_TITULO de
# js/ui/pantallas.js.
#
# POR QUE EXISTE. Esas medidas se sacaron a mano barriendo la imagen, y cada
# vez que Sergio repinta la lapida hay que volver a sacarlas. Hacerlo a ojo
# sobre la imagen abierta es lento, se equivoca y -en una sesion con Claude-
# cuesta unos 4.700 tokens que ya no se van del contexto. Esto lo contesta en
# una tabla de texto.
#
# COMO MIDE. La lapida es piedra OSCURA con letras CLARAS:
#
#   1. Se marca cada pixel que destaca sobre la MEDIANA DE SU PROPIA FILA. Con
#      un umbral fijo no vale: la piedra tiene degradado y una luz caliente
#      arriba, asi que la mitad de arriba entera saldria como texto.
#   2. LOS RIELES DEL MARCO SE RECONOCEN SOLOS, sin decir donde estan: son las
#      columnas con el TRAZO VERTICAL SEGUIDO mas largo -van de arriba abajo de
#      la placa-, mientras que una letra no pasa de su propio renglon. Se
#      localizan asi y se quitan de en medio.
#
#      Esto no es elegancia: la primera version buscaba "la columna mas clara
#      de cada mitad" y en la lapida de cinco opciones eligio una letra de
#      JUGAR EN RED en vez del riel derecho, porque el texto es mas brillante
#      que el marco. Y hay que quitarlos porque una ventana de medida que pisa
#      el riel lo cuenta como texto y todos los renglones salen del mismo
#      ancho: el del marco.
#   3. Un renglon es una racha de filas con bastantes pixeles marcados. Se
#      descartan las que ocupan casi todo el interior: eso es una moldura, no
#      una palabra.
#
# Lo que NO hace: decidir. Dice donde estan las palabras; que numeros se
# escriben en OPCIONES_TITULO -alto del recuadro, aire de mas- es criterio.
# ---------------------------------------------------------------------------
param(
    [string]$Ruta = "assets\menus\titulo.jpg",
    # LA VENTANA ES EL HUECO DE LA PLACA, no la pantalla entera, y es a
    # proposito: fuera de la placa esta la ilustracion -estatuas, antorchas,
    # cielo- que es clara y ancha, asi que con la ventana abierta CADA FILA
    # parece un renglon de texto. Probado: salian seis "renglones" de 200
    # pixeles de alto.
    #
    # Si algun dia la lapida cambia de sitio, estos cuatro numeros son lo que
    # hay que mover, y se sacan de mirar la ilustracion una vez.
    [int]$Y0 = 540,
    [int]$Y1 = 750,
    [int]$X0 = 530,
    [int]$X1 = 847,
    # Cuanto tiene que destacar un pixel sobre la mediana de su fila.
    [int]$Contraste = 55
)

Add-Type -AssemblyName System.Drawing

$raiz = Split-Path -Parent $PSScriptRoot
$completa = if ([System.IO.Path]::IsPathRooted($Ruta)) { $Ruta } else { Join-Path $raiz $Ruta }
if (-not (Test-Path $completa)) { Write-Error "No existe: $completa"; exit 1 }

$bmp = [System.Drawing.Bitmap]::FromFile($completa)
$rect = New-Object System.Drawing.Rectangle 0, 0, $bmp.Width, $bmp.Height
$datos = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly,
                       [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$stride = $datos.Stride
$bytes = New-Object byte[] ($stride * $bmp.Height)
[System.Runtime.InteropServices.Marshal]::Copy($datos.Scan0, $bytes, 0, $bytes.Length)
$bmp.UnlockBits($datos)
$ancho = $bmp.Width; $alto = $bmp.Height
$bmp.Dispose()

if ($Y1 -ge $alto) { $Y1 = $alto - 1 }
if ($X1 -ge $ancho) { $X1 = $ancho - 1 }
$w = $X1 - $X0 + 1
$h = $Y1 - $Y0 + 1

# --- 1. Que pixeles destacan sobre la mediana de su fila -------------------
$marca = New-Object bool[] ($w * $h)
$fila = New-Object double[] $w
for ($y = $Y0; $y -le $Y1; $y++) {
    $base = $y * $stride
    for ($x = $X0; $x -le $X1; $x++) {
        $i = $base + $x * 4
        $fila[$x - $X0] = 0.299 * $bytes[$i+2] + 0.587 * $bytes[$i+1] + 0.114 * $bytes[$i]
    }
    $orden = $fila | Sort-Object
    $corte = $orden[[int]($w / 2)] + $Contraste
    $off = ($y - $Y0) * $w
    for ($c = 0; $c -lt $w; $c++) { $marca[$off + $c] = ($fila[$c] -gt $corte) }
}

Write-Host ""
Write-Host "LAPIDA DEL TITULO  -  $Ruta  ($ancho x $alto)" -ForegroundColor Cyan
Write-Host ""

# --- 2. Fuera los trazos verticales largos ---------------------------------
# Los rieles del marco estorban: una ventana de medida que los pisa los cuenta
# como texto y todos los renglones salen del mismo ancho, el del marco.
#
# NO SE BUSCAN POR BRILLO, y esto costo dos intentos. La primera version cogia
# "la columna mas clara de cada mitad" y en esta lapida eligio una letra de
# JUGAR EN RED, porque el texto brilla mas que la piedra. La segunda sumaba
# filas claras por columna, y una columna que pilla letra en las CINCO opciones
# acumula tanto como medio riel.
#
# Lo que separa a un riel de una letra es la RACHA SEGUIDA: el riel es un trazo
# de arriba abajo de la placa; la letra mas alta son 21 filas. Y no se exige
# encontrar dos: en la lamina de cinco opciones el riel derecho es tan tenue
# que no llega a destacar, y eso no impide medir las palabras.
$racha = New-Object int[] $w
for ($c = 0; $c -lt $w; $c++) {
    $mejor = 0; $actual = 0
    for ($f = 0; $f -lt $h; $f++) {
        if ($marca[$f * $w + $c]) { $actual++; if ($actual -gt $mejor) { $mejor = $actual } }
        else { $actual = 0 }
    }
    $racha[$c] = $mejor
}
$esRiel = New-Object bool[] $w
$rieles = @()
for ($c = 0; $c -lt $w; $c++) {
    $esRiel[$c] = ($racha[$c] -ge 40)
    if ($esRiel[$c] -and -not ($c -gt 0 -and $esRiel[$c-1])) { $rieles += ($c + $X0) }
}
if ($rieles.Count -gt 0) {
    Write-Host ("  trazos de marco descartados en x = {0}" -f ($rieles -join ', '))
} else {
    Write-Host "  no se ha descartado ningun trazo de marco (ninguno destaca lo bastante)"
}

# --- 3. Los renglones ------------------------------------------------------
# Una palabra no es "alguna fila con pixeles claros": es una fila con MUCHOS y
# REPARTIDOS. Las dos condiciones hacen falta -un reflejo en la piedra da un
# punado juntos, y un trazo suelto del marco da pocos- y con ellas no hace
# falta saber donde acaba el interior de la placa.
$MIN_PIXELES = 25    # pixeles claros en la fila
$MIN_EXTENSION = 60  # y de que punta a que punta
$ALTO_MINIMO = 6     # menos de esto no es una palabra, es un brillo

$claros = New-Object int[] $h
$desde = New-Object int[] $h
$hasta = New-Object int[] $h
for ($f = 0; $f -lt $h; $f++) {
    $n = 0; $a = -1; $b = -1
    for ($c = 0; $c -lt $w; $c++) {
        if ($esRiel[$c]) { continue }
        if ($marca[$f * $w + $c]) { $n++; if ($a -lt 0) { $a = $c }; $b = $c }
    }
    # Con `$claros[$f] = if (...)` en una sola linea, PowerShell 5.1 guarda algo
    # que no es el numero y las rachas salen corridas. Se escribe a pelo.
    if ($n -ge $MIN_PIXELES -and ($b - $a) -ge $MIN_EXTENSION) { $claros[$f] = $n }
    else { $claros[$f] = 0 }
    $desde[$f] = $a; $hasta[$f] = $b
}

$renglones = New-Object System.Collections.ArrayList
$dentro = $false; $ini = 0
for ($f = 0; $f -lt $h; $f++) {
    if (-not $dentro -and $claros[$f] -gt 0) { $dentro = $true; $ini = $f }
    elseif ($dentro -and $claros[$f] -eq 0) {
        $dentro = $false
        if ($f - $ini -ge $ALTO_MINIMO) { [void]$renglones.Add(@($ini, ($f - 1))) }
    }
}
if ($dentro -and ($h - $ini) -ge $ALTO_MINIMO) { [void]$renglones.Add(@($ini, ($h - 1))) }

if ($renglones.Count -eq 0) {
    Write-Host "  NO SE HA ENCONTRADO NINGUN RENGLON. Revisa la franja de busqueda." -ForegroundColor Red
    exit 1
}

# --- 4. Cada renglon, con su ancho y su paso -------------------------------
$tabla = @()
$anterior = 0
foreach ($r in $renglones) {
    $f0 = $r[0]; $f1 = $r[1]
    # EL ANCHO NO SE MIDE CON EL PIXEL MAS EXTREMO, sino con las columnas que
    # aparecen en VARIAS filas del renglon. Un solo pixel de ruido del JPEG
    # cerca del riel estiraba la palabra cien pixeles: JUGAR salia de 206 de
    # ancho en vez de 101. Un palo de letra cruza el renglon entero; el ruido
    # aparece en una fila y se va.
    $cIni = $w; $cFin = -1
    for ($c = 0; $c -lt $w; $c++) {
        if ($esRiel[$c]) { continue }
        $veces = 0
        for ($f = $f0; $f -le $f1; $f++) { if ($marca[$f * $w + $c]) { $veces++ } }
        if ($veces -ge 3) {
            if ($c -lt $cIni) { $cIni = $c }
            if ($c -gt $cFin) { $cFin = $c }
        }
    }
    # OJO CON LOS NOMBRES. Se llaman asi y no `$y0`/`$y1` porque PowerShell NO
    # distingue mayusculas: `$y0` y el parametro `$Y0` son LA MISMA VARIABLE.
    # Escribir `$y0 = $f0 + $Y0` machacaba el origen de la franja con el primer
    # renglon, y a partir de ahi cada medida salia sumada a la anterior: cinco
    # renglones de altura creciente y un bloque que acababa en y=1122 sobre una
    # imagen de 768. Sale mal de una forma que PARECE un fallo de deteccion.
    $yIni = $f0 + $Y0; $yFin = $f1 + $Y0
    $centroY = [int][math]::Round(($yIni + $yFin) / 2)
    $tabla += [PSCustomObject]@{
        y        = "$yIni..$yFin"
        alto     = $yFin - $yIni + 1
        centroY  = $centroY
        x        = "{0}..{1}" -f ($cIni + $X0), ($cFin + $X0)
        anchoTxt = $cFin - $cIni + 1
        centroX  = [int][math]::Round((($cIni + $cFin) / 2) + $X0)
        paso     = if ($anterior -gt 0) { $centroY - $anterior } else { 0 }
    }
    $anterior = $centroY
}
$tabla | Format-Table -AutoSize

# --- 5. Lo que hay que copiar a pantallas.js -------------------------------
$primero = $renglones[0][0] + $Y0
$ultimo = $renglones[$renglones.Count - 1][1] + $Y0
Write-Host ("  {0} renglones.  El bloque va de y={1} a y={2}." -f $renglones.Count, $primero, $ultimo)
$sumaX = 0
foreach ($t in $tabla) { $sumaX += $t.centroX }
$mediaX = [int][math]::Round($sumaX / $tabla.Count)
$maxAncho = ($tabla | Measure-Object -Property anchoTxt -Maximum).Maximum
Write-Host ("  Centro de las palabras: x={0}.  La mas larga mide {1}." -f $mediaX, $maxAncho)
Write-Host ""
Write-Host "  Para js/ui/pantallas.js (el alto lleva 10 de aire; es criterio):" -ForegroundColor Yellow
Write-Host "  const OPCIONES_TITULO = ["
for ($i = 0; $i -lt $tabla.Count; $i++) {
    $coma = if ($i -lt $tabla.Count - 1) { "," } else { "" }
    Write-Host ("    {{ y: {0}, alto: {1} }}{2}" -f $tabla[$i].centroY, ($tabla[$i].alto + 10), $coma)
}
Write-Host "  ];"
Write-Host ("  const OPCION_X = {0};" -f $mediaX)
Write-Host ""
