from flask import Flask, render_template, jsonify, request
import random

app = Flask(__name__)

preguntas_originales = [
    {"pregunta": "Decir verdadero", "respuestas": ["verdadero"]},
    {"pregunta": "Decir falso", "respuestas": ["falso"]},
    {"pregunta": "Decir verdadero 2", "respuestas": ["verdadero"]},
    {"pregunta": "Decir falso 2", "respuestas": ["falso"]},
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

# Funcion que busca preguntas que no se hayan mostrado y elige una aleatoria?
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

# Se constuyen los datos que reiniciaran el juego a la normalidad
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

    # Se recuperan los datos que envia el cliente
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
            # Mensaje a enviar si se elimina a un enemigo
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