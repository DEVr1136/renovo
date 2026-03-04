const STORAGE_KEY = "renovo_celulas_v1";
const SESSION_STORAGE_KEY = "renovo_session_v1";
const USERS_STORAGE_KEY = "renovo_users_v1";
const MANAGEABLE_ROLES = ["leader", "coordinator", "pastor", "admin"];

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
const generateReportButton = document.getElementById("generate-report-btn");
const cellsList = document.getElementById("cells-list");
const totalCells = document.getElementById("total-cells");
const totalMembers = document.getElementById("total-members");
const reportDateInput = reportForm.elements.namedItem("date");
const statsSection = document.querySelector(".stats");
const reportModeNote = document.getElementById("report-mode-note");
const reportHistoryList = document.getElementById("report-history-list");
const reportHistoryCount = document.getElementById("report-history-count");
const cellAverageChart = document.getElementById("cell-average-chart");
const cellAverageLegend = document.getElementById("cell-average-legend");
const overallAverageChart = document.getElementById("overall-average-chart");
const overallAverageLegend = document.getElementById("overall-average-legend");

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
const REPORT_AVERAGE_DAYS = 180;

const ROLE_PERMISSIONS = {
  createCell: ["coordinator", "pastor", "admin"],
  manageMembers: ["coordinator", "pastor", "admin"],
  submitReports: ["leader", "admin"],
  viewReports: ["leader", "coordinator", "pastor", "admin"],
  viewCells: ["coordinator", "pastor", "admin"],
  deleteCell: ["admin"],
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
    if (!hasPermission("viewReports")) {
      return;
    }
    renderReportCellOptions();
    applyInitialReportContext();
    loadSavedReportIfExists();
    renderAttendanceList();
    renderLatestReport();
    renderReportHistory();
    applyReportMode();
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
    renderReportHistory();
    if (generateReportButton) {
      generateReportButton.textContent = "Gerar relatorio";
    }
    applyReportMode();
  });

  reportDateInput.addEventListener("change", () => {
    loadSavedReportIfExists();
    renderAttendanceList();
    renderLatestReport();
    renderReportHistory();
    if (generateReportButton) {
      generateReportButton.textContent = "Gerar relatorio";
    }
    applyReportMode();
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

    if (generateReportButton && generateReportButton.textContent === "Gerar novo relatorio") {
      const currentCellId = reportCellSelect.value;
      reportForm.reset();
      reportCellSelect.value = currentCellId;
      reportDateInput.value = todayIsoDate();
      renderAttendanceList();
      reportOutput.value = "";
      drawReportChart(0, 0, 0);
      renderReportHistory();
      generateReportButton.textContent = "Gerar relatorio";
      return;
    }

    if (!hasPermission("submitReports")) {
      return;
    }

    const formData = new FormData(reportForm);
    const cellId = String(formData.get("cellId") || reportCellSelect.value || "").trim();
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
    renderReportHistory();
    drawAverageCharts();

    if (generateReportButton) {
      generateReportButton.textContent = "Gerar novo relatorio";
    }
  });

  reportHistoryList?.addEventListener("click", (event) => {
    const clickTarget = event.target;
    if (!(clickTarget instanceof Element)) {
      return;
    }

    const itemButton = clickTarget.closest("button[data-report-id]");
    if (!itemButton) {
      return;
    }

    const reportId = String(itemButton.dataset.reportId || "");
    const selected = state.reports.find((report) => report.id === reportId);
    if (!selected) {
      return;
    }

    if (reportCellSelect.value !== selected.cellId) {
      reportCellSelect.value = selected.cellId;
      loadSavedReportIfExists();
      renderAttendanceList();
    }

    reportDateInput.value = selected.date;
    state.lastReportId = selected.id;
    loadSavedReportIfExists();
    renderAttendanceList();
    renderLatestReport();
    renderReportHistory();
    applyReportMode();
  });

  cellsList.addEventListener("click", (event) => {
    const clickTarget = event.target;
    if (!(clickTarget instanceof Element)) {
      return;
    }

    const actionButton = clickTarget.closest("button[data-cell-action]");
    if (actionButton) {
      const action = String(actionButton.dataset.cellAction || "");
      if (action === "delete") {
        if (!hasPermission("deleteCell")) {
          return;
        }

        const cellId = String(actionButton.dataset.cellId || "");
        const cell = getCellById(cellId);
        if (!cell) {
          return;
        }

        const linkedReports = state.reports.filter((report) => report.cellId === cell.id).length;
        const linkedLeaders = users.filter(
          (user) => user.role === "leader" && normalizeName(user.assignedCellName) === normalizeName(cell.name)
        ).length;

        const shouldDelete =
          typeof window !== "undefined" && typeof window.confirm === "function"
            ? window.confirm(
                `Excluir a celula ${cell.name}?\\nRelatorios vinculados: ${linkedReports}\\nLideres vinculados: ${linkedLeaders}`
              )
            : true;

        if (!shouldDelete) {
          return;
        }

        const typedCellName =
          typeof window !== "undefined" && typeof window.prompt === "function"
            ? window.prompt(`Digite o nome da celula para confirmar a exclusao:\\n${cell.name}`, "")
            : null;

        if (typedCellName === null) {
          return;
        }

        if (normalizeName(typedCellName) !== normalizeName(cell.name)) {
          if (typeof window !== "undefined" && typeof window.alert === "function") {
            window.alert("Nome da celula diferente. Exclusao cancelada.");
          }
          return;
        }

        deleteCellAndRelated(cell.id);
        collapsedCellIds.delete(cell.id);
        persistAndRender();
      }
      return;
    }

    const head = clickTarget.closest(".cell-head");
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
  loadSavedReportIfExists();
  renderAttendanceList();
  renderLatestReport();
  renderReportHistory();
  applyReportMode();
  renderAccessUsers();
  autoOpenLeaderReportModal();
}

function renderAccessControl() {
  const roleLabel = ROLE_LABELS[session.role] || ROLE_LABELS.leader;
  const isPastorJudson = session.role === "pastor" && normalizeUsername(session.username) === "pastor.judson";
  accessBadge.textContent = isPastorJudson ? "Perfil ativo: Pastor Judson" : `Perfil ativo: ${roleLabel}`;
  const isLeader = session.role === "leader";

  accessNote.textContent =
    isLeader
      ? `Acesso restrito para alimentar dados da celula ${session.assignedCellName || "-"}.`
      : isPastorJudson
        ? `Leitura de relatorios + gestao completa de acessos (ultimos ${REPORT_AVERAGE_DAYS} dias).`
      : session.role === "coordinator"
        ? `Acesso de coordenador: leitura de relatorios, historico e graficos (ultimos ${REPORT_AVERAGE_DAYS} dias).`
      : hasPermission("manageAccess")
        ? "Acesso administrativo total liberado (equivalente ao Pastor)."
        : "Acesso conforme seu nivel de permissao.";

  if (statsSection) {
    statsSection.hidden = isLeader;
  }

  if (isLeader) {
    if (createCellCard) {
      createCellCard.hidden = true;
    }
    if (addMemberCard) {
      addMemberCard.hidden = true;
    }
    if (viewCellsCard) {
      viewCellsCard.hidden = true;
    }
    if (manageAccessCard) {
      manageAccessCard.hidden = true;
    }
    if (weeklyReportCard) {
      weeklyReportCard.hidden = false;
    }
    return;
  }

  if (createCellCard) {
    createCellCard.hidden = !hasPermission("createCell");
  }

  if (addMemberCard) {
    addMemberCard.hidden = !hasPermission("manageMembers");
  }

  if (viewCellsCard) {
    viewCellsCard.hidden = !hasPermission("viewCells");
  }

  if (weeklyReportCard) {
    weeklyReportCard.hidden = !hasPermission("viewReports");
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
  const canDeleteCell = hasPermission("deleteCell");

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
      const actionsMarkup = canDeleteCell
        ? `<div class="cell-actions">
             <button
               type="button"
               class="ghost-btn tiny-btn danger-btn"
               data-cell-action="delete"
               data-cell-id="${escapeHtml(cell.id)}"
             >Excluir celula</button>
           </div>`
        : "";

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
            ${actionsMarkup}
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
  const disableAttendance = isReadOnlyReportRole() || !hasPermission("submitReports");

  attendanceList.innerHTML = cell.members
    .map(
      (member) => `
      <label class="attendance-item">
        <input
          type="checkbox"
          name="presentMemberIds"
          value="${member.id}"
          ${selectedMembers.has(member.id) ? "checked" : ""}
          ${disableAttendance ? "disabled" : ""}
        />
        <span>${escapeHtml(member.name)}</span>
      </label>
    `
    )
    .join("");
}

function renderLatestReport() {
  const reportsPool = getVisibleReportsPool();

  if (!reportsPool.length) {
    reportOutput.value = "";
    drawReportChart(0, 0, 0);
    drawAverageCharts();
    return;
  }

  const selected = getSelectedReportFromContext(reportsPool);
  const cell = getCellById(selected.cellId);
  if (!cell) {
    reportOutput.value = "";
    drawReportChart(0, 0, 0);
    drawAverageCharts();
    return;
  }

  state.lastReportId = selected.id;
  if (reportDateInput.value !== selected.date) {
    reportDateInput.value = selected.date;
    loadSavedReportIfExists();
  }

  reportOutput.value = buildReportText(selected, cell);
  const stats = getReportStats(selected);
  const present = stats.present;
  const absent = stats.absent;
  drawReportChart(present, absent, selected.visitorsCount);
  drawAverageCharts();
}

function getVisibleReportsPool() {
  if (session?.role === "leader") {
    const accessibleIds = new Set(getAccessibleCells().map((cell) => cell.id));
    return state.reports.filter((report) => accessibleIds.has(report.cellId));
  }
  return state.reports.slice();
}

function getSelectedReportFromContext(reportsPool) {
  const cellId = reportCellSelect.value;
  const date = reportDateInput.value;
  const sortedPool = reportsPool.slice().sort(compareReportsDesc);

  if (cellId && date) {
    const exact = sortedPool.find((report) => report.cellId === cellId && report.date === date);
    if (exact) {
      return exact;
    }
  }

  if (cellId) {
    const latestForCell = sortedPool.find((report) => report.cellId === cellId);
    if (latestForCell) {
      return latestForCell;
    }
  }

  const byLastId = sortedPool.find((report) => report.id === state.lastReportId);
  if (byLastId) {
    return byLastId;
  }

  return sortedPool[0];
}

function compareReportsDesc(a, b) {
  const aDate = parseReportDateToTime(a?.date);
  const bDate = parseReportDateToTime(b?.date);
  if (bDate !== aDate) {
    return bDate - aDate;
  }
  const aCreated = new Date(a?.createdAt || 0).getTime();
  const bCreated = new Date(b?.createdAt || 0).getTime();
  return bCreated - aCreated;
}

function parseReportDateToTime(reportDate) {
  const text = String(reportDate || "").trim();
  if (!text) {
    return 0;
  }
  const parsed = new Date(`${text}T00:00:00`).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function getReportStats(report) {
  const cell = getCellById(report?.cellId);
  const present = Array.isArray(report?.presentMemberIds) ? report.presentMemberIds.length : 0;
  const membersCount = cell?.members?.length || present;
  const absent = Math.max(membersCount - present, 0);
  const visitors = parseNonNegativeInt(report?.visitorsCount);
  return {
    present,
    absent,
    visitors,
    totalPeople: present + visitors,
    membersCount,
  };
}

function loadSavedReportIfExists() {
  const cellId = reportCellSelect.value;
  const date = reportDateInput.value;
  const report = findReport(cellId, date);
  if (!report) {
    const cell = getCellById(cellId);
    const leadersField = reportForm.elements.namedItem("leaders");
    if (cell && leadersField && !leadersField.value) {
      leadersField.value = cell.leader || session?.name || "";
    }
    return;
  }

  setFormFieldValue(reportForm, "leaders", report.leaders);
  setFormFieldValue(reportForm, "coLeaders", report.coLeaders);
  setFormFieldValue(reportForm, "host", report.host);
  setFormFieldValue(reportForm, "visitorsCount", String(report.visitorsCount));
  setFormFieldValue(reportForm, "conversions", String(report.conversions));
  setFormFieldValue(reportForm, "offering", String(report.offering));
  setFormFieldValue(reportForm, "foods", report.foods);
  setFormFieldValue(reportForm, "snack", report.snack);
  setFormFieldValue(reportForm, "discipleship", report.discipleship);
  setFormFieldValue(reportForm, "visits", report.visits);
  setFormFieldValue(reportForm, "visitorNames", report.visitorNames.join("\n"));
  state.lastReportId = report.id;
}

function setFormFieldValue(form, name, value) {
  const field = form?.elements?.namedItem(name);
  if (!field || !("value" in field)) {
    return;
  }
  field.value = value;
}

function isReadOnlyReportRole() {
  return session?.role === "coordinator" || session?.role === "pastor";
}

function applyReportMode() {
  const readOnly = isReadOnlyReportRole();
  const reportCellField = reportForm?.elements?.namedItem("cellId");
  const reportDateField = reportForm?.elements?.namedItem("date");
  const fieldsToDisable = [
    "leaders",
    "coLeaders",
    "host",
    "visitorsCount",
    "foods",
    "snack",
    "discipleship",
    "visits",
    "visitorNames",
    "offering",
    "conversions",
  ];

  reportForm?.classList.toggle("readonly", readOnly);
  if (reportModeNote) {
    reportModeNote.hidden = !readOnly;
    reportModeNote.textContent = readOnly
      ? "Modo leitura (Coordenador/Pastor): relatorios sem edicao, com historico e medias de 180 dias."
      : "";
  }

  if (reportCellField && "disabled" in reportCellField) {
    reportCellField.disabled = session?.role === "leader";
  }
  if (reportDateField && "disabled" in reportDateField) {
    reportDateField.disabled = readOnly;
  }

  for (const fieldName of fieldsToDisable) {
    const field = reportForm?.elements?.namedItem(fieldName);
    if (!field || !("disabled" in field)) {
      continue;
    }
    field.disabled = readOnly;
  }

  attendanceList
    ?.querySelectorAll('input[name="presentMemberIds"]')
    .forEach((checkbox) => (checkbox.disabled = readOnly || !hasPermission("submitReports")));

  if (markAllAttendanceButton) {
    markAllAttendanceButton.hidden = readOnly || !hasPermission("submitReports");
  }
  if (clearAttendanceButton) {
    clearAttendanceButton.hidden = readOnly || !hasPermission("submitReports");
  }
  if (generateReportButton) {
    generateReportButton.hidden = readOnly || !hasPermission("submitReports");
  }
}

function renderReportHistory() {
  if (!reportHistoryList || !reportHistoryCount) {
    return;
  }

  const selectedCellId = reportCellSelect.value;
  const reports = getVisibleReportsPool()
    .filter((report) => !selectedCellId || report.cellId === selectedCellId)
    .sort(compareReportsDesc);

  reportHistoryCount.textContent = `${reports.length} registro(s)`;

  if (!reports.length) {
    reportHistoryList.innerHTML = '<p class="attendance-empty">Nenhum relatorio encontrado para esta celula.</p>';
    return;
  }

  const activeId =
    getSelectedReportFromContext(reports)?.id ||
    state.lastReportId ||
    "";

  reportHistoryList.innerHTML = reports
    .map((report) => {
      const stats = getReportStats(report);
      const isActive = report.id === activeId;
      return `
        <button
          type="button"
          class="history-item${isActive ? " active" : ""}"
          data-report-id="${escapeHtml(report.id)}"
        >
          <strong>${escapeHtml(formatDateForReport(report.date))}</strong>
          <small>Presentes ${stats.present} | Faltaram ${stats.absent} | Visitantes ${stats.visitors}</small>
        </button>
      `;
    })
    .join("");
}

function drawAverageCharts() {
  const selectedCellId = reportCellSelect.value;
  const visibleReports = getVisibleReportsPool();
  const cutoffTime = getCutoffTimeForDays(REPORT_AVERAGE_DAYS);
  const within180 = visibleReports.filter((report) => parseReportDateToTime(report.date) >= cutoffTime);
  const cellReports = within180.filter((report) => report.cellId === selectedCellId);

  const cellAverage = computeAverageStats(cellReports);
  const overallAverage = computeAverageStats(within180);

  drawMiniDonutChart(cellAverageChart, cellAverageLegend, cellAverage.present, cellAverage.absent, cellAverage.visitors);
  drawMiniDonutChart(
    overallAverageChart,
    overallAverageLegend,
    overallAverage.present,
    overallAverage.absent,
    overallAverage.visitors
  );
}

function getCutoffTimeForDays(days) {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);
  return start.getTime();
}

function computeAverageStats(reports) {
  if (!reports.length) {
    return { present: 0, absent: 0, visitors: 0 };
  }

  const sum = reports.reduce(
    (acc, report) => {
      const stats = getReportStats(report);
      acc.present += stats.present;
      acc.absent += stats.absent;
      acc.visitors += stats.visitors;
      return acc;
    },
    { present: 0, absent: 0, visitors: 0 }
  );

  return {
    present: roundMetric(sum.present / reports.length),
    absent: roundMetric(sum.absent / reports.length),
    visitors: roundMetric(sum.visitors / reports.length),
  };
}

function roundMetric(value) {
  return Math.round(value * 10) / 10;
}

function drawMiniDonutChart(canvas, legend, present, absent, visitors) {
  if (!canvas || !legend) {
    return;
  }

  const total = present + absent + visitors;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (total <= 0) {
    legend.innerHTML = '<span class="chart-legend-item">Sem dados no periodo.</span>';
    return;
  }

  const slices = [
    { value: present, color: "#2d8a5e", label: "Presentes" },
    { value: absent, color: "#c0392b", label: "Faltaram" },
    { value: visitors, color: "#2980b9", label: "Visitantes" },
  ];

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const radius = Math.min(cx, cy) - 10;
  const innerRadius = radius * 0.54;
  let startAngle = -Math.PI / 2;

  for (const slice of slices) {
    if (slice.value <= 0) {
      continue;
    }
    const angle = (slice.value / total) * 2 * Math.PI;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, startAngle, startAngle + angle);
    ctx.closePath();
    ctx.fillStyle = slice.color;
    ctx.fill();
    startAngle += angle;
  }

  ctx.beginPath();
  ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#1f2a24";
  ctx.font = "bold 16px sans-serif";
  ctx.fillText(String(roundMetric(total)), cx, cy - 7);
  ctx.font = "11px sans-serif";
  ctx.fillStyle = "#4d5d54";
  ctx.fillText("media", cx, cy + 10);

  legend.innerHTML = slices
    .map(
      (slice) => `
      <span class="chart-legend-item">
        <span class="chart-legend-dot" style="background:${slice.color}"></span>
        ${escapeHtml(slice.label)}: <strong>${roundMetric(slice.value)}</strong>
      </span>
    `
    )
    .join("");
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

function deleteCellAndRelated(cellId) {
  const cell = getCellById(cellId);
  if (!cell) {
    return;
  }

  const normalizedCellName = normalizeName(cell.name);
  state.cells = state.cells.filter((entry) => entry.id !== cellId);

  const removedReportIds = new Set(state.reports.filter((report) => report.cellId === cellId).map((report) => report.id));
  state.reports = state.reports.filter((report) => report.cellId !== cellId);

  if (removedReportIds.has(state.lastReportId)) {
    const latest = state.reports.slice().sort(compareReportsDesc)[0] || null;
    state.lastReportId = latest ? latest.id : null;
  }

  let usersChanged = false;
  users = users.map((user) => {
    if (user.role !== "leader") {
      return user;
    }
    if (normalizeName(user.assignedCellName) !== normalizedCellName) {
      return user;
    }
    usersChanged = true;
    return {
      ...user,
      assignedCellName: "",
      updatedAt: new Date().toISOString(),
    };
  });

  if (usersChanged) {
    saveUsers(users);
    if (session) {
      const current = users.find((user) => user.id === session.id);
      if (current) {
        session = buildSessionFromUser(current);
        saveSession(session);
      }
    }
  }
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

  if (!users.some((entry) => normalizeUsername(entry.username) === "pastor.judson")) {
    users.push({
      id: "pastor-judson",
      name: "Pastor Judson",
      username: "pastor.judson",
      password: "123456",
      role: "pastor",
      assignedCellName: "",
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

  const cinzaCellForMembers = state.cells.find((c) => normalizeName(c.name) === "cinza");
  if (cinzaCellForMembers) {
    const cinzaRequiredMembers = [
      "Jander",
      "Aline",
      "Amanda Rayssa",
      "Amanda",
      "Daniel",
      "Luiz",
      "Manu",
      "Ray",
      "Mayara",
      "Ana",
      "Rebeca",
      "Liz",
      "Mariana",
    ];

    const existingCinzaNames = new Set(cinzaCellForMembers.members.map((member) => normalizeName(member.name)));
    for (const memberName of cinzaRequiredMembers) {
      if (!existingCinzaNames.has(normalizeName(memberName))) {
        cinzaCellForMembers.members.push(mkMember(memberName));
        stateChanged = true;
      }
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

  const cinzaCell = state.cells.find((c) => normalizeName(c.name) === "cinza");
  const cinzaReportDate = "2026-01-23";
  if (cinzaCell && !state.reports.some((r) => r.cellId === cinzaCell.id && r.date === cinzaReportDate)) {
    const cinzaPresentNames = [
      "Aline",
      "Jander",
      "Mariana",
      "Mayara",
      "Ana",
      "Luiz",
      "Manu",
      "Ray",
    ];

    const cinzaPresentMemberIds = cinzaCell.members
      .filter((member) => cinzaPresentNames.some((name) => normalizeName(name) === normalizeName(member.name)))
      .map((member) => member.id);

    const cinzaReport = {
      id: createId(),
      cellId: cinzaCell.id,
      date: cinzaReportDate,
      leaders: "Jander e Aline",
      coLeaders: "",
      host: "Luiz e Manu",
      presentMemberIds: cinzaPresentMemberIds,
      visitorsCount: 0,
      visitorNames: [],
      offering: 0,
      foods: "Nao",
      snack: "Nao",
      discipleship: "Sim",
      visits: "Nao",
      conversions: 0,
      createdAt: new Date("2026-01-23T22:00:00").toISOString(),
    };

    state.reports.push(cinzaReport);
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
