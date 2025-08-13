const os = require('os');

module.exports = {
  workers: Math.max(2, Math.floor(os.cpus().length / 2)), // Use half of available CPUs, minimum 2
  timeout: 10000, // 30s per test
  retries: 0, // No retries by default
  use: {
    headless: true,
    baseURL: 'http://localhost:8080',
  }
};
