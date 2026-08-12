import { MASCOTAS } from '../datos/mascotas.js';
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

export const Mascotas = {
  activas: null,           // una entrada por jugador, preasignada
  def: null,               // definición de la equipada, o null
  id: '',

  iniciar() {
    this.activas = new Array(MAX);
    for (let i = 0; i < MAX; i++) {
      this.activas[i] = { x: 0, y: 0, reloj: 0, fase: i * 1.7, viva: false,
                          mirandoDerecha: true };
    }
    this.releer();
  },

  // Se llama al empezar la partida: fija qué mascota se lleva, según lo que
  // haya elegido en la tienda. Durante la partida no cambia.
  releer() {
    this.id = MetaProgreso.mascotaEquipada || '';
    this.def = MASCOTAS[this.id] || null;
    // Nerón: se deja escrito en MetaProgreso para que lo aplique `ganar()` una
    // sola vez, en vez de repetirlo en los tres sitios que reparten denarios.
    MetaProgreso.factorDenarios = this.def && this.def.factorDenarios
                                  ? 1 + this.def.factorDenarios : 1;
    if (!this.activas) return;
    for (let i = 0; i < MAX; i++) {
      this.activas[i].reloj = 0;
      this.activas[i].viva = false;
    }
  },

  actualizar(dt, jugadores, ctx) {
    if (!this.def) return;
    const habilidad = HABILIDADES[this.def.habilidad];

    for (let i = 0; i < jugadores.length && i < MAX; i++) {
      const j = jugadores[i];
      const m = this.activas[i];

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

      if (!habilidad) continue;          // pasiva: solo se dibuja
      m.reloj -= dt;
      if (m.reloj > 0) continue;
      m.reloj = this.def.cada;
      habilidad(this.def, m, j, ctx);
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
  dibujar(ctx, jugadores) {
    if (!this.def) return;
    const d = this.def;
    const idAtlas = 'mascota' + this.id.charAt(0).toUpperCase() + this.id.slice(1);
    const meta = Recursos.meta(idAtlas);

    ctx.save();
    for (let i = 0; i < jugadores.length && i < MAX; i++) {
      const m = this.activas[i];
      if (!m.viva) continue;
      const y = m.y + Math.sin(m.fase) * FLOTE;

      // Sombra en el suelo: sin ella el bicho parece pegado al cristal.
      const rSombra = meta ? meta.w / ESCALA_ARTE * 0.35 : RADIO_DIBUJO * 0.9;
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.ellipse(m.x, m.y + 1, rSombra, rSombra * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      if (meta) {
        const img = m.mirandoDerecha ? Recursos.imagen(idAtlas) : Recursos.espejo(idAtlas);
        if (img) {
          const w = meta.w / ESCALA_ARTE;
          const h = meta.h / ESCALA_ARTE;
          ctx.drawImage(img, 0, 0, meta.w, meta.h, m.x - w / 2, y - h, w, h);
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
const HABILIDADES = {
  // KARIM: muerde al más cercano. Daño directo y sin proyectil — la mordida se
  // resuelve en el sitio, así que no gasta pool de proyectiles ni puede fallar.
  morder(def, m, j, ctx) {
    const presa = enemigoMasCercano(ctx.enemigos, m.x, m.y, def.alcance);
    if (!presa) { m.reloj = 0.3; return; }   // sin blanco, reintenta pronto
    let dx = presa.x - m.x;
    let dy = presa.y - m.y;
    const dist = Math.hypot(dx, dy) || 1;
    ctx.enemigos.danyar(presa, def.danyo, dx / dist, dy / dist, 60);
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
    j.vida = Math.min(j.vidaMaxima, j.vida + def.cura);
    VFX.numero(j.x, j.y - 22, def.cura, ctx.rng);
  },

  // OREO: denarios directos al bolsillo. No caen al suelo por lo mismo que el
  // huevo, y porque un denario tirado en el minuto 20 no lo recoge nadie.
  escarbar(def, m, j, ctx) {
    MetaProgreso.ganar(def.denarios);
  },

  // POLLITO: los de alrededor salen huyendo un rato. No hace daño: abre hueco,
  // que con la horda encima vale más que matar a cuatro.
  //
  // El búfer de índices está preasignado arriba, no se crea uno por chillido:
  // esto puede dispararse con la pantalla llena.
  espantar(def, m, j, ctx) {
    const n = enemigosEnRadio(ctx.enemigos, m.x, m.y, def.radio, BUFER);
    for (let i = 0; i < n; i++) ctx.enemigos.espantar(BUFER[i], def.duracion);
    VFX.sacudir(1.5);
  }
};
