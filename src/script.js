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