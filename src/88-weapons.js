/* ------------------------------------------------------------------
   Våben: pistol, maskinpistol og haglgevær.

   Modellerne bygges af primitiver, men efter rigtige mål — slæde, greb,
   aftrækkerbøjle, sigtemidler, magasin — fordi silhuetten er det, øjet
   læser. Hænderne holder om grebet og forgrebet, ellers svæver våbnet.

   Skuddet er hitscan gennem O.ray: mundingsblink, sporlys, nedslag med
   gnister og støv, hylsteret ud til højre, og et rekyl der både sparker
   våbnet bagud og kameraet opad — og lægger sig igen.
   ------------------------------------------------------------------ */
(function () {
  const O = window.OASIS;
  const M = O.math;
  const BGU = THREE.BufferGeometryUtils;

  const SPECS = [
    {
      key: 'pistol', name: 'Pistol', mag: 12, reserve: 84, auto: false,
      rpm: 330, damage: 34, pellets: 1, spread: 0.006, spreadMove: 0.016,
      recoil: 0.030, kick: 0.055, reload: 1.35, range: 140,
      hip: [0.20, -0.20, -0.40], ads: [0.0, -0.115, -0.28], adsFov: 0.86
    },
    {
      key: 'smg', name: 'Maskinpistol', mag: 30, reserve: 210, auto: true,
      rpm: 820, damage: 22, pellets: 1, spread: 0.011, spreadMove: 0.028,
      recoil: 0.021, kick: 0.040, reload: 1.9, range: 180,
      hip: [0.22, -0.22, -0.46], ads: [0.0, -0.120, -0.32], adsFov: 0.88
    },
    {
      key: 'shotgun', name: 'Haglgevær', mag: 6, reserve: 36, auto: false,
      rpm: 75, damage: 15, pellets: 9, spread: 0.055, spreadMove: 0.075,
      recoil: 0.085, kick: 0.16, reload: 2.4, range: 55,
      hip: [0.22, -0.24, -0.50], ads: [0.0, -0.128, -0.36], adsFov: 0.92
    }
  ];

  /* ================= Materialer ================= */
  function materials() {
    return {
      steel: new THREE.MeshStandardMaterial({
        color: O.srgb(0x4a4e54), roughness: 0.34, metalness: 0.92, envMapIntensity: 1.6
      }),
      black: new THREE.MeshStandardMaterial({
        color: O.srgb(0x1c1f22), roughness: 0.55, metalness: 0.35, envMapIntensity: 0.9
      }),
      polymer: new THREE.MeshStandardMaterial({
        color: O.srgb(0x26292d), roughness: 0.78, metalness: 0.05, envMapIntensity: 0.6
      }),
      wood: new THREE.MeshStandardMaterial({
        color: O.srgb(0x5a3a20), roughness: 0.62, metalness: 0.0, envMapIntensity: 0.5
      }),
      brass: new THREE.MeshStandardMaterial({
        color: O.srgb(0xb08a3c), roughness: 0.3, metalness: 0.95, envMapIntensity: 1.8
      }),
      skin: new THREE.MeshStandardMaterial({
        color: O.srgb(0x8a5c38), roughness: 0.72, metalness: 0.0, envMapIntensity: 0.4
      }),
      sleeve: new THREE.MeshStandardMaterial({
        color: O.srgb(0x3d4650), roughness: 0.95, metalness: 0.0
      })
    };
  }

  function box(w, h, d, x, y, z, rx, ry, rz) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rx || ry || rz) {
      if (rx) g.rotateX(rx);
      if (ry) g.rotateY(ry);
      if (rz) g.rotateZ(rz);
    }
    g.translate(x || 0, y || 0, z || 0);
    return g;
  }
  function cyl(r1, r2, h, seg, x, y, z, rx, rz) {
    const g = new THREE.CylinderGeometry(r1, r2, h, seg || 10);
    if (rx) g.rotateX(rx);
    if (rz) g.rotateZ(rz);
    g.translate(x || 0, y || 0, z || 0);
    return g;
  }

  /* ================= En hånd ================= */
  // Håndryg, fire fingre med to led og en tommel. Bøjet om grebet, fordi
  // det er fingrenes bue om noget, der får en hånd til at se ud som en hånd.
  function handGeo(mirror) {
    const s = mirror ? -1 : 1;
    const parts = [];
    parts.push(box(0.085, 0.052, 0.10, 0, 0, 0));
    const capsule = function (r, len) {
      return THREE.CapsuleGeometry
        ? new THREE.CapsuleGeometry(r, len, 3, 8)
        : new THREE.CylinderGeometry(r, r, len + r * 2, 8);
    };
    for (let i = 0; i < 4; i++) {
      const z = -0.036 + i * 0.024;
      const sc = 1 - Math.abs(i - 1.3) * 0.09;
      const prox = capsule(0.0125, 0.034);
      prox.rotateZ(Math.PI / 2 - 0.30);
      prox.scale(sc, sc, sc);
      prox.translate(s * -0.030, 0.014, z);
      parts.push(prox);
      const dist = capsule(0.0110, 0.026);
      dist.rotateZ(0.42);
      dist.scale(sc, sc, sc);
      dist.translate(s * -0.052, -0.017, z);
      parts.push(dist);
    }
    const thumb = capsule(0.0145, 0.038);
    thumb.rotateX(0.85);
    thumb.rotateZ(0.7);
    thumb.translate(s * -0.014, 0.026, -0.050);
    parts.push(thumb);
    const g = BGU.mergeBufferGeometries(parts);
    return g;
  }

  function wristGeo() {
    const parts = [];
    parts.push(cyl(0.036, 0.048, 0.20, 10, 0, -0.10, 0.055, 0.45, 0));
    return BGU.mergeBufferGeometries(parts);
  }

  /* ================= Våbenmodeller =================
     Alle er bygget med mundingen mod -z, greb nedad, i meter. */

  function pistolParts() {
    const steel = [], black = [], polymer = [];
    // Slæde med udkast og sigtekam.
    steel.push(box(0.048, 0.062, 0.235, 0, 0.026, -0.055));
    steel.push(box(0.050, 0.016, 0.05, 0, 0.050, -0.010));      // udkastsport-kant
    black.push(box(0.030, 0.010, 0.048, 0.0, 0.058, 0.006));    // udkastsport
    // Løb og rekylfjeder under slæden.
    steel.push(cyl(0.0105, 0.0105, 0.07, 10, 0, 0.024, -0.185, Math.PI / 2));
    black.push(cyl(0.0085, 0.0085, 0.22, 8, 0, 0.006, -0.062, Math.PI / 2));
    // Stel og aftrækkerbøjle.
    polymer.push(box(0.042, 0.040, 0.150, 0, -0.014, -0.020));
    black.push(box(0.030, 0.008, 0.052, 0, -0.040, -0.024));
    black.push(box(0.008, 0.030, 0.008, 0, -0.026, -0.050));
    black.push(box(0.007, 0.024, 0.007, 0, -0.026, 0.002, 0, 0, 0));
    // Greb med bagkappe.
    const grip = box(0.040, 0.135, 0.058, 0, -0.086, 0.036);
    grip.rotateX(0.22);
    polymer.push(grip);
    polymer.push(box(0.034, 0.020, 0.050, 0, -0.150, 0.056));
    // Aftrækker.
    black.push(box(0.010, 0.030, 0.010, 0, -0.030, -0.020));
    // Sigtemidler.
    black.push(box(0.010, 0.012, 0.010, 0, 0.064, -0.160));
    black.push(box(0.030, 0.012, 0.010, 0, 0.064, 0.048));
    return {
      steel: BGU.mergeBufferGeometries(steel),
      black: BGU.mergeBufferGeometries(black),
      polymer: BGU.mergeBufferGeometries(polymer),
      muzzle: new THREE.Vector3(0, 0.024, -0.225),
      eject: new THREE.Vector3(0.03, 0.055, 0.006),
      grip: new THREE.Vector3(0.0, -0.085, 0.030),
      support: null,
      pump: null, slide: false
    };
  }

  function smgParts() {
    const steel = [], black = [], polymer = [];
    // Kasse med øvre og nedre del.
    steel.push(box(0.055, 0.070, 0.30, 0, 0.020, -0.02));
    polymer.push(box(0.056, 0.044, 0.24, 0, -0.032, 0.01));
    // Løb med perforeret skjold.
    black.push(cyl(0.0095, 0.0095, 0.24, 10, 0, 0.020, -0.245, Math.PI / 2));
    black.push(cyl(0.020, 0.020, 0.14, 12, 0, 0.020, -0.205, Math.PI / 2));
    steel.push(cyl(0.014, 0.017, 0.035, 10, 0, 0.020, -0.352, Math.PI / 2));
    // Forgreb.
    const fg = box(0.036, 0.090, 0.050, 0, -0.048, -0.185);
    fg.rotateX(-0.16);
    polymer.push(fg);
    // Greb og aftrækker.
    const grip = box(0.040, 0.120, 0.055, 0, -0.086, 0.070);
    grip.rotateX(0.24);
    polymer.push(grip);
    black.push(box(0.010, 0.030, 0.010, 0, -0.034, 0.036));
    black.push(box(0.030, 0.008, 0.055, 0, -0.050, 0.040));
    // Langt magasin.
    const mag = box(0.030, 0.170, 0.048, 0, -0.110, -0.020);
    mag.rotateX(0.06);
    black.push(mag);
    // Sammenklappet skulderstøtte.
    steel.push(cyl(0.010, 0.010, 0.16, 8, 0.028, 0.016, 0.170, Math.PI / 2));
    steel.push(cyl(0.010, 0.010, 0.16, 8, -0.028, 0.016, 0.170, Math.PI / 2));
    black.push(box(0.075, 0.045, 0.030, 0, 0.016, 0.250));
    // Sigte: kikkertskinne og et lille rødpunktshus.
    black.push(box(0.040, 0.010, 0.22, 0, 0.058, -0.03));
    black.push(box(0.036, 0.040, 0.060, 0, 0.082, -0.020));
    return {
      steel: BGU.mergeBufferGeometries(steel),
      black: BGU.mergeBufferGeometries(black),
      polymer: BGU.mergeBufferGeometries(polymer),
      muzzle: new THREE.Vector3(0, 0.020, -0.375),
      eject: new THREE.Vector3(0.033, 0.045, -0.02),
      grip: new THREE.Vector3(0, -0.086, 0.064),
      support: new THREE.Vector3(0, -0.052, -0.185),
      pump: null, slide: false
    };
  }

  function shotgunParts() {
    const steel = [], black = [], wood = [];
    // Løb og magasinrør.
    steel.push(cyl(0.0145, 0.0145, 0.50, 12, 0, 0.030, -0.20, Math.PI / 2));
    black.push(cyl(0.0125, 0.0125, 0.40, 10, 0, 0.000, -0.16, Math.PI / 2));
    // Låsekasse.
    steel.push(box(0.048, 0.062, 0.16, 0, 0.014, 0.055));
    black.push(box(0.026, 0.012, 0.05, 0.024, 0.030, 0.040));
    // Forskæftet er sit eget net, så det kan glide frem og tilbage, når
    // geværet pumpes. Ligger det i den store klump træ, ville kolben følge med.
    const pumpParts = [box(0.050, 0.048, 0.130, 0, 0.002, -0.150)];
    for (let i = 0; i < 5; i++) {
      pumpParts.push(box(0.054, 0.004, 0.006, 0, 0.026, -0.205 + i * 0.022));
    }
    // Greb og aftrækkerbøjle.
    const grip = box(0.040, 0.110, 0.055, 0, -0.072, 0.108);
    grip.rotateX(0.30);
    wood.push(grip);
    black.push(box(0.030, 0.008, 0.050, 0, -0.030, 0.070));
    black.push(box(0.010, 0.026, 0.010, 0, -0.024, 0.058));
    // Kolbe.
    const stock = box(0.046, 0.075, 0.230, 0, -0.038, 0.250);
    stock.rotateX(0.10);
    wood.push(stock);
    black.push(box(0.048, 0.080, 0.016, 0, -0.055, 0.360));
    // Korn.
    black.push(box(0.008, 0.014, 0.010, 0, 0.050, -0.430));
    return {
      steel: BGU.mergeBufferGeometries(steel),
      black: BGU.mergeBufferGeometries(black),
      polymer: BGU.mergeBufferGeometries(wood),
      muzzle: new THREE.Vector3(0, 0.030, -0.455),
      eject: new THREE.Vector3(0.030, 0.030, 0.045),
      grip: new THREE.Vector3(0, -0.072, 0.100),
      support: new THREE.Vector3(0, 0.000, -0.150),
      pump: BGU.mergeBufferGeometries(pumpParts),
      slide: true
    };
  }

  O.buildWeapons = function (camera, scene, hooks) {
    const mat = materials();
    const root = new THREE.Group();
    root.name = 'viewmodel';
    camera.add(root);

    const builders = [pistolParts, smgParts, shotgunParts];
    const models = [];

    const handR = handGeo(false);
    const handL = handGeo(true);
    const wrist = wristGeo();

    for (let i = 0; i < SPECS.length; i++) {
      const p = builders[i]();
      const g = new THREE.Group();
      g.add(new THREE.Mesh(p.steel, mat.steel));
      g.add(new THREE.Mesh(p.black, mat.black));
      g.add(new THREE.Mesh(p.polymer, i === 2 ? mat.wood : mat.polymer));
      let pumpMesh = null;
      if (p.pump) {
        pumpMesh = new THREE.Mesh(p.pump, mat.wood);
        pumpMesh.name = 'pump';
        g.add(pumpMesh);
      }

      // Hånden om grebet.
      const hr = new THREE.Mesh(handR, mat.skin);
      hr.position.copy(p.grip);
      hr.rotation.set(0.20, 0, 0.15);
      g.add(hr);
      const wr = new THREE.Mesh(wrist, mat.sleeve);
      wr.position.copy(p.grip);
      wr.position.z += 0.02;
      g.add(wr);

      if (p.support) {
        const hl = new THREE.Mesh(handL, mat.skin);
        hl.position.copy(p.support);
        hl.rotation.set(-0.15, 0, -0.25);
        g.add(hl);
        const wl = new THREE.Mesh(wrist, mat.sleeve);
        wl.position.copy(p.support);
        wl.position.x -= 0.05;
        wl.position.y -= 0.02;
        wl.rotation.z = 0.5;
        g.add(wl);
      }

      // Mundingsblinket sidder i våbnets eget koordinatsystem.
      const flash = new THREE.Group();
      flash.position.copy(p.muzzle);
      // Blinket sidder en håndsbred fra kameraet, så det fylder meget mere
      // på skærmen, end målene antyder. Det er derfor det er så småt her.
      const fmat = new THREE.MeshBasicMaterial({
        color: 0xffc271, transparent: true, opacity: 0.62,
        blending: THREE.AdditiveBlending, depthWrite: false
      });
      const star = new THREE.Mesh(new THREE.PlaneGeometry(0.115, 0.115), fmat);
      flash.add(star);
      const star2 = new THREE.Mesh(new THREE.PlaneGeometry(0.085, 0.085), fmat);
      star2.rotation.z = Math.PI / 4;
      flash.add(star2);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.020, 0.085, 8), fmat);
      cone.rotation.x = -Math.PI / 2;
      cone.position.z = -0.045;
      flash.add(cone);
      flash.visible = false;
      g.add(flash);

      g.visible = false;
      g.traverse(function (o) { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; } });
      root.add(g);
      models.push({ group: g, parts: p, flash: flash, pump: pumpMesh, spec: SPECS[i] });
    }

    /* ---------- Effekter i verden ---------- */
    const fx = new THREE.Group();
    fx.name = 'weaponfx';
    scene.add(fx);

    // Sporlys: aflange, additive strimler der lever et øjeblik.
    const TRACERS = 18;
    const tracerMat = new THREE.MeshBasicMaterial({
      color: 0xffd090, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const tracers = [];
    for (let i = 0; i < TRACERS; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 1), tracerMat.clone());
      m.visible = false;
      m.frustumCulled = false;
      fx.add(m);
      tracers.push({ mesh: m, life: 0 });
    }
    let tracerNext = 0;

    // Nedslag: en lille sky af gnister pr. træffer.
    const SPARKS = 90;
    const sparkGeo = new THREE.BufferGeometry();
    const sparkPos = new Float32Array(SPARKS * 3);
    const sparkVel = new Float32Array(SPARKS * 3);
    const sparkLife = new Float32Array(SPARKS);
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
    const sparkMat = new THREE.PointsMaterial({
      size: 0.055, color: 0xffc070, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    });
    const sparks = new THREE.Points(sparkGeo, sparkMat);
    sparks.frustumCulled = false;
    fx.add(sparks);
    let sparkNext = 0;

    // Hylstre.
    const SHELLS = 14;
    const shellGeo = new THREE.CylinderGeometry(0.0055, 0.0055, 0.022, 6);
    const shells = [];
    for (let i = 0; i < SHELLS; i++) {
      const m = new THREE.Mesh(shellGeo, mat.brass);
      m.visible = false;
      fx.add(m);
      shells.push({ mesh: m, v: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0 });
    }
    let shellNext = 0;

    // Skudhuller.
    const DECALS = 36;
    const decalMat = new THREE.MeshBasicMaterial({
      color: 0x14100c, transparent: true, opacity: 0.85, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6
    });
    const decals = [];
    for (let i = 0; i < DECALS; i++) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.055, 8), decalMat.clone());
      m.visible = false;
      fx.add(m);
      decals.push(m);
    }
    let decalNext = 0;

    const flashLight = new THREE.PointLight(0xffca80, 0, 16, 2);
    flashLight.visible = false;
    scene.add(flashLight);

    /* ---------- Tilstand ---------- */
    const state = {
      index: 0,
      ammo: SPECS.map(function (s) { return s.mag; }),
      reserve: SPECS.map(function (s) { return s.reserve; }),
      unlocked: [true, true, true],
      reloading: 0,
      cooldown: 0,
      ads: 0,
      wantAds: false,
      recoilPitch: 0, recoilYaw: 0,
      kick: 0,
      pump: 0,
      shots: 0, hits: 0, kills: 0,
      switching: 0
    };

    const _dir = new THREE.Vector3();
    const _org = new THREE.Vector3();
    const _n = new THREE.Vector3();
    const _tmp = new THREE.Vector3();

    function spec() { return SPECS[state.index]; }
    function model() { return models[state.index]; }

    function spawnSparks(p, n, count, color) {
      sparkMat.color.setHex(color);
      for (let i = 0; i < count; i++) {
        const k = sparkNext = (sparkNext + 1) % SPARKS;
        sparkPos[k * 3] = p.x; sparkPos[k * 3 + 1] = p.y; sparkPos[k * 3 + 2] = p.z;
        const sx = n.x + (Math.random() - 0.5) * 1.4;
        const sy = n.y + (Math.random() - 0.5) * 1.4 + 0.4;
        const sz = n.z + (Math.random() - 0.5) * 1.4;
        const sp = 2.5 + Math.random() * 5.5;
        sparkVel[k * 3] = sx * sp; sparkVel[k * 3 + 1] = sy * sp; sparkVel[k * 3 + 2] = sz * sp;
        sparkLife[k] = 0.25 + Math.random() * 0.35;
      }
      sparkGeo.attributes.position.needsUpdate = true;
    }

    function putDecal(p, n) {
      const m = decals[decalNext = (decalNext + 1) % DECALS];
      m.position.copy(p).addScaledVector(n, 0.012);
      _tmp.copy(p).add(n);
      m.lookAt(_tmp);
      m.rotation.z = Math.random() * 6.28;
      m.scale.setScalar(0.7 + Math.random() * 0.7);
      m.material.opacity = 0.85;
      m.visible = true;
    }

    function fireTracer(from, to) {
      const t = tracers[tracerNext = (tracerNext + 1) % TRACERS];
      const len = _tmp.copy(to).sub(from).length();
      if (len < 0.2) return;
      t.mesh.position.copy(from).lerp(to, 0.5);
      t.mesh.scale.set(1, 1, len);
      t.mesh.lookAt(to);
      t.mesh.material.opacity = 0.75;
      t.mesh.visible = true;
      t.life = 0.055;
    }

    function ejectShell() {
      const s = shells[shellNext = (shellNext + 1) % SHELLS];
      const p = model().parts.eject;
      _tmp.copy(p);
      model().group.localToWorld(_tmp);
      s.mesh.position.copy(_tmp);
      camera.getWorldDirection(_dir);
      const right = _n.set(_dir.z, 0, -_dir.x).normalize();
      s.v.copy(right).multiplyScalar(2.2 + Math.random() * 1.2);
      s.v.y = 2.0 + Math.random() * 1.0;
      s.v.addScaledVector(_dir, 0.6);
      s.spin.set(Math.random() * 20 - 10, Math.random() * 20 - 10, Math.random() * 20 - 10);
      s.life = 1.8;
      s.mesh.visible = true;
    }

    function fire(t) {
      const sp = spec();
      if (state.reloading > 0 || state.cooldown > 0 || state.switching > 0) return false;
      if (state.ammo[state.index] <= 0) {
        if (hooks && hooks.onDryFire) hooks.onDryFire();
        state.cooldown = 0.25;
        return false;
      }
      state.ammo[state.index]--;
      state.cooldown = 60 / sp.rpm;
      state.shots++;

      camera.getWorldPosition(_org);
      camera.getWorldDirection(_dir);

      const moving = hooks && hooks.playerSpeed ? Math.min(1, hooks.playerSpeed() / 6) : 0;
      const spread = M.lerp(sp.spread, sp.spreadMove, moving) * (1 - state.ads * 0.65);

      const npcs = hooks && hooks.npcs ? hooks.npcs() : null;
      for (let i = 0; i < sp.pellets; i++) {
        const d = _n.copy(_dir);
        d.x += (Math.random() - 0.5) * spread * 2;
        d.y += (Math.random() - 0.5) * spread * 2;
        d.z += (Math.random() - 0.5) * spread * 2;
        d.normalize();
        const hit = O.ray.cast(_org, d, sp.range, npcs);
        const end = hit ? hit.point : _tmp.copy(_org).addScaledVector(d, sp.range).clone();
        if (i === 0 || sp.pellets < 4) fireTracer(_org, end);
        if (hit) {
          const n = O.ray.normalAt(hit, d, new THREE.Vector3());
          if (hit.kind === 'npc') {
            state.hits++;
            spawnSparks(hit.point, n, 5, 0xc0303a);
            const dmg = sp.damage * (hit.head ? 2.6 : 1);
            if (hooks && hooks.onNpcHit) {
              if (hooks.onNpcHit(hit.obj, dmg, d)) state.kills++;
            }
          } else {
            spawnSparks(hit.point, n, hit.kind === 'ground' ? 4 : 7,
                        hit.kind === 'ground' ? 0xbba078 : 0xffc070);
            if (sp.pellets < 4 || i % 3 === 0) putDecal(hit.point, n);
          }
        }
      }

      // Rekyl: våbnet sparker bagud, kameraet opad og lidt til siden.
      state.kick = sp.kick;
      state.recoilPitch += sp.recoil * (1 - state.ads * 0.35);
      state.recoilYaw += (Math.random() - 0.5) * sp.recoil * 0.9;

      const mo = model();
      mo.flash.visible = true;
      mo.flash.rotation.z = Math.random() * 6.28;
      mo.flash.scale.setScalar((0.8 + Math.random() * 0.45) * (sp.pellets > 4 ? 1.5 : 1.0));
      state.flashTimer = 0.045;
      _tmp.copy(mo.parts.muzzle);
      mo.group.localToWorld(_tmp);
      flashLight.position.copy(_tmp);
      flashLight.intensity = sp.pellets > 4 ? 26 : 16;
      flashLight.visible = true;

      if (sp.key === 'shotgun') state.pump = 0.42;
      else ejectShell();

      if (hooks && hooks.onShot) hooks.onShot(sp.key);
      return true;
    }

    function reload() {
      const sp = spec();
      if (state.reloading > 0) return;
      if (state.ammo[state.index] >= sp.mag) return;
      if (state.reserve[state.index] <= 0) return;
      state.reloading = sp.reload;
      if (hooks && hooks.onReload) hooks.onReload();
    }

    function switchTo(i) {
      if (i === state.index || i < 0 || i >= SPECS.length) return;
      if (!state.unlocked[i]) return;
      state.index = i;
      state.reloading = 0;
      state.switching = 0.38;
      if (hooks && hooks.onSwitch) hooks.onSwitch(SPECS[i].name);
    }

    for (let i = 0; i < models.length; i++) models[i].group.visible = (i === 0);

    const basePos = new THREE.Vector3();
    const baseRot = new THREE.Euler();

    return {
      state: state,
      specs: SPECS,
      fire: fire,
      reload: reload,
      switchTo: switchTo,
      next: function () { switchTo((state.index + 1) % SPECS.length); },
      prev: function () { switchTo((state.index + SPECS.length - 1) % SPECS.length); },
      spec: spec,
      setAds: function (v) { state.wantAds = v; },
      root: root,
      fxGroup: fx,

      addAmmo: function (i, n) { state.reserve[i] = Math.min(SPECS[i].reserve * 2, state.reserve[i] + n); },

      update: function (dt, t, player) {
        const sp = spec();

        if (state.cooldown > 0) state.cooldown -= dt;
        if (state.switching > 0) state.switching -= dt;

        if (state.reloading > 0) {
          state.reloading -= dt;
          if (state.reloading <= 0) {
            const need = sp.mag - state.ammo[state.index];
            const take = Math.min(need, state.reserve[state.index]);
            state.ammo[state.index] += take;
            state.reserve[state.index] -= take;
          }
        }

        // Sigte gennem sigtemidlerne.
        const wantAds = state.wantAds && state.reloading <= 0 && !player.swimming;
        state.ads += ((wantAds ? 1 : 0) - state.ads) * Math.min(1, dt * 11);

        // Rekylen falder tilbage.
        state.recoilPitch *= Math.pow(0.0025, dt);
        state.recoilYaw *= Math.pow(0.004, dt);
        state.kick *= Math.pow(0.00008, dt);
        if (state.pump > 0) state.pump -= dt;

        if (state.flashTimer > 0) {
          state.flashTimer -= dt;
          if (state.flashTimer <= 0) {
            for (const m of models) m.flash.visible = false;
            flashLight.visible = false;
            flashLight.intensity = 0;
          }
        }

        // Våbnets plads i billedet: hofte eller sigte, plus vejrtrækning,
        // skridt og rekyl.
        for (let i = 0; i < models.length; i++) {
          models[i].group.visible = (i === state.index);
        }
        const mo = model();
        const hip = sp.hip, ads = sp.ads;
        basePos.set(
          M.lerp(hip[0], ads[0], state.ads),
          M.lerp(hip[1], ads[1], state.ads),
          M.lerp(hip[2], ads[2], state.ads)
        );

        const bob = player.bobAmount || 0;
        const sway = Math.sin(player.bob * 2.0) * 0.010 * bob * (1 - state.ads * 0.8);
        const swayY = Math.cos(player.bob * 4.0) * 0.008 * bob * (1 - state.ads * 0.8);
        const breathe = Math.sin(t * 1.4) * 0.0025 * (1 - state.ads * 0.6);

        // Skiftet: våbnet dykker ned og kommer op igen.
        const sw = state.switching > 0 ? Math.sin(Math.min(1, state.switching / 0.38) * Math.PI) : 0;

        mo.group.position.set(
          basePos.x + sway,
          basePos.y + swayY + breathe - sw * 0.22,
          basePos.z + state.kick * 0.9
        );
        baseRot.set(
          -state.kick * 1.4 + sway * 0.6 - sw * 0.5,
          sway * 1.2,
          M.lerp(0.045, 0.0, state.ads) + sway * 0.5
        );
        mo.group.rotation.copy(baseRot);

        // Haglgeværet pumpes efter hvert skud.
        if (mo.pump) {
          const k = state.pump > 0 ? Math.sin(Math.min(1, state.pump / 0.42) * Math.PI) : 0;
          mo.pump.position.z = k * 0.075;
        }

        /* ---- effekter ---- */
        for (const tr of tracers) {
          if (tr.life > 0) {
            tr.life -= dt;
            tr.mesh.material.opacity = Math.max(0, tr.life / 0.055) * 0.75;
            if (tr.life <= 0) tr.mesh.visible = false;
          }
        }

        let anySpark = false;
        for (let i = 0; i < SPARKS; i++) {
          if (sparkLife[i] <= 0) continue;
          anySpark = true;
          sparkLife[i] -= dt;
          sparkVel[i * 3 + 1] -= 14 * dt;
          sparkPos[i * 3] += sparkVel[i * 3] * dt;
          sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt;
          sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
          if (sparkLife[i] <= 0) { sparkPos[i * 3 + 1] = -9999; }
        }
        if (anySpark) sparkGeo.attributes.position.needsUpdate = true;

        for (const s of shells) {
          if (s.life <= 0) continue;
          s.life -= dt;
          s.v.y -= 16 * dt;
          s.mesh.position.addScaledVector(s.v, dt);
          s.mesh.rotation.x += s.spin.x * dt;
          s.mesh.rotation.y += s.spin.y * dt;
          s.mesh.rotation.z += s.spin.z * dt;
          const g = O.world.height(s.mesh.position.x, s.mesh.position.z) + 0.01;
          if (s.mesh.position.y < g) {
            s.mesh.position.y = g;
            s.v.multiplyScalar(0.28);
            s.v.y = Math.abs(s.v.y) * 0.35;
            if (s.v.lengthSq() < 0.05) s.v.set(0, 0, 0);
          }
          if (s.life <= 0) s.mesh.visible = false;
        }

        return state;
      }
    };
  };
})();
