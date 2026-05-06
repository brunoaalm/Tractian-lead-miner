// Orquestrador principal da aplicação
// Estado global compartilhado entre módulos

const state = {
  selecionados: new Map(), // clean -> { code, desc }
  todos:        [],        // todos os resultados da busca
  filtrados:    [],        // resultados após filtro in-table
  pagina:       1,
  sortCol:      null,
  sortDir:      "asc",
  dadosExport:  [],        // cópia para exportação CSV
};

// ── ESTADOS DA UI ─────────────────────────────────────────────
function mostrarEstado(id) {
  ["stateInicial", "stateLoading", "stateVazio", "stateResultados"].forEach((s) => {
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
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cnaes: [...state.selecionados.keys()],
        uf: document.getElementById("uf").value,
      }),
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error);

    state.dadosExport = data;
    state.todos       = data;
    state.filtrados   = [...data];
    state.sortCol     = null;
    state.sortDir     = "asc";
    state.pagina      = 1;

    if (data.length === 0) {
      mostrarEstado("stateVazio");
    } else {
      mostrarEstado("stateResultados");
      renderTabela();
    }

    const btnExport = document.getElementById("btnExport");
    if (btnExport) btnExport.classList.toggle("show", data.length > 0);
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
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state.dadosExport),
    });
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `leads_tractian_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    alert("Erro ao exportar: " + e.message);
  }
}

// ── INIT ──────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  initDropdown();
  mostrarEstado("stateInicial");
});
