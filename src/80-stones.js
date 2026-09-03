/* ------------------------------------------------------------------
   Stenene man samler op. De fleste er helt almindelige — men et
   sted i kløften ligger der en stjernesten.
   ------------------------------------------------------------------ */
(function () {
  const O = window.OASIS;
  const M = O.math;

  const TYPES = [
    {
      id: 'flint', name: 'Flintesten', rarity: 'Almindelig', tier: 0, weight: 32,
      hud: '#9a9a93',
      mat: { color: O.srgb(0x8e8e86), roughness: 0.82, metalness: 0.0 }, size: [0.10, 0.19]
    },
    {
      id: 'sandsten', name: 'Sandstensbrokke', rarity: 'Almindelig', tier: 0, weight: 26,
      hud: '#c99a63',
      mat: { color: O.srgb(0xc08a55), roughness: 0.95, metalness: 0.0 }, size: [0.11, 0.22]
    },
    {
      id: 'flodsten', name: 'Poleret flodsten', rarity: 'Almindelig', tier: 0, weight: 17,
      hud: '#6f7a80',
      mat: { color: O.srgb(0x59636b), roughness: 0.28, metalness: 0.05 }, size: [0.09, 0.17]
    },
    {
      id: 'jernsten', name: 'Jernholdig sten', rarity: 'Usædvanlig', tier: 1, weight: 11,
      hud: '#a4552f',
      mat: { color: O.srgb(0x8a4326), roughness: 0.55, metalness: 0.45 }, size: [0.11, 0.20]
    },
    {
      id: 'kvarts', name: 'Kvartskrystal', rarity: 'Usædvanlig', tier: 1, weight: 8,
      hud: '#e6e9ef',
      mat: { color: O.srgb(0xdfe6ec), roughness: 0.12, metalness: 0.0, emissive: O.srgb(0x1b2430), emissiveIntensity: 0.5 },
      size: [0.10, 0.18], crystal: true, glint: 0.55
    },
    {
      id: 'agat', name: 'Stribet agat', rarity: 'Sjælden', tier: 2, weight: 4.2,
      hud: '#4fb3a5',
      mat: { color: O.srgb(0x2f8f86), roughness: 0.18, metalness: 0.1, emissive: O.srgb(0x0a2b2a), emissiveIntensity: 0.8 },
      size: [0.10, 0.17], glint: 0.8
    },
    {
      id: 'ametyst', name: 'Ametyst', rarity: 'Sjælden', tier: 2, weight: 2.4,
      hud: '#a86ede',
      mat: { color: O.srgb(0x7b46c9), roughness: 0.1, metalness: 0.0, emissive: O.srgb(0x3c1a72), emissiveIntensity: 1.2 },
      size: [0.11, 0.19], crystal: true, glint: 1.0
    },
    {
      id: 'stjernesten', name: 'Stjernesten', rarity: 'Legendarisk', tier: 3, weight: 0.7,
      hud: '#ffb545',
      mat: { color: O.srgb(0x241d1a), roughness: 0.35, metalness: 0.85, emissive: O.srgb(0xff6a12), emissiveIntensity: 1.6 },
      size: [0.14, 0.24], glint: 1.6
    }
  ];

  function pickType(rnd) {
    let total = 0;
    for (const t of TYPES) total += t.weight;
    let r = rnd() * total;
    for (const t of TYPES) {
      r -= t.weight;
      if (r <= 0) return t;
    }
    return TYPES[0];
  }

  function stoneGeometry(rnd, crystal) {
    const g = crystal
      ? new THREE.OctahedronGeometry(1, 0)
      : new THREE.IcosahedronGeometry(1, 1);
    const p = g.attributes.position;
    const v = new THREE.Vector3();
    const sx = 0.75 + rnd() * 0.5, sy = 0.55 + rnd() * 0.35, sz = 0.75 + rnd() * 0.5;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = crystal ? 0 : M.fbm(v.x * 2.3 + 11, v.z * 2.3 + v.y * 1.7, 3) * 0.28;
      v.multiplyScalar(1 + n);
      v.set(v.x * sx, v.y * sy, v.z * sz);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  }

  O.buildStones = function (scene, tex) {
    const rnd = M.mulberry32(O.config.seed + 4242);
    const group = new THREE.Group();
    scene.add(group);

    const materials = {};
    for (const t of TYPES) materials[t.id] = new THREE.MeshStandardMaterial(t.mat);

    const glintMat = new THREE.SpriteMaterial({
      map: tex.spark, blending: THREE.AdditiveBlending, depthWrite: false,
      transparent: true, opacity: 0.0, fog: false
    });

    const stones = [];
    const TOTAL = 210;
    let placed = 0, tries = 0;
    while (placed < TOTAL && tries < TOTAL * 120) {
      tries++;
      // Flest sten langs vandkanten, hvor man går og kigger ned.
      const ang = rnd() * Math.PI * 2;
      const rad = 6 + Math.pow(rnd(), 0.6) * 78;
      const x = Math.cos(ang) * rad * 1.1;
      const z = Math.sin(ang) * rad * 1.75 + (rnd() - 0.5) * 30;
      const h = O.world.height(x, z);
      if (h < -0.55 || h > 2.6) continue;            // hverken på dybt vand eller oppe i klipperne
      if (rnd() > (h < 0.05 ? 0.45 : 1.0)) continue; // kun nogle få ligger under vand
      let blocked = false;
      for (const c of O.world.colliders) {
        if (Math.hypot(c.x - x, c.z - z) < c.r + 0.8) { blocked = true; break; }
      }
      if (blocked) continue;

      const type = pickType(rnd);
      const size = M.lerp(type.size[0], type.size[1], rnd());
      const geo = stoneGeometry(rnd, type.crystal);
      const mesh = new THREE.Mesh(geo, materials[type.id]);
      mesh.scale.setScalar(size);
      mesh.position.set(x, h + size * 0.34, z);
      mesh.rotation.set(rnd() * 3.14, rnd() * 6.28, rnd() * 3.14);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.type = type;
      group.add(mesh);

      if (type.glint) {
        const sp = new THREE.Sprite(glintMat.clone());
        sp.position.copy(mesh.position);
        sp.position.y += size * 0.9;
        sp.scale.setScalar(0.30 + type.glint * 0.28);
        sp.userData.strength = type.glint;
        sp.userData.phase = rnd() * 6.28;
        group.add(sp);
        mesh.userData.glint = sp;
      }

      stones.push(mesh);
      placed++;
    }

    // Genbrugt "outline" til den sten man kigger på.
    const highlight = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: O.srgb(0xfff0c0), side: THREE.BackSide, transparent: true, opacity: 0.55 })
    );
    highlight.visible = false;
    highlight.renderOrder = 5;
    scene.add(highlight);

    const REACH = 3.1;
    const forward = new THREE.Vector3();
    const toStone = new THREE.Vector3();

    const api = {
      group: group,
      list: stones,
      types: TYPES,
      focus: null,
      highlight: highlight,

      // Find den nærmeste sten man både er tæt på og kigger nogenlunde mod.
      updateFocus: function (camera) {
        camera.getWorldDirection(forward);
        let best = null, bestScore = -1;
        for (const s of stones) {
          if (!s.visible) continue;
          toStone.subVectors(s.position, camera.position);
          const dist = toStone.length();
          if (dist > REACH) continue;
          toStone.divideScalar(dist);
          const dot = toStone.dot(forward);
          if (dot < 0.55) continue;
          const score = dot * 2.0 - dist / REACH;
          if (score > bestScore) { bestScore = score; best = s; }
        }
        this.focus = best;
        if (best) {
          highlight.visible = true;
          highlight.geometry = best.geometry;
          highlight.position.copy(best.position);
          highlight.rotation.copy(best.rotation);
          highlight.scale.copy(best.scale).multiplyScalar(1.14);
        } else {
          highlight.visible = false;
        }
        return best;
      },

      collect: function () {
        const s = this.focus;
        if (!s) return null;
        s.visible = false;
        if (s.userData.glint) s.userData.glint.visible = false;
        const i = stones.indexOf(s);
        if (i >= 0) stones.splice(i, 1);
        this.focus = null;
        highlight.visible = false;
        return s.userData.type;
      },

      update: function (t) {
        for (const s of stones) {
          const g = s.userData.glint;
          if (!g || !g.visible) continue;
          const pulse = 0.5 + 0.5 * Math.sin(t * 2.2 + g.userData.phase);
          g.material.opacity = 0.12 + pulse * 0.5 * g.userData.strength;
        }
        if (highlight.visible) {
          highlight.material.opacity = 0.35 + 0.2 * Math.sin(t * 6.0);
        }
      },

      remaining: function () { return stones.length; }
    };

    return api;
  };
})();
