/* app.js – Renovo+ v2, UI V1 */
(function () {
  "use strict";

  // ─── STATE ────────────────────────────────────────────────────────────────
  let session = null; // { uid, name, email, role, primaryCellId, scopeCellIds, status }
  let state = {
    cells: [],     // normalised V2 cells, with .members[] and .leader text embedded
    reports: [],   // normalised V2 reports
    studies: [],
    visitors: [],
    profiles: [],  // only loaded for admin/pastor
  };

  // current items being edited
  let editingReportId = null;
  let editingCellId = null;
  let editingStudyId = null;
  let editingAccessUid = null;

  // ─── HELPERS ──────────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const fb = () => window.renovoPlusFirebase;
  const isAdmin = () => session?.role === "admin";
  const isPastor = () => session?.role === "pastor";
  const isCoordinator = () => session?.role === "coordinator";
  const isAdminOrPastor = () => isAdmin() || isPastor();
  const canManageCells = () => isAdminOrPastor();
  const canManageAccess = () => isAdminOrPastor() || isCoordinator();

  function getAccessibleCells() {
    if (!session) return [];
    if (isAdminOrPastor()) return state.cells;
    const ids = new Set(
      [session.primaryCellId, ...(session.scopeCellIds || [])].filter(Boolean)
    );
    return state.cells.filter((c) => ids.has(c.id));
  }

  function extractLeaderFromNotes(notes) {
    const str = String(notes || "");
    const m = str.match(/^Lider:\s*(.+?)(?:\n|$)/im);
    return m ? m[1].trim() : "";
  }

  function getCellLeader(cell) {
    return extractLeaderFromNotes(cell?.notes) || "";
  }

  function fmtDate(iso) {
    if (!iso) return "";
    const parts = String(iso).split("-");
    if (parts.length !== 3) return iso;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function fmtMoney(val) {
    const n = Number(val) || 0;
    return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function escHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showFeedback(elId, msg, isError) {
    const el = $(elId);
    if (!el) return;
    el.textContent = msg;
    el.style.color = isError ? "var(--danger, #c0392b)" : "var(--ink-soft, #555)";
    if (msg) setTimeout(() => { if (el.textContent === msg) el.textContent = ""; }, 6000);
  }

  function setButtonLoading(btn, loading, label) {
    if (!btn) return;
    btn.disabled = loading;
    if (loading) {
      btn.dataset.originalText = btn.textContent;
      btn.textContent = label || "Aguarde...";
    } else {
      btn.textContent = btn.dataset.originalText || btn.textContent;
    }
  }

  // ─── SCREEN MANAGEMENT ────────────────────────────────────────────────────
  function showScreen(name) {
    ["loading-screen", "auth-screen", "home-screen", "app-shell"].forEach((id) => {
      const el = $(id);
      if (el) el.hidden = id !== name;
    });
  }

  function openModal(id) {
    const el = $(id);
    if (el) el.hidden = false;
  }

  function closeModal(id) {
    const el = $(id);
    if (el) el.hidden = true;
  }

  // ─── AUTH SCREEN ──────────────────────────────────────────────────────────
  function setupAuthScreen() {
    const loginForm = $("login-form");
    const forgotBtn = $("forgot-password-btn");
    const togglePwd = $("toggle-password");

    if (togglePwd) {
      togglePwd.addEventListener("click", () => {
        const inp = loginForm ? loginForm.querySelector('input[name="password"]') : null;
        if (!inp) return;
        inp.type = inp.type === "password" ? "text" : "password";
      });
    }

    if (loginForm) {
      loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = loginForm.elements.email.value.trim();
        const password = loginForm.elements.password.value;
        const btn = loginForm.querySelector('[type="submit"]');
        showFeedback("auth-feedback", "");
        setButtonLoading(btn, true, "Entrando...");
        try {
          await fb().signInWithEmail(email, password);
          // onAuthStateChanged handles navigation
        } catch (err) {
          showFeedback("auth-feedback", translateAuthError(err), true);
          setButtonLoading(btn, false);
        }
      });
    }

    if (forgotBtn) {
      forgotBtn.addEventListener("click", async () => {
        const emailInput = loginForm ? loginForm.elements.email : null;
        const email = emailInput ? emailInput.value.trim() : "";
        if (!email) {
          showFeedback("auth-feedback", "Informe seu e-mail antes de clicar em 'Esqueci minha senha'.", true);
          return;
        }
        setButtonLoading(forgotBtn, true, "Enviando...");
        try {
          await fb().sendPasswordReset(email);
          showFeedback("auth-feedback", "E-mail de redefinição enviado! Verifique sua caixa de entrada.");
        } catch (err) {
          showFeedback("auth-feedback", translateAuthError(err), true);
        } finally {
          setButtonLoading(forgotBtn, false);
        }
      });
    }
  }

  function translateAuthError(err) {
    const code = String(err?.code || "");
    if (code.includes("user-not-found") || code.includes("wrong-password") || code.includes("invalid-credential"))
      return "E-mail ou senha incorretos.";
    if (code.includes("too-many-requests")) return "Muitas tentativas. Aguarde alguns minutos.";
    if (code.includes("network-request-failed")) return "Sem conexão. Verifique sua internet.";
    if (code.includes("invalid-email")) return "E-mail inválido.";
    return err?.message || "Erro ao autenticar.";
  }

  // ─── HOME SCREEN ──────────────────────────────────────────────────────────
  function setupHomeScreen() {
    $("home-logout-button")?.addEventListener("click", handleLogout);
    $("go-to-celulas")?.addEventListener("click", enterAppShell);
  }

  function renderHomeScreen() {
    const nameEl = $("home-username");
    if (nameEl) nameEl.textContent = session?.name || session?.email || "líder";
    showScreen("home-screen");
  }

  // ─── APP SHELL ────────────────────────────────────────────────────────────
  function setupAppShell() {
    $("logout-button")?.addEventListener("click", handleLogout);
    $("back-to-home-button")?.addEventListener("click", () => showScreen("home-screen"));

    $("create-cell-card")?.addEventListener("click", openCreateCellModal);
    $("add-member-card")?.addEventListener("click", openAddMemberModal);
    $("import-members-card")?.addEventListener("click", openImportMembersModal);
    $("weekly-report-card")?.addEventListener("click", openReportModal);
    $("manage-access-card")?.addEventListener("click", openAccessModal);
    $("view-studies-card")?.addEventListener("click", openStudiesModal);
    $("view-visitantes-card")?.addEventListener("click", openVisitantesModal);
  }

  async function enterAppShell() {
    showScreen("loading-screen");
    setLoadingText("Carregando dados das células...");
    try {
      await loadAllData();
      renderAppShell();
      showScreen("app-shell");
    } catch (err) {
      console.error("[Renovo+] enterAppShell:", err);
      alert("Erro ao carregar dados: " + (err.message || err));
      showScreen("home-screen");
    }
  }

  function renderAppShell() {
    const badge = $("access-badge");
    const note = $("access-note");
    if (badge) {
      const labels = { admin: "Admin", pastor: "Pastor", coordinator: "Coordenador", leader: "Líder", pending: "Pendente" };
      badge.textContent = labels[session?.role] || session?.role || "";
    }
    if (note) {
      const cells = getAccessibleCells();
      note.textContent = cells.length
        ? `Você acessa ${cells.length} célula${cells.length !== 1 ? "s" : ""}.`
        : "Sem células vinculadas.";
    }

    const accessCells = getAccessibleCells();
    const totalMembers = accessCells.reduce((s, c) => s + (c.members?.length || 0), 0);
    $("total-cells").textContent = accessCells.length;
    $("total-members").textContent = totalMembers;

    const importCard = $("import-members-card");
    if (importCard) importCard.hidden = !isAdminOrPastor();

    const accessCard = $("manage-access-card");
    if (accessCard) accessCard.hidden = !canManageAccess();
  }

  // ─── DATA LOADING ─────────────────────────────────────────────────────────
  async function loadAllData() {
    const profile = session;
    const [cells, members, reports, studies, visitors] = await Promise.all([
      fb().listAccessibleCells(profile),
      fb().listAccessibleMembers(profile),
      fb().listAccessibleReports(profile),
      fb().listAccessibleStudies(profile),
      fb().listAccessibleVisitors(profile),
    ]);

    state.cells = cells.map((cell) => ({
      ...cell,
      leader: extractLeaderFromNotes(cell.notes),
      members: members
        .filter((m) => m.cellId === cell.id && m.status !== "inactive")
        .map((m) => ({ id: m.id, name: m.name, phone: m.phone || "", roleInCell: m.roleInCell || "member" })),
    }));

    state.reports = reports;
    state.studies = studies;
    state.visitors = visitors;

    if (isAdminOrPastor() || isCoordinator()) {
      try { state.profiles = await fb().listProfiles(); } catch (_) { state.profiles = []; }
    }
  }

  // ─── LOGOUT ───────────────────────────────────────────────────────────────
  async function handleLogout() {
    try { await fb().signOut(); } catch (_) {}
    session = null;
    state = { cells: [], reports: [], studies: [], visitors: [], profiles: [] };
  }

  function setLoadingText(msg) {
    const el = document.querySelector("#loading-screen .loading-text");
    if (el) el.textContent = msg;
  }

  // ─── MODAL: CRIAR / EDITAR CÉLULA ─────────────────────────────────────────
  function setupCellModal() {
    $("close-cell-modal")?.addEventListener("click", () => {
      closeModal("cell-modal");
      editingCellId = null;
    });

    $("cell-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
      const btn = form.querySelector('[type="submit"]');
      setButtonLoading(btn, true, "Salvando...");
      const name = form.elements.name.value.trim();
      const neighborhood = form.elements.neighborhood.value.trim();
      const meetingDay = form.elements.meetingDay.value;
      const meetingTime = form.elements.meetingTime.value;
      const leader = form.elements.leader.value.trim();
      const notes = leader ? `Lider: ${leader}` : "";
      try {
        await fb().saveCell(
          { id: editingCellId || undefined, name, address: neighborhood, meetingDay, meetingTime, leaderUid: "", coLeaderUids: [], status: "active", notes },
          session.uid
        );
        closeModal("cell-modal");
        editingCellId = null;
        form.reset();
        await loadAllData();
        renderAppShell();
        if (!$("cells-modal").hidden) renderCellsList();
      } catch (err) {
        alert("Erro ao salvar célula: " + (err.message || err));
      } finally {
        setButtonLoading(btn, false);
      }
    });
  }

  function openCreateCellModal() {
    if (!canManageCells()) { alert("Apenas admin ou pastor podem criar células."); return; }
    editingCellId = null;
    $("cell-form")?.reset();
    if ($("cell-modal-title")) $("cell-modal-title").textContent = "Nova célula";
    openModal("cell-modal");
  }

  function openEditCellModal(cellId) {
    if (!canManageCells()) return;
    const cell = state.cells.find((c) => c.id === cellId);
    if (!cell) return;
    editingCellId = cellId;
    const form = $("cell-form");
    if (!form) return;
    form.elements.name.value = cell.name || "";
    form.elements.neighborhood.value = cell.address || "";
    form.elements.meetingDay.value = cell.meetingDay || "";
    form.elements.meetingTime.value = cell.meetingTime || "";
    form.elements.leader.value = getCellLeader(cell);
    if ($("cell-modal-title")) $("cell-modal-title").textContent = "Editar célula";
    openModal("cell-modal");
  }

  // ─── MODAL: ADICIONAR MEMBRO ───────────────────────────────────────────────
  function setupMemberModal() {
    $("close-member-modal")?.addEventListener("click", () => closeModal("member-modal"));
    $("view-cells-card")?.addEventListener("click", () => {
      closeModal("member-modal");
      openCellsListModal();
    });

    $("member-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
      const btn = form.querySelector('[type="submit"]');
      const cellId = form.elements.cellId.value;
      const name = form.elements.memberName.value.trim();
      const phone = form.elements.memberPhone.value.trim();
      if (!cellId || !name) return;
      setButtonLoading(btn, true, "Adicionando...");
      try {
        await fb().saveMember(
          { cellId, name, phone, roleInCell: "member", status: "active", joinedAt: todayISO(), notes: "" },
          session.uid
        );
        form.elements.memberName.value = "";
        form.elements.memberPhone.value = "";
        await loadAllData();
        renderAppShell();
        populateMemberCellSelect();
      } catch (err) {
        alert("Erro ao adicionar membro: " + (err.message || err));
      } finally {
        setButtonLoading(btn, false);
      }
    });
  }

  function openAddMemberModal() {
    populateMemberCellSelect();
    openModal("member-modal");
  }

  function populateMemberCellSelect() {
    const sel = $("member-cell");
    if (!sel) return;
    const cells = getAccessibleCells();
    sel.innerHTML = cells.length
      ? cells.map((c) => `<option value="${escHtml(c.id)}">${escHtml(c.name)}</option>`).join("")
      : `<option value="">Cadastre uma célula primeiro</option>`;
  }

  // ─── MODAL: IMPORTAR MEMBROS ───────────────────────────────────────────────
  function setupImportMembersModal() {
    $("close-import-members-modal")?.addEventListener("click", () => closeModal("import-members-modal"));

    $("import-members-textarea")?.addEventListener("input", () => {
      const names = ($("import-members-textarea")?.value || "").split("\n").map((l) => l.trim()).filter(Boolean);
      const prev = $("import-members-preview");
      if (prev) prev.textContent = names.length ? `${names.length} membro(s) para importar.` : "";
    });

    $("import-members-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
      const btn = form.querySelector('[type="submit"]');
      const cellId = form.elements.cellId.value;
      const names = (form.elements.memberNames.value || "").split("\n").map((l) => l.trim()).filter(Boolean);
      if (!cellId || !names.length) return;
      setButtonLoading(btn, true, `Importando ${names.length}...`);
      let ok = 0;
      try {
        for (const name of names) {
          await fb().saveMember(
            { cellId, name, phone: "", roleInCell: "member", status: "active", joinedAt: todayISO(), notes: "Importado em lote." },
            session.uid
          );
          ok++;
        }
        form.reset();
        if ($("import-members-preview")) $("import-members-preview").textContent = "";
        closeModal("import-members-modal");
        await loadAllData();
        renderAppShell();
        alert(`${ok} membro(s) importados!`);
      } catch (err) {
        alert(`Importados ${ok} de ${names.length}. Erro: ${err.message || err}`);
      } finally {
        setButtonLoading(btn, false);
      }
    });
  }

  function openImportMembersModal() {
    if (!isAdminOrPastor()) return;
    const sel = $("import-members-cell");
    if (sel) {
      sel.innerHTML = `<option value="">Selecione a célula</option>` +
        state.cells.map((c) => `<option value="${escHtml(c.id)}">${escHtml(c.name)}</option>`).join("");
    }
    openModal("import-members-modal");
  }

  // ─── MODAL: VER CÉLULAS ───────────────────────────────────────────────────
  function setupCellsModal() {
    $("close-cells-modal")?.addEventListener("click", () => closeModal("cells-modal"));
  }

  function openCellsListModal() {
    renderCellsList();
    openModal("cells-modal");
  }

  function renderCellsList() {
    const container = $("cells-list");
    if (!container) return;
    const cells = getAccessibleCells();
    if (!cells.length) {
      container.innerHTML = `<p style="padding:1rem;color:var(--ink-soft)">Nenhuma célula cadastrada.</p>`;
      return;
    }
    container.innerHTML = cells
      .map((cell) => {
        const leader = getCellLeader(cell);
        const canEdit = canManageCells() || session.primaryCellId === cell.id;
        const membersHtml = (cell.members || [])
          .map((m) =>
            `<div class="member-row">
              <span>${escHtml(m.name)}${m.phone ? ` <small style="color:var(--ink-soft)">${escHtml(m.phone)}</small>` : ""}</span>
              ${canEdit ? `<button type="button" class="ghost-btn compact-btn danger-btn" onclick="window._deleteMember('${escHtml(m.id)}','${escHtml(cell.id)}')">Remover</button>` : ""}
            </div>`
          ).join("");

        return `<div class="cell-card">
          <div class="cell-card-head">
            <div>
              <strong>${escHtml(cell.name)}</strong>
              ${leader ? `<small style="display:block;color:var(--ink-soft)">Líder: ${escHtml(leader)}</small>` : ""}
              <small style="color:var(--ink-soft)">${[cell.meetingDay, cell.meetingTime, cell.address].filter(Boolean).map(escHtml).join(" · ")}</small>
            </div>
            <div style="display:flex;gap:0.4rem">
              ${canManageCells() ? `<button type="button" class="ghost-btn compact-btn" onclick="window._editCell('${escHtml(cell.id)}')">Editar</button>` : ""}
              ${canManageCells() ? `<button type="button" class="ghost-btn compact-btn danger-btn" onclick="window._deleteCell('${escHtml(cell.id)}')">Excluir</button>` : ""}
            </div>
          </div>
          <div class="cell-members">
            <p style="margin:0.5rem 0 0.25rem;font-size:0.85rem;font-weight:600">${(cell.members || []).length} membro(s)</p>
            ${membersHtml || `<p style="font-size:0.85rem;color:var(--ink-soft)">Nenhum membro.</p>`}
          </div>
        </div>`;
      }).join("");
  }

  window._editCell = function (cellId) {
    closeModal("cells-modal");
    openEditCellModal(cellId);
  };

  window._deleteCell = async function (cellId) {
    const cell = state.cells.find((c) => c.id === cellId);
    if (!cell) return;
    if (!confirm(`Excluir célula "${cell.name}"? Isso remove todos os membros, relatórios e visitantes desta célula.`)) return;
    try {
      await fb().deleteCell(cellId);
      await loadAllData();
      renderAppShell();
      renderCellsList();
    } catch (err) { alert("Erro ao excluir: " + (err.message || err)); }
  };

  window._deleteMember = async function (memberId, cellId) {
    const cell = state.cells.find((c) => c.id === cellId);
    const member = (cell?.members || []).find((m) => m.id === memberId);
    if (!confirm(`Remover "${member?.name || "membro"}"?`)) return;
    try {
      await fb().deleteMember(memberId);
      await loadAllData();
      renderAppShell();
      renderCellsList();
    } catch (err) { alert("Erro: " + (err.message || err)); }
  };

  // ─── MODAL: RELATÓRIO SEMANAL ──────────────────────────────────────────────
  let foodItems = [];
  let reportImages = []; // { url: objectURL, name, file, uploadedUrl }
  let existingImageUrls = []; // URLs already saved in Firestore for the report being edited

  function setupReportModal() {
    $("close-report-modal")?.addEventListener("click", () => {
      closeModal("report-modal");
      editingReportId = null;
    });

    $("report-cell")?.addEventListener("change", () => {
      populateAttendanceList($("report-cell").value);
      updateReportHistory();
    });

    $("mark-all-attendance")?.addEventListener("click", () => {
      document.querySelectorAll("#attendance-list input[type='checkbox']").forEach((cb) => (cb.checked = true));
    });
    $("clear-attendance")?.addEventListener("click", () => {
      document.querySelectorAll("#attendance-list input[type='checkbox']").forEach((cb) => (cb.checked = false));
    });

    $("foods-yes")?.addEventListener("change", () => {
      const wrap = $("foods-list-wrap");
      if (wrap) wrap.hidden = false;
      renderFoodItems();
    });
    $("foods-no")?.addEventListener("change", () => {
      const wrap = $("foods-list-wrap");
      if (wrap) wrap.hidden = true;
    });
    $("add-food-btn")?.addEventListener("click", () => { foodItems.push(""); renderFoodItems(); });

    $("add-image-btn")?.addEventListener("click", () => $("image-file-input")?.click());
    $("image-file-input")?.addEventListener("change", (e) => {
      Array.from(e.target.files || []).forEach((file) => {
        reportImages.push({ url: URL.createObjectURL(file), name: file.name, file });
      });
      renderReportImages();
      e.target.value = "";
    });

    $("copy-report")?.addEventListener("click", () => {
      const ta = $("report-output");
      if (!ta || !ta.value) return;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(ta.value).catch(() => { ta.select(); document.execCommand("copy"); });
      } else {
        ta.select(); document.execCommand("copy");
      }
    });

    $("report-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      await handleReportSubmit(e.target);
    });
  }

  function openReportModal() {
    editingReportId = null;
    foodItems = [];
    reportImages = [];
    existingImageUrls = [];
    $("report-form")?.reset();
    if ($("report-mode-note")) $("report-mode-note").hidden = true;
    if ($("report-output")) $("report-output").value = "";
    if ($("report-chart-wrap")) $("report-chart-wrap").hidden = true;
    if ($("report-line-wrap")) $("report-line-wrap").hidden = true;
    if ($("foods-list-wrap")) $("foods-list-wrap").hidden = true;

    populateReportCellSelect();
    const firstCellId = $("report-cell")?.value;
    if (firstCellId) {
      populateAttendanceList(firstCellId);
      updateReportHistory();
    }
    renderFoodItems();
    renderVisitorSection();
    renderReportImages();
    openModal("report-modal");
  }

  function populateReportCellSelect() {
    const sel = $("report-cell");
    if (!sel) return;
    const cells = getAccessibleCells();
    sel.innerHTML = cells.length
      ? cells.map((c) => `<option value="${escHtml(c.id)}">${escHtml(c.name)}</option>`).join("")
      : `<option value="">Cadastre uma célula primeiro</option>`;
    if (!isAdminOrPastor() && session?.primaryCellId) {
      const exists = cells.some((c) => c.id === session.primaryCellId);
      if (exists) sel.value = session.primaryCellId;
    }
  }

  function populateAttendanceList(cellId) {
    const container = $("attendance-list");
    if (!container) return;
    const cell = state.cells.find((c) => c.id === cellId);
    const members = cell?.members || [];
    if (!members.length) {
      container.innerHTML = `<p style="color:var(--ink-soft);font-size:0.9rem">Nenhum membro cadastrado nesta célula.</p>`;
      return;
    }
    container.innerHTML = members
      .map((m) =>
        `<label class="attendance-item">
          <input type="checkbox" name="present" value="${escHtml(m.id)}" data-member-name="${escHtml(m.name)}" />
          ${escHtml(m.name)}
        </label>`
      ).join("");
  }

  function renderFoodItems() {
    const list = $("foods-items-list");
    if (!list) return;
    list.innerHTML = foodItems
      .map((item, i) =>
        `<div style="display:flex;gap:0.4rem;margin-bottom:0.3rem">
          <input type="text" value="${escHtml(item)}" placeholder="Ex: frango, arroz..."
            style="flex:1;padding:0.35rem 0.5rem;border:1px solid var(--line);border-radius:0.4rem;font-size:0.9rem"
            oninput="window._setFoodItem(${i},this.value)" />
          <button type="button" class="ghost-btn compact-btn danger-btn" onclick="window._removeFoodItem(${i})">×</button>
        </div>`
      ).join("");
  }

  window._setFoodItem = (i, val) => { foodItems[i] = val; };
  window._removeFoodItem = (i) => { foodItems.splice(i, 1); renderFoodItems(); };

  function renderVisitorSection() {
    const panel = $("visitor-panel-first");
    if (!panel) return;
    panel.innerHTML =
      `<div style="margin-bottom:0.5rem">
        <label style="display:block;margin-bottom:0.25rem;font-size:0.9rem;font-weight:600">
          Nomes dos visitantes <small style="font-weight:400;color:var(--ink-soft)">(um por linha)</small>
        </label>
        <textarea id="visitor-names-input" rows="3"
          style="width:100%;padding:0.4rem 0.6rem;border:1px solid var(--line);border-radius:0.5rem;font-family:inherit;font-size:0.9rem;resize:vertical;box-sizing:border-box"
          placeholder="João Pereira&#10;Maria Santos"></textarea>
      </div>
      <label style="display:block;font-size:0.9rem;font-weight:600;margin-bottom:0.25rem">Total de visitantes</label>
      <input type="number" id="visitors-count-input" min="0" step="1" value="0"
        style="width:100%;padding:0.4rem 0.6rem;border:1px solid var(--line);border-radius:0.5rem;font-size:0.9rem" />`;

    const namesTa = $("visitor-names-input");
    if (namesTa) {
      namesTa.addEventListener("input", () => {
        const names = namesTa.value.split("\n").map((l) => l.trim()).filter(Boolean);
        const countInp = $("visitors-count-input");
        if (countInp) countInp.value = names.length;
      });
    }
  }

  function renderReportImages() {
    const container = $("images-list");
    const countLabel = $("images-count-label");
    if (container) {
      const existingHtml = existingImageUrls.map((url, i) =>
        `<div class="image-thumb-wrap" style="position:relative;display:inline-block;margin:0.2rem">
          <img src="${escHtml(url)}" alt="" style="width:80px;height:80px;object-fit:cover;border-radius:0.4rem;display:block;cursor:pointer"
            onclick="window._openImageFull('${escHtml(url)}')" />
          <button type="button" class="ghost-btn" onclick="window._removeExistingImage(${i})"
            style="position:absolute;top:2px;right:2px;padding:0 4px;font-size:0.75rem;background:rgba(0,0,0,0.5);color:#fff;border:none;border-radius:0.3rem;cursor:pointer">×</button>
          <span style="position:absolute;bottom:2px;left:2px;font-size:0.6rem;background:rgba(0,0,0,0.5);color:#fff;padding:1px 3px;border-radius:2px">salva</span>
        </div>`
      ).join("");

      const newHtml = reportImages.map((img, i) =>
        `<div class="image-thumb-wrap" style="position:relative;display:inline-block;margin:0.2rem">
          <img src="${img.url}" alt="" style="width:80px;height:80px;object-fit:cover;border-radius:0.4rem;display:block" />
          <button type="button" class="ghost-btn" onclick="window._removeReportImage(${i})"
            style="position:absolute;top:2px;right:2px;padding:0 4px;font-size:0.75rem;background:rgba(0,0,0,0.5);color:#fff;border:none;border-radius:0.3rem;cursor:pointer">×</button>
        </div>`
      ).join("");

      container.innerHTML = existingHtml + newHtml;
    }
    const total = existingImageUrls.length + reportImages.length;
    if (countLabel) countLabel.textContent = total ? `(${total})` : "";
  }

  window._removeReportImage = (i) => { reportImages.splice(i, 1); renderReportImages(); };
  window._removeExistingImage = (i) => { existingImageUrls.splice(i, 1); renderReportImages(); };
  window._openImageFull = (url) => { window.open(url, "_blank", "noopener"); };

  async function uploadReportImages(reportId) {
    const storage = fb().storage;
    if (!storage || !reportImages.length) return [];
    const urls = [];
    for (const img of reportImages) {
      if (!img.file) continue;
      try {
        const ext = img.name.split(".").pop() || "jpg";
        const path = `renovo-plus/reports/${reportId}/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;
        const snap = await storage.ref(path).put(img.file);
        const url = await snap.ref.getDownloadURL();
        urls.push(url);
      } catch (err) {
        console.warn("[Renovo+] upload image:", err?.message || err);
      }
    }
    return urls;
  }

  async function handleReportSubmit(form) {
    const btn = $("generate-report-btn");
    const hasNewImages = reportImages.some((img) => img.file);
    setButtonLoading(btn, true, hasNewImages ? "Enviando fotos..." : "Gerando...");

    const cellId = form.elements.cellId.value;
    const date = form.elements.date.value;
    const leaders = form.elements.leaders.value.trim();
    const coLeaders = form.elements.coLeaders.value.trim();
    const host = form.elements.host.value.trim();
    const address = form.elements.address.value.trim();
    const communionMinutes = form.elements.communionMinutes.value;
    const snack = form.querySelector('input[name="snack"]:checked')?.value || "";
    const discipleship = form.querySelector('input[name="discipleship"]:checked')?.value || "";
    const offering = parseFloat(form.elements.offering.value) || 0;

    const presentCheckboxes = Array.from(form.querySelectorAll('input[name="present"]:checked'));
    const presentMemberIds = presentCheckboxes.map((cb) => cb.value);
    const presentCount = presentMemberIds.length;

    const cell = state.cells.find((c) => c.id === cellId);
    const allMembers = cell?.members || [];
    const absentMembers = allMembers.filter((m) => !presentMemberIds.includes(m.id));

    const visitorNamesRaw = $("visitor-names-input")?.value || "";
    const visitorNames = visitorNamesRaw.split("\n").map((l) => l.trim()).filter(Boolean).join(", ");
    const visitorsCount = parseInt($("visitors-count-input")?.value) || 0;

    const foodsToggle = form.querySelector('input[name="foodsToggle"]:checked')?.value;
    const foodsStr = foodsToggle === "sim" ? foodItems.filter(Boolean).join(", ") : "";

    try {
      // Determine the report ID upfront so we can use it as Storage path
      const targetId = editingReportId || fb().db.collection("renovo_plus_reports").doc().id;

      // Upload new images first
      const newImageUrls = await uploadReportImages(targetId);
      const allImageUrls = [...existingImageUrls, ...newImageUrls];

      const saved = await fb().saveReport(
        {
          id: targetId,
          cellId, date, leaders, coLeaders, host, address,
          presentMemberIds, presentCount,
          visitorsCount, visitorNames,
          offering, snack, discipleship, communionMinutes,
          foods: foodsStr, notes: "",
          imageUrls: allImageUrls,
        },
        session.uid
      );
      editingReportId = saved.id;
      // Update local image state after save
      reportImages = [];
      existingImageUrls = saved.imageUrls || [];
      renderReportImages();

      await loadAllData();
      renderAppShell();

      const presentNames = presentCheckboxes.map((cb) => cb.dataset.memberName || cb.value);
      const text = buildReportText({
        cell, date, leaders, coLeaders, host, address,
        presentNames, presentCount, allMembersCount: allMembers.length,
        absentMembers, visitorsCount, visitorNames,
        offering, snack, discipleship, communionMinutes, foods: foodsStr,
      });
      $("report-output").value = text;

      // Show photo gallery in output panel
      const gallery = $("report-images-gallery");
      if (gallery) {
        if (allImageUrls.length) {
          gallery.hidden = false;
          gallery.innerHTML = `<p style="font-size:0.85rem;font-weight:600;margin:0 0 0.5rem">📸 Fotos (${allImageUrls.length})</p>` +
            `<div style="display:flex;flex-wrap:wrap;gap:0.4rem">` +
            allImageUrls.map((url) =>
              `<a href="${escHtml(url)}" target="_blank" rel="noopener">
                <img src="${escHtml(url)}" alt="" style="width:72px;height:72px;object-fit:cover;border-radius:0.4rem;display:block" />
              </a>`
            ).join("") + `</div>`;
        } else {
          gallery.hidden = true;
          gallery.innerHTML = "";
        }
      }

      updateReportHistory();
      drawReportCharts(cellId, presentCount, allMembers.length, visitorsCount);

      const modeNote = $("report-mode-note");
      if (modeNote) {
        modeNote.textContent = `Relatório salvo com sucesso!`;
        modeNote.hidden = false;
      }
    } catch (err) {
      alert("Erro ao salvar relatório: " + (err.message || err));
    } finally {
      setButtonLoading(btn, false);
    }
  }

  function buildReportText({ cell, date, leaders, coLeaders, host, address, presentNames, presentCount, allMembersCount, absentMembers, visitorsCount, visitorNames, offering, snack, discipleship, communionMinutes, foods }) {
    const lines = [];
    const cellName = cell?.name || "";
    lines.push(`📋 *RELATÓRIO SEMANAL – ${cellName.toUpperCase()}*`);
    lines.push("");
    lines.push(`📅 *Data:* ${fmtDate(date)}`);
    if (address) lines.push(`📍 *Local:* ${address}`);
    if (host) lines.push(`🏠 *Anfitrião:* ${host}`);
    lines.push("");
    lines.push(`👤 *Líder(es):* ${leaders}`);
    if (coLeaders) lines.push(`👥 *Co-líder(es):* ${coLeaders}`);
    lines.push("");
    lines.push(`✅ *Presentes:* ${presentCount}${allMembersCount ? ` / ${allMembersCount}` : ""}`);
    if (presentNames.length) lines.push(`   ${presentNames.join(", ")}`);
    if (absentMembers.length) lines.push(`❌ *Ausentes:* ${absentMembers.map((m) => m.name).join(", ")}`);
    lines.push("");
    lines.push(`🙋 *Visitantes:* ${visitorsCount}`);
    if (visitorNames) lines.push(`   ${visitorNames}`);
    lines.push("");
    if (offering > 0) lines.push(`💰 *Oferta:* R$ ${fmtMoney(offering)}`);
    if (snack) lines.push(`🍽️ *Lanche:* ${snack}`);
    if (foods) lines.push(`🥘 *Alimentos:* ${foods}`);
    if (discipleship) lines.push(`📖 *Discipulado:* ${discipleship}`);
    if (communionMinutes) lines.push(`🍷 *Ceia:* ${communionMinutes} min`);
    lines.push("");
    lines.push("🌿 Igreja Renovo – Ambiente de Células");
    return lines.join("\n");
  }

  function updateReportHistory() {
    const cellId = $("report-cell")?.value;
    if (!cellId) return;
    const cellReports = state.reports
      .filter((r) => r.cellId === cellId)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 20);

    const histCount = $("report-history-count");
    if (histCount) histCount.textContent = `${cellReports.length} relatório(s)`;

    const histList = $("report-history-list");
    if (histList) {
      histList.innerHTML = cellReports.length
        ? cellReports.map((r) =>
            `<div class="report-history-item">
              <div class="report-history-item-head">
                <strong>${fmtDate(r.date)}</strong>
                <span style="font-size:0.8rem;color:var(--ink-soft)">${r.presentCount} presentes · ${r.visitorsCount} visitante(s)</span>
              </div>
              ${r.leaders ? `<small style="color:var(--ink-soft)">${escHtml(r.leaders)}</small>` : ""}
              <div style="display:flex;gap:0.4rem;margin-top:0.3rem">
                <button type="button" class="ghost-btn compact-btn" onclick="window._editReport('${escHtml(r.id)}')">Editar</button>
                <button type="button" class="ghost-btn compact-btn danger-btn" onclick="window._deleteReport('${escHtml(r.id)}')">Excluir</button>
              </div>
            </div>`
          ).join("")
        : `<p style="color:var(--ink-soft);font-size:0.9rem">Nenhum relatório registrado.</p>`;
    }

    if (cellReports.length > 1) {
      const wrap = $("report-line-wrap");
      if (wrap) wrap.hidden = false;
      drawLineChart(cellReports.slice().reverse());
    }
  }

  window._editReport = function (reportId) {
    const report = state.reports.find((r) => r.id === reportId);
    if (!report) return;
    editingReportId = reportId;
    const form = $("report-form");
    if (!form) return;

    $("report-cell").value = report.cellId;
    form.elements.date.value = report.date;
    form.elements.leaders.value = report.leaders || "";
    form.elements.coLeaders.value = report.coLeaders || "";
    form.elements.host.value = report.host || "";
    form.elements.address.value = report.address || "";
    form.elements.communionMinutes.value = report.communionMinutes || "";
    form.elements.offering.value = report.offering || "";

    const snackRadio = form.querySelector(`input[name="snack"][value="${escHtml(report.snack || "")}"]`);
    if (snackRadio) snackRadio.checked = true;
    const discRadio = form.querySelector(`input[name="discipleship"][value="${escHtml(report.discipleship || "")}"]`);
    if (discRadio) discRadio.checked = true;

    if (report.foods) {
      const foodsYes = $("foods-yes");
      if (foodsYes) foodsYes.checked = true;
      const wrap = $("foods-list-wrap");
      if (wrap) wrap.hidden = false;
      foodItems = report.foods.split(",").map((s) => s.trim()).filter(Boolean);
      renderFoodItems();
    }

    populateAttendanceList(report.cellId);
    setTimeout(() => {
      (report.presentMemberIds || []).forEach((id) => {
        const cb = form.querySelector(`input[type='checkbox'][value='${id}']`);
        if (cb) cb.checked = true;
      });
    }, 50);

    renderVisitorSection();
    setTimeout(() => {
      const namesTa = $("visitor-names-input");
      if (namesTa) namesTa.value = report.visitorNames || "";
      const countInp = $("visitors-count-input");
      if (countInp) countInp.value = report.visitorsCount || 0;
    }, 50);

    // Load existing images
    reportImages = [];
    existingImageUrls = Array.isArray(report.imageUrls) ? [...report.imageUrls] : [];
    renderReportImages();

    updateReportHistory();
    const modeNote = $("report-mode-note");
    if (modeNote) { modeNote.textContent = `Editando relatório de ${fmtDate(report.date)}.`; modeNote.hidden = false; }
    openModal("report-modal");
  };

  window._deleteReport = async function (reportId) {
    if (!confirm("Excluir este relatório?")) return;
    try {
      await fb().deleteReport(reportId);
      await loadAllData();
      updateReportHistory();
      renderAppShell();
    } catch (err) { alert("Erro ao excluir: " + (err.message || err)); }
  };

  // ─── CHARTS ───────────────────────────────────────────────────────────────
  function drawDonutChart(canvasId, legendId, present, absent, visitors) {
    const canvas = $(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const total = present + absent + visitors;
    if (!total) { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
    const slices = [
      { value: present, color: "#7a1118" },
      { value: absent, color: "#b9343a" },
      { value: visitors, color: "#b68a64" },
    ];
    const cx = canvas.width / 2, cy = canvas.height / 2;
    const outerR = Math.min(cx, cy) - 4;
    const innerR = outerR * 0.55;
    let angle = -Math.PI / 2;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    slices.forEach((sl) => {
      if (!sl.value) return;
      const sweep = (sl.value / total) * 2 * Math.PI;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, outerR, angle, angle + sweep);
      ctx.closePath();
      ctx.fillStyle = sl.color;
      ctx.fill();
      angle += sweep;
    });
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, 2 * Math.PI);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--surface").trim() || "#fff";
    ctx.fill();
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#111";
    ctx.font = `bold ${Math.round(outerR * 0.38)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(present, cx, cy);
    const legend = $(legendId);
    if (legend) {
      const labels = ["Presentes", "Faltantes", "Visitantes"];
      const vals = [present, absent, visitors];
      const colors = ["#7a1118", "#b9343a", "#b68a64"];
      legend.innerHTML = labels.map((l, i) =>
        `<span class="chart-legend-item"><span class="chart-legend-dot" style="background:${colors[i]}"></span>${l}: ${vals[i]}</span>`
      ).join("");
    }
  }

  function drawReportCharts(cellId, presentCount, totalMembers, visitorsCount) {
    const absent = Math.max(0, totalMembers - presentCount);
    drawDonutChart("report-chart", "report-chart-legend", presentCount, absent, visitorsCount);
    if ($("report-chart-wrap")) $("report-chart-wrap").hidden = false;

    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 180);
    const cellReports = state.reports.filter((r) => r.cellId === cellId && new Date(r.date) >= cutoff);
    if (cellReports.length) {
      const avgP = Math.round(cellReports.reduce((s, r) => s + r.presentCount, 0) / cellReports.length);
      const avgV = Math.round(cellReports.reduce((s, r) => s + r.visitorsCount, 0) / cellReports.length);
      drawDonutChart("cell-average-chart", "cell-average-legend", avgP, Math.max(0, totalMembers - avgP), avgV);
    }

    if (isAdminOrPastor()) {
      const allR = state.reports.filter((r) => new Date(r.date) >= cutoff);
      if (allR.length) {
        const avgP = Math.round(allR.reduce((s, r) => s + r.presentCount, 0) / allR.length);
        const avgV = Math.round(allR.reduce((s, r) => s + r.visitorsCount, 0) / allR.length);
        drawDonutChart("overall-average-chart", "overall-average-legend", avgP, 0, avgV);
      }
      const card = $("overall-average-card");
      if (card) card.hidden = false;
    } else {
      const card = $("overall-average-card");
      if (card) card.hidden = true;
    }
  }

  function drawLineChart(reports) {
    const canvas = $("report-line-chart");
    if (!canvas || !reports.length) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const pad = { top: 10, right: 10, bottom: 24, left: 28 };
    const chartW = W - pad.left - pad.right;
    const chartH = H - pad.top - pad.bottom;
    const maxVal = Math.max(1, ...reports.map((r) => Math.max(r.presentCount, r.visitorsCount)));
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = "#eee"; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (chartH / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + chartW, y); ctx.stroke();
    }
    const xStep = reports.length > 1 ? chartW / (reports.length - 1) : 0;
    const yScale = (v) => pad.top + chartH - (v / maxVal) * chartH;
    function drawLine(data, color) {
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2;
      data.forEach((v, i) => {
        const x = pad.left + i * xStep, y = yScale(v);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
      data.forEach((v, i) => {
        ctx.beginPath(); ctx.arc(pad.left + i * xStep, yScale(v), 3, 0, 2 * Math.PI);
        ctx.fillStyle = color; ctx.fill();
      });
    }
    drawLine(reports.map((r) => r.presentCount), "#7a1118");
    drawLine(reports.map((r) => r.visitorsCount), "#b68a64");
    ctx.fillStyle = "#888"; ctx.font = "9px sans-serif"; ctx.textAlign = "center";
    reports.forEach((r, i) => {
      ctx.fillText(String(r.date || "").slice(5).replace("-", "/"), pad.left + i * xStep, H - 6);
    });
  }

  // ─── MODAL: GERENCIAR ACESSOS ──────────────────────────────────────────────
  function setupAccessModal() {
    $("close-access-modal")?.addEventListener("click", () => { closeModal("access-modal"); resetAccessForm(); });
    $("cancel-access-edit")?.addEventListener("click", resetAccessForm);

    const accessForm = $("access-form");
    if (accessForm) {
      accessForm.querySelector('select[name="role"]')?.addEventListener("change", updateAccessFormVisibility);
      accessForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        await handleAccessSubmit(accessForm);
      });
    }

    // Fallback: direct click on save button
    $("save-access-button")?.addEventListener("click", async () => {
      const form = $("access-form");
      if (!form) return;
      if (!form.reportValidity()) return;
      await handleAccessSubmit(form);
    });
  }

  function resetAccessForm() {
    const form = $("access-form");
    if (!form) return;
    form.reset();
    form.elements.userUid.value = "";
    editingAccessUid = null;
    if ($("save-access-button")) $("save-access-button").textContent = "Salvar acesso";
    if ($("cancel-access-edit")) $("cancel-access-edit").hidden = true;
    if ($("email-label")) $("email-label").style.display = "";
    if ($("password-label")) $("password-label").style.display = "";
    if ($("status-label")) $("status-label").style.display = "none";
    showFeedback("access-feedback", "");
    updateAccessFormVisibility();
  }

  function updateAccessFormVisibility() {
    const form = $("access-form");
    if (!form) return;
    const role = form.elements.role?.value;
    if ($("assigned-cell-label")) $("assigned-cell-label").style.display = role === "leader" ? "" : "none";
    if ($("scope-cells-label")) $("scope-cells-label").style.display = role === "coordinator" ? "" : "none";
    if ($("scope-cells-checkboxes")) $("scope-cells-checkboxes").style.display = role === "coordinator" ? "" : "none";
  }

  async function openAccessModal() {
    try {
      if (!canManageAccess()) return;
      await loadAllData();
      renderAccessUsers();
      populateAccessCellSelects();
      resetAccessForm();
      const form = $("access-form");
      if (form) {
        const roleSelect = form.querySelector('select[name="role"]');
        if (roleSelect) {
          if (isCoordinator()) {
            roleSelect.innerHTML = `<option value="leader">Líder de Célula</option>`;
          } else {
            roleSelect.innerHTML = `
              <option value="leader">Líder de Célula</option>
              <option value="coordinator">Coordenador</option>
              <option value="pastor">Pastor</option>
              <option value="admin">Admin</option>`;
          }
        }
      }
      openModal("access-modal");
    } catch (err) {
      alert("Erro ao abrir acessos: " + (err?.message || String(err)));
    }
  }

  function populateAccessCellSelects() {
    // Coordinators only see their own scope cells; admin/pastor see all
    const visibleCells = isCoordinator()
      ? state.cells.filter((c) => (session.scopeCellIds || []).includes(c.id))
      : state.cells;

    const cellSel = $("access-cell-select");
    if (cellSel) {
      cellSel.innerHTML = `<option value="">Selecione a célula</option>` +
        visibleCells.map((c) => `<option value="${escHtml(c.id)}">${escHtml(c.name)}</option>`).join("");
    }
    const scopeBox = $("scope-cells-checkboxes");
    if (scopeBox) {
      scopeBox.innerHTML = visibleCells
        .map((c) =>
          `<label style="display:flex;align-items:center;gap:0.4rem;padding:0.2rem 0;font-size:0.9rem;cursor:pointer">
            <input type="checkbox" value="${escHtml(c.id)}" onchange="window._syncScopeTextarea()" />
            ${escHtml(c.name)}
          </label>`
        ).join("");
    }
  }

  window._syncScopeTextarea = function () {
    const checked = Array.from(document.querySelectorAll("#scope-cells-checkboxes input:checked")).map((cb) => cb.value);
    const ta = $("access-scope-textarea");
    if (ta) ta.value = checked.join("\n");
  };

  function renderAccessUsers() {
    const container = $("access-users-list");
    if (!container) return;
    // Coordinators only see leaders whose primaryCellId is in their scope
    const scopeIds = new Set(session.scopeCellIds || []);
    const profiles = isCoordinator()
      ? state.profiles.filter((p) => p.role === "leader" && scopeIds.has(p.primaryCellId))
      : state.profiles;
    if (!profiles.length) {
      container.innerHTML = `<p style="color:var(--ink-soft)">Nenhum usuário cadastrado.</p>`;
      return;
    }
    const roleLabels = { admin: "Admin", pastor: "Pastor", coordinator: "Coordenador", leader: "Líder", pending: "Pendente" };
    const statusLabels = { active: "Ativo", inactive: "Inativo", pending: "Pendente" };
    container.innerHTML = profiles.map((p) =>
      `<div class="access-user-row">
        <div>
          <strong>${escHtml(p.name)}</strong>
          <small style="display:block;color:var(--ink-soft)">${escHtml(p.email)}</small>
          <small style="color:var(--ink-soft)">${roleLabels[p.role] || p.role} · ${statusLabels[p.status] || p.status}</small>
        </div>
        <div style="display:flex;gap:0.3rem;align-items:center">
          <button type="button" class="ghost-btn compact-btn" onclick="window._editAccess('${escHtml(p.uid)}')">Editar</button>
          ${p.uid !== session.uid
            ? `<button type="button" class="ghost-btn compact-btn danger-btn" onclick="window._toggleAccess('${escHtml(p.uid)}','${escHtml(p.name)}','${escHtml(p.status)}')">${p.status === "inactive" ? "Reativar" : "Desativar"}</button>`
            : ""}
        </div>
      </div>`
    ).join("");
  }

  window._editAccess = function (uid) {
    const p = state.profiles.find((pr) => pr.uid === uid);
    if (!p) return;
    editingAccessUid = uid;
    const form = $("access-form");
    if (!form) return;
    form.elements.userUid.value = uid;
    form.elements.name.value = p.name;
    form.elements.email.value = p.email;
    form.elements.role.value = p.role;
    if ($("password-label")) $("password-label").style.display = "none";
    if ($("email-label")) $("email-label").style.display = "none";
    if ($("status-label")) $("status-label").style.display = "";
    form.elements.status.value = p.status;
    if (p.role === "leader" && form.elements.assignedCellId) {
      form.elements.assignedCellId.value = p.primaryCellId || "";
    }
    if (p.role === "coordinator") {
      const scopeIds = p.scopeCellIds || [];
      document.querySelectorAll("#scope-cells-checkboxes input").forEach((cb) => {
        cb.checked = scopeIds.includes(cb.value);
      });
      window._syncScopeTextarea();
    }
    if ($("save-access-button")) $("save-access-button").textContent = "Salvar alterações";
    if ($("cancel-access-edit")) $("cancel-access-edit").hidden = false;
    updateAccessFormVisibility();
  };

  window._toggleAccess = async function (uid, name, currentStatus) {
    const newStatus = currentStatus === "inactive" ? "active" : "inactive";
    const label = newStatus === "inactive" ? "Desativar" : "Reativar";
    if (!confirm(`${label} acesso de "${name}"?`)) return;
    try {
      const p = state.profiles.find((pr) => pr.uid === uid);
      await fb().saveUserProfile(uid, { ...(p || {}), status: newStatus });
      await loadAllData();
      renderAccessUsers();
    } catch (err) { alert("Erro: " + (err.message || err)); }
  };

  async function handleAccessSubmit(form) {
    const btn = $("save-access-button");
    setButtonLoading(btn, true, "Salvando...");
    showFeedback("access-feedback", "");
    const uid = form.elements.userUid.value;
    const name = form.elements.name.value.trim();
    const email = form.elements.email.value.trim();
    const password = form.elements.password?.value || "";
    const role = form.elements.role.value;
    const status = form.elements.status?.value || "pending";
    const primaryCellId = role === "leader" ? (form.elements.assignedCellId?.value || "") : "";
    const scopeIds = role === "coordinator"
      ? Array.from(document.querySelectorAll("#scope-cells-checkboxes input:checked")).map((cb) => cb.value)
      : [];
    try {
      if (uid) {
        await fb().saveUserProfile(uid, { name, role, status, primaryCellId, scopeCellIds: scopeIds });
        showFeedback("access-feedback", "Perfil atualizado!");
      } else {
        if (!email || !name) throw new Error("Nome e e-mail são obrigatórios.");
        if (password.length < 6) throw new Error("Senha temporária: mínimo 6 caracteres.");
        const { uid: newUid } = await fb().provisionManagedAccess(
          { name, email, temporaryPassword: password, role: "pending", status: "pending", primaryCellId: "", scopeCellIds: [] },
          {}
        );
        await fb().saveUserProfile(newUid, { name, role, status: "active", primaryCellId, scopeCellIds: scopeIds });
        showFeedback("access-feedback", `Acesso criado para ${email}!`);
        form.reset();
        resetAccessForm();
      }
      await loadAllData();
      renderAccessUsers();
    } catch (err) {
      showFeedback("access-feedback", "Erro: " + (err.message || err), true);
    } finally {
      setButtonLoading(btn, false);
    }
  }

  // ─── MODAL: ESTUDOS ────────────────────────────────────────────────────────
  function setupStudiesModal() {
    $("close-studies-modal")?.addEventListener("click", () => closeModal("studies-modal"));
    $("cancel-study-edit")?.addEventListener("click", resetStudyForm);
    $("study-form")?.addEventListener("submit", async (e) => { e.preventDefault(); await handleStudySubmit(e.target); });
  }

  function resetStudyForm() {
    const form = $("study-form");
    if (!form) return;
    form.reset();
    form.elements.studyId.value = "";
    editingStudyId = null;
    if ($("save-study-button")) $("save-study-button").textContent = "Publicar estudo";
    if ($("cancel-study-edit")) $("cancel-study-edit").hidden = true;
    showFeedback("study-feedback", "");
  }

  async function openStudiesModal() {
    await loadAllData();
    renderStudiesList();
    resetStudyForm();
    const formWrap = $("studies-form-wrap");
    if (formWrap) formWrap.hidden = !isAdminOrPastor();
    openModal("studies-modal");
  }

  function renderStudiesList() {
    const container = $("studies-list");
    const countEl = $("studies-count");
    if (!container) return;
    if (countEl) countEl.textContent = `${state.studies.length} estudo(s)`;
    if (!state.studies.length) {
      container.innerHTML = `<p style="color:var(--ink-soft)">Nenhum estudo publicado ainda.</p>`;
      return;
    }
    container.innerHTML = state.studies.map((s) =>
      `<div class="study-row" style="display:flex;justify-content:space-between;align-items:flex-start;padding:0.75rem 0;border-bottom:1px solid var(--line);gap:0.5rem">
        <div style="flex:1;min-width:0">
          <strong>${escHtml(s.title)}</strong>
          ${s.description ? `<p style="margin:0.2rem 0 0;font-size:0.85rem;color:var(--ink-soft)">${escHtml(s.description)}</p>` : ""}
        </div>
        <div style="display:flex;gap:0.4rem;align-items:center;flex-shrink:0">
          ${s.downloadUrl ? `<a href="${escHtml(s.downloadUrl)}" target="_blank" rel="noopener" class="ghost-btn compact-btn">📄 Abrir</a>` : ""}
          ${isAdminOrPastor()
            ? `<button type="button" class="ghost-btn compact-btn" onclick="window._editStudy('${escHtml(s.id)}')">Editar</button>
               <button type="button" class="ghost-btn compact-btn danger-btn" onclick="window._deleteStudy('${escHtml(s.id)}')">Excluir</button>`
            : ""}
        </div>
      </div>`
    ).join("");
  }

  window._editStudy = function (studyId) {
    const s = state.studies.find((st) => st.id === studyId);
    if (!s) return;
    editingStudyId = studyId;
    const form = $("study-form");
    if (!form) return;
    form.elements.studyId.value = s.id;
    form.elements.title.value = s.title;
    form.elements.description.value = s.description || "";
    form.elements.pdfUrl.value = s.downloadUrl || "";
    if ($("save-study-button")) $("save-study-button").textContent = "Salvar alterações";
    if ($("cancel-study-edit")) $("cancel-study-edit").hidden = false;
  };

  window._deleteStudy = async function (studyId) {
    if (!confirm("Excluir este estudo?")) return;
    try {
      await fb().deleteStudy(studyId);
      await loadAllData();
      renderStudiesList();
    } catch (err) { alert("Erro: " + (err.message || err)); }
  };

  async function handleStudySubmit(form) {
    const btn = $("save-study-button");
    setButtonLoading(btn, true, "Salvando...");
    showFeedback("study-feedback", "");
    const studyId = form.elements.studyId.value;
    const title = form.elements.title.value.trim();
    const description = form.elements.description.value.trim();
    const pdfUrl = form.elements.pdfUrl.value.trim();
    const fileInput = $("study-pdf-file");
    const file = fileInput?.files?.[0] || null;

    if (!file && !studyId && !pdfUrl) {
      showFeedback("study-feedback", "Envie um arquivo PDF ou informe um link.", true);
      setButtonLoading(btn, false);
      return;
    }

    try {
      if (file) {
        await fb().saveStudy({ id: studyId || undefined, title, description, file }, session.uid);
      } else {
        // URL-based: write directly to Firestore
        const db = fb().db;
        const STUDIES = "renovo_plus_studies";
        const ref = studyId ? db.collection(STUDIES).doc(studyId) : db.collection(STUDIES).doc();
        const now = new Date().toISOString();
        const existing = studyId ? await ref.get() : null;
        const cur = existing?.exists ? existing.data() : null;
        await ref.set({
          id: ref.id, title, description,
          audience: "all",
          storagePath: cur?.storagePath || "",
          downloadUrl: pdfUrl || cur?.downloadUrl || "",
          fileName: cur?.fileName || `${title}.pdf`,
          createdAt: cur?.createdAt || now,
          updatedAt: now,
          createdByUid: cur?.createdByUid || session.uid,
          updatedByUid: session.uid,
        }, { merge: true });
      }
      resetStudyForm();
      await loadAllData();
      renderStudiesList();
      showFeedback("study-feedback", "Estudo salvo com sucesso!");
    } catch (err) {
      showFeedback("study-feedback", "Erro: " + (err.message || err), true);
    } finally {
      setButtonLoading(btn, false);
    }
  }

  // ─── MODAL: VISITANTES ─────────────────────────────────────────────────────
  function setupVisitantesModal() {
    $("close-visitantes-modal")?.addEventListener("click", () => closeModal("visitantes-modal"));
    $("visitantes-search")?.addEventListener("input", renderVisitantesFiltered);
    $("visitantes-cell-filter")?.addEventListener("change", renderVisitantesFiltered);
  }

  async function openVisitantesModal() {
    await loadAllData();
    populateVisitantesCellFilter();
    renderVisitantesFiltered();
    openModal("visitantes-modal");
  }

  function populateVisitantesCellFilter() {
    const sel = $("visitantes-cell-filter");
    if (!sel) return;
    sel.innerHTML = `<option value="">Todas as células</option>` +
      getAccessibleCells().map((c) => `<option value="${escHtml(c.id)}">${escHtml(c.name)}</option>`).join("");
  }

  function renderVisitantesFiltered() {
    const search = ($("visitantes-search")?.value || "").toLowerCase();
    const cellFilter = $("visitantes-cell-filter")?.value || "";
    const filtered = state.visitors.filter((v) => {
      if (cellFilter && v.cellId !== cellFilter) return false;
      if (search && !String(v.name || "").toLowerCase().includes(search)) return false;
      return true;
    });
    const countEl = $("visitantes-count");
    if (countEl) countEl.textContent = `${filtered.length} visitante(s)`;
    const container = $("visitantes-list");
    if (!container) return;
    if (!filtered.length) {
      container.innerHTML = `<p style="color:var(--ink-soft);padding:1rem">Nenhum visitante encontrado.</p>`;
      return;
    }
    const cellMap = Object.fromEntries(state.cells.map((c) => [c.id, c.name]));
    const statusLabels = { new: "Novo", returning: "Recorrente", member: "Membro" };
    container.innerHTML = filtered.map((v) =>
      `<div class="visitante-row" style="display:flex;justify-content:space-between;align-items:flex-start;padding:0.65rem 0;border-bottom:1px solid var(--line);gap:0.5rem">
        <div>
          <strong>${escHtml(v.name)}</strong>
          ${v.phone ? `<small style="color:var(--ink-soft)"> · ${escHtml(v.phone)}</small>` : ""}
          <small style="display:block;color:var(--ink-soft)">${escHtml(cellMap[v.cellId] || v.cellId)}${v.firstVisitAt ? " · " + fmtDate(v.firstVisitAt) : ""}${v.visitCount > 1 ? ` · ${v.visitCount}×` : ""}</small>
          ${v.status ? `<small style="color:var(--ink-soft)">${statusLabels[v.status] || v.status}</small>` : ""}
        </div>
        ${isAdminOrPastor()
          ? `<button type="button" class="ghost-btn compact-btn danger-btn" onclick="window._deleteVisitor('${escHtml(v.id)}')">Excluir</button>`
          : ""}
      </div>`
    ).join("");
  }

  window._deleteVisitor = async function (visitorId) {
    if (!confirm("Excluir este visitante?")) return;
    try {
      await fb().deleteVisitor(visitorId);
      await loadAllData();
      renderVisitantesFiltered();
    } catch (err) { alert("Erro: " + (err.message || err)); }
  };

  // ─── BOOTSTRAP ────────────────────────────────────────────────────────────
  let authHandled = false;

  async function onAuthUser(user) {
    if (!user) {
      session = null;
      authHandled = true;
      showScreen("auth-screen");
      return;
    }

    // Don't re-run full boot if session already set from same user
    if (authHandled && session?.uid === user.uid) return;
    authHandled = true;

    setLoadingText("Verificando perfil...");
    showScreen("loading-screen");

    try {
      let profile = await fb().loadUserProfile(user.uid);

      if (!profile) {
        const hasSome = await fb().hasAnyProfiles();
        if (!hasSome) {
          // First user ever: bootstrap admin
          const name = user.displayName || user.email?.split("@")[0] || "Admin";
          const claimed = await fb().claimInitialAdminProfile(user, { name, email: user.email });
          profile = claimed;
        } else {
          await fb().signOut();
          alert("Sua conta ainda não tem perfil vinculado. Fale com o administrador.");
          showScreen("auth-screen");
          return;
        }
      }

      if (profile.status === "pending") {
        await fb().signOut();
        alert("Sua conta está aguardando aprovação. Fale com o administrador.");
        showScreen("auth-screen");
        return;
      }
      if (profile.status === "inactive") {
        await fb().signOut();
        alert("Sua conta está desativada. Fale com o administrador.");
        showScreen("auth-screen");
        return;
      }

      session = {
        uid: user.uid,
        name: profile.name,
        email: profile.email,
        role: profile.role,
        status: profile.status,
        primaryCellId: profile.primaryCellId || "",
        scopeCellIds: profile.scopeCellIds || [],
      };

      renderHomeScreen();
    } catch (err) {
      console.error("[Renovo+] auth boot:", err);
      alert("Erro ao carregar perfil: " + (err.message || err));
      try { await fb().signOut(); } catch (_) {}
      showScreen("auth-screen");
    }
  }

  function init() {
    setupAuthScreen();
    setupHomeScreen();
    setupAppShell();
    setupCellModal();
    setupMemberModal();
    setupImportMembersModal();
    setupCellsModal();
    setupReportModal();
    setupAccessModal();
    setupStudiesModal();
    setupVisitantesModal();

    // Close modals on backdrop click
    document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) backdrop.hidden = true;
      });
    });

    showScreen("loading-screen");
    setLoadingText("Conectando...");

    fb().observeAuth((user) => {
      const newUid = user?.uid || null;
      const currentUid = session?.uid || null;
      if (!user) {
        session = null;
        authHandled = false;
        state = { cells: [], reports: [], studies: [], visitors: [], profiles: [] };
        showScreen("auth-screen");
      } else if (newUid !== currentUid) {
        // New user signed in (or first load with existing session)
        authHandled = false;
        onAuthUser(user);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
