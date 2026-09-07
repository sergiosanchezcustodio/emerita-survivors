// GENERAR UNA IMAGEN CON REPLICATE, desde la línea de comandos.
//
//   node herramientas/generar-imagen.js "un ánfora romana rota" -s resources/pruebas/anfora.png
//
// Existe para que pedir arte de referencia —bocetos, texturas, ideas de
// enemigo— sea un comando más de herramientas/ y no un viaje a una web. Lo que
// salga de aquí NO es arte final del juego: el arte lo dibuja Sergio. Esto sirve
// para probar una idea antes de que valga la pena dibujarla.
//
// CERO DEPENDENCIAS, como todo lo demás. Node trae `fetch` desde la 18, así que
// la API de Replicate se llama a pelo y la imagen se baja con el mismo `fetch`.
//
// --- EL TOKEN --------------------------------------------------------------
//
// Sale de `REPLICATE_API_TOKEN`, y se busca en dos sitios y en este orden:
//
//   1. La variable de entorno, si está puesta.
//   2. El fichero `.env` de la raíz del repositorio.
//
// `.env` YA ESTÁ EN .gitignore desde antes de esto, y por el mismo motivo por el
// que se escribió aquella línea: un token de API en el repositorio es un token
// regalado. El fichero es de cada copia y no se versiona nunca.
//
// Si no hay token, el programa lo dice y explica cómo ponerlo. No hace la
// llamada: fallar con un 401 de la API sería contar lo mismo peor.

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, extname } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

// MODELO POR DEFECTO: flux-schnell.
//
// Es el barato y rápido de Black Forest Labs —unos céntimos por imagen y cuatro
// pasos de difusión— y esto se usa para PROBAR IDEAS, que es una cosa que se
// hace muchas veces seguidas y tirando la mayoría. Para una lámina que vaya a
// mirarse con calma está `-m black-forest-labs/flux-1.1-pro`, que cuesta bastante
// más y merece la pena solo cuando ya se sabe qué se quiere.
//
// Cualquier modelo de Replicate vale mientras acepte `prompt` y devuelva
// imágenes: se le pasa con `-m owner/nombre`.
const MODELO_POR_DEFECTO = 'black-forest-labs/flux-schnell';

// Cuánto se espera a que el modelo termine antes de rendirse. Los rápidos
// tardan segundos; los grandes, minutos. Dos minutos cubre a los dos sin dejar
// la consola colgada para siempre si el otro lado se atasca.
const ESPERA_MAXIMA = 120_000;

function ayuda() {
  console.log(`
Genera una imagen con Replicate y la guarda en un archivo.

  node herramientas/generar-imagen.js "<lo que se quiere>" [opciones]

  -s, --salida <ruta>    dónde guardarla. Por defecto: resources/generadas/<fecha>.webp
  -m, --modelo <id>      modelo de Replicate. Por defecto: ${MODELO_POR_DEFECTO}
  -n, --numero <n>       cuántas variantes (1-4). Por defecto: 1
  -r, --relacion <a:b>   proporción: 1:1, 16:9, 9:16, 4:3, 3:4... Por defecto: 1:1
      --semilla <n>      para repetir exactamente una imagen que ya salió
      --json <texto>     entrada extra en JSON, para opciones propias del modelo

El token va en la variable REPLICATE_API_TOKEN o en una línea
REPLICATE_API_TOKEN=r8_... del fichero .env de la raíz (que no se versiona).
`);
}

// El .env, leído a mano. No hace falta una librería para partir por el primer
// '=' de cada línea, y meter una dependencia en un proyecto que presume de no
// tener ninguna, por esto, sería empezar por el peor sitio.
function leerEnv() {
  const ruta = join(RAIZ, '.env');
  if (!existsSync(ruta)) return {};
  const valores = {};
  for (const linea of readFileSync(ruta, 'utf8').split('\n')) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#')) continue;
    const corte = limpia.indexOf('=');
    if (corte < 0) continue;
    // Las comillas alrededor del valor se quitan: es la forma en que se pega un
    // token copiado de una web, y dejarlas dentro manda una comilla a la API.
    valores[limpia.slice(0, corte).trim()] =
      limpia.slice(corte + 1).trim().replace(/^["']|["']$/g, '');
  }
  return valores;
}

function token() {
  if (process.env.REPLICATE_API_TOKEN) return process.env.REPLICATE_API_TOKEN;
  const t = leerEnv().REPLICATE_API_TOKEN;
  if (t) return t;
  console.error(`
FALTA EL TOKEN DE REPLICATE.

Ponlo en el fichero .env de la raíz del repositorio, en una línea:

    REPLICATE_API_TOKEN=r8_tu_token_aqui

Ese fichero está en .gitignore y no se sube nunca. El token se saca de
https://replicate.com/account/api-tokens
`);
  process.exit(1);
}

function argumentos(argv) {
  const o = { prompt: '', salida: '', modelo: MODELO_POR_DEFECTO, numero: 1,
              relacion: '1:1', semilla: null, extra: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--ayuda' || a === '--help') { ayuda(); process.exit(0); }
    else if (a === '-s' || a === '--salida') o.salida = argv[++i];
    else if (a === '-m' || a === '--modelo') o.modelo = argv[++i];
    else if (a === '-n' || a === '--numero') o.numero = Math.max(1, Math.min(4, +argv[++i] || 1));
    else if (a === '-r' || a === '--relacion') o.relacion = argv[++i];
    else if (a === '--semilla') o.semilla = +argv[++i];
    else if (a === '--json') o.extra = JSON.parse(argv[++i]);
    // Lo primero que no sea una opción es lo que se quiere dibujar. Se acumula
    // por si viene sin comillas: escribir la frase entera entrecomillada es lo
    // correcto, pero olvidarlas no tiene por qué costar un error.
    else o.prompt = o.prompt ? `${o.prompt} ${a}` : a;
  }
  return o;
}

// Un nombre por defecto que no pise al anterior: la fecha hasta el segundo.
function nombrePorDefecto() {
  const d = new Date();
  const p = (n, c = 2) => String(n).padStart(c, '0');
  return `imagen-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
         `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// Varias variantes se numeran a partir de la ruta pedida: `boceto.png` da
// `boceto-1.png` y `boceto-2.png`. Con una sola no se numera nada, que es el
// caso normal y el que interesa que salga con el nombre exacto que se pidió.
function rutaDe(base, indice, total) {
  if (total === 1) return base;
  const ext = extname(base);
  return base.slice(0, base.length - ext.length) + `-${indice + 1}` + ext;
}

async function principal() {
  const o = argumentos(process.argv.slice(2));
  if (!o.prompt) { ayuda(); process.exit(1); }
  const clave = token();

  const salida = resolve(RAIZ, o.salida ||
    join('resources', 'generadas', nombrePorDefecto() + '.webp'));
  mkdirSync(dirname(salida), { recursive: true });

  // La entrada del modelo. `prompt` lo entienden todos; el resto solo algunos,
  // y los que no lo entiendan LO IGNORAN, así que no hay que llevar una tabla
  // de qué acepta cada uno. Lo que sí hace falta a veces —un modelo con
  // parámetros propios— entra por `--json` y pisa a estos.
  const input = {
    prompt: o.prompt,
    aspect_ratio: o.relacion,
    num_outputs: o.numero,
    output_format: extname(salida).slice(1) || 'webp'
  };
  if (o.semilla != null && !Number.isNaN(o.semilla)) input.seed = o.semilla;
  Object.assign(input, o.extra || {});

  console.log(`Modelo:  ${o.modelo}`);
  console.log(`Pide:    ${o.prompt}`);
  console.log(`Guarda:  ${salida}`);
  console.log('Generando…');

  // `Prefer: wait` deja la petición abierta hasta que el modelo termina, en vez
  // de devolver una predicción "starting" y obligar a preguntar en bucle. Si
  // aun así vuelve sin terminar —pasa con los modelos lentos— se pregunta.
  const resp = await fetch(`https://api.replicate.com/v1/models/${o.modelo}/predictions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${clave}`,
      'Content-Type': 'application/json',
      Prefer: 'wait'
    },
    body: JSON.stringify({ input })
  });

  if (!resp.ok) {
    const cuerpo = await resp.text();
    console.error(`\nReplicate ha dicho que no (HTTP ${resp.status}):\n${cuerpo}\n`);
    if (resp.status === 401) console.error('El token no vale o ha caducado.');
    if (resp.status === 402) console.error('La cuenta no tiene saldo.');
    if (resp.status === 404) console.error(`¿Existe el modelo "${o.modelo}"?`);
    process.exit(1);
  }

  let prediccion = await resp.json();
  const hasta = Date.now() + ESPERA_MAXIMA;
  while ((prediccion.status === 'starting' || prediccion.status === 'processing') &&
         Date.now() < hasta) {
    await new Promise((r) => setTimeout(r, 1500));
    const s = await fetch(prediccion.urls.get, { headers: { Authorization: `Bearer ${clave}` } });
    prediccion = await s.json();
  }

  if (prediccion.status !== 'succeeded') {
    console.error(`\nNo ha salido: ${prediccion.status}` +
                  (prediccion.error ? ` — ${prediccion.error}` : ''));
    process.exit(1);
  }

  // La salida es una URL o una lista de ellas, según el modelo. Se normaliza a
  // lista y se baja cada una.
  const urls = Array.isArray(prediccion.output) ? prediccion.output : [prediccion.output];
  const total = urls.length;
  for (let i = 0; i < total; i++) {
    const img = await fetch(urls[i]);
    if (!img.ok) { console.error(`No se ha podido bajar la imagen ${i + 1}`); continue; }
    const destino = rutaDe(salida, i, total);
    writeFileSync(destino, Buffer.from(await img.arrayBuffer()));
    console.log(`  ${destino}`);
  }

  // Lo que ha costado, cuando la API lo dice. Va escrito porque esto gasta
  // dinero de verdad y una herramienta que gasta sin decir cuánto acaba
  // gastando más de la cuenta.
  const m = prediccion.metrics || {};
  if (m.predict_time) console.log(`\nTiempo de cómputo: ${m.predict_time.toFixed(1)} s`);
  console.log('Hecho.');
}

principal().catch((e) => {
  console.error('\nHa reventado: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
