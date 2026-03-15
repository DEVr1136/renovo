(function () {
  const installButtons = Array.from(document.querySelectorAll("[data-install-app]"));
  const statusEls = Array.from(document.querySelectorAll("[data-install-status]"));
  const hintEls = Array.from(document.querySelectorAll("[data-install-hint]"));
  const ua = navigator.userAgent || "";
  const isIOS = /iphone|ipad|ipod/i.test(ua);
  const isAndroid = /android/i.test(ua);
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
  const query = new URLSearchParams(window.location.search);
  const installFromLink = query.get("install") === "1" || query.get("instalar") === "1";

  let deferredPrompt = null;

  function setStatus(text, tone) {
    statusEls.forEach((el) => {
      el.textContent = text || "";
      el.dataset.tone = tone || "info";
    });
  }

  function setHint(text) {
    hintEls.forEach((el) => {
      el.textContent = text || "";
    });
  }

  function setButtonsVisible(visible) {
    installButtons.forEach((button) => {
      button.hidden = !visible;
      button.disabled = !visible;
    });
  }

  function getFallbackInstructions() {
    if (isIOS) {
      return 'No iPhone: toque em "Compartilhar" e depois em "Adicionar a Tela de Inicio".';
    }
    if (isAndroid) {
      return 'No Android: abra o menu do navegador e toque em "Instalar app" ou "Adicionar a tela inicial".';
    }
    return "Neste navegador, use o menu para instalar ou abrir no Chrome/Edge no celular.";
  }

  async function handleInstallClick() {
    if (!deferredPrompt) {
      setStatus("Instalacao manual necessaria.", "warn");
      setHint(getFallbackInstructions());
      return;
    }

    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setStatus("Instalacao em andamento...", "ok");
      setHint("Se solicitado, confirme a instalacao no navegador.");
    } else {
      setStatus("Instalacao cancelada.", "warn");
      setHint("Voce pode tentar novamente quando quiser.");
    }
    deferredPrompt = null;
    setButtonsVisible(false);
  }

  installButtons.forEach((button) => {
    button.addEventListener("click", handleInstallClick);
  });

  if (isStandalone) {
    setStatus("Aplicativo ja instalado neste dispositivo.", "ok");
    setHint("Abra pelo icone na tela inicial.");
    setButtonsVisible(false);
    return;
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    setButtonsVisible(true);
    setStatus('Pronto para instalar. Toque em "Instalar aplicativo".', "ok");
    setHint("A instalacao precisa de um toque no botao por seguranca do navegador.");

    if (installFromLink && installButtons[0]) {
      installButtons[0].classList.add("install-btn-pulse");
      installButtons[0].scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    setButtonsVisible(false);
    setStatus("Aplicativo instalado com sucesso.", "ok");
    setHint("Procure o icone na tela inicial.");
  });

  window.setTimeout(() => {
    if (!deferredPrompt) {
      setButtonsVisible(installButtons.length > 0);
      setStatus("Instalacao depende do navegador.", "warn");
      setHint(getFallbackInstructions());
    }
  }, 1200);
})();
