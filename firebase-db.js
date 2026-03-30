/* firebase-db.js - integracao Firestore para o Ambiente Renovo */
(function () {
  function installOfflineFallbacks() {
    window.fsLoadAll = async function () {
      return { state: null, cells: null, reports: null, users: null, visitantes: null };
    };

    window.fsSaveState = function () {};
    window.fsSaveCells = function () {};
    window.fsSaveReports = function () {};
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
    apiKey: "AIzaSyAkVidPhtpX-o2gGlvTkdbYLQ7CJmMl3fs",
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

  window.fsLoadAll = async function () {
    try {
      const [stateDoc, cellsDoc, reportsDoc, usersDoc, visitantesDoc] = await Promise.all([
        db.collection("renovo").doc("state").get(),
        db.collection("renovo").doc("cells").get(),
        db.collection("renovo").doc("reports").get(),
        db.collection("renovo").doc("users").get(),
        db.collection("renovo").doc("visitantes").get(),
      ]);

      // Cells: prefer dedicated doc; fall back to legacy cells inside state doc
      let cells = null;
      if (cellsDoc.exists) {
        cells = Array.isArray(cellsDoc.data().list) ? cellsDoc.data().list : [];
      } else if (stateDoc.exists && Array.isArray(stateDoc.data().cells)) {
        cells = stateDoc.data().cells; // legacy — migrado no próximo save
      }

      // Reports: prefer dedicated doc; fall back to legacy reports inside state doc
      let reports = null;
      if (reportsDoc.exists) {
        reports = Array.isArray(reportsDoc.data().list) ? reportsDoc.data().list : [];
      } else if (stateDoc.exists && Array.isArray(stateDoc.data().reports)) {
        reports = stateDoc.data().reports; // legacy — migrado no próximo save
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

  // Salva apenas estudos + metadados — células e relatórios têm documentos próprios
  window.fsSaveState = function (nextState) {
    if (!nextState || typeof nextState !== "object") return;

    const stateDoc = {
      studies: Array.isArray(nextState.studies)
        ? nextState.studies.map((s) => Object.assign({}, s, { pdfDataUrl: "" }))
        : [],
      lastReportId: nextState.lastReportId || null,
      updatedAt: nextState.updatedAt || null,
    };
    db.collection("renovo")
      .doc("state")
      .set(stateDoc)
      .catch((error) => console.warn("[Firebase] saveState:", error?.message || error));

    window.fsSaveCells(nextState.cells);
    window.fsSaveReports(nextState.reports);
  };

  // Células em documento separado — nunca sobrescrito por saves de relatório/estudo
  window.fsSaveCells = function (cells) {
    const list = Array.isArray(cells) ? cells : [];
    if (list.length === 0) {
      // Nunca sobrescreve com lista vazia — verifica primeiro se já há dados
      db.collection("renovo").doc("cells").get().then((snap) => {
        const existing = snap.exists && Array.isArray(snap.data()?.list) ? snap.data().list : [];
        if (existing.length === 0) {
          db.collection("renovo").doc("cells").set({ list: [] })
            .catch((error) => console.warn("[Firebase] saveCells:", error?.message || error));
        }
      }).catch(() => {});
      return;
    }
    db.collection("renovo")
      .doc("cells")
      .set({ list })
      .catch((error) => console.warn("[Firebase] saveCells:", error?.message || error));
  };

  window.fsSaveReports = function (reports) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 180);
    const cutoffStr = cutoff.toISOString().slice(0, 10); // "YYYY-MM-DD"

    const list = Array.isArray(reports)
      ? reports
          .filter((r) => !r.date || r.date >= cutoffStr)
          .map((r) => Object.assign({}, r, { images: [] }))
      : [];
    db.collection("renovo")
      .doc("reports")
      .set({ list })
      .catch((error) => console.warn("[Firebase] saveReports:", error?.message || error));
  };

  window.fsSaveUsers = function (nextUsers) {
    db.collection("renovo")
      .doc("users")
      .set({ list: nextUsers })
      .catch((error) => console.warn("[Firebase] saveUsers:", error?.message || error));
  };

  window.fsSaveVisitantes = function (list) {
    db.collection("renovo")
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
