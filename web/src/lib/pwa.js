// Small helper around the browser's install ("Add to Home Screen") flow.
// The `beforeinstallprompt` event can fire before any React component mounts, so
// we capture it at module load and let components subscribe to changes.
let deferred = null;
const listeners = new Set();

export function initPwa() {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // stop Chrome's mini-infobar; we show our own button
    deferred = e;
    listeners.forEach((fn) => fn(true));
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((fn) => fn(false));
  });
}

export function canInstall() {
  return !!deferred;
}

// Subscribe to installability changes; returns an unsubscribe fn.
export function onInstallChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function promptInstall() {
  if (!deferred) return false;
  deferred.prompt();
  const { outcome } = await deferred.userChoice;
  if (outcome === "accepted") {
    deferred = null;
    listeners.forEach((fn) => fn(false));
  }
  return outcome === "accepted";
}

export function isStandalone() {
  try {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true
    );
  } catch (e) {
    return false;
  }
}

export function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent || "");
}
