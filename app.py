import os
from flask import Flask
from backend.config import Config
from backend.routes.busca import busca_bp
from backend.routes.exportar import exportar_bp
from backend.routes.listas import listas_bp
from backend.routes.buscas_salvas import buscas_salvas_bp
from backend.routes.mapa import mapa_bp

# Aponta templates e static para a pasta frontend/
app = Flask(
    __name__,
    template_folder=os.path.join("frontend", "templates"),
    static_folder=os.path.join("frontend", "static"),
)

app.secret_key = Config.SECRET_KEY

# Registra blueprints
app.register_blueprint(busca_bp)
app.register_blueprint(exportar_bp)
app.register_blueprint(listas_bp)
app.register_blueprint(buscas_salvas_bp)
app.register_blueprint(mapa_bp)

# Rota principal
from flask import render_template

@app.route("/")
def index():
    return render_template("index.html")


if __name__ == "__main__":
    app.run(host='0.0.0.0', port=5000)
    