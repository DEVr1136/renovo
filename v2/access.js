const USERS_STORAGE_KEY = "renovo_users_v1";
const SESSION_STORAGE_KEY = "renovo_session_v1";
const STORAGE_KEY = "renovo_celulas_v1";

const loadingScreen = document.getElementById("loading-screen");
const loadingStatus = document.getElementById("loading-status");
const accessApp = document.getElementById("access-app");
const accessBanner = document.getElementById("access-banner");
const accessHeroCopy = document.getElementById("access-hero-copy");
const accessForm = document.getElementById("access-form");
const accessRole = document.getElementById("access-role");
const assignedCellName = document.getElementById("assigned-cell-name");
const cancelAccessButton = document.getElementById("cancel-access-button");
const saveAccessButton = document.getElementById("save-access-button");
const accessFeedback = document.getElementById("access-feedback");
const accessUsersList = document.getElementById("access-users-list");
const usersTotal = document.getElementById("users-total");
const usersManagers = document.getElementById("users-managers");
const usersLeaders = document.getElementById("users-leaders");

let users = [];
let cells = [];
let session = null;

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  bootstrap();
});

function bindEvents() {
  accessRole?.addEventListener("change", syncRoleFields);
  cancelAccessButton?.addEventListener("click", resetForm);

  accessForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleSubmit();
  });

  accessUsersList?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-user-action]");
    if (!button) return;
    const userId = String(button.dataset.userId || "");
    const action = String(button.dataset.userAction || "");
    const user = users.find((entry) => entry.id === userId);
    if (!user) return;

    if (action === "edit") {
      fillForm(user);
      return;
    }

    if (action === "delete") {
      await deleteUser(user);
    }
  });
}

async function bootstrap() {
  setLoading("Carregando sessao...");
  session = loadSession();
  if (!session) {
    showBanner("Sessao nao encontrada. Volte para a home do app e entre novamente.");
    finishBoot();
    return;
  }

  if (!hasPermission(session.role, "manageAccess")) {
    showBanner("Seu perfil nao possui permissao para gerenciar acessos.");
    finishBoot();
    return;
  }

  setLoading("Carregando usuarios...");
  await hydrateUsers();
  setLoading("Carregando celulas...");
  cells = loadCells();
  updateHeroCopy();
  resetForm();
  renderUsers();
  finishBoot();
}

async function hydrateUsers() {
  const firebaseApi = window.RenovoV2Firebase;
  let remoteUsers = [];

  if (firebaseApi && typeof firebaseApi.loadUsers === "function") {
    const remote = await firebaseApi.loadUsers();
    if (Array.isArray(remote.users) && remote.users.length > 0) {
      remoteUsers = remote.users;
    }
  }

  const localUsers = loadUsers();
  users = (remoteUsers.length ? remoteUsers : localUsers).map(normalizeUser).filter(Boolean);
  const defaultsAdded = ensureDefaultUsers();
  saveUsersLocal(users);

  if (defaultsAdded && firebaseApi && typeof firebaseApi.saveUsers === "function") {
    const remote = await firebaseApi.saveUsers(users);
    if (remote.status === "warn") {
      showBanner(remote.detail);
    }
  }
}

async function handleSubmit() {
  const formData = new FormData(accessForm);
  const userId = String(formData.get("userId") || "").trim();
  const name = String(formData.get("name") || "").trim();
  const username = normalizeUsername(formData.get("username"));
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");
  const role = sanitizeRole(formData.get("role"));
  const linkedCell = String(formData.get("assignedCellName") || "").trim();
  const isEditing = Boolean(userId);

  if (!name || !username) {
    setFeedback("Preencha nome e usuario.");
    return;
  }

  if (role === "leader" && !linkedCell) {
    setFeedback("Informe a celula vinculada para lider.");
    return;
  }

  if (isEditing) {
    const existing = users.find((entry) => entry.id === userId);
    if (!existing) {
      setFeedback("Usuario nao encontrado.");
      return;
    }

    if (users.some((entry) => entry.id !== userId && normalizeUsername(entry.username) === username)) {
      setFeedback("Este usuario ja existe.");
      return;
    }

    if (password || confirmPassword) {
      if (password !== confirmPassword) {
        setFeedback("As senhas nao conferem.");
        return;
      }
      if (!password) {
        setFeedback("Informe a nova senha.");
        return;
      }
    }

    if (hasPermission(existing.role, "manageAccess") && !hasPermission(role, "manageAccess") && countManagerUsers() <= 1) {
      setFeedback("Nao e possivel remover o ultimo usuario com acesso administrativo.");
      return;
    }

    existing.name = name;
    existing.username = username;
    existing.role = role;
    existing.assignedCellName = role === "leader" ? linkedCell : "";
    existing.updatedAt = new Date().toISOString();
    if (password) {
      existing.password = password;
    }

    ensureLeaderCell(existing);
    await persistUsers("Acesso atualizado.");

    if (session?.id === existing.id) {
      session = buildSessionFromUser(existing);
      saveSession(session);
    }

    resetForm();
    renderUsers();
    return;
  }

  if (!password) {
    setFeedback("Informe uma senha para o novo acesso.");
    return;
  }

  if (password !== confirmPassword) {
    setFeedback("As senhas nao conferem.");
    return;
  }

  if (users.some((entry) => normalizeUsername(entry.username) === username)) {
    setFeedback("Este usuario ja existe.");
    return;
  }

  const newUser = {
    id: createId(),
    name,
    username,
    password,
    role,
    assignedCellName: role === "leader" ? linkedCell : "",
    createdAt: new Date().toISOString(),
    updatedAt: null,
  };

  users.push(newUser);
  ensureLeaderCell(newUser);
  await persistUsers("Novo acesso criado.");
  resetForm();
  renderUsers();
}

async function deleteUser(user) {
  if (session?.id === user.id) {
    setFeedback("Nao e possivel excluir o usuario da sessao atual.");
    return;
  }

  if (hasPermission(user.role, "manageAccess") && countManagerUsers() <= 1) {
    setFeedback("Nao e possivel excluir o ultimo usuario com acesso administrativo.");
    return;
  }

  const shouldDelete = typeof window.confirm === "function" ? window.confirm(`Deseja excluir o usuario ${user.name}?`) : true;
  if (!shouldDelete) return;

  users = users.filter((entry) => entry.id !== user.id);
  await persistUsers("Acesso excluido.");
  resetForm();
  renderUsers();
}

async function persistUsers(message) {
  saveUsersLocal(users);
  saveCellsState();

  const firebaseApi = window.RenovoV2Firebase;
  if (firebaseApi && typeof firebaseApi.saveUsers === "function") {
    const remote = await firebaseApi.saveUsers(users);
    if (remote.status === "warn") {
      showBanner(remote.detail);
    }
  }

  if (firebaseApi && typeof firebaseApi.saveState === "function") {
    await firebaseApi.saveState(loadStateForSave());
  }

  setFeedback(message);
}

function renderUsers() {
  const sorted = [...users].sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || ""), "pt-BR", { sensitivity: "base" })
  );

  if (usersTotal) usersTotal.textContent = String(sorted.length);
  if (usersManagers) usersManagers.textContent = String(countManagerUsers());
  if (usersLeaders) usersLeaders.textContent = String(sorted.filter((user) => user.role === "leader").length);

  if (!sorted.length) {
    accessUsersList.innerHTML = '<p class="status-detail">Nenhum acesso cadastrado.</p>';
    return;
  }

  const managerCount = countManagerUsers();
  accessUsersList.innerHTML = sorted
    .map((user) => {
      const canDelete = !(session?.id === user.id) && !(hasPermission(user.role, "manageAccess") && managerCount <= 1);
      return `
        <article class="access-user-card-v2">
          <div class="access-user-main-v2">
            <div>
              <strong>${escapeHtml(user.name)}</strong>
              <p>${escapeHtml(user.username)}</p>
            </div>
            <span class="access-chip">${escapeHtml(formatRole(user.role))}</span>
          </div>
          <p class="status-detail">Celula vinculada: ${escapeHtml(user.role === "leader" ? user.assignedCellName || "-" : "-")}</p>
          <div class="report-inline-actions">
            <button type="button" class="ghost-btn compact-btn" data-user-action="edit" data-user-id="${escapeHtml(user.id)}">Editar</button>
            <button type="button" class="ghost-btn compact-btn" data-user-action="delete" data-user-id="${escapeHtml(user.id)}" ${canDelete ? "" : "disabled"}>Excluir</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function fillForm(user) {
  accessForm.elements.namedItem("userId").value = user.id;
  accessForm.elements.namedItem("name").value = user.name || "";
  accessForm.elements.namedItem("username").value = user.username || "";
  accessForm.elements.namedItem("password").value = "";
  accessForm.elements.namedItem("confirmPassword").value = "";
  accessForm.elements.namedItem("role").value = sanitizeRole(user.role);
  accessForm.elements.namedItem("assignedCellName").value = user.assignedCellName || "";
  syncRoleFields();
  saveAccessButton.textContent = "Atualizar acesso";
  cancelAccessButton.hidden = false;
  setFeedback("");
}

function resetForm() {
  accessForm.reset();
  accessForm.elements.namedItem("userId").value = "";
  accessRole.value = "leader";
  assignedCellName.value = "";
  saveAccessButton.textContent = "Salvar acesso";
  cancelAccessButton.hidden = true;
  syncRoleFields();
  setFeedback("");
}

function syncRoleFields() {
  const isLeader = sanitizeRole(accessRole.value) === "leader";
  assignedCellName.disabled = !isLeader;
  assignedCellName.required = isLeader;
  if (!isLeader) {
    assignedCellName.value = "";
  }
}

function ensureLeaderCell(user) {
  if (!user || user.role !== "leader") return;
  const assigned = String(user.assignedCellName || "").trim();
  if (!assigned) return;

  const found = cells.find((cell) => normalizeName(cell.name) === normalizeName(assigned));
  if (found) {
    if (!found.leader) {
      found.leader = user.name || "Lider";
    }
    return;
  }

  cells.push({
    id: createId(),
    name: assigned,
    neighborhood: "Nao informado",
    meetingDay: "Nao definido",
    meetingTime: "20:00",
    leader: user.name || "Lider",
    members: [],
    createdAt: new Date().toISOString(),
  });
}

function loadCells() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.cells) ? parsed.cells.map(normalizeCell).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function saveCellsState() {
  const current = loadStateForSave();
  current.cells = cells;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
}

function loadStateForSave() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { cells: [], reports: [], studies: [], lastReportId: null };
    }
    const parsed = JSON.parse(raw);
    return {
      cells: Array.isArray(parsed?.cells) ? parsed.cells : [],
      reports: Array.isArray(parsed?.reports) ? parsed.reports : [],
      studies: Array.isArray(parsed?.studies) ? parsed.studies : [],
      lastReportId: typeof parsed?.lastReportId === "string" ? parsed.lastReportId : null,
    };
  } catch {
    return { cells: [], reports: [], studies: [], lastReportId: null };
  }
}

function countManagerUsers() {
  return users.filter((user) => hasPermission(user.role, "manageAccess")).length;
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
    const existing = users.find((user) => normalizeUsername(user.username) === normalizeUsername(entry.username));
    if (existing) {
      const nextAssignedCell = entry.role === "leader" ? entry.assignedCellName : "";
      if (
        existing.name !== entry.name ||
        String(existing.password || "") !== entry.password ||
        existing.role !== entry.role ||
        String(existing.assignedCellName || "") !== nextAssignedCell
      ) {
        existing.name = entry.name;
        existing.password = entry.password;
        existing.role = entry.role;
        existing.assignedCellName = nextAssignedCell;
        existing.updatedAt = now;
        changed = true;
      }
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

function normalizeUser(user) {
  if (!user || typeof user !== "object") return null;
  const name = String(user.name || "").trim();
  const username = normalizeUsername(user.username);
  const password = String(user.password || "");
  const role = sanitizeRole(user.role);
  if (!name || !username || !password) return null;
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

function normalizeCell(cell) {
  if (!cell || typeof cell !== "object") return null;
  return {
    id: String(cell.id || createId()),
    name: String(cell.name || "").trim(),
    neighborhood: String(cell.neighborhood || "Nao informado").trim(),
    meetingDay: String(cell.meetingDay || "Nao definido").trim(),
    meetingTime: String(cell.meetingTime || "20:00").trim(),
    leader: String(cell.leader || "").trim(),
    members: Array.isArray(cell.members)
      ? cell.members.map((member) => ({
          id: String(member?.id || createId()),
          name: String(member?.name || "").trim(),
          phone: String(member?.phone || "").trim(),
        })).filter((member) => member.name)
      : [],
    createdAt: cell.createdAt || new Date().toISOString(),
  };
}

function loadUsers() {
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveUsersLocal(nextUsers) {
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(nextUsers));
}

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSession(nextSession) {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
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

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function sanitizeRole(value) {
  const role = String(value || "leader").trim().toLowerCase();
  return ["leader", "coordinator", "pastor", "admin"].includes(role) ? role : "leader";
}

function hasPermission(role, permission) {
  const permissions = {
    manageAccess: ["pastor", "admin"],
  };
  return (permissions[permission] || []).includes(String(role || ""));
}

function formatRole(role) {
  if (role === "admin") return "Admin";
  if (role === "pastor") return "Pastor";
  if (role === "coordinator") return "Coordenador";
  return "Lider";
}

function updateHeroCopy() {
  if (!accessHeroCopy || !session) return;
  accessHeroCopy.textContent = `Sessao ativa: ${session.name || session.username} com cargo ${formatRole(session.role)}.`;
}

function setLoading(message) {
  if (loadingStatus) loadingStatus.textContent = message;
}

function finishBoot() {
  accessApp.hidden = false;
  loadingScreen.hidden = true;
}

function showBanner(message) {
  if (!accessBanner) return;
  accessBanner.hidden = false;
  accessBanner.textContent = message;
}

function setFeedback(message) {
  if (!accessFeedback) return;
  accessFeedback.textContent = message || "";
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

function normalizeName(value) {
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
