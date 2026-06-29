// Post-build: remove type="module" from dist/index.html for file:// compatibility
const { readFileSync, writeFileSync } = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, 'dist', 'index.html');
let html = readFileSync(htmlPath, 'utf-8');
html = html.replace(/<script type="module" crossorigin /g, '<script ');
writeFileSync(htmlPath, html);
console.log('  ✓ Fixed script tag for file:// compatibility');
