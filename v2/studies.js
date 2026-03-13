const STORAGE_KEY = "renovo_celulas_v1";
const SESSION_STORAGE_KEY = "renovo_session_v1";
const LOCAL_PDFS_KEY = "renovo_pdfs_v1";
const MAX_LOCAL_PDF_SIZE = 1_800_000;

const loadingScreen = document.getElementById("loading-screen");
const loadingStatus = document.getElementById("loading-status");
const studiesApp = document.getElementById("studies-app");
const studiesBanner = document.getElementById("studies-banner");
const studiesHeroCopy = document.getElementById("studies-hero-copy");
const studiesFormPanel = document.getElementById("studies-form-panel");
const studiesListCopy = document.getElementById("studies-list-copy");
const studiesList = document.getElementById("studies-list");
const studyForm = document.getElementById("study-form");
const saveStudyButton = document.getElementById("save-study-button");
const cancelStudyButton = document.getElementById("cancel-study-button");
const studyFeedback = document.getElementById("study-feedback");
const studiesTotal = document.getElementById("studies-total");
const studiesLocalCount = document.getElementById("studies-local-count");
const studiesLinkCount = document.getElementById("studies-link-count");
const studiesAccessRole = document.getElementById("studies-access-role");

let state = { cells: [], reports: [], studies: [], lastReportId: null };
let session = null;

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  bootstrap();
});

function bindEvents() {
  studyForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleStudySubmit();
  });

  cancelStudyButton?.addEventListener("click", () => resetStudyForm());

  studiesList?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-study-action]");
    if (!button) return;

    const studyId = String(button.dataset.studyId || "");
    const action = String(button.dataset.studyAction || "");
    const study = state.studies.find((entry) => entry.id === studyId);
    if (!study) return;

    if (action === "open") {
      openStudyPdf(study);
      return;
    }

    if (!canManageStudies()) {
      setStudyFeedback("Seu perfil nao pode alterar estudos.");
      return;
    }

    if (action === "edit") {
      fillStudyFormForEdit(study);
      return;
    }

    if (action === "delete") {
      const confirmed =
        typeof window.confirm === "function"
          ? window.confirm(`Deseja excluir o estudo ${study.title}?`)
          : true;
      if (!confirmed) return;

      state.studies = state.studies.filter((entry) => entry.id !== study.id);
      await persistState("Estudo excluido com sucesso.");
      resetStudyForm(true);
    }
  });
}

async function bootstrap() {
  setLoading("Carregando sessao...");
  session = loadSession();

  if (!session) {
    showBanner("Sessao nao encontrada. Volte para a home da v2 e entre novamente.");
    finishBoot();
    return;
  }

  if (!canViewStudies()) {
    showBanner("Seu perfil nao possui permissao para abrir a biblioteca de estudos.");
    finishBoot();
    return;
  }

  setLoading("Carregando estudos...");
  await hydrateState();
  updateHeroCopy();
  renderSummary();
  renderStudies();
  resetStudyForm();
  finishBoot();
}

async function hydrateState() {
  const firebaseApi = window.RenovoV2Firebase;
  let loaded = false;

  if (firebaseApi && typeof firebaseApi.loadFullState === "function") {
    const remote = await firebaseApi.loadFullState();
    if (remote.state) {
      state = normalizeState(remote.state, loadLocalPdfStore());
      loaded = true;
    } else if (remote.status === "warn") {
      showBanner(remote.detail);
    }
  }

  if (!loaded) {
    state = normalizeState(loadLocalState(), loadLocalPdfStore());
  }
}

async function handleStudySubmit() {
  if (!canManageStudies()) {
    setStudyFeedback("Seu perfil nao pode publicar estudos.");
    return;
  }

  const formData = new FormData(studyForm);
  const studyId = String(formData.get("studyId") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const pdfUrl = String(formData.get("pdfUrl") || "").trim();
  const pdfFile = formData.get("pdfFile");
  const editingStudy = studyId ? state.studies.find((entry) => entry.id === studyId) : null;
  const hasExistingPdf = Boolean(editingStudy?.pdfUrl || editingStudy?.pdfDataUrl);
  const hasNewFile = pdfFile instanceof File && pdfFile.size > 0;

  if (!title) {
    setStudyFeedback("Informe o titulo do estudo.");
    return;
  }

  if (!hasNewFile && !pdfUrl && !hasExistingPdf) {
    setStudyFeedback("Informe um link de PDF ou envie um arquivo PDF.");
    return;
  }

  let pdfDataUrl = editingStudy?.pdfDataUrl || "";
  if (hasNewFile) {
    if (pdfFile.type && pdfFile.type !== "application/pdf") {
      setStudyFeedback("Envie apenas arquivo PDF.");
      return;
    }

    if (pdfFile.size > MAX_LOCAL_PDF_SIZE) {
      setStudyFeedback("PDF muito grande para salvar localmente. Use ate 1,8 MB.");
      return;
    }

    try {
      pdfDataUrl = await readFileAsDataUrl(pdfFile);
    } catch {
      setStudyFeedback("Erro ao ler o arquivo PDF.");
      return;
    }
  }

  if (studyId && editingStudy) {
    editingStudy.title = title;
    editingStudy.description = description;
    editingStudy.pdfUrl = pdfUrl;
    editingStudy.pdfDataUrl = pdfDataUrl;
    editingStudy.updatedAt = new Date().toISOString();
    editingStudy.updatedBy = session?.name || session?.username || "Sistema";
    await persistState("Estudo atualizado.");
  } else {
    state.studies.unshift({
      id: createId(),
      title,
      description,
      pdfUrl,
      pdfDataUrl,
      createdAt: new Date().toISOString(),
      createdBy: session?.name || session?.username || "Sistema",
      updatedAt: null,
      updatedBy: null,
    });
    await persistState("Estudo publicado.");
  }

  resetStudyForm(true);
}

async function persistState(message) {
  saveLocalState(state);

  const firebaseApi = window.RenovoV2Firebase;
  if (firebaseApi && typeof firebaseApi.saveState === "function") {
    const remote = await firebaseApi.saveState(state);
    if (remote.status === "warn") {
      showBanner(remote.detail);
    }
  }

  setStudyFeedback(message);
  renderSummary();
  renderStudies();
}

function renderSummary() {
  const studies = Array.isArray(state.studies) ? state.studies : [];
  if (studiesTotal) studiesTotal.textContent = String(studies.length);
  if (studiesLocalCount) {
    studiesLocalCount.textContent = String(studies.filter((study) => Boolean(study.pdfDataUrl)).length);
  }
  if (studiesLinkCount) {
    studiesLinkCount.textContent = String(studies.filter((study) => Boolean(study.pdfUrl)).length);
  }
  if (studiesAccessRole) studiesAccessRole.textContent = formatRole(session?.role);
}

function renderStudies() {
  if (studiesFormPanel) {
    studiesFormPanel.hidden = !canManageStudies();
  }

  if (studiesListCopy) {
    studiesListCopy.textContent = canManageStudies()
      ? "Voce pode publicar, editar, excluir e abrir estudos da biblioteca."
      : "Seu perfil pode consultar e abrir os estudos publicados.";
  }

  const studies = Array.isArray(state.studies) ? state.studies.slice() : [];
  studies.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  if (!studies.length) {
    studiesList.innerHTML = '<p class="study-empty-v2">Nenhum estudo publicado ainda.</p>';
    return;
  }

  studiesList.innerHTML = studies
    .map((study) => {
      const canOpen = Boolean(study.pdfUrl || study.pdfDataUrl);
      const createdBy = study.createdBy ? `Por ${escapeHtml(study.createdBy)}` : "Publicado sem autor";
      const when = formatDate(study.createdAt);
      return `
        <article class="study-record-card-v2">
          <div>
            <h3>${escapeHtml(study.title)}</h3>
            <p class="study-meta-v2">${escapeHtml(when)} | ${createdBy}</p>
          </div>
          ${study.description ? `<p class="study-description-v2">${escapeHtml(study.description)}</p>` : ""}
          <div class="study-tag-row-v2">
            ${study.pdfDataUrl ? '<span class="study-tag-v2">PDF local</span>' : ""}
            ${study.pdfUrl ? '<span class="study-tag-v2">Link remoto</span>' : ""}
            ${study.updatedAt ? `<span class="study-tag-v2">Atualizado</span>` : ""}
          </div>
          <div class="report-inline-actions">
            <button type="button" class="ghost-btn compact-btn" data-study-action="open" data-study-id="${escapeHtml(study.id)}" ${canOpen ? "" : "disabled"}>Abrir PDF</button>
            ${
              canManageStudies()
                ? `<button type="button" class="ghost-btn compact-btn" data-study-action="edit" data-study-id="${escapeHtml(study.id)}">Editar</button>
                   <button type="button" class="ghost-btn compact-btn" data-study-action="delete" data-study-id="${escapeHtml(study.id)}">Excluir</button>`
                : ""
            }
          </div>
        </article>
      `;
    })
    .join("");
}

function openStudyPdf(study) {
  const target = String(study?.pdfUrl || "").trim() || String(study?.pdfDataUrl || "").trim();
  if (!target) {
    setStudyFeedback("Este estudo nao possui PDF disponivel.");
    return;
  }

  const opened = window.open(target, "_blank", "noopener,noreferrer");
  if (opened) return;

  const link = document.createElement("a");
  link.href = target;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.click();
}

function resetStudyForm(preserveFeedback) {
  studyForm.reset();
  studyForm.elements.namedItem("studyId").value = "";
  saveStudyButton.textContent = "Publicar estudo";
  cancelStudyButton.hidden = true;
  if (!preserveFeedback) {
    setStudyFeedback(canManageStudies() ? "" : "Seu perfil esta em modo leitura para estudos.");
  }
  disableStudyForm(!canManageStudies());
}

function fillStudyFormForEdit(study) {
  if (!canManageStudies()) return;
  studyForm.elements.namedItem("studyId").value = study.id;
  studyForm.elements.namedItem("title").value = study.title || "";
  studyForm.elements.namedItem("description").value = study.description || "";
  studyForm.elements.namedItem("pdfUrl").value = study.pdfUrl || "";
  studyForm.elements.namedItem("pdfFile").value = "";
  saveStudyButton.textContent = "Atualizar estudo";
  cancelStudyButton.hidden = false;
  setStudyFeedback("");
}

function disableStudyForm(disabled) {
  Array.from(studyForm.querySelectorAll("input, textarea, button")).forEach((element) => {
    if (element === cancelStudyButton) return;
    element.disabled = disabled;
  });
}

function normalizeState(raw, pdfStore) {
  const safe = raw && typeof raw === "object" ? raw : {};
  return {
    cells: Array.isArray(safe.cells) ? safe.cells : [],
    reports: Array.isArray(safe.reports) ? safe.reports : [],
    studies: Array.isArray(safe.studies) ? safe.studies.map((study) => normalizeStudy(study, pdfStore)).filter(Boolean) : [],
    lastReportId: typeof safe.lastReportId === "string" ? safe.lastReportId : null,
  };
}

function normalizeStudy(study, pdfStore) {
  if (!study || typeof study !== "object") return null;
  const title = String(study.title || "").trim();
  const description = String(study.description || "").trim();
  const pdfUrl = String(study.pdfUrl || "").trim();
  const localPdf = pdfStore && typeof pdfStore === "object" ? String(pdfStore[study.id] || "") : "";
  const pdfDataUrl =
    typeof study.pdfDataUrl === "string" && study.pdfDataUrl.startsWith("data:application/pdf")
      ? study.pdfDataUrl
      : localPdf.startsWith("data:application/pdf")
        ? localPdf
        : "";

  if (!title || (!pdfUrl && !pdfDataUrl)) {
    return null;
  }

  return {
    id: String(study.id || createId()),
    title,
    description,
    pdfUrl,
    pdfDataUrl,
    createdAt: study.createdAt || new Date().toISOString(),
    createdBy: String(study.createdBy || "").trim(),
    updatedAt: study.updatedAt || null,
    updatedBy: study.updatedBy || null,
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

function loadLocalPdfStore() {
  try {
    const raw = localStorage.getItem(LOCAL_PDFS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveLocalState(nextState) {
  const pdfStore = {};
  (nextState.studies || []).forEach((study) => {
    if (study.pdfDataUrl) {
      pdfStore[study.id] = study.pdfDataUrl;
    }
  });
  localStorage.setItem(LOCAL_PDFS_KEY, JSON.stringify(pdfStore));

  const stripped = {
    cells: Array.isArray(nextState.cells) ? nextState.cells : [],
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

function canViewStudies() {
  return ["leader", "coordinator", "pastor", "admin"].includes(String(session?.role || ""));
}

function canManageStudies() {
  return ["pastor", "admin"].includes(String(session?.role || ""));
}

function updateHeroCopy() {
  if (!studiesHeroCopy) return;
  studiesHeroCopy.textContent = canManageStudies()
    ? "Voce pode publicar estudos com link remoto ou PDF salvo localmente na v2."
    : "Seu perfil pode abrir e consultar a biblioteca de estudos publicada na v2.";
}

function setLoading(message) {
  if (loadingStatus) loadingStatus.textContent = message;
}

function finishBoot() {
  studiesApp.hidden = false;
  loadingScreen.hidden = true;
}

function showBanner(message) {
  if (!studiesBanner) return;
  studiesBanner.hidden = false;
  studiesBanner.textContent = message;
}

function setStudyFeedback(message) {
  if (studyFeedback) studyFeedback.textContent = message || "";
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Falha ao ler arquivo."));
    reader.readAsDataURL(file);
  });
}

function formatDate(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) {
    return "Data nao informada";
  }
  return date.toLocaleDateString("pt-BR");
}

function formatRole(role) {
  if (role === "admin") return "Admin";
  if (role === "pastor") return "Pastor";
  if (role === "coordinator") return "Coordenador";
  return "Lider";
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
