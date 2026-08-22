# ---------------------------------------------------------------------------
# montar-galeria.ps1 - Compone las imagenes del README a partir del arte real
# del juego.
#
# Herramienta OFFLINE, como procesar-assets.ps1 y generar-efectos.ps1: no forma
# parte del juego y su salida no la carga nadie en partida. Escribe en docs/.
#
# POR QUE EXISTE. Un README con capturas se queda viejo en cuanto cambia el
# arte, y rehacerlas a mano es trabajo manual que nadie repite. Estas laminas
# se REGENERAN: si manana la loba cambia de sprite o entra un bicho nuevo, se
# vuelve a correr esto y la galeria del README se actualiza sola.
#
# LO QUE ESTO NO ES: no son capturas de pantalla. Son composiciones del arte
# -sprites recortados de sus hojas y colocados sobre el suelo del nivel- y en
# el README van etiquetadas como lo que son. Una captura de una partida en
# marcha necesita ejecutar el juego, y eso no se puede hacer desde aqui.
#
#   .\herramientas\montar-galeria.ps1
# ---------------------------------------------------------------------------

param(
    [string]$Destino = 'docs',
    # Normalizar las capturas de pantalla de docs\capturas\ en vez de componer
    # las laminas. Ver el bloque de abajo.
    [switch]$Capturas
)

Add-Type -AssemblyName System.Drawing

$raiz = Split-Path -Parent $PSScriptRoot
$assets = Join-Path $raiz 'assets'
$salida = Join-Path $raiz $Destino
if (-not (Test-Path $salida)) { New-Item -ItemType Directory -Path $salida | Out-Null }

$atlas = Get-Content (Join-Path $assets 'atlas.json') -Raw | ConvertFrom-Json

# Paleta, sacada de la ilustracion del titulo: noche azulada, oro y piedra.
$FONDO    = [System.Drawing.Color]::FromArgb(255, 22, 20, 30)
$FONDO2   = [System.Drawing.Color]::FromArgb(255, 34, 30, 44)
$ORO      = [System.Drawing.Color]::FromArgb(255, 226, 194, 122)
$HUESO    = [System.Drawing.Color]::FromArgb(255, 226, 222, 210)
$APAGADO  = [System.Drawing.Color]::FromArgb(255, 140, 132, 120)

function Nuevo($ancho, $alto) {
    $bmp = New-Object System.Drawing.Bitmap($ancho, $alto,
              [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    # VECINO MAS PROXIMO: es pixel art. Cualquier suavizado lo emborrona, que
    # es justo lo que el juego evita con imageSmoothingEnabled = false.
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
    return @{ bmp = $bmp; g = $g }
}

function Degradado($g, $ancho, $alto) {
    $r = New-Object System.Drawing.Rectangle(0, 0, $ancho, $alto)
    $b = New-Object System.Drawing.Drawing2D.LinearGradientBrush($r, $FONDO2, $FONDO, 90.0)
    $g.FillRectangle($b, $r)
    $b.Dispose()
}

# Dibuja el fotograma 0 de una hoja del atlas, escalado.
function Fotograma($g, $id, $x, $y, $escala) {
    $e = $atlas.entidades.$id
    if ($null -eq $e) { return 0 }
    $ruta = Join-Path $assets $e.archivo
    if (-not (Test-Path $ruta)) { return 0 }
    $img = [System.Drawing.Bitmap]::FromFile($ruta)
    $orig = New-Object System.Drawing.Rectangle(0, 0, $e.w, $e.h)
    $w = [int]([math]::Round($e.w * $escala)); $h = [int]([math]::Round($e.h * $escala))
    $dst = New-Object System.Drawing.Rectangle($x, $y, $w, $h)
    $g.DrawImage($img, $dst, $orig, [System.Drawing.GraphicsUnit]::Pixel)
    $img.Dispose()
    return $w
}

# Cuanto ocupa un texto. Hace falta para maquetar: el ancho de una celda no lo
# decide solo el sprite, tambien su nombre — la serpiente mide 33 px de ancho y
# su etiqueta 52, asi que avanzando por el sprite las etiquetas se pisan.
function AnchoTexto($g, $txt, $tam) {
    $f = New-Object System.Drawing.Font('Georgia', $tam, [System.Drawing.FontStyle]::Regular)
    $m = $g.MeasureString($txt, $f)
    $f.Dispose()
    return [int][math]::Ceiling($m.Width)
}

function Texto($g, $txt, $x, $y, $tam, $color, $negrita, $centrado) {
    $estilo = [System.Drawing.FontStyle]::Regular
    if ($negrita) { $estilo = [System.Drawing.FontStyle]::Bold }
    $f = New-Object System.Drawing.Font('Georgia', $tam, $estilo)
    $b = New-Object System.Drawing.SolidBrush($color)
    $fmt = New-Object System.Drawing.StringFormat
    if ($centrado) { $fmt.Alignment = [System.Drawing.StringAlignment]::Center }
    $g.DrawString($txt, $f, $b, [single]$x, [single]$y, $fmt)
    $f.Dispose(); $b.Dispose(); $fmt.Dispose()
}

function Guardar($obj, $nombre) {
    $ruta = Join-Path $salida $nombre
    $w = $obj.bmp.Width; $h = $obj.bmp.Height
    $obj.g.Dispose()
    # JPEG para la portada y PNG para las laminas, y no es capricho: la portada
    # es una ilustracion de miles de colores y en PNG se va a 2,5 MB, que GitHub
    # sirve entera en cada visita del README. Las laminas son pixel art de
    # paleta corta, donde el PNG comprime mucho mejor y el JPEG ademas
    # emborronaria los bordes duros.
    if ($nombre -like '*.jpg') {
        $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
                 Where-Object { $_.MimeType -eq 'image/jpeg' }
        $par = New-Object System.Drawing.Imaging.EncoderParameters(1)
        $par.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
            [System.Drawing.Imaging.Encoder]::Quality, [long]86)
        $obj.bmp.Save($ruta, $codec, $par)
        $par.Dispose()
    } else {
        $obj.bmp.Save($ruta, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    $obj.bmp.Dispose()
    $kb = [int]((Get-Item $ruta).Length / 1024)
    Write-Host ("  {0,-22} {1}x{2}  {3} KB" -f $nombre, $w, $h, $kb)
}

# --- Capturas de pantalla ---------------------------------------------------
#
# Las capturas del juego en marcha NO se generan aqui: hay que jugar y sacarlas.
# Lo que hace esto es dejarlas en condiciones de entrar al repositorio.
#
# Una captura de un monitor 4K sale a 3837x2157 y pesa entre 3 y 7 MB. Diez de
# esas son 45 MB versionados y 45 MB que GitHub sirve cada vez que alguien abre
# el README. Hay que bajarlas, y el A CUANTO importa:
#
# 960 DE ANCHO, y no 1280 ni 1920. La columna de contenido de un README en
# GitHub mide unos 900 px, asi que cualquier cosa mas ancha la reduce el
# navegador — y reducir pixel art en el navegador lo emborrona, que es justo lo
# que este juego evita por todas partes. A 960 se sirve al tamano al que se ve.
#
# BICUBICA y no vecino mas proximo. El mundo es pixel art ampliado por enteros y
# el vecino le vendria bien, pero la INTERFAZ se dibuja en su propio lienzo a la
# resolucion real del monitor (ver ui/capa.js): los textos de los menus son
# tipografia de verdad y con vecino mas proximo salen rotos.
if ($Capturas) {
    $dir = Join-Path $raiz 'docs\capturas'
    if (-not (Test-Path $dir)) { throw "No hay docs\capturas\ que normalizar." }
    Write-Host ""
    Write-Host "Normalizando capturas a 960 de ancho"
    Write-Host ""
    $antes = 0; $despues = 0
    foreach ($f in (Get-ChildItem (Join-Path $dir '*.png'))) {
        $antes += $f.Length
        $orig = [System.Drawing.Bitmap]::FromFile($f.FullName)
        $w = 960
        $h = [int]([math]::Round($orig.Height * $w / $orig.Width))
        $bmp = New-Object System.Drawing.Bitmap($w, $h)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.DrawImage($orig, (New-Object System.Drawing.Rectangle(0, 0, $w, $h)))
        $g.Dispose(); $orig.Dispose()

        # PNG si comprime bien, JPEG si no. Las pantallas de menu llevan detras
        # la ilustracion del titulo -miles de colores- y ahi el PNG se dispara;
        # una pantalla de juego sobre el suelo de arena comprime mucho mejor.
        $tmp = Join-Path $dir ($f.BaseName + '.tmp.png')
        $bmp.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png)
        $final = $f.FullName
        if ((Get-Item $tmp).Length -gt 400KB) {
            Remove-Item $tmp -Force
            $final = Join-Path $dir ($f.BaseName + '.jpg')
            $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
                     Where-Object { $_.MimeType -eq 'image/jpeg' }
            $par = New-Object System.Drawing.Imaging.EncoderParameters(1)
            $par.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
                [System.Drawing.Imaging.Encoder]::Quality, [long]90)
            $bmp.Save($final, $codec, $par)
            $par.Dispose(); $bmp.Dispose()
            Remove-Item $f.FullName -Force
        } else {
            $bmp.Dispose()
            Remove-Item $f.FullName -Force
            Move-Item $tmp $final
        }
        $kb = [int]((Get-Item $final).Length / 1024)
        $despues += (Get-Item $final).Length
        Write-Host ("  {0,-34} {1}x{2}  {3} KB" -f (Split-Path $final -Leaf), $w, $h, $kb)
    }
    Write-Host ""
    Write-Host ("  De {0} MB a {1} MB" -f [math]::Round($antes/1MB,1), [math]::Round($despues/1MB,1))
    Write-Host ""
    return
}

# LEER LOS DATOS DEL JUEGO, no copiarlos aqui.
#
# datos/ es la fuente de verdad de este proyecto -nombres, costes, niveles,
# descripciones- y una lamina que los duplique se queda desfasada en cuanto
# alguien toque un numero. Node ya esta en la maquina (el propio juego se
# comprueba con el), asi que se le pide que exporte lo justo en texto plano y se
# parsea aqui. Es una llamada por lamina, offline y sin dependencias nuevas.
function Leer-Datos($fichero, $constante) {
    $js = @"
const M = (await import('./js/datos/$fichero')).$constante;
for (const k of Object.keys(M)) {
  const d = M[k];
  const nombre = d.nombre || k;
  const desc = d.descripcion || '';
  const coste = d.costeBase === undefined ? '' : d.costeBase;
  const max = d.maxNivel === undefined ? '' : d.maxNivel;
  const arte = d.arte || '';
  console.log([k, nombre, desc, coste, max, arte].join('\u0001'));
}
"@
    # El temporal va en la RAIZ DEL REPOSITORIO y no en %TEMP%: un `import` de
    # modulo se resuelve contra la ruta del FICHERO que lo escribe, no contra el
    # directorio de trabajo, asi que desde %TEMP% buscaba js\datos\ dentro de
    # %TEMP% y no lo encontraba.
    $tmp = Join-Path $raiz ('.galeria-' + [guid]::NewGuid().ToString('N') + '.mjs')
    [IO.File]::WriteAllText($tmp, $js)
    $salida = & node $tmp 2>&1
    Remove-Item $tmp -Force
    $r = [ordered]@{}
    foreach ($linea in $salida) {
        $p = "$linea" -split ([char]1)
        if ($p.Count -lt 6) { continue }
        $r[$p[0]] = @{ nombre = $p[1]; desc = $p[2]; coste = $p[3]; max = $p[4]; arte = $p[5] }
    }
    if ($r.Count -eq 0) { throw "No he podido leer $constante de datos/$fichero" }
    return $r
}

Write-Host ""
Write-Host "Galeria del README, desde el arte real del juego"
Write-Host ""

# NOTA: aqui hubo una PORTADA compuesta —la ilustracion del titulo reducida a
# 1280— y se quito. El README arranca ahora con la captura real del menu
# principal, que es esa misma ilustracion CON la interfaz encima: enseñar el
# juego funcionando gana a enseñar su fondo de pantalla, y tener las dos era
# repetir la misma imagen dos veces.

# --- 2. BESTIARIO -----------------------------------------------------------
#
# A ESCALA REAL ENTRE ELLOS: todos con el mismo factor, para que la serpiente
# se vea al lado de la loba y la diferencia sea la de verdad. Escalarlos a una
# altura comun habria sido mas comodo de maquetar y mentira.
$bichos = @(
    @{ id = 'serpiente';  nombre = 'Serpiente' }
    @{ id = 'gladiador';  nombre = 'Gladiador' }
    @{ id = 'legionario'; nombre = 'Legionario' }
    @{ id = 'arpia';      nombre = 'Arpia' }
    @{ id = 'gargola';    nombre = 'Gargola' }
    @{ id = 'medusa';     nombre = 'Medusa' }
    @{ id = 'minotauro';  nombre = 'Minotauro' }
    @{ id = 'ciclope';    nombre = 'Ciclope' }
    @{ id = 'manticora';  nombre = 'Manticora' }
    @{ id = 'cerbero';    nombre = 'Cerbero' }
    @{ id = 'hidra';      nombre = 'Hidra' }
    @{ id = 'loba';       nombre = 'La Loba' }
)
$esc = 0.62
$hueco = 18
# Se mide primero para saber el lienzo que hace falta. La celda de cada bicho
# es lo ancho que sea EL MAYOR de los dos: su sprite o su etiqueta.
$medidor = Nuevo 8 8
$ancho = $hueco
$altoMax = 0
foreach ($b in $bichos) {
    $e = $atlas.entidades.($b.id)
    $w = [int]([math]::Round($e.w * $esc))
    $wt = AnchoTexto $medidor.g $b.nombre 9
    $b.celda = [math]::Max($w, $wt)
    $b.ancho = $w
    $ancho += $b.celda + $hueco
    $h = [int]([math]::Round($e.h * $esc))
    if ($h -gt $altoMax) { $altoMax = $h }
}
$medidor.g.Dispose(); $medidor.bmp.Dispose()
$alto = $altoMax + 78
$o = Nuevo $ancho $alto
Degradado $o.g $ancho $alto

# El suelo de Merida como banda inferior: los bichos se apoyan en algo suyo.
$suelo = [System.Drawing.Bitmap]::FromFile((Join-Path $assets 'niveles\merida-suelo.jpg'))
$bandaAlto = 54
$franja = New-Object System.Drawing.Rectangle(0, ($alto - $bandaAlto), $ancho, $bandaAlto)
$o.g.SetClip($franja)
for ($x = 0; $x -lt $ancho; $x += 260) {
    $dst = New-Object System.Drawing.Rectangle($x, ($alto - $bandaAlto - 30), 260, 200)
    $ori = New-Object System.Drawing.Rectangle(0, 0, 340, 260)
    $o.g.DrawImage($suelo, $dst, $ori, [System.Drawing.GraphicsUnit]::Pixel)
}
$o.g.ResetClip()
$suelo.Dispose()
# Un velo oscuro encima del suelo, para que los sprites recorten.
$velo = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(150, 22, 20, 30))
$o.g.FillRectangle($velo, $franja)
$velo.Dispose()

$x = $hueco
$linea = $alto - 44
foreach ($b in $bichos) {
    $e = $atlas.entidades.($b.id)
    $h = [int]([math]::Round($e.h * $esc))
    $cx = $x + $b.celda / 2
    Fotograma $o.g $b.id ([int]($cx - $b.ancho / 2)) ($linea - $h) $esc | Out-Null
    Texto $o.g $b.nombre $cx ($alto - 34) 9 $APAGADO $false $true
    $x += $b.celda + $hueco
}
Guardar $o 'bestiario.png'

# --- 3. PERSONAJES ----------------------------------------------------------
$gente = @(
    @{ id = 'eric';  nombre = 'ERIC';  arma = 'Scutum';          nota = 'Escudos que orbitan' }
    @{ id = 'lucy';  nombre = 'LUCY';  arma = 'Recortada';       nota = 'A bocajarro' }
    @{ id = 'sara';  nombre = 'SARA';  arma = 'Campo electrico'; nota = 'Nadie se acerca gratis' }
    @{ id = 'vicky'; nombre = 'VICKY'; arma = 'Katana';          nota = 'Barrido de 360' }
)
$escG = 2.0
$celda = 300
$ancho = $celda * $gente.Count
$alto = 380
$o = Nuevo $ancho $alto
Degradado $o.g $ancho $alto
$i = 0
foreach ($p2 in $gente) {
    $e = $atlas.entidades.($p2.id)
    $w = [int]([math]::Round($e.w * $escG)); $h = [int]([math]::Round($e.h * $escG))
    $cx = $celda * $i + $celda / 2
    Fotograma $o.g $p2.id ([int]($cx - $w / 2)) 40 $escG | Out-Null
    Texto $o.g $p2.nombre $cx 268 15 $ORO $true $true
    Texto $o.g $p2.arma $cx 300 11 $HUESO $false $true
    Texto $o.g $p2.nota $cx 326 9 $APAGADO $false $true
    $i++
}
Guardar $o 'personajes.png'

# --- 4. EFECTOS -------------------------------------------------------------
#
# La fila de proyectiles a x2 y una explosion desplegada fotograma a fotograma.
# Es la lamina que explica de un vistazo de que va el generador: todo eso son
# formulas, no dibujos.
$proyectiles = @('proyPilum', 'proyLanza', 'proyVirote', 'proyFlecha', 'proyKunai',
                 'proyShuriken', 'proyRosa', 'proyAbeja', 'proyMolotov', 'proyLengua',
                 'proyMetralla', 'proyPiedra', 'balaPistola', 'proyColumna')
$ancho = 1280
$alto = 430
$o = Nuevo $ancho $alto
Degradado $o.g $ancho $alto

Texto $o.g 'PROYECTILES' 28 22 11 $ORO $true $false
$x = 30; $y = 60; $altoFila = 0
foreach ($id in $proyectiles) {
    $e = $atlas.entidades.$id
    if ($null -eq $e) { continue }
    $w = [int]([math]::Round($e.w * 2)); $h = [int]([math]::Round($e.h * 2))
    if ($x + $w -gt $ancho - 30) { $x = 30; $y += $altoFila + 22; $altoFila = 0 }
    Fotograma $o.g $id $x ($y + [int]((48 - $h) / 2)) 2.0 | Out-Null
    if ($h -gt $altoFila) { $altoFila = $h }
    $x += $w + 26
}

Texto $o.g 'UNA EXPLOSION, FOTOGRAMA A FOTOGRAMA' 28 236 11 $ORO $true $false
$exp = $atlas.entidades.explosionFuego
$img = [System.Drawing.Bitmap]::FromFile((Join-Path $assets $exp.archivo))
$lado = 118
$x = 30
for ($f = 1; $f -lt $exp.frames; $f += 1) {
    if ($x + $lado -gt $ancho - 30) { break }
    $dst = New-Object System.Drawing.Rectangle($x, 274, $lado, $lado)
    $ori = New-Object System.Drawing.Rectangle(($f * $exp.w), 0, $exp.w, $exp.h)
    $o.g.DrawImage($img, $dst, $ori, [System.Drawing.GraphicsUnit]::Pixel)
    $x += $lado + 4
}
$img.Dispose()
Guardar $o 'efectos.png'


# --- 5. ARSENAL -------------------------------------------------------------
#
# Los 52 iconos de arma en rejilla. Es la lamina que dice de un vistazo lo que
# ninguna frase dice igual de rapido: el tamano del catalogo.
$ico = $atlas.entidades.iconosArmasHd
$img = [System.Drawing.Bitmap]::FromFile((Join-Path $assets $ico.archivo))
$lado = 64
$cols = 13
$filas = [math]::Ceiling($ico.frames / $cols)
$marg = 26
$ancho = $cols * $lado + $marg * 2
$alto = $filas * $lado + $marg * 2 + 34
$o = Nuevo $ancho $alto
Degradado $o.g $ancho $alto
Texto $o.g 'EL ARSENAL' $marg 16 11 $ORO $true $false
for ($f = 0; $f -lt $ico.frames; $f++) {
    $cx = $marg + ($f % $cols) * $lado
    $cy = $marg + 30 + [math]::Floor($f / $cols) * $lado
    $dst = New-Object System.Drawing.Rectangle($cx, $cy, $lado, $lado)
    $ori = New-Object System.Drawing.Rectangle(($f * $ico.w), 0, $ico.w, $ico.h)
    $o.g.DrawImage($img, $dst, $ori, [System.Drawing.GraphicsUnit]::Pixel)
}
$img.Dispose()
Guardar $o 'arsenal.png'

# --- 6. POTENCIADORES -------------------------------------------------------
#
# LOS DATOS MANDAN, y esta lamina es la razon de que lo diga en voz alta: la
# primera version se dibujo con `iconosObjetos`, una hoja de ocho iconos de 32
# px que NO es la que usa la tienda. Los potenciadores llevan su propio arte,
# uno por cada uno, y lo declaran ellos mismos en datos/potenciadores.js con el
# campo `arte`. Se lee de ahi y no de una lista escrita a mano: asi no puede
# volver a salir el arte de otro, ni faltar uno al anadirlo.
#
# Se leen tambien el nombre, el coste y el maximo, que es lo que convierte la
# lamina en informacion en vez de en una fila de dibujitos.
$pots = Leer-Datos 'potenciadores.js' 'POTENCIADORES'
$col = 5
$anchoCelda = 200
$altoCelda = 176
$filas = [math]::Ceiling($pots.Count / $col)
$ancho = $col * $anchoCelda + 40
$alto = $filas * $altoCelda + 74
$o = Nuevo $ancho $alto
Degradado $o.g $ancho $alto
Texto $o.g 'POTENCIADORES PERMANENTES' 24 18 12 $ORO $true $false
Texto $o.g 'Se compran con denarios y no caducan: valen en todas las partidas siguientes.' 24 44 9 $APAGADO $false $false

$i = 0
foreach ($k in $pots.Keys) {
    $d = $pots[$k]
    $cx = 20 + ($i % $col) * $anchoCelda + $anchoCelda / 2
    $cy = 74 + [math]::Floor($i / $col) * $altoCelda
    $e = $atlas.entidades.($d.arte)
    if ($e) {
        # Todos a la misma ALTURA y no al mismo ancho: son piezas de 88 a 128 de
        # ancho por 112 de alto, asi que igualar la altura los alinea y respeta
        # la proporcion de cada uno.
        $esc = 86.0 / $e.h
        $w = [int]([math]::Round($e.w * $esc))
        Fotograma $o.g $d.arte ([int]($cx - $w / 2)) ($cy + 4) $esc | Out-Null
    }
    Texto $o.g $d.nombre $cx ($cy + 96) 10 $HUESO $true $true
    Texto $o.g ($d.coste + ' denarios') $cx ($cy + 118) 8 $ORO $false $true
    Texto $o.g ('hasta nivel ' + $d.max) $cx ($cy + 136) 8 $APAGADO $false $true
    $i++
}
Guardar $o 'potenciadores.png'

# --- 7. MASCOTAS ------------------------------------------------------------
#
# Las OCHO, no seis: la lamina anterior se hizo mirando la carpeta de assets y
# se dejo fuera a Plinio el Buho y al Pollito Fantasma, que estan igual de
# presentes en datos/mascotas.js. Otra vez lo mismo — leyendo los datos no pasa.
$mascotas = Leer-Datos 'mascotas.js' 'MASCOTAS'
$col = 4
$anchoCelda = 250
$altoCelda = 214
$filas = [math]::Ceiling($mascotas.Count / $col)
$ancho = $col * $anchoCelda + 40
$alto = $filas * $altoCelda + 74
$o = Nuevo $ancho $alto
Degradado $o.g $ancho $alto
Texto $o.g 'LAS OCHO MASCOTAS' 24 18 12 $ORO $true $false
Texto $o.g 'Te acompanan toda la partida, suben de nivel y cada una hace algo distinto.' 24 44 9 $APAGADO $false $false

$i = 0
foreach ($k in $mascotas.Keys) {
    $d = $mascotas[$k]
    $cx = 20 + ($i % $col) * $anchoCelda + $anchoCelda / 2
    $cy = 74 + [math]::Floor($i / $col) * $altoCelda
    $idFicha = 'mascota' + $k.Substring(0,1).ToUpper() + $k.Substring(1) + 'Ficha'
    $e = $atlas.entidades.$idFicha
    if ($e) {
        $esc = 110.0 / $e.h
        $w = [int]([math]::Round($e.w * $esc))
        Fotograma $o.g $idFicha ([int]($cx - $w / 2)) ($cy + 4) $esc | Out-Null
    }
    Texto $o.g $d.nombre $cx ($cy + 122) 10 $HUESO $true $true
    # La descripcion, partida en dos renglones por la palabra mas cercana al
    # medio: a 8 pt caben unos 34 caracteres por linea en una celda de 250.
    $txt = $d.desc
    $corte = 0
    if ($txt.Length -gt 34) {
        $mitad = [int]($txt.Length / 2)
        $corte = $txt.LastIndexOf(' ', $mitad + 8)
        if ($corte -lt 8) { $corte = $txt.IndexOf(' ', $mitad) }
    }
    if ($corte -gt 0) {
        Texto $o.g $txt.Substring(0, $corte) $cx ($cy + 146) 8 $APAGADO $false $true
        Texto $o.g $txt.Substring($corte + 1) $cx ($cy + 164) 8 $APAGADO $false $true
    } else {
        Texto $o.g $txt $cx ($cy + 146) 8 $APAGADO $false $true
    }
    $i++
}
Guardar $o 'mascotas.png'

Write-Host ""
Write-Host "Hecho. Las laminas estan en $Destino\ y las referencia el README."
Write-Host ""
