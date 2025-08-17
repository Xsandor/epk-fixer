const os = require("os");
const { devices } = require("@playwright/test");

module.exports = {
  testDir: './tests/e2e',
  workers: Math.max(2, Math.floor(os.cpus().length / 2)), // Use half of available CPUs, minimum 2
  timeout: 10000, // 30s per test
  retries: 0, // No retries by default
  use: {
    headless: true,
    baseURL: "http://localhost:8080",
  },
  // Start a lightweight static server for tests so pages are loaded over http(s)
  webServer: {
    command: 'npx http-server . -p 8080',
    port: 8080,
    reuseExistingServer: true,
  },
  projects: [
    {
      name: "Chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "Firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "WebKit",
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "Mobile Chrome (Pixel 7)",
      use: {
        ...devices["Pixel 7"], // Chromium-based mobile
      },
    },
    {
      name: "Mobile Safari (iPhone 14)",
      use: {
        ...devices["iPhone 14"], // WebKit/iOS Safari emulation
      },
    },
  ],
};
