/* ------------------------------------------------------------------
   Vraget.

   En gammel jeep, der er kørt fast og blevet efterladt i det lave vand.
   Karrosseriet er bygget af enkle former, men det er ikke formerne, der
   sælger den — det er sliddet: rust der æder sig op fra bunden, en
   vandlinje med alger, et hjul begravet i sandet, forruden knækket ned
   over motorhjelmen og en dør, der er faldet af.

   Materialet ved, hvor vandet står: alt under overfladen bliver mørkt og
   begroet, og kaustikken fra bølgerne løber hen over det.
   ------------------------------------------------------------------ */
(function () {
  const O = window.OASIS;
  const M = O.math;

  /* ---------- Rustent lak ---------- */
  function rustTexture() {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(S, S);

    function h2(x, y) {
      let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) | 0;
      n = Math.imul(n ^ (n >>> 13), 1274126177) | 0;
      return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
    }
    function noise(x, y) {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = x - xi, yf = y - yi;
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const a = h2(xi, yi), b = h2(xi + 1, yi), d = h2(xi, yi + 1), e = h2(xi + 1, yi + 1);
      return (a + (b - a) * u) + ((d + (e - d) * u) - (a + (b - a) * u)) * v;
    }
    function fbm(x, y, oct) {
      let s = 0, amp = 0.5, f = 1, n = 0;
      for (let i = 0; i < oct; i++) { s += amp * noise(x * f, y * f); n += amp; amp *= 0.5; f *= 2.07; }
      return s / n;
    }

    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = (y * S + x) * 4;

        // Rust breder sig i pletter og løber nedad i striber.
        const patch = fbm(x * 0.014, y * 0.014, 5);
        const streak = fbm(x * 0.05, y * 0.006, 4);
        const grain = fbm(x * 0.35, y * 0.35, 3);
        const pit = h2(x, y) > 0.9955 ? 1 : 0;

        let rust = M.clamp((patch - 0.50) * 3.2 + (streak - 0.5) * 0.85 + (grain - 0.5) * 0.45, 0, 1);
        rust = Math.max(rust, pit);

        // Resten er falmet, kridtet lak — engang cremehvid som jeepen på stranden.
        const paint = 0.72 + (grain - 0.5) * 0.16 + (patch - 0.5) * 0.12;
        let r = 206 * paint, g = 204 * paint, b = 192 * paint;

        // Rustens egen farve går fra mørk okker til lys, skallet orange.
        const rr = 128 + fbm(x * 0.09, y * 0.09, 3) * 90;
        const rg = 62 + fbm(x * 0.09 + 30, y * 0.09, 3) * 52;
        const rb = 28 + fbm(x * 0.09, y * 0.09 + 30, 3) * 22;
        r = M.lerp(r, rr, rust); g = M.lerp(g, rg, rust); b = M.lerp(b, rb, rust);

        // Gennemtæret metal: små sorte huller.
        if (pit) { r *= 0.25; g *= 0.22; b *= 0.2; }

        img.data[i] = M.clamp(r, 0, 255);
        img.data[i + 1] = M.clamp(g, 0, 255);
        img.data[i + 2] = M.clamp(b, 0, 255);
        // Ruheden gemmes i alfa: lak er glat, rust er ru.
        img.data[i + 3] = M.clamp((0.45 + rust * 0.5) * 255, 0, 255);
      }
    }
    ctx.putImageData(img, 0, 0);

    const color = new THREE.CanvasTexture(c);
    color.wrapS = color.wrapT = THREE.RepeatWrapping;
    color.encoding = THREE.sRGBEncoding;
    color.anisotropy = 8;

    // Ruhedskort ud af alfakanalen.
    const rc = document.createElement('canvas');
    rc.width = rc.height = S;
    const rctx = rc.getContext('2d');
    const rimg = rctx.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const a = img.data[i * 4 + 3];
      rimg.data[i * 4] = rimg.data[i * 4 + 1] = rimg.data[i * 4 + 2] = a;
      rimg.data[i * 4 + 3] = 255;
    }
    rctx.putImageData(rimg, 0, 0);
    const rough = new THREE.CanvasTexture(rc);
    rough.wrapS = rough.wrapT = THREE.RepeatWrapping;

    return { color: color, rough: rough };
  }

  /* ---------- Hjul ---------- */
  function wheel(rubber, rim) {
    const g = new THREE.Group();
    const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.145, 10, 22), rubber);
    tyre.rotation.y = Math.PI / 2;
    g.add(tyre);

    // Slidbanen: en ring af klodser, så dækket ikke er en glat donut.
    const blockGeo = new THREE.BoxGeometry(0.20, 0.10, 0.075);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const b = new THREE.Mesh(blockGeo, rubber);
      b.position.set(0, Math.cos(a) * 0.46, Math.sin(a) * 0.46);
      b.rotation.x = -a;
      g.add(b);
    }

    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.20, 0.17, 14), rim);
    hub.rotation.z = Math.PI / 2;
    g.add(hub);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.2, 6), rim);
      bolt.rotation.z = Math.PI / 2;
      bolt.position.set(0.01, Math.cos(a) * 0.11, Math.sin(a) * 0.11);
      g.add(bolt);
    }
    return g;
  }

  O.buildWreck = function (scene, tex, timeUniform) {
    const rnd = M.mulberry32(O.config.seed + 909);
    const maps = rustTexture();

    const body = new THREE.MeshStandardMaterial({
      map: maps.color,
      roughnessMap: maps.rough,
      roughness: 1.0,
      metalness: 0.55,          // det er stadig metal under rusten
      normalMap: tex.detailNormal,
      normalScale: new THREE.Vector2(0.5, 0.5),
      envMapIntensity: 0.7,
      side: THREE.DoubleSide    // vraget er hult og ses indefra
    });

    // Vandet gør vraget mørkt og begroet under overfladen, og efterlader
    // en tydelig vandlinje lige over — dét er dét, øjet aflæser som "ligger
    // i vandet" frem for "står på vandet".
    O.shaderlib.waterline(body, O.config.waterLevel);
    O.shaderlib.caustics(body, timeUniform, O.config.waterLevel);

    const rubber = new THREE.MeshStandardMaterial({
      color: O.srgb(0x24211f), roughness: 0.95, metalness: 0.0, envMapIntensity: 0.3
    });
    O.shaderlib.waterline(rubber, O.config.waterLevel);

    const rim = new THREE.MeshStandardMaterial({
      map: maps.color, roughness: 0.85, metalness: 0.7, envMapIntensity: 0.8
    });
    O.shaderlib.waterline(rim, O.config.waterLevel);

    const g = new THREE.Group();

    /* --- Mål efter en rigtig jeep ---------------------------------------
       y = 0 er dér hvor dækkene rører jorden. Hjulcentrum 0,37; vognbund
       0,52; karrossekant 1,12; motorhjelm 1,14; styrtbøjle 1,65.
       Silhuetten er alt: bliver højderne forkerte, ligner det plader. --- */
    const HUB = 0.37, FLOOR = 0.52, TOP = 1.12, HOOD = 1.14;
    const HALF_W = 0.80;

    // Vanger og tværvanger
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.12, 0.13), body);
      rail.position.set(0.05, 0.40, side * 0.55);
      g.add(rail);
    }
    for (let i = 0; i < 4; i++) {
      const cross = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.09, 1.05), body);
      cross.position.set(-1.35 + i * 0.95, 0.40, 0);
      g.add(cross);
    }

    // Vognbund og sider (den åbne kasse man sidder i)
    const floor = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 1.60), body);
    floor.position.set(-0.35, FLOOR, 0);
    g.add(floor);

    for (const side of [-1, 1]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(2.6, TOP - FLOOR, 0.07), body);
      panel.position.set(-0.35, (FLOOR + TOP) / 2, side * HALF_W);
      g.add(panel);
    }

    const rearPanel = new THREE.Mesh(new THREE.BoxGeometry(0.09, TOP - FLOOR, 1.60), body);
    rearPanel.position.set(-1.62, (FLOOR + TOP) / 2, 0);
    g.add(rearPanel);

    const firewall = new THREE.Mesh(new THREE.BoxGeometry(0.09, TOP - FLOOR + 0.06, 1.58), body);
    firewall.position.set(0.98, (FLOOR + TOP) / 2 + 0.03, 0);
    g.add(firewall);

    // Én dør er der endnu, den anden ligger i sandet ved siden af.
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.46, 0.06), body);
    door.position.set(0.28, TOP - 0.10, HALF_W + 0.01);
    g.add(door);

    // Hjulbuer: en bøjle over hvert hjul. Uden dem ligner hjulene løsdele.
    const archGeo = new THREE.TorusGeometry(0.52, 0.055, 6, 14, Math.PI);
    for (const side of [-1, 1]) {
      for (const ax of [1.15, -1.15]) {
        const arch = new THREE.Mesh(archGeo, body);
        arch.position.set(ax, HUB, side * (HALF_W + 0.09));
        arch.rotation.y = Math.PI / 2;
        g.add(arch);
      }
    }

    /* --- Motorrum, gitter og lygter --- */
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.07, 1.46), body);
    hood.position.set(1.52, HOOD, 0.02);
    hood.rotation.z = 0.05;                 // bulet
    g.add(hood);

    for (const side of [-1, 1]) {
      const bayside = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.56, 0.07), body);
      bayside.position.set(1.52, HOOD - 0.30, side * 0.72);
      g.add(bayside);

      // Forskærme over forhjulene
      const fender = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.07, 0.30), body);
      fender.position.set(1.45, HOOD - 0.02, side * (HALF_W + 0.12));
      g.add(fender);
    }

    const grille = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.60, 1.42), body);
    grille.position.set(2.04, HOOD - 0.30, 0);
    g.add(grille);
    for (let i = 0; i < 7; i++) {           // de syv lodrette slidser
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.40, 0.072), rubber);
      slot.position.set(2.09, HOOD - 0.30, -0.47 + i * 0.157);
      g.add(slot);
    }
    for (const side of [-1, 1]) {
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.09, 14), rim);
      lamp.rotation.z = Math.PI / 2;
      lamp.position.set(2.06, HOOD - 0.22, side * 0.52);
      g.add(lamp);
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.088, 0.03, 14), rubber);
      glass.rotation.z = Math.PI / 2;
      glass.position.set(2.11, HOOD - 0.22, side * 0.52);
      g.add(glass);
    }

    const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 1.72), body);
    bumper.position.set(2.14, 0.52, 0);
    bumper.rotation.x = 0.10;               // bøjet ved sammenstødet
    g.add(bumper);

    /* --- Forruden klappet ned over hjelmen, som på en gammel jeep --- */
    const wsGroup = new THREE.Group();
    for (const side of [-1, 1]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.62, 0.07), body);
      f.position.set(0, 0.31, side * 0.70);
      wsGroup.add(f);
    }
    for (const yy of [0, 0.62]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 1.47), body);
      f.position.set(0, yy, 0);
      wsGroup.add(f);
    }
    wsGroup.position.set(1.05, TOP + 0.04, 0);
    wsGroup.rotation.z = 1.22;              // vippet forover ned på hjelmen
    g.add(wsGroup);

    /* --- Styrtbøjle, knækket i den ene side --- */
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.55, 8), body);
      post.position.set(-0.62, TOP + 0.26, side * 0.70);
      if (side === -1) { post.rotation.z = 0.6; post.position.y = TOP + 0.18; }
      g.add(post);
    }
    const topBar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.42, 8), body);
    topBar.rotation.set(Math.PI / 2, 0, 0.10);
    topBar.position.set(-0.60, TOP + 0.52, 0.10);
    g.add(topBar);

    /* --- Sæder og rat --- */
    for (const side of [-1, 1]) {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.09, 0.42), rubber);
      base.position.set(0.15, FLOOR + 0.22, side * 0.38);
      g.add(base);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.48, 0.42), rubber);
      back.position.set(-0.08, FLOOR + 0.48, side * 0.38);
      back.rotation.z = 0.2;
      g.add(back);
    }
    const wheelRing = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.022, 6, 16), rubber);
    wheelRing.position.set(0.72, TOP - 0.06, 0.42);
    wheelRing.rotation.set(0, 0, 1.2);
    g.add(wheelRing);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.38, 6), body);
    column.position.set(0.83, TOP - 0.18, 0.42);
    column.rotation.z = 1.2;
    g.add(column);

    /* --- Reservehjul bagpå, som på jeepen fra stranden --- */
    const spare = wheel(rubber, rim);
    spare.position.set(-1.78, TOP - 0.06, 0.0);
    spare.rotation.y = Math.PI / 2;
    spare.rotation.z = 0.05;
    g.add(spare);

    /* --- Hjul: ét mangler, ét er gravet ned i sandet --- */
    const axles = [
      { x: 1.15, z: -HALF_W - 0.09, sink: 0.0, keep: true },
      { x: 1.15, z: HALF_W + 0.09, sink: 0.0, keep: true },
      { x: -1.15, z: -HALF_W - 0.09, sink: 0.20, keep: true },
      { x: -1.15, z: HALF_W + 0.09, sink: 0, keep: false }
    ];
    for (const a of axles) {
      if (!a.keep) continue;
      const w = wheel(rubber, rim);
      w.position.set(a.x, HUB - a.sink, a.z);
      w.rotation.x = (rnd() - 0.5) * 0.18;
      g.add(w);
    }
    const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.55, 8), body);
    stub.rotation.x = Math.PI / 2;
    stub.position.set(-1.15, HUB, 0.55);
    g.add(stub);

    // Den afrevne dør ligger i sandet ved siden af.
    const looseDoor = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.05, 0.48), body);
    g.add(looseDoor);

    /* ---------- Placering: i det lave vand, skråt og halvt sunket ---------- */
    let best = null;
    for (let i = 0; i < 9000; i++) {
      const x = -26 + rnd() * 52;
      const z = -70 + rnd() * 48;
      const depth = O.world.waterDepth(x, z);
      if (depth < 0.20 || depth > 0.50) continue;
      let blocked = false;
      for (const c of O.world.colliders) {
        if (Math.hypot(c.x - x, c.z - z) < c.r + 4) { blocked = true; break; }
      }
      if (blocked) continue;
      // Vi vil have den et stykke ude, men ikke ude af syne.
      const score = -Math.abs(depth - 0.34) * 10 - Math.abs(Math.hypot(x - 20, z + 50) - 20) * 0.4;
      if (!best || score > best.score) best = { x: x, z: z, depth: depth, score: score };
    }
    if (!best) best = { x: 6, z: -46, depth: 0.35 };

    const groundY = O.world.height(best.x, best.z);
    // Kun let sunket: vandet står om hjulene og op ad karrossesiden,
    // så man kan se hvad det er.
    g.position.set(best.x, groundY - 0.05, best.z);
    g.rotation.y = Math.atan2(best.x, best.z) + 1.9;
    g.rotation.z = -0.20;                 // hælder mod den manglende hjulside
    g.rotation.x = 0.07;                  // og lidt næsen nedad

    looseDoor.position.set(-2.1, 0.08, 1.8);
    looseDoor.rotation.set(0.05, 0.7, 0.02);

    g.traverse(function (o) {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });
    scene.add(g);

    // Sandbanke omkring det nedgravede hjul.
    const mound = new THREE.Mesh(
      new THREE.SphereGeometry(1.0, 16, 10),
      new THREE.MeshStandardMaterial({
        map: tex.sand, roughness: 1.0, color: O.srgb(0x9a8b76)
      })
    );
    mound.scale.set(1.0, 0.22, 0.8);
    mound.position.set(best.x - 0.6, groundY - 0.05, best.z + 0.5);
    mound.receiveShadow = true;
    scene.add(mound);

    // Man skal ikke kunne gå igennem det.
    O.world.colliders.push({ x: best.x, z: best.z, r: 2.4, top: groundY + 1.6 });

    // Bevoksningen skal holde sig væk, så vraget ikke drukner i siv.
    O.wreckSpot = { x: best.x, z: best.z, r: 5.0 };

    return { group: g, position: new THREE.Vector3(best.x, groundY, best.z), depth: best.depth };
  };
})();
