/* ------------------------------------------------------------------
   Øens bevoksning og strandens ting.

   Palmer langs promenaden og på stranden, tuer af strandgræs i det
   fugtige bånd, sten på skrænterne og en badebro ud i vandet.

   Palmen bygges som ét net pr. variant — stamme og blade i samme
   geometri — og sættes ud med instansering. Det er dét, der gør, at der
   kan stå to hundrede af dem uden at koste to hundrede tegnekald.
   ------------------------------------------------------------------ */
(function () {
  const O = window.OASIS;
  const M = O.math;
  const BGU = THREE.BufferGeometryUtils;

  function palmVariant(rnd, tall) {
    const parts = [];
    const H = tall ? 9.5 + rnd() * 4 : 5.5 + rnd() * 2.5;
    const seg = 7;
    // Stammen krummer: palmer står sjældent lodret.
    const bendX = (rnd() - 0.5) * 0.30;
    const bendZ = (rnd() - 0.5) * 0.30;
    let px = 0, pz = 0;
    for (let i = 0; i < seg; i++) {
      const t0 = i / seg, t1 = (i + 1) / seg;
      const r0 = M.lerp(0.28, 0.15, t0), r1 = M.lerp(0.28, 0.15, t1);
      const g = new THREE.CylinderGeometry(r1, r0, H / seg, 9, 1, true);
      const y = H * (t0 + t1) * 0.5;
      const nx = bendX * H * t0 * t0, nz = bendZ * H * t0 * t0;
      g.translate(nx, y, nz);
      // Barken er ringet — teksturen strækkes over hele stammen.
      const uv = g.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setY(k, M.lerp(t0, t1, uv.getY(k)) * 4);
      parts.push(g);
      px = nx; pz = nz;
    }
    const trunk = BGU.mergeBufferGeometries(parts);

    // Kronen: otte blade i en krans, med fald udad.
    const fronds = [];
    const n = 8 + ((rnd() * 4) | 0);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.3;
      const droop = 0.35 + rnd() * 0.55;
      const len = 2.6 + rnd() * 1.4;
      const g = new THREE.PlaneGeometry(len, len * 0.5, 3, 1);
      // Bladet bøjer nedad ude i spidsen.
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const t = (p.getX(k) + len / 2) / len;
        p.setY(k, p.getY(k) * (1 - t * 0.35));
        p.setZ(k, -t * t * len * droop * 0.55);
      }
      g.rotateY(-Math.PI / 2);
      g.rotateX(-0.25 - rnd() * 0.2);
      g.translate(len * 0.5, 0, 0);
      g.rotateY(a);
      g.translate(px, H + 0.1, pz);
      fronds.push(g);
    }
    // Et par kokosnødder.
    const coco = [];
    if (rnd() < 0.6) {
      for (let i = 0; i < 3; i++) {
        const g = new THREE.SphereGeometry(0.11, 6, 5);
        g.translate(px + (rnd() - 0.5) * 0.4, H - 0.15, pz + (rnd() - 0.5) * 0.4);
        coco.push(g);
      }
    }
    return {
      trunk: coco.length ? BGU.mergeBufferGeometries([trunk].concat(coco)) : trunk,
      fronds: BGU.mergeBufferGeometries(fronds),
      h: H
    };
  }

  O.buildProps = function (scene, tex, timeUniform) {
    const rnd = M.mulberry32(O.config.seed ^ 0x71ce);
    const group = new THREE.Group();
    group.name = 'props';
    scene.add(group);

    const barkMat = new THREE.MeshStandardMaterial({
      map: tex.palmBark, color: new THREE.Color(0.55, 0.52, 0.48),
      roughness: 0.95, metalness: 0, envMapIntensity: 0.5,
      side: THREE.DoubleSide
    });
    const frondMat = new THREE.MeshStandardMaterial({
      map: tex.palmFrond, color: new THREE.Color(0.75, 0.85, 0.60),
      roughness: 0.85, metalness: 0, envMapIntensity: 0.7,
      transparent: true, alphaTest: 0.4, side: THREE.DoubleSide
    });

    /* ---------- Hvor kan der stå en palme? ---------- */
    const spots = [];
    const wanted = O.quality.get('palms');
    const C = O.config.city;
    const guard = 200;
    for (let i = 0; i < wanted * 26 && spots.length < wanted; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 40 + rnd() * 230;
      const x = Math.cos(a) * r, z = Math.sin(a) * r * 1.05;
      const h = O.world.height(x, z);
      if (h < 0.9 || h > 26) continue;
      if (O.world.blocked(x, z)) continue;
      // Ikke i kørebanen, og ikke inde i karreerne.
      const cm = O.world.cityMask(x, z);
      if (cm > 0.5) {
        if (O.world.roadDist(x, z) < C.roadHalf + C.walk * 0.6) continue;
        if (O.world.roadDist(x, z) > C.roadHalf + C.walk * 1.6) continue;
      }
      // Palmer vil have kysten eller det fugtige.
      const beach = O.world.beachness(x, z, h);
      const lush = O.world.lushness(x, z, h);
      if (cm < 0.5 && beach < 0.25 && lush < 0.3) continue;
      spots.push({ x: x, z: z, y: h, s: 0.8 + rnd() * 0.5, r: rnd() * 6.28 });
    }

    const VARIANTS = 5;
    const variants = [];
    for (let i = 0; i < VARIANTS; i++) variants.push(palmVariant(rnd, i % 2 === 0));

    const dummy = new THREE.Object3D();
    const perVariant = Math.ceil(spots.length / VARIANTS);
    const palmMeshes = [];
    for (let v = 0; v < VARIANTS; v++) {
      const list = spots.filter(function (_, i) { return i % VARIANTS === v; });
      if (!list.length) continue;
      const tm = new THREE.InstancedMesh(variants[v].trunk, barkMat, list.length);
      const fm = new THREE.InstancedMesh(variants[v].fronds, frondMat, list.length);
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        dummy.position.set(s.x, s.y, s.z);
        dummy.rotation.set(0, s.r, 0);
        dummy.scale.setScalar(s.s);
        dummy.updateMatrix();
        tm.setMatrixAt(i, dummy.matrix);
        fm.setMatrixAt(i, dummy.matrix);
        O.world.addCircle(s.x, s.z, 0.45, s.y + variants[v].h * s.s);
      }
      tm.castShadow = true; tm.receiveShadow = true;
      fm.castShadow = O.quality.get('grassShadows');
      tm.instanceMatrix.needsUpdate = true;
      fm.instanceMatrix.needsUpdate = true;
      group.add(tm); group.add(fm);
      palmMeshes.push(tm, fm);
    }

    /* ---------- Strandgræs ---------- */
    const tuftGeo = (function () {
      const parts = [];
      const blades = Math.max(4, O.quality.get('bladesPerCluster') | 0);
      for (let i = 0; i < blades; i++) {
        const a = (i / blades) * Math.PI * 2 + Math.random();
        const h = 0.35 + Math.random() * 0.55;
        const g = new THREE.PlaneGeometry(0.10, h, 1, 3);
        const p = g.attributes.position;
        for (let k = 0; k < p.count; k++) {
          const t = (p.getY(k) + h / 2) / h;
          p.setZ(k, t * t * 0.22);
        }
        g.translate(0, h / 2, 0);
        g.rotateY(a);
        g.translate(Math.cos(a) * 0.09, 0, Math.sin(a) * 0.09);
        parts.push(g);
      }
      return BGU.mergeBufferGeometries(parts);
    })();

    const tuftMat = new THREE.MeshStandardMaterial({
      map: tex.grassDry, color: new THREE.Color(0.8, 0.85, 0.55),
      roughness: 0.95, metalness: 0, transparent: true, alphaTest: 0.42,
      side: THREE.DoubleSide, envMapIntensity: 0.7
    });

    const tuftSpots = [];
    const tuftWanted = O.quality.get('plants');
    for (let i = 0; i < tuftWanted * 12 && tuftSpots.length < tuftWanted; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 60 + rnd() * 210;
      const x = Math.cos(a) * r, z = Math.sin(a) * r * 1.05;
      const h = O.world.height(x, z);
      if (h < 0.3 || h > 14) continue;
      if (O.world.cityMask(x, z) > 0.35) continue;
      const lush = O.world.lushness(x, z, h);
      const beach = O.world.beachness(x, z, h);
      if (lush < 0.25 && beach < 0.5) continue;
      tuftSpots.push({ x: x, y: h, z: z, s: 0.7 + rnd() * 0.8, r: rnd() * 6.28 });
    }
    if (tuftSpots.length) {
      const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, tuftSpots.length);
      for (let i = 0; i < tuftSpots.length; i++) {
        const s = tuftSpots[i];
        dummy.position.set(s.x, s.y - 0.05, s.z);
        dummy.rotation.set(0, s.r, 0);
        dummy.scale.set(s.s, s.s * (0.8 + rnd() * 0.5), s.s);
        dummy.updateMatrix();
        tufts.setMatrixAt(i, dummy.matrix);
      }
      tufts.castShadow = O.quality.get('grassShadows');
      tufts.instanceMatrix.needsUpdate = true;
      group.add(tufts);
    }

    /* ---------- Sten på skrænterne ---------- */
    const rockGeo = (function () {
      const g = new THREE.IcosahedronGeometry(1, 1);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const s = 0.75 + M.fbm(p.getX(i) * 2.2, p.getZ(i) * 2.2 + p.getY(i), 3) * 0.55;
        p.setXYZ(i, p.getX(i) * s, p.getY(i) * s * 0.7, p.getZ(i) * s);
      }
      g.computeVertexNormals();
      return g;
    })();
    const AR = O.config.albedo.rock;
    const rockMat = new THREE.MeshStandardMaterial({
      map: tex.stone, normalMap: tex.rockDetail || tex.stoneNormal,
      normalScale: new THREE.Vector2(1.2, 1.2),
      color: new THREE.Color(AR.r, AR.g, AR.b),
      roughness: 0.94, metalness: 0, envMapIntensity: 0.55
    });
    const rockSpots = [];
    const rockWanted = Math.round(O.quality.get('gravel') * 0.25);
    for (let i = 0; i < rockWanted * 14 && rockSpots.length < rockWanted; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 90 + rnd() * 200;
      const x = Math.cos(a) * r, z = Math.sin(a) * r * 1.05;
      const h = O.world.height(x, z);
      if (h < -1.5 || h > 46) continue;
      if (O.world.cityMask(x, z) > 0.3) continue;
      if (O.world.rockiness(x, z, h) < 0.25 && rnd() < 0.7) continue;
      rockSpots.push({ x: x, y: h, z: z, s: 0.4 + rnd() * 2.6, r: rnd() * 6.28 });
    }
    if (rockSpots.length) {
      const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockSpots.length);
      for (let i = 0; i < rockSpots.length; i++) {
        const s = rockSpots[i];
        dummy.position.set(s.x, s.y - s.s * 0.25, s.z);
        dummy.rotation.set(rnd() * 0.4, s.r, rnd() * 0.4);
        dummy.scale.setScalar(s.s);
        dummy.updateMatrix();
        rocks.setMatrixAt(i, dummy.matrix);
        if (s.s > 1.2) O.world.addCircle(s.x, s.z, s.s * 0.7, s.y + s.s);
      }
      rocks.castShadow = true; rocks.receiveShadow = true;
      rocks.instanceMatrix.needsUpdate = true;
      group.add(rocks);
    }

    /* ---------- Badebro ---------- */
    (function pier() {
      const woodMat = new THREE.MeshStandardMaterial({
        color: O.srgb(0x8a7355), roughness: 0.92, metalness: 0, envMapIntensity: 0.5
      });
      const parts = [];
      // Ud fra stranden mod syd, indtil vandet er dybt nok.
      let x = 20, z = 150;
      while (O.world.height(x, z) > 0.6 && z < 240) z += 2;
      const z0 = z - 6;
      const len = 46;
      for (let i = 0; i < len; i += 2) {
        const zz = z0 + i;
        const g = new THREE.BoxGeometry(5.0, 0.18, 2.0);
        g.translate(x, 1.35, zz);
        parts.push(g);
        for (const sx of [-2.1, 2.1]) {
          const pl = new THREE.CylinderGeometry(0.16, 0.18, 5.0, 7);
          pl.translate(x + sx, -1.1, zz);
          parts.push(pl);
        }
        if (i % 6 === 0) {
          for (const sx of [-2.3, 2.3]) {
            const post = new THREE.BoxGeometry(0.12, 1.0, 0.12);
            post.translate(x + sx, 1.9, zz);
            parts.push(post);
          }
        }
      }
      for (const sx of [-2.3, 2.3]) {
        const rail = new THREE.BoxGeometry(0.10, 0.10, len);
        rail.translate(x + sx, 2.35, z0 + len / 2);
        parts.push(rail);
      }
      const m = new THREE.Mesh(BGU.mergeBufferGeometries(parts), woodMat);
      m.castShadow = true; m.receiveShadow = true;
      group.add(m);
    })();

    return { group: group };
  };
})();
