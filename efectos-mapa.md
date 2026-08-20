# Mapa de efectos → armas y ataques

Documento de trabajo de la **sesión 1** del plan de efectos: cruzar las láminas
de `resources/armas/efectos/` con lo que el juego dibuja hoy por código.

No toca ni una línea del motor. Su único producto es la tabla de asignación de
la última sección, que es lo que la sesión 2 tendría que implementar.

---

## 1. La demanda: qué ranuras de efecto existen de verdad

El catálogo son 57 armas, pero **no son 57 efectos**. El motor ya las agrupa por
`comportamiento` (`js/sistemas/armas.js`), y ese agrupamiento es la unidad
correcta: un efecto por comportamiento, con el color separando dentro de cada
familia igual que se hace ahora.

| Comportamiento | Nº | Armas | Cómo se dibuja HOY | Tamaño en pantalla |
|---|---|---|---|---|
| `proyectilDirigido` | 7 | Pilum, Pistola, Arco corto, Honda balear, Fusil, Subfusil, Revólver | `_dardo` / `_bala` trazados | 8-16 px |
| `direccionFija` | 9 | Lanzas gemelas, Columna doble, Rosa de los vientos, Ballista, Aspa, Enfilada, Lluvia de agujas, Muro de lanzas, Escorpión | `_dardo` | 5-18 px |
| `direccionAleatoria` | 2 | Metralla, Enjambre | `_dardo` | 4-6 px |
| `arcoMelee` | 7 | Gladius, Hacha, Maza, Látigo, Motosierra, Guadaña, Katana | `dibujarTajos` | arco medio |
| `conoCorto` | 3 | Escopeta, Lanzallamas, Recortada | `_bala` en abanico | corto, direccional |
| `proyectilExplosivo` | 4 | Lanzagranadas, Cóctel molotov, Lanzacohetes, Pilum de Júpiter | `_bola` + zona `'onda'` | **explosión grande** |
| `bombardeoAleatorio` | 3 | Bombardeo, Artillería, Lluvia de flechas | zona `'onda'` | **explosión grande** |
| `ondaCircular` | 4 | Onda expansiva, Grito de guerra, Sismo, Gladius Hispaniensis | anillo creciente | **muy grande** |
| `zonaPersistente` | 7 | Fuego griego, Rete, Tribulus, Aceite hirviendo, Minas, Alquitrán, Incendio de Emerita | círculo relleno + canto | **radio 15-40** |
| `auraPasiva` | 2 | Aquila, Campo eléctrico | círculo pegado al jugador | grande, persistente |
| `rayoPerforante` | 4 | Rayo de Júpiter, Rayo cruzado, Láser, Aspa de luz | `dibujarRayos` / `_rayo` | largo, direccional |
| `orbital` | 4 | Scutum, Satélites, Discos de sierra, Testudo | `dibujarOrbitales` | pequeño, persistente |
| `orbitalPulsante` | 1 | Sierras votivas | `dibujarOrbitales` | pequeño, persistente |

### Ataques de enemigos y jefes

| Quién | Ataque | Color actual | Cómo se dibuja hoy |
|---|---|---|---|
| Medusa | proyectil de veneno | `#9ae86a` | disparo trazado |
| Cíclope / Minotauro | `sismo`: aviso 0.85 s, radio 30 | `#c98a3a` | círculo que se cierra |
| Mantícora | volea de 3 proyectiles | `#ffb14a` | disparo trazado |
| Cerbero (fase 2) | conos de fuego alternos, 3 charcos de radio 15 | `#ff7a2a` | aviso + zonas |
| Cerbero (fase 3) | embestida con aviso 0.6 s | — | sin efecto propio |
| Hidra | veneno de dos cabezas, 3 charcos de radio 18 | `#6fbf4a` | aviso + zonas |
| Hidra / Loba | furia | — | solo aviso de texto |

### Dónde está el hueco real

Ordenado por lo que ganaría el juego, no por número de armas:

1. **Explosión** — 7 armas la piden y hoy es un círculo que crece. Es el hueco
   más grande y el más fácil de llenar.
2. **Charco** — 7 armas más los dos jefes. Hoy es un círculo relleno.
3. **Onda circular** — 4 armas, ocupa media pantalla, hoy es un anillo.
4. **Aviso / telegrafía** — el sismo y los conos de los jefes. Es la única
   información que el jugador *necesita* leer, así que aquí el adorno no puede
   comerse el canto.
5. **Rayo y aura eléctrica** — 6 armas entre las dos.

Y donde **no** hay hueco: los proyectiles (18 armas entre las tres familias de
dardo y bala). A 8-16 px, el trazo por código gana a cualquier sprite reducido.

---

## 1.bis Orden de dibujado: el suelo va debajo

Hoy `js/main.js:1664` pinta las zonas DESPUÉS de los enemigos, con este motivo
escrito al lado: *"los efectos tienen que leerse siempre, aunque haya
ochocientos cuerpos debajo"*. El resultado es que un charco de aceite se dibuja
por encima de los cuerpos, que es justo lo contrario de lo que es: una mancha en
el suelo que se pisa.

El motivo del comentario sigue siendo cierto, así que la zona **se parte en dos
capas** en vez de moverse entera:

- **Relleno** → capa de suelo, entre el terreno y las entidades. Es calcomanía.
- **Canto** (anillo oscuro + anillo de color) → por encima de todo, como ahora.
  Es información: marca la frontera del daño, y esa no puede quedar enterrada.

Y la altura de cada zona sale del `modo` que `zonaDanyo.js` ya distingue, sin
inventar ningún campo:

| Modo | Qué es | Capa |
|---|---|---|
| `'zona'` | charcos, trampas, auras: Fuego griego, Rete, Tribulus, Aceite hirviendo, Minas, Alquitrán, Incendio de Emerita, Aquila, Campo eléctrico, veneno de la Hidra, fuego de Cerbero | **suelo**, bajo las entidades |
| `'onda'` | explosiones y ondas expansivas | **aire**, encima (sin cambio) |

Una explosión está en el aire y debe tapar; un charco está en el suelo y debe
ser pisado.

Implementación: dos pasadas sobre el mismo pool filtrando por `modo`, el mismo
patrón que ya usa el dibujado en dos pasadas de relleno y borde. Sin asignar
nada. **Es un cambio independiente del proyecto de sprites** y se sostiene solo
aunque las láminas se descarten.

Consecuencia para el proyecto: una calcomanía de suelo es el caso más fácil de
todos —estática, radial, sin rampa de escala que hornear, dibujada una vez
debajo de todo—, así que el charco pasa a ser la ranura más barata de las cinco
con hueco.

---

## 2. La oferta: qué hay en las láminas

Inventario hecho por subagente sobre las 8 láminas. Resumen; el detalle celda a
celda no se conserva aquí a propósito, solo lo que se va a usar.

### Dos hechos que cambian el plan técnico

1. **Ninguna lámina está sobre negro.** Las cuatro JPG están sobre **blanco
   puro** y las cuatro PNG sobre degradado arcoíris. Por tanto:
   - `globalCompositeOperation = 'lighter'` **no aplica** a este material.
   - El alfa se genera por **umbral de luminancia (>~247)** en
     `procesar-assets.ps1`. Funciona porque es pixel art de borde duro: no hay
     glow suave que perseguir. El halo de compresión JPG es de 1-2 px y el
     umbral se lo come.
   - Los efectos se pegan en composición **normal**. Coincide con la decisión
     de la sección 1.bis: una calcomanía de suelo no debe ser aditiva.
2. **No hay ni una secuencia de animación.** Las 8 láminas son catálogos, no
   fases. Toda animación hay que fabricarla por escala/rotación/alfa. Refuerza
   el orden de ataque: el charco es estático y no necesita ninguna; la explosión
   necesita rampa de escala horneada.

### Estado por lámina

| Lámina | Rejilla | Fondo | Veredicto |
|---|---|---|---|
| **efectos6.jpg** 1264x462 | **regular 8x4, celda 158x115** | blanco | **Base del proyecto.** 32/32 celdas usables, pixel art de contorno grueso |
| **efectos8.jpg** 1168x784 | irregular, 7 bandas | blanco | Muy buena: explosiones, impactos, armas |
| efectos5.jpg 1248x832 | irregular, 7 bandas | blanco | Mitad útil; solapa con la 8, que gana |
| efectos2.png 1536x1024 | irregular, 8 bandas | degradado | Buen contenido, recorte manual. Reserva |
| efectos3.png 1536x1024 | irregular, 9 bandas | degradado saturado | Marginal: demasiado trazo de 1-2 px |
| efectos1.png | — | destrozado | **Inservible**: alfa mal calculado, halo gris, barra negra tapando celdas |
| efectos4.png | — | — | **Duplicado byte a byte de efectos3** (mismo MD5) |
| efectos7.jpg | regular 8x4 | blanco | Versión lavada de la 6, peor celda por celda. Prescindible |

### El hallazgo que ordena el proyecto

`efectos6.jpg` tiene **una fila entera de 8 tajos en media luna (fila B)** y
**otra de 8 zonas de suelo (fila C)**. Son justo las dos ranuras con más armas
detrás: `arcoMelee` (7) y `zonaPersistente` (7 + los dos jefes). Una sola
lámina, con rejilla regular y recorte por `slice` fijo, cubre 14 armas.

### Una ranura que no estaba en la sección 1

`efectos8.jpg` **fila G** son ocho impactos por material: fuego, agua, veneno,
alquitrán, sangre, tierra, humo y veneno morado. El motor ya tiene `MATERIALES`
en `js/entidades/enemigo.js` —la gárgola es estatua y no sangra, la medusa
suelta veneno— y hoy `VFX.impacto()` dibuja el mismo trazo para todos. Esa fila
encaja con una distinción que el juego ya hace y no sabe enseñar.

---

## 3. Tabla de asignación

Origen: `L6` = efectos6.jpg, `L8` = efectos8.jpg, `L5` = efectos5.jpg.

### 3.1 Charcos y zonas de suelo — `zonaPersistente` (capa de SUELO)

La ranura más barata: estática, radial, sin animación que hornear, y con la
fila C de L6 entera disponible.

| Arma / ataque | Celda | Qué es |
|---|---|---|
| Fuego griego | L6 C1 | charco de lava con borde de roca |
| Incendio de Emerita (evo) | L6 C1 | el mismo, a mayor radio |
| Alquitrán | L6 C7 | charco de alquitrán negro con piedras |
| Rete | L6 C5 | maraña de espinas y zarzas |
| Tribulus | L6 C6 | anillo de escarcha *(recolorear a acero)* |
| Minas | L6 C2 | sello grabado en piedra |
| Aceite hirviendo | L8 G1 | impacto de fuego naranja con chispas |
| Veneno de la Hidra | L6 C4 | charco de limo verde |
| Fuego de Cerbero | L6 C1 | charco de lava |
| Campo eléctrico (`auraPasiva`) | L8 C8 | campo eléctrico morado agrietado |
| Aquila (`auraPasiva`) | L6 C2 | sello grabado en piedra |

### 3.2 Tajos — `arcoMelee` (7 armas, fila B de L6)

| Arma | Celda | Qué es |
|---|---|---|
| Gladius | L6 B6 | media luna azul de viento |
| Katana | L6 B2 | media luna azul de agua |
| Hacha | L6 B4 | media luna de garra marrón |
| Maza | L6 B4 | la misma, más corta y ancha |
| Látigo | L6 B5 | media luna rosa |
| Motosierra | L6 B7 | media luna roja desgarrada |
| Guadaña | L6 B3 | media luna morada oscura |

### 3.3 Explosiones — `proyectilExplosivo` + `bombardeoAleatorio` (capa de AIRE)

Necesitan rampa de escala horneada. Segundo objetivo, no primero.

| Arma | Celda | Qué es |
|---|---|---|
| Lanzagranadas / Bombardeo / Artillería | L8 A1 | explosión naranja-roja |
| Lanzacohetes | L8 A4 | nube negra con brasas rojas |
| Cóctel molotov | L8 A8 | aro de fuego llameante |
| Pilum de Júpiter | L8 A3 | explosión azul eléctrica con rayos |
| Lluvia de flechas | — | sin sprite: es una lluvia, no una detonación |

### 3.4 Rayo y luz — `rayoPerforante`

| Arma | Celda | Qué es |
|---|---|---|
| Rayo de Júpiter / Rayo cruzado | L6 A5 | rayo azul ramificado |
| Láser | L6 D5 | láser rojo con núcleo de impacto *(el color ya casa: `#ff6b8a`)* |
| Aspa de luz | L8 A7 | destello estelar dorado |

### 3.5 Impactos por material — `VFX.impacto()`

| Material | Celda |
|---|---|
| carne | L8 G5 salpicadura de sangre |
| piedra (gárgola) | L8 G6 montículo de tierra y piedras |
| veneno (medusa) | L8 G3 charco de veneno con burbujas |

### 3.6 Ataques de enemigos

| Quién | Celda |
|---|---|
| Medusa | L6 A8 nube verde tóxica |
| Cíclope / Minotauro (`sismo`) | L6 A7 remolino de polvo y piedras |
| Mantícora | L5 B1 estela de fuego naranja |

### 3.7 Lo que se queda SIN sprite, y por qué

- **Los 18 proyectiles** de `proyectilDirigido`, `direccionFija` y
  `direccionAleatoria`. A 4-18 px el trazo por código gana. Sin discusión.
- **`ondaCircular`** (4 armas). Todo el material de ondas concéntricas del lote
  —L5 filas F y G, 16 celdas— es de líneas de 1 px que el inventario marca como
  ilegibles al reducir. El anillo trazado es mejor. *Excepción:* **Sismo** pasa
  a L6 A7, que sí es una silueta rotunda de tierra.
- **`orbital` y `orbitalPulsante`** (5 armas). Son pequeños y persistentes: un
  sprite estático girando llamaría más la atención de la que merecen.
- **Las telegrafías.** El aviso del sismo y los conos de los jefes se quedan
  como están: son información pura y el canto no puede difuminarse.

### 3.8 Cobertura

| | Armas |
|---|---|
| Con sprite asignado | 24 de 57 |
| Sin sprite, por decisión | 27 |
| Sin decidir | 6 (los `bombardeo`/`onda` de reparto dudoso) |

Más 3 impactos por material, 3 ataques de enemigo y 2 de jefe.

---

## 4. Sesión 2 — lo implementado

### Herramienta

`Procesador.RecortarCeldas` en `herramientas/procesar-assets.ps1`: recorta las
celdas pedidas de una lámina de rejilla regular sobre blanco y las deja en una
tira. Tres decisiones:

- **El fondo se quita por INUNDACIÓN desde el borde de la celda, no por umbral
  a secas.** El charco de lava tiene brillos casi blancos y el anillo de
  escarcha es blanco entero: un umbral plano los agujerearía por dentro. Es el
  mismo criterio que `QuitarFondoOpaco` ya usaba con el conejo blanco.
- **Una erosión contra el fondo** después, para el halo de compresión del JPG.
- **Reducción por color DOMINANTE**, no media de área: la lámina es pixel art
  de paleta corta y contorno grueso, justo el caso de `EscalarDominante`.

Catálogo en el mismo archivo: `$CELDAS_EFECTOS`, huecos 16/19/22 de
`efectos6.jpg` (fila C), a 192 px de lado.

**192 es el número a tocar si algo sale mal.** El radio de una zona crece con el
nivel del arma —el Alquitrán va de 46 a 77 unidades— así que no existe un tamaño
horneado que valga para todos y el sprite se escala en caliente. La regla de
"blits a 1:1" no aplica: se escribió para el bucle de los 700 enemigos, y aquí
son tres o cuatro charcos en pantalla.

Salida: `assets/efectos/zonas.png` (576x192) + entrada `efectosZonas` en el
atlas, con `plano: true` y `orden`. El resto del atlas no cambia ni un byte.

### Motor

`js/entidades/zonaDanyo.js` — `dibujar()` se parte en dos:

| | Qué pinta | Dónde |
|---|---|---|
| `dibujarSuelo(ctx)` | relleno de las zonas `'zona'`: calcomanía si la hay, círculo aditivo si no | tras el terreno, **antes que las gemas** |
| `dibujarAire(ctx)` | relleno de las `'onda'` + **el canto de todas** | encima de las entidades |

La calcomanía va en composición **normal**, no `lighter`: las láminas vienen
sobre blanco, y además una mancha en el suelo tapa el suelo — sumar luz es lo
que hace un fuego, no un charco de alquitrán.

`js/entidades/disparo.js` — mismo corte para los charcos de los JEFES, que no
viven en `Zonas` sino en el pool de disparos enemigos. El propio código ya los
llamaba *"terreno, no un proyectil"*, así que el reparto es el mismo. **El aviso
no baja**: sigue arriba del todo, porque es lo único que da tiempo a apartarse.

`HOJA_ZONAS` y `huecoDe()` se exportan desde `zonaDanyo.js` para que los dos
sistemas compartan resolutor. El índice se resuelve **al crear la zona**, nunca
por frame.

### Datos

| Dónde | Campo |
|---|---|
| `datos/armas.js` alquitran | `sprite: 'alquitran'` |
| `datos/jefes.js` hidra.veneno | `sprite: 'venenoHidra'` |

Sin entrada en la hoja, `huecoDe` devuelve -1 y la zona vuelve al círculo
trazado sin avisar. Es la misma red que los placeholders del atlas.

### Ronda 1 de revisión: dos cosas que cambiaron el piloto

**El Fuego griego se descartó.** No por el recorte, que salía bien, sino por el
dibujo: el charco de lava (C1) lleva un reborde de piedra concéntrico a pocos
píxeles del canto —o sea un segundo anillo compitiendo con la única frontera que
hay que leer— y está dibujado como un cráter, con profundidad. Con él puesto,
los enemigos no parecían metidos en el charco sino flotando sobre un pozo. Una
calcomanía de suelo tiene que ser plana. Se queda con su círculo trazado; la
candidata de repuesto es `efectos8.jpg` G1, que es una mancha de fuego plana,
pero esa lámina tiene rejilla irregular y `RecortarCeldas` aún no la sabe leer.

**El recorte por casilla estaba mal, y era un fallo con tres síntomas.** La
revisión reportó manchas sueltas, calcomanía descentrada y charco que solo
cubría el 55-65% del aro. Las tres cosas eran lo mismo: la rejilla de la lámina
es nominal y el dibujo de la fila de arriba sangra unos píxeles dentro de la
celda. Medido sobre la celda 16: la isla buena es 127x84 y el sangrado una tira
de 35x3 pegada al borde superior; con la tira dentro, la caja de la silueta
pasaba a 126x104 —veinte filas de aire— y al encajar "contener" el charco salía
encogido y caído.

Es exactamente la lección que `RecortarIconos` ya había aprendido y que su
comentario deja escrita: *POR ISLAS, no por celdas de rejilla*. Ahora
`SoloIslasPropias` separa las manchas conexas y se queda con la mayor y con las
que sean suyas de verdad (≥12% de su área y centro dentro del 80% central de la
casilla). Un sangrado del vecino tiene el centro pegado al borde por definición.

| celda | antes | ahora | isla real medida |
|---|---|---|---|
| 16 | 126x104 | 126x84 | 127x84 |
| 19 | 130x98 | 130x66 | 130x66 |
| 22 | 156x96 | 131x68 | — |

Y la erosión contra el halo blanco del JPG pasó de una pasada a dos: el halo es
de dos píxeles, y al ampliar la calcomanía el segundo se convertía en un reborde
claro de seis o siete píxeles de pantalla.

### Ronda 2: la mancha no llegaba al aro

Los restos quedaron limpios, pero apareció un defecto peor y **medible**: la
mancha cubría solo el ~45% del área del aro. Al limpiar el sangrado, las
siluetas quedaron en su tamaño real, que son elipses de casi 2:1 (130x66);
encajadas "contener" en un marco cuadrado llenan a lo ancho y dejan corona de
suelo desnudo arriba y abajo. Y ese suelo **hace daño**: la zona es el círculo
entero. Un jugador con los pies en el borde de arriba leería que está fuera.

Arreglado **estirando** la calcomanía hasta llenar el marco (`estirar` en
`RecortarCeldas`). Un charco es amorfo: no hay proporción verdadera que respetar
en una mancha de brea, y a los dibujos que sí son redondos —anillo de escarcha,
sello de piedra— estirarlos al marco es la identidad.

| | ronda 2 | ahora |
|---|---|---|
| cobertura del aro, alquitrán | ~45% | **81,4%** |
| cobertura del aro, veneno | ~35% | **91,2%** |

### Ronda 3: la orla, y una medición mal planteada

La revisión dijo que la orla clara seguía viéndose pese a que la medición decía
0% de píxeles casi-blancos. **Tenía razón y la métrica estaba mal**: se medían
píxeles con luminancia >200, y oscurecer el filo al 70% convierte un 250 en 175
—pasa el filtro y sigue siendo gris claro sobre la losa azul—. Se estaba
midiendo que se había quitado el *blanco*, no que se hubiera quitado la *orla*.

La métrica correcta compara el brillo del **filo** con el del **interior**: lo
que canta no es ser blanco, es ser más claro que el dibujo justo en el contorno.

Y el arreglo cambió con ella: en vez de oscurecer, cada píxel del filo **copia el
color de un vecino interior limpio**. Es agnóstico al color, cosa que oscurecer
no era —con el anillo de escarcha, que es blanco entero, lo habría destrozado.

| | filo | interior | exceso |
|---|---|---|---|
| veneno | 34,0 | 66,8 | **−32,8** |
| alquitrán | 33,2 | 46,7 | **−13,5** |

El filo es más oscuro que el relleno: lo que queda es el contorno grueso que
dibujó el artista, no el timbre del JPG.

Y el entrante en V que dejaba suelo desnudo dentro del aro se tapa con una
**base tenue** del color de la zona (alfa 0,14) bajo la calcomanía, del tamaño
exacto del aro. No pretende parecer un charco: impide que dentro del aro quede
un píxel con aspecto de terreno normal.

### Ronda 4: aprobado, y una falsa alarma mía

Las dos reservas quedaron resueltas. Se investigó un posible corte recto del
flanco derecho a radio máximo y **no era un bug**:

```
area caja   absX       centro       ¿de esta casilla?
6355 133x68 949..1081  (1016,291)   sí   <- el alquitrán
2982  57x79 1096..1152 (1130,293)   no   <- el vecino (C8)
borde derecho de la casilla: x=1105
```

El charco acaba 24 píxeles antes del borde. El test que dio la alarma contaba
píxeles oscuros más allá del borde sin preguntarse de quién eran, y estaba
midiendo el dibujo vecino. El corte recto está en el arte de origen.

Aun así se dejó puesta la **ventana ampliada**: la búsqueda de islas se hace en
un rectángulo un 30% mayor que la casilla y cada mancha se asigna a la casilla
donde cae su centro. Resuelve los dos desbordes —lo que entra del vecino y lo que
sale de aquí— con un solo criterio, que es lo que `RecortarIconos` ya hacía. No
cambió ni un píxel de la salida actual, que es la prueba de que es segura.

### Probando en el juego: tres correcciones

**El temblor del Lanzacohetes.** No venía de la explosión sino de las MUERTES:
cada enemigo con vida ≥150 pedía `VFX.sacudir(1.2 + peso*3.5)`, hasta 4,7. Con
radio de explosión 61 y dos cohetes, eso son decenas de peticiones seguidas, y
como la sacudida se rearma antes de decaer, la cámara no paraba nunca. El
problema era **la repetición, no la amplitud**.

Racionada igual que el hitstop y por el mismo motivo: lo que se repite hay que
racionarlo, lo que pasa una vez no. `VFX.sacudir(amplitud, masa)` — con `masa`,
una cada 0,22 s y techo 1,7 en vez de 4,7. Jefes, caídas y evoluciones no la
ponen y conservan su fuerza. Tope global 5,5.

**El aro de las zonas del jugador, también al suelo.** El relleno ya bajaba,
pero el canto se quedaba arriba con el argumento de que marca la frontera del
daño. El argumento vale para lo que te hace daño A TI —el fuego de Cerbero y el
veneno de la Hidra mantienen su canto arriba en `disparo.js`— y no vale para tu
propia arma: el aro del Campo eléctrico o del Aquila es el alcance de lo que
llevas puesto, no una amenaza que esquivar, y sobre los cuerpos hacía que el
aura pareciera ir por delante de los enemigos.

**El velo pasó de 0,14 a 0,20**, porque con el Rete —gris pálido y solo 78% de
cobertura— no se veía y quedaba corona de suelo desnudo.

### Minas: la lección del piloto

Se probó la celda C2 (sello grabado en piedra) para las Minas y se descartó:
canto tallado concéntrico casi del diámetro del aro —dos fronteras compitiendo,
el defecto de la lava— y bisel con relieve, así que los enemigos quedaban
encaramados sobre una losa. Y encima mentía sobre el arma: las Minas son cargas
pequeñas que se pisan, no una plataforma.

**Y tenía la mejor cobertura medida de las cuatro: 99,1% del aro.** Es la peor
de todas y ninguna métrica lo habría dicho. La medición sirve para lo que se
puede contar —área cubierta, exceso de brillo del filo, restos de recorte— y no
sustituye a mirar si el dibujo cuenta la verdad sobre el arma.

> **ESTADO FINAL (léase antes que nada de lo de abajo).** De todo el
> experimento de calcomanías de zona **no sobrevivió ninguna**: se probaron
> cinco celdas de la lámina `efectos6.jpg` y las cinco se retiraron. Las láminas
> de origen ya no están en el repositorio y el bloque que las recortaba tampoco.
>
> Lo que SÍ salió de aquí y sigue en pie:
>
> - **El cambio de capas**: el relleno y el aro de las zonas del jugador van
>   bajo las entidades, y los charcos de jefe también.
> - **El camino de los sprites de arma**, que es lo que después usaron la
>   Katana, el campo eléctrico, los orbitales, la bala y el Aquila — todos con
>   arte encargado a propósito en vez de recortado de un catálogo.
>
> El resto del documento es el registro de cómo se llegó ahí, con los descartes
> y sus motivos. Se conserva porque los motivos siguen valiendo.

### Vuelta atrás: las calcomanías de zona no funcionan

**Probadas jugando y retiradas.** El Alquitrán y el Rete llegaron a estar
puestos y se quitaron: quedaban mal en partida. Es el cuarto y quinto descarte
de la fila C después de la lava y el sello, así que de las cinco celdas
probadas **no ha aguantado ninguna**.

Lo importante es dónde falló la comprobación. Las mediciones daban bien —
cobertura del aro, filo sin orla, recorte limpio— y la hoja de contacto también
las aprobó. Es **en movimiento** donde no funcionan, y ni el número ni la imagen
fija llegan ahí. Una hoja de contacto vale para descartar (y descartó dos), no
para aprobar.

Queda solo `venenoHidra`, que es de la misma familia y **no se ha visto aún en
juego** —es el jefe del minuto 20—, así que está pendiente del mismo juicio y lo
más probable es que caiga igual.

**Lo que SÍ se queda de todo esto** es el cambio de capas: el relleno y el aro
de las zonas del jugador van bajo las entidades, y los charcos de jefe también.
Eso se pidió aparte, se ve en las 9 armas de zona y no depende de ninguna
calcomanía.

---

## 6. El tajo de la Katana — la primera animación

`resources/armas/efectos/sprite_katana.png` es distinta a todo lo anterior:
**trae secuencia**. Rejilla 3x2 de celdas de 512, seis fases del mismo barrido
en orden de lectura, y con alfa propia.

**Encaja con el arma por un motivo que no era obvio.** La revisión concluyó que
no es un tajo direccional sino un anillo cerrado, y lo dio como pega. Pero la
Katana ya es `angulo: 360` — *"Barrido de 360° a tu alrededor. Hay que estar
dentro."* Lo que parecía un defecto era la forma correcta; el revisor juzgaba la
hoja contra un arco direccional genérico sin tener los datos del arma delante.

### `RecortarRejilla`, y por qué no vale `RecortarCeldas`

Tres diferencias, y las tres son el mismo principio:

1. **Caja común, no caja por fotograma.** Es la lección que `ProcesarGif` ya
   tenía escrita para los GIF de enemigos. Recortando ajustado a cada silueta,
   una animación que CRECE queda centrada y del mismo tamaño en todas: el
   crecimiento —que aquí es toda la animación— desaparece.
2. **No se toca el alfa.** Ni umbral, ni inundación, ni `Rematar`. La hoja trae
   su transparencia y es una ilustración con bloom: endurecer el alfa, que es lo
   correcto con pixel art, aquí la destroza.
3. **El pivote manda.** Se recorta centrado en él, así que acaba siendo el
   centro del fotograma y el juego dibuja sin desplazamientos.

### Lo medido, no estimado

| | |
|---|---|
| pivote | (256, 240) de cada celda; el centroide de brillo de los fotogramas cerrados sale en (258, 246) |
| contenido más lejano | 237,3 px → recorte de medio lado **240** |
| radio del anillo, por fotograma | 211 a 237 |

Que `medio` sea el radio del contenido más lejano es lo que permite dibujar en
el juego con **medio lado = `alcance`** y que el filo caiga justo donde acaba el
daño, sin factores de corrección.

**Horneado a 304 px**, que es el tamaño exacto al que la Katana se dibuja a
nivel 1 (alcance 38 → 38·2·4). Así el caso base es un blit 1:1. A 256 el juego
ampliaba 1,19x, y ampliar por vecino más próximo una ilustración de degradados
es lo que dejaba el borde dentado que vio la revisión.

Comprobado sobre la tira generada: ocupación 5,7% → 32% monótona (la animación
se conservó), y 109.312 px de alfa intermedio frente a 49.237 opacos (el bloom
sobrevivió).

### En el motor

`sistemas/armas.js`: los tajos guardan `sprite` (fotograma base) y la fase sale
de su vida. Se dibuja en **aditivo**, que además hace invisible el halo oscuro
que la hoja desborda entre celdas y que si no dejaría un canto recto. Gira con
la dirección del golpe: en un barrido de 360° no cambia dónde se hace daño, pero
evita que dos tajos seguidos salgan calcados.

**Y se le añade un desvanecido al final**, que la hoja no trae: los seis
fotogramas van de destello a anillo cerrado y ahí se acaban, así que sin esto el
tajo desaparecería de golpe en su fotograma más denso.

El atlas guarda `orden` (las armas) y `porTajo` (fotogramas de cada una), para
que una segunda arma con su propio tajo entre sin reescribir nada:
`fotograma = índice(arma) * porTajo + fase`.

### Pendiente de decisión de Sergio

**El color.** El efecto es magenta y violeta con bloom; la Katana tiene
`color: '#e8f0ff'` —acero blanco azulado— y el juego es romano. La revisión:
*"el magenta puro es el color más ajeno posible a una paleta de piedra, arena y
bronce; lee a JRPG, no a arena de gladiadores"*. Se ha montado tal cual porque
es lo que se pidió. Salidas: teñirlo al hornear, o reservarlo para un arma
arcana y dejar la Katana con su arco.

---

## 7. Reservas que quedan, las dos cosméticas

- **La silueta es lobulada** y a radio máximo se lee como un trébol. Es el arte
  de origen, no el recorte: se arregla con otra celda o con otro dibujo.
- **El velo va justo** en las esquinas del aro a radio medio. El número a tocar
  es el 0,14 de `dibujarSuelo`, y es una decisión de gusto que conviene tomar
  jugando, no mirando una hoja de contacto.
- **A radio 77 el píxel de la calcomanía triplica al del suelo.** Esto NO se
  arregla horneando más grande: la celda de origen mide 130 px y el charco
  necesita 616 en pantalla, así que son 4,7 píxeles de pantalla por píxel de
  origen se hornee al tamaño que se hornee. Haría falta arte de origen mayor.

---

## 5. Qué haría la sesión 3

Solo si el punto de decisión sale a favor:

1. Las cinco celdas restantes de la fila C de `efectos6.jpg` → Rete, Tribulus,
   Minas, Aceite hirviendo y las dos auras. Es copiar filas en
   `$CELDAS_EFECTOS` y añadir `sprite:` en los datos; el motor ya no se toca.
2. La fila B (8 tajos) para `arcoMelee`. **Requiere trabajo nuevo**: un tajo es
   direccional y hay que rotarlo con la dirección del golpe, cosa que la
   calcomanía de suelo no necesitaba.
3. Las explosiones de `efectos8.jpg` fila A. **El caso caro**: hay que hornear
   una rampa de escala offline porque no existe ninguna secuencia en las
   láminas.

### Pendiente de confirmar con Sergio

- `efectos4.png` es duplicado exacto de `efectos3.png` (2,8 MB). ¿Se borra?
- `efectos1.png` está corrupta (2,1 MB). ¿Se borra o se regenera desde la 2?

---

## 8. Repaso de huecos tras las hojas generadas

Con el generador ya en marcha, se cruzó el catálogo entero contra el atlas para
ver qué seguía cayendo al trazo por código. Quedaban **tres** huecos de verdad,
y ninguno era una lámina que faltara:

| Hueco | Qué pasaba | Arreglo |
|---|---|---|
| **Rayo de Júpiter** | `caerRayo` creaba su onda SIN hoja: la única de las siete explosivas que seguía siendo un aro trazado, y encima al final de un haz muy trabajado | hoja nueva `reventonChispa` |
| **Llamarada** (consumible) | las tres ondas de `actualizarLlamarada` tampoco pedían hoja | `reventonLlama`, que ya existía |
| **Testudo** | evolucionar el Scutum cambiaba su escudo dibujado por el círculo trazado, o sea que la evolución parecía una rebaja | `orbScutum`, el del arma de la que sale |

Dos de los tres se arreglaron **sin arte nuevo**. Es el argumento del inventario
otra vez: el hueco no estaba en el material, estaba en el reparto.

La hoja nueva es una fila más en `$CATALOGO`, y va aparte de `explosionJupiter`
—que es del Pilum— porque son dos cosas distintas: una detonación se ABRE (bola
llena, hueco que crece) y un chispazo se DESCARGA (núcleo pequeño y todo lo
demás repartido en brazos). De ahí las chispas más altas del catálogo, 52, y
`radioRef` a 28 en vez de 50, que es el radio al que el arma dibuja de verdad.

### Lo que sigue sin dibujo, y por qué

- **Los 18 proyectiles** y **los 3 rayos perforantes**: la decisión de §3.7 sigue
  en pie, el trazo gana a esa escala.
- **Lanzallamas** y **Lluvia de flechas**: por lo mismo — un cono de fuego son
  proyectiles, y una lluvia no es una detonación.
- ~~**Satélites**: es el único que pide arte de verdad.~~ **Resuelto**: lleva
  lunas llenas con aura azul, y salen del generador. Se daba por hecho que los
  orbitales tenían que venir de `resources/` porque los otros tres vienen de
  ahí, y era un prejuicio: una luna son dos circunferencias y una resta, o sea
  el caso más claro de todo el proyecto para el código como medio. Con eso, el
  catálogo se queda **sin un solo orbital sin dibujo**.
- **`charcoPiedra`** está horneada y **sin usar**: era la candidata de las Minas,
  que se descartó (§ "Minas: la lección del piloto") y acabó con hoja propia.
  Se deja porque cuesta 13 KB y es la única zona de aspecto mineral que hay.

---

## 9. Fuera los aros: el círculo dejó de ser el efecto

Petición de Sergio tras jugar: *"algunas armas y ataques de enemigos muestran
círculos del área que van a afectar; es mejor dejar únicamente el efecto o
animación y quitar esos círculos orientativos"*.

Tenía razón, y el motivo por el que estaban ahí ya no valía. Cuando se
escribieron, la mayoría de las armas de área NO tenían dibujo y el aro **era** el
efecto; el argumento escrito al lado —*"marca la frontera del daño, la única
información que una zona da"*— era cierto en ese mundo. Con las hojas generadas,
cada efecto está horneado para llenar su cuadro justo hasta el radio que mata, o
sea que **el dibujo ya es la frontera**. El aro encima era el mismo borde dos
veces, y de las dos ganaba la trazada.

Lo que se ha quitado:

| Dónde | Qué era |
|---|---|
| `zonaDanyo.dibujarSuelo` §3 | aro por zona persistente, bajo las entidades |
| `zonaDanyo.dibujarAire` §3 | aro de la onda, encima de todo |
| `disparo.dibujar`, charco activo | aro sobre el charco animado de Cerbero y la Hidra |
| `disparo.dibujarSuelo` | el velo bajo la calcomanía **cuando hay hoja propia** — la excepción que `zonaDanyo` ya tenía escrita y a esta copia se le había pasado, o sea un disco de color en pantalla durante todo el combate de jefe |
| avisos del sismo y de los charcos de jefe | el aro fijo al radio de daño |

### Los avisos se quedan, sin el aro

El aviso del sismo del cíclope es lo único que da tiempo a apartarse: 0,85 s y
un punto que no siempre es el tuyo. Quitarlo entero dejaba el golpe sin señal.
Se ha quitado solo el **aro** —la circunferencia trazada al radio exacto, que es
lo que se leía como marca de editor— y se conserva la **mancha que se llena**,
que dice DÓNDE y CUÁNTO FALTA con la misma forma y al completarse cubre
exactamente lo que va a golpear. La información sigue entera; lo que se fue es
el subrayado. Sube algo de opacidad (0,22-0,42 → 0,28-0,58) porque sin la línea
que la enmarcaba la mancha tiene que sostener el aviso ella sola.

### Y una consecuencia: la Lluvia de flechas necesitaba hoja

Era la última onda del arsenal sin dibujo, o sea la única que dependía del aro
para verse. Se le puso `reventonTierra`, que además es lo que corresponde:
§3.7 la había dejado fuera razonando que *"es una lluvia, no una detonación"* —
por eso lleva polvo y astillas en composición normal, y no una bola de fuego.

Comprobado por texto: cero armas de área sin hoja, cero referencias rotas al
atlas, y en `zonaDanyo` no queda ni un `stroke` de círculo.

### Lo que sigue siendo un círculo, y por qué

- **El aro de "va a disparar"** sobre la medusa y la mantícora (`enemigo.js`,
  `dibujarAvisos`): 14 px que se cierran sobre el bicho. No es un área, es un
  aviso pegado a quien dispara.
- ~~**Los orbitales sin hoja** (Satélites)~~ — ya no queda ninguno: ver arriba.
- **Los anillos de recompensa** (subir de nivel, curarse): son premio, no daño.

---

## 10. El catálogo, cerrado: 54 de 57

Se generaron por código las siete hojas que faltaban, y con ellas **diez armas**
—compartir hoja es la norma, no la excepción, igual que las seis armas de fuego
comparten la bala de la pistola desde el principio:

| Hoja | Qué es | Armas |
|---|---|---|
| `proyPilum` | punta pequeña, **caña de hierro** larga y asta gruesa | Pilum |
| `proyLanza` | hoja de laurel sobre fresno | Lanzas gemelas, Muro de lanzas |
| `proyVirote` | cabeza gorda, asta gruesa, plumas cortas | Ballista, Enfilada, Escorpión |
| `proyMetralla` | casco de hierro roto, con aristas | Metralla |
| `proyPiedra` | canto casi redondo | Honda balear |
| `proyRosa` | aguja de brújula en bronce | Rosa de los vientos |
| `proyLengua` | lengua de fuego | Lanzallamas |

Las tres primeras salen de **una sola función**, `Asta`, con otros números. Y
esa es la observación que las hace: lo que separa un pilum de una lanza y de un
virote no es el dibujo, son las PROPORCIONES. El pilum es una punta pequeña
sobre una caña de hierro larga y fina —la que se doblaba al clavarse y dejaba
inservible el escudo enemigo, que es la mitad de por qué el pilum es famoso—; la
lanza es una hoja ancha sobre madera; el virote es un tocho con plumas. Con la
silueta bien puesta se distinguen a diez píxeles.

La metralla y la piedra también son la misma función, `Trozo`, con otra
rugosidad: un casco de hierro tiene aristas y un canto de río no.

### Las tres que se quedan sin dibujo, y no es un hueco

**Rayo cruzado, Láser y Aspa de luz.** Son `rayoPerforante`: no disparan nada,
resuelven una línea y dejan el trazo dibujado. No hay proyectil al que ponerle
una imagen, y una hoja estirada a lo largo de un haz de 620 unidades sería un
sprite ampliado veinte veces — exactamente lo que §3.7 descartó para los
proyectiles pequeños, sólo que al revés.

Lo que sí tienen es barrido, grosor creciente con el nivel y, en el caso del
Aspa de luz, un giro de 20° al máximo. Su personalidad está ahí, no en un PNG.
