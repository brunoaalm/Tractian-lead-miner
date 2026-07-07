// Tabela: render, paginação, ordenação, highlight, modal
const PER_PAGE = 50;

function porteBadge(p) {
  const map = {
    "01": ["ME", "badge-me"], "1": ["ME", "badge-me"],
    "03": ["EPP", "badge-epp"], "3": ["EPP", "badge-epp"],
    "05": ["Grande", "badge-grande"], "5": ["Grande", "badge-grande"],
  };
  const [label, cls] = map[String(p)] || ["—", "badge-outros"];
  return `<span class="badge ${cls}">${label}</span>`;
}

function situacaoBadge(s) {
  const map = {
    "02": ["Ativa", "badge-ativo"], "2": ["Ativa", "badge-ativo"],
    "03": ["Suspensa", "badge-suspensa"], "3": ["Suspensa", "badge-suspensa"],
    "04": ["Inapta", "badge-inapta"], "4": ["Inapta", "badge-inapta"],
    "08": ["Baixada", "badge-baixada"], "8": ["Baixada", "badge-baixada"],
  };
  const [label, cls] = map[String(s)] || ["—", "badge-outros"];
  return `<span class="badge ${cls}">${label}</span>`;
}

function highlight(text, q) {
  if (!q || !text) return text || "—";
  const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return String(text).replace(new RegExp(`(${safe})`, "gi"),
    '<mark class="hl">$1</mark>');
}

function filtrarResultados() {
  const q = document.getElementById("resultSearch").value.toLowerCase().trim();
  state.searchQuery = q;
  state.filtrados = q
    ? state.todos.filter(r =>
        (r.razao_social || "").toLowerCase().includes(q) ||
        (r.nome_fantasia || "").toLowerCase().includes(q) ||
        (r.cnpj || "").includes(q) ||
        (r.municipio || "").toLowerCase().includes(q) ||
        (r.email || "").toLowerCase().includes(q) ||
        (r.bairro || "").toLowerCase().includes(q)
      )
    : [...state.todos];

  state.pagina = 1;
  if (state.sortCol) aplicarOrdem();
  renderTabela();
}

function ordenar(col) {
  if (state.sortCol === col) {
    state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
  } else {
    state.sortCol = col;
    state.sortDir = "asc";
  }
  document.querySelectorAll("th.sortable").forEach(th =>
    th.classList.remove("sorted-asc", "sorted-desc"));
  const th = document.getElementById(`th-${col}`);
  if (th) th.classList.add(state.sortDir === "asc" ? "sorted-asc" : "sorted-desc");
  state.pagina = 1;
  aplicarOrdem();
  renderTabela();
}

function aplicarOrdem() {
  state.filtrados.sort((a, b) => {
    const va = (a[state.sortCol] || "").toString().toLowerCase();
    const vb = (b[state.sortCol] || "").toString().toLowerCase();
    return state.sortDir === "asc"
      ? va.localeCompare(vb, "pt")
      : vb.localeCompare(va, "pt");
  });
}

function renderTabela() {
  const total = state.filtrados.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  state.pagina = Math.min(state.pagina, totalPages);
  const start = (state.pagina - 1) * PER_PAGE;
  const slice = state.filtrados.slice(start, start + PER_PAGE);
  const q = state.searchQuery || "";

  document.getElementById("tbody").innerHTML = slice.map((r, idx) => `
    <tr onclick="abrirModal(${start + idx})" style="cursor:pointer">
      <td class="td-empresa">
        <div class="razao">${highlight(r.razao_social, q) || '<span class="nd">—</span>'}</div>
        ${r.nome_fantasia ? `<div class="fantasia">${highlight(r.nome_fantasia, q)}</div>` : ""}
      </td>
      <td class="td-cnpj">${highlight(r.cnpj, q)}</td>
      <td>${situacaoBadge(r.situacao_cadastral)}</td>
      <td class="td-loc">
        <div>${highlight(r.municipio, q) || "—"} <span class="uf-badge">${r.uf || ""}</span></div>
        <div class="td-loc-sub">${highlight(r.bairro, q) || ""}</div>
      </td>
      <td class="td-end">
        <div>${r.logradouro ? highlight(r.logradouro, q) : "—"}${r.numero ? `, ${r.numero}` : ""}</div>
        <div class="td-end-sub">${r.cep || ""}</div>
      </td>
      <td>${porteBadge(r.porte_empresa)}</td>
      <td class="td-cnae">${r.cnae_principal || "—"}</td>
      <td class="td-contato">
        <div class="tel">${r.telefone1 || "—"}</div>
        <div class="email" title="${r.email || ""}">${highlight(r.email, q) || "—"}</div>
      </td>
    </tr>`).join("");

  document.getElementById("resultsCount").innerHTML =
    `Exibindo <strong>${(start+1).toLocaleString("pt-BR")}–${Math.min(start+PER_PAGE,total).toLocaleString("pt-BR")}</strong> de <strong>${total.toLocaleString("pt-BR")}</strong> resultados`;
  document.getElementById("pagInfo").innerHTML =
    `Página <b>${state.pagina}</b> de <b>${totalPages}</b>`;
  const ji = document.getElementById("jumpInput");
  ji.max = totalPages; ji.value = state.pagina;
  renderPaginacao(totalPages);
  document.getElementById("tableWrap").scrollTop = 0;
}

function renderPaginacao(totalPages) {
  const p = state.pagina;
  let pages = [];
  if (totalPages <= 7) {
    pages = Array.from({length: totalPages}, (_, i) => i + 1);
  } else {
    const left  = Math.max(2, p - 2);
    const right = Math.min(totalPages - 1, p + 2);
    pages = [1];
    if (left > 2) pages.push("...");
    for (let i = left; i <= right; i++) pages.push(i);
    if (right < totalPages - 1) pages.push("...");
    pages.push(totalPages);
  }
  document.getElementById("pagControls").innerHTML =
    `<button class="pag-btn" onclick="irPagina(${p-1})" ${p===1?"disabled":""}>‹</button>` +
    pages.map(pg => pg === "..."
      ? `<span class="pag-btn pag-ellipsis">…</span>`
      : `<button class="pag-btn ${pg===p?"active":""}" onclick="irPagina(${pg})">${pg}</button>`
    ).join("") +
    `<button class="pag-btn" onclick="irPagina(${p+1})" ${p===totalPages?"disabled":""}>›</button>`;
}

function irPagina(p) {
  const total = Math.ceil(state.filtrados.length / PER_PAGE);
  if (p < 1 || p > total) return;
  state.pagina = p;
  renderTabela();
}

function irParaPagina() {
  const val = parseInt(document.getElementById("jumpInput").value, 10);
  if (!isNaN(val)) irPagina(val);
}

// ── MODAL ─────────────────────────────────────────────────────
function abrirModal(idx) {
  const r = state.filtrados[idx];
  if (!r) return;

  const cnpj_basico = r.cnpj ? r.cnpj.replace(/\D/g,"").slice(0,8) : "";

  document.getElementById("modalEmpresa").textContent   = r.razao_social || "—";
  document.getElementById("modalFantasia").textContent  = r.nome_fantasia || "—";
  document.getElementById("modalCnpj").textContent      = r.cnpj || "—";
  document.getElementById("modalCnae").textContent      = r.cnae_principal || "—";
  document.getElementById("modalSituacao").innerHTML    = situacaoBadge(r.situacao_cadastral);
  document.getElementById("modalPorte").innerHTML       = porteBadge(r.porte_empresa);
  document.getElementById("modalInicio").textContent    = r.data_inicio_atividade || "—";
  document.getElementById("modalEnd").textContent       =
    [r.logradouro, r.numero, r.complemento, r.bairro, r.municipio, r.uf, r.cep]
      .filter(Boolean).join(", ") || "—";
  document.getElementById("modalTel1").textContent      = r.telefone1 || "—";
  document.getElementById("modalTel2").textContent      = r.telefone2 || "—";
  document.getElementById("modalEmail").textContent     = r.email || "—";

  // Sócios
  const sociosEl = document.getElementById("modalSocios");
  sociosEl.innerHTML = '<div class="modal-loading">Carregando sócios...</div>';

  document.getElementById("modal").classList.add("open");
  document.body.style.overflow = "hidden";

  // Buscar sócios
  if (cnpj_basico) {
    fetch(`/socios/${cnpj_basico}`)
      .then(r => r.json())
      .then(socios => {
        if (!socios.length) {
          sociosEl.innerHTML = '<div class="modal-empty">Nenhum sócio encontrado</div>';
          return;
        }
        sociosEl.innerHTML = socios.map(s => `
          <div class="socio-item">
            <div class="socio-nome">${s.nome_socio || "—"}</div>
            <div class="socio-meta">${s.qualificacao_socio || "—"} · Entrada: ${s.data_entrada || "—"}</div>
          </div>`).join("");
      })
      .catch(() => {
        sociosEl.innerHTML = '<div class="modal-empty">Erro ao carregar sócios</div>';
      });
  }
}

function fecharModal() {
  document.getElementById("modal").classList.remove("open");
  document.body.style.overflow = "";
}

document.addEventListener("keydown", e => {
  if (e.key === "Escape") fecharModal();
});