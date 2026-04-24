import { useEffect, useState } from 'react';

const INSTALL_PROMPT_DISMISSED_KEY = 'install-prompt:dismissed';

const isStandaloneMode = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

const isIosSafari = () => {
  const ua = window.navigator.userAgent || '';
  const isIos = /iPad|iPhone|iPod/.test(ua);
  const isWebkit = /WebKit/.test(ua);
  const isCriOS = /CriOS/.test(ua);
  return isIos && isWebkit && !isCriOS;
};

const getInitialPromptState = () => {
  if (typeof window === 'undefined') {
    return { showPrompt: false, iosMode: false };
  }

  const dismissed = window.sessionStorage.getItem(INSTALL_PROMPT_DISMISSED_KEY) === 'true';
  const standalone = isStandaloneMode();
  const ios = isIosSafari();

  return {
    showPrompt: !dismissed && !standalone && ios,
    iosMode: !dismissed && !standalone && ios
  };
};

const InstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [promptState, setPromptState] = useState(getInitialPromptState);
  const { showPrompt, iosMode } = promptState;

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const dismissed = window.sessionStorage.getItem(INSTALL_PROMPT_DISMISSED_KEY) === 'true';
    const standalone = isStandaloneMode();

    document.body.classList.toggle('app-installed', standalone);

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      if (dismissed || isStandaloneMode()) return;

      setDeferredPrompt(event);
      setPromptState({ showPrompt: true, iosMode: false });
    };

    const handleInstalled = () => {
      setDeferredPrompt(null);
      setPromptState({ showPrompt: false, iosMode: false });
      document.body.classList.add('app-installed');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const dismissPrompt = () => {
    window.sessionStorage.setItem(INSTALL_PROMPT_DISMISSED_KEY, 'true');
    setPromptState((current) => ({ ...current, showPrompt: false }));
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;

    if (choice?.outcome !== 'accepted') {
      setPromptState((current) => ({ ...current, showPrompt: true }));
      return;
    }

    setDeferredPrompt(null);
    setPromptState((current) => ({ ...current, showPrompt: false }));
  };

  if (!showPrompt) return null;

  return (
    <div className="install-prompt" role="dialog" aria-live="polite" aria-label="Install Tripsplit">
      <div className="install-prompt-header">
        <img
          className="install-prompt-icon"
          src="/icons/icon-192.svg"
          alt="Tripsplit app icon"
          width="44"
          height="44"
        />
        <div>
          <div className="install-prompt-title">Install Tripsplit</div>
          <div className="install-prompt-copy">
            {iosMode
              ? 'Open the Share menu in Safari, then tap "Add to Home Screen" to use Tripsplit like an app.'
              : 'Add Tripsplit to your home screen for a faster, full-screen mobile experience.'}
          </div>
        </div>
      </div>

      <div className="install-prompt-actions">
        <button type="button" className="btn btn-ghost" onClick={dismissPrompt}>
          Maybe later
        </button>
        {!iosMode && deferredPrompt ? (
          <button type="button" className="btn btn-primary" onClick={handleInstall}>
            Install app
          </button>
        ) : null}
      </div>
    </div>
  );
};

export default InstallPrompt;
