# Lo que queda de la lista de armas y objetos

Sergio pasó en septiembre de 2026 una lista de cinco armas, cinco objetos de
tienda y veintiún objetos de gameplay. Esto es dónde se quedó, para no tener que
reconstruirlo de memoria cada vez que se abre una sesión nueva.

**Regla de la casa** (ver CLAUDE.md): una tanda por sesión y parar. Este archivo
existe para que la tanda siguiente empiece sabiendo dónde estaba la anterior.

---

## Hecho

### Las cinco armas

| Arma | Qué la hace ella |
|---|---|
| **Petanca** | Única que apunta adonde MIRAS (`patron: 'rumbo'`). 1→10 bolas, abanico 0→120°, se gastan cada 3→8 enemigos |
| **Cartas de la baraja** | Familia de la Metralla. 3→22 cartas, una imagen distinta por carta, cíclicas sobre las diez de la lámina |
| **Cayado de San Isidro** | `bombardeoAleatorio` con el reparto encogido a un círculo alrededor del jugador (`alcance`) |
| **Campana del Silencio** | **La única que no hace daño.** Cono que paraliza; el motor ya trata al paralizado como atravesable y sin daño de contacto |
| **Aros de rítmica** | Hermana de las RainbowMazas, pero **vuelven como bumerán** — pasan dos veces por el mismo sitio |

### Doce objetos de gameplay

Los siete de «una línea de datos» —campo nuevo en el jugador que alguien lee en
un sitio concreto—: **Campana Milagrosa** (alcance), **Ala de Mercurio**
(velocidad de proyectil), **Amuleto de azogue** (duración de zonas), **Asta del
Escornao** (perforación), **Lagarto de Calzadilla** (daño de contacto),
**Becerro de Oro** (denarios) y **Musa** (experiencia).

Y los cinco que enganchan en un golpe: **Sanguijuelas del Guadiana**, **Capa del
erizo**, **Cruz del Gigante**, **Pira funeraria** y **Lágrima de la Mora**.

---

## Pendiente

### Objetos de gameplay (9)

**Los cuatro periódicos.** Comparten patrón —un reloj en el jugador que dispara
cada X segundos— así que salen bien de una tacada.

| Objeto | Efecto |
|---|---|
| Virgen Negra | Invulnerable un instante cada X s |
| Bálsamo de Fierabrás | Al bajar del 25% de vida, curación de golpe; recarga cada N s |
| Cencerros de San Antón | Cada X s atrae todas las gemas del mapa |
| Diadema de Aliseda | Velocidad que se acumula mientras no te toquen; un golpe la resetea |

Los dos últimos son propuestas que sustituyeron a las originales, porque las
originales se solapaban con cosas que ya existían: la Diadema era el tercer «+%
de velocidad» del juego (Sandalias y Premura) y el Bálsamo el tercer goteo de
vida (Corona de laurel y Panacea).

**Los cuatro de cooperativo.** Necesitan algo que no existe: **un objeto que no
entre en el sorteo jugando solo**. Es una marca en los datos y un filtro en la
generación de ofertas, pero hay que hacerlo una vez y sirve para los cuatro.

| Objeto | Efecto |
|---|---|
| Sello de los Caballeros de Magacela | +daño a todos los jugadores, ~1/3 de lo que da el Anillo de Augusto |
| Corona de Espinas | La vida que pierdes la ganan tus compañeros |
| El Grial de Alconétar | Cura algo de vida a todos cada X s |
| La Llave del Perdón | Reanimas al caído un % más rápido y desde más lejos |

**El Libro de las Sombras de Alburquerque** — el grande, y con una pregunta
abierta.

Un enemigo al azar se pasa a tu bando con un aura verde, y a los cinco segundos
revienta haciendo daño alrededor. No afecta a jefes. Subir de nivel acelera la
cadencia.

> **PREGUNTA SIN CONTESTAR.** ¿El poseído tiene que hacer daño al ROZAR a los
> otros enemigos durante esos cinco segundos, o basta con que camine hacia el
> más cercano y reviente?
>
> No es un detalle: hoy un enemigo solo sabe perseguir a un jugador y **no
> existe daño de enemigo contra enemigo en ninguna parte del motor**. La
> explosión es gratis —ya hay explosiones que dañan enemigos— y el caminar es
> barato. El roce es la mitad cara del objeto, y son solo cinco segundos.

### Tienda (5)

| Objeto | Efecto | Nota |
|---|---|---|
| Manto del Peregrino | Te protege de un golpe cada 10 s | Un solo nivel |
| Bellota de oro | +1 proyectil | **Solo armas de proyectil**: fuera Petanca y láser |
| Último aliento | Al caer, curas a todos los que sigan en pie | |
| Zurrón | Un hueco más de objeto | Un solo nivel |
| Bandolera | Una ranura más de arma | Un solo nivel |

Zurrón y Bandolera van al final a propósito: las ranuras son **4 y 4**
(`MAX_ARMAS` / `MAX_PASIVOS` en sistemas/progresion.js) y ese número está
cuadrado en la ficha, en el resumen final y en la lógica de subida automática.
No es un dato suelto, es un dato con público.

---

## Arte provisional que sustituir

Tres iconos de arma **no los ha dibujado Sergio** y están marcados como
provisionales en `herramientas/procesar-assets.ps1`. Se sustituyen dejando el
dibujo de verdad con el mismo nombre en `resources/armas/` y volviendo a hornear:

- `Petanca.png` — la bola que genera `herramientas/generar-efectos.ps1`
- `Cayado.png` y `Campana.png` — salidas de Replicate (`generar-imagen.js`)

Los Aros no tienen icono propio: usan el primer aro de la lámina recortado, y
funciona.

---

## Decisiones ya tomadas (no volver a preguntarlas)

- La **Bellota de oro** solo afecta a armas de proyectil.
- La **Petanca** se gasta cada X enemigos, +5 al nivel 10 — no atraviesa sin
  límite, aunque la petición original lo pedía: diez bolas en 120° sin gastarse
  dejaban el mapa limpio de un disparo.
- Los **Aros** vuelven como bumerán, que es lo que los separa de las Mazas.
- La **Corona de Espinas** y el **Sello de Magacela** solo salen en cooperativo.
- **Manto, Zurrón y Bandolera**: un solo nivel.
- La **Campana** no hace daño, y paraliza **1,5 s al nivel 10** (se triplicó
  después de jugarla: medio segundo se pasaba antes de decidir por dónde salir).
- Que haya casi treinta pasivos para cuatro ranuras **está aceptado**: hace las
  partidas muy distintas entre sí.
