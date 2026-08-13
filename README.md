# Emerita Survivors

Survivors-like ambientado en la Extremadura romana. HTML5 Canvas 2D puro,
módulos ES6 nativos, cero dependencias externas. Empieza en Emerita Augusta
(Mérida); el plan es recorrer la región — Cáceres, Trujillo, Monfragüe,
Guadalupe, el puente de Alcántara — añadiendo un nivel a la vez.

## Ejecutar

```
python -m http.server 8000
```

Abrir `http://localhost:8000`. No hay paso de build: es JS servido tal cual.

## Aplicación de escritorio (Windows)

```
powershell -ExecutionPolicy Bypass -File herramientas\empaquetar.ps1
```

Deja en `dist/emerita-survivors-win64/` una carpeta con `Emerita Survivors.exe`
que funciona a doble clic en cualquier PC con Windows: sin navegador, sin
servidor y sin instalar nada. La primera vez descarga NW.js —Chromium
empaquetado como aplicación, 200 MB— y lo deja en caché; las siguientes tardan
segundos.

El código del juego NO se compila ni se toca: los mismos `index.html`, `js/` y
`assets/` que sirve el servidor local van tal cual dentro del ejecutable. Por eso
esto es una carpeta aparte y no una forma distinta de construir el proyecto.

**El resultado ocupa 520 MB y no entra en el repositorio**: una sola DLL de
Chromium pesa 297 y GitHub rechaza ficheros de más de 100 MB. Lo que se versiona
es el script; el ejecutable se genera cuando hace falta y se reparte como
release. Con `-Zip` sale además el comprimido listo para enviar (200 MB).

## Estado

Fases 1-8 del plan completas (`prompt-emerita-survivors.md`): movimiento y
combate, oleadas, armas y progresión, escenario con objetos sólidos y ancho
limitado, los tres jefes y presentación completa.

Y por encima del plan, lo pedido después: cooperativo local hasta cuatro
jugadores con reanimación, mascotas con niveles, tienda de tres secciones
—potenciadores, mascotas y jugadores—, ruleta en los cofres, resumen final por
jugador, música compuesta y esta aplicación de escritorio.
Perfilado en `js/sistemas/audio.js` § "Perfilado de rendimiento" más abajo.

## Arquitectura, en cuatro carpetas

- `js/core/` — motor: bucle de juego, entrada, cámara, RNG con semilla,
  carga de recursos, pool de objetos, spatial hash.
- `js/datos/` — **datos puros, cero lógica.** Bestiario, armas, pasivos,
  potenciadores, personajes, jefes y niveles. Todo lo que un balance nuevo
  necesita tocar vive aquí, nunca en `sistemas/`.
- `js/sistemas/` — la lógica que LEE esos datos: director de oleadas,
  colisiones, armas, progresión, jefes, audio.
- `js/entidades/` y `js/ui/` — las cosas que se mueven por pantalla y las
  que se dibujan encima.

## El contrato de un nivel

`js/datos/niveles/merida.js` exporta un único objeto `NIVEL`. Un nivel nuevo
es, en el caso ideal, copiar ese archivo y cambiar los valores — sin tocar
nada de `sistemas/` ni de `ui/`. La forma real (la que lee el código hoy, no
un boceto) es esta:

```js
export const NIVEL = {
  id: 'merida',                // clave interna: nombra el atlas de assets,
                                // 'merida-suelo.png', 'merida' + sprite, etc.
  nombre: 'Emerita Augusta',
  subtitulo: 'Las ruinas del Imperio',
  duracion: 1800,               // segundos que dura la partida (30 min)

  paleta: { arena: '#b99b6b', /* ... */ },      // colores del suelo procedural
                                                  // de emergencia (sin PNG)
  interfaz: {                                    // tema visual de menús: pausa,
    ornamento: 'romano',                         // derrota/victoria, subida de
    fondo: '#2b2e33', /* ... */                  // nivel — lo lee ui/tema.js
  },

  suelo: {                      // ui/... si no hay `imagen`, o si no carga,
    imagen: 'niveles/merida-suelo.png',   // el nivel sigue siendo jugable con
    variantes: 4, base: 'arena',          // el suelo procedural de `paleta`
    motas: ['arenaOscura', 'piedra', 'caliza'],
    densidadMotas: 42, grietas: 2
  },

  // Curva de oleadas: array de FUENTES. Cada una está viva entre `desde` y
  // `hasta` (segundos), suelta `cantidad` enemigos cada `cada` segundos con
  // un `patron` ('anillo' | 'linea' | 'oleada' | 'cerco' | 'individual'),
  // eligiendo el tipo al azar de `tipos`. Los ids de `tipos` son claves del
  // catálogo GLOBAL y COMPARTIDO en datos/enemigos.js — hoy no hay bestiario
  // por nivel; si Cáceres necesita un monstruo que Mérida no tiene, se añade
  // como entrada nueva a ese catálogo global.
  eventos: [
    { desde: 0, hasta: 120, patron: 'anillo', cada: 0.37, cantidad: 2,
      tipos: ['serpiente'] },
    // 'individual' es el patrón de los élites: entra UNA vez al abrir su
    // ventana, no cuenta contra el techo de densidad, y admite `aviso` (el
    // texto que anuncia un élite o un jefe al entrar).
    { desde: 300, hasta: 302, patron: 'individual', cada: 60, cantidad: 1,
      tipos: ['manticora'], aviso: 'MANTICORA' }
  ],

  // Techo de enemigos vivos a la vez, interpolado entre marcas — un freno de
  // rendimiento, no un objetivo de diseño. Sin marca para t > la última, se
  // queda en el valor de la última (ver `topeEn` en sistemas/director.js).
  densidad: [
    { t: 0, max: 90 },
    { t: 1200, max: 850 }
  ],

  // Vida y daño de cada enemigo se multiplican por 1 + factor * minutos al
  // aparecer. La velocidad NO escala nunca (bestiario ilegible si acelera).
  escalado: { vida: 0.11, danyo: 0.05 },

  // Momentos en los que entra un JEFE DE VERDAD, aparte del final (ver más
  // abajo). `jefe` es una clave dentro de `jefes`, así que el director
  // resuelve el tipo sin saber nada de Cerbero ni de la Loba.
  hitos: [
    { t: 600, texto: 'CERBERO', jefe: 'intermedio' }
  ],

  // Objetos sólidos del escenario (columnas, antorchas, estatuas, ruinas),
  // repetidos cada vez que el tile de suelo repite. Coordenadas LOCALES al
  // tile (0..ancho, 0..alto), no de mundo. `tipo` es un id del atlas de
  // objetos que procesa herramientas/procesar-assets.ps1.
  decoracion: [
    { tipo: 'columna', x: 186, y: 50 }
  ],

  // Los tres jefes del nivel. `intermedio`, `segundo` y `final` son claves
  // que apuntan a entradas de datos/jefes.js — ver el aviso importante más
  // abajo sobre qué significa reutilizar una de esas tres claves.
  jefes: { intermedio: 'cerbero', segundo: 'hidra', final: 'loba',
           escolta: 'gemelo', avisoFinal: 'LA LOBA CAPITOLINA' }
  // Sin campo `musica`: la Fase 7 sustituyó los ficheros de audio previstos
  // originalmente por síntesis procedural (sistemas/audio.js). No hay nada
  // que referenciar desde un nivel — el audio no depende del nivel en curso.
};
```

### Lo que NO es "solo copiar el archivo de datos" (todavía)

El contrato de arriba es real, pero hay dos sitios donde un nivel nuevo sí
obliga a tocar código, y conviene saberlo antes de prometer que Cáceres es
gratis:

1. **Los jefes tienen comportamiento a medida, no genérico.**
   `sistemas/jefes.js` reconoce por nombre exactamente tres tipos —
   `'cerbero'`, `'hidra'`, `'loba'`— y cada uno lleva su propia máquina de
   estados (fases, conos de fuego, veneno, furia...). Un nivel nuevo puede
   **reutilizar** cualquiera de los tres (con su propio nombre de aviso y
   sus propios números de escalado, vía `datos/jefes.js`) sin escribir una
   sola línea de lógica. Pero un jefe con un comportamiento genuinamente
   distinto —no una Loba con más vida, sino un enemigo que hace algo que
   ninguno de los tres hace hoy— necesita una función `actualizarNombre(...)`
   nueva en `sistemas/jefes.js`, siguiendo el mismo patrón que las tres que
   ya existen.

2. **El pipeline de assets está escrito para el nivel 1, no en bucle.**
   `herramientas/procesar-assets.ps1` espera el arte en
   `resources/stages/<n>/` (mapa, objetos de escenario, bestiario si trae
   ilustraciones propias) y hoy tiene las rutas de `stages\1\...` escritas a
   mano en sus tablas de configuración (`$SUELOS`, la lista de objetos del
   escenario, etc.). Añadir Cáceres implica **añadir sus propias entradas
   en esas tablas** (`stages\2\...` → `dst='niveles\caceres-suelo.png'`,
   etc.), no solo dejar caer los PNG en una carpeta y esperar a que el
   script los encuentre solo.

3. **Hoy solo se carga un nivel: no hay selector.** `js/main.js` importa
   `NIVEL` de un único sitio fijo (`import { NIVEL } from
   './datos/niveles/merida.js'`). Con un segundo archivo de datos ya
   escrito, jugarlo hoy es cambiar esa línea de import; construir un menú
   de selección de nivel de verdad es trabajo aparte, no incluido en el
   contrato de datos.

### Ejemplo comentado: añadir Cáceres como nivel 2

```js
// js/datos/niveles/caceres.js
//
// Copiado de merida.js y con los números cambiados. Mientras Cáceres
// reutilice el bestiario y los tres jefes existentes (solo con otro nombre
// y otra curva de escalado), esto es TODO lo que hace falta escribir aquí.

export const NIVEL = {
  id: 'caceres',
  nombre: 'Norba Caesarina',
  subtitulo: 'La ciudad amurallada',
  duracion: 1800,

  paleta: { /* ocres de la muralla, en vez de los de Mérida */ },
  interfaz: { /* mismo formato que merida.js, otra paleta */ },

  suelo: {
    imagen: 'niveles/caceres-suelo.png',   // sale de resources/stages/2/...
    variantes: 4, base: 'piedra',
    motas: ['piedraOscura', 'musgo'], densidadMotas: 38, grietas: 3
  },

  // Puede EMPEZAR copiando los eventos de Mérida tal cual y solo retocar
  // cadencias/cantidades: la curva ya está una vez validada jugando, y
  // reescribirla desde cero es tirar ese trabajo.
  eventos: [ /* ... */ ],
  densidad: [ /* ... */ ],
  escalado: { vida: 0.12, danyo: 0.05 },   // un pelín más duro que Mérida

  hitos: [
    { t: 600, texto: 'CERBERO', jefe: 'intermedio' }
  ],
  decoracion: [ /* columnas/estatuas medidas sobre caceres-suelo.png */ ],

  // Reutiliza los tres jefes SIN tocar sistemas/jefes.js: solo cambian el
  // nombre de aviso y los números de datos/jefes.js si se quiere que
  // pegue distinto que en Mérida.
  jefes: { intermedio: 'cerbero', segundo: 'hidra', final: 'loba',
           escolta: 'gemelo', avisoFinal: 'EL LOBO DE LA MURALLA' }
};
```

Para jugarlo: `herramientas/procesar-assets.ps1` necesita sus propias
entradas para `stages\2\...` (ver el aviso 2 de arriba), y `js/main.js`
necesita importar `NIVEL` desde `caceres.js` en vez de `merida.js` (aviso 3)
hasta que exista un selector de nivel de verdad.

## Perfilado de rendimiento

Objetivo del plan: 800 entidades activas a 60 fps (`ESCALA_ARTE` es la
válvula de escape si algún día no se sostiene — bajarla a 1 devuelve
rendimiento sin tocar una constante de balance).

Medido llenando el pool de enemigos a su capacidad máxima (1000/1000, por
encima del objetivo) con `E.avanzar(60)` desde la consola del navegador —
midiendo el paso de lógica en sí, no los fps que reporta la pestaña, que en
un navegador automatizado en segundo plano se acota artificialmente por
`requestAnimationFrame`:

```
1000/1000 enemigos activos → 5.91 ms de lógica por paso, 2.7 ms de render
```

Bien por debajo de los 16.6 ms que exige 60 fps, con margen de sobra. No
hizo falta ningún cambio de rendimiento en esta pasada.
