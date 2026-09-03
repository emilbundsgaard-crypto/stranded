/* ------------------------------------------------------------------
   Alt det små, der gør landskabet troværdigt: græs i klynger, buske,
   nedfaldsklippe ved kløftens fod, småsten og grus i sandet, drivtømmer,
   bål og støv i luften.

   Alt tegnes med instanser — hver gruppe koster ét kald, uanset om der
   er hundrede eller tyve tusind af dem.
   ------------------------------------------------------------------ */
(function () {
  const O = window.OASIS;
  const M = O.math;

  function mergeNonIndexed(geos) {
    const parts = geos.map(g => (g.index ? g.toNonIndexed() : g));
    let n = 0;
    for (const g of parts) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    let o = 0;
    for (const g of parts) {
      pos.set(g.attributes.position.array, o * 3);
      nor.set(g.attributes.normal.array, o * 3);
      uv.set(g.attributes.uv.array, o * 2);
      o += g.attributes.position.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return out;
  }

  // Tre krydsende plader. Normalerne peger overvejende opad (blødt løvlys),
  // og vertexfarven gør bunden mørk og spidsen lys — en billig, men
  // overbevisende erstatning for gennemlyst løv.
  function tuftGeometry() {
    const quads = [];
    for (let i = 0; i < 3; i++) {
      const q = new THREE.PlaneGeometry(1, 1, 1, 2).translate(0, 0.5, 0);
      q.rotateY((i / 3) * Math.PI);
      quads.push(q);
    }
    const g = mergeNonIndexed(quads);
    const n = g.attributes.normal.array;
    const p = g.attributes.position.array;
    const col = new Float32Array(p.length);
    for (let i = 0; i < n.length; i += 3) {
      const x = n[i] * 0.4, y = 1.0, z = n[i + 2] * 0.4;
      const l = Math.hypot(x, y, z);
      n[i] = x / l; n[i + 1] = y / l; n[i + 2] = z / l;
      const t = M.clamp(p[i + 1], 0, 1);
      const shade = 0.5 + t * 0.75;
      col[i] = shade; col[i + 1] = shade; col[i + 2] = shade * 0.97;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }

  function deformedRock(rnd, detail) {
    const g = new THREE.IcosahedronGeometry(1, detail === undefined ? 1 : detail);
    const p = g.attributes.position;
    const v = new THREE.Vector3();
    const seed = rnd() * 40;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = M.fbm(v.x * 1.7 + seed, v.z * 1.7 + v.y * 1.1 + seed, 3);
      const n2 = M.fbm(v.x * 4.3 + seed, v.z * 4.3 - v.y * 2.2, 2);
      v.multiplyScalar(1 + n * 0.36 + n2 * 0.12);
      v.y *= 0.72 + rnd() * 0.22;
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    const white = new Float32Array(g.attributes.position.count * 3).fill(1);
    g.setAttribute('color', new THREE.BufferAttribute(white, 3));
    return g;
  }

  // Hjælper: byg en instans-samling ud fra en liste af transformationer.
  function instanced(geo, mat, list, cast, receive) {
    const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
    const d = new THREE.Object3D();
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      d.position.set(t.x, t.y, t.z);
      d.rotation.set(t.rx || 0, t.ry || 0, t.rz || 0);
      d.scale.set(t.sx, t.sy, t.sz);
      d.updateMatrix();
      im.setMatrixAt(i, d.matrix);
    }
    im.count = list.length;
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = !!cast;
    im.receiveShadow = receive !== false;
    return im;
  }

  O.buildProps = function (scene, tex, timeUniform) {
    const rnd = M.mulberry32(O.config.seed + 1337);
    const group = new THREE.Group();
    scene.add(group);
    // Det mindste pynt tegnes ikke med i vandets spejling og brydning —
    // man ser det alligevel ikke, og det er tre gange så dyrt.
    const detailGroup = new THREE.Group();
    group.add(detailGroup);
    const api = { group: group, detailGroup: detailGroup };

    /* ================= Græs og buske ================= */
    const tuftGeo = tuftGeometry();

    function foliageMaterial(colorHex) {
      const mat = new THREE.MeshStandardMaterial({
        map: tex.grass,
        alphaTest: 0.34,
        side: THREE.DoubleSide,
        roughness: 0.95,
        metalness: 0.0,
        vertexColors: true,
        color: O.srgb(colorHex),
        envMapIntensity: 0.4
      });
      // Vind: hele totten vugger, spidserne mest, og vindstødene løber
      // hen over landskabet i stedet for at ramme alt på samme tid.
      mat.onBeforeCompile = function (shader) {
        shader.uniforms.uTime = timeUniform;
        shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           vec3 iOrigin = instanceMatrix[3].xyz;
           float wave = sin(uTime * 0.55 - iOrigin.x * 0.055 - iOrigin.z * 0.04);
           float gust = 0.45 + 0.55 * wave * wave;
           float phase = iOrigin.x * 0.33 + iOrigin.z * 0.27;
           float sway = sin(uTime * 1.7 + phase) * 0.09 + sin(uTime * 3.3 + phase * 1.9) * 0.035;
           float infl = clamp(position.y, 0.0, 1.0); infl *= infl;
           transformed.x += sway * gust * infl;
           transformed.z += sway * gust * infl * 0.5;
           transformed.y -= abs(sway) * gust * infl * 0.25;`
        );
      };
      mat.customProgramCacheKey = function () { return 'foliage'; };
      return mat;
    }

    const grassMat = foliageMaterial(0xd6d6cc);
    const bushMat = foliageMaterial(0x9fb083);

    // Klyngevis udsåning: græs står i totter omkring nogle få centre,
    // ikke jævnt fordelt som et tæppe.
    const grassList = [];
    const grassTint = [];
    const bushList = [];
    let clusters = 0, tries = 0;
    while (clusters < 900 && tries < 60000) {
      tries++;
      const cx = (rnd() - 0.5) * 250;
      const cz = (rnd() - 0.5) * 290;
      const ch = O.world.height(cx, cz);
      const lush = O.world.lushness(cx, cz, ch);
      if (rnd() > lush) continue;
      clusters++;

      const spread = 0.8 + rnd() * 3.4;
      const n = 6 + (rnd() * 22 | 0);
      for (let i = 0; i < n; i++) {
        const a = rnd() * 6.283;
        const d = Math.pow(rnd(), 0.7) * spread;
        const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
        const h = O.world.height(x, z);
        if (h < -0.55 || h > 2.6) continue;
        const reed = h < 0.12 && rnd() < 0.3;
        const wide = (reed ? 0.30 : 0.40) + rnd() * 0.40;
        const tall = reed ? 0.75 + rnd() * 0.7 : 0.22 + rnd() * 0.38;
        grassList.push({
          x: x, y: h - 0.04, z: z, ry: rnd() * Math.PI,
          sx: wide, sy: tall, sz: wide * (0.8 + rnd() * 0.4)
        });
        // Grønnest lige ved vandet, mere strågult længere oppe.
        const green = 1 - M.smoothstep(0.1, 1.4, h);
        grassTint.push(green);
      }

      // Enkelte større buske i klyngerne tættest på vandet.
      if (ch < 0.9 && rnd() < 0.32) {
        const bs = 0.75 + rnd() * 0.9;
        bushList.push({
          x: cx + (rnd() - 0.5) * 2, y: ch - 0.08, z: cz + (rnd() - 0.5) * 2,
          ry: rnd() * Math.PI, sx: bs * 1.25, sy: bs, sz: bs * 1.25
        });
      }
    }

    const grass = instanced(tuftGeo, grassMat, grassList, true, true);
    const gc = new THREE.Color();
    for (let i = 0; i < grassList.length; i++) {
      const g = grassTint[i];
      gc.setRGB(
        M.lerp(1.10, 0.86, g) * (0.9 + rnd() * 0.2),
        M.lerp(1.02, 1.02, g) * (0.9 + rnd() * 0.2),
        M.lerp(0.80, 0.70, g) * (0.9 + rnd() * 0.2)
      );
      grass.setColorAt(i, gc);
    }
    if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
    grass.frustumCulled = false;
    group.add(grass);

    const bushes = instanced(tuftGeo, bushMat, bushList, true, true);
    bushes.frustumCulled = false;
    group.add(bushes);

    /* ================= Sten, nedfald og grus ================= */
    const rockMat = new THREE.MeshStandardMaterial({
      map: tex.stone,
      normalMap: tex.stoneNormal,
      normalScale: new THREE.Vector2(1.2, 1.2),
      roughness: 0.93,
      metalness: 0.0,
      vertexColors: true,
      envMapIntensity: 0.5
    });

    const variants = [deformedRock(rnd, 1), deformedRock(rnd, 1), deformedRock(rnd, 1), deformedRock(rnd, 0)];
    const buckets = [[], [], [], []];

    // 1) Nedfaldsklippe ved kløftens fod — skjuler den hårde linje hvor
    //    klippe møder sand, og er dét, der får foden til at se ægte ud.
    for (const p of (O.screePoints || [])) {
      const n = M.clamp(p.r * 1.6, 14, 52) | 0;
      for (let i = 0; i < n; i++) {
        const a = rnd() * 6.283;
        const rr = p.r * (0.86 + Math.pow(rnd(), 1.7) * 0.55);
        const x = p.x + Math.cos(a) * rr, z = p.z + Math.sin(a) * rr;
        const h = O.world.height(x, z);
        if (h < -0.6) continue;
        const s = 0.18 + Math.pow(rnd(), 2.4) * 1.35;
        buckets[(rnd() * 4) | 0].push({
          x: x, y: h - s * 0.3, z: z,
          rx: (rnd() - 0.5) * 0.7, ry: rnd() * 6.283, rz: (rnd() - 0.5) * 0.7,
          sx: s * (0.8 + rnd() * 0.6), sy: s * (0.7 + rnd() * 0.5), sz: s * (0.8 + rnd() * 0.6)
        });
      }
    }

    // 2) Løse kampesten spredt i landskabet.
    for (let i = 0, t = 0; i < 120 && t < 6000; t++) {
      const x = (rnd() - 0.5) * 200, z = (rnd() - 0.5) * 250;
      const h = O.world.height(x, z);
      if (h < -1.4 || h > 6) continue;
      const s = 0.3 + Math.pow(rnd(), 2.0) * (h > 1.2 ? 1.9 : 0.9);
      buckets[(rnd() * 4) | 0].push({
        x: x, y: h - s * 0.32, z: z,
        rx: (rnd() - 0.5) * 0.5, ry: rnd() * 6.283, rz: (rnd() - 0.5) * 0.5,
        sx: s * (0.85 + rnd() * 0.5), sy: s, sz: s * (0.85 + rnd() * 0.5)
      });
      i++;
    }

    // 3) Grus: mange små sten i sandet langs bredden. De ses knap enkeltvis,
    //    men de fjerner fornemmelsen af en tom, glat flade.
    for (let i = 0, t = 0; i < 1500 && t < 40000; t++) {
      const x = (rnd() - 0.5) * 170, z = (rnd() - 0.5) * 210;
      const h = O.world.height(x, z);
      if (h < -0.7 || h > 2.2) continue;
      const s = 0.035 + Math.pow(rnd(), 2.0) * 0.16;
      buckets[3].push({
        x: x, y: h - s * 0.2, z: z,
        rx: (rnd() - 0.5) * 1.2, ry: rnd() * 6.283, rz: (rnd() - 0.5) * 1.2,
        sx: s * 1.4, sy: s * 0.8, sz: s * 1.3
      });
      i++;
    }

    const stoneColor = new THREE.Color();
    for (let v = 0; v < 4; v++) {
      if (!buckets[v].length) continue;
      const im = instanced(variants[v], rockMat, buckets[v], true, true);
      for (let i = 0; i < buckets[v].length; i++) {
        // Variation omkring teksturens egen farve: nogle sten er grå,
        // andre trækker mod sandstenens rust.
        const t = rnd();
        const b = 1.0 + rnd() * 0.6;
        stoneColor.setRGB(
          b * M.lerp(0.86, 1.10, t),
          b * M.lerp(0.88, 0.92, t),
          b * M.lerp(0.92, 0.74, t)
        );
        im.setColorAt(i, stoneColor);
      }
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.frustumCulled = false;
      (v === 3 ? detailGroup : group).add(im);
    }

    /* ================= Drivtømmer ================= */
    const stickGeo = new THREE.CylinderGeometry(0.05, 0.08, 1, 6, 1);
    stickGeo.rotateZ(Math.PI / 2);
    const stickMat = new THREE.MeshStandardMaterial({
      color: O.srgb(0x5b4835), roughness: 0.95, envMapIntensity: 0.3
    });
    const sticks = [];
    for (let i = 0, t = 0; i < 140 && t < 7000; t++) {
      const x = (rnd() - 0.5) * 160, z = (rnd() - 0.5) * 200;
      const h = O.world.height(x, z);
      if (h < -0.2 || h > 2.1) continue;
      const len = 0.4 + Math.pow(rnd(), 1.6) * 2.6;
      sticks.push({
        x: x, y: h + 0.035, z: z,
        rx: (rnd() - 0.5) * 0.3, ry: rnd() * 6.283, rz: (rnd() - 0.5) * 0.2,
        sx: len, sy: 0.5 + rnd() * 0.8, sz: 0.5 + rnd() * 0.8
      });
      i++;
    }
    detailGroup.add(instanced(stickGeo, stickMat, sticks, true, true));

    /* ================= Bål ================= */
    const fire = new THREE.Group();
    let fx = 0, fz = 0, found = false;
    for (let i = 0; i < 4000 && !found; i++) {
      const ang = rnd() * Math.PI * 2;
      const rad = 30 + rnd() * 22;
      const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad + 22;
      const h = O.world.height(x, z);
      if (h > 0.12 && h < 0.55) { fx = x; fz = z; found = true; }
    }
    const fireY = O.world.height(fx, fz);
    fire.position.set(fx, fireY, fz);

    const ringGeo = deformedRock(rnd, 1);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + rnd() * 0.3;
      const m = new THREE.Mesh(ringGeo, rockMat);
      m.position.set(Math.cos(a) * 0.66, 0.0, Math.sin(a) * 0.66);
      m.scale.setScalar(0.18 + rnd() * 0.12);
      m.rotation.set(rnd(), rnd() * 3, rnd());
      m.castShadow = true; m.receiveShadow = true;
      fire.add(m);
    }
    const logMat = new THREE.MeshStandardMaterial({ color: O.srgb(0x33241a), roughness: 1.0 });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.9, 6), logMat);
      m.position.set(Math.cos(a) * 0.17, 0.24, Math.sin(a) * 0.17);
      m.rotation.set(Math.cos(a) * 0.8, 0, Math.sin(a) * -0.8);
      m.castShadow = true;
      fire.add(m);
    }

    const FCOUNT = 110;
    const fpos = new Float32Array(FCOUNT * 3);
    const fdata = [];
    for (let i = 0; i < FCOUNT; i++) {
      fdata.push({ life: rnd(), speed: 0.6 + rnd() * 0.9, ang: rnd() * 6.28, rad: rnd() * 0.13, sway: 0.4 + rnd() });
    }
    const fgeo = new THREE.BufferGeometry();
    fgeo.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
    const flames = new THREE.Points(fgeo, new THREE.PointsMaterial({
      map: tex.glow, size: 0.38, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, color: 0xffa040, sizeAttenuation: true, fog: true
    }));
    flames.frustumCulled = false;
    fire.add(flames);

    const fireLight = new THREE.PointLight(O.srgb(0xff8c30), 3.0, 16, 2);
    fireLight.position.set(0, 0.6, 0);
    fire.add(fireLight);
    group.add(fire);

    api.fire = {
      group: fire,
      position: new THREE.Vector3(fx, fireY, fz),
      update: function (t, dt) {
        const arr = fgeo.attributes.position.array;
        for (let i = 0; i < FCOUNT; i++) {
          const d = fdata[i];
          d.life += dt * d.speed * 0.8;
          if (d.life > 1) { d.life -= 1; d.ang = Math.random() * 6.28; d.rad = Math.random() * 0.13; }
          const l = d.life;
          arr[i * 3] = Math.cos(d.ang) * d.rad * (1 - l * 0.4) + Math.sin(t * 2.4 * d.sway + i) * 0.09 * l;
          arr[i * 3 + 1] = 0.18 + l * 1.4;
          arr[i * 3 + 2] = Math.sin(d.ang) * d.rad * (1 - l * 0.4) + Math.cos(t * 2.1 * d.sway + i) * 0.09 * l;
        }
        fgeo.attributes.position.needsUpdate = true;
        fireLight.intensity = 2.5 + Math.sin(t * 11.0) * 0.4 + Math.sin(t * 23.7) * 0.25;
      }
    };

    /* ================= Støv i modlyset ================= */
    const DCOUNT = 420;
    const dpos = new Float32Array(DCOUNT * 3);
    const ddata = [];
    for (let i = 0; i < DCOUNT; i++) {
      ddata.push({ x: (rnd() - 0.5) * 55, y: rnd() * 9, z: (rnd() - 0.5) * 55, s: 0.2 + rnd() * 0.5, p: rnd() * 6.28 });
    }
    const dgeo = new THREE.BufferGeometry();
    dgeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
    const dust = new THREE.Points(dgeo, new THREE.PointsMaterial({
      map: tex.spark, size: 0.065, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffe4bb, fog: false
    }));
    dust.frustumCulled = false;
    detailGroup.add(dust);
    api.dust = {
      update: function (t, camPos) {
        const arr = dgeo.attributes.position.array;
        for (let i = 0; i < DCOUNT; i++) {
          const d = ddata[i];
          arr[i * 3] = camPos.x + d.x + Math.sin(t * 0.25 * d.s + d.p) * 2.2;
          arr[i * 3 + 1] = 0.3 + ((d.y + t * 0.13 * d.s) % 9);
          arr[i * 3 + 2] = camPos.z + d.z + Math.cos(t * 0.21 * d.s + d.p) * 2.2;
        }
        dgeo.attributes.position.needsUpdate = true;
      }
    };

    api.counts = { grass: grassList.length, bushes: bushList.length,
                   rocks: buckets.reduce((a, b) => a + b.length, 0), sticks: sticks.length };
    return api;
  };
})();
