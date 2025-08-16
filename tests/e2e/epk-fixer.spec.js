const { test, expect } = require("@playwright/test");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const { pathToFileURL } = require("url");
const Seven = require("node-7z");
const path7za = require("7zip-bin").path7za;

async function extractWith7z(zipPath, outDir) {
  await new Promise((resolve, reject) => {
    const s = Seven.extractFull(zipPath, outDir, {
      $bin: path7za,
      $cherryPick: "*.txt",
    });
    s.on("end", resolve);
    s.on("error", reject);
  });
}

const testFilesDir = path.join(__dirname, "./files");
const htmlPath = path.resolve(process.cwd(), 'epk-fixer.html');
const fileUrl = pathToFileURL(htmlPath).href;

const testCases = [
  {
    name: "MC764323",
    broken: "MC764323.epk",
    fixed: "MC764323_fixed.epk",
  },
  {
    name: "114U4038",
    broken: "114U4038.epk",
    fixed: "114U4038_fixed.epk",
  },
  {
    name: "M2M1 Tool - 098M0423",
    broken: "098M0423.epk",
    fixed: "098M0423_fixed.epk",
  },
  {
    name: "Alsmart - MC990000",
    broken: "MC990000.epk",
  },
  {
    name: "X-Gate",
    broken: "X-Gate.epk",
  },
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__PLAYWRIGHT_TEST__ = true;
  });
});

test.describe.parallel("EPK Fixer Webapp", () => {
  test.beforeEach(async ({ page }) => {
    // Catch runtime issues early
    page.on("pageerror", (err) => {
      throw new Error("Page error: " + err.message);
    });
    page.on("console", (msg) => {
      if (msg.type() === "error")
        throw new Error("Console error: " + msg.text());
    });
  });
  for (const tc of testCases.filter((tc) => tc.broken)) {
    test(`should fix a broken epk file and cert.txt ends with newline (${tc.name})`, async ({
      page,
    }, testInfo) => {
      // Create a unique temp directory for this test
      const outDir = testInfo.outputPath(
        `run-${crypto.randomBytes(6).toString("hex")}`
      );
      fs.mkdirSync(outDir, { recursive: true });

      await test.step("open app", async () => {
        await page.goto(fileUrl);
        await expect(page).toHaveURL(fileUrl);
        await expect(page.locator("#engineStatus")).toContainText(
          "Engine: ready"
        );
      });

      const sourcePath = path.join(testFilesDir, tc.broken);

      const download =
        await test.step("upload and wait for download", async () => {
          const dlPromise = page.waitForEvent("download");
          await page.setInputFiles("#file", sourcePath);
          return await dlPromise;
        });

      await test.step("assert filename & extract", async () => {
        const suggestedName = download.suggestedFilename();
        expect(suggestedName).toMatch(/_fixed\.epk$/);
        const zipPath = path.join(outDir, suggestedName);
        await download.saveAs(zipPath);
        await extractWith7z(zipPath, outDir);
      });

      await test.step("check cert newline", async () => {
        const certPath = path.join(outDir, "cert.txt");
        expect(fs.existsSync(certPath)).toBeTruthy();
        const buf = fs.readFileSync(certPath);
        expect(buf.length > 0 && buf[buf.length - 1] === 0x0a).toBeTruthy();
      });
    });
  }

  for (const tc of testCases.filter((tc) => tc.fixed)) {
    test(`should not change a fixed epk file and cert.txt ends with newline (${tc.name})`, async ({
      page,
    }) => {
      await test.step("open app", async () => {
        await page.goto(fileUrl);
        await expect(page).toHaveURL(fileUrl);
        await expect(page.locator("#engineStatus")).toContainText(
          "Engine: ready"
        );
      });

      await test.step("upload and wait for download not to happen", async () => {
        await page.setInputFiles("#file", path.join(testFilesDir, tc.fixed));
        const downloadPromise = page.waitForEvent("download", {
          timeout: 1500,
        });
        await expect(downloadPromise).rejects.toThrow();
        await expect(page.locator("#log")).toContainText("No change needed");
      });
    });
  }

  test("drag-and-drop path works", async ({ page }) => {
    await page.goto(fileUrl);
    await expect(page.locator("#engineStatus")).toHaveText(/ready/i);

    // You only need bubbles/cancelable; no dataTransfer required
    await page.dispatchEvent("#drop", "dragenter", {
      bubbles: true,
      cancelable: true,
    });
    await expect(page.locator("#drop")).toHaveClass(/drag/);

    await page.dispatchEvent("#drop", "dragleave", {
      bubbles: true,
      cancelable: true,
    });
    await expect(page.locator("#drop")).not.toHaveClass(/drag/);

    // (Optional) also cover dragover → keeps class on
    await page.dispatchEvent("#drop", "dragover", {
      bubbles: true,
      cancelable: true,
    });
    await expect(page.locator("#drop")).toHaveClass(/drag/);
  });

  test('multiple files selection creates a zip with fixed epks', async ({ page }, testInfo) => {
    const outDir = testInfo.outputPath(`multi-${crypto.randomBytes(6).toString('hex')}`);
    fs.mkdirSync(outDir, { recursive: true });

    await page.goto(fileUrl);
    await expect(page.locator('#engineStatus')).toContainText('Engine: ready');

    const source1 = path.join(testFilesDir, 'MC764323.epk');
    const source2 = path.join(testFilesDir, '098M0423.epk');

    const download = await (async () => {
      const dlPromise = page.waitForEvent('download');
      await page.setInputFiles('#file', [source1, source2]);
      return await dlPromise;
    })();

    // we now expect a single combined .epk
    const suggested = download.suggestedFilename();
    expect(suggested).toMatch(/^EPK_Package_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.epk$/);
    const epkPath = path.join(outDir, suggested);
    await download.saveAs(epkPath);

    // extract outer epk to outDir
    await new Promise((resolve, reject) => {
      const s = Seven.extractFull(epkPath, outDir, { $bin: path7za });
      s.on('end', resolve);
      s.on('error', reject);
    });

    // verify SM800A_Upgrade_Source.7z and cert.txt exist
    const innerPath = path.join(outDir, 'SM800A_Upgrade_Source.7z');
    const certPath = path.join(outDir, 'cert.txt');
    expect(fs.existsSync(innerPath)).toBeTruthy();
    expect(fs.existsSync(certPath)).toBeTruthy();

    // compute sha256 of innerPath and compare with cert.txt first token
    const innerBuf = fs.readFileSync(innerPath);
    const hash = crypto.createHash('sha256').update(innerBuf).digest('hex');
    const cert = fs.readFileSync(certPath, 'utf8');
    const certHash = cert.split(/\s+/)[0];
    expect(certHash).toBe(hash);
  });
});
