from flask import Blueprint, request, jsonify
from backend.database import buscar_leads
from backend.config import Config

busca_bp = Blueprint("busca", __name__)


@busca_bp.route("/buscar", methods=["POST"])
def buscar():
    data = request.get_json(silent=True) or {}
    cnaes = data.get("cnaes", [])
    uf    = data.get("uf", "").strip().upper()

    if not cnaes:
        return jsonify({"error": "Selecione pelo menos 1 CNAE."}), 400
    if len(cnaes) > 5:
        return jsonify({"error": "Máximo de 5 CNAEs por busca."}), 400

    try:
        results = buscar_leads(cnaes, uf, Config.MAX_RESULTS)
        return jsonify(results)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
