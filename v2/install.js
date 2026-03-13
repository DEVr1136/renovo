const installButton = document.getElementById("install-button");
const installStatus = document.getElementById("install-status");

let deferredPrompt = null;

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredPrompt = event;
  installButton.hidden = false;
  setStatus("Instalacao pronta. Toque no botao para continuar.");
});

window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  installButton.hidden = true;
  setStatus("Aplicativo instalado com sucesso.");
});

installButton?.addEventListener("click", async () => {
  if (!deferredPrompt) {
    setStatus("Instalacao manual necessaria. Abra o menu do navegador.");
    return;
  }

  deferredPrompt.prompt();
  const result = await deferredPrompt.userChoice;

  if (result.outcome === "accepted") {
    setStatus("Instalacao aceita. Aguarde a conclusao do navegador.");
  } else {
    setStatus("Instalacao cancelada. Voce pode tentar novamente.");
  }

  deferredPrompt = null;
  installButton.hidden = true;
});

if (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true) {
  installButton.hidden = true;
  setStatus("Este app ja esta instalado neste dispositivo.");
}

window.setTimeout(() => {
  if (!deferredPrompt && !window.matchMedia("(display-mode: standalone)").matches) {
    installButton.hidden = false;
    setStatus("Se o botao nao funcionar, instale manualmente pelo menu do navegador.");
  }
}, 1400);

function setStatus(message) {
  if (installStatus) {
    installStatus.textContent = message;
  }
}
