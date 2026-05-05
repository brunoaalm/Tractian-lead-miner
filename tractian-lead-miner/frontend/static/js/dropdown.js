// Gerencia o dropdown de seleção de CNAEs
// Depende de: cnaes.js, app.js (state)

const MAX_CNAE = 5;

function initDropdown() {
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".dropdown-wrap")) fecharDropdown();
  });
}

function abrirDropdown() {
  filtrarDropdown();
  document.getElementById("dropdown").classList.add("open");
}

function fecharDropdown() {
  document.getElementById("dropdown").classList.remove("open");
}

function filtrarDropdown() {
  const q = document.getElementById("cnaeInput").value.toLowerCase().trim();
  const dd = document.getElementById("dropdown");
  const max = state.selecionados.size >= MAX_CNAE;

  const lista = q
    ? TODOS_CNAES.filter(
        (c) =>
          c.code.toLowerCase().includes(q) ||
          c.desc.toLowerCase().includes(q)
      )
    : TODOS_CNAES;

  if (lista.length === 0) {
    dd.innerHTML =
      '<div class="dd-empty">Nenhum resultado encontrado</div>';
    return;
  }

  dd.innerHTML = lista
    .map((c) => {
      const sel = state.selecionados.has(c.clean);
      const dis = !sel && max;
      return `<div class="dd-item ${sel ? "sel" : ""} ${dis ? "dis" : ""}"
        onclick="selecionarCnae('${c.clean}','${c.code}',\`${c.desc}\`)">
        <span class="dd-code">${c.code}${sel ? " ✓" : ""}</span>
        <span class="dd-desc">${c.desc}</span>
      </div>`;
    })
    .join("");
}

function selecionarCnae(clean, code, desc) {
  if (state.selecionados.has(clean) || state.selecionados.size >= MAX_CNAE)
    return;
  state.selecionados.set(clean, { code, desc });
  document.getElementById("cnaeInput").value = "";
  fecharDropdown();
  renderSidebar();
}

function removerCnae(clean) {
  state.selecionados.delete(clean);
  renderSidebar();
}

function renderSidebar() {
  const count = state.selecionados.size;
  document.getElementById("cnaeBadge").textContent = `${count}/${MAX_CNAE}`;
  document.getElementById("limitWarn").classList.toggle("show", count >= MAX_CNAE);

  const area = document.getElementById("tagsArea");
  if (count === 0) {
    area.innerHTML = '<div class="empty-tags">Nenhum CNAE selecionado</div>';
    return;
  }

  area.innerHTML = [...state.selecionados.entries()]
    .map(
      ([clean, { code, desc }]) => `
    <div class="tag">
      <div class="tag-body">
        <div class="tag-code">${code}</div>
        <div class="tag-desc">${desc}</div>
      </div>
      <button class="tag-rm" onclick="removerCnae('${clean}')">×</button>
    </div>`
    )
    .join("");
}
