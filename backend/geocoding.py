import time
import json
import urllib.request
import urllib.parse

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "TractianLeadMiner/1.0 (https://github.com/brunoaalm/Tractian-lead-miner; bruno.almeida@tractian.com)"

# Cache em memória (endereço normalizado -> resultado). Nominatim exige cache
# pra não repetir a mesma consulta, e limite de 1 requisição/segundo.
_cache = {}
_ultima_chamada = 0.0
MAX_ENDERECOS_POR_LOTE = 15


def _normalizar(endereco: str) -> str:
    return " ".join(endereco.lower().split())


def _consultar_nominatim(endereco: str) -> dict | None:
    global _ultima_chamada

    chave = _normalizar(endereco)
    if chave in _cache:
        return _cache[chave]

    espera = 1.0 - (time.time() - _ultima_chamada)
    if espera > 0:
        time.sleep(espera)

    params = urllib.parse.urlencode({
        "q": endereco, "format": "json", "limit": 1, "countrycodes": "br",
    })
    req = urllib.request.Request(
        f"{NOMINATIM_URL}?{params}",
        headers={"User-Agent": USER_AGENT, "Accept-Language": "pt-BR"},
    )

    resultado = None
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data:
                resultado = {
                    "lat": float(data[0]["lat"]),
                    "lng": float(data[0]["lon"]),
                    "nome": data[0].get("display_name", endereco),
                }
    except Exception:
        resultado = None
    finally:
        _ultima_chamada = time.time()

    _cache[chave] = resultado
    return resultado


def geocodificar_endereco_estruturado(partes: dict) -> dict | None:
    """Tenta geocodificar do mais preciso pro menos preciso, já que endereços
    brasileiros "fora do padrão" (ex: Quadra/Bloco de Brasília) costumam falhar
    no Nominatim quando muito completos. Cada tentativa é cacheada e respeita
    o throttle de 1 req/s. Retorna None se nem a cidade for encontrada.
    """
    logradouro = partes.get("logradouro", "")
    numero = partes.get("numero", "")
    bairro = partes.get("bairro", "")
    municipio = partes.get("municipio", "")
    uf = partes.get("uf", "")

    tentativas = [
        ("exato", ", ".join(filter(None, [f"{logradouro} {numero}".strip(), bairro, municipio, uf, "Brasil"]))),
        ("bairro", ", ".join(filter(None, [bairro, municipio, uf, "Brasil"]))),
        ("cidade", ", ".join(filter(None, [municipio, uf, "Brasil"]))),
    ]

    for precisao, texto in tentativas:
        if not texto or texto == "Brasil":
            continue
        resultado = _consultar_nominatim(texto)
        if resultado:
            resultado["precisao"] = precisao
            return resultado
    return None


def geocodificar_lote(enderecos: list) -> dict:
    """enderecos: lista de {id, logradouro, numero, bairro, municipio, uf}.
    Retorna {id: {lat, lng, nome, precisao}} só pros que deram match. Limita o
    tamanho do lote pra não violar a política de uso do Nominatim."""
    resultados = {}
    for item in enderecos[:MAX_ENDERECOS_POR_LOTE]:
        ponto = geocodificar_endereco_estruturado(item)
        if ponto:
            resultados[item["id"]] = ponto
    return resultados
