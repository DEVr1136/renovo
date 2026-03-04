const STORAGE_KEY = "renovo_celulas_v1";
const SESSION_STORAGE_KEY = "renovo_session_v1";
const USERS_STORAGE_KEY = "renovo_users_v1";

const state = loadState();
let users = loadUsers();
ensureDefaultUsers();
let session = loadSession();

const authScreen = document.getElementById("auth-screen");
const appShell = document.getElementById("app-shell");
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const toggleRegisterFormButton = document.getElementById("toggle-register-form");
const authFeedback = document.getElementById("auth-feedback");
const logoutButton = document.getElementById("logout-button");
const registerRoleSelect = registerForm?.elements?.namedItem("role");
const registerAssignedCellInput = registerForm?.elements?.namedItem("assignedCellName");

const cellForm = document.getElementById("cell-form");
const memberForm = document.getElementById("member-form");
const reportForm = document.getElementById("report-form");
const memberCellSelect = document.getElementById("member-cell");
const reportCellSelect = document.getElementById("report-cell");
const attendanceList = document.getElementById("attendance-list");
const markAllAttendanceButton = document.getElementById("mark-all-attendance");
const clearAttendanceButton = document.getElementById("clear-attendance");
const copyReportButton = document.getElementById("copy-report");
const reportOutput = document.getElementById("report-output");
const cellsList = document.getElementById("cells-list");
const totalCells = document.getElementById("total-cells");
const totalMembers = document.getElementById("total-members");
const reportDateInput = reportForm.elements.namedItem("date");
const statsSection = document.querySelector(".stats");

const createCellCard = document.getElementById("create-cell-card");
const addMemberCard = document.getElementById("add-member-card");
const viewCellsCard = document.getElementById("view-cells-card");
const weeklyReportCard = document.getElementById("weekly-report-card");
const manageAccessCard = document.getElementById("manage-access-card");

const cellModal = document.getElementById("cell-modal");
const memberModal = document.getElementById("member-modal");
const cellsModal = document.getElementById("cells-modal");
const reportModal = document.getElementById("report-modal");
const accessModal = document.getElementById("access-modal");

const closeCellModalButton = document.getElementById("close-cell-modal");
const closeMemberModalButton = document.getElementById("close-member-modal");
const closeCellsModalButton = document.getElementById("close-cells-modal");
const closeReportModalButton = document.getElementById("close-report-modal");
const closeAccessModalButton = document.getElementById("close-access-modal");

const accessForm = document.getElementById("access-form");
const accessUsersList = document.getElementById("access-users-list");
const accessFeedback = document.getElementById("access-feedback");
const saveAccessButton = document.getElementById("save-access-button");
const cancelAccessEditButton = document.getElementById("cancel-access-edit");
const accessRoleSelect = accessForm?.elements?.namedItem("role");
const accessAssignedCellInput = accessForm?.elements?.namedItem("assignedCellName");

const accessBadge = document.getElementById("access-badge");
const accessNote = document.getElementById("access-note");

let hasAppliedInitialReportContext = false;
let hasAutoOpenedLeaderReport = false;
let prevCellIds = new Set();
const collapsedCellIds = new Set();

const ROLE_LABELS = {
  leader: "Lider de Celula",
  coordinator: "Coordenador",
  pastor: "Pastor",
  admin: "Admin (nivel Pastor)",
};
const MANAGEABLE_ROLES = ["leader", "coordinator", "pastor", "admin"];

const ROLE_PERMISSIONS = {
  createCell: ["coordinator", "pastor", "admin"],
  manageMembers: ["coordinator", "pastor", "admin"],
  submitReports: ["leader", "coordinator", "pastor", "admin"],
  viewCells: ["coordinator", "pastor", "admin"],
  manageAccess: ["pastor", "admin"],
};

const ICONS = {
  chartDown: "\u{1F4C9}",
  calendar: "\u{1F4C5}",
  people: "\u{1F465}",
  handshake: "\u{1F91D}",
  house: "\u{1F3E0}",
  clipboard: "\u{1F4CB}",
  present: "\u2705",
  absent: "\u{1F6AB}",
  visitors: "\u{1F64B}\u200D\u2642\uFE0F",
  summary: "\u{1F4CA}",
  totalPeople: "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}",
  offering: "\u{1F4B0}",
  foods: "\u{1F956}",
  snack: "\u{1F370}",
  discipleship: "\u{1F4D6}",
  visits: "\u{1F3E1}",
  conversions: "\u{1F64F}",
  blackHeart: "\u{1F5A4}",
};

seedInitialDataIfEmpty();
if (session) {
  ensureLeaderCellForSession();
}

bindAuthEvents();
bindAppEvents();
initializeApp();

function bindAuthEvents() {
  toggleRegisterFormButton?.addEventListener("click", () => {
    registerForm.hidden = !registerForm.hidden;
    syncRegisterFormRoleFields();
    setAuthFeedback("");
  });

  registerRoleSelect?.addEventListener("change", syncRegisterFormRoleFields);
  syncRegisterFormRoleFields();

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
      return;
    }

    session = buildSessionFromUser(user);
    saveSession(session);
    hasAppliedInitialReportContext = false;
    hasAutoOpenedLeaderReport = false;
    ensureLeaderCellForSession();
    showAppScreen();
    render();
    loginForm.reset();
    if (registerForm) {
      registerForm.hidden = true;
    }
    setAuthFeedback("");
  });

  registerForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(registerForm);

    const name = String(formData.get("name") || "").trim();
    const username = normalizeUsername(formData.get("username"));
    const password = String(formData.get("password") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");
    const role = String(formData.get("role") || "leader");
    const assignedCellName = String(formData.get("assignedCellName") || "").trim();

    if (!name || !username || !password) {
      setAuthFeedback("Preencha os campos obrigatorios.");
      return;
    }

    if (password !== confirmPassword) {
      setAuthFeedback("As senhas nao conferem.");
      return;
    }

    if (users.some((entry) => normalizeUsername(entry.username) === username)) {
      setAuthFeedback("Este usuario ja existe.");
      return;
    }

    if (role === "leader" && !assignedCellName) {
      setAuthFeedback("Informe a celula vinculada para o lider.");
      return;
    }

    const newUser = {
      id: createId(),
      name,
      username,
      password,
      role: role === "coordinator" ? "coordinator" : "leader",
      assignedCellName: role === "leader" ? assignedCellName : "",
      createdAt: new Date().toISOString(),
    };

    users.push(newUser);
    saveUsers(users);

    session = buildSessionFromUser(newUser);
    saveSession(session);
    hasAppliedInitialReportContext = false;
    hasAutoOpenedLeaderReport = false;
    ensureLeaderCellForSession();
    showAppScreen();
    render();
    registerForm.reset();
    registerForm.hidden = true;
    setAuthFeedback("");
  });

  logoutButton?.addEventListener("click", () => {
    session = null;
    clearSession();
    closeAllModals();
    hasAppliedInitialReportContext = false;
    hasAutoOpenedLeaderReport = false;
    showAuthScreen();
    loginForm.reset();
    if (registerForm) {
      registerForm.hidden = true;
    }
    setAuthFeedback("");
  });
}
function bindAppEvents() {
  createCellCard?.addEventListener("click", () => {
    if (!hasPermission("createCell")) {
      return;
    }
    openModal(cellModal);
  });

  addMemberCard?.addEventListener("click", () => {
    if (!hasPermission("manageMembers")) {
      return;
    }
    openModal(memberModal);
  });

  viewCellsCard?.addEventListener("click", () => {
    if (!hasPermission("viewCells")) {
      return;
    }
    renderCells();
    openModal(cellsModal);
  });

  weeklyReportCard?.addEventListener("click", () => {
    if (!hasPermission("submitReports")) {
      return;
    }
    renderReportCellOptions();
    applyInitialReportContext();
    renderAttendanceList();
    renderLatestReport();
    openModal(reportModal);
  });

  manageAccessCard?.addEventListener("click", () => {
    if (!hasPermission("manageAccess")) {
      return;
    }
    resetAccessForm();
    renderAccessUsers();
    openModal(accessModal);
  });

  closeCellModalButton?.addEventListener("click", () => closeModal(cellModal));
  closeMemberModalButton?.addEventListener("click", () => closeModal(memberModal));
  closeCellsModalButton?.addEventListener("click", () => closeModal(cellsModal));
  closeReportModalButton?.addEventListener("click", () => closeModal(reportModal));
  closeAccessModalButton?.addEventListener("click", () => closeModal(accessModal));

  [cellModal, memberModal, cellsModal, reportModal, accessModal].forEach((modal) => {
    modal?.addEventListener("click", (event) => {
      if (event.target === modal) {
        closeModal(modal);
      }
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeAllModals();
    }
  });

  accessRoleSelect?.addEventListener("change", syncAccessFormRoleFields);
  syncAccessFormRoleFields();

  cancelAccessEditButton?.addEventListener("click", () => {
    resetAccessForm();
    setAccessFeedback("");
  });

  accessForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!hasPermission("manageAccess")) {
      return;
    }

    const formData = new FormData(accessForm);
    const userId = String(formData.get("userId") || "").trim();
    const name = String(formData.get("name") || "").trim();
    const username = normalizeUsername(formData.get("username"));
    const password = String(formData.get("password") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");
    const role = sanitizeManagedRole(formData.get("role"));
    const assignedCellName = String(formData.get("assignedCellName") || "").trim();
    const isEditing = Boolean(userId);

    if (!name || !username) {
      setAccessFeedback("Preencha nome e usuario.");
      return;
    }

    if (role === "leader" && !assignedCellName) {
      setAccessFeedback("Informe a celula vinculada para o lider.");
      return;
    }

    if (isEditing) {
      const existingUser = users.find((entry) => entry.id === userId);
      if (!existingUser) {
        setAccessFeedback("Usuario nao encontrado.");
        return;
      }

      const hasUsernameConflict = users.some(
        (entry) => entry.id !== userId && normalizeUsername(entry.username) === username
      );
      if (hasUsernameConflict) {
        setAccessFeedback("Este usuario ja existe.");
        return;
      }

      if (password || confirmPassword) {
        if (password !== confirmPassword) {
          setAccessFeedback("As senhas nao conferem.");
          return;
        }
        if (!password) {
          setAccessFeedback("Informe a nova senha.");
          return;
        }
      }

      if (
        roleHasPermission(existingUser.role, "manageAccess") &&
        !roleHasPermission(role, "manageAccess") &&
        countManagerUsers() <= 1
      ) {
        setAccessFeedback("Nao e possivel remover o ultimo usuario com acesso administrativo.");
        return;
      }

      existingUser.name = name;
      existingUser.username = username;
      existingUser.role = role;
      existingUser.assignedCellName = role === "leader" ? assignedCellName : "";
      existingUser.updatedAt = new Date().toISOString();
      if (password) {
        existingUser.password = password;
      }

      saveUsers(users);
      ensureCellForLeaderUser(existingUser);

      if (session?.id === existingUser.id) {
        session = buildSessionFromUser(existingUser);
        saveSession(session);
      }

      resetAccessForm();
      setAccessFeedback("Acesso atualizado.");
      persistAndRender();

      if (!hasPermission("manageAccess")) {
        closeModal(accessModal);
      } else {
        renderAccessUsers();
      }
      return;
    }

    if (!password) {
      setAccessFeedback("Informe uma senha para o novo acesso.");
      return;
    }
    if (password !== confirmPassword) {
      setAccessFeedback("As senhas nao conferem.");
      return;
    }
    if (users.some((entry) => normalizeUsername(entry.username) === username)) {
      setAccessFeedback("Este usuario ja existe.");
      return;
    }

    const newUser = {
      id: createId(),
      name,
      username,
      password,
      role,
      assignedCellName: role === "leader" ? assignedCellName : "",
      createdAt: new Date().toISOString(),
    };
    users.push(newUser);
    saveUsers(users);
    ensureCellForLeaderUser(newUser);

    resetAccessForm();
    setAccessFeedback("Novo acesso criado.");
    persistAndRender();
    renderAccessUsers();
  });

  accessUsersList?.addEventListener("click", (event) => {
    const clickTarget = event.target;
    if (!(clickTarget instanceof Element)) {
      return;
    }

    const actionButton = clickTarget.closest("button[data-user-action]");
    if (!actionButton || !hasPermission("manageAccess")) {
      return;
    }

    const userId = String(actionButton.dataset.userId || "");
    const action = String(actionButton.dataset.userAction || "");
    const user = users.find((entry) => entry.id === userId);
    if (!user) {
      setAccessFeedback("Usuario nao encontrado.");
      return;
    }

    if (action === "edit") {
      fillAccessFormForEdit(user);
      setAccessFeedback("");
      return;
    }

    if (action === "delete") {
      if (session?.id === user.id) {
        setAccessFeedback("Nao e possivel excluir o usuario da sessao atual.");
        return;
      }
      if (roleHasPermission(user.role, "manageAccess") && countManagerUsers() <= 1) {
        setAccessFeedback("Nao e possivel excluir o ultimo usuario com acesso administrativo.");
        return;
      }

      const shouldDelete =
        typeof window !== "undefined" && typeof window.confirm === "function"
          ? window.confirm(`Deseja excluir o usuario ${user.name}?`)
          : true;
      if (!shouldDelete) {
        return;
      }

      users = users.filter((entry) => entry.id !== user.id);
      saveUsers(users);
      resetAccessForm();
      setAccessFeedback("Acesso excluido.");
      renderAccessUsers();
    }
  });

  cellForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!hasPermission("createCell")) {
      return;
    }

    const formData = new FormData(cellForm);

    const cell = {
      id: createId(),
      name: String(formData.get("name") || "").trim(),
      neighborhood: String(formData.get("neighborhood") || "").trim(),
      meetingDay: String(formData.get("meetingDay") || "").trim(),
      meetingTime: String(formData.get("meetingTime") || "").trim(),
      leader: String(formData.get("leader") || "").trim(),
      members: [],
      createdAt: new Date().toISOString(),
    };

    if (!cell.name || !cell.neighborhood || !cell.meetingDay || !cell.meetingTime || !cell.leader) {
      return;
    }

    state.cells.push(cell);
    persistAndRender();
    cellForm.reset();
    closeModal(cellModal);

    memberCellSelect.value = cell.id;
    reportCellSelect.value = cell.id;
    renderAttendanceList();
  });

  memberForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!hasPermission("manageMembers")) {
      return;
    }

    const formData = new FormData(memberForm);
    const cellId = String(formData.get("cellId") || "").trim();
    const memberName = String(formData.get("memberName") || "").trim();
    const memberPhone = String(formData.get("memberPhone") || "").trim();

    if (!cellId || !memberName) {
      return;
    }

    const cell = getCellById(cellId);
    if (!cell) {
      return;
    }

    cell.members.push({
      id: createId(),
      name: memberName,
      phone: memberPhone,
    });

    persistAndRender();
    memberForm.reset();
    closeModal(memberModal);
    memberCellSelect.value = cellId;

    if (reportCellSelect.value === cellId) {
      renderAttendanceList();
    }
  });

  reportCellSelect.addEventListener("change", () => {
    loadSavedReportIfExists();
    renderAttendanceList();
    renderLatestReport();
    const generateBtn = document.getElementById("generate-report-btn");
    if (generateBtn) generateBtn.textContent = "Gerar relatorio";
  });

  reportDateInput.addEventListener("change", () => {
    loadSavedReportIfExists();
    renderAttendanceList();
    renderLatestReport();
    const generateBtn = document.getElementById("generate-report-btn");
    if (generateBtn) generateBtn.textContent = "Gerar relatorio";
  });

  markAllAttendanceButton.addEventListener("click", () => {
    if (!hasPermission("submitReports")) {
      return;
    }
    attendanceList.querySelectorAll('input[name="presentMemberIds"]').forEach((checkbox) => {
      checkbox.checked = true;
    });
  });

  clearAttendanceButton.addEventListener("click", () => {
    if (!hasPermission("submitReports")) {
      return;
    }
    attendanceList.querySelectorAll('input[name="presentMemberIds"]').forEach((checkbox) => {
      checkbox.checked = false;
    });
  });

  reportForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!hasPermission("submitReports")) {
      return;
    }

    const formData = new FormData(reportForm);
    const cellId = String(formData.get("cellId") || "").trim();
    const date = String(formData.get("date") || "").trim();
    const leaders = String(formData.get("leaders") || "").trim();

    if (!cellId || !date || !leaders) {
      return;
    }

    if (session?.role === "leader" && !getAccessibleCells().some((cell) => cell.id === cellId)) {
      return;
    }

    const cell = getCellById(cellId);
    if (!cell) {
      return;
    }

    const visitorNames = parseLines(formData.get("visitorNames"));
    const visitorsCountInput = parseNonNegativeInt(formData.get("visitorsCount"));
    const reportData = {
      id: createId(),
      cellId,
      date,
      leaders,
      coLeaders: String(formData.get("coLeaders") || "").trim(),
      host: String(formData.get("host") || "").trim(),
      presentMemberIds: Array.from(new Set(formData.getAll("presentMemberIds").map((value) => String(value)))),
      visitorsCount: Math.max(visitorsCountInput, visitorNames.length),
      visitorNames,
      offering: parseNonNegativeNumber(formData.get("offering")),
      foods: String(formData.get("foods") || "Nao").trim(),
      snack: String(formData.get("snack") || "Nao").trim(),
      discipleship: String(formData.get("discipleship") || "Nao").trim(),
      visits: String(formData.get("visits") || "Nao").trim(),
      conversions: parseNonNegativeInt(formData.get("conversions")),
      createdAt: new Date().toISOString(),
    };

    upsertReport(reportData);
    state.lastReportId = reportData.id;
    persistAndRender();

    const presentIds = new Set(reportData.presentMemberIds);
    const presentCount = cell.members.filter((m) => presentIds.has(m.id)).length;
    const absentCount = cell.members.length - presentCount;
    reportOutput.value = buildReportText(reportData, cell);
    drawReportChart(presentCount, absentCount, reportData.visitorsCount);

    const generateBtn = document.getElementById("generate-report-btn");
    if (generateBtn) generateBtn.textContent = "Gerar novo relatorio";
  });

  cellsList.addEventListener("click", (event) => {
    const head = event.target.closest(".cell-head");
    if (!head) {
      return;
    }
    const card = head.closest(".cell-card");
    if (!card) {
      return;
    }
    const cellId = card.dataset.cellId;
    if (collapsedCellIds.has(cellId)) {
      collapsedCellIds.delete(cellId);
    } else {
      collapsedCellIds.add(cellId);
    }
    card.classList.toggle("collapsed");
  });

  copyReportButton.addEventListener("click", async () => {
    const text = reportOutput.value.trim();
    if (!text) {
      return;
    }

    const fallback = () => {
      reportOutput.focus();
      reportOutput.select();
      document.execCommand("copy");
    };

    try {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
        fallback();
      } else {
        await navigator.clipboard.writeText(text);
      }

      const original = copyReportButton.textContent;
      copyReportButton.textContent = "Copiado";
      setTimeout(() => {
        copyReportButton.textContent = original;
      }, 1200);
    } catch {
      fallback();
    }
  });
}

function initializeApp() {
  if (!session) {
    showAuthScreen();
    return;
  }

  ensureLeaderCellForSession();
  showAppScreen();
  render();
}

function showAuthScreen() {
  authScreen.hidden = false;
  appShell.hidden = true;
}

function showAppScreen() {
  authScreen.hidden = true;
  appShell.hidden = false;
}

function setAuthFeedback(message) {
  authFeedback.textContent = message || "";
}

function syncRegisterFormRoleFields() {
  if (!registerAssignedCellInput || !registerRoleSelect) {
    return;
  }

  const isLeader = String(registerRoleSelect.value || "leader") === "leader";
  registerAssignedCellInput.disabled = !isLeader;
  registerAssignedCellInput.required = isLeader;

  if (!isLeader) {
    registerAssignedCellInput.value = "";
  }
}

function setAccessFeedback(message) {
  if (!accessFeedback) {
    return;
  }
  accessFeedback.textContent = message || "";
}

function sanitizeManagedRole(value) {
  const role = String(value || "leader").toLowerCase().trim();
  return MANAGEABLE_ROLES.includes(role) ? role : "leader";
}

function syncAccessFormRoleFields() {
  if (!accessAssignedCellInput || !accessRoleSelect) {
    return;
  }

  const role = sanitizeManagedRole(accessRoleSelect.value);
  const isLeader = role === "leader";
  accessAssignedCellInput.disabled = !isLeader;
  accessAssignedCellInput.required = isLeader;
  if (!isLeader) {
    accessAssignedCellInput.value = "";
  }
}

function resetAccessForm() {
  if (!accessForm) {
    return;
  }

  accessForm.reset();
  accessForm.elements.namedItem("userId").value = "";
  if (accessRoleSelect) {
    accessRoleSelect.value = "leader";
  }
  syncAccessFormRoleFields();

  if (saveAccessButton) {
    saveAccessButton.textContent = "Salvar acesso";
  }
  if (cancelAccessEditButton) {
    cancelAccessEditButton.hidden = true;
  }
  setAccessFeedback("");
}

function fillAccessFormForEdit(user) {
  if (!accessForm || !user) {
    return;
  }

  accessForm.elements.namedItem("userId").value = user.id;
  accessForm.elements.namedItem("name").value = user.name || "";
  accessForm.elements.namedItem("username").value = user.username || "";
  accessForm.elements.namedItem("password").value = "";
  accessForm.elements.namedItem("confirmPassword").value = "";
  accessForm.elements.namedItem("role").value = sanitizeManagedRole(user.role);
  accessForm.elements.namedItem("assignedCellName").value = user.assignedCellName || "";
  syncAccessFormRoleFields();

  if (saveAccessButton) {
    saveAccessButton.textContent = "Atualizar acesso";
  }
  if (cancelAccessEditButton) {
    cancelAccessEditButton.hidden = false;
  }
}

function renderAccessUsers() {
  if (!accessUsersList) {
    return;
  }

  if (!hasPermission("manageAccess")) {
    accessUsersList.innerHTML = "";
    return;
  }

  const usersSorted = [...users].sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || ""), "pt-BR", { sensitivity: "base" })
  );

  if (!usersSorted.length) {
    accessUsersList.innerHTML = '<p class="empty">Nenhum acesso cadastrado.</p>';
    return;
  }

  const managerUsersCount = countManagerUsers();
  accessUsersList.innerHTML = usersSorted
    .map((user) => {
      const roleLabel = ROLE_LABELS[user.role] || user.role;
      const cellLabel = user.role === "leader" ? user.assignedCellName || "-" : "-";
      const isCurrentSessionUser = session?.id === user.id;
      const canDelete = !isCurrentSessionUser && !(roleHasPermission(user.role, "manageAccess") && managerUsersCount <= 1);

      return `
        <article class="access-user-item">
          <div class="access-user-main">
            <p class="access-user-name">${escapeHtml(user.name)}</p>
            <p class="access-user-role">${escapeHtml(roleLabel)}</p>
          </div>
          <p class="access-user-meta">Usuario: ${escapeHtml(user.username)}</p>
          <p class="access-user-meta">Celula vinculada: ${escapeHtml(cellLabel)}</p>
          <div class="access-user-actions">
            <button type="button" class="ghost-btn tiny-btn" data-user-action="edit" data-user-id="${escapeHtml(user.id)}">Editar</button>
            <button type="button" class="ghost-btn tiny-btn danger-btn" data-user-action="delete" data-user-id="${escapeHtml(user.id)}" ${
              canDelete ? "" : "disabled"
            }>Excluir</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function countManagerUsers() {
  return users.filter((user) => roleHasPermission(user.role, "manageAccess")).length;
}

function ensureCellForLeaderUser(user) {
  if (!user || user.role !== "leader") {
    return;
  }

  const assignedCellName = String(user.assignedCellName || "").trim();
  if (!assignedCellName) {
    return;
  }

  const existingCell = state.cells.find((cell) => normalizeName(cell.name) === normalizeName(assignedCellName));
  if (existingCell) {
    if (!existingCell.leader && user.name) {
      existingCell.leader = user.name;
      saveState(state);
    }
    return;
  }

  state.cells.push({
    id: createId(),
    name: assignedCellName,
    neighborhood: "Nao informado",
    meetingDay: "Nao definido",
    meetingTime: "20:00",
    leader: user.name || "Lider",
    members: [],
    createdAt: new Date().toISOString(),
  });
  saveState(state);
}

function persistAndRender() {
  saveState(state);
  render();
}

function render() {
  if (!session) {
    return;
  }

  renderAccessControl();
  renderStats();
  renderMemberCellOptions();
  renderReportCellOptions();
  applyInitialReportContext();
  renderCells();
  renderLatestReport();
  renderAccessUsers();
  autoOpenLeaderReportModal();
}

function renderAccessControl() {
  const roleLabel = ROLE_LABELS[session.role] || ROLE_LABELS.leader;
  accessBadge.textContent = `Perfil ativo: ${roleLabel}`;

  accessNote.textContent =
    session.role === "leader"
      ? `Acesso restrito para alimentar dados da celula ${session.assignedCellName || "-"}.`
      : hasPermission("manageAccess")
        ? "Acesso administrativo total liberado (equivalente ao Pastor)."
        : "Acesso conforme seu nivel de permissao.";

  if (statsSection) {
    statsSection.hidden = session.role === "leader";
  }

  if (createCellCard) {
    createCellCard.hidden = !hasPermission("createCell");
  }

  if (addMemberCard) {
    addMemberCard.hidden = session.role === "leader" || !hasPermission("manageMembers");
  }

  if (viewCellsCard) {
    viewCellsCard.hidden = !hasPermission("viewCells");
  }

  if (weeklyReportCard) {
    weeklyReportCard.hidden = !hasPermission("submitReports");
  }

  if (manageAccessCard) {
    manageAccessCard.hidden = !hasPermission("manageAccess");
  }
}
function renderStats() {
  totalCells.textContent = String(state.cells.length);
  const membersCount = state.cells.reduce((acc, cell) => acc + cell.members.length, 0);
  totalMembers.textContent = String(membersCount);
}

function renderMemberCellOptions() {
  const previousValue = memberCellSelect.value;
  if (state.cells.length === 0) {
    memberCellSelect.innerHTML = '<option value="">Cadastre uma celula primeiro</option>';
    memberCellSelect.disabled = true;
    return;
  }

  memberCellSelect.disabled = false;
  memberCellSelect.innerHTML =
    '<option value="">Selecione...</option>' +
    state.cells
      .map((cell) => `<option value="${cell.id}">${escapeHtml(cell.name)} - ${escapeHtml(cell.neighborhood)}</option>`)
      .join("");

  if (state.cells.some((cell) => cell.id === previousValue)) {
    memberCellSelect.value = previousValue;
  } else {
    memberCellSelect.value = "";
  }
}

function renderReportCellOptions() {
  const previousValue = reportCellSelect.value;
  const cellsForReport = getAccessibleCells();

  if (cellsForReport.length === 0) {
    reportCellSelect.innerHTML =
      session?.role === "leader"
        ? '<option value="">Sem celula vinculada a este lider</option>'
        : '<option value="">Cadastre uma celula primeiro</option>';
    reportCellSelect.disabled = true;
    return;
  }

  if (session?.role === "leader") {
    reportCellSelect.disabled = true;
    reportCellSelect.innerHTML = cellsForReport
      .map((cell) => `<option value="${cell.id}">${escapeHtml(cell.name)} - ${escapeHtml(cell.neighborhood)}</option>`)
      .join("");
    reportCellSelect.value = cellsForReport[0].id;
    return;
  }

  reportCellSelect.disabled = false;
  reportCellSelect.innerHTML =
    '<option value="">Selecione...</option>' +
    cellsForReport
      .map((cell) => `<option value="${cell.id}">${escapeHtml(cell.name)} - ${escapeHtml(cell.neighborhood)}</option>`)
      .join("");

  if (cellsForReport.some((cell) => cell.id === previousValue)) {
    reportCellSelect.value = previousValue;
  } else {
    reportCellSelect.value = cellsForReport[0].id;
  }
}

function renderCells() {
  const visibleCells = session?.role === "leader" ? getAccessibleCells() : state.cells;

  if (visibleCells.length === 0) {
    cellsList.innerHTML = '<p class="empty">Nenhuma celula cadastrada ainda.</p>';
    prevCellIds = new Set();
    return;
  }

  let newIndex = 0;
  cellsList.innerHTML = visibleCells
    .map((cell) => {
      const isNew = !prevCellIds.has(cell.id);
      const animStyle = isNew ? `animation-delay:${newIndex++ * 40}ms` : "animation:none";
      const membersMarkup =
        cell.members.length === 0
          ? '<p class="cell-meta">Sem membros cadastrados.</p>'
          : `<ul class="members">${cell.members
              .map((member) => {
                const phone = member.phone ? ` - ${escapeHtml(member.phone)}` : "";
                return `<li>${escapeHtml(member.name)}${phone}</li>`;
              })
              .join("")}</ul>`;

      return `
        <article class="cell-card${collapsedCellIds.has(cell.id) ? " collapsed" : ""}" data-cell-id="${cell.id}" style="${animStyle}">
          <div class="cell-head">
            <div>
              <h3 class="cell-name">${escapeHtml(cell.name)}</h3>
              <p class="cell-meta">${escapeHtml(cell.neighborhood)} | ${escapeHtml(cell.meetingDay)} as ${escapeHtml(cell.meetingTime)}</p>
              <p class="cell-meta">Lider: ${escapeHtml(cell.leader)}</p>
            </div>
            <span class="toggle-icon" aria-hidden="true">&#9662;</span>
          </div>
          <div class="cell-body">
            ${membersMarkup}
          </div>
        </article>
      `;
    })
    .join("");

  prevCellIds = new Set(visibleCells.map((cell) => cell.id));
}

function renderAttendanceList() {
  const cell = getCellById(reportCellSelect.value);
  if (!cell) {
    attendanceList.innerHTML = '<p class="attendance-empty">Selecione uma celula para marcar os presentes.</p>';
    return;
  }

  if (!cell.members.length) {
    attendanceList.innerHTML = '<p class="attendance-empty">Esta celula ainda nao tem membros cadastrados.</p>';
    return;
  }

  const report = findReport(cell.id, reportDateInput.value);
  const selectedMembers = new Set(report ? report.presentMemberIds : []);

  attendanceList.innerHTML = cell.members
    .map(
      (member) => `
      <label class="attendance-item">
        <input type="checkbox" name="presentMemberIds" value="${member.id}" ${selectedMembers.has(member.id) ? "checked" : ""} />
        <span>${escapeHtml(member.name)}</span>
      </label>
    `
    )
    .join("");
}

function renderLatestReport() {
  const reportsPool =
    session?.role === "leader"
      ? state.reports.filter((report) => getAccessibleCells().some((cell) => cell.id === report.cellId))
      : state.reports;

  if (!reportsPool.length) {
    reportOutput.value = "";
    drawReportChart(0, 0, 0);
    return;
  }

  const selected =
    reportsPool.find((report) => report.id === state.lastReportId) || reportsPool[reportsPool.length - 1];
  const cell = getCellById(selected.cellId);
  if (!cell) {
    reportOutput.value = "";
    drawReportChart(0, 0, 0);
    return;
  }

  reportOutput.value = buildReportText(selected, cell);

  const presentIds = new Set(selected.presentMemberIds);
  const present = cell.members.filter((m) => presentIds.has(m.id)).length;
  const absent = cell.members.length - present;
  drawReportChart(present, absent, selected.visitorsCount);
}

function loadSavedReportIfExists() {
  const cellId = reportCellSelect.value;
  const date = reportDateInput.value;
  const report = findReport(cellId, date);
  if (!report) {
    const cell = getCellById(cellId);
    if (cell && !reportForm.elements.namedItem("leaders").value) {
      reportForm.elements.namedItem("leaders").value = cell.leader || session?.name || "";
    }
    return;
  }

  reportForm.elements.namedItem("leaders").value = report.leaders;
  reportForm.elements.namedItem("coLeaders").value = report.coLeaders;
  reportForm.elements.namedItem("host").value = report.host;
  reportForm.elements.namedItem("visitorsCount").value = String(report.visitorsCount);
  reportForm.elements.namedItem("conversions").value = String(report.conversions);
  reportForm.elements.namedItem("offering").value = String(report.offering);
  reportForm.elements.namedItem("foods").value = report.foods;
  reportForm.elements.namedItem("snack").value = report.snack;
  reportForm.elements.namedItem("discipleship").value = report.discipleship;
  reportForm.elements.namedItem("visits").value = report.visits;
  reportForm.elements.namedItem("visitorNames").value = report.visitorNames.join("\n");
  state.lastReportId = report.id;
}

function upsertReport(reportData) {
  const existingIndex = state.reports.findIndex(
    (report) => report.cellId === reportData.cellId && report.date === reportData.date
  );
  if (existingIndex === -1) {
    state.reports.push(reportData);
    return;
  }

  const existing = state.reports[existingIndex];
  state.reports[existingIndex] = {
    ...reportData,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };
  reportData.id = existing.id;
}

function findReport(cellId, date) {
  if (!cellId || !date) {
    return null;
  }
  return state.reports.find((report) => report.cellId === cellId && report.date === date) || null;
}

function getCellById(cellId) {
  return state.cells.find((cell) => cell.id === cellId) || null;
}

function getAccessibleCells() {
  if (!session || session.role !== "leader") {
    return state.cells;
  }

  const assignedName = String(session.assignedCellName || "").trim();
  if (!assignedName) {
    return [];
  }

  return state.cells.filter((cell) => normalizeName(cell.name) === normalizeName(assignedName));
}

function autoOpenLeaderReportModal() {
  if (!session || session.role !== "leader" || hasAutoOpenedLeaderReport) {
    return;
  }

  hasAutoOpenedLeaderReport = true;
  if (!hasPermission("submitReports")) {
    return;
  }

  renderReportCellOptions();
  applyInitialReportContext();
  renderAttendanceList();
  renderLatestReport();
  openModal(reportModal);
}

function applyInitialReportContext() {
  if (!session || hasAppliedInitialReportContext) {
    return;
  }

  const cells = getAccessibleCells();
  if (!cells.length) {
    hasAppliedInitialReportContext = true;
    return;
  }

  if (!cells.some((cell) => cell.id === reportCellSelect.value)) {
    reportCellSelect.value = cells[0].id;
  }

  const latestForCell = [...state.reports].reverse().find((report) => report.cellId === reportCellSelect.value);
  if (!reportDateInput.value) {
    reportDateInput.value = latestForCell ? latestForCell.date : todayIsoDate();
  }

  loadSavedReportIfExists();
  renderAttendanceList();
  hasAppliedInitialReportContext = true;
}
function buildReportText(report, cell) {
  const leaderNames = parsePeople(report.leaders);
  const coLeaderNames = parsePeople(report.coLeaders);
  const presentIds = new Set(report.presentMemberIds);

  const members = cell.members;
  const presentMembers = members.filter((member) => presentIds.has(member.id));
  const absentMembers = members.filter((member) => !presentIds.has(member.id));

  const memberLines = members.length
    ? members
        .map((member, index) => `${index + 1}. ${member.name}${resolveRoleSuffix(member.name, leaderNames, coLeaderNames)}`)
        .join("\n")
    : "1. Sem membros cadastrados";

  const presentLines = presentMembers.length
    ? presentMembers.map((member, index) => `${index + 1}. ${member.name}`).join("\n")
    : "1. Nenhum presente marcado";

  const absentLines = absentMembers.length
    ? absentMembers.map((member, index) => `${index + 1}. ${member.name}`).join("\n")
    : "1. Nenhum faltou";

  const visitorsLines = report.visitorNames.length
    ? report.visitorNames.map((name, index) => `${index + 1}. ${name}`).join("\n")
    : "Sem nomes informados.";

  const totalPeople = presentMembers.length + report.visitorsCount;

  return `${ICONS.chartDown}RELATORIO DA CELULA *${cell.name.toUpperCase()}*${ICONS.blackHeart}
${ICONS.calendar} Data: ${formatDateForReport(report.date)}
${ICONS.people} Lideres: ${report.leaders || "-"}
${ICONS.handshake} Co-lideres: ${report.coLeaders || "-"}
${ICONS.house} Anfitriao(dono da casa): ${report.host || "-"}
---
${ICONS.clipboard} MEMBROS DA CELULA (${members.length})

${memberLines}

${ICONS.present} PRESENTES (${presentMembers.length})

${presentLines}

${ICONS.absent} FALTARAM (${absentMembers.length})

${absentLines}

${ICONS.visitors} VISITANTES (${report.visitorsCount})

${visitorsLines}

${ICONS.summary} RESUMO GERAL
${ICONS.people} Total de membros: ${members.length}
${ICONS.present} Presentes: ${presentMembers.length}
${ICONS.visitors} Visitantes: ${report.visitorsCount}
${ICONS.totalPeople} Total de pessoas: ${totalPeople}
${ICONS.offering} Oferta: ${formatOffering(report.offering)}
${ICONS.foods} Alimentos: ${report.foods}
${ICONS.snack} Lanche: ${report.snack}
${ICONS.discipleship} Discipulado: ${report.discipleship}
${ICONS.visits} Visitas: ${report.visits}
${ICONS.conversions} Conversoes: ${report.conversions}`;
}

function resolveRoleSuffix(memberName, leaderNames, coLeaderNames) {
  const normalized = normalizeName(memberName);
  if (leaderNames.has(normalized)) {
    return " ( Lider )";
  }
  if (coLeaderNames.has(normalized)) {
    return " ( Colider )";
  }
  return "";
}

function parsePeople(value) {
  const text = String(value || "")
    .replace(/\s+e\s+/gi, ",")
    .trim();

  return new Set(
    text
      .split(",")
      .map((name) => normalizeName(name))
      .filter(Boolean)
  );
}

function parseLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function formatDateForReport(dateInput) {
  const parts = String(dateInput || "").split("-");
  if (parts.length !== 3) {
    return dateInput || "-";
  }
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatOffering(value) {
  const amount = parseNonNegativeNumber(value);
  if (Number.isInteger(amount)) {
    return String(amount);
  }
  return amount.toFixed(2).replace(".", ",");
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function parseNonNegativeInt(value) {
  const number = Number.parseInt(String(value || "0"), 10);
  if (!Number.isFinite(number) || number < 0) {
    return 0;
  }
  return number;
}

function parseNonNegativeNumber(value) {
  const number = Number(String(value || "0"));
  if (!Number.isFinite(number) || number < 0) {
    return 0;
  }
  return number;
}

function roleHasPermission(role, permission) {
  const allowedRoles = ROLE_PERMISSIONS[permission] || [];
  return allowedRoles.includes(String(role || ""));
}

function hasPermission(permission) {
  if (!session) {
    return false;
  }
  return roleHasPermission(session.role, permission);
}

function openModal(modal) {
  if (!modal) {
    return;
  }
  closeAllModals();
  modal.hidden = false;
  document.body.classList.add("modal-open");
  const firstInput = modal.querySelector("input, select, textarea");
  firstInput?.focus();
}

function closeModal(modal) {
  if (!modal) {
    return;
  }
  modal.hidden = true;
  const hasAnyOpenModal = [cellModal, memberModal, cellsModal, reportModal, accessModal].some(
    (item) => item && !item.hidden
  );
  if (!hasAnyOpenModal) {
    document.body.classList.remove("modal-open");
  }
}

function closeAllModals() {
  [cellModal, memberModal, cellsModal, reportModal, accessModal].forEach((modal) => {
    if (modal) {
      modal.hidden = true;
    }
  });
  document.body.classList.remove("modal-open");
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
    if (!user) {
      return null;
    }

    return buildSessionFromUser(user);
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

function loadUsers() {
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((entry) => normalizeUser(entry)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function saveUsers(nextUsers) {
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(nextUsers));
}

function normalizeUser(user) {
  if (!user || typeof user !== "object") {
    return null;
  }

  const name = String(user.name || "").trim();
  const username = normalizeUsername(user.username);
  const password = String(user.password || "");
  if (!name || !username || !password) {
    return null;
  }

  const role = sanitizeManagedRole(user.role);
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
  if (!users.some((entry) => normalizeUsername(entry.username) === "admin")) {
    users.push({
      id: "admin-root",
      name: "Administrador",
      username: "admin",
      password: "123456",
      role: "admin",
      assignedCellName: "",
      createdAt: new Date().toISOString(),
    });
  }

  if (!users.some((entry) => normalizeUsername(entry.username) === "lider.cinza")) {
    users.push({
      id: "leader-cinza",
      name: "Lider da Celula Cinza",
      username: "lider.cinza",
      password: "123456",
      role: "leader",
      assignedCellName: "Cinza",
      createdAt: new Date().toISOString(),
    });
  }

  saveUsers(users);
}

function todayIsoDate() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function loadState() {
  const fallback = {
    cells: [],
    reports: [],
    lastReportId: null,
  };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return fallback;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return fallback;
    }

    const cells = Array.isArray(parsed.cells)
      ? parsed.cells.map((cell) => normalizeCell(cell)).filter(Boolean)
      : [];
    const reports = Array.isArray(parsed.reports)
      ? parsed.reports.map((report) => normalizeReport(report)).filter(Boolean)
      : [];
    const lastReportId = typeof parsed.lastReportId === "string" ? parsed.lastReportId : null;

    return {
      cells,
      reports,
      lastReportId,
    };
  } catch {
    return fallback;
  }
}

function saveState(nextState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
}

function normalizeCell(cell) {
  if (!cell || typeof cell !== "object") {
    return null;
  }

  return {
    id: String(cell.id || createId()),
    name: String(cell.name || "").trim(),
    neighborhood: String(cell.neighborhood || "Nao informado").trim(),
    meetingDay: String(cell.meetingDay || "Nao definido").trim(),
    meetingTime: String(cell.meetingTime || "20:00").trim(),
    leader: String(cell.leader || "").trim(),
    members: Array.isArray(cell.members)
      ? cell.members
          .map((member) => {
            if (!member || typeof member !== "object") {
              return null;
            }
            const name = String(member.name || "").trim();
            if (!name) {
              return null;
            }
            return {
              id: String(member.id || createId()),
              name,
              phone: String(member.phone || "").trim(),
            };
          })
          .filter(Boolean)
      : [],
    createdAt: cell.createdAt || new Date().toISOString(),
  };
}

function normalizeReport(report) {
  if (!report || typeof report !== "object") {
    return null;
  }

  return {
    id: String(report.id || createId()),
    cellId: String(report.cellId || "").trim(),
    date: String(report.date || "").trim(),
    leaders: String(report.leaders || "").trim(),
    coLeaders: String(report.coLeaders || "").trim(),
    host: String(report.host || "").trim(),
    presentMemberIds: Array.isArray(report.presentMemberIds)
      ? report.presentMemberIds.map((id) => String(id)).filter(Boolean)
      : [],
    visitorsCount: parseNonNegativeInt(report.visitorsCount),
    visitorNames: Array.isArray(report.visitorNames)
      ? report.visitorNames.map((name) => String(name).trim()).filter(Boolean)
      : [],
    offering: parseNonNegativeNumber(report.offering),
    foods: String(report.foods || "Nao").trim(),
    snack: String(report.snack || "Nao").trim(),
    discipleship: String(report.discipleship || "Nao").trim(),
    visits: String(report.visits || "Nao").trim(),
    conversions: parseNonNegativeInt(report.conversions),
    createdAt: report.createdAt || new Date().toISOString(),
    updatedAt: report.updatedAt || null,
  };
}

function ensureLeaderCellForSession() {
  if (!session || session.role !== "leader") {
    return;
  }

  const assignedCellName = String(session.assignedCellName || "").trim();
  if (!assignedCellName) {
    return;
  }

  const existing = state.cells.find((cell) => normalizeName(cell.name) === normalizeName(assignedCellName));
  if (existing) {
    if (!existing.leader && session.name) {
      existing.leader = session.name;
      saveState(state);
    }
    return;
  }

  state.cells.push({
    id: createId(),
    name: assignedCellName,
    neighborhood: "Nao informado",
    meetingDay: "Nao definido",
    meetingTime: "20:00",
    leader: session.name || "Lider",
    members: [],
    createdAt: new Date().toISOString(),
  });
  saveState(state);
}

function seedInitialDataIfEmpty() {
  const mkMember = (name) => ({ id: createId(), name, phone: "" });

  const cellDefs = [
    {
      name: "Preta",
      meetingDay: "Terca",
      leader: "Sabrina e Filipe",
      members: [
        "Filipe", "Sabrina", "Mikaelly", "Pedro", "Vitor", "Guilherme", "Ana",
        "Eliel", "Ian Vieira", "Thifanny", "Danilo", "Soraia", "Josiel",
        "Jonathan", "Mikael", "Deivid", "Rebeca", "Luiz Henrique", "Leo",
        "Leticia", "Faby", "Andrey", "Dryka", "Sarah",
      ],
    },
    {
      name: "Vinho",
      meetingDay: "Quinta",
      leader: "Jonattham e Marilene",
      members: [
        "Jonattham", "Marilene", "Mikaelly", "Marcos", "Sabrina", "Gabriel",
        "Marilda", "Estefanny", "Madalena", "Silvia", "Adriana", "Francisco", "Alzira",
      ],
    },
    {
      name: "Cinza",
      meetingDay: "Quinta",
      leader: "Jander e Aline",
      members: [
        "Jander", "Aline", "Amanda Rayssa", "Amanda", "Daniel", "Luiz",
        "Manu", "Ray", "Mayara", "Ana", "Rebeca", "Liz", "Mariana",
      ],
    },
    {
      name: "Logos",
      meetingDay: "Segunda",
      leader: "Thiago e Augusto",
      members: ["Thiago", "Augusto", "Rian", "Gustavo", "Leticia", "Mariana", "Jenny", "Phedro", "Raquel"],
    },
    {
      name: "Alex e Ariane",
      meetingDay: "Terca",
      leader: "Alex e Ariane",
      members: [
        "Ariane", "Alex", "Karla", "Lara", "Vera", "Fiorella", "Luzimar",
        "Murilo", "Karlen", "Missikely", "Dafynie", "Mayara", "Alessandro",
      ],
    },
    {
      name: "Karina e Jhennifer",
      meetingDay: "Terca",
      leader: "Karina e Jhennifer",
      members: [
        "Karina", "Jhennifer", "Lucas", "Renata", "Antonio", "Nazare",
        "Rogerio", "Fabiana", "Eva", "Adlaine", "Renan", "Elvis", "Aparecida",
        "Flavio", "Alice", "Gabriel", "Vitoria", "Iasmin", "Juliana", "Rose",
      ],
    },
    {
      name: "Visão de Águia",
      meetingDay: "Segunda",
      leader: "Chirlene",
      members: ["Chirlene", "Kelma", "Marta", "Denise", "Viviane", "Mery", "Geisy", "Luiz", "Osmar", "Ezequiel", "Ney"],
    },
    {
      name: "Verde",
      meetingDay: "Terca",
      leader: "Evelyn",
      members: [
        "Evelyn", "Raiane", "Alice", "Hatos", "Enzo", "Helloany", "Daniel",
        "Ana Lu", "Gaby", "Sushinie", "Jefferson", "Jonas", "Shelcy", "Bruno", "Kamila", "Danilo",
      ],
    },
    {
      name: "Ekballo",
      meetingDay: "Terca",
      leader: "Vitória e Pedro",
      members: [
        "Igor", "Julya Maria", "Maria Eduarda", "Pedro", "Vitoria", "Wallafy",
        "Yasmin", "Vitor Gabriel", "Manu", "Lindsay", "Ana Clara", "Fernanda",
      ],
    },
    {
      name: "Peregrinos",
      meetingDay: "Quinta",
      leader: "Isabella e Sarah",
      members: ["Isabella", "Sarah", "Roberto", "Erick", "Isabelle", "Willian", "Elias", "Eloah"],
    },
  ];

  const now = new Date().toISOString();

  let stateChanged = false;
  for (const def of cellDefs) {
    if (!state.cells.some((c) => normalizeName(c.name) === normalizeName(def.name))) {
      state.cells.push({
        id: createId(),
        name: def.name,
        neighborhood: "Nao informado",
        meetingDay: def.meetingDay,
        meetingTime: "20:00",
        leader: def.leader,
        members: def.members.map(mkMember),
        createdAt: now,
      });
      stateChanged = true;
    }
  }

  const pretaCell = state.cells.find((c) => normalizeName(c.name) === "preta");
  if (pretaCell && state.reports.length === 0) {
    const presentNames = [
      "Filipe", "Sabrina", "Mikael", "Ian Vieira", "Eliel", "Deivid",
      "Jonathan", "Leo", "Leticia", "Vitor", "Guilherme", "Dryka", "Soraia", "Thifanny", "Mikaelly", "Ana",
    ];
    const presentMemberIds = pretaCell.members
      .filter((member) => presentNames.some((name) => normalizeName(name) === normalizeName(member.name)))
      .map((member) => member.id);
    const initialReport = {
      id: createId(),
      cellId: pretaCell.id,
      date: "2026-02-24",
      leaders: "Sabrina e Filipe",
      coLeaders: "Ian Vieira",
      host: "Salipe",
      presentMemberIds,
      visitorsCount: 5,
      visitorNames: [],
      offering: 0,
      foods: "Nao",
      snack: "Nao",
      discipleship: "Sim",
      visits: "Sim",
      conversions: 0,
      createdAt: new Date("2026-02-24T22:00:00").toISOString(),
    };
    state.reports.push(initialReport);
    state.lastReportId = initialReport.id;
    stateChanged = true;
  }

  if (stateChanged) saveState(state);

  const leaderDefs = [
    { name: "Sabrina",   username: "sabrina.preta",        assignedCellName: "Preta" },
    { name: "Filipe",    username: "filipe.preta",          assignedCellName: "Preta" },
    { name: "Jonattham", username: "jonattham.vinho",       assignedCellName: "Vinho" },
    { name: "Marilene",  username: "marilene.vinho",        assignedCellName: "Vinho" },
    { name: "Jander",    username: "jander.cinza",          assignedCellName: "Cinza" },
    { name: "Aline",     username: "aline.cinza",           assignedCellName: "Cinza" },
    { name: "Thiago",    username: "thiago.logos",          assignedCellName: "Logos" },
    { name: "Augusto",   username: "augusto.logos",         assignedCellName: "Logos" },
    { name: "Alex",      username: "alex.celula",           assignedCellName: "Alex e Ariane" },
    { name: "Ariane",    username: "ariane.celula",         assignedCellName: "Alex e Ariane" },
    { name: "Karina",    username: "karina.celula",         assignedCellName: "Karina e Jhennifer" },
    { name: "Jhennifer", username: "jhennifer.celula",      assignedCellName: "Karina e Jhennifer" },
    { name: "Chirlene",  username: "chirlene.aguia",        assignedCellName: "Visão de Águia" },
    { name: "Evelyn",    username: "evelyn.verde",          assignedCellName: "Verde" },
    { name: "Vitória",   username: "vitoria.ekballo",       assignedCellName: "Ekballo" },
    { name: "Pedro",     username: "pedro.ekballo",         assignedCellName: "Ekballo" },
    { name: "Isabella",  username: "isabella.peregrinos",   assignedCellName: "Peregrinos" },
    { name: "Sarah",     username: "sarah.peregrinos",      assignedCellName: "Peregrinos" },
  ];

  for (const def of leaderDefs) {
    if (!users.some((u) => normalizeUsername(u.username) === def.username)) {
      users.push({
        id: createId(),
        name: def.name,
        username: def.username,
        password: "123456",
        role: "leader",
        assignedCellName: def.assignedCellName,
        createdAt: now,
        updatedAt: null,
      });
    }
  }

  const coordinatorDefs = [
    { name: "Irmã Neta", username: "irma.neta" },
    { name: "Anelia",    username: "anelia"     },
    { name: "Adelaine",  username: "adelaine"   },
    { name: "Bruno",     username: "bruno"      },
    { name: "Gabriel",   username: "gabriel"    },
  ];

  for (const def of coordinatorDefs) {
    if (!users.some((u) => normalizeUsername(u.username) === def.username)) {
      users.push({
        id: createId(),
        name: def.name,
        username: def.username,
        password: "123456",
        role: "coordinator",
        assignedCellName: "",
        createdAt: now,
        updatedAt: null,
      });
    }
  }

  saveUsers(users);
}

function drawReportChart(present, absent, visitors) {
  const wrap = document.getElementById("report-chart-wrap");
  const canvas = document.getElementById("report-chart");
  const legend = document.getElementById("report-chart-legend");
  if (!wrap || !canvas || !legend) {
    return;
  }

  const total = present + absent + visitors;
  if (total === 0) {
    wrap.hidden = true;
    return;
  }

  wrap.hidden = false;

  const slices = [
    { value: present, color: "#2d8a5e", label: "Presentes" },
    { value: absent, color: "#c0392b", label: "Faltaram" },
    { value: visitors, color: "#2980b9", label: "Visitantes" },
  ];

  const ctx = canvas.getContext("2d");
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const r = cx - 16;
  const inner = r * 0.52;

  ctx.clearRect(0, 0, size, size);

  let startAngle = -Math.PI / 2;
  for (const slice of slices) {
    if (slice.value === 0) {
      continue;
    }
    const angle = (slice.value / total) * 2 * Math.PI;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, startAngle, startAngle + angle);
    ctx.closePath();
    ctx.fillStyle = slice.color;
    ctx.fill();
    startAngle += angle;
  }

  ctx.beginPath();
  ctx.arc(cx, cy, inner, 0, 2 * Math.PI);
  ctx.fillStyle = "#f7f8f0";
  ctx.fill();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#1f2a24";
  ctx.font = "bold 22px sans-serif";
  ctx.fillText(String(total), cx, cy - 10);
  ctx.font = "12px sans-serif";
  ctx.fillStyle = "#4d5d54";
  ctx.fillText("pessoas", cx, cy + 12);

  legend.innerHTML = slices
    .filter((s) => s.value > 0)
    .map(
      (s) => `
      <span class="chart-legend-item">
        <span class="chart-legend-dot" style="background:${s.color}"></span>
        ${escapeHtml(s.label)}: <strong>${s.value}</strong>
      </span>
    `
    )
    .join("");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
