from flask import Flask, render_template, jsonify, request
import random

app = Flask(__name__)

preguntas_originales = [
    {"pregunta": "En una CLI, el paradigma de interfaz de línea de comandos, un shell y un emulador de terminal son exactamente lo mismo", "respuestas": ["falso"]},
    {"pregunta": "Los servidores Linux suelen utilizar únicamente interfaz de línea de comandos porque consume menos espacio en disco, memoria RAM que las interfaces gráficas", "respuestas": ["verdadero"]},
    {"pregunta": "Las interfaces gráficas de usuario se programan de forma estrictamente lineal y no requieren programación basada en eventos", "respuestas": ["falso"]},
    {"pregunta": "El diseño de una NUI busca hacer que la interfaz sea natural para todos los usuarios indistintamente, sin importar el contexto", "respuestas": ["falso"]},
    {"pregunta": "A diferencia del teclado o el mouse, las NUI suelen ser multicanal, inexactas y de gran ancho de banda", "respuestas": ["verdadero"]},
    {"pregunta": "En el aprendizaje progresivo de una NUI, se debe obligar a los usuarios expertos a recorrer el mismo camino paso a paso que a los principiantes", "respuestas": ["falso"]},
    {"pregunta": "Las interfaces adaptativas son configuradas manualmente por el usuario, mientras que las adaptables se ajustan automáticamente mediante algoritmos o reglas", "respuestas": ["falso"]},
    {"pregunta": "Dentro de los 7 Principios del Diseño Universal, el principio de tolerancia al error busca minimizar los riesgos y consecuencias adversas de acciones involuntarias o accidentales", "respuestas": ["verdadero"]},
    {"pregunta": "Las VUI funcionan exclusivamente mediante el reconocimiento automático del habla, sin necesitar procesamiento del lenguaje natural", "respuestas": ["falso"]},
    {"pregunta": "Los sistemas de respuesta de voz interactiva en atención al cliente son un ejemplo de aplicación de las VUI", "respuestas": ["verdadero"]},
    {"pregunta": "El modelo de seguimiento de manos de MediaPipe detecta 21 puntos de referencia en cada mano", "respuestas": ["verdadero"]},
    {"pregunta": "La interacción gestual directa ocurre en el aire sin necesidad de una superficie física, como girar un dedo en el espacio", "respuestas": ["falso"]},
    {"pregunta": "La consola Virtual Boy de Nintendo proyectaba un efecto 3D a todo color y tuvo un gran éxito comercial en Europa y Australia", "respuestas": ["falso"]},
    {"pregunta": "El término Realidad Aumentada fue acuñado en 1992 por Thomas P. Caudell en el contexto del ensamblaje de aeronaves como el Boeing 747", "respuestas": ["verdadero"]},
    {"pregunta": "La RA basada en marcadores/reconocimiento se originó en las etiquetas y códigos de barras, evolucionando hacia los códigos QR para proyectar objetos virtuales", "respuestas": ["verdadero"]},
    {"pregunta": "la Realidad Virtual Mixta permite percibir simultáneamente elementos reales y virtuales e incluso que objetos físicos sirvan de interacción", "respuestas": ["verdadero"]},
    {"pregunta": "La biometría permite autenticar a una persona basándose en quién es, en lugar de lo que posee o lo que recuerda", "respuestas": ["verdadero"]},
    {"pregunta": "El reconocimiento de voz, la dinámica de tecleo y la firma manuscrita se clasifican como características biométricas fisiológicas", "respuestas": ["falso"]},
    {"pregunta": "Una desventaja de la biometría es que un rasgo biométrico no puede cambiarse fácilmente si se ve comprometido.", "respuestas": ["verdadero"]},
    {"pregunta": "En el diseño de una VUI, es recomendable saturar al usuario con la mayor cantidad de información posible para que conozca todas las funciones desde el inicio", "respuestas": ["falso"]},
    {"pregunta": "Los pasos básicos del proceso de realidad aumentada indicados en la presentación son: detección y seguimiento, procesamiento y reconocimiento, y renderizado y visualización", "respuestas": ["verdadero"]},
]

# <clave>Espera.glb, <clave>Correcto.glb, <clave>Incorrecto.glb
ENEMIGOS_NORMALES = [
    {"nombre": "Zombie", "clave_modelo": "zombie", "meta_aciertos": 3},
    {"nombre": "Reptiliano", "clave_modelo": "reptiliano", "meta_aciertos": 3},
    {"nombre": "Guardian", "clave_modelo": "guardian", "meta_aciertos": 3},
]

JEFE_FINAL = {
    "nombre": "Ahriman, Señor Supremo del Caos",
    "clave_modelo": "Dragon",
    "meta_aciertos": 5,
    "es_jefe": True,
}

estado_juego = {}
logica = {} #No se va a la API, logica del juego a parte

#Para reutilizar los nombres para todos los enemigos
def crear_enemigo(plantilla):
    return {
        "nombre": plantilla["nombre"],
        "clave_modelo": plantilla["clave_modelo"],
        "es_jefe": plantilla.get("es_jefe", False),
        "aciertos": 0,
        "meta_aciertos": plantilla["meta_aciertos"],
        "vida": 100,
        "derrotado": False,
    }


def elegir_pregunta():
    if not logica["pendientes"]: #Preguntar si ya se acabaron las preguntas primero
        logica["pendientes"] = [
            p for p in preguntas_originales if p is not logica["actual"] #Repetir preguntas, menos la actual
        ] or list(preguntas_originales)
    #Sacar preguntas aleatorias
    pregunta = random.choice(logica["pendientes"])
    logica["pendientes"].remove(pregunta)
    logica["actual"] = pregunta
    return pregunta


def reiniciar_juego():
    global estado_juego, logica
    logica = {
        "pendientes": [],
        "actual": None,
        "indice_normal": 0,
        "normales_derrotados": 0,
    }
    primera = elegir_pregunta()
    primer_enemigo = crear_enemigo(ENEMIGOS_NORMALES[0])

    estado_juego = {
        "numero_pregunta": 1,
        "pregunta_texto": primera["pregunta"],
        "resultado": None,              # None(default) | "correcto" | "incorrecto"
        "evento": None,                 # None(default) | "enemigo_eliminado" | "victoria" | "derrota"
        "mensaje": "Escucha la pregunta...",
        "vida_avatar": 100,
        "fallos_jugador": 0,
        "max_fallos_jugador": 3,
        "modelo_jugador_estado": "espera",  # "espera" | "correcto" | "incorrecto" | "perder" | "victoria"
        "enemigo": primer_enemigo,
        "juego_terminado": False,
        "victoria": False,
    }


reiniciar_juego()


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/estado', methods=['GET'])
def get_estado():
    return jsonify(estado_juego)


@app.route('/api/responder', methods=['POST'])
def responder():
    if estado_juego["juego_terminado"]:
        return jsonify(estado_juego)

    data = request.get_json(silent=True) or {}
    texto_usuario = str(data.get("texto", "")).lower().strip()
    respuestas_validas = logica["actual"]["respuestas"]
    acerto = any(respuesta in texto_usuario for respuesta in respuestas_validas)

    enemigo = estado_juego["enemigo"]
    estado_juego["evento"] = None

    #RESPUESTA CORRECTA
    if acerto:
        estado_juego["resultado"] = "correcto"
        estado_juego["modelo_jugador_estado"] = "correcto"
        enemigo["aciertos"] += 1
        restante = max(0.0, 100.0 - (enemigo["aciertos"] * (100.0 / enemigo["meta_aciertos"])))
        enemigo["vida"] = round(restante)
        estado_juego["mensaje"] = (f"¡Correcto!")

        # Vida del enemigo
        if enemigo["aciertos"] >= enemigo["meta_aciertos"]:
            enemigo["vida"] = 0
            enemigo["derrotado"] = True

            # Al derrotar al enemigo: restaurar vida del jugador y resetear sus 3 fallos
            estado_juego["fallos_jugador"] = 0
            estado_juego["vida_avatar"] = 100

            if enemigo["es_jefe"]:
                estado_juego["juego_terminado"] = True
                estado_juego["victoria"] = True
                estado_juego["evento"] = "victoria"
                estado_juego["modelo_jugador_estado"] = "victoria"
                estado_juego["mensaje"] = "VICTORIA"
                return jsonify(estado_juego)

            logica["normales_derrotados"] += 1
            estado_juego["evento"] = "enemigo_eliminado"
            estado_juego["mensaje"] = f"¡{enemigo['nombre']} eliminado!"

    #RESPUESTA INCORRECTA
    else:
        estado_juego["resultado"] = "incorrecto"
        estado_juego["fallos_jugador"] += 1
        estado_juego["vida_avatar"] = max(0, round(100 - (estado_juego["fallos_jugador"] * (100 / 3))))

        if estado_juego["fallos_jugador"] >= estado_juego["max_fallos_jugador"]:
            estado_juego["vida_avatar"] = 0
            estado_juego["modelo_jugador_estado"] = "perder"
            estado_juego["evento"] = "derrota"
            estado_juego["juego_terminado"] = True
            estado_juego["victoria"] = False
            estado_juego["mensaje"] = "HAS MUERTO"
            return jsonify(estado_juego)

        estado_juego["modelo_jugador_estado"] = "incorrecto"
        estado_juego["mensaje"] = (
            f"Incorrecto ({texto_usuario}). Fallos: {estado_juego['fallos_jugador']}/3"
        )

    # Preparar siguiente pregunta
    siguiente = elegir_pregunta()
    estado_juego["numero_pregunta"] += 1
    estado_juego["pregunta_texto"] = siguiente["pregunta"]
    return jsonify(estado_juego)


@app.route('/api/siguiente-enemigo', methods=['POST'])
def siguiente_enemigo():
    #Avanza tras mostrar EnemigoEliminado unos segundos.
    if estado_juego["juego_terminado"]:
        return jsonify(estado_juego)

    # Cada 3 enemigos normales derrotados toca el enemigo final
    if logica["normales_derrotados"] > 0 and logica["normales_derrotados"] % 3 == 0:
        estado_juego["enemigo"] = crear_enemigo(JEFE_FINAL)
    else:
        logica["indice_normal"] = (logica["indice_normal"] + 1) % len(ENEMIGOS_NORMALES)
        estado_juego["enemigo"] = crear_enemigo(ENEMIGOS_NORMALES[logica["indice_normal"]])

    estado_juego["evento"] = None
    estado_juego["resultado"] = None
    estado_juego["modelo_jugador_estado"] = "espera"
    estado_juego["mensaje"] = f"¡Aparece {estado_juego['enemigo']['nombre']}!"
    return jsonify(estado_juego)


@app.route('/api/reiniciar', methods=['POST'])
def reiniciar():
    reiniciar_juego()
    return jsonify({"status": "reiniciado"})


if __name__ == '__main__':
    print("Iniciando servidor Flask en http://127.0.0.1:5000")
    app.run(debug=True, port=5000, use_reloader=False)