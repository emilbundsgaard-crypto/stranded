/* ------------------------------------------------------------------
   Alle teksturer tegnes i browseren med canvas — ingen filer at hente.

   Ud over farve- og normalkort laves der også ruhedskort (hårde
   sandstensbænke er blankere end de bløde), et fint detaljekort der
   lægges oven på alt i høj tæthed, og et storskala-kort der bryder
   gentagelsen i sandet.
   ------------------------------------------------------------------ */
(function () {
  const O = window.OASIS;
  const M = O.math;

  /* ---- Hurtig støj (heltalshash i stedet for sin) — teksturerne skal
         genereres på under et sekund. ---- */
  function ihash(x, y) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function tnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = ihash(xi, yi), b = ihash(xi + 1, yi);
    const c = ihash(xi, yi + 1), d = ihash(xi + 1, yi + 1);
    return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
  }
  function tfbm(x, y, oct) {
    let s = 0, a = 0.5, f = 1, n = 0;
    for (let i = 0; i < oct; i++) { s += a * tnoise(x * f, y * f); n += a; a *= 0.5; f *= 2.03; }
    return s / n;
  }
  function tridged(x, y, oct) {
    let s = 0, a = 0.5, f = 1, n = 0;
    for (let i = 0; i < oct; i++) {
      const v = 1 - Math.abs(tnoise(x * f, y * f) * 2 - 1);
      s += a * v * v; n += a; a *= 0.55; f *= 2.11;
    }
    return s / n;
  }

  let maxAniso = 8;

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h || w;
    return c;
  }

  function toTexture(c, repeat, srgb) {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = maxAniso;
    if (repeat) t.repeat.set(repeat, repeat);
    if (srgb) t.encoding = THREE.sRGBEncoding;
    return t;
  }

  // Normalkort ud fra en gråtonehøjde (Sobel).
  function normalFromHeight(src, strength) {
    const w = src.width, h = src.height;
    const data = src.getContext('2d').getImageData(0, 0, w, h).data;
    const out = canvas(w, h);
    const octx = out.getContext('2d');
    const img = octx.createImageData(w, h);
    const at = (x, y) => data[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
        const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
        const nx = -dx, ny = -dy, nz = 1;
        const l = Math.sqrt(nx * nx + ny * ny + 1);
        const i = (y * w + x) * 4;
        img.data[i] = (nx / l * 0.5 + 0.5) * 255;
        img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255;
        img.data[i + 2] = (nz / l * 0.5 + 0.5) * 255;
        // Selve højden gemmes i alfakanalen — parallax-mapping læser den her.
        img.data[i + 3] = data[(y * w + x) * 4];
      }
    }
    octx.putImageData(img, 0, 0);
    return out;
  }

  /* ---------- Sand ---------- */
  function sandMaps() {
    const S = 512;
    const col = canvas(S), hgt = canvas(S), rough = canvas(S);
    const ci = col.getContext('2d').createImageData(S, S);
    const hi = hgt.getContext('2d').createImageData(S, S);
    const ri = rough.getContext('2d').createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = (y * S + x) * 4;
        const grain = tfbm(x * 0.9, y * 0.9, 3) - 0.5;
        const micro = tnoise(x * 3.1, y * 3.1) - 0.5;
        // To sæt vindribber i lidt forskellig retning.
        const r1 = Math.sin((x * 0.10 + y * 0.035) + tfbm(x * 0.02, y * 0.02, 3) * 7.0);
        const r2 = Math.sin((x * 0.035 - y * 0.075) + tfbm(x * 0.015, y * 0.03, 2) * 5.0);
        const ripple = r1 * 0.6 + r2 * 0.4;
        const speck = ihash(x, y) > 0.9955 ? 1 : 0;
        const dark = ihash(x + 7, y + 13) > 0.997 ? 1 : 0;

        const v = 0.52 + grain * 0.22 + micro * 0.10 + ripple * 0.055 + speck * 0.34 - dark * 0.28;
        ci.data[i] = M.clamp(198 * v + 44, 0, 255);
        ci.data[i + 1] = M.clamp(170 * v + 34, 0, 255);
        ci.data[i + 2] = M.clamp(130 * v + 24, 0, 255);
        ci.data[i + 3] = 255;

        const hv = M.clamp((0.5 + grain * 0.5 + micro * 0.35 + ripple * 0.30 + speck * 0.6) * 255, 0, 255);
        hi.data[i] = hi.data[i + 1] = hi.data[i + 2] = hv; hi.data[i + 3] = 255;

        // Små sten og skaller er blankere end selve sandet.
        const rv = M.clamp((0.92 - speck * 0.45 - Math.max(0, micro) * 0.2) * 255, 0, 255);
        ri.data[i] = ri.data[i + 1] = ri.data[i + 2] = rv; ri.data[i + 3] = 255;
      }
    }
    col.getContext('2d').putImageData(ci, 0, 0);
    hgt.getContext('2d').putImageData(hi, 0, 0);
    rough.getContext('2d').putImageData(ri, 0, 0);
    return { color: col, normal: normalFromHeight(hgt, 2.6), rough: rough };
  }

  /* ---------- Sandsten ---------- */
  function rockMaps() {
    const S = 1024;   // klippen fylder mest på skærmen — den får den fine tekstur
    const col = canvas(S), hgt = canvas(S), rough = canvas(S);
    const ci = col.getContext('2d').createImageData(S, S);
    const hi = hgt.getContext('2d').createImageData(S, S);
    const ri = rough.getContext('2d').createImageData(S, S);

    // Bænke med hver sin tykkelse, farve og hårdhed.
    const beds = [];
    let yy = 0;
    while (yy < 1) {
      const t = 0.020 + ihash(beds.length * 13, 7) * 0.055;
      beds.push({
        y0: yy, y1: Math.min(1, yy + t),
        tint: 0.80 + ihash(beds.length * 5, 11) * 0.42,
        warm: ihash(beds.length * 3, 29),
        hard: ihash(beds.length * 17, 5) > 0.45
      });
      yy += t;
    }
    function bedAt(v) {
      for (let i = 0; i < beds.length; i++) if (v >= beds[i].y0 && v < beds[i].y1) return beds[i];
      return beds[beds.length - 1];
    }

    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = (y * S + x) * 4;
        // Lagene bølger, så de ikke ligner streger tegnet med lineal.
        const warp = tfbm(x * 0.003, y * 0.01, 3) * 52 - 26;
        const yy2 = y + warp;
        const bed = bedAt(M.clamp(yy2 / S, 0, 0.999));

        // Lamination inde i hver bænk.
        const lam = Math.sin(yy2 * 0.45 + tfbm(x * 0.01, yy2 * 0.025, 2) * 6) * 0.5 + 0.5;
        const grain = tfbm(x * 0.09, yy2 * 0.30, 4) - 0.5;
        const crack = tridged(x * 0.022, yy2 * 0.011, 4);
        // Lodret "desert varnish" der løber ned ad væggen.
        const varnish = tfbm(x * 0.037, yy2 * 0.002, 3);
        const pit = tridged(x * 0.25, yy2 * 0.25, 2);

        const shade = 0.76 + lam * 0.17 + grain * 0.22
                    - Math.pow(crack, 2.6) * 0.22
                    - Math.pow(varnish, 3.0) * 0.22
                    - Math.pow(pit, 8.0) * 0.10;
        const tint = bed.tint * shade * (bed.hard ? 1.05 : 0.95);

        ci.data[i] = M.clamp(206 * tint + 30, 0, 255);
        ci.data[i + 1] = M.clamp(142 * tint * (0.90 + bed.warm * 0.20) + 20, 0, 255);
        ci.data[i + 2] = M.clamp(92 * tint * (0.78 + bed.warm * 0.34) + 12, 0, 255);
        ci.data[i + 3] = 255;

        const hv = M.clamp((0.46 + lam * 0.22 + grain * 0.42
                    - Math.pow(crack, 2.2) * 0.55 - Math.pow(pit, 6.0) * 0.4) * 255, 0, 255);
        hi.data[i] = hi.data[i + 1] = hi.data[i + 2] = hv; hi.data[i + 3] = 255;

        const rv = M.clamp(((bed.hard ? 0.72 : 0.94) + grain * 0.12 + Math.pow(crack, 2.2) * 0.2) * 255, 0, 255);
        ri.data[i] = ri.data[i + 1] = ri.data[i + 2] = rv; ri.data[i + 3] = 255;
      }
    }
    col.getContext('2d').putImageData(ci, 0, 0);
    hgt.getContext('2d').putImageData(hi, 0, 0);
    rough.getContext('2d').putImageData(ri, 0, 0);
    return { color: col, normal: normalFromHeight(hgt, 4.2), rough: rough };
  }

  /* ---------- Sten (småsten, nedfald, kampesten) ---------- */
  // Sandsten i stort format duer ikke på en enkelt sten — lagene smører
  // sig ud. Småsten får deres egen kornede tekstur.
  function stoneMaps() {
    const S = 256;
    const col = canvas(S), hgt = canvas(S);
    const ci = col.getContext('2d').createImageData(S, S);
    const hi = hgt.getContext('2d').createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = (y * S + x) * 4;
        const base = tfbm(x * 0.05, y * 0.05, 4);       // store pletter
        const grain = tfbm(x * 0.6, y * 0.6, 3);        // korn
        const fleck = ihash(x, y) > 0.994 ? 0.22 : 0;   // enkelte lyse korn
        const dark = ihash(x + 3, y + 9) > 0.990 ? -0.22 : 0;
        const crack = tridged(x * 0.12, y * 0.12, 3);
        const v = 0.50 + (base - 0.5) * 0.30 + (grain - 0.5) * 0.22 + fleck + dark
                - Math.pow(crack, 4.0) * 0.20;
        const warm = 0.90 + base * 0.22;
        // Ørkensten er varm og dæmpet — ikke granit.
        ci.data[i] = M.clamp(150 * v * warm + 30, 0, 255);
        ci.data[i + 1] = M.clamp(126 * v * (0.95 + base * 0.08) + 24, 0, 255);
        ci.data[i + 2] = M.clamp(96 * v * 0.94 + 18, 0, 255);
        ci.data[i + 3] = 255;
        const hv = M.clamp((0.45 + (grain - 0.5) * 0.7 + fleck - Math.pow(crack, 4.0) * 0.6) * 255, 0, 255);
        hi.data[i] = hi.data[i + 1] = hi.data[i + 2] = hv; hi.data[i + 3] = 255;
      }
    }
    col.getContext('2d').putImageData(ci, 0, 0);
    hgt.getContext('2d').putImageData(hi, 0, 0);
    return { color: col, normal: normalFromHeight(hgt, 2.4) };
  }

  /* ---------- Fin detalje der lægges oven på alt ---------- */
  function detailNormalMap() {
    const S = 256;
    const h = canvas(S);
    const ctx = h.getContext('2d');
    const img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = (y * S + x) * 4;
        const v = tfbm(x * 1.7, y * 1.7, 3) * 0.6 + tnoise(x * 6.0, y * 6.0) * 0.4;
        const c = M.clamp(v * 255, 0, 255);
        img.data[i] = img.data[i + 1] = img.data[i + 2] = c;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return normalFromHeight(h, 1.6);
  }

  /* ---------- Storskala-variation (bryder gentagelsen) ---------- */
  function macroMap() {
    const S = 256;
    const c = canvas(S);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = (y * S + x) * 4;
        const v = 0.5 + (tfbm(x * 0.022, y * 0.022, 4) - 0.5) * 0.55;
        img.data[i] = M.clamp(v * 262, 0, 255);
        img.data[i + 1] = M.clamp(v * 254, 0, 255);
        img.data[i + 2] = M.clamp(v * 242, 0, 255);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  /* ---------- Planter ---------- */
  // Fire varianter: friskt græs ved vandet, tørt strå længere oppe, brede
  // blade i klumperne og en tør busk. Ensartet bevoksning er en af de
  // tydeligste røbere af at noget er computergenereret.
  function bladeTexture(opts) {
    const W = 256, H = 256;
    const c = canvas(W, H);
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    const rnd = M.mulberry32(opts.seed);

    for (let i = 0; i < opts.count; i++) {
      const x0 = 20 + rnd() * (W - 40);
      const dir = x0 < W / 2 ? -1 : 1;
      const lean = dir * opts.lean * (0.3 + rnd() * 1.1);
      const h = H * (opts.hMin + rnd() * (opts.hMax - opts.hMin));
      const wBlade = opts.wMin + rnd() * (opts.wMax - opts.wMin);
      const dry = rnd();
      const pal = dry > opts.dryMix ? opts.dryPal : opts.freshPal;
      const g = ctx.createLinearGradient(0, H, 0, H - h);
      g.addColorStop(0, pal[0]);
      g.addColorStop(0.4, pal[1]);
      g.addColorStop(1, pal[2]);
      ctx.strokeStyle = g;
      ctx.lineWidth = wBlade;
      ctx.lineCap = opts.round === false ? 'butt' : 'round';
      ctx.beginPath();
      ctx.moveTo(x0, H + 6);
      ctx.quadraticCurveTo(x0 + lean * 0.25, H - h * 0.66, x0 + lean, H - h);
      ctx.stroke();
    }

    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.anisotropy = maxAniso;
    t.encoding = THREE.sRGBEncoding;
    return t;
  }

  // Tør busk: forgrenede kviste med nogle få blade tilbage.
  function shrubTexture() {
    const W = 256, H = 256;
    const c = canvas(W, H);
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    const rnd = M.mulberry32(4711);

    function branch(x, y, ang, len, width, depth) {
      const nx = x + Math.cos(ang) * len;
      const ny = y - Math.sin(ang) * len;
      ctx.strokeStyle = depth > 1 ? 'rgba(96,78,54,1)' : 'rgba(124,104,72,1)';
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo((x + nx) / 2 + (rnd() - 0.5) * 12, (y + ny) / 2, nx, ny);
      ctx.stroke();
      if (depth <= 0 || len < 12) {
        if (rnd() < 0.55) {          // et enkelt blad i spidsen
          ctx.fillStyle = rnd() < 0.5 ? 'rgba(108,124,58,0.95)' : 'rgba(150,142,74,0.95)';
          ctx.beginPath();
          ctx.ellipse(nx, ny, 3 + rnd() * 4, 1.6 + rnd() * 2.2, rnd() * 3, 0, Math.PI * 2);
          ctx.fill();
        }
        return;
      }
      const n = 2 + (rnd() * 2 | 0);
      for (let i = 0; i < n; i++) {
        branch(nx, ny, ang + (rnd() - 0.5) * 1.1, len * (0.55 + rnd() * 0.25),
               width * 0.62, depth - 1);
      }
    }
    for (let i = 0; i < 5; i++) {
      branch(W / 2 + (rnd() - 0.5) * 60, H + 4, Math.PI / 2 + (rnd() - 0.5) * 0.9,
             48 + rnd() * 26, 4.5, 3);
    }

    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.anisotropy = maxAniso;
    t.encoding = THREE.sRGBEncoding;
    return t;
  }

  /* ---------- Bølgenormaler ---------- */
  function waterNormalMap() {
    const S = 256;
    const h = canvas(S);
    const ctx = h.getContext('2d');
    const img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = (y * S + x) * 4;
        // Langstrakte krusninger i to retninger, som vind over stille vand.
        const v = tfbm(x * 0.055, y * 0.11, 4) * 0.6
                + tfbm(x * 0.19, y * 0.09, 3) * 0.4;
        const c = M.clamp(v * 255, 0, 255);
        img.data[i] = img.data[i + 1] = img.data[i + 2] = c;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return normalFromHeight(h, 2.1);
  }

  /* ---------- Skum til vandkanten ---------- */
  function foamTexture() {
    const S = 256;
    const c = canvas(S);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = (y * S + x) * 4;
        const v = tfbm(x * 0.09, y * 0.09, 4) * 0.65 + tfbm(x * 0.35, y * 0.35, 3) * 0.35;
        const f = M.clamp((v - 0.34) * 3.4, 0, 1);
        img.data[i] = img.data[i + 1] = img.data[i + 2] = f * 255;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return toTexture(c, 1, false);
  }

  /* ---------- Lyspunkter ---------- */
  function glowTexture(inner, outer) {
    const S = 128;
    const c = canvas(S);
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, inner || 'rgba(255,255,255,1)');
    g.addColorStop(0.35, outer || 'rgba(255,190,110,0.55)');
    g.addColorStop(1, 'rgba(255,150,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    return new THREE.CanvasTexture(c);
  }

  // Fotografiske teksturer slår håndlavet støj på det, øjet er bedst til at
  // gennemskue: sandkorn, stenens overflade og vandets krusninger. Resten
  // (sandstenens lagdeling, græs, skum) bliver ved med at være genereret,
  // fordi den skal passe til netop denne verdens former.
  // ?raw=1 slår de fotografiske teksturer fra, så vi kan sammenligne dem med
  // de genererede uden at bygge om.
  const RAW = /[?&]raw=1/.test(location.search);

  function useAsset(name, repeat, srgb) {
    if (RAW) return null;
    const t = O.assets && O.assets.get ? O.assets.get(name) : null;
    if (!t) return null;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = maxAniso;
    if (repeat) t.repeat.set(repeat, repeat);
    if (srgb) t.encoding = THREE.sRGBEncoding;
    t.needsUpdate = true;
    return t;
  }

  // De samme støj- og lærredshjælpere bruges af byens teksturer.
  O.texutil = {
    ihash: ihash, tnoise: tnoise, tfbm: tfbm, tridged: tridged,
    canvas: canvas, toTexture: toTexture, normalFromHeight: normalFromHeight,
    setAniso: function (a) { maxAniso = a; }
  };

  let cache = null;
  O.textures = {
    build: function (renderer) {
      if (cache) return cache;
      if (renderer) maxAniso = Math.min(16, renderer.capabilities.getMaxAnisotropy());
      const sand = sandMaps();
      const rock = rockMaps();
      const detail = detailNormalMap();
      const stone = stoneMaps();
      cache = {
        sand: toTexture(sand.color, 56, true),
        sandNormal: toTexture(sand.normal, 56),
        sandRough: toTexture(sand.rough, 56),
        rock: toTexture(rock.color, 1, true),
        rockNormal: toTexture(rock.normal, 1),
        rockRough: toTexture(rock.rough, 1),
        detailNormal: toTexture(detail, 1),
        stone: toTexture(stone.color, 2, true),
        stoneNormal: toTexture(stone.normal, 2),
        macro: toTexture(macroMap(), 1),
        grassFresh: bladeTexture({
          seed: 9182, count: 64, lean: 70, hMin: 0.30, hMax: 0.88, wMin: 3.0, wMax: 8.0, dryMix: 0.6,
          freshPal: ['rgba(46,58,22,1)', 'rgba(84,116,40,1)', 'rgba(160,182,92,1)'],
          dryPal: ['rgba(56,58,26,1)', 'rgba(126,124,54,1)', 'rgba(206,192,120,1)']
        }),
        grassDry: bladeTexture({
          seed: 3311, count: 54, lean: 96, hMin: 0.42, hMax: 1.0, wMin: 2.0, wMax: 5.0, dryMix: 0.25,
          freshPal: ['rgba(58,58,28,1)', 'rgba(118,112,52,1)', 'rgba(196,180,108,1)'],
          dryPal: ['rgba(62,56,28,1)', 'rgba(142,126,62,1)', 'rgba(220,204,140,1)']
        }),
        grassBroad: bladeTexture({
          seed: 7755, count: 26, lean: 44, hMin: 0.24, hMax: 0.62, wMin: 7.0, wMax: 16.0, dryMix: 0.85,
          round: false,
          freshPal: ['rgba(32,50,20,1)', 'rgba(62,96,36,1)', 'rgba(108,142,62,1)'],
          dryPal: ['rgba(46,52,24,1)', 'rgba(96,104,44,1)', 'rgba(150,152,80,1)']
        }),
        shrub: shrubTexture(),
        foam: foamTexture(),
        waterNormal: toTexture(waterNormalMap(), 1),
        glow: glowTexture(),
        spark: glowTexture('rgba(255,255,255,1)', 'rgba(200,230,255,0.5)')
      };
      // Byt de genererede ud med de fotografiske, hvor der findes et bedre.
      const realSand = useAsset('sand', 56, true);
      if (realSand) cache.sand = realSand;
      const realSandN = useAsset('sand_normal', 56, false);
      if (realSandN) cache.sandNormal = realSandN;
      const realGravel = useAsset('ground', 2, true);
      if (realGravel) cache.stone = realGravel;
      const realWaterN = useAsset('water_normal', 1, false);
      if (realWaterN) cache.waterNormal = realWaterN;

      // Klippens lagdeling bliver ved med at være genereret — den skal følge
      // formationernes egne lag — men overfladen får rigtig stenstruktur.
      cache.rockDetail = useAsset('rock_normal', 1, false) || cache.detailNormal;
      cache.caustics = useAsset('caustics', 1, false);

      // Kornoverfladen til klipperne. Den ganges oven på lagfarven, så
      // sandstenen får rigtig struktur uden at miste sin lagdeling.
      cache.rockGrain = useAsset('rock_grain', 1, true);

      // Øens græs og facadernes mursten.
      cache.grass = useAsset('grass', 1, true);
      cache.brick = useAsset('brick', 1, true);

      // Byens egne overflader tegnes efter de fotografiske er på plads,
      // så de kan låne dem (asfaltens grus, murstensfacaderne).
      if (O.citytex) O.citytex.build(cache);

      return cache;
    }
  };
})();
