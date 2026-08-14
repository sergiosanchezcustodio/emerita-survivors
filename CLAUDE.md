# Emerita Survivors

## Restricciones (no negociables)
- Cero dependencias externas. Solo HTML/CSS/JS con módulos ES6 nativos.
- Canvas 2D puro. Nada de WebGL ni librerías.
- Object pooling obligatorio: cero `new` durante la partida.
- Colisiones vía spatial hash. Nunca N².
- `datos/` contiene datos puros, jamás lógica.
- Resolución interna 480x270, escalado entero, imageSmoothingEnabled = false.
- Nombres de dominio en español, técnicos en inglés. Comentarios en español.
- El estado de LA PARTIDA EN CURSO vive solo en memoria (sin `sessionStorage`
  ni nada equivalente): con la misma semilla de RNG, dos partidas producen las
  mismas oleadas, y persistir estado a medio jugar rompería esa reproducibilidad.
  `localStorage` SÍ está permitido, pero únicamente para progreso META que
  sobrevive entre partidas —denarios, héroes y potenciadores desbloqueados—,
  nunca para nada que se lea durante la simulación de una partida activa.

## Comandos
- `python -m http.server 8000` — servidor local
- Abrir http://localhost:8000
- `.\herramientas\procesar-assets.ps1` — convierte `resources/` en sprites
- `.\herramientas\ver-assets.ps1 <ruta>` — describe imágenes sin abrirlas
- `.\herramientas\instalar-lanzador.ps1` — deja el comando `emerita` en su sitio

## Coste de contexto (no negociable)
El coste de un resultado de herramienta es su tamaño **multiplicado por las
llamadas que quedan en la sesión**: lo que entra se relee en cada paso
posterior. Una imagen cuesta hasta ~4.700 tokens y ya no se va; los 48 ficheros
JS del proyecto juntos suman 763 KB y son calderilla. Medido sobre una sesión
real: las imágenes eran el 70% del contexto y el 95% del gasto.

- **Leer código es gratis.** No racionar `Read` sobre `.js`, `.json`, `.md` ni
  `.ps1`. Leer `main.js` entero diecisiete veces costó menos que abrir un PNG.
- **Nunca abrir una imagen para comprobar un hecho.** Medidas, transparencia,
  centrado, fotogramas y colores los da `ver-assets.ps1` en una línea de texto.
  Abrir la imagen es sólo para opinar sobre el dibujo.
- **Nunca abrir dos veces la misma imagen.** Si ya se abrió en esta sesión, ya
  está en el contexto: volver a leerla es pagarla dos veces.
- **Captura de pantalla sólo para juzgar lo visual.** Si la pregunta tiene
  respuesta de texto —¿existe el elemento?, ¿qué valor tiene?, ¿hay error en
  consola?— va por `javascript_tool` o `read_console_messages`: ~1 KB frente a
  los ~260 KB de una captura. Y antes de capturar, encoger la ventana.
- **Los lotes de imágenes, a un subagente.** Revisar ocho hojas de sprites entra
  en el contexto del subagente y muere con él; a la sesión llega el resumen.
- **Una tarea, una sesión.** `/clear` al cerrar cada tarea. Un contexto que
  cruza días multiplica todo lo anterior por miles de llamadas.

## Plan
El plan completo por fases está en prompt-emerita-survivors.md. Implementar UNA fase por sesión y parar.