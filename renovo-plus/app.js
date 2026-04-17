/* app.js - shell inicial da Renovo+ */
(function () {
  const authScreen = document.getElementById("plus-auth-screen");
  const authForm = document.getElementById("plus-auth-form");
  const authFeedback = document.getElementById("plus-auth-feedback");
  const loginButton = document.getElementById("plus-login-button");
  const loadingScreen = document.getElementById("plus-loading-screen");
  const shell = document.getElementById("plus-shell");
  const nav = document.getElementById("plus-nav");
  const signOutButton = document.getElementById("plus-signout-button");
  const statusPill = document.getElementById("plus-status-pill");
  const userNameEl = document.getElementById("plus-user-name");
  const userMetaEl = document.getElementById("plus-user-meta");
  const pageKicker = document.getElementById("plus-page-kicker");
  const pageTitle = document.getElementById("plus-page-title");
  const pageDescription = document.getElementById("plus-page-description");
  const pageBody = document.getElementById("plus-page-body");
  const profileWarning = document.getElementById("plus-profile-warning");
  const versionLabel = document.getElementById("plus-version-label");
  const AUTH_BOOT_TIMEOUT_MS = 7000;

  const ROLE_LABELS = {
    leader: "Líder",
    coordinator: "Coordenadora",
    pastor: "Pastor",
    admin: "Admin",
    pending: "Sem perfil",
  };

  const STATUS_LABELS = {
    active: "Ativo",
    inactive: "Inativo",
    pending: "Pendente",
  };

  const CELL_STATUS_LABELS = {
    active: "Ativa",
    inactive: "Inativa",
  };

  const MEMBER_STATUS_LABELS = {
    active: "Ativo",
    inactive: "Inativo",
    moved: "Transferido",
    paused: "Pausado",
  };

  const MEMBER_ROLE_LABELS = {
    member: "Membro",
    host: "Anfitriao",
    assistant: "Auxiliar",
    apprentice: "Aprendiz",
  };

  const ALERT_TYPE_LABELS = {
    care: "Cuidado",
    report_gap: "Relatorio pendente",
    follow_up: "Follow-up",
    prayer: "Oracao",
    operations: "Operacao",
    discipleship: "Discipulado",
  };

  const ALERT_SEVERITY_LABELS = {
    info: "Informativo",
    warn: "Atencao",
    critical: "Critico",
  };

  const ALERT_STATUS_LABELS = {
    open: "Aberto",
    monitoring: "Em monitoramento",
    resolved: "Resolvido",
  };

  const MEETING_DAY_OPTIONS = [
    { value: "", label: "Selecione o dia" },
    { value: "domingo", label: "Domingo" },
    { value: "segunda", label: "Segunda" },
    { value: "terca", label: "Terca" },
    { value: "quarta", label: "Quarta" },
    { value: "quinta", label: "Quinta" },
    { value: "sexta", label: "Sexta" },
    { value: "sabado", label: "Sabado" },
  ];

  const MODULE_DEFS = {
    dashboard: {
      kicker: "Mapa da Renovo+",
      title: "Painel",
      description: "Visão-base da nova arquitetura: autenticação real, perfis por uid e módulos isolados para crescer sem remendo.",
      allowedRoles: ["leader", "coordinator", "pastor", "admin", "pending"],
    },
    cells: {
      kicker: "Estrutura ministerial",
      title: "Células",
      description: "Modelo da Renovo+ para células, membros e vínculos por cellId em vez de nome textual.",
      allowedRoles: ["leader", "coordinator", "pastor", "admin"],
    },
    members: {
      kicker: "Base da celula",
      title: "Membros",
      description: "Cadastro de membros por cellId, com papel na célula, status e trilha segura para crescimento da equipe.",
      allowedRoles: ["leader", "coordinator", "pastor", "admin"],
    },
    reports: {
      kicker: "Fluxo semanal",
      title: "Relatórios",
      description: "Cada relatório vira um documento próprio com autoria, atualização e escopo da célula.",
      allowedRoles: ["leader", "coordinator", "pastor", "admin"],
    },
    studies: {
      kicker: "Biblioteca segura",
      title: "Estudos",
      description: "Metadados no Firestore, arquivo no Storage e liberação por papel ou audiência do estudo.",
      allowedRoles: ["leader", "coordinator", "pastor", "admin"],
    },
    visitors: {
      kicker: "Jornada de cuidado",
      title: "Visitantes",
      description: "Registro, recorrência, vínculo com célula e conversão futura para membro de forma rastreável.",
      allowedRoles: ["leader", "coordinator", "pastor", "admin"],
    },
    alerts: {
      kicker: "Cuidado e governanca",
      title: "Acompanhamento",
      description: "Alertas por célula, sinais do sistema e acompanhamento ministerial no mesmo fluxo da Renovo+.",
      allowedRoles: ["leader", "coordinator", "pastor", "admin"],
    },
    access: {
      kicker: "Governança",
      title: "Acessos",
      description: "Perfis por uid com papéis, escopo e status gerenciados sem contas compartilhadas.",
      allowedRoles: ["pastor", "admin"],
    },
  };

  const state = {
    route: "dashboard",
    authUser: null,
    profile: null,
    accessibleCells: [],
    allCells: [],
    members: [],
    reports: [],
    studies: [],
    visitors: [],
    alerts: [],
    profiles: [],
    hasAnyProfiles: false,
    selectedProfileUid: "",
    selectedCellId: "",
    selectedMemberId: "",
    selectedReportId: "",
    selectedStudyId: "",
    selectedVisitorId: "",
    selectedAlertId: "",
  };

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function setFeedback(message, tone) {
    authFeedback.textContent = message || "";
    authFeedback.style.color = tone === "soft" ? "var(--plus-ink-soft)" : "var(--plus-danger)";
  }

  function setStatus(text, tone) {
    statusPill.textContent = text;
    const tones = {
      ok: ["rgba(39, 95, 75, 0.12)", "var(--plus-ok)"],
      warn: ["rgba(155, 99, 39, 0.14)", "var(--plus-warn)"],
      danger: ["rgba(162, 54, 43, 0.14)", "var(--plus-danger)"],
      neutral: ["rgba(124, 29, 24, 0.1)", "var(--plus-brand)"],
    };
    const selected = tones[tone] || tones.neutral;
    statusPill.style.background = selected[0];
    statusPill.style.color = selected[1];
  }

  function normalizeRole(role) {
    return ROLE_LABELS[String(role || "").trim()] ? String(role).trim() : "pending";
  }

  function normalizeStatus(status) {
    return STATUS_LABELS[String(status || "").trim()] ? String(status).trim() : "pending";
  }

  function canAccessRoute(route) {
    const definition = MODULE_DEFS[route] || MODULE_DEFS.dashboard;
    const role = normalizeRole(state.profile?.role);
    return definition.allowedRoles.includes(role);
  }

  function ensureAllowedRoute() {
    if (!canAccessRoute(state.route)) {
      state.route = "dashboard";
    }
  }

  function buildScopeText() {
    const profile = state.profile;
    if (!profile) {
      return "Sem escopo carregado.";
    }

    if (profile.role === "leader") {
      return profile.primaryCellId
        ? `Célula principal: ${profile.primaryCellId}`
        : "Líder sem célula principal vinculada.";
    }

    if (profile.role === "coordinator") {
      return profile.scopeCellIds.length
        ? `Células supervisionadas: ${profile.scopeCellIds.join(", ")}`
        : "Coordenadora sem células vinculadas ainda.";
    }

    if (profile.role === "pastor" || profile.role === "admin") {
      return "Visão global com governança dos módulos da Renovo+.";
    }

    return "Perfil autenticado, mas ainda sem definição de papel.";
  }

  function sortByName(list) {
    return (Array.isArray(list) ? list.slice() : []).sort((a, b) =>
      String(a?.name || "").localeCompare(String(b?.name || ""), "pt-BR", { sensitivity: "base" })
    );
  }

  function canManageAccess() {
    return state.profile?.role === "admin" || state.profile?.role === "pastor";
  }

  function canManageCells() {
    return state.profile?.role === "admin" || state.profile?.role === "pastor";
  }

  function getVisibleCells() {
    return sortByName(canManageCells() ? state.allCells : state.accessibleCells);
  }

  function findProfileNameByUid(uid) {
    const normalizedUid = String(uid || "").trim();
    if (!normalizedUid) {
      return "";
    }

    const match = state.profiles.find((profile) => profile.uid === normalizedUid);
    if (match) {
      return match.name || match.email || normalizedUid;
    }

    if (state.profile?.uid === normalizedUid) {
      return state.profile.name || state.profile.email || normalizedUid;
    }

    return normalizedUid;
  }

  function getReportCells() {
    return sortByName(canManageCells() ? state.allCells : state.accessibleCells);
  }

  function canManageMembers() {
    return Boolean(state.profile) && normalizeStatus(state.profile.status) === "active" && normalizeRole(state.profile.role) !== "pending";
  }

  function canManageStudies() {
    return state.profile?.role === "admin" || state.profile?.role === "pastor";
  }

  function canManageVisitors() {
    return Boolean(state.profile) && normalizeStatus(state.profile.status) === "active" && normalizeRole(state.profile.role) !== "pending";
  }

  function findCellById(cellId) {
    const normalizedId = String(cellId || "").trim();
    return [...state.allCells, ...state.accessibleCells].find((cell) => cell.id === normalizedId) || null;
  }

  function findCellNameById(cellId) {
    const cell = findCellById(cellId);
    return cell?.name || String(cellId || "").trim();
  }

  function getEditableStudy() {
    if (!state.studies.length) {
      return null;
    }

    if (state.selectedStudyId === "__new__") {
      return null;
    }

    const selected = state.studies.find((study) => study.id === state.selectedStudyId);
    if (selected) {
      return selected;
    }

    if (!canManageStudies()) {
      state.selectedStudyId = state.studies[0].id;
      return state.studies[0];
    }

    return null;
  }

  function getEditableVisitor() {
    if (!state.visitors.length) {
      return null;
    }

    if (state.selectedVisitorId === "__new__") {
      return null;
    }

    const selected = state.visitors.find((visitor) => visitor.id === state.selectedVisitorId);
    if (selected) {
      return selected;
    }

    if (canManageVisitors()) {
      return null;
    }

    state.selectedVisitorId = state.visitors[0].id;
    return state.visitors[0];
  }

  function getEditableMember() {
    if (!state.members.length) {
      return null;
    }

    if (state.selectedMemberId === "__new__") {
      return null;
    }

    const selected = state.members.find((member) => member.id === state.selectedMemberId);
    if (selected) {
      return selected;
    }

    if (canManageMembers()) {
      return null;
    }

    state.selectedMemberId = state.members[0].id;
    return state.members[0];
  }

  function canManageAlerts() {
    return Boolean(state.profile) && normalizeStatus(state.profile.status) === "active" && normalizeRole(state.profile.role) !== "pending";
  }

  function getEditableAlert() {
    if (!state.alerts.length) {
      return null;
    }

    if (state.selectedAlertId === "__new__") {
      return null;
    }

    const selected = state.alerts.find((alert) => alert.id === state.selectedAlertId);
    if (selected) {
      return selected;
    }

    if (canManageAlerts()) {
      return null;
    }

    state.selectedAlertId = state.alerts[0].id;
    return state.alerts[0];
  }

  function canManageProfile(targetProfile) {
    if (!canManageAccess() || !targetProfile) {
      return false;
    }

    if (state.profile?.role === "admin") {
      return true;
    }

    return targetProfile.role !== "admin" && targetProfile.uid !== state.profile?.uid;
  }

  function getEditableProfile() {
    if (!state.profiles.length) {
      return null;
    }

    const selected = state.profiles.find((profile) => profile.uid === state.selectedProfileUid);
    if (selected) {
      return selected;
    }

    const current = state.profiles.find((profile) => profile.uid === state.profile?.uid);
    if (current) {
      state.selectedProfileUid = current.uid;
      return current;
    }

    state.selectedProfileUid = state.profiles[0].uid;
    return state.profiles[0];
  }

  function renderMetaPairs(items) {
    return items
      .map(
        (item) => `
          <div class="plus-meta-item">
            <span class="plus-meta-label">${escapeHtml(item.label)}</span>
            <strong>${escapeHtml(item.value)}</strong>
          </div>
        `
      )
      .join("");
  }

  function renderCard(card) {
    const list = Array.isArray(card.items) && card.items.length
      ? `<ul>${card.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
      : "";
    const metrics = Array.isArray(card.metrics) && card.metrics.length
      ? `
        <div class="plus-metric-grid">
          ${card.metrics
            .map(
              (metric) => `
                <div class="plus-metric">
                  <strong>${escapeHtml(metric.value)}</strong>
                  <span>${escapeHtml(metric.label)}</span>
                </div>
              `
            )
            .join("")}
        </div>
      `
      : "";
    const metaPairs = Array.isArray(card.metaPairs) && card.metaPairs.length
      ? `<div class="plus-meta-pair">${renderMetaPairs(card.metaPairs)}</div>`
      : "";
    const tag = card.tag ? `<span class="plus-role-pill">${escapeHtml(card.tag)}</span>` : "";
    const body = card.html ? card.html : card.body ? `<p>${escapeHtml(card.body)}</p>` : "";

    return `
      <article class="plus-card" data-span="${escapeHtml(card.span || "4")}">
        <div class="plus-card-top">
          <span class="plus-card-kicker">${escapeHtml(card.kicker || "Renovo+")}</span>
          ${tag}
        </div>
        <h3>${escapeHtml(card.title || "")}</h3>
        ${body}
        ${metrics}
        ${metaPairs}
        ${list}
      </article>
    `;
  }

  function buildDashboardCards() {
    const profile = state.profile;
    const role = normalizeRole(profile?.role);
    const collections = window.renovoPlusFirebase?.collections || {};
    const accessibleCount = state.accessibleCells.length;

    return [
      {
        span: "4",
        kicker: "Sessão",
        title: profile?.name || state.authUser?.email || "Conta autenticada",
        body: "A fundação já diferencia autenticação Firebase da identidade ministerial do perfil interno.",
        metaPairs: [
          { label: "Role", value: ROLE_LABELS[role] || "Sem perfil" },
          { label: "Status", value: profile?.status === "inactive" ? "Inativo" : "Ativo" },
          { label: "Escopo", value: buildScopeText() },
        ],
      },
      {
        span: "4",
        kicker: "Coleções-base",
        title: "Módulos isolados",
        body: "A V2 nasce em coleções separadas para conviver com a V1 sem sobrescrever dados atuais.",
        items: [
          `${collections.users || "renovo_plus_users"} -> perfis por uid`,
          `${collections.cells || "renovo_plus_cells"} -> células e vínculos`,
          `${collections.reports || "renovo_plus_reports"} -> relatórios por documento`,
          `${collections.studies || "renovo_plus_studies"} -> biblioteca em PDF`,
        ],
      },
      {
        span: "4",
        kicker: "Leitura rápida",
        title: "Próxima camada",
        body: "Esta base já está pronta para receber guards, CRUDs por módulo e regras de segurança do Firebase.",
        metrics: [
          { value: String(accessibleCount), label: "Células detectadas no escopo" },
          { value: "6", label: "Módulos mapeados na V2" },
          { value: "uid", label: "Chave principal do usuário" },
        ],
      },
      {
        span: "8",
        kicker: "Mapa funcional",
        title: "Fluxo de informação da Renovo+",
        body: "A nova versão parte do usuário autenticado, resolve o perfil ministerial e só então libera os módulos do escopo dele.",
        items: [
          "Firebase Auth valida a sessão e entrega um uid real para Firestore e Storage.",
          "O perfil em renovo_plus_users/{uid} define role, status, célula principal e escopo de supervisão.",
          "As telas consultam módulos separados: células, relatórios, estudos, visitantes e alertas.",
          "Toda operação relevante pode registrar createdByUid, updatedByUid e timestamps de auditoria.",
        ],
      },
      {
        span: "4",
        kicker: "Fase atual",
        title: "Fundação entregue",
        body: "Já podemos começar os módulos sem misturar a V2 com o app atual.",
        items: [
          "Shell do app novo",
          "Login real por e-mail/senha",
          "Leitura de perfil por uid",
          "Navegação inicial por papel",
        ],
      },
    ];
  }

  function buildCellsCards() {
    return [
      {
        span: "6",
        kicker: "Coleção",
        title: "renovo_plus_cells",
        body: "Cada célula passa a ter identidade própria por cellId, sem depender do nome para governar escopo.",
        items: [
          "name, meetingDay, meetingTime, address, status",
          "leaderUid e coLeaderUids",
          "createdAt, updatedAt",
          "Subcoleção futura de membros por célula",
        ],
      },
      {
        span: "6",
        kicker: "Decisão estrutural",
        title: "Membros separados da tela",
        body: "Na V2, o membro deixa de ser só uma lista embutida e passa a fazer parte da estrutura ministerial com vínculo seguro.",
        items: [
          "cells/{cellId}/members/{memberId} ou coleção dedicada com cellId",
          "Facilita auditoria, histórico e futuras métricas",
          "Evita quebrar escopo quando o nome da célula muda",
        ],
      },
      {
        span: "12",
        kicker: "Resultado esperado",
        title: "Fluxo do módulo de células",
        body: "Admin/pastor governam a estrutura, coordenação acompanha o grupo e líderes operam a própria célula sem risco de cruzar dados.",
        items: [
          "Criar/editar célula com leaderUid definido",
          "Vincular líder e coordenadora por ids, não por texto livre",
          "Consultar apenas as células filtradas pelo perfil carregado",
        ],
      },
    ];
  }

  function buildReportsCards() {
    return [
      {
        span: "6",
        kicker: "Coleção",
        title: "renovo_plus_reports",
        body: "Cada relatório é um documento independente, com autoria e vínculo explícito à célula.",
        items: [
          "cellId, date, leaders, host, address",
          "presentMemberIds, visitorsCount e visitorDetails",
          "offering, foods, snack, discipleship, visits, conversions",
          "createdByUid, updatedByUid, createdAt e updatedAt",
        ],
      },
      {
        span: "6",
        kicker: "Permissão",
        title: "Escrita controlada",
        body: "Líder escreve no próprio escopo; coordenação acompanha; pastor/admin consolida sem sobrescrever relatórios de outros.",
        items: [
          "1 relatório = 1 documento",
          "Sem lista única regravada inteira",
          "Sem dependência de refresh para refletir autoria",
        ],
      },
      {
        span: "12",
        kicker: "Cadeia de valor",
        title: "Do relatório ao acompanhamento",
        body: "O relatório deixa de ser só histórico e vira base de saúde ministerial, presença, visitantes e alertas.",
        items: [
          "Relatório alimenta painel do líder",
          "Relatório alimenta saúde da célula para coordenação",
          "Relatório alimenta consolidado mensal para pastor/admin",
          "Relatório também suporta auditoria e revisão futura",
        ],
      },
    ];
  }

  function buildStudiesCards() {
    return [
      {
        span: "6",
        kicker: "Firestore + Storage",
        title: "Biblioteca em dois níveis",
        body: "Metadado do estudo fica no Firestore; arquivo real fica no Storage com storagePath e regra por perfil.",
        items: [
          "title, description, audience, storagePath",
          "createdByUid, updatedByUid",
          "Sem PDF preso em localStorage",
        ],
      },
      {
        span: "6",
        kicker: "Segurança",
        title: "Acesso ao PDF por autenticação real",
        body: "O download abre com sessão válida do Firebase, sem depender de link frouxo salvo no banco.",
        items: [
          "Upload controlado por Firebase Auth",
          "Leitura conforme audience do estudo",
          "Base preparada para pastas por estudo ou por ministério",
        ],
      },
    ];
  }

  function buildVisitorsCards() {
    return [
      {
        span: "6",
        kicker: "Rastreio",
        title: "renovo_plus_visitors",
        body: "O visitante ganha histórico próprio e deixa de depender só do relatório semanal para existir no sistema.",
        items: [
          "name, phone, address, origin, context",
          "cellId, firstVisitAt, lastVisitAt, visitCount",
          "createdByUid e status de acompanhamento",
        ],
      },
      {
        span: "6",
        kicker: "Evolução",
        title: "Da visita ao cuidado",
        body: "A Renovo+ pode ligar recorrência, retorno e eventual conversão para membro sem perder a trilha do acompanhamento.",
        items: [
          "Registrar por culto ou por célula",
          "Identificar recorrência automaticamente",
          "Converter para membro sem duplicação manual",
        ],
      },
    ];
  }

  function buildAccessCards() {
    return [
      {
        span: "6",
        kicker: "Governança",
        title: "Perfis por uid",
        body: "Cada pessoa tem um uid próprio, sem conta compartilhada por célula.",
        items: [
          "role, status, primaryCellId e scopeCellIds",
          "Desativação sem perder histórico",
          "Promoção ou mudança de escopo com rastreabilidade",
        ],
      },
      {
        span: "6",
        kicker: "Papéis",
        title: "Hierarquia real",
        body: "As permissões deixam de ser só de interface e passam a existir também nas regras do Firebase.",
        items: [
          "leader -> própria célula",
          "coordinator -> grupo de células",
          "pastor/admin -> visão consolidada e governança",
        ],
      },
    ];
  }

  function buildPendingCards() {
    return [
      {
        span: "12",
        kicker: "Perfil pendente",
        title: "Conta autenticada, mas ainda sem perfil da Renovo+",
        body: "A autenticação já funcionou. O próximo passo é criar este uid na coleção renovo_plus_users com role, status e escopo ministerial.",
        items: [
          "Coleção esperada: renovo_plus_users/{uid}",
          "Campos mínimos: name, email, role, status",
          "Campos de escopo: primaryCellId e scopeCellIds",
        ],
      },
    ];
  }

  function buildBootstrapCard() {
    return {
      span: "12",
      kicker: "Primeiro passo",
      title: "Assumir o primeiro admin da Renovo+",
      html: `
        <p>Nao ha nenhum perfil cadastrado ainda. Como esta conta ja esta autenticada, voce pode transforma-la no primeiro admin do novo sistema.</p>
        <form id="plus-bootstrap-form">
          <label>
            Nome exibido
            <input name="name" type="text" value="${escapeHtml(state.authUser?.displayName || state.authUser?.email || "")}" required />
          </label>
          <label>
            Ministerio ou observacao inicial
            <input name="ministryName" type="text" placeholder="Ex.: Lideranca geral" />
          </label>
          <div class="plus-card-actions">
            <button type="submit" class="plus-inline-button">Assumir como primeiro admin</button>
          </div>
        </form>
      `,
    };
  }

  function renderCellSelectOptions(selectedValue) {
    const current = String(selectedValue || "");
    const options = sortByName(state.allCells)
      .map((cell) => `<option value="${escapeHtml(cell.id)}" ${cell.id === current ? "selected" : ""}>${escapeHtml(cell.name || cell.id)}</option>`)
      .join("");
    return `<option value="">Sem celula principal</option>${options}`;
  }

  function getEditableCell() {
    const visibleCells = getVisibleCells();
    if (!visibleCells.length) {
      return null;
    }

    if (canManageCells() && !state.selectedCellId) {
      return null;
    }

    const selected = visibleCells.find((cell) => cell.id === state.selectedCellId);
    if (selected) {
      return selected;
    }

    if (canManageCells()) {
      return null;
    }

    state.selectedCellId = visibleCells[0].id;
    return visibleCells[0];
  }

  function renderMeetingDayOptions(selectedValue) {
    const current = String(selectedValue || "");
    return MEETING_DAY_OPTIONS
      .map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === current ? "selected" : ""}>${escapeHtml(option.label)}</option>`)
      .join("");
  }

  function renderLeaderOptions(selectedValue) {
    const current = String(selectedValue || "");
    const profiles = sortByName(state.profiles.filter((profile) => normalizeRole(profile.role) !== "pending"));
    const options = profiles
      .map((profile) => `<option value="${escapeHtml(profile.uid)}" ${profile.uid === current ? "selected" : ""}>${escapeHtml(profile.name || profile.email || profile.uid)}</option>`)
      .join("");
    return `<option value="">Sem lider definido</option>${options}`;
  }

  function buildCellsListHtml() {
    const visibleCells = getVisibleCells();
    if (!visibleCells.length) {
      return `<div class="plus-list-item"><strong>Nenhuma celula cadastrada ainda.</strong><span>Assim que uma celula for criada, ela aparecera aqui.</span></div>`;
    }

    return visibleCells
      .map((cell) => {
        const selected = cell.id === state.selectedCellId;
        const leaderName = findProfileNameByUid(cell.leaderUid) || "Sem lider";
        const meetingLabel = [cell.meetingDay, cell.meetingTime].filter(Boolean).join(" · ") || "Horario nao informado";

        return `
          <div class="plus-list-item">
            <div class="plus-list-item-top">
              <div>
                <strong>${escapeHtml(cell.name || cell.id)}</strong>
                <small>${escapeHtml(cell.id)}</small>
              </div>
              <div class="plus-card-actions">
                <span class="plus-role-pill">${escapeHtml(CELL_STATUS_LABELS[cell.status] || "Ativa")}</span>
                <button type="button" class="plus-inline-button" data-select-cell="${escapeHtml(cell.id)}">${selected ? "Selecionada" : "Ver detalhes"}</button>
              </div>
            </div>
            <span>${escapeHtml(`Lider: ${leaderName}`)}</span>
            <span>${escapeHtml(`Reuniao: ${meetingLabel}`)}</span>
          </div>
        `;
      })
      .join("");
  }

  function buildCellEditorHtml(cell) {
    const safeCell = cell || {
      id: "",
      name: "",
      meetingDay: "",
      meetingTime: "",
      address: "",
      leaderUid: "",
      coLeaderUids: [],
      status: "active",
      notes: "",
    };

    return `
      <form id="plus-cell-form">
        <input type="hidden" name="id" value="${escapeHtml(safeCell.id)}" />
        <label>
          Codigo da celula
          <input name="customId" type="text" value="${escapeHtml(safeCell.id)}" ${safeCell.id ? "readonly" : ""} placeholder="Ex.: setor-norte" />
        </label>
        <label>
          Nome
          <input name="name" type="text" value="${escapeHtml(safeCell.name)}" placeholder="Nome da celula" required />
        </label>
        <label>
          Lider principal
          <select name="leaderUid">
            ${renderLeaderOptions(safeCell.leaderUid)}
          </select>
        </label>
        <label>
          Co-lideres
          <input name="coLeaderUids" type="text" value="${escapeHtml((safeCell.coLeaderUids || []).join(", "))}" placeholder="uid-1, uid-2" />
        </label>
        <label>
          Dia da reuniao
          <select name="meetingDay">
            ${renderMeetingDayOptions(safeCell.meetingDay)}
          </select>
        </label>
        <label>
          Horario
          <input name="meetingTime" type="time" value="${escapeHtml(safeCell.meetingTime)}" />
        </label>
        <label>
          Endereco
          <textarea name="address" placeholder="Rua, numero, bairro">${escapeHtml(safeCell.address)}</textarea>
        </label>
        <label>
          Status
          <select name="status">
            <option value="active" ${safeCell.status === "active" ? "selected" : ""}>Ativa</option>
            <option value="inactive" ${safeCell.status === "inactive" ? "selected" : ""}>Inativa</option>
          </select>
        </label>
        <label>
          Observacoes
          <textarea name="notes" placeholder="Anotacoes internas">${escapeHtml(safeCell.notes)}</textarea>
        </label>
        <div class="plus-card-actions">
          <button type="submit" class="plus-inline-button">${safeCell.id ? "Salvar alteracoes" : "Criar celula"}</button>
          <button type="button" class="plus-secondary-button" data-new-cell="true">Nova celula</button>
        </div>
      </form>
    `;
  }

  function renderMemberRoleOptions(selectedValue) {
    const current = String(selectedValue || "member");
    return Object.entries(MEMBER_ROLE_LABELS)
      .map(([value, label]) => `<option value="${escapeHtml(value)}" ${value === current ? "selected" : ""}>${escapeHtml(label)}</option>`)
      .join("");
  }

  function renderMemberStatusOptions(selectedValue) {
    const current = String(selectedValue || "active");
    return Object.entries(MEMBER_STATUS_LABELS)
      .map(([value, label]) => `<option value="${escapeHtml(value)}" ${value === current ? "selected" : ""}>${escapeHtml(label)}</option>`)
      .join("");
  }

  function buildMembersListHtml() {
    if (!state.members.length) {
      return `<div class="plus-list-item"><strong>Nenhum membro cadastrado ainda.</strong><span>Assim que o primeiro membro entrar na base nova, ele aparecera aqui.</span></div>`;
    }

    return state.members
      .map((member) => {
        const selected = member.id === state.selectedMemberId;
        const cellName = findCellNameById(member.cellId) || member.cellId || "Sem celula";
        return `
          <div class="plus-list-item">
            <div class="plus-list-item-top">
              <div>
                <strong>${escapeHtml(member.name || member.id)}</strong>
                <small>${escapeHtml(cellName)}</small>
              </div>
              <div class="plus-card-actions">
                <span class="plus-role-pill">${escapeHtml(MEMBER_STATUS_LABELS[member.status] || member.status || "Ativo")}</span>
                <button type="button" class="plus-inline-button" data-select-member="${escapeHtml(member.id)}">${selected ? "Selecionado" : "Abrir"}</button>
              </div>
            </div>
            <span>${escapeHtml(`Papel: ${MEMBER_ROLE_LABELS[member.roleInCell] || member.roleInCell || "Membro"} | Entrada: ${member.joinedAt || "Nao informada"}`)}</span>
            <span>${escapeHtml(member.phone || member.notes || "Sem contato registrado.")}</span>
          </div>
        `;
      })
      .join("");
  }

  function buildMemberEditorHtml(member) {
    const safeMember = member || {
      id: "",
      cellId: getReportCells()[0]?.id || "",
      name: "",
      phone: "",
      roleInCell: "member",
      status: "active",
      joinedAt: new Date().toISOString().slice(0, 10),
      notes: "",
    };

    return `
      <form id="plus-member-form">
        <input type="hidden" name="id" value="${escapeHtml(safeMember.id)}" />
        <label>
          Celula
          <select name="cellId" required>
            ${renderReportCellOptions(safeMember.cellId)}
          </select>
        </label>
        <label>
          Nome
          <input name="name" type="text" value="${escapeHtml(safeMember.name)}" placeholder="Nome do membro" required />
        </label>
        <label>
          Telefone
          <input name="phone" type="text" value="${escapeHtml(safeMember.phone)}" placeholder="Contato principal" />
        </label>
        <label>
          Papel na celula
          <select name="roleInCell">
            ${renderMemberRoleOptions(safeMember.roleInCell)}
          </select>
        </label>
        <label>
          Status
          <select name="status">
            ${renderMemberStatusOptions(safeMember.status)}
          </select>
        </label>
        <label>
          Data de entrada
          <input name="joinedAt" type="date" value="${escapeHtml(safeMember.joinedAt)}" />
        </label>
        <label>
          Observacoes
          <textarea name="notes" placeholder="Notas ministeriais ou historico resumido">${escapeHtml(safeMember.notes)}</textarea>
        </label>
        <div class="plus-card-actions">
          <button type="submit" class="plus-inline-button">${safeMember.id ? "Salvar membro" : "Cadastrar membro"}</button>
          <button type="button" class="plus-secondary-button" data-new-member="true">Novo membro</button>
        </div>
      </form>
    `;
  }

  function getEditableReport() {
    const reports = Array.isArray(state.reports) ? state.reports : [];
    if (!reports.length) {
      return null;
    }

    if (state.selectedReportId === "__new__") {
      return null;
    }

    if (!state.selectedReportId && !canManageCells()) {
      state.selectedReportId = reports[0].id;
    }

    const selected = reports.find((report) => report.id === state.selectedReportId);
    if (selected) {
      return selected;
    }

    return canManageCells() ? null : reports[0];
  }

  function renderReportCellOptions(selectedValue) {
    const current = String(selectedValue || "");
    const options = getReportCells()
      .map((cell) => `<option value="${escapeHtml(cell.id)}" ${cell.id === current ? "selected" : ""}>${escapeHtml(cell.name || cell.id)}</option>`)
      .join("");
    return `<option value="">Selecione a celula</option>${options}`;
  }

  function buildReportsListHtml() {
    if (!state.reports.length) {
      return `<div class="plus-list-item"><strong>Nenhum relatorio encontrado.</strong><span>Assim que o primeiro relatorio for salvo, ele aparecera aqui.</span></div>`;
    }

    return state.reports
      .map((report) => {
        const selected = report.id === state.selectedReportId;
        const cellName = findCellNameById(report.cellId) || report.cellId || "Sem celula";
        return `
          <div class="plus-list-item">
            <div class="plus-list-item-top">
              <div>
                <strong>${escapeHtml(cellName)}</strong>
                <small>${escapeHtml(report.date || report.id)}</small>
              </div>
              <div class="plus-card-actions">
                <span class="plus-role-pill">${escapeHtml(`R$ ${Number(report.offering || 0).toFixed(2)}`)}</span>
                <button type="button" class="plus-inline-button" data-select-report="${escapeHtml(report.id)}">${selected ? "Selecionado" : "Abrir"}</button>
              </div>
            </div>
            <span>${escapeHtml(`Presentes: ${Number(report.presentCount || 0)} · Visitantes: ${Number(report.visitorsCount || 0)}`)}</span>
            <span>${escapeHtml(report.notes || "Sem observacoes registradas.")}</span>
          </div>
        `;
      })
      .join("");
  }

  function buildReportEditorHtml(report) {
    const safeReport = report || {
      id: "",
      cellId: getReportCells()[0]?.id || "",
      date: new Date().toISOString().slice(0, 10),
      leaders: state.profile?.name || "",
      host: "",
      address: "",
      presentCount: 0,
      visitorsCount: 0,
      offering: 0,
      notes: "",
    };

    return `
      <form id="plus-report-form">
        <input type="hidden" name="id" value="${escapeHtml(safeReport.id)}" />
        <label>
          Celula
          <select name="cellId" required>
            ${renderReportCellOptions(safeReport.cellId)}
          </select>
        </label>
        <label>
          Data
          <input name="date" type="date" value="${escapeHtml(safeReport.date)}" required />
        </label>
        <label>
          Lideranca presente
          <input name="leaders" type="text" value="${escapeHtml(safeReport.leaders)}" placeholder="Ex.: Ana, Paulo" />
        </label>
        <label>
          Anfitriao
          <input name="host" type="text" value="${escapeHtml(safeReport.host)}" placeholder="Casa onde a celula reuniu" />
        </label>
        <label>
          Endereco
          <textarea name="address" placeholder="Endereco da reuniao">${escapeHtml(safeReport.address)}</textarea>
        </label>
        <label>
          Presentes
          <input name="presentCount" type="number" min="0" step="1" value="${escapeHtml(safeReport.presentCount)}" />
        </label>
        <label>
          Visitantes
          <input name="visitorsCount" type="number" min="0" step="1" value="${escapeHtml(safeReport.visitorsCount)}" />
        </label>
        <label>
          Oferta
          <input name="offering" type="number" min="0" step="0.01" value="${escapeHtml(Number(safeReport.offering || 0).toFixed(2))}" />
        </label>
        <label>
          Observacoes
          <textarea name="notes" placeholder="Resumo do encontro">${escapeHtml(safeReport.notes)}</textarea>
        </label>
        <div class="plus-card-actions">
          <button type="submit" class="plus-inline-button">${safeReport.id ? "Salvar relatorio" : "Criar relatorio"}</button>
          <button type="button" class="plus-secondary-button" data-new-report="true">Novo relatorio</button>
        </div>
      </form>
    `;
  }

  function buildStudiesListHtml() {
    if (!state.studies.length) {
      return `<div class="plus-list-item"><strong>Nenhum estudo disponivel ainda.</strong><span>Quando o primeiro PDF for publicado, ele aparecera aqui.</span></div>`;
    }

    return state.studies
      .map((study) => {
        const selected = study.id === state.selectedStudyId;
        return `
          <div class="plus-list-item">
            <div class="plus-list-item-top">
              <div>
                <strong>${escapeHtml(study.title || study.id)}</strong>
                <small>${escapeHtml(study.audience || "all")}</small>
              </div>
              <div class="plus-card-actions">
                ${study.downloadUrl ? `<a class="plus-inline-button" href="${escapeHtml(study.downloadUrl)}" target="_blank" rel="noreferrer">Abrir PDF</a>` : ""}
                <button type="button" class="plus-inline-button" data-select-study="${escapeHtml(study.id)}">${selected ? "Selecionado" : "Detalhes"}</button>
              </div>
            </div>
            <span>${escapeHtml(study.fileName || "Arquivo sem nome")}</span>
            <span>${escapeHtml(study.description || "Sem descricao registrada.")}</span>
          </div>
        `;
      })
      .join("");
  }

  function buildStudyEditorHtml(study) {
    const safeStudy = study || {
      id: "",
      title: "",
      description: "",
      audience: "all",
      fileName: "",
      downloadUrl: "",
    };

    return `
      <form id="plus-study-form">
        <input type="hidden" name="id" value="${escapeHtml(safeStudy.id)}" />
        <label>
          Titulo
          <input name="title" type="text" value="${escapeHtml(safeStudy.title)}" placeholder="Ex.: Estudo de lideranca" required />
        </label>
        <label>
          Descricao
          <textarea name="description" placeholder="Resumo e orientacao do estudo">${escapeHtml(safeStudy.description)}</textarea>
        </label>
        <label>
          Audiencia
          <select name="audience">
            <option value="all" ${safeStudy.audience === "all" ? "selected" : ""}>Todos</option>
            <option value="leaders" ${safeStudy.audience === "leaders" ? "selected" : ""}>Lideres</option>
            <option value="coordinators" ${safeStudy.audience === "coordinators" ? "selected" : ""}>Coordenadoras</option>
            <option value="pastors" ${safeStudy.audience === "pastors" ? "selected" : ""}>Pastores e admin</option>
          </select>
        </label>
        <label>
          PDF do estudo
          <input name="file" type="file" accept="application/pdf" ${safeStudy.id ? "" : "required"} />
        </label>
        ${safeStudy.fileName ? `<p>Arquivo atual: <strong>${escapeHtml(safeStudy.fileName)}</strong></p>` : ""}
        ${safeStudy.downloadUrl ? `<p><a href="${escapeHtml(safeStudy.downloadUrl)}" target="_blank" rel="noreferrer">Abrir arquivo atual</a></p>` : ""}
        <div class="plus-card-actions">
          <button type="submit" class="plus-inline-button">${safeStudy.id ? "Salvar estudo" : "Publicar estudo"}</button>
          <button type="button" class="plus-secondary-button" data-new-study="true">Novo estudo</button>
        </div>
      </form>
    `;
  }

  function buildVisitorsListHtml() {
    if (!state.visitors.length) {
      return `<div class="plus-list-item"><strong>Nenhum visitante registrado ainda.</strong><span>Assim que um visitante for lancado, ele aparecera aqui.</span></div>`;
    }

    return state.visitors
      .map((visitor) => {
        const selected = visitor.id === state.selectedVisitorId;
        const cellName = findCellNameById(visitor.cellId) || visitor.cellId || "Sem celula";
        const whenLabel = visitor.lastVisitAt || visitor.firstVisitAt || "Sem data";
        return `
          <div class="plus-list-item">
            <div class="plus-list-item-top">
              <div>
                <strong>${escapeHtml(visitor.name || visitor.id)}</strong>
                <small>${escapeHtml(cellName)}</small>
              </div>
              <div class="plus-card-actions">
                <span class="plus-role-pill">${escapeHtml(visitor.status || "new")}</span>
                <button type="button" class="plus-inline-button" data-select-visitor="${escapeHtml(visitor.id)}">${selected ? "Selecionado" : "Abrir"}</button>
              </div>
            </div>
            <span>${escapeHtml(`Ultima visita: ${whenLabel} · Visitas: ${Number(visitor.visitCount || 0)}`)}</span>
            <span>${escapeHtml(visitor.context || visitor.notes || "Sem observacoes registradas.")}</span>
          </div>
        `;
      })
      .join("");
  }

  function buildVisitorEditorHtml(visitor) {
    const safeVisitor = visitor || {
      id: "",
      cellId: getReportCells()[0]?.id || "",
      name: "",
      phone: "",
      address: "",
      origin: "",
      context: "",
      status: "new",
      firstVisitAt: new Date().toISOString().slice(0, 10),
      lastVisitAt: new Date().toISOString().slice(0, 10),
      visitCount: 1,
      notes: "",
    };

    return `
      <form id="plus-visitor-form">
        <input type="hidden" name="id" value="${escapeHtml(safeVisitor.id)}" />
        <label>
          Celula
          <select name="cellId" required>
            ${renderReportCellOptions(safeVisitor.cellId)}
          </select>
        </label>
        <label>
          Nome
          <input name="name" type="text" value="${escapeHtml(safeVisitor.name)}" placeholder="Nome do visitante" required />
        </label>
        <label>
          Telefone
          <input name="phone" type="text" value="${escapeHtml(safeVisitor.phone)}" placeholder="Contato" />
        </label>
        <label>
          Endereco
          <textarea name="address" placeholder="Endereco">${escapeHtml(safeVisitor.address)}</textarea>
        </label>
        <label>
          Origem
          <input name="origin" type="text" value="${escapeHtml(safeVisitor.origin)}" placeholder="Quem trouxe ou como conheceu" />
        </label>
        <label>
          Contexto
          <textarea name="context" placeholder="Como foi a visita">${escapeHtml(safeVisitor.context)}</textarea>
        </label>
        <label>
          Status
          <select name="status">
            <option value="new" ${safeVisitor.status === "new" ? "selected" : ""}>Novo</option>
            <option value="returning" ${safeVisitor.status === "returning" ? "selected" : ""}>Retornando</option>
            <option value="follow_up" ${safeVisitor.status === "follow_up" ? "selected" : ""}>Em acompanhamento</option>
            <option value="member" ${safeVisitor.status === "member" ? "selected" : ""}>Virou membro</option>
          </select>
        </label>
        <label>
          Primeira visita
          <input name="firstVisitAt" type="date" value="${escapeHtml(safeVisitor.firstVisitAt)}" />
        </label>
        <label>
          Ultima visita
          <input name="lastVisitAt" type="date" value="${escapeHtml(safeVisitor.lastVisitAt)}" />
        </label>
        <label>
          Quantidade de visitas
          <input name="visitCount" type="number" min="0" step="1" value="${escapeHtml(safeVisitor.visitCount)}" />
        </label>
        <label>
          Observacoes
          <textarea name="notes" placeholder="Anotacoes pastorais ou acompanhamento">${escapeHtml(safeVisitor.notes)}</textarea>
        </label>
        <div class="plus-card-actions">
          <button type="submit" class="plus-inline-button">${safeVisitor.id ? "Salvar visitante" : "Registrar visitante"}</button>
          <button type="button" class="plus-secondary-button" data-new-visitor="true">Novo visitante</button>
        </div>
      </form>
    `;
  }

  function renderAlertTypeOptions(selectedValue) {
    const current = String(selectedValue || "care");
    return Object.entries(ALERT_TYPE_LABELS)
      .map(([value, label]) => `<option value="${escapeHtml(value)}" ${value === current ? "selected" : ""}>${escapeHtml(label)}</option>`)
      .join("");
  }

  function renderAlertSeverityOptions(selectedValue) {
    const current = String(selectedValue || "warn");
    return Object.entries(ALERT_SEVERITY_LABELS)
      .map(([value, label]) => `<option value="${escapeHtml(value)}" ${value === current ? "selected" : ""}>${escapeHtml(label)}</option>`)
      .join("");
  }

  function renderAlertStatusOptions(selectedValue) {
    const current = String(selectedValue || "open");
    return Object.entries(ALERT_STATUS_LABELS)
      .map(([value, label]) => `<option value="${escapeHtml(value)}" ${value === current ? "selected" : ""}>${escapeHtml(label)}</option>`)
      .join("");
  }

  function buildAlertsListHtml() {
    if (!state.alerts.length) {
      return `<div class="plus-list-item"><strong>Nenhum alerta manual registrado ainda.</strong><span>Os acompanhamentos criados pela equipe vao aparecer aqui.</span></div>`;
    }

    return state.alerts
      .map((alert) => {
        const selected = alert.id === state.selectedAlertId;
        const cellName = findCellNameById(alert.cellId) || alert.cellId || "Sem celula";
        const severityLabel = ALERT_SEVERITY_LABELS[alert.severity] || alert.severity || "Atencao";
        const statusLabel = ALERT_STATUS_LABELS[alert.status] || alert.status || "Aberto";
        return `
          <div class="plus-list-item">
            <div class="plus-list-item-top">
              <div>
                <strong>${escapeHtml(alert.title || alert.id)}</strong>
                <small>${escapeHtml(cellName)}</small>
              </div>
              <div class="plus-card-actions">
                <span class="plus-role-pill">${escapeHtml(severityLabel)}</span>
                <span class="plus-role-pill">${escapeHtml(statusLabel)}</span>
                <button type="button" class="plus-inline-button" data-select-alert="${escapeHtml(alert.id)}">${selected ? "Selecionado" : "Abrir"}</button>
              </div>
            </div>
            <span>${escapeHtml(alert.summary || "Sem resumo registrado.")}</span>
            <span>${escapeHtml(`Tipo: ${ALERT_TYPE_LABELS[alert.type] || alert.type || "Cuidado"} | Prazo: ${alert.dueAt || "Livre"}`)}</span>
          </div>
        `;
      })
      .join("");
  }

  function buildAlertEditorHtml(alert) {
    const safeAlert = alert || {
      id: "",
      cellId: getReportCells()[0]?.id || "",
      type: "care",
      severity: "warn",
      status: "open",
      title: "",
      summary: "",
      ownerUid: "",
      dueAt: "",
      notes: "",
    };

    return `
      <form id="plus-alert-form">
        <input type="hidden" name="id" value="${escapeHtml(safeAlert.id)}" />
        <label>
          Celula
          <select name="cellId" required>
            ${renderReportCellOptions(safeAlert.cellId)}
          </select>
        </label>
        <label>
          Tipo
          <select name="type">
            ${renderAlertTypeOptions(safeAlert.type)}
          </select>
        </label>
        <label>
          Gravidade
          <select name="severity">
            ${renderAlertSeverityOptions(safeAlert.severity)}
          </select>
        </label>
        <label>
          Status
          <select name="status">
            ${renderAlertStatusOptions(safeAlert.status)}
          </select>
        </label>
        <label>
          Titulo
          <input name="title" type="text" value="${escapeHtml(safeAlert.title)}" placeholder="Ex.: Familia precisa de visita" required />
        </label>
        <label>
          Resumo
          <textarea name="summary" placeholder="Contexto rapido do acompanhamento">${escapeHtml(safeAlert.summary)}</textarea>
        </label>
        <label>
          Responsavel (uid)
          <input name="ownerUid" type="text" value="${escapeHtml(safeAlert.ownerUid)}" placeholder="Uid de quem vai acompanhar" />
        </label>
        <label>
          Prazo
          <input name="dueAt" type="date" value="${escapeHtml(safeAlert.dueAt)}" />
        </label>
        <label>
          Observacoes internas
          <textarea name="notes" placeholder="Anotacoes ministeriais">${escapeHtml(safeAlert.notes)}</textarea>
        </label>
        <div class="plus-card-actions">
          <button type="submit" class="plus-inline-button">${safeAlert.id ? "Salvar alerta" : "Criar alerta"}</button>
          <button type="button" class="plus-secondary-button" data-new-alert="true">Novo alerta</button>
        </div>
      </form>
    `;
  }

  function collectDerivedAlerts() {
    const visibleCells = getVisibleCells();
    const currentMonth = new Date().toISOString().slice(0, 7);
    const reportsThisMonth = state.reports.filter((report) => String(report.date || "").slice(0, 7) === currentMonth);
    const reportedCellIds = new Set(reportsThisMonth.map((report) => String(report.cellId || "").trim()).filter(Boolean));
    const derived = [];
    const cellsMissingReport = visibleCells.filter((cell) => cell.status !== "inactive" && !reportedCellIds.has(cell.id));
    const followUpVisitors = state.visitors.filter((visitor) => String(visitor.status || "").trim() === "follow_up");
    const cellsWithoutLeader = visibleCells.filter((cell) => !String(cell.leaderUid || "").trim());
    const profilesPending = canManageAccess()
      ? state.profiles.filter((profile) => normalizeRole(profile.role) === "pending" || normalizeStatus(profile.status) === "pending")
      : [];

    if (cellsMissingReport.length) {
      derived.push({
        severity: "warn",
        title: "Celulas sem relatorio neste mes",
        summary: cellsMissingReport.map((cell) => cell.name || cell.id).slice(0, 4).join(", "),
        route: "reports",
      });
    }

    if (followUpVisitors.length) {
      derived.push({
        severity: "info",
        title: "Visitantes em acompanhamento",
        summary: followUpVisitors
          .slice(0, 4)
          .map((visitor) => `${visitor.name || visitor.id} (${findCellNameById(visitor.cellId) || visitor.cellId || "Sem celula"})`)
          .join(", "),
        route: "visitors",
      });
    }

    if (cellsWithoutLeader.length) {
      derived.push({
        severity: "critical",
        title: "Celulas sem lider definido",
        summary: cellsWithoutLeader.map((cell) => cell.name || cell.id).slice(0, 4).join(", "),
        route: "cells",
      });
    }

    if (profilesPending.length) {
      derived.push({
        severity: "warn",
        title: "Perfis aguardando liberacao",
        summary: profilesPending.map((profile) => profile.name || profile.email || profile.uid).slice(0, 4).join(", "),
        route: "access",
      });
    }

    return derived;
  }

  function buildDerivedAlertsHtml() {
    const items = collectDerivedAlerts();
    if (!items.length) {
      return `<div class="plus-list-item"><strong>Nenhum sinal estrutural urgente agora.</strong><span>O modulo vai destacar aqui os pontos que pedem cuidado ou reorganizacao.</span></div>`;
    }

    return items
      .map((item) => `
        <div class="plus-list-item">
          <div class="plus-list-item-top">
            <div>
              <strong>${escapeHtml(item.title)}</strong>
              <small>${escapeHtml(ALERT_SEVERITY_LABELS[item.severity] || item.severity || "Atencao")}</small>
            </div>
            <div class="plus-card-actions">
              <span class="plus-role-pill">${escapeHtml(ALERT_SEVERITY_LABELS[item.severity] || item.severity || "Atencao")}</span>
              ${item.route && canAccessRoute(item.route) ? `<button type="button" class="plus-inline-button" data-dashboard-route="${escapeHtml(item.route)}">Abrir modulo</button>` : ""}
            </div>
          </div>
          <span>${escapeHtml(item.summary || "Sem resumo adicional.")}</span>
        </div>
      `)
      .join("");
  }

  function buildProfilesListHtml() {
    if (!state.profiles.length) {
      return `<div class="plus-list-item"><strong>Nenhum perfil carregado.</strong><span>Assim que novas contas forem criadas, elas aparecerao aqui.</span></div>`;
    }

    return state.profiles
      .map((profile) => {
        const selected = profile.uid === state.selectedProfileUid;
        const canEdit = canManageProfile(profile) || profile.uid === state.profile?.uid;
        return `
          <div class="plus-list-item">
            <div class="plus-list-item-top">
              <div>
                <strong>${escapeHtml(profile.name || profile.email || profile.uid)}</strong>
                <small>${escapeHtml(profile.email || profile.uid)}</small>
              </div>
              <div class="plus-card-actions">
                <span class="plus-role-pill">${escapeHtml(ROLE_LABELS[normalizeRole(profile.role)] || "Sem perfil")}</span>
                <span class="plus-role-pill">${escapeHtml(STATUS_LABELS[normalizeStatus(profile.status)] || "Pendente")}</span>
                ${canEdit ? `<button type="button" class="plus-inline-button" data-select-profile="${escapeHtml(profile.uid)}">${selected ? "Editando" : "Editar"}</button>` : ""}
              </div>
            </div>
            <span>${escapeHtml(profile.primaryCellId ? `Celula principal: ${profile.primaryCellId}` : "Sem celula principal")}</span>
            <span>${escapeHtml(profile.scopeCellIds.length ? `Escopo: ${profile.scopeCellIds.join(", ")}` : "Sem escopo complementar")}</span>
          </div>
        `;
      })
      .join("");
  }

  function buildAccessCardsV2() {
    const editable = getEditableProfile();
    const canAssignAdmin = state.profile?.role === "admin";

    return [
      {
        span: "4",
        kicker: "Governanca",
        title: "Perfis carregados",
        metrics: [
          { value: String(state.profiles.length), label: "Perfis na Renovo+" },
          { value: String(state.allCells.length), label: "Celulas para escopo" },
          { value: ROLE_LABELS[normalizeRole(state.profile?.role)] || "Sem perfil", label: "Seu papel atual" },
        ],
      },
      {
        span: "8",
        kicker: "Fluxo de entrada",
        title: "Como novos usuarios entram",
        body: "Agora a porta de entrada pode ser a propria tela de cadastro da Renovo+. O admin ou pastor entra aqui depois para revisar o perfil ministerial.",
        items: [
          "O usuario cria a propria conta com e-mail e senha.",
          "A primeira conta vira admin automaticamente.",
          "As proximas contas entram como pending e aparecem na lista de perfis.",
        ],
      },
      {
        span: "6",
        kicker: "Lista de perfis",
        title: "Usuarios da Renovo+",
        html: `<div class="plus-list">${buildProfilesListHtml()}</div>`,
      },
      {
        span: "6",
        kicker: "Editor",
        title: editable ? `Perfil de ${editable.name || editable.email || editable.uid}` : "Selecione um perfil",
        html: editable
          ? `
            <form id="plus-profile-form">
              <input type="hidden" name="uid" value="${escapeHtml(editable.uid)}" />
              <label>
                Nome
                <input name="name" type="text" value="${escapeHtml(editable.name)}" required />
              </label>
              <label>
                E-mail
                <input name="email" type="email" value="${escapeHtml(editable.email)}" readonly />
              </label>
              <label>
                Role
                <select name="role">
                  <option value="pending" ${editable.role === "pending" ? "selected" : ""}>Sem perfil</option>
                  <option value="leader" ${editable.role === "leader" ? "selected" : ""}>Lider</option>
                  <option value="coordinator" ${editable.role === "coordinator" ? "selected" : ""}>Coordenadora</option>
                  <option value="pastor" ${editable.role === "pastor" ? "selected" : ""}>Pastor</option>
                  ${canAssignAdmin ? `<option value="admin" ${editable.role === "admin" ? "selected" : ""}>Admin</option>` : ""}
                </select>
              </label>
              <label>
                Status
                <select name="status">
                  <option value="pending" ${normalizeStatus(editable.status) === "pending" ? "selected" : ""}>Pendente</option>
                  <option value="active" ${normalizeStatus(editable.status) === "active" ? "selected" : ""}>Ativo</option>
                  <option value="inactive" ${normalizeStatus(editable.status) === "inactive" ? "selected" : ""}>Inativo</option>
                </select>
              </label>
              <label>
                Celula principal
                <select name="primaryCellId">
                  ${renderCellSelectOptions(editable.primaryCellId)}
                </select>
              </label>
              <label>
                Escopo supervisionado
                <input name="scopeCellIds" type="text" value="${escapeHtml((editable.scopeCellIds || []).join(", "))}" placeholder="cell-azul, cell-vinho" />
              </label>
              <label>
                Ministerio
                <input name="ministryName" type="text" value="${escapeHtml(editable.ministryName)}" placeholder="Ex.: Supervisao setor norte" />
              </label>
              <label>
                Observacoes
                <textarea name="notes" placeholder="Observacoes internas">${escapeHtml(editable.notes)}</textarea>
              </label>
              <div class="plus-card-actions">
                <button type="submit" class="plus-inline-button">Salvar perfil</button>
              </div>
            </form>
          `
          : `<p>Nenhum perfil selecionado ainda.</p>`,
      },
    ];
  }

  function buildPendingCardsV2() {
    const cards = [
      {
        span: "8",
        kicker: "Onboarding",
        title: "Conta autenticada, mas ainda sem governanca liberada",
        body: state.profile
          ? "Seu cadastro ja existe, mas o papel ou o status ainda nao liberaram os modulos finais da Renovo+."
          : "A autenticacao funcionou, mas ainda nao encontramos um documento em renovo_plus_users para este uid.",
        items: [
          `UID autenticado: ${state.authUser?.uid || "-"}`,
          `E-mail: ${state.authUser?.email || "-"}`,
          state.profile
            ? `Role atual: ${ROLE_LABELS[normalizeRole(state.profile.role)] || "Sem perfil"}`
            : "Crie um documento de perfil ou use o bootstrap se este for o primeiro acesso.",
        ],
      },
      {
        span: "4",
        kicker: "Situacao",
        title: state.hasAnyProfiles ? "Aguardando configuracao" : "Nenhum perfil ainda",
        body: state.hasAnyProfiles
          ? "Um admin ou pastor precisa completar seu papel, status e escopo no modulo de acessos."
          : "Como esta e a primeira conta autenticada, ja podemos criar o admin inicial por aqui.",
        items: [
          "Colecao alvo: renovo_plus_users/{uid}",
          "Campos minimos: name, email, role, status",
          "Escopo: primaryCellId e scopeCellIds",
        ],
      },
    ];

    if (!state.hasAnyProfiles && state.authUser) {
      cards.push(buildBootstrapCard());
    }

    return cards;
  }

  function getCardsForRoute(route) {
    if (!state.profile || normalizeRole(state.profile.role) === "pending" || normalizeStatus(state.profile.status) === "pending") {
      return buildPendingCardsV2();
    }

    if (route === "cells") return buildCellsCards();
    if (route === "members") return buildMembersCards();
    if (route === "reports") return buildReportsCards();
    if (route === "studies") return buildStudiesCards();
    if (route === "visitors") return buildVisitorsCards();
    if (route === "alerts") return buildAlertsCards();
    if (route === "access") return buildAccessCardsV2();
    return buildDashboardCards();
  }

  function renderNav() {
    const buttons = nav.querySelectorAll("[data-route]");
    buttons.forEach((button) => {
      const route = button.dataset.route;
      const visible = canAccessRoute(route);
      button.hidden = !visible;
      button.classList.toggle("is-active", state.route === route && visible);
    });
  }

  function renderWarning() {
    if (!state.authUser) {
      profileWarning.hidden = true;
      profileWarning.textContent = "";
      return;
    }

    if (!state.profile) {
      profileWarning.hidden = false;
      profileWarning.innerHTML = `
        <strong>Perfil ainda não encontrado.</strong><br />
        O uid autenticado é <code>${escapeHtml(state.authUser.uid)}</code>. Crie o documento correspondente em
        <code>${escapeHtml(window.renovoPlusFirebase?.collections?.users || "renovo_plus_users")}/${escapeHtml(state.authUser.uid)}</code>
        para liberar módulos e permissões.
      `;
      return;
    }

    if (normalizeRole(state.profile.role) === "pending" || normalizeStatus(state.profile.status) === "pending") {
      profileWarning.hidden = false;
      profileWarning.innerHTML = `
        <strong>Conta autenticada, aguardando liberacao.</strong><br />
        Este uid ja existe na Renovo+, mas ainda precisa de papel ministerial e status ativo para abrir os modulos finais.
      `;
      return;
    }

    if (status === "pending" || role === "pending") {
      setStatus("Aguardando liberacao", "warn");
      return;
    }

    if (state.profile.status === "inactive") {
      profileWarning.hidden = false;
      profileWarning.textContent = "Este perfil está marcado como inativo. A ideia é que a V2 bloqueie operações sensíveis nesse estado.";
      return;
    }

    profileWarning.hidden = true;
    profileWarning.textContent = "";
  }

  function renderPage() {
    ensureAllowedRoute();
    renderNav();
    renderWarning();

    const definition = MODULE_DEFS[state.route] || MODULE_DEFS.dashboard;
    pageKicker.textContent = definition.kicker;
    pageTitle.textContent = definition.title;
    pageDescription.textContent = definition.description;
    pageBody.innerHTML = getCardsForRoute(state.route).map(renderCard).join("");
  }

  function showAuthScreen() {
    loadingScreen.hidden = true;
    shell.hidden = true;
    authScreen.hidden = false;
  }

  function showShell() {
    loadingScreen.hidden = true;
    authScreen.hidden = true;
    shell.hidden = false;
  }

  function showBootstrapFallback(message) {
    loadingScreen.hidden = true;
    authScreen.hidden = false;
    shell.hidden = true;
    setFeedback(message || "", "soft");
  }

  function updateUserSummary() {
    const role = normalizeRole(state.profile?.role);
    if (!state.authUser) {
      userNameEl.textContent = "Conta desconectada";
      userMetaEl.textContent = "-";
      setStatus("Desconectado", "neutral");
      return;
    }
    const status = normalizeStatus(state.profile?.status);
    userNameEl.textContent = state.profile?.name || state.authUser?.displayName || state.authUser?.email || "Conta autenticada";
    userMetaEl.textContent = `${ROLE_LABELS[role] || "Sem perfil"} · ${state.profile?.email || state.authUser?.email || "-"}`;

    userMetaEl.textContent = `${ROLE_LABELS[role] || "Sem perfil"} · ${STATUS_LABELS[status] || "Pendente"} · ${state.profile?.email || state.authUser?.email || "-"}`;

    if (!state.profile) {
      setStatus("Perfil pendente", "warn");
      return;
    }

    if (state.profile.status === "inactive") {
      setStatus("Perfil inativo", "danger");
      return;
    }

    setStatus("Sessão ativa", "ok");
  }

  async function refreshProfile(user) {
    state.authUser = user || null;
    state.profile = null;
    state.accessibleCells = [];

    if (!user) {
      updateUserSummary();
      showAuthScreen();
      return;
    }

    try {
      const profile = await window.renovoPlusFirebase.loadUserProfile(user.uid);
      state.profile = profile;
      if (profile) {
        state.accessibleCells = await window.renovoPlusFirebase.listAccessibleCells(profile);
      }
    } catch (error) {
      console.warn("[Renovo+] profile:", error?.message || error);
      setStatus("Falha ao ler perfil", "danger");
    }

    updateUserSummary();
    renderPage();
    showShell();
  }

  async function handleLogin(event) {
    event.preventDefault();
    const formData = new FormData(authForm);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");

    if (!email || !password) {
      setFeedback("Informe e-mail e senha.");
      return;
    }

    try {
      loginButton.disabled = true;
      loginButton.textContent = "Entrando...";
      setFeedback("Autenticando no Firebase...", "soft");
      await window.renovoPlusFirebase.signInWithEmail(email, password);
      setFeedback("", "soft");
    } catch (error) {
      const code = String(error?.code || "");
      if (code.includes("user-not-found") || code.includes("wrong-password") || code.includes("invalid-login-credentials")) {
        setFeedback("E-mail ou senha inválidos.");
      } else if (code.includes("invalid-email")) {
        setFeedback("Informe um e-mail válido.");
      } else if (code.includes("operation-not-allowed")) {
        setFeedback("O login por e-mail/senha ainda não está habilitado neste projeto Firebase.");
      } else {
        setFeedback(error?.message || "Não foi possível entrar agora.");
      }
    } finally {
      loginButton.disabled = false;
      loginButton.textContent = "Entrar na Renovo+";
    }
  }

  async function handleSignOut() {
    try {
      signOutButton.disabled = true;
      await window.renovoPlusFirebase.signOut();
    } catch (error) {
      console.warn("[Renovo+] signOut:", error?.message || error);
    } finally {
      signOutButton.disabled = false;
    }
  }

  function handleNavClick(event) {
    const button = event.target.closest("[data-route]");
    if (!button) {
      return;
    }

    const route = String(button.dataset.route || "dashboard");
    if (!canAccessRoute(route)) {
      return;
    }

    state.route = route;
    renderPage();
  }

  async function bootstrap() {
    versionLabel.textContent = String(window.RENOVO_PLUS_VERSION || "dev");
    setStatus("Carregando", "neutral");
    updateUserSummary();

    authForm?.addEventListener("submit", handleLogin);
    signOutButton?.addEventListener("click", handleSignOut);
    nav?.addEventListener("click", handleNavClick);

    try {
      await window.renovoPlusFirebase.waitForAuthReady();
      window.renovoPlusFirebase.observeAuth((user) => {
        refreshProfile(user);
      });
    } catch (error) {
      console.warn("[Renovo+] bootstrap:", error?.message || error);
      loadingScreen.hidden = true;
      authScreen.hidden = false;
      setFeedback(error?.message || "Não foi possível iniciar a Renovo+.");
    }
  }

  function renderWarning() {
    if (!state.authUser) {
      profileWarning.hidden = true;
      profileWarning.textContent = "";
      return;
    }

    if (!state.profile) {
      profileWarning.hidden = false;
      profileWarning.innerHTML = `
        <strong>Perfil ainda nao encontrado.</strong><br />
        O uid autenticado e <code>${escapeHtml(state.authUser.uid)}</code>. Crie o documento correspondente em
        <code>${escapeHtml(window.renovoPlusFirebase?.collections?.users || "renovo_plus_users")}/${escapeHtml(state.authUser.uid)}</code>
        para liberar modulos e permissoes.
      `;
      return;
    }

    if (normalizeRole(state.profile.role) === "pending" || normalizeStatus(state.profile.status) === "pending") {
      profileWarning.hidden = false;
      profileWarning.innerHTML = `
        <strong>Conta autenticada, aguardando liberacao.</strong><br />
        Este uid ja existe na Renovo+, mas ainda precisa de papel ministerial e status ativo para abrir os modulos finais.
      `;
      return;
    }

    if (state.profile.status === "inactive") {
      profileWarning.hidden = false;
      profileWarning.textContent = "Este perfil esta marcado como inativo. A ideia e que a V2 bloqueie operacoes sensiveis nesse estado.";
      return;
    }

    profileWarning.hidden = true;
    profileWarning.textContent = "";
  }

  function updateUserSummary() {
    const role = normalizeRole(state.profile?.role);

    if (!state.authUser) {
      userNameEl.textContent = "Conta desconectada";
      userMetaEl.textContent = "-";
      setStatus("Desconectado", "neutral");
      return;
    }

    const status = normalizeStatus(state.profile?.status);
    const roleLabel = ROLE_LABELS[role] || "Sem perfil";
    const statusLabel = STATUS_LABELS[status] || "Pendente";

    userNameEl.textContent = state.profile?.name || state.authUser?.displayName || state.authUser?.email || "Conta autenticada";
    userMetaEl.textContent = `${roleLabel} · ${statusLabel} · ${state.profile?.email || state.authUser?.email || "-"}`;

    if (!state.profile) {
      setStatus("Perfil pendente", "warn");
      return;
    }

    if (status === "pending" || role === "pending") {
      setStatus("Aguardando liberacao", "warn");
      return;
    }

    if (status === "inactive") {
      setStatus("Perfil inativo", "danger");
      return;
    }

    setStatus("Sessao ativa", "ok");
  }

  async function loadGovernanceContext() {
    state.hasAnyProfiles = false;
    state.profiles = [];
    state.allCells = [];

    try {
      state.hasAnyProfiles = await window.renovoPlusFirebase.hasAnyProfiles();
    } catch (error) {
      console.warn("[Renovo+] hasAnyProfiles:", error?.message || error);
    }

    if (!canManageAccess()) {
      state.selectedProfileUid = state.profile?.uid || "";
      return;
    }

    try {
      const [profiles, allCells] = await Promise.all([
        window.renovoPlusFirebase.listProfiles(),
        window.renovoPlusFirebase.listAllCells(),
      ]);

      state.profiles = profiles;
      state.allCells = allCells;

      if (profiles.some((profile) => profile.uid === state.selectedProfileUid)) {
        return;
      }

      const ownProfile = profiles.find((profile) => profile.uid === state.profile?.uid);
      state.selectedProfileUid = ownProfile?.uid || profiles[0]?.uid || "";
    } catch (error) {
      console.warn("[Renovo+] governance:", error?.message || error);
    }
  }

  async function refreshProfile(user) {
    state.authUser = user || null;
    state.profile = null;
    state.accessibleCells = [];
    state.allCells = [];
    state.members = [];
    state.reports = [];
    state.studies = [];
    state.visitors = [];
    state.alerts = [];
    state.profiles = [];
    state.hasAnyProfiles = false;
    state.selectedProfileUid = "";
    state.selectedCellId = "";
    state.selectedMemberId = "";
    state.route = "dashboard";
    state.selectedReportId = "";
    state.selectedStudyId = "";
    state.selectedVisitorId = "";
    state.selectedAlertId = "";

    if (!user) {
      setFeedback("", "soft");
      updateUserSummary();
      showAuthScreen();
      return;
    }

    try {
      const profile = await window.renovoPlusFirebase.loadUserProfile(user.uid);
      state.profile = profile;

      if (profile) {
        state.accessibleCells = await window.renovoPlusFirebase.listAccessibleCells(profile);
        state.members = await window.renovoPlusFirebase.listAccessibleMembers(profile);
        state.reports = await window.renovoPlusFirebase.listAccessibleReports(profile);
        state.studies = await window.renovoPlusFirebase.listAccessibleStudies(profile);
        state.visitors = await window.renovoPlusFirebase.listAccessibleVisitors(profile);
        state.alerts = await window.renovoPlusFirebase.listAccessibleAlerts(profile);
      }

      await loadGovernanceContext();
    } catch (error) {
      console.warn("[Renovo+] profile:", error?.message || error);
      setStatus("Falha ao ler perfil", "danger");
    }

    updateUserSummary();
    renderPage();
    showShell();
  }

  async function handleBootstrapSubmit(event) {
    event.preventDefault();
    if (!state.authUser) {
      return;
    }

    const form = event.target;
    const submitButton = form.querySelector('button[type="submit"]');
    const formData = new FormData(form);
    const name = String(formData.get("name") || "").trim();
    const ministryName = String(formData.get("ministryName") || "").trim();

    if (!name) {
      setStatus("Informe um nome", "warn");
      return;
    }

    try {
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Assumindo...";
      }

      setStatus("Criando primeiro admin", "warn");
      await window.renovoPlusFirebase.claimInitialAdminProfile(state.authUser, {
        name,
        email: state.authUser.email || "",
        ministryName,
      });

      await refreshProfile(state.authUser);
      setStatus("Admin inicial pronto", "ok");
    } catch (error) {
      console.warn("[Renovo+] bootstrap admin:", error?.message || error);
      setStatus("Falha no bootstrap", "danger");
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Assumir como primeiro admin";
      }
    }
  }

  async function handleProfileSave(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const uid = String(formData.get("uid") || "").trim();
    const targetProfile = state.profiles.find((profile) => profile.uid === uid) || null;
    const canEdit = Boolean(targetProfile) && (canManageProfile(targetProfile) || uid === state.profile?.uid);

    if (!uid || !canEdit) {
      setStatus("Edicao nao permitida", "danger");
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    const requestedRole = String(formData.get("role") || "").trim();
    const safeRole = state.profile?.role === "admin" || requestedRole !== "admin"
      ? requestedRole
      : targetProfile?.role || "pending";
    const scopeCellIds = String(formData.get("scopeCellIds") || "")
      .split(/[,\n;]+/)
      .map((value) => value.trim())
      .filter(Boolean);

    try {
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Salvando...";
      }

      setStatus("Salvando perfil", "warn");
      await window.renovoPlusFirebase.saveUserProfile(uid, {
        name: String(formData.get("name") || "").trim(),
        email: String(formData.get("email") || "").trim(),
        role: safeRole,
        status: String(formData.get("status") || "").trim(),
        primaryCellId: String(formData.get("primaryCellId") || "").trim(),
        scopeCellIds,
        ministryName: String(formData.get("ministryName") || "").trim(),
        notes: String(formData.get("notes") || "").trim(),
      });

      state.selectedProfileUid = uid;
      await refreshProfile(state.authUser);
      state.route = "access";
      renderPage();
      setStatus("Perfil salvo", "ok");
    } catch (error) {
      console.warn("[Renovo+] save profile:", error?.message || error);
      setStatus("Falha ao salvar perfil", "danger");
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Salvar perfil";
      }
    }
  }

  async function handleCellSave(event) {
    event.preventDefault();
    if (!canManageCells()) {
      setStatus("Somente admin ou pastor podem salvar celulas", "danger");
      return;
    }

    const form = event.target;
    const formData = new FormData(form);
    const name = String(formData.get("name") || "").trim();
    const submitButton = form.querySelector('button[type="submit"]');

    if (!name) {
      setStatus("Informe o nome da celula", "warn");
      return;
    }

    const coLeaderUids = String(formData.get("coLeaderUids") || "")
      .split(/[,\n;]+/)
      .map((value) => value.trim())
      .filter(Boolean);

    try {
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Salvando...";
      }

      setStatus("Salvando celula", "warn");
      const saved = await window.renovoPlusFirebase.saveCell({
        id: String(formData.get("id") || "").trim(),
        customId: String(formData.get("customId") || "").trim(),
        name,
        leaderUid: String(formData.get("leaderUid") || "").trim(),
        coLeaderUids,
        meetingDay: String(formData.get("meetingDay") || "").trim(),
        meetingTime: String(formData.get("meetingTime") || "").trim(),
        address: String(formData.get("address") || "").trim(),
        status: String(formData.get("status") || "").trim(),
        notes: String(formData.get("notes") || "").trim(),
      }, state.authUser?.uid || "");

      state.selectedCellId = saved?.id || "";
      await refreshProfile(state.authUser);
      state.selectedCellId = saved?.id || state.selectedCellId;
      state.route = "cells";
      renderPage();
      setStatus("Celula salva", "ok");
    } catch (error) {
      console.warn("[Renovo+] save cell:", error?.message || error);
      setStatus("Falha ao salvar celula", "danger");
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = String(formData.get("id") || "").trim() ? "Salvar alteracoes" : "Criar celula";
      }
    }
  }

  async function handleMemberSave(event) {
    event.preventDefault();
    if (!canManageMembers()) {
      setStatus("Seu perfil nao pode salvar membros agora", "danger");
      return;
    }

    const form = event.target;
    const formData = new FormData(form);
    const cellId = String(formData.get("cellId") || "").trim();
    const name = String(formData.get("name") || "").trim();
    const allowedCellIds = new Set(getReportCells().map((cell) => cell.id));

    if (!cellId || !name) {
      setStatus("Informe a celula e o nome do membro", "warn");
      return;
    }

    if (!allowedCellIds.has(cellId)) {
      setStatus("Seu perfil nao pode cadastrar membros nessa celula", "danger");
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    const existingId = String(formData.get("id") || "").trim();

    try {
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Salvando...";
      }

      setStatus("Salvando membro", "warn");
      const saved = await window.renovoPlusFirebase.saveMember({
        id: existingId,
        cellId,
        name,
        phone: String(formData.get("phone") || "").trim(),
        roleInCell: String(formData.get("roleInCell") || "member").trim(),
        status: String(formData.get("status") || "active").trim(),
        joinedAt: String(formData.get("joinedAt") || "").trim(),
        notes: String(formData.get("notes") || "").trim(),
      }, state.authUser?.uid || "");

      state.selectedMemberId = saved?.id || "";
      await refreshProfile(state.authUser);
      state.selectedMemberId = saved?.id || state.selectedMemberId;
      state.route = "members";
      renderPage();
      setStatus("Membro salvo", "ok");
    } catch (error) {
      console.warn("[Renovo+] save member:", error?.message || error);
      setStatus("Falha ao salvar membro", "danger");
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = existingId ? "Salvar membro" : "Cadastrar membro";
      }
    }
  }

  async function handleReportSave(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const cellId = String(formData.get("cellId") || "").trim();
    const date = String(formData.get("date") || "").trim();
    const allowedCellIds = new Set(getReportCells().map((cell) => cell.id));

    if (!cellId || !date) {
      setStatus("Informe a celula e a data do relatorio", "warn");
      return;
    }

    if (!allowedCellIds.has(cellId)) {
      setStatus("Seu perfil nao pode registrar relatorio nessa celula", "danger");
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    const existingId = String(formData.get("id") || "").trim();
    const presentCount = Number(formData.get("presentCount") || 0);
    const visitorsCount = Number(formData.get("visitorsCount") || 0);
    const offering = Number(formData.get("offering") || 0);

    try {
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Salvando...";
      }

      setStatus("Salvando relatorio", "warn");
      const saved = await window.renovoPlusFirebase.saveReport({
        id: existingId,
        cellId,
        date,
        leaders: String(formData.get("leaders") || "").trim(),
        host: String(formData.get("host") || "").trim(),
        address: String(formData.get("address") || "").trim(),
        presentCount: Number.isFinite(presentCount) ? presentCount : 0,
        visitorsCount: Number.isFinite(visitorsCount) ? visitorsCount : 0,
        offering: Number.isFinite(offering) ? offering : 0,
        notes: String(formData.get("notes") || "").trim(),
      }, state.authUser?.uid || "");

      state.selectedReportId = saved?.id || "";
      await refreshProfile(state.authUser);
      state.selectedReportId = saved?.id || state.selectedReportId;
      state.route = "reports";
      renderPage();
      setStatus("Relatorio salvo", "ok");
    } catch (error) {
      console.warn("[Renovo+] save report:", error?.message || error);
      setStatus("Falha ao salvar relatorio", "danger");
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = existingId ? "Salvar relatorio" : "Criar relatorio";
      }
    }
  }

  async function handleStudySave(event) {
    event.preventDefault();
    if (!canManageStudies()) {
      setStatus("Somente admin ou pastor podem publicar estudos", "danger");
      return;
    }

    const form = event.target;
    const formData = new FormData(form);
    const title = String(formData.get("title") || "").trim();
    const existingId = String(formData.get("id") || "").trim();
    const file = formData.get("file");

    if (!title) {
      setStatus("Informe o titulo do estudo", "warn");
      return;
    }

    if (!existingId && (!(file instanceof File) || !file.name)) {
      setStatus("Envie um PDF para publicar o estudo", "warn");
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');

    try {
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Publicando...";
      }

      setStatus("Salvando estudo", "warn");
      const saved = await window.renovoPlusFirebase.saveStudy({
        id: existingId,
        title,
        description: String(formData.get("description") || "").trim(),
        audience: String(formData.get("audience") || "all").trim(),
        file: file instanceof File && file.name ? file : null,
      }, state.authUser?.uid || "");

      state.selectedStudyId = saved?.id || "";
      await refreshProfile(state.authUser);
      state.selectedStudyId = saved?.id || state.selectedStudyId;
      state.route = "studies";
      renderPage();
      setStatus("Estudo salvo", "ok");
    } catch (error) {
      console.warn("[Renovo+] save study:", error?.message || error);
      setStatus("Falha ao salvar estudo", "danger");
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = existingId ? "Salvar estudo" : "Publicar estudo";
      }
    }
  }

  async function handleVisitorSave(event) {
    event.preventDefault();
    if (!canManageVisitors()) {
      setStatus("Seu perfil nao pode salvar visitantes agora", "danger");
      return;
    }

    const form = event.target;
    const formData = new FormData(form);
    const cellId = String(formData.get("cellId") || "").trim();
    const name = String(formData.get("name") || "").trim();
    const allowedCellIds = new Set(getReportCells().map((cell) => cell.id));

    if (!cellId || !name) {
      setStatus("Informe a celula e o nome do visitante", "warn");
      return;
    }

    if (!allowedCellIds.has(cellId)) {
      setStatus("Seu perfil nao pode registrar visitante nessa celula", "danger");
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    const existingId = String(formData.get("id") || "").trim();
    const visitCount = Number(formData.get("visitCount") || 0);

    try {
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Salvando...";
      }

      setStatus("Salvando visitante", "warn");
      const saved = await window.renovoPlusFirebase.saveVisitor({
        id: existingId,
        cellId,
        name,
        phone: String(formData.get("phone") || "").trim(),
        address: String(formData.get("address") || "").trim(),
        origin: String(formData.get("origin") || "").trim(),
        context: String(formData.get("context") || "").trim(),
        status: String(formData.get("status") || "new").trim(),
        firstVisitAt: String(formData.get("firstVisitAt") || "").trim(),
        lastVisitAt: String(formData.get("lastVisitAt") || "").trim(),
        visitCount: Number.isFinite(visitCount) ? visitCount : 0,
        notes: String(formData.get("notes") || "").trim(),
      }, state.authUser?.uid || "");

      state.selectedVisitorId = saved?.id || "";
      await refreshProfile(state.authUser);
      state.selectedVisitorId = saved?.id || state.selectedVisitorId;
      state.route = "visitors";
      renderPage();
      setStatus("Visitante salvo", "ok");
    } catch (error) {
      console.warn("[Renovo+] save visitor:", error?.message || error);
      setStatus("Falha ao salvar visitante", "danger");
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = existingId ? "Salvar visitante" : "Registrar visitante";
      }
    }
  }

  async function handleAlertSave(event) {
    event.preventDefault();
    if (!canManageAlerts()) {
      setStatus("Seu perfil nao pode salvar alertas agora", "danger");
      return;
    }

    const form = event.target;
    const formData = new FormData(form);
    const cellId = String(formData.get("cellId") || "").trim();
    const title = String(formData.get("title") || "").trim();
    const allowedCellIds = new Set(getReportCells().map((cell) => cell.id));

    if (!cellId || !title) {
      setStatus("Informe a celula e o titulo do alerta", "warn");
      return;
    }

    if (!allowedCellIds.has(cellId)) {
      setStatus("Seu perfil nao pode acompanhar alertas nessa celula", "danger");
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    const existingId = String(formData.get("id") || "").trim();

    try {
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Salvando...";
      }

      setStatus("Salvando alerta", "warn");
      const saved = await window.renovoPlusFirebase.saveAlert({
        id: existingId,
        cellId,
        type: String(formData.get("type") || "care").trim(),
        severity: String(formData.get("severity") || "warn").trim(),
        status: String(formData.get("status") || "open").trim(),
        title,
        summary: String(formData.get("summary") || "").trim(),
        ownerUid: String(formData.get("ownerUid") || "").trim(),
        dueAt: String(formData.get("dueAt") || "").trim(),
        notes: String(formData.get("notes") || "").trim(),
      }, state.authUser?.uid || "");

      state.selectedAlertId = saved?.id || "";
      await refreshProfile(state.authUser);
      state.selectedAlertId = saved?.id || state.selectedAlertId;
      state.route = "alerts";
      renderPage();
      setStatus("Alerta salvo", "ok");
    } catch (error) {
      console.warn("[Renovo+] save alert:", error?.message || error);
      setStatus("Falha ao salvar alerta", "danger");
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = existingId ? "Salvar alerta" : "Criar alerta";
      }
    }
  }

  function handlePageClick(event) {
    const button = event.target.closest("[data-select-profile]");
    if (!button) {
      const routeButton = event.target.closest("[data-dashboard-route]");
      if (routeButton) {
        const route = String(routeButton.dataset.dashboardRoute || "").trim();
        if (route && MODULE_DEFS[route] && canAccessRoute(route)) {
          state.route = route;
          renderPage();
        }
        return;
      }

      const cellButton = event.target.closest("[data-select-cell]");
      if (cellButton) {
        const cellId = String(cellButton.dataset.selectCell || "").trim();
        if (!cellId) {
          return;
        }
        state.selectedCellId = cellId;
        state.route = "cells";
        renderPage();
      }

      const newCellButton = event.target.closest("[data-new-cell]");
      if (newCellButton) {
        state.selectedCellId = "";
        state.route = "cells";
        renderPage();
      }

      const memberButton = event.target.closest("[data-select-member]");
      if (memberButton) {
        const memberId = String(memberButton.dataset.selectMember || "").trim();
        if (!memberId) {
          return;
        }
        state.selectedMemberId = memberId;
        state.route = "members";
        renderPage();
      }

      const newMemberButton = event.target.closest("[data-new-member]");
      if (newMemberButton) {
        state.selectedMemberId = "__new__";
        state.route = "members";
        renderPage();
      }

      const reportButton = event.target.closest("[data-select-report]");
      if (reportButton) {
        const reportId = String(reportButton.dataset.selectReport || "").trim();
        if (!reportId) {
          return;
        }
        state.selectedReportId = reportId;
        state.route = "reports";
        renderPage();
      }

      const newReportButton = event.target.closest("[data-new-report]");
      if (newReportButton) {
        state.selectedReportId = "__new__";
        state.route = "reports";
        renderPage();
      }

      const studyButton = event.target.closest("[data-select-study]");
      if (studyButton) {
        const studyId = String(studyButton.dataset.selectStudy || "").trim();
        if (!studyId) {
          return;
        }
        state.selectedStudyId = studyId;
        state.route = "studies";
        renderPage();
      }

      const newStudyButton = event.target.closest("[data-new-study]");
      if (newStudyButton) {
        state.selectedStudyId = "__new__";
        state.route = "studies";
        renderPage();
      }

      const visitorButton = event.target.closest("[data-select-visitor]");
      if (visitorButton) {
        const visitorId = String(visitorButton.dataset.selectVisitor || "").trim();
        if (!visitorId) {
          return;
        }
        state.selectedVisitorId = visitorId;
        state.route = "visitors";
        renderPage();
      }

      const newVisitorButton = event.target.closest("[data-new-visitor]");
      if (newVisitorButton) {
        state.selectedVisitorId = "__new__";
        state.route = "visitors";
        renderPage();
      }

      const alertButton = event.target.closest("[data-select-alert]");
      if (alertButton) {
        const alertId = String(alertButton.dataset.selectAlert || "").trim();
        if (!alertId) {
          return;
        }
        state.selectedAlertId = alertId;
        state.route = "alerts";
        renderPage();
      }

      const newAlertButton = event.target.closest("[data-new-alert]");
      if (newAlertButton) {
        state.selectedAlertId = "__new__";
        state.route = "alerts";
        renderPage();
      }
      return;
    }

    const uid = String(button.dataset.selectProfile || "").trim();
    if (!uid) {
      return;
    }

    state.selectedProfileUid = uid;
    state.route = "access";
    renderPage();
  }

  function handlePageSubmit(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) {
      return;
    }

    if (form.id === "plus-bootstrap-form") {
      handleBootstrapSubmit(event);
      return;
    }

    if (form.id === "plus-profile-form") {
      handleProfileSave(event);
      return;
    }

    if (form.id === "plus-cell-form") {
      handleCellSave(event);
      return;
    }

    if (form.id === "plus-member-form") {
      handleMemberSave(event);
      return;
    }

    if (form.id === "plus-report-form") {
      handleReportSave(event);
      return;
    }

    if (form.id === "plus-study-form") {
      handleStudySave(event);
      return;
    }

    if (form.id === "plus-visitor-form") {
      handleVisitorSave(event);
      return;
    }

    if (form.id === "plus-alert-form") {
      handleAlertSave(event);
    }
  }

  function formatCurrency(value) {
    const amount = Number(value || 0);
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number.isFinite(amount) ? amount : 0);
  }

  function parseTimelineDate(value) {
    const raw = String(value || "").trim();
    if (!raw) {
      return 0;
    }

    const parsed = raw.length <= 10 ? new Date(`${raw}T00:00:00`) : new Date(raw);
    const stamp = parsed.getTime();
    return Number.isFinite(stamp) ? stamp : 0;
  }

  function formatDisplayDate(value) {
    const raw = String(value || "").trim();
    if (!raw) {
      return "Sem data";
    }

    const stamp = parseTimelineDate(raw);
    if (!stamp) {
      return raw;
    }

    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(stamp));
  }

  function getMonthKey(value) {
    return String(value || "").trim().slice(0, 7);
  }

  function sortByTimeline(list, fields) {
    const allowedFields = Array.isArray(fields) && fields.length ? fields : ["updatedAt", "createdAt"];
    return (Array.isArray(list) ? list.slice() : []).sort((left, right) => {
      const leftStamp = allowedFields.reduce((max, field) => Math.max(max, parseTimelineDate(left?.[field])), 0);
      const rightStamp = allowedFields.reduce((max, field) => Math.max(max, parseTimelineDate(right?.[field])), 0);
      return rightStamp - leftStamp;
    });
  }

  function buildDashboardReportsHtml(limit) {
    const items = sortByTimeline(state.reports, ["date", "updatedAt", "createdAt"]).slice(0, limit || 4);
    if (!items.length) {
      return `<div class="plus-list-item"><strong>Nenhum relatorio ainda.</strong><span>Assim que o primeiro encontro for salvo, ele aparecera aqui.</span></div>`;
    }

    return items
      .map((report) => {
        const cellName = findCellNameById(report.cellId) || report.cellId || "Sem celula";
        return `
          <div class="plus-list-item">
            <div class="plus-list-item-top">
              <div>
                <strong>${escapeHtml(cellName)}</strong>
                <small>${escapeHtml(formatDisplayDate(report.date || report.updatedAt || report.createdAt))}</small>
              </div>
              <div class="plus-card-actions">
                <span class="plus-role-pill">${escapeHtml(formatCurrency(report.offering || 0))}</span>
                <button type="button" class="plus-inline-button" data-select-report="${escapeHtml(report.id)}">Abrir</button>
              </div>
            </div>
            <span>${escapeHtml(`Presentes: ${Number(report.presentCount || 0)} | Visitantes: ${Number(report.visitorsCount || 0)}`)}</span>
            <span>${escapeHtml(report.notes || "Resumo ainda nao preenchido.")}</span>
          </div>
        `;
      })
      .join("");
  }

  function buildDashboardVisitorsHtml(limit) {
    const items = sortByTimeline(state.visitors, ["lastVisitAt", "firstVisitAt", "updatedAt", "createdAt"]).slice(0, limit || 4);
    if (!items.length) {
      return `<div class="plus-list-item"><strong>Nenhum visitante no radar.</strong><span>Os proximos registros vao aparecer aqui para facilitar o acompanhamento.</span></div>`;
    }

    return items
      .map((visitor) => {
        const cellName = findCellNameById(visitor.cellId) || visitor.cellId || "Sem celula";
        return `
          <div class="plus-list-item">
            <div class="plus-list-item-top">
              <div>
                <strong>${escapeHtml(visitor.name || visitor.id)}</strong>
                <small>${escapeHtml(cellName)}</small>
              </div>
              <div class="plus-card-actions">
                <span class="plus-role-pill">${escapeHtml(visitor.status || "new")}</span>
                <button type="button" class="plus-inline-button" data-select-visitor="${escapeHtml(visitor.id)}">Abrir</button>
              </div>
            </div>
            <span>${escapeHtml(`Ultima visita: ${formatDisplayDate(visitor.lastVisitAt || visitor.firstVisitAt)} | Visitas: ${Number(visitor.visitCount || 0)}`)}</span>
            <span>${escapeHtml(visitor.context || visitor.notes || "Sem observacoes registradas.")}</span>
          </div>
        `;
      })
      .join("");
  }

  function buildDashboardStudiesHtml(limit) {
    const items = sortByTimeline(state.studies, ["updatedAt", "createdAt"]).slice(0, limit || 4);
    if (!items.length) {
      return `<div class="plus-list-item"><strong>Biblioteca vazia por enquanto.</strong><span>Quando os primeiros estudos forem publicados, eles ficam visiveis aqui.</span></div>`;
    }

    return items
      .map((study) => `
        <div class="plus-list-item">
          <div class="plus-list-item-top">
            <div>
              <strong>${escapeHtml(study.title || study.id)}</strong>
              <small>${escapeHtml(study.audience || "all")}</small>
            </div>
            <div class="plus-card-actions">
              ${study.downloadUrl ? `<a class="plus-inline-button" href="${escapeHtml(study.downloadUrl)}" target="_blank" rel="noreferrer">Abrir PDF</a>` : ""}
              <button type="button" class="plus-inline-button" data-select-study="${escapeHtml(study.id)}">Detalhes</button>
            </div>
          </div>
          <span>${escapeHtml(study.fileName || "Arquivo ainda nao informado.")}</span>
          <span>${escapeHtml(study.description || "Sem descricao registrada.")}</span>
        </div>
      `)
      .join("");
  }

  function buildDashboardFocusHtml(cellsMissingReport, cellsWithoutLeader, profilesPending, inactiveProfiles, visibleCells) {
    const items = [];

    if (!visibleCells.length) {
      items.push("Nenhuma celula apareceu no seu escopo ainda.");
    }

    if (cellsMissingReport > 0) {
      items.push(`${cellsMissingReport} celula(s) ativa(s) ainda sem relatorio neste mes.`);
    }

    if (cellsWithoutLeader > 0) {
      items.push(`${cellsWithoutLeader} celula(s) ainda sem lider principal definido.`);
    }

    if (profilesPending > 0) {
      items.push(`${profilesPending} perfil(is) aguardando liberacao em acessos.`);
    }

    if (inactiveProfiles > 0) {
      items.push(`${inactiveProfiles} perfil(is) marcados como inativos na governanca.`);
    }

    if (!items.length) {
      items.push("O escopo atual esta com a base principal preenchida e sem alertas estruturais imediatos.");
    }

    return `
      <ul>
        ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
      <div class="plus-card-actions">
        <button type="button" class="plus-inline-button" data-dashboard-route="cells">Abrir celulas</button>
        ${canAccessRoute("members") ? `<button type="button" class="plus-inline-button" data-dashboard-route="members">Abrir membros</button>` : ""}
        ${canAccessRoute("reports") ? `<button type="button" class="plus-inline-button" data-dashboard-route="reports">Ver relatorios</button>` : ""}
        ${canAccessRoute("alerts") ? `<button type="button" class="plus-inline-button" data-dashboard-route="alerts">Abrir acompanhamento</button>` : ""}
        ${canManageAccess() ? `<button type="button" class="plus-inline-button" data-dashboard-route="access">Gerir acessos</button>` : ""}
      </div>
    `;
  }

  function buildDashboardCards() {
    const profile = state.profile;
    const role = normalizeRole(profile?.role);
    const status = normalizeStatus(profile?.status);
    const visibleCells = getVisibleCells();
    const activeCells = visibleCells.filter((cell) => cell.status !== "inactive").length;
    const inactiveCells = visibleCells.filter((cell) => cell.status === "inactive").length;
    const cellsWithoutLeader = visibleCells.filter((cell) => !String(cell.leaderUid || "").trim()).length;
    const currentMonth = new Date().toISOString().slice(0, 7);
    const reportsThisMonth = state.reports.filter((report) => getMonthKey(report.date) === currentMonth);
    const reportsThisMonthCount = reportsThisMonth.length;
    const reportedCellIds = new Set(reportsThisMonth.map((report) => String(report.cellId || "").trim()).filter(Boolean));
    const cellsMissingReport = visibleCells.filter((cell) => cell.status !== "inactive" && !reportedCellIds.has(cell.id)).length;
    const offeringThisMonth = reportsThisMonth.reduce((sum, report) => sum + Number(report.offering || 0), 0);
    const followUpVisitors = state.visitors.filter((visitor) => String(visitor.status || "").trim() === "follow_up").length;
    const returningVisitors = state.visitors.filter((visitor) => Number(visitor.visitCount || 0) > 1).length;
    const firstVisitThisMonth = state.visitors.filter((visitor) => getMonthKey(visitor.firstVisitAt) === currentMonth).length;
    const activeStudies = state.studies.filter((study) => Boolean(study.downloadUrl)).length;
    const updatedStudiesThisMonth = state.studies.filter((study) => getMonthKey(study.updatedAt || study.createdAt) === currentMonth).length;
    const profilesPending = state.profiles.filter((entry) => normalizeStatus(entry.status) === "pending" || normalizeRole(entry.role) === "pending").length;
    const inactiveProfiles = state.profiles.filter((entry) => normalizeStatus(entry.status) === "inactive").length;
    const scopeSummary = visibleCells.length
      ? visibleCells.map((cell) => cell.name || cell.id).slice(0, 3).join(", ")
      : "Nenhuma celula vinculada ainda";
    const sessionMessage = role === "leader"
      ? "Sua leitura prioriza a propria celula, com atalhos para relatorios, visitantes e estudos liberados."
      : role === "coordinator"
        ? "O painel consolida o grupo supervisionado e ajuda a perceber quem precisa de apoio esta semana."
        : "A visao aqui serve como centro de governanca, com panorama estrutural da Renovo+ antes de abrir cada modulo.";

    return [
      {
        span: "8",
        kicker: "Panorama",
        title: role === "leader" ? "Pulso da sua celula" : role === "coordinator" ? "Pulso do seu grupo" : "Pulso da Renovo+",
        html: `
          <p>${escapeHtml(sessionMessage)}</p>
          <div class="plus-card-actions">
            ${canManageMembers() ? `<button type="button" class="plus-inline-button" data-new-member="true">Novo membro</button>` : ""}
            ${canAccessRoute("reports") ? `<button type="button" class="plus-inline-button" data-new-report="true">Novo relatorio</button>` : ""}
            ${canManageVisitors() ? `<button type="button" class="plus-inline-button" data-new-visitor="true">Novo visitante</button>` : ""}
            ${canAccessRoute("alerts") ? `<button type="button" class="plus-inline-button" data-dashboard-route="alerts">Abrir acompanhamento</button>` : ""}
            ${canManageStudies() ? `<button type="button" class="plus-inline-button" data-new-study="true">Publicar estudo</button>` : `<button type="button" class="plus-inline-button" data-dashboard-route="studies">Abrir estudos</button>`}
            ${canManageCells() ? `<button type="button" class="plus-inline-button" data-new-cell="true">Nova celula</button>` : ""}
          </div>
        `,
        metrics: [
          { value: String(visibleCells.length), label: "Celulas no escopo" },
          { value: String(reportsThisMonthCount), label: "Relatorios neste mes" },
          { value: formatCurrency(offeringThisMonth), label: "Oferta do mes" },
          { value: String(followUpVisitors), label: "Visitantes em acompanhamento" },
        ],
      },
      {
        span: "4",
        kicker: "Sessao",
        title: profile?.name || state.authUser?.email || "Conta autenticada",
        tag: ROLE_LABELS[role] || "Sem perfil",
        metaPairs: [
          { label: "Status", value: STATUS_LABELS[status] || "Pendente" },
          { label: "Celula principal", value: findCellNameById(profile?.primaryCellId) || profile?.primaryCellId || "Nao definida" },
          { label: "Ministerio", value: profile?.ministryName || "Nao informado" },
          { label: "Escopo inicial", value: scopeSummary },
        ],
      },
      {
        span: "4",
        kicker: "Leitura rapida",
        title: "Saude do escopo",
        metrics: [
          { value: String(activeCells), label: "Celulas ativas" },
          { value: String(cellsMissingReport), label: "Sem relatorio no mes" },
          { value: String(returningVisitors), label: "Visitantes com retorno" },
          { value: String(activeStudies), label: "Estudos com PDF" },
        ],
      },
      {
        span: "4",
        kicker: "Relatorios",
        title: "Ultimos encontros",
        html: `<div class="plus-list">${buildDashboardReportsHtml(4)}</div>`,
      },
      {
        span: "4",
        kicker: "Visitantes",
        title: "Quem esta em foco",
        html: `<div class="plus-list">${buildDashboardVisitorsHtml(4)}</div>`,
      },
      {
        span: "6",
        kicker: "Biblioteca",
        title: "Estudos e ritmo de publicacao",
        html: `<div class="plus-list">${buildDashboardStudiesHtml(3)}</div>`,
        metrics: [
          { value: String(state.studies.length), label: "Total na biblioteca" },
          { value: String(updatedStudiesThisMonth), label: "Atualizados neste mes" },
          { value: String(firstVisitThisMonth), label: "Primeiras visitas no mes" },
        ],
      },
      {
        span: "6",
        kicker: "Atencao",
        title: canManageAccess() ? "Governanca e estrutura" : "Pontos para acompanhar",
        html: buildDashboardFocusHtml(cellsMissingReport, cellsWithoutLeader, profilesPending, inactiveProfiles, visibleCells),
        metrics: [
          { value: String(cellsWithoutLeader), label: "Celulas sem lider" },
          { value: String(inactiveCells), label: "Celulas inativas" },
          { value: canManageAccess() ? String(state.profiles.length) : String(visibleCells.length), label: canManageAccess() ? "Perfis carregados" : "Celulas observadas" },
          { value: canManageAccess() ? String(profilesPending) : String(followUpVisitors), label: canManageAccess() ? "Perfis pendentes" : "Follow-up ativo" },
        ],
      },
    ];
  }

  function buildAlertsCards() {
    const editableAlert = getEditableAlert();
    const availableCells = getReportCells();
    const derivedAlerts = collectDerivedAlerts();
    const openAlerts = state.alerts.filter((alert) => alert.status !== "resolved").length;
    const criticalAlerts = state.alerts.filter((alert) => alert.severity === "critical" && alert.status !== "resolved").length;
    const monitoringAlerts = state.alerts.filter((alert) => alert.status === "monitoring").length;
    const dueSoonCount = state.alerts.filter((alert) => {
      if (!alert.dueAt || alert.status === "resolved") {
        return false;
      }
      const dueDate = new Date(`${alert.dueAt}T23:59:59`);
      const diff = dueDate.getTime() - Date.now();
      return Number.isFinite(diff) && diff >= 0 && diff <= 7 * 24 * 60 * 60 * 1000;
    }).length;
    const selectedCellName = editableAlert ? findCellNameById(editableAlert.cellId) || editableAlert.cellId : "Nenhum alerta selecionado";

    return [
      {
        span: "4",
        kicker: "Panorama",
        title: "Acompanhamento no escopo",
        metrics: [
          { value: String(state.alerts.length), label: "Alertas manuais" },
          { value: String(openAlerts), label: "Abertos" },
          { value: String(criticalAlerts), label: "Criticos" },
          { value: String(derivedAlerts.length), label: "Sinais automaticos" },
        ],
      },
      {
        span: "8",
        kicker: "Leitura ministerial",
        title: "Do registro ao cuidado continuo",
        body: "Este modulo junta os alertas criados pela equipe com sinais automaticos da base para evitar que acompanhamento fique espalhado entre relatorios, visitantes e memoria oral.",
        items: [
          "Cada alerta fica vinculado a uma celula e respeita o escopo do perfil autenticado.",
          "Coordenacao e lideranca podem transformar sinais em acompanhamentos formais.",
          "Pastor e admin ganham uma camada de governanca sobre pendencias estruturais e ministeriais.",
        ],
      },
      {
        span: "6",
        kicker: "Sinais do sistema",
        title: "Alertas derivados da base",
        html: `<div class="plus-list">${buildDerivedAlertsHtml()}</div>`,
      },
      {
        span: "6",
        kicker: "Fila manual",
        title: "Alertas registrados pela equipe",
        html: `<div class="plus-list">${buildAlertsListHtml()}</div>`,
        metrics: [
          { value: String(monitoringAlerts), label: "Em monitoramento" },
          { value: String(dueSoonCount), label: "Com prazo em 7 dias" },
          { value: String(availableCells.length), label: "Celulas disponiveis" },
        ],
      },
      {
        span: "6",
        kicker: "Editor",
        title: editableAlert
          ? `${editableAlert.title || editableAlert.id} | ${selectedCellName}`
          : availableCells.length
            ? "Criar novo alerta"
            : "Sem celulas para acompanhar",
        html: availableCells.length
          ? buildAlertEditorHtml(editableAlert)
          : `<p>Vincule o perfil a pelo menos uma celula antes de abrir acompanhamentos neste modulo.</p>`,
      },
      {
        span: "6",
        kicker: "Resumo do caso",
        title: editableAlert ? "Leitura rapida do alerta selecionado" : "Como usar este modulo",
        html: editableAlert
          ? `
            <div class="plus-meta-pair">
              ${renderMetaPairs([
                { label: "Celula", value: selectedCellName || "Nao definida" },
                { label: "Tipo", value: ALERT_TYPE_LABELS[editableAlert.type] || editableAlert.type || "Cuidado" },
                { label: "Gravidade", value: ALERT_SEVERITY_LABELS[editableAlert.severity] || editableAlert.severity || "Atencao" },
                { label: "Status", value: ALERT_STATUS_LABELS[editableAlert.status] || editableAlert.status || "Aberto" },
                { label: "Prazo", value: editableAlert.dueAt || "Livre" },
                { label: "Responsavel", value: findProfileNameByUid(editableAlert.ownerUid) || editableAlert.ownerUid || "Nao atribuido" },
              ])}
            </div>
            <p>${escapeHtml(editableAlert.summary || editableAlert.notes || "Sem resumo adicional para este acompanhamento.")}</p>
          `
          : `
            <ul>
              <li>Abra um alerta quando um cuidado precisar continuar alem do relatorio semanal.</li>
              <li>Use gravidade e status para diferenciar observacao simples de caso urgente.</li>
              <li>Os sinais automaticos ajudam a descobrir pendencias que ainda nao viraram acompanhamento formal.</li>
            </ul>
            <div class="plus-card-actions">
              <button type="button" class="plus-inline-button" data-new-alert="true">Novo alerta</button>
              <button type="button" class="plus-inline-button" data-dashboard-route="dashboard">Voltar ao painel</button>
            </div>
          `,
      },
    ];
  }

  function buildCellsCards() {
    const visibleCells = getVisibleCells();
    const editableCell = getEditableCell();
    const canManage = canManageCells();
    const activeCells = visibleCells.filter((cell) => cell.status !== "inactive").length;
    const selectedLeader = editableCell ? findProfileNameByUid(editableCell.leaderUid) || "Sem lider" : "Sem lider";

    return [
      {
        span: "4",
        kicker: "Panorama",
        title: "Celulas carregadas",
        metrics: [
          { value: String(visibleCells.length), label: "No escopo atual" },
          { value: String(activeCells), label: "Ativas" },
          { value: canManage ? "Gestao" : "Consulta", label: "Seu nivel neste modulo" },
        ],
      },
      {
        span: "8",
        kicker: "Estrutura",
        title: canManage ? "Cadastro real de celulas" : "Celulas do seu escopo",
        body: canManage
          ? "Admin e pastor ja podem criar ou ajustar a estrutura base das celulas da Renovo+, com leaderUid, horario, endereco e status."
          : "Aqui aparecem apenas as celulas liberadas para o seu perfil ministerial na Renovo+.",
        items: canManage
          ? [
              "Cada celula grava um documento proprio em renovo_plus_cells.",
              "O codigo vira o cellId usado depois em relatorios, membros e escopo.",
              "O vinculo de lideranca ja nasce por uid, nao por texto livre.",
            ]
          : [
              "A leitura ja respeita primaryCellId e scopeCellIds do seu perfil.",
              "Esta tela passa a ser a porta de entrada da estrutura ministerial da V2.",
              "Nos proximos passos, membros e relatorios vao se apoiar nesta base.",
            ],
      },
      {
        span: "6",
        kicker: "Lista",
        title: "Mapa de celulas",
        html: `<div class="plus-list">${buildCellsListHtml()}</div>`,
      },
      {
        span: "6",
        kicker: canManage ? "Editor" : "Detalhes",
        title: editableCell
          ? editableCell.name || editableCell.id
          : canManage
            ? "Criar nova celula"
            : "Nenhuma celula no escopo",
        html: canManage
          ? buildCellEditorHtml(editableCell)
          : editableCell
            ? `
              <div class="plus-meta-pair">
                ${renderMetaPairs([
                  { label: "Codigo", value: editableCell.id },
                  { label: "Lider", value: selectedLeader },
                  { label: "Status", value: CELL_STATUS_LABELS[editableCell.status] || "Ativa" },
                  { label: "Reuniao", value: [editableCell.meetingDay, editableCell.meetingTime].filter(Boolean).join(" · ") || "Nao informado" },
                  { label: "Endereco", value: editableCell.address || "Nao informado" },
                ])}
              </div>
            `
            : `<p>Nenhuma celula apareceu no seu escopo ainda.</p>`,
      },
    ];
  }

  function buildMembersCards() {
    const editableMember = getEditableMember();
    const activeMembers = state.members.filter((member) => member.status === "active").length;
    const inactiveMembers = state.members.filter((member) => member.status !== "active").length;
    const hostCount = state.members.filter((member) => member.roleInCell === "host").length;
    const coveredCells = new Set(state.members.map((member) => String(member.cellId || "").trim()).filter(Boolean)).size;
    const selectedCellName = editableMember ? findCellNameById(editableMember.cellId) || editableMember.cellId : "Nenhuma celula selecionada";

    return [
      {
        span: "4",
        kicker: "Base viva",
        title: "Membros no escopo",
        metrics: [
          { value: String(state.members.length), label: "Total carregado" },
          { value: String(activeMembers), label: "Ativos" },
          { value: String(hostCount), label: "Anfitrioes" },
          { value: String(coveredCells), label: "Celulas cobertas" },
        ],
      },
      {
        span: "8",
        kicker: "Estrutura humana",
        title: "Cadastro por cellId",
        body: "A Renovo+ agora trata membro como entidade propria, ligada a uma celula especifica e pronta para sustentar presenca, cuidado e historico sem depender de listas soltas dentro da tela.",
        items: [
          "Cada membro salva um documento proprio em renovo_plus_members.",
          "O acesso respeita o mesmo escopo de celulas do perfil autenticado.",
          "Esse modulo abre caminho para presenca por pessoa e futura conversao automatica de visitante em membro.",
        ],
      },
      {
        span: "6",
        kicker: "Lista",
        title: "Membros da base nova",
        html: `<div class="plus-list">${buildMembersListHtml()}</div>`,
      },
      {
        span: "6",
        kicker: "Editor",
        title: editableMember
          ? `${editableMember.name || editableMember.id} | ${selectedCellName}`
          : getReportCells().length
            ? "Cadastrar novo membro"
            : "Sem celulas para membros",
        html: getReportCells().length
          ? buildMemberEditorHtml(editableMember)
          : `<p>Primeiro vincule seu perfil a uma celula para cadastrar membros na Renovo+.</p>`,
      },
      {
        span: "6",
        kicker: "Leitura rapida",
        title: editableMember ? "Resumo do membro selecionado" : "Panorama ministerial",
        html: editableMember
          ? `
            <div class="plus-meta-pair">
              ${renderMetaPairs([
                { label: "Celula", value: selectedCellName || "Nao definida" },
                { label: "Papel", value: MEMBER_ROLE_LABELS[editableMember.roleInCell] || editableMember.roleInCell || "Membro" },
                { label: "Status", value: MEMBER_STATUS_LABELS[editableMember.status] || editableMember.status || "Ativo" },
                { label: "Telefone", value: editableMember.phone || "Nao informado" },
                { label: "Entrada", value: editableMember.joinedAt || "Nao informada" },
              ])}
            </div>
            <p>${escapeHtml(editableMember.notes || "Sem observacoes registradas para este membro.")}</p>
          `
          : `
            <ul>
              <li>Use este cadastro como fonte unica para quem faz parte da celula.</li>
              <li>O papel na celula ajuda a diferenciar anfitriao, auxiliar e membros em formacao.</li>
              <li>Nos proximos passos, relatorios e acompanhamento poderao ler essa base diretamente.</li>
            </ul>
          `,
        metrics: [
          { value: String(inactiveMembers), label: "Nao ativos" },
          { value: String(state.members.filter((member) => member.roleInCell === "assistant").length), label: "Auxiliares" },
          { value: String(state.members.filter((member) => member.roleInCell === "apprentice").length), label: "Aprendizes" },
        ],
      },
    ];
  }

  function buildReportsCards() {
    const editableReport = getEditableReport();
    const totalOffering = state.reports.reduce((sum, report) => sum + Number(report.offering || 0), 0);
    const reportsThisMonth = state.reports.filter((report) => String(report.date || "").slice(0, 7) === new Date().toISOString().slice(0, 7)).length;
    const availableCells = getReportCells();
    const selectedCellName = editableReport ? findCellNameById(editableReport.cellId) || editableReport.cellId : "Sem celula selecionada";

    return [
      {
        span: "4",
        kicker: "Resumo",
        title: "Relatorios no escopo",
        metrics: [
          { value: String(state.reports.length), label: "Total carregado" },
          { value: String(reportsThisMonth), label: "Neste mes" },
          { value: `R$ ${totalOffering.toFixed(2)}`, label: "Oferta somada" },
        ],
      },
      {
        span: "8",
        kicker: "Fluxo semanal",
        title: "Relatorio por documento",
        body: "A Renovo+ ja grava cada relatorio como documento proprio em renovo_plus_reports, vinculado ao cellId e ao uid de quem salvou.",
        items: [
          "A escrita respeita o escopo do perfil autenticado.",
          "Cada formulario salva apenas um relatorio por vez.",
          "A base ja esta pronta para crescer com presenca detalhada e visitantes por nome.",
        ],
      },
      {
        span: "6",
        kicker: "Historico",
        title: "Relatorios recentes",
        html: `<div class="plus-list">${buildReportsListHtml()}</div>`,
      },
      {
        span: "6",
        kicker: "Editor",
        title: editableReport
          ? `${selectedCellName} · ${editableReport.date || "Sem data"}`
          : availableCells.length
            ? "Criar novo relatorio"
            : "Sem celulas para relatorio",
        html: availableCells.length
          ? buildReportEditorHtml(editableReport)
          : `<p>Primeiro crie uma celula e vincule seu perfil a ela para comecar a registrar relatorios.</p>`,
      },
    ];
  }

  function buildStudiesCards() {
    const editableStudy = getEditableStudy();
    const downloadableCount = state.studies.filter((study) => Boolean(study.downloadUrl)).length;
    const selectedTitle = editableStudy?.title || editableStudy?.fileName || "Nenhum estudo selecionado";

    return [
      {
        span: "4",
        kicker: "Biblioteca",
        title: "Estudos publicados",
        metrics: [
          { value: String(state.studies.length), label: "Total carregado" },
          { value: String(downloadableCount), label: "Com PDF ativo" },
          { value: canManageStudies() ? "Publicacao" : "Leitura", label: "Seu nivel neste modulo" },
        ],
      },
      {
        span: "8",
        kicker: "Storage + Firestore",
        title: "Biblioteca protegida",
        body: "A Renovo+ ja separa o metadado do estudo no Firestore e o PDF no Storage, com espaco para audiencias e historico de publicacao.",
        items: [
          "Cada estudo salva um documento proprio em renovo_plus_studies.",
          "O upload usa a sessao autenticada do Firebase.",
          "Leitores podem abrir o PDF sem depender de localStorage.",
        ],
      },
      {
        span: "6",
        kicker: "Lista",
        title: "Biblioteca de estudos",
        html: `<div class="plus-list">${buildStudiesListHtml()}</div>`,
      },
      {
        span: "6",
        kicker: canManageStudies() ? "Editor" : "Detalhes",
        title: selectedTitle,
        html: canManageStudies()
          ? buildStudyEditorHtml(editableStudy)
          : editableStudy
            ? `
              <div class="plus-meta-pair">
                ${renderMetaPairs([
                  { label: "Titulo", value: editableStudy.title || editableStudy.id },
                  { label: "Audiencia", value: editableStudy.audience || "all" },
                  { label: "Arquivo", value: editableStudy.fileName || "Sem arquivo" },
                  { label: "Descricao", value: editableStudy.description || "Sem descricao" },
                ])}
              </div>
              ${editableStudy.downloadUrl ? `<div class="plus-card-actions"><a class="plus-inline-button" href="${escapeHtml(editableStudy.downloadUrl)}" target="_blank" rel="noreferrer">Abrir PDF</a></div>` : ""}
            `
            : `<p>Nenhum estudo foi disponibilizado ainda.</p>`,
      },
    ];
  }

  function buildVisitorsCards() {
    const editableVisitor = getEditableVisitor();
    const returningCount = state.visitors.filter((visitor) => Number(visitor.visitCount || 0) > 1).length;
    const followUpCount = state.visitors.filter((visitor) => String(visitor.status || "") === "follow_up").length;
    const selectedCellName = editableVisitor ? findCellNameById(editableVisitor.cellId) || editableVisitor.cellId : "Nenhum visitante selecionado";

    return [
      {
        span: "4",
        kicker: "Resumo",
        title: "Visitantes no escopo",
        metrics: [
          { value: String(state.visitors.length), label: "Total carregado" },
          { value: String(returningCount), label: "Com retorno" },
          { value: String(followUpCount), label: "Em acompanhamento" },
        ],
      },
      {
        span: "8",
        kicker: "Cuidado",
        title: "Historico por visitante",
        body: "A Renovo+ ja trata visitante como documento proprio, vinculado a uma celula e com espaco para recorrencia, contexto e acompanhamento.",
        items: [
          "Cada visitante salva um documento em renovo_plus_visitors.",
          "O modulo respeita o mesmo escopo de celulas do perfil autenticado.",
          "A base ja prepara a futura conversao de visitante em membro.",
        ],
      },
      {
        span: "6",
        kicker: "Lista",
        title: "Visitantes recentes",
        html: `<div class="plus-list">${buildVisitorsListHtml()}</div>`,
      },
      {
        span: "6",
        kicker: "Editor",
        title: editableVisitor
          ? `${editableVisitor.name || editableVisitor.id} · ${selectedCellName}`
          : canManageVisitors()
            ? "Registrar novo visitante"
            : "Sem visitantes no escopo",
        html: canManageVisitors()
          ? buildVisitorEditorHtml(editableVisitor)
          : editableVisitor
            ? `
              <div class="plus-meta-pair">
                ${renderMetaPairs([
                  { label: "Nome", value: editableVisitor.name || editableVisitor.id },
                  { label: "Celula", value: selectedCellName },
                  { label: "Status", value: editableVisitor.status || "new" },
                  { label: "Telefone", value: editableVisitor.phone || "Nao informado" },
                  { label: "Ultima visita", value: editableVisitor.lastVisitAt || editableVisitor.firstVisitAt || "Nao informado" },
                ])}
              </div>
            `
            : `<p>Nenhum visitante foi registrado ainda no seu escopo.</p>`,
      },
    ];
  }

  async function bootstrap() {
    versionLabel.textContent = String(window.RENOVO_PLUS_VERSION || "dev");
    setStatus("Carregando", "neutral");
    updateUserSummary();

    authForm?.addEventListener("submit", handleLogin);
    signOutButton?.addEventListener("click", handleSignOut);
    nav?.addEventListener("click", handleNavClick);
    pageBody?.addEventListener("click", handlePageClick);
    pageBody?.addEventListener("submit", handlePageSubmit);

    try {
      let authSettled = false;
      window.renovoPlusFirebase.observeAuth((user) => {
        authSettled = true;
        refreshProfile(user);
      });

      await Promise.race([
        window.renovoPlusFirebase.waitForAuthReady(),
        new Promise((_, reject) => {
          window.setTimeout(() => {
            if (!authSettled) {
              reject(new Error("AUTH_BOOT_TIMEOUT"));
            }
          }, AUTH_BOOT_TIMEOUT_MS);
        }),
      ]);
    } catch (error) {
      console.warn("[Renovo+] bootstrap:", error?.message || error);
      showBootstrapFallback(
        error?.message === "AUTH_BOOT_TIMEOUT"
          ? "A inicializacao da Renovo+ demorou mais que o esperado. Voce ja pode tentar entrar. Se continuar vendo so esta tela, abra o link em uma janela anonima."
          : (error?.message || "Nao foi possivel iniciar a Renovo+.")
      );
    }
  }

  bootstrap();
})();
