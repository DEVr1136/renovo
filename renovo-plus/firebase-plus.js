/* firebase-plus.js - fundacao Firebase da Renovo+ */
(function () {
  const COLLECTIONS = {
    users: "renovo_plus_users",
    meta: "renovo_plus_meta",
    igrejas: "igrejas",
    cells: "renovo_plus_cells",
    members: "renovo_plus_members",
    reports: "renovo_plus_reports",
    studies: "renovo_plus_studies",
    visitors: "renovo_plus_visitors",
    alerts: "renovo_plus_alerts",
    receptionVisitors: "visitors",
    visitorFollowups: "visitorFollowups",
    messageTemplates: "messageTemplates",
    messageQueue: "messageQueue",
    cellAssignments: "cellAssignments",
  };

  const LEGACY = {
    collection: "renovo",
    stateDoc: "state",
    cellsDoc: "cells",
    reportsDoc: "reports",
    reportsMetaDoc: "reports_meta",
    visitorsDoc: "visitantes",
    usersDoc: "users",
    reportPrefix: "report__",
    reportEnd: "report__\uf8ff",
  };

  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyAkVidPhtpX-o2gGlvTkdbYlQ7CJmMl3fs",
    authDomain: "ambiente-renovo.firebaseapp.com",
    projectId: "ambiente-renovo",
    storageBucket: "ambiente-renovo.firebasestorage.app",
    messagingSenderId: "520918200219",
    appId: "1:520918200219:web:318dfff7bf0060318abb3e",
  };

  const api = {
    app: null,
    auth: null,
    db: null,
    storage: null,
    currentUser: null,
  };
  const DEFAULT_IGREJA_ID = "renovo";
  const FOLLOWUP_STEPS = [
    {
      templateKey: "visit_thanks_d1",
      label: "D+1 agradecimento",
      dayOffset: 1,
      body: "Ola, {{name}}! Que alegria receber voce na Renovo. Obrigado por nos visitar. Conte conosco em oracao e cuidado. Se preferir nao receber mensagens, responda parar.",
    },
    {
      templateKey: "prayer_offer_d4",
      label: "D+4 pedido de oracao",
      dayOffset: 4,
      body: "Ola, {{name}}. Passando com carinho: ha algo pelo qual voce gostaria que a gente orasse nesta semana? Se quiser, responda com a palavra oracao. Para parar, responda parar.",
    },
    {
      templateKey: "next_service_d6",
      label: "D+6 proximo culto",
      dayOffset: 6,
      body: "Oi, {{name}}! Neste fim de semana teremos culto novamente. Sera uma alegria receber voce, sem compromisso. Que Deus abencoe seu dia. Para parar, responda parar.",
    },
    {
      templateKey: "cell_invite_d10",
      label: "D+10 convite para celula",
      dayOffset: 10,
      body: "Ola, {{name}}. Alem dos cultos, a Renovo tambem se reune em celulas durante a semana. Se quiser conhecer uma perto de voce, responda celula. Para parar, responda parar.",
    },
  ];

  const authListeners = new Set();
  let initialized = false;
  let authReadyResolved = false;
  let resolveAuthReady = null;
  const authReadyPromise = new Promise((resolve) => {
    resolveAuthReady = resolve;
  });

  function notifyAuth(user) {
    api.currentUser = user || null;
    if (!authReadyResolved) {
      authReadyResolved = true;
      resolveAuthReady(api.currentUser);
    }

    authListeners.forEach((listener) => {
      try {
        listener(api.currentUser);
      } catch (error) {
        console.warn("[Renovo+] auth listener:", error?.message || error);
      }
    });
  }

  function ensureFirebase() {
    if (!window.firebase || typeof window.firebase.initializeApp !== "function") {
      throw new Error("Firebase SDK indisponivel na Renovo+.");
    }

    try {
      api.app = firebase.app();
    } catch (_) {
      api.app = firebase.initializeApp(FIREBASE_CONFIG);
    }

    if (typeof firebase.auth !== "function") {
      throw new Error("Firebase Auth nao foi carregado.");
    }

    api.auth = firebase.auth();
    api.db = typeof firebase.firestore === "function" ? firebase.firestore() : null;
    api.storage = typeof firebase.storage === "function" ? firebase.storage() : null;
    api.messaging = typeof firebase.messaging === "function" ? firebase.messaging() : null;
  }

  function initialize() {
    if (initialized) {
      return api;
    }

    ensureFirebase();
    initialized = true;

    api.auth
      .setPersistence(firebase.auth.Auth.Persistence.LOCAL)
      .catch((error) => console.warn("[Renovo+] auth persistence:", error?.message || error));

    api.auth.onAuthStateChanged((user) => {
      notifyAuth(user);
    });

    return api;
  }

  function normalizeRole(role) {
    const value = String(role || "").trim().toLowerCase();
    if (["leader", "coordinator", "pastor", "admin", "kids", "recepcao"].includes(value)) {
      return value;
    }
    return "pending";
  }

  function normalizeStatus(status) {
    const value = String(status || "").trim().toLowerCase();
    if (["active", "inactive", "pending"].includes(value)) {
      return value;
    }
    return "pending";
  }

  function normalizeIgrejaId(value) {
    const normalized = String(value || "").trim();
    return normalized || DEFAULT_IGREJA_ID;
  }

  function hasPastoralAccess(profile) {
    return ["admin", "pastor", "coordinator"].includes(String(profile?.role || "").trim());
  }

  function normalizeProfile(uid, data) {
    if (!uid || !data || typeof data !== "object") {
      return null;
    }

    const scopeCellIds = Array.isArray(data.scopeCellIds)
      ? data.scopeCellIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [];

    return {
      uid,
      name: String(data.name || "").trim(),
      email: String(data.email || "").trim(),
      role: normalizeRole(data.role),
      status: normalizeStatus(data.status),
      igrejaId: normalizeIgrejaId(data.igrejaId),
      primaryCellId: String(data.primaryCellId || "").trim(),
      scopeCellIds,
      ministryName: String(data.ministryName || "").trim(),
      notes: String(data.notes || "").trim(),
      createdAt: String(data.createdAt || "").trim(),
      updatedAt: String(data.updatedAt || "").trim(),
    };
  }

  function slugifyId(value) {
    const normalized = String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-{2,}/g, "-");

    return normalized.slice(0, 60);
  }

  function normalizeCell(docId, data) {
    if (!docId || !data || typeof data !== "object") {
      return null;
    }

    const status = ["active", "inactive"].includes(String(data.status || "").trim().toLowerCase())
      ? String(data.status).trim().toLowerCase()
      : "active";

    const coLeaderUids = Array.isArray(data.coLeaderUids)
      ? data.coLeaderUids.map((id) => String(id || "").trim()).filter(Boolean)
      : [];

    return {
      id: String(data.id || docId).trim(),
      name: String(data.name || "").trim(),
      meetingDay: String(data.meetingDay || "").trim(),
      meetingTime: String(data.meetingTime || "").trim(),
      address: String(data.address || "").trim(),
      leaderUid: String(data.leaderUid || "").trim(),
      coLeaderUids,
      status,
      notes: String(data.notes || "").trim(),
      createdAt: String(data.createdAt || "").trim(),
      updatedAt: String(data.updatedAt || "").trim(),
      createdByUid: String(data.createdByUid || "").trim(),
      updatedByUid: String(data.updatedByUid || "").trim(),
    };
  }

  function normalizeMember(docId, data) {
    if (!docId || !data || typeof data !== "object") {
      return null;
    }

    return {
      id: String(data.id || docId).trim(),
      cellId: String(data.cellId || "").trim(),
      name: String(data.name || "").trim(),
      phone: String(data.phone || "").trim(),
      roleInCell: String(data.roleInCell || "member").trim() || "member",
      status: String(data.status || "active").trim() || "active",
      joinedAt: String(data.joinedAt || "").trim(),
      notes: String(data.notes || "").trim(),
      createdAt: String(data.createdAt || "").trim(),
      updatedAt: String(data.updatedAt || "").trim(),
      createdByUid: String(data.createdByUid || "").trim(),
      updatedByUid: String(data.updatedByUid || "").trim(),
    };
  }

  function normalizeReport(docId, data) {
    if (!docId || !data || typeof data !== "object") {
      return null;
    }

    const offeringNumber = Number(data.offering);
    const presentMemberIds = Array.isArray(data.presentMemberIds)
      ? data.presentMemberIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [];

    const imageUrls = Array.isArray(data.imageUrls)
      ? data.imageUrls.map((u) => String(u || "").trim()).filter(Boolean)
      : [];

    return {
      id: String(data.id || docId).trim(),
      cellId: String(data.cellId || "").trim(),
      date: String(data.date || "").trim(),
      leaders: String(data.leaders || "").trim(),
      coLeaders: String(data.coLeaders || "").trim(),
      host: String(data.host || "").trim(),
      address: String(data.address || "").trim(),
      presentMemberIds,
      presentCount: Number(data.presentCount || presentMemberIds.length || 0) || 0,
      visitorsCount: Number(data.visitorsCount || 0) || 0,
      visitorNames: String(data.visitorNames || "").trim(),
      offering: Number.isFinite(offeringNumber) ? offeringNumber : 0,
      snack: String(data.snack || "").trim(),
      discipleship: String(data.discipleship || "").trim(),
      communionMinutes: String(data.communionMinutes || "").trim(),
      foods: String(data.foods || "").trim(),
      notes: String(data.notes || "").trim(),
      imageUrls,
      createdAt: String(data.createdAt || "").trim(),
      updatedAt: String(data.updatedAt || "").trim(),
      createdByUid: String(data.createdByUid || "").trim(),
      updatedByUid: String(data.updatedByUid || "").trim(),
    };
  }

  function sanitizeFileName(fileName) {
    return String(fileName || "arquivo")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/_+/g, "_")
      .slice(0, 120);
  }

  function normalizeStudy(docId, data) {
    if (!docId || !data || typeof data !== "object") {
      return null;
    }

    return {
      id: String(data.id || docId).trim(),
      title: String(data.title || "").trim(),
      description: String(data.description || "").trim(),
      audience: String(data.audience || "all").trim() || "all",
      storagePath: String(data.storagePath || "").trim(),
      downloadUrl: String(data.downloadUrl || "").trim(),
      fileName: String(data.fileName || "").trim(),
      createdAt: String(data.createdAt || "").trim(),
      updatedAt: String(data.updatedAt || "").trim(),
      createdByUid: String(data.createdByUid || "").trim(),
      updatedByUid: String(data.updatedByUid || "").trim(),
    };
  }

  function normalizeVisitor(docId, data) {
    if (!docId || !data || typeof data !== "object") {
      return null;
    }

    return {
      id: String(data.id || docId).trim(),
      cellId: String(data.cellId || "").trim(),
      name: String(data.name || "").trim(),
      phone: String(data.phone || "").trim(),
      churchId: normalizeIgrejaId(data.churchId || data.igrejaId),
      address: String(data.address || "").trim(),
      origin: String(data.origin || "").trim(),
      context: String(data.context || "").trim(),
      status: String(data.status || "new").trim() || "new",
      firstVisitAt: String(data.firstVisitAt || "").trim(),
      lastVisitAt: String(data.lastVisitAt || "").trim(),
      visitCount: Number(data.visitCount || 0) || 0,
      notes: String(data.notes || "").trim(),
      createdAt: String(data.createdAt || "").trim(),
      updatedAt: String(data.updatedAt || "").trim(),
      createdByUid: String(data.createdByUid || "").trim(),
      updatedByUid: String(data.updatedByUid || "").trim(),
    };
  }

  function normalizeAlert(docId, data) {
    if (!docId || !data || typeof data !== "object") {
      return null;
    }

    return {
      id: String(data.id || docId).trim(),
      cellId: String(data.cellId || "").trim(),
      type: String(data.type || "care").trim() || "care",
      severity: String(data.severity || "warn").trim() || "warn",
      status: String(data.status || "open").trim() || "open",
      title: String(data.title || "").trim(),
      summary: String(data.summary || "").trim(),
      ownerUid: String(data.ownerUid || "").trim(),
      dueAt: String(data.dueAt || "").trim(),
      notes: String(data.notes || "").trim(),
      createdAt: String(data.createdAt || "").trim(),
      updatedAt: String(data.updatedAt || "").trim(),
      createdByUid: String(data.createdByUid || "").trim(),
      updatedByUid: String(data.updatedByUid || "").trim(),
    };
  }

  function normalizePhoneDigits(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function normalizeFollowupStatus(value) {
    const status = String(value || "").trim();
    if (["new", "in_followup", "wants_prayer", "wants_cell", "assigned_to_cell", "do_not_contact"].includes(status)) {
      return status;
    }
    return "new";
  }

  function addDaysIso(baseIso, days) {
    const base = baseIso ? new Date(baseIso) : new Date();
    if (Number.isNaN(base.getTime())) {
      base.setTime(Date.now());
    }
    base.setDate(base.getDate() + Number(days || 0));
    base.setHours(10, 0, 0, 0);
    return base.toISOString();
  }

  function getTemplateStep(templateKey) {
    return FOLLOWUP_STEPS.find((step) => step.templateKey === templateKey) || null;
  }

  function normalizeQueueMessage(docId, data) {
    if (!docId || !data || typeof data !== "object") {
      return null;
    }

    return {
      id: String(data.id || docId).trim(),
      visitorId: String(data.visitorId || "").trim(),
      phone: String(data.phone || "").trim(),
      phoneDigits: normalizePhoneDigits(data.phoneDigits || data.phone),
      templateKey: String(data.templateKey || "").trim(),
      scheduledAt: String(data.scheduledAt || "").trim(),
      status: String(data.status || "pending").trim() || "pending",
      attempts: Number(data.attempts || 0) || 0,
      lastError: String(data.lastError || "").trim(),
      churchId: normalizeIgrejaId(data.churchId),
      createdAt: String(data.createdAt || "").trim(),
      updatedAt: String(data.updatedAt || "").trim(),
      sentAt: String(data.sentAt || "").trim(),
    };
  }

  function normalizeReceptionVisitor(docId, data) {
    if (!docId || !data || typeof data !== "object") {
      return null;
    }

    const name = String(data.name || data.nome || "").trim();
    if (!name) {
      return null;
    }

    const phone = String(data.phone || data.telefone || "").trim();
    const createdAt = String(data.createdAt || data.criadoEm || "").trim();
    const prayerRequest = String(data.prayerRequest || data.observacoes || "").trim();
    const firstVisit = data.firstVisit === false ? false : true;
    const wantsContact = data.wantsContact === false ? false : true;

    return {
      id: String(data.id || docId).trim(),
      name,
      nome: name,
      phone,
      telefone: phone,
      phoneDigits: normalizePhoneDigits(data.phoneDigits || phone),
      neighborhood: String(data.neighborhood || data.bairro || data.endereco || "").trim(),
      firstVisit,
      wantsContact,
      prayerRequest,
      observacoes: prayerRequest,
      followupStatus: normalizeFollowupStatus(data.followupStatus),
      followupPaused: data.followupPaused === true,
      assignedCellId: String(data.assignedCellId || "").trim(),
      assignedLeaderUid: String(data.assignedLeaderUid || "").trim(),
      assignedAt: String(data.assignedAt || "").trim(),
      createdAt,
      criadoEm: createdAt,
      updatedAt: String(data.updatedAt || "").trim(),
      createdByUid: String(data.createdByUid || data.criadoPor || "").trim(),
      criadoPor: String(data.createdByUid || data.criadoPor || "").trim(),
      updatedByUid: String(data.updatedByUid || "").trim(),
      churchId: normalizeIgrejaId(data.churchId || data.igrejaId),
      nextMessage: data.nextMessage || null,
    };
  }

  function buildDefaultTemplatePayload(churchId, step, now) {
    return {
      id: `${churchId}_${step.templateKey}`,
      churchId,
      templateKey: step.templateKey,
      label: step.label,
      body: step.body,
      dayOffset: step.dayOffset,
      enabled: true,
      whatsappTemplateName: "",
      language: "pt_BR",
      createdAt: now,
      updatedAt: now,
    };
  }

  function buildInitialFollowupPayload(visitor, actorUid, now) {
    const nextStep = FOLLOWUP_STEPS[0];
    const active = visitor.wantsContact !== false && Boolean(visitor.phoneDigits);
    return {
      id: visitor.id,
      visitorId: visitor.id,
      churchId: visitor.churchId,
      status: active ? "active" : "not_started",
      startedAt: active ? now : "",
      pausedAt: "",
      stoppedAt: active ? "" : now,
      completedAt: "",
      nextTemplateKey: active ? nextStep.templateKey : "",
      nextScheduledAt: active ? addDaysIso(visitor.createdAt || now, nextStep.dayOffset) : "",
      lastMessageAt: "",
      lastInboundMessageAt: "",
      lastInboundMessage: "",
      createdByUid: String(actorUid || "").trim(),
      updatedByUid: String(actorUid || "").trim(),
      createdAt: now,
      updatedAt: now,
    };
  }

  function buildInitialQueuePayloads(visitor, now) {
    if (visitor.wantsContact === false || !visitor.phoneDigits) {
      return [];
    }

    return FOLLOWUP_STEPS.map((step) => ({
      id: `${visitor.id}_${step.templateKey}`,
      visitorId: visitor.id,
      phone: visitor.phone,
      phoneDigits: visitor.phoneDigits,
      templateKey: step.templateKey,
      scheduledAt: addDaysIso(visitor.createdAt || now, step.dayOffset),
      status: "pending",
      attempts: 0,
      lastError: "",
      churchId: visitor.churchId,
      createdAt: now,
      updatedAt: now,
      sentAt: "",
      providerMessageId: "",
    }));
  }

  function normalizeBannerHome(data) {
    if (!data || typeof data !== "object") {
      return null;
    }
    const imageUrl = String(data.imageUrl || "").trim();
    if (!imageUrl) {
      return null;
    }
    return {
      imageUrl,
      link: String(data.link || "").trim(),
      text: String(data.text || "").trim(),
      ativo: data.ativo !== false,
      updatedAt: data.updatedAt || "",
      updatedBy: String(data.updatedBy || "").trim(),
    };
  }

  function normalizeSystemMeta(data) {
    if (!data || typeof data !== "object") {
      return {
        bootstrapCompleted: false,
        firstAdminUid: "",
        createdAt: "",
        updatedAt: "",
      };
    }

    return {
      bootstrapCompleted: data.bootstrapCompleted === true,
      firstAdminUid: String(data.firstAdminUid || "").trim(),
      createdAt: String(data.createdAt || "").trim(),
      updatedAt: String(data.updatedAt || "").trim(),
    };
  }

  function getLegacyCollection() {
    return api.db.collection(LEGACY.collection);
  }

  function normalizeLookup(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function buildProfileNameIndex(profiles) {
    const index = new Map();
    (Array.isArray(profiles) ? profiles : []).forEach((profile) => {
      const candidates = [
        profile?.name,
        profile?.email,
        String(profile?.email || "").split("@")[0],
      ];
      candidates
        .map((value) => normalizeLookup(value))
        .filter(Boolean)
        .forEach((key) => {
          if (!index.has(key)) {
            index.set(key, String(profile.uid || "").trim());
          }
        });
    });
    return index;
  }

  function pickLeaderUid(text, profileIndex) {
    const parts = String(text || "")
      .split(/\s*(?:,|;|\/| e | & )\s*/i)
      .map((value) => normalizeLookup(value))
      .filter(Boolean);

    for (const part of parts) {
      if (profileIndex.has(part)) {
        return profileIndex.get(part);
      }
    }

    return "";
  }

  function parseLooseNumber(value) {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : 0;
    }

    const raw = String(value || "").trim();
    if (!raw) {
      return 0;
    }

    let cleaned = raw.replace(/[^0-9,.\-]/g, "");
    if (!cleaned) {
      return 0;
    }

    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    if (lastComma > lastDot) {
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }

    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function buildDisplayNameFromEmail(email) {
    const raw = String(email || "").trim();
    if (!raw.includes("@")) {
      return raw || "Novo usuario";
    }
    return raw.split("@")[0] || "Novo usuario";
  }

  function buildImportedDocId(prefix, parts) {
    const suffix = (Array.isArray(parts) ? parts : [parts])
      .map((value) => slugifyId(String(value || "").trim()) || "item")
      .filter(Boolean)
      .join("-");
    return `${prefix}-${suffix}`.slice(0, 120);
  }

  function normalizeLegacyCell(cell) {
    if (!cell || typeof cell !== "object") {
      return null;
    }

    const id = String(cell.id || "").trim();
    const name = String(cell.name || "").trim();
    if (!id || !name) {
      return null;
    }

    return {
      id,
      name,
      meetingDay: String(cell.meetingDay || "").trim(),
      meetingTime: String(cell.meetingTime || "").trim(),
      address: String(cell.neighborhood || cell.address || "").trim(),
      leader: String(cell.leader || "").trim(),
      members: Array.isArray(cell.members)
        ? cell.members
          .map((member) => {
            if (!member || typeof member !== "object") {
              return null;
            }
            const memberName = String(member.name || "").trim();
            if (!memberName) {
              return null;
            }
            return {
              id: String(member.id || "").trim(),
              name: memberName,
              phone: String(member.phone || "").trim(),
            };
          })
          .filter(Boolean)
        : [],
      createdAt: String(cell.createdAt || "").trim(),
    };
  }

  function normalizeLegacyReport(report) {
    if (!report || typeof report !== "object") {
      return null;
    }

    const id = String(report.id || "").trim();
    const cellId = String(report.cellId || "").trim();
    const date = String(report.date || "").trim();
    if (!id || !cellId || !date) {
      return null;
    }

    return {
      id,
      cellId,
      date,
      leaders: String(report.leaders || "").trim(),
      coLeaders: String(report.coLeaders || "").trim(),
      host: String(report.host || "").trim(),
      address: String(report.address || "").trim(),
      presentMemberIds: Array.isArray(report.presentMemberIds)
        ? report.presentMemberIds.map((entry) => String(entry || "").trim()).filter(Boolean)
        : [],
      visitorsCount: Number(report.visitorsCount || 0) || 0,
      visitorNames: Array.isArray(report.visitorNames)
        ? report.visitorNames.map((entry) => String(entry || "").trim()).filter(Boolean)
        : [],
      visitorDetails: Array.isArray(report.visitorDetails)
        ? report.visitorDetails
          .map((visitor) => {
            const name = String(visitor?.name || "").trim();
            if (!name) {
              return null;
            }
            return {
              name,
              how: String(visitor?.how || "").trim(),
              address: String(visitor?.address || "").trim(),
              phone: String(visitor?.phone || "").trim(),
              visitType: visitor?.visitType === "returning" ? "returning" : "first",
            };
          })
          .filter(Boolean)
        : [],
      offering: report.offering,
      foods: String(report.foods || "").trim(),
      snack: String(report.snack || "").trim(),
      discipleship: String(report.discipleship || "").trim(),
      visits: report.visits,
      conversions: report.conversions,
      communionMinutes: Number(report.communionMinutes || 0) || 0,
      createdAt: String(report.createdAt || "").trim(),
      updatedAt: String(report.updatedAt || "").trim(),
    };
  }

  function normalizeLegacyVisitor(visitor) {
    if (!visitor || typeof visitor !== "object") {
      return null;
    }

    const name = String(visitor.name || "").trim();
    if (!name) {
      return null;
    }

    return {
      id: String(visitor.id || "").trim(),
      name,
      phone: String(visitor.phone || "").trim(),
      address: String(visitor.address || "").trim(),
      age: String(visitor.age || "").trim(),
      cellId: String(visitor.cellId || "").trim(),
      cellName: String(visitor.cellName || "").trim(),
      registeredAt: String(visitor.registeredAt || "").trim(),
    };
  }

  function normalizeLegacyStudy(study) {
    if (!study || typeof study !== "object") {
      return null;
    }

    const title = String(study.title || "").trim();
    if (!title) {
      return null;
    }

    return {
      id: String(study.id || "").trim(),
      title,
      description: String(study.description || "").trim(),
      audience: String(study.audience || "all").trim() || "all",
      storagePath: String(study.storagePath || "").trim(),
      downloadUrl: String(study.downloadUrl || study.pdfUrl || "").trim(),
      fileName: String(study.fileName || "").trim(),
      hasEmbeddedPdf: study.hasEmbeddedPdf === true,
      createdAt: String(study.createdAt || "").trim(),
      updatedAt: String(study.updatedAt || "").trim(),
    };
  }

  function getLegacyReportIdentity(report) {
    const id = String(report?.id || "").trim();
    if (id) {
      return `id:${id}`;
    }

    const cellId = String(report?.cellId || "").trim();
    const date = String(report?.date || "").trim();
    return cellId || date ? `cell:${cellId}|${date}` : "";
  }

  function mergeLegacyReports(primaryReports, fallbackReports) {
    const merged = new Map();

    [fallbackReports, primaryReports].forEach((list) => {
      (Array.isArray(list) ? list : []).forEach((report) => {
        const normalized = normalizeLegacyReport(report);
        if (!normalized) {
          return;
        }

        const key = getLegacyReportIdentity(normalized);
        if (!key) {
          return;
        }

        const current = merged.get(key);
        const currentStamp = new Date(current?.updatedAt || current?.createdAt || 0).getTime();
        const incomingStamp = new Date(normalized.updatedAt || normalized.createdAt || 0).getTime();
        if (!current || incomingStamp >= currentStamp) {
          merged.set(key, normalized);
        }
      });
    });

    return Array.from(merged.values());
  }

  async function loadLegacyPerDocReports() {
    const documentId = firebase.firestore.FieldPath.documentId();
    const snapshot = await getLegacyCollection()
      .orderBy(documentId)
      .startAt(LEGACY.reportPrefix)
      .endAt(LEGACY.reportEnd)
      .get();

    return snapshot.docs
      .map((doc) => normalizeLegacyReport(doc.data()))
      .filter(Boolean);
  }

  async function loadLegacyBundle() {
    initialize();
    if (!api.db) {
      throw new Error("Firestore indisponivel para ler a V1.");
    }

    const [stateDoc, cellsDoc, reportsDoc, visitorsDoc, reportsMetaDoc, usersDoc, perDocReports] = await Promise.all([
      getLegacyCollection().doc(LEGACY.stateDoc).get(),
      getLegacyCollection().doc(LEGACY.cellsDoc).get(),
      getLegacyCollection().doc(LEGACY.reportsDoc).get(),
      getLegacyCollection().doc(LEGACY.visitorsDoc).get(),
      getLegacyCollection().doc(LEGACY.reportsMetaDoc).get(),
      getLegacyCollection().doc(LEGACY.usersDoc).get(),
      loadLegacyPerDocReports().catch(() => []),
    ]);

    const stateData = stateDoc.exists ? stateDoc.data() : {};
    const cells = cellsDoc.exists && Array.isArray(cellsDoc.data()?.list)
      ? cellsDoc.data().list
      : Array.isArray(stateData?.cells)
        ? stateData.cells
        : [];

    const legacyReports = reportsDoc.exists && Array.isArray(reportsDoc.data()?.list)
      ? reportsDoc.data().list
      : Array.isArray(stateData?.reports)
        ? stateData.reports
        : [];

    const perDocModeReady = reportsMetaDoc.exists && reportsMetaDoc.data()?.storageMode === "per_doc";
    const reports = perDocModeReady
      ? perDocReports
      : mergeLegacyReports(perDocReports, legacyReports);

    const visitors = visitorsDoc.exists && Array.isArray(visitorsDoc.data()?.list)
      ? visitorsDoc.data().list
      : [];

    const studies = Array.isArray(stateData?.studies) ? stateData.studies : [];
    const users = usersDoc.exists && Array.isArray(usersDoc.data()?.list)
      ? usersDoc.data().list
      : [];

    return {
      cells: cells.map((entry) => normalizeLegacyCell(entry)).filter(Boolean),
      reports: reports.map((entry) => normalizeLegacyReport(entry)).filter(Boolean),
      visitors: visitors.map((entry) => normalizeLegacyVisitor(entry)).filter(Boolean),
      studies: studies.map((entry) => normalizeLegacyStudy(entry)).filter(Boolean),
      users,
    };
  }

  function buildLegacyReportNotes(report) {
    const lines = [
      report?.coLeaders ? `Co-lideres: ${report.coLeaders}` : "",
      report?.foods ? `Alimentos: ${report.foods}` : "",
      report?.snack ? `Lanche: ${report.snack}` : "",
      report?.discipleship ? `Discipulado: ${report.discipleship}` : "",
      Number(report?.visits || 0) > 0 ? `Visitas: ${Number(report.visits || 0)}` : "",
      Number(report?.conversions || 0) > 0 ? `Conversoes: ${Number(report.conversions || 0)}` : "",
      Number(report?.communionMinutes || 0) > 0 ? `Ceia: ${Number(report.communionMinutes || 0)} min` : "",
    ].filter(Boolean);

    return lines.join("\n");
  }

  function resolveLegacyVisitorCell(visitor, cells, recurringMap) {
    const directCellId = String(visitor?.cellId || "").trim();
    if (directCellId && cells.some((cell) => cell.id === directCellId)) {
      return directCellId;
    }

    const directCellName = normalizeLookup(visitor?.cellName);
    if (directCellName) {
      const matchedCell = cells.find((cell) => normalizeLookup(cell.name) === directCellName);
      if (matchedCell) {
        return matchedCell.id;
      }
    }

    const recurring = recurringMap.get(normalizeLookup(visitor?.name));
    return recurring?.count > 1 ? recurring.cellId : "";
  }

  function buildLegacyVisitors(bundle) {
    const cells = Array.isArray(bundle?.cells) ? bundle.cells : [];
    const reports = Array.isArray(bundle?.reports) ? bundle.reports : [];
    const legacyVisitors = Array.isArray(bundle?.visitors) ? bundle.visitors : [];
    const recurringMap = new Map();
    const imported = new Map();
    let skippedUnlinked = 0;

    reports.forEach((report) => {
      (Array.isArray(report.visitorDetails) ? report.visitorDetails : []).forEach((visitor) => {
        const key = normalizeLookup(visitor?.name);
        if (!key || !report.cellId) {
          return;
        }

        const currentRecurring = recurringMap.get(key) || { cellId: report.cellId, count: 0 };
        if (currentRecurring.cellId !== report.cellId && currentRecurring.count <= 1) {
          currentRecurring.cellId = report.cellId;
        }
        currentRecurring.count += 1;
        recurringMap.set(key, currentRecurring);

        const importedKey = `${report.cellId}::${key}`;
        const current = imported.get(importedKey) || {
          id: buildImportedDocId("legacy-visitor", [report.cellId, visitor.name]),
          cellId: report.cellId,
          name: String(visitor.name || "").trim(),
          phone: String(visitor.phone || "").trim(),
          address: String(visitor.address || "").trim(),
          origin: String(visitor.how || "").trim(),
          context: "Importado dos relatórios da V1.",
          status: "new",
          firstVisitAt: String(report.date || "").trim(),
          lastVisitAt: String(report.date || "").trim(),
          visitCount: 0,
          notes: "",
        };

        current.visitCount += 1;
        current.firstVisitAt = [current.firstVisitAt, String(report.date || "").trim()].filter(Boolean).sort()[0] || "";
        current.lastVisitAt = [current.lastVisitAt, String(report.date || "").trim()].filter(Boolean).sort().slice(-1)[0] || "";
        current.phone = current.phone || String(visitor.phone || "").trim();
        current.address = current.address || String(visitor.address || "").trim();
        current.origin = current.origin || String(visitor.how || "").trim();
        current.status = current.visitCount > 1 ? "returning" : "new";
        imported.set(importedKey, current);
      });
    });

    legacyVisitors.forEach((visitor) => {
      const nameKey = normalizeLookup(visitor?.name);
      if (!nameKey) {
        return;
      }

      const cellId = resolveLegacyVisitorCell(visitor, cells, recurringMap);
      if (!cellId) {
        skippedUnlinked += 1;
        return;
      }

      const importedKey = `${cellId}::${nameKey}`;
      const registeredAt = String(visitor.registeredAt || "").slice(0, 10);
      const current = imported.get(importedKey) || {
        id: buildImportedDocId("legacy-visitor", [cellId, visitor.id || visitor.name]),
        cellId,
        name: String(visitor.name || "").trim(),
        phone: String(visitor.phone || "").trim(),
        address: String(visitor.address || "").trim(),
        origin: "",
        context: visitor.age ? `Idade registrada na V1: ${visitor.age}` : "Importado da lista pública de visitantes da V1.",
        status: "new",
        firstVisitAt: registeredAt,
        lastVisitAt: registeredAt,
        visitCount: 1,
        notes: "",
      };

      current.phone = current.phone || String(visitor.phone || "").trim();
      current.address = current.address || String(visitor.address || "").trim();
      current.firstVisitAt = current.firstVisitAt || registeredAt;
      current.lastVisitAt = current.lastVisitAt || registeredAt;
      imported.set(importedKey, current);
    });

    return {
      visitors: Array.from(imported.values()).sort((left, right) =>
        String(left.name || "").localeCompare(String(right.name || ""), "pt-BR", { sensitivity: "base" })
      ),
      skippedUnlinked,
    };
  }

  async function getImportedStudyDownloadUrl(study) {
    const directUrl = String(study?.downloadUrl || "").trim();
    if (directUrl) {
      return directUrl;
    }

    const storagePath = String(study?.storagePath || "").trim();
    if (!storagePath || !api.storage) {
      return "";
    }

    try {
      return await api.storage.ref(storagePath).getDownloadURL();
    } catch (_) {
      return "";
    }
  }

  async function loadSystemMeta() {
    initialize();
    if (!api.db) {
      return normalizeSystemMeta(null);
    }

    const snapshot = await api.db.collection(COLLECTIONS.meta).doc("system").get();
    return snapshot.exists ? normalizeSystemMeta(snapshot.data()) : normalizeSystemMeta(null);
  }

  async function signInWithEmail(email, password) {
    initialize();
    return api.auth.signInWithEmailAndPassword(String(email || "").trim().toLowerCase(), String(password || ""));
  }

  async function signUpWithEmail(name, email, password) {
    initialize();

    const normalizedName = String(name || "").trim();
    const normalizedEmail = String(email || "").trim();
    const normalizedPassword = String(password || "");
    const credential = await api.auth.createUserWithEmailAndPassword(normalizedEmail, normalizedPassword);
    const user = credential?.user || null;
    if (!user) {
      throw new Error("Nao foi possivel criar a conta.");
    }

    if (normalizedName && typeof user.updateProfile === "function") {
      try {
        await user.updateProfile({ displayName: normalizedName });
      } catch (error) {
        console.warn("[Renovo+] updateProfile:", error?.message || error);
      }
    }

    const systemMeta = await loadSystemMeta();
    const isFirstProfile = !systemMeta.bootstrapCompleted;
    const now = new Date().toISOString();
    const profileDoc = {
      name: normalizedName || user.displayName || normalizedEmail.split("@")[0] || "Novo usuario",
      email: normalizedEmail,
      role: isFirstProfile ? "admin" : "pending",
      status: isFirstProfile ? "active" : "pending",
      igrejaId: DEFAULT_IGREJA_ID,
      primaryCellId: "",
      scopeCellIds: [],
      ministryName: "",
      notes: isFirstProfile
        ? "Primeiro perfil criado automaticamente pela Renovo+."
        : "Conta criada aguardando definicao de perfil e escopo.",
      createdAt: now,
      updatedAt: now,
    };

    await api.db.collection(COLLECTIONS.users).doc(user.uid).set(profileDoc, { merge: true });
    if (isFirstProfile) {
      await api.db.collection(COLLECTIONS.meta).doc("system").set({
        bootstrapCompleted: true,
        firstAdminUid: user.uid,
        createdAt: systemMeta.createdAt || now,
        updatedAt: now,
      }, { merge: true });
    }
    return { user, profile: normalizeProfile(user.uid, profileDoc), isFirstProfile };
  }

  async function signOut() {
    initialize();
    return api.auth.signOut();
  }

  async function sendPasswordReset(email) {
    initialize();
    const normalizedEmail = String(email || "").trim();
    if (!normalizedEmail) {
      throw new Error("Informe um e-mail para redefinir a senha.");
    }
    return api.auth.sendPasswordResetEmail(normalizedEmail);
  }

  function igrejaConfigDoc(igrejaId, docId) {
    return api.db
      .collection(COLLECTIONS.igrejas)
      .doc(normalizeIgrejaId(igrejaId))
      .collection("config")
      .doc(docId);
  }

  async function loadBannerHome(igrejaId) {
    initialize();
    if (!api.db) return null;
    const snapshot = await igrejaConfigDoc(igrejaId, "bannerHome").get();
    return snapshot.exists ? normalizeBannerHome(snapshot.data()) : null;
  }

  async function saveBannerHome(igrejaId, patch, uid) {
    initialize();
    if (!api.db) {
      throw new Error("Firestore indisponivel na Renovo+.");
    }
    const imageUrl = String(patch?.imageUrl || "").trim();
    if (!imageUrl) {
      throw new Error("Informe a URL da imagem do banner.");
    }
    const payload = {
      imageUrl,
      link: String(patch?.link || "").trim(),
      text: String(patch?.text || "").trim(),
      ativo: patch?.ativo !== false,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: String(uid || api.currentUser?.uid || "").trim(),
    };
    await igrejaConfigDoc(igrejaId, "bannerHome").set(payload, { merge: true });
    return normalizeBannerHome({ ...payload, updatedAt: new Date() });
  }

  function createSecondaryApp() {
    const appName = `renovo-plus-admin-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return firebase.initializeApp(FIREBASE_CONFIG, appName);
  }

  async function withSecondaryApp(task) {
    const app = createSecondaryApp();
    const auth = typeof app.auth === "function" ? app.auth() : null;
    const db = typeof app.firestore === "function" ? app.firestore() : null;

    if (!auth || !db) {
      try {
        await app.delete();
      } catch (_) {}
      throw new Error("Nao foi possivel abrir uma sessao auxiliar para criar o acesso.");
    }

    try {
      await auth.setPersistence(firebase.auth.Auth.Persistence.NONE);
    } catch (_) {}

    try {
      return await task({ app, auth, db });
    } finally {
      try { auth.signOut(); } catch (_) {}
      setTimeout(() => { try { app.delete(); } catch (_) {} }, 500);
    }
  }

  function observeAuth(listener) {
    initialize();
    if (typeof listener === "function") {
      authListeners.add(listener);
      if (authReadyResolved) {
        listener(api.currentUser);
      }
    }

    return function unsubscribe() {
      authListeners.delete(listener);
    };
  }

  async function waitForAuthReady() {
    initialize();
    if (authReadyResolved) {
      return api.currentUser;
    }
    return authReadyPromise;
  }

  async function loadUserProfile(uid) {
    initialize();
    if (!api.db) {
      throw new Error("Firestore indisponivel na Renovo+.");
    }

    const normalizedUid = String(uid || "").trim();
    if (!normalizedUid) {
      return null;
    }

    const snapshot = await api.db.collection(COLLECTIONS.users).doc(normalizedUid).get();
    return snapshot.exists ? normalizeProfile(snapshot.id, snapshot.data()) : null;
  }

  async function listProfiles(profile) {
    initialize();
    if (!api.db) {
      return [];
    }

    if (profile?.role === "coordinator") {
      const igrejaId = normalizeIgrejaId(profile.igrejaId);
      const snapshots = await Promise.all([
        api.db.collection(COLLECTIONS.users).where("igrejaId", "==", igrejaId).where("role", "==", "leader").limit(200).get(),
        api.db.collection(COLLECTIONS.users).where("igrejaId", "==", igrejaId).where("role", "==", "pending").limit(200).get(),
      ]);
      const byUid = new Map();
      snapshots.forEach((snapshot) => {
        snapshot.docs.forEach((doc) => {
          byUid.set(doc.id, doc.data());
        });
      });
      return Array.from(byUid.entries())
        .map(([uid, data]) => normalizeProfile(uid, data))
        .filter(Boolean)
        .sort((left, right) => String(left.createdAt || "").localeCompare(String(right.createdAt || "")));
    }

    const snapshot = await api.db.collection(COLLECTIONS.users).orderBy("createdAt", "asc").limit(200).get();
    return snapshot.docs
      .map((doc) => normalizeProfile(doc.id, doc.data()))
      .filter(Boolean);
  }

  async function hasAnyProfiles() {
    initialize();
    const meta = await loadSystemMeta();
    return meta.bootstrapCompleted === true;
  }

  async function saveUserProfile(uid, patch) {
    initialize();
    if (!api.db) {
      throw new Error("Firestore indisponivel na Renovo+.");
    }

    const normalizedUid = String(uid || "").trim();
    if (!normalizedUid) {
      throw new Error("Uid obrigatorio para salvar perfil.");
    }

    const current = await loadUserProfile(normalizedUid);
    const now = new Date().toISOString();
    const hasPrimaryCellPatch = Object.prototype.hasOwnProperty.call(patch || {}, "primaryCellId");
    const payload = {
      name: String(patch?.name || current?.name || "").trim(),
      email: String(patch?.email || current?.email || "").toLowerCase().trim(),
      role: normalizeRole(patch?.role || current?.role),
      status: normalizeStatus(patch?.status || current?.status),
      igrejaId: normalizeIgrejaId(patch?.igrejaId || current?.igrejaId),
      primaryCellId: String(hasPrimaryCellPatch ? patch.primaryCellId : (current?.primaryCellId || "")).trim(),
      scopeCellIds: Array.isArray(patch?.scopeCellIds)
        ? patch.scopeCellIds.map((id) => String(id || "").trim()).filter(Boolean)
        : Array.isArray(current?.scopeCellIds)
          ? current.scopeCellIds
          : [],
      ministryName: String(patch?.ministryName || current?.ministryName || "").trim(),
      notes: String(patch?.notes || current?.notes || "").trim(),
      updatedAt: now,
      createdAt: current?.createdAt || now,
    };

    await api.db.collection(COLLECTIONS.users).doc(normalizedUid).set(payload, { merge: true });
    return normalizeProfile(normalizedUid, payload);
  }

  async function saveFcmToken(uid, token) {
    initialize();
    if (!api.db || !uid || !token) return;
    await api.db.collection(COLLECTIONS.users).doc(uid).update({
      fcmTokens: firebase.firestore.FieldValue.arrayUnion(token),
    });
  }

  async function provisionManagedAccess(patch, options = {}) {
    initialize();
    if (!api.db) {
      throw new Error("Firestore indisponivel na Renovo+.");
    }

    const normalizedName = String(patch?.name || "").trim();
    const normalizedEmail = String(patch?.email || "").trim();
    const temporaryPassword = String(patch?.temporaryPassword || "");
    if (!normalizedName || !normalizedEmail || temporaryPassword.length < 6) {
      throw new Error("Informe nome, e-mail e uma senha temporaria com pelo menos 6 caracteres.");
    }

    const created = await withSecondaryApp(async ({ auth, db }) => {
      const credential = await auth.createUserWithEmailAndPassword(normalizedEmail, temporaryPassword);
      const user = credential?.user || null;
      if (!user?.uid) {
        throw new Error("Nao foi possivel criar o usuario autenticado.");
      }

      if (typeof user.updateProfile === "function") {
        try {
          await user.updateProfile({ displayName: normalizedName });
        } catch (_) {}
      }

      const canonicalEmail = String(user.email || normalizedEmail).toLowerCase().trim();
      const now = new Date().toISOString();
      await db.collection(COLLECTIONS.users).doc(user.uid).set({
        name: normalizedName,
        email: canonicalEmail,
        role: "pending",
        status: "pending",
        igrejaId: normalizeIgrejaId(patch?.igrejaId),
        primaryCellId: "",
        scopeCellIds: [],
        ministryName: "",
        notes: "Conta criada pela administracao da Renovo+.",
        createdAt: now,
        updatedAt: now,
      }, { merge: true });

      return {
        uid: user.uid,
        createdAt: now,
        canonicalEmail,
      };
    });

    const profile = await saveUserProfile(created.uid, {
      name: normalizedName,
      email: String(created.canonicalEmail || normalizedEmail).toLowerCase().trim(),
      role: String(patch?.role || "pending").trim(),
      status: String(patch?.status || "pending").trim(),
      igrejaId: normalizeIgrejaId(patch?.igrejaId),
      primaryCellId: String(patch?.primaryCellId || "").trim(),
      scopeCellIds: Array.isArray(patch?.scopeCellIds) ? patch.scopeCellIds : [],
      ministryName: String(patch?.ministryName || "").trim(),
      notes: String(patch?.notes || "Conta criada pela administracao da Renovo+.").trim(),
    });

    if (options.sendPasswordReset === true) {
      await sendPasswordReset(normalizedEmail);
    }

    return {
      uid: created.uid,
      profile,
    };
  }

  async function claimInitialAdminProfile(currentUser, patch) {
    initialize();
    if (!api.db) {
      throw new Error("Firestore indisponivel na Renovo+.");
    }

    const user = currentUser || api.currentUser;
    if (!user?.uid) {
      throw new Error("Usuario autenticado nao encontrado.");
    }

    const now = new Date().toISOString();
    const normalizedName = String(patch?.name || user.displayName || user.email || "").trim();
    const normalizedEmail = String(patch?.email || user.email || "").trim();

    return api.db.runTransaction(async (transaction) => {
      const systemRef = api.db.collection(COLLECTIONS.meta).doc("system");
      const systemSnap = await transaction.get(systemRef);
      const systemMeta = systemSnap.exists ? normalizeSystemMeta(systemSnap.data()) : normalizeSystemMeta(null);
      if (systemMeta.bootstrapCompleted) {
        throw new Error("Ja existe pelo menos um perfil na Renovo+.");
      }

      const ref = api.db.collection(COLLECTIONS.users).doc(user.uid);
      const payload = {
        name: normalizedName || "Administrador inicial",
        email: normalizedEmail,
        role: "admin",
        status: "active",
        primaryCellId: "",
        scopeCellIds: [],
        ministryName: String(patch?.ministryName || "").trim(),
        notes: "Primeiro admin registrado manualmente na Renovo+.",
        createdAt: now,
        updatedAt: now,
      };

      transaction.set(ref, payload, { merge: true });
      transaction.set(systemRef, {
        bootstrapCompleted: true,
        firstAdminUid: user.uid,
        createdAt: systemMeta.createdAt || now,
        updatedAt: now,
      }, { merge: true });
      return normalizeProfile(user.uid, payload);
    });
  }

  async function saveCell(patch, actorUid) {
    initialize();
    if (!api.db) {
      throw new Error("Firestore indisponivel na Renovo+.");
    }

    const requestedId = String(patch?.id || "").trim();
    const customId = String(patch?.customId || "").trim();
    const baseId = slugifyId(requestedId || customId || patch?.name || "");

    if (!requestedId && !baseId) {
      throw new Error("Informe pelo menos o nome da celula.");
    }

    let targetId = requestedId || baseId;

    if (!requestedId) {
      let candidate = targetId;
      let suffix = 2;

      while (candidate) {
        const snapshot = await api.db.collection(COLLECTIONS.cells).doc(candidate).get();
        if (!snapshot.exists) {
          targetId = candidate;
          break;
        }
        candidate = `${baseId}-${suffix}`;
        suffix += 1;
      }
    }

    const ref = api.db.collection(COLLECTIONS.cells).doc(targetId);
    const currentSnapshot = await ref.get();
    const current = currentSnapshot.exists ? normalizeCell(currentSnapshot.id, currentSnapshot.data()) : null;
    const now = new Date().toISOString();
    const createdAt = current?.createdAt || String(patch?.createdAt || now).trim() || now;
    const updatedAt = current
      ? now
      : String(patch?.updatedAt || patch?.createdAt || now).trim() || now;
    const coLeaderUids = Array.isArray(patch?.coLeaderUids)
      ? patch.coLeaderUids.map((id) => String(id || "").trim()).filter(Boolean)
      : Array.isArray(current?.coLeaderUids)
          ? current.coLeaderUids
          : [];

    const payload = {
      id: targetId,
      name: String(patch?.name || current?.name || "").trim(),
      meetingDay: String(patch?.meetingDay || current?.meetingDay || "").trim(),
      meetingTime: String(patch?.meetingTime || current?.meetingTime || "").trim(),
      address: String(patch?.address || current?.address || "").trim(),
      leaderUid: String(patch?.leaderUid || current?.leaderUid || "").trim(),
      coLeaderUids,
       status: ["active", "inactive"].includes(String(patch?.status || "").trim().toLowerCase())
         ? String(patch.status).trim().toLowerCase()
         : current?.status || "active",
       notes: String(patch?.notes || current?.notes || "").trim(),
       createdAt,
       updatedAt,
       createdByUid: current?.createdByUid || String(actorUid || "").trim(),
       updatedByUid: String(actorUid || current?.updatedByUid || "").trim(),
     };

    await ref.set(payload, { merge: true });
    return normalizeCell(targetId, payload);
  }

  async function saveMember(patch, actorUid) {
    initialize();
    if (!api.db) {
      throw new Error("Firestore indisponivel na Renovo+.");
    }

    const requestedId = String(patch?.id || "").trim();
    const ref = requestedId
      ? api.db.collection(COLLECTIONS.members).doc(requestedId)
      : api.db.collection(COLLECTIONS.members).doc();

    const currentSnapshot = requestedId ? await ref.get() : null;
    const current = currentSnapshot?.exists ? normalizeMember(currentSnapshot.id, currentSnapshot.data()) : null;
    const now = new Date().toISOString();
    const createdAt = current?.createdAt || String(patch?.createdAt || now).trim() || now;
    const updatedAt = current
      ? now
      : String(patch?.updatedAt || patch?.createdAt || now).trim() || now;
    const payload = {
      id: ref.id,
      cellId: String(patch?.cellId || current?.cellId || "").trim(),
      name: String(patch?.name || current?.name || "").trim(),
      phone: String(patch?.phone || current?.phone || "").trim(),
      roleInCell: String(patch?.roleInCell || current?.roleInCell || "member").trim() || "member",
      status: String(patch?.status || current?.status || "active").trim() || "active",
      joinedAt: String(patch?.joinedAt || current?.joinedAt || "").trim(),
      notes: String(patch?.notes || current?.notes || "").trim(),
      createdAt,
      updatedAt,
      createdByUid: current?.createdByUid || String(actorUid || "").trim(),
      updatedByUid: String(actorUid || current?.updatedByUid || "").trim(),
    };

    if (!payload.cellId || !payload.name) {
      throw new Error("Membro precisa de celula e nome.");
    }

    await ref.set(payload, { merge: true });
    return normalizeMember(ref.id, payload);
  }

  async function saveReport(patch, actorUid) {
    initialize();
    if (!api.db) {
      throw new Error("Firestore indisponivel na Renovo+.");
    }

    const requestedId = String(patch?.id || "").trim();
    const isNew = patch?._isNew === true;
    const ref = requestedId
      ? api.db.collection(COLLECTIONS.reports).doc(requestedId)
      : api.db.collection(COLLECTIONS.reports).doc();

    const currentSnapshot = requestedId && !isNew ? await ref.get() : null;
    const current = currentSnapshot?.exists ? normalizeReport(currentSnapshot.id, currentSnapshot.data()) : null;
    const now = new Date().toISOString();
    const createdAt = current?.createdAt || String(patch?.createdAt || now).trim() || now;
    const updatedAt = current
      ? now
      : String(patch?.updatedAt || patch?.createdAt || now).trim() || now;
    const presentMemberIds = Array.isArray(patch?.presentMemberIds)
      ? patch.presentMemberIds.map((id) => String(id || "").trim()).filter(Boolean)
      : Array.isArray(current?.presentMemberIds) ? current.presentMemberIds : [];
    const presentCountRaw = Number(patch?.presentCount);
    const visitorsCount = Number(patch?.visitorsCount);
    const offering = Number(patch?.offering);

    const payload = {
      id: ref.id,
      cellId: String(patch?.cellId || current?.cellId || "").trim(),
      date: String(patch?.date || current?.date || "").trim(),
      leaders: String(patch?.leaders || current?.leaders || "").trim(),
      coLeaders: String(patch?.coLeaders !== undefined ? patch.coLeaders : (current?.coLeaders || "")).trim(),
      host: String(patch?.host || current?.host || "").trim(),
      address: String(patch?.address || current?.address || "").trim(),
      presentMemberIds,
      presentCount: Number.isFinite(presentCountRaw) ? presentCountRaw : (presentMemberIds.length || Number(current?.presentCount || 0) || 0),
      visitorsCount: Number.isFinite(visitorsCount) ? visitorsCount : Number(current?.visitorsCount || 0) || 0,
      visitorNames: String(patch?.visitorNames !== undefined ? patch.visitorNames : (current?.visitorNames || "")).trim(),
      offering: Number.isFinite(offering) ? offering : Number(current?.offering || 0) || 0,
      snack: String(patch?.snack !== undefined ? patch.snack : (current?.snack || "")).trim(),
      discipleship: String(patch?.discipleship !== undefined ? patch.discipleship : (current?.discipleship || "")).trim(),
      communionMinutes: String(patch?.communionMinutes !== undefined ? patch.communionMinutes : (current?.communionMinutes || "")).trim(),
      foods: String(patch?.foods !== undefined ? patch.foods : (current?.foods || "")).trim(),
      notes: String(patch?.notes || current?.notes || "").trim(),
      imageUrls: Array.isArray(patch?.imageUrls)
        ? patch.imageUrls.map((u) => String(u || "").trim()).filter(Boolean)
        : Array.isArray(current?.imageUrls) ? current.imageUrls : [],
      createdAt,
      updatedAt,
      createdByUid: current?.createdByUid || String(actorUid || "").trim(),
      updatedByUid: String(actorUid || current?.updatedByUid || "").trim(),
    };

    if (!payload.cellId || !payload.date) {
      throw new Error("Relatorio precisa de cellId e data.");
    }

    await ref.set(payload, { merge: true });
    return normalizeReport(ref.id, payload);
  }

  async function saveStudy(patch, actorUid) {
    initialize();
    if (!api.db) {
      throw new Error("Firestore indisponivel na Renovo+.");
    }
    if (!api.storage) {
      throw new Error("Storage indisponivel na Renovo+.");
    }

    const requestedId = String(patch?.id || "").trim();
    const ref = requestedId
      ? api.db.collection(COLLECTIONS.studies).doc(requestedId)
      : api.db.collection(COLLECTIONS.studies).doc();

    const currentSnapshot = requestedId ? await ref.get() : null;
    const current = currentSnapshot?.exists ? normalizeStudy(currentSnapshot.id, currentSnapshot.data()) : null;
    const now = new Date().toISOString();
    const createdAt = current?.createdAt || String(patch?.createdAt || now).trim() || now;
    const updatedAt = current
      ? now
      : String(patch?.updatedAt || patch?.createdAt || now).trim() || now;
    const file = patch?.file || null;
    let storagePath = current?.storagePath || "";
    let downloadUrl = current?.downloadUrl || "";
    let fileName = current?.fileName || "";

    if (file) {
      const originalFileName = String(file.name || "");
      const mimeType = String(file.type || "").toLowerCase();
      if (mimeType !== "application/pdf" && !originalFileName.toLowerCase().endsWith(".pdf")) {
        throw new Error("Envie um arquivo PDF valido.");
      }

      fileName = sanitizeFileName(file.name || `study-${ref.id}.pdf`);
      storagePath = `renovo-plus/studies/${ref.id}/${Date.now()}-${fileName}`;
      const uploadSnapshot = await api.storage.ref(storagePath).put(file);
      downloadUrl = await uploadSnapshot.ref.getDownloadURL();
    }

    const payload = {
      id: ref.id,
      title: String(patch?.title || current?.title || "").trim(),
      description: String(patch?.description || current?.description || "").trim(),
      audience: String(patch?.audience || current?.audience || "all").trim() || "all",
      storagePath,
      downloadUrl,
      fileName,
      createdAt,
      updatedAt,
      createdByUid: current?.createdByUid || String(actorUid || "").trim(),
      updatedByUid: String(actorUid || current?.updatedByUid || "").trim(),
    };

    if (!payload.title) {
      throw new Error("Estudo precisa de titulo.");
    }

    if (!payload.storagePath || !payload.downloadUrl) {
      throw new Error("Envie um arquivo PDF para o estudo.");
    }

    await ref.set(payload, { merge: true });
    return normalizeStudy(ref.id, payload);
  }

  async function listAccessibleStudies(profile, limit = 200) {
    initialize();
    if (!api.db || !profile) {
      return [];
    }

    const snapshot = await api.db.collection(COLLECTIONS.studies).orderBy("createdAt", "desc").limit(limit).get();
    return snapshot.docs
      .map((doc) => normalizeStudy(doc.id, doc.data()))
      .filter(Boolean);
  }

  async function saveVisitor(patch, actorUid) {
    initialize();
    if (!api.db) {
      throw new Error("Firestore indisponivel na Renovo+.");
    }

    const requestedId = String(patch?.id || "").trim();
    const ref = requestedId
      ? api.db.collection(COLLECTIONS.visitors).doc(requestedId)
      : api.db.collection(COLLECTIONS.visitors).doc();

    const currentSnapshot = requestedId ? await ref.get() : null;
    const current = currentSnapshot?.exists ? normalizeVisitor(currentSnapshot.id, currentSnapshot.data()) : null;
    const now = new Date().toISOString();
    const createdAt = current?.createdAt || String(patch?.createdAt || now).trim() || now;
    const updatedAt = current
      ? now
      : String(patch?.updatedAt || patch?.createdAt || now).trim() || now;
    const visitCount = Number(patch?.visitCount);

    const payload = {
      id: ref.id,
      cellId: String(patch?.cellId || current?.cellId || "").trim(),
      name: String(patch?.name || current?.name || "").trim(),
      phone: String(patch?.phone || current?.phone || "").trim(),
      address: String(patch?.address || current?.address || "").trim(),
      origin: String(patch?.origin || current?.origin || "").trim(),
      context: String(patch?.context || current?.context || "").trim(),
      status: String(patch?.status || current?.status || "new").trim() || "new",
      firstVisitAt: String(patch?.firstVisitAt || current?.firstVisitAt || "").trim(),
      lastVisitAt: String(patch?.lastVisitAt || current?.lastVisitAt || "").trim(),
      visitCount: Number.isFinite(visitCount) ? visitCount : Number(current?.visitCount || 0) || 0,
      notes: String(patch?.notes || current?.notes || "").trim(),
      createdAt,
      updatedAt,
      createdByUid: current?.createdByUid || String(actorUid || "").trim(),
      updatedByUid: String(actorUid || current?.updatedByUid || "").trim(),
    };

    if (!payload.cellId || !payload.name) {
      throw new Error("Visitante precisa de celula e nome.");
    }

    await ref.set(payload, { merge: true });
    return normalizeVisitor(ref.id, payload);
  }

  async function saveAlert(patch, actorUid) {
    initialize();
    if (!api.db) {
      throw new Error("Firestore indisponivel na Renovo+.");
    }

    const requestedId = String(patch?.id || "").trim();
    const ref = requestedId
      ? api.db.collection(COLLECTIONS.alerts).doc(requestedId)
      : api.db.collection(COLLECTIONS.alerts).doc();

    const currentSnapshot = requestedId ? await ref.get() : null;
    const current = currentSnapshot?.exists ? normalizeAlert(currentSnapshot.id, currentSnapshot.data()) : null;
    const now = new Date().toISOString();
    const createdAt = current?.createdAt || String(patch?.createdAt || now).trim() || now;
    const updatedAt = current
      ? now
      : String(patch?.updatedAt || patch?.createdAt || now).trim() || now;
    const payload = {
      id: ref.id,
      cellId: String(patch?.cellId || current?.cellId || "").trim(),
      type: String(patch?.type || current?.type || "care").trim() || "care",
      severity: String(patch?.severity || current?.severity || "warn").trim() || "warn",
      status: String(patch?.status || current?.status || "open").trim() || "open",
      title: String(patch?.title || current?.title || "").trim(),
      summary: String(patch?.summary || current?.summary || "").trim(),
      ownerUid: String(patch?.ownerUid || current?.ownerUid || "").trim(),
      dueAt: String(patch?.dueAt || current?.dueAt || "").trim(),
      notes: String(patch?.notes || current?.notes || "").trim(),
      createdAt,
      updatedAt,
      createdByUid: current?.createdByUid || String(actorUid || "").trim(),
      updatedByUid: String(actorUid || current?.updatedByUid || "").trim(),
    };

    if (!payload.cellId || !payload.title) {
      throw new Error("Alerta precisa de celula e titulo.");
    }

    await ref.set(payload, { merge: true });
    return normalizeAlert(ref.id, payload);
  }

  async function listAccessibleVisitors(profile, limit = 200) {
    initialize();
    if (!api.db || !profile) {
      return [];
    }

    if (hasPastoralAccess(profile)) {
      const snapshot = await api.db.collection(COLLECTIONS.visitors).limit(limit).get();
      return snapshot.docs
        .map((doc) => normalizeVisitor(doc.id, doc.data()))
        .filter(Boolean)
        .sort((a, b) => String(b.lastVisitAt || b.createdAt || "").localeCompare(String(a.lastVisitAt || a.createdAt || "")));
    }

    const allowedIds = new Set(
      [profile.primaryCellId, ...(Array.isArray(profile.scopeCellIds) ? profile.scopeCellIds : [])]
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    );

    if (!allowedIds.size) {
      return [];
    }

    const snapshots = await Promise.all(
      Array.from(allowedIds).map((cellId) =>
        api.db.collection(COLLECTIONS.visitors).where("cellId", "==", cellId).limit(limit).get()
      )
    );

    return snapshots
      .flatMap((snapshot) => snapshot.docs)
      .map((doc) => normalizeVisitor(doc.id, doc.data()))
      .filter(Boolean)
      .filter((visitor) => allowedIds.has(visitor.cellId))
      .sort((a, b) => String(b.lastVisitAt || b.createdAt || "").localeCompare(String(a.lastVisitAt || a.createdAt || "")));
  }

  async function listAccessibleAlerts(profile, limit = 200) {
    initialize();
    if (!api.db || !profile) {
      return [];
    }

    if (hasPastoralAccess(profile)) {
      const snapshot = await api.db.collection(COLLECTIONS.alerts).limit(limit).get();
      return snapshot.docs
        .map((doc) => normalizeAlert(doc.id, doc.data()))
        .filter(Boolean)
        .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
    }

    const allowedIds = new Set(
      [profile.primaryCellId, ...(Array.isArray(profile.scopeCellIds) ? profile.scopeCellIds : [])]
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    );

    if (!allowedIds.size) {
      return [];
    }

    const snapshots = await Promise.all(
      Array.from(allowedIds).map((cellId) =>
        api.db.collection(COLLECTIONS.alerts).where("cellId", "==", cellId).limit(limit).get()
      )
    );

    return snapshots
      .flatMap((snapshot) => snapshot.docs)
      .map((doc) => normalizeAlert(doc.id, doc.data()))
      .filter(Boolean)
      .filter((alert) => allowedIds.has(alert.cellId))
      .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
  }

  async function listAccessibleReports(profile, limit = 200) {
    initialize();
    if (!api.db || !profile) {
      return [];
    }

    if (hasPastoralAccess(profile)) {
      const snapshot = await api.db.collection(COLLECTIONS.reports).limit(limit).get();
      const reports = snapshot.docs
        .map((doc) => normalizeReport(doc.id, doc.data()))
        .filter(Boolean);
      return reports.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    }

    const allowedIds = new Set(
      [profile.primaryCellId, ...(Array.isArray(profile.scopeCellIds) ? profile.scopeCellIds : [])]
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    );

    if (!allowedIds.size) {
      return [];
    }

    const snapshots = await Promise.all(
      Array.from(allowedIds).map((cellId) =>
        api.db.collection(COLLECTIONS.reports).where("cellId", "==", cellId).limit(limit).get()
      )
    );

    return snapshots
      .flatMap((snapshot) => snapshot.docs)
      .map((doc) => normalizeReport(doc.id, doc.data()))
      .filter(Boolean)
      .filter((report) => allowedIds.has(report.cellId))
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  }

  async function listAccessibleCells(profile) {
    initialize();
    if (!api.db || !profile) {
      return [];
    }

    if (hasPastoralAccess(profile)) {
      return listAllCells(200);
    }

    const allowedIds = new Set(
      [profile.primaryCellId, ...(Array.isArray(profile.scopeCellIds) ? profile.scopeCellIds : [])]
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    );

    if (!allowedIds.size) {
      return [];
    }

    const snapshots = await Promise.all(
      Array.from(allowedIds).map((cellId) => api.db.collection(COLLECTIONS.cells).doc(cellId).get())
    );

    return snapshots
      .filter((doc) => doc.exists)
      .map((doc) => normalizeCell(doc.id, doc.data()))
      .filter(Boolean)
      .filter((cell) => allowedIds.has(String(cell.id || "").trim()))
      .sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || ""), "pt-BR", { sensitivity: "base" }));
  }

  async function listAccessibleMembers(profile, limit = 400) {
    initialize();
    if (!api.db || !profile) {
      return [];
    }

    if (hasPastoralAccess(profile)) {
      const snapshot = await api.db.collection(COLLECTIONS.members).limit(limit).get();
      return snapshot.docs
        .map((doc) => normalizeMember(doc.id, doc.data()))
        .filter(Boolean)
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR", { sensitivity: "base" }));
    }

    const allowedIds = new Set(
      [profile.primaryCellId, ...(Array.isArray(profile.scopeCellIds) ? profile.scopeCellIds : [])]
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    );

    if (!allowedIds.size) {
      return [];
    }

    const snapshots = await Promise.all(
      Array.from(allowedIds).map((cellId) =>
        api.db.collection(COLLECTIONS.members).where("cellId", "==", cellId).limit(limit).get()
      )
    );

    return snapshots
      .flatMap((snapshot) => snapshot.docs)
      .map((doc) => normalizeMember(doc.id, doc.data()))
      .filter(Boolean)
      .filter((member) => allowedIds.has(member.cellId))
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR", { sensitivity: "base" }));
  }

  async function listAllCells(limit = 200) {
    initialize();
    if (!api.db) {
      return [];
    }

    const snapshot = await api.db.collection(COLLECTIONS.cells).orderBy("name", "asc").limit(limit).get();
    return snapshot.docs
      .map((doc) => normalizeCell(doc.id, doc.data()))
      .filter(Boolean);
  }

  async function deleteSnapshotDocs(snapshot) {
    if (!snapshot || snapshot.empty) {
      return 0;
    }

    let batch = api.db.batch();
    let batchSize = 0;
    let deleted = 0;
    const commits = [];

    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
      batchSize += 1;
      deleted += 1;

      if (batchSize >= 350) {
        commits.push(batch.commit());
        batch = api.db.batch();
        batchSize = 0;
      }
    });

    if (batchSize > 0) {
      commits.push(batch.commit());
    }

    await Promise.all(commits);
    return deleted;
  }

  async function deleteMember(memberId) {
    initialize();
    const normalizedId = String(memberId || "").trim();
    if (!normalizedId) {
      throw new Error("Membro invalido para exclusao.");
    }

    await api.db.collection(COLLECTIONS.members).doc(normalizedId).delete();
    return true;
  }

  async function deleteReport(reportId) {
    initialize();
    const normalizedId = String(reportId || "").trim();
    if (!normalizedId) {
      throw new Error("Relatorio invalido para exclusao.");
    }

    await api.db.collection(COLLECTIONS.reports).doc(normalizedId).delete();
    return true;
  }

  async function deleteVisitor(visitorId) {
    initialize();
    const normalizedId = String(visitorId || "").trim();
    if (!normalizedId) {
      throw new Error("Visitante invalido para exclusao.");
    }

    await api.db.collection(COLLECTIONS.visitors).doc(normalizedId).delete();
    return true;
  }

  async function deleteAlert(alertId) {
    initialize();
    const normalizedId = String(alertId || "").trim();
    if (!normalizedId) {
      throw new Error("Alerta invalido para exclusao.");
    }

    await api.db.collection(COLLECTIONS.alerts).doc(normalizedId).delete();
    return true;
  }

  async function deleteStudy(studyId) {
    initialize();
    const normalizedId = String(studyId || "").trim();
    if (!normalizedId) {
      throw new Error("Estudo invalido para exclusao.");
    }

    const ref = api.db.collection(COLLECTIONS.studies).doc(normalizedId);
    const snapshot = await ref.get();
    const current = snapshot.exists ? normalizeStudy(snapshot.id, snapshot.data()) : null;
    if (!current) {
      return false;
    }

    if (current.storagePath && api.storage) {
      try {
        await api.storage.ref(current.storagePath).delete();
      } catch (_) {}
    }

    await ref.delete();
    return true;
  }

  async function cleanupProfilesForDeletedCell(cellId) {
    const normalizedCellId = String(cellId || "").trim();
    if (!normalizedCellId) {
      return 0;
    }

    const [primarySnapshot, scopeSnapshot] = await Promise.all([
      api.db.collection(COLLECTIONS.users).where("primaryCellId", "==", normalizedCellId).get(),
      api.db.collection(COLLECTIONS.users).where("scopeCellIds", "array-contains", normalizedCellId).get(),
    ]);

    const patches = new Map();
    const now = new Date().toISOString();

    primarySnapshot.docs.forEach((doc) => {
      const data = normalizeProfile(doc.id, doc.data());
      if (!data) {
        return;
      }
      patches.set(doc.id, {
        ref: doc.ref,
        payload: {
          primaryCellId: "",
          scopeCellIds: Array.isArray(data.scopeCellIds) ? data.scopeCellIds : [],
          updatedAt: now,
        },
      });
    });

    scopeSnapshot.docs.forEach((doc) => {
      const data = normalizeProfile(doc.id, doc.data());
      if (!data) {
        return;
      }

      const existing = patches.get(doc.id);
      const nextScope = (Array.isArray(data.scopeCellIds) ? data.scopeCellIds : []).filter((entry) => entry !== normalizedCellId);
      if (existing) {
        existing.payload.scopeCellIds = nextScope;
        existing.payload.updatedAt = now;
      } else {
        patches.set(doc.id, {
          ref: doc.ref,
          payload: {
            primaryCellId: data.primaryCellId,
            scopeCellIds: nextScope,
            updatedAt: now,
          },
        });
      }
    });

    if (!patches.size) {
      return 0;
    }

    let batch = api.db.batch();
    let batchSize = 0;
    const commits = [];
    patches.forEach((entry) => {
      batch.set(entry.ref, entry.payload, { merge: true });
      batchSize += 1;
      if (batchSize >= 300) {
        commits.push(batch.commit());
        batch = api.db.batch();
        batchSize = 0;
      }
    });

    if (batchSize > 0) {
      commits.push(batch.commit());
    }

    await Promise.all(commits);
    return patches.size;
  }

  async function deleteCell(cellId) {
    initialize();
    const normalizedId = String(cellId || "").trim();
    if (!normalizedId) {
      throw new Error("Celula invalida para exclusao.");
    }

    const cellRef = api.db.collection(COLLECTIONS.cells).doc(normalizedId);
    const [memberSnapshot, reportSnapshot, visitorSnapshot, alertSnapshot] = await Promise.all([
      api.db.collection(COLLECTIONS.members).where("cellId", "==", normalizedId).get(),
      api.db.collection(COLLECTIONS.reports).where("cellId", "==", normalizedId).get(),
      api.db.collection(COLLECTIONS.visitors).where("cellId", "==", normalizedId).get(),
      api.db.collection(COLLECTIONS.alerts).where("cellId", "==", normalizedId).get(),
    ]);

    await Promise.all([
      deleteSnapshotDocs(memberSnapshot),
      deleteSnapshotDocs(reportSnapshot),
      deleteSnapshotDocs(visitorSnapshot),
      deleteSnapshotDocs(alertSnapshot),
      cleanupProfilesForDeletedCell(normalizedId),
    ]);

    await cellRef.delete();
    return true;
  }

  async function upsertImportedStudy(study, actorUid) {
    initialize();
    const normalizedStudy = normalizeLegacyStudy(study);
    if (!normalizedStudy) {
      return null;
    }

    const downloadUrl = await getImportedStudyDownloadUrl(normalizedStudy);
    if (!downloadUrl) {
      return null;
    }

    const requestedId = String(normalizedStudy.id || "").trim();
    const ref = requestedId
      ? api.db.collection(COLLECTIONS.studies).doc(requestedId)
      : api.db.collection(COLLECTIONS.studies).doc();
    const currentSnapshot = requestedId ? await ref.get() : null;
    const current = currentSnapshot?.exists ? normalizeStudy(currentSnapshot.id, currentSnapshot.data()) : null;
    const now = new Date().toISOString();

    const payload = {
      id: ref.id,
      title: normalizedStudy.title,
      description: normalizedStudy.description || current?.description || "",
      audience: normalizedStudy.audience || current?.audience || "all",
      storagePath: normalizedStudy.storagePath || current?.storagePath || "",
      downloadUrl,
      fileName: normalizedStudy.fileName || current?.fileName || `${normalizedStudy.title}.pdf`,
      createdAt: current?.createdAt || normalizedStudy.createdAt || now,
      updatedAt: current ? now : normalizedStudy.updatedAt || normalizedStudy.createdAt || now,
      createdByUid: current?.createdByUid || String(actorUid || "").trim(),
      updatedByUid: String(actorUid || current?.updatedByUid || "").trim(),
    };

    await ref.set(payload, { merge: true });
    return normalizeStudy(ref.id, payload);
  }

  async function loadLegacySummary() {
    const bundle = await loadLegacyBundle();
    const visitorImport = buildLegacyVisitors(bundle);
    const importableStudies = [];
    let studiesMissingFile = 0;

    for (const study of bundle.studies) {
      const downloadUrl = await getImportedStudyDownloadUrl(study);
      if (downloadUrl) {
        importableStudies.push(study);
      } else {
        studiesMissingFile += 1;
      }
    }

    return {
      cells: bundle.cells.length,
      members: bundle.cells.reduce((sum, cell) => sum + (Array.isArray(cell.members) ? cell.members.length : 0), 0),
      reports: bundle.reports.length,
      visitors: visitorImport.visitors.length,
      unlinkedVisitors: visitorImport.skippedUnlinked,
      studies: importableStudies.length,
      studiesMissingFile,
    };
  }

  async function importLegacyData(actorUid) {
    initialize();
    if (!api.db) {
      throw new Error("Firestore indisponivel para importar a V1.");
    }

    const importedByUid = String(actorUid || api.currentUser?.uid || "").trim();
    const bundle = await loadLegacyBundle();
    const profiles = await listProfiles().catch(() => []);
    const profileIndex = buildProfileNameIndex(profiles);
    const visitorImport = buildLegacyVisitors(bundle);
    const summary = {
      cells: 0,
      members: 0,
      reports: 0,
      visitors: 0,
      studies: 0,
      unlinkedVisitors: visitorImport.skippedUnlinked,
      studiesMissingFile: 0,
    };

    for (const cell of bundle.cells) {
      const leaderUid = pickLeaderUid(cell.leader, profileIndex);
      const notes = [
        cell.leader ? `Lider legado: ${cell.leader}` : "",
        "Importado da V1.",
      ].filter(Boolean).join("\n");

      await saveCell({
        id: cell.id,
        customId: cell.id,
        name: cell.name,
        leaderUid,
        coLeaderUids: [],
        meetingDay: cell.meetingDay,
        meetingTime: cell.meetingTime,
        address: cell.address,
        status: "active",
        notes,
        createdAt: cell.createdAt,
        updatedAt: cell.createdAt,
      }, importedByUid);
      summary.cells += 1;

      for (const member of cell.members) {
        await saveMember({
          id: buildImportedDocId("legacy-member", [cell.id, member.id || member.name]),
          cellId: cell.id,
          name: member.name,
          phone: member.phone,
          roleInCell: "member",
          status: "active",
          joinedAt: "",
          notes: "Importado da V1.",
          createdAt: cell.createdAt,
          updatedAt: cell.createdAt,
        }, importedByUid);
        summary.members += 1;
      }
    }

    for (const report of bundle.reports) {
      await saveReport({
        id: report.id,
        cellId: report.cellId,
        date: report.date,
        leaders: report.leaders,
        host: report.host,
        address: report.address,
        presentCount: Array.isArray(report.presentMemberIds) ? report.presentMemberIds.length : 0,
        visitorsCount: Number(report.visitorsCount || report.visitorDetails?.length || 0) || 0,
        offering: parseLooseNumber(report.offering),
        notes: buildLegacyReportNotes(report),
        createdAt: report.createdAt,
        updatedAt: report.updatedAt || report.createdAt,
      }, importedByUid);
      summary.reports += 1;
    }

    for (const visitor of visitorImport.visitors) {
      await saveVisitor({
        id: visitor.id,
        cellId: visitor.cellId,
        name: visitor.name,
        phone: visitor.phone,
        address: visitor.address,
        origin: visitor.origin,
        context: visitor.context,
        status: visitor.status,
        firstVisitAt: visitor.firstVisitAt,
        lastVisitAt: visitor.lastVisitAt,
        visitCount: visitor.visitCount,
        notes: visitor.notes,
        createdAt: visitor.firstVisitAt,
        updatedAt: visitor.lastVisitAt || visitor.firstVisitAt,
      }, importedByUid);
      summary.visitors += 1;
    }

    for (const study of bundle.studies) {
      const saved = await upsertImportedStudy(study, importedByUid);
      if (saved) {
        summary.studies += 1;
      } else {
        summary.studiesMissingFile += 1;
      }
    }

    return summary;
  }

  async function saveArenaKidsCadastro(data, actorUid) {
    initialize();
    if (!api.db) throw new Error("Firestore indisponivel.");
    const col = "arenaKidsCadastros";
    const ref = data.id ? api.db.collection(col).doc(data.id) : api.db.collection(col).doc();
    const now = new Date().toISOString();
    const doc = {
      id: ref.id,
      nomeCrianca: String(data.nomeCrianca || "").trim(),
      idade: String(data.idade || "").trim(),
      nomeResponsavel: String(data.nomeResponsavel || "").trim(),
      telefone: String(data.telefone || "").trim(),
      endereco: String(data.endereco || "").trim(),
      observacoes: String(data.observacoes || "").trim(),
      criadoEm: data.criadoEm || now,
      criadoPor: String(actorUid || "").trim(),
      igrejaId: String(data.igrejaId || "").trim(),
    };
    await ref.set(doc);
    return doc;
  }

  async function listArenaKidsCadastros() {
    initialize();
    if (!api.db) throw new Error("Firestore indisponivel.");
    const snap = await api.db.collection("arenaKidsCadastros")
      .orderBy("criadoEm", "desc")
      .limit(500)
      .get();
    return snap.docs.map((d) => d.data());
  }

  async function saveVisitanteCulto(data, actorUid) {
    initialize();
    if (!api.db) throw new Error("Firestore indisponivel.");

    const requestedId = String(data.id || "").trim();
    const ref = requestedId
      ? api.db.collection(COLLECTIONS.receptionVisitors).doc(requestedId)
      : api.db.collection(COLLECTIONS.receptionVisitors).doc();
    const legacyRef = api.db.collection("visitantesCulto").doc(ref.id);
    const now = new Date().toISOString();
    const phone = String(data.phone || data.telefone || "").trim();
    const phoneDigits = normalizePhoneDigits(phone);
    const wantsContact = data.wantsContact === false ? false : true;
    const followupStatus = wantsContact && phoneDigits ? "new" : "do_not_contact";
    const doc = {
      id: ref.id,
      name: String(data.name || data.nome || "").trim(),
      phone,
      phoneDigits,
      neighborhood: String(data.neighborhood || data.bairro || "").trim(),
      firstVisit: data.firstVisit === false ? false : true,
      wantsContact,
      prayerRequest: String(data.prayerRequest || data.observacoes || "").trim(),
      followupStatus,
      followupPaused: false,
      assignedCellId: "",
      assignedLeaderUid: "",
      assignedAt: "",
      createdAt: String(data.createdAt || data.criadoEm || now).trim() || now,
      updatedAt: now,
      createdByUid: String(actorUid || "").trim(),
      updatedByUid: String(actorUid || "").trim(),
      churchId: normalizeIgrejaId(data.churchId || data.igrejaId),
    };

    if (!doc.name) {
      throw new Error("Visitante precisa de nome.");
    }

    const visitor = normalizeReceptionVisitor(ref.id, doc);
    const batch = api.db.batch();
    batch.set(ref, doc, { merge: true });
    batch.set(legacyRef, {
      id: ref.id,
      nome: doc.name,
      telefone: doc.phone,
      observacoes: doc.prayerRequest,
      criadoEm: doc.createdAt,
      criadoPor: doc.createdByUid,
      igrejaId: doc.churchId,
    }, { merge: true });

    const followup = buildInitialFollowupPayload(visitor, actorUid, now);
    batch.set(api.db.collection(COLLECTIONS.visitorFollowups).doc(ref.id), followup, { merge: true });

    buildInitialQueuePayloads(visitor, now).forEach((queueItem) => {
      batch.set(api.db.collection(COLLECTIONS.messageQueue).doc(queueItem.id), queueItem, { merge: true });
    });

    await batch.commit();
    return normalizeReceptionVisitor(ref.id, doc);
  }

  async function listVisitantesCulto(churchId) {
    initialize();
    if (!api.db) throw new Error("Firestore indisponivel.");

    const normalizedChurchId = normalizeIgrejaId(churchId);
    const [visitorSnap, legacySnap, queueSnap] = await Promise.all([
      api.db.collection(COLLECTIONS.receptionVisitors)
        .where("churchId", "==", normalizedChurchId)
        .limit(500)
        .get()
        .catch(() => ({ docs: [] })),
      api.db.collection("visitantesCulto")
        .where("igrejaId", "==", normalizedChurchId)
        .limit(500)
        .get()
        .catch(() => ({ docs: [] })),
      api.db.collection(COLLECTIONS.messageQueue)
        .where("churchId", "==", normalizedChurchId)
        .limit(1000)
        .get()
        .catch(() => ({ docs: [] })),
    ]);

    const nextByVisitor = new Map();
    queueSnap.docs
      .map((doc) => normalizeQueueMessage(doc.id, doc.data()))
      .filter(Boolean)
      .filter((item) => item.status === "pending")
      .sort((left, right) => String(left.scheduledAt || "").localeCompare(String(right.scheduledAt || "")))
      .forEach((item) => {
        if (!nextByVisitor.has(item.visitorId)) {
          const step = getTemplateStep(item.templateKey);
          nextByVisitor.set(item.visitorId, {
            ...item,
            label: step?.label || item.templateKey,
          });
        }
      });

    const visitors = new Map();
    visitorSnap.docs.forEach((doc) => {
      const visitor = normalizeReceptionVisitor(doc.id, doc.data());
      if (visitor) {
        visitor.nextMessage = nextByVisitor.get(visitor.id) || null;
        visitors.set(visitor.id, visitor);
      }
    });

    legacySnap.docs.forEach((doc) => {
      if (visitors.has(doc.id)) {
        return;
      }
      const visitor = normalizeReceptionVisitor(doc.id, doc.data());
      if (!visitor || (visitor.churchId !== normalizedChurchId && visitor.churchId !== DEFAULT_IGREJA_ID)) {
        return;
      }
      visitor.legacyOnly = true;
      visitor.nextMessage = nextByVisitor.get(visitor.id) || null;
      visitors.set(visitor.id, visitor);
    });

    return Array.from(visitors.values())
      .sort((a, b) => String(b.createdAt || b.criadoEm || "").localeCompare(String(a.createdAt || a.criadoEm || "")));
  }

  async function listCellsForReception(churchId) {
    initialize();
    if (!api.db) throw new Error("Firestore indisponivel.");

    const normalizedChurchId = normalizeIgrejaId(churchId);
    const snapshot = await api.db.collection(COLLECTIONS.cells).limit(300).get();
    return snapshot.docs
      .map((doc) => normalizeCell(doc.id, doc.data()))
      .filter(Boolean)
      .filter((cell) => {
        const cellChurchId = normalizeIgrejaId(cell.churchId || cell.igrejaId || normalizedChurchId);
        return cellChurchId === normalizedChurchId;
      })
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR", { sensitivity: "base" }));
  }

  async function cancelPendingMessagesForVisitor(visitorId, batch, now, reason) {
    const queueSnap = await api.db.collection(COLLECTIONS.messageQueue)
      .where("visitorId", "==", visitorId)
      .limit(50)
      .get();
    queueSnap.docs.forEach((doc) => {
      const item = normalizeQueueMessage(doc.id, doc.data());
      if (!item || item.status !== "pending") {
        return;
      }
      batch.update(doc.ref, {
        status: "cancelled",
        lastError: reason || "",
        updatedAt: now,
      });
    });
  }

  async function updateReceptionVisitorStatus(visitorId, patch, actorUid) {
    initialize();
    if (!api.db) throw new Error("Firestore indisponivel.");

    const normalizedId = String(visitorId || "").trim();
    if (!normalizedId) {
      throw new Error("Visitante invalido.");
    }

    const now = new Date().toISOString();
    const visitorRef = api.db.collection(COLLECTIONS.receptionVisitors).doc(normalizedId);
    const snapshot = await visitorRef.get();
    if (!snapshot.exists) {
      throw new Error("Visitante nao encontrado.");
    }

    const current = normalizeReceptionVisitor(snapshot.id, snapshot.data());
    const status = normalizeFollowupStatus(patch.followupStatus || current.followupStatus);
    const payload = {
      followupStatus: status,
      wantsContact: patch.wantsContact === undefined ? current.wantsContact : patch.wantsContact === true,
      followupPaused: patch.followupPaused === undefined ? current.followupPaused : patch.followupPaused === true,
      updatedAt: now,
      updatedByUid: String(actorUid || "").trim(),
    };
    const batch = api.db.batch();
    batch.update(visitorRef, payload);
    batch.set(api.db.collection(COLLECTIONS.visitorFollowups).doc(normalizedId), {
      id: normalizedId,
      visitorId: normalizedId,
      churchId: current.churchId,
      status: status === "do_not_contact" ? "stopped" : (payload.followupPaused ? "paused" : "active"),
      pausedAt: payload.followupPaused ? now : "",
      stoppedAt: status === "do_not_contact" ? now : "",
      updatedAt: now,
      updatedByUid: String(actorUid || "").trim(),
    }, { merge: true });

    if (status === "do_not_contact" || payload.followupPaused || payload.wantsContact === false) {
      await cancelPendingMessagesForVisitor(normalizedId, batch, now, "Cancelado pela Recepcao.");
    }

    await batch.commit();
    return true;
  }

  async function assignReceptionVisitorToCell(visitorId, options, actorUid) {
    initialize();
    if (!api.db) throw new Error("Firestore indisponivel.");

    const normalizedId = String(visitorId || "").trim();
    if (!normalizedId) {
      throw new Error("Visitante invalido.");
    }

    const visitorRef = api.db.collection(COLLECTIONS.receptionVisitors).doc(normalizedId);
    const visitorSnap = await visitorRef.get();
    const visitor = visitorSnap.exists ? normalizeReceptionVisitor(visitorSnap.id, visitorSnap.data()) : null;
    if (!visitor) {
      throw new Error("Visitante nao encontrado.");
    }

    const cells = await listCellsForReception(visitor.churchId);
    const requestedCellId = String(options?.cellId || "").trim();
    const neighborhoodKey = normalizeLookup(visitor.neighborhood);
    let targetCell = requestedCellId ? cells.find((cell) => cell.id === requestedCellId) : null;
    if (!targetCell && neighborhoodKey) {
      targetCell = cells.find((cell) => {
        const cellAddress = normalizeLookup(cell.address || cell.name);
        return cellAddress.includes(neighborhoodKey) || neighborhoodKey.includes(cellAddress);
      });
    }
    if (!targetCell) {
      targetCell = cells.find((cell) => cell.status !== "inactive") || cells[0] || null;
    }
    if (!targetCell) {
      throw new Error("Nenhuma celula disponivel para encaminhar.");
    }

    const now = new Date().toISOString();
    const leaderName = getLeaderNameFromCell(targetCell);
    const assignmentId = `${visitor.id}_${targetCell.id}`;
    const assignment = {
      id: assignmentId,
      visitorId: visitor.id,
      visitorName: visitor.name,
      visitorPhone: visitor.phone,
      cellId: targetCell.id,
      cellName: targetCell.name,
      leaderUid: String(targetCell.leaderUid || "").trim(),
      leaderName,
      churchId: visitor.churchId,
      assignedAt: now,
      assignedByUid: String(actorUid || "").trim(),
      status: "active",
      notes: visitor.prayerRequest ? `Pedido de oracao: ${visitor.prayerRequest}` : "",
      createdAt: now,
      updatedAt: now,
    };
    const cellVisitorId = `recepcao-${visitor.id}`;
    const cellVisitor = {
      id: cellVisitorId,
      cellId: targetCell.id,
      name: visitor.name,
      phone: visitor.phone,
      churchId: visitor.churchId,
      address: visitor.neighborhood,
      origin: "Recepcao",
      context: visitor.prayerRequest,
      status: visitor.firstVisit ? "new" : "returning",
      firstVisitAt: String(visitor.createdAt || now).slice(0, 10),
      lastVisitAt: String(visitor.createdAt || now).slice(0, 10),
      visitCount: 1,
      notes: "Encaminhado pela Recepcao.",
      createdAt: now,
      updatedAt: now,
      createdByUid: String(actorUid || "").trim(),
      updatedByUid: String(actorUid || "").trim(),
    };

    const batch = api.db.batch();
    batch.set(api.db.collection(COLLECTIONS.cellAssignments).doc(assignmentId), assignment, { merge: true });
    batch.set(api.db.collection(COLLECTIONS.visitors).doc(cellVisitorId), cellVisitor, { merge: true });
    batch.update(visitorRef, {
      followupStatus: "assigned_to_cell",
      assignedCellId: targetCell.id,
      assignedLeaderUid: assignment.leaderUid,
      assignedAt: now,
      followupPaused: true,
      updatedAt: now,
      updatedByUid: String(actorUid || "").trim(),
    });
    batch.set(api.db.collection(COLLECTIONS.visitorFollowups).doc(visitor.id), {
      id: visitor.id,
      visitorId: visitor.id,
      churchId: visitor.churchId,
      status: "completed",
      completedAt: now,
      updatedAt: now,
      updatedByUid: String(actorUid || "").trim(),
    }, { merge: true });
    await cancelPendingMessagesForVisitor(visitor.id, batch, now, "Visitante encaminhado para celula.");
    await batch.commit();
    return assignment;
  }

  function getLeaderNameFromCell(cell) {
    const notes = String(cell?.notes || "");
    const match = notes.match(/^Lider:\s*(.+?)(?:\n|$)/im);
    return match ? match[1].trim() : "";
  }

  window.renovoPlusFirebase = {
    initialize,
    waitForAuthReady,
    observeAuth,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    sendPasswordReset,
    loadBannerHome,
    saveBannerHome,
    loadUserProfile,
    listProfiles,
    hasAnyProfiles,
    saveUserProfile,
    saveFcmToken,
    provisionManagedAccess,
    claimInitialAdminProfile,
    saveCell,
    saveMember,
    saveReport,
    saveStudy,
    saveVisitor,
    saveAlert,
    deleteCell,
    deleteMember,
    deleteReport,
    deleteStudy,
    deleteVisitor,
    deleteAlert,
    listAccessibleCells,
    listAccessibleMembers,
    listAccessibleReports,
    listAccessibleStudies,
    listAccessibleVisitors,
    listAccessibleAlerts,
    listAllCells,
    loadLegacySummary,
    importLegacyData,
    saveArenaKidsCadastro,
    listArenaKidsCadastros,
    saveVisitanteCulto,
    listVisitantesCulto,
    listCellsForReception,
    updateReceptionVisitorStatus,
    assignReceptionVisitorToCell,
    get collections() {
      return COLLECTIONS;
    },
    get currentUser() {
      return api.currentUser;
    },
    get db() {
      initialize();
      return api.db;
    },
    get storage() {
      initialize();
      return api.storage;
    },
    get messaging() {
      initialize();
      return api.messaging;
    },
  };

  try {
    initialize();
  } catch (error) {
    console.warn("[Renovo+] Firebase:", error?.message || error);
  }
})();
