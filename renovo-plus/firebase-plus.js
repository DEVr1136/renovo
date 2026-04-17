/* firebase-plus.js - fundacao Firebase da Renovo+ */
(function () {
  const COLLECTIONS = {
    users: "renovo_plus_users",
    meta: "renovo_plus_meta",
    cells: "renovo_plus_cells",
    members: "renovo_plus_members",
    reports: "renovo_plus_reports",
    studies: "renovo_plus_studies",
    visitors: "renovo_plus_visitors",
    alerts: "renovo_plus_alerts",
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
    if (["leader", "coordinator", "pastor", "admin"].includes(value)) {
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

    return {
      id: String(data.id || docId).trim(),
      cellId: String(data.cellId || "").trim(),
      date: String(data.date || "").trim(),
      leaders: String(data.leaders || "").trim(),
      host: String(data.host || "").trim(),
      address: String(data.address || "").trim(),
      presentCount: Number(data.presentCount || 0) || 0,
      visitorsCount: Number(data.visitorsCount || 0) || 0,
      offering: Number.isFinite(offeringNumber) ? offeringNumber : 0,
      notes: String(data.notes || "").trim(),
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
    return api.auth.signInWithEmailAndPassword(String(email || "").trim(), String(password || ""));
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

  async function listProfiles() {
    initialize();
    if (!api.db) {
      return [];
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
    const payload = {
      name: String(patch?.name || current?.name || "").trim(),
      email: String(patch?.email || current?.email || "").trim(),
      role: normalizeRole(patch?.role || current?.role),
      status: normalizeStatus(patch?.status || current?.status),
      primaryCellId: String(patch?.primaryCellId || current?.primaryCellId || "").trim(),
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
      createdAt: current?.createdAt || now,
      updatedAt: now,
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
    const payload = {
      id: ref.id,
      cellId: String(patch?.cellId || current?.cellId || "").trim(),
      name: String(patch?.name || current?.name || "").trim(),
      phone: String(patch?.phone || current?.phone || "").trim(),
      roleInCell: String(patch?.roleInCell || current?.roleInCell || "member").trim() || "member",
      status: String(patch?.status || current?.status || "active").trim() || "active",
      joinedAt: String(patch?.joinedAt || current?.joinedAt || "").trim(),
      notes: String(patch?.notes || current?.notes || "").trim(),
      createdAt: current?.createdAt || now,
      updatedAt: now,
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
    const ref = requestedId
      ? api.db.collection(COLLECTIONS.reports).doc(requestedId)
      : api.db.collection(COLLECTIONS.reports).doc();

    const currentSnapshot = requestedId ? await ref.get() : null;
    const current = currentSnapshot?.exists ? normalizeReport(currentSnapshot.id, currentSnapshot.data()) : null;
    const now = new Date().toISOString();
    const presentCount = Number(patch?.presentCount);
    const visitorsCount = Number(patch?.visitorsCount);
    const offering = Number(patch?.offering);

    const payload = {
      id: ref.id,
      cellId: String(patch?.cellId || current?.cellId || "").trim(),
      date: String(patch?.date || current?.date || "").trim(),
      leaders: String(patch?.leaders || current?.leaders || "").trim(),
      host: String(patch?.host || current?.host || "").trim(),
      address: String(patch?.address || current?.address || "").trim(),
      presentCount: Number.isFinite(presentCount) ? presentCount : Number(current?.presentCount || 0) || 0,
      visitorsCount: Number.isFinite(visitorsCount) ? visitorsCount : Number(current?.visitorsCount || 0) || 0,
      offering: Number.isFinite(offering) ? offering : Number(current?.offering || 0) || 0,
      notes: String(patch?.notes || current?.notes || "").trim(),
      createdAt: current?.createdAt || now,
      updatedAt: now,
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
      createdAt: current?.createdAt || now,
      updatedAt: now,
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
      createdAt: current?.createdAt || now,
      updatedAt: now,
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
      createdAt: current?.createdAt || now,
      updatedAt: now,
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

    if (profile.role === "admin" || profile.role === "pastor") {
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

    if (profile.role === "admin" || profile.role === "pastor") {
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

    if (profile.role === "admin" || profile.role === "pastor") {
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

    if (profile.role === "admin" || profile.role === "pastor") {
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

    if (profile.role === "admin" || profile.role === "pastor") {
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

  window.renovoPlusFirebase = {
    initialize,
    waitForAuthReady,
    observeAuth,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    loadUserProfile,
    listProfiles,
    hasAnyProfiles,
    saveUserProfile,
    claimInitialAdminProfile,
    saveCell,
    saveMember,
    saveReport,
    saveStudy,
    saveVisitor,
    saveAlert,
    listAccessibleCells,
    listAccessibleMembers,
    listAccessibleReports,
    listAccessibleStudies,
    listAccessibleVisitors,
    listAccessibleAlerts,
    listAllCells,
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
  };

  try {
    initialize();
  } catch (error) {
    console.warn("[Renovo+] Firebase:", error?.message || error);
  }
})();
