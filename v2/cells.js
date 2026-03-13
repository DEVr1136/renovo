const STORAGE_KEY = "renovo_celulas_v1";
const SESSION_STORAGE_KEY = "renovo_session_v1";

const loadingScreen = document.getElementById("loading-screen");
const loadingStatus = document.getElementById("loading-status");
const cellsApp = document.getElementById("cells-app");
const cellsBanner = document.getElementById("cells-banner");
const cellsHeroCopy = document.getElementById("cells-hero-copy");
const cellsListTitle = document.getElementById("cells-list-title");
const cellsListCopy = document.getElementById("cells-list-copy");
const cellsList = document.getElementById("cells-list");
const cellForm = document.getElementById("cell-form");
const memberForm = document.getElementById("member-form");
const memberCellSelect = document.getElementById("member-cell-select");
const saveCellButton = document.getElementById("save-cell-button");
const cancelCellButton = document.getElementById("cancel-cell-button");
const saveMemberButton = document.getElementById("save-member-button");
const cancelMemberButton = document.getElementById("cancel-member-button");
const cellFeedback = document.getElementById("cell-feedback");
const memberFeedback = document.getElementById("member-feedback");
const summaryCellsCount = document.getElementById("summary-cells-count");
const summaryMembersCount = document.getElementById("summary-members-count");
const summaryCellsWithReports = document.getElementById("summary-cells-with-reports");
const summaryAccessRole = document.getElementById("summary-access-role");

let state = { cells: [], reports: [], studies: [], lastReportId: null };
let session = null;

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  bootstrap();
});

function bindEvents() {
  cellForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleCellSubmit();
  });

  memberForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleMemberSubmit();
  });

  cancelCellButton?.addEventListener("click", () => resetCellForm());
  cancelMemberButton?.addEventListener("click", () => resetMemberForm());

  cellsList?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    const action = String(button.dataset.action || "");
    const cellId = String(button.dataset.cellId || "");
    const memberId = String(button.dataset.memberId || "");

    if (action === "edit-cell") {
      fillCellForm(cellId);
      return;
    }

    if (action === "delete-cell") {
      await deleteCell(cellId);
      return;
    }

    if (action === "new-member") {
      primeMemberForm(cellId);
      return;
    }

    if (action === "edit-member") {
      fillMemberForm(cellId, memberId);
      return;
    }

    if (action === "delete-member") {
      await deleteMember(cellId, memberId);
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
  renderSummary();
  renderMemberCellOptions();
  renderCells();
  resetCellForm();
  resetMemberForm();
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
    } else if (remote.status === "warn") {
      showBanner(remote.detail);
    }
  }

  if (!loaded) {
    state = normalizeState(loadLocalState());
  }
}

async function handleCellSubmit() {
  if (!canManageCells()) {
    setCellFeedback("Seu perfil nao pode alterar celulas.");
    return;
  }

  const formData = new FormData(cellForm);
  const cellId = String(formData.get("cellId") || "").trim();
  const name = String(formData.get("name") || "").trim();
  const neighborhood = String(formData.get("neighborhood") || "").trim();
  const meetingDay = String(formData.get("meetingDay") || "").trim();
  const meetingTime = String(formData.get("meetingTime") || "").trim();
  const leader = String(formData.get("leader") || "").trim();

  if (!name || !neighborhood || !meetingDay || !meetingTime || !leader) {
    setCellFeedback("Preencha todos os campos da celula.");
    return;
  }

  const duplicated = state.cells.find(
    (cell) => cell.id !== cellId && normalizeName(cell.name) === normalizeName(name)
  );
  if (duplicated) {
    setCellFeedback("Ja existe uma celula com esse nome.");
    return;
  }

  if (cellId) {
    const existing = getCellById(cellId);
    if (!existing) {
      setCellFeedback("Celula nao encontrada.");
      return;
    }

    existing.name = name;
    existing.neighborhood = neighborhood;
    existing.meetingDay = meetingDay;
    existing.meetingTime = meetingTime;
    existing.leader = leader;
    await persistState("Celula atualizada com sucesso.", "cell");
  } else {
    state.cells.push({
      id: createId(),
      name,
      neighborhood,
      meetingDay,
      meetingTime,
      leader,
      members: [],
      createdAt: new Date().toISOString(),
    });
    await persistState("Celula criada com sucesso.", "cell");
  }

  resetCellForm();
}

async function handleMemberSubmit() {
  if (!canManageMembers()) {
    setMemberFeedback("Seu perfil nao pode alterar membros.");
    return;
  }

  const formData = new FormData(memberForm);
  const memberId = String(formData.get("memberId") || "").trim();
  const originalCellId = String(formData.get("originalCellId") || "").trim();
  const cellId = String(formData.get("cellId") || "").trim();
  const memberName = String(formData.get("memberName") || "").trim();
  const memberPhone = String(formData.get("memberPhone") || "").trim();

  if (!cellId || !memberName) {
    setMemberFeedback("Selecione a celula e informe o nome do membro.");
    return;
  }

  const targetCell = getCellById(cellId);
  if (!targetCell) {
    setMemberFeedback("Celula nao encontrada.");
    return;
  }

  const duplicateInTarget = targetCell.members.find(
    (member) => member.id !== memberId && normalizeName(member.name) === normalizeName(memberName)
  );
  if (duplicateInTarget) {
    setMemberFeedback("Este membro ja existe nessa celula.");
    return;
  }

  if (memberId) {
    const sourceCell = getCellById(originalCellId || cellId);
    if (!sourceCell) {
      setMemberFeedback("Membro original nao encontrado.");
      return;
    }

    const existingMember = sourceCell.members.find((member) => member.id === memberId);
    if (!existingMember) {
      setMemberFeedback("Membro nao encontrado.");
      return;
    }

    sourceCell.members = sourceCell.members.filter((member) => member.id !== memberId);
    targetCell.members.push({
      id: existingMember.id,
      name: memberName,
      phone: memberPhone,
    });
    sortMembers(targetCell);
    await persistState("Membro atualizado com sucesso.", "member");
  } else {
    targetCell.members.push({
      id: createId(),
      name: memberName,
      phone: memberPhone,
    });
    sortMembers(targetCell);
    await persistState("Membro cadastrado com sucesso.", "member");
  }

  resetMemberForm();
}

async function deleteCell(cellId) {
  if (!canDeleteCell()) {
    setCellFeedback("Somente admin pode excluir celulas.");
    return;
  }

  const cell = getCellById(cellId);
  if (!cell) return;

  const linkedReports = state.reports.filter((report) => report.cellId === cell.id).length;
  const confirmed =
    typeof window.confirm === "function"
      ? window.confirm(
          linkedReports
            ? `Excluir a celula ${cell.name} e ${linkedReports} relatorio(s) vinculado(s)?`
            : `Excluir a celula ${cell.name}?`
        )
      : true;

  if (!confirmed) return;

  state.cells = state.cells.filter((entry) => entry.id !== cell.id);
  state.reports = state.reports.filter((report) => report.cellId !== cell.id);
  await persistState("Celula excluida com sucesso.", "cell");
  resetCellForm();
  resetMemberForm();
}

async function deleteMember(cellId, memberId) {
  if (!canManageMembers()) {
    setMemberFeedback("Seu perfil nao pode excluir membros.");
    return;
  }

  const cell = getCellById(cellId);
  if (!cell) return;

  const member = cell.members.find((entry) => entry.id === memberId);
  if (!member) return;

  const confirmed =
    typeof window.confirm === "function"
      ? window.confirm(`Excluir o membro ${member.name} da celula ${cell.name}?`)
      : true;
  if (!confirmed) return;

  cell.members = cell.members.filter((entry) => entry.id !== memberId);
  state.reports = state.reports.map((report) =>
    report.cellId !== cell.id
      ? report
      : Object.assign({}, report, {
          presentMemberIds: Array.isArray(report.presentMemberIds)
            ? report.presentMemberIds.filter((entry) => entry !== memberId)
            : [],
        })
  );

  await persistState("Membro removido com sucesso.", "member");
  resetMemberForm();
}

async function persistState(message, focus) {
  saveLocalState(state);

  const firebaseApi = window.RenovoV2Firebase;
  if (firebaseApi && typeof firebaseApi.saveState === "function") {
    const remote = await firebaseApi.saveState(state);
    if (remote.status === "warn") {
      showBanner(remote.detail);
    }
  }

  if (focus === "cell") {
    setCellFeedback(message);
    setMemberFeedback("");
  } else {
    setMemberFeedback(message);
    setCellFeedback("");
  }

  renderSummary();
  renderMemberCellOptions();
  renderCells();
}

function renderSummary() {
  const visibleCells = getVisibleCells();
  const visibleIds = new Set(visibleCells.map((cell) => cell.id));
  const membersCount = visibleCells.reduce((acc, cell) => acc + cell.members.length, 0);
  const cellsWithReports = new Set(
    state.reports.filter((report) => visibleIds.has(report.cellId)).map((report) => report.cellId)
  ).size;

  if (summaryCellsCount) summaryCellsCount.textContent = String(visibleCells.length);
  if (summaryMembersCount) summaryMembersCount.textContent = String(membersCount);
  if (summaryCellsWithReports) summaryCellsWithReports.textContent = String(cellsWithReports);
  if (summaryAccessRole) summaryAccessRole.textContent = formatRole(session?.role);

  if (cellsListTitle) {
    cellsListTitle.textContent = session?.role === "leader" ? "Minha celula" : "Celulas da base";
  }
  if (cellsListCopy) {
    cellsListCopy.textContent = session?.role === "leader"
      ? "Seu perfil visualiza apenas a celula vinculada e o quadro de membros."
      : "A lista abaixo mostra as celulas disponiveis e permite editar a estrutura da base.";
  }
}

function renderMemberCellOptions(selectedCellId) {
  if (!memberCellSelect) return;

  const availableCells = state.cells.slice().sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })
  );
  const preferredValue = selectedCellId || String(memberCellSelect.value || "");

  if (!availableCells.length) {
    memberCellSelect.innerHTML = '<option value="">Cadastre uma celula primeiro</option>';
    memberCellSelect.disabled = true;
    return;
  }

  memberCellSelect.disabled = !canManageMembers();
  memberCellSelect.innerHTML =
    '<option value="">Selecione...</option>' +
    availableCells
      .map((cell) => `<option value="${escapeHtml(cell.id)}">${escapeHtml(cell.name)} - ${escapeHtml(cell.neighborhood)}</option>`)
      .join("");

  if (availableCells.some((cell) => cell.id === preferredValue)) {
    memberCellSelect.value = preferredValue;
  } else {
    memberCellSelect.value = availableCells[0].id;
  }
}

function renderCells() {
  const visibleCells = getVisibleCells();

  if (!visibleCells.length) {
    cellsList.innerHTML = '<p class="status-detail">Nenhuma celula visivel para este perfil.</p>';
    return;
  }

  cellsList.innerHTML = visibleCells
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }))
    .map((cell) => {
      const reportsCount = state.reports.filter((report) => report.cellId === cell.id).length;
      const membersMarkup = cell.members.length
        ? cell.members
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }))
            .map(
              (member) => `
                <div class="member-item-v2">
                  <div>
                    <strong>${escapeHtml(member.name)}</strong>
                    <p>${escapeHtml(member.phone || "Telefone nao informado")}</p>
                  </div>
                  ${
                    canManageMembers()
                      ? `
                        <div class="report-inline-actions">
                          <button type="button" class="ghost-btn compact-btn" data-action="edit-member" data-cell-id="${escapeHtml(cell.id)}" data-member-id="${escapeHtml(member.id)}">Editar</button>
                          <button type="button" class="ghost-btn compact-btn" data-action="delete-member" data-cell-id="${escapeHtml(cell.id)}" data-member-id="${escapeHtml(member.id)}">Excluir</button>
                        </div>
                      `
                      : ""
                  }
                </div>
              `
            )
            .join("")
        : '<p class="member-empty-v2">Sem membros cadastrados.</p>';

      return `
        <article class="cell-record-card-v2">
          <div class="cell-record-head-v2">
            <div>
              <h3>${escapeHtml(cell.name)}</h3>
              <p class="cell-record-meta-v2">${escapeHtml(cell.neighborhood)} | ${escapeHtml(cell.meetingDay)} as ${escapeHtml(cell.meetingTime)}</p>
              <p class="cell-record-meta-v2">Lider: ${escapeHtml(cell.leader)} | Membros: ${cell.members.length} | Relatorios: ${reportsCount}</p>
            </div>
            <span class="access-chip">${cell.members.length} membro(s)</span>
          </div>

          ${
            canManageCells() || canManageMembers() || canDeleteCell()
              ? `
                <div class="report-inline-actions">
                  ${
                    canManageCells()
                      ? `<button type="button" class="ghost-btn compact-btn" data-action="edit-cell" data-cell-id="${escapeHtml(cell.id)}">Editar celula</button>`
                      : ""
                  }
                  ${
                    canManageMembers()
                      ? `<button type="button" class="ghost-btn compact-btn" data-action="new-member" data-cell-id="${escapeHtml(cell.id)}">Novo membro</button>`
                      : ""
                  }
                  ${
                    canDeleteCell()
                      ? `<button type="button" class="ghost-btn compact-btn" data-action="delete-cell" data-cell-id="${escapeHtml(cell.id)}">Excluir celula</button>`
                      : ""
                  }
                </div>
              `
              : ""
          }

          <div class="member-stack-v2">${membersMarkup}</div>
        </article>
      `;
    })
    .join("");
}

function fillCellForm(cellId) {
  if (!canManageCells()) return;
  const cell = getCellById(cellId);
  if (!cell) return;

  cellForm.elements.namedItem("cellId").value = cell.id;
  cellForm.elements.namedItem("name").value = cell.name;
  cellForm.elements.namedItem("neighborhood").value = cell.neighborhood;
  cellForm.elements.namedItem("meetingDay").value = cell.meetingDay;
  cellForm.elements.namedItem("meetingTime").value = cell.meetingTime;
  cellForm.elements.namedItem("leader").value = cell.leader;
  saveCellButton.textContent = "Atualizar celula";
  cancelCellButton.hidden = false;
  setCellFeedback("");
}

function fillMemberForm(cellId, memberId) {
  if (!canManageMembers()) return;
  const cell = getCellById(cellId);
  const member = cell?.members.find((entry) => entry.id === memberId);
  if (!cell || !member) return;

  memberForm.elements.namedItem("memberId").value = member.id;
  memberForm.elements.namedItem("originalCellId").value = cell.id;
  renderMemberCellOptions(cell.id);
  memberForm.elements.namedItem("cellId").value = cell.id;
  memberForm.elements.namedItem("memberName").value = member.name;
  memberForm.elements.namedItem("memberPhone").value = member.phone || "";
  saveMemberButton.textContent = "Atualizar membro";
  cancelMemberButton.hidden = false;
  setMemberFeedback("");
}

function primeMemberForm(cellId) {
  if (!canManageMembers()) return;
  resetMemberForm(cellId);
}

function resetCellForm() {
  cellForm.reset();
  cellForm.elements.namedItem("cellId").value = "";
  saveCellButton.textContent = "Salvar celula";
  cancelCellButton.hidden = true;
  setCellFeedback(canManageCells() ? "" : "Seu perfil esta em modo leitura para celulas.");
  disableForm(cellForm, !canManageCells(), [cancelCellButton]);
}

function resetMemberForm(preferredCellId) {
  memberForm.reset();
  memberForm.elements.namedItem("memberId").value = "";
  memberForm.elements.namedItem("originalCellId").value = "";
  renderMemberCellOptions(preferredCellId);
  saveMemberButton.textContent = "Salvar membro";
  cancelMemberButton.hidden = true;
  const shouldDisable = !canManageMembers() || state.cells.length === 0;
  setMemberFeedback(
    !canManageMembers()
      ? "Seu perfil esta em modo leitura para membros."
      : state.cells.length === 0
        ? "Cadastre uma celula antes de adicionar membros."
        : ""
  );
  disableForm(memberForm, shouldDisable, [cancelMemberButton]);
}

function disableForm(form, disabled, exceptions) {
  const skip = new Set(exceptions || []);
  Array.from(form.querySelectorAll("input, select, textarea, button")).forEach((element) => {
    if (skip.has(element)) return;
    element.disabled = disabled;
  });
}

function getVisibleCells() {
  if (session?.role === "leader") {
    const assigned = normalizeName(session.assignedCellName);
    return state.cells.filter((cell) => normalizeName(cell.name) === assigned);
  }
  return state.cells;
}

function getCellById(cellId) {
  return state.cells.find((cell) => cell.id === cellId) || null;
}

function canManageCells() {
  return ["coordinator", "pastor", "admin"].includes(String(session?.role || ""));
}

function canManageMembers() {
  return ["coordinator", "pastor", "admin"].includes(String(session?.role || ""));
}

function canDeleteCell() {
  return String(session?.role || "") === "admin";
}

function updateHeroCopy() {
  if (!cellsHeroCopy) return;

  if (session?.role === "leader") {
    cellsHeroCopy.textContent = "Seu perfil acompanha somente a celula vinculada, em modo leitura.";
    return;
  }

  if (canDeleteCell()) {
    cellsHeroCopy.textContent = "Voce pode estruturar celulas, membros e remover registros quando necessario.";
    return;
  }

  cellsHeroCopy.textContent = "Voce pode cadastrar e organizar a estrutura das celulas no app.";
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
  const name = String(cell.name || "").trim();
  if (!name) return null;
  return {
    id: String(cell.id || createId()),
    name,
    neighborhood: String(cell.neighborhood || "Nao informado").trim(),
    meetingDay: String(cell.meetingDay || "Nao definido").trim(),
    meetingTime: String(cell.meetingTime || "20:00").trim(),
    leader: String(cell.leader || "").trim(),
    members: Array.isArray(cell.members)
      ? cell.members
          .map((member) => {
            if (!member || typeof member !== "object") return null;
            const memberName = String(member.name || "").trim();
            if (!memberName) return null;
            return {
              id: String(member.id || createId()),
              name: memberName,
              phone: String(member.phone || "").trim(),
            };
          })
          .filter(Boolean)
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
    presentMemberIds: Array.isArray(report.presentMemberIds) ? report.presentMemberIds.map(String) : [],
    visitorsCount: Number(report.visitorsCount || 0),
    visitorNames: Array.isArray(report.visitorNames) ? report.visitorNames.map((name) => String(name)) : [],
    visitorDetails: Array.isArray(report.visitorDetails)
      ? report.visitorDetails
          .map((visitor) => ({
            name: String(visitor?.name || "").trim(),
            how: String(visitor?.how || "").trim(),
            address: String(visitor?.address || "").trim(),
            phone: String(visitor?.phone || "").trim(),
          }))
          .filter((visitor) => visitor.name)
      : [],
    images: Array.isArray(report.images) ? report.images : [],
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
    reports: Array.isArray(nextState.reports)
      ? nextState.reports.map((report) => Object.assign({}, report, { images: [] }))
      : [],
    studies: Array.isArray(nextState.studies)
      ? nextState.studies.map((study) => Object.assign({}, study, { pdfDataUrl: "" }))
      : [],
    lastReportId: nextState.lastReportId || null,
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

function sortMembers(cell) {
  cell.members.sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
}

function formatRole(role) {
  if (role === "admin") return "Admin";
  if (role === "pastor") return "Pastor";
  if (role === "coordinator") return "Coordenador";
  return "Lider";
}

function setLoading(message) {
  if (loadingStatus) loadingStatus.textContent = message;
}

function finishBoot() {
  cellsApp.hidden = false;
  loadingScreen.hidden = true;
}

function showBanner(message) {
  if (!cellsBanner) return;
  cellsBanner.hidden = false;
  cellsBanner.textContent = message;
}

function setCellFeedback(message) {
  if (cellFeedback) cellFeedback.textContent = message || "";
}

function setMemberFeedback(message) {
  if (memberFeedback) memberFeedback.textContent = message || "";
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
