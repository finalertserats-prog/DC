/**
 * Service Worker – ngrok interstitial bypass
 *
 * After the very first "Visit Site" click (unavoidable on a fresh install),
 * this SW registers and intercepts every subsequent navigation request,
 * injecting the `ngrok-skip-browser-warning` header so the interstitial
 * is never shown again for this origin.
 */

const BYPASS_HEADER = "ngrok-skip-browser-warning";
const BYPASS_VALUE  = "1";

self.addEventListener("install", () => {
  // Activate immediately without waiting for existing tabs to close
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Take control of all existing clients right away
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only intercept navigation requests (HTML page loads).
  // Sub-resources (JS, CSS, images) are already handled by api.ts
  // which adds the header via fetch().
  if (req.mode !== "navigate") return;

  event.respondWith(
    fetch(req.url, {
      method:      req.method,
      credentials: "include",
      headers:     buildHeaders(req.headers),
    }).catch(() => fetch(req)) // fallback to original if fetch fails
  );
});

function buildHeaders(original) {
  const h = new Headers(original);
  h.set(BYPASS_HEADER, BYPASS_VALUE);
  return h;
}
