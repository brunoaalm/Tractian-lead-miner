from flask import Blueprint, request, jsonify
from backend.database import buscar_leads, contar_por_cnae, buscar_socios, buscar_estabelecimentos_empresa
from backend.config import Config

busca_bp = Blueprint("busca", __name__)


@busca_bp.route("/buscar", methods=["POST"])
def buscar():
    data   = request.get_json(silent=True) or {}
    cnaes  = data.get("cnaes", [])
    ufs    = data.get("ufs", [])
    portes = data.get("portes", [])

    if not cnaes:
        return jsonify({"error": "Selecione pelo menos 1 CNAE."}), 400
    if len(cnaes) > 5:
        return jsonify({"error": "Máximo de 5 CNAEs por busca."}), 400
    if len(ufs) > 5:
        return jsonify({"error": "Máximo de 5 UFs por busca."}), 400

    try:
        results  = buscar_leads(cnaes, ufs, portes, Config.MAX_RESULTS)
        contagem = contar_por_cnae(cnaes, ufs, portes)
        return jsonify({"results": results, "contagem_cnae": contagem})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@busca_bp.route("/socios/<cnpj_basico>", methods=["GET"])
def socios(cnpj_basico):
    try:
        rows = buscar_socios(cnpj_basico)
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@busca_bp.route("/estabelecimentos/<cnpj_basico>", methods=["GET"])
def estabelecimentos(cnpj_basico):
    try:
        rows = buscar_estabelecimentos_empresa(cnpj_basico)
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500