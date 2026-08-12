import { ESCALA_ARTE } from '../core/constantes.js';
import { Recursos } from '../core/recursos.js';
import { MetaProgreso } from '../core/metaProgreso.js';
import { PERSONAJES } from '../datos/personajes.js';
import { PASIVOS } from '../datos/pasivos.js';
import { POTENCIADORES } from '../datos/potenciadores.js';
import { MASCOTAS } from '../datos/mascotas.js';
import { Progresion, xpNecesaria, REROLLS } from '../sistemas/progresion.js';
import { GestorAudio } from '../sistemas/audio.js';

// --- Animación ---------------------------------------------------------------
//
// El jugador usa hojas de fotogramas reales, generadas offline por
// herramientas/procesar-assets.ps1 a partir de la única pose de cada personaje.
// El atlas trae los clips con nombre: `quieto` (2 fotogramas) y `andar` (4).
//
// Esto sustituye al "bombeo de zancada" que deformaba el sprite en tiempo real
// cortándolo en franjas. Aquel apaño escalaba las dos piernas a la vez, o sea
// simétricamente, y un paso es justo lo contrario: una pierna sube mientras la
// otra apoya. Se veía patizambo, y encima reescalar en fracciones de píxel cada
// frame hacía hormiguear los bordes. Ahora es un drawImage y punto.
//
// Repliegue: si un personaje no trae clips (arte antiguo, o un placeholder), se
// dibuja el fotograma 0 y no pasa nada.
const CLIP_QUIETO  = 'quieto';
const CLIP_ANDAR   = 'andar';
const CLIP_LATERAL = 'andar_lateral';

// Estadísticas base de la sección 6 del plan.
const BASE = {
  vidaMaxima: 100,
  // 64 y no los 85 del plan: TODO el juego baja un 25% de velocidad, jugador y
  // bestiario a la vez (ver la cabecera de datos/enemigos.js). La proporción
  // entre ambos no cambia —huir sigue funcionando igual de bien— pero el ritmo
  // general afloja y da tiempo a leer la pantalla antes de decidir.
  velocidad: 64,          // px lógicos por segundo
  armadura: 0,
  regeneracion: 0,
  radioRecogida: 40,
  // Subido junto con el resto del bestiario (herramientas/procesar-assets.ps1,
  // datos/enemigos.js): los cuatro personajes crecieron de 22 a 26 de alto
  // lógico, así que el círculo de colisión tiene que crecer con ellos o
  // quedaría flotando dentro de una silueta más grande de lo que protege.
  //
  // El radio de RECOGIDA no cambia con esto: es una distancia de juego, no un
  // cuerpo, y no tiene por qué escalar con el tamaño del personaje.
  radio: 8                // círculo de colisión
};

// Invulnerabilidad tras golpe. Es lo que convierte el daño de contacto en tics:
// estar metido en un enjambre son 2 impactos por segundo, no 60.
const INVULNERABILIDAD = 0.5;
const PARPADEO = 0.07;     // periodo del destello mientras dura

// Escudo del potenciador Égida (datos/potenciadores.js). Dos números, no uno:
// cuánto hay que aguantar SIN QUE TE TOQUEN para que empiece a rellenarse, y
// cuánto tarda entonces en llenarse del todo. La espera es lo que hace que el
// escudo premie salir del montón; sin ella sería vida máxima con otro nombre.
const ESPERA_ESCUDO = 6;
const RELLENO_ESCUDO = 4;

export class Jugador {
  constructor(idPersonaje = 'eric') {
    const def = PERSONAJES[idPersonaje] || PERSONAJES.eric;
    this.id = idPersonaje;
    this.def = def;
    this.personaje = def.sprite;
    this.arsenal = null;          // lo enchufa quien crea al jugador

    // --- Progresión ------------------------------------------------------
    this.nivel = 1;
    this.xp = 0;
    this.xpNecesaria = xpNecesaria(1);
    this.pasivos = {};            // id -> nivel
    this.rerolls = REROLLS;
    // Subida de nivel automática. Solo surte efecto con las ocho ranuras llenas
    // (ver Progresion.puedeAutomatizar); se enciende desde la ficha o desde el
    // propio menú de subida de nivel.
    this.autoNivel = false;
    // Lanzallamas prestado por un consumible: segundos que le quedan y su
    // propia recarga. Vive en el jugador y no en el arsenal porque no ocupa
    // ranura ni sube de nivel: es una ayuda temporal, no un arma.
    this.llamarada = 0;
    this.relojLlamarada = 0;

    this.x = 0; this.y = 0;
    this.xPrev = 0; this.yPrev = 0;
    this.xVista = 0; this.yVista = 0;

    // Estadísticas derivadas. NUNCA se escriben a mano: salen de la base, los
    // modificadores del personaje y los pasivos, y las recalcula recalcularStats.
    this.vidaMaxima = 0;
    this.velocidad = 0;
    this.armadura = 0;
    this.regeneracion = 0;
    this.radioRecogida = 0;
    this.bonusDanyo = 0;
    this.reduccionRecarga = 0;
    this.bonusArea = 0;
    this.recalcularStats();
    this.vida = this.vidaMaxima;
    this.radio = BASE.radio;
    // Cuerpo físico. Los cuatro personajes comparten marco de 32x32 lógicos y
    // sus siluetas miden 12-16 de ancho, así que el radio de daño (10) ya cubre
    // la silueta y no hay que derivarlo del sprite como en los enemigos. Que sea
    // el mismo para los cuatro es justo lo que pedía el plan: una única caja.
    this.radioCuerpo = BASE.radio;

    this.invulnerable = 0;         // segundos restantes de i-frames
    this.abatido = false;
    this.inmortal = false;         // depuración: permite medir sin morir
    this.golpesRecibidos = 0;

    // Reanimación en cooperativo. 0..1: al llegar a 1 el jugador se levanta.
    // NO es un contador de segundos porque el ritmo al que sube depende de si
    // hay alguien cerca del ataúd — ver reanimar() en main.js.
    this.reanimacion = 0;

    // Escudo del potenciador Égida. `escudo` es lo que queda ahora mismo y
    // `relojEscudo` cuenta el tiempo desde el último golpe.
    this.escudo = this.escudoMax;
    this.relojEscudo = 0;
    // Vidas extra de la Moneda de Caronte ya gastadas. Va APARTE del techo
    // porque recalcularStats() rehace `resurreccionesMax` en cada subida de
    // nivel: si el contador de gastadas viviera ahí, subir de nivel devolvería
    // todas las vidas extra que ya se hubieran usado.
    this.resurreccionesUsadas = 0;

    this.mirandoDerecha = true;
    this.andando = false;
    this.lateral = false;    // se mueve más en horizontal que en vertical
    this.magAndar = 0;       // 0..1, cuánto se inclina el stick

    this.clip = CLIP_QUIETO;
    this.frame = 0;
    this.relojAnim = 0;
  }

  // Recalcula todo desde cero: base del plan, modificadores del personaje y
  // pasivos. Desde cero y no incremental a propósito — sumar sobre lo ya sumado
  // acumula errores de redondeo y hace imposible quitar un pasivo si algún día
  // hiciera falta.
  //
  // 'suma' añade tal cual (armadura, regeneración). 'factor' es porcentual
  // acumulativo sobre el valor ya modificado por el personaje.
  recalcularStats() {
    const mods = this.def.mods;
    const vidaAnterior = this.vidaMaxima;

    this.vidaMaxima = BASE.vidaMaxima * (mods.vidaMaxima || 1);
    this.velocidad = BASE.velocidad * (mods.velocidad || 1);
    this.radioRecogida = BASE.radioRecogida * (mods.radioRecogida || 1);
    this.armadura = BASE.armadura;
    this.regeneracion = BASE.regeneracion;
    this.bonusDanyo = 0;
    this.reduccionRecarga = 0;
    this.bonusArea = 0;
    // Techos que llenan los potenciadores permanentes. Se reinician aquí, como
    // todo lo demás, porque este método se vuelve a llamar en cada subida de
    // nivel y si no se acumularían sobre sí mismos.
    this.escudoMax = 0;
    this.resurreccionesMax = 0;
    this.bonusXp = 0;              // Plinio el Búho

    // MASCOTA equipada (datos/mascotas.js). Las pasivas declaran
    // `campo`/`tipo`/`valor` igual que un pasivo o un potenciador, así que se
    // aplican con el mismo bucle y no hacen falta ni un campo ni un mecanismo
    // nuevos. Va la PRIMERA de las tres capas porque es lo que llevas puesto
    // antes de empezar, igual que los potenciadores.
    const mascota = MASCOTAS[MetaProgreso.mascotaEquipada];
    if (mascota && mascota.campo) {
      if (mascota.tipo === 'suma') this[mascota.campo] += mascota.valor;
      else this[mascota.campo] *= (1 + mascota.valor);
    }

    // Potenciadores permanentes (denarios, ver core/metaProgreso.js): la base
    // de la que arranca CUALQUIER personaje en CUALQUIER partida, así que se
    // aplican antes que los pasivos —los de esta partida— con el mismo
    // mecanismo exacto ('suma'/'factor' sobre `campo`).
    for (const id in MetaProgreso.potenciadores) {
      const def = POTENCIADORES[id];
      if (!def) continue;
      const nivel = MetaProgreso.potenciadores[id];
      if (def.tipo === 'suma') this[def.campo] += def.valor * nivel;
      else this[def.campo] *= (1 + def.valor * nivel);
    }

    for (const id in this.pasivos) {
      const def = PASIVOS[id];
      if (!def) continue;
      const nivel = this.pasivos[id];
      if (def.tipo === 'suma') this[def.campo] += def.valor * nivel;
      else this[def.campo] *= (1 + def.valor * nivel);
    }

    // La recarga no puede llegar a cero por muchas clepsidras que se acumulen.
    if (this.reduccionRecarga > 0.7) this.reduccionRecarga = 0.7;

    // El escudo en curso no puede pasarse de su techo, pero tampoco se rellena
    // aquí: recalcularStats() se llama en cada subida de nivel, y regalar el
    // escudo entero en cada una lo convertiría en "sube de nivel para curarte".
    if (this.escudo > this.escudoMax) this.escudo = this.escudoMax;

    // Al ampliar la vida máxima se conserva lo que faltaba, no el porcentaje:
    // si te quedaban 20 de 100, te quedan 20 de 120, no 24.
    if (vidaAnterior > 0 && this.vidaMaxima > vidaAnterior && this.vida !== undefined) {
      // el ánfora cura aparte, en progresion.js
    }
  }

  // Experiencia. Puede subir VARIOS niveles de golpe con una gema dorada, y cada
  // subida encola su propia elección. La lógica en sí —solitario o barra
  // compartida en cooperativo— vive en Progresion, que es quien conoce al
  // resto de la partida; el jugador solo sabe pedir que le sumen XP.
  ganarXp(cantidad, jugadores) {
    if (this.abatido) return;
    Progresion.ganarXp(this, cantidad, jugadores);
  }

  // Reducción PLANA por armadura, nunca porcentual, pero con un mínimo de 1: si
  // la armadura pudiera anular el daño, un pasivo barato haría inmune al jugador
  // frente a las serpientes durante los 20 minutos.
  recibirDanyo(cantidad) {
    if (this.abatido || this.invulnerable > 0 || this.inmortal) return false;
    let danyo = Math.max(1, cantidad - this.armadura);

    // El ESCUDO se come el golpe antes que la vida, y cualquier impacto corta
    // su recarga. Es lo contrario que la armadura: la armadura quita una
    // cantidad fija a cada golpe y el escudo aguanta un total, así que una
    // sirve contra la horda que pica de tres en tres y el otro contra el
    // mordisco de un jefe.
    this.relojEscudo = 0;
    if (this.escudo > 0) {
      const absorbido = Math.min(this.escudo, danyo);
      this.escudo -= absorbido;
      danyo -= absorbido;
    }

    this.vida -= danyo;
    this.invulnerable = INVULNERABILIDAD;
    this.golpesRecibidos++;
    GestorAudio.danyoJugador();
    if (this.vida <= 0) {
      this.vida = 0;
      // Moneda de Caronte: si queda alguna vida extra se gasta y se vuelve en
      // el sitio, sin ataúd y sin esperar a nadie. Va ANTES de darse por
      // abatido a propósito: en cooperativo, gastar la moneda es mejor que
      // hacer que un compañero cruce media pantalla a levantarte.
      if (this.resurreccionesUsadas < this.resurreccionesMax) {
        this.resurreccionesUsadas++;
        this.levantar();
      } else {
        this.abatido = true;
        this.reanimacion = 0;
      }
    }
    return true;
  }

  // Se levanta tras la cuenta de reanimación. A MEDIA VIDA y con los i-frames
  // puestos: a vida llena, dejarse caer sería una forma barata de curarse, y
  // sin invulnerabilidad se volvería a caer en el mismo frame, porque uno cae
  // justo donde estaba rodeado.
  levantar() {
    this.abatido = false;
    this.reanimacion = 0;
    this.vida = Math.max(1, Math.round(this.vidaMaxima * 0.5));
    this.invulnerable = INVULNERABILIDAD * 4;
    // Se vuelve con el escudo entero: si volvieras con él a cero, los seis
    // segundos de espera empezarían justo cuando más falta hace.
    this.escudo = this.escudoMax;
    this.relojEscudo = 0;
  }

  reiniciar() {
    this.recalcularStats();
    this.vida = this.vidaMaxima;
    this.invulnerable = 0;
    this.abatido = false;
    this.reanimacion = 0;
    this.golpesRecibidos = 0;
    this.escudo = this.escudoMax;
    this.relojEscudo = 0;
    this.resurreccionesUsadas = 0;
  }

  actualizar(dt, entrada) {
    this.xPrev = this.x;
    this.yPrev = this.y;

    if (this.invulnerable > 0) {
      this.invulnerable -= dt;
      if (this.invulnerable < 0) this.invulnerable = 0;
    }
    if (this.abatido) { this.andando = false; return; }

    // Regeneración de la corona de laurel. Goteo continuo, no por tics: a 0.2/s
    // un tic entero cada segundo se notaría como un parpadeo en la barra.
    if (this.regeneracion > 0 && this.vida < this.vidaMaxima) {
      this.vida = Math.min(this.vidaMaxima, this.vida + this.regeneracion * dt);
    }

    // Recarga del escudo. Solo tras ESPERA_ESCUDO segundos sin recibir ni un
    // golpe, y luego progresiva. La espera es lo que hace que el escudo premie
    // salir del montón en vez de quedarse dentro: si se rellenara al momento
    // sería vida máxima disfrazada.
    if (this.escudoMax > 0) {
      this.relojEscudo += dt;
      if (this.relojEscudo >= ESPERA_ESCUDO && this.escudo < this.escudoMax) {
        this.escudo = Math.min(this.escudoMax,
                               this.escudo + this.escudoMax * dt / RELLENO_ESCUDO);
      }
    }

    const vx = entrada.ejeX * this.velocidad;
    const vy = entrada.ejeY * this.velocidad;
    this.x += vx * dt;
    this.y += vy * dt;

    const mag = Math.hypot(entrada.ejeX, entrada.ejeY);
    this.andando = mag > 0.02;
    this.magAndar = Math.min(1, mag);
    if (this.andando) {
      // Manda el eje dominante. El sprite está dibujado de frente, así que
      // moverse en horizontal es justo lo que peor se lee: hay un clip aparte
      // con el cuerpo escorado hacia donde va.
      this.lateral = Math.abs(entrada.ejeX) > Math.abs(entrada.ejeY);
      if (entrada.ejeX > 0.05) this.mirandoDerecha = true;
      else if (entrada.ejeX < -0.05) this.mirandoDerecha = false;
    }
    this._animar(dt);
  }

  // Avanza el clip que toca. La cadencia del paso sigue al stick: andando
  // despacio, los pasos salen más lentos, que es lo que espera la mano.
  _animar(dt) {
    const meta = Recursos.meta(this.personaje);
    const clips = meta && meta.clips;
    if (!clips) return;

    let nombre = CLIP_QUIETO;
    if (this.andando) {
      nombre = this.lateral && clips[CLIP_LATERAL] ? CLIP_LATERAL : CLIP_ANDAR;
    }
    if (nombre !== this.clip) {
      // Al cambiar de frontal a lateral NO se reinicia el fotograma: los dos
      // ciclos tienen la misma longitud y la misma fase, así que conservarlo
      // hace que girar en marcha no dé un tirón en el paso.
      const mismoCiclo = this.clip !== CLIP_QUIETO && nombre !== CLIP_QUIETO;
      this.clip = nombre;
      if (!mismoCiclo) { this.frame = 0; this.relojAnim = 0; }
    }
    const clip = clips[nombre];
    if (!clip || clip.n <= 1) { this.frame = 0; return; }

    const fps = this.andando ? clip.fps * this.magAndar : clip.fps;
    if (fps <= 0) return;
    const paso = 1 / fps;
    this.relojAnim += dt;
    while (this.relojAnim >= paso) {
      this.relojAnim -= paso;
      this.frame = (this.frame + 1) % clip.n;
    }
  }

  interpolar(alpha) {
    this.xVista = this.xPrev + (this.x - this.xPrev) * alpha;
    this.yVista = this.yPrev + (this.y - this.yPrev) * alpha;
  }

  // Un drawImage y nada más: el fotograma que toca de la hoja.
  //
  // El volteo sale de la copia espejada precacheada, igual que en los enemigos,
  // y esa copia está volteada fotograma a fotograma para que la animación no
  // corra del revés al mirar a la izquierda.
  //
  // El ancla es el centro de los pies. Todo se cuadra a píxel FÍSICO entero:
  // con el suavizado apagado, un destino fraccionario hace que el vecino más
  // próximo elija filas distintas cada frame y el sprite hierva.
  dibujar(ctx) {
    // CAÍDO: en su sitio va su ATAÚD, no el personaje tumbado ni el personaje
    // de pie como hasta ahora. Cada uno tiene el suyo y cuenta quién iba
    // dentro —el del Atleti, el del hámster, el del capibara, el de la
    // katana—, que en cooperativo es lo que dice a quién hay que ir a levantar
    // sin leer un nombre desde el otro lado de la pantalla.
    //
    // Se dibuja SIN parpadeo de i-frames y sin espejo: un ataúd no mira a
    // ningún lado y no está recibiendo golpes.
    if (this.abatido) {
      const metaAtaud = Recursos.meta(this.personaje + 'Ataud');
      const imgAtaud = Recursos.imagen(this.personaje + 'Ataud');
      if (!metaAtaud || !imgAtaud) return;
      const axF = Math.round(this.xVista * ESCALA_ARTE);
      const ayF = Math.round(this.yVista * ESCALA_ARTE);
      ctx.drawImage(imgAtaud,
        0, 0, metaAtaud.w, metaAtaud.h,
        (axF - (metaAtaud.w >> 1)) / ESCALA_ARTE, (ayF - metaAtaud.h) / ESCALA_ARTE,
        metaAtaud.w / ESCALA_ARTE, metaAtaud.h / ESCALA_ARTE);

      // Cuánto queda para levantarse, en un arco a los pies del ataúd. Va en el
      // MUNDO y no en el panel de la esquina a propósito: lo que hay que decidir
      // mirándolo es si te da tiempo a llegar hasta ahí, y eso se decide mirando
      // el sitio, no una esquina de la pantalla. Solo aparece si el contador ha
      // arrancado, así que en solitario —donde no hay reanimación— no sale nada.
      if (this.reanimacion > 0) {
        const cx = axF / ESCALA_ARTE;
        const cy = ayF / ESCALA_ARTE - 2;
        const r = 9;
        ctx.save();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(8,7,10,.65)';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = '#e8c23a';
        ctx.beginPath();
        ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, this.reanimacion));
        ctx.stroke();
        ctx.restore();
      }
      return;
    }

    // DOS HOJAS POR PERSONAJE SI EL ATLAS LAS TRAE: `<id>` mira a la derecha y
    // `<id>Izq` a la izquierda.
    //
    // Es mejor que espejar por código en cuanto el arte NO es simétrico: un
    // arma colgada de una cadera, la raya del pelo, una cicatriz. El espejo se
    // las cambia de lado cada vez que giras, y eso se nota más de lo que
    // parece porque girar es lo que más se hace en este juego.
    //
    // Si no hay hoja izquierda se sigue usando la copia espejada precacheada,
    // así que el arte antiguo y los placeholders siguen funcionando sin tocar
    // nada. Las dos hojas deben declarar los MISMOS clips: el reloj de
    // animación es uno solo y no se reinicia al girar.
    let meta = Recursos.meta(this.personaje);
    let img;
    if (this.mirandoDerecha) {
      img = Recursos.imagen(this.personaje);
    } else {
      const idIzq = this.personaje + 'Izq';
      const metaIzq = Recursos.meta(idIzq);
      if (metaIzq) { meta = metaIzq; img = Recursos.imagen(idIzq); }
      else img = Recursos.espejo(this.personaje);
    }
    if (!meta || !img) return;

    // Parpadeo de los i-frames. Se salta el sprite, no la barra de vida: durante
    // medio segundo hay que poder seguir leyendo cuánta queda.
    if (this.invulnerable > 0 &&
        (((this.invulnerable / PARPADEO) | 0) & 1) === 1) return;

    const clip = meta.clips && meta.clips[this.clip];
    const indice = clip ? clip.desde + this.frame : 0;

    const cxF = Math.round(this.xVista * ESCALA_ARTE);
    const cyF = Math.round(this.yVista * ESCALA_ARTE);

    ctx.drawImage(img,
      indice * meta.w, 0, meta.w, meta.h,
      (cxF - (meta.w >> 1)) / ESCALA_ARTE, (cyF - meta.h) / ESCALA_ARTE,
      meta.w / ESCALA_ARTE, meta.h / ESCALA_ARTE);
  }


}
