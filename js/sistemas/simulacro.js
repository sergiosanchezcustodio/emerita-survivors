import { ANCHO_LOGICO, ALTO_LOGICO } from '../core/constantes.js';

// Simulacro de oleadas (tecla 5).
//
// QUÉ ES Y QUÉ NO ES. Es una herramienta de PRUEBA: recorre la curva de veinte
// minutos de datos/niveles/merida.js y va soltando enemigos como lo hará la
// partida de verdad, para poder juzgar el daño, la subida de experiencia y el
// movimiento contra la presión real. Poner 500 serpientes de golpe con la tecla
// 2 dice si el motor aguanta, pero no dice nada sobre si el juego está bien
// calibrado: en una partida no aparecen 500 serpientes de golpe.
//
// NO es el director de la Fase 5. Le faltan los jefes (Fase 6), los cofres, las
// evoluciones y la serpiente dorada. Lo que sí es definitivo es el FORMATO: los
// eventos, la densidad, el escalado y los patrones viven ya en el nivel como
// datos puros, así que el director de la Fase 5 hereda todo esto y añade lo que
// falta en vez de sustituirlo.
//
// Los patrones son los cinco del plan:
//   anillo      distribución uniforme por el perímetro, fuera de cámara
//   linea       muro entrando por un borde
//   oleada      grupo compacto desde una dirección
//   cerco       rodean por los cuatro lados a la vez
//   individual  élites

// Margen de aparición fuera de cámara: nadie ve nacer a nadie.
const MARGEN_APARICION = 40;
const DISPERSION = 34;                 // grosor del anillo de entrada

// El cerco entra más cerca que el anillo. Es su gracia: no da tiempo a rodearlo,
// hay que abrirse paso. Aun así queda fuera de pantalla.
const MARGEN_CERCO = 18;

// Semiejes del rectángulo de aparición, medidos desde el centro de la cámara.
const SEMI_X = ANCHO_LOGICO / 2 + MARGEN_APARICION;
const SEMI_Y = ALTO_LOGICO / 2 + MARGEN_APARICION;

// --- Geometría ---------------------------------------------------------------
// Punto del PERÍMETRO del rectángulo de pantalla a partir de un recorrido
// 0..1. Perímetro y no ángulo: un ángulo uniforme sobre una elipse NO da puntos
// uniformes sobre su borde, se apelotonan en los extremos del eje largo. Medido
// con 500 enemigos, los octantes laterales recibían el doble que los de arriba.
//
// Escribe en `punto` en vez de devolver un objeto: esto se llama cientos de
// veces por oleada y crear un literal por llamada sería asignar en caliente.
const punto = { x: 0, y: 0 };

function perimetro(t, semiX, semiY) {
  const ladoH = semiX * 2;
  const ladoV = semiY * 2;
  const total = (ladoH + ladoV) * 2;
  let d = t * total;
  if (d < ladoH)                    { punto.x = -semiX + d;                     punto.y = -semiY; }
  else if (d < ladoH + ladoV)       { punto.x = semiX;                          punto.y = -semiY + (d - ladoH); }
  else if (d < ladoH * 2 + ladoV)   { punto.x = semiX - (d - ladoH - ladoV);    punto.y = semiY; }
  else                              { punto.x = -semiX;                         punto.y = semiY - (d - ladoH * 2 - ladoV); }
}

// Empujón hacia fuera para que el anillo tenga grosor y no sea una línea de
// enemigos perfectamente alineados, que se lee como un fallo.
function ensanchar(fuera) {
  const nx = punto.x > 0 ? 1 : (punto.x < 0 ? -1 : 0);
  const ny = punto.y > 0 ? 1 : (punto.y < 0 ? -1 : 0);
  punto.x += nx * fuera * (Math.abs(punto.x) === SEMI_X ? 1 : 0.35);
  punto.y += ny * fuera * (Math.abs(punto.y) === SEMI_Y ? 1 : 0.35);
}

// --- Patrones ----------------------------------------------------------------
// Todos reciben ya resueltos el centro de cámara, la mezcla de tipos y las
// escalas de vida y daño del minuto en curso.

function patronAnillo(enemigos, cx, cy, n, tipos, rng, eV, eD) {
  for (let i = 0; i < n; i++) {
    perimetro(rng(), SEMI_X, SEMI_Y);
    ensanchar(rng() * DISPERSION);
    const tipo = tipos[(rng() * tipos.length) | 0];
    if (!enemigos.aparecer(tipo, cx + punto.x, cy + punto.y, eV, eD)) return;
  }
}

// Muro por un borde. Se reparten a lo largo de ese lado con separación regular y
// en dos filas: una fila sola se atraviesa por un hueco, dos hay que romperlas.
function patronLinea(enemigos, cx, cy, n, tipos, rng, eV, eD) {
  const lado = (rng() * 4) | 0;        // 0 arriba, 1 derecha, 2 abajo, 3 izquierda
  const horizontal = lado === 0 || lado === 2;
  const largo = horizontal ? SEMI_X * 2 : SEMI_Y * 2;
  const porFila = Math.ceil(n / 2);
  const paso = largo / (porFila + 1);

  for (let i = 0; i < n; i++) {
    const fila = (i / porFila) | 0;
    const k = i % porFila;
    const a = -largo / 2 + paso * (k + 1) + (rng() - 0.5) * paso * 0.3;
    const b = (horizontal ? SEMI_Y : SEMI_X) + fila * 22;
    if (horizontal) { punto.x = a; punto.y = lado === 0 ? -b : b; }
    else            { punto.x = lado === 3 ? -b : b; punto.y = a; }
    const tipo = tipos[(rng() * tipos.length) | 0];
    if (!enemigos.aparecer(tipo, cx + punto.x, cy + punto.y, eV, eD)) return;
  }
}

// Grupo compacto desde una dirección: un tramo corto del perímetro, no un punto.
// Con un punto salen todos uno encima de otro y la separación los dispara como
// perdigones en cuanto entran.
function patronOleada(enemigos, cx, cy, n, tipos, rng, eV, eD) {
  const centro = rng();
  const arco = 0.10;                   // décima parte del perímetro
  for (let i = 0; i < n; i++) {
    let t = centro + (rng() - 0.5) * arco;
    t -= Math.floor(t);
    perimetro(t, SEMI_X, SEMI_Y);
    ensanchar(rng() * DISPERSION * 1.5);
    const tipo = tipos[(rng() * tipos.length) | 0];
    if (!enemigos.aparecer(tipo, cx + punto.x, cy + punto.y, eV, eD)) return;
  }
}

// Cerco: reparto REGULAR por todo el perímetro, no aleatorio. La diferencia se
// nota jugando — el azar deja huecos por los que escapar sin pelear, y el cerco
// existe justo para que no los haya.
function patronCerco(enemigos, cx, cy, n, tipos, rng, eV, eD) {
  const semiX = ANCHO_LOGICO / 2 + MARGEN_CERCO;
  const semiY = ALTO_LOGICO / 2 + MARGEN_CERCO;
  const desfase = rng();               // el cerco no empieza siempre en la misma esquina
  for (let i = 0; i < n; i++) {
    let t = desfase + i / n;
    t -= Math.floor(t);
    perimetro(t, semiX, semiY);
    const tipo = tipos[(rng() * tipos.length) | 0];
    if (!enemigos.aparecer(tipo, cx + punto.x, cy + punto.y, eV, eD)) return;
  }
}

function patronIndividual(enemigos, cx, cy, n, tipos, rng, eV, eD) {
  for (let i = 0; i < n; i++) {
    perimetro(rng(), SEMI_X, SEMI_Y);
    const tipo = tipos[(rng() * tipos.length) | 0];
    enemigos.aparecer(tipo, cx + punto.x, cy + punto.y, eV, eD);
  }
}

const PATRONES = {
  anillo: patronAnillo,
  linea: patronLinea,
  oleada: patronOleada,
  cerco: patronCerco,
  individual: patronIndividual
};

// Interpolación lineal sobre las marcas de densidad del nivel.
function topeEn(marcas, t) {
  if (!marcas || marcas.length === 0) return Infinity;
  if (t <= marcas[0].t) return marcas[0].max;
  for (let i = 1; i < marcas.length; i++) {
    if (t <= marcas[i].t) {
      const a = marcas[i - 1], b = marcas[i];
      return a.max + (b.max - a.max) * (t - a.t) / (b.t - a.t);
    }
  }
  return marcas[marcas.length - 1].max;
}

export const Simulacro = {
  activo: false,
  t: 0,                    // segundos de partida simulada
  nivel: null,
  rng: null,
  relojes: null,           // acumulador por evento, preasignado en iniciar()
  tope: 0,
  ultimoPatron: '',
  hito: '',                // hito recién cruzado, para el aviso en pantalla
  hitoRestante: 0,

  iniciar(nivel, rng) {
    this.nivel = nivel;
    this.rng = rng;
    const n = (nivel.eventos && nivel.eventos.length) || 0;
    this.relojes = new Float32Array(n);
    this.reiniciar();
  },

  reiniciar() {
    this.t = 0;
    this.hito = '';
    this.hitoRestante = 0;
    this.ultimoPatron = '';
    if (this.relojes) this.relojes.fill(0);
  },

  // Encender arranca SIEMPRE desde el minuto 0. Un simulacro que continúa por
  // donde iba no sirve para comparar dos ajustes: hay que poder repetir la misma
  // situación con la misma semilla, que es el criterio 10 del plan.
  alternar() {
    this.activo = !this.activo;
    if (this.activo) this.reiniciar();
    return this.activo;
  },

  // Salta hacia delante en la línea temporal. Probar el minuto 16 esperando
  // dieciséis minutos no es probar, es esperar.
  saltar(segundos) {
    if (!this.activo) return;
    this.t = Math.max(0, this.t + segundos);
    if (this.relojes) this.relojes.fill(0);
  },

  actualizar(dt, enemigos, camara) {
    if (!this.activo || !this.nivel) return;

    const anterior = this.t;
    this.t += dt;
    if (this.hitoRestante > 0) this.hitoRestante -= dt;

    // Aviso de jefe. El simulacro no lo invoca —los jefes son la Fase 6 y sin
    // sus fases de patrón serían un saco de vida ambulante que estropea justo la
    // lectura que se está midiendo— pero sí dice cuándo tocaría.
    const hitos = this.nivel.hitos;
    if (hitos) {
      for (let i = 0; i < hitos.length; i++) {
        if (anterior < hitos[i].t && this.t >= hitos[i].t) {
          this.hito = hitos[i].texto;
          this.hitoRestante = 6;
        }
      }
    }

    const esc = this.nivel.escalado || { vida: 0, danyo: 0 };
    const minutos = this.t / 60;
    const escalaVida = 1 + esc.vida * minutos;
    const escalaDanyo = 1 + esc.danyo * minutos;

    this.tope = topeEn(this.nivel.densidad, this.t);

    const eventos = this.nivel.eventos;
    for (let i = 0; i < eventos.length; i++) {
      const ev = eventos[i];
      if (this.t < ev.desde || this.t >= ev.hasta) continue;

      this.relojes[i] += dt;
      if (this.relojes[i] < ev.cada) continue;
      this.relojes[i] -= ev.cada;

      const individual = ev.patron === 'individual';
      // El techo de densidad frena a las fuentes de masa, pero NUNCA a un élite:
      // si la mantícora del minuto 5 no aparece porque hay cola de serpientes,
      // desaparece la única razón para dejar de huir y plantarse a pelear.
      if (!individual && enemigos.activos + ev.cantidad > this.tope) continue;

      const fn = PATRONES[ev.patron];
      if (!fn) continue;
      fn(enemigos, camara.x, camara.y, ev.cantidad, ev.tipos, this.rng,
         escalaVida, escalaDanyo);
      this.ultimoPatron = ev.patron;
    }
  },

  // Reloj en mm:ss. Se construye una cadena por frame y solo con el simulacro
  // encendido; es texto de la interfaz, no del bucle de entidades.
  get reloj() {
    const s = Math.floor(this.t);
    return `${String((s / 60) | 0).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }
};

// Aparición suelta, para los atajos de prueba 1-4 de main.js. Comparte la
// geometría del anillo con el simulacro: si la aparición de prueba y la de la
// partida usaran códigos distintos, probar una no diría nada de la otra.
export function aparecerTanda(enemigos, camara, cantidad, mezcla, rng) {
  patronAnillo(enemigos, camara.x, camara.y, cantidad, mezcla, rng, 1, 1);
}
