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
    arenaKidsCadastros: [],
    visitantesCulto: [],
    receptionCells: [],
    bannerHome: null,
  };

  // current items being edited
  let editingReportId = null;
  let editingCellId = null;
  let editingStudyId = null;
  let editingAccessUid = null;
  let selectedReportPreviewId = null;

  // ─── HELPERS ──────────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const fb = () => window.renovoPlusFirebase;
  const isAdmin = () => session?.role === "admin";
  const isPastor = () => session?.role === "pastor";
  const isCoordinator = () => session?.role === "coordinator";
  const isAdminOrPastor = () => isAdmin() || isPastor() || isCoordinator();
  const canManageCells = () => isAdminOrPastor();
  const canManageAccess = () => isAdmin() || isPastor() || isCoordinator();
  const CHART_COLORS = {
    present: "#2d8a5e",
    absent: "#c0392b",
    visitors: "#2980b9",
  };

  function getAccessibleCells() {
    if (!session) return [];
    if (isAdminOrPastor()) return state.cells;
    const ids = new Set(
      [session.primaryCellId, ...(session.scopeCellIds || [])].filter(Boolean)
    );
    return state.cells.filter((c) => ids.has(c.id));
  }

  function getCoordinatorAssignableCellIds() {
    return new Set(
      [session?.primaryCellId, ...(Array.isArray(session?.scopeCellIds) ? session.scopeCellIds : [])]
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    );
  }

  function getAssignableAccessCells() {
    if (isAdmin() || isPastor()) return state.cells;
    if (isCoordinator()) {
      const ids = getCoordinatorAssignableCellIds();
      return state.cells.filter((cell) => ids.has(String(cell?.id || "").trim()));
    }
    return [];
  }

  function getAssignableAccessRoles() {
    if (isAdmin() || isPastor()) return ["leader", "coordinator", "pastor", "kids", "recepcao", "admin"];
    if (isCoordinator()) return ["leader"];
    return [];
  }

  function canAssignAccessRole(role) {
    return getAssignableAccessRoles().includes(String(role || "").trim());
  }

  function canManageProfile(profile) {
    const role = String(profile?.role || "").trim();
    if (isAdmin()) return true;
    if (isPastor()) return ["leader", "coordinator", "pastor", "admin", "kids", "recepcao", "pending"].includes(role);
    if (isCoordinator()) return role === "leader" || role === "pending";
    return false;
  }

  function canAccessAdmin() {
    return isAdmin() || isPastor();
  }

  function currentIgrejaId() {
    return String(session?.igrejaId || "renovo").trim() || "renovo";
  }

  function canAccessCelulas() {
    const r = session?.role;
    return r === "admin" || r === "pastor" || r === "coordinator" || r === "leader";
  }

  function canAccessArenaKids() {
    const r = session?.role;
    return r === "admin" || r === "pastor" || r === "kids";
  }

  function canAccessRecepcao() {
    const r = session?.role;
    return r === "admin" || r === "pastor" || r === "recepcao";
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

  function fmtDateTime(iso) {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return String(iso);
    return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
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
  const SCREEN_IDS = ["loading-screen", "auth-screen", "home-screen", "app-shell", "admin-screen", "arena-kids-screen", "recepcao-screen"];
  const HISTORY_SCREEN_IDS = new Set(["home-screen", "app-shell", "admin-screen", "arena-kids-screen", "recepcao-screen"]);
  let isApplyingHistoryState = false;

  function normalizeScreenName(name) {
    return name === "home" ? "home-screen" : name;
  }

  function renderScreen(name) {
    let screenName = normalizeScreenName(name) || "home-screen";
    if (!session && HISTORY_SCREEN_IDS.has(screenName)) {
      screenName = "auth-screen";
    } else if (session) {
      if (screenName === "app-shell" && !canAccessCelulas()) screenName = "home-screen";
      if (screenName === "admin-screen" && !canAccessAdmin()) screenName = "home-screen";
      if (screenName === "arena-kids-screen" && !canAccessArenaKids()) screenName = "home-screen";
      if (screenName === "recepcao-screen" && !canAccessRecepcao()) screenName = "home-screen";
    }
    SCREEN_IDS.forEach((id) => {
      const el = $(id);
      if (el) el.hidden = id !== screenName;
    });
    return screenName;
  }

  function showScreen(name, options = {}) {
    const screenName = renderScreen(name);

    if (window.history && HISTORY_SCREEN_IDS.has(screenName) && !isApplyingHistoryState) {
      const state = { screen: screenName };
      if (options.replace) {
        window.history.replaceState(state, "", "");
      } else {
        window.history.pushState(state, "", "");
      }
    }
  }

  function openModal(id) {
    const el = $(id);
    if (el) el.hidden = false;
  }

  function closeModal(id) {
    const el = $(id);
    if (el) el.hidden = true;
  }

  window.addEventListener("popstate", (event) => {
    isApplyingHistoryState = true;
    document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
      backdrop.hidden = true;
    });
    renderScreen(event.state && event.state.screen ? event.state.screen : "home-screen");
    isApplyingHistoryState = false;
  });

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
        const email = loginForm.elements.email.value.trim().toLowerCase();
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
    const code = String(err?.code || "").trim();
    const normalizedCode = code.replace(/^auth\//, "");
    const messages = {
      "invalid-login-credentials": "E-mail ou senha incorretos",
      "invalid-credential": "E-mail ou senha incorretos",
      "user-not-found": "E-mail ou senha incorretos",
      "wrong-password": "E-mail ou senha incorretos",
      "invalid-email": "E-mail inválido",
      "user-disabled": "Esta conta foi desativada",
      "too-many-requests": "Muitas tentativas. Tente novamente mais tarde",
      "network-request-failed": "Sem conexão. Verifique sua internet",
      "email-already-in-use": "Este e-mail já está cadastrado no sistema",
      EMAIL_EXISTS: "Este e-mail já está cadastrado no sistema",
      "weak-password": "Senha fraca. Use pelo menos 6 caracteres",
      "operation-not-allowed": "Login por e-mail/senha não está habilitado no Firebase",
    };

    return messages[code] || messages[normalizedCode] || "Não foi possível autenticar. Tente novamente.";
  }

  // ─── HOME SCREEN ──────────────────────────────────────────────────────────
  function setupHomeScreen() {
    $("home-logout-button")?.addEventListener("click", handleLogout);
    $("go-to-celulas")?.addEventListener("click", enterAppShell);
    $("go-to-arena-kids")?.addEventListener("click", enterArenaKidsScreen);
    $("go-to-recepcao")?.addEventListener("click", enterRecepcaoScreen);
    $("go-to-admin")?.addEventListener("click", enterAdminScreen);
    $("home-banner-wrap")?.addEventListener("click", async (event) => {
      if (event.target.closest("[data-banner-share]")) {
        event.stopPropagation();
        const btn = event.target.closest("[data-banner-share]");
        const url = btn.dataset.bannerShareUrl || "";
        const title = btn.dataset.bannerShareTitle || "Igreja Renovo";
        try {
          if (navigator.share) {
            await navigator.share({ title, url: url || location.href });
          } else if (url && navigator.clipboard) {
            await navigator.clipboard.writeText(url);
            btn.textContent = "✅";
            setTimeout(() => { btn.textContent = "⬆️"; }, 2000);
          }
        } catch (_) {}
        return;
      }
      const link = event.target.closest("[data-banner-link]")?.dataset.bannerLink;
      if (link) window.open(link, "_blank", "noopener");
    });
  }

  function renderHomeScreen() {
    const nameEl = $("home-username");
    if (nameEl) nameEl.textContent = session?.name || session?.email || "líder";

    const celulasCard = $("go-to-celulas");
    const arenaKidsCard = $("go-to-arena-kids");
    const recepcaoCard = $("go-to-recepcao");
    const adminCard = $("go-to-admin");
    const celulasTitle = celulasCard?.querySelector("strong");
    if (celulasTitle) celulasTitle.textContent = "Ambiente de C\u00e9lulas";
    if (celulasCard) celulasCard.hidden = !canAccessCelulas();
    if (arenaKidsCard) arenaKidsCard.hidden = !canAccessArenaKids();
    if (recepcaoCard) recepcaoCard.hidden = !canAccessRecepcao();
    if (adminCard) adminCard.hidden = !canAccessAdmin();
    renderHomeBanner(null);
    loadAndRenderHomeBanner();

    showScreen("home-screen", { replace: true });
  }

  async function loadAndRenderHomeBanner() {
    if (isAdmin()) {
      renderHomeBanner(null);
      return;
    }
    try {
      const banner = await fb().loadBannerHome(currentIgrejaId());
      state.bannerHome = banner;
      renderHomeBanner(banner);
    } catch (err) {
      console.warn("[Renovo+] banner home:", err?.message || err);
      renderHomeBanner(null);
    }
  }

  function renderHomeBanner(banner) {
    const wrap = $("home-banner-wrap");
    if (!wrap) return;
    if (!banner || banner.ativo !== true || !banner.imageUrl) {
      wrap.hidden = true;
      wrap.innerHTML = "";
      return;
    }
    const image = `<img src="${escHtml(banner.imageUrl)}" alt="" loading="lazy" />`;
    const shareIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`;
    const shareBtn = `<button type="button" class="banner-share-btn" data-banner-share data-banner-share-url="${escHtml(banner.link || "")}" data-banner-share-title="${escHtml(banner.text || "Igreja Renovo")}">${shareIcon}Compartilhar</button>`;
    const textSection = `${banner.text ? `<p>${escHtml(banner.text)}</p>` : ""}<div class="banner-share-row">${shareBtn}</div>`;
    wrap.innerHTML = `<div class="home-banner-card"${banner.link ? ` data-banner-link="${escHtml(banner.link)}" style="cursor:pointer"` : ""}>${image}${textSection}</div>`;
    wrap.hidden = false;
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
    $("dashboard-celulas-card")?.addEventListener("click", openDashboardCelulas);
  }

  async function enterAppShell() {
    if (!canAccessCelulas()) { showScreen("home-screen"); return; }
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
      const labels = { admin: "Admin", pastor: "Pastor", coordinator: "Coordenador", leader: "Líder", kids: "Arena Kids", recepcao: "Recepção", pending: "Pendente" };
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
    if (accessCard) accessCard.hidden = !isCoordinator();

    const dashCard = $("dashboard-celulas-card");
    if (dashCard) dashCard.hidden = !isAdminOrPastor();
  }

  function setupAdminScreen() {
    $("admin-back")?.addEventListener("click", () => showScreen("home-screen"));
    $("admin-logout")?.addEventListener("click", handleLogout);
    $("admin-manage-access-card")?.addEventListener("click", openAccessModal);
    $("admin-create-cell-card")?.addEventListener("click", openCreateCellModal);
    $("admin-manage-cells-card")?.addEventListener("click", () => {
      renderCellsList();
      openModal("cells-modal");
    });
    $("banner-home-form")?.addEventListener("submit", handleBannerHomeSubmit);
  }

  async function enterAdminScreen() {
    if (!canAccessAdmin()) { showScreen("home-screen"); return; }
    showScreen("loading-screen");
    setLoadingText("Carregando administra\u00e7\u00e3o...");
    try {
      await loadAllData();
      state.bannerHome = await fb().loadBannerHome(currentIgrejaId());
      renderAdminScreen();
      showScreen("admin-screen");
    } catch (err) {
      console.error("[Renovo+] enterAdminScreen:", err);
      alert("Erro ao carregar administra\u00e7\u00e3o: " + (err.message || err));
      showScreen("home-screen");
    }
  }

  function renderAdminScreen() {
    const totalUsers = $("admin-total-users");
    const totalCells = $("admin-total-cells");
    if (totalUsers) totalUsers.textContent = state.profiles.length;
    if (totalCells) totalCells.textContent = state.cells.length;
    populateBannerHomeForm();
  }

  function populateBannerHomeForm() {
    const form = $("banner-home-form");
    if (!form) return;
    const banner = state.bannerHome || {};
    form.elements.imageUrl.value = banner.imageUrl || "";
    form.elements.link.value = banner.link || "";
    form.elements.text.value = banner.text || "";
    form.elements.ativo.checked = banner.ativo !== false;
    showFeedback("banner-home-feedback", "");
  }

  async function handleBannerHomeSubmit(event) {
    event.preventDefault();
    if (!canAccessAdmin()) return;
    const form = event.currentTarget;
    const btn = $("save-banner-home-button");
    const imageUrl = form.elements.imageUrl.value.trim();
    if (!imageUrl) {
      showFeedback("banner-home-feedback", "Informe a URL da imagem.", true);
      form.elements.imageUrl.focus();
      return;
    }
    setButtonLoading(btn, true, "Salvando...");
    try {
      state.bannerHome = await fb().saveBannerHome(currentIgrejaId(), {
        imageUrl,
        link: form.elements.link.value.trim(),
        text: form.elements.text.value.trim(),
        ativo: form.elements.ativo.checked,
      }, session.uid);
      showFeedback("banner-home-feedback", "Banner salvo!");
    } catch (err) {
      showFeedback("banner-home-feedback", "Erro: " + (err?.message || err), true);
    } finally {
      setButtonLoading(btn, false);
    }
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

    if (canManageAccess()) {
      try { state.profiles = await fb().listProfiles(session); } catch (_) { state.profiles = []; }
    }
  }

  // ─── LOGOUT ───────────────────────────────────────────────────────────────
  async function handleLogout() {
    try { await fb().signOut(); } catch (_) {}
    session = null;
    state = { cells: [], reports: [], studies: [], visitors: [], profiles: [], arenaKidsCadastros: [], visitantesCulto: [], receptionCells: [], bannerHome: null };
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
      selectedReportPreviewId = null;
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
          _isNew: !editingReportId,
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
      if (!selectedReportPreviewId || !cellReports.some((r) => r.id === selectedReportPreviewId)) {
        selectedReportPreviewId = cellReports[0]?.id || null;
      }
      histList.innerHTML = cellReports.length
        ? cellReports.map((r) =>
            `<div class="report-history-item${r.id === selectedReportPreviewId ? " is-selected" : ""}" onclick="window._previewReport('${escHtml(r.id)}')">
              <div class="report-history-item-head">
                <strong>${fmtDate(r.date)}</strong>
                <span style="font-size:0.8rem;color:var(--ink-soft)">${r.presentCount} presentes · ${r.visitorsCount} visitante(s)</span>
              </div>
              ${r.leaders ? `<small style="color:var(--ink-soft)">${escHtml(r.leaders)}</small>` : ""}
              <div style="display:flex;gap:0.4rem;margin-top:0.3rem">
                <button type="button" class="ghost-btn compact-btn" onclick="event.stopPropagation(); window._editReport('${escHtml(r.id)}')">Editar</button>
                <button type="button" class="ghost-btn compact-btn danger-btn" onclick="event.stopPropagation(); window._deleteReport('${escHtml(r.id)}')">Excluir</button>
              </div>
            </div>`
          ).join("")
        : `<p style="color:var(--ink-soft);font-size:0.9rem">Nenhum relatório registrado.</p>`;
    }

    const preview = cellReports.find((r) => r.id === selectedReportPreviewId);
    renderReportPreview(preview || null);

    if (cellReports.length > 1) {
      const wrap = $("report-line-wrap");
      if (wrap) wrap.hidden = false;
      drawLineChart(cellReports.slice().reverse());
    }
  }

  function renderReportPreview(report) {
    const output = $("report-output");
    const gallery = $("report-images-gallery");
    if (!output) return;

    if (!report) {
      output.value = "";
      if (gallery) {
        gallery.hidden = true;
        gallery.innerHTML = "";
      }
      return;
    }

    const cell = state.cells.find((c) => c.id === report.cellId);
    const members = Array.isArray(cell?.members) ? cell.members : [];
    const presentIds = new Set(Array.isArray(report.presentMemberIds) ? report.presentMemberIds : []);
    const presentNames = members.filter((m) => presentIds.has(m.id)).map((m) => m.name);
    const absentMembers = members.filter((m) => !presentIds.has(m.id));
    const presentCount = Number(report.presentCount || presentNames.length || 0) || 0;

    output.value = buildReportText({
      cell,
      date: report.date,
      leaders: report.leaders,
      coLeaders: report.coLeaders,
      host: report.host,
      address: report.address,
      presentNames,
      presentCount,
      allMembersCount: members.length,
      absentMembers,
      visitorsCount: Number(report.visitorsCount || 0) || 0,
      visitorNames: report.visitorNames,
      offering: Number(report.offering || 0) || 0,
      snack: report.snack,
      discipleship: report.discipleship,
      communionMinutes: report.communionMinutes,
      foods: report.foods,
    });

    const imageUrls = Array.isArray(report.imageUrls) ? report.imageUrls.filter(Boolean) : [];
    if (gallery) {
      if (imageUrls.length) {
        gallery.hidden = false;
        gallery.innerHTML = `<p style="font-size:0.85rem;font-weight:600;margin:0 0 0.5rem">Fotos (${imageUrls.length})</p>` +
          `<div style="display:flex;flex-wrap:wrap;gap:0.4rem">` +
          imageUrls.map((url) =>
            `<a href="${escHtml(url)}" target="_blank" rel="noopener">
              <img src="${escHtml(url)}" alt="" style="width:72px;height:72px;object-fit:cover;border-radius:0.4rem;display:block" />
            </a>`
          ).join("") + `</div>`;
      } else {
        gallery.hidden = true;
        gallery.innerHTML = "";
      }
    }
  }

  window._previewReport = function (reportId) {
    const report = state.reports.find((r) => r.id === reportId);
    if (!report) return;
    selectedReportPreviewId = reportId;
    updateReportHistory();
  };

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
      { value: present, color: CHART_COLORS.present },
      { value: absent, color: CHART_COLORS.absent },
      { value: visitors, color: CHART_COLORS.visitors },
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
      const colors = [CHART_COLORS.present, CHART_COLORS.absent, CHART_COLORS.visitors];
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
    const points = reports.map((r) => {
      const cell = state.cells.find((c) => c.id === r.cellId);
      const totalMembers = cell?.members?.length || Number(r.presentCount || 0) || 0;
      const present = Number(r.presentCount || 0) || 0;
      const absent = Math.max(0, totalMembers - present);
      const visitors = Number(r.visitorsCount || 0) || 0;
      return { report: r, present, absent, visitors };
    });
    const maxVal = Math.max(1, ...points.map((p) => Math.max(p.present, p.absent, p.visitors)));
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
    drawLine(points.map((p) => p.present), CHART_COLORS.present);
    drawLine(points.map((p) => p.absent), CHART_COLORS.absent);
    drawLine(points.map((p) => p.visitors), CHART_COLORS.visitors);
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
      if (!form) { alert("ERRO: formulario nao encontrado"); return; }
      if (!form.reportValidity()) return;
      try {
        await handleAccessSubmit(form);
      } catch (err) {
        alert("ERRO handleAccessSubmit: " + (err?.message || String(err)));
      }
    });
  }

  function resetAccessForm() {
    const form = $("access-form");
    if (!form) return;
    form.reset();
    form.elements.userUid.value = "";
    document.querySelectorAll("#scope-cells-checkboxes input").forEach((cb) => {
      cb.checked = false;
    });
    if ($("access-scope-textarea")) $("access-scope-textarea").value = "";
    editingAccessUid = null;
    if ($("save-access-button")) $("save-access-button").textContent = "Salvar acesso";
    if ($("cancel-access-edit")) $("cancel-access-edit").hidden = true;
    if ($("email-label")) $("email-label").style.display = "";
    if ($("password-label")) $("password-label").style.display = "";
    if (form.elements.email) {
      form.elements.email.disabled = false;
      form.elements.email.required = true;
    }
    if (form.elements.password) {
      form.elements.password.disabled = false;
      form.elements.password.required = true;
    }
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
    if (form.elements.assignedCellId) {
      form.elements.assignedCellId.required = role === "leader";
      form.elements.assignedCellId.disabled = role !== "leader";
      if (role !== "leader") form.elements.assignedCellId.value = "";
    }
    if (form.elements.scopeCellIds) {
      form.elements.scopeCellIds.disabled = role !== "coordinator";
    }
  }

  function populateAccessRoleSelect(selectedRole) {
    const form = $("access-form");
    const roleSelect = form?.querySelector('select[name="role"]');
    if (!roleSelect) return;
    const labels = { leader: "Líder de Célula", coordinator: "Coordenador", pastor: "Pastor", admin: "Admin", kids: "Arena Kids", recepcao: "Recepção" };
    const roles = getAssignableAccessRoles();
    roleSelect.innerHTML = roles
      .map((role) => `<option value="${role}">${labels[role] || role}</option>`)
      .join("");
    roleSelect.value = roles.includes(selectedRole) ? selectedRole : roles[0] || "leader";
  }

  async function openAccessModal() {
    try {
      if (!canManageAccess()) return;
      await loadAllData();
      renderAccessUsers();
      populateAccessCellSelects();
      populateAccessRoleSelect("leader");
      resetAccessForm();
      const form = $("access-form");
      if (form) {
        const roleSelect = form.querySelector('select[name="role"]');
        if (false && roleSelect) {
          roleSelect.innerHTML = `
              <option value="leader">Líder de Célula</option>
              <option value="coordinator">Coordenador</option>
              <option value="pastor">Pastor</option>
              <option value="admin">Admin</option>`;
        }
      }
      openModal("access-modal");
    } catch (err) {
      alert("Erro ao abrir acessos: " + (err?.message || String(err)));
    }
  }

  function populateAccessCellSelects() {
    const visibleCells = getAssignableAccessCells();

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
    // Access managers only see profiles allowed by Firestore rules.
    const profiles = state.profiles;
    if (!profiles.length) {
      container.innerHTML = `<p style="color:var(--ink-soft)">Nenhum usuário cadastrado.</p>`;
      return;
    }
    const roleLabels = { admin: "Admin", pastor: "Pastor", coordinator: "Coordenador", leader: "Líder", kids: "Arena Kids", recepcao: "Recepção", pending: "Pendente" };
    const statusLabels = { active: "Ativo", inactive: "Inativo", pending: "Pendente" };
    container.innerHTML = profiles.map((p) =>
      `<div class="access-user-row">
        <div>
          <strong>${escHtml(p.name)}</strong>
          <small style="display:block;color:var(--ink-soft)">${escHtml(p.email)}</small>
          <small style="color:var(--ink-soft)">${roleLabels[p.role] || p.role} · ${statusLabels[p.status] || p.status}</small>
        </div>
        <div style="display:flex;gap:0.3rem;align-items:center">
          ${canManageProfile(p) ? `<button type="button" class="ghost-btn compact-btn" onclick="window._editAccess('${escHtml(p.uid)}')">Editar</button>` : ""}
          ${p.uid !== session.uid && canManageProfile(p)
            ? `<button type="button" class="ghost-btn compact-btn danger-btn" onclick="window._toggleAccess('${escHtml(p.uid)}','${escHtml(p.name)}','${escHtml(p.status)}')">${p.status === "inactive" ? "Reativar" : "Desativar"}</button>`
            : ""}
        </div>
      </div>`
    ).join("");
  }

  window._editAccess = function (uid) {
    const p = state.profiles.find((pr) => pr.uid === uid);
    if (!p) return;
    if (!canManageProfile(p)) return;
    editingAccessUid = uid;
    const form = $("access-form");
    if (!form) return;
    form.elements.userUid.value = uid;
    form.elements.name.value = p.name;
    form.elements.email.value = p.email;
    populateAccessRoleSelect(p.role);
    form.elements.role.value = canAssignAccessRole(p.role) ? p.role : getAssignableAccessRoles()[0] || "leader";
    if ($("password-label")) $("password-label").style.display = "none";
    if ($("email-label")) $("email-label").style.display = "none";
    if (form.elements.password) {
      form.elements.password.value = "";
      form.elements.password.disabled = true;
      form.elements.password.required = false;
    }
    if (form.elements.email) {
      form.elements.email.disabled = true;
      form.elements.email.required = false;
    }
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
      if (!canManageProfile(p)) return;
      await fb().saveUserProfile(uid, { ...(p || {}), status: newStatus });
      await loadAllData();
      renderAccessUsers();
    } catch (err) { alert("Erro: " + (err.message || err)); }
  };

  async function handleAccessSubmit(form) {
    const btn = $("save-access-button");
    setButtonLoading(btn, true, "Salvando...");
    showFeedback("access-feedback", "");
    const uid = String(form.elements.userUid.value || "").trim();
    const name = form.elements.name.value.trim();
    const email = form.elements.email.value.trim().toLowerCase();
    const password = form.elements.password?.value || "";
    const role = form.elements.role.value;
    const status = form.elements.status?.value || "pending";
    const primaryCellId = role === "leader" ? String(form.elements.assignedCellId?.value || "").trim() : "";
    const scopeIds = role === "coordinator"
      ? Array.from(document.querySelectorAll("#scope-cells-checkboxes input:checked"))
          .map((cb) => String(cb.value || "").trim())
          .filter(Boolean)
      : [];
    console.log("[access] submit uid=%s name=%s email=%s role=%s", uid, name, email, role);
    try {
      if (!canAssignAccessRole(role)) {
        throw new Error("Seu perfil não pode criar ou alterar este nível de acesso.");
      }
      if (role === "leader" && !primaryCellId) {
        throw new Error("Selecione uma célula para vincular ao líder.");
      }
      if (role === "leader" && isCoordinator() && !getCoordinatorAssignableCellIds().has(primaryCellId)) {
        throw new Error("Esta celula nao esta liberada para o seu perfil de coordenador.");
      }
      if (role === "coordinator" && !scopeIds.length) {
        throw new Error("Selecione pelo menos uma celula para o coordenador supervisionar.");
      }
      if (uid) {
        const existing = state.profiles.find((p) => p.uid === uid);
        if (!canManageProfile(existing)) {
          throw new Error("Seu perfil nao pode gerenciar este usuario.");
        }
        console.log("[access] updating existing profile...");
        const saved = await fb().saveUserProfile(uid, { name, role, status, igrejaId: currentIgrejaId(), primaryCellId, scopeCellIds: scopeIds });
        if (role === "leader" && saved.primaryCellId !== primaryCellId) {
          throw new Error("O perfil foi salvo, mas a celula vinculada nao foi confirmada. Tente novamente.");
        }
        if (role === "coordinator" && saved.scopeCellIds.length !== scopeIds.length) {
          throw new Error("O perfil foi salvo, mas as celulas supervisionadas nao foram confirmadas. Tente novamente.");
        }
        console.log("[access] profile updated");
        showFeedback("access-feedback", "Perfil atualizado!");
      } else {
        if (!email || !name) throw new Error("Nome e e-mail são obrigatórios.");
        if (password.length < 6) throw new Error("Senha temporária: mínimo 6 caracteres.");
        console.log("[access] calling provisionManagedAccess...");
        const { uid: newUid } = await fb().provisionManagedAccess(
          { name, email, temporaryPassword: password, role: "pending", status: "pending", igrejaId: currentIgrejaId(), primaryCellId: "", scopeCellIds: [] },
          {}
        );
        console.log("[access] provisionManagedAccess done, newUid=%s", newUid);
        const saved = await fb().saveUserProfile(newUid, { name, role, status: "active", igrejaId: currentIgrejaId(), primaryCellId, scopeCellIds: scopeIds });
        if (role === "leader" && saved.primaryCellId !== primaryCellId) {
          throw new Error("O acesso foi criado, mas a celula vinculada nao foi confirmada. Edite o acesso antes de entregar a senha.");
        }
        if (role === "coordinator" && saved.scopeCellIds.length !== scopeIds.length) {
          throw new Error("O acesso foi criado, mas as celulas supervisionadas nao foram confirmadas. Edite o acesso antes de entregar a senha.");
        }
        console.log("[access] saveUserProfile done");
        showFeedback("access-feedback", `Acesso criado para ${email}!`);
        form.reset();
        resetAccessForm();
      }
      console.log("[access] loadAllData...");
      await loadAllData();
      console.log("[access] done");
      renderAccessUsers();
    } catch (err) {
      console.error("[access] error:", err);
      const msg = translateAuthError(err);
      showFeedback("access-feedback", "Erro: " + msg, true);
      alert("Erro: " + msg);
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

  // ─── ARENA KIDS ───────────────────────────────────────────────────────────
  let lastCreatedArenaKidsId = null;

  function setupArenaKidsScreen() {
    $("arena-kids-back")?.addEventListener("click", () => showScreen("home-screen"));
    $("arena-kids-logout")?.addEventListener("click", handleLogout);
    $("arena-kids-new-btn")?.addEventListener("click", () => {
      $("arena-kids-list-section").hidden = true;
      $("arena-kids-form-section").hidden = false;
      $("arena-kids-form")?.reset();
      const errEl = $("arena-kids-form-error");
      if (errEl) errEl.hidden = true;
      setTimeout(() => $("arena-kids-form")?.querySelector('[name="nomeCrianca"]')?.focus(), 50);
    });
    $("arena-kids-cancel-form")?.addEventListener("click", () => {
      $("arena-kids-form-section").hidden = true;
      $("arena-kids-list-section").hidden = false;
    });
    $("arena-kids-search")?.addEventListener("input", renderArenaKidsList);
    $("arena-kids-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      await handleArenaKidsSubmit(e.target);
    });
  }

  async function enterArenaKidsScreen() {
    if (!canAccessArenaKids()) { showScreen("home-screen"); return; }
    showScreen("arena-kids-screen");
    $("arena-kids-form-section").hidden = true;
    $("arena-kids-list-section").hidden = false;
    const loadingEl = $("arena-kids-loading");
    const emptyEl = $("arena-kids-empty");
    const listEl = $("arena-kids-list");
    if (loadingEl) loadingEl.hidden = false;
    if (emptyEl) emptyEl.hidden = true;
    if (listEl) listEl.innerHTML = "";
    try {
      state.arenaKidsCadastros = await fb().listArenaKidsCadastros();
    } catch (err) {
      console.error("[Renovo+] arenaKids load:", err);
      state.arenaKidsCadastros = [];
    }
    if (loadingEl) loadingEl.hidden = true;
    renderArenaKidsList();
  }

  function renderArenaKidsList() {
    const search = ($("arena-kids-search")?.value || "").toLowerCase().trim();
    const list = state.arenaKidsCadastros.filter((item) => {
      if (!search) return true;
      return (
        String(item.nomeCrianca || "").toLowerCase().includes(search) ||
        String(item.nomeResponsavel || "").toLowerCase().includes(search) ||
        String(item.telefone || "").includes(search)
      );
    });
    const container = $("arena-kids-list");
    const emptyEl = $("arena-kids-empty");
    if (!container) return;
    if (!list.length) {
      container.innerHTML = "";
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;
    container.innerHTML = list.map((item) => {
      const phone = String(item.telefone || "").replace(/\D/g, "");
      const waLink = phone
        ? `<a href="https://wa.me/55${phone}" target="_blank" rel="noopener" class="whatsapp-btn">WhatsApp</a>`
        : "";
      const isNew = item.id === lastCreatedArenaKidsId;
      return `<div class="env-list-item${isNew ? " env-item-new" : ""}" data-id="${escHtml(item.id)}">
        <div class="env-item-main">
          <strong class="env-item-name">${escHtml(item.nomeCrianca)}</strong>
          ${item.idade ? `<span class="env-item-detail">${escHtml(item.idade)}</span>` : ""}
          <small class="env-item-sub">Resp: ${escHtml(item.nomeResponsavel)}</small>
          ${item.telefone ? `<small class="env-item-sub">${escHtml(item.telefone)}</small>` : ""}
        </div>
        ${waLink ? `<div class="env-item-actions">${waLink}</div>` : ""}
      </div>`;
    }).join("");
  }

  async function handleArenaKidsSubmit(form) {
    const nomeCrianca = form.elements.nomeCrianca.value.trim();
    const nomeResponsavel = form.elements.nomeResponsavel.value.trim();
    const telefone = form.elements.telefone.value.trim();
    const errEl = $("arena-kids-form-error");

    if (!nomeCrianca) {
      if (errEl) { errEl.textContent = "Informe o nome da criança."; errEl.hidden = false; }
      form.elements.nomeCrianca.focus();
      return;
    }
    if (!nomeResponsavel) {
      if (errEl) { errEl.textContent = "Informe o nome do responsável."; errEl.hidden = false; }
      form.elements.nomeResponsavel.focus();
      return;
    }
    if (!telefone) {
      if (errEl) { errEl.textContent = "Informe o telefone do responsável."; errEl.hidden = false; }
      form.elements.telefone.focus();
      return;
    }

    const btn = $("arena-kids-submit-btn");
    setButtonLoading(btn, true, "Salvando...");
    if (errEl) errEl.hidden = true;

    try {
      const saved = await fb().saveArenaKidsCadastro({
        nomeCrianca,
        idade: form.elements.idade.value.trim(),
        nomeResponsavel,
        telefone,
        endereco: form.elements.endereco.value.trim(),
        observacoes: form.elements.observacoes.value.trim(),
        igrejaId: "",
      }, session.uid);

      lastCreatedArenaKidsId = saved.id;
      state.arenaKidsCadastros = await fb().listArenaKidsCadastros();

      form.reset();
      $("arena-kids-form-section").hidden = true;
      $("arena-kids-list-section").hidden = false;
      renderArenaKidsList();
      showEnvFeedback("Cadastro realizado ✅");

      setTimeout(() => {
        lastCreatedArenaKidsId = null;
        renderArenaKidsList();
      }, 3000);
    } catch (err) {
      if (errEl) { errEl.textContent = "Erro ao salvar: " + (err.message || err); errEl.hidden = false; }
    } finally {
      setButtonLoading(btn, false);
    }
  }

  // ─── RECEPÇÃO ─────────────────────────────────────────────────────────────
  let lastCreatedRecepcaoId = null;

  function setupRecepcaoScreen() {
    $("recepcao-back")?.addEventListener("click", () => showScreen("home-screen"));
    $("recepcao-logout")?.addEventListener("click", handleLogout);
    $("recepcao-new-btn")?.addEventListener("click", () => {
      $("recepcao-list-section").hidden = true;
      $("recepcao-form-section").hidden = false;
      $("recepcao-form")?.reset();
      const errEl = $("recepcao-form-error");
      if (errEl) errEl.hidden = true;
      setTimeout(() => $("recepcao-form")?.querySelector('[name="nome"]')?.focus(), 50);
    });
    $("recepcao-cancel-form")?.addEventListener("click", () => {
      $("recepcao-form-section").hidden = true;
      $("recepcao-list-section").hidden = false;
    });
    $("recepcao-search")?.addEventListener("input", renderRecepcaoList);
    $("recepcao-list")?.addEventListener("click", handleRecepcaoListAction);
    $("recepcao-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      await handleRecepcaoSubmit(e.target);
    });
  }

  async function enterRecepcaoScreen() {
    if (!canAccessRecepcao()) { showScreen("home-screen"); return; }
    showScreen("recepcao-screen");
    $("recepcao-form-section").hidden = true;
    $("recepcao-list-section").hidden = false;
    await loadRecepcaoData();
  }

  async function loadRecepcaoData() {
    const loadingEl = $("recepcao-loading");
    const emptyEl = $("recepcao-empty");
    const listEl = $("recepcao-list");
    if (loadingEl) loadingEl.hidden = false;
    if (emptyEl) emptyEl.hidden = true;
    if (listEl) listEl.innerHTML = "";
    try {
      const [visitantes, cells] = await Promise.all([
        fb().listVisitantesCulto(currentIgrejaId()),
        fb().listCellsForReception(currentIgrejaId()).catch(() => []),
      ]);
      state.visitantesCulto = visitantes;
      state.receptionCells = cells;
    } catch (err) {
      console.error("[Renovo+] recepcao load:", err);
      state.visitantesCulto = [];
      state.receptionCells = [];
    }
    if (loadingEl) loadingEl.hidden = true;
    renderRecepcaoList();
  }

  function getRecepcaoStatusMeta(status, paused) {
    if (paused && status !== "assigned_to_cell" && status !== "do_not_contact") {
      return { label: "Mensagens pausadas", className: "badge-neutral" };
    }
    const map = {
      new: { label: "Novo", className: "badge-neutral" },
      in_followup: { label: "Em acompanhamento", className: "badge-ok" },
      wants_prayer: { label: "Quer oracao", className: "badge-warn" },
      wants_cell: { label: "Quer celula", className: "badge-warn" },
      assigned_to_cell: { label: "Encaminhado", className: "badge-ok" },
      do_not_contact: { label: "Nao contactar", className: "badge-danger" },
    };
    return map[status] || map.new;
  }

  function renderRecepcaoList() {
    const search = ($("recepcao-search")?.value || "").toLowerCase().trim();
    const list = state.visitantesCulto.filter((item) => {
      if (!search) return true;
      return (
        String(item.name || item.nome || "").toLowerCase().includes(search) ||
        String(item.phone || item.telefone || "").includes(search) ||
        String(item.neighborhood || "").toLowerCase().includes(search) ||
        String(item.followupStatus || "").toLowerCase().includes(search)
      );
    });
    const container = $("recepcao-list");
    const emptyEl = $("recepcao-empty");
    if (!container) return;
    if (!list.length) {
      container.innerHTML = "";
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;
    container.innerHTML = list.map((item) => {
      const phone = String(item.phone || item.telefone || "").replace(/\D/g, "");
      const waPhone = phone.length <= 11 ? `55${phone}` : phone;
      const waLink = phone
        ? `<a href="https://wa.me/${waPhone}" target="_blank" rel="noopener" class="whatsapp-btn">WhatsApp</a>`
        : "";
      const isNew = item.id === lastCreatedRecepcaoId;
      const status = String(item.followupStatus || "new");
      const legacyOnly = item.legacyOnly === true;
      const statusMeta = getRecepcaoStatusMeta(status, item.followupPaused);
      const nextMessage = item.nextMessage
        ? `${item.nextMessage.label || item.nextMessage.templateKey} em ${fmtDateTime(item.nextMessage.scheduledAt)}`
        : (legacyOnly || item.followupPaused || status === "do_not_contact" || status === "assigned_to_cell" ? "Sem mensagem pendente" : "Aguardando fila");
      const cellOptions = state.receptionCells
        .map((cell) => `<option value="${escHtml(cell.id)}">${escHtml(cell.name)}</option>`)
        .join("");
      const assignDisabled = legacyOnly || !state.receptionCells.length || status === "assigned_to_cell" || status === "do_not_contact";
      const canPause = !legacyOnly && status !== "assigned_to_cell" && status !== "do_not_contact" && !item.followupPaused;
      return `<div class="env-list-item${isNew ? " env-item-new" : ""}" data-id="${escHtml(item.id)}">
        <div class="env-item-main">
          <div class="recepcao-card-head">
            <strong class="env-item-name">${escHtml(item.name || item.nome)}</strong>
            <span class="tracking-badge ${statusMeta.className}">${escHtml(statusMeta.label)}</span>
          </div>
          <small class="env-item-sub">${[
            item.phone || item.telefone,
            item.neighborhood,
            item.firstVisit ? "Primeira visita" : "Retorno",
          ].filter(Boolean).map(escHtml).join(" · ")}</small>
          ${item.prayerRequest ? `<small class="env-item-detail">${escHtml(item.prayerRequest)}</small>` : ""}
          ${legacyOnly ? `<small class="env-item-detail">Cadastro anterior</small>` : ""}
          <small class="env-item-detail">Proxima mensagem: ${escHtml(nextMessage)}</small>
          ${status === "assigned_to_cell" && item.assignedCellId ? `<small class="env-item-detail">Celula: ${escHtml(getReceptionCellName(item.assignedCellId))}</small>` : ""}
          <div class="recepcao-actions">
            <button type="button" class="ghost-btn compact-btn" data-recepcao-action="pause" ${canPause ? "" : "disabled"}>Pausar mensagens</button>
            <select class="recepcao-cell-select" data-recepcao-cell-select ${assignDisabled ? "disabled" : ""}>
              <option value="">Celula automatica</option>
              ${cellOptions}
            </select>
            <button type="button" class="ghost-btn compact-btn" data-recepcao-action="assign" ${assignDisabled ? "disabled" : ""}>Encaminhar para celula</button>
            <button type="button" class="ghost-btn compact-btn danger-btn" data-recepcao-action="no-contact" ${legacyOnly || status === "do_not_contact" ? "disabled" : ""}>Nao contactar</button>
          </div>
        </div>
        ${waLink ? `<div class="env-item-actions">${waLink}</div>` : ""}
      </div>`;
    }).join("");
  }

  function getReceptionCellName(cellId) {
    const cell = state.receptionCells.find((item) => item.id === cellId) || state.cells.find((item) => item.id === cellId);
    return cell?.name || cellId || "";
  }

  async function handleRecepcaoListAction(event) {
    const btn = event.target.closest("[data-recepcao-action]");
    if (!btn) return;
    const card = btn.closest("[data-id]");
    const visitorId = card?.dataset?.id || "";
    if (!visitorId) return;

    const action = btn.dataset.recepcaoAction;
    const originalLabel = btn.textContent;
    setButtonLoading(btn, true, "Salvando...");
    try {
      if (action === "pause") {
        await fb().updateReceptionVisitorStatus(visitorId, { followupPaused: true, wantsContact: false }, session.uid);
        showEnvFeedback("Mensagens pausadas");
      } else if (action === "no-contact") {
        if (!confirm("Marcar este visitante como nao contactar?")) return;
        await fb().updateReceptionVisitorStatus(visitorId, { followupStatus: "do_not_contact", followupPaused: true, wantsContact: false }, session.uid);
        showEnvFeedback("Visitante marcado como nao contactar");
      } else if (action === "assign") {
        const select = card.querySelector("[data-recepcao-cell-select]");
        await fb().assignReceptionVisitorToCell(visitorId, { cellId: select?.value || "", churchId: currentIgrejaId() }, session.uid);
        showEnvFeedback("Visitante encaminhado para celula");
      }
      await loadRecepcaoData();
    } catch (err) {
      alert("Erro: " + (err.message || err));
    } finally {
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  }

  async function handleRecepcaoSubmit(form) {
    const nome = form.elements.nome.value.trim();
    const telefone = form.elements.telefone.value.trim();
    const wantsContact = form.elements.wantsContact ? form.elements.wantsContact.checked : true;
    const errEl = $("recepcao-form-error");

    if (!nome) {
      if (errEl) { errEl.textContent = "Informe o nome do visitante."; errEl.hidden = false; }
      form.elements.nome.focus();
      return;
    }
    if (wantsContact && !telefone) {
      if (errEl) { errEl.textContent = "Informe o telefone ou desmarque o contato por WhatsApp."; errEl.hidden = false; }
      form.elements.telefone.focus();
      return;
    }

    const btn = $("recepcao-submit-btn");
    setButtonLoading(btn, true, "Salvando...");
    if (errEl) errEl.hidden = true;

    try {
      const saved = await fb().saveVisitanteCulto({
        nome,
        telefone,
        neighborhood: form.elements.neighborhood.value.trim(),
        firstVisit: form.elements.firstVisit ? form.elements.firstVisit.checked : true,
        wantsContact,
        prayerRequest: form.elements.prayerRequest.value.trim(),
        observacoes: form.elements.prayerRequest.value.trim(),
        churchId: currentIgrejaId(),
      }, session.uid);

      lastCreatedRecepcaoId = saved.id;
      await loadRecepcaoData();

      form.reset();
      $("recepcao-form-section").hidden = true;
      $("recepcao-list-section").hidden = false;
      renderRecepcaoList();
      showEnvFeedback("Cadastro realizado ✅");

      setTimeout(() => {
        lastCreatedRecepcaoId = null;
        renderRecepcaoList();
      }, 3000);
    } catch (err) {
      if (errEl) { errEl.textContent = "Erro ao salvar: " + (err.message || err); errEl.hidden = false; }
    } finally {
      setButtonLoading(btn, false);
    }
  }

  function showEnvFeedback(msg) {
    const existing = document.getElementById("env-feedback-toast");
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.id = "env-feedback-toast";
    toast.className = "env-feedback-toast";
    toast.textContent = msg;
    document.body.appendChild(toast);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { toast.classList.add("env-feedback-toast--visible"); });
    });
    setTimeout(() => {
      toast.classList.remove("env-feedback-toast--visible");
      setTimeout(() => toast.remove(), 400);
    }, 2600);
  }

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
        igrejaId: profile.igrejaId || "renovo",
        primaryCellId: profile.primaryCellId || "",
        scopeCellIds: profile.scopeCellIds || [],
      };

      renderHomeScreen();
      registerPushNotifications(user.uid);
    } catch (err) {
      console.error("[Renovo+] auth boot:", err);
      alert("Erro ao carregar perfil: " + (err.message || err));
      try { await fb().signOut(); } catch (_) {}
      showScreen("auth-screen");
    }
  }

  // ─── PUSH NOTIFICATIONS ───────────────────────────────────────────────────
  async function registerPushNotifications(uid) {
    try {
      if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;
      const registration = await navigator.serviceWorker.ready;
      const messaging = fb().messaging;
      if (!messaging) return;
      const token = await messaging.getToken({
        vapidKey: "BNx7B2peZ2pJ9LxtIT9gcfien8KvgVNTtmxxqJ4LUQvzKquppDOvsraQPx4XzFfV_-9qRlDNCdkp1gTLlxrWFEE",
        serviceWorkerRegistration: registration,
      });
      if (token) await fb().saveFcmToken(uid, token);
    } catch (err) {
      console.warn("[Renovo+] push registration:", err?.message || err);
    }
  }

  // ─── DASHBOARD DE CÉLULAS ─────────────────────────────────────────────────
  function getDashboardDateRange(period) {
    const today = new Date();
    const toStr = (d) => d.toISOString().slice(0, 10);

    if (period === "week") {
      const dow = today.getDay();
      const diff = dow === 0 ? -6 : 1 - dow;
      const monday = new Date(today);
      monday.setDate(today.getDate() + diff);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { from: toStr(monday), to: toStr(sunday) };
    }

    if (period === "month") {
      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      const to = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { from: toStr(from), to: toStr(to) };
    }

    // quarter: últimos 90 dias
    const from = new Date(today);
    from.setDate(from.getDate() - 89);
    return { from: toStr(from), to: toStr(today) };
  }

  function getDashboardCellStatus(cellId, periodReports, memberCount) {
    const cellReports = periodReports.filter((r) => r.cellId === cellId);
    if (!cellReports.length) return "no-report";
    const avgPresence = cellReports.reduce((s, r) => s + r.presentCount, 0) / cellReports.length;
    const rate = memberCount > 0 ? avgPresence / memberCount : (avgPresence > 0 ? 1 : 0);
    return rate >= 0.5 ? "healthy" : "alert";
  }

  function computeDashboardStats({ cells, reports, period, filterCellId, filterStatus, filterCoordinator }) {
    const { from, to } = getDashboardDateRange(period);
    const periodReports = reports.filter((r) => r.date >= from && r.date <= to);

    let filteredCells = filterCellId ? cells.filter((c) => c.id === filterCellId) : cells;

    if (filterCoordinator && (isAdmin() || isPastor())) {
      const coordProfile = state.profiles.find((p) => p.uid === filterCoordinator);
      if (coordProfile) {
        const coordCellIds = new Set(coordProfile.scopeCellIds || []);
        filteredCells = filteredCells.filter((c) => coordCellIds.has(c.id));
      }
    }

    const cellStats = filteredCells.map((cell) => {
      const memberCount = cell.members?.length || 0;
      const cellReports = periodReports.filter((r) => r.cellId === cell.id);
      const totalPresent = cellReports.reduce((s, r) => s + r.presentCount, 0);
      const totalVisitors = cellReports.reduce((s, r) => s + r.visitorsCount, 0);
      const totalAbsent = cellReports.reduce((s, r) => s + Math.max(0, memberCount - r.presentCount), 0);
      const avgPresence = cellReports.length ? Math.round(totalPresent / cellReports.length) : 0;
      const status = getDashboardCellStatus(cell.id, periodReports, memberCount);
      return { cell, memberCount, reportCount: cellReports.length, totalPresent, totalVisitors, totalAbsent, avgPresence, status };
    });

    const displayedCellStats = filterStatus ? cellStats.filter((cs) => cs.status === filterStatus) : cellStats;

    const totalCells = filteredCells.length;
    const cellsWithReports = cellStats.filter((cs) => cs.reportCount > 0).length;
    const cellsPending = totalCells - cellsWithReports;
    const totalVisitors = displayedCellStats.reduce((s, cs) => s + cs.totalVisitors, 0);
    const totalPresent = displayedCellStats.reduce((s, cs) => s + cs.totalPresent, 0);
    const totalAbsent = displayedCellStats.reduce((s, cs) => s + cs.totalAbsent, 0);
    const totalReportsUsed = displayedCellStats.reduce((s, cs) => s + cs.reportCount, 0);
    const avgPresence = totalReportsUsed > 0 ? Math.round(totalPresent / totalReportsUsed) : 0;
    const healthyCells = cellStats.filter((cs) => cs.status === "healthy").length;
    const alertCells = cellStats.filter((cs) => cs.status === "alert").length;
    const noReportCells = cellStats.filter((cs) => cs.status === "no-report").length;

    // Tendência semanal: agrupar relatórios por semana ISO
    const weeklyMap = new Map();
    const relevantReports = periodReports.filter((r) => filteredCells.some((c) => c.id === r.cellId));
    relevantReports.forEach((r) => {
      const d = new Date(r.date + "T12:00:00");
      const dow = d.getDay();
      const diff = dow === 0 ? -6 : 1 - dow;
      const monday = new Date(d);
      monday.setDate(d.getDate() + diff);
      const weekKey = monday.toISOString().slice(0, 10);
      if (!weeklyMap.has(weekKey)) weeklyMap.set(weekKey, { present: 0, visitors: 0 });
      const entry = weeklyMap.get(weekKey);
      entry.present += r.presentCount;
      entry.visitors += r.visitorsCount;
    });
    const weeklyTrend = Array.from(weeklyMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([week, data]) => ({ week, ...data }));

    // Estatísticas por coordenador (apenas admin/pastor)
    const coordStats = [];
    if ((isAdmin() || isPastor()) && state.profiles.length) {
      state.profiles.filter((p) => p.role === "coordinator" && p.status === "active").forEach((coord) => {
        const coordCellIds = new Set(coord.scopeCellIds || []);
        const coordCells = filteredCells.filter((c) => coordCellIds.has(c.id));
        if (!coordCells.length) return;
        const coordReports = relevantReports.filter((r) => coordCells.some((c) => c.id === r.cellId));
        const coordPresent = coordReports.reduce((s, r) => s + r.presentCount, 0);
        const avgPres = coordReports.length ? Math.round(coordPresent / coordReports.length) : 0;
        coordStats.push({ name: coord.name || coord.email, avgPresence: avgPres, cellCount: coordCells.length });
      });
    }

    return {
      from, to, totalCells, cellsWithReports, cellsPending,
      totalVisitors, totalPresent, totalAbsent, avgPresence,
      healthyCells, alertCells, noReportCells,
      displayedCellStats, weeklyTrend, coordStats,
    };
  }

  function drawDashboardDonut(canvasId, legendId, slices) {
    const canvas = $(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const total = slices.reduce((s, sl) => s + sl.value, 0);
    if (!total) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#e5cfca";
      ctx.beginPath();
      ctx.arc(canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) / 2 - 6, 0, 2 * Math.PI);
      ctx.fill();
      const legend = $(legendId);
      if (legend) legend.innerHTML = `<span class="chart-legend-item" style="color:var(--ink-soft)">Sem dados</span>`;
      return;
    }
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
    const biggest = slices.reduce((a, b) => (b.value > a.value ? b : a), slices[0]);
    ctx.fillStyle = biggest.color;
    ctx.font = `bold ${Math.round(outerR * 0.38)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(biggest.value, cx, cy);
    const legend = $(legendId);
    if (legend) {
      legend.innerHTML = slices.map((sl) =>
        `<span class="chart-legend-item"><span class="chart-legend-dot" style="background:${sl.color}"></span>${escHtml(sl.label)}: ${sl.value}</span>`
      ).join("");
    }
  }

  function drawColumnChart(canvasId, labels, values, colors) {
    const canvas = $(canvasId);
    if (!canvas || !labels.length) return;
    const BAR_W = 44, GAP = 16, PAD_L = 36, PAD_R = 12, PAD_T = 26, PAD_B = 46;
    canvas.width = Math.max(300, PAD_L + labels.length * (BAR_W + GAP) + PAD_R);
    const ctx = canvas.getContext("2d");
    const H = canvas.height;
    const maxVal = Math.max(1, ...values);
    const chartH = H - PAD_T - PAD_B;
    ctx.clearRect(0, 0, canvas.width, H);
    ctx.strokeStyle = "#e5cfca"; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = PAD_T + (chartH / 4) * i;
      ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(canvas.width - PAD_R, y); ctx.stroke();
      const val = Math.round(maxVal - (maxVal / 4) * i);
      ctx.fillStyle = "#999"; ctx.font = "9px sans-serif"; ctx.textAlign = "right";
      ctx.fillText(val, PAD_L - 4, y + 3);
    }
    labels.forEach((label, i) => {
      const x = PAD_L + i * (BAR_W + GAP);
      const barH = values[i] > 0 ? Math.max(4, (values[i] / maxVal) * chartH) : 0;
      const y = PAD_T + chartH - barH;
      const color = Array.isArray(colors) ? (colors[i] || "#2d8a5e") : (colors || "#2d8a5e");
      ctx.fillStyle = color;
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, BAR_W, barH, [4, 4, 0, 0]); ctx.fill(); }
      else { ctx.fillRect(x, y, BAR_W, barH); }
      ctx.fillStyle = "#555"; ctx.font = "bold 10px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(values[i], x + BAR_W / 2, Math.max(PAD_T + 10, y - 5));
      const short = label.length > 10 ? label.slice(0, 9) + "…" : label;
      ctx.fillStyle = "#777"; ctx.font = "9px sans-serif";
      ctx.save();
      ctx.translate(x + BAR_W / 2, PAD_T + chartH + 6);
      ctx.rotate(-Math.PI / 4);
      ctx.textAlign = "right";
      ctx.fillText(short, 0, 0);
      ctx.restore();
    });
  }

  function renderDashboardDonutCharts(stats) {
    drawDashboardDonut("dash-donut-reports", "dash-donut-reports-legend", [
      { label: "Enviados", value: stats.cellsWithReports, color: "#2d8a5e" },
      { label: "Pendentes", value: stats.cellsPending, color: "#c0392b" },
    ]);
    drawDashboardDonut("dash-donut-presence", "dash-donut-presence-legend", [
      { label: "Presentes", value: stats.totalPresent, color: "#2d8a5e" },
      { label: "Ausentes", value: stats.totalAbsent, color: "#c0392b" },
    ]);
    drawDashboardDonut("dash-donut-health", "dash-donut-health-legend", [
      { label: "Saudáveis", value: stats.healthyCells, color: "#2d8a5e" },
      { label: "Atenção", value: stats.alertCells, color: "#d97706" },
      { label: "Sem relatório", value: stats.noReportCells, color: "#aaa" },
    ]);
  }

  function renderDashboardColumnCharts(stats) {
    const cs = stats.displayedCellStats;
    if (!cs.length) return;
    const labels = cs.map((x) => x.cell.name);
    const presColors = cs.map((x) => x.status === "healthy" ? "#2d8a5e" : x.status === "alert" ? "#d97706" : "#aaa");
    drawColumnChart("dash-col-presence", labels, cs.map((x) => x.avgPresence), presColors);
    drawColumnChart("dash-col-visitors", labels, cs.map((x) => x.totalVisitors), "#2980b9");
  }

  function renderDashboardTrend(stats) {
    const trend = stats.weeklyTrend;
    const canvas = $("dash-line-weekly");
    if (!canvas) return;
    if (!trend.length) { canvas.width = 300; canvas.getContext("2d").clearRect(0, 0, 300, canvas.height); return; }
    canvas.width = Math.max(300, trend.length * 72);
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const pad = { top: 18, right: 12, bottom: 30, left: 36 };
    const chartW = W - pad.left - pad.right;
    const chartH = H - pad.top - pad.bottom;
    const maxVal = Math.max(1, ...trend.flatMap((t) => [t.present, t.visitors]));
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = "#e5cfca"; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (chartH / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + chartW, y); ctx.stroke();
      const val = Math.round(maxVal - (maxVal / 4) * i);
      ctx.fillStyle = "#999"; ctx.font = "9px sans-serif"; ctx.textAlign = "right";
      ctx.fillText(val, pad.left - 4, y + 3);
    }
    const xStep = trend.length > 1 ? chartW / (trend.length - 1) : 0;
    const yScale = (v) => pad.top + chartH - (v / maxVal) * chartH;
    function drawTL(data, color) {
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2;
      data.forEach((v, i) => { const x = pad.left + i * xStep, y = yScale(v); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
      ctx.stroke();
      data.forEach((v, i) => { ctx.beginPath(); ctx.arc(pad.left + i * xStep, yScale(v), 3, 0, 2 * Math.PI); ctx.fillStyle = color; ctx.fill(); });
    }
    drawTL(trend.map((t) => t.present), "#2d8a5e");
    drawTL(trend.map((t) => t.visitors), "#2980b9");
    ctx.fillStyle = "#888"; ctx.font = "9px sans-serif"; ctx.textAlign = "center";
    trend.forEach((t, i) => {
      ctx.fillText(String(t.week).slice(5).replace("-", "/"), pad.left + i * xStep, H - 6);
    });
  }

  function renderDashboardCoordChart(stats) {
    const section = $("dash-charts-coord-section");
    if (!section) return;
    if (!(isAdmin() || isPastor()) || stats.coordStats.length < 2) { section.hidden = true; return; }
    section.hidden = false;
    drawColumnChart("dash-col-coord", stats.coordStats.map((c) => c.name), stats.coordStats.map((c) => c.avgPresence), "#7c3aed");
  }

  function renderDashboardKPIs(stats) {
    const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };
    set("dash-kpi-total-cells", stats.totalCells);
    set("dash-kpi-reports-sent", `${stats.cellsWithReports}/${stats.totalCells}`);
    set("dash-kpi-visitors", stats.totalVisitors);
    set("dash-kpi-avg-presence", stats.avgPresence);
    set("dash-kpi-alert-cells", stats.alertCells);
  }

  function applyDashboardFilters() {
    const period = $("dash-filter-period")?.value || "month";
    const filterCell = $("dash-filter-cell")?.value || "";
    const filterStatus = $("dash-filter-status")?.value || "";
    const filterCoordinator = $("dash-filter-coordinator")?.value || "";
    const stats = computeDashboardStats({
      cells: getAccessibleCells(),
      reports: state.reports,
      period, filterCellId: filterCell, filterStatus, filterCoordinator,
    });
    renderDashboardKPIs(stats);
    renderDashboardDonutCharts(stats);
    renderDashboardColumnCharts(stats);
    renderDashboardTrend(stats);
    renderDashboardCoordChart(stats);
    const emptyMsg = $("dash-empty-msg");
    if (emptyMsg) emptyMsg.hidden = stats.displayedCellStats.length > 0;
  }

  function populateDashboardFilters() {
    const cells = getAccessibleCells();
    const cellSelect = $("dash-filter-cell");
    if (cellSelect) {
      cellSelect.innerHTML = `<option value="">Todas as células</option>` +
        cells.map((c) => `<option value="${escHtml(c.id)}">${escHtml(c.name)}</option>`).join("");
    }
    const coordSelect = $("dash-filter-coordinator");
    if (coordSelect) {
      if (isAdmin() || isPastor()) {
        const coords = state.profiles.filter((p) => p.role === "coordinator" && p.status === "active");
        coordSelect.innerHTML = `<option value="">Todos os coordenadores</option>` +
          coords.map((p) => `<option value="${escHtml(p.uid)}">${escHtml(p.name || p.email)}</option>`).join("");
        coordSelect.hidden = coords.length === 0;
      } else {
        coordSelect.hidden = true;
      }
    }
  }

  function openDashboardCelulas() {
    populateDashboardFilters();
    applyDashboardFilters();
    openModal("dashboard-celulas-modal");
  }

  function setupDashboardCelulas() {
    $("close-dashboard-celulas")?.addEventListener("click", () => closeModal("dashboard-celulas-modal"));
    ["dash-filter-period", "dash-filter-cell", "dash-filter-status", "dash-filter-coordinator"].forEach((id) => {
      $(id)?.addEventListener("change", applyDashboardFilters);
    });
  }

  function init() {
    setupAuthScreen();
    setupHomeScreen();
    setupAppShell();
    setupAdminScreen();
    setupCellModal();
    setupMemberModal();
    setupImportMembersModal();
    setupCellsModal();
    setupReportModal();
    setupAccessModal();
    setupStudiesModal();
    setupVisitantesModal();
    setupArenaKidsScreen();
    setupRecepcaoScreen();
    setupDashboardCelulas();

    // Close modals on backdrop click
    document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) backdrop.hidden = true;
      });
    });

    if (window.history) {
      window.history.replaceState({ screen: "home-screen" }, "", "");
    }

    showScreen("loading-screen");
    setLoadingText("Conectando...");

    fb().observeAuth((user) => {
      const newUid = user?.uid || null;
      const currentUid = session?.uid || null;
      if (!user) {
        session = null;
        authHandled = false;
        state = { cells: [], reports: [], studies: [], visitors: [], profiles: [], arenaKidsCadastros: [], visitantesCulto: [], receptionCells: [], bannerHome: null };
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
