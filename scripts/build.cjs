const fs = require('node:fs');
const path = require('node:path');
fs.mkdirSync('dist/assets', { recursive: true });
for (const file of ['index.html', 'styles.css', 'app.js']) {
  fs.copyFileSync(file, path.join('dist', file));
}
fs.copyFileSync('assets/quokka-car-ui.png', 'dist/assets/quokka-car-ui.png');
new Function(fs.readFileSync('app.js', 'utf8'));
console.log('Static site built in dist/');
