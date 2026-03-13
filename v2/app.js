const USERS_STORAGE_KEY = "renovo_users_v1";
const SESSION_STORAGE_KEY = "renovo_session_v1";
const STORAGE_KEY = "renovo_celulas_v1";
const VISITANTES_PUB_KEY = "renovo_visitantes_pub_v1";

const loadingScreen = document.getElementById("loading-screen");
const loadingStatus = document.getElementById("loading-status");
const appShell = document.getElementById("app-shell");
const heroSection = document.getElementById("hero-section");
const alertBanner = document.getElementById("alert-banner");
const logOutput = document.getElementById("log-output");
const installButton = document.getElementById("install-button");
const refreshButton = document.getElementById("refresh-button");
const clearCacheButton = document.getElementById("clear-cache-button");
const authGridSection = document.getElementById("auth-grid-section");
const loginForm = document.getElementById("login-form");
const authFeedback = document.getElementById("auth-feedback");
const authPanel = document.getElementById("auth-panel");
const dashboardPanel = document.getElementById("dashboard-panel");
const dashboardUser = document.getElementById("dashboard-user");
const dashboardRole = document.getElementById("dashboard-role");
const dashboardCell = document.getElementById("dashboard-cell");
const dashboardHeading = document.getElementById("dashboard-heading");
const dashboardCopy = document.getElementById("dashboard-copy");
const accessChip = document.getElementById("access-chip");
const accessDetail = document.getElementById("access-detail");
const summaryCells = document.getElementById("summary-cells");
const summaryMembers = document.getElementById("summary-members");
const summaryReports = document.getElementById("summary-reports");
const summaryVisitantes = document.getElementById("summary-visitantes");
const homeActions = document.getElementById("home-actions");
const sessionBar = document.getElementById("session-bar");
const sessionTitle = document.getElementById("session-title");
const sessionCopy = document.getElementById("session-copy");
const logoutButton = document.getElementById("logout-button");
const statusSection = document.getElementById("status-section");
const supportSection = document.getElementById("support-section");
const logSection = document.getElementById("log-section");

const statusNodes = new Map(
  Array.from(document.querySelectorAll("[data-status-key]")).map((card) => [
    card.dataset.statusKey,
    {
      card,
      value: card.querySelector(".status-value"),
      detail: card.querySelector(".status-detail"),
    },
  ])
);

let deferredInstallPrompt = null;
let users = [];
let session = null;
let summary = { cells: 0, members: 0, reports: 0, visitantes: 0 };

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  bootstrap();
});

function bindEvents() {
  refreshButton?.addEventListener("click", () => bootstrap());
  clearCacheButton?.addEventListener("click", clearV2Cache);
  installButton?.addEventListener("click", handleInstallClick);
  logoutButton?.addEventListener("click", handleLogout);

  loginForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(loginForm);
    const username = normalizeUsername(formData.get("username"));
    const password = String(formData.get("password") || "");

    const user = users.find(
      (entry) => normalizeUsername(entry.username) === username && String(entry.password || "") === password
    );

    if (!user) {
      setAuthFeedback("Usuario ou senha invalidos.");
      appendLog("Tentativa de login falhou para " + (username || "usuario-vazio") + ".", "warn");
      return;
    }

    session = buildSessionFromUser(user);
    saveSession(session);
    setAuthFeedback("");
    appendLog("Login realizado com sucesso para " + session.username + ".", "ok");
    renderAuthState();
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installButton.hidden = false;
    appendLog("Instalacao PWA disponivel para este dispositivo.");
    setStatus("install", "Instalavel", "Voce pode instalar este app direto do navegador.", "ok");
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    installButton.hidden = true;
    appendLog("Aplicativo instalado com sucesso.");
    setStatus("install", "Instalado", "Este app foi instalado neste dispositivo.", "ok");
  });

  window.addEventListener("online", () => {
    setStatus("network", "Online", "Conexao com a internet ativa.", "ok");
    appendLog("Rede restaurada.");
  });

  window.addEventListener("offline", () => {
    setStatus("network", "Offline", "Sem internet. O app segue em modo local.", "warn");
    appendLog("Rede indisponivel. Mantendo modo local.");
  });

  window.addEventListener("error", (event) => {
    showBanner("Erro capturado em runtime: " + (event.message || "falha desconhecida"));
    appendLog("Erro global: " + (event.message || "falha desconhecida"), "danger");
  });

  window.addEventListener("unhandledrejection", (event) => {
    const message =
      (event.reason && typeof event.reason === "object" && "message" in event.reason && event.reason.message) ||
      String(event.reason || "promessa rejeitada");
    showBanner("Promessa rejeitada: " + message);
    appendLog("Promessa rejeitada: " + message, "danger");
  });
}

async function bootstrap() {
  resetUiForBootstrap();
  setLoading("Montando diagnostico do app...");
  appendLog("Boot iniciado em " + new Date().toLocaleString("pt-BR") + ".");
  setStatus("boot", "Iniciando", "Preparando verificacoes principais.", "warn");
  setStatus(
    "network",
    navigator.onLine ? "Online" : "Offline",
    navigator.onLine ? "Conexao ativa." : "Sem internet.",
    navigator.onLine ? "ok" : "warn"
  );
  setStatus(
    "install",
    isStandalone() ? "Instalado" : "Navegador",
    isStandalone() ? "Rodando em modo app." : "Rodando no navegador.",
    isStandalone() ? "ok" : "warn"
  );

  try {
    const bootResult = await Promise.race([
      runDiagnostics(),
      new Promise((_, reject) => {
        window.setTimeout(() => reject(new Error("Tempo limite excedido na inicializacao do app.")), 7000);
      }),
    ]);

    setStatus(
      "boot",
      bootResult.degraded ? "Pronto com fallback" : "Pronto",
      bootResult.message,
      bootResult.degraded ? "warn" : "ok"
    );

    if (bootResult.degraded) {
      showBanner("O app abriu em modo seguro. Consulte o log abaixo para revisar o ambiente.");
    }
  } catch (error) {
    showBanner("O app abriu com erro de bootstrap: " + (error?.message || error));
    setStatus("boot", "Erro", "A inicializacao travou antes de concluir.", "danger");
    appendLog("Bootstrap falhou: " + (error?.message || error), "danger");
  } finally {
    renderAuthState();
    appShell.hidden = false;
    loadingScreen.hidden = true;
  }
}

async function runDiagnostics() {
  let degraded = false;
  let detail = "Aplicativo pronto para uso com diagnostico ativo.";

  setLoading("Checando Firebase...");
  const firebaseApi = window.RenovoV2Firebase;
  if (!firebaseApi || typeof firebaseApi.init !== "function") {
    degraded = true;
    setStatus("firebase", "Indisponivel", "Bridge local do Firebase nao foi carregada.", "danger");
    appendLog("Bridge do Firebase nao encontrada.", "danger");
  } else {
    const firebaseResult = await firebaseApi.init();
    setStatus("firebase", mapStatusLabel(firebaseResult.status), firebaseResult.detail, firebaseResult.status);
    appendLog("Firebase: " + firebaseResult.detail, firebaseResult.status);
    if (firebaseResult.status !== "ok") {
      degraded = true;
    }
  }

  setLoading("Carregando usuarios...");
  const usersResult = await hydrateUsers();
  appendLog(usersResult.detail, usersResult.tone);
  if (usersResult.tone !== "ok") {
    degraded = true;
  }

  setLoading("Calculando resumo...");
  const summaryResult = await hydrateSummary();
  appendLog(summaryResult.detail, summaryResult.tone);
  if (summaryResult.tone !== "ok") {
    degraded = true;
  }

  setLoading("Restaurando sessao...");
  session = loadSession();
  if (session) {
    appendLog("Sessao restaurada para " + session.username + ".", "ok");
  } else {
    appendLog("Nenhuma sessao valida encontrada. Aguardando login.", "info");
  }

  setLoading("Registrando cache offline...");
  const swResult = await registerServiceWorker();
  setStatus("serviceWorker", swResult.label, swResult.detail, swResult.tone);
  appendLog("Service worker: " + swResult.detail, swResult.tone);
  if (swResult.tone !== "ok") {
    degraded = true;
  }

  setLoading("Finalizando...");
  if (!navigator.onLine) {
    degraded = true;
    detail = "Rede offline detectada. O app segue pronto para testes locais.";
  } else if (degraded) {
    detail = "Alguns modulos cairam em fallback seguro, mas o aplicativo esta no ar.";
  }

  return { degraded, message: detail };
}

async function hydrateUsers() {
  const firebaseApi = window.RenovoV2Firebase;
  let remoteUsers = [];
  let tone = "ok";
  let detail = "Usuarios carregados do armazenamento local.";

  if (firebaseApi && typeof firebaseApi.loadUsers === "function") {
    const remoteResult = await firebaseApi.loadUsers();
    if (Array.isArray(remoteResult.users) && remoteResult.users.length > 0) {
      remoteUsers = remoteResult.users;
      tone = "ok";
      detail = "Usuarios sincronizados do Firestore.";
    } else if (remoteResult.status === "warn") {
      tone = "warn";
      detail = remoteResult.detail;
    }
  }

  const localUsers = loadUsers();
  const sourceUsers = remoteUsers.length > 0 ? remoteUsers : localUsers;
  users = sourceUsers.map((entry) => normalizeUser(entry)).filter(Boolean);
  const defaultsAdded = ensureDefaultUsers();
  saveUsers(users);

  if (defaultsAdded && firebaseApi && typeof firebaseApi.saveUsers === "function") {
    const syncResult = await firebaseApi.saveUsers(users);
    if (syncResult.status !== "ok") {
      tone = "warn";
      detail = syncResult.detail;
    }
  }

  if (!remoteUsers.length && !localUsers.length) {
    detail = "Nenhum usuario existente encontrado. Defaults do app foram criados.";
    tone = "warn";
  } else if (!remoteUsers.length && localUsers.length > 0) {
    detail = "Usuarios carregados do armazenamento local compartilhado com a base anterior.";
  }

  return { tone, detail };
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return {
      label: "Sem suporte",
      detail: "Este navegador nao suporta service worker.",
      tone: "warn",
    };
  }

  try {
    const registration = await navigator.serviceWorker.register("./service-worker.js?v=3");
    await registration.update();
    return {
      label: "Ativo",
      detail: "Cache offline do app registrado com sucesso.",
      tone: "ok",
    };
  } catch (error) {
    return {
      label: "Falhou",
      detail: "Nao foi possivel registrar o cache offline: " + (error?.message || error),
      tone: "danger",
    };
  }
}

async function clearV2Cache() {
  appendLog("Limpando caches e registros do app...");

  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations
          .filter((registration) => {
            try {
              return new URL(registration.scope).pathname.includes("/renovo/v2/");
            } catch {
              return false;
            }
          })
          .map((registration) => registration.unregister())
      );
    }

    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith("renovo-v2-")).map((key) => caches.delete(key)));
    }

    appendLog("Cache do app limpo. Recarregando pagina...");
    window.setTimeout(() => window.location.reload(), 600);
  } catch (error) {
    showBanner("Falha ao limpar cache do app: " + (error?.message || error));
    appendLog("Falha ao limpar cache: " + (error?.message || error), "danger");
  }
}

async function handleInstallClick() {
  if (!deferredInstallPrompt) {
    showBanner("O navegador nao liberou instalacao automatica ainda.");
    appendLog("Instalacao manual necessaria. Abra o menu do navegador.", "warn");
    return;
  }

  deferredInstallPrompt.prompt();
  const choice = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installButton.hidden = true;

  if (choice.outcome === "accepted") {
    appendLog("Instalacao aceita pelo usuario.", "ok");
    setStatus("install", "Instalando", "Confirme a instalacao no navegador.", "ok");
    return;
  }

  appendLog("Instalacao cancelada pelo usuario.", "warn");
  setStatus("install", "Cancelado", "A instalacao foi cancelada.", "warn");
}

function handleLogout() {
  session = null;
  clearSession();
  setAuthFeedback("");
  appendLog("Sessao encerrada.", "info");
  renderAuthState();
}

function renderAuthState() {
  const isAdmin = session?.role === "admin";

  if (heroSection) {
    heroSection.hidden = !isAdmin;
  }
  if (statusSection) {
    statusSection.hidden = !isAdmin;
  }
  if (supportSection) {
    supportSection.hidden = !isAdmin;
  }
  if (logSection) {
    logSection.hidden = !isAdmin;
  }
  if (sessionBar) {
    sessionBar.hidden = !session;
  }
  if (authGridSection) {
    authGridSection.classList.add("single-panel");
  }

  if (!session) {
    authPanel.hidden = false;
    dashboardPanel.hidden = true;
    logoutButton.hidden = true;
    if (sessionTitle) sessionTitle.textContent = "Nao autenticado";
    if (sessionCopy) sessionCopy.textContent = "Entre para acessar os modulos principais do aplicativo.";
    return;
  }

  authPanel.hidden = true;
  dashboardPanel.hidden = false;
  logoutButton.hidden = false;

  if (sessionTitle) {
    sessionTitle.textContent = "Bem-vindo, " + (session.name || session.username);
  }
  if (sessionCopy) {
    sessionCopy.textContent = "Sessao ativa com cargo " + formatRole(session.role) + ".";
  }
  if (dashboardUser) {
    dashboardUser.textContent = session.name || session.username || "-";
  }
  if (dashboardRole) {
    dashboardRole.textContent = formatRole(session.role);
  }
  if (dashboardCell) {
    dashboardCell.textContent = session.assignedCellName || "Nao vinculada";
  }
  if (dashboardHeading) {
    dashboardHeading.textContent = "Central do aplicativo";
  }
  if (dashboardCopy) {
    dashboardCopy.textContent = buildAccessNote();
  }
  if (accessChip) {
    accessChip.textContent = (session.name || session.username) + " · " + formatRole(session.role);
  }
  if (accessDetail) {
    accessDetail.textContent = buildAccessNote();
  }
  renderSummary();
  renderHomeActions();
}

async function hydrateSummary() {
  const firebaseApi = window.RenovoV2Firebase;
  let cells = [];
  let reports = [];
  let visitantes = [];
  let tone = "ok";
  let detail = "Resumo carregado do armazenamento local.";

  if (firebaseApi && typeof firebaseApi.loadStateSummary === "function") {
    const remoteResult = await firebaseApi.loadStateSummary();
    if (remoteResult.state) {
      cells = Array.isArray(remoteResult.state.cells) ? remoteResult.state.cells : [];
      reports = Array.isArray(remoteResult.state.reports) ? remoteResult.state.reports : [];
      visitantes = Array.isArray(remoteResult.visitantes) ? remoteResult.visitantes : [];
      detail = "Resumo sincronizado do Firestore.";
    } else if (remoteResult.status === "warn") {
      tone = "warn";
      detail = remoteResult.detail;
    }
  }

  if (cells.length === 0 && reports.length === 0) {
    const localState = loadLocalState();
    cells = localState.cells;
    reports = localState.reports;
    if (Array.isArray(localState.visitantes) && localState.visitantes.length > 0) {
      visitantes = localState.visitantes;
    }
    if (cells.length || reports.length) {
      detail = "Resumo carregado do armazenamento local compartilhado com a base anterior.";
    }
  }

  if (visitantes.length === 0) {
    visitantes = loadVisitantes();
  }

  summary = {
    cells: cells.length,
    members: cells.reduce((acc, cell) => acc + (Array.isArray(cell.members) ? cell.members.length : 0), 0),
    reports: reports.length,
    visitantes: visitantes.length,
  };

  return { tone, detail };
}

function renderSummary() {
  if (summaryCells) summaryCells.textContent = String(summary.cells);
  if (summaryMembers) summaryMembers.textContent = String(summary.members);
  if (summaryReports) summaryReports.textContent = String(summary.reports);
  if (summaryVisitantes) summaryVisitantes.textContent = String(summary.visitantes);
}

function renderHomeActions() {
  if (!homeActions || !session) return;

  const actions = getHomeActionsForSession();
  homeActions.innerHTML = actions
    .map(
      (action) => `
        <button
          type="button"
          class="ghost-btn home-action-card"
          data-action-url="${escapeHtml(action.url)}"
          ${action.disabled ? "disabled" : ""}
        >
          <span class="home-action-meta">${escapeHtml(action.meta)}</span>
          <strong>${escapeHtml(action.title)}</strong>
          <p>${escapeHtml(action.description)}</p>
        </button>
      `
    )
    .join("");

  homeActions.querySelectorAll("[data-action-url]").forEach((button) => {
    button.addEventListener("click", () => {
      const url = button.getAttribute("data-action-url");
      if (!url || button.hasAttribute("disabled")) return;
      window.location.href = url;
    });
  });
}

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeUser(user) {
  if (!user || typeof user !== "object") {
    return null;
  }

  const name = String(user.name || "").trim();
  const username = normalizeUsername(user.username);
  const password = String(user.password || "");
  const role = sanitizeRole(user.role);

  if (!name || !username || !password) {
    return null;
  }

  return {
    id: String(user.id || createId()),
    name,
    username,
    password,
    role,
    assignedCellName: role === "leader" ? String(user.assignedCellName || "").trim() : "",
    createdAt: user.createdAt || new Date().toISOString(),
    updatedAt: user.updatedAt || null,
  };
}

function ensureDefaultUsers() {
  const now = new Date().toISOString();
  let changed = false;
  const defaultUsers = [
    { id: "admin-root", name: "Administrador", username: "admin", password: "123456", role: "admin", assignedCellName: "" },
    { id: "pastor-judson", name: "Pastor Judson", username: "pastor.judson", password: "123456", role: "pastor", assignedCellName: "" },
    { id: "coordinator-irma-neta", name: "Irmã Neta", username: "irma.neta", password: "123456", role: "coordinator", assignedCellName: "" },
    { id: "coordinator-anelia", name: "Anelia", username: "anelia", password: "123456", role: "coordinator", assignedCellName: "" },
    { id: "coordinator-adelaine", name: "Adelaine", username: "adelaine", password: "123456", role: "coordinator", assignedCellName: "" },
    { id: "coordinator-bruno", name: "Bruno", username: "bruno", password: "123456", role: "coordinator", assignedCellName: "" },
    { id: "coordinator-gabriel", name: "Gabriel", username: "gabriel", password: "123456", role: "coordinator", assignedCellName: "" },
    { id: "leader-joana-branca", name: "Joana", username: "joana.branca", password: "123456", role: "leader", assignedCellName: "Branca" },
    { id: "leader-vania-branca", name: "Vânia", username: "vania.branca", password: "123456", role: "leader", assignedCellName: "Branca" },
    { id: "leader-josue-branca", name: "Josué", username: "josue.branca", password: "123456", role: "leader", assignedCellName: "Branca" },
    { id: "leader-jander-cinza", name: "Jander", username: "jander.cinza", password: "123456", role: "leader", assignedCellName: "Cinza" },
    { id: "leader-aline-cinza", name: "Aline", username: "aline.cinza", password: "123456", role: "leader", assignedCellName: "Cinza" },
    { id: "leader-sabrina-preta", name: "Sabrina", username: "sabrina.preta", password: "123456", role: "leader", assignedCellName: "Preta" },
    { id: "leader-filipe-preta", name: "Filipe", username: "filipe.preta", password: "123456", role: "leader", assignedCellName: "Preta" },
    { id: "leader-jonattham-vinho", name: "Jonattham", username: "jonattham.vinho", password: "123456", role: "leader", assignedCellName: "Vinho" },
    { id: "leader-marilene-vinho", name: "Marilene", username: "marilene.vinho", password: "123456", role: "leader", assignedCellName: "Vinho" },
    { id: "leader-chirlene-aguia", name: "Chirlene", username: "chirlene.aguia", password: "123456", role: "leader", assignedCellName: "Visão de Águia" },
    { id: "leader-marta-aguia", name: "Marta", username: "marta.aguia", password: "123456", role: "leader", assignedCellName: "Visão de Águia" },
    { id: "leader-kelma-aguia", name: "Kelma", username: "kelma.aguia", password: "123456", role: "leader", assignedCellName: "Visão de Águia" },
    { id: "leader-leticia-amarela", name: "Letícia", username: "leticia.amarela", password: "123456", role: "leader", assignedCellName: "Amarela" },
    { id: "leader-samuel-amarela", name: "Samuel", username: "samuel.amarela", password: "123456", role: "leader", assignedCellName: "Amarela" },
    { id: "leader-layanne-amarela", name: "Layanne", username: "layanne.amarela", password: "123456", role: "leader", assignedCellName: "Amarela" },
    { id: "leader-evelyn-verde", name: "Evelyn", username: "evelyn.verde", password: "123456", role: "leader", assignedCellName: "Verde" },
    { id: "leader-isabella-peregrinos", name: "Isabella", username: "isabella.peregrinos", password: "123456", role: "leader", assignedCellName: "Peregrinos" },
    { id: "leader-sarah-peregrinos", name: "Sarah", username: "sarah.peregrinos", password: "123456", role: "leader", assignedCellName: "Peregrinos" },
    { id: "leader-thiago-logos", name: "Thiago", username: "thiago.logos", password: "123456", role: "leader", assignedCellName: "Logos" },
    { id: "leader-augusto-logos", name: "Augusto", username: "augusto.logos", password: "123456", role: "leader", assignedCellName: "Logos" },
    { id: "leader-raissa-get", name: "Raíssa", username: "raissa.get", password: "123456", role: "leader", assignedCellName: "GET" },
    { id: "leader-miguel-get", name: "Miguel", username: "miguel.get", password: "123456", role: "leader", assignedCellName: "GET" },
    { id: "leader-vitoria-ekballo", name: "Vitória", username: "vitoria.ekballo", password: "123456", role: "leader", assignedCellName: "Ekballo" },
    { id: "leader-pedro-ekballo", name: "Pedro", username: "pedro.ekballo", password: "123456", role: "leader", assignedCellName: "Ekballo" },
  ];

  defaultUsers.forEach((entry) => {
    if (users.some((user) => normalizeUsername(user.username) === normalizeUsername(entry.username))) {
      return;
    }

    users.push({
      id: entry.id,
      name: entry.name,
      username: entry.username,
      password: entry.password,
      role: entry.role,
      assignedCellName: entry.assignedCellName,
      createdAt: now,
      updatedAt: null,
    });
    changed = true;
  });

  return changed;
}

function loadUsers() {
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadLocalState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { cells: [], reports: [], visitantes: [] };
    }

    const parsed = JSON.parse(raw);
    return {
      cells: Array.isArray(parsed?.cells) ? parsed.cells : [],
      reports: Array.isArray(parsed?.reports) ? parsed.reports : [],
      visitantes: loadVisitantes(),
    };
  } catch {
    return { cells: [], reports: [], visitantes: [] };
  }
}

function loadVisitantes() {
  try {
    const raw = localStorage.getItem(VISITANTES_PUB_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveUsers(nextUsers) {
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(nextUsers));
}

function buildSessionFromUser(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    assignedCellName: user.assignedCellName || "",
    updatedAt: new Date().toISOString(),
  };
}

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.username) {
      return null;
    }

    const user = users.find((entry) => normalizeUsername(entry.username) === normalizeUsername(parsed.username));
    return user ? buildSessionFromUser(user) : null;
  } catch {
    return null;
  }
}

function saveSession(nextSession) {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
}

function clearSession() {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

function sanitizeRole(value) {
  const role = String(value || "leader").trim().toLowerCase();
  return ["leader", "coordinator", "pastor", "admin"].includes(role) ? role : "leader";
}

function formatRole(role) {
  if (role === "admin") return "Admin";
  if (role === "pastor") return "Pastor";
  if (role === "coordinator") return "Coordenador";
  return "Lider";
}

function buildAccessNote() {
  if (!session) {
    return "Entre para ver a home autenticada do aplicativo.";
  }

  if (session.role === "leader") {
    return "Acesso focado em relatorios e acompanhamento da celula " + (session.assignedCellName || "-") + ".";
  }
  if (session.role === "coordinator") {
    return "Acesso de coordenador com leitura ampla e acompanhamento de resultados.";
  }
  if (session.role === "pastor") {
    return "Acesso pastoral com visao geral e controle de acessos.";
  }
  return "Acesso administrativo total liberado para gerenciar o aplicativo.";
}

function getHomeActionsForSession() {
  const cards = [];

  cards.push({
    meta: "Celulas",
    title: session.role === "leader" ? "Minha celula" : "Celulas e membros",
    description:
      session.role === "leader"
        ? "Abrir a leitura da sua celula vinculada no aplicativo."
        : "Criar celulas, organizar membros e acompanhar a estrutura principal do app.",
    url: "./cells.html?v=2",
  });

  if (hasPermission("viewReports")) {
    cards.push({
      meta: "Relatorios",
      title: "Informacoes das celulas",
      description: "Abrir o modulo do app para preencher e consultar relatorios semanais.",
      url: "./report.html?v=2",
    });
  }

  if (hasPermission("viewStudies")) {
    cards.push({
      meta: "Biblioteca",
      title: "Estudos em PDF",
      description: "Abrir a biblioteca do app com estudos publicados e PDFs locais ou remotos.",
      url: "./studies.html?v=2",
    });
  }

  if (session.role !== "leader") {
    cards.push({
      meta: "Visitantes",
      title: "Cadastro de visitantes",
      description: "Abrir a rota do app com formulario publico e painel interno de acompanhamento.",
      url: "./visitantes.html?v=2",
    });
  }

  if (hasPermission("manageAccess")) {
    cards.push({
      meta: "Acesso",
      title: "Gerenciar acessos",
      description: "Abrir o modulo administrativo do app para criar, editar e remover usuarios.",
      url: "./access.html?v=2",
    });
  }

  cards.push({
    meta: "Instalacao",
    title: "Instalar app",
    description: "Abrir a tela de instalacao e suporte do aplicativo.",
    url: "./install.html?v=2",
  });

  return cards;
}

function hasPermission(permission) {
  if (!session) return false;

  const permissions = {
    createCell: ["coordinator", "pastor", "admin"],
    manageMembers: ["coordinator", "pastor", "admin"],
    submitReports: ["leader", "admin"],
    viewReports: ["leader", "coordinator", "pastor", "admin"],
    viewCells: ["coordinator", "pastor", "admin"],
    deleteCell: ["admin"],
    manageAccess: ["pastor", "admin"],
    viewStudies: ["leader", "coordinator", "pastor", "admin"],
    manageStudies: ["pastor", "admin"],
  };

  return (permissions[permission] || []).includes(session.role);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

function setAuthFeedback(message) {
  if (!authFeedback) return;
  authFeedback.textContent = message || "";
}

function resetUiForBootstrap() {
  hideBanner();
  clearLog();
  setAuthFeedback("");
  installButton.hidden = deferredInstallPrompt ? false : true;
}

function setLoading(message) {
  if (loadingStatus) {
    loadingStatus.textContent = message;
  }
}

function showBanner(message) {
  if (!alertBanner) return;
  alertBanner.hidden = false;
  alertBanner.textContent = message;
}

function hideBanner() {
  if (!alertBanner) return;
  alertBanner.hidden = true;
  alertBanner.textContent = "";
}

function clearLog() {
  if (!logOutput) return;
  logOutput.textContent = "";
}

function appendLog(message, tone) {
  if (!logOutput) return;
  const prefix =
    tone === "danger" ? "[erro]" :
    tone === "warn" ? "[alerta]" :
    tone === "ok" ? "[ok]" :
    "[info]";

  const current = logOutput.textContent ? logOutput.textContent + "\n" : "";
  logOutput.textContent = current + prefix + " " + message;
}

function setStatus(key, label, detail, tone) {
  const node = statusNodes.get(key);
  if (!node) return;
  node.card.dataset.tone = tone || "warn";
  if (node.value) node.value.textContent = label;
  if (node.detail) node.detail.textContent = detail;
}

function mapStatusLabel(status) {
  if (status === "ok") return "Pronto";
  if (status === "warn") return "Fallback";
  if (status === "danger") return "Erro";
  return "Info";
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}
