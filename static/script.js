const modeloEspera = '/static/espera.glb';
const modeloCorrecto = '/static/correcto.glb';
const modeloIncorrecto = '/static/incorrecto.glb';

let estadoActual = null;
let esperandoRespuesta = false;   // true solo mientras el micrófono debe estar activo
let recognition = null;
let sesionVoz = 0;                // ID de la instancia de reconocimiento vigente
let hablaId = 0;                  // ID de la locución vigente
const utterancesVivos = [];       // evita que el navegador los elimine antes de terminar

window.addEventListener('DOMContentLoaded', () => {
    asignarModelosIniciales();
    cargarEstadoInicial();
});

/* ===================== INICIO / REINICIO ===================== */

function cargarEstadoInicial() {
    fetch('/api/estado')
        .then(res => res.json())
        .then(data => {
            estadoActual = data;
            actualizarVidas(data);
            leerPreguntaYEscuchar(data);
        })
        .catch(err => console.error("Error cargando estado:", err));
}

function reiniciarJuego() {
    detenerEscucha();
    detenerHabla();
    fetch('/api/reiniciar', { method: 'POST' })
        .then(res => res.json())
        .then(() => {
            asignarModelosIniciales();
            document.getElementById('btn-reiniciar').style.display = 'none';
            cargarEstadoInicial();
        });
}

function asignarModelosIniciales() {
    ['objeto-avatar', 'objeto-enemigo-1', 'objeto-enemigo-2'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.setAttribute('gltf-model', modeloEspera);
            el.setAttribute('visible', 'true');
        }
    });
}

/* ===================== VOZ: HABLAR ===================== */

function detenerHabla() {
    hablaId++; // invalida callbacks pendientes
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

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

    const terminar = () => {
        if (terminado) return;
        terminado = true;
        clearTimeout(watchdog);
        const idx = utterancesVivos.indexOf(u);
        if (idx > -1) utterancesVivos.splice(idx, 1);

        if (miId !== hablaId) return; // otra locución tomó el relevo
        setTimeout(() => {
            if (miId === hablaId && callbackFin) callbackFin();
        }, 300);
    };

    u.onend = terminar;
    u.onerror = terminar;

    // Seguridad: si el navegador nunca dispara onend, continuamos igual
    watchdog = setTimeout(terminar, Math.max(4000, texto.length * 130));

    // Pequeña pausa tras cancel() para que Chrome no se confunda
    setTimeout(() => {
        if (miId === hablaId) synth.speak(u);
    }, 100);
}

/* ===================== VOZ: ESCUCHAR ===================== */

function detenerEscucha() {
    sesionVoz++; // los eventos de la instancia anterior quedan ignorados
    esperandoRespuesta = false;
    if (recognition) {
        try { recognition.abort(); } catch (e) {}
        recognition = null;
    }
}

function iniciarEscucha() {
    if (!esperandoRespuesta) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("Tu navegador no soporta reconocimiento de voz. Usa Google Chrome actualizado.");
        return;
    }

    // Limpiar instancia previa sin tocar el flag esperandoRespuesta
    sesionVoz++;
    if (recognition) {
        try { recognition.abort(); } catch (e) {}
    }
    const miSesion = sesionVoz;
    const esVigente = () => miSesion === sesionVoz && esperandoRespuesta;

    const rec = new SpeechRecognition();
    rec.lang = 'es-ES';
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onstart = function () {
        if (!esVigente()) return;
        document.getElementById('estado-texto').innerText = "🎤 Te escucho... Habla ahora";
    };

    rec.onresult = function (event) {
        if (!esVigente()) return;
        const texto = event.results[0][0].transcript.toLowerCase();
        console.log("Usuario dijo:", texto);
        detenerEscucha();
        enviarRespuestaAlServidor(texto);
    };

    rec.onerror = function (event) {
        if (!esVigente()) return;
        console.warn("Aviso de reconocimiento:", event.error);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            document.getElementById('estado-texto').innerText = "⚠️ Permite el uso del micrófono";
        }
    };

    rec.onend = function () {
        if (!esVigente()) return;
        // Silencio o sin resultado: volver a escuchar
        setTimeout(() => {
            if (esVigente()) iniciarEscucha();
        }, 300);
    };

    recognition = rec;

    try {
        rec.start();
    } catch (e) {
        setTimeout(() => {
            if (esVigente()) iniciarEscucha();
        }, 1000);
    }
}

/* ===================== FLUJO DEL JUEGO ===================== */

function leerPreguntaYEscuchar(data) {
    detenerEscucha(); // el micrófono se apaga mientras el asistente habla

    document.getElementById('pregunta-titulo').innerText = `Pregunta #${data.numero_pregunta}`;
    document.getElementById('pregunta-texto').innerText = data.pregunta_texto;
    document.getElementById('estado-texto').innerText = "Leyendo pregunta...";
    cambiarModelos(modeloEspera, data);

    hablar(`Siguiente pregunta: ${data.pregunta_texto}`, () => {
        esperandoRespuesta = true;
        iniciarEscucha();
    });
}

function enviarRespuestaAlServidor(texto) {
    document.getElementById('estado-texto').innerText = "Procesando...";

    fetch('/api/responder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: texto })
    })
        .then(res => res.json())
        .then(data => manejarResultado(data))
        .catch(err => {
            console.error("Error enviando respuesta:", err);
            // Reintentar la escucha para no quedar bloqueado
            esperandoRespuesta = true;
            iniciarEscucha();
        });
}

function manejarResultado(data) {
    estadoActual = data;
    actualizarVidas(data);

    const modelo = data.resultado === 'correcto' ? modeloCorrecto : modeloIncorrecto;
    cambiarModelos(modelo, data);
    document.getElementById('estado-texto').innerText =
        data.resultado === 'correcto' ? "✅ ¡Correcto!" : "❌ Incorrecto";

    if (data.juego_terminado) {
        document.getElementById('estado-texto').innerText = data.mensaje;
        document.getElementById('btn-reiniciar').style.display = 'block';
        hablar(data.mensaje);
        return;
    }

    const feedback = data.resultado === 'correcto'
        ? "¡Correcto! Ataque exitoso."
        : "Incorrecto. Tu avatar pierde vida.";

    // Al terminar de hablar el resultado, pasa a la nueva pregunta
    hablar(feedback, () => leerPreguntaYEscuchar(data));
}

/* ===================== VISUAL ===================== */

function cambiarModelos(urlModelo, data) {
    const avatar = document.getElementById('objeto-avatar');
    if (avatar) avatar.setAttribute('gltf-model', urlModelo);

    data.enemigos.forEach((enemigo, index) => {
        const obj = document.getElementById(`objeto-enemigo-${index + 1}`);
        if (obj && enemigo.activo) obj.setAttribute('gltf-model', urlModelo);
    });
}

function actualizarVidas(data) {
    const txtAvatar = document.getElementById('texto-vida-avatar');
    if (txtAvatar) txtAvatar.setAttribute('value', `Avatar: ${data.vida_avatar}%`);

    data.enemigos.forEach((enemigo, index) => {
        const num = index + 1;
        const txt = document.getElementById(`texto-vida-e${num}`);
        const obj = document.getElementById(`objeto-enemigo-${num}`);

        if (!enemigo.activo || enemigo.vida <= 0) {
            if (txt) txt.setAttribute('value', 'Derrotado 💀');
            if (obj) {
                obj.removeAttribute('gltf-model');
                obj.setAttribute('visible', 'false');
            }
        } else {
            if (txt) txt.setAttribute('value', `Enemigo ${num}: ${enemigo.vida}%`);
            if (obj) obj.setAttribute('visible', 'true');
        }
    });
}