import psycopg2
from datetime import date
from psycopg2.extras import RealDictCursor, Json
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


def buscar_leads(cnaes: list, ufs: list, portes: list = None, max_results: int = 10000) -> list:
    """Busca leads deduplicados por empresa (cnpj_basico).

    Quando matriz e filiais de uma mesma empresa batem no filtro, só uma linha
    é retornada (prioriza a matriz; ORDER BY identificador_matriz_filial ASC
    funciona porque '1'=matriz vem antes de '2'=filial). total_estabelecimentos
    informa quantos estabelecimentos no total bateram no filtro para aquela
    empresa, mesmo os não escolhidos como representante.
    """
    portes = portes or []
    conn = get_connection()
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)

        query = """
            WITH matches AS (
                SELECT
                    emp.razao_social,
                    est.nome_fantasia,
                    est.cnpj_basico,
                    est.cnpj_ordem,
                    est.cnpj_dv,
                    est.cnpj_basico || est.cnpj_ordem || est.cnpj_dv AS cnpj_raw,
                    est.identificador_matriz_filial,
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

        if portes:
            query += " AND emp.porte_empresa IN %s"
            params.append(tuple(portes))

        query += """
            ),
            contagem AS (
                SELECT cnpj_basico, COUNT(*) AS total_estabelecimentos
                FROM matches
                GROUP BY cnpj_basico
            )
            SELECT DISTINCT ON (m.cnpj_basico) m.*, c.total_estabelecimentos
            FROM matches m
            INNER JOIN contagem c ON c.cnpj_basico = m.cnpj_basico
            ORDER BY m.cnpj_basico, m.identificador_matriz_filial ASC
            LIMIT %s
        """
        params.append(max_results)

        cur.execute(query, tuple(params))
        rows = cur.fetchall()

        geo = obter_municipios_geo()
        results = []
        for r in rows:
            row = dict(r)
            row["fit_score"]      = _calcular_fit_score(row)
            row["porte_nome"]     = PORTE_MAP.get(str(row.get("porte_empresa", "")), "Outros")
            row["situacao_nome"]  = SITUACAO_MAP.get(str(row.get("situacao_cadastral", "")), "—")
            row["cnpj"]           = _formatar_cnpj(row.get("cnpj_raw", ""))
            row["cep"]            = _formatar_cep(row.get("cep", ""))
            row["telefone1"]      = _formatar_telefone(row.get("telefone1", ""))
            row["telefone2"]      = _formatar_telefone(row.get("telefone2", ""))
            row["data_inicio_atividade"] = _formatar_data(row.get("data_inicio_atividade", ""))
            ponto_geo = geo.get((row.get("municipio"), row.get("uf")))
            row["municipio_nome"] = ponto_geo["nome"] if ponto_geo else row.get("municipio", "")
            results.append(row)

        return results

    finally:
        conn.close()


def contar_por_cnae(cnaes: list, ufs: list, portes: list = None) -> dict:
    """Retorna contagem de empresas (distintas) ativas por CNAE."""
    portes = portes or []
    conn = get_connection()
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)

        query = """
            SELECT est.cnae_principal, COUNT(DISTINCT est.cnpj_basico) AS total
            FROM estabelecimentos est
            INNER JOIN empresas emp ON est.cnpj_basico = emp.cnpj_basico
            WHERE est.cnae_principal IN %s
              AND est.situacao_cadastral = '02'
        """
        params = [tuple(cnaes)]

        if ufs:
            query += " AND est.uf IN %s"
            params.append(tuple(ufs))

        if portes:
            query += " AND emp.porte_empresa IN %s"
            params.append(tuple(portes))

        query += " GROUP BY est.cnae_principal"
        cur.execute(query, tuple(params))
        rows = cur.fetchall()
        return {r["cnae_principal"]: r["total"] for r in rows}

    finally:
        conn.close()


_qualificacoes_cache = None


def _obter_qualificacoes() -> dict:
    """Carrega qualificacoes_socio uma vez e cacheia em memória (~68 linhas, estático)."""
    global _qualificacoes_cache
    if _qualificacoes_cache is None:
        conn = get_connection()
        try:
            cur = conn.cursor()
            cur.execute("SELECT codigo, descricao FROM qualificacoes_socio")
            _qualificacoes_cache = dict(cur.fetchall())
        finally:
            conn.close()
    return _qualificacoes_cache


def buscar_socios(cnpj_basico: str) -> list:
    """Busca sócios de uma empresa pelo CNPJ básico, com cargo resolvido em texto."""
    conn = get_connection()
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT nome_socio, qualificacao_socio, data_entrada, faixa_etaria
            FROM socios
            WHERE cnpj_basico = %s
            ORDER BY data_entrada DESC
        """, (cnpj_basico.zfill(8),))
        qualificacoes = _obter_qualificacoes()
        rows = []
        for r in cur.fetchall():
            row = dict(r)
            row["cargo"] = qualificacoes.get(row.get("qualificacao_socio"), "")
            row["data_entrada"] = _formatar_data(row.get("data_entrada", ""))
            rows.append(row)
        return rows
    finally:
        conn.close()


def buscar_estabelecimentos_empresa(cnpj_basico: str) -> list:
    """Todos os estabelecimentos (matriz + filiais) de uma empresa, sem filtro de
    CNAE/situação — usado na seção "Estabelecimentos" do modal, para o usuário ver
    se alguma filial tem contato (email/telefone) diferente da matriz."""
    conn = get_connection()
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT
                cnpj_basico, cnpj_ordem, cnpj_dv,
                identificador_matriz_filial,
                nome_fantasia, situacao_cadastral,
                uf, municipio,
                tipo_logradouro || ' ' || logradouro AS logradouro,
                numero, complemento, bairro, cep,
                ddd1 || telefone1 AS telefone1,
                ddd2 || telefone2 AS telefone2,
                email
            FROM estabelecimentos
            WHERE cnpj_basico = %s
            ORDER BY identificador_matriz_filial ASC, cnpj_ordem ASC
        """, (cnpj_basico.zfill(8),))
        geo = obter_municipios_geo()
        rows = []
        for r in cur.fetchall():
            row = dict(r)
            row["situacao_nome"] = SITUACAO_MAP.get(str(row.get("situacao_cadastral", "")), "—")
            row["cnpj"] = _formatar_cnpj(row["cnpj_basico"] + row["cnpj_ordem"] + row["cnpj_dv"])
            row["cep"] = _formatar_cep(row.get("cep", ""))
            row["telefone1"] = _formatar_telefone(row.get("telefone1", ""))
            row["telefone2"] = _formatar_telefone(row.get("telefone2", ""))
            row["is_matriz"] = row.get("identificador_matriz_filial") == "1"
            ponto_geo = geo.get((row.get("municipio"), row.get("uf")))
            row["municipio_nome"] = ponto_geo["nome"] if ponto_geo else ""
            rows.append(row)
        return rows
    finally:
        conn.close()


# ── LISTAS ────────────────────────────────────────────────────────────────

def criar_lista(nome: str) -> dict:
    conn = get_connection()
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            "INSERT INTO listas (nome) VALUES (%s) RETURNING id, nome, criado_em, atualizado_em",
            (nome,),
        )
        row = dict(cur.fetchone())
        conn.commit()
        return row
    finally:
        conn.close()


def listar_listas() -> list:
    conn = get_connection()
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT l.id, l.nome, l.criado_em, l.atualizado_em,
                   COUNT(li.id) AS total_itens
            FROM listas l
            LEFT JOIN lista_itens li ON li.lista_id = l.id
            GROUP BY l.id
            ORDER BY l.atualizado_em DESC
        """)
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def deletar_lista(lista_id: int) -> None:
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM listas WHERE id = %s", (lista_id,))
        conn.commit()
    finally:
        conn.close()


def obter_itens_lista(lista_id: int) -> list:
    conn = get_connection()
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT * FROM lista_itens
            WHERE lista_id = %s
            ORDER BY data_adicionado DESC, id ASC
        """, (lista_id,))
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def adicionar_itens_lista(lista_id: int, empresas: list) -> int:
    """Adiciona empresas a uma lista. Para cada empresa, busca os sócios e gera
    1 linha por sócio (mesmos dados da empresa, só o contato muda); se não
    houver sócio, gera 1 linha só com os dados da empresa."""
    conn = get_connection()
    try:
        cur = conn.cursor()
        qualificacoes = _obter_qualificacoes()
        total_inseridos = 0

        for empresa in empresas:
            cnpj_basico = empresa.get("cnpj_basico", "")
            email = empresa.get("email", "") or ""
            dominio = email.split("@")[-1] if "@" in email else ""

            cur.execute("""
                SELECT nome_socio, qualificacao_socio
                FROM socios
                WHERE cnpj_basico = %s
                ORDER BY data_entrada DESC
            """, (cnpj_basico.zfill(8),))
            socios = cur.fetchall()

            linhas = socios if socios else [(None, None)]
            for nome_socio, qualificacao_codigo in linhas:
                cur.execute("""
                    INSERT INTO lista_itens (
                        lista_id, proprietario, cnpj_basico, cnpj_ordem, cnpj_dv,
                        razao_social, dominio_empresa, email, telefone,
                        nome_contato, cargo_contato, qualificacao_codigo
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    lista_id,
                    empresa.get("proprietario") or "bruno.almeida@tractian.com",
                    cnpj_basico,
                    empresa.get("cnpj_ordem", ""),
                    empresa.get("cnpj_dv", ""),
                    empresa.get("razao_social", ""),
                    dominio,
                    email,
                    empresa.get("telefone1", ""),
                    nome_socio,
                    qualificacoes.get(qualificacao_codigo, "") if qualificacao_codigo else None,
                    qualificacao_codigo,
                ))
                total_inseridos += 1

        cur.execute("UPDATE listas SET atualizado_em = now() WHERE id = %s", (lista_id,))
        conn.commit()
        return total_inseridos
    finally:
        conn.close()


def atualizar_proprietario_item(item_id: int, proprietario: str) -> None:
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("UPDATE lista_itens SET proprietario = %s WHERE id = %s", (proprietario, item_id))
        conn.commit()
    finally:
        conn.close()


def remover_item_lista(item_id: int) -> None:
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM lista_itens WHERE id = %s", (item_id,))
        conn.commit()
    finally:
        conn.close()


# ── BUSCAS SALVAS ─────────────────────────────────────────────────────────

def salvar_busca(nome: str, cnaes: list, ufs: list, portes: list) -> dict:
    conn = get_connection()
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            INSERT INTO buscas_salvas (nome, cnaes, ufs, portes)
            VALUES (%s, %s, %s, %s)
            RETURNING id, nome, cnaes, ufs, portes, criado_em
        """, (nome, Json(cnaes), Json(ufs), Json(portes)))
        row = dict(cur.fetchone())
        conn.commit()
        return row
    finally:
        conn.close()


def listar_buscas_salvas() -> list:
    conn = get_connection()
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM buscas_salvas ORDER BY criado_em DESC")
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def deletar_busca_salva(busca_id: int) -> None:
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM buscas_salvas WHERE id = %s", (busca_id,))
        conn.commit()
    finally:
        conn.close()


# ── MAPA ──────────────────────────────────────────────────────────────────

_municipios_geo_cache = None
_uf_centroides_cache = None


def obter_municipios_geo() -> dict:
    """Carrega municipios_geo inteiro uma vez e cacheia (tabela estática, ~5570 linhas)."""
    global _municipios_geo_cache
    if _municipios_geo_cache is None:
        conn = get_connection()
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute("SELECT rfb_codigo, uf, nome_ibge, latitude, longitude FROM municipios_geo")
            _municipios_geo_cache = {
                (r["rfb_codigo"], r["uf"]): {
                    "nome": r["nome_ibge"], "lat": float(r["latitude"]), "lng": float(r["longitude"])
                }
                for r in cur.fetchall()
            }
        finally:
            conn.close()
    return _municipios_geo_cache


def obter_uf_centroides() -> dict:
    """Carrega uf_centroides inteiro uma vez e cacheia (tabela estática, 27 linhas)."""
    global _uf_centroides_cache
    if _uf_centroides_cache is None:
        conn = get_connection()
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute("SELECT uf, latitude, longitude FROM uf_centroides")
            _uf_centroides_cache = {
                r["uf"]: {"lat": float(r["latitude"]), "lng": float(r["longitude"])}
                for r in cur.fetchall()
            }
        finally:
            conn.close()
    return _uf_centroides_cache


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


def _formatar_telefone(raw: str) -> str:
    n = "".join(filter(str.isdigit, raw or ""))
    if len(n) == 11:
        return f"({n[:2]}) {n[2:7]}-{n[7:]}"
    if len(n) == 10:
        return f"({n[:2]}) {n[2:6]}-{n[6:]}"
    return raw or ""


def _formatar_data(raw: str) -> str:
    n = "".join(filter(str.isdigit, raw or ""))
    if len(n) != 8 or n == "00000000":
        return ""
    return f"{n[6:8]}/{n[4:6]}/{n[0:4]}"


def _anos_desde(raw: str) -> int | None:
    """Anos completos desde uma data no formato YYYYMMDD (bruto, antes de
    _formatar_data). Retorna None se a data for inválida/zerada."""
    n = "".join(filter(str.isdigit, raw or ""))
    if len(n) != 8 or n == "00000000":
        return None
    try:
        ano, mes, dia = int(n[0:4]), int(n[4:6]), int(n[6:8])
        hoje = date.today()
        anos = hoje.year - ano
        if (hoje.month, hoje.day) < (mes, dia):
            anos -= 1
        return max(anos, 0)
    except ValueError:
        return None


def _calcular_fit_score(row: dict) -> int:
    """Score de fit 0-100, só com dados já disponíveis (sem enriquecimento
    externo): porte da empresa, tempo de atividade, nº de estabelecimentos
    (matriz+filiais) e se tem contato preenchido."""
    score = 0

    porte = str(row.get("porte_empresa", ""))
    score += {"05": 40, "5": 40, "03": 25, "3": 25, "01": 10, "1": 10}.get(porte, 0)

    anos = _anos_desde(row.get("data_inicio_atividade", ""))
    if anos is not None:
        if anos > 10:
            score += 20
        elif anos >= 5:
            score += 15
        elif anos >= 2:
            score += 10
        else:
            score += 5

    total_estab = row.get("total_estabelecimentos") or 1
    score += min(total_estab, 10) * 2

    if row.get("email"):
        score += 10
    if row.get("telefone1"):
        score += 10

    return min(score, 100)