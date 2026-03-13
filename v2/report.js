const STORAGE_KEY = "renovo_celulas_v1";
const SESSION_STORAGE_KEY = "renovo_session_v1";

const loadingScreen = document.getElementById("loading-screen");
const loadingStatus = document.getElementById("loading-status");
const reportApp = document.getElementById("report-app");
const reportBanner = document.getElementById("report-banner");
const reportHeroCopy = document.getElementById("report-hero-copy");
const reportForm = document.getElementById("report-form");
const reportCell = document.getElementById("report-cell");
const reportDate = document.getElementById("report-date");
const reportLeaders = document.getElementById("report-leaders");
const reportCoLeaders = document.getElementById("report-co-leaders");
const reportHost = document.getElementById("report-host");
const attendanceList = document.getElementById("attendance-list");
const markAllButton = document.getElementById("mark-all-button");
const clearAllButton = document.getElementById("clear-all-button");
const visitorName = document.getElementById("visitor-name");
const visitorHow = document.getElementById("visitor-how");
const visitorAddress = document.getElementById("visitor-address");
const visitorPhone = document.getElementById("visitor-phone");
const addVisitorButton = document.getElementById("add-visitor-button");
const visitorList = document.getElementById("visitor-list");
const saveReportButton = document.getElementById("save-report-button");
const reportFeedback = document.getElementById("report-feedback");
const reportOutput = document.getElementById("report-output");
const copyReportButton = document.getElementById("copy-report-button");
const reportHistory = document.getElementById("report-history");
const summaryPresent = document.getElementById("summary-present");
const summaryAbsent = document.getElementById("summary-absent");
const summaryVisitorCount = document.getElementById("summary-visitor-count");
const summaryTotalPeople = document.getElementById("summary-total-people");

let state = { cells: [], reports: [], studies: [], lastReportId: null };
let session = null;
let currentVisitors = [];

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  bootstrap();
});

function bindEvents() {
  reportForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    generateReportText();
  });

  saveReportButton?.addEventListener("click", async () => {
    await saveCurrentReport();
  });

  reportCell?.addEventListener("change", () => {
    applyContextForSelection();
  });

  reportDate?.addEventListener("change", () => {
    applyContextForSelection();
  });

  markAllButton?.addEventListener("click", () => {
    attendanceList.querySelectorAll('input[name="presentMemberIds"]').forEach((checkbox) => {
      checkbox.checked = true;
    });
    refreshSummary();
  });

  clearAllButton?.addEventListener("click", () => {
    attendanceList.querySelectorAll('input[name="presentMemberIds"]').forEach((checkbox) => {
      checkbox.checked = false;
    });
    refreshSummary();
  });

  attendanceList?.addEventListener("change", () => refreshSummary());

  addVisitorButton?.addEventListener("click", () => {
    const name = String(visitorName?.value || "").trim();
    if (!name) {
      setFeedback("Informe o nome do visitante.");
      visitorName?.focus();
      return;
    }

    currentVisitors.push({
      name,
      how: String(visitorHow?.value || "").trim(),
      address: String(visitorAddress?.value || "").trim(),
      phone: String(visitorPhone?.value || "").trim(),
    });

    if (visitorName) visitorName.value = "";
    if (visitorHow) visitorHow.value = "";
    if (visitorAddress) visitorAddress.value = "";
    if (visitorPhone) visitorPhone.value = "";
    setFeedback("");
    renderVisitors();
    refreshSummary();
  });

  visitorList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-visitor]");
    if (!button) return;
    const index = Number.parseInt(button.dataset.removeVisitor || "", 10);
    if (Number.isNaN(index)) return;
    currentVisitors.splice(index, 1);
    renderVisitors();
    refreshSummary();
  });

  reportHistory?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-report-id]");
    if (!button) return;
    const reportId = String(button.dataset.reportId || "");
    const found = state.reports.find((report) => report.id === reportId);
    if (!found) return;
    reportCell.value = found.cellId;
    reportDate.value = found.date;
    loadReportIntoForm(found);
    renderAttendance();
    renderHistory();
    generateReportText();
  });

  copyReportButton?.addEventListener("click", async () => {
    if (!reportOutput?.value) {
      setFeedback("Gere o texto antes de copiar.");
      return;
    }

    try {
      await navigator.clipboard.writeText(reportOutput.value);
      setFeedback("Texto copiado.");
    } catch {
      setFeedback("Nao foi possivel copiar automaticamente.");
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

  setLoading("Carregando estado...");
  await hydrateState();
  updateHeroCopy();
  renderCellOptions();
  applyInitialContext();
  renderAttendance();
  renderVisitors();
  renderHistory();
  refreshSummary();
  finishBoot();
}

async function hydrateState() {
  const firebaseApi = window.RenovoV2Firebase;
  let loaded = false;

  if (firebaseApi && typeof firebaseApi.loadFullState === "function") {
    const remote = await firebaseApi.loadFullState();
    if (remote.state) {
      state = normalizeState(remote.state);
      loaded = true;
    }
  }

  if (!loaded) {
    state = normalizeState(loadLocalState());
  }
}

function renderCellOptions() {
  const cells = getAccessibleCells();

  if (!cells.length) {
    reportCell.innerHTML = '<option value="">Sem celulas disponiveis</option>';
    reportCell.disabled = true;
    return;
  }

  const options = cells
    .map((cell) => `<option value="${escapeHtml(cell.id)}">${escapeHtml(cell.name)} - ${escapeHtml(cell.neighborhood || "Nao informado")}</option>`)
    .join("");

  reportCell.innerHTML = options;
  reportCell.disabled = session.role === "leader";
}

function applyInitialContext() {
  const cells = getAccessibleCells();
  if (!cells.length) {
    return;
  }

  if (!cells.some((cell) => cell.id === reportCell.value)) {
    reportCell.value = cells[0].id;
  }

  if (!reportDate.value) {
    reportDate.value = todayIsoDate();
  }

  applyContextForSelection();
}

function applyContextForSelection() {
  const existing = findReport(reportCell.value, reportDate.value);
  if (existing) {
    loadReportIntoForm(existing);
  } else {
    loadDefaultFormState();
  }

  renderAttendance();
  renderVisitors();
  renderHistory();
  generateReportText();
}

function loadDefaultFormState() {
  currentVisitors = [];
  const cell = getCellById(reportCell.value);
  reportLeaders.value = cell?.leader || session?.name || "";
  reportCoLeaders.value = "";
  reportHost.value = "";
}

function loadReportIntoForm(report) {
  currentVisitors = Array.isArray(report.visitorDetails)
    ? report.visitorDetails.map((visitor) => ({
        name: String(visitor.name || ""),
        how: String(visitor.how || ""),
        address: String(visitor.address || ""),
        phone: String(visitor.phone || ""),
      }))
    : [];

  reportLeaders.value = report.leaders || "";
  reportCoLeaders.value = report.coLeaders || "";
  reportHost.value = report.host || "";
}

function renderAttendance() {
  const cell = getCellById(reportCell.value);
  if (!cell) {
    attendanceList.innerHTML = '<p class="status-detail">Selecione uma celula para marcar a presenca.</p>';
    return;
  }

  if (!Array.isArray(cell.members) || !cell.members.length) {
    attendanceList.innerHTML = '<p class="status-detail">Esta celula ainda nao possui membros cadastrados.</p>';
    return;
  }

  const report = findReport(reportCell.value, reportDate.value);
  const selected = new Set(Array.isArray(report?.presentMemberIds) ? report.presentMemberIds : []);
  const readOnly = isReadOnlyRole();

  attendanceList.innerHTML = cell.members
    .map(
      (member) => `
        <label class="attendance-item-v2">
          <input
            type="checkbox"
            name="presentMemberIds"
            value="${escapeHtml(member.id)}"
            ${selected.has(member.id) ? "checked" : ""}
            ${readOnly ? "disabled" : ""}
          />
          <span>${escapeHtml(member.name)}</span>
        </label>
      `
    )
    .join("");

  markAllButton.hidden = readOnly;
  clearAllButton.hidden = readOnly;
  saveReportButton.hidden = readOnly;
}

function renderVisitors() {
  if (!currentVisitors.length) {
    visitorList.innerHTML = '<p class="status-detail">Nenhum visitante adicionado.</p>';
    return;
  }

  visitorList.innerHTML = currentVisitors
    .map(
      (visitor, index) => `
        <div class="visitor-row-v2">
          <div>
            <strong>${escapeHtml(visitor.name)}</strong>
            <p>${escapeHtml(visitor.how || "Sem observacao")}</p>
          </div>
          ${isReadOnlyRole() ? "" : `<button class="ghost-btn compact-btn" type="button" data-remove-visitor="${index}">Remover</button>`}
        </div>
      `
    )
    .join("");
}

function renderHistory() {
  const reports = state.reports
    .filter((report) => !reportCell.value || report.cellId === reportCell.value)
    .sort((a, b) => compareReportsDesc(a, b));

  if (!reports.length) {
    reportHistory.innerHTML = '<p class="status-detail">Nenhum relatorio encontrado para esta celula.</p>';
    return;
  }

  reportHistory.innerHTML = reports
    .map((report) => {
      const stats = getReportStats(report);
      return `
        <button type="button" class="history-item-v2" data-report-id="${escapeHtml(report.id)}">
          <strong>${escapeHtml(formatDateForReport(report.date))}</strong>
          <span>Presentes ${stats.present} · Faltaram ${stats.absent} · Visitantes ${stats.visitors}</span>
        </button>
      `;
    })
    .join("");
}

function generateReportText() {
  const cell = getCellById(reportCell.value);
  if (!cell) {
    reportOutput.value = "";
    refreshSummary();
    return;
  }

  const report = buildDraftReport();
  reportOutput.value = buildReportText(report, cell);
  refreshSummary(report);
}

async function saveCurrentReport() {
  if (isReadOnlyRole()) {
    setFeedback("Seu perfil esta em modo leitura neste modulo.");
    return;
  }

  const cell = getCellById(reportCell.value);
  const draft = buildDraftReport();
  if (!cell || !draft.date || !draft.leaders) {
    setFeedback("Preencha celula, data e lideres.");
    return;
  }

  upsertReport(draft);
  state.lastReportId = draft.id;
  saveLocalState(state);

  const firebaseApi = window.RenovoV2Firebase;
  if (firebaseApi && typeof firebaseApi.saveState === "function") {
    const remote = await firebaseApi.saveState(state);
    if (remote.status === "warn") {
      showBanner(remote.detail);
    }
  }

  setFeedback("Relatorio salvo com sucesso.");
  renderHistory();
  generateReportText();
}

function buildDraftReport() {
  const selectedIds = Array.from(
    attendanceList.querySelectorAll('input[name="presentMemberIds"]:checked')
  ).map((checkbox) => String(checkbox.value));

  const existing = findReport(reportCell.value, reportDate.value);
  return {
    id: existing?.id || createId(),
    cellId: String(reportCell.value || ""),
    date: String(reportDate.value || ""),
    leaders: String(reportLeaders.value || "").trim(),
    coLeaders: String(reportCoLeaders.value || "").trim(),
    host: String(reportHost.value || "").trim(),
    presentMemberIds: selectedIds,
    visitorsCount: currentVisitors.length,
    visitorNames: currentVisitors.map((visitor) => visitor.name),
    visitorDetails: currentVisitors.map((visitor) => ({
      name: visitor.name,
      how: visitor.how || "",
      address: visitor.address || "",
      phone: visitor.phone || "",
    })),
    images: [],
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: existing ? new Date().toISOString() : null,
  };
}

function refreshSummary(report) {
  const data = report || buildDraftReport();
  const stats = getReportStats(data);
  if (summaryPresent) summaryPresent.textContent = String(stats.present);
  if (summaryAbsent) summaryAbsent.textContent = String(stats.absent);
  if (summaryVisitorCount) summaryVisitorCount.textContent = String(stats.visitors);
  if (summaryTotalPeople) summaryTotalPeople.textContent = String(stats.present + stats.visitors);
}

function getAccessibleCells() {
  if (!session || session.role !== "leader") {
    return state.cells;
  }

  const assigned = normalizeName(session.assignedCellName);
  return state.cells.filter((cell) => normalizeName(cell.name) === assigned);
}

function getCellById(id) {
  return state.cells.find((cell) => cell.id === id) || null;
}

function findReport(cellId, date) {
  if (!cellId || !date) return null;
  return state.reports.find((report) => report.cellId === cellId && report.date === date) || null;
}

function upsertReport(reportData) {
  const index = state.reports.findIndex((report) => report.cellId === reportData.cellId && report.date === reportData.date);
  if (index === -1) {
    state.reports.push(reportData);
    return;
  }

  const existing = state.reports[index];
  state.reports[index] = {
    ...existing,
    ...reportData,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };
}

function getReportStats(report) {
  const cell = getCellById(report?.cellId);
  const present = Array.isArray(report?.presentMemberIds) ? report.presentMemberIds.length : 0;
  const membersCount = Array.isArray(cell?.members) ? cell.members.length : 0;
  const absent = Math.max(membersCount - present, 0);
  const visitors = Number.isFinite(report?.visitorsCount) ? report.visitorsCount : Number(report?.visitorsCount || 0);
  return {
    present,
    absent,
    visitors: Number.isFinite(visitors) ? visitors : 0,
  };
}

function buildReportText(report, cell) {
  const memberMap = new Map((cell.members || []).map((member) => [String(member.id), member.name]));
  const presentNames = report.presentMemberIds.map((id) => memberMap.get(String(id)) || "Membro");
  const absentNames = (cell.members || [])
    .filter((member) => !report.presentMemberIds.includes(member.id))
    .map((member) => member.name);

  const visitorLines = report.visitorDetails.length
    ? report.visitorDetails
        .map((visitor, index) => {
          let line = `${index + 1}. ${visitor.name}`;
          if (visitor.how) line += ` - ${visitor.how}`;
          if (visitor.address) line += `\n   Endereco: ${visitor.address}`;
          if (visitor.phone) line += `\n   Telefone: ${visitor.phone}`;
          return line;
        })
        .join("\n")
    : "Sem visitantes cadastrados.";

  return `RELATORIO DA CELULA ${cell.name.toUpperCase()}
Data: ${formatDateForReport(report.date)}
Lideres: ${report.leaders || "-"}
Co-lideres: ${report.coLeaders || "-"}
Anfitriao: ${report.host || "-"}

MEMBROS (${cell.members.length})
${(cell.members || []).map((member, index) => `${index + 1}. ${member.name}`).join("\n") || "Sem membros cadastrados."}

PRESENTES (${presentNames.length})
${presentNames.length ? presentNames.map((name, index) => `${index + 1}. ${name}`).join("\n") : "Nenhum presente marcado."}

FALTARAM (${absentNames.length})
${absentNames.length ? absentNames.map((name, index) => `${index + 1}. ${name}`).join("\n") : "Ninguem faltou."}

VISITANTES (${report.visitorsCount})
${visitorLines}

RESUMO
Total de membros: ${cell.members.length}
Presentes: ${presentNames.length}
Visitantes: ${report.visitorsCount}
Total de pessoas: ${presentNames.length + report.visitorsCount}`;
}

function isReadOnlyRole() {
  return session?.role === "coordinator" || session?.role === "pastor";
}

function normalizeState(raw) {
  const safe = raw && typeof raw === "object" ? raw : {};
  return {
    cells: Array.isArray(safe.cells) ? safe.cells.map(normalizeCell).filter(Boolean) : [],
    reports: Array.isArray(safe.reports) ? safe.reports.map(normalizeReport).filter(Boolean) : [],
    studies: Array.isArray(safe.studies) ? safe.studies : [],
    lastReportId: typeof safe.lastReportId === "string" ? safe.lastReportId : null,
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
      ? cell.members
          .map((member) => ({
            id: String(member?.id || createId()),
            name: String(member?.name || "").trim(),
            phone: String(member?.phone || "").trim(),
          }))
          .filter((member) => member.name)
      : [],
    createdAt: cell.createdAt || new Date().toISOString(),
  };
}

function normalizeReport(report) {
  if (!report || typeof report !== "object") return null;
  return {
    id: String(report.id || createId()),
    cellId: String(report.cellId || ""),
    date: String(report.date || ""),
    leaders: String(report.leaders || "").trim(),
    coLeaders: String(report.coLeaders || "").trim(),
    host: String(report.host || "").trim(),
    presentMemberIds: Array.isArray(report.presentMemberIds) ? report.presentMemberIds.map((id) => String(id)) : [],
    visitorsCount: Number(report.visitorsCount || 0),
    visitorNames: Array.isArray(report.visitorNames) ? report.visitorNames.map((name) => String(name)) : [],
    visitorDetails: Array.isArray(report.visitorDetails)
      ? report.visitorDetails.map((visitor) => ({
          name: String(visitor?.name || "").trim(),
          how: String(visitor?.how || "").trim(),
          address: String(visitor?.address || "").trim(),
          phone: String(visitor?.phone || "").trim(),
        })).filter((visitor) => visitor.name)
      : [],
    images: [],
    createdAt: report.createdAt || new Date().toISOString(),
    updatedAt: report.updatedAt || null,
  };
}

function loadLocalState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { cells: [], reports: [], studies: [], lastReportId: null };
  } catch {
    return { cells: [], reports: [], studies: [], lastReportId: null };
  }
}

function saveLocalState(nextState) {
  const stripped = {
    cells: nextState.cells,
    reports: nextState.reports.map((report) => Object.assign({}, report, { images: [] })),
    studies: Array.isArray(nextState.studies) ? nextState.studies : [],
    lastReportId: nextState.lastReportId,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stripped));
}

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function compareReportsDesc(a, b) {
  const aTime = new Date(`${a.date}T00:00:00`).getTime();
  const bTime = new Date(`${b.date}T00:00:00`).getTime();
  return bTime - aTime;
}

function updateHeroCopy() {
  if (!reportHeroCopy || !session) return;
  reportHeroCopy.textContent = isReadOnlyRole()
    ? "Seu perfil esta em modo leitura neste modulo. O historico segue visivel."
    : "Preencha a semana, gere o texto final e salve direto no app.";
}

function setLoading(message) {
  if (loadingStatus) loadingStatus.textContent = message;
}

function finishBoot() {
  reportApp.hidden = false;
  loadingScreen.hidden = true;
}

function showBanner(message) {
  if (!reportBanner) return;
  reportBanner.hidden = false;
  reportBanner.textContent = message;
}

function setFeedback(message) {
  if (!reportFeedback) return;
  reportFeedback.textContent = message || "";
}

function todayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateForReport(value) {
  const parts = String(value || "").split("-");
  if (parts.length !== 3) return value || "-";
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
