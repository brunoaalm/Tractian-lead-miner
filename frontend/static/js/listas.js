// Listas de leads: seleção, barra flutuante, painel "Minhas Listas"

let _listasCache = null;

// ── BARRA FLUTUANTE DE SELEÇÃO ──────────────────────────────────
function atualizarBarraSelecao() {
  const bar = document.getElementById("floatingSelectionBar");
  const count = state.selecionadosLista.size;
  bar.classList.toggle("hidden", count === 0);
  document.getElementById("fsbCount").textContent =
    `${count} selecionada${count === 1 ? "" : "s"}`;
  if (count === 0) {
    document.getElementById("dropdownListas").classList.remove("open");
  }
}

async function toggleDropdownListas() {
  const dd = document.getElementById("dropdownListas");
  const abrindo = !dd.classList.contains("open");
  if (abrindo) {
    await renderDropdownListas();
  }
  dd.classList.toggle("open", abrindo);
}

async function renderDropdownListas() {
  const dd = document.getElementById("dropdownListas");
  dd.innerHTML = '<div class="dd-empty">Carregando...</div>';
  try {
    const res = await fetch("/listas");
    _listasCache = await res.json();

    const itensExistentes = _listasCache.map(l => `
      <div class="dd-item" onclick="adicionarSelecionadosALista(${l.id})">
        <span class="dd-code">${l.nome}</span>
        <span class="dd-desc">${l.total_itens} itens</span>
      </div>`).join("");

    dd.innerHTML = `
      ${itensExistentes || '<div class="dd-empty">Nenhuma lista ainda</div>'}
      <div class="dd-group-label">Nova lista</div>
      <div class="dd-nova-lista">
        <input type="text" id="novaListaNome" placeholder="Nome da lista..." class="search-input">
        <button class="btn btn-primary" style="width:auto;padding:6px 12px" onclick="criarListaEAdicionar()">Criar e adicionar</button>
      </div>`;
  } catch (e) {
    dd.innerHTML = '<div class="dd-empty">Erro ao carregar listas</div>';
  }
}

async function criarListaEAdicionar() {
  const nome = (document.getElementById("novaListaNome")?.value || "").trim();
  if (!nome) { alert("Digite um nome para a lista."); return; }
  try {
    const res = await fetch("/listas", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({nome}),
    });
    const lista = await res.json();
    if (lista.error) throw new Error(lista.error);
    await adicionarSelecionadosALista(lista.id);
  } catch (e) {
    alert("Erro ao criar lista: " + e.message);
  }
}

function _empresaComOverride(r) {
  const override = state.estabelecimentoEscolhido.get(r.cnpj_basico);
  return {
    cnpj_basico:  r.cnpj_basico,
    cnpj_ordem:   override ? override.cnpj_ordem : r.cnpj_ordem,
    cnpj_dv:      override ? override.cnpj_dv    : r.cnpj_dv,
    razao_social: r.razao_social,
    email:        override ? override.email      : r.email,
    telefone1:    override ? override.telefone1  : r.telefone1,
  };
}

async function adicionarSelecionadosALista(listaId) {
  const empresas = state.filtrados
    .filter(r => state.selecionadosLista.has(chaveRow(r)))
    .map(_empresaComOverride);

  if (!empresas.length) return;

  try {
    const res = await fetch(`/listas/${listaId}/itens`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({empresas}),
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error);

    alert(`${empresas.length} empresa(s) adicionada(s) à lista (${json.inserted} linha(s), incluindo contatos).`);

    state.selecionadosLista.clear();
    document.getElementById("checkAllRows").checked = false;
    renderTabela();
    atualizarBarraSelecao();
    document.getElementById("dropdownListas").classList.remove("open");
  } catch (e) {
    alert("Erro ao adicionar à lista: " + e.message);
  }
}

// ── PAINEL "MINHAS LISTAS" ──────────────────────────────────────
async function abrirListas() {
  window.mostrarEstado("stateListas");
  await carregarListasPainel();
}

function fecharListas() {
  window.mostrarEstado(state.filtrados.length ? "stateResultados" : "stateInicial");
}

async function carregarListasPainel(listaIdAberta) {
  const coluna = document.getElementById("listasColuna");
  coluna.innerHTML = '<div class="modal-loading">Carregando...</div>';
  try {
    const res = await fetch("/listas");
    const listas = await res.json();
    document.getElementById("listasCount").textContent =
      `${listas.length} lista${listas.length === 1 ? "" : "s"}`;

    if (!listas.length) {
      coluna.innerHTML = '<div class="modal-empty">Nenhuma lista criada ainda. Selecione empresas na busca e clique em "Adicionar à Lista".</div>';
      document.getElementById("listaDetalhe").innerHTML = '<div class="modal-empty">Selecione uma lista à esquerda pra ver os itens</div>';
      return;
    }

    coluna.innerHTML = listas.map(l => `
      <div class="lista-card ${l.id === listaIdAberta ? "lista-card-ativa" : ""}" onclick="abrirDetalheLista(${l.id})">
        <div class="lista-card-nome">${l.nome}</div>
        <div class="lista-card-meta">${l.total_itens} itens · ${new Date(l.criado_em).toLocaleDateString("pt-BR")}</div>
        <button class="lista-card-del" onclick="event.stopPropagation(); deletarLista(${l.id})">×</button>
      </div>`).join("");

    if (listaIdAberta) await abrirDetalheLista(listaIdAberta);
  } catch (e) {
    coluna.innerHTML = '<div class="modal-empty">Erro ao carregar listas</div>';
  }
}

async function abrirDetalheLista(listaId) {
  document.querySelectorAll(".lista-card").forEach(el => el.classList.remove("lista-card-ativa"));
  const detalhe = document.getElementById("listaDetalhe");
  detalhe.innerHTML = '<div class="modal-loading">Carregando itens...</div>';
  try {
    const res = await fetch(`/listas/${listaId}/itens`);
    const itens = await res.json();

    if (!itens.length) {
      detalhe.innerHTML = '<div class="modal-empty">Essa lista ainda não tem itens</div>';
    } else {
      detalhe.innerHTML = `
        <div class="lista-detalhe-header">
          <div>${itens.length} item(ns)</div>
          <button class="btn btn-export show" style="width:auto;padding:8px 14px" onclick="exportarListaXLSX(${listaId})">↓ Exportar XLSX</button>
        </div>
        <div class="lista-tabela-wrap">
          <table class="lista-tabela">
            <thead><tr>
              <th>Empresa</th><th>Domínio</th><th>Contato</th><th>Cargo</th><th>Email</th><th>Telefone</th><th>Proprietário</th><th></th>
            </tr></thead>
            <tbody>
              ${itens.map(i => `
                <tr>
                  <td>${i.razao_social || "—"}</td>
                  <td>${i.dominio_empresa || "—"}</td>
                  <td>${i.nome_contato || "—"}</td>
                  <td>${i.cargo_contato || "—"}</td>
                  <td>${i.email || "—"}</td>
                  <td>${i.telefone || "—"}</td>
                  <td><input type="text" class="lista-prop-input" value="${i.proprietario || ""}" onblur="salvarProprietario(${i.id}, this.value)"></td>
                  <td><button class="tag-rm" onclick="removerItemLista(${listaId}, ${i.id})">×</button></td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>`;
    }
    const card = [...document.querySelectorAll(".lista-card")].find(el =>
      el.getAttribute("onclick") === `abrirDetalheLista(${listaId})`);
    if (card) card.classList.add("lista-card-ativa");
  } catch (e) {
    detalhe.innerHTML = '<div class="modal-empty">Erro ao carregar itens da lista</div>';
  }
}

async function salvarProprietario(itemId, valor) {
  try {
    await fetch(`/listas/itens/${itemId}`, {
      method: "PATCH",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({proprietario: valor}),
    });
  } catch (e) {
    alert("Erro ao salvar proprietário: " + e.message);
  }
}

async function removerItemLista(listaId, itemId) {
  try {
    await fetch(`/listas/itens/${itemId}`, {method: "DELETE"});
    await abrirDetalheLista(listaId);
    await carregarListasPainel();
  } catch (e) {
    alert("Erro ao remover item: " + e.message);
  }
}

async function deletarLista(listaId) {
  if (!confirm("Apagar essa lista e todos os itens dela?")) return;
  try {
    await fetch(`/listas/${listaId}`, {method: "DELETE"});
    document.getElementById("listaDetalhe").innerHTML = '<div class="modal-empty">Selecione uma lista à esquerda pra ver os itens</div>';
    await carregarListasPainel();
  } catch (e) {
    alert("Erro ao apagar lista: " + e.message);
  }
}

function exportarListaXLSX(listaId) {
  window.location = `/listas/${listaId}/exportar`;
}

// Fecha o dropdown de listas ao clicar fora
document.addEventListener("click", (e) => {
  const wrap = document.querySelector(".fsb-dropdown-wrap");
  if (wrap && !wrap.contains(e.target)) {
    document.getElementById("dropdownListas")?.classList.remove("open");
  }
});
