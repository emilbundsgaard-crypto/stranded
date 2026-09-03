/* ------------------------------------------------------------------
   Kløftens vægge.

   Hver formation bygges som et indekseret gitter rundt om en lodret akse
   (kolonner = vej rundt, rækker = op ad væggen). Radius bestemmes af tre
   ting: en uregelmæssig grundform, en trappeprofil med sandstenslag, og
   erosion — lodrette render og vandrette udhulinger. Fordi gitteret er
   indekseret, bliver normalerne bløde, og stenen ser ud som sten i stedet
   for som papkasser.
   ------------------------------------------------------------------ */
(function () {
  const O = window.OASIS;
  const M = O.math;

  // --- Én formation ---------------------------------------------------
  function mesaGeometry(rnd, opt) {
    const R = opt.radius;
    const cols = opt.cols;

    // Grundform: få, brede buler giver en kantet, men blød silhuet.
    const lobes = [];
    const nLobes = 3 + (rnd() * 4 | 0);
    for (let i = 0; i < nLobes; i++) {
      lobes.push({ k: 1 + (rnd() * 4 | 0), amp: (0.06 + rnd() * 0.16) / nLobes * 2.2, ph: rnd() * 6.28 });
    }
    function outline(a) {
      let s = 1;
      for (const l of lobes) s += Math.sin(a * l.k + l.ph) * l.amp;
      return s;
    }

    // Et par store "bid" ud af siden — kløfter og nedstyrtede partier.
    const bites = [];
    for (let i = 0, n = rnd() < 0.7 ? 1 + (rnd() * 2 | 0) : 0; i < n; i++) {
      bites.push({ a: rnd() * 6.28, w: 0.35 + rnd() * 0.5, d: 0.10 + rnd() * 0.16,
                   y0: rnd() * 0.5, y1: 0.5 + rnd() * 0.6 });
    }

    // Lagene: skiftevis hård bænk (bred) og blød bænk (trukket tilbage).
    const beds = [];
    let y = 0, r = 1;
    while (y < opt.height) {
      const thick = opt.bedMin + rnd() * (opt.bedMax - opt.bedMin);
      let inset = 0.002 + rnd() * 0.010;
      const roll = rnd();
      if (roll < 0.11) inset = 0.035 + rnd() * 0.055;     // markant afsats
      else if (roll < 0.21) inset = -0.008 - rnd() * 0.022; // udhæng
      beds.push({ y0: y, y1: Math.min(y + thick, opt.height), r: r, hard: rnd() < 0.55 });
      r *= (1 - inset);
      y += thick;
    }
    const H = beds[beds.length - 1].y1;

    // Rækker: to tætte rækker ved hver laggrænse (skarp hylde) plus et par
    // mellemrækker inde i laget (så erosionen har noget at forme).
    const rows = [];
    rows.push({ y: -opt.skirt, r: beds[0].r * 1.06, bed: 0 });   // fod nede i sandet
    for (let i = 0; i < beds.length; i++) {
      const b = beds[i];
      const inner = Math.max(1, Math.round((b.y1 - b.y0) / opt.rowStep));
      for (let j = 0; j <= inner; j++) {
        rows.push({ y: b.y0 + (b.y1 - b.y0) * (j / inner), r: b.r, bed: i });
      }
      const next = beds[i + 1];
      if (next) rows.push({ y: b.y1 + 0.05, r: next.r, bed: i + 1 });   // selve hylden
    }

    const nRows = rows.length;
    const pos = new Float32Array(cols * nRows * 3);
    const uv = new Float32Array(cols * nRows * 2);
    const col = new Float32Array(cols * nRows * 3);

    // Erosion: lodrette render (høj frekvens rundt, lav op ad) plus grov ruhed.
    function erode(a, yy) {
      const gully = M.ridged(Math.cos(a) * 4.2 + opt.sx, Math.sin(a) * 4.2 + yy * 0.045, 3);
      const rough = M.fbm(Math.cos(a) * 2.1 + opt.sx, Math.sin(a) * 2.1 + yy * 0.16, 4);
      const fine = M.fbm(Math.cos(a) * 7.5, Math.sin(a) * 7.5 + yy * 0.55, 3);
      return { g: gully, r: rough, f: fine };
    }

    const rads = new Float32Array(cols);
    const us = new Float32Array(cols);

    for (let j = 0; j < nRows; j++) {
      const row = rows[j];
      const yy = row.y;
      const hgt = M.clamp(yy / H, 0, 1);
      const bed = beds[row.bed] || beds[0];
      // Farvebånd: hårde bænke er lysere og mere gule, bløde mere rustne.
      const tone = bed.hard ? 1.03 : 0.95;
      const warm = 0.96 + M.hash2(row.bed * 3.1 + opt.sx, row.bed * 1.7) * 0.10;

      // Først radius hele vejen rundt …
      for (let i = 0; i < cols; i++) {
        const a = (i / cols) * Math.PI * 2;
        const e = erode(a, yy);
        let rad = R * row.r * outline(a);
        rad *= 1 + (e.r - 0.5) * 0.11 + (e.f - 0.5) * 0.04;
        rad -= R * 0.08 * Math.pow(e.g, 1.6) * (0.3 + hgt * 1.0);   // render skærer sig ned
        for (const bt of bites) {
          const da = Math.abs(((a - bt.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          const inA = 1 - M.smoothstep(0, bt.w, da);
          const inY = M.smoothstep(bt.y0 - 0.12, bt.y0 + 0.05, hgt) * (1 - M.smoothstep(bt.y1 - 0.05, bt.y1 + 0.15, hgt));
          rad -= R * bt.d * inA * inY;
        }
        rads[i] = Math.max(0.35, rad);
      }

      // … derefter buelængden rundt om rækken, så teksturen ikke forskydes.
      let arc = 0;
      for (let i = 0; i < cols; i++) {
        const i2 = (i + 1) % cols;
        const a1 = (i / cols) * Math.PI * 2, a2 = (i2 / cols) * Math.PI * 2;
        us[i] = arc;
        arc += Math.hypot(Math.cos(a2) * rads[i2] - Math.cos(a1) * rads[i],
                          Math.sin(a2) * rads[i2] - Math.sin(a1) * rads[i]);
      }
      // Rund af til et helt antal fliser, så sømmen ikke ses.
      const tiles = Math.max(1, Math.round(arc * 0.052));
      const uScale = tiles / Math.max(arc, 0.001);

      for (let i = 0; i < cols; i++) {
        const a = (i / cols) * Math.PI * 2;
        const e = erode(a, yy);
        const rad = rads[i];
        const k = (j * cols + i);
        pos[k * 3] = Math.cos(a) * rad;
        pos[k * 3 + 1] = yy;
        pos[k * 3 + 2] = Math.sin(a) * rad;

        uv[k * 2] = us[i] * uScale;
        uv[k * 2 + 1] = (yy + opt.uvOffset) * 0.050;

        // Vertexfarven bærer lagfarve og en enkel skyggeeffekt: render og
        // sprækker er mørkere, foden er mørkere, toppen er solbleget.
        const ao = 1
          - 0.32 * Math.pow(e.g, 1.4)
          - 0.24 * (1 - M.smoothstep(0, 6, yy))
          - 0.10 * (1 - e.r);
        const bleach = 0.05 * M.smoothstep(0.75, 1.0, hgt);
        col[k * 3] = tone * ao * 1.02 + bleach;
        col[k * 3 + 1] = tone * ao * 0.955 * warm + bleach;
        col[k * 3 + 2] = tone * ao * 0.865 * warm + bleach * 0.9;
      }
    }

    // Indeksering af gitteret + en flad, eroderet top.
    const idx = [];
    for (let j = 0; j < nRows - 1; j++) {
      for (let i = 0; i < cols; i++) {
        const i2 = (i + 1) % cols;
        const a = j * cols + i, b = j * cols + i2;
        const c = (j + 1) * cols + i2, d = (j + 1) * cols + i;
        idx.push(a, d, c, a, c, b);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();

    // Toppen lægges på som et separat, ikke-indekseret stykke, så kanten
    // mellem væg og tag bliver skarp.
    const topPos = [], topUv = [], topCol = [], topNor = [];
    const last = (nRows - 1) * cols;
    const cy = H + 0.15 + M.fbm(opt.sx, opt.sz, 2) * 0.6;
    for (let i = 0; i < cols; i++) {
      const i2 = (i + 1) % cols;
      const p0 = [pos[(last + i) * 3], pos[(last + i) * 3 + 1], pos[(last + i) * 3 + 2]];
      const p1 = [pos[(last + i2) * 3], pos[(last + i2) * 3 + 1], pos[(last + i2) * 3 + 2]];
      const c0 = [0, cy, 0];
      const shade = [1.0, 0.95, 0.86];
      const tri = [c0, p1, p0];
      for (const v of tri) {
        topPos.push(v[0], v[1], v[2]);
        topUv.push(v[0] * 0.03 + 0.5, v[2] * 0.03 + 0.5);
        topCol.push(shade[0], shade[1], shade[2]);
        topNor.push(0, 1, 0);
      }
    }
    const topGeo = new THREE.BufferGeometry();
    topGeo.setAttribute('position', new THREE.Float32BufferAttribute(topPos, 3));
    topGeo.setAttribute('uv', new THREE.Float32BufferAttribute(topUv, 2));
    topGeo.setAttribute('color', new THREE.Float32BufferAttribute(topCol, 3));
    topGeo.setAttribute('normal', new THREE.Float32BufferAttribute(topNor, 3));

    geo.userData = { height: H, top: topGeo };
    return geo;
  }

  // Fletter alt til to buffere (indekseret væg + løs top) i ét mesh.
  function mergeAll(list) {
    let vcount = 0, icount = 0;
    for (const g of list) {
      vcount += g.attributes.position.count;
      icount += g.index ? g.index.count : g.attributes.position.count;
    }
    const pos = new Float32Array(vcount * 3);
    const nor = new Float32Array(vcount * 3);
    const uv = new Float32Array(vcount * 2);
    const col = new Float32Array(vcount * 3);
    const idx = (vcount > 65535) ? new Uint32Array(icount) : new Uint16Array(icount);
    let vo = 0, io = 0;
    for (const g of list) {
      const n = g.attributes.position.count;
      pos.set(g.attributes.position.array, vo * 3);
      nor.set(g.attributes.normal.array, vo * 3);
      uv.set(g.attributes.uv.array, vo * 2);
      col.set(g.attributes.color.array, vo * 3);
      if (g.index) {
        const gi = g.index.array;
        for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
        io += gi.length;
      } else {
        for (let i = 0; i < n; i++) idx[io + i] = vo + i;
        io += n;
      }
      vo += n;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    out.computeBoundingSphere();
    return out;
  }

  O.buildCliffs = function (scene, tex) {
    const rnd = M.mulberry32(O.config.seed + 77);
    const parts = [];
    const placed = [];
    const screePoints = [];

    function place(x, z, radius, height, opts) {
      opts = opts || {};
      if (!opts.overlap) {
        for (const p of placed) {
          if (Math.hypot(p.x - x, p.z - z) < (p.r + radius) * (opts.spacing || 0.9)) return false;
        }
      }
      // Detaljegrad efter afstand til oasen — tæt på skal det holde til
      // at man står med næsen i klippen.
      const dist = Math.hypot(x, z * 0.7);
      const near = dist < 95;
      const mid = dist < 150;
      const cols = near ? 56 : mid ? 34 : 20;
      const rowStep = near ? 1.0 : mid ? 2.0 : 3.4;

      const g = mesaGeometry(rnd, {
        radius: radius,
        height: height,
        cols: cols,
        rowStep: rowStep,
        bedMin: 0.8 + rnd() * 0.5,
        bedMax: 1.9 + rnd() * 1.9,
        skirt: 2.5,
        sx: x * 0.07,
        sz: z * 0.07,
        uvOffset: (x * 0.31 + z * 0.17) % 7
      });
      const base = O.world.height(x, z) - 0.35;
      const top = g.userData.top;
      g.translate(x, base, z);
      top.translate(x, base, z);
      parts.push(g, top);
      placed.push({ x: x, z: z, r: radius });
      O.world.colliders.push({ x: x, z: z, r: radius * 0.88, top: base + g.userData.height });
      if (near) screePoints.push({ x: x, z: z, r: radius });
      return true;
    }

    // 1) Kløftens to vægge langs floden.
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 24; i++) {
        const t = i / 23;
        const z = M.lerp(190, -200, t) + (rnd() - 0.5) * 14;
        let sx = 0, best = Infinity;
        for (const p of O.world.spine) {
          const d = Math.abs(p.z - z);
          if (d < best) { best = d; sx = p.x; }
        }
        const x = sx + side * (56 + rnd() * 34);
        place(x, z, 24 + rnd() * 24, 20 + rnd() * 26, { spacing: 0.78 });
      }
    }

    // 2) Fritstående mesaer tættere på vandet — dem der spejler sig.
    for (let i = 0; i < 20; i++) {
      const ang = rnd() * Math.PI * 2;
      const rad = 34 + rnd() * 28;
      const x = Math.cos(ang) * rad + (rnd() - 0.5) * 36;
      const z = Math.sin(ang) * rad * 1.7 + (rnd() - 0.5) * 60;
      const r = O.world.river(x, z);
      if (r.d < r.w + 7) continue;
      place(x, z, 8 + rnd() * 12, 9 + rnd() * 16);
    }

    // 3) Lave klippehylder helt nede ved vandkanten.
    for (let i = 0; i < 18; i++) {
      const ang = rnd() * Math.PI * 2;
      const rad = 24 + rnd() * 26;
      const x = Math.cos(ang) * rad * 1.2;
      const z = Math.sin(ang) * rad * 2.1;
      const r = O.world.river(x, z);
      if (r.d < r.w + 0.5) continue;
      place(x, z, 2.6 + rnd() * 5, 1.6 + rnd() * 4.5, { spacing: 0.8 });
    }

    // 4) Randen der lukker horisonten. Her må de gerne skære ind i hinanden.
    for (let i = 0; i < 54; i++) {
      const a = (i / 54) * Math.PI * 2 + (rnd() - 0.5) * 0.05;
      const rad = 126 + rnd() * 32;
      place(Math.cos(a) * rad, Math.sin(a) * rad * 1.25, 26 + rnd() * 22, 24 + rnd() * 26, { overlap: true });
    }

    const geo = mergeAll(parts);
    const mat = new THREE.MeshStandardMaterial({
      map: tex.rock,
      normalMap: tex.rockNormal,
      normalScale: new THREE.Vector2(1.15, 1.15),
      roughnessMap: tex.rockRough,
      vertexColors: true,
      roughness: 1.0,
      metalness: 0.0,
      envMapIntensity: 0.9
    });
    O.shaderlib.detailNormal(mat, tex.detailNormal, 9.0, 0.45);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'cliffs';
    scene.add(mesh);

    O.screePoints = screePoints;
    return mesh;
  };
})();
