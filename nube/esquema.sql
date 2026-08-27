-- LA TABLA. Una fila por partida guardada, y nada más.
--
-- Se crea con:
--   npx wrangler d1 execute emerita-partidas --remote --file=nube/esquema.sql
--
-- `codigo` es la clave primaria y la identidad entera: 128 bits aleatorios que
-- genera el juego en el navegador. No hay tabla de usuarios porque no hay
-- usuarios — ver la cabecera de worker.js.
--
-- `cuerpo` es el progreso tal cual lo escribe el juego (ver
-- js/core/progresoPortable.js). El servidor NO lo interpreta: lo guarda como
-- texto, así que el formato puede cambiar sin tocar ni la tabla ni el Worker.
--
-- `tiempo` y `partidas` salen del progreso pero van en columnas aparte a
-- propósito: son lo que decide cuál de dos copias gana, y así se decide con dos
-- comparaciones de números en vez de enseñarle al servidor a leer el formato.
--
-- `sello` es cuándo lo hizo el juego, y `actualizado` cuándo llegó aquí. El
-- segundo lo pone el servidor porque el reloj del cliente puede decir cualquier
-- cosa; ninguno de los dos decide quién gana (para eso está `tiempo`), y están
-- para poder mirar y entender, no para la lógica.
CREATE TABLE IF NOT EXISTS partidas (
  codigo      TEXT PRIMARY KEY,
  cuerpo      TEXT NOT NULL,
  tiempo      REAL NOT NULL DEFAULT 0,
  partidas    INTEGER NOT NULL DEFAULT 0,
  sello       INTEGER NOT NULL DEFAULT 0,
  actualizado INTEGER NOT NULL DEFAULT 0
);

-- Para saber cuánto se está usando sin tener que leer la tabla entera.
CREATE INDEX IF NOT EXISTS idx_actualizado ON partidas (actualizado);
