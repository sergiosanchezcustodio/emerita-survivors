# La lista de armas y objetos: terminada

Sergio pasó en septiembre de 2026 una lista de cinco armas, cinco objetos de
tienda y veintiún objetos de gameplay. **Está toda dentro.** Este archivo se
queda como registro de qué es cada cosa y de las decisiones que se tomaron por
el camino, para no volver a discutirlas.

---

## Las cinco armas

| Arma | Qué la hace ella |
|---|---|
| **Petanca** | Única que apunta adonde MIRAS (`patron: 'rumbo'`). 1→10 bolas, abanico 0→120°, se gastan cada 3→8 enemigos |
| **Cartas de la baraja** | Familia de la Metralla. 3→22 cartas, una imagen distinta por carta sobre las diez de la lámina |
| **Cayado de San Isidro** | `bombardeoAleatorio` con el reparto encogido a un círculo alrededor del jugador |
| **Campana del Silencio** | **La única que no hace daño.** Cono que paraliza 1,5 s al 10; al paralizado se le atraviesa sin recibir |
| **Hula Hoop** (id `arosRitmica`) | Hermana de las RainbowMazas, pero **vuelven como bumerán**: pasan dos veces por el mismo sitio |

## Los veintiún objetos de gameplay

**De una línea de datos** (un campo del jugador que alguien lee en un sitio):
Campana Milagrosa, Ala de Mercurio, Amuleto de azogue, Asta del Escornao,
Lagarto de Calzadilla, Becerro de Oro y Musa.

**Que enganchan en un golpe:** Sanguijuelas del Guadiana, Capa del erizo, Cruz
del Gigante, Pira funeraria y Lágrima de la Mora.

**Que van por reloj:** Virgen Negra, Bálsamo de Fierabrás, Cencerros de San
Antón y Diadema de Aliseda.

**Solo en cooperativo** (`soloCooperativo`, no entran en el sorteo jugando
solo): Sello Templario, Corona de Espinas, El Grial de
Alconétar y La Llave del Perdón.

**Y el Libro de las Sombras de Alburquerque.**

## Los cinco de la tienda

Capa del Peregrino, Bellota de oro, Último aliento, Zurrón y Bandolera. Cuatro
de un solo nivel: son cosas que tienes o no tienes.

---

## Lo único que quedó fuera, y a propósito

**El poseído del Libro no hace daño al rozar a los suyos.** Se pasa a tu bando,
deja de perseguirte, camina hacia el enemigo más cercano con su aura verde y
revienta a los cinco segundos llevándose lo que tenga al lado.

El roce se dejó fuera porque **no existe daño de enemigo contra enemigo en
ninguna parte del motor**: un enemigo solo sabe perseguir a un jugador. Darle
ese camino por cinco segundos costaba más que todo lo demás del objeto junto, y
lo que de verdad mata es la explosión, que sí existía.

Si algún día se quiere, **se añade encima de esto sin tocar nada de lo que hay**:
el estado `poseido` ya está en el enemigo y el bucle que lo mueve ya es suyo.

---

## Arte provisional que sustituir

Tres iconos de arma **no los ha dibujado Sergio** y están marcados como
provisionales en `herramientas/procesar-assets.ps1`. Se sustituyen dejando el
dibujo de verdad con el mismo nombre en `resources/armas/` y volviendo a hornear:

- `Petanca.png` — la bola que genera `herramientas/generar-efectos.ps1`
- `Cayado.png` y `Campana.png` — salidas de Replicate (`generar-imagen.js`)

Los Aros usan el primer aro de la lámina recortado, y funciona.

Los **veintiún objetos pasivos nuevos** llevan iconos generados con Replicate,
uno por archivo en `resources/objetos/pasivos/<id>.png`. Los ocho originales
siguen saliendo de la lámina 4x2 de Sergio.

La hoja de objetos pasó de `rejilla` a `sueltos` justamente por esto: con
veintinueve iconos, ampliar la rejilla obligaría a rehacer la lámina entera cada
vez que entra un objeto. Ahora **añadir el número treinta es dejar un PNG en esa
carpeta con el nombre del id**, y nadie tiene que redibujar nada.

Uno de los veintiuno, la **Corona de espinas**, viene del generador con alfa
propia. El resto llega sobre fondo blanco y el horneado lo recorta inundando
desde el borde, pero un aro deja un hueco blanco en el centro al que esa
inundacion no llega: el icono salia como un disco solido. Se le vacio el blanco
a mano en el PNG de `resources/`, que es la otra entrada que el horneado ya
sabia leer -"trae alfa propia? pues nada que recortar"-, asi que sigue siendo
reproducible sin tocar la tuberia.

Y los **cinco potenciadores de tienda nuevos** también tienen ya dibujo propio,
en `resources/objetos/potenciadores_tienda/`. Salieron prestando el icono del
potenciador más parecido —el Manto con el ánfora de la Vitalidad, la Bandolera
con la onda expansiva—, así que en la tienda se veían dos casillas distintas con
la misma ilustración: justo lo que se había arreglado cuando los diez originales
dejaron de usar el icono de su pasivo gemelo. También son de Replicate, también
provisionales.

---

## Decisiones tomadas (no volver a preguntarlas)

- La **Bellota de oro** solo afecta a armas de proyectil, y un arma puede decir
  que no con `sinBellota`: hoy solo la Petanca, porque lo que la hace ella es el
  abanico y una bola de regalo desdibuja esa cuenta.
- La **Petanca** se gasta cada X enemigos — no atraviesa sin límite, aunque la
  petición original lo pedía: diez bolas en 120° sin gastarse dejaban el mapa
  limpio de un disparo.
- Los **Aros** vuelven como bumerán, que es lo que los separa de las Mazas.
- La **Campana** no hace daño, y paraliza 1,5 s al nivel 10 (se triplicó tras
  jugarla: medio segundo se pasaba antes de decidir por dónde salir).
- **Capa, Zurrón, Bandolera y Último aliento**: un solo nivel.
- Que haya veintiocho pasivos para cuatro ranuras **está aceptado**: hace las
  partidas muy distintas entre sí.
- El **Lagarto** quita su porcentaje ANTES que la armadura (es la piel, no la
  coraza) y el **Becerro** es del que REMATA, no del equipo.
- La **Capa del Peregrino** se come el golpe entero y regala los i-frames: sin ellos, parar
  un mordisco en medio de la horda te deja expuesto al siguiente en el mismo
  fotograma.
- Las **ranuras son del jugador**, no del juego: en cooperativo cada uno lleva
  su progreso comprado, así que en la misma partida puede haber quien tenga
  cuatro armas y quien tenga cinco.

---

## Armas apartadas, que no borradas

Sergio sacó siete del juego: **Lanzas gemelas, Artillería, Lluvia de agujas,
Pistola, Escopeta, Lanzagranadas y Honda balear**.

No se han borrado, y ahí está la gracia: llevan `retirada: true` en
`js/datos/armas.js` y lo único que mira esa bandera es el sorteo de subida de
nivel (`js/sistemas/progresion.js`). La entrada sigue entera —números, dibujo y
comportamiento—, así que **devolver un arma al juego es borrar esa línea**. Se
hizo así porque un arma arrancada hay que reescribirla, y con ella se van los
números que costaron tardes de ajuste.

Siguen saliendo en el ciclador de desarrollo (tecla **M**), que es justo donde
hacen falta: para volver a mirar una y decidir si vuelve.

## Nombres que cambiaron

Cambia el nombre VISIBLE; el identificador interno no se toca, porque de él
cuelgan el icono, el atlas y las partidas guardadas.

| Antes | Ahora | id (sin tocar) |
|---|---|---|
| Ballista | **Ballesta** | `ballista` |
| Lanzacohetes | **Bazooka** | `lanzacohetes` |
| Rayo de Júpiter | **Rayos de Júpiter** | `rayoHorizontal` |
| Arco corto | **Arco** | `arcoCorto` |
| Sello de los Caballeros de Magacela | **Sello Templario** | `selloMagacela` |
| Manto del Peregrino | **Capa del Peregrino** | `mantoPeregrino` |
