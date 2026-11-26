// Inicializacion de variables
let estadoActual = null;
let esperandoRespuesta = false;   // true solo mientras el micrófono debe estar activo
let recognition = null;
let sesionVoz = 0;                // ID de la instancia de reconocimiento vigente
let hablaId = 0;                  // ID de la locución vigente
let transicionEnemigoTimer = null;
let intervaloPregunta = null;     // actualiza el contador de 10s en pantalla
let tiempoRestantePregunta = 10;
let audioActual = null; // Representa al objeto que reproduce los audios cuando se gana o se pierde el juego
const utterancesVivos = [];       // evita que el navegador los elimine antes de terminar

// Dom elementos
const hudPreguntas = document.getElementById('trivia-hud');

const panelInicio = document.getElementById('pantalla-inicio');
const btnIniciar = document.getElementById('btn-iniciar');

// Etiquetas de vida
const etiquetasVida = document.getElementsByClassName('etiqueta-vida');

// Barras de vida del jugador, tiene 5 versiones, cada una muestra un estado de la vida
const barraVidaLlenaJugador = document.getElementById('barra-jugador-completa');
const barraVida2_3Jugador = document.getElementById('barra-jugador-2-3');
const barraVida1_3Jugador = document.getElementById('barra-jugador-1-3');
const barraVida0_3Jugador = document.getElementById('barra-jugador-0-3');

// Barras de vida del enemigo, tiene 5 versiones, cada una muestra un estado de la vida
const barraVidaLlenaEnemigo = document.getElementById('barra-enemigo-completa');
const barraVida2_3Enemigo = document.getElementById('barra-enemigo-2-3');
const barraVida1_3Enemigo = document.getElementById('barra-enemigo-1-3');
const barraVida0_3Enemigo = document.getElementById('barra-enemigo-0-3');

const panelFinal = document.getElementById('pantalla-final');
const tituloFinal = document.getElementById('mensaje-final')

const DURACION_PREGUNTA_SEG = 10;
const DURACION_ENEMIGO_ELIMINADO_MS = 4000;

// Bandera para iniciar el juego
let juegoEnProgreso = false;

btnIniciar.addEventListener('click', () => {
    // Se cargan los elementos en pantalla y se oculta la ventana de inicio
    cargarEstadoInicial();
    panelInicio.style.display = "none"
    hudPreguntas.style.display= "block"
    Array.from(etiquetasVida).forEach(element =>{
        element.style.display="block"
    })
    

})

// MODELOS.GLB

// Funcion que regresa un modelo para el jugador dependiendo de el estado actual
function rutaModeloJugador(estadoJugador) {
    const mapa = {
        espera: '/static/caballeroEspera.glb',
        correcto: '/static/caballeroCorrecto.glb',
        incorrecto: '/static/caballeroIncorrecto.glb',
        perder: '/static/caballeroPerder.glb',
        victoria: '/static/caballeroVictoria.glb',
    };
    return mapa[estadoJugador] || '/static/caballeroEspera.glb';
}

// Regresa un nuevo modelo para el enemigo dependiendo un estado
function rutaModeloEnemigo(enemigo, resultado) {
    // Si no se puede acceder al modelo solicitado entonces se regresa otro de un zombie
    if (!enemigo) return '/static/zombieEspera.glb';
    // Si el enemigo esta derrotado se regresa su modelo de enemigo derrotado
    if (enemigo.derrotado) return '/static/EnemigoEliminado.glb';
    // Se regresa un modelo dinamicamente dependiendo del resultado
    const sufijo = resultado === 'correcto' ? 'Correcto'
                 : resultado === 'incorrecto' ? 'Incorrecto'
                 : 'Espera';
    return `/static/${enemigo.clave_modelo}${sufijo}.glb`;
}

// Funcion que muestra los modelos del jugador y del enemigo 
function aplicarModelos(data) {
    const avatar = document.getElementById('objeto-avatar');
    const enemigoObj = document.getElementById('objeto-enemigo-1');

    // Se accede al modelo del avatar y se muestra en pantalla.
    if (avatar) {
        avatar.setAttribute('visible', 'true');
        avatar.setAttribute('gltf-model', rutaModeloJugador(data.modelo_jugador_estado));
    }

    // Si se accede al modelo del enemigo se muestra en pantalla y se regresa 
    if (enemigoObj && data.enemigo) {
        enemigoObj.setAttribute('visible', 'true');
        enemigoObj.setAttribute('gltf-model', rutaModeloEnemigo(data.enemigo, data.resultado));
    }
}

//  Actualiza el indicador de vida del avatar y del enemigo en Realidad virtual
function actualizarVidas(data) {
    // Se muestra en indicador de vida correcto para el jugador
    cambiarEstadoVidaJugador(data.vida_avatar);
    console.log("La vida del jugador es: "+data.vida_avatar)
    //Inicializa el DOM
    const txtAvatar = document.getElementById('texto-vida-avatar');
    // Obtiene acceso al elemento y le otorga un nuevo valor, mediante el patron llave - valor
    if (txtAvatar) {
        txtAvatar.setAttribute('value', `Caballero: ${data.vida_avatar}%`);
    }
    // Se muestra el indicador de vida correcto para el enemigo
    cambiarEstadoVidaEnemigo(data.enemigo.vida)
    console.log("La vida del enemigo es: "+data.enemigo.vida)

    // Se accede al indicador de vida del enemigo y se actualiza
    const txtEnemigo = document.getElementById('texto-vida-e1');
    if (txtEnemigo && data.enemigo) {
        // Se detecta si el enemigo es un jefe, si lo es se guarda la etiqueta en la variable
        const etiquetaJefe = data.enemigo.es_jefe ? ' [JEFE]' : '';
        // Si la vida del enemigo se agoto entonces el indicador de vida pasa a ser " Eliminado "
        if (data.enemigo.derrotado || data.enemigo.vida <= 0) {
            txtEnemigo.setAttribute('value', `${data.enemigo.nombre}: Eliminado`);
        } else {
            // ?
            txtEnemigo.setAttribute(
                'value',
                `${data.enemigo.nombre}${etiquetaJefe}: ${data.enemigo.vida}% (${data.enemigo.aciertos}/${data.enemigo.meta_aciertos})`
            );
        }
    }
}

//TEMPORIZADOR DE PREGUNTA

// Funcion que actualiza el indicador de tiempo para cada pregunta
function actualizarTextoTiempo() {
    const elTiempo = document.getElementById('tiempo-pregunta');
    if (!elTiempo) return;
    // Se muestra en pantalla el temporizador y se le asigna una nueva cantidad de tiempo
    elTiempo.style.display = 'block';
    elTiempo.innerText = `Tiempo: ${tiempoRestantePregunta}s`;
}

// Oculta el indicador de tiempo
function ocultarTiempoPregunta() {
    const elTiempo = document.getElementById('tiempo-pregunta');
    if (elTiempo) {
        elTiempo.style.display = 'none';
    }
}

// Funcion que detiene el temporizador de la pregunta
function detenerTemporizadorPregunta() {
    if (intervaloPregunta) {
        clearInterval(intervaloPregunta);
        intervaloPregunta = null;
    }
}

// Funcion que habilita el temporizador y la logica para que transcurra el tiempo
function iniciarTemporizadorPregunta() {
    // Detiene el temporizador de la pregunta
    detenerTemporizadorPregunta();
    // Se obtiene la duracion restante para esa pregunta
    tiempoRestantePregunta = DURACION_PREGUNTA_SEG;
    // Se actualia el texto del indicador de tiempo para la pregunta
    actualizarTextoTiempo();
    // Se verifica si el juego esta terminado entonces se detiene el temporizador y termina el flujo de ejecucion
    intervaloPregunta = setInterval(() => {
        if (!esperandoRespuesta || (estadoActual && estadoActual.juego_terminado)) {
            detenerTemporizadorPregunta();
            return;
        }

        // Disminuye el tiempo restante en una unidad y luego muestra el tiempo restante
        tiempoRestantePregunta--;
        actualizarTextoTiempo();

        // Si el tiempo llega a cero entonces se detiene el temporizador y se deshabilita el microfono
        if (tiempoRestantePregunta <= 0) {
            detenerTemporizadorPregunta();
            detenerEscucha();
            // Tiempo agotado: se envía vacío para activar el flujo normal de pérdida de vida
            enviarRespuestaAlServidor("");
        }
    }, 1000);
}

//INICIO Y REINICIO

// Funcion que realiza una solicitud al servidor y obtiene el estado inicial del juego
function cargarEstadoInicial() {
    // Desactiva el panel con el mensaje final
    panelFinal.style.display="none"
    // Se limpia el indicador de tiempo actual
    limpiarTemporizadores();
    fetch('/api/estado')
        .then(res => res.json())
        .then(data => {
            // Se guarda el estado inicial
            estadoActual = data;
            // Se actualizan las vidas
            actualizarVidas(data);
            // Se pronuncia la pregunta y se habilita el microfono
            leerPreguntaYEscuchar(data);
        })
        .catch(err => console.error("Error cargando estado:", err));
}

// Funcion que reinicia el juego
function reiniciarJuego() {
    limpiarTemporizadores();
    detenerEscucha();
    detenerHabla();

    fetch('/api/reiniciar', { method: 'POST' })
        .then(res => res.json())
        .then(() => {
            // Si se obtiene una respuesta entonces se oculta el boton de reinicio
            document.getElementById('btn-reiniciar').style.display = 'none';
            // Se carga el estado inicial de la historia
            cargarEstadoInicial();
            // Se detienen los audios que se estan reproduciendo:
            detenerAudio();

        })
        .catch(err => console.error("Error reiniciando juego:", err));
}

// Se limpia el temporizador
function limpiarTemporizadores() {
    if (transicionEnemigoTimer) {
        clearTimeout(transicionEnemigoTimer);
        transicionEnemigoTimer = null;
    }
    detenerTemporizadorPregunta();
    ocultarTiempoPregunta();
}

// VOZ (HABLAR)

// Se cancela el habla de la computadora
function detenerHabla() {
    hablaId++;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

// La computadora reproduce el sonido
function hablar(texto, callbackFin) {
    if (!('speechSynthesis' in window)) {
        if (callbackFin) callbackFin();
        return;
    }


    const synth = window.speechSynthesis;
    synth.cancel();
    const miId = ++hablaId;

    const u = new SpeechSynthesisUtterance(texto);
    u.lang = 'es-ES';
    u.rate = 1.0;
    utterancesVivos.push(u);

    let terminado = false;
    let watchdog = null;

    // Se termina de reproducir el audio.
    const terminar = () => {
        if (terminado) return;
        terminado = true;
        clearTimeout(watchdog);
        const idx = utterancesVivos.indexOf(u);
        if (idx > -1) utterancesVivos.splice(idx, 1);

        if (miId !== hablaId) return;
        setTimeout(() => {
            if (miId === hablaId && callbackFin) callbackFin();
        }, 300);
    };

    u.onend = terminar;
    u.onerror = terminar;

    watchdog = setTimeout(terminar, Math.max(6000, texto.length * 220));

    setTimeout(() => {
        if (miId === hablaId) synth.speak(u);
    }, 100);
}

// VOZ (ESCUCHAR)

// Se detiene el microfono en escucha
function detenerEscucha() {
    sesionVoz++;
    // Se declara la bandera en false, lo cual representa que el microfono no debe estar activado
    esperandoRespuesta = false;
    if (recognition) {
        try { recognition.abort(); } catch (e) {}
        recognition = null;
    }
}

// Se habilita el microfono para escucha y actualiza el indicador en el HUD, ademas se obtiene el audio recuperado y se envia al servidor
function iniciarEscucha() {
    if (!esperandoRespuesta) return;
    // Se habilita el microfono para el reconocimiento de voz
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("Tu navegador no soporta reconocimiento de voz. Usa Google Chrome actualizado.");
        return;
    }

    sesionVoz++;
    if (recognition) {
        try { recognition.abort(); } catch (e) {}
    }
    const miSesion = sesionVoz;
    const esVigente = () => miSesion === sesionVoz && esperandoRespuesta;

    // Se crea la entidad para el reconocimiento de texto y se configura
    const rec = new SpeechRecognition();
    rec.lang = 'es-ES';
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    // Si se puede iniciar el reconocimiento por voz entonces muestra el mensaje en pantalla hablando ahora
    rec.onstart = function () {
        if (!esVigente()) return;
        document.getElementById('estado-texto').innerText = "🎤 Te escucho... Habla ahora";
    };

    // Se procesa lo que el usuario dijo y se detiene el reconocimiento por voz y se envian los datos al servidor
    rec.onresult = function (event) {
        if (!esVigente()) return;
        const texto = event.results[0][0].transcript.toLowerCase();
        console.log("Usuario dijo:", texto);
        detenerEscucha();
        detenerTemporizadorPregunta();
        ocultarTiempoPregunta();
        enviarRespuestaAlServidor(texto);
    };

    // Se imprimen errores en consola y se envia el error en caso de que el usuario no permita el uso del microfono
    rec.onerror = function (event) {
        if (!esVigente()) return;
        console.warn("Aviso de reconocimiento:", event.error);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            document.getElementById('estado-texto').innerText = "⚠️ Permite el uso del micrófono";
        }
    };

    // ?
    rec.onend = function () {
        if (!esVigente()) return;
        setTimeout(() => {
            if (esVigente()) iniciarEscucha();
        }, 300);
    };
    
    // ?
    recognition = rec;

    try {
        rec.start();
    } catch (e) {
        setTimeout(() => {
            if (esVigente()) iniciarEscucha();
        }, 1000);
    }
}

//FLUJO DEL JUEGO 

// Actualiza la informacion de la pregunta actual, obtiene los modelos correspondientes e inicia el reconocimiento por voz y el temporizador
function leerPreguntaYEscuchar(data) {
    detenerEscucha();
    detenerTemporizadorPregunta();
    ocultarTiempoPregunta();
    // Se actualiza la informacion de la pregunta
    document.getElementById('pregunta-titulo').innerText = `Pregunta #${data.numero_pregunta}`;
    document.getElementById('pregunta-texto').innerText = data.pregunta_texto;
    document.getElementById('estado-texto').innerText = data.mensaje || "Leyendo pregunta...";

    // Al leer la nueva pregunta, volvemos a estado de espera visual si el juego sigue
    const dataEspera = {
        ...data,
        resultado: null,
        modelo_jugador_estado: data.juego_terminado ? data.modelo_jugador_estado : 'espera'
    };
    aplicarModelos(dataEspera);

    // Se pronuncia la siguiente pregunta y se inicia la escucha y el temporizador
    hablar(`Siguiente pregunta: ${data.pregunta_texto}`, () => {
        if (!estadoActual || !estadoActual.juego_terminado) {
            esperandoRespuesta = true;
            iniciarEscucha();
            iniciarTemporizadorPregunta();
        }
    });
}

// Funcion que realiza una solicitud al servidor y se procesa el resultado
function enviarRespuestaAlServidor(texto) {
    detenerTemporizadorPregunta();
    ocultarTiempoPregunta();
    document.getElementById('estado-texto').innerText = "Procesando...";

    fetch('/api/responder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: texto })
    })
        .then(res => res.json())
        .then(data => manejarResultado(data))
        .catch(err => {
            // Si hubo un error al procesar la pregunta se repite de nuevo y se vuelve a capturar la respuesta del usuario.
            console.error("Error enviando respuesta:", err);
            esperandoRespuesta = true;
            iniciarEscucha();
            iniciarTemporizadorPregunta();
        });
}

// Funcion que se encarga de actualizar el hud de informacion, la vida, los modelos y 
function manejarResultado(data) {
    estadoActual = data;
    actualizarVidas(data);
    aplicarModelos(data);
    document.getElementById('estado-texto').innerText = data.mensaje;

    // Fin del juego: victoria (caballeroVictoria) o derrota (caballeroPerder)
    if (data.juego_terminado) {
        detenerEscucha();
        detenerTemporizadorPregunta();
        ocultarTiempoPregunta();
        document.getElementById('btn-reiniciar').style.display = 'block';
        hablar(data.mensaje);
        if(data.victoria){
            panelFinal.style.display="flex"
            tituloFinal.innerText="!!!GANASTE!!!";
            reproducirAudio("/static/audio/ganar.mp3", ()=>{
                console.log("Ganaste")
            });
        }else{
            panelFinal.style.display="flex"
            tituloFinal.innerText="PERDISTE";
            reproducirAudio("/static/audio/perder.mp3", ()=>{
                console.log("Perdiste")
            });
        }

        return;
    }

    // Enemigo eliminado: muestra EnemigoEliminado.glb y caballeroCorrecto por 4s antes de pasar pregunta
    if (data.evento === 'enemigo_eliminado') {
        detenerEscucha();
        detenerTemporizadorPregunta();
        ocultarTiempoPregunta();

        hablar(data.mensaje, () => {
            transicionEnemigoTimer = setTimeout(() => {
                fetch('/api/siguiente-enemigo', { method: 'POST' })
                    .then(res => res.json())
                    .then(nuevoEstado => {
                        estadoActual = nuevoEstado;
                        actualizarVidas(nuevoEstado);
                        leerPreguntaYEscuchar(nuevoEstado);
                    })
                    .catch(err => console.error("Error cargando siguiente enemigo:", err));
            }, DURACION_ENEMIGO_ELIMINADO_MS);
        });
        return;
    }

    //Turno normal (acierto o fallo sin eliminar ni terminar partida)
    const feedback = data.resultado === 'correcto'
        ? "¡Correcto! El ataque acierta"
        : `Incorrecto. Llevas ${data.fallos_jugador} de ${data.max_fallos_jugador} fallos.`;

    hablar(feedback, () => leerPreguntaYEscuchar(data));
}

function cambiarEstadoVidaJugador(cantidadVida){
    const numVida = Number(cantidadVida);
    const contenedoresPasados=document.getElementsByClassName('barra-vida--jugador')
    Array.from(contenedoresPasados).forEach(element => {
        element.style.display="none";
    })

    if(numVida >= 100){
        barraVidaLlenaJugador.style.display="block"
    }
    else if(numVida >= 67 && numVida < 100){
        barraVida2_3Jugador.style.display="block"
    }
    else if(numVida >= 33 && numVida < 67 ){
        barraVida1_3Jugador.style.display="block"
    }
    else if(numVida < 33){
        barraVida0_3Jugador.style.display="block"
    }
}

function cambiarEstadoVidaEnemigo(cantidadVida){
    const numVida = Number(cantidadVida);
    const contenedoresPasados=document.getElementsByClassName('barra-vida--enemigo')
    Array.from(contenedoresPasados).forEach(element => {
        element.style.display="none";
    })

    if(numVida >= 100){
        barraVidaLlenaEnemigo.style.display="block"
    }
    else if(numVida >= 67 && numVida < 100){
        barraVida2_3Enemigo.style.display="block"
    }
    else if(numVida >= 33 && numVida < 67 ){
        barraVida1_3Enemigo.style.display="block"
    }
    else if(numVida < 33){
        barraVida0_3Enemigo.style.display="block"
    }
}

// Funcion que reproduce un audio mediante una url (Reservado para cuando se gana o se pierde el juego), 
// recibe la url y una funcion que realiza cuando se termina de reproducir el audio
async function reproducirAudio(urlAudio, callbackFin) {
    // Se levanta una bandera para gestionar el fin del audio
    let reproduccionFinalizada = false;

    // Funcion interna que modifica la bandera a true, para indicar que el audio ya termino de reproducirse
    const finalizar = () => {
        if (!reproduccionFinalizada) {
            reproduccionFinalizada = true;
            if (callbackFin) callbackFin();
        }
    };

    try {
        // Si no hay un url se arroja una excepccion
        if (!urlAudio) {
            throw new Error("La URL de audio no es válida.");
        }

        // Se crea una nueva entidad Audio y se almacena en la variable global
        const audio = new Audio(urlAudio);
        audioActual = audio;

        // Cuando se termina de reproducir el audio la bandera cambia su valor a true
        audio.addEventListener("ended", () => {
            if (audioActual === audio) {
                    audioActual = null;
            }
            finalizar();
        });

        // En caso de error tambien la bandera cambia a true.
        audio.addEventListener("error", ()=>{
            if (audioActual === audio) {
                audioActual = null;
            }
            finalizar();
        });

        // await permite que try / catch capture si play() es rechazado (El navegador puede rechazar el audio )
        await audio.play();
    } catch (error) {
        console.error("Error al intentar reproducir el audio:", error);
        if (audioActual === audioActual) {
            audioActual = null;
        }
        finalizar();
    }
}
// Funcion que detiene el audio reproducido al ganar o perder el juego
function detenerAudio() {
    if (audioActual) {
        audioActual.pause();
        audioActual.currentTime = 0;
        audioActual.removeAttribute("src");
        audioActual.load();
        audioActual = null;
    }
}