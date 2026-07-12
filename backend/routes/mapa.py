from flask import Blueprint, request, jsonify
from backend.database import obter_municipios_geo, obter_uf_centroides
from backend.geocoding import geocodificar_lote

mapa_bp = Blueprint("mapa", __name__)


@mapa_bp.route("/mapa/geocodificar", methods=["POST"])
def geocodificar():
    data = request.get_json(silent=True) or {}
    municipios = data.get("municipios", [])

    try:
        geo = obter_municipios_geo()
        centroides = obter_uf_centroides()

        pontos = {}
        for m in municipios:
            codigo = m.get("codigo", "")
            uf = m.get("uf", "")
            chave = f"{codigo}_{uf}"
            ponto = geo.get((codigo, uf))
            if ponto:
                pontos[chave] = {**ponto, "fallback": False}
            elif uf in centroides:
                pontos[chave] = {**centroides[uf], "nome": uf, "fallback": True}

        return jsonify({"pontos": pontos, "centroides_uf": centroides})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@mapa_bp.route("/geocodificar-lote", methods=["POST"])
def geocodificar_lote_rota():
    """Geocodifica endereços exatos via Nominatim (endereço → lat/lng), usado
    no mapa do modal pra mostrar a planta real no satélite. Limitado a poucos
    endereços por chamada (ver MAX_ENDERECOS_POR_LOTE em backend/geocoding.py)."""
    data = request.get_json(silent=True) or {}
    enderecos = data.get("enderecos", [])
    if not enderecos:
        return jsonify({"error": "Nenhum endereço informado."}), 400
    try:
        resultados = geocodificar_lote(enderecos)
        return jsonify({"resultados": resultados})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
