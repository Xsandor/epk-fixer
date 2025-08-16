// Pure helpers for EPK fixer
export function isCompatibleBrowser() {
  try {
    const script = document.createElement("script");
    if (!("noModule" in script)) return false;
    if (
      typeof TextEncoder === "undefined" ||
      typeof TextDecoder === "undefined"
    ) return false;
    if (
      typeof Uint8Array === "undefined" ||
      typeof ArrayBuffer === "undefined"
    ) return false;
    if (
      typeof Blob === "undefined" ||
      typeof URL === "undefined" ||
      typeof URL.createObjectURL !== "function"
    ) return false;
    if (typeof File === "undefined") return false;
    if (!("ondrop" in document.createElement("div"))) return false;
    if (typeof Promise === "undefined") return false;
    return true;
  } catch {
    return false;
  }
}

export function suggestOutName(name, suffix) {
  const dot = name.lastIndexOf(".");
  if (dot > 0) {
    const base = name.slice(0, dot);
    const ext = name.slice(dot);
    return `${base}_${suffix}${ext}`;
  }
  throw new Error("Input filename must have an extension");
}

export function ensureTrailingNewline(text) {
  return text.endsWith("\n") ? text : text.replace(/(?:\n?\r?)?$/, "") + "\n";
}
