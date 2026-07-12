// Mapa: visualização geográfica dos resultados (Leaflet, grátis) + mapa da
// planta no modal (satélite, geocodificação de endereço exato via Nominatim)

const TILE_LAYERS = {
  ruas: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
  },
  satelite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri, Maxar, Earthstar Geographics",
    maxZoom: 19,
    // Áreas rurais/industriais (comuns no ICP) muitas vezes só têm imagem de
    // satélite em boa resolução até zoom ~17 na Esri; além disso ela devolve
    // um tile "em branco" (mesmo aí, sempre idêntico) em vez de erro. Com
    // maxNativeZoom, o Leaflet amplia a última tile real disponível ao invés
    // de mostrar essa tile em branco quando o usuário dá zoom além do que há.
    maxNativeZoom: 17,
  },
};

function _criarTileLayer(tipo) {
  const cfg = TILE_LAYERS[tipo];
  return L.tileLayer(cfg.url, {
    attribution: cfg.attribution,
    maxZoom: cfg.maxZoom,
    maxNativeZoom: cfg.maxNativeZoom,
  });
}

// ── MAPA GERAL (todos os resultados da busca) ───────────────────
let _mapaInstance = null;
let _markersLayer = null;
let _camadaMapa = null;
let _camadaMapaTipo = "ruas";

function alternarView(modo) {
  state.viewMode = modo;
  document.getElementById("tabTabela").classList.toggle("active", modo === "tabela");
  document.getElementById("tabMapa").classList.toggle("active", modo === "mapa");

  document.getElementById("tableWrap").style.display = modo === "tabela" ? "" : "none";
  document.querySelector(".pagination").style.display = modo === "tabela" ? "" : "none";
  document.getElementById("stateMapa").classList.toggle("hidden", modo !== "mapa");

  if (modo === "mapa") {
    if (!_mapaInstance) initMapa();
    setTimeout(() => _mapaInstance.invalidateSize(), 50);
    renderMapa();
  }
}

function initMapa() {
  _mapaInstance = L.map("mapaContainer").setView([-14.2, -51.9], 4);
  _camadaMapa = _criarTileLayer(_camadaMapaTipo).addTo(_mapaInstance);
  _markersLayer = L.layerGroup().addTo(_mapaInstance);
}

function alternarCamadaMapa(tipo, ev) {
  if (tipo === _camadaMapaTipo) return;
  _camadaMapaTipo = tipo;
  document.querySelectorAll("#mapaTabs .view-tab").forEach(b => b.classList.remove("active"));
  if (ev) ev.target.classList.add("active");
  if (_mapaInstance) {
    _mapaInstance.removeLayer(_camadaMapa);
    _camadaMapa = _criarTileLayer(tipo).addTo(_mapaInstance);
  }
}

async function renderMapa() {
  if (!_mapaInstance) return;
  _markersLayer.clearLayers();

  const legend = document.getElementById("mapaLegend");
  legend.textContent = "Carregando mapa...";

  const vistos = new Set();
  const municipios = [];
  state.filtrados.forEach(r => {
    const chave = `${r.municipio}_${r.uf}`;
    if (r.municipio && r.uf && !vistos.has(chave)) {
      vistos.add(chave);
      municipios.push({codigo: r.municipio, uf: r.uf});
    }
  });

  if (!municipios.length) {
    legend.textContent = "Nenhum resultado com localização pra mostrar no mapa.";
    return;
  }

  try {
    const res = await fetch("/mapa/geocodificar", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({municipios}),
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error);

    const pontos = json.pontos || {};
    let plotados = 0, fallback = 0, semDado = 0;

    state.filtrados.forEach((r, idx) => {
      const chave = `${r.municipio}_${r.uf}`;
      const ponto = pontos[chave];
      if (!ponto) { semDado++; return; }

      plotados++;
      if (ponto.fallback) fallback++;

      const jitter = () => (Math.random() - 0.5) * (ponto.fallback ? 0.6 : 0.01);
      const lat = ponto.lat + jitter();
      const lng = ponto.lng + jitter();

      const marker = L.circleMarker([lat, lng], {
        radius: 5,
        color: "#0050e8",
        fillColor: ponto.fallback ? "#93c5fd" : "#0050e8",
        fillOpacity: ponto.fallback ? 0.5 : 0.85,
        weight: ponto.fallback ? 1 : 1.5,
      }).addTo(_markersLayer);

      marker.bindPopup(`
        <b>${r.razao_social || "—"}</b><br>
        ${r.municipio ? ponto.nome : ""} ${r.uf ? "· " + r.uf : ""}<br>
        <a href="#" onclick="fecharPopupEAbrirModal(${idx}); return false;">Ver detalhes</a>
      `);
    });

    legend.innerHTML =
      `${plotados.toLocaleString("pt-BR")} de ${state.filtrados.length.toLocaleString("pt-BR")} empresas plotadas` +
      (fallback ? ` · ${fallback.toLocaleString("pt-BR")} sem coordenada exata (usando centro do estado)` : "") +
      (semDado ? ` · ${semDado.toLocaleString("pt-BR")} sem localização` : "");
  } catch (e) {
    legend.textContent = "Erro ao carregar o mapa: " + e.message;
  }
}

function fecharPopupEAbrirModal(idx) {
  _mapaInstance.closePopup();
  abrirModal(idx);
}

// ── MAPA DO MODAL (planta da empresa, satélite por padrão) ──────
let _modalMapaInstance = null;
let _modalMarkersLayer = null;
let _modalCamadaMapa = null;
let _modalCamadaTipo = "satelite";

function alternarCamadaModalMapa(tipo, ev) {
  _modalCamadaTipo = tipo;
  document.querySelectorAll("#modalMapaTabs .view-tab").forEach(b => b.classList.remove("active"));
  if (ev) ev.target.classList.add("active");
  if (_modalMapaInstance) {
    _modalMapaInstance.removeLayer(_modalCamadaMapa);
    _modalCamadaMapa = _criarTileLayer(tipo).addTo(_modalMapaInstance);
  }
}

function _enderecoCompleto(e) {
  return [e.logradouro, e.numero, e.bairro, e.municipio_nome || "", e.uf, "Brasil"]
    .filter(Boolean).join(", ");
}

async function renderModalMapa(razaoSocial, estabelecimentos, meuToken) {
  const legend = document.getElementById("modalMapaLegend");
  const container = document.getElementById("modalMapaContainer");

  if (!_modalMapaInstance) {
    _modalMapaInstance = L.map("modalMapaContainer").setView([-14.2, -51.9], 4);
    _modalCamadaMapa = _criarTileLayer(_modalCamadaTipo).addTo(_modalMapaInstance);
    _modalMarkersLayer = L.layerGroup().addTo(_modalMapaInstance);
  }
  // Reseta a view pro estado neutro imediatamente, pra não deixar o pin/zoom
  // da empresa anterior visível enquanto geocodifica a nova (parecia "travado").
  _modalMarkersLayer.clearLayers();
  _modalMapaInstance.setView([-14.2, -51.9], 4);
  legend.textContent = "Buscando localização exata da planta...";
  setTimeout(() => _modalMapaInstance.invalidateSize(), 50);

  if (!estabelecimentos.length) {
    legend.textContent = "Sem endereço pra localizar.";
    return;
  }

  const enderecos = estabelecimentos.map(e => ({
    id: `${e.cnpj_ordem}`,
    logradouro: e.logradouro || "",
    numero: e.numero || "",
    bairro: e.bairro || "",
    municipio: e.municipio_nome || "",
    uf: e.uf || "",
  }));

  const ZOOM_POR_PRECISAO = {exato: 17, bairro: 15, cidade: 12};
  const LABEL_PRECISAO = {exato: "", bairro: " · localização aproximada (bairro)", cidade: " · localização aproximada (cidade)"};

  try {
    const res = await fetch("/geocodificar-lote", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({enderecos}),
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    if (meuToken !== _modalToken) return; // usuário já abriu outra empresa, descarta

    const resultados = json.resultados || {};
    const pontos = [];
    let piorPrecisao = "exato";

    estabelecimentos.forEach(e => {
      const ponto = resultados[`${e.cnpj_ordem}`];
      if (!ponto) return;
      pontos.push(ponto);
      if (ponto.precisao !== "exato") piorPrecisao = ponto.precisao;

      const marker = L.marker([ponto.lat, ponto.lng]).addTo(_modalMarkersLayer);
      marker.bindPopup(`
        <b>${e.is_matriz ? "Matriz" : "Filial"}</b><br>
        ${_enderecoCompleto(e)}
        ${ponto.precisao !== "exato" ? `<br><i>${LABEL_PRECISAO[ponto.precisao]}</i>` : ""}
      `);
    });

    if (!pontos.length) {
      legend.textContent = "Não foi possível localizar essa empresa no mapa (nem a cidade).";
      setTimeout(() => _modalMapaInstance.invalidateSize(), 50);
      return;
    }

    if (pontos.length === 1) {
      _modalMapaInstance.setView([pontos[0].lat, pontos[0].lng], ZOOM_POR_PRECISAO[pontos[0].precisao] || 16);
    } else {
      _modalMapaInstance.fitBounds(pontos.map(p => [p.lat, p.lng]), {padding: [30, 30]});
    }

    legend.textContent = `${pontos.length} planta${pontos.length > 1 ? "s" : ""} localizada${pontos.length > 1 ? "s" : ""}` +
      LABEL_PRECISAO[piorPrecisao] +
      (estabelecimentos.length > 15 ? ` · mostrando as primeiras 15 de ${estabelecimentos.length} estabelecimentos` : "");
  } catch (e) {
    if (meuToken === _modalToken) legend.textContent = "Erro ao localizar a planta: " + e.message;
  }

  if (meuToken === _modalToken) setTimeout(() => _modalMapaInstance.invalidateSize(), 50);
}
