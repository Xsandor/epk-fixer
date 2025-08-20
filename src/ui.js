// UI and main logic for EPK fixer
import { isCompatibleBrowser, suggestOutName, ensureTrailingNewline, suggestZipName } from "./helper.js";
import { handleFiles } from "./fileProcessor.js";

if (!isCompatibleBrowser()) {
  document.body.innerHTML =
    '<div style="padding:32px;max-width:600px;margin:40px auto;background:#111626;color:#e6e6e6;border-radius:14px;text-align:center;font-size:18px;">⚠️ Your browser is not supported.<br>Please update to the latest version of Chrome, Edge, Firefox, or Safari.</div>';
}

const BRAND = "EPK Fixer";
const INNER_PACKAGE_NAME = "SM800A_Upgrade_Source.7z";
const CERT_FILE_NAME = "cert.txt";
const OUT_EPK_NAME = "combined.epk";

// Detect standalone (PWA installed) mode
function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true; // iOS
}

// Title policy:
// - Browser/tab: "<section> — <brand>"
// - Installed PWA: "<section>"  (Windows will prepend "<brand> - ")
function setTitle() {
  if (isStandalone()) {
    document.title = "";
  } else {
    document.title = BRAND;
  }
}

// React to display-mode changes (e.g., when opened as an app)
const dm = window.matchMedia('(display-mode: standalone)');
dm.addEventListener?.('change', () => setTitle());
setTitle()

const { default: SevenZip } = await import("https://cdn.jsdelivr.net/npm/7z-wasm@1.2.0/+esm");
// instantiate 7z-wasm with no-op print handlers to keep the console silent
const sevenZip = await SevenZip({ print: () => { } });

const logEl = document.getElementById("log");
function log(msg) {
  logEl.textContent += logEl.textContent ? "\n" + msg : msg;
  logEl.scrollTop = logEl.scrollHeight;
}

const engineStatus = document.getElementById("engineStatus");
engineStatus.textContent = "Engine: ready (7z-wasm)";
engineStatus.style.background = "#1e3a1e";

log("Ready, please provide file(s) for processing!")

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

export async function fixOne(file) {
  log(`Processing: ${file.name} (${file.size} bytes)`);
  try {
    try { sevenZip.FS.unlink("/in.epk"); } catch { }
    try { sevenZip.FS.rmdir("/out"); } catch { }
    const buf = new Uint8Array(await file.arrayBuffer());
    sevenZip.FS.writeFile("/in.epk", buf);
    const args = ["x", "/in.epk", "-o/out", "-y", "-bb0"];
    await sevenZip.callMain(args);
    const list = sevenZip.FS.readdir("/out").filter((f) => f !== "." && f !== "..");
    const certPath = list.find((p) => p.toLowerCase() === CERT_FILE_NAME);
    if (!certPath) {
      log(`⚠️ ${CERT_FILE_NAME} not found. Returning original archive unchanged.`);
      return { name: file.name, blob: null, changed: false };
    }
    const certData = sevenZip.FS.readFile(`/out/${certPath}`);
    const certText = new TextDecoder("utf-8").decode(certData);
    let fixedCert = ensureTrailingNewline(certText);
    const changed = fixedCert !== certText;
    if (changed) {
      sevenZip.FS.writeFile(`/out/${certPath}`, new TextEncoder().encode(fixedCert));
      log(`Updated ${CERT_FILE_NAME}: ensured trailing newline.`);
      try { sevenZip.FS.unlink(`/${OUT_EPK_NAME}`); } catch { }
      const archiveArgs = ["a", `/${OUT_EPK_NAME}`, "-bb0"];
      for (const fname of list) archiveArgs.push(`/out/${fname}`);
      await sevenZip.callMain(archiveArgs);
      const outBuf = sevenZip.FS.readFile(`/${OUT_EPK_NAME}`);
      const blob = new Blob([outBuf], { type: "application/octet-stream" });
      log("✅ Done. Ready for download.");
      // Cleanup FS: remove files we created under /out and the temporary /fixed.epk and /in.epk
      try {
        // remove files inside /out
        const outFiles = sevenZip.FS.readdir('/out').filter((f) => f !== '.' && f !== '..');
        for (const fName of outFiles) {
          try { sevenZip.FS.unlink(`/out/${fName}`); } catch { }
        }
        try { sevenZip.FS.rmdir('/out'); } catch { }
      } catch { }
      try { sevenZip.FS.unlink(`/${OUT_EPK_NAME}`); } catch { }
      try { sevenZip.FS.unlink('/in.epk'); } catch { }
      return { name: suggestOutName(file.name, "fixed"), blob, changed: true };
    } else {
      log(`✅ No change needed: ${CERT_FILE_NAME} already ends with a newline.`);
      return { name: file.name, blob: null, changed: false };
    }
  } catch (err) {
    log("Error: " + (err?.message || err));
    return { name: file.name, blob: null, changed: false };
  }
}

async function bufToHex(buffer) {
  const b = new Uint8Array(buffer);
  return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
}

async function combineEpks(files) {
  log(`Creating .epk from ${files.length} ${files.length > 1 ? 'files' : 'file'}.`);
  // We'll create a temp dir and extract each epk, then collect the inner SM800A_Upgrade_Source.7z contents
  const tmpRoot = '/combine';
  try { sevenZip.FS.rmdir(tmpRoot); } catch { }
  try { sevenZip.FS.mkdir(tmpRoot); } catch { }

  const innerFilesDir = `${tmpRoot}/inner`; // where we'll place all extracted inner files
  try { sevenZip.FS.rmdir(innerFilesDir); } catch { }
  try { sevenZip.FS.mkdir(innerFilesDir); } catch { }

  // For each input: support two kinds of inputs
  // - .epk files: extract and pull out the SM800A_Upgrade_Source.7z contents
  // - .ed3 / .ed4 files: these are already "inner" files and should be copied directly
  let idx = 0;
  for (const f of Array.from(files)) {
    idx++;
    const fname = f.name || `file${idx}`;
    const lower = fname.toLowerCase();

    // If the input is already an inner file (ed3/ed4), just write it into the innerFilesDir
    if (lower.endsWith('.ed3') || lower.endsWith('.ed4')) {
      try {
        const dataBuf = new Uint8Array(await f.arrayBuffer());
        let targetName = fname;
        // avoid name collisions
        if (sevenZip.FS.readdir(innerFilesDir).includes(fname)) {
          targetName = `${idx}_${fname}`;
        }
        sevenZip.FS.writeFile(`${innerFilesDir}/${targetName}`, dataBuf);
      } catch (e) {
        log(`⚠️ Failed to add inner file ${fname}: ${e?.message || e}`);
      }
      continue;
    }

    // Otherwise assume it's an .epk (or another archive) that needs extraction
    const inPath = `${tmpRoot}/in${idx}.epk`;
    try { sevenZip.FS.unlink(inPath); } catch { }
    const buf = new Uint8Array(await f.arrayBuffer());
    sevenZip.FS.writeFile(inPath, buf);
    await sevenZip.callMain(["x", inPath, `-o${tmpRoot}/out${idx}`, "-y", "-bb0"]);
    const list = sevenZip.FS.readdir(`${tmpRoot}/out${idx}`).filter(x => x !== '.' && x !== '..');
    const innerName = list.find(p => p === INNER_PACKAGE_NAME);
    if (!innerName) {
      log(`⚠️ File ${f.name} missing ${INNER_PACKAGE_NAME} — skipping`);
      continue;
    }
    // read the inner 7z and write to FS to extract
    const innerBuf = sevenZip.FS.readFile(`${tmpRoot}/out${idx}/${innerName}`);
    const innerPath = `${tmpRoot}/inner_${idx}.7z`;
    try { sevenZip.FS.unlink(innerPath); } catch { }
    sevenZip.FS.writeFile(innerPath, innerBuf);
    // extract inner archive into a temporary folder and copy files into innerFilesDir
    const innerOut = `${tmpRoot}/inner_out${idx}`;
    try { sevenZip.FS.rmdir(innerOut); } catch { }
    try { sevenZip.FS.mkdir(innerOut); } catch { }
    await sevenZip.callMain(["x", innerPath, `-o${innerOut}`, "-y", "-bb0"]);
    const innerList = sevenZip.FS.readdir(innerOut).filter(x => x !== '.' && x !== '..');
    for (const name of innerList) {
      const data = sevenZip.FS.readFile(`${innerOut}/${name}`);
      // avoid name collisions by prefixing with idx if needed
      let targetName = name;
      if (sevenZip.FS.readdir(innerFilesDir).includes(name)) {
        targetName = `${idx}_${name}`;
      }
      sevenZip.FS.writeFile(`${innerFilesDir}/${targetName}`, data);
    }
  }

  // Now create a new SM800A_Upgrade_Source.7z in FS from files in innerFilesDir
  const combinedInnerPath = `${tmpRoot}/${INNER_PACKAGE_NAME}`;
  try { sevenZip.FS.unlink(combinedInnerPath); } catch { }
  const innerListFinal = sevenZip.FS.readdir(innerFilesDir).filter(x => x !== '.' && x !== '..');
  if (innerListFinal.length === 0) {
    log('No inner files collected — aborting combine.');
    return;
  }
  const archiveArgs = ["a", combinedInnerPath];
  for (const name of innerListFinal) archiveArgs.push(`${innerFilesDir}/${name}`);
  await sevenZip.callMain(archiveArgs.concat(["-bb0"]));
  const combinedBuf = sevenZip.FS.readFile(combinedInnerPath);

  // Compute SHA256 of combined inner 7z
  const hashBuffer = await crypto.subtle.digest('SHA-256', combinedBuf);
  const hashHex = await bufToHex(hashBuffer);
  const certText = `${hashHex} ${INNER_PACKAGE_NAME}\n`;
  sevenZip.FS.writeFile(`${tmpRoot}/${CERT_FILE_NAME}`, new TextEncoder().encode(certText));

  // Create outer epk (7z archive) with SM800A_Upgrade_Source.7z and cert.txt
  try { sevenZip.FS.unlink(`/${OUT_EPK_NAME}`); } catch { }
  // write the combined inner buffer into FS at a path where 7z can include it
  sevenZip.FS.writeFile(`${tmpRoot}/${INNER_PACKAGE_NAME}`, combinedBuf);
  await sevenZip.callMain(["a", `/${OUT_EPK_NAME}`, `${tmpRoot}/${INNER_PACKAGE_NAME}`, `${tmpRoot}/${CERT_FILE_NAME}`, "-y", "-bb0"]);
  const outBuf = sevenZip.FS.readFile(`/${OUT_EPK_NAME}`);

  let outName;
  if (files && files.length === 1 && files[0] && files[0].name) {
    // Use the single input file's base name, but ensure .epk extension
    const original = files[0].name;
    const base = original.replace(/\.[^.]+$/, '');
    outName = `${base}.epk`;
  } else {
    outName = `EPK_Package_${(new Date()).toISOString().replace(/[:.]/g, '-').replace(/T/, '_').slice(0, 19)}.epk`;
  }
  await autoDownload(new Blob([outBuf], { type: 'application/octet-stream' }), outName);
  log('✅ .epk ready for download: ' + outName);

  // Cleanup FS: remove combine temp files and combined.epk
  try {
    // remove inner files
    const innerListClean = sevenZip.FS.readdir(innerFilesDir).filter(x => x !== '.' && x !== '..');
    for (const n of innerListClean) {
      try { sevenZip.FS.unlink(`${innerFilesDir}/${n}`); } catch { }
    }
    try { sevenZip.FS.rmdir(innerFilesDir); } catch { }
  } catch { }
  // remove per-input out and inner_out folders and inX and inner_X.7z
  for (let i = 1; i <= files.length; i++) {
    try {
      const outDir = `${tmpRoot}/out${i}`;
      const outFiles = sevenZip.FS.readdir(outDir).filter(x => x !== '.' && x !== '..');
      for (const f of outFiles) { try { sevenZip.FS.unlink(`${outDir}/${f}`); } catch { } }
      try { sevenZip.FS.rmdir(outDir); } catch { }
    } catch { }
    try { sevenZip.FS.unlink(`${tmpRoot}/inner_${i}.7z`); } catch { }
    try {
      const innerOut = `${tmpRoot}/inner_out${i}`;
      const inFiles = sevenZip.FS.readdir(innerOut).filter(x => x !== '.' && x !== '..');
      for (const f of inFiles) { try { sevenZip.FS.unlink(`${innerOut}/${f}`); } catch { } }
      try { sevenZip.FS.rmdir(innerOut); } catch { }
    } catch { }
    try { sevenZip.FS.unlink(`${tmpRoot}/in${i}.epk`); } catch { }
  }
  try { sevenZip.FS.unlink(combinedInnerPath); } catch { }
  try { sevenZip.FS.unlink(`${tmpRoot}/${INNER_PACKAGE_NAME}`); } catch { }
  try { sevenZip.FS.unlink(`${tmpRoot}/${CERT_FILE_NAME}`); } catch { }
  try { sevenZip.FS.unlink(`${tmpRoot}/${OUT_EPK_NAME}`); } catch { }
  try { sevenZip.FS.rmdir(tmpRoot); } catch { }
}

// Wire up multiple files using handleFiles
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

// Build the options object for handleFiles when needed.
const fileHandlerOptions = () => ({
  fixOne,
  combineMulti: combineEpks,
  autoDownload
});

function processFiles(files) {
  if (!files) return;
  handleFiles(files, fileHandlerOptions()).catch((err) => log("Error: " + (err?.message || err)));
}

drop.addEventListener("drop", (e) => {
  e.preventDefault();
  const files = e?.dataTransfer?.files ?? null;
  processFiles(files);
});

fileInput.addEventListener("change", (e) => {
  const files = e?.target?.files ?? null;
  processFiles(files);
});
