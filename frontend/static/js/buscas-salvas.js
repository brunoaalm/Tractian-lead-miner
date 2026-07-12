// Buscas salvas: persistentes no servidor (Postgres), diferente do histórico
// efêmero (localStorage) — pra reusar/compartilhar entre pessoas do time.

async function carregarBuscasSalvasServidor() {
  const el = document.getElementById("buscasSalvasLista");
  try {
    const res = await fetch("/buscas-salvas");
    const buscas = await res.json();
    if (!buscas.length) {
      el.innerHTML = '<div class="empty-tags">Nenhuma busca salva</div>';
      return;
    }
    el.innerHTML = buscas.map(b => `
      <div class="hist-item">
        <div onclick="restaurarBuscaSalva(${b.id})" style="cursor:pointer">
          <div class="hist-cnaes">${b.nome}</div>
          <div class="hist-meta">
            ${b.cnaes.map(c => c.code).join(", ")} ·
            ${b.ufs.length ? b.ufs.join(", ") : "Brasil"}
          </div>
        </div>
        <button class="tag-rm" onclick="deletarBuscaSalva(${b.id})" style="position:absolute; top:6px; right:6px;">×</button>
      </div>`).join("");
  } catch (e) {
    el.innerHTML = '<div class="empty-tags">Erro ao carregar buscas salvas</div>';
  }
}

async function salvarBuscaAtual() {
  if (state.selecionados.size === 0) {
    alert("Selecione pelo menos 1 CNAE antes de salvar a busca.");
    return;
  }
  const nome = prompt("Nome para essa busca (ex: Frigoríficos Sul):");
  if (!nome || !nome.trim()) return;

  try {
    const res = await fetch("/buscas-salvas", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        nome: nome.trim(),
        cnaes:  [...state.selecionados.entries()].map(([clean, v]) => ({clean, ...v})),
        ufs:    [...state.ufs],
        portes: [...state.portes],
      }),
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    await carregarBuscasSalvasServidor();
  } catch (e) {
    alert("Erro ao salvar busca: " + e.message);
  }
}

async function restaurarBuscaSalva(id) {
  try {
    const res = await fetch("/buscas-salvas");
    const buscas = await res.json();
    const b = buscas.find(x => x.id === id);
    if (!b) return;

    state.selecionados.clear();
    b.cnaes.forEach(c => state.selecionados.set(c.clean, {code: c.code, desc: c.desc}));
    state.ufs.clear();
    b.ufs.forEach(u => state.ufs.add(u));
    state.portes.clear();
    (b.portes || []).forEach(p => state.portes.add(p));

    renderSidebar();
    renderUfTags();
    renderPorteChips();
    executarBusca();
  } catch (e) {
    alert("Erro ao restaurar busca: " + e.message);
  }
}

async function deletarBuscaSalva(id) {
  try {
    await fetch(`/buscas-salvas/${id}`, {method: "DELETE"});
    await carregarBuscasSalvasServidor();
  } catch (e) {
    alert("Erro ao apagar busca salva: " + e.message);
  }
}
