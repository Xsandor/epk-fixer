
// Node.js script to build a single HTML file with inlined, minified CSS and JS (no dist/ files needed)
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const htmlTemplatePath = path.resolve(process.cwd(), 'src', 'epk-fixer.html');
const jsSourcePath = path.resolve(process.cwd(), 'src', 'script.js');
const cssSourcePath = path.resolve(process.cwd(), 'src', 'style.css');
const outputPath = path.resolve(process.cwd(), 'epk-fixer.html');

const html = fs.readFileSync(htmlTemplatePath, 'utf8');

async function buildInline() {
  // Minify JS in memory
  const jsResult = await esbuild.build({
    entryPoints: [jsSourcePath],
    minify: true,
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
  });
  const js = jsResult.outputFiles[0].text;

  // Minify CSS in memory
  const cssResult = await esbuild.build({
    entryPoints: [cssSourcePath],
    minify: true,
    write: false,
    loader: { '.css': 'css' },
    outdir: 'out',
  });
  const css = cssResult.outputFiles[0].text;

  // Replace external links with inlined content
  let outHtml = html
    .replace(/<link[^>]*href=["'].*style\.css["'][^>]*>/, `<style>${css}</style>`)
    .replace(/<script src="script\.js"[^>]*><\/script>/, `<script type="module">${js}</script>`);

  fs.writeFileSync(outputPath, outHtml);
  console.log('Built inline HTML:', outputPath);
}

buildInline();

// After build: generate icons and copy PWA assets to root
async function postBuild() {
  try {
    const { spawnSync } = require('child_process');
    const genScript = path.resolve(process.cwd(), 'build', 'generate-icons.js');
    if (fs.existsSync(genScript)) {
      console.log('Generating icons...');
      const res = spawnSync(process.execPath, [genScript], { stdio: 'inherit' });
      if (res.status !== 0) console.warn('Icon generation exited with non-zero status');
    }

    // Copy manifest, sw.js, offline.html, icons to root
    const filesToCopy = ['manifest.json', 'sw.js', 'offline.html', 'favicon.png'];
    for (const f of filesToCopy) {
      const src = path.resolve(process.cwd(), 'src', f);
      if (fs.existsSync(src)) {
        const dest = path.resolve(process.cwd(), f);
        fs.copyFileSync(src, dest);
        console.log('Copied', f);
      }
    }

    const iconsSrc = path.resolve(process.cwd(), 'icons');
    if (fs.existsSync(iconsSrc)) {
      const iconsDest = path.resolve(process.cwd(), 'icons');
      // already in place, nothing to do; ensure files exist
      console.log('Icons available in', iconsDest);
    }
  } catch (err) {
    console.warn('postBuild tasks failed:', err);
  }
}

postBuild();
