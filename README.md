# 🏭 Tractian — ICP Lead Miner

Ferramenta interna de prospecção de leads industriais baseada nos dados abertos do **Cadastro Nacional de Pessoas Jurídicas (CNPJ)** da Receita Federal do Brasil.

Permite buscar empresas ativas por segmento **CNAE** e **UF**, com exibição em tabela paginada, ordenação por coluna e exportação CSV.

---

## ✨ Funcionalidades

- 🔍 Busca por até 5 CNAEs simultâneos
- 🗺 Filtro por estado (UF) ou todo o Brasil
- 📊 Tabela paginada (50 resultados/página) com ordenação A→Z / Z→A
- 🏢 Exibe Razão Social, CNPJ, Localização, Porte e Contato
- 📥 Exportação para CSV com BOM UTF-8 (compatível com Excel)
- 🗄 Base local PostgreSQL com 70M+ estabelecimentos (Abr/2026)

---

## 🗂 Estrutura do Projeto

```
tractian-lead-miner/
├── backend/
│   ├── config.py         # Variáveis de ambiente
│   ├── database.py       # Conexão e queries PostgreSQL
│   └── routes/
│       ├── busca.py      # POST /buscar
│       └── exportar.py   # POST /exportar
├── frontend/
│   ├── static/
│   │   ├── css/app.css   # Estilos
│   │   └── js/
│   │       ├── cnaes.js  # Lista de CNAEs
│   │       ├── dropdown.js
│   │       ├── tabela.js # Paginação e ordenação
│   │       └── app.js    # Orquestrador
│   └── templates/
│       └── index.html    # HTML puro
├── app.py                # Entry point Flask
├── Procfile              # Deploy Railway/Heroku
├── requirements.txt
└── .env.example
```

---

## 🚀 Rodando Localmente

### Pré-requisitos
- Python 3.9+
- PostgreSQL (Postgres.app no Mac)
- Base de dados importada (`importar_dados.py`)

### Setup

```bash
# 1. Clone o repositório
git clone https://github.com/SEU_USER/tractian-lead-miner.git
cd tractian-lead-miner

# 2. Crie o ambiente virtual
python3 -m venv venv
source venv/bin/activate

# 3. Instale as dependências
pip install -r requirements.txt

# 4. Configure as variáveis de ambiente
cp .env.example .env
# Edite o .env com suas credenciais do PostgreSQL local

# 5. Inicie o Postgres.app e rode
python app.py
```

Acesse: **http://localhost:5000**

---

## ☁️ Deploy no Railway (Gratuito)

### 1. Banco de dados no Railway

1. Acesse [railway.app](https://railway.app) e crie uma conta
2. Clique em **New Project → Database → PostgreSQL**
3. Após criar, vá em **Variables** e copie a `DATABASE_URL`
4. No seu terminal local, rode o script de importação apontando para o banco do Railway:

```bash
# Exporte a DATABASE_URL do Railway
export DATABASE_URL="postgresql://..."

# Rode a importação (vai demorar algumas horas)
python importar_dados.py
```

### 2. Deploy da aplicação

1. No Railway, clique em **New Project → Deploy from GitHub repo**
2. Conecte sua conta GitHub e selecione `tractian-lead-miner`
3. O Railway detecta o `Procfile` automaticamente
4. Em **Variables**, adicione:
   - `DATABASE_URL` → copiada do PostgreSQL do Railway
   - `SECRET_KEY` → qualquer string aleatória segura
   - `FLASK_DEBUG` → `false`
5. Clique em **Deploy** ✅

O Railway gera uma URL pública automaticamente.

---

## 🔧 Variáveis de Ambiente

| Variável | Descrição | Padrão |
|---|---|---|
| `DATABASE_URL` | URL completa do PostgreSQL (Railway) | — |
| `DB_HOST` | Host do banco local | `localhost` |
| `DB_NAME` | Nome do banco local | `brunoalmeida` |
| `DB_USER` | Usuário do banco local | `brunoalmeida` |
| `DB_PASSWORD` | Senha do banco local | _(vazio)_ |
| `DB_PORT` | Porta do banco | `5432` |
| `SECRET_KEY` | Chave secreta Flask | `dev-key` |
| `MAX_RESULTS` | Limite de resultados por busca | `10000` |
| `PORT` | Porta do servidor | `5000` |

---

## 📦 Fonte dos Dados

- **Receita Federal do Brasil** — Dados Abertos CNPJ
- Espelho: [Casa dos Dados](https://dados-abertos-rf-cnpj.casadosdados.com.br)
- Atualização: mensal
- Base utilizada: **Abril/2026**

---

## 👤 Créditos

Desenvolvido por **Bruno Almeida**

- 📧 [bruno.almeida@tractian.com](mailto:bruno.almeida@tractian.com)
- 📧 [brunoaalmeidacontato@outlook.com](mailto:brunoaalmeidacontato@outlook.com)
- 💼 [linkedin.com/in/brunoaalm](https://www.linkedin.com/in/brunoaalm/)

---

## 📄 Licença

Uso interno Tractian. Dados públicos da Receita Federal do Brasil.
