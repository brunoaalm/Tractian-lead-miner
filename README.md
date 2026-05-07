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
