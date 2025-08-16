// UI and main logic for EPK fixer
import { isCompatibleBrowser, suggestOutName, ensureTrailingNewline } from "./helper.js";

if (!isCompatibleBrowser()) {
  document.body.innerHTML =
    '<div style="padding:32px;max-width:600px;margin:40px auto;background:#111626;color:#e6e6e6;border-radius:14px;text-align:center;font-size:18px;">⚠️ Your browser is not supported.<br>Please update to the latest version of Chrome, Edge, Firefox, or Safari.</div>';
}

const { default: SevenZip } = await import("https://cdn.jsdelivr.net/npm/7z-wasm@1.2.0/+esm");
const sevenZip = await SevenZip();

const logEl = document.getElementById("log");
function log(msg) {
  logEl.textContent += "\n" + msg;
  logEl.scrollTop = logEl.scrollHeight;
}

const engineStatus = document.getElementById("engineStatus");
engineStatus.textContent = "Engine: ready (7z-wasm)";
engineStatus.style.background = "#1e3a1e";

async function autoDownload(blob, outName, opts = {}) {
  const { maxDelay = 2000 } = opts;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = outName;
  document.body.appendChild(a);
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    try { URL.revokeObjectURL(url); } catch { }
    try { a.remove(); } catch { }
    document.removeEventListener('visibilitychange', onVisibility, true);
    window.removeEventListener('pagehide', onPageHide, true);
    window.removeEventListener('blur', onBlur, true);
  };
  const onVisibility = () => { if (document.visibilityState === 'hidden') cleanup(); };
  const onPageHide = () => cleanup();
  const onBlur = () => { cleanup(); };
  document.addEventListener('visibilitychange', onVisibility, true);
  window.addEventListener('pagehide', onPageHide, true);
  window.addEventListener('blur', onBlur, true);
  a.click();
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(() => { cleanup(); resolve(); }, 100);
      });
    });
    setTimeout(() => { cleanup(); resolve(); }, maxDelay);
  });
}

async function fixEpkFile(file) {
  log(`Processing: ${file.name} (${file.size} bytes)`);
  try {
    try { sevenZip.FS.unlink("/in.epk"); } catch { }
    try { sevenZip.FS.rmdir("/out"); } catch { }
    const buf = new Uint8Array(await file.arrayBuffer());
    sevenZip.FS.writeFile("/in.epk", buf);
    const args = ["x", "/in.epk", "-o/out", "-y"];
    await sevenZip.callMain(args);
    const list = sevenZip.FS.readdir("/out").filter((f) => f !== "." && f !== "..");
    const certPath = list.find((p) => p.toLowerCase() === "cert.txt");
    if (!certPath) {
      log("⚠️ cert.txt not found. Returning original archive unchanged.");
      return;
    }
    const certData = sevenZip.FS.readFile(`/out/${certPath}`);
    const certText = new TextDecoder("utf-8").decode(certData);
    let fixedCert = ensureTrailingNewline(certText);
    const changed = fixedCert !== certText;
    if (changed) {
      sevenZip.FS.writeFile(`/out/${certPath}`, new TextEncoder().encode(fixedCert));
      log("Updated cert.txt: ensured trailing newline.");
      try { sevenZip.FS.unlink("/fixed.epk"); } catch { }
      const archiveArgs = ["a", "/fixed.epk"];
      for (const fname of list) archiveArgs.push(`/out/${fname}`);
      await sevenZip.callMain(archiveArgs);
      const outBuf = sevenZip.FS.readFile("/fixed.epk");
      await autoDownload(
        new Blob([outBuf], { type: "application/octet-stream" }),
        suggestOutName(file.name, changed ? "fixed" : "unchanged")
      );
      log("✅ Done. Download should start automatically.");
    } else {
      log("✅ No change needed: cert.txt already ends with a newline.");
    }
  } catch (err) {
    log("Error: " + (err?.message || err));
  }
}

const drop = document.getElementById("drop");
const fileInput = document.getElementById("file");
["dragenter", "dragover"].forEach((ev) =>
  drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.add("drag");
  })
);
["dragleave", "drop"].forEach((ev) =>
  drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.remove("drag");
  })
);
drop.addEventListener("drop", (e) => {
  const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) fixEpkFile(f).catch((err) => log("Error: " + err.message));
});
fileInput.addEventListener("change", (e) => {
  const f = e.target.files && e.target.files[0];
  if (f) fixEpkFile(f).catch((err) => log("Error: " + err.message));
});
