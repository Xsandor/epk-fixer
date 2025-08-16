
// Node.js script to build a single HTML file with inlined, minified CSS and JS (no dist/ files needed)
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const htmlTemplatePath = path.join(__dirname, 'src', 'epk-fixer.html');
const jsSourcePath = path.join(__dirname, 'src', 'epk-fixer.js');
const cssSourcePath = path.join(__dirname, 'src', 'epk-fixer.css');
const outputPath = path.join(__dirname, 'epk-fixer.html');

const html = fs.readFileSync(htmlTemplatePath, 'utf8');

async function buildInline() {
  // Minify JS in memory
  const jsResult = await esbuild.build({
    entryPoints: [jsSourcePath],
    minify: true,
    bundle: false,
    write: false,
    format: 'iife',
    platform: 'browser',
  });
  let js = jsResult.outputFiles[0].text;
  // Escape </script> to avoid breaking HTML
  js = js.replace(/<\/script>/gi, '<\\/script>');

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
    .replace(/<link[^>]*href=["'].*epk-fixer\.css["'][^>]*>/, `<style>${css}</style>`)
    .replace(/<script[^>]*src=["'].*epk-fixer\.js["'][^>]*><\/script>/, `<script type="module">${js}</script>`);

  fs.writeFileSync(outputPath, outHtml);
  console.log('Built inline HTML:', outputPath);
}

buildInline();
