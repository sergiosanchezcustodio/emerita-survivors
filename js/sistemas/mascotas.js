import { MASCOTAS, factorMascota } from '../datos/mascotas.js';
import { MetaProgreso } from '../core/metaProgreso.js';
import { Recursos } from '../core/recursos.js';
import { ESCALA_ARTE } from '../core/constantes.js';
import { enemigoMasCercano, enemigosEnRadio } from './colisiones.js';
import { VFX } from './vfx.js';

// Mascotas: el bicho que acompaña a cada jugador y hace su cosa cada tantos
// segundos. Ver datos/mascotas.js para el catálogo.
//
// UNA POR JUGADOR y la misma para todos: la mascota equipada es una elección de
// menú, no de partida, así que en cooperativo los cuatro llevan la suya del
// mismo tipo. Se preasignan las cuatro al arrancar y no se crea ni una sola
// durante la partida, como todo lo demás.
//
// Las PASIVAS no pasan por aquí para su efecto —lo aplica jugador.js con el
// mismo bucle que los pasivos y los potenciadores— pero sí para dibujarse: que
// Heladio no haga nada cada X segundos no quiere decir que no tenga que verse
// trotando al lado.

const MAX = 4;

// Cómo sigue al jugador. No va pegada: se queda atrás y llega con retraso, que
// es lo que hace que parezca que va detrás en vez de estar clavada al sprite.
const DISTANCIA = 16;          // unidades lógicas por detrás
const SUAVIZADO = 5;           // 1/s: cuanto más alto, más pegada
const FLOTE = 1.6;             // amplitud del balanceo vertical
const RADIO_DIBUJO = 5;

// Índices de enemigos que devuelve una consulta por radio. Preasignado y
// compartido: el chillido del Pollito puede caer con la pantalla llena, y
// crear un array por chillido sería asignar en caliente.
const BUFER = new Int32Array(400);

// Cadencia del ciclo de las mascotas animadas. Mismo criterio que el bestiario:
// una velocidad fija para todas, porque son bichos pequeños al lado del jugador
// y afinarla por mascota no se notaría.
const SEG_POR_FRAME = 1 / 10;

export const Mascotas = {
  activas: null,           // una entrada por jugador, preasignada

  iniciar() {
    this.activas = new Array(MAX);
    for (let i = 0; i < MAX; i++) {
      this.activas[i] = {
        x: 0, y: 0, reloj: 0, fase: i * 1.7, viva: false,
        mirandoDerecha: true, frame: 0, relojAnim: i * 0.13,
        // UNA MASCOTA POR JUGADOR: cada puesto lleva la suya, su nivel y lo
        // que necesita para dibujarse. Antes había una sola global.
        id: '', def: null, nivel: 0, factor: 1, idAtlas: '', frames: 1
      };
    }
    this.releer(null);
  },

  // Se llama al empezar la partida con lo que se haya elegido en la pantalla de
  // mascotas: un id por jugador, o cadena vacía para "ninguna". Durante la
  // partida no cambia.
  releer(elegidas) {
    if (!this.activas) return;
    let factorDenarios = 1;

    for (let i = 0; i < MAX; i++) {
      const m = this.activas[i];
      const id = (elegidas && elegidas[i]) || '';
      const nivel = id ? MetaProgreso.nivelMascota(id) : 0;

      m.id = nivel > 0 ? id : '';
      m.def = m.id ? MASCOTAS[m.id] : null;
      m.nivel = nivel;
      // Cuánto rinde su nivel. Se resuelve aquí y no en cada golpe: es un
      // número por partida, no por paso.
      m.factor = factorMascota(nivel);
      // Id del atlas y número de fotogramas, resueltos UNA vez por partida en
      // vez de rehacer la cadena y consultar el atlas sesenta veces por segundo.
      m.idAtlas = m.id ? 'mascota' + m.id.charAt(0).toUpperCase() + m.id.slice(1) : '';
      const meta = m.idAtlas ? Recursos.meta(m.idAtlas) : null;
      m.frames = meta ? (meta.frames || 1) : 1;
      m.reloj = 0;
      m.viva = false;

      // Nerón: el bonus de denarios NO se acumula si lo llevan varios. Los
      // denarios son del equipo, no de cada jugador, así que sumar cuatro veces
      // el mismo gato multiplicaría por 2,4 lo que gana la partida entera por
      // una decisión que además está prohibida —no se puede repetir mascota—.
      // Se queda con el mejor por si acaso.
      if (m.def && m.def.factorDenarios) {
        factorDenarios = Math.max(factorDenarios, 1 + m.def.factorDenarios * m.factor);
      }
    }

    // Se deja escrito en MetaProgreso para que lo aplique `ganar()` una sola
    // vez, en vez de repetirlo en los tres sitios que reparten denarios.
    MetaProgreso.factorDenarios = factorDenarios;
  },

  actualizar(dt, jugadores, ctx) {
    for (let i = 0; i < jugadores.length && i < MAX; i++) {
      const j = jugadores[i];
      const m = this.activas[i];
      if (!m.def) continue;                    // este jugador no lleva mascota
      const habilidad = HABILIDADES[m.def.habilidad];

      // Un jugador caído no tiene mascota al lado: se esconde y vuelve cuando
      // le levantan. Es la lectura correcta —el bicho no se queda pegado a un
      // ataúd— y de paso impide que un caído siga haciendo daño con Karim.
      if (j.abatido) { m.viva = false; continue; }

      if (!m.viva) {                     // aparece donde esté el jugador
        m.viva = true;
        m.x = j.x; m.y = j.y;
      }

      // Se coloca por detrás de hacia donde mira, y llega con retraso.
      const destinoX = j.x - (j.mirandoDerecha ? DISTANCIA : -DISTANCIA);
      const destinoY = j.y - 4;
      const k = Math.min(1, SUAVIZADO * dt);
      const avanceX = (destinoX - m.x) * k;
      m.x += avanceX;
      m.y += (destinoY - m.y) * k;
      m.fase += dt * 3;
      // Mira hacia donde se mueve, con una zona muerta: sin ella, el temblor
      // del suavizado cuando ya está en su sitio la haría girar sin parar.
      if (avanceX > 0.05) m.mirandoDerecha = true;
      else if (avanceX < -0.05) m.mirandoDerecha = false;

      // Ciclo de la mascota, si su dibujo es un GIF. Las que siguen siendo un
      // PNG quieto tienen un solo fotograma y esto no hace nada.
      if (m.frames > 1) {
        m.relojAnim += dt;
        while (m.relojAnim >= SEG_POR_FRAME) {
          m.relojAnim -= SEG_POR_FRAME;
          m.frame = (m.frame + 1) % m.frames;
        }
      }

      if (!habilidad) continue;          // pasiva: solo se dibuja
      m.reloj -= dt;
      if (m.reloj > 0) continue;
      m.reloj = m.def.cada;
      habilidad(m.def, m, j, ctx);
    }
  },

  // Un drawImage por mascota y su sombra. El id del atlas es el de la mascota
  // con el prefijo `mascota` (ver el catálogo de procesar-assets.ps1).
  //
  // El VOLTEO sale de la copia espejada que precachea recursos.js, igual que en
  // enemigos y jugador: todos los dibujos miran a la derecha y aquí se elige
  // uno u otro según hacia dónde va el bicho, sin tocar la matriz del contexto.
  //
  // Si falta el sprite se cae a la silueta de color con la inicial, que es lo
  // que hubo mientras no había arte: una mascota invisible sería peor que un
  // círculo, porque media gracia de llevar a Karim es verlo correr al lado.
  // SE DIBUJA EN DOS PASADAS, y el motivo es de lectura, no de estética.
  //
  // Los orbitales —Scutum, Discos de sierra, Sierras votivas, Testudo— giran
  // pegados al jugador y ahí es justo donde va la mascota, así que la mascota
  // los tapaba: un escudo que desaparece detrás del perro deja de decir dónde
  // estás protegido, que es lo único que un orbital tiene que decir.
  //
  // Pasan por ENCIMA de las mascotas que pisan el suelo, porque un disco de
  // sierra vuela a la altura del pecho y el perro no. Y por DEBAJO de las que
  // vuelan —el búho y el pollito fantasma, `vuela` en datos/mascotas.js— que
  // están por encima de todo eso. La altura del sprite manda sobre el orden.
  //
  // `soloVuelan`: null dibuja todas (por si alguien quiere una sola pasada),
  // false solo las de suelo, true solo las voladoras. Ver el orden en main.js.
  dibujar(ctx, jugadores, soloVuelan = null) {
    ctx.save();
    for (let i = 0; i < jugadores.length && i < MAX; i++) {
      const m = this.activas[i];
      if (!m.viva || !m.def) continue;
      const d = m.def;
      if (soloVuelan !== null && !!d.vuela !== soloVuelan) continue;
      const idAtlas = m.idAtlas;
      const meta = Recursos.meta(idAtlas);

      // SOLO FLOTAN LAS QUE VUELAN. El balanceo lo tenían las ocho, y a las que
      // andan las dejaba levitando: ya tienen su animación de patas, que es lo
      // que cuenta que caminan, y el vaivén encima las despegaba del suelo. El
      // búho y el pollito fantasma sí lo conservan, que es lo que dice que no
      // pisan (ver `vuela` en datos/mascotas.js).
      //
      // Y NINGUNA LLEVA SOMBRA. La tenían para no parecer pegadas al cristal,
      // pero no la lleva nadie más —ni los personajes ni los enemigos— así que
      // la mascota era lo único del mundo con una elipse negra debajo, y eso se
      // notaba más que el problema que resolvía.
      const y = d.vuela ? m.y + Math.sin(m.fase) * FLOTE : m.y;

      if (meta) {
        const img = m.mirandoDerecha ? Recursos.imagen(idAtlas) : Recursos.espejo(idAtlas);
        if (img) {
          const w = meta.w / ESCALA_ARTE;
          const h = meta.h / ESCALA_ARTE;
          // La copia espejada está volteada FOTOGRAMA A FOTOGRAMA (ver
          // recursos.js), así que el índice vale igual en las dos y la
          // animación no corre del revés al girar.
          ctx.drawImage(img, m.frame * meta.w, 0, meta.w, meta.h,
                        m.x - w / 2, y - h, w, h);
          continue;
        }
      }

      ctx.beginPath();
      ctx.arc(m.x, y, RADIO_DIBUJO, 0, Math.PI * 2);
      ctx.fillStyle = d.color;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(8,7,10,.75)';
      ctx.stroke();
      ctx.fillStyle = 'rgba(12,10,14,.8)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '700 6px sans-serif';
      ctx.fillText(d.inicial, m.x, y + 0.5);
    }
    ctx.restore();
  },

};

// --- Habilidades activas -----------------------------------------------------
// Firma común (def, mascota, jugador, ctx). `ctx` trae lo que haga falta del
// mundo: enemigos, zonas y el rng. Añadir una mascota que reutilice una de
// estas es añadir una entrada en datos/mascotas.js y nada más.
// `m.factor` es cuanto rinde su NIVEL (1 al nivel 1, 2 al nivel 5). Se aplica
// aqui, sobre el numero que define a cada mascota, y no en los datos: los datos
// dicen cuanto hace la mascota, no cuanto la ha mejorado este jugador.
const HABILIDADES = {
  // KARIM: muerde al más cercano. Daño directo y sin proyectil — la mordida se
  // resuelve en el sitio, así que no gasta pool de proyectiles ni puede fallar.
  morder(def, m, j, ctx) {
    const presa = enemigoMasCercano(ctx.enemigos, m.x, m.y, def.alcance);
    if (!presa) { m.reloj = 0.3; return; }   // sin blanco, reintenta pronto
    let dx = presa.x - m.x;
    let dy = presa.y - m.y;
    const dist = Math.hypot(dx, dy) || 1;
    ctx.enemigos.danyar(presa, Math.round(def.danyo * m.factor), dx / dist, dy / dist, 60);
    // Se teletransporta a la presa: es un perro lanzándose, y verlo aparecer
    // junto al bicho al que acaba de morder vende el gesto sin animarlo.
    m.x = presa.x - dx / dist * 8;
    m.y = presa.y - dy / dist * 8;
  },

  // CLEOPATRA: cura una cantidad fija. No pone un objeto en el suelo que haya
  // que ir a recoger —eso ya lo hacen los consumibles del director— sino que
  // cura a SU jugador: una mascota que te obliga a ir a por lo que te da no se
  // siente como una mascota, se siente como otro recogible.
  huevo(def, m, j, ctx) {
    if (j.vida >= j.vidaMaxima) { m.reloj = 1.5; return; }   // reintenta pronto
    const cura = Math.round(def.cura * m.factor);
    j.vida = Math.min(j.vidaMaxima, j.vida + cura);
    VFX.numero(j.x, j.y - 22, cura, ctx.rng);
  },

  // OREO: denarios directos al bolsillo. No caen al suelo por lo mismo que el
  // huevo, y porque un denario tirado en el minuto 20 no lo recoge nadie.
  escarbar(def, m, j, ctx) {
    MetaProgreso.ganar(Math.round(def.denarios * m.factor));
  },

  // POLLITO: los de alrededor salen huyendo un rato. No hace daño: abre hueco,
  // que con la horda encima vale más que matar a cuatro.
  //
  // El búfer de índices está preasignado arriba, no se crea uno por chillido:
  // esto puede dispararse con la pantalla llena.
  espantar(def, m, j, ctx) {
    const n = enemigosEnRadio(ctx.enemigos, m.x, m.y, def.radio * m.factor, BUFER);
    for (let i = 0; i < n; i++) ctx.enemigos.espantar(BUFER[i], def.duracion * m.factor);
    VFX.sacudir(1.5);
  }
};
