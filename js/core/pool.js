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

  // Los objetos siguen ahí, solo dejan de estar activos. No se libera memoria:
  // ese es justo el punto.
  vaciar() { this.activos = 0; }
}
