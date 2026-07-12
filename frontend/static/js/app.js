// Orquestrador principal
const state = {
  selecionados:  new Map(),  // cnae clean -> {code, desc}
  ufs:           new Set(),  // UFs selecionadas
  portes:        new Set(),  // portes selecionados ("01","03","05")
  todos:         [],
  filtrados:     [],
  pagina:        1,
  sortCol:       null,
  sortDir:       "asc",
  searchQuery:   "",
  dadosExport:   [],
  contagemCnae:  {},         // clean -> total
  selecionadosLista: new Set(),        // chaves (cnpj) selecionadas via checkbox pra adicionar em lista
  estabelecimentoEscolhido: new Map(), // cnpj_basico -> {cnpj_ordem, cnpj_dv, email, telefone1} (override do "Usar este contato")
  viewMode: "tabela",                  // "tabela" | "mapa"
};

// ── HISTÓRICO ─────────────────────────────────────────────────
const HISTORY_KEY = "tractian_search_history";
const MAX_HISTORY = 3;

function salvarHistorico(cnaes, ufs, portes, total) {
  const entry = {
    id:      Date.now(),
    cnaes,   // array de {clean, code, desc}
    ufs:     [...ufs],
    portes:  [...portes],
    total,
    data:    new Date().toLocaleString("pt-BR"),
  };
  let history = carregarHistorico();
  history.unshift(entry);
  history = history.slice(0, MAX_HISTORY);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  renderHistorico();
}

function carregarHistorico() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); }
  catch { return []; }
}

function renderHistorico() {
  const history = carregarHistorico();
  const el = document.getElementById("historicoLista");
  if (!history.length) {
    el.innerHTML = '<div class="empty-tags">Nenhuma busca recente</div>';
    return;
  }
  el.innerHTML = history.map(h => `
    <div class="hist-item" onclick="restaurarBusca('${h.id}')">
      <div class="hist-cnaes">${h.cnaes.map(c => c.code).join(", ")}</div>
      <div class="hist-meta">
        ${h.ufs.length ? h.ufs.join(", ") : "Brasil"} ·
        ${h.total.toLocaleString("pt-BR")} resultados ·
        ${h.data}
      </div>
    </div>`).join("");
}

function restaurarBusca(id) {
  const history = carregarHistorico();
  const h = history.find(x => x.id === Number(id));
  if (!h) return;

  state.selecionados.clear();
  h.cnaes.forEach(c => state.selecionados.set(c.clean, {code: c.code, desc: c.desc}));
  state.ufs.clear();
  h.ufs.forEach(u => state.ufs.add(u));
  state.portes.clear();
  (h.portes || []).forEach(p => state.portes.add(p));

  renderSidebar();
  renderUfTags();
  renderPorteChips();
  executarBusca();
}

// ── ESTADOS DA UI ─────────────────────────────────────────────
function mostrarEstado(id) {
  ["stateInicial","stateLoading","stateVazio","stateResultados"].forEach(s => {
    const el = document.getElementById(s);
    if (!el) return;
    if (s === id) {
      el.classList.remove("hidden");
      if (s === "stateResultados") el.style.display = "flex";
    } else {
      el.classList.add("hidden");
      if (s === "stateResultados") el.style.display = "none";
    }
  });
}

// ── BUSCA ─────────────────────────────────────────────────────
async function executarBusca() {
  if (state.selecionados.size === 0) {
    alert("Selecione pelo menos 1 CNAE.");
    return;
  }

  mostrarEstado("stateLoading");
  document.getElementById("btnBuscar").disabled = true;

  try {
    const res = await fetch("/buscar", {
      method:  "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        cnaes:  [...state.selecionados.keys()],
        ufs:    [...state.ufs],
        portes: [...state.portes],
      }),
    });

    const json = await res.json();
    if (json.error) throw new Error(json.error);

    const data = json.results || [];
    state.contagemCnae = json.contagem_cnae || {};

    state.dadosExport = data;
    state.todos       = data;
    state.filtrados   = [...data];
    state.sortCol     = null;
    state.sortDir     = "asc";
    state.pagina      = 1;
    state.searchQuery = "";
    state.selecionadosLista.clear();
    state.estabelecimentoEscolhido.clear();
    document.getElementById("resultSearch").value = "";
    if (typeof atualizarBarraSelecao === "function") atualizarBarraSelecao();

    // Atualizar badges de contagem nas tags de CNAE
    renderSidebar();

    // Salvar no histórico
    salvarHistorico(
      [...state.selecionados.entries()].map(([clean, v]) => ({clean, ...v})),
      state.ufs,
      state.portes,
      data.length
    );

    if (data.length === 0) {
      mostrarEstado("stateVazio");
    } else {
      mostrarEstado("stateResultados");
      renderTabela();
      if (typeof alternarView === "function") alternarView("tabela");
    }

    document.getElementById("btnExport").classList.toggle("show", data.length > 0);
  } catch (e) {
    alert("Erro na busca: " + e.message);
    mostrarEstado("stateInicial");
  }

  document.getElementById("btnBuscar").disabled = false;
}

// ── EXPORTAR CSV ──────────────────────────────────────────────
async function exportarCSV() {
  if (!state.dadosExport.length) return;
  try {
    const res = await fetch("/exportar", {
      method:  "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(state.dadosExport),
    });
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `leads_tractian_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    alert("Erro ao exportar: " + e.message);
  }
}

// ── INIT ──────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  initDropdown();
  renderHistorico();
  carregarBuscasSalvasServidor();
  mostrarEstado("stateInicial");
});
