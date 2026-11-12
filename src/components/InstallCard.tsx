"use client";

import { useEffect, useState } from "react";

type InstallPrompt = Event & { prompt: () => Promise<void> };

export function InstallCard() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    setInstalled(standalone);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js");
    }
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (installed) return <p className="quiet">TRIDs is installed on this phone.</p>;

  return (
    <div className="install">
      <p className="menu-label">Install</p>
      <p className="quiet">
        Add TRIDs to your home screen. It opens full screen on Android and iPhone. Apple does not allow an unsigned
        install file, so iPhone uses Add to Home Screen.
      </p>
      {prompt ? (
        <button
          type="button"
          className="primary"
          onClick={() => {
            void prompt.prompt();
            setPrompt(null);
          }}
        >
          Install app
        </button>
      ) : null}
      {ios ? (
        <ol className="install-steps">
          <li>Open this page in Safari.</li>
          <li>Tap the Share button.</li>
          <li>Tap Add to Home Screen, then Add.</li>
        </ol>
      ) : (
        <p className="quiet">On Android, use Install app above, or the browser menu and choose Install app.</p>
      )}
    </div>
  );
}
