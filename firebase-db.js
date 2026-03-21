/* firebase-db.js - integracao Firestore para o Ambiente Renovo */
(function () {
  function installOfflineFallbacks() {
    window.fsLoadAll = async function () {
      return { state: null, users: null, visitantes: null };
    };

    window.fsSaveState = function () {};
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

  function stripHeavyData(state) {
    if (!state || typeof state !== "object") return state;
    const out = Object.assign({}, state);
    if (Array.isArray(out.reports)) {
      out.reports = out.reports.map((report) => Object.assign({}, report, { images: [] }));
    }
    if (Array.isArray(out.studies)) {
      out.studies = out.studies.map((study) => Object.assign({}, study, { pdfDataUrl: "" }));
    }
    return out;
  }

  window.fsLoadAll = async function () {
    try {
      const [stateDoc, usersDoc, visitantesDoc] = await Promise.all([
        db.collection("renovo").doc("state").get(),
        db.collection("renovo").doc("users").get(),
        db.collection("renovo").doc("visitantes").get(),
      ]);

      return {
        state: stateDoc.exists ? stateDoc.data() : null,
        users: usersDoc.exists ? (usersDoc.data().list || null) : null,
        visitantes: visitantesDoc.exists ? (visitantesDoc.data().list || null) : null,
      };
    } catch (error) {
      console.warn("[Firebase] Falha ao carregar dados:", error?.message || error);
      return { state: null, users: null, visitantes: null };
    }
  };

  window.fsSaveState = function (nextState) {
    db.collection("renovo")
      .doc("state")
      .set(stripHeavyData(nextState))
      .catch((error) => console.warn("[Firebase] saveState:", error?.message || error));
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
