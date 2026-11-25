(() => {
  function placeHelp(hud) {
    const help = hud.querySelector('#b-help');
    const language = hud.querySelector('#b-lang');
    if (help && language && help.parentElement !== language.parentElement) {
      help.setAttribute('aria-label', help.title);
      language.before(help);
    }
  }

  function watchHud(hud) {
    placeHelp(hud);
    new MutationObserver(() => placeHelp(hud)).observe(hud, { childList: true });
  }

  const hud = document.getElementById('ui');
  if (hud) {
    watchHud(hud);
  } else {
    const startup = new MutationObserver(() => {
      const builtHud = document.getElementById('ui');
      if (builtHud) {
        startup.disconnect();
        watchHud(builtHud);
      }
    });
    startup.observe(document.body, { childList: true });
  }

  const app = document.getElementById('app');
  const startupMessage = new MutationObserver(() => {
    const message = app.querySelector('[role="alert"] p');
    if (!app.classList.contains('startup-error') || !message) return;

    startupMessage.disconnect();
    const chinese = /[\u3400-\u9fff]/.test(message.textContent);
    message.textContent = chinese
      ? 'Windows 应用未能初始化 3D 场景。请重试或重新打开应用。本地存档已保留。'
      : 'The Windows app could not start the 3D scene. Try again or reopen the app. Local saves are preserved.';
  });
  startupMessage.observe(app, { childList: true });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const modal = document.querySelector('#modal-back:not(.hidden)');
    if (modal) {
      const dismiss = modal.querySelector(
        '#modal-actions button:only-child, #modal-actions:has(button.danger:last-child) button:first-child'
      );
      if (dismiss) {
        event.stopPropagation();
        dismiss.click();
      }
      return;
    }

    const menu = document.querySelector('#topbar .file-menu[open]');
    if (!menu) return;

    event.stopPropagation();
    menu.open = false;
    menu.querySelector('summary').focus();
  });
})();
