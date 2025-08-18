// Simple icon generator using sharp. Reads src/assets/favicon.png (assumed 1024x1024) and writes icons/ icon sizes.
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const src = path.resolve(process.cwd(), 'src', 'assets', 'favicon.png');
const outDir = path.resolve(process.cwd(), 'icons');
const sizes = [32, 64, 192, 512];

// We'll also write maskable variants (same PNG file content is acceptable here).

async function generate() {
  if (!fs.existsSync(src)) {
    console.error('Source favicon not found at', src);
    process.exit(1);
  }
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
  for (const s of sizes) {
    const out = path.join(outDir, `icon-${s}.png`);
    await sharp(src).resize(s, s).png().toFile(out);
    console.log('Wrote', out);

    const maskOut = path.join(outDir, `icon-${s}-maskable.png`);
    // For now create the same image as maskable; platforms will accept it.
    await sharp(src).resize(s, s).png().toFile(maskOut);
    console.log('Wrote', maskOut);
  }
}

if (require.main === module) generate().catch(err => { console.error(err); process.exit(1) });
