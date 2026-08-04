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
                                  int escala, int tol, int anchoLogFijo) {

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

        // --- 5. Reduccion por media de area con alfa premultiplicado -------
        // GDI+ mezclaria el color de fondo de los pixeles ya transparentes y
        // dejaria halos. Promediando ponderado por alfa eso no ocurre.
        byte[] dst = new byte[frameW * 4 * frameH];
        int dStride = frameW * 4;

        for (int y = 0; y < destH; y++) {
            int sy0 = minY + (int)((long)y * silH / destH);
            int sy1 = minY + (int)((long)(y + 1) * silH / destH);
            if (sy1 <= sy0) sy1 = sy0 + 1;
            for (int x = 0; x < destW; x++) {
                int sx0 = minX + (int)((long)x * silW / destW);
                int sx1 = minX + (int)((long)(x + 1) * silW / destW);
                if (sx1 <= sx0) sx1 = sx0 + 1;

                long sA = 0, sR = 0, sG = 0, sB = 0;
                int n = 0;
                for (int sy = sy0; sy < sy1; sy++) {
                    for (int sx = sx0; sx < sx1; sx++) {
                        int p = sy * stride + sx * 4;
                        int a = b[p + 3];
                        sA += a;
                        sB += b[p] * a; sG += b[p + 1] * a; sR += b[p + 2] * a;
                        n++;
                    }
                }
                int q = (offY + y) * dStride + (offX + x) * 4;
                if (sA == 0) { dst[q] = 0; dst[q + 1] = 0; dst[q + 2] = 0; dst[q + 3] = 0; }
                else {
                    dst[q]     = (byte)(sB / sA);
                    dst[q + 1] = (byte)(sG / sA);
                    dst[q + 2] = (byte)(sR / sA);
                    dst[q + 3] = (byte)(sA / n);
                }
            }
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
    public static string RecortarCabeza(string entrada, string salida, int lado,
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

        // Caja cuadrada que cubra la cabeza con holgura
        int altoCabeza = yFin - minY + 1;
        int anchoCabeza = hMaxX - hMinX + 1;
        int ladoCaja = (int)(Math.Max(altoCabeza, anchoCabeza) * (1.0 + margen));
        int x0 = cx - ladoCaja / 2;
        int y0 = minY - (int)(altoCabeza * margen * 0.5);

        // --- Reduccion por media de area con alfa premultiplicado ----------
        byte[] dst = new byte[lado * 4 * lado];
        int dStride = lado * 4;
        for (int y = 0; y < lado; y++) {
            int sy0 = y0 + (int)((long)y * ladoCaja / lado);
            int sy1 = y0 + (int)((long)(y+1) * ladoCaja / lado);
            if (sy1 <= sy0) sy1 = sy0 + 1;
            for (int x = 0; x < lado; x++) {
                int sx0 = x0 + (int)((long)x * ladoCaja / lado);
                int sx1 = x0 + (int)((long)(x+1) * ladoCaja / lado);
                if (sx1 <= sx0) sx1 = sx0 + 1;

                long sA=0, sR=0, sG=0, sB=0; int n=0;
                for (int sy = sy0; sy < sy1; sy++) {
                    if (sy < 0 || sy >= h) { n++; continue; }
                    for (int sx = sx0; sx < sx1; sx++) {
                        if (sx < 0 || sx >= w) { n++; continue; }
                        int p = sy*stride + sx*4;
                        int a = px[p+3];
                        sA += a;
                        sB += px[p]*a; sG += px[p+1]*a; sR += px[p+2]*a;
                        n++;
                    }
                }
                int q = y*dStride + x*4;
                if (sA == 0) { dst[q]=0; dst[q+1]=0; dst[q+2]=0; dst[q+3]=0; }
                else {
                    dst[q]   = (byte)(sB / sA);
                    dst[q+1] = (byte)(sG / sA);
                    dst[q+2] = (byte)(sR / sA);
                    dst[q+3] = (byte)(sA / n);
                }
            }
        }

        using (Bitmap sal = new Bitmap(lado, lado, PixelFormat.Format32bppArgb)) {
            BitmapData dd = sal.LockBits(new Rectangle(0,0,lado,lado), ImageLockMode.WriteOnly,
                                         PixelFormat.Format32bppArgb);
            for (int y = 0; y < lado; y++)
                Marshal.Copy(dst, y*dStride, (IntPtr)(dd.Scan0.ToInt64() + y*dd.Stride), dStride);
            sal.UnlockBits(dd);
            sal.Save(salida, ImageFormat.Png);
        }
        return lado + "|" + lado + "|1";
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
}
"@

# --- Configuracion ---------------------------------------------------------
$RAIZ    = Split-Path -Parent $PSScriptRoot
$ORIGEN  = Join-Path $RAIZ 'resources'
$DESTINO = Join-Path $RAIZ 'assets'
$ESCALA  = 2      # ESCALA_ARTE: 1 unidad logica = 2 pixeles fisicos
$TOL     = 30

# alto = alto LOGICO en unidades de 480x270. anchoFijo 0 => sale del ratio real.
# tol 0 => usa $TOL. Se sube solo en los que traen fondo sombreado o degradado.
#
# placeholder = la fuente no es recuperable automaticamente; se emite entrada de
# atlas sin archivo para que recursos.js genere su silueta. Ninguna lo necesita
# ahora: los cuatro personajes se re-exportaron con alfa real.
$CATALOGO = @(
    @{ src='enemies\snake.png';            dst='enemigos\serpiente.png'; id='serpiente'; alto=20;  anchoFijo=0;  tol=0 }
    # GIF animado de 7 fotogramas, pixel art nativo de 48x48 ampliado 8x.
    # voltear porque el original mira a la izquierda y el motor asume derecha.
    @{ src='enemies\gargoyle_new.gif';     dst='enemigos\gargola.png';   id='gargola';   alto=20;  anchoFijo=0;  tol=0; gif=$true; voltear=$true }
    @{ src='enemies\legionario.png';       dst='enemigos\legionario.png';id='legionario';alto=26;  anchoFijo=0;  tol=0 }
    @{ src='enemies\gladiator.png';        dst='enemigos\gladiador.png'; id='gladiador'; alto=24;  anchoFijo=0;  tol=38 }
    @{ src='enemies\arpia.png';            dst='enemigos\arpia.png';     id='arpia';     alto=22;  anchoFijo=0;  tol=0 }
    @{ src='enemies\medusa.png';           dst='enemigos\medusa.png';    id='medusa';    alto=28;  anchoFijo=0;  tol=0 }
    @{ src='enemies\minotauro.png';        dst='enemigos\minotauro.png'; id='minotauro'; alto=36;  anchoFijo=0;  tol=0 }
    @{ src='enemies\ciclope.png';          dst='enemigos\ciclope.png';   id='ciclope';   alto=42;  anchoFijo=0;  tol=45 }
    @{ src='enemies\masticore.png';        dst='enemigos\manticora.png'; id='manticora'; alto=52;  anchoFijo=0;  tol=0 }
    @{ src='enemies\cerberus.png';         dst='enemigos\cerbero.png';   id='cerbero';   alto=86;  anchoFijo=0;  tol=0 }
    @{ src='enemies\hidra_final_boss.png'; dst='enemigos\hidra.png';     id='hidra';     alto=112; anchoFijo=0;  tol=0 }
    # Personajes: MISMO ALTO logico (32), ancho derivado de su silueta. Encajar
    # la figura dentro de un cuadrado comun hacia que las poses anchas salieran
    # mas bajas: a Vicky, con ratio 1.43, la limitaba el ancho y se quedaba en 22
    # de alto frente a los 32 de Eric.
    # Los personajes se animan al vuelo desde su unica pose (ver
    # AnimarPersonaje). `cadera` es la fraccion del alto a la que empiezan las
    # piernas de verdad, medida sobre el sprite: no es el 52% generico que usaba
    # el motor, ahi todavia hay pantalon. Lucy va en modo falda porque su vestido
    # llega al tobillo y no hay piernas que separar.
    @{ src='characters\Eric.png';  dst='personajes\eric.png';  id='eric';  alto=32; anchoFijo=0; tol=0; cadera=0.68; ampPierna=4; ampEscora=4 }
    @{ src='characters\Lucy.png';  dst='personajes\lucy.png';  id='lucy';  alto=32; anchoFijo=0; tol=0; cadera=0.55; ampPierna=3; falda=$true; ampEscora=3 }
    @{ src='characters\Sara.png';  dst='personajes\sara.png';  id='sara';  alto=32; anchoFijo=0; tol=0; cadera=0.62; ampPierna=4; ampEscora=4 }
    @{ src='characters\Vicky.png'; dst='personajes\vicky.png'; id='vicky'; alto=32; anchoFijo=0; tol=0; cadera=0.62; ampPierna=4; ampEscora=4 }
)

New-Item -ItemType Directory -Force -Path (Join-Path $DESTINO 'enemigos')   | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $DESTINO 'personajes') | Out-Null

$informe = @()
$atlas = [ordered]@{}

foreach ($e in $CATALOGO) {
    $rutaSrc = Join-Path $ORIGEN $e.src
    $rutaDst = Join-Path $DESTINO $e.dst
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
            $r = [Procesador]::ProcesarGif($rutaSrc, $rutaDst, $ESCALA, $e.alto * 3, [bool]$e.voltear)
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
        $r = [Procesador]::Procesar($rutaSrc, $rutaDst, $e.alto, $ESCALA, $tolAsset, $e.anchoFijo)
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

    # Retrato para el panel de informacion, recortado del ORIGINAL.
    if ($null -ne $e.cadera) {
        $rutaCara = Join-Path $DESTINO ("personajes\" + $e.id + "-cara.png")
        try {
            # 192 y no 72. El retrato NO es pixel art: se dibuja en la capa de
            # interfaz, que va a la resolucion real del monitor. Con zoom de
            # pantalla 3x y densidad 2x, la capa trabaja a 6 pixeles de
            # dispositivo por unidad, asi que un retrato de 30 unidades pide 180
            # pixeles reales. A 72 habia que AMPLIARLO dos veces y media y se
            # veia blando, que es justo lo contrario de lo que busca recortar
            # desde el original a resolucion completa. A 192 sobra en cualquier
            # combinacion razonable de zoom y densidad, y son cuatro PNG de unos
            # 40 KB: no hay nada que optimizar aqui.
            [Procesador]::RecortarCabeza($rutaSrc, $rutaCara, 192, 0.30, 0.22) | Out-Null
            $atlas[$e.id + 'Cara'] = [ordered]@{
                archivo = "personajes/$($e.id)-cara.png"
                w = 192; h = 192; anclaX = 96; anclaY = 192; frames = 1
            }
        } catch {
            Write-Host "  aviso: no se pudo recortar la cabeza de $($e.id)"
        }
    }

    $nFrames = 1
    $clips = $null
    # Personajes: expandir la pose unica a una tira de 6 (2 quieto + 4 andar).
    if ($null -ne $e.cadera) {
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

$json = [ordered]@{ escalaArte = $ESCALA; entidades = $atlas } | ConvertTo-Json -Depth 5
# UTF-8 SIN BOM: Set-Content -Encoding utf8 lo añade en PowerShell 5.1 y deja un
# JSON que algunos parsers rechazan de plano.
[System.IO.File]::WriteAllText(
    (Join-Path $DESTINO 'atlas.json'), $json,
    (New-Object System.Text.UTF8Encoding $false))

"", "Atlas escrito en assets/atlas.json"
"FALLO/DUDOSO = apenas se quito fondo; requiere retoque manual."
