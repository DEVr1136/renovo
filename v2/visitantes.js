const VISITANTES_STORAGE_KEY = "renovo_visitantes_pub_v1";
const SESSION_STORAGE_KEY = "renovo_session_v1";

const loadingScreen = document.getElementById("loading-screen");
const loadingStatus = document.getElementById("loading-status");
const visitorsApp = document.getElementById("visitors-app");
const visitorsBanner = document.getElementById("visitors-banner");
const visitorsHeroCopy = document.getElementById("visitors-hero-copy");
const visitorsPanelTitle = document.getElementById("visitors-panel-title");
const visitorsPanelCopy = document.getElementById("visitors-panel-copy");
const visitorsSummary = document.getElementById("visitors-summary");
const visitorsTotal = document.getElementById("visitors-total");
const visitorsToday = document.getElementById("visitors-today");
const visitorsWithPhone = document.getElementById("visitors-with-phone");
const visitorsAdminTools = document.getElementById("visitors-admin-tools");
const visitorsSearch = document.getElementById("visitors-search");
const copyVisitorsLink = document.getElementById("copy-visitors-link");
const visitorsList = document.getElementById("visitors-list");
const visitorForm = document.getElementById("visitor-form");
const visitorFeedback = document.getElementById("visitor-feedback");
const visitorSuccessState = document.getElementById("visitor-success-state");
const newRegistrationButton = document.getElementById("new-registration-button");

let visitantes = [];
let session = null;

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  bootstrap();
});

function bindEvents() {
  visitorForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await handlePublicSubmit();
  });

  newRegistrationButton?.addEventListener("click", () => {
    visitorForm?.reset();
    visitorForm.hidden = false;
    visitorSuccessState.hidden = true;
    setFeedback("");
  });

  visitorsSearch?.addEventListener("input", () => renderVisitors());

  copyVisitorsLink?.addEventListener("click", async () => {
    const publicUrl = new URL("./visitantes.html", window.location.href);
    publicUrl.search = "";

    try {
      await navigator.clipboard.writeText(publicUrl.toString());
      copyVisitorsLink.textContent = "Link copiado";
      window.setTimeout(() => {
        copyVisitorsLink.textContent = "Copiar link publico";
      }, 1800);
    } catch {
      showBanner("Nao foi possivel copiar o link automaticamente neste dispositivo.");
    }
  });

  visitorsList?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-visitor-id]");
    if (!button || !canDeleteVisitors()) return;

    const visitorId = String(button.dataset.deleteVisitorId || "");
    const visitor = visitantes.find((entry) => entry.id === visitorId);
    if (!visitor) return;

    const confirmed =
      typeof window.confirm === "function"
        ? window.confirm(`Deseja excluir o visitante ${visitor.name}?`)
        : true;
    if (!confirmed) return;

    visitantes = visitantes.filter((entry) => entry.id !== visitorId);
    await persistVisitantes("Visitante removido com sucesso.");
  });
}

async function bootstrap() {
  setLoading("Carregando sessao...");
  session = loadSession();

  setLoading("Carregando visitantes...");
  await hydrateVisitantes();

  updateHeroCopy();
  renderPanelAccess();
  renderVisitors();
  finishBoot();
}

async function hydrateVisitantes() {
  const firebaseApi = window.RenovoV2Firebase;
  let remoteVisitantes = [];

  if (firebaseApi && typeof firebaseApi.loadVisitantes === "function") {
    const remote = await firebaseApi.loadVisitantes();
    if (Array.isArray(remote.visitantes) && remote.visitantes.length > 0) {
      remoteVisitantes = remote.visitantes;
    } else if (remote.status === "warn") {
      showBanner(remote.detail);
    }
  }

  const localVisitantes = loadLocalVisitantes();
  visitantes = (remoteVisitantes.length ? remoteVisitantes : localVisitantes).map(normalizeVisitor).filter(Boolean);
  saveLocalVisitantes(visitantes);
}

async function handlePublicSubmit() {
  const formData = new FormData(visitorForm);
  const name = String(formData.get("name") || "").trim();

  if (!name) {
    setFeedback("Informe o nome completo do visitante.");
    return;
  }

  const entry = {
    id: createId(),
    name,
    address: String(formData.get("address") || "").trim(),
    age: String(formData.get("age") || "").trim(),
    phone: String(formData.get("phone") || "").trim(),
    registeredAt: new Date().toISOString(),
  };

  visitantes = [entry, ...visitantes];
  await persistVisitantes("Cadastro realizado com sucesso.");
  visitorForm.hidden = true;
  visitorSuccessState.hidden = false;
}

async function persistVisitantes(message) {
  saveLocalVisitantes(visitantes);

  const firebaseApi = window.RenovoV2Firebase;
  if (firebaseApi && typeof firebaseApi.saveVisitantes === "function") {
    const remote = await firebaseApi.saveVisitantes(visitantes);
    if (remote.status === "warn") {
      showBanner(remote.detail);
    }
  }

  setFeedback(message);
  renderPanelAccess();
  renderVisitors();
}

function renderPanelAccess() {
  const canView = canViewVisitorsPanel();
  visitorsSummary.hidden = !canView;
  visitorsAdminTools.hidden = !canView;

  if (canView) {
    if (visitorsPanelTitle) visitorsPanelTitle.textContent = "Lista interna";
    if (visitorsPanelCopy) {
      visitorsPanelCopy.textContent = canDeleteVisitors()
        ? "Use a busca, copie o link publico e remova cadastros indevidos se necessario."
        : "Seu perfil pode acompanhar os cadastros, mas sem permissao para excluir registros.";
    }
  } else {
    if (visitorsPanelTitle) visitorsPanelTitle.textContent = "Compartilhamento";
    if (visitorsPanelCopy) {
      visitorsPanelCopy.textContent = session?.role === "leader"
        ? "Seu perfil no app nao possui painel interno de visitantes. Use esta pagina como formulario publico."
        : "Esta pagina ja pode ser compartilhada como formulario publico para novos visitantes.";
    }
  }

  const today = todayIsoDate();
  const withPhone = visitantes.filter((entry) => entry.phone).length;
  const todayCount = visitantes.filter((entry) => String(entry.registeredAt || "").slice(0, 10) === today).length;

  if (visitorsTotal) visitorsTotal.textContent = String(visitantes.length);
  if (visitorsToday) visitorsToday.textContent = String(todayCount);
  if (visitorsWithPhone) visitorsWithPhone.textContent = String(withPhone);
}

function renderVisitors() {
  const canView = canViewVisitorsPanel();
  if (!canView) {
    visitorsList.innerHTML = `
      <div class="visitor-share-card">
        <strong>Link publico pronto</strong>
        <p>Compartilhe esta mesma pagina com quem estiver visitando a igreja para registrar os dados.</p>
      </div>
    `;
    return;
  }

  const search = normalizeSearch(visitorsSearch?.value || "");
  const filtered = [...visitantes]
    .filter((entry) => {
      if (!search) return true;
      return normalizeSearch([entry.name, entry.address, entry.phone, entry.age].join(" ")).includes(search);
    })
    .sort((a, b) => compareVisitorsDesc(a, b));

  if (!filtered.length) {
    visitorsList.innerHTML = '<p class="status-detail">Nenhum visitante encontrado com esse filtro.</p>';
    return;
  }

  visitorsList.innerHTML = filtered
    .map((entry) => {
      const detailParts = [];
      if (entry.address) detailParts.push(entry.address);
      if (entry.phone) detailParts.push(entry.phone);
      if (entry.age) detailParts.push(`Idade ${entry.age}`);

      return `
        <article class="visitor-record-card">
          <div class="visitor-record-head">
            <div>
              <strong>${escapeHtml(entry.name)}</strong>
              <p>${escapeHtml(formatRegisteredAt(entry.registeredAt))}</p>
            </div>
            ${
              canDeleteVisitors()
                ? `<button class="ghost-btn compact-btn" type="button" data-delete-visitor-id="${escapeHtml(entry.id)}">Excluir</button>`
                : ""
            }
          </div>
          <p class="visitor-record-detail">${escapeHtml(detailParts.join(" | ") || "Sem detalhes complementares.")}</p>
        </article>
      `;
    })
    .join("");
}

function canViewVisitorsPanel() {
  return ["coordinator", "pastor", "admin"].includes(String(session?.role || ""));
}

function canDeleteVisitors() {
  return ["pastor", "admin"].includes(String(session?.role || ""));
}

function updateHeroCopy() {
  if (!visitorsHeroCopy) return;

  if (canViewVisitorsPanel()) {
    visitorsHeroCopy.textContent =
      "Formulario publico e painel interno liberados nesta rota. A lista abaixo reflete os cadastros do app.";
    return;
  }

  if (session?.role === "leader") {
    visitorsHeroCopy.textContent =
      "Seu perfil pode usar esta pagina como formulario publico, mas a lista interna segue restrita aos cargos de coordenacao.";
    return;
  }

  visitorsHeroCopy.textContent =
    "Esta pagina pode ser aberta direto no navegador e compartilhada com novos visitantes sem exigir login.";
}

function loadLocalVisitantes() {
  try {
    const raw = localStorage.getItem(VISITANTES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalVisitantes(nextVisitantes) {
  localStorage.setItem(VISITANTES_STORAGE_KEY, JSON.stringify(nextVisitantes));
}

function normalizeVisitor(visitor) {
  if (!visitor || typeof visitor !== "object") return null;
  const name = String(visitor.name || "").trim();
  if (!name) return null;

  return {
    id: String(visitor.id || createId()),
    name,
    address: String(visitor.address || "").trim(),
    age: String(visitor.age || "").trim(),
    phone: String(visitor.phone || "").trim(),
    registeredAt: visitor.registeredAt || new Date().toISOString(),
  };
}

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function compareVisitorsDesc(a, b) {
  const aTime = new Date(a.registeredAt || 0).getTime();
  const bTime = new Date(b.registeredAt || 0).getTime();
  return bTime - aTime;
}

function formatRegisteredAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Cadastro sem data valida";
  }
  return date.toLocaleString("pt-BR");
}

function todayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function setLoading(message) {
  if (loadingStatus) loadingStatus.textContent = message;
}

function setFeedback(message) {
  if (!visitorFeedback) return;
  visitorFeedback.textContent = message || "";
}

function showBanner(message) {
  if (!visitorsBanner) return;
  visitorsBanner.hidden = false;
  visitorsBanner.textContent = message;
}

function finishBoot() {
  visitorsApp.hidden = false;
  loadingScreen.hidden = true;
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

function normalizeSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
