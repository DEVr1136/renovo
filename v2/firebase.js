/* Renovo v2 Firebase bridge with graceful fallback */
(function () {
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyAkVidPhtpX-o2gGlvTkdbYLQ7CJmMl3fs",
    authDomain: "ambiente-renovo.firebaseapp.com",
    projectId: "ambiente-renovo",
    storageBucket: "ambiente-renovo.firebasestorage.app",
    messagingSenderId: "520918200219",
    appId: "1:520918200219:web:318dfff7bf0060318abb3e",
  };

  function buildResult(status, detail, extra) {
    return Object.assign({ status, detail, db: null }, extra || {});
  }

  async function init() {
    if (!window.firebase || typeof window.firebase.initializeApp !== "function") {
      return buildResult("warn", "SDK do Firebase nao carregou. A v2 segue em modo local.");
    }

    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(FIREBASE_CONFIG);
      }
    } catch (error) {
      return buildResult("danger", "Falha ao iniciar Firebase: " + (error?.message || error));
    }

    if (typeof firebase.firestore !== "function") {
      return buildResult("warn", "Firebase ativo, mas Firestore nao esta disponivel.");
    }

    try {
      const db = firebase.firestore();
      return buildResult("ok", "Firebase e Firestore iniciados com fallback seguro.", { db });
    } catch (error) {
      return buildResult("warn", "Firestore nao respondeu. A base segue em modo local.");
    }
  }

  async function loadUsers() {
    const base = await init();
    if (!base.db) {
      return Object.assign({}, base, { users: [] });
    }

    try {
      const snapshot = await base.db.collection("renovo").doc("users").get();
      const data = snapshot.exists ? snapshot.data() : null;
      const users = data && Array.isArray(data.list) ? data.list : [];
      return buildResult("ok", users.length ? "Usuarios carregados do Firestore." : "Nenhum usuario remoto encontrado.", {
        db: base.db,
        users,
      });
    } catch (error) {
      return buildResult("warn", "Nao foi possivel carregar usuarios remotos. Seguindo com fallback local.", {
        db: base.db,
        users: [],
      });
    }
  }

  async function loadStateSummary() {
    const base = await init();
    if (!base.db) {
      return Object.assign({}, base, { state: null, visitantes: [] });
    }

    try {
      const [stateDoc, visitantesDoc] = await Promise.all([
        base.db.collection("renovo").doc("state").get(),
        base.db.collection("renovo").doc("visitantes").get(),
      ]);

      return buildResult("ok", "Resumo remoto carregado com sucesso.", {
        db: base.db,
        state: stateDoc.exists ? stateDoc.data() : null,
        visitantes: visitantesDoc.exists ? (visitantesDoc.data().list || []) : [],
      });
    } catch (error) {
      return buildResult("warn", "Nao foi possivel carregar o resumo remoto. Seguindo com fallback local.", {
        db: base.db,
        state: null,
        visitantes: [],
      });
    }
  }

  async function loadFullState() {
    const base = await init();
    if (!base.db) {
      return Object.assign({}, base, { state: null });
    }

    try {
      const stateDoc = await base.db.collection("renovo").doc("state").get();
      return buildResult("ok", stateDoc.exists ? "Estado remoto carregado." : "Estado remoto vazio.", {
        db: base.db,
        state: stateDoc.exists ? stateDoc.data() : null,
      });
    } catch (error) {
      return buildResult("warn", "Nao foi possivel carregar o estado remoto completo.", {
        db: base.db,
        state: null,
      });
    }
  }

  async function saveState(nextState) {
    const base = await init();
    if (!base.db) {
      return buildResult("warn", "Firestore indisponivel para salvar o estado.");
    }

    try {
      const stateToSave = {
        cells: Array.isArray(nextState?.cells) ? nextState.cells : [],
        reports: Array.isArray(nextState?.reports)
          ? nextState.reports.map((report) => Object.assign({}, report, { images: [] }))
          : [],
        studies: Array.isArray(nextState?.studies)
          ? nextState.studies.map((study) => Object.assign({}, study, { pdfDataUrl: "" }))
          : [],
        lastReportId: typeof nextState?.lastReportId === "string" ? nextState.lastReportId : null,
      };

      await base.db.collection("renovo").doc("state").set(stateToSave);
      return buildResult("ok", "Estado salvo no Firestore.");
    } catch (error) {
      return buildResult("warn", "Falha ao salvar estado remoto. Os dados seguem ao menos no local.", {
        error,
      });
    }
  }

  async function saveUsers(nextUsers) {
    const base = await init();
    if (!base.db) {
      return buildResult("warn", "Firestore indisponivel para salvar usuarios.");
    }

    try {
      await base.db.collection("renovo").doc("users").set({ list: Array.isArray(nextUsers) ? nextUsers : [] });
      return buildResult("ok", "Usuarios salvos no Firestore.");
    } catch (error) {
      return buildResult("warn", "Falha ao salvar usuarios remotos. Os dados seguem ao menos no local.", {
        error,
      });
    }
  }

  window.RenovoV2Firebase = {
    init,
    loadUsers,
    loadStateSummary,
    loadFullState,
    saveState,
    saveUsers,
  };
})();
