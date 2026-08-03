# PROMPT: "Emerita Survivors" — Nivel 1 (Mérida)

> Pega este documento completo como primer mensaje a un agente de código (Claude Code, Cursor, etc.).
> Está escrito para ser ejecutado por fases: pide que implemente la Fase 1 y valide antes de seguir.

---

## 1. Rol y objetivo

Actúa como un ingeniero de videojuegos senior especializado en motores 2D propios y optimización de rendimiento en navegador.

Vas a construir **Emerita Survivors**, un juego del género *survivors-like / bullet heaven* (referencia directa: *Vampire Survivors*), en **HTML5 + Canvas 2D puro**, sin motores ni librerías externas.

Esta entrega es una **demo de un solo nivel**: las ruinas romanas de Mérida (Extremadura, España), con una partida de **20 minutos** que termina con un jefe final.

El código debe estar preparado desde el primer día para que añadir niveles futuros (Cáceres, Trujillo, Monfragüe, Guadalupe, Alcántara) sea **crear un archivo de datos nuevo, nunca tocar la lógica del motor**.

---

## 2. Restricciones técnicas (no negociables)

- **Cero dependencias.** Nada de npm, bundlers, frameworks ni CDNs. Solo HTML, CSS y JavaScript con módulos ES6 nativos (`<script type="module">`).
- **Canvas 2D API únicamente.** Nada de WebGL ni WebGPU.
- Debe ejecutarse abriendo `index.html` con un servidor estático simple (`python3 -m http.server`), sin paso de compilación.
- **Objetivo de rendimiento: 60 fps estables con 800 entidades activas simultáneas** en un portátil de gama media. Este es un requisito de diseño, no una aspiración.
- Sin `localStorage` ni `sessionStorage` en esta fase: todo el estado vive en memoria.
- Código en español para nombres de dominio del juego (`enemigos`, `armas`, `oleadas`) e inglés para nombres técnicos genéricos (`pool`, `spawn`, `update`, `render`). Comentarios en español.

---

## 3. Arquitectura de archivos

```
/
├── index.html
├── css/estilos.css
└── js/
    ├── main.js              # arranque, bucle principal, gestión de estados
    ├── core/
    │   ├── bucle.js         # timestep fijo con acumulador
    │   ├── entrada.js       # teclado, gamepad, táctil (joystick virtual)
    │   ├── camara.js        # seguimiento del jugador con suavizado
    │   ├── pool.js          # object pool genérico reutilizable
    │   ├── rejilla.js       # spatial hash para colisiones
    │   ├── rng.js           # PRNG determinista con semilla (mulberry32)
    │   └── recursos.js      # carga de atlas e imágenes, con fallback
    ├── entidades/
    │   ├── jugador.js
    │   ├── enemigo.js
    │   ├── proyectil.js
    │   ├── zonaDanyo.js     # charcos, auras, trampas persistentes
    │   └── recogible.js     # gemas, cofres, curaciones
    ├── sistemas/
    │   ├── armas.js         # motor genérico de comportamientos de arma
    │   ├── progresion.js    # XP, subida de nivel, ofertas de mejora
    │   ├── director.js      # spawner y curva de dificultad
    │   ├── colisiones.js
    │   ├── particulas.js
    │   └── vfx.js           # números de daño, destellos, sacudida de cámara
    ├── datos/
    │   ├── armas.js
    │   ├── pasivos.js
    │   ├── enemigos.js
    │   └── niveles/
    │       └── merida.js    # TODO el contenido específico del nivel 1
    └── ui/
        ├── hud.js
        ├── menuNivel.js     # pantalla de elección de mejora
        └── pantallas.js     # título, pausa, victoria, derrota
```

**Regla de oro:** `merida.js` contiene tablas de datos puros (objetos y arrays). No contiene lógica. Si para añadir un nivel hay que tocar cualquier archivo fuera de `datos/niveles/`, el diseño está mal.

---

## 4. Bucle de juego y rendimiento

Implementa un **timestep fijo con acumulador**:

- Lógica a 60 Hz exactos (`DT = 1/60`).
- Renderizado desacoplado con interpolación alpha entre estados.
- Tope de 5 actualizaciones de lógica por frame (evita la espiral de la muerte tras un tirón).
- `requestAnimationFrame` para el render.

**Técnicas de optimización obligatorias:**

1. **Object pooling sin excepciones.** Enemigos, proyectiles, gemas, partículas y números de daño se preasignan y se reciclan. Cero `new` durante la partida, cero presión sobre el recolector de basura.
2. **Spatial hash** de celdas de 64px para colisiones. Nunca hagas comprobaciones N². Cada frame se limpia y repuebla reutilizando arrays existentes.
3. **Colisiones círculo-círculo** con distancia al cuadrado (nunca `Math.sqrt` en el chequeo).
4. **Culling agresivo:** enemigos a más de 1.5 pantallas de la cámara se devuelven al pool. Solo se dibuja lo que intersecta el viewport.
5. **Fusión de gemas:** si hay más de 150 gemas en el suelo, las más lejanas se fusionan en una de mayor valor. Evita el colapso por acumulación.
6. **Tintes precacheados:** el destello blanco/rojo al recibir daño se genera una vez por sprite en un canvas offscreen al cargar, nunca por frame.
7. **Ordenación por profundidad (eje Y)** con radix sort o inserción sobre array preasignado, no `Array.sort` con closure cada frame.
8. `ctx.imageSmoothingEnabled = false` — imprescindible para pixel art nítido.
9. **Resolución: lógica y arte van desacopladas.** El juego calcula en unidades de **480×270** — ahí viven todas las velocidades, radios, alcances y la celda de 64px del spatial hash. El canvas interno es de **960×540** y el arte está autorizado a `ESCALA_ARTE = 2`, escalado por múltiplos enteros al viewport (2× a 1080p, 4× a 4K). Un personaje de 32×32 lógicos es un PNG de 64×64.

   Separarlos permite subir el detalle del arte sin tocar una sola constante de balance. `ESCALA_ARTE` es la única constante implicada: si el perfilado de la Fase 8 no sostiene 800 entidades con 4× de área de relleno, bajarla a 1 devuelve el rendimiento sin recalcular nada.

Incluye un overlay de depuración conmutable con `F3`: fps, número de entidades activas, ms de update, ms de render, tamaño de pools.

---

## 5. Controles

- **WASD / flechas** para moverse. El ataque es **siempre automático** (regla del género).
- Joystick virtual táctil en la mitad izquierda de la pantalla en móvil.
- Gamepad: stick izquierdo.
- `ESC` pausa, `F3` depuración.
- El movimiento diagonal se normaliza (nada de ir un 41% más rápido en diagonal).

---

## 6. Jugador y progresión

**Estadísticas base:**

| Estadística | Valor inicial |
|---|---|
| Vida máxima | 100 |
| Velocidad | 85 px/s |
| Armadura | 0 (reducción plana de daño) |
| Regeneración | 0 /s |
| Radio de recogida | 40 px |
| Bonus de daño | 0% |
| Reducción de recarga | 0% |
| Bonus de área | 0% |
| Suerte | 0% (sesga las ofertas de mejora) |

**Personaje inicial:** *Aelia*, veterana emeritense. Arma inicial: **Pilum**.

**Curva de experiencia:** `xpNecesaria(n) = 5 + n*10` para n<20, luego `+13` por nivel hasta n=40, después `+16`. Deben caber unas 45–55 subidas de nivel en 20 minutos.

**Al subir de nivel:** el juego se pausa y se ofrecen **4 opciones** entre armas nuevas, mejoras de armas existentes y pasivos. Reglas:
- Máximo **6 armas** y **6 pasivos**. Con los slots llenos, solo se ofrecen mejoras de lo ya poseído.
- Un botón de **reroll** (3 usos por partida).
- Si no queda nada que ofrecer, se entrega oro o una curación.

**Invulnerabilidad tras golpe:** 0.5 s con parpadeo. El daño de contacto se aplica por tics, no por frame.

---

## 7. Armas (8 en la demo)

Cada arma tiene 8 niveles. El nivel 8 la deja lista para evolucionar.

| Arma | Comportamiento | Daño base | Recarga | Progresión por nivel |
|---|---|---|---|---|
| **Pilum** | Proyectil al enemigo más cercano | 10 | 1.2 s | +1 proyectil (niv. 3, 6), +daño, +perforación |
| **Gladius** | Arco de corte de 90° en la dirección de movimiento | 12 | 1.0 s | +ángulo, +alcance, +un segundo golpe |
| **Scutum** | Escudos orbitando al jugador | 15 | orbital | +escudos (1→5), +radio, +velocidad angular |
| **Tribulus** | Abrojos que caen y quedan como trampa 5 s | 8 | 3.0 s | +cantidad, +duración |
| **Fuego griego** | Charco incendiario, daño por tics | 5 / 0.4 s | 4.0 s | +radio, +duración, +charcos |
| **Ballista** | Proyectil horizontal perforante | 18 | 2.5 s | +perforación, +proyectiles, +velocidad |
| **Aquila** | Aura de daño constante alrededor del jugador | 3 / 0.4 s | continua | +radio, +daño, +empuje |
| **Rete** | Red que ralentiza un 50% y daña en área | 14 | 3.5 s | +área, +duración del freno |

**Implementación:** `armas.js` define un motor genérico con tipos de comportamiento (`proyectilDirigido`, `arcoMelee`, `orbital`, `trampaSuelo`, `zonaPersistente`, `proyectilLineal`, `auraPasiva`). Los datos de `datos/armas.js` solo parametrizan. Añadir un arma nueva debe ser añadir una entrada al array.

---

## 8. Pasivos (8 en la demo)

Máximo 5 niveles cada uno.

| Pasivo | Efecto por nivel |
|---|---|
| **Sandalias aladas** | +10% velocidad |
| **Lorica segmentata** | +1 armadura |
| **Anillo de Augusto** | +10% daño |
| **Clepsidra** | −8% recarga |
| **Corona de laurel** | +0.2 vida/s |
| **Antorcha votiva** | +12% área de efecto |
| **Piedra imán** | +25% radio de recogida |
| **Ánfora de vino** | +20 vida máxima (y cura esa cantidad) |

---

## 9. Evoluciones

Solo se obtienen abriendo un **cofre** dejado por un enemigo élite, teniendo el arma a nivel 8 y el pasivo requerido a nivel 1+.

| Arma nivel 8 | + Pasivo | = Evolución |
|---|---|---|
| Pilum | Anillo de Augusto | **Pilum de Júpiter** — el proyectil invoca un rayo en el impacto |
| Gladius | Lorica segmentata | **Gladius Hispaniensis** — corte de 360°, empuja enemigos |
| Scutum | Corona de laurel | **Testudo** — 6 escudos que destruyen proyectiles enemigos |
| Fuego griego | Antorcha votiva | **Incendio de Emerita** — los charcos se propagan al morir enemigos |
| Ballista | Clepsidra | **Escorpión** — disparo continuo, perforación infinita |

---

## 10. Enemigos

Estadísticas base a minuto 0. Escalado global: `multiplicadorVida = 1 + 0.09 × minuto`, `multiplicadorDaño = 1 + 0.04 × minuto`.

El bestiario se organiza por **rol**. La columna *Entra* es la ventana de **introducción**, no de retirada: cada rol sigue apareciendo después, re-ponderado a la baja. Si la masa desapareciera en el minuto 4 sería imposible sostener las densidades del minuto 16.

| Rol | Entra | Enemigo | Vida | Vel. | Daño | Sprite | Radio | Comportamiento |
|---|---|---|---|---|---|---|---|---|
| Masa | 0 | **Serpiente** | 6 | 68 | 2 | 14×20 | 6 | Persecución directa en enjambres de 20–30. Carne de cañón. |
| Masa | 1 | **Gárgola** | 10 | 52 | 3 | 38×20 | 7 | Vuela: ignora la decoración y resiste el empuje ligero. Anillos densos. |
| Base | 2 | **Legionario** | 28 | 38 | 5 | 16×26 | 7 | Guardián humano. Entra en formación (patrón `linea`). |
| Base | 3 | **Gladiador** | 34 | 46 | 6 | 24×24 | 8 | Guardián humano. Persecución agresiva en grupos de 8–12. |
| Rápido | 4 | **Arpía** | 18 | 92 | 4 | 26×22 | 8 | Vuela. Movimiento errático: deriva sinusoidal de ±35° sobre el vector de persecución. |
| Distancia | 6 | **Medusa** | 30 | 26 | 3 | 20×28 | 9 | Se detiene a 200px. Cono de petrificación: telegrafía 0.6 s, **ralentiza 60% durante 1.2 s**, recarga 3 s. |
| Tanque | 8 | **Cíclope** | 90 | 24 | 14 | 32×42 | 14 | Inmune al empuje. Lentísimo, daño de contacto brutal. |
| Tanque | 8 | **Minotauro** | 70 | 30→170 | 12 | 40×36 | 13 | Telegrafía 0.8 s y embiste en línea recta. |

Todas las medidas están en **unidades lógicas**; los PNG de `assets/` son el doble en píxeles (ver sección 4). Los anchos **no son estimaciones**: salen de medir la silueta real de cada ilustración una vez recortado el fondo, con la regla `ancho = par_más_cercano(alto × ratioSilueta)`. El alto lo fija el rol.

El **radio** es el del círculo de colisión, no el del sprite: `min(0.35 × alto, 0.45 × ancho)`, de modo que rozar un ala o un cuerno no cuente como impacto y que las siluetas estrechas —serpiente, legionario— no arrastren un círculo más ancho que ellas. El radio de separación *boid* de la sección 15 deja de ser un valor global de 18px y pasa a ser `radio × 1.6` por enemigo: con un valor único, los cíclopes se solaparían y las serpientes dejarían huecos.

**Élite (suelta cofre):**
- **Mantícora** — 500 vida, vel. 60, vuela. Sprite 42×52, radio 18. Cada 2.5 s dispara un abanico de 3 púas (daño 7). **Cofre garantizado al morir.** Primera aparición en el minuto 5 y después cada ~4 minutos: es la vía principal de las evoluciones.

**Jefes:**
- **Minuto 10 — Cerbero.** 3.500 vida. Sprite 88×86, radio 30. Aparece **solo**: se limpia la pantalla al invocarlo. Tres cabezas = tres fases, una por cada tercio de vida, y pierde una cabeza visiblemente al cambiar:
  1. *100–66%* — persecución simple y mordisco en cono corto.
  2. *66–33%* — las tres cabezas escupen conos de fuego alternos que dejan charcos 3 s.
  3. *33–0%* — encadena embestidas mientras invoca serpientes en tandas de 10.
- **Minuto 20 — Hidra.** 14.000 vida repartidas en **5 cabezas de 2.800**. Sprite 112×112, radio 39 (cada cabeza tiene además su propio círculo de 14 para poder apuntarlas por separado). Cada cabeza se ataca por separado. Al derribar una se abre una ventana de **8 s**: si dentro de ella no cae otra cabeza, la última derribada **revive con el 50%** de su vida. Es un control de DPS, no una carrera de aguante. Derrotar las cinco = victoria.

**IA:** persecución con separación tipo *boid* (radio 18px) para que no se apilen en un único punto. El empuje al recibir daño es proporcional al daño e inverso a la masa del enemigo.

---

## 11. Director de oleadas (20 minutos)

`director.js` lee un array de eventos con marcas temporales desde `merida.js`. Cada evento define: minuto de inicio, tipos de enemigo, patrón de aparición, cantidad y cadencia.

**Patrones de aparición requeridos:**
- `anillo` — distribución aleatoria en circunferencia fuera de cámara
- `linea` — muro de enemigos entrando por un borde (ideal para legionarios)
- `oleada` — grupo compacto desde una dirección
- `cerco` — rodean al jugador por los cuatro lados a la vez
- `individual` — élites y jefes

**Curva propuesta:**

| Minuto | Contenido |
|---|---|
| 0–2 | Serpientes en anillo. Densidad baja (~40). Enseña a moverse. |
| 2–4 | + gárgolas y primeros legionarios en línea. |
| 4–6 | + gladiadores y arpías. Primera presión de velocidad. Primera **Mantícora** (min. 5). |
| 6–8 | + medusas. Introduce la amenaza a distancia y el control de movimiento. |
| 8–10 | + cíclopes y minotauros. Densidad ~250. Tensión creciente. |
| **10** | **JEFE: Cerbero.** Se limpia la pantalla, música cambia. |
| 10–13 | Todo lo anterior en patrón `cerco`. Segunda **Mantícora**. |
| 13–16 | Enjambres masivos de serpientes y arpías. Densidad ~450. |
| 16–19 | Mezcla total, oleadas superpuestas. Densidad ~700. Dos Mantícoras. |
| **19–20** | **JEFE FINAL: Hidra.** |

Añade un evento cada 2 minutos de **serpiente dorada** (variante tintada de la serpiente: rápida, huye del jugador, suelta cofre al morir): es la segunda vía de las evoluciones, además de la Mantícora. Al ser una variante de color no necesita arte propio.

---

## 12. Recogibles y economía

- **Gemas de XP:** azul (1), verde (5), roja (25), dorada (100). Vuelan hacia el jugador dentro del radio de recogida con aceleración creciente.
- **Denarios:** moneda, contador para futura meta-progresión (solo se muestra en el resumen final).
- **Cofre:** otorga evolución si se cumplen los requisitos; si no, 1–3 mejoras aleatorias.
- **Ánfora de agua:** cura 30 de vida.
- **Águila caída:** imán, atrae todas las gemas del mapa.
- **Antorcha:** daña a todos los enemigos en pantalla en un 60% de su vida.

---

## 13. Ambientación y arte — Nivel 1: Emerita Augusta

**Escenario:** las ruinas romanas de Mérida al atardecer. Terreno base de arena del anfiteatro y losa de piedra, con elementos decorativos dispersos: columnas rotas, gradas, arcos, mosaicos desgastados, cipreses. El mapa es **infinito con scroll toroidal** (el fondo se repite en tiles de 32×32px sin costuras visibles).

**Paleta:** ocres, arena tostada, piedra caliza, mármol blanco roto, verde oliva oscuro y acentos en rojo púrpura imperial. Cielo cálido de atardecer extremeño.

**Estilo gráfico obligatorio: pixel art moderno de alta resolución** — referencia *Dead Cells*, *Blasphemous*, *Hyper Light Drifter*. Paletas amplias, luz de borde, sombreado suave. **Explícitamente NO es estética 8-bit ni 16-bit.**

**Especificación de sprites** (respétala exactamente; los assets se generarán aparte):

**Personajes jugables — todos al mismo tamaño.** Los cuatro comparten marco de 32×32 y 4 frames (idle 2, andar 2), sin excepción: el motor asume una única caja para el jugador y el HUD, y una Vicky más ancha que un Eric obligaría a casos especiales en cámara, sombra y colisión. Las fuentes tienen proporciones muy dispares (Eric 0.55:1, Lucy y Sara 1.20:1, Vicky 1.78:1), así que hay que **recomponer cada una dentro del marco común**, no reescalarla: se recorta a la figura y se centra sobre la línea de pies.

| Personaje | Tamaño | Frames |
|---|---|---|
| Eric, Lucy, Sara, Vicky | 32×32 | 4 (idle 2, andar 2) |

**Enemigos — cada uno a su tamaño.** Las medidas salen de la sección 10 y respetan la silueta de cada bestia: una serpiente no ocupa lo que un cíclope, y una gárgola con las alas abiertas es apaisada, no cuadrada.

| Enemigo | Lógico | Físico (PNG) | Frames |
|---|---|---|---|
| Serpiente | 14×20 | 28×40 | 1 |
| Gárgola | 38×20 | 76×40 | 1 |
| Legionario | 16×26 | 32×52 | 1 |
| Gladiador | 24×24 | 48×48 | 1 |
| Arpía | 26×22 | 52×44 | 1 |
| Medusa | 20×28 | 40×56 | 1 |
| Minotauro | 40×36 | 80×72 | 1 |
| Cíclope | 32×42 | 64×84 | 1 |
| Mantícora (élite) | 42×52 | 84×104 | 1 |
| Cerbero (jefe) | 88×86 | 176×172 | 1 |
| Hidra (jefe final) | 112×112 | 224×224 | 1 |

| Resto | Lógico | Físico | Frames |
|---|---|---|---|
| Iconos de arma/pasivo | 24×24 | 48×48 | 1 |
| Gemas y recogibles | 12×12 | 24×24 | 1 |
| Tiles de suelo | 32×32 | 64×64 | 1 |

**Animación con un solo frame.** Las fuentes son ilustraciones estáticas, así que el movimiento se genera por código: *squash & stretch* sobre el eje Y, balanceo lateral e inclinación en función de la velocidad. Es la misma filosofía que el plan ya aplica a proyectiles y partículas, no cuesta un byte de arte y da mejor sensación de peso que dos frames mal interpolados. Cuando existan animaciones reales, subir `frames` en el atlas basta para que el motor las use sin tocar código.

Como los sprites dejan de tener un tamaño uniforme, el atlas guarda por entidad `{ w, h, anclaX, anclaY, frames }`. El ancla es **el centro de los pies**, no el centro del rectángulo: es lo que hace que la ordenación por eje Y y el punto de impacto coincidan entre bichos de alturas distintas, y el punto desde el que se aplica el *squash & stretch* para que la figura se aplaste contra el suelo en vez de flotar.

**Generación de los assets.** `herramientas/procesar-assets.ps1` convierte las ilustraciones de `resources/` en los sprites de `assets/` más `assets/atlas.json`. Es utillaje offline: se ejecuta a mano, produce PNG y JSON planos, y no forma parte del juego, así que la regla de cero dependencias queda intacta. Verificación visual en `herramientas/hoja-contacto.html`.

Todos los sprites miran a la **derecha**; el volteo horizontal se hace por código. **Sin sombra bajo las entidades**: se probó la elipse procedural y ensucia la lectura con la pantalla llena de bichos.

**Los proyectiles, explosiones, charcos de fuego, auras y partículas NO usan sprites**: se dibujan por código con formas, gradientes y `globalCompositeOperation = 'lighter'`. Rinden mejor y se ven mejor que un sprite escalado.

**Sistema de placeholders (crítico):** el juego debe ser **100% jugable sin ningún asset de imagen**. Si el atlas no carga, `recursos.js` genera automáticamente sprites de sustitución: formas geométricas de colores distintivos por tipo de enemigo, con la silueta correcta. Esto permite iterar el balance sin bloquearse esperando arte. Sustituir los placeholders por PNGs reales debe ser dejar los archivos en `assets/` sin tocar código.

---

## 14. Interfaz

- **Barra de XP** superior a todo el ancho, con el número de nivel.
- **Cronómetro** centrado arriba (formato `MM:SS`).
- **Barra de vida** flotante bajo el jugador.
- **Fila de iconos** de armas y pasivos en la esquina inferior izquierda, con puntitos de nivel.
- **Contador de enemigos eliminados** y denarios, esquina superior derecha.
- **Números de daño flotantes** (pooled, con desvanecimiento, críticos en amarillo más grande).
- **Barra del jefe** a lo ancho de la parte inferior durante los combates de jefe.
- **Pantalla de subida de nivel:** 4 tarjetas con icono, nombre, descripción del efecto y comparativa numérica (`Daño 10 → 13`). Navegable con teclado y ratón.
- **Pantalla final:** tiempo sobrevivido, nivel alcanzado, bajas, arsenal final, denarios.

Tipografía con carácter romano-lapidario, pero **sin serifas finas** que se emborronen a resolución baja.

---

## 15. Audio

Implementa un `gestorAudio` con **Web Audio API**, tolerante a la ausencia de archivos (si no hay assets, silencio, nunca un error). Necesitamos: golpe, muerte de enemigo, daño al jugador, recogida de gema, subida de nivel, apertura de cofre, aviso de jefe, música de fondo con variante para jefes. Aplica un pequeño *pitch shift* aleatorio (±8%) a los sonidos repetitivos para evitar la fatiga auditiva, y un límite de instancias simultáneas por sonido.

---

## 16. Extensibilidad para los niveles siguientes

El proyecto es el primero de una serie recorriendo Extremadura. `datos/niveles/merida.js` debe exportar un objeto con esta forma exacta, de modo que Cáceres, Trujillo, Monfragüe, Guadalupe o el puente de Alcántara sean archivos gemelos:

```js
export const NIVEL = {
  id: 'merida',
  nombre: 'Emerita Augusta',
  subtitulo: 'Las ruinas del Imperio',
  duracion: 1200,              // segundos
  paleta: { ... },
  tilesSuelo: [ ... ],
  decoracion: [ ... ],
  enemigos: { ... },           // referencias al catálogo global + variantes locales
  eventos: [ ... ],            // el director de oleadas
  jefes: { intermedio: '...', final: '...' },
  musica: { ambiente: '...', jefe: '...' }
};
```

Documenta este contrato en un `README.md` con un ejemplo comentado de cómo añadir el nivel 2.

---

## 17. Criterios de aceptación

La demo está terminada cuando:

1. Se abre `index.html` y se juega sin errores en consola.
2. Se mantienen 60 fps con 800 enemigos en pantalla (verificable con `F3`).
3. Una partida completa de 20 minutos es ganable y perdible: la dificultad es real pero justa.
4. Las 8 armas y los 8 pasivos funcionan y son visiblemente distintos entre sí.
5. Las 5 evoluciones son obtenibles mediante cofres.
6. Ambos jefes funcionan con sus fases descritas.
7. El juego es jugable de principio a fin **con placeholders generados**, sin ningún PNG.
8. Añadir un enemigo o un arma nuevos no requiere tocar nada fuera de `datos/`.
9. Funciona con teclado, gamepad y táctil.
10. Con la misma semilla de RNG, dos partidas producen las mismas oleadas (reproducibilidad para depurar el balance).

---

## 18. Orden de implementación

Implementa **por fases y detente al final de cada una** para que pueda probarlo antes de continuar.

- **Fase 1 — Esqueleto.** Canvas, bucle con timestep fijo, cámara, jugador móvil, fondo tileado, overlay F3. *Validación: un cuadrado se mueve fluidamente sobre suelo repetido.*
- **Fase 2 — Enemigos y colisiones.** Pool, spatial hash, persecución con separación, daño de contacto, culling. *Validación: 500 enemigos persiguiendo a 60 fps.*
- **Fase 3 — Combate.** Motor de armas, Pilum y Gladius, proyectiles, muerte de enemigos, números de daño, partículas.
- **Fase 4 — Progresión.** Gemas, XP, subida de nivel, pantalla de 4 opciones, las 8 armas y 8 pasivos completos.
- **Fase 5 — Director.** Curva de oleadas de 20 minutos, patrones de aparición, escalado, élites y cofres.
- **Fase 6 — Jefes.** Los dos jefes con sus fases y barra de vida.
- **Fase 7 — Presentación.** HUD completo, menús, audio, sacudida de cámara, destellos, pulido de feedback.
- **Fase 8 — Optimización y balance.** Perfilado, ajuste de la curva de dificultad, `README.md` con el contrato de niveles.

**En cada fase, prioriza el *game feel*:** sacudida de cámara al recibir daño, destello blanco en el impacto, pausa de un frame en golpes fuertes (*hitstop*), empuje de enemigos, gemas que aceleran al ser atraídas. En este género, la sensación táctil pesa más que cualquier número.