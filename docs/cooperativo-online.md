# Cooperativo online: dónde estamos

Última actualización: 26 de agosto de 2026.

El plan es **lockstep**: por la red viajan solo las pulsaciones, y cada máquina
simula la partida entera por su cuenta. Es lo que permite jugar sin servidor y
con tráfico ridículo, pero exige una cosa que no se negocia: que dos máquinas
produzcan **exactamente la misma partida**, bit a bit, durante media hora. Un
bit de diferencia en el segundo diez es una partida distinta en el veinte.

Esta fase iba de comprobar si eso era posible. **Lo es, y ya está comprobado.**

## Qué está hecho

**Matemáticas deterministas** (`js/core/mate.js`). ECMAScript especifica al bit
`+ - * /` y `Math.sqrt`, pero de `sin`, `cos`, `atan2`, `hypot` y `exp` solo
dice que devuelvan "una aproximación dependiente de la implementación". Medido:
V8 y SpiderMonkey coinciden en `sqrt` y difieren en todas las demás. `mate.js`
las reimplementa usando solo las operaciones que el estándar clava, así que el
resultado es idéntico en todas partes por construcción. 135 llamadas
sustituidas; fuera de `js/ui/`, que es dibujo puro, no queda ninguna nativa.

Peor error contra el `Math` del motor: 2 ULP. Entre un 11% y un 21% más lento,
sobre 5,9 ms de los 16,6 disponibles por fotograma.
Se comprueba con `node herramientas\probar-mate.js`.

**Cinco fugas de estado entre partidas**, todas de la misma familia: cosas que
viven en el módulo y no en la partida, así que nacen con la pestaña y sobreviven
a `volverAlMenu`.

- `Obstaculos` no se reiniciaba. **Este se veía jugando**: de la segunda partida
  en adelante el mapa salía pelado, sin las antorchas ni los enemigos colocados
  en la decoración.
- Las ranuras de mascota conservaban nueve campos de la partida anterior.
- Tres contadores de módulo: sellos orbitales (`armas.js`), haces (`vfx.js`) y
  el registro de filas ya pobladas de los obstáculos.

## Cómo se comprueba

Desde la consola del navegador, con el juego cargado:

    EMERITA.determinismo.repetir()      la misma partida dos veces aquí
    EMERITA.determinismo.contraste()    pools limpios contra pools sucios
    EMERITA.determinismo.firmar()       huella para comparar con otro navegador
    EMERITA.huellaMotor()               qué funciones de Math difieren

`contraste()` es la que retrata el caso real: compara una partida con los pools
recién puestos a cero contra la misma partida con los pools sucios de haber
jugado. Eso es literalmente lo que pasa online, donde uno acaba de abrir el
juego y el otro lleva tres partidas.

Para el caso que ninguna otra cubre —¿cambia algo por haber jugado antes?— hay
un ciclo de tres pasos, porque hace falta una partida de verdad en medio:

    1. Recargar la página.   EMERITA.determinismo.guardarInstantanea()
    2. Jugar una partida entera y volver al menú.
    3.                       EMERITA.determinismo.compararInstantanea()

Las pruebas juegan **sin el progreso guardado** —sin mejoras, sin mascota, sin
héroes— y lo devuelven al terminar. Sin eso, dos máquinas comparan partidas que
no son la misma, porque las mejoras compradas con denarios cambian la vida y el
daño. Mientras dura una prueba, `MetaProgreso.guardar()` no escribe.

## Lo que queda

1. **Bucle de lockstep local.** Separar pulsaciones de simulación y meter un
   retardo de entrada de 2-3 fotogramas. Sin red todavía: si esto no se siente
   bien con un jugador, con dos tampoco. Es el paso que decide si el enfoque
   vale, porque el retardo es lo único que el jugador nota.
2. **WebRTC y el código de conexión.** Intercambio manual de SDP, sin nada
   externo (decisión de Sergio). En el saludo tienen que viajar dos cosas:
   - **La versión del juego.** Dos máquinas con distinta versión divergen. En
     cuanto se publique una actualización con alguien jugando, pasa.
   - **El progreso meta de cada jugador.** Que uno tenga más mejoras que otro no
     rompe el lockstep; lo que lo rompe es que su máquina no sepa cuáles son.
3. **Reconciliación y desconexiones.**

## Dos cosas aprendidas que conviene no olvidar

**Cada fallo estaba justo en lo que se había decidido no medir.** Los obstáculos
quedaron fuera de la firma por parecer decoración, y resultaron aparecer
enemigos. El caso de "haber jugado antes" no lo veía ninguna prueba porque todas
comparaban dos pasadas igual de sucias. Y la rama por la que la horda entra
sesgada no se ejecutó ni una vez en 3600 fotogramas, porque el guion de
pulsaciones cambiaba de dirección cada fotograma y la cámara temblaba en el
sitio en vez de avanzar: un `ReferenceError` que tumbaba el juego pasó limpio
por toda la batería y apareció jugando a mano. La pregunta útil no es "¿pasa la
prueba?" sino "¿qué no está mirando la prueba?".

**Un fallo que se cura solo no es un fallo de la simulación.** Cuando la huella
divergía en dos puntos y volvía a coincidir en los siguientes, la explicación no
podía ser que el mundo se hubiera separado —eso no se arregla— sino que la
medición estaba mirando algo con vida corta que no afectaba a nada. Eran las
partículas.
