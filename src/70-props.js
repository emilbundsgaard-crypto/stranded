/* ------------------------------------------------------------------
   Detaljerne der gør stedet levende: græstotter i vindstød, siv,
   drivtømmer, kampesten, støv i luften og et bål på den anden bred.
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

  function crossQuad() {
    const a = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const b = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    b.rotateY(Math.PI / 2);
    const c = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    c.rotateY(Math.PI / 4);
    const g = mergeNonIndexed([a, b, c]);
    // Normaler peger opad som på rigtigt løv — ellers bliver hvert blad
    // enten helt sort eller helt udbrændt alt efter hvilken vej det står.
    const n = g.attributes.normal.array;
    for (let i = 0; i < n.length; i += 3) {
      const x = n[i] * 0.45, y = 1.0, z = n[i + 2] * 0.45;
      const l = Math.hypot(x, y, z);
      n[i] = x / l; n[i + 1] = y / l; n[i + 2] = z / l;
    }
    return g;
  }

  function deformedRock(rnd, detail) {
    const g = new THREE.IcosahedronGeometry(1, detail || 1);
    const p = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = M.fbm(v.x * 1.7 + rnd() * 0.01, v.z * 1.7 + v.y * 1.1, 3);
      v.multiplyScalar(1 + n * 0.34);
      v.y *= 0.62 + rnd() * 0.12;
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  }

  O.buildProps = function (scene, tex, timeUniform) {
    const rnd = M.mulberry32(O.config.seed + 1337);
    const group = new THREE.Group();
    scene.add(group);
    const api = { group: group, fire: null, dust: null };

    /* ---------- Græs og siv ---------- */
    const grassMat = new THREE.MeshStandardMaterial({
      map: tex.grass,
      alphaTest: 0.48,
      side: THREE.DoubleSide,
      roughness: 1.0,
      metalness: 0.0,
      color: O.srgb(0xd8d8d0)
    });
    grassMat.onBeforeCompile = function (shader) {
      shader.uniforms.uTime = timeUniform;
      shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vec3 iOrigin = instanceMatrix[3].xyz;
         float phase = iOrigin.x * 0.31 + iOrigin.z * 0.24;
         float gust = 0.55 + 0.45 * sin(uTime * 0.35 + iOrigin.x * 0.03 + iOrigin.z * 0.02);
         float sway = sin(uTime * 1.6 + phase) * 0.10 + sin(uTime * 3.1 + phase * 1.7) * 0.04;
         float infl = clamp(position.y, 0.0, 1.0); infl *= infl;
         transformed.x += sway * gust * infl;
         transformed.z += sway * gust * infl * 0.55;`
      );
    };

    const grassGeo = crossQuad();
    const GRASS_COUNT = 11000;
    const grass = new THREE.InstancedMesh(grassGeo, grassMat, GRASS_COUNT);
    grass.receiveShadow = true;
    grass.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    const dummy = new THREE.Object3D();
    let placed = 0, tries = 0;
    while (placed < GRASS_COUNT && tries < GRASS_COUNT * 40) {
      tries++;
      const x = (rnd() - 0.5) * 260;
      const z = (rnd() - 0.5) * 300;
      const h = O.world.height(x, z);
      const lush = O.world.lushness(x, z, h);
      if (rnd() > lush) continue;
      const reed = h < 0.14 && rnd() < 0.22;   // siv står med fødderne i vandet
      const wide = (reed ? 0.34 : 0.52) + rnd() * 0.42;
      const tall = (reed ? 0.72 + rnd() * 0.55 : 0.26 + rnd() * 0.34);
      dummy.position.set(x, h - 0.05, z);
      dummy.rotation.set(0, rnd() * Math.PI, 0);
      dummy.scale.set(wide, tall, wide * (0.8 + rnd() * 0.4));
      dummy.updateMatrix();
      grass.setMatrixAt(placed++, dummy.matrix);
    }
    grass.count = placed;
    grass.instanceMatrix.needsUpdate = true;
    grass.frustumCulled = false;
    group.add(grass);

    /* ---------- Kampesten ---------- */
    const rockMat = new THREE.MeshStandardMaterial({
      map: tex.rock,
      normalMap: tex.rockNormal,
      normalScale: new THREE.Vector2(0.8, 0.8),
      roughness: 0.9,
      metalness: 0.0,
      color: O.srgb(0xc9a882)
    });
    for (let variant = 0; variant < 4; variant++) {
      const geo = deformedRock(rnd, 1);
      const count = 26;
      const im = new THREE.InstancedMesh(geo, rockMat, count);
      im.castShadow = true;
      im.receiveShadow = true;
      let n = 0, t = 0;
      while (n < count && t < 900) {
        t++;
        const x = (rnd() - 0.5) * 180;
        const z = (rnd() - 0.5) * 220;
        const h = O.world.height(x, z);
        if (h < -1.6 || h > 5.5) continue;
        const s = 0.5 + rnd() * (h > 1.2 ? 2.4 : 1.1);
        dummy.position.set(x, h - s * 0.28, z);
        dummy.rotation.set((rnd() - 0.5) * 0.5, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.5);
        dummy.scale.set(s * (0.8 + rnd() * 0.6), s, s * (0.8 + rnd() * 0.6));
        dummy.updateMatrix();
        im.setMatrixAt(n++, dummy.matrix);
      }
      im.count = n;
      im.instanceMatrix.needsUpdate = true;
      group.add(im);
    }

    /* ---------- Drivtømmer ---------- */
    const stickGeo = new THREE.CylinderGeometry(0.055, 0.085, 1, 6, 1);
    stickGeo.rotateZ(Math.PI / 2);
    const stickMat = new THREE.MeshStandardMaterial({ color: O.srgb(0x4a3b2c), roughness: 0.95 });
    const sticks = new THREE.InstancedMesh(stickGeo, stickMat, 90);
    sticks.castShadow = true;
    sticks.receiveShadow = true;
    let sn = 0, st = 0;
    while (sn < 90 && st < 4000) {
      st++;
      const x = (rnd() - 0.5) * 150;
      const z = (rnd() - 0.5) * 190;
      const h = O.world.height(x, z);
      if (h < -0.15 || h > 1.9) continue;
      const len = 0.7 + rnd() * 2.2;
      dummy.position.set(x, h + 0.05, z);
      dummy.rotation.set((rnd() - 0.5) * 0.25, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.18);
      dummy.scale.set(len, 0.6 + rnd() * 0.7, 0.6 + rnd() * 0.7);
      dummy.updateMatrix();
      sticks.setMatrixAt(sn++, dummy.matrix);
    }
    sticks.count = sn;
    sticks.instanceMatrix.needsUpdate = true;
    group.add(sticks);

    /* ---------- Bål på den modsatte bred ---------- */
    const fire = new THREE.Group();
    let fx = 0, fz = 0, found = false;
    for (let i = 0; i < 3000 && !found; i++) {
      const ang = rnd() * Math.PI * 2;
      const rad = 30 + rnd() * 22;
      const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad + 22;
      const h = O.world.height(x, z);
      if (h > 0.12 && h < 0.55) { fx = x; fz = z; found = true; }
    }
    const fireY = O.world.height(fx, fz);
    fire.position.set(fx, fireY, fz);

    // Stenring
    const ringMat = new THREE.MeshStandardMaterial({ color: O.srgb(0x8a7a68), roughness: 0.95 });
    const ringGeo = deformedRock(rnd, 0);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const m = new THREE.Mesh(ringGeo, ringMat);
      m.position.set(Math.cos(a) * 0.62, 0.02, Math.sin(a) * 0.62);
      m.scale.setScalar(0.20 + rnd() * 0.10);
      m.rotation.y = rnd() * 3;
      m.castShadow = true;
      fire.add(m);
    }
    // Brænde
    const logMat = new THREE.MeshStandardMaterial({ color: O.srgb(0x2e2018), roughness: 1.0 });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.85, 5), logMat);
      m.position.set(Math.cos(a) * 0.16, 0.22, Math.sin(a) * 0.16);
      m.rotation.set(Math.cos(a) * 0.75, 0, Math.sin(a) * -0.75);
      m.castShadow = true;
      fire.add(m);
    }

    // Flammer som additive partikler
    const FCOUNT = 90;
    const fpos = new Float32Array(FCOUNT * 3);
    const fdata = [];
    for (let i = 0; i < FCOUNT; i++) {
      fdata.push({ life: rnd(), speed: 0.55 + rnd() * 0.9, ang: rnd() * 6.28, rad: rnd() * 0.14, sway: 0.4 + rnd() });
    }
    const fgeo = new THREE.BufferGeometry();
    fgeo.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
    const fmat = new THREE.PointsMaterial({
      map: tex.glow,
      size: 0.42,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      color: O.srgb(0xffb347),
      sizeAttenuation: true,
      fog: true
    });
    const flames = new THREE.Points(fgeo, fmat);
    flames.frustumCulled = false;
    fire.add(flames);

    const fireLight = new THREE.PointLight(0xff9a3c, 2.6, 14, 2);
    fireLight.position.set(0, 0.6, 0);
    fire.add(fireLight);
    group.add(fire);

    api.fire = {
      group: fire,
      data: fdata,
      geo: fgeo,
      light: fireLight,
      position: new THREE.Vector3(fx, fireY, fz),
      update: function (t, dt) {
        const arr = fgeo.attributes.position.array;
        for (let i = 0; i < FCOUNT; i++) {
          const d = fdata[i];
          d.life += dt * d.speed * 0.8;
          if (d.life > 1) { d.life -= 1; d.ang = Math.random() * 6.28; d.rad = Math.random() * 0.14; }
          const l = d.life;
          arr[i * 3] = Math.cos(d.ang) * d.rad * (1 - l * 0.4) + Math.sin(t * 2.4 * d.sway + i) * 0.09 * l;
          arr[i * 3 + 1] = 0.16 + l * 1.35;
          arr[i * 3 + 2] = Math.sin(d.ang) * d.rad * (1 - l * 0.4) + Math.cos(t * 2.1 * d.sway + i) * 0.09 * l;
        }
        fgeo.attributes.position.needsUpdate = true;
        fireLight.intensity = 2.2 + Math.sin(t * 11.0) * 0.35 + Math.sin(t * 23.7) * 0.25;
      }
    };

    /* ---------- Støv i modlyset ---------- */
    const DCOUNT = 320;
    const dpos = new Float32Array(DCOUNT * 3);
    const ddata = [];
    for (let i = 0; i < DCOUNT; i++) {
      ddata.push({ x: (rnd() - 0.5) * 60, y: rnd() * 8, z: (rnd() - 0.5) * 60, s: 0.2 + rnd() * 0.5, p: rnd() * 6.28 });
    }
    const dgeo = new THREE.BufferGeometry();
    dgeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
    const dust = new THREE.Points(dgeo, new THREE.PointsMaterial({
      map: tex.spark, size: 0.075, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false, color: O.srgb(0xffe6bd), fog: false
    }));
    dust.frustumCulled = false;
    group.add(dust);
    api.dust = {
      update: function (t, camPos) {
        const arr = dgeo.attributes.position.array;
        for (let i = 0; i < DCOUNT; i++) {
          const d = ddata[i];
          arr[i * 3] = camPos.x + d.x + Math.sin(t * 0.25 * d.s + d.p) * 2.4;
          arr[i * 3 + 1] = 0.4 + ((d.y + t * 0.14 * d.s) % 8);
          arr[i * 3 + 2] = camPos.z + d.z + Math.cos(t * 0.21 * d.s + d.p) * 2.4;
        }
        dgeo.attributes.position.needsUpdate = true;
      }
    };

    return api;
  };
})();
