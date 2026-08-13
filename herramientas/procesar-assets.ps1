# ---------------------------------------------------------------------------
# procesar-assets.ps1 - Convierte las ilustraciones de resources/ en sprites.
#
# Herramienta OFFLINE. No forma parte del juego: se ejecuta a mano, produce
# PNG y JSON planos, y el motor solo consume su salida. La regla de cero
# dependencias del proyecto se refiere al juego, no a este utillaje.
#
# Pasos: recorte de fondo -> medicion de silueta -> encuadre -> reduccion.
#
#   .\herramientas\procesar-assets.ps1
# ---------------------------------------------------------------------------
Add-Type -AssemblyName System.Drawing

Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public class Procesador {

    // Estado del recorte de una imagen. Se pasa entero para no arrastrar diez
    // parametros por todas las funciones.
    class Contexto {
        public byte[] px; public int stride, w, h;
        public int[] pal;          // tonos dominantes del borde
        public int umbral;         // tolerancia de coincidencia con la paleta
    }

    // Devuelve: siluetaW|siluetaH|ratio|frameW|frameH|anclaX|anclaY|pctOpaco|fondo
    public static string Procesar(string entrada, string salida, int altoLog,
                                  int escala, int tol, int anchoLogFijo,
                                  bool dominante) {

        // --- 1. Carga normalizada a 32bpp ARGB -----------------------------
        Contexto c = new Contexto();
        using (Bitmap orig = new Bitmap(entrada)) {
            c.w = orig.Width; c.h = orig.Height;
            using (Bitmap src = new Bitmap(c.w, c.h, PixelFormat.Format32bppArgb)) {
                using (Graphics g = Graphics.FromImage(src)) { g.DrawImage(orig, 0, 0, c.w, c.h); }
                BitmapData d = src.LockBits(new Rectangle(0, 0, c.w, c.h),
                    ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
                c.stride = d.Stride;
                c.px = new byte[c.stride * c.h];
                Marshal.Copy(d.Scan0, c.px, 0, c.px.Length);
                src.UnlockBits(d);
            }
        }
        byte[] b = c.px;
        int w = c.w, h = c.h, stride = c.stride;

        // --- 2. ¿La fuente ya trae transparencia? --------------------------
        // Si la trae, se respeta tal cual y NO se toca el color. Meter aqui el
        // recorte por color solo puede estropearlo: con el borde ya vacio la
        // paleta se muestrearia sobre pixeles transparentes y acabaria borrando
        // partes de la figura que casualmente coincidan.
        int transparentes = 0;
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                if (b[y * stride + x * 4 + 3] < 16) transparentes++;
            }
        }
        bool alfaPropia = transparentes * 100L > (long)w * h * 3;

        bool[] fondo = new bool[w * h];
        Queue<int> cola = new Queue<int>();

        if (alfaPropia) {
            for (int y = 0; y < h; y++) {
                for (int x = 0; x < w; x++) {
                    if (b[y * stride + x * 4 + 3] < 16) fondo[y * w + x] = true;
                }
            }
        } else {
            // --- 3. Recorte por inundacion desde los bordes ----------------
            c.pal = PaletaBorde(c);
            c.umbral = tol * 3;
            for (int x = 0; x < w; x++) {
                Sembrar(c, fondo, cola, x, 0);
                Sembrar(c, fondo, cola, x, h - 1);
            }
            for (int y = 0; y < h; y++) {
                Sembrar(c, fondo, cola, 0, y);
                Sembrar(c, fondo, cola, w - 1, y);
            }
            Inundar(c, fondo, cola);

            // Segunda pasada: bolsas de fondo que la figura encierra (entre las
            // piernas, bajo un brazo). El relleno desde el borde no las alcanza.
            // Se siembra solo con coincidencia casi exacta para no comerse detalle.
            for (int y = 0; y < h; y++) {
                for (int x = 0; x < w; x++) {
                    if (fondo[y * w + x]) continue;
                    if (EsFondo(c, x, y, 12)) { fondo[y * w + x] = true; cola.Enqueue(y * w + x); }
                }
            }
            Inundar(c, fondo, cola);
        }

        // Aplica el alfa y suaviza el halo del antialias del borde
        int minX = w, minY = h, maxX = -1, maxY = -1, opacos = 0;
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int p = y * stride + x * 4;
                if (fondo[y * w + x]) { b[p + 3] = 0; continue; }
                if (!alfaPropia) {
                    // Suaviza el halo del antialias contra el fondo recortado.
                    // Con alfa propia no hace falta: ya viene bien resuelto.
                    int dist = DistFondo(c, x, y);
                    if (dist < c.umbral && Vecino(fondo, w, h, x, y)) {
                        int a = dist * 255 / c.umbral;
                        if (a < b[p + 3]) b[p + 3] = (byte)a;
                    }
                }
                if (b[p + 3] > 8) {
                    opacos++;
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }
        if (maxX < 0) return "VACIA";

        int silW = maxX - minX + 1, silH = maxY - minY + 1;
        double ratio = (double)silW / silH;

        // --- 4. Encuadre ---------------------------------------------------
        int frameW, frameH, destW, destH, offX, offY;
        frameH = altoLog * escala;
        if (anchoLogFijo > 0) {
            // Personajes: marco fijo comun, la silueta se ajusta dentro
            frameW = anchoLogFijo * escala;
            double fit = Math.Min((double)frameW / silW, (double)frameH / silH);
            destW = Math.Max(1, (int)Math.Round(silW * fit));
            destH = Math.Max(1, (int)Math.Round(silH * fit));
            offX = (frameW - destW) / 2;
            offY = frameH - destH;              // apoyado en la linea de pies
        } else {
            // Enemigos: el ancho sale de la proporcion real medida
            int anchoLog = (int)Math.Round(altoLog * ratio);
            if (anchoLog % 2 != 0) anchoLog++;
            if (anchoLog < 2) anchoLog = 2;
            frameW = anchoLog * escala;
            destW = frameW; destH = frameH; offX = 0; offY = 0;
        }

        // --- 5. Reduccion ---------------------------------------------------
        // Dos metodos, y la eleccion la hace el catalogo con `dominante`:
        //
        //   media de area  — lo normal. Para ilustraciones con volumen y
        //     degradados, que es casi todo el bestiario.
        //   color dominante — para dibujo de TINTAS PLANAS con detalle fino,
        //     donde promediar inventa colores que no estan y lo emborrona.
        //     Ver EscalarDominante: es lo que salva el escudo del ataud.
        //
        // Este bucle estaba escrito aqui a mano y era el mismo que
        // EscalarBloque, asi que ahora se llama a la funcion y no hay dos
        // copias de la misma reduccion que puedan separarse.
        byte[] dst = new byte[frameW * 4 * frameH];
        int dStride = frameW * 4;

        if (dominante) {
            EscalarDominante(b, stride, w, h, minX, minY, silW, silH,
                             dst, dStride, offX, offY, destW, destH);
        } else {
            EscalarBloque(b, stride, w, h, minX, minY, silW, silH,
                          dst, dStride, offX, offY, destW, destH);
        }

        // --- 6. Remate: endurecer el alfa y tapar agujeros -----------------
        Rematar(dst, frameW, frameH, dStride);

        using (Bitmap salidaBmp = new Bitmap(frameW, frameH, PixelFormat.Format32bppArgb)) {
            BitmapData dd = salidaBmp.LockBits(new Rectangle(0, 0, frameW, frameH),
                ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
            for (int y = 0; y < frameH; y++)
                Marshal.Copy(dst, y * dStride, (IntPtr)(dd.Scan0.ToInt64() + y * dd.Stride), dStride);
            salidaBmp.UnlockBits(dd);
            salidaBmp.Save(salida, ImageFormat.Png);
        }

        // El indicador util es cuanto fondo se elimino, no el area de la caja:
        // una silueta puede tocar los cuatro bordes y estar bien recortada.
        int pctOpaco = (int)Math.Round(100.0 * opacos / ((double)w * h));
        return silW + "|" + silH + "|" + Math.Round(ratio, 2) + "|" +
               frameW + "|" + frameH + "|" + (frameW / 2) + "|" + frameH + "|" + pctOpaco;
    }

    // ---------------------------------------------------------------------
    // Retrato: recorte de la cabeza desde la ILUSTRACION ORIGINAL
    // ---------------------------------------------------------------------
    //
    // Del original, no del sprite del juego. El sprite mide 28x64 y su cabeza
    // son 20 pixeles: ampliarla para el panel daria una mancha. Aqui se recorta
    // de la fuente a resolucion completa (650x1492 en Eric) y se reduce una sola
    // vez al tamano final, asi que el retrato sale nitido y con detalle.
    //
    // Y NO se endurece el alfa ni se cuantiza: el panel de informacion es
    // interfaz, no pixel art. El juego va pixelado y las ventanas no tienen por
    // que; un retrato suave al lado de un mundo crujiente no desentona, se lee
    // como una ficha de personaje.
    //
    // Encuadre: se toma la franja superior de la silueta y se centra en el
    // centroide horizontal de ESA franja, no en el de la figura entera. Importa
    // porque un brazo estirado desplaza el centro del cuerpo pero no el de la
    // cabeza, y el retrato saldria descentrado.
    public static string RecortarCabeza(string entrada, string salida,
                                        int anchoSal, int altoSal,
                                        double fraccionAlto, double margen) {
        int w, h, stride;
        byte[] px;
        using (Bitmap orig = new Bitmap(entrada)) {
            w = orig.Width; h = orig.Height;
            using (Bitmap src = new Bitmap(w, h, PixelFormat.Format32bppArgb)) {
                using (Graphics g = Graphics.FromImage(src)) { g.DrawImage(orig, 0, 0, w, h); }
                BitmapData d = src.LockBits(new Rectangle(0,0,w,h), ImageLockMode.ReadOnly,
                                            PixelFormat.Format32bppArgb);
                stride = d.Stride;
                px = new byte[stride*h];
                Marshal.Copy(d.Scan0, px, 0, px.Length);
                src.UnlockBits(d);
            }
        }

        // Silueta completa
        int minY = h, maxY = -1, minX = w, maxX = -1;
        for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++)
                if (px[y*stride + x*4 + 3] > 40) {
                    if (y < minY) minY = y; if (y > maxY) maxY = y;
                    if (x < minX) minX = x; if (x > maxX) maxX = x;
                }
        if (maxY < 0) return "VACIA";

        int altoSil = maxY - minY + 1;
        int yFin = minY + (int)(altoSil * fraccionAlto);

        // Centroide horizontal SOLO de la franja de la cabeza
        long suma = 0; int cuenta = 0;
        int hMinX = w, hMaxX = -1;
        for (int y = minY; y <= yFin; y++)
            for (int x = minX; x <= maxX; x++)
                if (px[y*stride + x*4 + 3] > 40) {
                    suma += x; cuenta++;
                    if (x < hMinX) hMinX = x; if (x > hMaxX) hMaxX = x;
                }
        if (cuenta == 0) return "VACIA";
        int cx = (int)(suma / cuenta);

        // Caja de recorte. El ANCHO lo fija la cabeza; el ALTO sale de la
        // proporcion pedida y crece hacia ABAJO, hacia los hombros.
        //
        // Es un BUSTO, no una cabeza recortada en cuadrado. La ficha de jugador
        // reserva una columna alta y estrecha para el retrato, y meter ahi una
        // imagen cuadrada obliga a elegir entre dejar huecos o recortar media
        // cara. Encuadrando cabeza y hombros desde el principio, el retrato
        // llena su hueco tal cual y ademas se lee mejor: una cabeza flotando
        // sin cuello parece un icono, un busto parece una ficha de personaje.
        int altoCabeza = yFin - minY + 1;
        int anchoCabeza = hMaxX - hMinX + 1;
        int anchoCaja = (int)(Math.Max(altoCabeza, anchoCabeza) * (1.0 + margen));
        int altoCaja = (int)((long)anchoCaja * altoSal / anchoSal);
        int x0 = cx - anchoCaja / 2;
        int y0 = minY - (int)(altoCabeza * margen * 0.5);

        int dStride = anchoSal * 4;
        byte[] dst = new byte[dStride * altoSal];
        EscalarBloque(px, stride, w, h, x0, y0, anchoCaja, altoCaja,
                      dst, dStride, 0, 0, anchoSal, altoSal);

        using (Bitmap sal = new Bitmap(anchoSal, altoSal, PixelFormat.Format32bppArgb)) {
            BitmapData dd = sal.LockBits(new Rectangle(0,0,anchoSal,altoSal),
                                         ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
            for (int y = 0; y < altoSal; y++)
                Marshal.Copy(dst, y*dStride, (IntPtr)(dd.Scan0.ToInt64() + y*dd.Stride), dStride);
            sal.UnlockBits(dd);
            sal.Save(salida, ImageFormat.Png);
        }
        return anchoSal + "|" + altoSal + "|1";
    }

    // ---------------------------------------------------------------------
    // Retrato de CUERPO ENTERO, para la ficha de jugador
    // ---------------------------------------------------------------------
    //
    // Misma idea que RecortarCabeza y por los mismos motivos —se reduce UNA vez
    // desde la ilustracion original, sin endurecer alfa ni cuantizar— pero aqui
    // entra la figura completa: la ficha que se abre con Select ensena al
    // personaje de arriba abajo.
    //
    // La imagen sale AJUSTADA A LA SILUETA y centrada en su caja, con relleno
    // transparente por donde sobra. Asi la interfaz puede dibujarla sin mas: no
    // tiene que adivinar donde empieza la figura dentro del PNG ni recortar
    // margenes al vuelo, y todos los personajes ocupan su hueco igual aunque uno
    // sea mas ancho que otro.
    public static string RecortarCuerpo(string entrada, string salida,
                                        int anchoSal, int altoSal) {
        int w, h, stride;
        byte[] px;
        using (Bitmap orig = new Bitmap(entrada)) {
            w = orig.Width; h = orig.Height;
            using (Bitmap src = new Bitmap(w, h, PixelFormat.Format32bppArgb)) {
                using (Graphics g = Graphics.FromImage(src)) { g.DrawImage(orig, 0, 0, w, h); }
                BitmapData d = src.LockBits(new Rectangle(0,0,w,h), ImageLockMode.ReadOnly,
                                            PixelFormat.Format32bppArgb);
                stride = d.Stride;
                px = new byte[stride*h];
                Marshal.Copy(d.Scan0, px, 0, px.Length);
                src.UnlockBits(d);
            }
        }

        int minY = h, maxY = -1, minX = w, maxX = -1;
        for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++)
                if (px[y*stride + x*4 + 3] > 40) {
                    if (y < minY) minY = y; if (y > maxY) maxY = y;
                    if (x < minX) minX = x; if (x > maxX) maxX = x;
                }
        if (maxY < 0) return "VACIA";

        int silW = maxX - minX + 1;
        int silH = maxY - minY + 1;

        // Encaje "contener": manda el lado que se quede corto, para que no se
        // recorte nada. Un personaje no puede salir sin pies en su propia ficha.
        double escala = Math.Min((double)anchoSal / silW, (double)altoSal / silH);
        int dw = Math.Max(1, (int)(silW * escala));
        int dh = Math.Max(1, (int)(silH * escala));
        int dx0 = (anchoSal - dw) / 2;
        int dy0 = altoSal - dh;          // apoyado abajo: los pies en el suelo

        int dStride = anchoSal * 4;
        byte[] dst = new byte[dStride * altoSal];
        EscalarBloque(px, stride, w, h, minX, minY, silW, silH,
                      dst, dStride, dx0, dy0, dw, dh);

        using (Bitmap sal = new Bitmap(anchoSal, altoSal, PixelFormat.Format32bppArgb)) {
            BitmapData dd = sal.LockBits(new Rectangle(0,0,anchoSal,altoSal),
                                         ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
            for (int y = 0; y < altoSal; y++)
                Marshal.Copy(dst, y*dStride, (IntPtr)(dd.Scan0.ToInt64() + y*dd.Stride), dStride);
            sal.UnlockBits(dd);
            sal.Save(salida, ImageFormat.Png);
        }
        return anchoSal + "|" + altoSal + "|1";
    }

    // ---------------------------------------------------------------------
    // Animacion horneada de personajes
    // ---------------------------------------------------------------------
    //
    // Convierte el sprite de un fotograma que acaba de escribir Procesar() en
    // una tira de 6: 2 de quieto y 4 de andar. Deforma la unica pose que hay,
    // igual que hacia el motor en tiempo real, pero OFFLINE, que cambia dos
    // cosas importantes:
    //
    //   - Se puede afinar por personaje (donde empiezan las piernas no es igual
    //     en Eric que en Vicky) y revisar el resultado fotograma a fotograma.
    //   - El juego se queda con un drawImage por entidad y cero matematicas de
    //     deformacion. Mas rapido y, sobre todo, sin el hormigueo que provoca
    //     reescalar en fracciones de pixel cada frame.
    //
    // Un paso de verdad es ANTISIMETRICO: una pierna sube mientras la otra
    // apoya. El apano que tenia el motor ensanchaba las dos a la vez y salia
    // patizambo. Aqui se levanta una sola, con el desplazamiento creciendo de
    // cero en la cadera a maximo en el pie, para que no aparezca un escalon.
    //
    // Ciclo: paso izquierdo, pase alto, paso derecho, pase alto. En un andar
    // real el cuerpo esta MAS ALTO en el pase, cuando ninguna pierna apoya del
    // todo, y por eso los fotogramas 1 y 3 del ciclo suben el cuerpo un pixel.
    //
    // modo "falda": Lucy lleva vestido hasta los tobillos y no tiene piernas
    // que separar. Se le balancea el bajo en horizontal, que es lo que hace una
    // falda al andar.
    // Fraccion del alto a la que estan los hombros. La inclinacion lateral deja
    // de crecer aqui: de los hombros para arriba la cabeza se desplaza ENTERA,
    // como un bloque. Si el desplazamiento siguiera creciendo hasta la coronilla,
    // la cara se cizallaria contra el cuello y se veria un tajo; ya paso en el
    // primer intento y en Vicky, con el pelo suelto, era escandaloso.
    const double HOMBROS = 0.28;

    public static string AnimarPersonaje(string archivo, double cadera,
                                         int ampPierna, bool falda, int ampEscora) {
        int w, h, stride;
        byte[] px;
        using (Bitmap b = new Bitmap(archivo)) {
            w = b.Width; h = b.Height;
            BitmapData d = b.LockBits(new Rectangle(0,0,w,h), ImageLockMode.ReadOnly,
                                      PixelFormat.Format32bppArgb);
            stride = d.Stride;
            px = new byte[stride*h];
            Marshal.Copy(d.Scan0, px, 0, px.Length);
            b.UnlockBits(d);
        }

        // 0-1 quieto, 2-5 andar de frente, 6-9 andar de lado (escorado).
        const int FRAMES = 10;
        int yCadera = (int)Math.Round(h * cadera);
        if (yCadera < 1) yCadera = 1;
        if (yCadera > h - 2) yCadera = h - 2;
        int yHombros = (int)Math.Round(h * HOMBROS);
        int centro = w / 2;

        int tiraW = w * FRAMES;
        int dStride = tiraW * 4;
        byte[] dst = new byte[dStride * h];

        for (int f = 0; f < FRAMES; f++) {
            for (int y = 0; y < h; y++) {
                for (int x = 0; x < w; x++) {
                    int sx = x, sy = y;

                    // t: 0 en la cadera, 1 en los pies. Fuera de las piernas es 0.
                    double t = y > yCadera ? (double)(y - yCadera) / (h - yCadera) : 0.0;
                    // u: 1 en la coronilla, 0 en la cadera. Para el torso.
                    double u = y < yCadera ? (double)(yCadera - y) / yCadera : 0.0;

                    // Los fotogramas laterales reutilizan el ciclo frontal y le
                    // suman la escora. El pie que apoya no se inclina.
                    int paso = f >= 6 ? f - 4 : f;

                    switch (paso) {
                        case 0:                       // quieto, pose original
                            break;
                        case 1:                       // quieto, respirando
                            sy = y - (int)Math.Round(u);
                            break;
                        case 2:                       // paso: apoya izquierda
                            if (falda) sx = x - (int)Math.Round(t);
                            else if (x < centro) sy = y + (int)Math.Round(ampPierna * t);
                            break;
                        // Pase: las dos piernas juntas y el cuerpo un pixel mas
                        // alto. NO se balancea el torso en horizontal: la
                        // deformacion crecia hasta la coronilla y despegaba la
                        // cabeza de los hombros, que en pelo suelto se veia como
                        // un tajo. Un pixel de cizalla lateral en una cara de 20
                        // pixeles es medio rostro movido.
                        case 3:
                        case 5:
                            sy = y + 1;
                            break;
                        case 4:                       // paso: apoya derecha
                            if (falda) sx = x + (int)Math.Round(t);
                            else if (x >= centro) sy = y + (int)Math.Round(ampPierna * t);
                            break;
                    }

                    // --- Escora lateral --------------------------------
                    // Solo en los fotogramas 6-9. Crece de cero en los pies a
                    // maximo en los hombros, y de ahi arriba se mantiene: el
                    // cuerpo se inclina hacia donde va y la cabeza le acompana
                    // entera. Es lo que quita la sensacion de patinar de lado
                    // que da un sprite frontal desplazandose en horizontal.
                    if (f >= 6 && ampEscora > 0) {
                        double v = y >= h - 1 ? 0.0
                                 : Math.Min(1.0, (double)(h - 1 - y) / (h - 1 - yHombros));
                        sx -= (int)Math.Round(ampEscora * v);
                    }

                    int q = y * dStride + (f * w + x) * 4;
                    if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;   // queda transparente
                    int s = sy * stride + sx * 4;
                    dst[q]     = px[s];
                    dst[q + 1] = px[s + 1];
                    dst[q + 2] = px[s + 2];
                    dst[q + 3] = px[s + 3];
                }
            }
        }

        using (Bitmap sal = new Bitmap(tiraW, h, PixelFormat.Format32bppArgb)) {
            BitmapData dd = sal.LockBits(new Rectangle(0,0,tiraW,h), ImageLockMode.WriteOnly,
                                         PixelFormat.Format32bppArgb);
            for (int y = 0; y < h; y++)
                Marshal.Copy(dst, y*dStride, (IntPtr)(dd.Scan0.ToInt64() + y*dd.Stride), dStride);
            sal.UnlockBits(dd);
            sal.Save(archivo, ImageFormat.Png);
        }
        return w + "|" + h + "|" + FRAMES;
    }

    // ---------------------------------------------------------------------
    // GIF animado
    // ---------------------------------------------------------------------
    //
    // Devuelve: frameW|frameH|frames|factorNativo|silueta
    //
    // Tres decisiones que no son obvias:
    //
    // 1. CAJA COMUN. El recorte se hace con la union de las siluetas de TODOS
    //    los fotogramas, nunca con la de cada uno. Recortando por fotograma, un
    //    aleteo que sube y baja quedaria centrado en todos y la animacion se
    //    perderia: el bicho se quedaria quieto dando tirones de tamano.
    //
    // 2. MUESTREO EN LA REJILLA NATIVA. Estos GIF suelen ser pixel art pequeno
    //    ampliado por bloques (este es 48x48 escalado 8x). Si se detecta el
    //    factor, se coge UN pixel por bloque en vez de promediar: el resultado
    //    es identico al original que dibujo el artista, sin un solo pixel
    //    inventado. Promediar sobre una rejilla exacta daria lo mismo, pero solo
    //    si los bordes caen justo; asi no hay que confiar en que caigan.
    //
    // 3. VOLTEO. El motor asume que todo mira a la DERECHA. Voltear aqui, una
    //    vez, es gratis; voltear en el juego costaria una copia espejo mas.
    public static string ProcesarGif(string entrada, string salida, int escala,
                                     int altoLogMax, bool voltear) {
        using (Image gif = Image.FromFile(entrada)) {
            FrameDimension fd = new FrameDimension(gif.FrameDimensionsList[0]);
            int nf = gif.GetFrameCount(fd);
            int w = gif.Width, h = gif.Height;

            // --- Volcar todos los fotogramas ya compuestos -----------------
            // GDI+ aplica el metodo de descarte al seleccionar, asi que cada
            // fotograma sale entero aunque el GIF lo guarde como delta.
            byte[][] marcos = new byte[nf][];
            int stride = 0;
            for (int f = 0; f < nf; f++) {
                gif.SelectActiveFrame(fd, f);
                using (Bitmap b = new Bitmap(w, h, PixelFormat.Format32bppArgb)) {
                    using (Graphics g = Graphics.FromImage(b)) { g.DrawImage(gif, 0, 0, w, h); }
                    BitmapData d = b.LockBits(new Rectangle(0, 0, w, h),
                        ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
                    stride = d.Stride;
                    marcos[f] = new byte[stride * h];
                    Marshal.Copy(d.Scan0, marcos[f], 0, marcos[f].Length);
                    b.UnlockBits(d);
                }
            }

            int factor = FactorNativo(marcos, w, h, stride);

            // --- Caja comun a todos los fotogramas -------------------------
            int minX = w, minY = h, maxX = -1, maxY = -1;
            for (int f = 0; f < nf; f++) {
                byte[] px = marcos[f];
                for (int y = 0; y < h; y++)
                    for (int x = 0; x < w; x++) {
                        if (px[y * stride + x * 4 + 3] < 128) continue;
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                    }
            }
            if (maxX < 0) return "VACIA";

            // Cuadrar la caja a la rejilla nativa: si el muestreo empieza a
            // media celda, se coge el pixel equivocado y la silueta sale
            // desplazada medio bloque.
            minX = (minX / factor) * factor;
            minY = (minY / factor) * factor;
            maxX = ((maxX / factor) + 1) * factor - 1;
            maxY = ((maxY / factor) + 1) * factor - 1;
            if (maxX >= w) maxX = w - 1;
            if (maxY >= h) maxY = h - 1;

            int cajaW = maxX - minX + 1, cajaH = maxY - minY + 1;
            int frameW = cajaW / factor, frameH = cajaH / factor;

            // Red de seguridad para GIF que no sean pixel art: si al tamano
            // nativo sigue siendo enorme, se reduce al alto pedido.
            int topeH = altoLogMax * escala;
            double extra = 1.0;
            if (frameH > topeH) {
                extra = (double)topeH / frameH;
                frameH = topeH;
                frameW = Math.Max(1, (int)Math.Round(frameW * extra));
            } else if (frameH < topeH) {
                // AMPLIAR por bloques ENTEROS: mismo principio que ESCALA_ARTE
                // en el resto del motor -- sin interpolar, cada pixel nativo se
                // convierte en un bloque de mul x mul. Antes esta rama no
                // existia, y un GIF cuya rejilla nativa se quedara corta
                // respecto al alto pedido (la gargola, con su rejilla de 8x a
                // 37px) se quedaba SIEMPRE en su tamano nativo pasara lo que
                // pasara con `alto`: la red de seguridad solo sabia reducir.
                //
                // PERO el bloque entero solo vale si cae CERCA del alto pedido.
                // La regla se penso para pixel art diminuto, donde el multiplo
                // es 2 o 3 y redondear cuesta poco. Con los GIF de los jefes la
                // rejilla nativa ya es casi tan grande como el sprite final, y
                // ahi redondear a un entero es un disparate: la hidra pedia 320
                // y el bloque x2 la dejaba en 408, la loba pedia 360 y el x1 la
                // dejaba en 249. El jefe FINAL salia mas pequeno que el
                // intermedio, que es exactamente lo contrario de lo que el
                // catalogo dice. Manda el alto pedido; el bloque entero es una
                // optimizacion, no la verdad.
                int mul = Math.Max(1, (int)Math.Round((double)topeH / frameH));
                int conBloques = frameH * mul;
                if (Math.Abs(conBloques - topeH) * 100 <= topeH * 8) {
                    frameH = conBloques;
                    frameW *= mul;
                } else {
                    frameW = Math.Max(1, (int)Math.Round((double)frameW * topeH / frameH));
                    frameH = topeH;
                }
            }

            // --- Componer la tira ------------------------------------------
            int tiraW = frameW * nf;
            byte[] dst = new byte[tiraW * 4 * frameH];
            int dStride = tiraW * 4;

            for (int f = 0; f < nf; f++) {
                byte[] px = marcos[f];
                for (int y = 0; y < frameH; y++) {
                    for (int x = 0; x < frameW; x++) {
                        // Pixel de origen: centro del bloque nativo
                        int sx = minX + (int)((x + 0.5) * cajaW / frameW);
                        int sy = minY + (int)((y + 0.5) * cajaH / frameH);
                        if (sx > maxX) sx = maxX;
                        if (sy > maxY) sy = maxY;
                        int s = sy * stride + sx * 4;

                        int xd = voltear ? (frameW - 1 - x) : x;
                        int q = y * dStride + (f * frameW + xd) * 4;
                        dst[q]     = px[s];
                        dst[q + 1] = px[s + 1];
                        dst[q + 2] = px[s + 2];
                        dst[q + 3] = px[s + 3] < 128 ? (byte)0 : (byte)255;
                    }
                }
            }

            using (Bitmap sal = new Bitmap(tiraW, frameH, PixelFormat.Format32bppArgb)) {
                BitmapData dd = sal.LockBits(new Rectangle(0, 0, tiraW, frameH),
                    ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
                for (int y = 0; y < frameH; y++)
                    Marshal.Copy(dst, y * dStride, (IntPtr)(dd.Scan0.ToInt64() + y * dd.Stride), dStride);
                sal.UnlockBits(dd);
                sal.Save(salida, ImageFormat.Png);
            }

            return frameW + "|" + frameH + "|" + nf + "|" + factor + "|" + cajaW + "x" + cajaH;
        }
    }

    // ---------------------------------------------------------------------
    // Reposo aniadido a una tira ya escrita
    // ---------------------------------------------------------------------
    //
    // Los GIF de personaje que dibuja Sergio son ciclo de andar y solo eso: no
    // traen pose de reposo. Y un personaje parado que se queda clavado en un
    // fotograma del paso parece congelado, no quieto — se ve enseguida, porque
    // en este juego se pasa mucho rato parado disparando.
    //
    // Misma solucion que ya usa RecortarHoja con las hojas dibujadas a mano: se
    // copian nQuieto fotogramas del `idle` al final de la tira y el segundo baja
    // UN pixel. Un solo pixel a 2 fps es lo justo para que se lea como peso, y
    // no hay que pedirle al artista una animacion de reposo por personaje.
    //
    // Va aparte de ProcesarGif y no dentro: ProcesarGif lo usan los trece
    // enemigos y esta probado, y un bicho no tiene reposo que anadir.
    public static string AnyadirReposo(string archivo, int nFrames, int idle, int nQuieto) {
        byte[] px; int w, h, stride;
        CargarPx(archivo, out px, out w, out h, out stride);
        int frameW = w / nFrames;

        int total = nFrames + nQuieto;
        int dStride = frameW * total * 4;
        byte[] dst = new byte[dStride * h];

        for (int y = 0; y < h; y++)
            for (int f = 0; f < nFrames; f++)
                Array.Copy(px, y * stride + f * frameW * 4,
                           dst, y * dStride + f * frameW * 4, frameW * 4);

        int origen = Math.Max(0, Math.Min(nFrames - 1, idle)) * frameW;
        for (int k = 0; k < nQuieto; k++) {
            int destino = (nFrames + k) * frameW;
            for (int y = 0; y < h; y++) {
                int sy = y - k;                    // 0, 1, 2... pixeles hacia abajo
                if (sy < 0) continue;
                Array.Copy(dst, sy * dStride + origen * 4,
                           dst, y * dStride + destino * 4, frameW * 4);
            }
        }

        using (Bitmap sal = new Bitmap(frameW * total, h, PixelFormat.Format32bppArgb)) {
            BitmapData dd = sal.LockBits(new Rectangle(0, 0, frameW * total, h),
                                         ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
            for (int y = 0; y < h; y++)
                Marshal.Copy(dst, y * dStride, (IntPtr)(dd.Scan0.ToInt64() + y * dd.Stride), dStride);
            sal.UnlockBits(dd);
            sal.Save(archivo, ImageFormat.Png);
        }
        return frameW + "|" + h + "|" + total;
    }

    // Mayor N tal que la imagen sea un escalado entero NxN de otra mas pequena.
    // 1 significa "no es pixel art ampliado, tratalo tal cual".
    static int FactorNativo(byte[][] marcos, int w, int h, int stride) {
        int[] cand = { 16, 12, 10, 8, 6, 5, 4, 3, 2 };
        foreach (int f in cand) {
            if (w % f != 0 || h % f != 0) continue;
            bool ok = true;
            for (int m = 0; m < marcos.Length && ok; m++) {
                byte[] px = marcos[m];
                for (int by = 0; by < h && ok; by += f)
                    for (int bx = 0; bx < w && ok; bx += f) {
                        int p0 = by * stride + bx * 4;
                        for (int y = 0; y < f && ok; y++)
                            for (int x = 0; x < f; x++) {
                                int p = (by + y) * stride + (bx + x) * 4;
                                if (px[p] != px[p0] || px[p+1] != px[p0+1] ||
                                    px[p+2] != px[p0+2] || px[p+3] != px[p0+3]) { ok = false; break; }
                            }
                    }
            }
            if (ok) return f;
        }
        return 1;
    }

    // ---------------------------------------------------------------------
    // Remate del sprite ya reducido
    // ---------------------------------------------------------------------
    //
    // La media de area es lo correcto para reducir, pero con factores grandes
    // deja el borde hecho un degradado. La gargola se reduce 20 veces (1575px de
    // silueta a 76) y cada membrana de ala fina acaba siendo un pixel medio
    // transparente: de sus ~1000 pixeles con opacidad, 577 quedaban a medias y
    // el bicho se veia translucido. Esto no es un fallo del arte de origen, que
    // entra opaco al 100%: es lo que hace promediar 528 pixeles de origen por
    // cada pixel de destino.
    //
    // Dos remates, ambos imprescindibles para pixel art:
    //   1. Endurecer el alfa. Con imageSmoothingEnabled = false un borde difuso
    //      no aporta suavidad, solo ensucia. Se empuja a 0 o a 255 dejando una
    //      rampa estrecha para que la silueta no quede dentada.
    //   2. Tapar agujeros interiores. Los que sobreviven al recorte son bolsas
    //      que la reduccion abrio en mitad del cuerpo, nunca huecos legitimos:
    //      un hueco de verdad (entre las piernas) toca el exterior y se inunda
    //      desde el borde.
    const int CORTE_BAJO = 100;
    const int CORTE_ALTO = 165;

    static void Rematar(byte[] dst, int w, int h, int stride) {
        // --- 1. Endurecer el alfa --------------------------------------
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int q = y * stride + x * 4 + 3;
                int a = dst[q];
                if (a <= CORTE_BAJO) dst[q] = 0;
                else if (a >= CORTE_ALTO) dst[q] = 255;
                else dst[q] = (byte)((a - CORTE_BAJO) * 255 / (CORTE_ALTO - CORTE_BAJO));
            }
        }

        // --- 2. Marcar el exterior inundando desde el borde -------------
        bool[] fuera = new bool[w * h];
        Queue<int> cola = new Queue<int>();
        for (int x = 0; x < w; x++) { SembrarHueco(dst, stride, fuera, cola, w, h, x, 0);
                                      SembrarHueco(dst, stride, fuera, cola, w, h, x, h - 1); }
        for (int y = 0; y < h; y++) { SembrarHueco(dst, stride, fuera, cola, w, h, 0, y);
                                      SembrarHueco(dst, stride, fuera, cola, w, h, w - 1, y); }
        while (cola.Count > 0) {
            int i = cola.Dequeue();
            int x = i % w, y = i / w;
            if (x > 0)     SembrarHueco(dst, stride, fuera, cola, w, h, x - 1, y);
            if (x < w - 1) SembrarHueco(dst, stride, fuera, cola, w, h, x + 1, y);
            if (y > 0)     SembrarHueco(dst, stride, fuera, cola, w, h, x, y - 1);
            if (y < h - 1) SembrarHueco(dst, stride, fuera, cola, w, h, x, y + 1);
        }

        // --- 3. Rellenar lo transparente que no sea exterior ------------
        // El color sale de la media de los vecinos ya opacos. Varias pasadas
        // porque un agujero de varios pixeles se rellena de fuera hacia dentro.
        for (int pasada = 0; pasada < 4; pasada++) {
            bool queda = false;
            for (int y = 0; y < h; y++) {
                for (int x = 0; x < w; x++) {
                    int i = y * w + x, q = y * stride + x * 4;
                    if (fuera[i] || dst[q + 3] >= 128) continue;

                    long sR = 0, sG = 0, sB = 0; int n = 0;
                    for (int dy = -1; dy <= 1; dy++) {
                        for (int dx = -1; dx <= 1; dx++) {
                            int nx = x + dx, ny = y + dy;
                            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                            int p = ny * stride + nx * 4;
                            if (dst[p + 3] < 128) continue;
                            sB += dst[p]; sG += dst[p + 1]; sR += dst[p + 2]; n++;
                        }
                    }
                    if (n == 0) { queda = true; continue; }
                    dst[q]     = (byte)(sB / n);
                    dst[q + 1] = (byte)(sG / n);
                    dst[q + 2] = (byte)(sR / n);
                    dst[q + 3] = 255;
                }
            }
            if (!queda) break;
        }
    }

    static void SembrarHueco(byte[] dst, int stride, bool[] fuera, Queue<int> cola,
                             int w, int h, int x, int y) {
        int i = y * w + x;
        if (fuera[i]) return;
        if (dst[y * stride + x * 4 + 3] >= 128) return;   // opaco: corta la inundacion
        fuera[i] = true;
        cola.Enqueue(i);
    }

    // ---------------------------------------------------------------------
    // Predicados de fondo
    // ---------------------------------------------------------------------
    static int DistFondo(Contexto c, int x, int y) {
        return DistPaleta(c.px, y * c.stride + x * 4, c.pal);
    }

    static bool EsFondo(Contexto c, int x, int y, int umbral) {
        return DistFondo(c, x, y) <= umbral;
    }

    static void Sembrar(Contexto c, bool[] fondo, Queue<int> cola, int x, int y) {
        int i = y * c.w + x;
        if (fondo[i]) return;
        if (c.px[y * c.stride + x * 4 + 3] < 16) { fondo[i] = true; cola.Enqueue(i); return; }
        if (EsFondo(c, x, y, c.umbral)) { fondo[i] = true; cola.Enqueue(i); }
    }

    static void Inundar(Contexto c, bool[] fondo, Queue<int> cola) {
        int[] dx = { 1, -1, 0, 0 };
        int[] dy = { 0, 0, 1, -1 };
        while (cola.Count > 0) {
            int idx = cola.Dequeue();
            int x = idx % c.w, y = idx / c.w;
            for (int k = 0; k < 4; k++) {
                int nx = x + dx[k], ny = y + dy[k];
                if (nx < 0 || ny < 0 || nx >= c.w || ny >= c.h) continue;
                Sembrar(c, fondo, cola, nx, ny);
            }
        }
    }

    // Colores dominantes del borde exterior, en cubos de 32 niveles.
    // Devuelve tripletas r,g,b planas de los cubos que superen el 2% del borde.
    static int[] PaletaBorde(Contexto c) {
        Dictionary<int, long[]> cubos = new Dictionary<int, long[]>();
        int total = 0;
        int w = c.w, h = c.h;
        for (int i = 0; i < w + w + h + h; i++) {
            int x, y;
            if (i < w)              { x = i;         y = 0; }
            else if (i < w + w)     { x = i - w;     y = h - 1; }
            else if (i < w + w + h) { x = 0;         y = i - w - w; }
            else                    { x = w - 1;     y = i - w - w - h; }

            int p = y * c.stride + x * 4;
            int r = c.px[p + 2], g = c.px[p + 1], bl = c.px[p];
            int clave = (r / 32) * 1024 + (g / 32) * 32 + (bl / 32);
            if (!cubos.ContainsKey(clave)) cubos[clave] = new long[4];
            cubos[clave][0] += r; cubos[clave][1] += g; cubos[clave][2] += bl; cubos[clave][3]++;
            total++;
        }

        List<int[]> orden = new List<int[]>();
        foreach (KeyValuePair<int, long[]> kv in cubos) {
            long n = kv.Value[3];
            if (n * 100 >= total * 2) {
                orden.Add(new int[] { (int)n, (int)(kv.Value[0] / n), (int)(kv.Value[1] / n), (int)(kv.Value[2] / n) });
            }
        }
        orden.Sort(delegate (int[] a, int[] d) { return d[0].CompareTo(a[0]); });

        int cuantos = Math.Min(6, orden.Count);
        if (cuantos == 0) return new int[] { c.px[2], c.px[1], c.px[0] };
        int[] pal = new int[cuantos * 3];
        for (int i = 0; i < cuantos; i++) {
            pal[i * 3] = orden[i][1]; pal[i * 3 + 1] = orden[i][2]; pal[i * 3 + 2] = orden[i][3];
        }
        return pal;
    }

    static int DistPaleta(byte[] b, int p, int[] pal) {
        int mejor = int.MaxValue;
        for (int i = 0; i < pal.Length; i += 3) {
            int d = Math.Abs(b[p + 2] - pal[i]) + Math.Abs(b[p + 1] - pal[i + 1]) + Math.Abs(b[p] - pal[i + 2]);
            if (d < mejor) mejor = d;
        }
        return mejor;
    }

    static bool Vecino(bool[] fondo, int w, int h, int x, int y) {
        if (x > 0 && fondo[y * w + x - 1]) return true;
        if (x < w - 1 && fondo[y * w + x + 1]) return true;
        if (y > 0 && fondo[(y - 1) * w + x]) return true;
        if (y < h - 1 && fondo[(y + 1) * w + x]) return true;
        return false;
    }

    // ---------------------------------------------------------------------
    // Hojas de animacion dibujadas a mano (rejilla de celdas)
    // ---------------------------------------------------------------------
    //
    // Formato de entrada: una rejilla de cols x filas celdas iguales, con los
    // fotogramas en orden de lectura y fondo transparente. Es lo que sale de
    // cualquier exportador de sprites, asi que no se le pide nada raro al arte.
    //
    // LA CAJA DE RECORTE ES COMUN A TODOS LOS FOTOGRAMAS, y ademas comun a las
    // dos hojas (derecha e izquierda) del mismo personaje. Si cada fotograma se
    // recortara por su cuenta, la figura quedaria centrada en su propia silueta
    // y el personaje daria un brinco en cada paso: al abrir las piernas la caja
    // se ensancha, el centro se desplaza y el sprite se mueve sin que nadie lo
    // haya movido. Por eso la medicion va aparte del recorte.

    static void CargarPx(string ruta, out byte[] px, out int w, out int h, out int stride) {
        using (Bitmap orig = new Bitmap(ruta)) {
            w = orig.Width; h = orig.Height;
            using (Bitmap src = new Bitmap(w, h, PixelFormat.Format32bppArgb)) {
                using (Graphics g = Graphics.FromImage(src)) { g.DrawImage(orig, 0, 0, w, h); }
                BitmapData d = src.LockBits(new Rectangle(0,0,w,h), ImageLockMode.ReadOnly,
                                            PixelFormat.Format32bppArgb);
                stride = d.Stride;
                px = new byte[stride*h];
                Marshal.Copy(d.Scan0, px, 0, px.Length);
                src.UnlockBits(d);
            }
        }
    }

    // Caja que envuelve la silueta de TODAS las celdas, en coordenadas de celda.
    // Devuelve: minX|minY|maxX|maxY|celdaW|celdaH
    public static string MedirHoja(string entrada, int cols, int filas) {
        byte[] px; int w, h, stride;
        CargarPx(entrada, out px, out w, out h, out stride);
        int cw = w / cols, ch = h / filas;

        int minX = cw, minY = ch, maxX = -1, maxY = -1;
        for (int r = 0; r < filas; r++) {
            for (int c = 0; c < cols; c++) {
                int ox = c*cw, oy = r*ch;
                for (int y = 0; y < ch; y++) {
                    int fila = (oy+y)*stride + ox*4 + 3;
                    for (int x = 0; x < cw; x++) {
                        if (px[fila + x*4] <= 40) continue;
                        if (x < minX) minX = x; if (x > maxX) maxX = x;
                        if (y < minY) minY = y; if (y > maxY) maxY = y;
                    }
                }
            }
        }
        if (maxY < 0) return "VACIA";
        return minX + "|" + minY + "|" + maxX + "|" + maxY + "|" + cw + "|" + ch;
    }

    // Recorta la rejilla a una TIRA HORIZONTAL con la caja dada, reducida al alto
    // fisico pedido. Anade al final nQuieto fotogramas de reposo copiados del
    // fotograma idle: la hoja trae solo el ciclo de andar, y un personaje parado
    // que no respira parece congelado, no quieto. La segunda copia baja un
    // pixel — un solo pixel a 2 fps, que es lo justo para que se lea como peso.
    //
    // Devuelve: frameW|frameH|nFrames
    public static string RecortarHoja(string entrada, string salida, int cols, int filas,
                                      int minX, int minY, int maxX, int maxY,
                                      int altoFis, int idle, int nQuieto) {
        byte[] px; int w, h, stride;
        CargarPx(entrada, out px, out w, out h, out stride);
        int cw = w / cols, ch = h / filas;

        int cajaW = maxX - minX + 1;
        int cajaH = maxY - minY + 1;
        int frameH = altoFis;
        // Ancho PAR: el ancla horizontal es frameW/2 y con impar caeria en medio
        // pixel, que con el suavizado apagado hace hervir el sprite.
        int frameW = (int)Math.Round((double)cajaW * altoFis / cajaH);
        if ((frameW & 1) == 1) frameW++;

        int nCeldas = cols * filas;
        int nFrames = nCeldas + nQuieto;
        int tiraW = frameW * nFrames;
        int dStride = tiraW * 4;
        byte[] dst = new byte[dStride * frameH];

        for (int f = 0; f < nCeldas; f++) {
            int ox = (f % cols) * cw + minX;
            int oy = (f / cols) * ch + minY;
            EscalarBloque(px, stride, w, h, ox, oy, cajaW, cajaH,
                          dst, dStride, f * frameW, 0, frameW, frameH);
        }

        // Reposo: copias del fotograma elegido, la segunda desplazada un pixel.
        int origen = Math.Max(0, Math.Min(nCeldas - 1, idle)) * frameW;
        for (int k = 0; k < nQuieto; k++) {
            int destino = (nCeldas + k) * frameW;
            int desvio = k;                       // 0, 1, 2... pixeles hacia abajo
            for (int y = 0; y < frameH; y++) {
                int sy = y - desvio;
                if (sy < 0) continue;
                Array.Copy(dst, sy*dStride + origen*4,
                           dst, y*dStride + destino*4, frameW*4);
            }
        }

        using (Bitmap sal = new Bitmap(tiraW, frameH, PixelFormat.Format32bppArgb)) {
            BitmapData dd = sal.LockBits(new Rectangle(0,0,tiraW,frameH),
                                         ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
            for (int y = 0; y < frameH; y++)
                Marshal.Copy(dst, y*dStride, (IntPtr)(dd.Scan0.ToInt64() + y*dd.Stride), dStride);
            sal.UnlockBits(dd);
            sal.Save(salida, ImageFormat.Png);
        }
        return frameW + "|" + frameH + "|" + nFrames;
    }

    // ---------------------------------------------------------------------
    // Ensanchar el mapa reflejando los bordes
    // ---------------------------------------------------------------------
    //
    // Ensanchar el escenario (pedido de Sergio) generando arte nuevo con IA no
    // salió adelante: ChatGPT, Bing y Gemini solo devuelven un puñado de
    // resoluciones/proporciones propias, nunca el ancho exacto en píxeles que
    // hacía falta, así que las dos veces el resultado llegaba más pequeño que
    // el original en vez de más ancho (ver herramientas/candidatos/calzada-ancha,
    // descartada). Esto no depende de ningún servicio externo: coge una franja
    // de cada borde y la refleja hacia fuera.
    //
    // La costura es EXACTA y no una mezcla: la columna de la franja reflejada
    // que queda pegada al original es, pixel a pixel, la MISMA columna que el
    // original tiene ahí (reflejar alrededor del borde implica que ese punto
    // coincide consigo mismo). Funciona bien aquí porque los márgenes de este
    // mapa son un patrón de hierba/árboles sin ningún elemento único y
    // reconocible que delate el espejo — los objetos que sí lo son (columnas,
    // estatuas, ruinas) no están pintados en esta imagen, los coloca
    // datos/niveles/merida.js por encima.
    public static string Ensanchar(string entrada, string salida, int pxPorLado, int unidad) {
        byte[] px; int w, h, stride;
        CargarPx(entrada, out px, out w, out h, out stride);
        if (pxPorLado <= 0 || pxPorLado >= w) return "RANGO";
        if (unidad <= 0 || unidad > pxPorLado) unidad = pxPorLado;

        int w2 = w + pxPorLado * 2;
        int stride2 = w2 * 4;
        byte[] dst = new byte[stride2 * h];

        for (int y = 0; y < h; y++) {
            int filaSrc = y * stride;
            int filaDst = y * stride2;

            // Centro: el original, intacto.
            Array.Copy(px, filaSrc, dst, filaDst + pxPorLado * 4, w * 4);

            // Franja izquierda, en ESPEJO DE ACORDEÓN: no un solo pliegue del
            // ancho entero (eso deja un rombo enorme y evidente pegado a la
            // calzada, que es justo lo que se ve mal), sino varios pliegues
            // del ancho de `unidad`, alternando dirección. Cada juntura entre
            // pliegues sigue siendo exacta por el mismo motivo de siempre —la
            // columna de un lado de la juntura es la misma columna física que
            // la del otro—, solo que ahora el patrón se repite en una escala
            // más parecida a la de un árbol suelto que a la de todo el margen.
            for (int x = 0; x < pxPorLado; x++) {
                int distancia = pxPorLado - x;                  // 1..pxPorLado
                int enTramo = (distancia - 1) % unidad;         // 0..unidad-1
                bool par = ((distancia - 1) / unidad) % 2 == 0;
                int xo = par ? enTramo : (unidad - 1 - enTramo);
                if (xo >= w) xo = w - 1;
                Array.Copy(px, filaSrc + xo * 4, dst, filaDst + x * 4, 4);
            }

            // Franja derecha: la misma idea en espejo.
            for (int x = 0; x < pxPorLado; x++) {
                int distancia = x + 1;                          // 1..pxPorLado
                int enTramo = (distancia - 1) % unidad;
                bool par = ((distancia - 1) / unidad) % 2 == 0;
                int xo = par ? (w - 1 - enTramo) : (w - unidad + enTramo);
                if (xo < 0) xo = 0;
                int xd = w2 - pxPorLado + x;
                Array.Copy(px, filaSrc + xo * 4, dst, filaDst + xd * 4, 4);
            }
        }

        using (Bitmap sal = new Bitmap(w2, h, PixelFormat.Format32bppArgb)) {
            BitmapData dd = sal.LockBits(new Rectangle(0, 0, w2, h),
                                         ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
            for (int y = 0; y < h; y++)
                Marshal.Copy(dst, y * stride2, (IntPtr)(dd.Scan0.ToInt64() + y * dd.Stride), stride2);
            sal.UnlockBits(dd);
            sal.Save(salida, ImageFormat.Png);
        }
        return w2 + "|" + h;
    }

    // ---------------------------------------------------------------------
    // Suelo del nivel: hacer teselable un mapa que no lo es
    // ---------------------------------------------------------------------
    //
    // El mundo de este juego es INFINITO y con scroll toroidal (ver
    // dibujarSuelo en main.js): no hay bordes de mapa, así que cualquier
    // imagen de suelo se repite, y si sus lados no casan se ve una rejilla de
    // costuras por toda la pantalla. Medido en el mapa de Emerita que ha
    // dibujado Sergio, el salto de color en la costura es de 35 sobre 255,
    // contra 7-12 entre dos píxeles vecinos cualesquiera del interior: tres
    // veces lo normal, o sea perfectamente visible.
    //
    // Se arregla RECORTANDO un margen y fundiéndolo en el arranque, que es la
    // forma que no inventa contenido:
    //
    //   salida[x] = mezcla(origen[x + w - m], origen[x])  para x < m
    //   salida[x] = origen[x]                             para el resto
    //
    // La imagen se queda en w-m de ancho, y ahora su última columna
    // (origen[w-m-1]) y la primera (origen[w-m]) eran VECINAS en el original,
    // así que al repetirse encajan exactamente. No es un truco de suavizado:
    // es cerrar el bucle por donde ya estaba cerrado.
    //
    // Con la avenida cruzando de arriba abajo esto sale especialmente bien: el
    // borde superior y el inferior son los dos empedrado, así que la fusión
    // vertical mezcla losa con losa y la calzada sigue de largo.
    public static string HacerTeselable(string entrada, string salida, int margen, int escala) {
        byte[] px; int w, h, stride;
        CargarPx(entrada, out px, out w, out h, out stride);
        if (margen * 3 > w || margen * 3 > h) return "MARGEN";

        // El tile tiene que medir un multiplo EXACTO de ESCALA_ARTE, porque el
        // motor lo dibuja en unidades logicas y la transformacion lo multiplica
        // por esa escala. Si no divide, el blit deja de ir a 1:1 y el suelo
        // entero pasa por un remuestreo cada frame — que es justo el cuello de
        // botella que se corrigio en la Fase 3. El margen se agranda lo justo
        // para cuadrarlo; son unos pocos pixeles.
        int mx = margen, my = margen;
        while ((w - mx) % escala != 0) mx++;
        while ((h - my) % escala != 0) my++;

        int w2 = w - mx, h2 = h - my;

        // --- Paso en X: de w a w2, fundiendo la banda derecha en la izquierda
        int tStride = w2 * 4;
        byte[] tmp = new byte[tStride * h];
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w2; x++) {
                int q = y * tStride + x * 4;
                int p = y * stride + x * 4;
                if (x < mx) {
                    int p2 = y * stride + (x + w - mx) * 4;
                    double t = (double)x / mx;
                    for (int c = 0; c < 3; c++)
                        tmp[q + c] = (byte)(px[p2 + c] * (1 - t) + px[p + c] * t);
                } else {
                    tmp[q] = px[p]; tmp[q + 1] = px[p + 1]; tmp[q + 2] = px[p + 2];
                }
                tmp[q + 3] = 255;
            }
        }

        // --- Paso en Y: lo mismo con las filas
        int dStride = w2 * 4;
        byte[] dst = new byte[dStride * h2];
        for (int y = 0; y < h2; y++) {
            for (int x = 0; x < w2; x++) {
                int q = y * dStride + x * 4;
                int p = y * tStride + x * 4;
                if (y < my) {
                    int p2 = (y + h - my) * tStride + x * 4;
                    double t = (double)y / my;
                    for (int c = 0; c < 3; c++)
                        dst[q + c] = (byte)(tmp[p2 + c] * (1 - t) + tmp[p + c] * t);
                } else {
                    dst[q] = tmp[p]; dst[q + 1] = tmp[p + 1]; dst[q + 2] = tmp[p + 2];
                }
                dst[q + 3] = 255;
            }
        }

        using (Bitmap sal = new Bitmap(w2, h2, PixelFormat.Format32bppArgb)) {
            BitmapData dd = sal.LockBits(new Rectangle(0, 0, w2, h2),
                                         ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
            for (int y = 0; y < h2; y++)
                Marshal.Copy(dst, y * dStride, (IntPtr)(dd.Scan0.ToInt64() + y * dd.Stride), dStride);
            sal.UnlockBits(dd);
            sal.Save(salida, ImageFormat.Png);
        }

        // Costura medida sobre el RESULTADO, para no fiarse de la teoría.
        // Se compara el salto al repetir contra el salto entre dos columnas
        // (o filas) del interior: si el primero no es mayor, no hay costura.
        return w2 + "|" + h2 + "|" +
               Salto(dst, dStride, w2, h2, true) + "|" + Salto(dst, dStride, w2, h2, false);
    }

    // Salto medio al repetir menos el salto medio del interior, por canal.
    static string Salto(byte[] px, int stride, int w, int h, bool enX) {
        long costura = 0, interior = 0;
        int n = enX ? h : w;
        for (int i = 0; i < n; i++) {
            int a, b, c, d;
            if (enX) { a = i * stride + (w - 1) * 4; b = i * stride; c = i * stride + (w / 2) * 4; d = c + 4; }
            else     { a = (h - 1) * stride + i * 4; b = i * 4; c = (h / 2) * stride + i * 4; d = c + stride; }
            for (int k = 0; k < 3; k++) {
                costura  += Math.Abs(px[a + k] - px[b + k]);
                interior += Math.Abs(px[c + k] - px[d + k]);
            }
        }
        return Math.Round((double)costura / n / 3, 1) + " vs " + Math.Round((double)interior / n / 3, 1);
    }

    // ---------------------------------------------------------------------
    // Hojas de ICONOS: armas y objetos
    // ---------------------------------------------------------------------
    //
    // Dos hojas con formatos distintos y un solo recortador, porque el trabajo
    // de fondo es el mismo: encontrar N siluetas EN ORDEN DE LECTURA y meter
    // cada una centrada en su celda cuadrada de una tira horizontal.
    //
    // El orden de lectura es el CONTRATO con datos/armas.js y datos/pasivos.js
    // — ver $ICONOS_ARMAS más abajo, que es donde se declara qué id ocupa cada
    // hueco. Aquí solo se garantiza que la fila manda sobre la columna.
    //
    // Dos modos, porque las dos hojas que ha dibujado Sergio no se parecen:
    //
    //   "rejilla" (objetos.png) — trae ALFA de verdad y los ocho objetos caen
    //     limpiamente en 4x2 celdas iguales. Se parte la imagen y se mide la
    //     silueta dentro de cada celda. Nada más.
    //
    //   "marco" (armas.png) — viene OPACA, sin un solo píxel transparente: 52
    //     iconos enmarcados sobre negro, cada marco con su reborde gris. Y la
    //     rejilla NO es regular: medida, la separación entre filas va de 132 a
    //     140 píxeles y acumula deriva, así que partir en 8x7 iguales recorta
    //     media fila por abajo. Hay que encontrar los marcos.
    //
    // Cómo se encuentran los marcos, que es lo único no obvio de todo esto: el
    // hueco ENTRE marcos es negro puro y está conectado con el borde de la
    // imagen, mientras que el negro de DENTRO de cada marco está encerrado por
    // su reborde gris. Inundando el negro desde el borde se pinta el hueco y
    // solo el hueco; lo que queda sin pintar son 52 islas, una por marco. No
    // hace falta saber ni cuántas columnas hay ni dónde empieza cada una.

    // Luminancia por debajo de la cual un pixel cuenta como fondo.
    //
    // 28 y no 12, que era el valor obvio para "negro puro". El reborde inferior
    // de cada marco no acaba en seco: derrama una sombra tenue que cruza el
    // hueco hasta el marco de al lado. Medida, esa sombra deja el hueco entre
    // 13 y 22 de luminancia en siete filas de toda la hoja — suficiente para
    // que la inundacion no pase y dos marcos vecinos salgan como una sola
    // celda. Pasaba en siete sitios y se llevaba ocho iconos por delante.
    //
    // Se puede subir tanto sin comerse dibujo porque el reborde del marco esta
    // en 84 y el negro de dentro en 0-5: entre el fondo y lo que hay que
    // conservar no hay nada, es un salto limpio.
    const int NEGRO = 28;

    static int Lum(byte[] px, int p) { return (px[p] + px[p+1] + px[p+2]) / 3; }

    // Inunda `marca` a partir de las semillas ya encoladas, avanzando solo por
    // píxeles que cumplan "es negro".
    static void InundarNegro(byte[] px, int stride, int w, int h,
                             bool[] marca, Queue<int> cola,
                             int x0, int y0, int x1, int y1) {
        int[] dx = { 1, -1, 0, 0 };
        int[] dy = { 0, 0, 1, -1 };
        while (cola.Count > 0) {
            int i = cola.Dequeue();
            int x = i % w, y = i / w;
            for (int k = 0; k < 4; k++) {
                int nx = x + dx[k], ny = y + dy[k];
                if (nx < x0 || ny < y0 || nx > x1 || ny > y1) continue;
                int ni = ny * w + nx;
                if (marca[ni]) continue;
                if (Lum(px, ny * stride + nx * 4) > NEGRO) continue;
                marca[ni] = true;
                cola.Enqueue(ni);
            }
        }
    }

    // Inunda por todo lo que NO este ya marcado, sin mirar el color. Sirve para
    // barrer el reborde del marco: ver el comentario de RecortarIconos.
    static void InundarLibre(bool[] marca, Queue<int> cola, int w,
                             int x0, int y0, int x1, int y1) {
        int[] dx = { 1, -1, 0, 0 };
        int[] dy = { 0, 0, 1, -1 };
        while (cola.Count > 0) {
            int i = cola.Dequeue();
            int x = i % w, y = i / w;
            for (int k = 0; k < 4; k++) {
                int nx = x + dx[k], ny = y + dy[k];
                if (nx < x0 || ny < y0 || nx > x1 || ny > y1) continue;
                int ni = ny * w + nx;
                if (marca[ni]) continue;
                marca[ni] = true;
                cola.Enqueue(ni);
            }
        }
    }

    static void Semilla(byte[] px, int stride, int w, bool[] marca, Queue<int> cola, int x, int y) {
        int i = y * w + x;
        if (marca[i]) return;
        if (Lum(px, y * stride + x * 4) > NEGRO) return;
        marca[i] = true;
        cola.Enqueue(i);
    }

    // Cajas de los 52 marcos, sin suponer nada sobre la rejilla.
    static List<int[]> CajasDeMarco(byte[] px, int stride, int w, int h) {
        bool[] hueco = new bool[w * h];
        Queue<int> cola = new Queue<int>();
        for (int x = 0; x < w; x++) { Semilla(px, stride, w, hueco, cola, x, 0);
                                      Semilla(px, stride, w, hueco, cola, x, h - 1); }
        for (int y = 0; y < h; y++) { Semilla(px, stride, w, hueco, cola, 0, y);
                                      Semilla(px, stride, w, hueco, cola, w - 1, y); }
        InundarNegro(px, stride, w, h, hueco, cola, 0, 0, w - 1, h - 1);

        // Componentes de lo que NO es hueco: cada una es un marco entero
        // (reborde gris + negro de dentro + icono).
        bool[] visto = new bool[w * h];
        List<int[]> cajas = new List<int[]>();
        Queue<int> q = new Queue<int>();
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int i = y * w + x;
                if (visto[i] || hueco[i]) continue;
                int ax = x, bx = x, ay = y, by = y, n = 0;
                visto[i] = true; q.Enqueue(i);
                while (q.Count > 0) {
                    int k = q.Dequeue(); int kx = k % w, ky = k / w; n++;
                    if (kx < ax) ax = kx; if (kx > bx) bx = kx;
                    if (ky < ay) ay = ky; if (ky > by) by = ky;
                    for (int dy = -1; dy <= 1; dy++)
                        for (int dx = -1; dx <= 1; dx++) {
                            int nx = kx + dx, ny = ky + dy;
                            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                            int ni = ny * w + nx;
                            if (visto[ni] || hueco[ni]) continue;
                            visto[ni] = true; q.Enqueue(ni);
                        }
                }
                // Un marco ocupa miles de píxeles; lo que baje de ahí es una
                // mota del fondo, no una celda.
                if (n > 2000) cajas.Add(new int[] { ax, ay, bx, by });
            }
        }
        return cajas;
    }

    // Orden de lectura con filas que no están alineadas al píxel. Se agrupa por
    // BANDAS: se recorre por centro vertical y se abre banda nueva cuando el
    // salto pasa de media altura de celda. Ordenar por `y` a secas mezclaría
    // columnas de filas contiguas, porque la hoja está dibujada a mano y dentro
    // de una misma fila los marcos bailan varios píxeles.
    static void OrdenarLectura(List<int[]> cajas) {
        if (cajas.Count == 0) return;
        int altoMedio = 0;
        foreach (int[] c in cajas) altoMedio += c[3] - c[1] + 1;
        altoMedio /= cajas.Count;
        int umbral = altoMedio / 2;

        cajas.Sort(delegate (int[] a, int[] b) {
            int ca = (a[1] + a[3]) / 2, cb = (b[1] + b[3]) / 2;
            if (Math.Abs(ca - cb) > umbral) return ca.CompareTo(cb);
            return a[0].CompareTo(b[0]);
        });
    }

    // Manchas OPACAS conexas, con su caja. Es la misma idea que CajasDeMarco
    // pero sobre el alfa en vez de sobre el hueco negro: sirve para las hojas
    // que ya vienen recortadas, donde cada icono es una isla y no hay marco que
    // buscar. `minArea` descarta el sangrado de un icono vecino, que son unas
    // decenas de pixeles sueltos contra los miles de un icono de verdad.
    static List<int[]> IslasOpacas(byte[] px, int stride, int w, int h, int minArea) {
        bool[] visto = new bool[w * h];
        List<int[]> cajas = new List<int[]>();
        Queue<int> cola = new Queue<int>();
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int i = y * w + x;
                if (visto[i] || px[y * stride + x * 4 + 3] <= 128) continue;
                int ax = x, bx = x, ay = y, by = y, n = 0;
                visto[i] = true; cola.Enqueue(i);
                while (cola.Count > 0) {
                    int k = cola.Dequeue(); int kx = k % w, ky = k / w; n++;
                    if (kx < ax) ax = kx; if (kx > bx) bx = kx;
                    if (ky < ay) ay = ky; if (ky > by) by = ky;
                    for (int dy = -1; dy <= 1; dy++)
                        for (int dx = -1; dx <= 1; dx++) {
                            int nx = kx + dx, ny = ky + dy;
                            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                            int ni = ny * w + nx;
                            if (visto[ni] || px[ny * stride + nx * 4 + 3] <= 128) continue;
                            visto[ni] = true; cola.Enqueue(ni);
                        }
                }
                if (n >= minArea) cajas.Add(new int[] { ax, ay, bx, by });
            }
        }
        return cajas;
    }

    // Caja de la silueta dentro de una región, con el fondo ya resuelto.
    // Devuelve null si la región está vacía.
    static int[] CajaSilueta(bool[] fondo, int w, int x0, int y0, int x1, int y1) {
        int ax = x1 + 1, ay = y1 + 1, bx = x0 - 1, by = y0 - 1;
        for (int y = y0; y <= y1; y++)
            for (int x = x0; x <= x1; x++) {
                if (fondo[y * w + x]) continue;
                if (x < ax) ax = x; if (x > bx) bx = x;
                if (y < ay) ay = y; if (y > by) by = y;
            }
        if (bx < ax) return null;
        return new int[] { ax, ay, bx, by };
    }

    // Devuelve: n|lado|informe por icono
    public static string RecortarIconos(string entrada, string salida, int n,
                                        int lado, string modo, int cols, int filas) {
        byte[] px; int w, h, stride;
        CargarPx(entrada, out px, out w, out h, out stride);

        bool[] fondo = new bool[w * h];
        List<int[]> regiones = new List<int[]>();

        if (modo == "rejilla") {
            // La hoja ya trae alfa: el fondo es, literalmente, lo transparente.
            for (int y = 0; y < h; y++)
                for (int x = 0; x < w; x++)
                    if (px[y * stride + x * 4 + 3] < 128) fondo[y * w + x] = true;

            // POR ISLAS, no por celdas de rejilla. Los iconos NO respetan su
            // casilla: la corona de laurel mide de x=156 a x=402 y su celda
            // acaba en 383, así que el arco derecho cae dentro de la casilla
            // vecina. Partir la hoja en rectángulos iguales se lo cortaba, y
            // encima descuadraba el centrado, porque media corona centrada en
            // su celda no está centrada.
            //
            // Antes esto se intentó arreglar metiendo la zona de medida 30px
            // hacia dentro —el problema que se veía entonces era el contrario:
            // un par de píxeles del icono de al lado ensanchaban la caja—, pero
            // ese margen es justo lo que remata de cortar a los anchos.
            //
            // Con islas se resuelven los dos a la vez: se buscan las manchas
            // opacas conexas y cada una se asigna a la celda donde cae su
            // CENTRO. Un icono que se desborda sigue siendo suyo entero, porque
            // su centro no se ha movido; y un sangrado del vecino es una isla
            // diminuta que el área mínima descarta. Los iconos de varias piezas
            // (la corona son dos arcos que se tocan por abajo) se recomponen
            // porque se unen todas las islas de la misma celda.
            for (int y = 0; y < h; y++)
                for (int x = 0; x < w; x++)
                    if (px[y * stride + x * 4 + 3] < 128) fondo[y * w + x] = true;

            int cw = w / cols, ch = h / filas;
            int[][] caja = new int[cols * filas][];
            foreach (int[] isla in IslasOpacas(px, stride, w, h, 600)) {
                int mx = (isla[0] + isla[2]) / 2, my = (isla[1] + isla[3]) / 2;
                int c = Math.Min(cols - 1, Math.Max(0, mx / cw));
                int r = Math.Min(filas - 1, Math.Max(0, my / ch));
                int k = r * cols + c;
                if (caja[k] == null) caja[k] = new int[] { isla[0], isla[1], isla[2], isla[3] };
                else {
                    if (isla[0] < caja[k][0]) caja[k][0] = isla[0];
                    if (isla[1] < caja[k][1]) caja[k][1] = isla[1];
                    if (isla[2] > caja[k][2]) caja[k][2] = isla[2];
                    if (isla[3] > caja[k][3]) caja[k][3] = isla[3];
                }
            }
            for (int k = 0; k < cols * filas; k++) {
                // Celda sin isla: se emite su rectángulo entero y CajaSilueta
                // devolverá "vacía", que es lo que hay que ver en el informe.
                regiones.Add(caja[k] != null ? caja[k] : new int[] {
                    (k % cols) * cw, (k / cols) * ch,
                    (k % cols) * cw + cw - 1, (k / cols) * ch + ch - 1 });
            }
        } else {
            List<int[]> marcos = CajasDeMarco(px, stride, w, h);
            OrdenarLectura(marcos);

            foreach (int[] m in marcos) {
                // Dentro del marco, el reborde gris envuelve un rectángulo de
                // negro. Se busca por dónde empieza ese negro entrando desde
                // cada lado por la mitad de la celda: eso da el rectángulo
                // interior sin tener que medir el grosor del reborde, que no es
                // el mismo en todos.
                int my = (m[1] + m[3]) / 2, mx = (m[0] + m[2]) / 2;
                int ix0 = m[0], ix1 = m[2], iy0 = m[1], iy1 = m[3];
                while (ix0 < mx && Lum(px, my * stride + ix0 * 4) > NEGRO) ix0++;
                while (ix1 > mx && Lum(px, my * stride + ix1 * 4) > NEGRO) ix1--;
                while (iy0 < my && Lum(px, iy0 * stride + mx * 4) > NEGRO) iy0++;
                while (iy1 > my && Lum(px, iy1 * stride + mx * 4) > NEGRO) iy1--;

                // Inundar el negro DE DENTRO, sembrando por el borde interior.
                Queue<int> cola = new Queue<int>();
                for (int x = ix0; x <= ix1; x++) { Semilla(px, stride, w, fondo, cola, x, iy0);
                                                   Semilla(px, stride, w, fondo, cola, x, iy1); }
                for (int y = iy0; y <= iy1; y++) { Semilla(px, stride, w, fondo, cola, ix0, y);
                                                   Semilla(px, stride, w, fondo, cola, ix1, y); }
                InundarNegro(px, stride, w, h, fondo, cola, ix0, iy0, ix1, iy1);

                // Y ahora el REBORDE, que es lo único que queda por tirar.
                //
                // Con un rectángulo no vale: el marco está dibujado a mano y su
                // reborde ondula un par de píxeles, así que recortar por la
                // recta que se midió en la fila central deja tramos de gris
                // dentro. Y esos tramos no solo se ven: al entrar en la caja de
                // la silueta ensanchan el icono y lo encogen al encajarlo, que
                // es de lo que salían los iconos pequeños y descentrados.
                //
                // Se tira por INUNDACIÓN desde el borde de la celda, avanzando
                // por lo que aún no sea fondo y sin mirar el color. El negro de
                // dentro ya está marcado del paso anterior, así que la
                // inundación recorre el anillo del reborde entero —ondas
                // incluidas— y se para en seco contra ese negro. Al icono no
                // llega: lo rodea el negro por los cuatro lados.
                cola.Clear();
                for (int x = m[0]; x <= m[2]; x++) {
                    if (!fondo[m[1] * w + x]) { fondo[m[1] * w + x] = true; cola.Enqueue(m[1] * w + x); }
                    if (!fondo[m[3] * w + x]) { fondo[m[3] * w + x] = true; cola.Enqueue(m[3] * w + x); }
                }
                for (int y = m[1]; y <= m[3]; y++) {
                    if (!fondo[y * w + m[0]]) { fondo[y * w + m[0]] = true; cola.Enqueue(y * w + m[0]); }
                    if (!fondo[y * w + m[2]]) { fondo[y * w + m[2]] = true; cola.Enqueue(y * w + m[2]); }
                }
                InundarLibre(fondo, cola, w, m[0], m[1], m[2], m[3]);

                regiones.Add(new int[] { m[0], m[1], m[2], m[3] });
            }
        }

        // --- Componer la tira -------------------------------------------------
        int tiraW = lado * n;
        int dStride = tiraW * 4;
        byte[] dst = new byte[dStride * lado];
        System.Text.StringBuilder informe = new System.Text.StringBuilder();

        for (int i = 0; i < n; i++) {
            if (i >= regiones.Count) { informe.Append(i + ":FALTA "); continue; }
            int[] r = regiones[i];
            int[] caja = CajaSilueta(fondo, w, r[0], r[1], r[2], r[3]);
            if (caja == null) { informe.Append(i + ":VACIA "); continue; }

            int silW = caja[2] - caja[0] + 1, silH = caja[3] - caja[1] + 1;
            // Encaje "contener" y CENTRADO en los dos ejes: un icono no se apoya
            // en ningún suelo, al revés que un sprite del mundo.
            double esc = Math.Min((double)lado / silW, (double)lado / silH);
            int dw = Math.Max(1, (int)Math.Round(silW * esc));
            int dh = Math.Max(1, (int)Math.Round(silH * esc));

            // Se escala desde un búfer donde el fondo va con alfa 0, para que la
            // media de área no arrastre el negro del marco al borde del icono.
            byte[] recorte = new byte[silW * 4 * silH];
            int rStride = silW * 4;
            for (int y = 0; y < silH; y++)
                for (int x = 0; x < silW; x++) {
                    int p = (caja[1] + y) * stride + (caja[0] + x) * 4;
                    int q = y * rStride + x * 4;
                    bool esFondo = fondo[(caja[1] + y) * w + (caja[0] + x)];
                    recorte[q]     = px[p];
                    recorte[q + 1] = px[p + 1];
                    recorte[q + 2] = px[p + 2];
                    recorte[q + 3] = esFondo ? (byte)0 : px[p + 3];
                }

            EscalarBloque(recorte, rStride, silW, silH, 0, 0, silW, silH,
                          dst, dStride, i * lado + (lado - dw) / 2, (lado - dh) / 2, dw, dh);
            informe.Append(i + ":" + silW + "x" + silH + " ");
        }

        // Mismo remate que los sprites del mundo: alfa dura y agujeros tapados.
        // Un icono de 32 píxeles con el borde a medio gas se lee como sucio.
        Rematar(dst, tiraW, lado, dStride);

        using (Bitmap sal = new Bitmap(tiraW, lado, PixelFormat.Format32bppArgb)) {
            BitmapData dd = sal.LockBits(new Rectangle(0, 0, tiraW, lado),
                                         ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
            for (int y = 0; y < lado; y++)
                Marshal.Copy(dst, y * dStride, (IntPtr)(dd.Scan0.ToInt64() + y * dd.Stride), dStride);
            sal.UnlockBits(dd);
            sal.Save(salida, ImageFormat.Png);
        }
        return regiones.Count + "|" + lado + "|" + informe.ToString();
    }

    // ---------------------------------------------------------------------
    // Reduccion por COLOR DOMINANTE
    // ---------------------------------------------------------------------
    //
    // Alternativa a la media de area para dibujo de COLORES PLANOS. En vez de
    // promediar el bloque de origen, se queda con el color que mas se repite
    // dentro de el.
    //
    // Por que hace falta: promediar inventa colores que no estan en el dibujo.
    // En una ilustracion con volumen y degradados eso es justo lo que se
    // quiere, pero en una de tintas planas destroza los detalles pequenos. El
    // escudo del Atleti del ataud de Eric es el caso de libro: mide unos
    // 130x150 en el original y acaba en 28x32, asi que cada pixel de destino
    // promedia mas de veinte de origen. Con rayas rojas y blancas de dos
    // pixeles y estrellas blancas de tres, la media daba un rosa sucio uniforme
    // y el escudo se volvia una mancha. Con el dominante, cada pixel del
    // resultado es un color que EXISTE en el escudo, asi que la diagonal se
    // mantiene azul, las rayas rojas y las estrellas blancas.
    //
    // Los colores se agrupan en cubos de 16 niveles por canal antes de votar: a
    // pelo, dos rojos que difieren en un valor contarian como colores distintos
    // y ninguno ganaria. Se devuelve la MEDIA de los pixeles del cubo ganador,
    // no el centro del cubo, para no cuantizar la paleta de paso.
    //
    // El alfa NO se vota, se promedia: es lo que mantiene el borde suave que
    // luego endurece Rematar. Votarlo daria un contorno dentado.
    static void EscalarDominante(byte[] px, int stride, int w, int h,
                                 int sx0, int sy0, int sw, int sh,
                                 byte[] dst, int dStride, int dx0, int dy0, int dw, int dh) {
        Dictionary<int, long[]> votos = new Dictionary<int, long[]>();
        for (int y = 0; y < dh; y++) {
            int ay0 = sy0 + (int)((long)y * sh / dh);
            int ay1 = sy0 + (int)((long)(y + 1) * sh / dh);
            if (ay1 <= ay0) ay1 = ay0 + 1;
            for (int x = 0; x < dw; x++) {
                int ax0 = sx0 + (int)((long)x * sw / dw);
                int ax1 = sx0 + (int)((long)(x + 1) * sw / dw);
                if (ax1 <= ax0) ax1 = ax0 + 1;

                votos.Clear();
                long sumaA = 0; int n = 0;
                for (int sy = ay0; sy < ay1; sy++) {
                    if (sy < 0 || sy >= h) { n++; continue; }
                    for (int sx = ax0; sx < ax1; sx++) {
                        if (sx < 0 || sx >= w) { n++; continue; }
                        int p = sy * stride + sx * 4;
                        int a = px[p + 3];
                        sumaA += a; n++;
                        if (a < 128) continue;          // lo transparente no vota color
                        int clave = (px[p + 2] / 16) * 4096 + (px[p + 1] / 16) * 64 + (px[p] / 16);
                        long[] v;
                        if (!votos.TryGetValue(clave, out v)) { v = new long[4]; votos[clave] = v; }
                        v[0] += px[p + 2]; v[1] += px[p + 1]; v[2] += px[p]; v[3]++;
                    }
                }

                int q = (dy0 + y) * dStride + (dx0 + x) * 4;
                long mejor = 0; long[] ganador = null;
                foreach (KeyValuePair<int, long[]> kv in votos) {
                    if (kv.Value[3] > mejor) { mejor = kv.Value[3]; ganador = kv.Value; }
                }
                if (ganador == null) { dst[q] = 0; dst[q+1] = 0; dst[q+2] = 0; dst[q+3] = 0; }
                else {
                    dst[q]     = (byte)(ganador[2] / ganador[3]);   // B
                    dst[q + 1] = (byte)(ganador[1] / ganador[3]);   // G
                    dst[q + 2] = (byte)(ganador[0] / ganador[3]);   // R
                    dst[q + 3] = (byte)(sumaA / n);
                }
            }
        }
    }

    // Reduccion por media de area con alfa premultiplicado. Premultiplicar no es
    // un detalle: sin ello, los pixeles transparentes aportan su color (a menudo
    // negro) a la media y el sprite sale con un halo oscuro en todo el contorno.
    static void EscalarBloque(byte[] px, int stride, int w, int h,
                              int sx0, int sy0, int sw, int sh,
                              byte[] dst, int dStride, int dx0, int dy0, int dw, int dh) {
        for (int y = 0; y < dh; y++) {
            int ay0 = sy0 + (int)((long)y * sh / dh);
            int ay1 = sy0 + (int)((long)(y+1) * sh / dh);
            if (ay1 <= ay0) ay1 = ay0 + 1;
            for (int x = 0; x < dw; x++) {
                int ax0 = sx0 + (int)((long)x * sw / dw);
                int ax1 = sx0 + (int)((long)(x+1) * sw / dw);
                if (ax1 <= ax0) ax1 = ax0 + 1;

                long sA=0, sR=0, sG=0, sB=0; int n=0;
                for (int sy = ay0; sy < ay1; sy++) {
                    if (sy < 0 || sy >= h) { n++; continue; }
                    for (int sx = ax0; sx < ax1; sx++) {
                        if (sx < 0 || sx >= w) { n++; continue; }
                        int p = sy*stride + sx*4;
                        int a = px[p+3];
                        sA += a;
                        sB += px[p]*a; sG += px[p+1]*a; sR += px[p+2]*a;
                        n++;
                    }
                }
                int q = (dy0+y)*dStride + (dx0+x)*4;
                if (sA == 0) { dst[q]=0; dst[q+1]=0; dst[q+2]=0; dst[q+3]=0; }
                else {
                    dst[q]   = (byte)(sB / sA);
                    dst[q+1] = (byte)(sG / sA);
                    dst[q+2] = (byte)(sR / sA);
                    dst[q+3] = (byte)(sA / n);
                }
            }
        }
    }
}
"@

# --- Configuracion ---------------------------------------------------------
$RAIZ    = Split-Path -Parent $PSScriptRoot
$ORIGEN  = Join-Path $RAIZ 'resources'
$DESTINO = Join-Path $RAIZ 'assets'
$ESCALA  = 4      # ESCALA_ARTE: 1 unidad logica = 4 pixeles fisicos
$TOL     = 30

# alto = alto LOGICO en unidades de 480x270. anchoFijo 0 => sale del ratio real.
# tol 0 => usa $TOL. Se sube solo en los que traen fondo sombreado o degradado.
#
# placeholder = la fuente no es recuperable automaticamente; se emite entrada de
# atlas sin archivo para que recursos.js genere su silueta. Ninguna lo necesita
# ahora: los cuatro personajes se re-exportaron con alfa real.
#
# --- TODO EL CATALOGO SE REDUJO AL 70% ---------------------------------------
#
# Se veia poco campo. El jugador medida 32 de alto sobre una pantalla de 270, o
# sea 8,4 alturas de personaje en vertical: con cuatro jugadores y varios
# cientos de bichos, no cabe la informacion que hace falta para decidir por
# donde salir. A 22 son 12,3 alturas, un 46% mas de campo util.
#
# Se reduce el ARTE y no se amplia el lienzo, y la diferencia importa. El lienzo
# fisico son 960x540 justamente porque en un monitor de 1080p entra por un
# factor entero exacto (x2); subirlo a 1280x720 dejaria el factor en 1 y el
# juego saldria en una ventana mas pequena rodeada de negro — mas campo, si,
# pero todo mas chico en pantalla, que es lo contrario de lo que se busca.
#
# Solo encogen los CUERPOS. Velocidades, alcances de arma y radio de recogida
# siguen en las mismas unidades logicas, asi que cruzar la pantalla cuesta lo
# mismo que antes y no se siente lento: lo que cambia es que ahora cabe mas
# alrededor. Los radios de colision de datos/enemigos.js bajan en la misma
# proporcion.
$CATALOGO = @(
    # SEGUNDA PASADA DE TAMAÑOS, por petición de Sergio tras jugar: la primera
    # (comentario histórico más abajo) encogió todo el bestiario al 70% del plan
    # original para que cupiera más campo en pantalla, y la serpiente encima se
    # cortó a la MITAD de eso (14->7) porque salía tan alta como un legionario.
    # Jugada la partida entera, se ha ido demasiado lejos: la serpiente y la
    # gárgola, que son lo primero que se ve en el minuto 0, casi no se
    # distinguen. Esta pasada las sube más que al resto —proporcionalmente son
    # las que más han crecido— y da un empujón general al resto del bestiario y
    # a los cuatro personajes. El radio de colisión de datos/enemigos.js sube en
    # la misma proporción que el alto de cada uno, para que la silueta y el
    # golpe seguido coincidiendo.
    @{ src='enemies\serpiente.gif';         dst='enemigos\serpiente.png'; id='serpiente'; alto=12;  anchoFijo=0;  tol=0; gif=$true }
    # GIF animado de 7 fotogramas, pixel art nativo de 48x48 ampliado 8x.
    # voltear porque el original mira a la izquierda y el motor asume derecha.
    @{ src='enemies\gargoyle.gif';         dst='enemigos\gargola.png';   id='gargola';   alto=18;  anchoFijo=0;  tol=0; gif=$true; voltear=$true }
    # El legionario tambien pasa a GIF ANIMADO: el esqueleto de legionario.gif
    # sustituye a la ilustracion estatica. No lleva voltear porque ya mira a la
    # derecha, que es lo que asume el motor.
    @{ src='enemies\legionario.gif';       dst='enemigos\legionario.png';id='legionario';alto=28;  anchoFijo=0;  tol=0; gif=$true }
    @{ src='enemies\gladiador.gif';        dst='enemigos\gladiador.png'; id='gladiador'; alto=27;  anchoFijo=0;  tol=0; gif=$true }
    # La arpía pasa a GIF ANIMADO: bate las alas, que es lo único que hacía falta
    # para que el rol "rápido" se lea desde lejos. No lleva voltear: la pose es
    # frontal con las dos alas abiertas y no mira a ningún lado.
    @{ src='enemies\arpia.gif';            dst='enemigos\arpia.png';     id='arpia';     alto=19;  anchoFijo=0;  tol=0; gif=$true }
    # También en GIF. Frontal —encarada, con las serpientes del pelo moviéndose—
    # así que no lleva voltear.
    @{ src='enemies\medusa.gif';           dst='enemigos\medusa.png';    id='medusa';    alto=24;  anchoFijo=0;  tol=0; gif=$true }
    @{ src='enemies\minotauro.gif';        dst='enemigos\minotauro.png'; id='minotauro'; alto=30;  anchoFijo=0;  tol=0; gif=$true }
    # El cíclope cierra el bestiario: ya no queda un solo enemigo estático. Su
    # `tol=45` desaparece con la ilustración —era la tolerancia del recorte por
    # color, y un GIF trae su propio alfa, así que no hay fondo que adivinar—.
    @{ src='enemies\ciclope.gif';          dst='enemigos\ciclope.png';   id='ciclope';   alto=35;  anchoFijo=0;  tol=0; gif=$true }
    # Animada a mano en GIF (antes era una ilustración estática): mira a la
    # derecha en el original, así que no lleva voltear.
    @{ src='enemies\masticore.gif';        dst='enemigos\manticora.png'; id='manticora'; alto=43;  anchoFijo=0;  tol=0; gif=$true }
    @{ src='enemies\cerberus.gif';         dst='enemigos\cerbero.png';   id='cerbero';   alto=70;  anchoFijo=0;  tol=0; gif=$true }
    # La hidra deja de ser un sprite huérfano: recupera su papel de jefe, ahora
    # como el segundo de tres (minuto 20), entre Cerbero y la Loba. Ver el
    # bloque de jefes en datos/enemigos.js y datos/jefes.js.
    # Ya en GIF: las cabezas se mueven por su cuenta. Sin voltear, las bocas
    # miran a la derecha en el original.
    @{ src='enemies\hidra.gif';            dst='enemigos\hidra.png';     id='hidra';     alto=80;  anchoFijo=0;  tol=0; gif=$true }
    # JEFE FINAL DEL NIVEL 1 (minuto 30): la loba capitolina y los gemelos, en
    # version monstruosa. La loba mide más que la hidra (es el jefe final y
    # tiene que imponer más que el segundo). Los gemelos, algo más que un
    # gladiador: son criaturas, no adultos, pero tienen que verse desde lejos
    # porque hay que ir a por ellos.
    # Los dos en GIF. La loba va de frente —encarada al jugador, que es como
    # tiene que verse un jefe final— así que voltearla no cambiaría nada.
    @{ src='enemies\loba_capitolina.gif';  dst='enemigos\loba.png';      id='loba';      alto=90;  anchoFijo=0;  tol=0; gif=$true }
    @{ src='enemies\gemelo.gif';           dst='enemigos\gemelo.png';    id='gemelo';    alto=26;  anchoFijo=0;  tol=0; gif=$true }
    # Personajes: MISMO ALTO logico, ancho derivado de su silueta. Encajar
    # la figura dentro de un cuadrado comun hacia que las poses anchas salieran
    # mas bajas: a Vicky, con ratio 1.43, la limitaba el ancho y se quedaba más
    # baja que Eric con el mismo número.
    #
    # LOS CUATRO YA ANIMADOS A MANO, en GIF. Es la tercera y ultima forma de
    # animar un personaje que ha tenido este proyecto, y sustituye a las dos
    # anteriores:
    #
    #   1. Procedural (AnimarPersonaje): deformar la unica pose que habia. Lo
    #      llevaban Lucy, Sara y Vicky.
    #   2. Hojas dibujadas en rejilla 4x3 (hojaDer/hojaIzq). Solo Eric.
    #   3. GIF de 16 fotogramas. Los cuatro.
    #
    # Que Sergio dibujara tambien el de Eric, que YA tenia hojas, es lo que dice
    # que el GIF las sustituye y no que convivan. Los dos caminos viejos siguen
    # en la herramienta y funcionan: un personaje nuevo sin GIF se anima solo, y
    # devolverle a Eric sus hojas es cambiar esta linea. Pero no se usan.
    #
    # `gifAnim` es el SPRITE; `src` sigue siendo la ilustracion grande porque de
    # ahi salen el retrato y el cuerpo entero de la ficha, a resolucion completa
    # (650x1492 en Eric). Recortarlos de un fotograma del GIF seria cambiar un
    # busto nitido por una miniatura ampliada.
    #
    # No hay `hojaIzq` ni equivalente: sin `<id>Izq` en el atlas, jugador.js cae
    # en la copia espejada que ya precachea recursos.js. Con arte FRONTAL como
    # este el espejo casi no se nota —es lo que ya hacian Lucy, Sara y Vicky—.
    #
    # `idle` es el fotograma del que se copia el reposo: el 0, que es el unico
    # con los dos pies en el suelo. Cualquier otro deja al personaje parado a
    # media zancada.
    @{ src='characters\Eric.png';  dst='personajes\eric.png';  id='eric';  alto=26; anchoFijo=0; tol=0
       gifAnim='characters\Eric.gif';  idle=0; nQuieto=2; fpsAndar=14 }
    @{ src='characters\Lucy.png';  dst='personajes\lucy.png';  id='lucy';  alto=26; anchoFijo=0; tol=0
       gifAnim='characters\Lucy.gif';  idle=0; nQuieto=2; fpsAndar=14 }
    @{ src='characters\Sara.png';  dst='personajes\sara.png';  id='sara';  alto=26; anchoFijo=0; tol=0
       gifAnim='characters\Sara.gif';  idle=0; nQuieto=2; fpsAndar=14 }
    @{ src='characters\Vicky.png'; dst='personajes\vicky.png'; id='vicky'; alto=26; anchoFijo=0; tol=0
       gifAnim='characters\Vicky.gif'; idle=0; nQuieto=2; fpsAndar=14 }

    # ATAUDES. Uno por personaje, y cada uno cuenta quien iba dentro: el del
    # Atleti con su balon, el del hamster, el del capibara y el de la katana.
    # Es lo que hace que valga la pena dibujar cuatro en vez de uno generico —
    # en cooperativo, ver de quien es el ataud desde el otro lado de la pantalla
    # dice a quien hay que ir a levantar sin tener que leer un nombre.
    #
    # Entradas SUELTAS, sin `cadera` ni `gifAnim`: no llevan retrato ni ciclo de
    # animacion. Son un dibujo quieto que sustituye al sprite mientras el
    # jugador esta caido, asi que caen por Procesar() como cualquier
    # ilustracion. `plano` porque un ataud ni mira a un lado ni recibe golpes.
    #
    # `tol=6`, MUCHISIMO mas bajo que el 30 por defecto, y es lo que arregla que
    # el ataud de Eric saliera gris y emborronado.
    #
    # Estos dibujos no traen alfa: son opacos con FONDO BLANCO. Y el ataud de
    # Eric es blanco tambien. Con la tolerancia normal el recorte por color
    # entra con un umbral de 90 sobre la suma de los tres canales, o sea que
    # cualquier gris claro cuenta como fondo: se comia el cuerpo del ataud por
    # dentro, y despues Rematar rellenaba esos huecos con la media de los
    # vecinos. De ahi el gris sucio y el aspecto de tener transparencias. Con
    # umbral 18 solo desaparece el blanco de verdad y el contorno negro para la
    # inundacion donde tiene que pararla.
    #
    # Y suben de 26 a 34 de alto. A 26 el original -448x595, con las rayas del
    # Atleti de ocho pixeles- se reducia 5,7 veces y esas rayas quedaban en 1,3
    # pixeles: no hay metodo de reduccion que las salve, se funden en un
    # borron rojo. A 34 la reduccion baja a 4,4 y el escudo y las rayas
    # sobreviven. Ademas un ataud es mas voluminoso que quien iba dentro, asi
    # que verlo mas alto que el personaje se lee bien.
    @{ src='characters\Eric_ataud.png';  dst='personajes\eric-ataud.png';  id='ericAtaud';  alto=34; anchoFijo=0; tol=6; plano=$true; dominante=$true }
    @{ src='characters\Lucy_ataud.png';  dst='personajes\lucy-ataud.png';  id='lucyAtaud';  alto=34; anchoFijo=0; tol=6; plano=$true; dominante=$true }
    @{ src='characters\Sara_ataud.png';  dst='personajes\sara-ataud.png';  id='saraAtaud';  alto=34; anchoFijo=0; tol=6; plano=$true; dominante=$true }
    @{ src='characters\Vicky_ataud.png'; dst='personajes\vicky-ataud.png'; id='vickyAtaud'; alto=34; anchoFijo=0; tol=6; plano=$true; dominante=$true }

    # MASCOTAS. El `id` es el mismo de datos/mascotas.js, con el prefijo
    # `mascota` para no chocar con nada del bestiario.
    #
    # Todas MIRAN A LA DERECHA en el original, que es lo que asume el motor, y
    # NO llevan `plano`: la mascota gira con su jugador, así que necesita la
    # copia espejada que precachea recursos.js. Se le cuela de paso la del
    # destello de impacto, que no usa nadie, pero son ocho lienzos diminutos y
    # no hay un `plano` a medias que diga "espejo sí, destello no".
    #
    # Los altos van entre 10 y 14 contra los 26 del personaje: tienen que
    # leerse como una mascota que acompaña, no como otro personaje. La tortuga
    # es la más baja y el perro el más alto, que es lo que dice cada dibujo.
    #
    # `gifSiExiste`: si al lado del PNG hay un GIF con el MISMO nombre, se usa
    # el GIF y la mascota queda animada; si no, se usa el PNG y se queda quieta.
    #
    # Existe porque Sergio está entregando las animaciones DE UNA EN UNA —hoy
    # solo está la del búho— y sin esto cada GIF nuevo obligaría a venir aquí a
    # cambiar una línea. Con esto, dejar el archivo en resources/mascotas/ y
    # volver a ejecutar la herramienta basta. Es la única regla implícita de
    # todo el catálogo y se limita a las mascotas a propósito: en el bestiario,
    # donde conviven PNG y GIF del mismo bicho, la elección está escrita a mano
    # entrada por entrada y así se queda.
    @{ src='mascotas\Hamster.png'; dst='mascotas\heladio.png';  id='mascotaHeladio';  alto=11; anchoFijo=0; tol=0; gifSiExiste=$true }
    @{ src='mascotas\Tortuga.png'; dst='mascotas\escipion.png'; id='mascotaEscipion'; alto=10; anchoFijo=0; tol=0; gifSiExiste=$true }
    @{ src='mascotas\Buho.png';    dst='mascotas\plinio.png';   id='mascotaPlinio';   alto=13; anchoFijo=0; tol=0; gifSiExiste=$true }
    @{ src='mascotas\Gato.png';    dst='mascotas\neron.png';    id='mascotaNeron';    alto=12; anchoFijo=0; tol=0; gifSiExiste=$true }
    @{ src='mascotas\PErro.png';   dst='mascotas\karim.png';    id='mascotaKarim';    alto=14; anchoFijo=0; tol=0; gifSiExiste=$true }
    @{ src='mascotas\Gallina.png'; dst='mascotas\cleopatra.png';id='mascotaCleopatra';alto=13; anchoFijo=0; tol=0; gifSiExiste=$true }
    @{ src='mascotas\Conejo.png';  dst='mascotas\oreo.png';     id='mascotaOreo';     alto=11; anchoFijo=0; tol=0; gifSiExiste=$true }
    @{ src='mascotas\Pollito.png'; dst='mascotas\pollito.png';  id='mascotaPollito';  alto=12; anchoFijo=0; tol=0; gifSiExiste=$true }

    # --- Decoracion solida del nivel 1: columnas, antorchas, estatuas y
    # ruinas de resources/stages/1/objetos/. Ilustraciones estaticas sueltas
    # (sin gif/cadera/hoja), asi que caen directas por Procesar():
    # quitar fondo, recortar a silueta, ancla centro-inferior, un fotograma.
    # `plano=$true` porque nunca giran ni reciben destello de impacto —ni
    # espejo ni tinte les hacen falta, igual que a las hojas de iconos.
    @{ src='stages\1\objetos\columna.png';   dst='objetos\columna.png';   id='columna';   alto=40; anchoFijo=0; tol=0;  plano=$true }
    # SIN plano: a diferencia de columna/estatuas/ruinas (decoracion pura),
    # las antorchas se pueden destruir (datos/enemigos.js) y necesitan la
    # copia blanqueada de destello al recibir un golpe, igual que cualquier
    # enemigo.
    @{ src='stages\1\objetos\antorcha1.png'; dst='objetos\antorcha1.png'; id='antorcha1'; alto=26; anchoFijo=0; tol=0 }
    @{ src='stages\1\objetos\antorcha2.png'; dst='objetos\antorcha2.png'; id='antorcha2'; alto=26; anchoFijo=0; tol=0 }
    @{ src='stages\1\objetos\estatua1.png';  dst='objetos\estatua1.png';  id='estatua1';  alto=34; anchoFijo=0; tol=0;  plano=$true }
    @{ src='stages\1\objetos\estatua2.png';  dst='objetos\estatua2.png';  id='estatua2';  alto=34; anchoFijo=0; tol=0;  plano=$true }
    @{ src='stages\1\objetos\estatua3.png';  dst='objetos\estatua3.png';  id='estatua3';  alto=34; anchoFijo=0; tol=0;  plano=$true }
    @{ src='stages\1\objetos\estatua4.png';  dst='objetos\estatua4.png';  id='estatua4';  alto=34; anchoFijo=0; tol=0;  plano=$true }
    @{ src='stages\1\objetos\estatua5.png';  dst='objetos\estatua5.png';  id='estatua5';  alto=34; anchoFijo=0; tol=0;  plano=$true }
    # Ruinas a proposito MAS GRANDES que columnas/antorchas/estatuas (peticion
    # de Sergio jugando la Fase 8): un 53% mas de alto que la primera pasada
    # (36->55). Son edificios, no mobiliario, y tienen que imponer en el
    # margen de hierba en vez de leerse como un adorno mas.
    @{ src='stages\1\objetos\ruinas1.png';   dst='objetos\ruinas1.png';   id='ruinas1';   alto=55; anchoFijo=0; tol=0;  plano=$true }
    @{ src='stages\1\objetos\ruinas2.png';   dst='objetos\ruinas2.png';   id='ruinas2';   alto=55; anchoFijo=0; tol=0;  plano=$true }
    @{ src='stages\1\objetos\ruinas4.png';   dst='objetos\ruinas4.png';   id='ruinas4';   alto=55; anchoFijo=0; tol=0;  plano=$true }
    @{ src='stages\1\objetos\ruinas5.png';   dst='objetos\ruinas5.png';   id='ruinas5';   alto=55; anchoFijo=0; tol=0;  plano=$true }
    # ruinas6..11 salieron de recortar a mano ruinas3.png (una hoja de
    # contacto con seis ruinas juntas, no un objeto en si). El tol sube a 40:
    # el recorte dejo cerca del borde la rejilla clara de la hoja original y
    # el tolerancia por defecto (30) no bastaba para tragarsela entera.
    @{ src='stages\1\objetos\ruinas6.png';   dst='objetos\ruinas6.png';   id='ruinas6';   alto=55; anchoFijo=0; tol=40; plano=$true }
    @{ src='stages\1\objetos\ruinas7.png';   dst='objetos\ruinas7.png';   id='ruinas7';   alto=55; anchoFijo=0; tol=40; plano=$true }
    @{ src='stages\1\objetos\ruinas8.png';   dst='objetos\ruinas8.png';   id='ruinas8';   alto=55; anchoFijo=0; tol=40; plano=$true }
    @{ src='stages\1\objetos\ruinas9.png';   dst='objetos\ruinas9.png';   id='ruinas9';   alto=55; anchoFijo=0; tol=40; plano=$true }
    @{ src='stages\1\objetos\ruinas10.png';  dst='objetos\ruinas10.png';  id='ruinas10';  alto=55; anchoFijo=0; tol=40; plano=$true }
    @{ src='stages\1\objetos\ruinas11.png';  dst='objetos\ruinas11.png';  id='ruinas11';  alto=55; anchoFijo=0; tol=40; plano=$true }
)

# Retrato de la ficha de jugador. CUADRADO: de los hombros a la cabeza y nada
# mas. El busto largo que llegaba al pecho encajaba en la columna vertical del
# diseno anterior, pero en el de ahora el retrato va en un recuadro casi
# cuadrado dentro de su tarjeta, y ahi un busto obliga a alejar la camara: la
# cara, que es lo unico que identifica al jugador de un vistazo, se quedaba
# pequena para dejar sitio a una camiseta que no dice nada.
#
# 288 y no 192 porque esta imagen se dibuja en la capa de interfaz, a la
# resolucion real del monitor: 36 unidades de ancho con zoom 3x y densidad 2x
# son 216 pixeles de verdad, y de 192 habria que ampliar.
$CARA_W = 288
$CARA_H = 288
# Cuerpo entero para la ficha de jugador (Select / Tab). Alto y estrecho, como
# las ilustraciones: Eric es 650x1492. Se pide GRANDE porque la ficha se dibuja
# en la capa de interfaz, que va a la resolucion real del monitor.
$CUERPO_W = 340
$CUERPO_H = 760

New-Item -ItemType Directory -Force -Path (Join-Path $DESTINO 'enemigos')   | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $DESTINO 'personajes') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $DESTINO 'objetos')    | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $DESTINO 'mascotas')   | Out-Null

$informe = @()
$atlas = [ordered]@{}

foreach ($e in $CATALOGO) {
    $rutaSrc = Join-Path $ORIGEN $e.src
    $rutaDst = Join-Path $DESTINO $e.dst

    # `gifSiExiste`: la entrada apunta a un PNG, pero si al lado hay un GIF con
    # el mismo nombre manda el GIF. Ver la nota del bloque de mascotas: sirve
    # para que las animaciones que van llegando de una en una entren solas.
    if ($e.gifSiExiste) {
        $candidato = [System.IO.Path]::ChangeExtension($rutaSrc, '.gif')
        if (Test-Path $candidato) {
            $rutaSrc = $candidato
            $e = $e.Clone()      # no se toca el catálogo, solo esta pasada
            $e.gif = $true
        }
    }

    if (-not (Test-Path $rutaSrc)) {
        $informe += [PSCustomObject]@{ Id=$e.id; Silueta='-'; Ratio='-'; Sprite='-'; Quitado='-'; Estado='NO EXISTE' }
        continue
    }

    # Fuente irrecuperable: entrada de atlas SIN archivo. El motor dibuja su
    # placeholder y el juego sigue siendo jugable, que es el requisito 7.
    if ($e.placeholder) {
        if (Test-Path $rutaDst) { Remove-Item $rutaDst -Force }
        $lado = $e.alto * $ESCALA
        $anchoLog = if ($e.anchoFijo -gt 0) { $e.anchoFijo } else { $e.alto }
        $anchoFis = $anchoLog * $ESCALA
        $atlas[$e.id] = [ordered]@{
            w = $anchoFis; h = $lado; anclaX = [int]($anchoFis / 2); anclaY = $lado; frames = 1
        }
        $informe += [PSCustomObject]@{
            Id=$e.id; Silueta='-'; Ratio='-'; Sprite="${anchoFis}x${lado}"
            Quitado='-'; Estado='PLACEHOLDER'
        }
        continue
    }

    # --- GIF animado -------------------------------------------------------
    # Sale por su propia rama: la caja de recorte es comun a todos los
    # fotogramas y el muestreo va en la rejilla nativa, nada que ver con el
    # recorte por color de las ilustraciones estaticas.
    if ($e.gif) {
        try {
            # Tope = el alto logico pedido, en pixeles fisicos. Antes era el
            # triple, para respetar la rejilla nativa del GIF aunque saliera mas
            # grande de lo declarado. Con el catalogo reducido al 70% eso dejaba
            # a la gargola en 18,5 unidades frente a las 14 de la serpiente: mas
            # de un tercio mas grande que el otro enemigo de su mismo rol, que se
            # lee como que pega mas fuerte. Vale mas un remuestreo algo blando
            # que un bestiario que miente sobre lo que tienes delante.
            $r = [Procesador]::ProcesarGif($rutaSrc, $rutaDst, $ESCALA, $e.alto, [bool]$e.voltear)
        } catch {
            $informe += [PSCustomObject]@{ Id=$e.id; Silueta='-'; Ratio='-'; Sprite='-'; Quitado='-'; Estado='ERROR GIF' }
            continue
        }
        $p = $r -split '\|'
        if ($p.Count -ne 5) {
            $informe += [PSCustomObject]@{ Id=$e.id; Silueta='-'; Ratio='-'; Sprite='-'; Quitado='-'; Estado='VACIA' }
            continue
        }
        $fw=[int]$p[0]; $fh=[int]$p[1]; $nf=[int]$p[2]; $fac=[int]$p[3]
        $atlas[$e.id] = [ordered]@{
            archivo = $e.dst.Replace('\', '/')
            w = $fw; h = $fh; anclaX = [int]($fw / 2); anclaY = $fh; frames = $nf
        }
        $informe += [PSCustomObject]@{
            Id=$e.id; Silueta=$p[4]; Ratio=[math]::Round($fw/$fh,2)
            Sprite="${fw}x${fh} x$nf"; Quitado="nativo /$fac"; Estado='GIF OK'
        }
        continue
    }

    $tolAsset = if ($e.tol -gt 0) { $e.tol } else { $TOL }
    try {
        $r = [Procesador]::Procesar($rutaSrc, $rutaDst, $e.alto, $ESCALA, $tolAsset, $e.anchoFijo, [bool]$e.dominante)
    } catch {
        $informe += [PSCustomObject]@{ Id=$e.id; Silueta='-'; Ratio='-'; Sprite='-'; Quitado='-'; Estado='ERROR' }
        continue
    }

    $p = if ($r) { $r -split '\|' } else { @() }
    if ($r -eq 'VACIA' -or $p.Count -ne 8) {
        $informe += [PSCustomObject]@{ Id=$e.id; Silueta='-'; Ratio='-'; Sprite='-'; Quitado='-'; Estado='VACIA' }
        continue
    }
    $silW=[int]$p[0]; $silH=[int]$p[1]; $ratio=$p[2]
    $fw=[int]$p[3]; $fh=[int]$p[4]; $ax=[int]$p[5]; $ay=[int]$p[6]; $opaco=[int]$p[7]

    # Lo que importa es cuanto fondo se elimino, no el area de la caja: una
    # silueta puede tocar los cuatro bordes y estar perfectamente recortada.
    $quitado = 100 - $opaco
    $estado = if ($quitado -lt 5) { 'FALLO' } elseif ($quitado -lt 15) { 'DUDOSO' } else { 'OK' }

    # Retrato para el panel de informacion, recortado del ORIGINAL a resolucion
    # completa. Ver el comentario de RecortarCabeza: es un busto, no una cabeza
    # en cuadrado, porque la ficha le reserva una columna alta y estrecha.
    #
    # La condicion es "esto es un personaje". Antes bastaba mirar `cadera`, que
    # solo tienen los personajes, pero los cuatro han pasado a GIF y ya no la
    # llevan: con la comprobacion vieja los cuatro se quedaban de golpe sin
    # retrato ni cuerpo, y la ficha de jugador con dos huecos vacios.
    if ($null -ne $e.cadera -or $null -ne $e.gifAnim) {
        $rutaCara = Join-Path $DESTINO ("personajes\" + $e.id + "-cara.png")
        try {
            # fraccionAlto 0.30 sigue siendo la franja que se usa para ENCUADRAR
            # (centroide y ancho de la cabeza); el alto de la caja sale despues
            # de la proporcion pedida y baja hasta el pecho.
            [Procesador]::RecortarCabeza($rutaSrc, $rutaCara, $CARA_W, $CARA_H, 0.30, 0.22) | Out-Null
            $atlas[$e.id + 'Cara'] = [ordered]@{
                archivo = "personajes/$($e.id)-cara.png"
                w = $CARA_W; h = $CARA_H; anclaX = [int]($CARA_W/2); anclaY = $CARA_H; frames = 1
            }
        } catch {
            Write-Host "  aviso: no se pudo recortar la cabeza de $($e.id)"
        }

        # Cuerpo entero para la ficha de jugador.
        $rutaCuerpo = Join-Path $DESTINO ("personajes\" + $e.id + "-cuerpo.png")
        try {
            [Procesador]::RecortarCuerpo($rutaSrc, $rutaCuerpo, $CUERPO_W, $CUERPO_H) | Out-Null
            $atlas[$e.id + 'Cuerpo'] = [ordered]@{
                archivo = "personajes/$($e.id)-cuerpo.png"
                w = $CUERPO_W; h = $CUERPO_H; anclaX = [int]($CUERPO_W/2); anclaY = $CUERPO_H; frames = 1
            }
        } catch {
            Write-Host "  aviso: no se pudo recortar el cuerpo de $($e.id)"
        }
    }

    $nFrames = 1
    $clips = $null

    # --- GIF de personaje ---------------------------------------------------
    # Manda sobre las otras dos formas de animar, por el mismo motivo por el que
    # las hojas mandaban sobre la procedural: si el artista ha dibujado el ciclo
    # entero, cualquier cosa que haga el codigo solo puede empeorarlo.
    #
    # Sobrescribe el sprite de un fotograma que acaba de escribir Procesar()
    # desde la ilustracion. Ese paso NO sobra aunque su resultado se tire: es lo
    # que comprueba que la ilustracion sigue recortandose bien —de ella salen el
    # retrato y el cuerpo de la ficha— y lo que llena la columna `Quitado` del
    # informe, que es donde se ve si el arte de origen se ha estropeado.
    if ($null -ne $e.gifAnim) {
        $rutaGif = Join-Path $ORIGEN $e.gifAnim
        $rg = [Procesador]::ProcesarGif($rutaGif, $rutaDst, $ESCALA, $e.alto, [bool]$e.voltear)
        $pg = $rg -split '\|'
        $nAndar = [int]$pg[2]
        $nQuieto = [int]$e.nQuieto
        $ra = [Procesador]::AnyadirReposo($rutaDst, $nAndar, [int]$e.idle, $nQuieto) -split '\|'

        $fw = [int]$ra[0]; $fh = [int]$ra[1]; $nFrames = [int]$ra[2]
        $ax = [int]($fw/2); $ay = $fh
        # `andar_lateral` NO se declara: el GIF es un ciclo frontal y no trae uno
        # escorado. jugador.js cae solo en `andar` si no existe, y declararlo
        # apuntando al mismo tramo seria un nombre que no significa nada.
        $clips = [ordered]@{
            andar  = [ordered]@{ desde = 0;       n = $nAndar;  fps = $e.fpsAndar }
            quieto = [ordered]@{ desde = $nAndar; n = $nQuieto; fps = 2 }
        }
    }
    # --- Hojas dibujadas a mano --------------------------------------------
    # Mandan sobre la animacion procedural: si el artista ha dibujado el ciclo,
    # deformar una pose por codigo solo puede empeorarlo.
    #
    # La caja de recorte se mide sobre las DOS hojas y se unen: con una caja por
    # hoja, la figura quedaria centrada de forma distinta a cada lado y el
    # personaje daria un salto lateral cada vez que gira, que es justo lo que
    # mas se hace en este juego.
    elseif ($null -ne $e.hojaDer) {
        $rd = Join-Path $ORIGEN $e.hojaDer
        $ri = Join-Path $ORIGEN $e.hojaIzq
        $md = [Procesador]::MedirHoja($rd, $e.cols, $e.filas) -split '\|'
        $mi = [Procesador]::MedirHoja($ri, $e.cols, $e.filas) -split '\|'
        $bx0 = [Math]::Min([int]$md[0], [int]$mi[0]); $by0 = [Math]::Min([int]$md[1], [int]$mi[1])
        $bx1 = [Math]::Max([int]$md[2], [int]$mi[2]); $by1 = [Math]::Max([int]$md[3], [int]$mi[3])

        $rutaIzq = Join-Path $DESTINO ("personajes\" + $e.id + "-izq.png")
        $altoFis = $e.alto * $ESCALA
        $hd = [Procesador]::RecortarHoja($rd, $rutaDst, $e.cols, $e.filas,
                                         $bx0, $by0, $bx1, $by1, $altoFis, $e.idle, 2) -split '\|'
        [Procesador]::RecortarHoja($ri, $rutaIzq, $e.cols, $e.filas,
                                   $bx0, $by0, $bx1, $by1, $altoFis, $e.idle, 2) | Out-Null

        $fw = [int]$hd[0]; $fh = [int]$hd[1]; $nFrames = [int]$hd[2]
        $ax = [int]($fw/2); $ay = $fh
        $andar = $e.cols * $e.filas
        # `andar_lateral` NO se declara: la hoja no trae un ciclo escorado y
        # jugador.js cae solo en `andar` si no existe. Inventarlo apuntando al
        # mismo tramo solo anadiria un nombre que no significa nada.
        $clips = [ordered]@{
            andar  = [ordered]@{ desde = 0;      n = $andar; fps = $e.fpsAndar }
            quieto = [ordered]@{ desde = $andar; n = 2;      fps = 2 }
        }
        $atlas[$e.id + 'Izq'] = [ordered]@{
            archivo = "personajes/$($e.id)-izq.png"
            w = $fw; h = $fh; anclaX = $ax; anclaY = $ay; frames = $nFrames
            clips = $clips
        }
    }
    # Personajes sin hoja: expandir la pose unica a una tira de 10.
    elseif ($null -ne $e.cadera) {
        $ra = [Procesador]::AnimarPersonaje($rutaDst, [double]$e.cadera,
                                            [int]$e.ampPierna, [bool]$e.falda,
                                            [int]$e.ampEscora)
        $nFrames = [int](($ra -split '\|')[2])
        $clips = [ordered]@{
            quieto        = [ordered]@{ desde = 0; n = 2; fps = 3 }
            andar         = [ordered]@{ desde = 2; n = 4; fps = 8 }
            andar_lateral = [ordered]@{ desde = 6; n = 4; fps = 8 }
        }
    }

    $atlas[$e.id] = [ordered]@{
        archivo = $e.dst.Replace('\', '/')
        w = $fw; h = $fh; anclaX = $ax; anclaY = $ay; frames = $nFrames
    }
    if ($clips) { $atlas[$e.id].clips = $clips }
    # Decoracion estatica: sin espejo ni destello de impacto (ver CATALOGO).
    if ($e.plano) { $atlas[$e.id].plano = $true }

    $informe += [PSCustomObject]@{
        Id      = $e.id
        Silueta = "${silW}x${silH}"
        Ratio   = $ratio
        Sprite  = if ($nFrames -gt 1) { "${fw}x${fh} x$nFrames" } else { "${fw}x${fh}" }
        Quitado = "$quitado%"
        Estado  = $estado
    }
}

$informe | Format-Table -AutoSize

# ---------------------------------------------------------------------------
# HOJAS DE ICONOS
# ---------------------------------------------------------------------------
#
# Sergio ha dibujado las dos hojas de golpe, una con las 52 armas y otra con los
# 8 objetos, cada icono en su hueco y en el mismo orden en que están declarados
# en datos/. Estas listas son ESE contrato, escrito donde se puede comprobar: el
# hueco `i` de la hoja es el id `i` de la lista.
#
# Sí, los ids están dos veces —aquí y en datos/armas.js—. Es a propósito y es lo
# mismo que ya hace $CATALOGO con los enemigos: mapear un archivo de arte a un id
# del juego es justo el trabajo de esta herramienta. La alternativa era que el
# motor dedujera el hueco por la posición en ARMAS, y entonces meter un arma
# nueva EN MEDIO del catálogo correría en silencio el icono de las treinta que
# vienen detrás. Así, lo peor que pasa es que a un arma nueva le falte su icono y
# salga con el glifo de siempre, que es un fallo que se ve.
#
# Las EVOLUCIONES no están: no salen en el sorteo y heredan en ui/hud.js el icono
# del arma de la que salen, así que dibujarlas era trabajo de más.
$ICONOS_ARMAS = @(
    'pilum','gladius','pistola','escopeta','lanzasGemelas','columnaDoble','rosaDeVientos','metralla',
    'lanzagranadas','bombardeo','ondaExpansiva','aquila','fuegoGriego','rete','rayoHorizontal','rayoCruzado',
    'scutum','ballista','tribulus','arcoCorto','honda','fusil','subfusil','revolver',
    'hacha','maza','latigo','motosierra','guadanya','lanzallamas','recortada','aspa',
    'enfilada','agujas','muroDeLanzas','enjambre','molotov','lanzacohetes','artilleria','lluviaDeFlechas',
    'gritoDeGuerra','sismo','aceiteHirviendo','minas','alquitran','campoElectrico','laser','aspaDeLuz',
    'satelites','discosDeSierra','katana','sierrasVotivas'
)
$ICONOS_OBJETOS = @(
    'sandalias','lorica','anilloAugusto','clepsidra',
    'coronaLaurel','antorcha','piedraIman','anfora'
)

# 32 y no 20 —la rejilla a la que se rasterizaban los glifos vectoriales— porque
# ahora hay dibujo de verdad que perder. Y no más de 32: el sitio más pequeño
# donde se ve un icono es la ranura del panel de la esquina, que a zoom 1 son
# unos 24 píxeles de pantalla. Una hoja más fina que eso obligaría a REDUCIR con
# el suavizado apagado, o sea a tirar filas enteras de píxeles, que es lo que
# de verdad ensucia un icono.
$LADO_ICONO = 32

$HOJAS_ICONOS = @(
    # `modo` rejilla: la hoja trae alfa y los iconos caen en celdas iguales.
    @{ src='objetos\objetos.png'; dst='iconos\objetos.png'; id='iconosObjetos'
       ids=$ICONOS_OBJETOS; modo='rejilla'; cols=4; filas=2 }
    # `modo` marco: opaca, con los iconos enmarcados sobre negro y la rejilla
    # irregular. Ver CajasDeMarco.
    @{ src='armas\armas.png';    dst='iconos\armas.png';    id='iconosArmas'
       ids=$ICONOS_ARMAS;   modo='marco';   cols=0; filas=0 }
)

New-Item -ItemType Directory -Force -Path (Join-Path $DESTINO 'iconos') | Out-Null

$informeIconos = @()
foreach ($hoja in $HOJAS_ICONOS) {
    $rutaSrc = Join-Path $ORIGEN $hoja.src
    $rutaDst = Join-Path $DESTINO $hoja.dst
    $n = $hoja.ids.Count
    if (-not (Test-Path $rutaSrc)) {
        $informeIconos += [PSCustomObject]@{ Hoja=$hoja.id; Pedidos=$n; Hallados='-'; Tira='-'; Estado='NO EXISTE' }
        continue
    }
    try {
        $r = [Procesador]::RecortarIconos($rutaSrc, $rutaDst, $n, $LADO_ICONO,
                                          $hoja.modo, $hoja.cols, $hoja.filas)
    } catch {
        $informeIconos += [PSCustomObject]@{ Hoja=$hoja.id; Pedidos=$n; Hallados='-'; Tira='-'; Estado='ERROR' }
        continue
    }
    $p = $r -split '\|'
    $hallados = [int]$p[0]

    # `plano`: esta entrada NO es un sprite del mundo. Le dice a core/recursos.js
    # que no genere ni la copia espejada ni la del destello de impacto — un icono
    # ni mira a un lado ni recibe golpes, y son dos lienzos de 1664x32 por hoja
    # que no iba a usar nadie.
    $atlas[$hoja.id] = [ordered]@{
        archivo = $hoja.dst.Replace('\', '/')
        w = $LADO_ICONO; h = $LADO_ICONO
        anclaX = [int]($LADO_ICONO / 2); anclaY = [int]($LADO_ICONO / 2)
        frames = $n
        plano = $true
        orden = $hoja.ids
    }

    $informeIconos += [PSCustomObject]@{
        Hoja    = $hoja.id
        Pedidos = $n
        Hallados= $hallados
        Tira    = "$($LADO_ICONO * $n)x$LADO_ICONO"
        Estado  = if ($hallados -eq $n) { 'OK' } else { 'DESCUADRE' }
    }
    # Con la cuenta descuadrada el número solo dice que algo falla; lo que hace
    # falta para arreglarlo es VER qué silueta cayó en cada hueco, porque un
    # recorte que junta dos celdas se delata por el tamaño.
    if ($hallados -ne $n) { "  detalle $($hoja.id): $($p[2])" }
}
$informeIconos | Format-Table -AutoSize
"DESCUADRE = la hoja no tiene tantos iconos como ids declarados; revisar el recorte."

# ---------------------------------------------------------------------------
# SUELO DE NIVEL
# ---------------------------------------------------------------------------
#
# Un mapa por nivel, en resources/stages/<n>/. Sale a assets/niveles/ y lo
# declara el propio nivel en `suelo.imagen` (datos/niveles/merida.js), que es
# lo que mantiene el contrato: un nivel nuevo sigue siendo copiar un archivo de
# datos y dejar su mapa, sin tocar el motor.
#
# El margen de fusión es el 6% del lado corto: bastante para que la mezcla no
# se note como una banda, poco para no tirar arte. Con la calzada nocturna
# (1536x1815 de origen) son 92 píxeles.
#
# Antes de teselar, el mapa de Emerita pasa por Ensanchar (más arriba en este
# mismo archivo): +384 px reflejados a cada lado, 768 en total —el 50% pedido—,
# sin tocar el original. Es lo que hace que el nivel, que hasta ahora salía
# más estrecho que la pantalla (480 unidades lógicas), tenga ya sitio de sobra
# a los lados de la calzada.
$rutaMapaOriginal = Join-Path $ORIGEN 'stages\1\mapa_emerita_survivor.png'
$rutaMapaAncho = Join-Path $ORIGEN 'stages\1\mapa_emerita_survivor_ancho.png'
if (Test-Path $rutaMapaOriginal) {
    # `unidad` a pliegue único (=pxPorLado): se probó a trocear el pliegue en
    # unidades más pequeñas (128, 192) para que el rombo del espejo pesara
    # menos, y salió AL REVÉS -- el patrón de árboles ya es tan regular que
    # trocear el espejo solo multiplica el número de rombos visibles en vez
    # de esconderlos. Un solo pliegue por lado es, de las tres, la que menos
    # se nota.
    $rEnsanchar = [Procesador]::Ensanchar($rutaMapaOriginal, $rutaMapaAncho, 384, 384)
    "Ensanchar mapa nivel 1: $rEnsanchar"
}

$SUELOS = @(
    @{ src='stages\1\mapa_emerita_survivor_ancho.png'; dst='niveles\merida-suelo.png'; margen=92 }
)

New-Item -ItemType Directory -Force -Path (Join-Path $DESTINO 'niveles') | Out-Null

$informeSuelo = @()
foreach ($s in $SUELOS) {
    $rutaSrc = Join-Path $ORIGEN $s.src
    $rutaDst = Join-Path $DESTINO $s.dst
    if (-not (Test-Path $rutaSrc)) {
        $informeSuelo += [PSCustomObject]@{ Mapa=$s.dst; Tile='-'; CosturaX='-'; CosturaY='-'; Estado='NO EXISTE' }
        continue
    }
    try {
        $r = [Procesador]::HacerTeselable($rutaSrc, $rutaDst, $s.margen, $ESCALA)
    } catch {
        $informeSuelo += [PSCustomObject]@{ Mapa=$s.dst; Tile='-'; CosturaX='-'; CosturaY='-'; Estado='ERROR' }
        continue
    }
    $p = $r -split '\|'
    if ($p.Count -ne 4) {
        $informeSuelo += [PSCustomObject]@{ Mapa=$s.dst; Tile='-'; CosturaX='-'; CosturaY='-'; Estado=$r }
        continue
    }
    $informeSuelo += [PSCustomObject]@{
        Mapa     = $s.dst
        Tile     = "$($p[0])x$($p[1])  ($([int]$p[0]/$ESCALA)x$([int]$p[1]/$ESCALA) logicas)"
        CosturaX = $p[2]
        CosturaY = $p[3]
        Estado   = 'OK'
    }
}
$informeSuelo | Format-Table -AutoSize
"Costura = salto medio al repetir VS salto entre dos pixeles del interior."
"Si el primer numero no supera al segundo, la union no se ve."

# ---------------------------------------------------------------------------
# ILUSTRACIONES DE MENU
# ---------------------------------------------------------------------------
#
# Titulo y seleccion de personaje. Estas NO se procesan: se copian tal cual y
# solo se les cambia el nombre a algo que el motor pueda escribir sin comillas.
#
# No se recortan porque no hay nada que recortar —son pantallas completas, sin
# silueta ni fondo que quitar— y no se reducen porque el juego las AMPLIA: la
# del titulo mide 1536 de ancho y el lienzo 1920. Reducirlas aqui seria tirar
# detalle para volver a estirarlo despues.
#
# La copia existe igualmente para que se mantenga la regla del proyecto: el
# juego lee de assets/ y de ningun otro sitio, y resources/ es solo la fuente.
$MENUS = @(
    @{ src='menus\Pantalla_Start.png';    dst='menus\titulo.png' }
    @{ src='menus\seleccion_jugador.png'; dst='menus\seleccion.png' }
)

New-Item -ItemType Directory -Force -Path (Join-Path $DESTINO 'menus') | Out-Null

$informeMenus = @()
foreach ($m in $MENUS) {
    $rutaSrc = Join-Path $ORIGEN $m.src
    $rutaDst = Join-Path $DESTINO $m.dst
    if (-not (Test-Path $rutaSrc)) {
        $informeMenus += [PSCustomObject]@{ Menu=$m.dst; Tamano='-'; Estado='NO EXISTE' }
        continue
    }
    Copy-Item $rutaSrc $rutaDst -Force
    $img = [System.Drawing.Image]::FromFile($rutaDst)
    $informeMenus += [PSCustomObject]@{
        Menu   = $m.dst
        Tamano = "$($img.Width)x$($img.Height)"
        Estado = 'COPIADA'
    }
    $img.Dispose()
}
$informeMenus | Format-Table -AutoSize

# ---------------------------------------------------------------------------
# MUSICA
# ---------------------------------------------------------------------------
#
# Las dos canciones del nivel 1. Se copian tal cual, igual que las
# ilustraciones de menu: aqui no hay nada que procesar y recodificar solo
# perderia calidad.
#
# El ORDEN de esta lista es el orden en que suenan, y de ahi vuelven a empezar.
# Lo lee sistemas/audio.js por las rutas de assets/musica/.
$MUSICA = @(
    @{ src='musica\Musica_emerita_1.mp3'; dst='musica\emerita-1.mp3' }
    @{ src='musica\Musica_emerita_2.mp3'; dst='musica\emerita-2.mp3' }
)

New-Item -ItemType Directory -Force -Path (Join-Path $DESTINO 'musica') | Out-Null

$informeMusica = @()
foreach ($m in $MUSICA) {
    $rutaSrc = Join-Path $ORIGEN $m.src
    $rutaDst = Join-Path $DESTINO $m.dst
    if (-not (Test-Path $rutaSrc)) {
        $informeMusica += [PSCustomObject]@{ Pista=$m.dst; Tamano='-'; Estado='NO EXISTE' }
        continue
    }
    Copy-Item $rutaSrc $rutaDst -Force
    $informeMusica += [PSCustomObject]@{
        Pista  = $m.dst
        Tamano = "{0:N1} MB" -f ((Get-Item $rutaDst).Length / 1MB)
        Estado = 'COPIADA'
    }
}
$informeMusica | Format-Table -AutoSize

$json = [ordered]@{ escalaArte = $ESCALA; entidades = $atlas } | ConvertTo-Json -Depth 5
# UTF-8 SIN BOM: Set-Content -Encoding utf8 lo añade en PowerShell 5.1 y deja un
# JSON que algunos parsers rechazan de plano.
[System.IO.File]::WriteAllText(
    (Join-Path $DESTINO 'atlas.json'), $json,
    (New-Object System.Text.UTF8Encoding $false))

"", "Atlas escrito en assets/atlas.json"
"FALLO/DUDOSO = apenas se quito fondo; requiere retoque manual."
