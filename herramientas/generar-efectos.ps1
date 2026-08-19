# ---------------------------------------------------------------------------
# generar-efectos.ps1 - Fabrica hojas de efectos POR CODIGO.
#
# Herramienta OFFLINE, como procesar-assets.ps1 y ver-assets.ps1: no forma
# parte del juego. Produce PNG planos y el motor solo consume su salida.
#
# POR QUE EXISTE. efectos-mapa.md dejo medido el hueco mas grande del juego
# -la explosion, 7 armas- y tambien por que no se pudo llenar recortando de
# las laminas de catalogo: "no existe ninguna secuencia en las laminas", y
# hornear la rampa de escala a mano era "el caso caro". De las cinco celdas de
# zona que se probaron recortadas no sobrevivio ninguna.
#
# Una secuencia, sin embargo, es ARITMETICA. Un fotograma de explosion es el
# mismo dibujo con el radio, la temperatura y el desgarro evaluados en otro
# instante. Generarla por codigo no es un apano por no tener al artista: es
# que aqui el codigo es el medio correcto, igual que el trazo por codigo gana
# a cualquier sprite en los proyectiles de 8 px.
#
# Lo que se gana frente a una lamina: la secuencia existe de verdad, el color
# es un parametro (cuatro explosiones distintas son cuatro paletas, no cuatro
# dibujos), es DETERMINISTA -misma semilla, mismo PNG byte a byte- y se puede
# reajustar mil veces sin coste.
#
# EL PIXEL SE DIBUJA A TAMANO LOGICO Y SE AMPLIA POR VECINO MAS PROXIMO. Es la
# decision que hace que esto sea pixel art y no una ilustracion suave: el
# juego corre a 480x270 con ESCALA_ARTE 4, asi que un pixel de arte son 4
# pixeles fisicos. Dibujando directo a 320 saldrian degradados finos que
# cantarian contra todo lo demas.
#
#   .\herramientas\generar-efectos.ps1
#   .\herramientas\generar-efectos.ps1 -Solo fuego
# ---------------------------------------------------------------------------
param(
    [string]$Solo = '',
    [string]$Destino = 'assets\efectos'
)

Add-Type -AssemblyName System.Drawing

Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Globalization;
using System.Runtime.InteropServices;

public class Pirotecnia {

    // RNG propio y no System.Random, por el mismo motivo que el juego tiene su
    // core/rng.js: que la salida sea reproducible entre maquinas y versiones.
    // System.Random no garantiza la misma secuencia entre runtimes.
    class Az {
        uint s;
        public Az(uint semilla) { s = semilla == 0 ? 1u : semilla; }
        public uint U() { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return s; }
        public double D() { return (U() & 0xFFFFFF) / 16777216.0; }
        public double R(double a, double b) { return a + (b - a) * D(); }
    }

    static int[] LeerPaleta(string txt) {
        string[] p = txt.Split(',');
        int[] c = new int[p.Length];
        for (int i = 0; i < p.Length; i++)
            c[i] = (int)uint.Parse(p[i].Trim(), NumberStyles.HexNumber);
        return c;
    }

    // Escribe en el buffer logico quedandose con lo MAS OPACO. No se mezcla
    // por alfa: el destino final es composicion aditiva en el juego, y ahi
    // mezclar aqui solo emborrona el escalon de paleta que da el aspecto.
    static void Poner(byte[] al, int[] rgb, int lado, int x, int y, int color, double a) {
        if (x < 0 || y < 0 || x >= lado || y >= lado) return;
        if (a <= 0) return;
        if (a > 1) a = 1;
        int i = y * lado + x;
        byte b = (byte)(a * 255.0 + 0.5);
        if (b <= al[i]) return;
        al[i] = b; rgb[i] = color;
    }

    // Devuelve una linea de medidas por fotograma para poder verificar la hoja
    // SIN abrirla: "opacos|radioBola" separados por ';'. Ver ver-assets.ps1 y la
    // regla de coste de contexto del CLAUDE.md.
    //
    // Y se mide el radio de LA BOLA, calculado, no el del pixel encendido mas
    // lejano. La primera version medio lo segundo y dio radio no monotono en
    // las cuatro explosiones: lo que estaba midiendo eran las CHISPAS, que
    // mueren cada una a su hora. Es la misma leccion que efectos-mapa.md ya
    // aprendio en su ronda 3 con la orla -medir lo que se puede contar no es
    // lo mismo que medir lo que importa- asi que la metrica mide ahora la
    // silueta del fuego, que es lo unico que tiene que crecer siempre.
    //
    // OJO: nada de acentos graves en este bloque. Va dentro de un here-string
    // de PowerShell, donde el acento grave es el caracter de escape: un
    // "radios" entre acentos graves se convirtio en un retorno de carro y
    // rompio la compilacion del C# con un error que senalaba a otra linea.
    //
    // El parametro margen es cuanto sobresale la celda del radio de dano.
    // Existe porque el desgarro de la silueta y las chispas se salen de la
    // bola, y sin holgura el cuadro se las comeria. El motor tiene que dibujar
    // la celda con medio lado = radioDeDano * margen; por eso viaja al atlas.
    //
    // TRES FAMILIAS, UN SOLO ALGORITMO. La explosion, la onda expansiva y el
    // reventon de tierra o veneno no son tres funciones: son esta con otros
    // numeros. Es el argumento entero de generar por codigo, y es lo que hace
    // que la tercera variante cueste una fila de tabla y no un dibujo.
    //
    //   explosion -> huecoIni 0, nucleo 1     : bola llena que se vacia al final
    //   onda      -> huecoIni alto, nucleo 1  : cascara desde el primer momento
    //   reventon  -> nucleo bajo, chispas     : poca bola y mucha metralla
    public static string Explosion(string salida, int radioDanyo, double margen,
                                   int nFrames, int escala,
                                   uint semilla, string paletaTxt, int nChispas,
                                   double huecoIni, double huecoMax,
                                   double rugosidad, double anillo,
                                   double nucleo, double chispaTam) {

        int[] pal = LeerPaleta(paletaTxt);
        int radioLog = (int)Math.Round(radioDanyo * margen);   // medio lado de la celda
        int lado = radioLog * 2;
        Az az = new Az(semilla);

        // ARMONICOS DE LA SILUETA, fijos para toda la explosion. Que sean fijos
        // es lo que hace que los fotogramas sean LA MISMA bola creciendo y no
        // ocho manchas distintas: si el desgarro cambiara de forma cada
        // fotograma, la animacion herviria en vez de expandirse.
        int[] arm = new int[3]; double[] amp = new double[3]; double[] fase = new double[3];
        for (int k = 0; k < 3; k++) {
            arm[k] = 3 + k * 2;                    // 3, 5, 7 lobulos
            amp[k] = az.R(0.05, 0.13) / (k + 1);   // los altos, mas suaves
            fase[k] = az.R(0, Math.PI * 2);
        }

        // CHISPAS. Se sortean una vez y se evaluan en cada instante, que es lo
        // mismo que hace el motor con las particulas: la trayectoria es una
        // funcion del tiempo, no un estado que se acumula.
        double[] cAng = new double[nChispas], cVel = new double[nChispas];
        double[] cIni = new double[nChispas], cFin = new double[nChispas];
        int[] cTam = new int[nChispas];
        for (int k = 0; k < nChispas; k++) {
            cAng[k] = az.R(0, Math.PI * 2);
            cVel[k] = az.R(0.55, 1.15);
            cIni[k] = az.R(0.0, 0.22);
            cFin[k] = az.R(0.55, 1.0);
            cTam[k] = (int)Math.Round((az.D() < 0.72 ? 1 : 2) * chispaTam);
            if (cTam[k] < 1) cTam[k] = 1;
        }

        byte[] alfa = new byte[lado * lado];
        int[] rgb = new int[lado * lado];

        int anchoTira = lado * escala * nFrames, altoTira = lado * escala;
        int stride = anchoTira * 4;
        byte[] buf = new byte[stride * altoTira];   // BGRA, que es como lo quiere 32bppArgb
        string medidas = "";

        for (int f = 0; f < nFrames; f++) {
            // DOS VARIABLES, NO UNA, y es la correccion mas importante de esta
            // herramienta.
            //
            //   p = progreso de RADIO, repartido lineal entre los fotogramas
            //   t = tiempo real correspondiente a ese radio, o sea p*p
            //
            // El motivo. zonaDanyo.js abre el radio de una onda con
            // radioIni + (radio - radioIni)*sqrt(t), y sqrt es empinadisima al
            // principio: repartiendo los fotogramas lineal en el TIEMPO, el
            // primero cubria de golpe el 26% del radio y el dibujo se quedaba
            // muy por detras de lo que ya estaba matando. Medido: 26,2% del
            // radio de desfase en t=0,095, igual en las siete armas.
            //
            // Repartiendo lineal en el RADIO, cada fotograma vale un escalon
            // igual de radio, que es lo que el ojo sigue, y el tiempo se apreta
            // solo al principio -que es justo como revienta una explosion-.
            // El motor elige fotograma por radio, no por reloj: ver dibujarAire.
            // EL REPARTO DE FOTOGRAMAS: media de lineal en el radio y
            // geometrico. Con la tabla de radios en el atlas el desfase contra
            // el radio de dano es CERO se reparta como se reparta, asi que el
            // reparto solo decide dos cosas, y estan en conflicto:
            //
            //   - cuanto tiene que ampliar el motor la celda (deforma el pixel)
            //   - cuanta vida se come un solo fotograma (congela la animacion)
            //
            // El lineal da escalones enormes EN PROPORCION en la parte pequena
            // -del 0,15 al 0,24 hay un +63%- y ampliaba el pixel. El geometrico
            // los iguala en proporcion pero amontona los fotogramas al
            // principio y deja el ultimo cubriendo el 40% de la vida, o sea la
            // explosion congelada al final. Medido con las dos leyes a 10, 14 y
            // 18 fotogramas, la media a 18 es el mejor punto: amplia 1,106x
            // como mucho y ningun fotograma pasa del 16% de la vida.
            double p = nFrames == 1 ? 1 : (double)f / (nFrames - 1);
            double rn = 0.5 * (0.15 + 0.85 * p) + 0.5 * (0.15 * Math.Pow(1.0 / 0.15, p));
            double R = radioDanyo * rn;

            // El TIEMPO que le corresponde a ese radio, invirtiendo la curva de
            // zonaDanyo.actualizar: rn = 0.15 + 0.85*sqrt(t). De aqui salen la
            // temperatura, el hueco y las chispas, que van con el reloj y no
            // con el tamano.
            double q = (rn - 0.15) / 0.85;
            double t = q * q;
            Array.Clear(alfa, 0, alfa.Length);
            Array.Clear(rgb, 0, rgb.Length);

            // El hueco central: a partir de media vida la bola se vacia y pasa
            // a ser cascara. Es lo que separa una explosion de un globo que
            // crece, y es tambien lo que deja ver lo que hay debajo justo
            // cuando el jugador necesita volver a leer el campo.
            // El hueco va de huecoIni a huecoMax. Una explosion empieza llena
            // (huecoIni 0) y se vacia pasada media vida; una onda expansiva
            // nace ya siendo cascara, porque eso es una onda.
            double h = huecoIni + (huecoMax - huecoIni) * Math.Max(0, (t - 0.40) / 0.60);
            if (h > 0.97) h = 0.97;

            // El desvanecido va por p y NO baja hasta cero. Con la primera
            // version el ultimo fotograma caia en desvanecido nulo y la celda
            // salia VACIA (se vio en la ocupacion, que daba 0). La hoja tiene
            // que acabar en un fotograma que todavia se vea -a poco mas de un
            // tercio de su brillo- y es el motor quien remata el apagado, igual
            // que hace el tajo de la Katana en sistemas/armas.js.
            double fadeG = p < 0.72 ? 1.0 : 1.0 - 0.62 * ((p - 0.72) / 0.28);

            for (int y = 0; y < lado; y++) {
                for (int x = 0; x < lado; x++) {
                    double dx = x + 0.5 - radioLog, dy = y + 0.5 - radioLog;
                    double d = Math.Sqrt(dx * dx + dy * dy);
                    if (d > R * 1.35) continue;
                    double ang = Math.Atan2(dy, dx);

                    double def = 0;
                    for (int k = 0; k < 3; k++) def += amp[k] * Math.Sin(arm[k] * ang + fase[k]);
                    // El desgarro CRECE con la vida: al nacer es una bola casi
                    // limpia y al disiparse esta rota. Al reves se leeria como
                    // que se recompone.
                    double Rq = R * (1 + def * rugosidad * (0.35 + 0.65 * t));
                    if (d > Rq) continue;

                    double u = d / Rq;
                    if (u < h) continue;
                    double v = (u - h) / (1 - h);
                    if (v < 0) v = 0;
                    if (v > 1) v = 1;

                    // TEMPERATURA. Cae hacia fuera (el nucleo es lo mas
                    // caliente) y cae con la vida (todo se enfria). El maximo
                    // esta en el borde del hueco, no en el centro geometrico:
                    // cuando la bola es cascara, lo caliente es la cascara.
                    double temp = (1 - v) * (1 - 0.68 * t);
                    int idx = (int)((1 - temp) * pal.Length);
                    if (idx < 0) idx = 0;
                    if (idx >= pal.Length) idx = pal.Length - 1;

                    Poner(alfa, rgb, lado, x, y, pal[idx], nucleo * fadeG * (0.58 + 0.42 * (1 - v)));
                }
            }

            // ONDA DE CHOQUE: un aro fino por delante del fuego, solo al
            // principio. Es lo que da el golpe seco; sin el, la explosion
            // empieza como una flor que se abre.
            if (anillo > 0 && t < 0.62) {
                double Rs = radioDanyo * (0.34 + 0.66 * Math.Sqrt(t));
                double gr = 0.9 + 1.5 * (1 - t);
                double aA = anillo * (1 - t / 0.62) * fadeG;
                for (int y = 0; y < lado; y++) {
                    for (int x = 0; x < lado; x++) {
                        double dx = x + 0.5 - radioLog, dy = y + 0.5 - radioLog;
                        double d = Math.Sqrt(dx * dx + dy * dy);
                        if (Math.Abs(d - Rs) > gr) continue;
                        Poner(alfa, rgb, lado, x, y, pal[0], aA);
                    }
                }
            }

            // CHISPAS, encima de todo.
            for (int k = 0; k < nChispas; k++) {
                if (t < cIni[k] || t > cFin[k]) continue;
                double tt = (t - cIni[k]) / (cFin[k] - cIni[k]);
                double pr = radioDanyo * (0.12 + cVel[k] * 0.98 * Math.Pow(tt, 0.55));
                int cx = (int)(radioLog + Math.Cos(cAng[k]) * pr);
                int cy = (int)(radioLog + Math.Sin(cAng[k]) * pr);
                double aC = (1 - tt) * fadeG;
                int col = pal[tt < 0.5 ? 0 : Math.Min(2, pal.Length - 1)];
                for (int oy = 0; oy < cTam[k]; oy++)
                    for (int ox = 0; ox < cTam[k]; ox++)
                        Poner(alfa, rgb, lado, cx + ox, cy + oy, col, aC);
            }

            // AMPLIACION POR BLOQUES. Cada pixel logico se escribe como un
            // cuadrado de escala x escala. Es exactamente lo que hace el juego
            // con imageSmoothingEnabled=false, hecho aqui de una vez para que
            // el blit del caso base salga 1:1.
            int opacos = 0; long masa = 0;
            for (int y = 0; y < lado; y++) {
                for (int x = 0; x < lado; x++) {
                    byte a = alfa[y * lado + x];
                    if (a == 0) continue;
                    opacos++; masa += a;
                    int c = rgb[y * lado + x];
                    byte rr = (byte)((c >> 16) & 255), gg = (byte)((c >> 8) & 255), bb = (byte)(c & 255);
                    int bx = f * lado * escala + x * escala, by = y * escala;
                    for (int oy = 0; oy < escala; oy++) {
                        int fila = (by + oy) * stride + bx * 4;
                        for (int ox = 0; ox < escala; ox++) {
                            int o = fila + ox * 4;
                            buf[o] = bb; buf[o + 1] = gg; buf[o + 2] = rr; buf[o + 3] = a;
                        }
                    }
                }
            }

            // El radio de la bola se CALCULA barriendo la silueta, no se saca
            // del pixel encendido mas lejano: ver el comentario de la firma.
            double rBola = 0;
            for (int s = 0; s < 720; s++) {
                double ang = s * Math.PI / 360.0;
                double def = 0;
                for (int k = 0; k < 3; k++) def += amp[k] * Math.Sin(arm[k] * ang + fase[k]);
                double Rq = R * (1 + def * rugosidad * (0.35 + 0.65 * t));
                if (Rq > rBola) rBola = Rq;
            }
            medidas += (f > 0 ? ";" : "") + opacos
                     + "|" + rBola.ToString("0.0", CultureInfo.InvariantCulture)
                     + "|" + (masa / 255);
        }

        Volcar(salida, buf, anchoTira, altoTira, stride);
        return medidas;
    }

    // CHARCOS. Otra familia, y esta si es otro algoritmo.
    //
    // Un charco no se parece a una explosion en nada de lo que importa:
    //
    //   - NO CRECE. El radio es fijo, asi que la animacion no es una rampa de
    //     escala sino un hervor: manchas que se mueven por dentro.
    //   - SE REPITE. Dura de 2,6 a 5 segundos y la tira son 18 fotogramas, o
    //     sea que tiene que poder darse en bucle SIN COSTURA. Por eso todo lo
    //     que se mueve va con sin/cos de una fase que da la vuelta entera en la
    //     tira: el fotograma 18 es identico al 0 por construccion.
    //   - VA EN COMPOSICION NORMAL, no aditiva. Una mancha en el suelo TAPA el
    //     suelo; sumar luz es lo que hace un fuego. Y por eso su paleta SI
    //     lleva tonos oscuros, al reves que las de arriba.
    //   - LLENA SU CIRCULO. La zona de dano es el circulo entero, asi que si la
    //     mancha no llega al borde queda suelo limpio DENTRO de lo que quema y
    //     el jugador lee que ahi esta a salvo. Fue el defecto medido que hundio
    //     el intento anterior de calcomanias (cobertura del 45%, ver
    //     efectos-mapa.md): aqui el borde se genera entre 0,93 y 1,0 del radio
    //     por construccion, no se recorta de un dibujo que ya venia como venia.
    public static string Charco(string salida, int radioDanyo, double margen,
                                int nFrames, int escala,
                                uint semilla, string paletaTxt,
                                double rugosidad, double hervor, int nBurbujas) {

        int[] pal = LeerPaleta(paletaTxt);
        int radioLog = (int)Math.Round(radioDanyo * margen);
        int lado = radioLog * 2;
        Az az = new Az(semilla);

        // Borde: armonicos fijos, amplitud PEQUENA. El charco tiene que llegar
        // al aro; un borde muy roto deja calvas de suelo dentro de la zona.
        int[] arm = new int[3]; double[] amp = new double[3]; double[] fase = new double[3];
        for (int k = 0; k < 3; k++) {
            arm[k] = 3 + k * 2;
            amp[k] = az.R(0.02, 0.05) / (k + 1);
            fase[k] = az.R(0, Math.PI * 2);
        }

        // Burbujas: cada una es una onda plana con su direccion, su frecuencia
        // y su sentido de giro. Sumadas dan un campo que hierve sin repetirse a
        // ojo, y como todas dan una vuelta entera en la tira, el bucle cierra.
        double[] bAng = new double[nBurbujas], bFrec = new double[nBurbujas];
        double[] bFase = new double[nBurbujas]; double[] bDir = new double[nBurbujas];
        for (int k = 0; k < nBurbujas; k++) {
            bAng[k] = az.R(0, Math.PI * 2);
            bFrec[k] = az.R(0.18, 0.55);
            bFase[k] = az.R(0, Math.PI * 2);
            bDir[k] = az.D() < 0.5 ? -1 : 1;
        }

        byte[] alfa = new byte[lado * lado];
        int[] rgb = new int[lado * lado];
        int anchoTira = lado * escala * nFrames, altoTira = lado * escala;
        int stride = anchoTira * 4;
        byte[] buf = new byte[stride * altoTira];
        string medidas = "";

        for (int f = 0; f < nFrames; f++) {
            double giro = 2 * Math.PI * f / nFrames;    // vuelta entera = bucle
            Array.Clear(alfa, 0, alfa.Length);
            Array.Clear(rgb, 0, rgb.Length);

            int dentro = 0, cubiertos = 0;
            for (int y = 0; y < lado; y++) {
                for (int x = 0; x < lado; x++) {
                    double dx = x + 0.5 - radioLog, dy = y + 0.5 - radioLog;
                    double d = Math.Sqrt(dx * dx + dy * dy);
                    if (d <= radioDanyo) dentro++;         // pixel del aro de dano
                    double ang = Math.Atan2(dy, dx);

                    double def = 0;
                    for (int k = 0; k < 3; k++) def += amp[k] * Math.Sin(arm[k] * ang + fase[k]);
                    // VALOR ABSOLUTO: el borde se deforma solo HACIA AFUERA.
                    // Con el seno a pelo, los lobulos negativos metian el filo
                    // por dentro del radio de dano y dejaban una una de suelo
                    // limpio que quema igual — el defecto exacto que retiro las
                    // cinco calcomanias anteriores, que llegaron a cubrir un
                    // 45%. Asi la cobertura es del 100% por construccion y lo
                    // unico que hace la irregularidad es sobresalir, que no
                    // engaña a nadie.
                    double Rq = radioDanyo * (1 + Math.Abs(def) * rugosidad);
                    if (d > Rq) continue;
                    if (d <= radioDanyo) cubiertos++;

                    double u = d / Rq;

                    // El campo de hervor, en coordenadas del mundo del charco.
                    double campo = 0;
                    for (int k = 0; k < nBurbujas; k++) {
                        double px = dx * Math.Cos(bAng[k]) + dy * Math.Sin(bAng[k]);
                        campo += Math.Sin(px * bFrec[k] + bFase[k] + giro * bDir[k]);
                    }
                    campo /= nBurbujas;

                    // Tono: el hervor lo mueve y el borde lo oscurece. Que el
                    // filo sea MAS OSCURO que el relleno es lo que da contorno
                    // sin dibujarlo — y es justo la metrica que el intento
                    // anterior tuvo que aprender a medir (filo vs interior).
                    double temp = 0.58 + hervor * campo - 0.42 * u * u;
                    int idx = (int)((1 - temp) * pal.Length);
                    if (idx < 0) idx = 0;
                    if (idx >= pal.Length) idx = pal.Length - 1;
                    Poner(alfa, rgb, lado, x, y, pal[idx], 1.0);
                }
            }

            Ampliar(buf, stride, alfa, rgb, lado, escala, f);
            // COBERTURA DEL ARO en tanto por ciento: cuantos pixeles del circulo
            // de dano tienen mancha encima. Es LA medida de este efecto.
            medidas += (f > 0 ? ";" : "") + (dentro > 0 ? (100 * cubiertos / dentro) : 0);
        }

        Volcar(salida, buf, anchoTira, altoTira, stride);
        return medidas;
    }

    // TAJOS. El barrido de un arma cuerpo a cuerpo.
    //
    // Es la tercera familia y tampoco sale de las anteriores: no es un circulo
    // que crece ni una mancha que hierve, es un FILO QUE RECORRE UN ARCO. Lo
    // que anima no es el radio sino el angulo.
    //
    // CONVENIO DE ENCUADRE, y hay que respetarlo porque el motor ya lo da por
    // hecho (ver dibujarTajos en sistemas/armas.js): medio lado de la celda =
    // ALCANCE del arma, y el barrido apunta al angulo 0, o sea a la derecha.
    // El motor dibuja con medio lado = t.alcance y gira la celda con la
    // direccion del golpe, asi que el filo del dibujo cae exactamente donde
    // acaba el dano. Es el mismo convenio con el que se horneo la Katana.
    //
    // `semi` es la MITAD de la apertura del arma en radianes: el Gladius abre
    // 90 grados, o sea semi = 45. Cada arma tiene la suya, asi que aqui hay una
    // hoja por arma y no una compartida.
    public static string Tajo(string salida, int alcance, double semi,
                              int nFrames, int escala,
                              uint semilla, string paletaTxt,
                              double grosor, double estela) {

        int[] pal = LeerPaleta(paletaTxt);
        int radioLog = alcance;                 // medio lado = alcance, sin margen
        int lado = radioLog * 2;
        Az az = new Az(semilla);

        // Dentado del filo: rompe un poco el arco para que no sea una cinta
        // perfecta. Muy suave, porque un barrido tiene que leerse como UN gesto.
        double[] amp = new double[2]; double[] fs = new double[2];
        for (int k = 0; k < 2; k++) { amp[k] = az.R(0.03, 0.08); fs[k] = az.R(0, Math.PI * 2); }

        double estelaRad = estela * 2 * semi;   // cuanto rastro deja por detras

        byte[] alfa = new byte[lado * lado];
        int[] rgb = new int[lado * lado];
        int anchoTira = lado * escala * nFrames, altoTira = lado * escala;
        int stride = anchoTira * 4;
        byte[] buf = new byte[stride * altoTira];
        string medidas = "";

        for (int f = 0; f < nFrames; f++) {
            double p = nFrames == 1 ? 1 : (double)f / (nFrames - 1);
            Array.Clear(alfa, 0, alfa.Length);
            Array.Clear(rgb, 0, rgb.Length);

            // EL FILO NACE YA DENTRO DEL ARCO, con un trozo de estela hecho.
            //
            // La primera version lo hacia arrancar en -semi menos la estela
            // entera, o sea completamente fuera de la apertura. Como todo lo
            // que cae fuera del arco se recorta -el dibujo no puede dar a
            // entender que se golpea donde no se golpea- los primeros
            // fotogramas salian VACIOS: entre cinco y ocho de dieciocho en las
            // seis armas. En el juego eso es un golpe que parpadea y no aparece
            // hasta media animacion.
            //
            // Ahora entra con un 30% de estela ya dentro y termina sacando la
            // cola por el otro lado, que es como se ve un mandoble: cuando lo
            // percibes ya ha empezado.
            // Y NO TERMINA DE SALIR. Sacando la cola entera, el ultimo
            // fotograma quedaba vacio otra vez —mismo fallo que tuvieron las
            // explosiones— y el tajo se cortaba en seco. Acaba con parte de la
            // estela todavia dentro del arco y es el motor quien la apaga.
            double aFilo = -semi + 0.30 * estelaRad + p * (2 * semi + 0.25 * estelaRad);
            // Se apaga al final, que es cuando el gesto ya ha pasado.
            double fade = p < 0.72 ? 1.0 : 1.0 - 0.72 * ((p - 0.72) / 0.28);

            int opacos = 0;
            for (int y = 0; y < lado; y++) {
                for (int x = 0; x < lado; x++) {
                    double dx = x + 0.5 - radioLog, dy = y + 0.5 - radioLog;
                    double d = Math.Sqrt(dx * dx + dy * dy);
                    if (d > alcance) continue;             // nada fuera del alcance
                    double ang = Math.Atan2(dy, dx);

                    // Cuanto queda ESTE pixel por detras del filo. Normalizado
                    // a [-PI, PI] porque el arco puede cruzar el corte de atan2.
                    double atras = aFilo - ang;
                    while (atras > Math.PI) atras -= 2 * Math.PI;
                    while (atras < -Math.PI) atras += 2 * Math.PI;
                    if (atras < 0 || atras > estelaRad) continue;
                    // Y nunca fuera de la apertura del arma: el dibujo no puede
                    // dar a entender que se golpea donde no se golpea.
                    if (ang < -semi || ang > semi) continue;

                    double q = estelaRad > 0 ? atras / estelaRad : 0;   // 0 filo, 1 cola

                    // La banda es mas gruesa en el filo y se adelgaza hacia la
                    // cola: es lo que lo lee como un gesto y no como un sector.
                    double w = grosor * Math.Pow(1 - q, 0.55);
                    double dent = 0;
                    for (int k = 0; k < 2; k++) dent += amp[k] * Math.Sin((3 + k * 4) * ang + fs[k]);
                    double rIn = alcance * (1 - w) * (1 + dent);
                    if (d < rIn) continue;

                    double u = (alcance - d) / Math.Max(1e-6, alcance - rIn);  // 0 filo exterior
                    double temp = (1 - q) * (1 - 0.45 * u);
                    int idx = (int)((1 - temp) * pal.Length);
                    if (idx < 0) idx = 0;
                    if (idx >= pal.Length) idx = pal.Length - 1;

                    Poner(alfa, rgb, lado, x, y, pal[idx], fade * Math.Pow(1 - q, 0.7));
                    opacos++;
                }
            }

            Ampliar(buf, stride, alfa, rgb, lado, escala, f);
            medidas += (f > 0 ? ";" : "") + opacos + "|" + aFilo.ToString("0.000", CultureInfo.InvariantCulture);
        }

        Volcar(salida, buf, anchoTira, altoTira, stride);
        return medidas;
    }

    // MINA. Un objeto, no un efecto, y por eso rompe con todo lo de arriba:
    // tiene tamano FIJO -no crece con el nivel del arma- va en composicion
    // normal y es opaca. Lo unico que anima es la luz roja del centro, que
    // late en bucle: es lo que dice que sigue armada.
    //
    // Vista cenital, como todo el juego: un disco de metal con su reborde, sus
    // remaches y el detonador en medio. Es la mina clasica de tablero, la que
    // se lee de un vistazo a treinta pixeles.
    public static string Mina(string salida, int radio, int nFrames, int escala,
                              uint semilla, string paletaTxt, string paletaLuz,
                              int remaches) {

        int[] pal = LeerPaleta(paletaTxt);      // cuerpo, de claro a oscuro
        int[] luz = LeerPaleta(paletaLuz);      // la lampara, de blanco a rojo
        int lado = radio * 2;
        Az az = new Az(semilla);

        double faseRemache = az.R(0, Math.PI * 2);

        byte[] alfa = new byte[lado * lado];
        int[] rgb = new int[lado * lado];
        int anchoTira = lado * escala * nFrames, altoTira = lado * escala;
        int stride = anchoTira * 4;
        byte[] buf = new byte[stride * altoTira];
        string medidas = "";

        for (int f = 0; f < nFrames; f++) {
            // Una vuelta entera en la tira: el bucle cierra por construccion,
            // igual que en los charcos.
            double giro = 2 * Math.PI * f / nFrames;
            // El parpadeo NO es un seno suave: es un destello corto y una
            // espera larga, que es como parpadea un piloto de verdad. Con un
            // seno parecia que respiraba.
            double ciclo = 0.5 + 0.5 * Math.Sin(giro);
            double brillo = Math.Pow(ciclo, 3.0);

            Array.Clear(alfa, 0, alfa.Length);
            Array.Clear(rgb, 0, rgb.Length);

            int opacos = 0;
            for (int y = 0; y < lado; y++) {
                for (int x = 0; x < lado; x++) {
                    double dx = x + 0.5 - radio, dy = y + 0.5 - radio;
                    double d = Math.Sqrt(dx * dx + dy * dy);
                    if (d > radio - 0.5) continue;
                    double u = d / radio;                 // 0 centro, 1 canto
                    double ang = Math.Atan2(dy, dx);

                    int idx;
                    if (u > 0.82) {
                        // REBORDE, el tono mas oscuro. Da el canto sin dibujar
                        // una linea: el contorno es un cambio de material.
                        idx = pal.Length - 1;
                    } else {
                        // Cuerpo con luz cenital desde arriba-izquierda. Es lo
                        // unico que lo lee como un domo y no como un disco.
                        double lz = 0.5 - 0.5 * (dx * 0.7071 + dy * 0.7071) / radio;
                        idx = (int)((1 - lz) * (pal.Length - 1));
                        // Remaches: ocho bultos claros repartidos por el aro.
                        double rr = 0.66;
                        double sep = 2 * Math.PI / remaches;
                        double resto = ((ang - faseRemache) % sep + sep) % sep;
                        double dAng = Math.Min(resto, sep - resto);
                        if (Math.Abs(u - rr) < 0.10 && dAng * rr * radio < 1.6 * (radio / 16.0)) idx = 0;
                    }
                    if (idx < 0) idx = 0;
                    if (idx >= pal.Length) idx = pal.Length - 1;
                    Poner(alfa, rgb, lado, x, y, pal[idx], 1.0);

                    // EL DETONADOR. Va el ultimo porque tapa lo que haya
                    // debajo, y su color sale del brillo del instante: apagado
                    // es rojo oscuro, encendido es casi blanco.
                    if (u < 0.24) {
                        int li = (int)((1 - brillo) * (luz.Length - 1));
                        if (li < 0) li = 0;
                        if (li >= luz.Length) li = luz.Length - 1;
                        Poner(alfa, rgb, lado, x, y, luz[li], 1.0);
                    }
                    opacos++;
                }
            }

            Ampliar(buf, stride, alfa, rgb, lado, escala, f);
            medidas += (f > 0 ? ";" : "") + opacos + "|" + brillo.ToString("0.000", CultureInfo.InvariantCulture);
        }

        Volcar(salida, buf, anchoTira, altoTira, stride);
        return medidas;
    }

    // Cada pixel logico como un cuadrado de escala x escala en la tira.
    static void Ampliar(byte[] buf, int stride, byte[] alfa, int[] rgb,
                        int lado, int escala, int f) {
        for (int y = 0; y < lado; y++) {
            for (int x = 0; x < lado; x++) {
                byte a = alfa[y * lado + x];
                if (a == 0) continue;
                int c = rgb[y * lado + x];
                byte rr = (byte)((c >> 16) & 255), gg = (byte)((c >> 8) & 255), bb = (byte)(c & 255);
                int bx = f * lado * escala + x * escala, by = y * escala;
                for (int oy = 0; oy < escala; oy++) {
                    int fila = (by + oy) * stride + bx * 4;
                    for (int ox = 0; ox < escala; ox++) {
                        int o = fila + ox * 4;
                        buf[o] = bb; buf[o + 1] = gg; buf[o + 2] = rr; buf[o + 3] = a;
                    }
                }
            }
        }
    }

    // Volcado de una vez. SetPixel sobre el millon y medio de pixeles de la
    // tira tardaba lo suyo sin ninguna razon; es el mismo LockBits que ya usan
    // procesar-assets.ps1 y ver-assets.ps1.
    static void Volcar(string salida, byte[] buf, int ancho, int alto, int stride) {
        using (Bitmap tira = new Bitmap(ancho, alto, PixelFormat.Format32bppArgb)) {
            BitmapData d = tira.LockBits(new Rectangle(0, 0, ancho, alto),
                                         ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
            for (int y = 0; y < alto; y++)
                Marshal.Copy(buf, y * stride, (IntPtr)(d.Scan0.ToInt64() + y * d.Stride), stride);
            tira.UnlockBits(d);
            tira.Save(salida, ImageFormat.Png);
        }
    }
}
"@

# --- Catalogo ---------------------------------------------------------------
#
# Cuatro explosiones que son el MISMO algoritmo con otros parametros. Ese es el
# argumento entero de generar por codigo: una lamina nueva por variante costaba
# un dibujo; aqui cuesta una fila de tabla.
#
# Las paletas van de lo mas caliente a lo mas frio y NO llevan tonos oscuros,
# a proposito: en el juego esto se dibuja en composicion aditiva (ver
# dibujarAire en zonaDanyo.js), y en aditivo un pixel oscuro es un pixel
# invisible. Una explosion se apaga desvaneciendose, no volviendose humo negro.
#
# `atlas` es el ID con el que el motor la pide. Va explicito y no derivado del
# nombre del fichero: los datos de armas.js y jefes.js nombran esta cadena, y
# que renombrar un PNG pudiera romper una referencia seria una trampa.
$CATALOGO = @(
    # --- Explosiones: bola llena que revienta ------------------------------
    @{ id = 'fuego';   atlas = 'explosionFuego';   archivo = 'explosion-fuego.png';   semilla = 20250819
       paleta = 'fff6e0,ffe9a0,ffc247,ff8c1a,ef5417,b52d16'
       chispas = 26; huecoIni = 0; hueco = 0.52; rugosidad = 1.0; anillo = 0.85; nucleo = 1.0; chispaTam = 1.0 }

    @{ id = 'cohete';  atlas = 'explosionCohete';  archivo = 'explosion-cohete.png';  semilla = 771144
       paleta = 'ffd9b0,ff9b3a,f2621c,c93412,8f2410,5e1a0c'
       chispas = 34; huecoIni = 0; hueco = 0.60; rugosidad = 1.35; anillo = 0.55; nucleo = 1.0; chispaTam = 1.0 }

    @{ id = 'molotov'; atlas = 'explosionMolotov'; archivo = 'explosion-molotov.png'; semilla = 480270
       paleta = 'fff2c4,ffd257,ffa322,f06a12,c4400f,7d2409'
       chispas = 20; huecoIni = 0; hueco = 0.74; rugosidad = 1.15; anillo = 0.35; nucleo = 1.0; chispaTam = 1.0 }

    @{ id = 'jupiter'; atlas = 'explosionJupiter'; archivo = 'explosion-jupiter.png'; semilla = 133777
       paleta = 'ffffff,dff0ff,9fd4ff,5aa8ff,3b6ee0,2a3fa8'
       chispas = 44; huecoIni = 0; hueco = 0.46; rugosidad = 1.55; anillo = 1.0; nucleo = 1.0; chispaTam = 1.0 }

    # --- Ondas expansivas: cascara desde el primer fotograma ---------------
    #
    # Para `ondaCircular` (Onda expansiva, Grito de guerra, Sismo, Gladius
    # Hispaniensis). efectos-mapa.md las dejo SIN sprite porque el material de
    # las laminas eran anillos concentricos de 1 px que se perdian al reducir, y
    # concluyo que el aro trazado era mejor. Eso valia para aquel material: aqui
    # el grosor del anillo es un parametro y no se reduce nada.
    #
    # `anillo` alto y `nucleo` moderado: lo que se ve es el filo, no el relleno.
    # Es lo que separa una onda de una explosion — una onda es un borde que
    # viaja, y por dentro ya ha pasado todo.
    @{ id = 'choque';  atlas = 'ondaChoque';  archivo = 'onda-choque.png';  semilla = 606060
       paleta = 'ffffff,eef4ff,c6d8f2,93b0da,6484b8,3f5688'
       radioRef = 80; chispas = 10; huecoIni = 0.62; hueco = 0.90; rugosidad = 0.55; anillo = 1.0; nucleo = 0.55; chispaTam = 1.0 }

    @{ id = 'grito';   atlas = 'ondaGrito';   archivo = 'onda-grito.png';   semilla = 909090
       paleta = 'fff4d8,ffe1a0,f2c05a,d69433,a86a22,764716'
       radioRef = 80; chispas = 14; huecoIni = 0.55; hueco = 0.88; rugosidad = 0.85; anillo = 0.9; nucleo = 0.60; chispaTam = 1.0 }

    # --- Reventones de enemigo: poca bola y mucha metralla -----------------
    #
    # `nucleo` bajo y chispas gordas. Un sismo no es una bola de fuego: es el
    # suelo saltando por los aires, o sea sobre todo cascotes.
    # TIERRA: el unico que NO es aditivo, y no es un ajuste de gusto.
    #
    # Se monto aditivo como los demas y en el juego no se veia. Medido: aporta
    # 7,4 de luz por pixel del cuadro frente a los 22,7 de la explosion de
    # fuego, o sea un tercio, y sumado sobre un suelo ya claro eso es nada. El
    # fallo estaba en la premisa: el polvo y los cascotes NO SON LUZ. Un fuego
    # se suma al fondo, una nube de tierra lo TAPA.
    #
    # Con composicion normal la paleta oscura pasa de ser un problema a ser lo
    # correcto -es tierra, es marron- y `nucleo` sube porque en normal el alfa
    # ya no es brillo sino cuanto cubre.
    @{ id = 'tierra';  atlas = 'reventonTierra';  archivo = 'reventon-tierra.png';  semilla = 314159
       paleta = 'e8d3a8,c9a86a,a8813f,86612c,5f4420,3d2b14'; aditivo = $false
       radioRef = 80; chispas = 46; huecoIni = 0.20; hueco = 0.72; rugosidad = 1.45; anillo = 0.45; nucleo = 0.88; chispaTam = 1.8 }

    @{ id = 'veneno';  atlas = 'reventonVeneno';  archivo = 'reventon-veneno.png';  semilla = 271828
       paleta = 'e6ffc4,b9f07a,86d44a,5fae32,3d7d22,275316'
       chispas = 38; huecoIni = 0.16; hueco = 0.70; rugosidad = 1.30; anillo = 0.35; nucleo = 0.55; chispaTam = 1.6 }

    @{ id = 'llama';   atlas = 'reventonLlama';   archivo = 'reventon-llama.png';   semilla = 161803
       paleta = 'fff0cc,ffbe66,ff8a2a,e85a14,ad3a0e,73230a'
       chispas = 40; huecoIni = 0.18; hueco = 0.68; rugosidad = 1.40; anillo = 0.40; nucleo = 0.62; chispaTam = 1.5 }
)

# --- Charcos ----------------------------------------------------------------
#
# Otra funcion, y con motivo: no crecen, van en bucle y se dibujan en
# composicion normal. Ver el comentario de Pirotecnia.Charco.
#
# HAY QUE LEER efectos-mapa.md ANTES DE TOCAR ESTO. Alli se probaron CINCO
# calcomanias de zona recortadas de un catalogo y se retiraron las cinco. Los
# motivos medidos fueron: cobertura del aro del 45% (quedaba suelo limpio
# dentro de lo que quema), orla clara del recorte, y siluetas que mentian sobre
# el arma. Los tres son de RECORTAR, no de la idea:
#
#   - la cobertura aqui es por construccion, el borde se genera entre 0,95 y
#     1,0 del radio y la medicion de mas abajo lo comprueba fotograma a fotograma
#   - no hay orla porque no hay JPG del que recortar
#   - la silueta la elige uno: un charco de brea es una mancha, no un crater
#
# Pero el cuarto motivo del descarte NO lo arregla nada de esto: fallaban EN
# MOVIMIENTO, y eso no lo dice ni un numero ni una imagen fija. Estos siete
# siguen pendientes de ese juicio.
$RADIO_CHARCO = 40          # radios reales van de 10 a 40; se escala
# 1.18: el borde solo sobresale (ver Math.Abs en Charco), y lo maximo que
# puede sobresalir es la suma de amplitudes por la rugosidad, ~0,147.
$MARGEN_CHARCO = 1.18

$CHARCOS = @(
    @{ id = 'lava';      atlas = 'charcoLava';      archivo = 'charco-lava.png';      semilla = 5150
       paleta = 'ffe9a0,ffa63a,ef5a17,b8340f,7a2109,451406'; rugosidad = 1.0; hervor = 0.30; burbujas = 5 }

    @{ id = 'alquitran'; atlas = 'charcoAlquitran'; archivo = 'charco-alquitran.png'; semilla = 8080
       paleta = '6a6270,4e4756,3a3442,2a2531,1d1a23,121017'; rugosidad = 1.3; hervor = 0.26; burbujas = 4 }

    @{ id = 'zarza';     atlas = 'charcoZarza';     archivo = 'charco-zarza.png';     semilla = 3210
       paleta = 'b8b49a,918c74,6e6a55,52503e,3a382b,26251c'; rugosidad = 1.6; hervor = 0.34; burbujas = 6 }

    @{ id = 'acero';     atlas = 'charcoAcero';     archivo = 'charco-acero.png';     semilla = 4444
       paleta = 'e4ecf4,bcc9d8,94a4b8,6f7d94,505b6e,343c4a'; rugosidad = 1.1; hervor = 0.22; burbujas = 5 }

    @{ id = 'piedra';    atlas = 'charcoPiedra';    archivo = 'charco-piedra.png';    semilla = 9001
       paleta = 'd0c4a8,ab9c7e,86795d,635942,463f2e,2c2820'; rugosidad = 0.9; hervor = 0.18; burbujas = 4 }

    @{ id = 'ponzona';   atlas = 'charcoPonzona';   archivo = 'charco-ponzona.png';   semilla = 6174
       paleta = 'd6f78e,9ede55,6cb434,4d8526,355e1a,213b11'; rugosidad = 1.2; hervor = 0.32; burbujas = 6 }
)

# --- Resolucion -------------------------------------------------------------
#
# DOS COSAS DISTINTAS PIXELAN UN EFECTO, y conviene no confundirlas:
#
#   1. DETALLE: cuantos pixeles fisicos ocupa cada pixel de origen.
#   2. AMPLIACION en caliente: la hoja se hornea a un radio y el arma la dibuja
#      a otro. Un Sismo de radio 140 sobre una hoja horneada a 64 la amplia 2,2x.
#
# (nota: el tamano del PNG sale del radio LOGICO y del numero de fotogramas,
# NO del detalle. Bajar el detalle sube la resolucion sin costar un byte: solo
# mete mas pixeles de origen dentro del mismo cuadro.)
#
# DETALLE era 4, o sea el mismo grano que los sprites del juego (ESCALA_ARTE).
# Se veia excesivamente pixelado justo donde mas se nota —los efectos de area,
# que ademas crecen con el nivel del arma— asi que baja a 2. Los efectos quedan
# con grano mas fino que los personajes, que es una decision deliberada: un
# fuego o una onda no son materia dibujada a mano, y a doble tamano el bloque
# de 4 cantaba.
#
# Medido, pixeles fisicos por pixel de origen en el peor caso de cada familia:
#
#              antes   solo detalle 2   y ademas radio mayor
#   explosion    9,0        4,5                3,6
#   onda/sismo   8,8        4,4                3,5
#   charco       5,3        2,7                2,0
$ESCALA_ARTE = 4    # el del juego, core/constantes.js
$DETALLE     = 2    # px fisicos por px de origen. Menos = mas fino.

# Pixeles de ORIGEN por unidad logica del juego. De aqui sale el tamano al que
# hay que generar para que el cuadro acabe midiendo lo que tiene que medir.
$FUENTE_POR_LOGICO = $ESCALA_ARTE / $DETALLE

# Radio de dano de REFERENCIA, en unidades LOGICAS del juego (las mismas que
# usa datos/armas.js). No es el de ningun arma en concreto -van de 24 a 54 en
# el nivel 1 y suben hasta ~90- sino el tamano al que se hornea; el motor
# escala. Sube de 40 a 50 para recortar la ampliacion en caliente.
$RADIO_DANYO = 50
# Cuanto sobresale la celda del radio de dano. La bola NOMINAL llega justo al
# radio de dano; lo que se sale son el desgarro de la silueta y las chispas.
# 1.35 y no 1.25: con 1.25 el desgarro del cohete llegaba a 49,1 sobre un medio
# lado de 50 y estaba a punto de comerse las puntas. Subirlo no cambia donde
# cae el filo del fuego -el motor divide por `radios[f]`-, solo da holgura.
$MARGEN      = 1.35
# 18 y no 10: una explosion dura 0,32-0,40 s, o sea 19-24 fotogramas
# renderizados, asi que con 18 no se repite practicamente ninguno. Y ademas es
# lo que baja el reparto a 1,106x de ampliacion (ver el bucle de fotogramas).
# 12 y no 18: la memoria de una hoja va con el cuadrado del radio por el numero
# de fotogramas, y hacia falta presupuesto para subir los radios. Se cambia
# resolucion TEMPORAL por resolucion ESPACIAL, que es lo que se estaba pidiendo.
# A 12 fotogramas una explosion de 0,32 s sigue teniendo uno por cada dos
# fotogramas renderizados.
$FOTOGRAMAS  = 12

if (-not (Test-Path $Destino)) { New-Item -ItemType Directory -Force $Destino | Out-Null }

# Radio en pixeles de ORIGEN, que es en lo que trabaja el generador. El lado
# del cuadro en pixeles FISICOS no depende del detalle: sale del radio logico.
$radioFuenteBase = [int][math]::Round($RADIO_DANYO * $FUENTE_POR_LOGICO)
$medioLado = [math]::Round($radioFuenteBase * $MARGEN)
$lado = $medioLado * 2 * $DETALLE
Write-Host ""
Write-Host "Explosiones: celda $lado x $lado, $FOTOGRAMAS fotogramas, tira de $($lado * $FOTOGRAMAS) px"
Write-Host "Radio de dano $RADIO_DANYO art-px, margen $MARGEN -> el motor dibuja con medio lado = radio * $MARGEN"
Write-Host ""

foreach ($e in $CATALOGO) {
    if ($Solo -and $e.id -ne $Solo) { continue }
    $ruta = Join-Path $Destino $e.archivo
    # RADIO DE REFERENCIA POR EFECTO. El motor escala la hoja al radio real del
    # arma, y escalar mucho hacia arriba engorda el pixel: el Sismo tiene radio
    # 140 y con una hoja horneada a 40 su pixel triplicaria al del suelo.
    # efectos-mapa.md dejo esto anotado como reserva sin salida -"haria falta
    # arte de origen mayor"- porque con una lamina recortada no la habia. Aqui
    # el arte de origen se fabrica, asi que basta con pedirlo mas grande.
    $radioLogico = if ($e.radioRef) { [int]$e.radioRef } else { $RADIO_DANYO }
    $radioRef = [int][math]::Round($radioLogico * $FUENTE_POR_LOGICO)
    $m = [Pirotecnia]::Explosion($ruta, $radioRef, [double]$MARGEN, $FOTOGRAMAS, $DETALLE,
                                 [uint32]$e.semilla, $e.paleta, $e.chispas,
                                 [double]$e.huecoIni, [double]$e.hueco,
                                 [double]$e.rugosidad, [double]$e.anillo,
                                 [double]$e.nucleo, [double]$e.chispaTam)

    # Verificacion POR TEXTO. Tres cosas que tienen que cumplirse y que se
    # pueden contar sin abrir el PNG:
    #   - el radio de la bola CRECE siempre (si no, no hay animacion)
    #   - ningun fotograma sale vacio (fue el primer fallo de esta herramienta)
    #   - la ocupacion sube y luego baja: la bola crece y despues se vacia
    $frames = $m -split ';'
    $ocup = @(); $rad = @(); $masa = @()
    foreach ($fr in $frames) {
        $p = $fr -split '\|'
        $ocup += [int]$p[0]
        $rad  += [double]$p[1]
        $masa += [int]$p[2]
    }
    # El pico se mide sobre la MASA LUMINOSA (suma del alfa), no sobre el area.
    # El area de una bola que crece sube hasta el final aunque la bola se este
    # apagando, asi que con ella dos de las cuatro explosiones daban pico en el
    # ultimo fotograma y parecia que no se disipaban nunca. Lo que se apaga es
    # el brillo, y eso es lo que hay que contar.
    $pico = 0
    for ($i = 1; $i -lt $masa.Count; $i++) { if ($masa[$i] -gt $masa[$pico]) { $pico = $i } }
    $creceR = $true
    for ($i = 1; $i -lt $rad.Count; $i++) { if ($rad[$i] -le $rad[$i-1]) { $creceR = $false } }
    $vacios = @($ocup | Where-Object { $_ -eq 0 }).Count
    $ultima = if ($masa[-1] -gt 0) { [math]::Round(100 * $masa[-1] / $masa[$pico]) } else { 0 }

    Write-Host ("  {0,-8} {1}" -f $e.id, $e.archivo)
    Write-Host ("           radio  {0}" -f (($rad | ForEach-Object { $_.ToString('0.0') }) -join ' '))
    Write-Host ("           masa   {0}" -f ($masa -join ' '))
    # Se disipa de verdad si el pico NO es el ultimo fotograma y ademas ha
    # perdido brillo desde el: si acaba igual de encendida que en su maximo,
    # desaparecera de golpe.
    $ok = $creceR -and $vacios -eq 0 -and $pico -lt ($masa.Count - 1) -and $ultima -lt 80
    Write-Host ("           radio creciente: {0}   vacios: {1}   pico de brillo en {2}/{3}   ultimo = {4}% del pico   -> {5}" -f `
                $creceR, $vacios, $pico, ($masa.Count - 1), $ultima, $(if ($ok) { 'OK' } else { 'REVISAR' }))
    Write-Host ""
}

# --- Tajos ------------------------------------------------------------------
#
# UNA HOJA POR ARMA, y no una tira compartida, porque cada una tiene SU
# apertura y SU alcance: el Gladius abre 90 grados y la Guadaña 145, y un
# barrido dibujado con otro angulo mentiria sobre donde se hace daño.
#
# `alcance` y `angulo` se copian de datos/armas.js y tienen que seguir
# coincidiendo. El alcance es el del NIVEL 1: es el tamaño al que el motor
# dibuja el caso base, así que ahí el blit sale 1:1. Al subir el arma de nivel
# el alcance crece y la hoja se amplía, igual que ya le pasa a la Katana.
$TAJOS = @(
    @{ id = 'gladius';    atlas = 'tajoGladius';    archivo = 'tajo-gladius.png'
       alcance = 46; angulo = 90;  semilla = 11101
       paleta = 'ffffff,eef3fb,cfdcee,a8bcd8,7d93b4,55688a'; grosor = 0.34; estela = 0.55 }

    @{ id = 'hacha';      atlas = 'tajoHacha';      archivo = 'tajo-hacha.png'
       alcance = 42; angulo = 70;  semilla = 22202
       paleta = 'fff6e4,f0dcb8,d8bc8a,b8945f,8d6c3f,5f4626'; grosor = 0.46; estela = 0.45 }

    @{ id = 'maza';       atlas = 'tajoMaza';       archivo = 'tajo-maza.png'
       alcance = 40; angulo = 60;  semilla = 33303
       paleta = 'fbf4ea,e2d6c4,c2b3a0,9c8d7c,74665a,4c423a'; grosor = 0.58; estela = 0.38 }

    @{ id = 'latigo';     atlas = 'tajoLatigo';     archivo = 'tajo-latigo.png'
       alcance = 74; angulo = 38;  semilla = 44404
       paleta = 'fff0dc,f2d0a4,dcae74,bc8850,8f6336,5e4122'; grosor = 0.16; estela = 0.80 }

    @{ id = 'motosierra'; atlas = 'tajoMotosierra'; archivo = 'tajo-motosierra.png'
       alcance = 32; angulo = 55;  semilla = 55505
       paleta = 'ffe8e0,ffb49e,ff7f63,e8523a,b03422,761f13'; grosor = 0.52; estela = 0.62 }

    @{ id = 'guadanya';   atlas = 'tajoGuadanya';   archivo = 'tajo-guadanya.png'
       alcance = 54; angulo = 145; semilla = 66606
       paleta = 'f4fbf4,d6ecd8,aed4b4,84b48e,5c8a67,3a5c44'; grosor = 0.30; estela = 0.50 }
)

$ladoTajo = 0
Write-Host "Tajos: una hoja por arma, medio lado = alcance, $FOTOGRAMAS fotogramas"
Write-Host ""

foreach ($t in $TAJOS) {
    if ($Solo -and $t.id -ne $Solo) { continue }
    $ruta = Join-Path $Destino $t.archivo
    $semi = [double]$t.angulo * [math]::PI / 360.0     # mitad de la apertura, en radianes
    # El alcance del catalogo es LOGICO (el mismo de datos/armas.js); el
    # generador trabaja en pixeles de origen.
    $alcanceFuente = [int][math]::Round([int]$t.alcance * $FUENTE_POR_LOGICO)
    $m = [Pirotecnia]::Tajo($ruta, $alcanceFuente, $semi, $FOTOGRAMAS, $DETALLE,
                            [uint32]$t.semilla, $t.paleta,
                            [double]$t.grosor, [double]$t.estela)

    # Lo que tiene que cumplirse: ningun fotograma vacio (si no, el golpe
    # parpadea) y el filo AVANZANDO siempre (si no, el barrido no barre).
    $op = @(); $filo = @()
    foreach ($fr in ($m -split ';')) {
        $p = $fr -split '\|'
        $op += [int]$p[0]
        $filo += [double]$p[1]
    }
    $vacios = @($op | Where-Object { $_ -eq 0 }).Count
    $avanza = $true
    for ($i = 1; $i -lt $filo.Count; $i++) { if ($filo[$i] -le $filo[$i-1]) { $avanza = $false } }
    $lado = $alcanceFuente * 2 * $DETALLE
    Write-Host ("  {0,-12} {1,-24} celda {2}x{2}  apertura {3}deg" -f $t.id, $t.archivo, $lado, $t.angulo)
    Write-Host ("               ocupacion  {0}" -f ($op -join ' '))
    Write-Host ("               filo avanza: {0}   vacios: {1}   -> {2}" -f `
                $avanza, $vacios, $(if ($avanza -and $vacios -eq 0) { 'OK' } else { 'REVISAR' }))
    Write-Host ""
}

# --- Charcos ----------------------------------------------------------------
$radioCharcoFuente = [int][math]::Round($RADIO_CHARCO * $FUENTE_POR_LOGICO)
$ladoCharco = [int]([math]::Round($radioCharcoFuente * $MARGEN_CHARCO)) * 2 * $DETALLE
Write-Host "Charcos: celda $ladoCharco x $ladoCharco, $FOTOGRAMAS fotogramas en BUCLE"
Write-Host ""

foreach ($c in $CHARCOS) {
    if ($Solo -and $c.id -ne $Solo) { continue }
    $ruta = Join-Path $Destino $c.archivo
    $m = [Pirotecnia]::Charco($ruta, $radioCharcoFuente, [double]$MARGEN_CHARCO,
                              $FOTOGRAMAS, $DETALLE, [uint32]$c.semilla, $c.paleta,
                              [double]$c.rugosidad, [double]$c.hervor, [int]$c.burbujas)

    # LA medida de un charco es la COBERTURA DEL ARO: que porcentaje del circulo
    # de dano queda tapado por la mancha. El intento anterior se hundio aqui
    # -llego a estar en el 35-45%- y el motivo importa: el suelo que queda
    # limpio dentro del aro QUEMA IGUAL, asi que el jugador que mete el pie ahi
    # lee que esta a salvo y no lo esta. Por debajo de 95 hay que revisar.
    $cob = @($m -split ';' | ForEach-Object { [int]$_ })
    $min = ($cob | Measure-Object -Minimum).Minimum
    Write-Host ("  {0,-10} {1}" -f $c.id, $c.archivo)
    Write-Host ("             cobertura del aro  min {0}%  max {1}%" -f $min, ($cob | Measure-Object -Maximum).Maximum)
    Write-Host ("             -> {0}" -f $(if ($min -ge 95) { 'OK' } else { 'REVISAR: deja suelo limpio dentro de la zona' }))
    Write-Host ""
}

# --- Minas ------------------------------------------------------------------
#
# Objeto, no efecto: tamano FIJO y opaca. El radio es el del DIBUJO, no el del
# daño — una mina es pequeña y su explosion no, asi que el motor la dibuja
# siempre igual de grande pase lo que pase con el nivel del arma.
$RADIO_MINA = 9        # unidades logicas: se lee a un golpe de vista y no estorba

$MINAS = @(
    @{ id = 'mina'; atlas = 'minaExplosiva'; archivo = 'mina-explosiva.png'; semilla = 194501
       # Cuerpo: hierro pintado, de la chapa iluminada al reborde en sombra.
       paleta = '9aa3a8,74808a,55606b,3d4750,2a323a,1b2127'
       # Lampara: del blanco del destello al rojo apagado de cuando espera.
       luz = 'fff0f0,ff9a90,f2483c,c22218,86140e,4d0b07'
       remaches = 8 }
)

$radioMinaFuente = [int][math]::Round($RADIO_MINA * $FUENTE_POR_LOGICO)
$ladoMina = $radioMinaFuente * 2 * $DETALLE
Write-Host "Minas: celda $ladoMina x $ladoMina, $FOTOGRAMAS fotogramas en BUCLE"
Write-Host ""

foreach ($mn in $MINAS) {
    if ($Solo -and $mn.id -ne $Solo) { continue }
    $ruta = Join-Path $Destino $mn.archivo
    $m = [Pirotecnia]::Mina($ruta, $radioMinaFuente, $FOTOGRAMAS, $DETALLE,
                            [uint32]$mn.semilla, $mn.paleta, $mn.luz, [int]$mn.remaches)

    # Lo que hay que comprobar de una mina: que el cuerpo sea SIEMPRE el mismo
    # -es un objeto solido, no puede cambiar de tamano- y que la luz de verdad
    # parpadee, o sea que el brillo recorra un rango amplio.
    $op = @(); $br = @()
    foreach ($fr in ($m -split ';')) { $q = $fr -split '\|'; $op += [int]$q[0]; $br += [double]$q[1] }
    $cuerpoFijo = (($op | Measure-Object -Minimum).Minimum -eq ($op | Measure-Object -Maximum).Maximum)
    $rango = ($br | Measure-Object -Maximum).Maximum - ($br | Measure-Object -Minimum).Minimum
    Write-Host ("  {0,-10} {1}" -f $mn.id, $mn.archivo)
    Write-Host ("             brillo de la luz  {0}" -f (($br | ForEach-Object { $_.ToString('0.00') }) -join ' '))
    Write-Host ("             cuerpo de tamano fijo: {0}   rango del parpadeo: {1:N2}  -> {2}" -f `
                $cuerpoFijo, $rango, $(if ($cuerpoFijo -and $rango -gt 0.8) { 'OK' } else { 'REVISAR' }))
    Write-Host ""
}

# --- Ficha para el atlas ----------------------------------------------------
#
# El atlas lo genera procesar-assets.ps1 a partir de resources/, y estas hojas
# no salen de resources/: salen de aqui. Para no acoplar las dos herramientas
# -ni obligar a que la pesada corra cada vez que se retoca una paleta- el
# generador deja al lado un JSON con SUS medidas y procesar-assets.ps1 se
# limita a fundirlo en el atlas. Cada herramienta declara lo que sabe.
#
# Se escribe con el catalogo ENTERO aunque se haya usado -Solo: las medidas son
# las mismas para las cuatro y no dependen de haber regenerado el PNG. Si se
# escribiera solo lo regenerado, un `-Solo fuego` borraria del atlas las otras
# tres.
$ficha = [ordered]@{}
foreach ($e in $CATALOGO) {
    # `if` como expresion embebida no vale en PowerShell 5.1: va en dos pasos.
    $rl = if ($e.radioRef) { [int]$e.radioRef } else { $RADIO_DANYO }
    $rr = [int][math]::Round($rl * $FUENTE_POR_LOGICO)
    $lado = [int]([math]::Round($rr * $MARGEN)) * 2 * $DETALLE
    $ficha[$e.atlas] = [ordered]@{
        archivo = 'efectos/' + $e.archivo
        w = $lado; h = $lado
        anclaX = [int]($lado / 2); anclaY = [int]($lado / 2)
        frames = $FOTOGRAMAS
        plano  = $true
        # Cuanto sobresale la celda del radio de dano. Sin este numero el
        # efecto mentiria sobre donde acaba lo que mata.
        margen = $MARGEN
        # COMO SE COMPONE EN PANTALLA. Casi todos son luz -fuego, veneno,
        # ondas- y van sumando; la tierra no lo es y va en normal, tapando.
        # Lo decide quien hornea la hoja porque depende de la paleta que le
        # haya puesto, no del sitio donde se dibuje.
        aditivo = if ($e.ContainsKey('aditivo')) { [bool]$e.aditivo } else { $true }
        # RADIO DE LA BOLA EN CADA FOTOGRAMA, normalizado al radio de dano.
        # Va en el atlas y no como constante en el JS porque lo decide quien
        # hornea la hoja: si aqui se cambia el reparto de fotogramas, el motor
        # se entera por el dato y no hay dos sitios que se puedan desincronizar.
        # Con el, el motor escala la celda para que el filo del fuego caiga
        # EXACTAMENTE sobre el radio que mata, sin error de cuantizacion.
        # Reparto: media de lineal y geometrico. Ver el comentario del bucle de
        # fotogramas, donde estan los numeros que llevaron a elegirlo.
        radios = @(0..($FOTOGRAMAS - 1) | ForEach-Object {
            $p = $_ / ($FOTOGRAMAS - 1)
            [math]::Round(0.5 * (0.15 + 0.85 * $p) + 0.5 * (0.15 * [math]::Pow(1.0 / 0.15, $p)), 5)
        })
    }
}
# Los charcos van a la misma ficha. Llevan `bucle` en vez de `radios`: no hay
# radio que seguir —no crecen— y en cambio el motor necesita saber que la tira
# se puede repetir, porque un charco dura hasta cinco segundos y la tira son
# dieciocho fotogramas. Sin `bucle`, el dibujado se quedaria en el ultimo.
foreach ($c in $CHARCOS) {
    $ficha[$c.atlas] = [ordered]@{
        archivo = 'efectos/' + $c.archivo
        w = $ladoCharco; h = $ladoCharco
        anclaX = [int]($ladoCharco / 2); anclaY = [int]($ladoCharco / 2)
        frames = $FOTOGRAMAS
        plano  = $true
        margen = $MARGEN_CHARCO
        aditivo = $false
        bucle  = $true
        fps    = 11
    }
}

# Los tajos: sin `margen` ni `radios`. El convenio de encuadre es distinto y ya
# lo conoce el motor —medio lado = alcance— así que no hay nada que negociar.
# Aditivos: un filo de acero o una sierra son un destello.
foreach ($t in $TAJOS) {
    $l = [int][math]::Round([int]$t.alcance * $FUENTE_POR_LOGICO) * 2 * $DETALLE
    $ficha[$t.atlas] = [ordered]@{
        archivo = 'efectos/' + $t.archivo
        w = $l; h = $l
        anclaX = [int]($l / 2); anclaY = [int]($l / 2)
        frames = $FOTOGRAMAS
        plano  = $true
        aditivo = $true
    }
}

# Las minas: `bucle` como los charcos, pero SIN `margen`. El motor las dibuja a
# tamano fijo, no ajustadas a ningun radio de daño.
foreach ($mn in $MINAS) {
    $ficha[$mn.atlas] = [ordered]@{
        archivo = 'efectos/' + $mn.archivo
        w = $ladoMina; h = $ladoMina
        anclaX = [int]($ladoMina / 2); anclaY = [int]($ladoMina / 2)
        frames = $FOTOGRAMAS
        plano  = $true
        aditivo = $false
        bucle  = $true
        fps    = 9
        # Radio del dibujo en unidades LOGICAS. Lo lee el motor para dibujarla
        # a su tamano real sin depender del radio del arma.
        radioDibujo = $RADIO_MINA
    }
}

$rutaFicha = Join-Path $Destino 'explosiones.json'
[System.IO.File]::WriteAllText((Resolve-Path $Destino).Path + '\explosiones.json',
    ($ficha | ConvertTo-Json -Depth 4), (New-Object System.Text.UTF8Encoding $false))
Write-Host "Ficha de atlas: $rutaFicha"
Write-Host ""
Write-Host "Hecho. Comprobar con: .\herramientas\ver-assets.ps1 $Destino"
