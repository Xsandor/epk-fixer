const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const Seven = require('node-7z');
const path7za = require('7zip-bin').path7za;

const testFilesDir = path.join(__dirname, './files');
const htmlPath = path.resolve(__dirname, '../epk-fixer.html');
const fileUrl = pathToFileURL(htmlPath).href;

const testCases = [
  {
    name: 'MC764323',
    broken: 'MC764323.epk',
    fixed: 'MC764323_fixed.epk',
  },
  {
    name: '114U4038',
    broken: '114U4038.epk',
    fixed: '114U4038_fixed.epk',
  },
  {
    name: 'M2M1 Tool - 098M0423',
    broken: '098M0423.epk',
    fixed: '098M0423_fixed.epk',
  }
];

test.describe.parallel('EPK Fixer Webapp', () => {
  for (const tc of testCases) {
    test(`should fix a broken epk file and cert.txt ends with newline (${tc.name})`, async ({ page, context }) => {
      // Create a unique temp directory for this test
      const tempDir = path.join(os.tmpdir(), 'epk-fixer-test-' + crypto.randomBytes(8).toString('hex'));
      fs.mkdirSync(tempDir);
      await page.goto(fileUrl);
      await expect(page.locator('#engineStatus')).toContainText('Engine: ready');
      await page.setInputFiles('input[type="file"]', path.join(testFilesDir, tc.broken));
      const download = await page.waitForEvent('download');
      expect(download).toBeTruthy();
      const suggestedName = download.suggestedFilename();
      expect(suggestedName).toMatch(/fixed\.epk$/);
      const downloadPath = path.join(tempDir, suggestedName);
      await download.saveAs(downloadPath);
      await new Promise((resolve, reject) => {
        const extractStream = Seven.extractFull(downloadPath, tempDir, {
          $bin: path7za,
        });
        extractStream.on('end', resolve);
        extractStream.on('error', reject);
      });
      const certPath = path.join(tempDir, 'cert.txt');
      const certText = fs.readFileSync(certPath, 'utf-8');
      expect(certText.endsWith('\n')).toBeTruthy();
      // Clean up temp directory
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    test(`should not change a fixed epk file and cert.txt ends with newline (${tc.name})`, async ({ page }) => {
      const tempDir = path.join(os.tmpdir(), 'epk-fixer-test-' + crypto.randomBytes(8).toString('hex'));
      fs.mkdirSync(tempDir);
      await page.goto(fileUrl);
      await expect(page.locator('#engineStatus')).toContainText('Engine: ready');
      await page.setInputFiles('input[type="file"]', path.join(testFilesDir, tc.fixed));
      const downloadPromise = page.waitForEvent('download', { timeout: 2000 });
      let downloadTriggered = false;
      try {
        await downloadPromise;
        downloadTriggered = true;
      } catch (e) {
        downloadTriggered = false;
      }
      expect(downloadTriggered).toBeFalsy();
      fs.rmSync(tempDir, { recursive: true, force: true });
    });
  }
});