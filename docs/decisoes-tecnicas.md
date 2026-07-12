# Decisões técnicas — linha de raciocínio

Este documento explica o *porquê* de cada coisa construída na branch
`feature/listas-mapa-dedup`, não só o *o quê*. A ideia é você conseguir
continuar sozinho sem precisar redescobrir essas decisões.

## Contexto: o que já existia antes

Uma ferramenta interna (Flask + Postgres) que busca empresas ativas na base
da Receita Federal por CNAE/UF/porte, mostra numa tabela paginada, com modal
de detalhes (sócios) e export CSV. O banco tem ~137M linhas reais (não é
dataset de brinquedo).

---

## 1. Dedup matriz/filial

**Problema:** uma busca por CNAE filtra por `estabelecimentos` (cada linha é
um CNPJ completo — matriz OU filial). Uma empresa com 50 filiais aparecia 50
vezes na tabela, mesmo sendo "1 lead" na prática.

**Decisão:** `estabelecimentos.identificador_matriz_filial` distingue matriz
(`'1'`) de filial (`'2'`). Reescrevi a query com `DISTINCT ON (cnpj_basico)`
ordenando por `identificador_matriz_filial ASC` — como `'1' < '2'`
alfabeticamente, a matriz sempre "ganha" quando existe entre os resultados.
Guardo `total_estabelecimentos` (quantos bateram no filtro) pra não esconder
informação.

**Trade-off aceito:** se só a filial bate no CNAE filtrado (matriz tem CNAE
diferente), a matriz "ganha" mesmo assim mas pode não ser exatamente a
atividade buscada — o endereço mostrado é o da matriz, não da filial que
originou o match. Por isso a seção "Estabelecimentos" no modal lista todos,
pra o usuário escolher o contato certo manualmente (ver item 3).

**Performance:** essa mudança troca um `WHERE ... LIMIT` simples (rápido,
para assim que acha N linhas) por uma agregação que precisa ver *todo* o
conjunto antes de aplicar o limite (não dá pra parar cedo quando você precisa
saber quem são os duplicados). Pra CNAEs muito genéricos (ex: transporte
rodoviário, ~1.1M linhas) isso ficou lento (~60s). Resolvido com um índice
composto `(cnae_principal, situacao_cadastral)` — caiu pra ~16s no pior caso,
e CNAEs reais do ICP da Tractian (que são bem mais raros) continuam
sub-segundo. Ver `backend/database.py:buscar_leads`.

---

## 2. Listas de leads

**Motivação original do projeto:** "achar empresas pra colocar numa lista"
era o objetivo desde o início — isso não existia como feature própria, só
CSV bruto.

**Modelo de dados:** `lista_itens` guarda um **snapshot**, não uma referência
viva a `empresas`/`estabelecimentos`. Decisão deliberada — a base da Receita
é reimportada mensalmente, e uma lista salva não deveria mudar sozinha ou
quebrar se uma linha sumir num import futuro.

**Regra de expansão por sócio:** se a empresa tem N sócios, viram N linhas na
lista (mesmos dados da empresa, só o contato muda). Empresa sem sócio vira 1
linha com contato em branco. Isso é feito em
`adicionar_itens_lista` (`backend/database.py`) — pra cada empresa
selecionada, busca os sócios e itera.

**Por que não um checkbox "selecionar 1 sócio"?** Simplicidade: normalmente
quem faz prospecção quer todos os decisores de uma empresa, não só um. Se
isso incomodar no futuro, dá pra adicionar um passo intermediário de escolha.

**XLSX em vez de mais CSV:** pedido explícito do usuário, usa `openpyxl`
(`backend/routes/listas.py`). Colunas fixas: Data, Proprietário, Nome
Empresa, Domínio, Nome Contato, Email, Cargo, Telefone — domínio é extraído
do email da empresa (`email.split("@")[-1]`).

---

## 3. "Usar este contato" (estabelecimentos no modal)

Consequência direta do dedup (item 1): já que a tabela só mostra 1 linha por
empresa, o modal ganhou uma seção nova listando *todos* os estabelecimentos
(matriz + filiais) com endereço/telefone/email de cada um. Um botão "Usar
este contato" grava a escolha em `state.estabelecimentoEscolhido` (Map,
`frontend/static/js/app.js`) — se você clicar nele antes de adicionar a
empresa a uma lista, o contato daquele estabelecimento específico (não o da
matriz) é o que vai pra lista. Ver `_empresaComOverride` em
`frontend/static/js/listas.js`.

---

## 4. Buscas salvas vs. histórico

Já existia um "histórico" (últimas 3 buscas, `localStorage`, efêmero por
navegador). "Buscas salvas" é **outra coisa**: persistido no Postgres
(`buscas_salvas`), nomeado, sobrevive a reload/aba anônima, pensado pra
compartilhar entre pessoas do time no futuro (mesmo sem multi-usuário ainda
implementado — não tem conceito de "dono" da busca salva, é tudo global).
Os dois sistemas ficaram deliberadamente separados (não teria sentido
misturar "3 últimas, automático" com "nomeadas, manuais").

---

## 5. Mapa

Esta foi a parte com mais decisões técnicas não-óbvias.

### 5.1 Município: código da Receita ≠ código do IBGE

`estabelecimentos.municipio` usa a numeração **própria da Receita Federal**,
diferente do código IBGE padrão (7 dígitos) usado por qualquer dataset
público de coordenadas. Pra cruzar os dois sem inventar dado, usei duas
fontes públicas:
- RFB `Municipios.zip` — código RFB → nome (sem acento, maiúsculo)
- [`kelvins/municipios-brasileiros`](https://github.com/kelvins/municipios-brasileiros) (dataset MIT, derivado do IBGE) — nome + lat/long

**Achado importante:** o campo `siafi_id` desse dataset kelvins bate
*exatamente* com o código da Receita Federal (validei manualmente com
amostras: Guajará-Mirim, Assunção etc). Isso permite casar os dois por
**código**, não por nome normalizado — muito mais confiável que fuzzy-match
de string (nomes têm variação de grafia entre as duas fontes: "Paraty" vs
"Parati", "Balneário Piçarras" vs "Balneario de Picarras" etc). Resultado:
5571 de 5573 municípios batidos (99.96%). Os 2 que sobraram: um caso raro
sem correspondência e o código especial "EXTERIOR" (empresa sediada fora do
Brasil, corretamente excluído do mapa).

Isso virou a tabela `municipios_geo` (carregada uma vez, estática — ver
`docs/setup-local.md`).

### 5.2 Fallback em 2 níveis pro mapa geral

Nem toda empresa tem o município resolvido (casos raros de nome
não-batido). Pra essas, uso o centro geográfico do estado
(`uf_centroides`, calculado como média das lat/long dos municípios batidos
daquele estado) em vez de simplesmente sumir com o pin. O frontend marca
visualmente esses pins como "aproximados" (opacidade menor,
`frontend/static/js/mapa.js:renderMapa`).

### 5.3 Satélite: Esri World Imagery

OpenStreetMap não tem camada de satélite (é vetorial/estilizada). Usei o
**Esri World Imagery**
(`server.arcgisonline.com/.../World_Imagery/MapServer/tile/{z}/{y}/{x}`) —
gratuito, sem API key, sem cadastro. **Atenção à ordem da URL**: Esri usa
`{z}/{y}/{x}`, não `{z}/{x}/{y}` como a maioria — inverter quebra tudo
silenciosamente.

**Bug real que apareceu:** em áreas rurais/industriais (comum no ICP da
Tractian — minas, fazendas), a Esri não tem imagem em alta resolução além de
um certo zoom. Em vez de erro, ela devolve uma tile "em branco" idêntica
(confirmei comparando hash MD5 de tiles em zooms/locais diferentes — mesmo
arquivo sempre). Corrigido com `maxNativeZoom: 17` no Leaflet
(`frontend/static/js/mapa.js`) — isso faz o Leaflet ampliar a última tile
real disponível em vez de pedir uma que não existe. Perde nitidez no zoom
máximo, mas nunca mais fica em branco.

### 5.4 Geocodificação de endereço exato (mapa do modal)

O mapa geral usa só centro da cidade (só isso é viável em escala/de graça).
Mas "ver a planta de verdade" no modal de uma empresa específica pede
precisão de endereço — poucas chamadas por vez (1 por empresa aberta), então
dá pra usar geocodificação real via **Nominatim** (OpenStreetMap, grátis).

**Regras de uso do Nominatim que importam pra manutenção futura:**
- Exige um `User-Agent` identificável (nome do app + contato) — sem isso, a
  Nominatim retorna 403. Ver `USER_AGENT` em `backend/geocoding.py`.
- Limite de 1 requisição/segundo — implementado com um timestamp da última
  chamada + `time.sleep()` (throttle simples, sem fila).
- Exige cache — implementado como dict em memória, chave = endereço
  normalizado. Reinicia a cada restart do processo (aceitável pro volume
  atual).
- **Fallback em 3 camadas** (`geocodificar_endereco_estruturado`): tenta
  endereço completo → se falhar, só bairro+cidade → se falhar, só cidade.
  Motivo: endereços fora do padrão (ex: "Quadra SCRN 704/705" de Brasília)
  não batem no Nominatim quando muito específicos, mas uma versão reduzida
  geralmente bate. Cada nível de precisão é marcado (`exato`/`bairro`/
  `cidade`) e mostrado honestamente na legenda do mapa — não finge precisão
  que não existe.
- Capado em 15 endereços por empresa (`MAX_ENDERECOS_POR_LOTE`) — empresas
  como a Vale S.A. têm 384 estabelecimentos; geocodificar todos violaria a
  política de uso da Nominatim (nada de geocodificação em massa) e demoraria
  minutos numa única abertura de modal.

### 5.5 Condição de corrida no modal

Como a geocodificação pode levar vários segundos, abrir uma empresa e trocar
rápido pra outra antes de terminar fazia a resposta atrasada "pisar" no mapa
já trocado. Corrigido com um token de sequência (`_modalToken` em
`frontend/static/js/tabela.js`) — cada abertura de modal incrementa o token,
e qualquer resposta assíncrona que chegue depois de o token já ter mudado é
descartada. Padrão simples, sem precisar cancelar a requisição de verdade.

---

## 6. Fit Score

**Motivação:** priorizar visualmente quem vale mais a pena contatar primeiro,
usando só dado que já existe no banco (sem enriquecimento externo pago).

**Fórmula** (`_calcular_fit_score`, `backend/database.py`), 0-100:

| Critério | Peso | Raciocínio |
|---|---|---|
| Porte | até 40 | Média/Grande = empresa maior = mais potencial de monitoramento industrial |
| Tempo de atividade | até 20 | >10 anos = negócio estabelecido, mais propenso a ter orçamento |
| Nº de estabelecimentos | até 20 | Mais plantas = mais pontos de instalação possíveis (capado em 10 pra não deixar outlier tipo Vale S.A. dominar) |
| Tem contato preenchido | até 20 | "Prontidão pra abordagem" — 10 pts email, 10 pts telefone |

Calculado a **partir dos dados brutos**, antes de formatar telefone/data pra
exibição (a formatação transforma string, dificultaria o cálculo depois).
Por isso a ordem das operações em `buscar_leads` importa: primeiro
`fit_score`, só depois `_formatar_telefone`/`_formatar_data` sobrescrevem os
mesmos campos.

**Calibração validada:** Vale S.A. (grande, madura, 59 estabelecimentos) =
90. Mineradora aberta em dez/2025 = 17. Os pesos não foram "chutados" sem
checar — testei contra casos reais antes de considerar pronto.

---

## 7. Filtro de porte multi-seleção

Antes era um `<select>` de valor único. RFB só tem 3 portes reais (ME/EPP/
Média-Grande — "Grande" sozinho não existe como categoria separada nos
dados, é sempre "Média/Grande" junto). Trocado por chips clicáveis
(`state.portes`, um `Set`, mesmo padrão usado pra UF). Backend mudou de
`porte: str` pra `portes: list`, usando `IN %s` (mesmo padrão de `ufs`).

**Migração de schema:** `buscas_salvas.porte` (string única) virou
`buscas_salvas.portes` (JSONB, lista) via `ALTER TABLE ... DROP COLUMN
... ADD COLUMN`. Só foi seguro porque a tabela tinha 0 linhas reais no
momento da migração — checar isso é sempre o primeiro passo antes de uma
migração destrutiva.

---

## 8. Formatação (telefone, data, município)

Detalhe que não é feature nova, mas correção espalhada: o app mostrava
`telefone1` como dígitos crus (`2134855000`), `data_inicio_atividade` como
`YYYYMMDD` cru, e `municipio` como o código da Receita em vez do nome.
Corrigido **no backend** (`_formatar_telefone`, `_formatar_data` em
`backend/database.py`, mais o join com `municipios_geo` já usado pro mapa)
— decisão deliberada de formatar na fonte em vez de no frontend, porque
assim tabela, modal, CSV e XLSX ficam consistentes automaticamente sem
duplicar lógica de formatação em JS e Python.

**Bug de brinde encontrado:** o CSV já exportava telefone sempre vazio desde
antes desta sessão — a coluna usava a chave `"telefone"` mas o dado real
vem em `"telefone1"`. Corrigido junto.

---

## Arquivos-chave (mapa mental)

```
backend/
  database.py          — toda lógica de query/negócio (a maior parte do trabalho novo)
  geocoding.py          — cliente Nominatim (cache + throttle + fallback)
  routes/
    busca.py            — /buscar, /socios, /estabelecimentos
    listas.py            — CRUD de listas + export XLSX
    buscas_salvas.py     — CRUD de buscas salvas
    mapa.py               — /mapa/geocodificar (cidade), /geocodificar-lote (endereço exato)
    exportar.py           — CSV

frontend/static/js/
  tabela.js              — tabela, modal, seleção, ordenação (numérica pro fit_score)
  listas.js               — barra flutuante, painel "Minhas Listas"
  mapa.js                  — mapa geral + mapa do modal, camadas ruas/satélite
  buscas-salvas.js          — sidebar de buscas salvas
  dropdown.js                — UF, CNAE, e agora chips de porte
  app.js                       — state global, executarBusca, histórico local
```

## Pendências conhecidas (não implementadas ainda)

- **Integração com HubSpot** no modal (consulta de deal/último contato) —
  discutido, mas propositalmente fora de escopo desta rodada.
- **Domínio fixo** (`project-myleads.eu.org`) — aguardando aprovação manual
  do eu.org (o `is-a.dev` foi tentado primeiro, mas rejeitado por política:
  eles bloqueiam explicitamente CNAME pra `*.cfargotunnel.com`). Enquanto
  isso, acesso público é via "quick tunnel" temporário do Cloudflare
  (muda a cada reinício).
- **Alertas de empresas novas** e **dedup entre listas** — ideias
  levantadas, não implementadas.
