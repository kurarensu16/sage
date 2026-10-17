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
  if (!import.meta.env.PROD) return;

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
