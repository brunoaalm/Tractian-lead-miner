# Rodando o projeto localmente

## Pré-requisitos

- **Python 3.14** (Homebrew: `brew install python@3.14`)
- **PostgreSQL** (Postgres.app: https://postgresapp.com) com o banco `brunoalmeida` já criado e **populado** com os dados da Receita Federal (empresas, estabelecimentos, sócios — ver seção "Banco de dados" abaixo)
- **Node não é necessário** — o frontend é HTML/CSS/JS puro, sem build step

## 1. Ambiente Python

```bash
cd ~/Tractian-lead-miner
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

> Se a pasta `venv/` já existir mas o app não rodar (`ModuleNotFoundError`), ela provavelmente foi apagada/corrompida — é só recriar com os comandos acima.

## 2. Variáveis de ambiente (opcional)

O app tem defaults sensatos em `backend/config.py` que já batem com uma instalação local padrão do Postgres.app (`localhost:5432`, banco `brunoalmeida`, usuário `brunoalmeida`, sem senha). Só crie um `.env` na raiz se precisar mudar algo:

```bash
DB_HOST=localhost
DB_NAME=brunoalmeida
DB_USER=brunoalmeida
DB_PASSWORD=
DB_PORT=5432
FLASK_DEBUG=false
SECRET_KEY=<gere um valor aleatório>
PORT=5000
MAX_RESULTS=10000
```

`.env` está no `.gitignore` — nunca commitar esse arquivo (tem segredo).

## 3. Banco de dados

### Tabelas grandes (dados da Receita Federal)
`empresas` (67.6M linhas), `estabelecimentos` (70.9M linhas), `socios` (27.5M linhas) — importadas via `importar_dados.py` a partir dos dumps mensais da Receita Federal. Esse processo é pesado (banco todo passa de 28GB) e não faz parte do dia a dia — só é refeito quando se quer atualizar a base (a Receita publica um dump novo todo mês).

### Tabelas de referência (pequenas, estáticas)
Criadas nesta sessão de desenvolvimento, carregadas uma vez a partir de fontes públicas oficiais:

| Tabela | Conteúdo | Fonte |
|---|---|---|
| `qualificacoes_socio` | Código → descrição do cargo do sócio (Sócio-Administrador, Diretor, etc) | RFB Tabela III |
| `municipios_geo` | Código de município da RFB → nome + lat/long | RFB + [kelvins/municipios-brasileiros](https://github.com/kelvins/municipios-brasileiros) |
| `uf_centroides` | Centro aproximado de cada UF (fallback do mapa) | Calculado a partir de `municipios_geo` |

Essas 3 já devem existir no banco se você está continuando o desenvolvimento na mesma máquina. Se for reconstruir do zero, ver `backend/geocoding.py` e os comentários em `backend/database.py` (`obter_municipios_geo`, `obter_uf_centroides`, `_obter_qualificacoes`) para entender o formato esperado — o script de carga original não foi salvo no repo (rodado uma vez, manualmente).

### Tabelas de funcionalidade (criadas pelo app)
`listas`, `lista_itens` (listas de leads), `buscas_salvas` (buscas persistentes). Criadas com:

```sql
CREATE TABLE listas (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(200) NOT NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE lista_itens (
    id SERIAL PRIMARY KEY,
    lista_id INTEGER NOT NULL REFERENCES listas(id) ON DELETE CASCADE,
    data_adicionado TIMESTAMPTZ NOT NULL DEFAULT now(),
    proprietario VARCHAR(120) NOT NULL DEFAULT 'bruno.almeida@tractian.com',
    cnpj_basico VARCHAR(8) NOT NULL,
    cnpj_ordem VARCHAR(4),
    cnpj_dv VARCHAR(2),
    razao_social VARCHAR(200),
    dominio_empresa VARCHAR(120),
    email VARCHAR(160),
    telefone VARCHAR(30),
    nome_contato VARCHAR(200),
    cargo_contato VARCHAR(120),
    qualificacao_codigo VARCHAR(2)
);
CREATE INDEX idx_lista_itens_lista_id ON lista_itens(lista_id);

CREATE TABLE buscas_salvas (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(200) NOT NULL,
    cnaes JSONB NOT NULL,
    ufs JSONB NOT NULL DEFAULT '[]'::jsonb,
    portes JSONB NOT NULL DEFAULT '[]'::jsonb,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- índice que faltava desde o início do projeto, corrigido nesta sessão
CREATE INDEX idx_socios_cnpj ON socios(cnpj_basico);
-- índice novo pra acelerar buscas por CNAE muito genéricos
CREATE INDEX idx_est_cnae_situacao ON estabelecimentos(cnae_principal, situacao_cadastral);
```

## 4. Rodando o app

```bash
source venv/bin/activate
flask run -p 8080
# ou: python app.py (sobe na porta 5000 — cuidado, no macOS essa porta
# costuma estar ocupada pelo AirPlay Receiver)
```

Abra **http://localhost:8080**.

## 5. Deixando rodando permanentemente (macOS LaunchAgents)

Pra não precisar deixar um terminal aberto, o Flask roda como serviço do macOS. Configuração em `~/Library/LaunchAgents/com.tractian.leadminer.flask.plist` (fora do repo, é específico da máquina). Comandos úteis:

```bash
# ver status
launchctl list | grep tractian

# reiniciar (depois de alterar código)
launchctl kickstart -k gui/$(id -u)/com.tractian.leadminer.flask

# parar
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.tractian.leadminer.flask.plist

# iniciar de novo
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.tractian.leadminer.flask.plist
```

## 6. Acesso público (opcional)

O projeto pode ser exposto publicamente via Cloudflare Tunnel sem custo. Ver `git log`/branch `local-cloudflare-tunnel` pra configuração completa (túnel nomeado + domínio `is-a.dev`/`eu.org`) ou pedir um "quick tunnel" temporário:

```bash
cloudflared tunnel --config /dev/null --url http://localhost:8080
```

Gera uma URL `*.trycloudflare.com` válida por algumas horas, sem precisar de conta nem domínio.

## Checklist de saúde

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/          # deve ser 200
curl -s -X POST http://localhost:8080/buscar -H "Content-Type: application/json" \
  -d '{"cnaes":["0710301"],"ufs":[],"portes":[]}' | head -c 200          # deve trazer JSON com resultados
```
