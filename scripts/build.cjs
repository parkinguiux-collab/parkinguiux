const fs = require('node:fs');
const path = require('node:path');
for (const script of ['app.js', 'assets/account-ui.js', 'assets/vehicle-search.js', 'assets/onboarding.js', 'assets/support.js']) new Function(fs.readFileSync(script, 'utf8'));
const manifest = JSON.parse(fs.readFileSync('manifest.webmanifest', 'utf8'));
for (const icon of manifest.icons) {
  if (!fs.existsSync(icon.src)) throw new Error(`Missing app icon: ${icon.src}`);
}
const markup = fs.readFileSync('index.html', 'utf8');
for (const match of markup.matchAll(/(?:src|href)="([^"#]+)"/g)) {
  const asset = match[1].split('?')[0];
  if (!/^https?:/.test(asset) && !fs.existsSync(asset)) throw new Error(`Missing asset: ${asset}`);
}
fs.mkdirSync('dist', { recursive: true });
for (const file of ['index.html', 'styles.css', 'app.js', 'manifest.webmanifest']) {
  fs.copyFileSync(file, path.join('dist', file));
}
fs.cpSync('assets', 'dist/assets', { recursive: true });
console.log('Static site built; script, manifest and referenced assets verified.');
