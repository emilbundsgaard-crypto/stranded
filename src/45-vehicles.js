/* ------------------------------------------------------------------
   Biler: parkerede langs kantstenen og trafik, der kører i gitteret.

   Karrosseriet er en sideprofil, der trækkes ud i bredden med afrundede
   kanter. Det er den billigste måde at få en rigtig bilsilhuet — motorhjelm,
   forrudens hældning, tagets fald, bagklap — i stedet for en kasse med hjul.

   Trafikken kører på en graf: knuder i krydsene, kanter langs vejene, én
   vognbane i hver retning. I krydset vælger bilen en ny kant, bare ikke den
   den kom fra. Den bremser for bilen foran, så de ikke kører igennem
   hinanden.
   ------------------------------------------------------------------ */
(function () {
  const O = window.OASIS;
  const M = O.math;
  const C = O.config.city;
  const BGU = THREE.BufferGeometryUtils;

  const LANE = 3.4;          // vognbanens midte fra vejens midte
  const PARK = C.roadHalf - 1.5;

  /* ---------- Karrosseriprofiler ---------- */
  const TYPES = [
    { name: 'sedan',  len: 4.5, wid: 1.82, wheel: 0.33, axle: 1.42,
      p: [[-2.25,0.34],[-2.25,0.66],[-2.02,0.80],[-0.92,0.88],[-0.52,1.33],[0.62,1.36],[1.02,0.94],[2.18,0.86],[2.25,0.62],[2.25,0.34]] },
    { name: 'hatch',  len: 3.9, wid: 1.74, wheel: 0.31, axle: 1.25,
      p: [[-1.95,0.32],[-1.95,0.64],[-1.72,0.78],[-0.78,0.86],[-0.40,1.30],[0.72,1.34],[1.32,1.16],[1.60,0.80],[1.95,0.66],[1.95,0.32]] },
    { name: 'suv',    len: 4.7, wid: 1.95, wheel: 0.39, axle: 1.48,
      p: [[-2.35,0.42],[-2.35,0.80],[-2.10,0.98],[-1.10,1.06],[-0.70,1.56],[0.95,1.60],[1.75,1.50],[2.15,1.02],[2.35,0.82],[2.35,0.42]] },
    { name: 'pickup', len: 5.0, wid: 1.92, wheel: 0.38, axle: 1.62,
      p: [[-2.50,0.42],[-2.50,0.80],[-2.24,0.94],[-1.16,1.02],[-0.80,1.52],[0.30,1.56],[0.55,1.00],[2.50,0.98],[2.50,0.80],[2.50,0.42]] },
    { name: 'van',    len: 5.1, wid: 2.00, wheel: 0.36, axle: 1.70,
      p: [[-2.55,0.40],[-2.55,0.82],[-2.34,1.02],[-1.95,1.72],[-1.55,2.02],[2.20,2.06],[2.55,1.90],[2.55,0.82],[2.55,0.60],[2.55,0.40]] }
  ];

  const PAINT = [0xb8bcc2, 0x2b3138, 0x8f1f22, 0x14406e, 0xe8e6e0, 0x3f5f43,
                 0xc9a227, 0x6e6a66, 0x1d1f22, 0xa8b6c4, 0x7a2f5c];

  function profileShape(pts) {
    const s = new THREE.Shape();
    s.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
    s.closePath();
    return s;
  }

  // Ruderne: samme profil, men kun det stykke der er kabine, og trukket
  // en anelse ind i siden, så glasset sidder inde i karmen.
  function glassShape(pts) {
    // Punkterne mellem forrudens fod og bagrudens fod udgør kabinen.
    let a = 0, b = pts.length - 1, best = -Infinity;
    for (let i = 0; i < pts.length; i++) if (pts[i][1] > best) { best = pts[i][1]; }
    const roof = best;
    const cab = pts.filter(function (p) { return p[1] > roof * 0.60; });
    if (cab.length < 3) return null;
    const s = new THREE.Shape();
    s.moveTo(cab[0][0], cab[0][1] - 0.03);
    for (let i = 1; i < cab.length; i++) s.lineTo(cab[i][0], cab[i][1] - 0.03);
    s.lineTo(cab[cab.length - 1][0], roof * 0.60);
    s.lineTo(cab[0][0], roof * 0.60);
    s.closePath();
    return s;
  }

  function buildBody(t) {
    const extrude = {
      depth: t.wid, bevelEnabled: true, bevelThickness: 0.06,
      bevelSize: 0.07, bevelSegments: 2, steps: 1
    };
    const body = new THREE.ExtrudeGeometry(profileShape(t.p), extrude);
    body.translate(0, 0, -t.wid / 2);
    body.computeVertexNormals();
    return body;
  }

  function buildGlass(t) {
    const sh = glassShape(t.p);
    if (!sh) return null;
    const g = new THREE.ExtrudeGeometry(sh, {
      depth: t.wid - 0.10, bevelEnabled: false, steps: 1
    });
    g.translate(0, 0, -(t.wid - 0.10) / 2);
    g.computeVertexNormals();
    return g;
  }

  function buildTrim(t) {
    const parts = [];
    // Kofangere.
    for (const z of [-t.len / 2 + 0.10, t.len / 2 - 0.10]) {
      const g = new THREE.BoxGeometry(0.34, 0.26, t.wid * 0.98);
      g.rotateY(Math.PI / 2);
      const b = new THREE.BoxGeometry(t.wid * 0.98, 0.26, 0.30);
      b.translate(0, 0.52, z);
      parts.push(b);
    }
    // Hjulkasser: en mørk ring bag hvert hjul, så hjulet ikke svæver.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const g = new THREE.CylinderGeometry(t.wheel + 0.10, t.wheel + 0.10, 0.06, 12);
        g.rotateZ(Math.PI / 2);
        g.translate(sx * (t.wid / 2 - 0.03), t.wheel + 0.02, sz * t.axle / 2);
        parts.push(g);
      }
    }
    return BGU.mergeBufferGeometries(parts);
  }

  function buildWheels(t) {
    const parts = [];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const tyre = new THREE.CylinderGeometry(t.wheel, t.wheel, 0.24, 14);
        tyre.rotateZ(Math.PI / 2);
        tyre.translate(sx * (t.wid / 2 - 0.14), t.wheel, sz * t.axle / 2);
        parts.push(tyre);
      }
    }
    return BGU.mergeBufferGeometries(parts);
  }

  function buildRims(t) {
    const parts = [];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const rim = new THREE.CylinderGeometry(t.wheel * 0.62, t.wheel * 0.62, 0.26, 12);
        rim.rotateZ(Math.PI / 2);
        rim.translate(sx * (t.wid / 2 - 0.135), t.wheel, sz * t.axle / 2);
        parts.push(rim);
      }
    }
    return BGU.mergeBufferGeometries(parts);
  }

  function buildLights(t, front) {
    const parts = [];
    const z = front ? -t.len / 2 + 0.16 : t.len / 2 - 0.16;
    for (const sx of [-1, 1]) {
      const g = new THREE.BoxGeometry(0.34, 0.16, 0.10);
      g.translate(sx * (t.wid / 2 - 0.34), t.wheel + 0.42, z);
      parts.push(g);
    }
    return BGU.mergeBufferGeometries(parts);
  }

  O.buildVehicles = function (scene, tex) {
    const rnd = M.mulberry32(O.config.seed ^ 0x9a1f);
    const group = new THREE.Group();
    group.name = 'vehicles';
    const BASE = O.world.PLATEAU;

    // Geometrien laves én gang pr. biltype og deles af alle biler.
    const geo = TYPES.map(function (t) {
      return {
        body: buildBody(t), glass: buildGlass(t), trim: buildTrim(t),
        wheels: buildWheels(t), rims: buildRims(t),
        head: buildLights(t, true), tail: buildLights(t, false), t: t
      };
    });

    const glassMat = new THREE.MeshStandardMaterial({
      color: O.srgb(0x14181c), roughness: 0.06, metalness: 0.1,
      envMapIntensity: 2.2, transparent: true, opacity: 0.86
    });
    const tyreMat = new THREE.MeshStandardMaterial({
      color: O.srgb(0x14151a), roughness: 0.92, metalness: 0.0
    });
    const rimMat = new THREE.MeshStandardMaterial({
      color: O.srgb(0xb9bdc2), roughness: 0.28, metalness: 0.9, envMapIntensity: 1.6
    });
    const trimMat = new THREE.MeshStandardMaterial({
      color: O.srgb(0x23262a), roughness: 0.6, metalness: 0.5, envMapIntensity: 1.0
    });
    const headMat = new THREE.MeshStandardMaterial({
      color: O.srgb(0xdfe6ee), emissive: O.srgb(0x7d8ea0), emissiveIntensity: 0.5,
      roughness: 0.12, metalness: 0.2, envMapIntensity: 2.0
    });
    const tailMat = new THREE.MeshStandardMaterial({
      color: O.srgb(0x7a1512), emissive: O.srgb(0xc02a1c), emissiveIntensity: 0.8,
      roughness: 0.2, metalness: 0.1
    });

    function makeCar(typeIndex, colorHex) {
      const g = geo[typeIndex];
      const car = new THREE.Group();
      const paint = new THREE.MeshStandardMaterial({
        color: O.srgb(colorHex),
        roughness: 0.22, metalness: 0.85, envMapIntensity: 1.9
      });
      const body = new THREE.Mesh(g.body, paint);
      body.castShadow = true; body.receiveShadow = true;
      car.add(body);
      if (g.glass) {
        const gl = new THREE.Mesh(g.glass, glassMat);
        gl.castShadow = false;
        car.add(gl);
      }
      const trim = new THREE.Mesh(g.trim, trimMat);
      trim.castShadow = true;
      car.add(trim);
      const wh = new THREE.Mesh(g.wheels, tyreMat);
      wh.castShadow = true;
      car.add(wh);
      car.add(new THREE.Mesh(g.rims, rimMat));
      car.add(new THREE.Mesh(g.head, headMat));
      car.add(new THREE.Mesh(g.tail, tailMat));
      car.userData.type = g.t;
      return car;
    }

    /* ================= Parkerede biler ================= */
    const av = C.avenues, st = C.streets;
    const spots = [];
    for (const x of av) {
      for (let z = st[0] + 6; z < st[st.length - 1] - 6; z += 6.6) {
        if (Math.min.apply(null, st.map(function (s) { return Math.abs(z - s); })) < 12) continue;
        spots.push({ x: x - PARK, z: z, rot: 0 });
        spots.push({ x: x + PARK, z: z, rot: Math.PI });
      }
    }
    for (const z of st) {
      for (let x = av[0] + 6; x < av[av.length - 1] - 6; x += 6.6) {
        if (Math.min.apply(null, av.map(function (a) { return Math.abs(x - a); })) < 12) continue;
        spots.push({ x: x, z: z - PARK, rot: -Math.PI / 2 });
        spots.push({ x: x, z: z + PARK, rot: Math.PI / 2 });
      }
    }

    const wanted = O.quality.get('cars');
    const parkedCount = Math.min(spots.length, Math.round(wanted * 0.7));
    const parked = [];
    for (let i = 0; i < parkedCount; i++) {
      const s = spots[(i * 6151) % spots.length];
      const ti = (rnd() * TYPES.length) | 0;
      const car = makeCar(ti, PAINT[(rnd() * PAINT.length) | 0]);
      car.position.set(s.x + (rnd() - 0.5) * 0.3, BASE, s.z + (rnd() - 0.5) * 0.6);
      car.rotation.y = s.rot + (rnd() - 0.5) * 0.05;
      group.add(car);
      parked.push(car);
      O.world.addCircle(s.x, s.z, 1.3, BASE + 1.6);
    }

    /* ================= Trafik ================= */
    // Grafen: knuder i krydsene, kanter mellem naboer.
    const nodes = [];
    const nodeAt = {};
    for (let i = 0; i < av.length; i++) {
      for (let j = 0; j < st.length; j++) {
        const n = { x: av[i], z: st[j], i: i, j: j, out: [] };
        nodeAt[i + ',' + j] = nodes.length;
        nodes.push(n);
      }
    }
    function link(a, b) {
      const na = nodes[a], nb = nodes[b];
      const dx = nb.x - na.x, dz = nb.z - na.z;
      const len = Math.hypot(dx, dz);
      na.out.push({ to: b, ux: dx / len, uz: dz / len, len: len });
    }
    for (let i = 0; i < av.length; i++) {
      for (let j = 0; j < st.length; j++) {
        const a = nodeAt[i + ',' + j];
        if (i + 1 < av.length) { link(a, nodeAt[(i + 1) + ',' + j]); link(nodeAt[(i + 1) + ',' + j], a); }
        if (j + 1 < st.length) { link(a, nodeAt[i + ',' + (j + 1)]); link(nodeAt[i + ',' + (j + 1)], a); }
      }
    }

    const traffic = [];
    const trafficCount = Math.max(2, wanted - parkedCount);
    for (let i = 0; i < trafficCount; i++) {
      const ti = (rnd() * TYPES.length) | 0;
      const car = makeCar(ti, PAINT[(rnd() * PAINT.length) | 0]);
      const from = (rnd() * nodes.length) | 0;
      const edges = nodes[from].out;
      if (!edges.length) continue;
      const e = edges[(rnd() * edges.length) | 0];
      traffic.push({
        mesh: car, node: from, edge: e, s: rnd() * e.len,
        speed: 7 + rnd() * 4, target: 7 + rnd() * 4
      });
      group.add(car);
    }

    // Højre side af køreretningen: (uz, -ux) i et venstrehåndet xz-plan.
    function place(c) {
      const n = nodes[c.node], e = c.edge;
      const rx = e.uz, rz = -e.ux;
      c.mesh.position.set(n.x + e.ux * c.s + rx * LANE, BASE, n.z + e.uz * c.s + rz * LANE);
      c.mesh.rotation.y = Math.atan2(-e.ux, -e.uz) + Math.PI;
    }
    traffic.forEach(place);

    scene.add(group);

    return {
      group: group,
      parked: parked,
      traffic: traffic,

      update: function (dt, playerPos) {
        for (let i = 0; i < traffic.length; i++) {
          const c = traffic[i];

          // Bremse for bilen foran på samme kant.
          let ahead = Infinity;
          for (let k = 0; k < traffic.length; k++) {
            if (k === i) continue;
            const o = traffic[k];
            if (o.node === c.node && o.edge === c.edge && o.s > c.s) {
              ahead = Math.min(ahead, o.s - c.s);
            }
          }
          // … og for spilleren, hvis han stiller sig midt på vejen.
          if (playerPos) {
            const dx = playerPos.x - c.mesh.position.x, dz = playerPos.z - c.mesh.position.z;
            const fwd = -Math.sin(c.mesh.rotation.y), fwz = -Math.cos(c.mesh.rotation.y);
            const along = dx * fwd + dz * fwz;
            const side = Math.abs(dx * fwz - dz * fwd);
            if (along > 0 && along < 12 && side < 2.0) ahead = Math.min(ahead, along - 3.0);
          }

          const want = ahead < 9 ? Math.max(0, (ahead - 3.5) * 1.6) : c.target;
          c.speed += (want - c.speed) * Math.min(1, dt * 2.2);
          c.s += c.speed * dt;

          if (c.s >= c.edge.len) {
            c.s -= c.edge.len;
            const next = c.edge.to;
            const outs = nodes[next].out;
            // Ingen U-vending: kanten tilbage ad samme vej vælges fra.
            const opts = outs.filter(function (e) {
              return !(Math.abs(e.ux + c.edge.ux) < 0.01 && Math.abs(e.uz + c.edge.uz) < 0.01);
            });
            const pick = (opts.length ? opts : outs);
            c.node = next;
            c.edge = pick[(rnd() * pick.length) | 0];
            c.target = 7 + rnd() * 4;
          }
          place(c);
        }
      }
    };
  };
})();
