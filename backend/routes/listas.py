import io
from flask import Blueprint, request, jsonify, send_file
from openpyxl import Workbook
from openpyxl.styles import Font
from backend.database import (
    criar_lista,
    listar_listas,
    deletar_lista,
    obter_itens_lista,
    adicionar_itens_lista,
    atualizar_proprietario_item,
    remover_item_lista,
)

listas_bp = Blueprint("listas", __name__)

COLUNAS_XLSX = [
    ("data_adicionado", "Data"),
    ("proprietario",    "Proprietário"),
    ("razao_social",    "Nome Empresa"),
    ("dominio_empresa", "Domínio da Empresa"),
    ("nome_contato",    "Nome do Contato"),
    ("email",           "Email"),
    ("cargo_contato",   "Cargo do Contato"),
    ("telefone",        "Telefone"),
]


@listas_bp.route("/listas", methods=["GET"])
def listar():
    try:
        return jsonify(listar_listas())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@listas_bp.route("/listas", methods=["POST"])
def criar():
    data = request.get_json(silent=True) or {}
    nome = (data.get("nome") or "").strip()
    if not nome:
        return jsonify({"error": "Nome da lista é obrigatório."}), 400
    try:
        return jsonify(criar_lista(nome)), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@listas_bp.route("/listas/<int:lista_id>", methods=["DELETE"])
def deletar(lista_id):
    try:
        deletar_lista(lista_id)
        return "", 204
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@listas_bp.route("/listas/<int:lista_id>/itens", methods=["GET"])
def itens(lista_id):
    try:
        return jsonify(obter_itens_lista(lista_id))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@listas_bp.route("/listas/<int:lista_id>/itens", methods=["POST"])
def adicionar(lista_id):
    data = request.get_json(silent=True) or {}
    empresas = data.get("empresas", [])
    if not empresas:
        return jsonify({"error": "Nenhuma empresa selecionada."}), 400
    try:
        inseridos = adicionar_itens_lista(lista_id, empresas)
        return jsonify({"inserted": inseridos})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@listas_bp.route("/listas/itens/<int:item_id>", methods=["PATCH"])
def atualizar_item(item_id):
    data = request.get_json(silent=True) or {}
    proprietario = data.get("proprietario", "")
    try:
        atualizar_proprietario_item(item_id, proprietario)
        return "", 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@listas_bp.route("/listas/itens/<int:item_id>", methods=["DELETE"])
def remover_item(item_id):
    try:
        remover_item_lista(item_id)
        return "", 204
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@listas_bp.route("/listas/<int:lista_id>/exportar", methods=["GET"])
def exportar_xlsx(lista_id):
    try:
        itens = obter_itens_lista(lista_id)

        wb = Workbook()
        ws = wb.active
        ws.title = "Lista"

        ws.append([label for _, label in COLUNAS_XLSX])
        for cell in ws[1]:
            cell.font = Font(bold=True)

        for item in itens:
            data_fmt = item["data_adicionado"].strftime("%d/%m/%Y") if item.get("data_adicionado") else ""
            row = []
            for key, _ in COLUNAS_XLSX:
                if key == "data_adicionado":
                    row.append(data_fmt)
                else:
                    row.append(item.get(key, "") or "")
            ws.append(row)

        larguras = [12, 28, 32, 24, 24, 28, 22, 16]
        for i, largura in enumerate(larguras, start=1):
            ws.column_dimensions[chr(64 + i)].width = largura

        buffer = io.BytesIO()
        wb.save(buffer)
        buffer.seek(0)

        return send_file(
            buffer,
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            as_attachment=True,
            download_name=f"lista_{lista_id}.xlsx",
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500
