from flask import Flask, render_template, jsonify, request
import random

app = Flask(__name__)

# Banco de preguntas (agrega más para más variedad).
# "respuestas" admite varias formas de decir lo mismo.
preguntas_originales = [
    {"pregunta": "Decir verdadero", "respuestas": ["verdadero"]},
    {"pregunta": "Decir falso", "respuestas": ["falso"]},
    {"pregunta": "¿Qué lenguaje estamos usando para este programa?", "respuestas": ["python"]},
    {"pregunta": "Menciona el color del cielo en un día despejado", "respuestas": ["azul"]},
    {"pregunta": "¿Cuánto es dos más dos?", "respuestas": ["cuatro", "4"]},
]

estado_juego = {}   # lo que ve el navegador (sin respuestas)
privado = {}        # lo que solo conoce el servidor


def elegir_pregunta():
    """Pregunta al azar que aún no ha salido. Al agotarse, rellena sin repetir la última."""
    if not privado["pendientes"]:
        privado["pendientes"] = [
            p for p in preguntas_originales if p is not privado["actual"]
        ] or list(preguntas_originales)
    pregunta = random.choice(privado["pendientes"])
    privado["pendientes"].remove(pregunta)
    privado["actual"] = pregunta
    return pregunta


def reiniciar_juego():
    global estado_juego, privado
    privado = {"pendientes": [], "actual": None}
    primera = elegir_pregunta()

    estado_juego = {
        "numero_pregunta": 1,
        "pregunta_texto": primera["pregunta"],
        "resultado": None,          # None | "correcto" | "incorrecto"
        "mensaje": "Escucha la pregunta...",
        "vida_avatar": 100,
        "enemigos": [
            {"id": 1, "nombre": "Enemigo 1", "vida": 100, "fallos": 0, "activo": True},
            {"id": 2, "nombre": "Enemigo 2", "vida": 100, "fallos": 0, "activo": True},
        ],
        "juego_terminado": False,
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

    respuestas_validas = privado["actual"]["respuestas"]
    acerto = any(r in texto_usuario for r in respuestas_validas)
    enemigos_activos = [e for e in estado_juego["enemigos"] if e["activo"]]

    if acerto:
        estado_juego["resultado"] = "correcto"
        estado_juego["mensaje"] = f"¡Correcto! Dijiste: {texto_usuario}"

        if enemigos_activos:
            objetivo = random.choice(enemigos_activos)
            objetivo["vida"] = max(0, objetivo["vida"] - 34)
            if objetivo["vida"] <= 0:
                objetivo["activo"] = False
    else:
        estado_juego["resultado"] = "incorrecto"
        estado_juego["mensaje"] = f"Incorrecto ({texto_usuario}). Pierdes vida."
        estado_juego["vida_avatar"] = max(0, estado_juego["vida_avatar"] - 34)

        if enemigos_activos:
            objetivo = random.choice(enemigos_activos)
            objetivo["fallos"] += 1
            if objetivo["fallos"] >= 3:
                objetivo["vida"] = 0
                objetivo["activo"] = False

    # ¿Terminó el juego?
    if estado_juego["vida_avatar"] <= 0:
        estado_juego["juego_terminado"] = True
        estado_juego["mensaje"] = "¡Derrota! Tu avatar se quedó sin vida."
    elif not any(e["activo"] for e in estado_juego["enemigos"]):
        estado_juego["juego_terminado"] = True
        estado_juego["mensaje"] = "¡Victoria! Has derrotado a todos los enemigos."
    else:
        # Acierte o falle, siempre pasa a una pregunta nueva al azar
        siguiente = elegir_pregunta()
        estado_juego["numero_pregunta"] += 1
        estado_juego["pregunta_texto"] = siguiente["pregunta"]

    return jsonify(estado_juego)


@app.route('/api/reiniciar', methods=['POST'])
def reiniciar():
    reiniciar_juego()
    return jsonify({"status": "reiniciado"})


if __name__ == '__main__':
    print("Iniciando servidor Flask en http://127.0.0.1:5000")
    app.run(debug=True, port=5000, use_reloader=False)