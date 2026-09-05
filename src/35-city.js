/* ------------------------------------------------------------------
   Byen: veje, fortove, karreer, huse og gadeinventar.

   Alt bygges i hele mål, fordi det er dét, der får en by til at se
   bygget ud i stedet for genereret: et fag er 3 meter, en etage er
   3 meter, og facadeteksturen er tegnet i præcis det mål. Husene
   snappes til fag, så vinduesrækkerne flugter hele vejen ned ad gaden.

   Hver bygning er fire vægplaner og et tag — ikke en kasse. Det halverer
   trekanterne (ingen indvendige flader) og giver fuld kontrol over
   teksturkoordinaterne, så facaden hverken strækkes eller skæres over.
   Alt af samme materiale flettes til ét net, så hele byen tegnes i en
   håndfuld kald.
   ------------------------------------------------------------------ */
(function () {
  const O = window.OASIS;
  const M = O.math;
  const C = O.config.city;
  const BGU = THREE.BufferGeometryUtils;

  const BAY = 3.0;          // et fag
  const FLOOR = 3.0;        // en etage
  const SHOP_H = 4.0;       // stueetagens højde
  const FACADE_TILE = 12.0; // facadeteksturen dækker 12 × 12 meter
  const SHOP_TILE_W = 12.0;
  const SHOP_TILE_H = 4.0;

  function snap(v, unit) { return Math.max(unit, Math.round(v / unit) * unit); }

  // Hver bygning får sin egen tone lagt ind som vertexfarve. Uden den
  // står seks facadevarianter og gentager sig selv ned ad hele gaden.
  function tintGeo(g, c) {
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  }

  // Et vægplan med teksturkoordinater i meter i stedet for 0–1.
  function wall(w, h, tileW, tileH) {
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) * (w / tileW), uv.getY(i) * (h / tileH));
    }
    return g;
  }

  function flat(w, d, tile) {
    const g = new THREE.PlaneGeometry(w, d);
    g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) * (w / tile), uv.getY(i) * (d / tile));
    }
    return g;
  }

  // Fire vægge omkring et rektangel, hver vendt udad.
  function boxWalls(w, d, h, tileW, tileH, y0) {
    const out = [];
    const dirs = [
      { rot: 0, x: 0, z: d / 2, len: w },
      { rot: Math.PI, x: 0, z: -d / 2, len: w },
      { rot: Math.PI / 2, x: w / 2, z: 0, len: d },
      { rot: -Math.PI / 2, x: -w / 2, z: 0, len: d }
    ];
    for (const dir of dirs) {
      const g = wall(dir.len, h, tileW, tileH);
      g.rotateY(dir.rot);
      g.translate(dir.x, y0 + h / 2, dir.z);
      out.push(g);
    }
    return out;
  }

  O.buildCity = function (scene, tex) {
    const rnd = M.mulberry32(O.config.seed ^ 0x5c17);
    const group = new THREE.Group();
    group.name = 'city';
    const Y = O.world.PLATEAU;
    const KERB = C.kerb;
    const CITY = O.world.CITY;

    const av = C.avenues, st = C.streets;
    const RH = C.roadHalf;

    /* ================= Veje ================= */
    const roadGeos = [];
    const markGeos = [];

    // Alléerne løber ubrudt fra nord til syd.
    for (const x of av) {
      const z0 = st[0] - RH, z1 = st[st.length - 1] + RH;
      const g = flat(RH * 2, z1 - z0, 8.0);
      g.translate(x, Y + 0.01, (z0 + z1) / 2);
      roadGeos.push(g);
    }
    // Tværgaderne fylder kun mellem alléerne, så asfalten ikke ligger
    // dobbelt i krydsene og flimrer.
    for (const z of st) {
      for (let i = 0; i < av.length - 1; i++) {
        const x0 = av[i] + RH, x1 = av[i + 1] - RH;
        const g = flat(x1 - x0, RH * 2, 8.0);
        g.translate((x0 + x1) / 2, Y + 0.01, z);
        roadGeos.push(g);
      }
      // Enderne ud mod byens kant.
      const eg0 = flat(av[0] - RH - (CITY.x0 + 8), RH * 2, 8.0);
      eg0.translate((CITY.x0 + 8 + av[0] - RH) / 2, Y + 0.01, z);
      roadGeos.push(eg0);
      const eg1 = flat((CITY.x1 - 8) - (av[av.length - 1] + RH), RH * 2, 8.0);
      eg1.translate((av[av.length - 1] + RH + CITY.x1 - 8) / 2, Y + 0.01, z);
      roadGeos.push(eg1);
    }

    // Midterstriber: stiplede, og de stopper før krydsene.
    function dashes(x0, z0, x1, z1) {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const ux = (x1 - x0) / len, uz = (z1 - z0) / len;
      const step = 5.0, dash = 2.6;
      for (let s = 2; s + dash < len; s += step) {
        const g = new THREE.PlaneGeometry(Math.abs(ux) > 0.5 ? dash : 0.16,
                                          Math.abs(ux) > 0.5 ? 0.16 : dash);
        g.rotateX(-Math.PI / 2);
        g.translate(x0 + ux * (s + dash / 2), Y + 0.022, z0 + uz * (s + dash / 2));
        markGeos.push(g);
      }
    }
    for (const x of av) {
      for (let i = 0; i < st.length - 1; i++) dashes(x, st[i] + RH + 1, x, st[i + 1] - RH - 1);
    }
    for (const z of st) {
      for (let i = 0; i < av.length - 1; i++) dashes(av[i] + RH + 1, z, av[i + 1] - RH - 1, z);
    }
    // Fodgængerfelter ind mod hvert kryds.
    for (const x of av) {
      for (const z of st) {
        for (let side = 0; side < 4; side++) {
          for (let b = 0; b < 9; b++) {
            const off = -RH + 1.3 + b * 1.45;
            const g = new THREE.PlaneGeometry(side < 2 ? 0.62 : 3.4, side < 2 ? 3.4 : 0.62);
            g.rotateX(-Math.PI / 2);
            const d = RH + 1.8;
            if (side === 0) g.translate(x + off, Y + 0.022, z - d);
            else if (side === 1) g.translate(x + off, Y + 0.022, z + d);
            else if (side === 2) g.translate(x - d, Y + 0.022, z + off);
            else g.translate(x + d, Y + 0.022, z + off);
            markGeos.push(g);
          }
        }
      }
    }

    const asphaltMat = new THREE.MeshStandardMaterial({
      map: tex.asphalt, normalMap: tex.asphaltNormal,
      normalScale: new THREE.Vector2(0.8, 0.8),
      color: new THREE.Color(0.62, 0.64, 0.70),
      roughness: 0.94, metalness: 0.0, envMapIntensity: 0.5
    });
    const roadMesh = new THREE.Mesh(BGU.mergeBufferGeometries(roadGeos), asphaltMat);
    roadMesh.receiveShadow = true;
    roadMesh.name = 'roads';
    group.add(roadMesh);

    const markMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0.55, 0.54, 0.50), roughness: 0.85, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3
    });
    const markMesh = new THREE.Mesh(BGU.mergeBufferGeometries(markGeos), markMat);
    markMesh.receiveShadow = true;
    group.add(markMesh);

    /* ================= Karreer og fortove ================= */
    const walkGeos = [];
    const kerbGeos = [];
    const blocks = [];

    function slab(x0, z0, x1, z1) {
      const w = x1 - x0, d = z1 - z0;
      const top = flat(w, d, 4.0);
      top.translate((x0 + x1) / 2, Y + KERB, (z0 + z1) / 2);
      walkGeos.push(top);
      // Kantstenens fire lodrette flader.
      const sides = boxWalls(w, d, KERB, 1.0, 1.0, Y);
      for (const s of sides) { s.translate((x0 + x1) / 2, 0, (z0 + z1) / 2); kerbGeos.push(s); }
    }

    for (let i = 0; i < av.length - 1; i++) {
      for (let j = 0; j < st.length - 1; j++) {
        const x0 = av[i] + RH, x1 = av[i + 1] - RH;
        const z0 = st[j] + RH, z1 = st[j + 1] - RH;
        slab(x0, z0, x1, z1);
        blocks.push({ x0: x0, z0: z0, x1: x1, z1: z1, col: i, row: j });
      }
    }

    const concreteMat = new THREE.MeshStandardMaterial({
      map: tex.concrete, normalMap: tex.concreteNormal,
      normalScale: new THREE.Vector2(0.7, 0.7),
      color: new THREE.Color(0.60, 0.61, 0.63),
      roughness: 0.92, metalness: 0.0, envMapIntensity: 0.5
    });
    const walkMesh = new THREE.Mesh(BGU.mergeBufferGeometries(walkGeos), concreteMat);
    walkMesh.receiveShadow = true;
    walkMesh.name = 'sidewalks';
    group.add(walkMesh);

    const kerbMat = new THREE.MeshStandardMaterial({
      map: tex.concrete, color: new THREE.Color(0.72, 0.72, 0.72),
      roughness: 0.88, metalness: 0.0
    });
    const kerbMesh = new THREE.Mesh(BGU.mergeBufferGeometries(kerbGeos), kerbMat);
    kerbMesh.castShadow = true;
    kerbMesh.receiveShadow = true;
    group.add(kerbMesh);

    /* ================= Husene ================= */
    const BASE = Y + KERB;
    const facadeGeos = tex.facades.map(function () { return []; });
    const shopGeos = [];
    const roofGeos = [];
    const trimGeos = [];
    const buildings = [];

    // Bykernen ligger midt i gitteret: derfra falder husene i højde ud mod
    // stranden. Det er dét, der giver en skyline i stedet for en mur.
    function heightScore(cx, cz) {
      const d = Math.hypot(cx / 90, (cz + 20) / 90);
      return M.clamp(1.25 - d, 0, 1);
    }

    function makeBuilding(x0, z0, x1, z1) {
      let w = snap(x1 - x0, BAY), d = snap(z1 - z0, BAY);
      if (w < 6 || d < 6) return;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;

      const score = heightScore(cx, cz);
      const floors = Math.max(1, Math.round(1 + score * 9 + rnd() * 3.2));
      const towerH = floors * FLOOR;
      const total = SHOP_H + towerH;

      const fi = (rnd() * tex.facades.length) | 0;
      // Tonen holdes tæt på hvid: den skal variere husene, ikke farve dem.
      const tint = new THREE.Color(
        0.80 + rnd() * 0.36, 0.80 + rnd() * 0.34, 0.78 + rnd() * 0.38);
      const shopTint = new THREE.Color(
        0.78 + rnd() * 0.42, 0.78 + rnd() * 0.40, 0.76 + rnd() * 0.44);

      // Stueetagen springer en anelse frem — det er dét, der giver en gade
      // skyggelinjen langs butiksruderne.
      const sw = w + 0.5, sd = d + 0.5;
      for (const g of boxWalls(sw, sd, SHOP_H, SHOP_TILE_W, SHOP_TILE_H, 0)) {
        g.translate(cx, BASE, cz);
        shopGeos.push(tintGeo(g, shopTint));
      }

      // Tårnet.
      for (const g of boxWalls(w, d, towerH, FACADE_TILE, FACADE_TILE, 0)) {
        g.translate(cx, BASE + SHOP_H, cz);
        facadeGeos[fi].push(tintGeo(g, tint));
      }

      // Gesims over stueetagen og under tagkanten.
      function ledge(y, over, th) {
        const g = new THREE.BoxGeometry(w + over, th, d + over);
        g.translate(cx, BASE + y, cz);
        trimGeos.push(g);
      }
      ledge(SHOP_H + 0.1, 1.0, 0.22);

      // Tagfladen.
      const rg = flat(w, d, 6.0);
      rg.translate(cx, BASE + total, cz);
      roofGeos.push(rg);

      // Brystværn hele vejen rundt.
      const pw = 0.30, ph = 0.85;
      for (const s of [[0, d / 2, w + pw, pw], [0, -d / 2, w + pw, pw],
                       [w / 2, 0, pw, d + pw], [-w / 2, 0, pw, d + pw]]) {
        const g = new THREE.BoxGeometry(s[2], ph, s[3]);
        g.translate(cx + s[0], BASE + total + ph / 2, cz + s[1]);
        trimGeos.push(g);
      }

      // Tagets teknik: ventilationskasser, vandtank, trappehus, antenne.
      const props = 1 + ((rnd() * 3) | 0);
      for (let i = 0; i < props; i++) {
        const bw = 1.2 + rnd() * 2.2, bh = 0.8 + rnd() * 1.4, bd = 1.0 + rnd() * 1.8;
        const g = new THREE.BoxGeometry(bw, bh, bd);
        g.translate(cx + (rnd() - 0.5) * (w - bw - 1.5),
                    BASE + total + bh / 2,
                    cz + (rnd() - 0.5) * (d - bd - 1.5));
        trimGeos.push(g);
      }
      if (floors >= 4 && rnd() < 0.7) {
        const sh = 2.6;
        const g = new THREE.BoxGeometry(3.0, sh, 3.0);
        g.translate(cx + (rnd() - 0.5) * (w - 5), BASE + total + sh / 2, cz + (rnd() - 0.5) * (d - 5));
        trimGeos.push(g);
      }
      if (floors >= 6 && rnd() < 0.6) {
        const mh = 3 + rnd() * 5;
        const g = new THREE.BoxGeometry(0.14, mh, 0.14);
        g.translate(cx + (rnd() - 0.5) * (w - 3), BASE + total + mh / 2, cz + (rnd() - 0.5) * (d - 3));
        trimGeos.push(g);
      }

      O.world.addBox(cx - sw / 2, cz - sd / 2, cx + sw / 2, cz + sd / 2, BASE + total + 1.0);
      buildings.push({ x: cx, z: cz, w: w, d: d, h: total, top: BASE + total });
    }

    // Karreen deles i grunde. To eller tre i hver retning, med en smal
    // luftspalte imellem, så husene ikke smelter sammen til én klump.
    for (const b of blocks) {
      const nx = 2 + ((rnd() * 2) | 0);
      const nz = 2 + ((rnd() * 2) | 0);
      const gap = 0.9;
      const bw = (b.x1 - b.x0 - 2 * 2.2) / nx;
      const bd = (b.z1 - b.z0 - 2 * 2.2) / nz;
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < nz; j++) {
          // Et par grunde står tomme og bliver til parkeringsplads eller gård.
          if (rnd() < 0.10) continue;
          const x0 = b.x0 + 2.2 + i * bw + gap * 0.5;
          const z0 = b.z0 + 2.2 + j * bd + gap * 0.5;
          makeBuilding(x0, z0, x0 + bw - gap, z0 + bd - gap);
        }
      }
    }

    for (let i = 0; i < tex.facades.length; i++) {
      if (!facadeGeos[i].length) continue;
      const f = tex.facades[i];
      const mat = new THREE.MeshStandardMaterial({
        map: f.map, normalMap: f.normal, roughnessMap: f.rough,
        emissiveMap: f.emissive, emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 0.55,
        normalScale: new THREE.Vector2(0.9, 0.9),
        color: new THREE.Color(0.62, 0.645, 0.70),
        vertexColors: true,
        roughness: 1.0, metalness: 0.0, envMapIntensity: 0.8
      });
      // Vinduerne skal se ud som huller i muren, ikke som klistermærker.
      // Et normalkort alene gør det ikke på en flad væg — men parallax
      // forskyder teksturen efter kigvinklen, og så falder karmen ind i
      // muren, når man går forbi. Kun tæt på: længere væk er det spild.
      if (O.quality.get('pom')) O.shaderlib.parallax(mat, f.normal, 0.016, 34.0);
      const m = new THREE.Mesh(BGU.mergeBufferGeometries(facadeGeos[i]), mat);
      m.castShadow = true; m.receiveShadow = true;
      m.name = 'facade' + i;
      group.add(m);
    }

    const shopMat = new THREE.MeshStandardMaterial({
      map: tex.shop.map, normalMap: tex.shop.normal, roughnessMap: tex.shop.rough,
      emissiveMap: tex.shop.emissive, emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.9,
      color: new THREE.Color(0.66, 0.68, 0.74),
      vertexColors: true,
      roughness: 1.0, metalness: 0.0, envMapIntensity: 1.0
    });
    const shopMesh = new THREE.Mesh(BGU.mergeBufferGeometries(shopGeos), shopMat);
    shopMesh.castShadow = true; shopMesh.receiveShadow = true;
    group.add(shopMesh);

    const roofMat = new THREE.MeshStandardMaterial({
      map: tex.roof, normalMap: tex.roofNormal,
      color: new THREE.Color(0.52, 0.53, 0.56),
      roughness: 0.95, metalness: 0.0, envMapIntensity: 0.5
    });
    const roofMesh = new THREE.Mesh(BGU.mergeBufferGeometries(roofGeos), roofMat);
    roofMesh.receiveShadow = true;
    group.add(roofMesh);

    const trimMat = new THREE.MeshStandardMaterial({
      color: O.srgb(0xb9b3a6), roughness: 0.9, metalness: 0.0, envMapIntensity: 0.6
    });
    const trimMesh = new THREE.Mesh(BGU.mergeBufferGeometries(trimGeos), trimMat);
    trimMesh.castShadow = true; trimMesh.receiveShadow = true;
    group.add(trimMesh);

    /* ================= Gadeinventar ================= */
    const detail = O.quality.get('streetProps');

    // En lygtepæl flettet til ét net, sat ud med instansering.
    function lampGeo() {
      const parts = [];
      const pole = new THREE.CylinderGeometry(0.09, 0.13, 6.4, 8);
      pole.translate(0, 3.2, 0);
      parts.push(pole);
      const foot = new THREE.CylinderGeometry(0.22, 0.26, 0.35, 8);
      foot.translate(0, 0.17, 0);
      parts.push(foot);
      const arm = new THREE.CylinderGeometry(0.06, 0.06, 1.5, 6);
      arm.rotateZ(Math.PI / 2);
      arm.translate(0.75, 6.3, 0);
      parts.push(arm);
      const head = new THREE.BoxGeometry(0.8, 0.2, 0.42);
      head.translate(1.4, 6.18, 0);
      parts.push(head);
      return BGU.mergeBufferGeometries(parts);
    }
    const lampMat = new THREE.MeshStandardMaterial({
      color: O.srgb(0x2b2f33), roughness: 0.55, metalness: 0.7, envMapIntensity: 1.0
    });
    // Linsen sidder for enden af armen. Forskydningen bages ind i
    // geometrien, så instansen kan bruge præcis samme matrix som masten.
    const lensGeo = new THREE.BoxGeometry(0.66, 0.06, 0.32);
    lensGeo.translate(1.4, 6.06, 0);
    const lensMat = new THREE.MeshStandardMaterial({
      color: O.srgb(0xfff0cf), emissive: O.srgb(0xffdca0), emissiveIntensity: 1.6,
      roughness: 0.4, metalness: 0
    });

    const lampSpots = [];
    for (const b of blocks) {
      const step = 17;
      for (let x = b.x0 + 4; x < b.x1 - 2; x += step) {
        lampSpots.push({ x: x, z: b.z0 + 1.2, r: Math.PI });
        lampSpots.push({ x: x, z: b.z1 - 1.2, r: 0 });
      }
      for (let z = b.z0 + 10; z < b.z1 - 2; z += step) {
        lampSpots.push({ x: b.x0 + 1.2, z: z, r: Math.PI / 2 });
        lampSpots.push({ x: b.x1 - 1.2, z: z, r: -Math.PI / 2 });
      }
    }
    const lampCount = Math.max(8, Math.round(lampSpots.length * detail));
    const lamps = new THREE.InstancedMesh(lampGeo(), lampMat, lampCount);
    const lenses = new THREE.InstancedMesh(lensGeo, lensMat, lampCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < lampCount; i++) {
      const s = lampSpots[(i * 7919) % lampSpots.length];
      dummy.position.set(s.x, BASE, s.z);
      dummy.rotation.set(0, s.r, 0);
      dummy.updateMatrix();
      lamps.setMatrixAt(i, dummy.matrix);
      lenses.setMatrixAt(i, dummy.matrix);
      O.world.addCircle(s.x, s.z, 0.22, BASE + 6.4);
    }
    lamps.castShadow = true;
    lamps.instanceMatrix.needsUpdate = true;
    lenses.instanceMatrix.needsUpdate = true;
    group.add(lamps);
    group.add(lenses);

    // Trafiklys i krydsene.
    function trafficGeo() {
      const parts = [];
      const pole = new THREE.CylinderGeometry(0.08, 0.10, 4.2, 8);
      pole.translate(0, 2.1, 0);
      parts.push(pole);
      const box = new THREE.BoxGeometry(0.34, 0.95, 0.30);
      box.translate(0, 3.9, 0);
      parts.push(box);
      const hood = new THREE.BoxGeometry(0.40, 0.06, 0.36);
      hood.translate(0, 4.42, 0);
      parts.push(hood);
      return BGU.mergeBufferGeometries(parts);
    }
    const lightSpots = [];
    for (const x of av) {
      for (const z of st) {
        lightSpots.push({ x: x - RH - 1.6, z: z - RH - 1.6 });
        lightSpots.push({ x: x + RH + 1.6, z: z + RH + 1.6 });
      }
    }
    const tl = new THREE.InstancedMesh(trafficGeo(), lampMat, lightSpots.length);
    for (let i = 0; i < lightSpots.length; i++) {
      dummy.position.set(lightSpots[i].x, BASE, lightSpots[i].z);
      dummy.rotation.set(0, rnd() * 6.28, 0);
      dummy.updateMatrix();
      tl.setMatrixAt(i, dummy.matrix);
      O.world.addCircle(lightSpots[i].x, lightSpots[i].z, 0.25, BASE + 4.5);
    }
    tl.castShadow = true;
    tl.instanceMatrix.needsUpdate = true;
    group.add(tl);

    // Skraldespande og hydranter — små ting, men de fylder fortovet ud.
    function binGeo() {
      const parts = [];
      const body = new THREE.CylinderGeometry(0.30, 0.26, 0.95, 10);
      body.translate(0, 0.48, 0);
      parts.push(body);
      const rim = new THREE.TorusGeometry(0.30, 0.035, 6, 12);
      rim.rotateX(Math.PI / 2);
      rim.translate(0, 0.95, 0);
      parts.push(rim);
      return BGU.mergeBufferGeometries(parts);
    }
    const binMat = new THREE.MeshStandardMaterial({
      color: O.srgb(0x3d4a3f), roughness: 0.7, metalness: 0.35
    });
    const binCount = Math.max(6, Math.round(lampSpots.length * 0.35 * detail));
    const bins = new THREE.InstancedMesh(binGeo(), binMat, binCount);
    for (let i = 0; i < binCount; i++) {
      const s = lampSpots[(i * 4409 + 3) % lampSpots.length];
      dummy.position.set(s.x + Math.cos(s.r) * 1.4, BASE, s.z + Math.sin(s.r) * 1.4);
      dummy.rotation.set(0, rnd() * 6.28, 0);
      dummy.updateMatrix();
      bins.setMatrixAt(i, dummy.matrix);
    }
    bins.castShadow = true;
    bins.instanceMatrix.needsUpdate = true;
    group.add(bins);

    scene.add(group);

    return {
      group: group,
      blocks: blocks,
      buildings: buildings,
      base: BASE,
      lamps: lenses
    };
  };
})();
