import psycopg2
from psycopg2.extras import RealDictCursor
from urllib.parse import urlparse
from backend.config import Config


def get_connection():
    """Retorna uma conexão com o PostgreSQL.
    Suporta DATABASE_URL (Railway) ou variáveis individuais (local).
    """
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
    "01": "ME (Micro)",
    "1":  "ME (Micro)",
    "03": "EPP",
    "3":  "EPP",
    "05": "Média/Grande",
    "5":  "Média/Grande",
    "00": "Não Informado",
    "0":  "Não Informado",
}


def buscar_leads(cnaes: list, uf: str = "", max_results: int = 10000) -> list:
    """Busca empresas ativas pelos CNAEs e UF fornecidos.
    Faz JOIN entre estabelecimentos e empresas para trazer razão social e porte.
    """
    conn = get_connection()
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)

        query = """
            SELECT
                emp.razao_social,
                est.nome_fantasia,
                est.cnpj_basico || est.cnpj_ordem || est.cnpj_dv AS cnpj_raw,
                est.cnae_principal,
                est.uf,
                est.municipio,
                est.ddd1 || est.telefone1 AS telefone,
                est.email,
                emp.porte_empresa,
                est.tipo_logradouro || ' ' || est.logradouro AS logradouro,
                est.numero,
                est.bairro,
                est.cep
            FROM estabelecimentos est
            INNER JOIN empresas emp ON est.cnpj_basico = emp.cnpj_basico
            WHERE est.cnae_principal IN %s
              AND est.situacao_cadastral = '02'
        """

        params = [tuple(cnaes)]

        if uf:
            query += " AND est.uf = %s"
            params.append(uf)

        query += f" LIMIT {max_results}"

        cur.execute(query, tuple(params))
        rows = cur.fetchall()

        results = []
        for r in rows:
            row = dict(r)
            row["porte_nome"] = PORTE_MAP.get(str(row.get("porte_empresa", "")), "Outros")
            row["cnpj"] = _formatar_cnpj(row.get("cnpj_raw", ""))
            results.append(row)

        return results

    finally:
        conn.close()


def _formatar_cnpj(raw: str) -> str:
    n = "".join(filter(str.isdigit, raw or ""))
    if len(n) != 14:
        return raw
    return f"{n[:2]}.{n[2:5]}.{n[5:8]}/{n[8:12]}-{n[12:]}"
