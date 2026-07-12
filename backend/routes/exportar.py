import io
import csv
from flask import Blueprint, request, jsonify, send_file

exportar_bp = Blueprint("exportar", __name__)

COLUNAS = [
    ("razao_social",   "Razão Social"),
    ("nome_fantasia",  "Nome Fantasia"),
    ("cnpj",           "CNPJ"),
    ("cnae_principal", "CNAE"),
    ("fit_score",      "Fit Score"),
    ("porte_nome",     "Porte"),
    ("uf",             "UF"),
    ("municipio_nome", "Município"),
    ("logradouro",     "Logradouro"),
    ("numero",         "Número"),
    ("bairro",         "Bairro"),
    ("cep",            "CEP"),
    ("telefone1",      "Telefone"),
    ("email",          "E-mail"),
]


@exportar_bp.route("/exportar", methods=["POST"])
def exportar():
    dados = request.get_json(silent=True) or []
    if not dados:
        return jsonify({"error": "Nenhum dado para exportar."}), 400

    output = io.StringIO()
    writer = csv.writer(output, delimiter=";")

    # Cabeçalho
    writer.writerow([label for _, label in COLUNAS])

    # Linhas
    for row in dados:
        writer.writerow([row.get(key, "") for key, _ in COLUNAS])

    output.seek(0)
    bytes_output = io.BytesIO(("\ufeff" + output.getvalue()).encode("utf-8"))

    return send_file(
        bytes_output,
        mimetype="text/csv",
        as_attachment=True,
        download_name="leads_tractian.csv",
    )
