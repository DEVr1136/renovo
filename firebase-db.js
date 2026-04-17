/* firebase-db.js - integracao Firestore para o Ambiente Renovo */
(function () {
  function installOfflineFallbacks() {
    window.fsLoadAll = async function () {
      return { state: null, cells: null, reports: null, users: null, visitantes: null };
    };

    window.fsSaveState = function () {};
    window.fsSaveCells = function () {};
    window.fsSaveReports = async function () {};
    window.fsSaveReport = async function () {};
    window.fsDeleteReport = async function () {};
    window.fsDeleteReportsByCell = async function () {};
    window.fsSaveUsers = function () {};
    window.fsSaveVisitantes = function () {};
    window.fsUploadStudyPdf = async function () {
      throw new Error("storage_unavailable");
    };
    window.fsDeleteStudyPdf = async function () {};
  }

  if (!window.firebase || typeof window.firebase.initializeApp !== "function") {
    console.warn("[Firebase] SDK indisponivel. Aplicacao seguira com localStorage.");
    installOfflineFallbacks();
    return;
  }

  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyAkVidPhtpX-o2gGlvTkdbYlQ7CJmMl3fs",
    authDomain: "ambiente-renovo.firebaseapp.com",
    projectId: "ambiente-renovo",
    storageBucket: "ambiente-renovo.firebasestorage.app",
    messagingSenderId: "520918200219",
    appId: "1:520918200219:web:318dfff7bf0060318abb3e",
  };

  try {
    firebase.initializeApp(FIREBASE_CONFIG);
  } catch (_) {
    // Ja inicializado
  }

  let db = null;
  try {
    db = firebase.firestore();
  } catch (error) {
    console.warn("[Firebase] Firestore indisponivel:", error?.message || error);
    installOfflineFallbacks();
    return;
  }

  let storage = null;
  try {
    storage = typeof firebase.storage === "function" ? firebase.storage() : null;
  } catch (error) {
    console.warn("[Firebase] Storage indisponivel:", error?.message || error);
  }

  const RENOVO_COLLECTION = "renovo";
  const REPORTS_LEGACY_DOC = "reports";
  const REPORTS_META_DOC = "reports_meta";
  const REPORT_DOC_PREFIX = "report__";
  const REPORT_DOC_END = `${REPORT_DOC_PREFIX}\uf8ff`;

  function getRenovoCollection() {
    return db.collection(RENOVO_COLLECTION);
  }

  function getReportsMetaRef() {
    return getRenovoCollection().doc(REPORTS_META_DOC);
  }

  function getReportDocId(reportId) {
    const normalizedId = String(reportId || "").trim();
    return normalizedId ? `${REPORT_DOC_PREFIX}${normalizedId}` : "";
  }

  function getReportDocRef(reportId) {
    const docId = getReportDocId(reportId);
    return docId ? getRenovoCollection().doc(docId) : null;
  }

  function getComparableReportTime(report) {
    const updatedTime = new Date(report?.updatedAt || 0).getTime();
    if (Number.isFinite(updatedTime) && updatedTime > 0) {
      return updatedTime;
    }

    const createdTime = new Date(report?.createdAt || 0).getTime();
    if (Number.isFinite(createdTime) && createdTime > 0) {
      return createdTime;
    }

    return 0;
  }

  function getReportIdentity(report) {
    const id = String(report?.id || "").trim();
    if (id) {
      return `id:${id}`;
    }

    const cellId = String(report?.cellId || "").trim();
    const date = String(report?.date || "").trim();
    return cellId || date ? `cell:${cellId}|${date}` : "";
  }

  function sanitizeReportForRemote(report) {
    if (!report || typeof report !== "object") {
      return null;
    }

    const id = String(report.id || "").trim();
    const cellId = String(report.cellId || "").trim();
    const date = String(report.date || "").trim();
    if (!id || !cellId || !date) {
      return null;
    }

    return Object.assign({}, report, {
      id,
      cellId,
      date,
      images: [],
    });
  }

  async function markReportsStorageMode(reportCount) {
    try {
      await getReportsMetaRef().set(
        {
          storageMode: "per_doc",
          migratedAt: new Date().toISOString(),
          reportCount: Number.isFinite(reportCount) ? reportCount : null,
        },
        { merge: true }
      );
    } catch (error) {
      console.warn("[Firebase] reportsMeta:", error?.message || error);
    }
  }

  async function loadPerDocReports() {
    const documentId = firebase.firestore.FieldPath.documentId();
    const snapshot = await getRenovoCollection()
      .orderBy(documentId)
      .startAt(REPORT_DOC_PREFIX)
      .endAt(REPORT_DOC_END)
      .get();

    return snapshot.docs
      .map((doc) => sanitizeReportForRemote(doc.data()))
      .filter(Boolean);
  }

  async function upsertReportDoc(report) {
    const payload = sanitizeReportForRemote(report);
    const ref = getReportDocRef(payload?.id);
    if (!payload || !ref) {
      return false;
    }

    try {
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (snapshot.exists) {
          const remotePayload = sanitizeReportForRemote(snapshot.data()) || {};
          if (getComparableReportTime(remotePayload) > getComparableReportTime(payload)) {
            return;
          }
        }

        transaction.set(ref, payload);
      });
      return true;
    } catch (error) {
      console.warn("[Firebase] saveReport:", error?.message || error);
      return false;
    }
  }

  async function ensurePerDocReports(reports) {
    const list = Array.isArray(reports)
      ? reports.map((report) => sanitizeReportForRemote(report)).filter(Boolean)
      : [];

    for (const report of list) {
      const ok = await upsertReportDoc(report);
      if (!ok) {
        return false;
      }
    }

    return true;
  }

  function mergeReports(primaryReports, fallbackReports) {
    const merged = new Map();

    [fallbackReports, primaryReports].forEach((list) => {
      (Array.isArray(list) ? list : []).forEach((report) => {
        const normalized = sanitizeReportForRemote(report);
        if (!normalized) {
          return;
        }

        const key = getReportIdentity(normalized);
        if (!key) {
          return;
        }

        const current = merged.get(key);
        if (!current || getComparableReportTime(normalized) >= getComparableReportTime(current)) {
          merged.set(key, normalized);
        }
      });
    });

    return Array.from(merged.values());
  }

  window.fsLoadAll = async function () {
    try {
      const [stateDoc, cellsDoc, reportsDoc, usersDoc, visitantesDoc, reportsMetaDoc, perDocReports] = await Promise.all([
        getRenovoCollection().doc("state").get(),
        getRenovoCollection().doc("cells").get(),
        getRenovoCollection().doc(REPORTS_LEGACY_DOC).get(),
        getRenovoCollection().doc("users").get(),
        getRenovoCollection().doc("visitantes").get(),
        getReportsMetaRef().get(),
        loadPerDocReports().catch((error) => {
          console.warn("[Firebase] Falha ao carregar relatorios por documento:", error?.message || error);
          return null;
        }),
      ]);

      let cells = null;
      if (cellsDoc.exists) {
        cells = Array.isArray(cellsDoc.data().list) ? cellsDoc.data().list : [];
      } else if (stateDoc.exists && Array.isArray(stateDoc.data().cells)) {
        cells = stateDoc.data().cells;
      }

      let reports = null;
      const hasLegacyReportsSource =
        reportsDoc.exists || (stateDoc.exists && Array.isArray(stateDoc.data().reports));
      const legacyReports = reportsDoc.exists
        ? (Array.isArray(reportsDoc.data().list) ? reportsDoc.data().list : [])
        : (stateDoc.exists && Array.isArray(stateDoc.data().reports) ? stateDoc.data().reports : []);
      const perDocModeReady = reportsMetaDoc.exists && reportsMetaDoc.data()?.storageMode === "per_doc";

      if (perDocModeReady && Array.isArray(perDocReports)) {
        reports = perDocReports;
      } else if ((Array.isArray(perDocReports) && perDocReports.length) || legacyReports.length) {
        reports = mergeReports(Array.isArray(perDocReports) ? perDocReports : [], legacyReports);
        const migrationOk = await ensurePerDocReports(reports);
        if (migrationOk) {
          await markReportsStorageMode(reports.length);
        }
      } else if (perDocModeReady && legacyReports.length) {
        reports = legacyReports;
      } else if (hasLegacyReportsSource) {
        reports = [];
      }

      return {
        state: stateDoc.exists ? stateDoc.data() : null,
        cells,
        reports,
        users: usersDoc.exists ? (usersDoc.data().list || null) : null,
        visitantes: visitantesDoc.exists ? (visitantesDoc.data().list || null) : null,
      };
    } catch (error) {
      console.warn("[Firebase] Falha ao carregar dados:", error?.message || error);
      return { state: null, cells: null, reports: null, users: null, visitantes: null };
    }
  };

  // Save studies + metadata. Cells and reports are persisted separately.
  window.fsSaveState = function (nextState, options) {
    if (!nextState || typeof nextState !== "object") return;
    const syncReports = options?.syncReports === true;

    const stateDoc = {
      studies: Array.isArray(nextState.studies)
        ? nextState.studies.map((s) => Object.assign({}, s, { pdfDataUrl: "" }))
        : [],
      lastReportId: nextState.lastReportId || null,
      updatedAt: nextState.updatedAt || null,
    };

    getRenovoCollection()
      .doc("state")
      .set(stateDoc)
      .catch((error) => console.warn("[Firebase] saveState:", error?.message || error));

    window.fsSaveCells(nextState.cells);
    if (syncReports) {
      window.fsSaveReports(nextState.reports);
    }
  };

  // Cells stay in a dedicated document and are not overwritten by report saves.
  window.fsSaveCells = function (cells) {
    const list = Array.isArray(cells) ? cells : [];
    if (list.length === 0) {
      getRenovoCollection().doc("cells").get().then((snap) => {
        const existing = snap.exists && Array.isArray(snap.data()?.list) ? snap.data().list : [];
        if (existing.length === 0) {
          getRenovoCollection().doc("cells").set({ list: [] })
            .catch((error) => console.warn("[Firebase] saveCells:", error?.message || error));
        }
      }).catch(() => {});
      return;
    }

    getRenovoCollection()
      .doc("cells")
      .set({ list })
      .catch((error) => console.warn("[Firebase] saveCells:", error?.message || error));
  };

  window.fsSaveReports = async function (reports) {
    const list = Array.isArray(reports) ? reports : [];
    if (!list.length) {
      return true;
    }

    const synced = await ensurePerDocReports(list);
    if (synced) {
      await markReportsStorageMode(list.length);
    }
    return synced;
  };

  window.fsSaveReport = async function (report) {
    const saved = await upsertReportDoc(report);
    if (saved) {
      await markReportsStorageMode(null);
    }
    return saved;
  };

  window.fsDeleteReport = async function (reportId) {
    const ref = getReportDocRef(reportId);
    if (!ref) {
      return false;
    }

    try {
      await ref.delete();
      return true;
    } catch (error) {
      console.warn("[Firebase] deleteReport:", error?.message || error);
      return false;
    }
  };

  window.fsDeleteReportsByCell = async function (cellId) {
    const normalizedCellId = String(cellId || "").trim();
    if (!normalizedCellId) {
      return false;
    }

    try {
      const snapshot = await getRenovoCollection()
        .where("cellId", "==", normalizedCellId)
        .get();

      if (snapshot.empty) {
        return true;
      }

      let batch = db.batch();
      let batchSize = 0;
      const commits = [];

      snapshot.docs.forEach((doc) => {
        if (!doc.id.startsWith(REPORT_DOC_PREFIX)) {
          return;
        }

        batch.delete(doc.ref);
        batchSize += 1;

        if (batchSize === 450) {
          commits.push(batch.commit());
          batch = db.batch();
          batchSize = 0;
        }
      });

      if (batchSize > 0) {
        commits.push(batch.commit());
      }

      await Promise.all(commits);
      return true;
    } catch (error) {
      console.warn("[Firebase] deleteReportsByCell:", error?.message || error);
      return false;
    }
  };

  window.fsSaveUsers = function (nextUsers) {
    const list = Array.isArray(nextUsers) ? nextUsers : [];
    if (list.length === 0) {
      getRenovoCollection().doc("users").get().then((snap) => {
        const existing = snap.exists && Array.isArray(snap.data()?.list) ? snap.data().list : [];
        if (existing.length === 0) {
          getRenovoCollection().doc("users").set({ list: [] })
            .catch((error) => console.warn("[Firebase] saveUsers:", error?.message || error));
        }
      }).catch(() => {});
      return;
    }

    getRenovoCollection()
      .doc("users")
      .set({ list })
      .catch((error) => console.warn("[Firebase] saveUsers:", error?.message || error));
  };

  window.fsSaveVisitantes = function (list) {
    getRenovoCollection()
      .doc("visitantes")
      .set({ list })
      .catch((error) => console.warn("[Firebase] saveVisitantes:", error?.message || error));
  };

  function sanitizeFileName(fileName) {
    return String(fileName || "estudo.pdf")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      || "estudo.pdf";
  }

  window.fsUploadStudyPdf = async function (file, studyId) {
    if (!storage) {
      throw new Error("storage_unavailable");
    }

    const safeStudyId = String(studyId || "study").replace(/[^a-zA-Z0-9_-]+/g, "-");
    const fileName = sanitizeFileName(file?.name);
    const storagePath = `studies/${safeStudyId}/${Date.now()}-${fileName}`;
    const ref = storage.ref().child(storagePath);
    try {
      await ref.put(file, { contentType: "application/pdf" });
      const pdfUrl = await ref.getDownloadURL();
      return { pdfUrl, storagePath };
    } catch (error) {
      const code = String(error?.code || "");
      if (code.includes("unauthorized")) {
        throw new Error("Sem permissao no Firebase Storage para enviar PDF.");
      }
      if (code.includes("canceled")) {
        throw new Error("Envio do PDF cancelado.");
      }
      throw new Error(error?.message || "Falha ao enviar PDF para o Firebase Storage.");
    }
  };

  window.fsDeleteStudyPdf = async function (storagePath) {
    if (!storage || !storagePath) {
      return;
    }

    try {
      await storage.ref().child(String(storagePath)).delete();
    } catch (error) {
      console.warn("[Firebase] deleteStudyPdf:", error?.message || error);
    }
  };
})();
