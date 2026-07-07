import psycopg2
from psycopg2.extras import RealDictCursor
from urllib.parse import urlparse
from backend.config import Config


def get_connection():
    if Config.DATABASE_URL:
        result = urlparse(Config.DATABASE_URL)
        conn = psycopg2.connect(
            host=result.hostname,
            database=result.path[1:],
            user=result.username,
            password=result.password,
            port=result.port,
            sslmode="require",
        )
    else:
        conn = psycopg2.connect(
            host=Config.DB_HOST,
            database=Config.DB_NAME,
            user=Config.DB_USER,
            password=Config.DB_PASSWORD,
            port=Config.DB_PORT,
        )
    return conn


PORTE_MAP = {
    "01": "ME (Micro)", "1": "ME (Micro)",
    "03": "EPP",        "3": "EPP",
    "05": "Média/Grande","5": "Média/Grande",
    "00": "Não Informado","0": "Não Informado",
}

SITUACAO_MAP = {
    "01": "Nula", "1": "Nula",
    "02": "Ativa", "2": "Ativa",
    "03": "Suspensa", "3": "Suspensa",
    "04": "Inapta", "4": "Inapta",
    "08": "Baixada", "8": "Baixada",
}


def buscar_leads(cnaes: list, ufs: list, porte: str = "", max_results: int = 10000) -> list:
    conn = get_connection()
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)

        query = """
            SELECT
                emp.razao_social,
                est.nome_fantasia,
                est.cnpj_basico || est.cnpj_ordem || est.cnpj_dv AS cnpj_raw,
                est.cnae_principal,
                est.situacao_cadastral,
                est.uf,
                est.municipio,
                est.tipo_logradouro || ' ' || est.logradouro AS logradouro,
                est.numero,
                est.complemento,
                est.bairro,
                est.cep,
                est.ddd1 || est.telefone1 AS telefone1,
                est.ddd2 || est.telefone2 AS telefone2,
                est.email,
                emp.porte_empresa,
                est.data_inicio_atividade
            FROM estabelecimentos est
            INNER JOIN empresas emp ON est.cnpj_basico = emp.cnpj_basico
            WHERE est.cnae_principal IN %s
              AND est.situacao_cadastral = '02'
        """

        params = [tuple(cnaes)]

        if ufs:
            query += " AND est.uf IN %s"
            params.append(tuple(ufs))

        if porte:
            query += " AND emp.porte_empresa = %s"
            params.append(porte)

        query += f" LIMIT {max_results}"

        cur.execute(query, tuple(params))
        rows = cur.fetchall()

        results = []
        for r in rows:
            row = dict(r)
            row["porte_nome"]     = PORTE_MAP.get(str(row.get("porte_empresa", "")), "Outros")
            row["situacao_nome"]  = SITUACAO_MAP.get(str(row.get("situacao_cadastral", "")), "—")
            row["cnpj"]           = _formatar_cnpj(row.get("cnpj_raw", ""))
            row["cep"]            = _formatar_cep(row.get("cep", ""))
            results.append(row)

        return results

    finally:
        conn.close()


def contar_por_cnae(cnaes: list, ufs: list, porte: str = "") -> dict:
    """Retorna contagem de empresas ativas por CNAE."""
    conn = get_connection()
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)

        query = """
            SELECT est.cnae_principal, COUNT(*) AS total
            FROM estabelecimentos est
            INNER JOIN empresas emp ON est.cnpj_basico = emp.cnpj_basico
            WHERE est.cnae_principal IN %s
              AND est.situacao_cadastral = '02'
        """
        params = [tuple(cnaes)]

        if ufs:
            query += " AND est.uf IN %s"
            params.append(tuple(ufs))

        if porte:
            query += " AND emp.porte_empresa = %s"
            params.append(porte)

        query += " GROUP BY est.cnae_principal"
        cur.execute(query, tuple(params))
        rows = cur.fetchall()
        return {r["cnae_principal"]: r["total"] for r in rows}

    finally:
        conn.close()


def buscar_socios(cnpj_basico: str) -> list:
    """Busca sócios de uma empresa pelo CNPJ básico."""
    conn = get_connection()
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT nome_socio, qualificacao_socio, data_entrada, faixa_etaria
            FROM socios
            WHERE cnpj_basico = %s
            ORDER BY data_entrada DESC
        """, (cnpj_basico.zfill(8),))
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def _formatar_cnpj(raw: str) -> str:
    n = "".join(filter(str.isdigit, raw or ""))
    if len(n) != 14:
        return raw
    return f"{n[:2]}.{n[2:5]}.{n[5:8]}/{n[8:12]}-{n[12:]}"


def _formatar_cep(raw: str) -> str:
    n = "".join(filter(str.isdigit, raw or ""))
    if len(n) != 8:
        return raw
    return f"{n[:5]}-{n[5:]}"