from flask import Blueprint, request, jsonify
from backend.database import salvar_busca, listar_buscas_salvas, deletar_busca_salva

buscas_salvas_bp = Blueprint("buscas_salvas", __name__)


@buscas_salvas_bp.route("/buscas-salvas", methods=["GET"])
def listar():
    try:
        return jsonify(listar_buscas_salvas())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@buscas_salvas_bp.route("/buscas-salvas", methods=["POST"])
def salvar():
    data = request.get_json(silent=True) or {}
    nome = (data.get("nome") or "").strip()
    if not nome:
        return jsonify({"error": "Nome da busca é obrigatório."}), 400
    try:
        row = salvar_busca(nome, data.get("cnaes", []), data.get("ufs", []), data.get("portes", []))
        return jsonify(row), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@buscas_salvas_bp.route("/buscas-salvas/<int:busca_id>", methods=["DELETE"])
def deletar(busca_id):
    try:
        deletar_busca_salva(busca_id)
        return "", 204
    except Exception as e:
        return jsonify({"error": str(e)}), 500
