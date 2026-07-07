// Gerencia dropdowns de CNAE e UF, filtro de porte
const MAX_CNAE = 5;
const MAX_UF   = 5;

const UFS_BR = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA",
  "MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN",
  "RS","RO","RR","SC","SP","SE","TO"
];

function initDropdown() {
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".dropdown-wrap")) {
      document.querySelectorAll(".dropdown").forEach(d => d.classList.remove("open"));
    }
  });
  renderUfTags();
}

// ── UF DROPDOWN ───────────────────────────────────────────────
function abrirUfDropdown() {
  filtrarUf();
  document.getElementById("ufDropdown").classList.add("open");
}

function filtrarUf() {
  const q   = document.getElementById("ufInput").value.toUpperCase().trim();
  const dd  = document.getElementById("ufDropdown");
  const max = state.ufs.size >= MAX_UF;

  const lista = q ? UFS_BR.filter(u => u.includes(q)) : UFS_BR;

  dd.innerHTML = lista.map(u => {
    const sel = state.ufs.has(u);
    const dis = !sel && max;
    return `<div class="dd-item ${sel ? "sel" : ""} ${dis ? "dis" : ""}"
      onclick="selecionarUf('${u}')">
      <span class="dd-code">${u}</span>
      <span class="dd-desc">${nomeUF(u)}${sel ? " ✓" : ""}</span>
    </div>`;
  }).join("") || '<div class="dd-empty">Nenhuma UF encontrada</div>';

  dd.classList.add("open");
}

function selecionarUf(uf) {
  if (state.ufs.has(uf)) { state.ufs.delete(uf); }
  else if (state.ufs.size < MAX_UF) { state.ufs.add(uf); }
  document.getElementById("ufInput").value = "";
  renderUfTags();
  filtrarUf();
}

function removerUf(uf) {
  state.ufs.delete(uf);
  renderUfTags();
}

function renderUfTags() {
  const count = state.ufs.size;
  document.getElementById("ufBadge").textContent = `${count}/${MAX_UF}`;
  document.getElementById("ufLimitWarn").classList.toggle("show", count >= MAX_UF);

  const area = document.getElementById("ufTagsArea");
  if (count === 0) {
    area.innerHTML = '<div class="empty-tags">Todo Brasil</div>';
    return;
  }
  area.innerHTML = [...state.ufs].map(uf => `
    <div class="tag tag-sm">
      <div class="tag-body"><div class="tag-code">${uf}</div></div>
      <button class="tag-rm" onclick="removerUf('${uf}')">×</button>
    </div>`).join("");
}

function nomeUF(uf) {
  const m = {
    AC:"Acre",AL:"Alagoas",AP:"Amapá",AM:"Amazonas",BA:"Bahia",
    CE:"Ceará",DF:"Distrito Federal",ES:"Espírito Santo",GO:"Goiás",
    MA:"Maranhão",MT:"Mato Grosso",MS:"Mato Grosso do Sul",MG:"Minas Gerais",
    PA:"Pará",PB:"Paraíba",PR:"Paraná",PE:"Pernambuco",PI:"Piauí",
    RJ:"Rio de Janeiro",RN:"Rio Grande do Norte",RS:"Rio Grande do Sul",
    RO:"Rondônia",RR:"Roraima",SC:"Santa Catarina",SP:"São Paulo",
    SE:"Sergipe",TO:"Tocantins"
  };
  return m[uf] || uf;
}

// ── CNAE DROPDOWN ─────────────────────────────────────────────
function abrirDropdown() {
  filtrarDropdown();
  document.getElementById("dropdown").classList.add("open");
}

function filtrarDropdown() {
  const q   = document.getElementById("cnaeInput").value.toLowerCase().trim();
  const dd  = document.getElementById("dropdown");
  const max = state.selecionados.size >= MAX_CNAE;

  // Agrupar por setor
  const filtrados = q
    ? TODOS_CNAES.filter(c => c.code.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q) || (c.setor||"").toLowerCase().includes(q))
    : TODOS_CNAES;

  if (!filtrados.length) {
    dd.innerHTML = '<div class="dd-empty">Nenhum resultado</div>';
    return;
  }

  // Agrupar por setor
  const grupos = {};
  filtrados.forEach(c => {
    const s = c.setor || "Outros";
    if (!grupos[s]) grupos[s] = [];
    grupos[s].push(c);
  });

  dd.innerHTML = Object.entries(grupos).map(([setor, items]) => `
    <div class="dd-group-label">${setor}</div>
    ${items.map(c => {
      const sel = state.selecionados.has(c.clean);
      const dis = !sel && max;
      return `<div class="dd-item ${sel ? "sel" : ""} ${dis ? "dis" : ""}"
        onclick="selecionarCnae('${c.clean}','${c.code}',\`${c.desc}\`)">
        <span class="dd-code">${c.code}${sel ? " ✓" : ""}</span>
        <span class="dd-desc">${c.desc}</span>
      </div>`;
    }).join("")}
  `).join("");

  dd.classList.add("open");
}

function selecionarCnae(clean, code, desc) {
  if (state.selecionados.has(clean) || state.selecionados.size >= MAX_CNAE) return;
  state.selecionados.set(clean, { code, desc });
  document.getElementById("cnaeInput").value = "";
  document.getElementById("dropdown").classList.remove("open");
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

  // Mostrar contador por CNAE se disponível
  area.innerHTML = [...state.selecionados.entries()].map(([clean, { code, desc }]) => {
    const cnt = state.contagemCnae[clean];
    const badge = cnt !== undefined ? `<span class="cnae-count-badge">${cnt.toLocaleString("pt-BR")}</span>` : "";
    return `<div class="tag">
      <div class="tag-body">
        <div class="tag-code">${code} ${badge}</div>
        <div class="tag-desc">${desc}</div>
      </div>
      <button class="tag-rm" onclick="removerCnae('${clean}')">×</button>
    </div>`;
  }).join("");
}