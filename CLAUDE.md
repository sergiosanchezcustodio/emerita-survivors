# Emerita Survivors

## Restricciones (no negociables)
- Cero dependencias externas. Solo HTML/CSS/JS con módulos ES6 nativos.
- Canvas 2D puro. Nada de WebGL ni librerías.
- Object pooling obligatorio: cero `new` durante la partida.
- Colisiones vía spatial hash. Nunca N².
- `datos/` contiene datos puros, jamás lógica.
- Resolución interna 480x270, escalado entero, imageSmoothingEnabled = false.
- Nombres de dominio en español, técnicos en inglés. Comentarios en español.

## Comandos
- `python -m http.server 8000` — servidor local
- Abrir http://localhost:8000

## Plan
El plan completo por fases está en prompt-emerita-survivors.md. Implementar UNA fase por sesión y parar.