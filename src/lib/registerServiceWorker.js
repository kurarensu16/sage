/**
 * Service worker registration and update handling.
 *
 * The worker's cache name carries the build ID (see vite.config.js), so each deploy
 * produces a worker whose bytes differ and which the browser therefore installs. This
 * module makes sure the page does not keep running the superseded build afterwards.
 */

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  // Development is served by Vite with hot module replacement; a worker caching those
  // assets would hand back stale modules and look like the bug this is meant to fix.
  //
  // Returning was not enough. A worker installed by an EARLIER production build --
  // the installed desktop app, a `vite preview`, a deploy -- stays registered on this
  // origin and keeps serving its cached index.html and assets. Dev registers no worker,
  // so the pruning in the worker's own activate handler never runs again and the old
  // cache has no path to being cleared. The symptom is a dev session quietly running the
  // last production bundle: code that no longer exists in src/ still on screen, and
  // every change invisible. Unregister it here, because nothing else will.
  if (!import.meta.env.PROD) {
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(registrations.map((r) => r.unregister())))
      .then((results) => {
        // Only when something was actually removed, so this cannot loop: after the
        // reload there are no registrations left and nothing to clear.
        if (!results.some(Boolean)) return null;
        return caches.keys()
          .then((names) => Promise.all(
            names.filter((n) => n.startsWith('sage-app-')).map((n) => caches.delete(n))
          ))
          .then(() => window.location.reload());
      })
      .catch(() => {
        // A browser that refuses either API in dev is not worth failing startup over.
      });
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        // A worker that activates while a page is already open means this tab is running
        // the previous build's JavaScript. Reload once so the two cannot diverge.
        let reloading = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (reloading) return;
          reloading = true;
          window.location.reload();
        });

        // The browser checks for a new worker on navigation, but a long-lived tab may go
        // days without one. This catches a deploy that lands mid-session.
        setInterval(() => {
          registration.update().catch(() => {
            // Offline or the check failed; the next load will try again.
          });
        }, 60 * 60 * 1000);
      })
      .catch((err) => {
        console.warn('Service worker registration failed:', err);
      });
  });
}
