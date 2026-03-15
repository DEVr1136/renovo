/* firebase-db.js - integracao Firestore para o Ambiente Renovo */
(function () {
  function installOfflineFallbacks() {
    window.fsLoadAll = async function () {
      return { state: null, users: null, visitantes: null };
    };

    window.fsSaveState = function () {};
    window.fsSaveUsers = function () {};
    window.fsSaveVisitantes = function () {};
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
})();
