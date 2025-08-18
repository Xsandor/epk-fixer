// fileProcessor: small orchestrator to handle single or multiple file flows.
export async function handleFiles(files, {
  fixOne,
  combineMulti,
  autoDownload,
  singleOutNamer
}) {
  const arr = Array.from(files || []);
  if (arr.length === 0) return;
  if (arr.length === 1) {
    const file = arr[0];
    const res = await fixOne(file);
    if (res && res.blob && res.name && res.changed) {
      await autoDownload(res.blob, res.name);
      window.umami.track("fix-single-epk");
    }
    return;
  }
  // For multiple files, delegate to combineMulti which should create a single .epk and trigger download
  if (typeof combineMulti === 'function') {
    await combineMulti(files);
    window.umami.track("fix-multiple-epk", { fileCount: files.length });
    return;
  }
}

export default { handleFiles };
