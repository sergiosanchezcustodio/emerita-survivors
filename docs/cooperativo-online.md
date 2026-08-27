# Cooperativo online: dónde estamos

Última actualización: 27 de agosto de 2026.

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

**Ese 4 es solo el valor de arranque**: en cuanto se abre una conexión, el juego
mide el viaje y lo pone en lo que pida esa red. Ver más abajo, "El retardo de
entrada, puesto solo".

    EMERITA.determinismo.medirRetardo()   ¿el desfase real es el configurado?

Esa prueba existe porque "no noto diferencia" tiene dos explicaciones, y una es
que el búfer no esté haciendo nada. Cuenta en qué paso se mueve el personaje con
el stick a tope y lo compara con lo configurado.

## La conexión (hecha, sin integrar todavía)

`js/red/`. Tres piezas: `codigo.js` comprime la descripción de conexión,
`conexion.js` maneja WebRTC y `consola.js` es el mando a distancia mientras no
haya pantallas.

**La señalización sois vosotros.** WebRTC tiene un problema de huevo y gallina:
para hablarse, los dos navegadores tienen que intercambiar antes una descripción
de cómo encontrarse, y todavía no pueden hablarse. Normalmente lo resuelve un
servidor intermediario. Aquí el intermediario es el chat que ya usáis: el
anfitrión genera un código, lo manda por WhatsApp o Discord, el otro responde
con el suyo. Dos mensajes.

    ANFITRIÓN                          INVITADA
    EMERITA.red.invitar()
    (manda el código)          --->    EMERITA.red.responder('...')
                               <---    (devuelve el suyo)
    EMERITA.red.aceptar('...')

El código va comprimido a propósito. Un SDP crudo son entre 1000 y 3000
caracteres; comprimido se queda en 200-300, que cabe en un mensaje. Se
conservan solo ufrag, contraseña, huella del certificado, rol DTLS y candidatos
—el resto es siempre igual y se reconstruye en el otro lado—. Se comprueba con
`node herramientas\probar-codigo.js`, sobre SDPs reales de Chrome y de Firefox.

**Dos canales.** `control` es fiable y ordenado: el saludo, la versión, el
progreso meta, "empezamos". `juego` no es ni fiable ni ordenado, y así tiene que
ser: reintentar la pulsación de hace 200 ms no sirve de nada, porque cuando
llegara ese paso ya se habría jugado. Lo que se hará en su lugar es meter las
últimas N pulsaciones en cada paquete, de modo que perder uno no se note.

    EMERITA.red.autoprueba()   monta las dos puntas en esta misma página
    EMERITA.red.latencia()     ida y vuelta, y cuántos fotogramas pide

**Comprobado entre Edge y Firefox**, dos ventanas de la misma máquina: código de
298 caracteres, dos mensajes, canales abiertos, 1,4 ms de ida y vuelta. Ese 1,4
es el suelo del sistema y no una medida de red — no sirve para elegir el retardo,
solo para saber que el canal responde.

### Dos cosas que ya costaron tiempo, para no volver a pagarlas

**Confundir los dos códigos es EL error de este flujo**, y el síntoma era mudo:
la conexión no se abre y no hay pista. El tipo va dentro del propio código y se
lee sin conectar nada —quien invita pone rol DTLS `actpass`, quien responde ya
elige—, así que ahora `responder()` y `aceptar()` lo comprueban antes de tocar
WebRTC y dicen qué código es y quién tiene que pegarlo.

**Un `failed` de WebRTC no es definitivo.** Chrome lo anuncia y se recupera unos
cientos de milisegundos después: pasa con los candidatos mDNS —los nombres
`.local` con los que esconde la IP de casa— porque el primer par de direcciones
se descarta mientras el nombre todavía se resuelve. Se le da un margen de cuatro
segundos antes de creérselo. Si algún día alguien "arregla" esto quitando el
margen, volverá el mensaje de fracaso justo antes del de conexión.

### Servidores STUN: encendidos

Detrás de un router, tu ordenador **no conoce su propia dirección pública**, y
sin ella el otro extremo no tiene adónde llamar. Un servidor STUN resuelve eso:
se le pregunta una sola cosa, "¿con qué dirección me ves?", y contesta.

Decisión de Sergio, tomada el 26 de agosto de 2026: **se usan**. Es lo que
convierte esto de "dos ordenadores de la misma casa" a "dos casas cualesquiera".

Lo que conviene tener claro sobre ese trato:

- **Nada del juego pasa por ahí.** No es un servidor de partida: las pulsaciones
  van de casa a casa directamente. Solo se le habla durante los segundos en que
  se genera el código.
- **Tu IP queda vista por ese servidor.** Es inherente a preguntar, no de esta
  implementación.
- **Hay dos, de dueños distintos** (Google y Cloudflare). Si uno no contesta, el
  otro responde. Si no contestara ninguno, no se rompe nada: se acaba con
  direcciones solo locales, o sea con lo que había antes de esta decisión.
- **Los NAT simétricos siguen sin funcionar.** Son típicos de algunas conexiones
  móviles. Ahí hace falta un servidor que RELE todo el tráfico (TURN), y eso ya
  es infraestructura de verdad con su coste mensual. Queda fuera del alcance.

El código dice ahora cuántas direcciones ha conseguido y de qué clase, y avisa
si no hay ninguna pública — porque el síntoma de quedarse sin ella no aparece
hasta que el otro lleva un minuto esperando a que conecte algo que no va a
conectar.

Se apagan poniendo `EMERITA.red.servidores = []`.

**Comprobado el 26 de agosto de 2026**: el código pasa de 298 a 355 caracteres y
trae 1 dirección pública y 2 locales. Sigue cabiendo en un mensaje.

Y un aviso para quien lo use: **el código lleva dentro tu IP pública en claro**.
El base64 no es cifrado. Es inherente a WebRTC —para que alguien te llame
directamente tiene que saber tu dirección—, no de esta implementación. Mandárselo
a alguien por un chat es como darle tu teléfono; publicarlo en un foro, no.

### Lo que TODAVÍA no está probado

    EMERITA.red.camino()

Dice por dónde va la conexión de verdad: `local`, `publica` o `relevada`. Hasta
hoy solo ha dicho **local**, porque las pruebas han sido entre dos ventanas de la
misma máquina y ahí ICE ni toca la dirección pública.

O sea que **el camino entre dos casas sigue sin probarse**. Que el código traiga
una dirección pública solo demuestra que el STUN contestó. La prueba de verdad es
esa orden diciendo `publica`, con los dos jugadores en sitios distintos.

## Las pulsaciones por la red (hecho)

`js/core/lockstep.js` guarda y transporta; `js/red/sincro.js` junta la conexión
con el búfer y vigila que los dos mundos sigan siendo el mismo.

**El paquete son 42 bytes** —2,5 KB/s a 60 Hz— y lleva las SEIS últimas
pulsaciones, no solo la del paso en curso. Eso sustituye a reintentar, que en
tiempo real no sirve: cuando llegara el reenvío, ese paso ya habría que haberlo
jugado. Medido perdiendo uno de cada tres paquetes: las dos puntas consumen lo
mismo y nadie espera.

**Si falta la pulsación de alguien, el mundo se para.** Eso es lo que se ve como
"lag" en un juego así: no es lentitud, es la partida esperando a saber qué hizo
el otro. Inventársela sería jugar otra partida.

**Cada paquete dice además por dónde va quien lo manda**, y el otro repite desde
ahí. Sin eso, bastaba que una punta se parase más de seis pasos —un tirón de
red, una pausa del recolector, cambiar de pestaña— para que los dos se
bloquearan PARA SIEMPRE, con las pulsaciones existiendo en la memoria de
enfrente y sin forma de pedirlas.

**La carta que se elige al subir de nivel va por el canal fiable**, no por el
búfer: el menú para el mundo, así que mientras está abierto el reloj de pasos no
avanza y el búfer no fluye. Las dos máquinas abren el menú en el mismo paso y
aplican el mismo índice; quien no es su dueño lo ve y no lo toca.

**Los atajos de prueba se apagan en red.** Todos cambian la simulación en una
sola máquina.

**Cada jugador con SUS mejoras.** El anfitrión pide el progreso del otro antes
de empezar —y si no llega, no empieza—, los dos viajan en el saludo y cada
máquina crea a cada jugador con el suyo. Solo viaja lo que cambia estadísticas:
potenciadores y niveles de mascota. Ni denarios, ni héroes, ni tiempos.

Que uno lleve más mejoras que el otro no rompe el lockstep; lo que lo rompía era
que su máquina no lo supiera. Medido: 128,8 de vida máxima contra 85, y las dos
máquinas viendo los mismos dos números.

### Cómo se comprueba, ya sin jugar a mano

    node herramientas\probar-lockstep.js          el búfer, con un canal que se maltrata
    node herramientas\probar-sincro.js            las dos puntas, sin WebRTC
    node herramientas\probar-partida-en-red.js 60 el juego entero, dos pestañas de verdad
    node herramientas\probar-firma-arsenal.js       ¿la firma ve el arsenal, campo a campo?

La última abre dos pestañas en un Chromium, las conecta con el mismo baile de
códigos que harían dos personas y juega. Con `maraton` de segundo argumento, los
jugadores no mueren y se llega más lejos.

**Última medida: 68.567 pasos —diecinueve minutos, una partida entera— con las
dos puntas terminando en el MISMO paso, cero desincronización y esperas de 4
fotogramas como mucho.** Con el cíclope, los jefes intermedios y la llegada del
jefe final por el camino.

### LA desincronización de verdad: el sismo del cíclope

`camara.izquierda` y `camara.arriba` salían de `xVista`/`yVista`, la posición
interpolada para **pintar**, que se calcula con lo que sobra en el acumulador
del bucle y por tanto depende de los fotogramas de cada máquina. Y el sismo del
cíclope elegía ahí el punto donde cae cuando le toca caer al azar:

    tx = camara.izquierda + rng() * ANCHO_LOGICO;

Las dos máquinas lo tiraban a sitios distintos. Como el cíclope aparece pasado
el minuto cinco, la partida aguantaba siempre lo mismo y se separaba siempre en
el mismo sitio.

**Los nombres cortos son ahora los de SIMULACIÓN**, y el dibujado usa
`izquierdaVista` / `arribaVista`. Es a propósito: si alguien se equivoca de
getter pintando, el error es de una fracción de píxel durante un fotograma; si
se equivoca simulando, dos partidas dejan de ser la misma. Que el descuido caiga
del lado barato.

Lo delató la tabla del detalle: un disparo QUIETO —`x` igual a `xPrev`, o sea
sin velocidad— cuya posición difería en la séptima cifra. Eso no es un fallo de
lógica, es un punto calculado de otra forma.

### Las cinco "desincronizaciones" que no lo eran

De las seis que se persiguieron, cinco no eran el motor separándose sino cosas
que se estaban comparando y no debían. Conviene tenerlas escritas porque todas
volverán a parecer un fallo del juego:

1. **El búfer de pulsaciones.** Los dos nunca coinciden: cada máquina lleva su
   futuro local y ha recibido del otro lo que le haya llegado.
2. **`xVista` / `yVista`.** Posición interpolada para dibujar; el factor sale de
   los fps de cada máquina.
3. **`relojGiro`, `giroTotal`, `animando`, `seleccion`.** La animación del menú
   de nivel, que avanza mientras el mundo está parado — justo el rato en que las
   dos máquinas dejan de ir a la vez.
4. **Los atajos de prueba.** La tecla L subía las armas en un solo lado.
5. **El banco de pruebas.** Pulsaba Enter a ciegas, así que al morir el equipo
   navegaba los menús y arrancaba partidas NUEVAS: lo medido después era de otra
   partida, con otro personaje.

Todas se parecían a un fallo del motor. Ninguna lo era. La pregunta útil ante
una desincronización es "¿esto que comparo es de verdad la simulación?".

### El hueco del arsenal, cerrado

**El arsenal no entraba en la firma**, y era el hueco más incómodo que quedaba.
`mezclarLista` solo mezcla los campos numéricos de un objeto y un arsenal es un
objeto con una lista dentro: se caía por el borde sin que nadie lo decidiera.
Dos máquinas con armas distintas no se veían directamente, solo de rebote —
cuando los proyectiles ya llevaban un rato divergiendo. Y es justo el estado que
sincroniza el mensaje de la carta elegida, o sea lo más delicado del montaje.

Ahora entra, y entra **entero**: no `id` y `nivel`, que era la versión corta y
seguía dejando fuera lo único que se mueve de verdad.

- **El estado vivo de cada arma.** El `temporizador` decide EN QUÉ PASO dispara;
  dos máquinas con el mismo arsenal y un temporizador desfasado disparan en
  pasos distintos, que ya es otra partida. Con él van los golpes encadenados
  pendientes, el ángulo y el reloj de los orbitales y la fase del giro.
- **Las `stats`**, que es donde vive el daño y lo que separa un arma de nivel 3
  de la misma arma evolucionada.
- **Los tajos y los rayos.** Parecen dibujo y no lo son: `disparos.barrer` los
  lee para decidir si una púa de medusa se deshace al cruzarlos, así que un tajo
  vivo aquí y muerto allí es un proyectil enemigo que allí sobrevive y aquí no.
  Se firma el búfer entero, doce ranuras, porque el orden en que se reutilizan
  también es estado.

Se mezclan **todas las claves** del objeto en vez de una lista escrita a mano.
Es a propósito: la lista escrita a mano es exactamente cómo se abrió este hueco,
y así un campo nuevo entra en la firma el día que alguien lo añada, sin acordarse
de esto.

**Y la foto también lo trae**, que es la otra mitad. Cuando la firma señalaba a
los arsenales, `_pedirFoto` pedía por la red un grupo que la foto no producía: la
respuesta llegaba vacía y el rastro se perdía justo cuando iba a servir. Ahora
`arsenales` es un grupo como los demás —una fila por arma, con las `stats`
aplanadas con prefijo `s_` porque la tabla de diferencias compara un solo nivel
de profundidad— y está en los grupos que se vigilan mientras se juega. Cabe: son
cuatro jugadores por seis armas como mucho, nada que ver con los cientos de
enemigos que dejaron a los enemigos fuera.

    node herramientas\probar-firma-arsenal.js

Esa prueba no comprueba que dos partidas coincidan —de eso ya va la de red— sino
lo contrario: toca un campo a mano, vuelve a firmar y exige que el componente
`arsenales` cambie **y que ningún otro se mueva**. Veinte campos, uno a uno.
Porque una firma que no mira un campo no avisa de nada y no avisa en silencio:
la partida se separa media hora después por otro sitio y ya no hay de dónde
tirar.

## Hasta cuatro jugadores, en estrella

Cada invitado habla solo con el anfitrión y él reenvía. **Malla no**: con
señalización a mano, cuatro jugadores en malla son seis intercambios de código
pegados de uno en uno.

Se reenvían dos cosas y por caminos distintos: las **pulsaciones** por el canal
no fiable —los mismos bytes, sin mirarlos: quien no sea el destinatario los
descarta solo— y por el fiable lo que TIENE que saber todo el mundo: **la carta
elegida al subir de nivel** y **lo que se hace con un cofre**. Las huellas y las
peticiones de detalle no se reenvían: son conversaciones de dos.

Los dos últimos costaron una partida cada uno:

- Con 3-4, la partida **se bloqueaba al subir de nivel**. La carta de un
  invitado solo llegaba al anfitrión; los demás no cerraban su menú nunca y,
  como el mundo espera a todos, se paraba todo. Con dos es invisible: el
  anfitrión ES el otro.
- **El cofre había que cerrarlo cuatro veces.** Todos lo ven, pero solo lo
  cierra quien lo cogió — y viaja QUÉ ha hecho, porque la primera pulsación
  termina el giro de las ruletas en vez de cerrar.

La regla que sale de los dos: **todo lo que para el mundo y es entrada del
jugador tiene que ir por el canal fiable**, porque justamente mientras el mundo
está parado el búfer de pulsaciones no fluye.

    node herramientas\jugar-en-red.js 4      cuatro ventanas ya conectadas, para mirar
    node herramientas\probar-partida-en-red.js 120 nada 4

Medido: cuatro pestañas en la misma máquina a 56 pasos por segundo, sin
divergencia y a cuatro pasos como mucho unas de otras.

## La entrada desde el menú del título (hecha)

Durante un tiempo al cooperativo solo se entraba con la tecla `O` desde la
pantalla de personajes, y no por gusto: **las opciones de la lápida vienen
pintadas en la ilustración**, así que añadir una al título era repintar el arte,
no tocar código. La pantalla de personajes se dibuja por código y admitía una
más sin repintar nada.

Sergio repintó la lámina el 27 de agosto de 2026: **JUGAR EN RED**, segundo
renglón, y de paso START pasó a JUGAR. El bloque creció hacia arriba —TIENDA,
CONFIGURACIÓN y SALIR siguen donde estaban al píxel— así que de la tabla de
`OPCIONES_TITULO` solo cambiaron los dos primeros números.

Las medidas no se sacan a ojo ni a mano:

    .\herramientas\medir-lapida.ps1

Barre la imagen y devuelve dónde cae cada renglón, listo para copiar. Existe
porque esto va a volver a pasar cada vez que se repinte la lápida, y porque
abrir el PNG para medirlo cuesta unos 4.700 tokens de contexto que ya no se van.

Tres cosas que costaron un rato y están escritas en su cabecera, para no
volver a pagarlas: los rieles del marco no se encuentran por brillo (el texto
brilla más que la piedra, y en esta lámina el riel derecho ni destaca); el ancho
de una palabra no se mide con el píxel más extremo (un punto de ruido del JPEG
la estiraba cien píxeles); y **PowerShell no distingue mayúsculas**, así que
`$y0` y el parámetro `$Y0` eran la misma variable — el origen de la franja se
machacaba con el primer renglón y las medidas salían sumadas unas a otras, con
un bloque acabando en y=1122 sobre una imagen de 768. Parecía un fallo de
detección y era un nombre.

**El atajo `O` se queda**, y ESC vuelve por donde se entró: al título si se
entró por la lápida, a personajes si se entró por el atajo. Sin eso, arrepentirse
en el título te dejaba en una pantalla en la que no habías estado.

Lo que sigue sin estar: **entrando por el título nadie elige personaje**. Los
reparte el anfitrión (`consola.js`, `i % 4`). Ya era así, pero desde la pantalla
de personajes quedaba disimulado.

## Las dos primeras pruebas de verdad, y por qué no llegaron a empezar

El 27 de agosto de 2026 se intentó por primera vez entre dos máquinas de dos
personas —un PC con Windows y un MacBook— desde la web publicada. Las dos
tentativas fallaron, cada una por un motivo distinto, y **las dos por algo que
estaba escrito DENTRO del código que los jugadores ya se habían intercambiado**.
El juego lo tenía delante y se calló las dos veces: "no se ha podido conectar"
al cabo de un rato. Media hora de dos personas cada vez.

### 1. Los dos en la misma wifi: la misma dirección pública

Los dos códigos traían `83.39.133.158`. La misma. Es el router de la casa visto
desde fuera, así que para que uno llegara al otro por ahí el paquete tendría que
salir al router y volver a entrar por la misma puerta —*hairpinning*—, y casi
ningún router doméstico lo hace.

Y el otro camino tampoco estaba: los seis candidatos locales eran nombres
`.local`. **Los navegadores esconden la IP de tu red detrás de un nombre mDNS**,
que el otro ordenador tiene que resolver a gritos por la wifi — y eso lo rompe el
aislamiento de clientes del router, el cortafuegos comiéndose el UDP 5353, o que
Windows y macOS no se contesten.

No es que fallara la conexión: **no había ni un camino por el que intentarlo**.

Lo contraintuitivo, y conviene tenerlo escrito: **dos ordenadores en la misma
casa son un caso MÁS DIFÍCIL que dos casas distintas.** Entre dos casas, cada uno
tiene su router y su dirección, y el agujereado normal de STUN funciona.

### 2. El MacBook por datos móviles: NAT simétrico

Su código traía dos direcciones públicas:

    srflx  95.127.23.45  puerto 50691   prioridad 1677729535
    srflx  95.127.23.45  puerto 50744   prioridad 1677729535

Misma IP, **misma prioridad —o sea el mismo socket local— y puertos distintos**.
Los dos servidores STUN vieron la misma conexión por dos puertas diferentes, que
es la definición de NAT simétrico: la operadora abre una puerta nueva para cada
destino. Ninguno de esos dos puertos es el que se abrirá cuando llegue el paquete
del otro jugador; para él habrá una tercera que nadie puede saber de antemano.

Ya estaba escrito más arriba que los NAT simétricos quedan fuera del alcance
—harían falta servidores TURN, que son infraestructura con coste mensual—. Lo
nuevo es que ahora **se reconocen y se dicen**.

## El diagnóstico: decirlo ANTES, no después

`diagnosticar()` en `js/red/codigo.js` son dos cuentas sobre los candidatos de un
código, y contestan las dos preguntas de arriba sin intentar nada:

- **NAT simétrico**: dos candidatos públicos con la misma prioridad y puertos
  distintos. La prioridad es lo que identifica el socket, porque ICE la calcula a
  partir de la interfaz de red: dos tarjetas distintas darían prioridades
  distintas y dos puertos serían lo normal.
- **La misma red**: la dirección pública del otro es la tuya. Se sabe leyendo su
  código, no al cabo del minuto que tarda ICE en rendirse.

El texto que ve el jugador sale de `avisoDeConexion` y `avisoMismaRed`, en
`js/red/consola.js`, y lo dicen los dos sitios —la consola y la pantalla— para
que no acaben contando cosas distintas. Sale en la pantalla del código, debajo y
en amarillo: **informa, no prohíbe**. Hay routers que conectan a pesar del aviso.

Solo se avisa de lo que impide jugar. Un aviso que salta cuando no pasa nada se
aprende a ignorar en dos días, y entonces ya no avisa de lo que sí pasa.

## Tu dirección de casa, escrita a mano

Es el arreglo de verdad para el caso 1, y sale de un detalle: **lo que el
navegador esconde es la IP y SOLO la IP**. El puerto viaja en claro dentro del
candidato `.local`. Así que con la dirección escrita a mano se reconstruye el
candidato entero, y el código pasa a llevar direcciones que el otro puede usar
directamente, sin mDNS y sin depender del router.

En la pantalla del cooperativo, `L` y se teclea. Se añade **un candidato por cada
puerto local**, porque cada tarjeta de red —la wifi, el cable, la máquina virtual
que tengas instalada— tiene el suyo y solo uno es el de la wifi por la que estáis
hablando; ICE los prueba todos y se queda con el que conteste. Adivinar cuál era
habría sido peor.

Se comprueba que sea de un rango privado (10.x, 172.16-31.x, 192.168.x). Escribir
ahí la dirección PÚBLICA es el error natural —es la que sale al buscar cuál es mi
ip— y no serviría de nada, pero encima taparía el motivo: el código saldría con
un candidato imposible y fallaría igual, con una pista menos.

**Vive en memoria y se pierde al recargar**, a propósito: `localStorage` está
reservado en este proyecto al progreso META, y una dirección de red guardada de
la semana pasada es un candidato que no responde.

    node herramientas\probar-diagnostico.js

Esa prueba corre sobre **los códigos de verdad de las dos tentativas**, guardados
tal cual llegaron. Es el banco de pruebas más honesto que hay: si algún día deja
de reconocerlos, el aviso ha dejado de servir para lo único que se hizo.

## El retardo de entrada, puesto solo (hecho)

Llevaba clavado en 4 fotogramas y ese número salía de una ida y vuelta de 1,4 ms
entre dos pestañas de la misma máquina — que no es una latencia, es el suelo del
sistema. Servía para probar el búfer y no decía nada de una red de verdad.

Ahora lo pone la propia conexión en cuanto se abre el canal, midiendo veinte
viajes. La cuenta, y cada sumando responde a algo distinto:

    viaje    la MITAD de la ida y vuelta: una pulsación va en un sentido
    +1       margen fijo; un fotograma de más no se percibe y uno de menos es
             una partida que se para
    +1       el paso del otro: un paquete no se atiende cuando llega sino en el
             siguiente paso de quien lo recibe
    +jitter  del peor viaje contra el normal, con tope de dos

Con suelo en 3 y techo en `RETARDO_MAX` (8). En una red local da 3-4; entre dos
casas subirá solo.

**Va en la conexión, no en la pantalla.** El retardo depende del viaje, no de
quién lo pidiera: puesto en la pantalla, quien conecta desde la consola o desde
el banco de pruebas se quedaba con el valor de fábrica sin enterarse, y las
pruebas medirían otra cosa que lo que se juega.

**No hace falta que las dos máquinas pongan el mismo.** Cada una elige cuándo
entra LO SUYO, y el paso al que va apuntada cada pulsación viaja en el paquete,
así que las dos la colocan en el mismo sitio. Un retardo más alto de un lado solo
le da más margen a ese lado. Medido: una partida entera con 2 de un lado y 3 del
otro, cero divergencia. Y `retardo` no entra en la firma que se compara entre
máquinas, así que esto no puede inventarse una desincronización.

### Y no se toca con la partida en marcha

El búfer apunta lo que pulsas en la casilla `paso + retardo`. Moverlo a mitad de
partida deja SIN ESCRIBIR las casillas de en medio, y el mundo espera para
siempre una pulsación que nadie va a poner. No es una desincronización: es un
bloqueo permanente de todas las máquinas, sin un solo error en la consola.

Con dos jugadores no se veía —la medida terminaba antes de empezar la partida—;
con cuatro, el anfitrión mide una vez por invitado y la última caía ya dentro.
Ahora se mide igual y se devuelve el número, pero no se aplica.

### La prueba que se acusaba a sí misma

Persiguiendo eso apareció otra cosa, y conviene tenerla escrita porque volverá a
parecer un fallo del juego: `probar-partida-en-red.js` daba **SE HAN QUEDADO
BLOQUEADAS** con cuatro jugadores, y no había ningún bloqueo. El mundo estaba
parado porque el **menú de subir nivel** estaba abierto, que es exactamente lo
que tiene que pasar mientras alguien elige carta.

El bucle de la prueba pulsa Enter una vez por vuelta, así que puede terminar con
el menú abierto. Con dos jugadores casi nunca coincide; con cuatro hacen falta
cuatro elecciones y hay cuatro veces más ocasiones de pillarlo. Ahora la prueba
cierra los menús antes de medir si el mundo avanza.

Es la sexta de la lista de "desincronizaciones que no lo eran", y de la misma
familia: lo que se estaba comparando no era la simulación.

## Lo que queda

1. **Probarlo entre dos casas de verdad.** `camino()` tiene que decir `publica`;
   hasta hoy siempre ha dicho `local`. Es lo único que puede medir latencia y
   pérdidas reales.

   Sigue pendiente **y ahora se sabe mejor qué no vale como prueba**: las dos
   tentativas del 27 de agosto no lo eran. Los dos en la misma wifi comparten
   dirección pública, y una punta por datos móviles cae en NAT simétrico. Hacen
   falta dos líneas fijas, cada una en su casa. Ver la sección de arriba.

2. **Reconexión.** Hoy una caída ofrece seguir en solitario o volver al menú;
   volver a engancharse y ponerse al día no está hecho.

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
