/* Samler index.html + moduler + three.js til én fil, der kan åbnes
   direkte i browseren (og bruges som artefakt).

   node tools/build.js              -> dist/oasen.html (komplet HTML-fil)
   node tools/build.js --fragment X -> X (uden <html>/<head>/<body>, til Artifacts)
*/
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const inlined = html.replace(/<script src="([^"]+)"><\/script>/g, function (m, src) {
  const file = path.join(root, src);
  if (!fs.existsSync(file)) throw new Error('mangler ' + src);
  const code = fs.readFileSync(file, 'utf8');
  return '<script>\n/* ---- ' + src + ' ---- */\n' + code + '\n</script>';
});

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'isla.html');
fs.writeFileSync(out, inlined);
console.log('skrev', path.relative(root, out), (fs.statSync(out).size / 1024 / 1024).toFixed(2) + ' MB');

const fragIndex = process.argv.indexOf('--fragment');
if (fragIndex > -1) {
  const target = process.argv[fragIndex + 1];
  // Artifacts leverer selv <!doctype>, <head> og <body>.
  let frag = inlined
    .replace(/^[\s\S]*?<title>/, '<title>')
    .replace(/<\/head>\s*<body>/, '')
    .replace(/<\/body>\s*<\/html>\s*$/, '')
    .replace(/<meta[^>]*>\s*/g, '');
  fs.writeFileSync(target, frag);
  console.log('skrev fragment', target, (fs.statSync(target).size / 1024 / 1024).toFixed(2) + ' MB');
}
