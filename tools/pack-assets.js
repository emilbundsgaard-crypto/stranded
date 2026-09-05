/* Pakker teksturerne i assets/ som data-URI'er i src/22-assets.js.

   Grunden: den samlede enkeltfil (og artefakten) må ikke hente billeder
   udefra — indholdssikkerheden blokerer det, og filen skal kunne åbnes
   uden internet. Derfor lægges billederne ind i koden.

   Kør efter ændringer i assets/:  node tools/pack-assets.js            */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'assets');
const files = fs.readdirSync(dir).filter(f => /\.(jpg|png|glb)$/i.test(f)).sort();

let total = 0;
const entries = files.map(function (f) {
  const buf = fs.readFileSync(path.join(dir, f));
  total += buf.length;
  const mime = /\.png$/i.test(f) ? 'image/png'
             : /\.glb$/i.test(f) ? 'model/gltf-binary'
             : 'image/jpeg';
  const key = f.replace(/\.(jpg|png|glb)$/i, '');
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
  const models = {};

  O.assets = {
    data: DATA,

    // Henter alle billeder som three-teksturer og kalder tilbage, når de er
    // klar. De ligger som data-URI'er, så det tager millisekunder — men vi
    // venter alligevel, så intet popper ind midt i billedet.
    load: function (onDone) {
      const texLoader = new THREE.TextureLoader();
      const gltfLoader = THREE.GLTFLoader ? new THREE.GLTFLoader() : null;
      const keys = Object.keys(DATA);
      let left = keys.length;
      if (!left) { onDone(loaded); return; }
      function done() { if (--left === 0) onDone(loaded); }
      keys.forEach(function (k) {
        const uri = DATA[k];
        if (uri.indexOf('data:model/gltf-binary') === 0) {
          // Modellen afkodes i hånden og sendes til parse() i stedet for
          // load(). load() ville hente data-URI'en med fetch, og en
          // artefaktside har en indholdspolitik, der kan spærre for netop
          // det — parse() rører ikke netværket overhovedet.
          if (!gltfLoader) { done(); return; }
          try {
            const b64 = uri.slice(uri.indexOf(',') + 1);
            const bin = atob(b64);
            const buf = new ArrayBuffer(bin.length);
            const view = new Uint8Array(buf);
            for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
            gltfLoader.parse(buf, '', function (gltf) { models[k] = gltf; done(); },
                             function () { done(); });
          } catch (e) {
            done();
          }
          return;
        }
        texLoader.load(uri, function (tex) {
          tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
          loaded[k] = tex;
          done();
        }, undefined, function () { done(); });
      });
    },

    get: function (name) { return loaded[name] || null; },
    model: function (name) { return models[name] || null; }
  };
})();
`;

const target = path.join(root, 'src', '22-assets.js');
fs.writeFileSync(target, out);
console.log('pakkede', files.length, 'filer (' + Math.round(total / 1024) + ' KB) ->',
            path.relative(root, target),
            '(' + Math.round(fs.statSync(target).size / 1024) + ' KB)');
