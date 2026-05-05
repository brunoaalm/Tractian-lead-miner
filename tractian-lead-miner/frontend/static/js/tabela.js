// Gerencia a tabela de resultados: render, paginação e ordenação
// Depende de: app.js (state)

const PER_PAGE = 50;

function porteBadge(p) {
  const map = {
    "01": ["ME (Micro)", "badge-me"],
    "1":  ["ME (Micro)", "badge-me"],
    "03": ["EPP",        "badge-epp"],
    "3":  ["EPP",        "badge-epp"],
    "05": ["Média/Grande","badge-grande"],
    "5":  ["Média/Grande","badge-grande"],
  };
  const [label, cls] = map[String(p)] || ["Outros", "badge-outros"];
  return `<span class="badge ${cls}">${label}</span>`;
}

function filtrarResultados() {
  const q = document.getElementById("resultSearch").value.toLowerCase().trim();
  state.filtrados = q
    ? state.todos.filter(
        (r) =>
          (r.razao_social || "").toLowerCase().includes(q) ||
          (r.nome_fantasia || "").toLowerCase().includes(q) ||
          (r.cnpj || "").includes(q) ||
          (r.municipio || "").toLowerCase().includes(q) ||
          (r.email || "").toLowerCase().includes(q)
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

  document.querySelectorAll("th.sortable").forEach((th) =>
    th.classList.remove("sorted-asc", "sorted-desc")
  );
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

  document.getElementById("tbody").innerHTML = slice
    .map(
      (r) => `
    <tr>
      <td class="td-empresa">
        <div class="razao">${r.razao_social || '<span class="nd">—</span>'}</div>
        ${r.nome_fantasia ? `<div class="fantasia">${r.nome_fantasia}</div>` : ""}
      </td>
      <td class="td-cnpj">${r.cnpj || "—"}</td>
      <td class="td-loc">
        <span>${r.municipio || "—"}</span>
        ${r.uf ? `<span class="uf-badge">${r.uf}</span>` : ""}
        <div style="margin-top:3px"><span class="badge badge-ativo">ATIVA</span></div>
      </td>
      <td>${porteBadge(r.porte_empresa)}</td>
      <td class="td-cnae">${r.cnae_principal || "—"}</td>
      <td class="td-contato">
        <div class="tel">${r.telefone || "—"}</div>
        <div class="email" title="${r.email || ""}">${r.email || "—"}</div>
      </td>
    </tr>`
    )
    .join("");

  // Info de contagem
  document.getElementById("resultsCount").innerHTML =
    `Exibindo <strong>${(start + 1).toLocaleString("pt-BR")}–${Math.min(start + PER_PAGE, total).toLocaleString("pt-BR")}</strong> de <strong>${total.toLocaleString("pt-BR")}</strong> resultados`;
  document.getElementById("pagInfo").innerHTML =
    `Página <b>${state.pagina}</b> de <b>${totalPages}</b>`;

  const jumpInput = document.getElementById("jumpInput");
  jumpInput.max = totalPages;
  jumpInput.value = state.pagina;

  renderPaginacao(totalPages);
  document.getElementById("tableWrap").scrollTop = 0;
}

function renderPaginacao(totalPages) {
  const controls = document.getElementById("pagControls");
  const p = state.pagina;
  let pages = [];

  if (totalPages <= 7) {
    pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  } else {
    const left  = Math.max(2, p - 2);
    const right = Math.min(totalPages - 1, p + 2);
    pages = [1];
    if (left > 2) pages.push("...");
    for (let i = left; i <= right; i++) pages.push(i);
    if (right < totalPages - 1) pages.push("...");
    pages.push(totalPages);
  }

  controls.innerHTML =
    `<button class="pag-btn" onclick="irPagina(${p - 1})" ${p === 1 ? "disabled" : ""}>‹</button>` +
    pages
      .map((pg) =>
        pg === "..."
          ? `<span class="pag-btn pag-ellipsis">…</span>`
          : `<button class="pag-btn ${pg === p ? "active" : ""}" onclick="irPagina(${pg})">${pg}</button>`
      )
      .join("") +
    `<button class="pag-btn" onclick="irPagina(${p + 1})" ${p === totalPages ? "disabled" : ""}>›</button>`;
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
