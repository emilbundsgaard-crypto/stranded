/* ------------------------------------------------------------------
   Alle teksturer tegnes i browseren med canvas — ingen filer at
   hente, så scenen kan åbnes direkte uden nogen assets.
   ------------------------------------------------------------------ */
(function () {
  const O = window.OASIS;
  const M = O.math;

  function canvas(size, h) {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = h || size;
    return c;
  }

  function toTexture(c, repeat) {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (repeat) t.repeat.set(repeat, repeat);
    return t;
  }

  // Sobel-filter der laver et normalkort ud fra en gråtoneskitse.
  function normalFromHeight(src, strength) {
    const s = src.width, hgt = src.height;
    const sctx = src.getContext('2d');
    const data = sctx.getImageData(0, 0, s, hgt).data;
    const out = canvas(s, hgt);
    const octx = out.getContext('2d');
    const img = octx.createImageData(s, hgt);
    const at = (x, y) => data[((y + hgt) % hgt * s + ((x + s) % s)) * 4] / 255;
    for (let y = 0; y < hgt; y++) {
      for (let x = 0; x < s; x++) {
        const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
        const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
        let nx = -dx, ny = -dy, nz = 1;
        const l = Math.hypot(nx, ny, nz);
        const i = (y * s + x) * 4;
        img.data[i] = (nx / l * 0.5 + 0.5) * 255;
        img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255;
        img.data[i + 2] = (nz / l * 0.5 + 0.5) * 255;
        img.data[i + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);
    return out;
  }

  /* ---- Sand ---- */
  function sandMaps() {
    const S = 512;
    const col = canvas(S);
    const hgt = canvas(S);
    const cctx = col.getContext('2d');
    const hctx = hgt.getContext('2d');
    const ci = cctx.createImageData(S, S);
    const hi = hctx.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = (y * S + x) * 4;
        const grain = M.fbm(x * 0.35, y * 0.35, 3);
        const ripple = Math.sin((x * 0.055 + M.fbm(x * 0.02, y * 0.02, 2) * 3.0)) * 0.5;
        const speck = M.hash2(x, y) > 0.985 ? 0.32 : 0;
        const v = 0.5 + grain * 0.14 + ripple * 0.06 + speck;
        ci.data[i] = M.clamp(214 * v + 34, 0, 255);
        ci.data[i + 1] = M.clamp(184 * v + 26, 0, 255);
        ci.data[i + 2] = M.clamp(142 * v + 16, 0, 255);
        ci.data[i + 3] = 255;
        const hv = M.clamp((0.5 + grain * 0.4 + ripple * 0.35 + speck) * 255, 0, 255);
        hi.data[i] = hi.data[i + 1] = hi.data[i + 2] = hv;
        hi.data[i + 3] = 255;
      }
    }
    cctx.putImageData(ci, 0, 0);
    hctx.putImageData(hi, 0, 0);
    return { color: col, normal: normalFromHeight(hgt, 2.2) };
  }

  /* ---- Sandsten med vandrette lag ---- */
  function rockMaps() {
    const S = 512;
    const col = canvas(S);
    const hgt = canvas(S);
    const cctx = col.getContext('2d');
    const hctx = hgt.getContext('2d');
    const ci = cctx.createImageData(S, S);
    const hi = hctx.createImageData(S, S);

    // Lagfarver — varme sandstenstoner som i en tør kløft. Færre og
    // tykkere bånd, så klippen ikke ligner fløjlsbukser.
    const bands = [];
    for (let i = 0; i < 20; i++) {
      bands.push({
        y: i / 20,
        tint: 0.86 + M.hash2(i * 1.7, 2.9) * 0.24,
        warm: M.hash2(i * 5.1, 11.3)
      });
    }

    for (let y = 0; y < S; y++) {
      const v = y / S;
      let band = bands[0];
      for (let i = 0; i < bands.length; i++) if (bands[i].y <= v) band = bands[i];
      for (let x = 0; x < S; x++) {
        const i = (y * S + x) * 4;
        // Lagene bølger let, så de ikke ser tegnede ud.
        const warp = M.fbm(x * 0.009, y * 0.035, 3) * 9.0;
        const yy = y + warp;
        const layer = Math.sin(yy * 0.22) * 0.5 + 0.5;
        const fine = Math.sin(yy * 1.1) * 0.5 + 0.5;
        const grain = M.fbm(x * 0.07, yy * 0.34, 4);
        const crack = M.ridged(x * 0.03, yy * 0.016, 3);
        // Lodret "desert varnish" der bryder det vandrette mønster.
        const varnish = M.fbm(x * 0.05, yy * 0.006, 3) * 0.5 + 0.5;
        const shade = 0.70 + layer * 0.13 + fine * 0.05 + grain * 0.13
                    - Math.pow(crack, 3.0) * 0.28 - Math.pow(varnish, 2.5) * 0.16;
        const tint = band.tint * shade;
        ci.data[i] = M.clamp(198 * tint + 34, 0, 255);
        ci.data[i + 1] = M.clamp(139 * tint * (0.92 + band.warm * 0.16) + 22, 0, 255);
        ci.data[i + 2] = M.clamp(94 * tint * (0.82 + band.warm * 0.28) + 12, 0, 255);
        ci.data[i + 3] = 255;
        const hv = M.clamp((0.45 + layer * 0.28 + fine * 0.12 + grain * 0.2
                    - Math.pow(crack, 3.0) * 0.45) * 255, 0, 255);
        hi.data[i] = hi.data[i + 1] = hi.data[i + 2] = hv;
        hi.data[i + 3] = 255;
      }
    }
    cctx.putImageData(ci, 0, 0);
    hctx.putImageData(hi, 0, 0);
    return { color: col, normal: normalFromHeight(hgt, 3.4) };
  }

  /* ---- Græstot (alfa-tekstur til billboards) ---- */
  function grassTexture() {
    const W = 128, H = 128;
    const c = canvas(W, H);
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    const rnd = M.mulberry32(9182);
    // Bredt fæste og strå der bøjer udad — som de tørre totter langs vandet.
    for (let i = 0; i < 40; i++) {
      const x0 = 14 + rnd() * (W - 28);
      const dir = x0 < W / 2 ? -1 : 1;
      const lean = dir * (8 + rnd() * 42) * (0.4 + rnd());
      const h = H * (0.34 + rnd() * 0.52);
      const wBlade = 2.6 + rnd() * 3.4;
      const dry = rnd();
      const g = ctx.createLinearGradient(0, H, 0, H - h);
      g.addColorStop(0, 'rgba(44,52,22,1)');
      g.addColorStop(0.4, dry > 0.5 ? 'rgba(118,116,48,1)' : 'rgba(78,102,38,1)');
      g.addColorStop(1, dry > 0.5 ? 'rgba(152,140,74,1)' : 'rgba(104,124,52,1)');
      ctx.strokeStyle = g;
      ctx.lineWidth = wBlade;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, H + 4);
      ctx.quadraticCurveTo(x0 + lean * 0.25, H - h * 0.62, x0 + lean, H - h);
      ctx.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  }

  /* ---- Blødt lys-punkt til ild, glimt og støv ---- */
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

  let cache = null;
  O.textures = {
    build: function () {
      if (cache) return cache;
      const sand = sandMaps();
      const rock = rockMaps();
      cache = {
        sand: toTexture(sand.color, 64),
        sandNormal: toTexture(sand.normal, 64),
        rock: toTexture(rock.color, 1),
        rockNormal: toTexture(rock.normal, 1),
        grass: grassTexture(),
        glow: glowTexture(),
        spark: glowTexture('rgba(255,255,255,1)', 'rgba(200,230,255,0.5)')
      };
      cache.sand.encoding = THREE.sRGBEncoding;
      cache.rock.encoding = THREE.sRGBEncoding;
      cache.grass.encoding = THREE.sRGBEncoding;
      return cache;
    }
  };
})();
