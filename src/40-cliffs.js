/* ------------------------------------------------------------------
   Kløften: lagdelte sandstensklipper bygget som stablede "skiver",
   præcis den stratificerede look fra referencen. Hver klippe får
   en simpel cylinder-collider, så man ikke kan gå igennem den.
   ------------------------------------------------------------------ */
(function () {
  const O = window.OASIS;
  const M = O.math;

  // Byg én mesa som en stak uregelmæssige prismer med afsatser.
  // Få sider + kraftig hjørnevariation giver den kantede mesa-silhuet;
  // radius aftager kun ganske lidt opad, så den ikke bliver kegleformet.
  function mesaGeometry(rnd, opts) {
    const pos = [];
    const uv = [];
    const col = [];

    const sides = opts.sides;
    const layers = opts.layers;
    const twist = rnd() * Math.PI * 2;

    // Grundform: hvert hjørne har sin egen radius, så omridset bliver kantet.
    const shape = [];
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      shape.push(0.70 + M.fbm(Math.cos(a) * 2.4 + opts.sx, Math.sin(a) * 2.4 + opts.sz, 3) * 0.42 + rnd() * 0.22);
    }

    let y = 0;
    let radius = opts.radius;
    const rings = [];
    for (let l = 0; l < layers; l++) {
      const thick = opts.layerMin + rnd() * (opts.layerMax - opts.layerMin);
      rings.push({ y: y, r: radius, thick: thick });
      y += thick;
      // Næsten lodret væg, men med enkelte markante hylder og udhæng.
      let shrink = 1 - 0.004 - rnd() * 0.014;
      const roll = rnd();
      if (roll < 0.10) shrink = 1 - 0.07 - rnd() * 0.10;   // bred afsats
      else if (roll < 0.18) shrink = 1 + 0.008 + rnd() * 0.02; // udhæng
      radius *= shrink;
    }
    const totalH = y;

    // Lodret erosion: radius varierer lidt med højden, så væggen ikke er en glat prisme.
    function erode(i, yy) {
      return 1
        + M.fbm(i * 1.31 + opts.sx, yy * 0.09 + opts.sz, 3) * 0.14
        + M.fbm(i * 2.7 + opts.sz, yy * 0.42, 2) * 0.05;
    }

    function corner(i, ring, r) {
      const a = twist + (i / sides) * Math.PI * 2;
      const rr = r * shape[i % sides] * erode(i, ring.y);
      return [Math.cos(a) * rr, ring.y, Math.sin(a) * rr];
    }

    function push(p, u, v, shade) {
      pos.push(p[0], p[1], p[2]);
      uv.push(u, v);
      col.push(shade[0], shade[1], shade[2]);
    }

    for (let l = 0; l < rings.length; l++) {
      const ring = rings[l];
      const topY = ring.y + ring.thick;
      const topR = ring.r * (0.994 + rnd() * 0.012);

      // Farvebånd pr. lag — okker, rust og lys sand, men holdt tæt på hinanden.
      const band = 0.93 + M.hash2(l * 2.7 + opts.sx, l * 1.3) * 0.13;
      const warm = 0.94 + M.hash2(l * 5.1, opts.sz) * 0.14;
      const shade = [band * 1.02, band * 0.96 * warm, band * 0.88 * warm];
      const shelf = [shade[0] * 1.10, shade[1] * 1.10, shade[2] * 1.08];
      const under = [shade[0] * 0.62, shade[1] * 0.60, shade[2] * 0.58];

      const next = rings[l + 1];
      const nr = next ? next.r : topR * 0.94;

      for (let i = 0; i < sides; i++) {
        const i2 = (i + 1) % sides;
        const a0 = corner(i, ring, ring.r);
        const a1 = corner(i2, ring, ring.r);
        const b0 = corner(i, { y: topY }, topR);
        const b1 = corner(i2, { y: topY }, topR);

        // UV følger den fysiske størrelse, så lagene har samme skala overalt.
        const seg = Math.hypot(a1[0] - a0[0], a1[2] - a0[2]);
        const u0 = (i * 3.7) % 1.0;
        const u1 = u0 + seg * 0.030;
        const v0 = ring.y * 0.028, v1 = topY * 0.028;

        // Omløbsretning mod uret set udefra, så fladerne (og normalerne)
        // vender ud af klippen.
        push(a0, u0, v0, shade); push(b0, u0, v1, shade); push(b1, u1, v1, shade);
        push(a0, u0, v0, shade); push(b1, u1, v1, shade); push(a1, u1, v0, shade);

        const k = nr / topR;
        const c0 = [b0[0] * k, topY, b0[2] * k];
        const c1 = [b1[0] * k, topY, b1[2] * k];
        if (Math.abs(nr - topR) > 0.02) {
          // Den vandrette flade mellem to lag: en hylde når laget ovenover er
          // smallere, og undersiden af et udhæng når det er bredere. Samme
          // omløbsretning klarer begge — normalen vender af sig selv.
          const tone = nr < topR ? shelf : under;
          push(b0, u0, v1, tone); push(c1, u1, v1 + 0.14, tone); push(b1, u1, v1, tone);
          push(b0, u0, v1, tone); push(c0, u0, v1 + 0.14, tone); push(c1, u1, v1 + 0.14, tone);
        }
      }
    }

    // Fladt tag med plan UV-projektion (ellers får man ringe som en skydeskive).
    const topRing = rings[rings.length - 1];
    const ty = topRing.y + topRing.thick;
    const tr = topRing.r * 0.94;
    const shadeTop = [0.94, 0.89, 0.80];
    const uvScale = 0.03;
    for (let i = 0; i < sides; i++) {
      const i2 = (i + 1) % sides;
      const p0 = corner(i, { y: ty }, tr);
      const p1 = corner(i2, { y: ty }, tr);
      // Toppen hæves kun i midten, så den bulder let uden at der opstår
      // sprækker mod sidevæggens øverste ring.
      const c = [0, ty + 0.4 + M.fbm(opts.sx, opts.sz, 2) * 1.4, 0];
      push(c, c[0] * uvScale + 0.5, c[2] * uvScale + 0.5, shadeTop);
      push(p1, p1[0] * uvScale + 0.5, p1[2] * uvScale + 0.5, shadeTop);
      push(p0, p0[0] * uvScale + 0.5, p0[2] * uvScale + 0.5, shadeTop);
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    g.userData.height = totalH;
    return g;
  }

  // Sammenflet flere geometrier til ét mesh (færre draw calls).
  function merge(list) {
    let n = 0;
    for (const g of list) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3);
    const nor = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2);
    const col = new Float32Array(n * 3);
    let o = 0;
    for (const g of list) {
      const c = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3);
      nor.set(g.attributes.normal.array, o * 3);
      uv.set(g.attributes.uv.array, o * 2);
      col.set(g.attributes.color.array, o * 3);
      o += c;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    out.computeBoundingSphere();
    return out;
  }

  O.buildCliffs = function (scene, tex) {
    const rnd = M.mulberry32(O.config.seed + 77);
    const parts = [];
    const placed = [];

    function tryPlace(x, z, radius, layers, sides, minDist) {
      for (const p of placed) {
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < (p.r + radius) * (minDist || 0.92)) return false;
      }
      const g = mesaGeometry(rnd, {
        radius: radius,
        layers: layers,
        sides: sides,
        sx: x * 0.11,
        sz: z * 0.11,
        layerMin: 0.7 + rnd() * 0.5,
        layerMax: 1.8 + rnd() * 1.8
      });
      // Sæt den lidt ned i terrænet så der ikke er luft under kanten.
      const base = O.world.height(x, z) - 1.2;
      g.translate(x, base, z);
      parts.push(g);
      placed.push({ x: x, z: z, r: radius, h: base + g.userData.height });
      O.world.colliders.push({ x: x, z: z, r: radius * 0.86, top: base + g.userData.height });
      return true;
    }

    // 1) Kløftvæggene: to lange rækker af høje klipper langs floden.
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 26; i++) {
        const t = i / 25;
        const z = M.lerp(190, -200, t) + (rnd() - 0.5) * 16;
        // Find flodens x på den her z-værdi ved at søge langs rygraden.
        let sx = 0;
        let best = Infinity;
        for (const p of O.world.spine) {
          const d = Math.abs(p.z - z);
          if (d < best) { best = d; sx = p.x; }
        }
        const dist = 58 + rnd() * 38;
        const x = sx + side * dist;
        tryPlace(x, z, 26 + rnd() * 26, 9 + (rnd() * 9 | 0), 6 + (rnd() * 4 | 0), 0.72);
      }
    }

    // 2) Fritstående mesaer tættere på vandet — dem man ser spejlet.
    for (let i = 0; i < 22; i++) {
      const ang = rnd() * Math.PI * 2;
      const rad = 34 + rnd() * 30;
      const x = Math.cos(ang) * rad + (rnd() - 0.5) * 40;
      const z = Math.sin(ang) * rad * 1.6 + (rnd() - 0.5) * 60;
      const r = O.world.river(x, z);
      if (r.d < r.w + 8) continue;              // ikke midt i floden
      tryPlace(x, z, 9 + rnd() * 15, 5 + (rnd() * 7 | 0), 6 + (rnd() * 4 | 0));
    }

    // 3) Store klippeblokke i kanten af vandet.
    for (let i = 0; i < 16; i++) {
      const ang = rnd() * Math.PI * 2;
      const rad = 26 + rnd() * 26;
      const x = Math.cos(ang) * rad * 1.2;
      const z = Math.sin(ang) * rad * 2.2;
      const r = O.world.river(x, z);
      if (r.d < r.w + 1) continue;
      tryPlace(x, z, 2.4 + rnd() * 4.8, 4 + (rnd() * 5 | 0), 7 + (rnd() * 3 | 0));
    }

    // 4) Fjern klipperand hele vejen rundt, så man aldrig ser terrænets
    //    kant. Her må formationerne gerne overlappe — det er én lang væg.
    for (let i = 0; i < 52; i++) {
      const a = (i / 52) * Math.PI * 2 + (rnd() - 0.5) * 0.05;
      const rad = 128 + rnd() * 30;
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad * 1.25;
      const radius = 26 + rnd() * 22;
      const g = mesaGeometry(rnd, {
        radius: radius, layers: 10 + (rnd() * 10 | 0), sides: 6 + (rnd() * 3 | 0),
        sx: x * 0.11, sz: z * 0.11,
        layerMin: 1.0 + rnd() * 0.6, layerMax: 2.2 + rnd() * 2.0
      });
      const base = O.world.height(x, z) - 2.0;
      g.translate(x, base, z);
      parts.push(g);
      O.world.colliders.push({ x: x, z: z, r: radius * 0.8, top: base + g.userData.height });
    }

    const geo = merge(parts);
    const mat = new THREE.MeshStandardMaterial({
      map: tex.rock,
      normalMap: tex.rockNormal,
      normalScale: new THREE.Vector2(1.1, 1.1),
      vertexColors: true,
      roughness: 0.92,
      metalness: 0.0
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'cliffs';
    scene.add(mesh);
    return mesh;
  };
})();
