# La copia en la nube, paso a paso

Guarda una copia de tu progreso para poder seguir la partida en otro ordenador.
Son un Worker de Cloudflare y una tabla de D1 (SQLite), las dos cosas dentro del
plan gratuito.

**Antes de nada, lo que esto NO es**, porque decide todo lo demás:

- **No es una cuenta.** Sin correo, sin contraseña, sin registro. La identidad es
  un código aleatorio de 128 bits que el juego genera solo. Sin datos personales
  no hay nada que proteger ni que gestionar.
- **No es la fuente de la verdad.** El juego sigue guardando donde siempre y esto
  es una copia. Si el Worker se cae, se borra o se acaba el plan gratuito, se
  juega igual que hoy y nadie pierde nada. **Esa es la condición que hace honesto
  ofrecérselo a gente que no eres tú**: quien monta esto se convierte en custodio
  del progreso de otros, y la única forma de no deberles nada es que su partida
  siga viviendo en su navegador.
- **No es seguridad.** Quien tenga tu código puede leer y escribir tu partida.
  Por eso el código es largo y no se publica en ninguna parte.

---

## Los cuatro comandos

Desde la raíz del repositorio.

    npx wrangler login
    npx wrangler d1 create emerita-partidas

El segundo imprime un `database_id`. **Se pega en `nube/wrangler.toml`**, donde
pone `PEGA-AQUI-EL-ID-QUE-TE-DE-WRANGLER`.

    npx wrangler d1 execute emerita-partidas --remote --file=nube/esquema.sql
    npx wrangler deploy --config nube/wrangler.toml

El último imprime la URL, del estilo
`https://emerita-partidas.<tu-subdominio>.workers.dev`. **Esa URL es lo único
que le falta al juego**: es el dato que hay que darle al cliente, que es la
siguiente pieza. Mientras no haya URL, el juego funciona exactamente como hoy y
no habla con nadie.

## Comprobarlo sin abrir el juego

    curl https://TU-URL/p/aB3dEfGhIjKlMnOpQrStUv

Tiene que contestar `{"error":"No hay ninguna copia con ese código."}` con un
404. Si contesta eso, está en pie.

## Lo que hay que poner en el panel de Cloudflare

Un extremo público que escribe recibe visitas de robots el primer día. El Worker
ya rechaza lo que no tiene forma de partida —código mal formado, cuerpo de más de
2 KB, cualquier cosa que no empiece por `P1`—, pero **el límite por IP se pone en
el panel**, no en el código:

*Security → WAF → Rate limiting rules*: algo como 60 peticiones por minuto y por
IP sobre la ruta `/p/*`. Un jugador de verdad hace dos o tres cada partida.

## Cuánto aguanta el plan gratuito

Lo que manda no son las peticiones, son **las escrituras**. D1 da del orden de
100.000 filas escritas al día, contra las ~1.000 de KV; por eso este montaje usa
D1 y no KV. Con una escritura por partida terminada, eso son decenas de miles de
partidas diarias.

**Confirma las cifras antes de fiarte de esta línea**: los planes gratuitos
cambian y esto está escrito el 27 de agosto de 2026.

## Y si algún día quieres apagarlo

`npx wrangler delete`. Los jugadores no se enteran: el juego deja de sincronizar
y sigue guardando en su navegador. El código de progreso —el que se copia y se
pega a mano, `js/core/progresoPortable.js`— sigue funcionando sin servidor, y por
eso se hizo primero.

## Los ficheros

| | |
|---|---|
| `worker.js` | La API entera: `GET /p/<codigo>` y `PUT /p/<codigo>`. No hay listado. |
| `esquema.sql` | La tabla. Una fila por partida. |
| `wrangler.toml` | El despliegue. Aquí va el `database_id`. |

Y la prueba, que corre sin desplegar nada y sin cuenta:

    node herramientas\probar-nube.js

Monta el Worker contra una base de mentira y le hace peticiones de verdad. Lo que
comprueba es lo que puede costarle la partida a alguien: que subir una copia peor
no machaque la buena, que un código con mala forma no llegue a la base, y que un
cuerpo enorme se rechace.
