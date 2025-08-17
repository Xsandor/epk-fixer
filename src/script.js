// Entrypoint: initialize reporting and import helpers and UI logic
if (!window.__PLAYWRIGHT_TEST__) {
  import("https://esm.run/@sentry/browser").then(Sentry => {
    Sentry.init({
      dsn: "https://34687dbd224e062d40708543ab4ff67a@o106156.ingest.us.sentry.io/4509853489364992"
      // Add more options if needed
    });
  });
}

import "./helper.js";
import "./ui.js";

// Register service worker for PWA installability and offline support
// Only register when served over http(s) — avoid attempting registration when
// the app is opened via file:// during tests which causes WebKit to log
// "Not allowed to load local resource" for absolute paths.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.protocol === 'http:')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      // Registration successful
      console.log('ServiceWorker registered with scope:', reg.scope);
    }).catch(err => {
      console.warn('ServiceWorker registration failed:', err);
    });
  });
}