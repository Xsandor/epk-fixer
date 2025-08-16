// Extracted from epk-fixer.html
function isCompatibleBrowser() {
  try {
    const script = document.createElement("script");
    if (!("noModule" in script)) return false;
    if (
      typeof TextEncoder === "undefined" ||
      typeof TextDecoder === "undefined"
    )
      return false;
    if (
      typeof Uint8Array === "undefined" ||
      typeof ArrayBuffer === "undefined"
    )
      return false;
    if (
      typeof Blob === "undefined" ||
      typeof URL === "undefined" ||
      typeof URL.createObjectURL !== "function"
    )
      return false;
    if (typeof File === "undefined") return false;
    if (!("ondrop" in document.createElement("div"))) return false;
    if (typeof Promise === "undefined") return false;
    return true;
  } catch {
    return false;
  }
}
if (!isCompatibleBrowser()) {
  document.body.innerHTML =
    '<div style="padding:32px;max-width:600px;margin:40px auto;background:#111626;color:#e6e6e6;border-radius:14px;text-align:center;font-size:18px;">⚠️ Your browser is not supported.<br>Please update to the latest version of Chrome, Edge, Firefox, or Safari.</div>';
}
// Main logic
async function main() {
  const SevenZip = (await import("https://cdn.jsdelivr.net/npm/7z-wasm@1.2.0/+esm")).default;
  const sevenZip = await SevenZip();

  // Initialize logging
  const logEl = document.getElementById("log");
  function log(msg) {
    logEl.textContent += "\n" + msg;
    logEl.scrollTop = logEl.scrollHeight;
  }

  // Update engine status
  const engineStatus = document.getElementById("engineStatus");
  engineStatus.textContent = "Engine: ready (7z-wasm)";
  engineStatus.style.background = "#1e3a1e";

  // Helper functions
  function findCertPath(paths) {
    const lower = paths.map((p) => [p, p.toLowerCase()]);
    for (const [orig, low] of lower) {
      const base = low.split("/").pop().split("\\").pop();
      if (base === "cert.txt") return orig;
    }
    return null;
  }

  function suggestOutName(name, suffix) {
    const dot = name.lastIndexOf(".");
    if (dot > 0) {
      const base = name.slice(0, dot);
      const ext = name.slice(dot);
      return `${base}_${suffix}${ext}`;
    }
    return `${name}_${suffix}.7z`;
  }

  /**
* Trigger a blob download in a cross-browser safe way.
* Returns a Promise that resolves after we've attempted cleanup.
*/
  function autoDownload(blob, outName, opts = {}) {
    const { maxDelay = 2000 } = opts; // final fallback before cleanup (ms)

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = outName;
    document.body.appendChild(a);

    // ensure cleanup runs exactly once
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

    const onVisibility = () => {
      // many browsers (esp. iOS Safari) change visibility when the save sheet opens
      if (document.visibilityState === 'hidden') cleanup();
    };
    const onPageHide = () => cleanup();
    const onBlur = () => {
      // Some WebKit builds don’t change visibility; blur is a decent signal too
      // (kept weak; cleanup will also run via timers below)
      cleanup();
    };

    document.addEventListener('visibilitychange', onVisibility, true);
    window.addEventListener('pagehide', onPageHide, true);
    window.addEventListener('blur', onBlur, true);

    // kick off the download
    a.click();

    // Staggered, WebKit-friendly cleanup schedule:
    // - two RAFs let the click fully dispatch & layout flush
    // - a short timer handles most cases
    // - a longer fallback timer avoids leaks if none of the events fire
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(() => {
            cleanup();
            resolve();
          }, 100); // short delay: good enough for Chromium/Firefox
        });
      });

      // Final guard for sticky WebKit cases or very slow prompts
      setTimeout(() => {
        cleanup();
        resolve();
      }, maxDelay);
    });
  }


  // Our main function that handles the whole "fixing" process
  async function fixEpkFile(file) {
    log(`Processing: ${file.name} (${file.size} bytes)`);

    try {
      // Clean up FS before each run
      try {
        sevenZip.FS.unlink("/in.epk");
      } catch { }

      try {
        sevenZip.FS.rmdir("/out");
      } catch { }

      // Write uploaded file to sevenZip FS
      const buf = new Uint8Array(await file.arrayBuffer());
      sevenZip.FS.writeFile("/in.epk", buf);
      // Extract all files to /out
      const args = ["x", "/in.epk", "-o/out", "-y"];
      // log('Extracting .epk…');
      await sevenZip.callMain(args);
      // List files in /out
      const list = sevenZip.FS.readdir("/out").filter(
        (f) => f !== "." && f !== ".."
      );
      // log(`Archive contains: ${list.join(', ')}`);
      const certPath = list.find((p) => p.toLowerCase() === "cert.txt");
      if (!certPath) {
        log("⚠️ cert.txt not found. Returning original archive unchanged.");
        return;
      }
      const certData = sevenZip.FS.readFile(`/out/${certPath}`);
      const certText = new TextDecoder("utf-8").decode(certData);
      // log('cert.txt contents:\n---\n' + certText + '\n---');
      // Ensure trailing newline
      let fixedCert = certText.endsWith("\n")
        ? certText
        : certText.replace(/(?:\n?\r?)?$/, "") + "\n";
      const changed = fixedCert !== certText;
      if (changed) {
        sevenZip.FS.writeFile(
          `/out/${certPath}`,
          new TextEncoder().encode(fixedCert)
        );
        log("Updated cert.txt: ensured trailing newline.");
        // Re-pack all files in /out into new .epk
        // Remove any previous /fixed.epk
        try {
          sevenZip.FS.unlink("/fixed.epk");
        } catch { }
        // Build file list for archiving
        const archiveArgs = ["a", "/fixed.epk"];
        for (const fname of list) archiveArgs.push(`/out/${fname}`);
        // log('Creating fixed .epk…');
        await sevenZip.callMain(archiveArgs);
        const outBuf = sevenZip.FS.readFile("/fixed.epk");
        autoDownload(
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

  // UI: drag & drop + file picker
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
    const f =
      e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) fixEpkFile(f).catch((err) => log("Error: " + err.message));
  });

  fileInput.addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) fixEpkFile(f).catch((err) => log("Error: " + err.message));
  });
}
main();
