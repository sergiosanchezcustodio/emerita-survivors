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

## El búfer de pulsaciones (hecho)

`js/core/lockstep.js`. Las pulsaciones ya no entran directas en la simulación:
lo que se pulsa en el paso N se consume en el paso N+retardo. Esos fotogramas
son, cuando haya red, el tiempo que tiene el paquete del otro jugador para
cruzar. El stick se cuantiza a un byte por eje **antes** de entrar en la
simulación, porque por la red viaja un byte y no un flotante de 17 cifras: si
cada máquina redondeara al recibirlo, volveríamos al problema que resolvió
`mate.js`.

**El retardo por defecto es 4 (67 ms), y sale de una medición.** Sergio jugó con
0, con 2 y con 6 sin distinguir uno de otro. El género perdona: no hay saltos
que cronometrar ni disparos que apuntar. Cada fotograma que no se nota es margen
de red regalado, y 67 ms dan para jugar con alguien de otra ciudad sin
predicción ni rebobinado, que es la parte cara de esta arquitectura.

Se cambia en caliente con las teclas `,` y `.`, y el panel F3 dice en cuál está.
Con 0 se juega exactamente como antes de que existiera el búfer.

    EMERITA.determinismo.medirRetardo()   ¿el desfase real es el configurado?

Esa prueba existe porque "no noto diferencia" tiene dos explicaciones, y una es
que el búfer no esté haciendo nada. Cuenta en qué paso se mueve el personaje con
el stick a tope y lo compara con lo configurado.

## Lo que queda

1. **WebRTC y el código de conexión.** Intercambio manual de SDP, sin nada
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
