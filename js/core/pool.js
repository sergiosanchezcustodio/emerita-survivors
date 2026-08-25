// Object pool genérico. Cero `new` durante la partida: todo se preasigna al
// arrancar y se recicla. Sin esto, 800 entidades apareciendo y muriendo llenan
// la generación joven cada pocos segundos y el recolector mete un tirón
// justo cuando la pantalla está más llena.
//
// Los activos viven CONTIGUOS en [0, activos): dar de baja es intercambiar con
// el último y decrementar. Así el recorrido de cada frame es un for lineal sin
// huecos ni comprobaciones de "¿este está vivo?", y los índices que guarde la
// rejilla espacial son posiciones directas en `items`.
//
// Contrapartida: el orden cambia al liberar. Nada puede guardar el índice de una
// entidad de un frame para otro, y quien recorra liberando NO debe avanzar el
// contador en el paso en que ha liberado (ver Enemigos.reciclarLejanos).
export class Pool {
  constructor(fabrica, capacidad) {
    this.items = new Array(capacidad);
    for (let i = 0; i < capacidad; i++) this.items[i] = fabrica();

    // Un objeto RECIÉN SALIDO DE FÁBRICA que no se reparte nunca: es el patrón
    // con el que `vaciar` devuelve los demás a su estado inicial. Se guarda uno
    // en vez de volver a llamar a la fábrica mil veces, que sería asignar
    // memoria justo en lo que este pool existe para evitar.
    this._plantilla = fabrica();
    this._claves = Object.keys(this._plantilla);

    this.capacidad = capacidad;
    this.activos = 0;

    // Métricas para el overlay F3. `agotado` cuenta las peticiones rechazadas:
    // si sube, la capacidad se quedó corta y hay enemigos que no llegan a
    // aparecer, que es un fallo de balance silencioso si no se mide.
    this.pico = 0;
    this.agotado = 0;
  }

  // Devuelve un objeto ya construido, listo para reinicializar. null si el pool
  // está lleno: quien llama decide, pero jamás se asigna memoria de más.
  obtener() {
    if (this.activos >= this.capacidad) { this.agotado++; return null; }
    const obj = this.items[this.activos++];
    if (this.activos > this.pico) this.pico = this.activos;
    return obj;
  }

  // Da de baja el activo que ocupa la posición i.
  liberarEn(i) {
    const ultimo = --this.activos;
    if (i !== ultimo) {
      const tmp = this.items[i];
      this.items[i] = this.items[ultimo];
      this.items[ultimo] = tmp;
    }
  }

  // Da de baja a todos Y LOS DEVUELVE A SU ESTADO DE FÁBRICA.
  //
  // Lo segundo no estaba, y era un fallo de determinismo de los que no se ven
  // jugando. Los objetos no se liberan —ese es el punto del pool— pero tampoco
  // se limpiaban, así que al empezar una partida nueva los cuerpos seguían ahí
  // con los valores de la anterior, y encima en otro orden, porque dar de baja
  // intercambia posiciones. Si al reaparecer una entidad no se reescribía
  // alguno de sus cuarenta campos, nacía con un resto de la partida pasada.
  //
  // Lo midió la prueba de determinismo (core/determinismo.js), comparando la
  // misma partida con los pools recién puestos a cero contra los pools sucios
  // de haber jugado: al primer segundo, doce enemigos en un caso y dos en el
  // otro. Con la misma semilla y las mismas pulsaciones.
  //
  // Y no es una rareza de laboratorio: es la situación del COOPERATIVO ONLINE,
  // donde uno acaba de abrir el juego y otro lleva tres partidas. Sin esto, dos
  // jugadores no pueden simular la misma partida por bien que les llegue la red.
  //
  // El coste es un recorrido por la capacidad UNA VEZ POR PARTIDA, no por
  // fotograma: ni toca el presupuesto de los 60 fps ni asigna nada.
  vaciar() {
    this.activos = 0;
    const plantilla = this._plantilla;
    const claves = this._claves;
    for (let i = 0; i < this.items.length; i++) {
      const o = this.items[i];
      for (let k = 0; k < claves.length; k++) o[claves[k]] = plantilla[claves[k]];
    }
  }
}
