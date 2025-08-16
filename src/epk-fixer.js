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
	const logEl = document.getElementById("log");
	function log(msg) {
		logEl.textContent += "\n" + msg;
		logEl.scrollTop = logEl.scrollHeight;
	}
	const engineStatus = document.getElementById("engineStatus");
	engineStatus.textContent = "Engine: ready (7z-wasm)";
	engineStatus.style.background = "#1e3a1e";
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
	function autoDownload(blob, outName) {
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = outName;
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
	}
	async function fixEpkFile(file) {
		log(`Processing: ${file.name} (${file.size} bytes)`);
		try {
			try { sevenZip.FS.unlink("/in.epk"); } catch {}
			try { sevenZip.FS.rmdir("/out"); } catch {}
			const buf = new Uint8Array(await file.arrayBuffer());
			sevenZip.FS.writeFile("/in.epk", buf);
			const args = ["x", "/in.epk", "-o/out", "-y"];
			await sevenZip.callMain(args);
			const list = sevenZip.FS.readdir("/out").filter(
				(f) => f !== "." && f !== ".."
			);
			const certPath = list.find((p) => p.toLowerCase() === "cert.txt");
			if (!certPath) {
				log("⚠️ cert.txt not found. Returning original archive unchanged.");
				return;
			}
			const certData = sevenZip.FS.readFile(`/out/${certPath}`);
			const certText = new TextDecoder("utf-8").decode(certData);
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
				try { sevenZip.FS.unlink("/fixed.epk"); } catch {}
				const archiveArgs = ["a", "/fixed.epk"];
				for (const fname of list) archiveArgs.push(`/out/${fname}`);
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
