/* Pakker teksturerne i assets/ som data-URI'er i src/22-assets.js.

   Grunden: den samlede enkeltfil (og artefakten) må ikke hente billeder
   udefra — indholdssikkerheden blokerer det, og filen skal kunne åbnes
   uden internet. Derfor lægges billederne ind i koden.

   Kør efter ændringer i assets/:  node tools/pack-assets.js            */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'assets');
const files = fs.readdirSync(dir).filter(f => /\.(jpg|png)$/i.test(f)).sort();

let total = 0;
const entries = files.map(function (f) {
  const buf = fs.readFileSync(path.join(dir, f));
  total += buf.length;
  const mime = /\.png$/i.test(f) ? 'image/png' : 'image/jpeg';
  const key = f.replace(/\.(jpg|png)$/i, '');
  return '    ' + JSON.stringify(key) + ': "data:' + mime + ';base64,' +
         buf.toString('base64') + '"';
});

const out = `/* ------------------------------------------------------------------
   Teksturdata.

   AUTOGENERERET af tools/pack-assets.js — ret ikke i hånden.
   Kilderne og deres licenser står i assets/CREDITS.md.
   ------------------------------------------------------------------ */
(function () {
  const O = window.OASIS;

  const DATA = {
${entries.join(',\n')}
  };

  const loaded = {};

  O.assets = {
    data: DATA,

    // Henter alle billeder som three-teksturer og kalder tilbage, når de er
    // klar. De ligger som data-URI'er, så det tager millisekunder — men vi
    // venter alligevel, så intet popper ind midt i billedet.
    load: function (onDone) {
      const loader = new THREE.TextureLoader();
      const keys = Object.keys(DATA);
      let left = keys.length;
      if (!left) { onDone(loaded); return; }
      keys.forEach(function (k) {
        loader.load(DATA[k], function (tex) {
          tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
          loaded[k] = tex;
          if (--left === 0) onDone(loaded);
        }, undefined, function () {
          // Fejler et billede, kører vi videre uden det.
          if (--left === 0) onDone(loaded);
        });
      });
    },

    get: function (name) { return loaded[name] || null; }
  };
})();
`;

const target = path.join(root, 'src', '22-assets.js');
fs.writeFileSync(target, out);
console.log('pakkede', files.length, 'filer (' + Math.round(total / 1024) + ' KB) ->',
            path.relative(root, target),
            '(' + Math.round(fs.statSync(target).size / 1024) + ' KB)');
